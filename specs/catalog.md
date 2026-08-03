# Spec: Catálogo de Produtos

## Status
Approved

## Objetivo
Exibir um catálogo unificado de produtos recebidos (vindos de NFE_ENTRADA_PRODUTOS),
agrupados por código de produto, com o custo unitário líquido mais recente e preços
sugeridos calculados automaticamente para Shopee e Mercado Livre. O catálogo é a
fonte consultável para gestão de precificação antes de criar/atualizar anúncios.

## Contrato da API Interna

### `catalog.getProducts`
- Descrição: retorna lista de produtos únicos com status "Recebido", agrupados por código, com preço sugerido para ambos os marketplaces.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| targetMarginShopee | number | não | 0.25 | margem alvo Shopee (ex. 0.25 = 25%) |
| targetMarginMercadoLivre | number | não | 0.25 | margem alvo Mercado Livre |
| sortBy | string (`code`\|`description`\|`unitCost`\|`suggestedShopee`) | não | `code` | ordem de exibição |
| sortOrder | string (`asc`\|`desc`) | não | `asc` | crescente ou decrescente |

- Retorno: `{ success: true, data: [...], totalCount: number, lastSync: string }` ou `{ error: string }`

- Estrutura de cada item em `data`:
```javascript
{
  codigoProduto: string,                    // código único do item
  descricaoProduto: string,                 // descrição do produto
  valorUnitarioLiquido: number,             // VALOR_UNITARIO_LIQUIDO mais recente (R$)
  dataEmissaoMaisRecente: string,           // DATA_EMISSAO da NFe mais recente (ISO 8601)
  emitenteMaisRecente: string,              // nome do fornecedor da compra mais recente
  totalEntradas: number,                    // quantas NFes têm este produto
  precoShopee: number,                      // preço sugerido Shopee (R$)
  precoMercadoLivre: number,                // preço sugerido Mercado Livre (R$)
  margemCalculadaShopee: number,            // % de margem líquida no Shopee
  margemCalculadaMercadoLivre: number       // % de margem líquida no Mercado Livre
}
```

- Erros esperados:
  - Sheet NFE_ENTRADA_PRODUTOS não existe/vazia → `{ error: "Nenhum produto encontrado" }`
  - `targetMarginShopee` ou `targetMarginMercadoLivre` fora de `[0, 1)` → erro de validação
  - Falha ao ler Sheets → `{ error: "Erro ao buscar produtos: ..." }`

### `catalog.getProductByCode`
- Descrição: retorna todas as entradas (histórico) de um código de produto específico.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| codigoProduto | string | sim | — | código do produto a consultar |

- Retorno: `{ success: true, data: [...], count: number }` ou `{ error: string }`

- Estrutura de cada entrada em `data`:
```javascript
{
  numeroNf: string,
  chaveNf: string,
  dataEmissao: string,                      // ISO 8601
  emitenteCnpj: string,
  emitenteNome: string,
  quantidade: number,
  valorUnitario: number,
  valorLiquidoItem: number,
  valorUnitarioLiquido: number,
  status: string
}
```

### `catalog.getCalculationMemory` (para sidebar)
- Descrição: retorna a memória de cálculo detalhada (passo a passo) de como o preço sugerido foi derivado do VALOR_UNITARIO_LIQUIDO.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| codigoProduto | string | sim | — | código do produto |
| marketplace | string (`shopee`\|`mercado_livre`) | sim | — | qual marketplace |
| targetMargin | number | não | 0.25 | margem alvo utilizada no cálculo |

- Retorno: `{ success: true, data: {...}, error: null }` ou `{ error: string }`

- Estrutura de `data`:
```javascript
{
  codigoProduto: string,
  descricao: string,
  marketplace: string,
  passos: [
    {
      ordem: number,                        // 1, 2, 3, ...
      descricao: string,                    // ex. "1. Custo Unitário Líquido"
      valor: number,                        // valor nesta etapa (R$)
      detalhes: string,                     // ex. "VALOR_UNITARIO_LIQUIDO = R$ 50,00"
      formula: string                       // ex. "R$ 50,00"
    },
    // ... mais passos até o preço final
  ],
  resumo: {
    valorUnitarioLiquido: number,           // valor inicial
    margemAlvo: number,                     // % da margem (ex. 0.25)
    taxaMarketplace: {
      percentual: number,                   // ex. 0.20
      fixo: number,                         // ex. 0
      descricao: string                     // ex. "Shopee: 20% flat"
    },
    precoSugerido: number,                  // resultado final
    margemLiquida: number,                  // % líquida após todas deduções
    lucroLiquidoPorUnidade: number          // R$ de lucro por unidade
  }
}
```

## Regras de Negócio

### Seleção do custo mais recente
Dado um código de produto que aparece em múltiplas NFes:
- Buscar o `VALOR_UNITARIO_LIQUIDO` da entrada com `DATA_EMISSAO` **mais próxima de hoje**.
- Critério de desempate: se duas NFes têm a mesma data (improvável), usar a que aparece por primeiro na aba.
- Nunca usar média ponderada ou FIFO — sempre **última entrada** (mais recente).

### Cálculo de preço sugerido
- Chamar `PricingService.calculateSuggestedPrice()` com:
  - `unitCost`: VALOR_UNITARIO_LIQUIDO do produto (selecionado conforme acima)
  - `targetMarginPct`: parâmetro de entrada (default 25%)
  - `marketplace`: 'shopee' ou 'mercado_livre'
- Arredondar resultado a 2 casas decimais (já feito pelo PricingService).

### Margem líquida exibida
- Calcular a partir do resultado do PricingService:
  - `margemCalculada = (netProfit / suggestedPrice) * 100`
  - Exibir com 1 casa decimal (ex.: 24.5%)
- A margem exibida **reflete a retenção real** do marketplace (já descontada).

### Agrupamento
- Produtos com o mesmo `codigoProduto` aparecem **uma única vez** na lista.
- Se o mesmo produto foi comprado 10 vezes, mostra **1 linha** (a mais recente).
- Histórico completo fica acessível via `getProductByCode()`.

### Filtro obrigatório
- Mostrar **apenas** produtos com `status = 'Recebido'`.
- Produtos com status diferente (ex.: 'Devolvido', 'Falha de Processamento') não aparecem no catálogo.

### Ordenação
- Default: por `codigoProduto` (A → Z).
- Suportar também: descrição, custo, preço sugerido Shopee.
- Ambos crescente e decrescente.

## Casos de Borda

- **Produto com custo liquido negativo:** improvável (erro de rateio), mas se ocorrer, retornar erro de negócio na ação específica, não bloquear todo o catálogo.
- **Produto sem descrição:** usar string vazia em `descricaoProduto`, não pular linha.
- **Múltiplas NFes no mesmo dia:** usar primeira ordem de aparição na aba.
- **Comparação de datas:** usar `new Date(DATA_EMISSAO)` para comparação (já em ISO format), não string.
- **Margem target inválida:** validar antes de chamar PricingService; retornar erro estruturado.
- **Aba NFE_ENTRADA_PRODUTOS não encontrada:** retornar erro amigável, não crash.
- **Sem NFes processadas:** retornar `{ success: true, data: [], totalCount: 0 }` (não erro).

## Critérios de Aceite (Given/When/Then)

**Cenário 1: Catálogo com um produto**
- Given: NFE_ENTRADA_PRODUTOS tem 1 linha, codigoProduto='PERF001', VALOR_UNITARIO_LIQUIDO=50, status='Recebido'
- When: `catalog.getProducts({ targetMarginShopee: 0.25, targetMarginMercadoLivre: 0.25 })`
- Then: retorna `{ success: true, data: [{codigoProduto: 'PERF001', ..., precoShopee: ~90.91, precoMercadoLivre: ~91.80}], totalCount: 1 }`

**Cenário 2: Deduplicação com produto em múltiplas NFes**
- Given: codigoProduto='PERF002' aparece 3x:
  - NFe #1 (2024-08-01): VALOR_UNITARIO_LIQUIDO=45
  - NFe #2 (2024-08-10): VALOR_UNITARIO_LIQUIDO=48 ← mais recente
  - NFe #3 (2024-07-15): VALOR_UNITARIO_LIQUIDO=42
- When: `catalog.getProducts()`
- Then: mostra 1 linha com VALOR_UNITARIO_LIQUIDO=48, dataEmissaoMaisRecente='2024-08-10', totalEntradas=3

**Cenário 3: Histórico completo via getProductByCode**
- Given: mesmo cenário anterior (PERF002)
- When: `catalog.getProductByCode({ codigoProduto: 'PERF002' })`
- Then: retorna array com 3 entradas ordenadas por DATA_EMISSAO DESC, última primeira

**Cenário 4: Filtro status**
- Given: 2 linhas com codigoProduto='PERF003', uma com status='Recebido', outra com status='Devolvido'
- When: `catalog.getProducts()`
- Then: mostra apenas a com status='Recebido'

**Cenário 5: Ordenação por preço sugerido**
- Given: 3 produtos com preços sugeridos Shopee: R$100, R$80, R$120
- When: `catalog.getProducts({ sortBy: 'suggestedShopee', sortOrder: 'asc' })`
- Then: retorna na ordem R$80 → R$100 → R$120

**Cenário 6: Margem calculada bate com realidade**
- Given: VALOR_UNITARIO_LIQUIDO=100, preço sugerido Shopee calculado=180.78 (margem 25%, taxa 20%)
- When: calcula margemCalculadaShopee
- Then: ~24.99% (reflete a retenção real de ~20% + ajuste de arredondamento)

## Fora de Escopo (v1)

- Filtros adicionais (por faixa de data, faixa de preço, fornecedor específico).
- Exportar catálogo para CSV/Excel.
- Busca por texto (search).
- Integração com Tiops para atualizar preços em tempo real.
- Histórico de mudanças de preço (auditoria).
- Recomendação automática de margem por categoria/concorrência.
- Alertas de produtos vencidos ou fora de estoque (Fase 2).

## Dependências

- `NFeEntradaProdutosRepository.getProducts(filterStatus)` — buscar linhas com status='Recebido'.
- `PricingService.calculateSuggestedPrice()` — calcular preço sugerido.
- `PricingService.compareMarketplaces()` — alternativa: calcular ambos de uma vez (mais eficiente).
- `ConfigService` — acesso à planilha e constantes.

## Notas de Implementação

1. **Service + View separados:**
   - `CatalogService.js`: lógica de busca, deduplicação, cálculo de preços.
   - `CatalogView.html`: Web Component que chama `google.script.run.apiDispatch('catalog.getProducts', {...})`.

2. **Deduplicação em memória:** com NFEs em potencial crescimento, considerar cache curto (5-10 min) no `CacheService` para evitar releitura constante de Sheets.

3. **Margem exibida:** usar `Math.round((netProfit/price)*10000)/100` para 1 casa decimal.

4. **Data mais recente:** usar `new Date(dataEmissao)` para comparação segura, não string sorting.

5. **UI Design:** usar sistema de design (Styles.html tokens):
   - Cards por produto
   - Badge de "Mais recente" em data
   - Cores de margem (verde se > 20%, amarelo se 15-20%, vermelho se < 15%)
   - Botão "Ver histórico" que abre drawer com `getProductByCode()` resultado
   - **Clique no preço sugerido** (Shopee ou Mercado Livre) abre sidebar à direita com memória de cálculo passo-a-passo
     - Sidebar mostra: VALOR_UNITARIO_LIQUIDO → aplicar taxas → subtrair comissões → chegar ao preço sugerido
     - Cada passo é uma linha: descrição, valor, fórmula
     - Resumo final com margem líquida e lucro por unidade
     - Exemplo de fluxo para Shopee:
       ```
       1. Custo Unitário Líquido          R$ 50,00
       2. Aplicar margem alvo (25%)       → precisa estar em (price * m)
       3. Taxa Shopee (20% flat)          → (50 + fixed) / (1 - 0.20 - 0.25)
       4. Preço Sugerido Final            R$ 90,91
       5. Verificação: Lucro Líquido      R$ 18,18 (20% da venda)
       ```

## Instruções de Codificação

### Passos Executáveis

1. **CatalogService.js** — criar em `src/03_services/catalog/`
   - `describe()`: retorna ações (getProducts, getProductByCode, getCalculationMemory) com schema
   - `getProducts(params)`: NFeEntradaProdutosRepository → agrupa por código, pega mais recente por DATA_EMISSAO, calcula preços via PricingService, ordena por sortBy
   - `getProductByCode(params)`: retorna array histórico completo, DESC por data
   - `getCalculationMemory(params)`: monta array de passos (custo → margem → taxa → preço final) + resumo com lucro por unidade

2. **CatalogView.html** — criar em `ui/catalog/`
   - Web Component com Shadow DOM
   - Chama `google.script.run.apiDispatch('catalog.getProducts', params)`
   - Cards com [código | descrição | custo | preço Shopee | preço ML | margem]
   - Dropdown sortBy (código, descrição, custo, preço Shopee) + toggle asc/desc
   - Clique em preço → sidebar com getCalculationMemory() passo-a-passo
   - Botão "Ver histórico" → modal com getProductByCode()

3. **appsscript.json** — adicionar ao `filePushOrder`
   - Inserir `"src/03_services/catalog/CatalogService.js"` após PricingService, antes de ServiceRegistry

4. **ServiceRegistry.js** — confirmar registro
   - Entrada `catalog: safeRef_('catalog', function () { return typeof CatalogService !== 'undefined' ? CatalogService : undefined; })` já existe

5. **Testes** — adicionar a `runSmokeTests_()` (6 cenários min)
   - Cenário 1: 1 produto, preços batem
   - Cenário 2: deduplicação (3 NFes → 1 linha com mais recente)
   - Cenário 3: getProductByCode retorna histórico
   - Cenário 4: filtro status='Recebido'
   - Cenário 5: ordenação asc/desc
   - Cenário 6: margem calculada bate com fórmula

### Validações Críticas (Não quebrar)

- ✅ Padrão defensivo em ServiceRegistry obrigatório (typeof X !== 'undefined')
- ✅ Cores/espaçamento SEMPRE via window.__DESIGN_SHEET__ (Styles.html tokens), nunca hard-coded
- ✅ Custo sempre de NFeEntradaProdutosRepository.getProducts(), nunca outro lugar
- ✅ Deduplicação: DATA_EMISSAO mais recente, nunca FIFO/média
- ✅ Filtro status='Recebido' obrigatório
- ✅ Sem chamadas diretas à Tiops (CatalogService = estático, só lê Sheets)
- ✅ Sem chamadas diretas a SpreadsheetApp (usar SheetsRepository)

### Teste de Aceitação Final

Rodar no Apps Script editor:
- `runSmokeTests_()` passa nos 6 cenários ✅
- Shell renderiza, doGet() funciona ✅
- Clique em preço abre sidebar com passo-a-passo ✅
- Ordenação funciona nos 4 campos ✅
- Produto em 3 NFes mostra 1 linha (mais recente) ✅
- Margem ~= (netProfit/price)*100 ✅
