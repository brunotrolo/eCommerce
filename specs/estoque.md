# Spec: Controle de Estoque (ESTOQUE)

## Status
Approved

## Objetivo

**Aba unitária de controle de estoque** que rastreia cada unidade de produto individualmente. Alimentada por **NFE_ENTRADA_PRODUTOS** e **MANUAL_ENTRADA_PRODUTOS** (apenas items com STATUS="Recebido"). Implementa estratégia **FIFO** (First In First Out): primeiro item a entrar é o primeiro a sair, garantindo que o custo de mercadoria disponível é sempre o mais recente.

Diferenças de NFE/MANUAL:
- **Cada linha = 1 unidade** (não agrupa). Ex: NF com 4 unidades = 4 linhas em ESTOQUE.
- **Quantidade sempre = 1** por linha
- **PRECO_VENDA diferenciado por marketplace** (Shopee ≠ Mercado Livre)
- **Alerta de estoque baixo** quando fica apenas 1 item DISPONÍVEL
- **Status granular**: DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM DEFEITO, etc.
- **QUEBRADO = perda total** (custo é prejuízo)

---

## Contrato da API Interna

### `estoque.importarDeNfe`
- **Descrição:** Lê items DISPONÍVEL de NFE_ENTRADA_PRODUTOS e cria linhas unitárias em ESTOQUE
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | numeroNf | string | sim | — | Número da NF (ex: "731") |
  | chaveNf | string | sim | — | Chave da NF (44 dígitos) |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    itemsImported: number,
    estoque_ids: [string],  // IDs dos items criados
    errors: [{productCode, reason}]
  }
  ```

### `estoque.importarDeManualEntrada`
- **Descrição:** Lê items de MANUAL_ENTRADA_PRODUTOS e cria linhas unitárias em ESTOQUE
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | dataCompraInicio | DD/MM/YYYY | não | — | Filtro: data inicial |
  | dataCompraFim | DD/MM/YYYY | não | — | Filtro: data final |

- **Retorno:** Mesma estrutura de `importarDeNfe`

### `estoque.getItems`
- **Descrição:** Lista items com filtros e ordenação
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código |
  | status | string | não | "DISPONÍVEL" | Filtrar por status |
  | marketplace | string | não | — | "shopee" ou "mercado_livre" (para preço/margem) |
  | sortBy | string | não | "data_entrada" | data_entrada, preco_custo, preco_venda, margem |
  | sortOrder | string | não | "asc" | asc, desc |

- **Retorno:** Array de items com todos os campos

### `estoque.updateStatusBulk`
- **Descrição:** Atualiza status de múltiplos items
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | estoque_ids | [string] | sim | — | IDs dos items a atualizar |
  | novoStatus | string | sim | — | DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM_DEFEITO |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    updated: number,
    perda_total: number  // soma de PRECO_CUSTO se status=QUEBRADO/COM_DEFEITO
  }
  ```

### `estoque.sincronizar`
- **Descrição:** Processa import pendentes (células brancas em SINCRONIZADO)
- **Params:** Nenhum
- **Retorno:**
  ```javascript
  {
    success: boolean,
    itemsImportados: number,
    itemsSincronizados: number
  }
  ```

### `estoque.getEstoqueAtualPorProduto`
- **Descrição:** Resume estoque por código de produto (para Dashboard/Catálogo)
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Se omitir, retorna tudo |

- **Retorno:**
  ```javascript
  {
    codigoProduto: string,
    descricaoProduto: string,
    quantidadeDisponivel: number,
    quantidadeVendida: number,
    quantidadeDevolvida: number,
    quantidadeQuebrada: number,
    precoCustoMaisRecente: number,
    precoVendaShopee: number,
    precoVendaMercadoLivre: number,
    margemShopee: number,
    margemMercadoLivre: number,
    alertaEstoqueBaixo: boolean,  // true se quantidadeDisponivel=1
    dataEntradaMaisRecente: string,
    dataUltimaAtualizacao: string
  }
  ```

### `estoque.sincronizarPrecosCatalogo`
- **Descrição:** Botão "Recalcular Preços de Venda" da UI. Recalcula
  `PRECO_VENDA_SHOPEE`/`PRECO_VENDA_MERCADO_LIVRE` de **todos** os items do
  estoque, um por um, **sempre a partir do `PRECO_CUSTO_ORIGINAL` daquele
  item específico** — nunca de um preço agregado do Catálogo. Motor único:
  `PricingService.calculateSuggestedPrice`, margem alvo =
  `ConfigService.getDefaultMargin()` (a mesma margem padrão que o Catálogo
  usa quando o usuário não ajusta o campo "Margem %").
  - **Corrigido em 09/08/2026** (antes buscava o preço já calculado de
    `CatalogService.getProducts()`, que agrega por "custo mais recente por
    código de produto" — divergente do custo real de um item específico se
    ele veio de um lote/NFe mais antigo e mais barato/caro que o lote mais
    recente do mesmo produto).
- Params: nenhum.
- Retorno: `{ success: true, atualizados: number, semCusto: number, total: number }`
  — `semCusto` conta items com `PRECO_CUSTO_ORIGINAL <= 0` (pulados, não é possível calcular).
- Regra: só escreve na planilha os items cujo preço recalculado difere do
  valor atualmente salvo em mais de R$0,01 (economiza I/O), mas o **cálculo**
  em si sempre roda do zero para todo item, nunca reaproveita valor salvo.

---

## Formato da Aba ESTOQUE

Colunas (cada linha = 1 unidade):

```
ESTOQUE_ID | CATEGORIA | CODIGO_PRODUTO | DESCRICAO_PRODUTO | DATA_ENTRADA | REFERENCIA_ORIGEM | 
PRECO_CUSTO_ORIGINAL | PRECO_VENDA_SHOPEE | PRECO_VENDA_MERCADO_LIVRE | 
MARGEM_SHOPEE | MARGEM_MERCADO_LIVRE | STATUS | ALERTA_ESTOQUE_BAIXO | 
DATA_SINCRONIZACAO | LOG_ID
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| ESTOQUE_ID | string | Chave única (ex: "EST-20260803-001" ou UUID) |
| CATEGORIA | string | Categoria do produto, **preenchimento manual direto na planilha** (não é preenchido pela sincronização). Exibida no Web App entre ESTOQUE_ID e Produto; filtro por digitação. |
| CODIGO_PRODUTO | string | Código do produto (ex: "0000000006231") |
| DESCRICAO_PRODUTO | string | Nome do produto |
| DATA_ENTRADA | ISO 8601 | Quando entrou no estoque (vem de NFE/MANUAL) |
| REFERENCIA_ORIGEM | string | "NF#731" ou "MAN#001" — rastreabilidade |
| PRECO_CUSTO_ORIGINAL | number | Custo unitário imutável (VALOR_UNITARIO_LIQUIDO) |
| PRECO_VENDA_SHOPEE | number | Preço de venda Shopee (mutável, default=null) |
| PRECO_VENDA_MERCADO_LIVRE | number | Preço de venda ML (mutável, default=null) |
| MARGEM_SHOPEE | number | % — via `PricingService.calculateNetMargin` (motor único, ver `specs/pricing.md`), **não** `(preço-custo)/preço` bruto. Ver nota de correção abaixo. |
| MARGEM_MERCADO_LIVRE | number | % — via `PricingService.calculateNetMargin` (mesmo motor, taxa ML real 14%+R$6), **não** `(preço-custo)/preço` bruto. Ver nota de correção abaixo. |
| STATUS | string | DISPONÍVEL, VENDIDO, DEVOLVIDO, QUEBRADO, COM_DEFEITO |
| ALERTA_ESTOQUE_BAIXO | boolean | true quando é o último item DISPONÍVEL do produto |
| DATA_SINCRONIZACAO | ISO 8601 | Timestamp quando foi importado de NFE/MANUAL |
| LOG_ID | string | Timestamp + nonce para rastreabilidade |

---

## Regras de Negócio

1. **Estrutura unitária obrigatória:** Cada linha = 1 unidade. Quantidade NUNCA muda (sempre 1).
   - Ex: NF com 5 unidades de "Maison Delilah" → 5 linhas, cada uma com QUANTIDADE=1.

2. **FIFO (First In First Out):** Ao identificar próximo item a sair (pedido):
   - Selecionar item com STATUS=DISPONÍVEL e DATA_ENTRADA **mais antiga**.
   - Marcar como VENDIDO.
   - Custo da venda = PRECO_CUSTO_ORIGINAL desse item (custo mais recente em estoque ≠ custo de saída).

3. **Importação inicial:** Ao sincronizar NFE/MANUAL → ESTOQUE:
   - Criar linha para cada unidade.
   - STATUS = "DISPONÍVEL"
   - PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE = null (informar via Web App)
   - Coluna SINCRONIZADO em NFE/MANUAL = "Sim"
   - Coluna ESTOQUE em NFE/MANUAL = ESTOQUE_ID (link)

4. **Alerta de estoque baixo:**
   - Flag ALERTA_ESTOQUE_BAIXO = true quando for o **último item DISPONÍVEL** daquele produto.
   - Ao marcar como VENDIDO/QUEBRADO/DEFEITO, recalcular flag para próximo item (se houver).
   - Exibir no UI com indicador visual (⚠️ ou cor de aviso).

5. **QUEBRADO = Perda total:**
   - Quando STATUS = QUEBRADO ou COM_DEFEITO:
     - Item sai da contagem de estoque DISPONÍVEL.
     - PRECO_CUSTO_ORIGINAL = prejuízo direto (não há recuperação).
     - Registrar em relatório de perdas para análise.

6. **Preços de venda diferenciados:**
   - Cada item tem PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE **independentes**.
   - Ao atualizar preço via Web App, altera para **todos items DISPONÍVEL** daquele produto.
   - Não altera items já VENDIDO/DEVOLVIDO (histórico imutável).

7. **Cálculo de margem — motor único (corrigido em 09/08/2026):**
   `EstoquePrecoService.calcularMargem_`/`EstoqueService.calcularMargem_`
   (Estoque) e `CatalogService.getProducts` (Catálogo) **todos** delegam
   para `PricingService.calculateNetMargin` — nunca duplicam a fórmula.
   Antes da correção, ambos `calcularMargem_` de Estoque tinham sua própria
   cópia idêntica de `(preço-custo)/preço` bruto, **ignorando comissão e
   taxa de serviço dos dois canais**, então superestimava a margem real em
   todos os produtos (observado entre 30% e 49% de margem "aparente" na
   Shopee quando a margem real, descontando taxas, era bem menor; ML também
   afetado, mesmo bug).

   ```
   // Shopee — comissao 18% (cartao_avista) ou 12% (pix/parcelado) + taxa
   // de servico 2%+R$4/item (itemCount=1: cada linha ESTOQUE = 1 unidade)
   comissao       = PRECO_VENDA_SHOPEE * 0.18
   taxaServico    = PRECO_VENDA_SHOPEE * 0.02 + 4
   liquido        = PRECO_VENDA_SHOPEE - comissao - taxaServico
   lucro          = liquido - PRECO_CUSTO_ORIGINAL
   MARGEM_SHOPEE  = lucro / PRECO_VENDA_SHOPEE * 100   // sobre o preço de venda, NAO sobre o líquido

   // Mercado Livre — taxa flat 14% + R$6 (ConfigService.getMarketplaceFee)
   liquidoML          = PRECO_VENDA_MERCADO_LIVRE - (PRECO_VENDA_MERCADO_LIVRE*0.14 + 6)
   lucroML            = liquidoML - PRECO_CUSTO_ORIGINAL
   MARGEM_MERCADO_LIVRE = lucroML / PRECO_VENDA_MERCADO_LIVRE * 100
   ```

   Margem sempre medida sobre o **preço de venda** (`netProfit/salePrice`),
   mesma convenção de `pricing.calculateSuggestedPrice` — nunca sobre o
   líquido recebido (definição usada num rascunho anterior desta spec,
   corrigida para bater com `specs/pricing.md`). `itemCount=1` e
   `paymentScenario=cartao_avista` são os defaults corretos aqui porque cada
   linha ESTOQUE representa 1 unidade vendida isoladamente — não um pedido
   multi-item.
   - Se preço de venda = null → margem = não aplicável
   - Se margem < 0 → prejuízo (alertar no UI)
   - **Alerta de prejuízo compara o líquido pós-taxas ao custo, nunca o
     preço bruto** — um preço nominalmente acima do custo pode gerar
     prejuízo real depois de descontar comissão+taxa (ver Scenario 3 de
     `specs/estoque-preco-update.md`).

8. **Rastreabilidade:**
   - REFERENCIA_ORIGEM: identifica se veio de NF ou entrada manual.
   - DATA_ENTRADA: rastreia idade do item.
   - LOG_ID: auditoria de quando foi registrado.

---

## Casos de Borda

- **Produto com quantidade > 1 em NFE:** Cria N linhas (uma por unidade).
- **Produto recebido 2x (entrada manual + NF):** Ambos geram linhas diferentes em ESTOQUE (FIFO natural: mais antiga sai primeiro).
- **Alerta quando quantidadeDisponível = 1:** Flag acionada; desligada quando vendido (próximo item, se houver, vira o "último").
- **Tentar marcar VENDIDO sem corresponder a pedido:** Permitir por enquanto (Fase 5 integra com pedidos).
- **Status DEVOLVIDO:** Item volta para DISPONÍVEL e recalcula alerta.
- **Status QUEBRADO enquanto importando:** Não incluir na contagem de estoque, mas manter registro para auditoria.
- **Preço de venda = 0:** Aceitar (produto de cortesia). Margem = -100%.
- **Preço de venda < custo:** Aceitar. Margem negativa (prejuízo explícito).

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Importar NF com 3 unidades de mesmo produto
```
Given: NFE_ENTRADA_PRODUTOS tem "Maison Delilah" (cód 0000000006231) com QUANTIDADE=3, 
       VALOR_UNITARIO_LIQUIDO=100, STATUS="Recebido"
When: estoque.importarDeNfe({numeroNf: "731", chaveNf: "35260739..."})
Then:
  - Retorna {success: true, itemsImported: 3}
  - ESTOQUE contém 3 linhas novas (EST-20260803-001, EST-20260803-002, EST-20260803-003)
  - Cada linha: CODIGO_PRODUTO="0000000006231", QUANTIDADE=1 (implícito), 
    PRECO_CUSTO_ORIGINAL=100, STATUS="DISPONÍVEL"
  - REFERENCIA_ORIGEM="NF#731" para todas
  - Coluna SINCRONIZADO em NFE_ENTRADA_PRODUTOS = "Sim"
  - Coluna ESTOQUE em NFE_ENTRADA_PRODUTOS.ESTOQUE_ID = "EST-20260803-001" (ou similar)
  - ALERTA_ESTOQUE_BAIXO = false (3 items disponíveis)
```

### Scenario 2: Alerta de estoque baixo (último item)
```
Given: ESTOQUE tem 2 items DISPONÍVEL de "Maison Delilah"
When: Marca primeiro como VENDIDO
Then:
  - Item 1 → STATUS="VENDIDO", ALERTA_ESTOQUE_BAIXO=false
  - Item 2 → ALERTA_ESTOQUE_BAIXO=true (agora é o último)
  - UI exibe ⚠️ no item 2
```

### Scenario 3: FIFO na saída
```
Given: ESTOQUE tem 4 items DISPONÍVEL de "Produto X", com DATA_ENTRADA:
  - Item A: 2026-08-01 (mais antiga)
  - Item B: 2026-08-02
  - Item C: 2026-08-03
  - Item D: 2026-08-04 (mais recente)
When: Pede 2 unidades do produto
Then:
  - FIFO identifica Item A (mais antiga) e Item B
  - Ambos marcados como VENDIDO
  - Item C agora é o "item DISPONÍVEL com custo mais recente"
  - Precificação futura usa PRECO_CUSTO_ORIGINAL de Item C
```

### Scenario 4: Quebra = Perda
```
Given: Item em ESTOQUE com PRECO_CUSTO_ORIGINAL=100
When: Status → QUEBRADO
Then:
  - Item sai da contagem "DISPONÍVEL"
  - updateStatusBulk retorna {perda_total: 100}
  - Relatório de perdas registra R$100
  - Não há recuperação/crédito
```

### Scenario 5: Preços diferentes por marketplace
```
Given: Item em ESTOQUE de "Maison Delilah" (PRECO_CUSTO_ORIGINAL=100)
When: Web App atualiza PRECO_VENDA_SHOPEE=150, PRECO_VENDA_MERCADO_LIVRE=160
Then:
  - MARGEM_SHOPEE = 10.67% (comissão R$27,00 + taxa serviço R$7,00 sobre 150 → líquido R$116,00; lucro R$16,00; 16/150*100 — **não** os 33,3% do cálculo bruto antigo nem os 13,79% de uma versão anterior desta spec que media a margem sobre o líquido em vez do preço de venda)
  - MARGEM_MERCADO_LIVRE = 19,75% (taxa 14%+R$6 sobre 160 → líquido R$131,60; lucro R$31,60; 31,60/160*100 — **não** os 37,5% do cálculo bruto antigo, que ignorava a taxa ML)
  - Ambos refletem imediatamente na UI
  - Todos items DISPONÍVEL do produto recebem mesmos preços
```

### Scenario 6: Sincronização automática
```
Given: NFE_ENTRADA_PRODUTOS.SINCRONIZADO = "" (em branco)
When: Clica botão "Sincronizar" na UI (skill para depois)
Then:
  - Sistema identifica todas células em branco
  - Importa para ESTOQUE via importarDeNfe
  - Preenche SINCRONIZADO = "Sim"
  - Retorna {itemsImportados: 15, itemsSincronizados: 15}
```

---

## Fora de Escopo (v1)

- Histórico de preço (não guardar mudanças anteriores)
- Lote/série/rastreabilidade por validade
- Integração com pedidos (Fase 5)
- Análise de idade de estoque (Fase 4)
- Alertas automáticos por email/push
- Previsão de demanda

---

## Dependências

### Services
- `NFeEntradaProdutosRepository` — ler items com STATUS="Recebido"
- `ManualEntradaProdutosRepository` — ler items com STATUS="Recebido"
- `FormatterService` — formatação de datas

### Repositories
- `EstoqueRepository` (novo) — I/O com aba ESTOQUE
- `EstoqueMovimentacaoRepository` (novo) — log de mudanças de status (Fase 3)

### Google Apps Script
- `SpreadsheetApp` — acesso à aba

---

## Notas de Implementação

### Geração de ESTOQUE_ID
```javascript
function gerarEstoqueId() {
  var now = new Date();
  var date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  var seq = EstoqueRepository.getProximoSequencial(date);
  return 'EST-' + date + '-' + String(seq).padStart(3, '0');
  // Ex: EST-20260803-001
}
```

### Cálculo de margem
```javascript
function calcularMargem(precoVenda, precoCusto) {
  if (!precoVenda || precoVenda === 0) return null;
  var margem = ((precoVenda - precoCusto) / precoVenda) * 100;
  return Math.round(margem * 100) / 100; // 2 casas
}
```

### Identificar alerta de estoque baixo
```javascript
function verificarAlertaEstoqueBaixo(codigoProduto) {
  var items = EstoqueRepository.getRows()
    .filter(r => r.CODIGO_PRODUTO === codigoProduto && r.STATUS === 'DISPONÍVEL')
    .sort((a, b) => new Date(a.DATA_ENTRADA) - new Date(b.DATA_ENTRADA));
  
  return items.length === 1 ? true : false;
}
```

### Integração com NFE_ENTRADA_PRODUTOS
Após importação, atualizar coluna SINCRONIZADO:
```javascript
function marcarComoBaixado(numeroNf, chaveNf) {
  var nfeRepo = NFeEntradaProdutosRepository;
  var rows = nfeRepo.getRows().filter(r => r.NUMERO_NF === numeroNf);
  // Preencher coluna SINCRONIZADO = "Sim" + ESTOQUE_ID
}
```

---

## Teste de Aceitação

- [ ] Importa 5 units de produto NF → 5 linhas ESTOQUE (cada 1 unit) ✅
- [ ] FIFO: identifica item mais antigo como próximo a sair ✅
- [ ] Alerta: flag true quando último DISPONÍVEL ✅
- [ ] Quebra: perda contabilizada, item fora de estoque ✅
- [ ] Preços diferentes: Shopee ≠ ML ✅
- [ ] Sincronização: marca coluna SINCRONIZADO + ESTOQUE_ID ✅
- [ ] getEstoqueAtualPorProduto agrega correto (resumo unitário) ✅
