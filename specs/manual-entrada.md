# Spec: Entrada Manual de Produtos (MANUAL_ENTRADA_PRODUTOS)

## Status
Approved

## Objetivo

**Aba complementar a NFE_ENTRADA_PRODUTOS** para registrar entrada de produtos que não possuem Nota Fiscal (compras diretas, fornecedores sem documentação formal, etc.). Estrutura idêntica a NFE_ENTRADA_PRODUTOS, mas:
- Sem NUMERO_NF, CHAVE_NF, DATA_EMISSAO, EMITENTE_CNPJ (não há NF)
- Com EMITENTE_NOME customizável (campo texto livre com histórico)
- Com DATA_COMPRA informada pelo usuário
- Com campo OBSERVACOES opcional para notas
- TIPO_MOVIMENTACAO sempre = "Entrada Manual"
- VALOR_DESCONTO_ITEM sempre = 0 e TIPO_DESCONTO = "NENHUM"
- VALOR_OUTROS_ITEM opcional (frete, embalagem, etc.) — soma ao custo

Resolve o problema: usuário compra produtos sem NF mas precisa registrar entrada em estoque e ter custo real para precificação.

---

## Contrato da API Interna

### `manualEntrada.addEntry`
- **Descrição:** Registra uma entrada manual em MANUAL_ENTRADA_PRODUTOS
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | sim | — | Código do produto (ex: "0000000006231") |
  | descricaoProduto | string | sim | — | Descrição do produto |
  | quantidade | number | sim | — | Quantidade recebida (ex: 5) |
  | valorUnitario | number | sim | — | Preço unitário (2 casas decimais) |
  | aliquotaIcms | number | não | 0.18 | Alíquota ICMS (ex: 0.18 = 18%) |
  | emitenteName | string | sim | — | Fornecedor / origem (campo livre) |
  | dataCom pra | string (DD/MM/YYYY) | não | hoje | Data da compra |
  | valorOutrosItem | number | não | 0 | Despesas acessórias (frete, embalagem, etc.) |
  | observacoes | string | não | "" | Notas livres do usuário |
  | ncm | string | não | "" | Código NCM |
  | cfop | string | não | "" | Código CFOP |

- **Retorno:**
  ```javascript
  {
    success: boolean,
    entryId: string,           // timestamp + nonce para rastreabilidade
    processedAt: string,       // ISO 8601
    row: {
      codigo, descricao, quantidade, valorUnitario, valorLiquido, ...
    },
    errors: []
  }
  ```
- **Erros esperados:**
  - `Missing required field: codigoProduto`
  - `Quantidade must be > 0`
  - `valorUnitario must be >= 0`
  - `Invalid date format`

### `manualEntrada.listEntries`
- **Descrição:** Lista todas as entradas manuais ou filtra por código de produto,
  enriquecidas para exibição com `categoria` e preços sugeridos de venda.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código (se omitir, retorna tudo) |
  | limit | number | não | 100 | Máximo de linhas |

- **Retorno:** `{ entries: [...] }` onde cada entry contém:
  ```javascript
  {
    codigoProduto, sku, categoria,        // categoria = nome completo (PERFUME, UTILIDADES, ...)
    descricaoProduto, ncm, quantidade, valorUnitario, valorTotal, status,
    dataEntrada, tipoMovimentacao, logId, valorOutrosItem, tipoOutros,
    valorLiquidoItem, valorUnitarioLiquido, emitenteNome, dataCompra, observacoes,
    precoSugeridoShopee,                  // preço sugerido Shopee do catálogo (0 se sem preço)
    precoSugeridoMercadoLivre             // preço sugerido Mercado Livre do catálogo (0 se sem preço)
  }
  ```
- **Subtotais na view (client-side, sobre o filtro ativo):**
  - Total = soma de quantidade
  - Disponivel = soma de quantidade com status='Recebido'
  - Vendido = soma de quantidade com status='Desconsiderar'
  - Alertas = nº de itens sem preço sugerido no catálogo (ambos preços = 0)
  - Custo Total = soma de valorLiquidoItem
  - Preco Shopee = soma de quantidade × precoSugeridoShopee
  - Preco ML = soma de quantidade × precoSugeridoMercadoLivre
- **Filtros por coluna:** Código, Categoria, Descrição, Fornecedor, NCM e STATUS (combináveis).

### `manualEntrada.validateEntry`
- **Descrição:** Valida dados antes de inserir (sem efetivamente inserir)
- **Params:** Mesmos de `addEntry`
- **Retorno:**
  ```javascript
  {
    valid: boolean,
    warnings: [string],  // ex. "Produto não encontrado em NFE_ENTRADA_PRODUTOS"
    errors: [string]     // ex. "Quantidade inválida"
  }
  ```

### `manualEntrada.getSupplierHistory`
- **Descrição:** Retorna histórico de fornecedores já usados (autocomplete)
- **Params:** Nenhum
- **Retorno:** Array de strings com nomes de fornecedores únicos ordenados alfabeticamente

---

## Formato da Aba MANUAL_ENTRADA_PRODUTOS

Colunas (ordem idêntica a NFE_ENTRADA_PRODUTOS, exceto removidas NUMERO_NF, CHAVE_NF, DATA_EMISSAO, EMITENTE_CNPJ e adicionadas campos manuais):

```
CODIGO_PRODUTO | DESCRICAO_PRODUTO | NCM | CFOP | QUANTIDADE | VALOR_UNITARIO | VALOR_TOTAL | 
ALIQUOTA_ICMS | VALOR_ICMS_ITEM | STATUS | DATA_ENTRADA | TIPO_MOVIMENTACAO | LOG_ID | 
VALOR_DESCONTO_ITEM | TIPO_DESCONTO | VALOR_OUTROS_ITEM | TIPO_OUTROS | 
VALOR_LIQUIDO_ITEM | VALOR_UNITARIO_LIQUIDO | EMITENTE_NOME | DATA_COMPRA | OBSERVACOES
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| CODIGO_PRODUTO | string | Código único do produto (ex: "0000000006231") |
| DESCRICAO_PRODUTO | string | Nome/descrição (ex: "Maison Delilah") |
| NCM | string | Código NCM (opcional) |
| CFOP | string | Código CFOP (opcional) |
| QUANTIDADE | number | Quantidade recebida (ex: 5) |
| VALOR_UNITARIO | number | Preço unitário comprado (2 casas decimais) |
| VALOR_TOTAL | number | QUANTIDADE × VALOR_UNITARIO |
| ALIQUOTA_ICMS | number | Taxa ICMS (default 0.18) |
| VALOR_ICMS_ITEM | number | VALOR_TOTAL × ALIQUOTA_ICMS (2 casas decimais) |
| STATUS | string | Sempre "Recebido" |
| DATA_ENTRADA | ISO 8601 | Timestamp quando registrado no sistema |
| TIPO_MOVIMENTACAO | string | Sempre "Entrada Manual" |
| LOG_ID | string | Timestamp + nonce para rastreabilidade |
| VALOR_DESCONTO_ITEM | number | Sempre 0 (sem desconto em entrada manual) |
| TIPO_DESCONTO | string | Sempre "NENHUM" |
| VALOR_OUTROS_ITEM | number | Despesas acessórias (frete, embalagem, etc.) — informado pelo usuário |
| TIPO_OUTROS | string | "ITEM" se VALOR_OUTROS_ITEM > 0, senão "NENHUM" |
| VALOR_LIQUIDO_ITEM | number | VALOR_TOTAL + VALOR_OUTROS_ITEM (custo real da compra) |
| VALOR_UNITARIO_LIQUIDO | number | VALOR_LIQUIDO_ITEM / QUANTIDADE |
| EMITENTE_NOME | string | Fornecedor / origem (campo texto livre) |
| DATA_COMPRA | DD/MM/YYYY | Data informada pelo usuário (default: hoje) |
| OBSERVACOES | string | Notas livres do usuário |

---

## Regras de Negócio

1. **Status imutável:** Todos os produtos entram com STATUS="Recebido" (presume-se já entregues no ato do registro).

2. **Sem desconto:** VALOR_DESCONTO_ITEM sempre = 0 e TIPO_DESCONTO = "NENHUM".
   Motivo: usuário informa preço já com desconto aplicado, se houver.

3. **Despesas acessórias opcionais:** Campo VALOR_OUTROS_ITEM (em R$) para frete, embalagem, etc.
   Se > 0, TIPO_OUTROS = "ITEM"; se = 0, TIPO_OUTROS = "NENHUM".

4. **Fornecedor customizável:** EMITENTE_NOME é campo texto livre (não vinculado a picklist).
   Histórico de fornecedores usados fica disponível via `manualEntrada.getSupplierHistory()` para autocomplete.

5. **Cálculo de custo real:**
   ```
   VALOR_TOTAL = QUANTIDADE × VALOR_UNITARIO
   VALOR_ICMS_ITEM = VALOR_TOTAL × ALIQUOTA_ICMS
   VALOR_LIQUIDO_ITEM = VALOR_TOTAL + VALOR_OUTROS_ITEM
   VALOR_UNITARIO_LIQUIDO = VALOR_LIQUIDO_ITEM / QUANTIDADE
   ```
   (Arredondar sempre para 2 casas decimais)

6. **Rastreabilidade:** LOG_ID = timestamp + nonce (ex: "20260803T120500-abc123") para auditar quando foi registrado.

7. **Integração com Catálogo:**
   - CatalogService.getProducts() deve ler TANTO NFE_ENTRADA_PRODUTOS QUANTO MANUAL_ENTRADA_PRODUTOS
   - Ambas contribuem para estoque agregado
   - Entrada manual marcada com TIPO_MOVIMENTACAO="Entrada Manual" para auditoria

8. **Produto customizável:** Não é obrigado que o produto já exista em NFE_ENTRADA_PRODUTOS.
   Usuário pode criar entrada manual de um produto novo que ainda não recebeu por NF.
   Warning se produto não encontrado em NFE_ENTRADA_PRODUTOS (informativo, não bloqueante).

---

## Casos de Borda

- **Quantidade zero:** Aceitar (pode representar ajuste/devolução). Registrar normalmente.
- **Preço zero:** Aceitar (doação, amostra). Registrar normalmente.
- **Despesas acessórias zero:** Padrão; TIPO_OUTROS = "NENHUM".
- **Despesas acessórias > valor do produto:** Aceitar (frete caro, etc.). Custo final = total + frete.
- **Produto não encontrado em NFE_ENTRADA_PRODUTOS:** Warning no UI, mas permite registrar (novo fornecedor, novo produto).
- **Data de compra no futuro:** Aceitar (ajuste retroativo futuro, planejamento).
- **Fornecedor em branco:** Rejeitar — campo obrigatório.
- **ALIQUOTA_ICMS fora de 0–1:** Rejeitar com erro explícito ("Alíquota deve estar entre 0% e 100%").
- **Entrada duplicada (mesmo produto + data + fornecedor + quantidade):** Permitir (pode ser intencional), mas log warning.

---

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Adicionar entrada manual de um produto simples
```
Given: Usuário abre modal de entrada manual
When: Preenche:
  - Produto: "Maison Delilah" (cód 0000000006231)
  - Quantidade: 3
  - Valor Unitário: R$100
  - Fornecedor: "Supplier XYZ"
  - Data: 03/08/2026
  - Despesas: R$0
  E clica "Confirmar"
Then:
  - Retorna {success: true, entryId: "..."}
  - Aba MANUAL_ENTRADA_PRODUTOS contém 1 linha nova
  - CODIGO_PRODUTO="0000000006231", DESCRICAO_PRODUTO="Maison Delilah"
  - QUANTIDADE=3, VALOR_UNITARIO=100, VALOR_TOTAL=300
  - VALOR_ICMS_ITEM=54 (300×0.18)
  - VALOR_LIQUIDO_ITEM=300 (300+0)
  - VALOR_UNITARIO_LIQUIDO=100
  - STATUS="Recebido", TIPO_MOVIMENTACAO="Entrada Manual"
  - EMITENTE_NOME="Supplier XYZ", DATA_COMPRA="03/08/2026"
```

### Scenario 2: Entrada com despesas acessórias
```
Given: Entrada manual com frete
When: Preenche:
  - Produto: "Ameerat" (cód XXX)
  - Quantidade: 2
  - Valor Unitário: R$50
  - Fornecedor: "Fornecedor ABC"
  - Despesas: R$20 (frete)
Then:
  - VALOR_TOTAL=100 (2×50)
  - VALOR_LIQUIDO_ITEM=120 (100+20)
  - VALOR_UNITARIO_LIQUIDO=60 (120/2) — custo real do unitário
  - TIPO_OUTROS="ITEM"
```

### Scenario 3: Produto novo (não existe em NFE_ENTRADA_PRODUTOS)
```
Given: Usuário tenta registrar produto "Novo Fornecedor XYZ" que não está em NFE_ENTRADA_PRODUTOS
When: Preenche dados normalmente e clica "Confirmar"
Then:
  - {success: true, warnings: ["Produto não encontrado em NFE_ENTRADA_PRODUTOS"]}
  - Linha é registrada mesmo assim
  - Produto fica disponível no Catálogo com TIPO_MOVIMENTACAO="Entrada Manual"
```

### Scenario 4: Listar entradas manuais de um produto
```
Given: 3 entradas manuais de "Maison Delilah" (03/08, 04/08, 06/08)
When: `manualEntrada.listEntries({codigoProduto: "0000000006231"})`
Then:
  - Retorna array com 3 objetos
  - Cada um tem campos corretos (codigo, quantidade, valor, fornecedor, data)
```

### Scenario 5: Validação antes de inserir
```
Given: Usuário digita quantidade=0 e valor=-50
When: `manualEntrada.validateEntry({quantidade: 0, valorUnitario: -50, ...})`
Then:
  - {valid: false, errors: ["Quantidade must be > 0", "valorUnitario must be >= 0"]}
  - Modal mantém dados preenchidos e exibe erros em vermelho
```

### Scenario 6: Histórico de fornecedores (autocomplete)
```
Given: Usuário já registrou entradas com fornecedores "Supplier ABC", "Supplier XYZ"
When: `manualEntrada.getSupplierHistory()`
Then:
  - Retorna ["Supplier ABC", "Supplier XYZ"] (ordenado alfabeticamente)
  - Campo de fornecedor mostra dropdown com sugestões ao digitar
```

---

## Fora de Escopo (v1)

- Edição de entrada manual já registrada (apenas inserção)
- Deleção de entrada manual (rastreabilidade)
- Importação em lote (CSV, Excel)
- Integração com Bling/fornecedores (entrada manual é só registro local)
- Alertas de duplicação automática
- Validação contra catálogo de fornecedores (free text field)

---

## Dependências

### Services
- `CatalogService` — deve ler também MANUAL_ENTRADA_PRODUTOS no agregado getProducts()
- `FormatterService` — formatar datas DD/MM/YYYY e valores com 2 casas decimais

### Repositories
- `NFeEntradaProdutosRepository` — ler lista de códigos/descrições para validação
- `ManualEntradaProdutosRepository` (novo) — escrever/ler aba MANUAL_ENTRADA_PRODUTOS

### Google Apps Script
- `SpreadsheetApp` — acesso à aba

---

## Notas de Implementação

### Estrutura de arquivos
```
src/03_services/manualEntrada/
├── ManualEntradaService.js      # Lógica de negócio (validação, cálculos)
└── ManualEntradaRepository.js   # I/O com Google Sheets

ui/manualEntrada/
└── ManualEntradaView.html       # Web Component (modal/drawer)
```

### Inicialização da aba
Criar automaticamente em `appsscript.json` ou em `ConfigService.initializeSheets()`:
```javascript
function initializeSheets() {
  var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
  var sheet = ss.getSheetByName('MANUAL_ENTRADA_PRODUTOS');
  if (!sheet) {
    sheet = ss.insertSheet('MANUAL_ENTRADA_PRODUTOS');
    sheet.appendRow([
      'CODIGO_PRODUTO', 'DESCRICAO_PRODUTO', 'NCM', 'CFOP', 'QUANTIDADE',
      'VALOR_UNITARIO', 'VALOR_TOTAL', 'ALIQUOTA_ICMS', 'VALOR_ICMS_ITEM',
      'STATUS', 'DATA_ENTRADA', 'TIPO_MOVIMENTACAO', 'LOG_ID',
      'VALOR_DESCONTO_ITEM', 'TIPO_DESCONTO', 'VALOR_OUTROS_ITEM', 'TIPO_OUTROS',
      'VALOR_LIQUIDO_ITEM', 'VALOR_UNITARIO_LIQUIDO', 'EMITENTE_NOME', 'DATA_COMPRA', 'OBSERVACOES'
    ]);
  }
}
```

### Cálculo de VALOR_ICMS_ITEM
```javascript
function calcularValorIcmsItem(valorTotal, aliquotaIcms) {
  var icms = parseFloat(valorTotal) * parseFloat(aliquotaIcms);
  return Math.round(icms * 100) / 100; // 2 casas decimais
}
```

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
var ServiceRegistry = (function () {
  var services = {
    // ...
    manualEntrada: safeRef_('manualEntrada', function () {
      return typeof ManualEntradaService !== 'undefined' ? ManualEntradaService : undefined;
    })
  };
  // ...
})();
```

### Integração com CatalogService
Refatorar `catalog.getProducts()` para unir:
```javascript
function getProducts(filter) {
  var produtosNf = NFeEntradaProdutosRepository.getRows(...);
  var produtosManual = ManualEntradaProdutosRepository.getRows(...);
  var todos = produtosNf.concat(produtosManual);
  // agregar por codigo, usar entrada mais recente (DATA_EMISSAO ou DATA_ENTRADA)
  return agregaePorCodigo(todos);
}
```

---

## Teste de Aceitação

No browser:
- Modal de entrada manual aparece (botão em Shell.html) ✅
- Picklist de fornecedores exibe histórico ao digitar ✅
- Validação em tempo real (campos em vermelho se inválidos) ✅
- Confirmar → registro em MANUAL_ENTRADA_PRODUTOS ✅
- Cálculos corretos (todos os 6 scenarios Given/When/Then passam) ✅
- Catálogo mostra produtos de entrada manual junto com NF ✅
- Despesas acessórias refletem no custo unitário líquido ✅
