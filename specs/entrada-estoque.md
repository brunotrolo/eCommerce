# Spec: Desagregação de Produtos em Estoque (Entrada por NFe)

## Status
Approved

## Objetivo
Ao sincronizar uma NFe (aba NFE_ENTRADA), extrair cada produto dela e registrar
em uma aba `ENTRADA_ESTOQUE` com máximo detalhe (código, descrição, NCM, CFOP,
quantidade, valores, impostos). Resolve o problema: ter dados agregados na NFe
mas precisar de granularidade por produto para gestão de estoque e auditoria
de custos.

## Contrato da API Interna

### `entradaEstoque.processarNf`
- **Descrição:** Lê uma NFe da aba NFE_ENTRADA, desagrega produtos, insere em ENTRADA_ESTOQUE.
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
  - `Duplicate products in ENTRADA_ESTOQUE` — produto já existe

### `entradaEstoque.processarTodasNfs`
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

### `entradaEstoque.getEstoque`
- **Descrição:** Retorna estoque atual (soma de quantidades por produto).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | codigoProduto | string | não | — | Filtrar por código (se omitir, retorna tudo) |
- **Retorno:** Array de {codigoProduto, descricao, quantidadeTotal, ultimaEntrada}

## Formato da Aba ENTRADA_ESTOQUE

Colunas (ordem fixa):
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
   chamar automaticamente `entradaEstoque.processarNf()` para cada NFe inserida.

2. **Desagregação:** Parsear PRODUTOS_JSON (string) como array JSON. Para cada
   produto, criar UMA LINHA na aba ENTRADA_ESTOQUE.

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

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Processar uma NFe com 3 produtos
```
Given: NFe 731 em NFE_ENTRADA com 3 produtos (Maison Delilah, Ameerat, Seduction VIP)
When: entradaEstoque.processarNf({numeroNf: "731", chaveNf: "35260739..."})
Then:
  - Retorna {success: true, productCount: 3, totalQuantity: 5}
  - Aba ENTRADA_ESTOQUE contém 3 linhas novas
  - Produto 1: CODIGO_PRODUTO="0000000006231", DESCRICAO_PRODUTO="Maison Delilah",
    QUANTIDADE=2, VALOR_TOTAL=360, VALOR_ICMS_ITEM=64.8 (360 * 0.18)
  - Produto 2: QUANTIDADE=2, VALOR_TOTAL=260, VALOR_ICMS_ITEM=46.8
  - Produto 3: QUANTIDADE=1, VALOR_TOTAL=125, VALOR_ICMS_ITEM=22.5
  - Todos com STATUS="Recebido", DATA_ENTRADA=agora, TIPO_MOVIMENTACAO="Entrada por NF"
```

### Scenario 2: Processar NFe com 44 produtos (grande volume)
```
Given: NFe 805696 em NFE_ENTRADA com 44 produtos (kit massinha, mop, potes, etc)
When: entradaEstoque.processarNf({numeroNf: "805696", chaveNf: "35260600..."})
Then:
  - Retorna {success: true, productCount: 44, totalQuantity: 164}
  - Aba ENTRADA_ESTOQUE contém 44 linhas novas
  - Cada linha com código, descrição, NCM, CFOP, quantidade, valores e ICMS corretos
  - Soma verificável: totalValue = sum(vProd) ≈ 1432.16 (valor da NF)
```

### Scenario 3: Processar todas as NFes não-processadas
```
Given: 3 NFes em NFE_ENTRADA não-processadas (731, 688, 647)
When: entradaEstoque.processarTodasNfs()
Then:
  - Retorna {success: true, totalNfProcessed: 3, totalProductsInserted: 3+9+6=18}
  - Aba ENTRADA_ESTOQUE contém 18 linhas novas
  - Flag em NFE_ENTRADA marca essas 3 como "processadas"
```

### Scenario 4: Consultar estoque de um produto
```
Given: Múltiplos produtos "Maison Delilah" (cód 0000000006231) em ENTRADA_ESTOQUE
When: entradaEstoque.getEstoque({codigoProduto: "0000000006231"})
Then:
  - Retorna {codigoProduto: "0000000006231", descricao: "Maison Delilah",
    quantidadeTotal: 5 (2 de NFe 731 + 2 de NFe 688 + 1 de NFe X),
    ultimaEntrada: ISO timestamp da entrada mais recente}
```

### Scenario 5: Produto duplicado na mesma NF (edge case)
```
Given: NFe com mesmo produto 2x (erro na origem)
When: entradaEstoque.processarNf({numeroNf: "999"})
Then:
  - Insere ambas as linhas (são OCOs diferentes, mesma NF)
  - Ou: configuração define se soma ou cria 2 linhas
  - Log warning: "Duplicate product in same NFe: codigo_XXX, qty1=2, qty2=1"
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
- `EntradaEstoqueRepository` (novo) — escrever aba ENTRADA_ESTOQUE

### Google Apps Script
- `SpreadsheetApp` — acesso às abas

## Notas de Implementação

### Integração com NFeEntradaService
Após `NFeEntradaService.syncAndUpdateSheets()` inserir linhas em NFE_ENTRADA,
chamar automaticamente:
```javascript
function syncAndUpdateSheets(params) {
  var syncResult = NFeEntradaService.syncFromDrive({driveFolder: params.driveFolder});
  
  // ... escreve em NFE_ENTRADA ...
  
  // Novo: processar cada NFe inserida
  syncResult.insertedNfs.forEach(function(nf) {
    EntradaEstoqueService.processarNf({
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

### Flag "processada" em NFE_ENTRADA (opcional)
Adicionar coluna PROCESSADA_EM (timestamp) para rastrear quando cada NF foi
desagregada. Permite reprocessar se necessário.

### Aba ENTRADA_ESTOQUE init
Criar automaticamente se não existir (cabeçalho + formatação similar a LOGS).
