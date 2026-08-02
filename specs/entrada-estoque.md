# Spec: Desagregação de Produtos em Entrada de NFe (NFE_ENTRADA_PRODUTOS)

## Status
Approved

## Objetivo
Ao sincronizar uma NFe (aba NFE_ENTRADA), extrair cada produto dela e registrar
em uma aba `NFE_ENTRADA_PRODUTOS` com máximo detalhe (código, descrição, NCM, CFOP,
quantidade, valores, impostos, dados da NF para referência). Resolve o problema: ter dados agregados na NFe
mas precisar de granularidade por produto para gestão de estoque e auditoria
de custos. A aba NFE_ENTRADA_PRODUTOS é um desdobramento direto de NFE_ENTRADA,
mantendo referência aos dados da nota para auditoria cruzada entre abas.

## Contrato da API Interna

### `nfeEntradaProdutos.processarNf`
- **Descrição:** Lê uma NFe da aba NFE_ENTRADA, desagrega produtos com referência aos dados da NF, insere em NFE_ENTRADA_PRODUTOS.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | numeroNf | string | sim | — | Número da NF (ex: "731") |
  | chaveNf | string | sim | — | Chave da NF (44 dígitos) |
- **Retorno:**
  ```javascript
  {
    success: boolean,
    processedAt: string,        // ISO 8601
    productCount: number,       // quantidade de produtos inseridos
    totalQuantity: number,      // soma das quantidades
    totalValue: number,         // soma dos valores
    errors: [{productCode, reason}]
  }
  ```
- **Erros esperados:**
  - `NFe not found in NFE_ENTRADA` — numeroNf não existe
  - `Invalid PRODUTOS_JSON` — JSON malformado
  - `Duplicate products in NFE_ENTRADA_PRODUTOS` — produto já existe

### `nfeEntradaProdutos.processarTodasNfs`
- **Descrição:** Processa TODAS as NFes não-processadas da aba NFE_ENTRADA.
- **Params:** Nenhum
- **Retorno:**
  ```javascript
  {
    success: boolean,
    totalNfProcessed: number,
    totalProductsInserted: number,
    errors: [{numeroNf, reason}]
  }
  ```

### `nfeEntradaProdutos.getEstoque`
- **Descrição:** Retorna estoque atual (soma de quantidades por produto) com referência às NFes de origem.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código (se omitir, retorna tudo) |
- **Retorno:** Array de {codigoProduto, descricao, quantidadeTotal, ultimaEntrada, ultimaNfOrigemNumero}

## Formato da Aba NFE_ENTRADA_PRODUTOS

Colunas (ordem fixa) — mantém referência completa aos dados da NFe para auditoria cruzada:
```
NUMERO_NF | CHAVE_NF | DATA_EMISSAO | EMITENTE_CNPJ | EMITENTE_NOME | CODIGO_PRODUTO | DESCRICAO_PRODUTO | NCM | CFOP | QUANTIDADE | VALOR_UNITARIO | VALOR_TOTAL | ALIQUOTA_ICMS | VALOR_ICMS_ITEM | STATUS | DATA_ENTRADA | TIPO_MOVIMENTACAO | LOG_ID
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| NUMERO_NF | string | Número da NF (ex: "731") |
| CHAVE_NF | string | Chave da NF (44 dígitos) |
| DATA_EMISSAO | DD/MM/YYYY | Data emissão NF |
| EMITENTE_CNPJ | string | CNPJ de quem enviou |
| EMITENTE_NOME | string | Razão social do emitente |
| CODIGO_PRODUTO | string | cProd (ex: "0000000006231") |
| DESCRICAO_PRODUTO | string | xProd (ex: "Maison Delilah") |
| NCM | string | Código NCM |
| CFOP | string | Código CFOP |
| QUANTIDADE | number | qCom (quantidade recebida) |
| VALOR_UNITARIO | number | vUnCom (2 casas decimais) |
| VALOR_TOTAL | number | vProd (2 casas decimais) |
| ALIQUOTA_ICMS | number | aliquotaIcms (ex: 0.18 para 18%) |
| VALOR_ICMS_ITEM | number | vProd * aliquotaIcms (2 casas) |
| STATUS | string | "Recebido", "Pendente Conferência", "Conferido" (default "Recebido") |
| DATA_ENTRADA | ISO 8601 | Timestamp quando entrou no estoque |
| TIPO_MOVIMENTACAO | string | "Entrada por NF" (sempre) |
| LOG_ID | string | Timestamp + nonce para rastreabilidade |

## Regras de Negócio

1. **Trigger de processamento:** Ao sincronizar NFe (NFeEntradaService.syncAndUpdateSheets),
   chamar automaticamente `nfeEntradaProdutos.processarNf()` para cada NFe inserida.

2. **Desagregação:** Parsear PRODUTOS_JSON (string) como array JSON. Para cada
   produto, criar UMA LINHA na aba NFE_ENTRADA_PRODUTOS. Cada linha inclui referência
   completa aos dados da NFe (NUMERO_NF, CHAVE_NF, DATA_EMISSAO, EMITENTE_CNPJ, EMITENTE_NOME)
   para permitir auditoria cruzada entre abas NFE_ENTRADA e NFE_ENTRADA_PRODUTOS.

3. **Cálculo de VALOR_ICMS_ITEM:** 
   ```
   VALOR_ICMS_ITEM = VALOR_TOTAL * ALIQUOTA_ICMS
   ```
   Sempre com 2 casas decimais.

4. **Deduplicação de produtos:** Chave única = NUMERO_NF + CODIGO_PRODUTO.
   Se produto da mesma NF já existe em ENTRADA_ESTOQUE, não reinserir
   (skip ou update depende da configuração, default: skip com warning).

5. **Status padrão:** Todos os produtos entram com STATUS="Recebido".
   Depois, usuário pode marcar como "Conferido" manualmente.

6. **DATA_EMISSAO sempre preenchida:** Vem da aba NFE_ENTRADA.

7. **Rastreabilidade:** LOG_ID para rastrear quando foi processado.

## Casos de Borda

- **PRODUTOS_JSON vazio:** Log warning, processarNf retorna {productCount: 0}
- **JSON malformado:** Log error, skip essa NF, continuar com próxima
- **Produto com quantidade 0:** Inserir normalmente (pode ser devolução)
- **ALIQUOTA_ICMS = "0" (isenção):** VALOR_ICMS_ITEM = 0, inserir normalmente
- **NCM ou CFOP vazio:** Inserir mesmo assim (validação é responsabilidade da origem)
- **Dados da NF incompletos:** Inserir mesmo assim com dados preenchidos de NFE_ENTRADA; se NUMERO_NF ou CHAVE_NF faltarem, log error e skip (chave obrigatória)

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Processar uma NFe com 3 produtos
```
Given: NFe 731 em NFE_ENTRADA com 3 produtos (Maison Delilah, Ameerat, Seduction VIP)
When: nfeEntradaProdutos.processarNf({numeroNf: "731", chaveNf: "35260739..."})
Then:
  - Retorna {success: true, productCount: 3, totalQuantity: 5}
  - Aba NFE_ENTRADA_PRODUTOS contém 3 linhas novas
  - Cada linha inclui: NUMERO_NF="731", CHAVE_NF="35260739...", DATA_EMISSAO, EMITENTE_CNPJ, EMITENTE_NOME
  - Produto 1: CODIGO_PRODUTO="0000000006231", DESCRICAO_PRODUTO="Maison Delilah",
    QUANTIDADE=2, VALOR_TOTAL=360, VALOR_ICMS_ITEM=64.8 (360 * 0.18)
  - Produto 2: QUANTIDADE=2, VALOR_TOTAL=260, VALOR_ICMS_ITEM=46.8
  - Produto 3: QUANTIDADE=1, VALOR_TOTAL=125, VALOR_ICMS_ITEM=22.5
  - Todos com STATUS="Recebido", DATA_ENTRADA=agora, TIPO_MOVIMENTACAO="Entrada por NF"
```

### Scenario 2: Processar NFe com 44 produtos (grande volume)
```
Given: NFe 805696 em NFE_ENTRADA com 44 produtos (kit massinha, mop, potes, etc)
When: nfeEntradaProdutos.processarNf({numeroNf: "805696", chaveNf: "35260600..."})
Then:
  - Retorna {success: true, productCount: 44, totalQuantity: 164}
  - Aba NFE_ENTRADA_PRODUTOS contém 44 linhas novas
  - Cada linha inclui dados da NF (NUMERO_NF="805696", CHAVE_NF, emitente, data)
  - Cada linha com código, descrição, NCM, CFOP, quantidade, valores e ICMS corretos
  - Soma verificável: totalValue = sum(vProd) ≈ 1432.16 (valor da NF)
```

### Scenario 3: Processar todas as NFes não-processadas
```
Given: 3 NFes em NFE_ENTRADA não-processadas (731, 688, 647)
When: nfeEntradaProdutos.processarTodasNfs()
Then:
  - Retorna {success: true, totalNfProcessed: 3, totalProductsInserted: 3+9+6=18}
  - Aba NFE_ENTRADA_PRODUTOS contém 18 linhas novas
  - Cada linha rastreável até sua NF de origem via NUMERO_NF+CHAVE_NF
  - Flag em NFE_ENTRADA marca essas 3 como "processadas"
```

### Scenario 4: Consultar estoque de um produto com referência às NFs
```
Given: Múltiplos produtos "Maison Delilah" (cód 0000000006231) em NFE_ENTRADA_PRODUTOS (NFe 731, 688, X)
When: nfeEntradaProdutos.getEstoque({codigoProduto: "0000000006231"})
Then:
  - Retorna {codigoProduto: "0000000006231", descricao: "Maison Delilah",
    quantidadeTotal: 5 (2 de NFe 731 + 2 de NFe 688 + 1 de NFe X),
    ultimaEntrada: ISO timestamp da entrada mais recente,
    ultimaNfOrigemNumero: "X" (número da NF da última entrada)}
```

### Scenario 5: Produto duplicado na mesma NF (edge case)
```
Given: NFe com mesmo produto 2x (erro na origem)
When: nfeEntradaProdutos.processarNf({numeroNf: "999"})
Then:
  - Insere ambas as linhas (são OCOs diferentes, mesma NF)
  - Ambas as linhas rastreáveis via NUMERO_NF + CHAVE_NF + CODIGO_PRODUTO
  - Log warning: "Duplicate product in same NFe: numero_nf=999, codigo_XXX, qty1=2, qty2=1"
```

## Fora de Escopo

- Saída de estoque (devolução, venda, etc) — futura feature
- Rastreamento FIFO/LIFO de lotes
- Alertas de estoque mínimo
- Integração com sistema de custos (ABC)
- Histórico de movimentação por estoque

## Dependências

### Services
- `NFeEntradaService` — ler dados de NFE_ENTRADA
- `LoggingService` — logar cada processamento

### Repositories
- `NFeEntradaRepository` — ler aba NFE_ENTRADA
- `NFeEntradaProdutosRepository` (novo) — escrever aba NFE_ENTRADA_PRODUTOS

### Google Apps Script
- `SpreadsheetApp` — acesso às abas

## Notas de Implementação

### Integração com NFeEntradaService
Após `NFeEntradaService.syncAndUpdateSheets()` inserir linhas em NFE_ENTRADA,
chamar automaticamente NFeEntradaProdutosService para desagregar produtos:
```javascript
function syncAndUpdateSheets(params) {
  var syncResult = NFeEntradaService.syncFromDrive({driveFolder: params.driveFolder});
  
  // ... escreve em NFE_ENTRADA ...
  
  // Novo: processar cada NFe inserida, desagregando produtos com referência completa
  syncResult.insertedNfs.forEach(function(nf) {
    NFeEntradaProdutosService.processarNf({
      numeroNf: nf.numeroNf,
      chaveNf: nf.chaveNf
    });
  });
  
  return syncResult;
}
```

### Parsing de PRODUTOS_JSON
```javascript
function parseProdutosJson(produtosJsonString) {
  try {
    return JSON.parse(produtosJsonString);
  } catch (e) {
    throw new Error('Invalid PRODUTOS_JSON: ' + e.message);
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

### Referência de Dados da NF
Cada linha em NFE_ENTRADA_PRODUTOS inclui os 5 primeiros campos copiados de NFE_ENTRADA:
- NUMERO_NF, CHAVE_NF, DATA_EMISSAO, EMITENTE_CNPJ, EMITENTE_NOME
Estes campos permitem auditoria cruzada: dado um produto em NFE_ENTRADA_PRODUTOS,
é possível rastrear sua NFe de origem e verificar dados gerais da nota (emitente,
data, totais) sem perder o contexto. Nunca deixar estes campos vazios; se faltarem
na origem (NFE_ENTRADA), log error e skip o processamento dessa NFe.

### Flag "processada" em NFE_ENTRADA (opcional)
Adicionar coluna PROCESSADA_EM (timestamp) para rastrear quando cada NF foi
desagregada. Permite reprocessar se necessário.

### Aba ENTRADA_ESTOQUE init
Criar automaticamente se não existir (cabeçalho + formatação similar a LOGS).
