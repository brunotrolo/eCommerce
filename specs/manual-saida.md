# Spec: Saída Manual de Produtos (MANUAL_SAIDA_PRODUTOS)

## Status
Approved

## Objetivo

**Aba complementar a catálogo** para registrar saídas de produtos do estoque sem integração com marketplace (vendas diretas, devoluções, perdas, ajustes de estoque, etc.). Permite rastreamento de saídas manuais com controle de quantidade disponível em tempo real.

Resolve o problema: usuário vende/devolve/perde produtos diretamente sem passar por Shopee/Mercado Livre, mas precisa atualizar estoque e manter histórico de saídas.

---

## Contrato da API Interna

### `manualSaida.addExit`
- **Descrição:** Registra uma saída manual em MANUAL_SAIDA_PRODUTOS, dispara baixa automática na aba ESTOQUE (FIFO via `estoqueBaixa.baixarPorProduto`, `origem=SAIDA_MANUAL`, `referenciaOrigem=exitId`) e grava `SKU` + `ESTOQUE_IDS` das unidades baixadas na linha da saída. Sem passo de "sincronizar": a baixa acontece no próprio `addExit`.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | sim | — | Código do produto (ex: "0000000006231") |
  | descricaoProduto | string | sim | — | Descrição do produto |
  | quantidade | number | sim | — | Quantidade saída (deve ser ≤ estoque disponível) |
  | tipoSaida | string | sim | — | Tipo de saída: "Venda", "Devolução", "Perda", "Ajuste", "Brinde" |
  | clienteName | string | não | — | Cliente/destino (campo texto livre, opcional) |
  | precoUnitario | number | não | 0 | Preço unitário da venda (para histórico de receita) |
  | dataCompra | string (DD/MM/YYYY) | não | hoje | Data da saída |
  | observacoes | string | não | "" | Notas livres do usuário |
  | motivoPerda | string | não | — | Se tipoSaida="Perda": motivo (Roubo, Danificado, Vencimento, etc.) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    exitId: string,            // timestamp + nonce para rastreabilidade
    processedAt: string,       // ISO 8601
    estoqueRestante: number,   // Quantidade que restou após a saída
    estoque_ids: [string],     // IDs das unidades baixadas na aba ESTOQUE (FIFO)
    sku: string,               // SKU das unidades baixadas
    row: {
      codigo, descricao, quantidade, tipoSaida, clienteName, sku, estoqueIds, ...
    },
    errors: []
  }
  ```
- **Erros esperados:**
  - `Missing required field: codigoProduto`
  - `Quantidade must be > 0`
  - `Quantidade maior que estoque disponível`
  - `Tipo de saída inválido`
  - `Produto não encontrado`

### `manualSaida.listExits`
- **Descrição:** Lista todas as saídas manuais ou filtra por código de produto / tipo de saída,
  enriquecidas para exibição com `categoria` e preços sugeridos de venda.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código |
  | tipoSaida | string | não | — | Filtrar por tipo (Venda, Devolução, etc.) |
  | limit | number | não | 100 | Máximo de linhas |

- **Retorno:** `{ exits: [...] }` onde cada exit contém:
  ```javascript
  {
    codigoProduto, sku, categoria,                // categoria = prefixo do SKU
    descricaoProduto, ncm, quantidade, tipoSaida, precoUnitario, valorTotal, status,
    dataSaida, tipoMovimentacao, logId, clienteNome, motivoPerda, dataRegistro,
    estoqueIds, observacoes, valorUnitario, valorUnitarioLiquido, valorLiquidoItem,
    emitenteNome, dataCompra, valorOutrosItem, tipoOutros,
    precoSugeridoShopee,                          // preço sugerido Shopee do catálogo (0 se sem preço)
    precoSugeridoMercadoLivre                     // preço sugerido Mercado Livre do catálogo (0 se sem preço)
  }
  ```
- **Subtotais na view (client-side, sobre o filtro ativo):**
  - Total = soma de quantidade (total saído)
  - Vendas = soma de quantidade com tipoSaida='Venda'
  - Outros = soma de quantidade com tipoSaida≠'Venda'
  - Alertas = nº de itens sem preço sugerido no catálogo (ambos preços = 0)
  - Valor Total = soma de valorTotal
  - Preco Shopee = soma de quantidade × precoSugeridoShopee
  - Preco ML = soma de quantidade × precoSugeridoMercadoLivre
- **Filtros por coluna:** Código, Categoria, Descrição, Cliente, NCM e Tipo Saída (combináveis).

### `manualSaida.validateExit`
- **Descrição:** Valida dados antes de inserir (sem efetivamente inserir)
- **Params:** Mesmos de `addExit`
- **Retorno:**
  ```javascript
  {
    valid: boolean,
    warnings: [string],  // ex. "Quantidade próxima do estoque mínimo"
    errors: [string],    // ex. "Quantidade maior que disponível"
    estoqueDisponivel: number
  }
  ```

### `manualSaida.getAvailableProducts`
- **Descrição:** Retorna lista de produtos disponíveis em estoque com quantidade (fonte: aba ESTOQUE, unidades com BAIXADO=N)
- **Params:** 
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | filtro | string | não | — | Buscar por nome/código (substring) |

- **Retorno:** 
  ```javascript
  [
    {
      codigoProduto: "0000000006231",
      descricaoProduto: "Maison Delilah",
      estoqueDisponivel: 15,
      precoUnitarioMedio: 100.50
    },
    ...
  ]
  ```

### `manualSaida.getClienteHistory`
- **Descrição:** Retorna histórico de clientes já usados (autocomplete)
- **Params:** Nenhum
- **Retorno:** Array de strings com nomes de clientes únicos ordenados alfabeticamente

---

## Formato da Aba MANUAL_SAIDA_PRODUTOS

Colunas:

```
CODIGO_PRODUTO | SKU | DESCRICAO_PRODUTO | QUANTIDADE | TIPO_SAIDA | PRECO_UNITARIO | 
VALOR_TOTAL | STATUS | DATA_SAIDA | TIPO_MOVIMENTACAO | LOG_ID | 
CLIENTE_NOME | MOTIVO_PERDA | DATA_REGISTRO | OBSERVACOES | ESTOQUE_IDS
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| CODIGO_PRODUTO | string | Código único do produto (ex: "0000000006231") |
| DESCRICAO_PRODUTO | string | Nome/descrição (ex: "Maison Delilah") |
| QUANTIDADE | number | Quantidade saída (ex: 3) |
| TIPO_SAIDA | string | Categoria: "Venda", "Devolução", "Perda", "Ajuste", "Brinde" |
| PRECO_UNITARIO | number | Preço unitário da venda (se aplicável; 2 casas decimais) |
| VALOR_TOTAL | number | QUANTIDADE × PRECO_UNITARIO (ou 0 se não for venda) |
| STATUS | string | Sempre "Saído" |
| DATA_SAIDA | DD/MM/YYYY | Data informada pelo usuário (default: hoje) |
| TIPO_MOVIMENTACAO | string | Sempre "Saída Manual" |
| LOG_ID | string | Timestamp + nonce para rastreabilidade |
| CLIENTE_NOME | string | Cliente/destino (campo texto livre, pode ser vazio) |
| MOTIVO_PERDA | string | Se TIPO_SAIDA="Perda": Roubo, Danificado, Vencimento, Outros |
| DATA_REGISTRO | ISO 8601 | Timestamp quando registrado no sistema |
| OBSERVACOES | string | Notas livres do usuário |

---

## Regras de Negócio

1. **Validação de estoque obrigatória:** 
   - Quantidade solicitada DEVE ser ≤ estoque disponível. A fonte de verdade é a aba **ESTOQUE**: unidades com `BAIXADO = N` (agrupadas por `CODIGO_PRODUTO` ou `SKU`, FIFO). Baixas de pedidos de Shopee/ML já marcam `BAIXADO = S`, então essas unidades NÃO contam como disponíveis — diferente do cálculo antigo (`NFE_ENTRADA + MANUAL_ENTRADA - MANUAL_SAIDA`).
   - Se inválida, rejeitar com erro claro

2. **Baixa automática de estoque no salvar (sem passo de sincronizar):**
   - Ao confirmar `addExit`, o backend executa `EstoqueBaixaService.baixarPorProducto()` com `origem='SAIDA_MANUAL'`, `referenciaOrigem=exitId`, `idempotencyKey=exitId` — marca `STATUS='VENDIDO'`/`BAIXADO='S'` nas unidades FIFO da aba ESTOQUE.
   - A linha de MANUAL_SAIDA_PRODUTOS também grava `SKU` e `ESTOQUE_IDS` das unidades baixadas (rastreio unitário).
   - A baixa é síncrona e automática — sem cliques adicionais na UI.

3. **Tipos de saída padronizados:**
   - Venda: saída paga ou normal
   - Devolução: cliente devolveu o produto (entrada de estoque de volta? = futuro)
   - Perda: produto danificado, roubado, etc. — saída permanente
   - Ajuste: correção de contagem de estoque
   - Brinde: saída sem custo (amostra, cortesia)

4. **Preço unitário opcional:**
   - Se TIPO_SAIDA = "Venda": geralmente preenchido
   - Se TIPO_SAIDA = "Perda", "Devolução", etc.: pode ser 0
   - VALOR_TOTAL = QUANTIDADE × PRECO_UNITARIO

5. **Cliente customizável:** 
   - CLIENTE_NOME é campo texto livre (não vinculado a picklist de clientes)
   - Histórico fica disponível via `manualSaida.getClienteHistory()` para autocomplete

6. **Rastreabilidade:** 
   - LOG_ID = timestamp + nonce (ex: "20260803T120500-abc123")
   - DATA_REGISTRO = ISO 8601 do momento do registro

7. **Picklist de produtos com estoque:**
   - Modal exibe `manualSaida.getAvailableProducts()` com:
     * CODIGO_PRODUTO
     * DESCRICAO_PRODUTO
     * ESTOQUE_DISPONIVEL (qty disponível — soma das unidades `BAIXADA = N` da aba ESTOQUE)
     * PRECO_UNITARIO_MEDIO (para referência, opcional)
   - Permite filtro por nome/código (substring search)
   - Ao selecionar, preenche código e descrição automaticamente
   - Validação: quantidade solicitada vs. estoque disponível

8. **Integração com Catálogo:**
   - CatalogService.getProducts() deve deduzir saídas manuais do estoque
   - Fórmula: Estoque Final = (NFE_ENTRADA + MANUAL_ENTRADA) - MANUAL_SAIDA
   - Saída manual marcada com TIPO_MOVIMENTACAO="Saída Manual" para auditoria
   - Regra do estoque unitário: manual saida baixa unidades na aba ESTOQUE (item 2), então o estoque agregado do catálogo reflete automaticamente (unidades com `BAiXDADO=S` não são contadas).

---

## Casos de Borda

- **Quantidade zero:** Rejeitar ("Quantidade deve ser > 0")
- **Quantidade > estoque disponível:** Rejeitar com mensagem clara ("Apenas XXX em estoque")
- **Preço unitário zero:** Aceitar para Perda/Devolução/Ajuste
- **Preço unitário > preço original de compra:** Aceitar (venda com margem)
- **Cliente em branco:** Aceitar para Perda/Ajuste (não há cliente)
- **Data de saída no futuro:** Aceitar (ajuste retroativo futuro)
- **Produto não encontrado:** Rejeitar com erro explícito
- **Tipo de saída inválido:** Rejeitar com lista de tipos válidos
- **Motivo de perda sem informar tipoSaida="Perda":** Ignorar campo

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Registrar venda manual simples
```
Given: Estoque tem "Maison Delilah" (cód 0000000006231) com 10 unidades disponíveis
When: Usuário abre modal de saída manual
  - Seleciona "Maison Delilah (10 disponíveis)" no picklist
  - Tipo: "Venda"
  - Quantidade: 3
  - Preço Unitário: R$100
  - Cliente: "Cliente ABC"
  - Data: 03/08/2026
  E clica "Confirmar"
Then:
  - Retorna {success: true, exitId: "...", estoqueRestante: 7}
  - Aba MANUAL_SAIDA_PRODUTOS contém 1 linha nova
  - CODIGO_PRODUTO="0000000006231", DESCRICAO_PRODUTO="Maison Delilah"
  - QUANTIDADE=3, TIPO_SAIDA="Venda", PRECO_UNITARIO=100, VALOR_TOTAL=300
  - STATUS="Saído", TIPO_MOVIMENTACAO="Saída Manual"
  - CLIENTE_NOME="Cliente ABC", DATA_SAIDA="03/08/2026"
  - Catálogo mostra estoque de "Maison Delilah" reduzido para 7
```

### Scenario 2: Registrar perda com motivo
```
Given: Estoque tem "Ameerat" (cód XXX) com 5 unidades
When: Tipo: "Perda", Quantidade: 1, Motivo: "Danificado"
Then:
  - TIPO_SAIDA="Perda", PRECO_UNITARIO=0, VALOR_TOTAL=0
  - MOTIVO_PERDA="Danificado"
  - Estoque reduzido para 4
```

### Scenario 3: Quantidade maior que estoque disponível
```
Given: Estoque tem "Maison Delilah" com 5 unidades
When: Tenta registrar saída de 10 unidades
Then:
  - Validação rejeita: {valid: false, errors: ["Quantidade maior que estoque disponível"]}
  - Modal exibe erro em vermelho
  - Produto não foi removido
```

### Scenario 4: Picklist com filtro
```
Given: 20 produtos em estoque
When: Usuário digita "Maia" no campo de busca
Then:
  - Picklist filtra e mostra apenas produtos com "Maia" no nome
  - Exibe formato: "Maison Delilah (10 em estoque)"
```

### Scenario 5: Histórico de clientes (autocomplete)
```
Given: Usuário já registrou saídas com clientes "Cliente ABC", "Cliente XYZ"
When: `manualSaida.getClienteHistory()`
Then:
  - Retorna ["Cliente ABC", "Cliente XYZ"] (ordenado alfabeticamente)
  - Campo de cliente mostra dropdown com sugestões ao digitar
```

### Scenario 6: Listar saídas por tipo
```
Given: 5 saídas manuais no histórico (3 "Venda", 1 "Perda", 1 "Ajuste")
When: `manualSaida.listExits({tipoSaida: "Venda"})`
Then:
  - Retorna array com 3 objetos
  - Cada um tem tipoSaida="Venda"
```

---

## Fora de Escopo (v1)

- Edição de saída manual já registrada (apenas inserção)
- Deleção de saída manual (rastreabilidade)
- Saída com devolução automática (Devolução regressa o produto ao estoque — v2)
- Importação em lote (CSV, Excel)
- Integração com Shopee/ML (saída manual é só registro local)
- Alertas de estoque mínimo
- Relatórios de saída por período

---

## Dependências

### Services
- `CatalogService` — deve descontar MANUAL_SAIDA_PRODUTOS do cálculo de estoque agregado
- `FormatterService` — formatar datas DD/MM/YYYY e valores com 2 casas decimais

### Repositories
- `NFeEntradaProdutosRepository` — ler estoque de entrada por NF
- `ManualEntradaProdutosRepository` — ler estoque de entrada manual
- `ManualSaidaProdutosRepository` (novo) — escrever/ler aba MANUAL_SAIDA_PRODUTOS

### Google Apps Script
- `SpreadsheetApp` — acesso às abas
- `CacheService` — cache de estoque agregado (TTL curto, ex 5 min)

---

## Notas de Implementação

### Estrutura de arquivos
```
src/03_services/manualSaida/
├── ManualSaidaService.js       # Lógica de negócio (validação, dedução estoque)
└── ManualSaidaRepository.js    # I/O com Google Sheets

ui/manualSaida/
└── ManualSaidaView.html        # Web Component (modal/drawer)
```

### Inicialização da aba
Criar automaticamente em `ConfigService.initializeSheets()`:
```javascript
function initializeSheets() {
  var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
  var sheet = ss.getSheetByName('MANUAL_SAIDA_PRODUTOS');
  if (!sheet) {
    sheet = ss.insertSheet('MANUAL_SAIDA_PRODUTOS');
    sheet.appendRow([
      'CODIGO_PRODUTO', 'DESCRICAO_PRODUTO', 'QUANTIDADE', 'TIPO_SAIDA',
      'PRECO_UNITARIO', 'VALOR_TOTAL', 'STATUS', 'DATA_SAIDA',
      'TIPO_MOVIMENTACAO', 'LOG_ID', 'CLIENTE_NOME', 'MOTIVO_PERDA',
      'DATA_REGISTRO', 'OBSERVACOES', 'SKU', 'ESTOQUE_IDS'
    ]);
  }
}
```

### Cálculo de Estoque Agregado
```javascript
function getEstoqueDisponivel(codigoProduto) {
  // Fonte de verdade: aba ESTOQUE (unidades BAIXADO='N', casa por CODIGO_PRODUTO ou SKU)
  var unidades = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
  return unidades.length; // cada linha = 1 unidade física
}
```
> **Alterado (fev/2026):** o cálculo antigo (`NFE_ENTRADA + MANUAL_ENTRADA - MANUAL_SAIDA`) ignorava as baixas de pedidos Shopee que marcam unidades como VENDIDAS na aba ESTOQUE — inflando o "disponível" (ex.: 6 mostrados vs. 4 reais com BAIXADO=N). Agora o estoque disponível é contado das unidades `BAIXADO=N`.

### Geração de LOG_ID
```javascript
function gerarLogId() {
  var now = new Date();
  var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd\'T\'HHmmss');
  var nonce = Utilities.getUuid().substring(0, 6);
  return timestamp + '-' + nonce;
}
```

### Integração com ServiceRegistry
Adicionar em `ServiceRegistry.js`:
```javascript
var services = {
  // ...
  manualSaida: safeRef_('manualSaida', function () {
    return typeof ManualSaidaService !== 'undefined' ? ManualSaidaService : undefined;
  })
};
```

### Integração com CatalogService
Refatorar `catalog.getProducts()` para descontar saídas:
```javascript
function getProducts(filter) {
  var produtosNf = NFeEntradaProdutosRepository.getRows(...);
  var produtosManual = ManualEntradaProdutosRepository.getRows(...);
  var saidas = ManualSaidaProdutosRepository.getRows(...);
  
  var todos = produtosNf.concat(produtosManual);
  var agregado = agregaePorCodigo(todos);
  
  // Descontar saídas do estoque
  saidas.forEach(function(saida) {
    if (agregado[saida.codigoProduto]) {
      agregado[saida.codigoProduto].estoqueDisponivel -= saida.quantidade;
    }
  });
  
  return agregado;
}
```

### Cache de Estoque
```javascript
function getEstoqueCache() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('estoque_agregado');
  
  if (!cached) {
    cached = JSON.stringify(calcularEstoqueAgregado());
    cache.put('estoque_agregado', cached, 300); // 5 min TTL
  }
  
  return JSON.parse(cached);
}

// Invalidar cache ao adicionar saída
function addExit(params) {
  // ... lógica de inserção
  CacheService.getScriptCache().remove('estoque_agregado');
  return result;
}
```

---

## Teste de Aceitação

No browser:
- Modal de saída manual aparece (botão em Shell.html) ✅
- Picklist exibe produtos com estoque disponível ✅
- Filtro por nome/código funciona ✅
- Validação em tempo real (quantidade > estoque = erro) ✅
- Confirmar → registro em MANUAL_SAIDA_PRODUTOS ✅
- Estoque em Catálogo reduzido imediatamente ✅
- Histórico de clientes (autocomplete) ✅
- Cálculos corretos (todos os 6 scenarios Given/When/Then passam) ✅
- Tipo "Perda" com motivo funciona ✅
- Segunda saída do mesmo produto reduz estoque novamente ✅
