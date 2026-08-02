# Spec: Sistema de Logging (Auditoria e Debug)

## Status
Approved

## Objetivo
Registrar todas as ações executadas no Web App, Editor GAS e Google Sheets em uma
aba centralizada `LOGS` do Google Sheets. Cada log captura: timestamp, serviço,
ação, status, resumo, detalhes completos (context), tempo de execução e erro (se houver).
Resolve o problema de debug: quando algo falha, ir direto na aba LOGS e encontrar
o que aconteceu, com total de contexto.

## Contrato da API Interna

### `logging.log`
- **Descrição:** Registra um evento (sucesso ou erro) na aba LOGS.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | service | string | sim | — | Nome do serviço (ex: "pricing", "nfeEntrada", "dashboard") |
  | action | string | sim | — | Ação específica (ex: "calculateSuggestedPrice", "syncFromDrive") |
  | status | string | sim | — | "success", "error", "warning", "info" |
  | summary | string | sim | — | Resumo legível (ex: "Preço sugerido calculado: R$ 199.90") |
  | context | object | não | {} | Dados completos (params, result, stack trace) — será JSON stringificado |
  | durationMs | number | não | 0 | Tempo de execução em ms |
  | errorMessage | string | não | — | Se status="error", mensagem do erro |
  | caller | string | não | "automatic" | "WebApp" (google.script.run), "GASEditor" (direto), "GoogleSheets" (trigger) |
  | environment | string | não | "prod" | "dev" ou "prod" |
- **Retorno:**
  ```javascript
  {
    success: boolean,     // true se log foi escrito
    logId: string,        // ID da linha (timestamp_nonce)
    message: string       // "Log recorded" ou erro
  }
  ```
- **Erros esperados:**
  - `Sheet ID not configured` — SHEETS_ID_NFEENTRADA não setada
  - `LOGS sheet not found` — aba LOGS não existe
  - `Context too large` — JSON > 50KB (truncar)

### `logging.queryLogs`
- **Descrição:** Busca logs com filtros (serviço, status, data range, texto).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | filters | object | não | {} | {service, status, startDate, endDate, searchText} |
  | limit | number | não | 100 | Máximo de linhas a retornar |
- **Retorno:** Array de logs (últimas N linhas, ordenado por UPDATED_AT DESC)
- **Erros esperados:** Nenhum (retorna [] se nenhum log encontrado).

### `logging.clearOldLogs`
- **Descrição:** Limpa logs com mais de X dias (housekeeping automático).
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | olderThanDays | number | não | 90 | Deletar logs mais antigos que X dias |
- **Retorno:** `{success: boolean, deletedCount: number}`
- **Notas:** Pode ser chamado por trigger automático (ex: uma vez por dia).

## Regras de Negócio

### Colunas da aba LOGS (ordem fixa)
1. **UPDATED_AT** — timestamp ISO 8601 (ex: "2026-08-02T15:30:45.123Z")
2. **SERVICE** — nome do serviço (pricing, dashboard, orders, listings, nfeEntrada, inventoryPricing, logging)
3. **ACTION** — ação específica dentro do serviço (ex: calculateSuggestedPrice, syncFromDrive)
4. **STATUS** — "success", "error", "warning", "info"
5. **CALLER** — "WebApp" (google.script.run), "GASEditor" (direto), "GoogleSheets" (trigger), "automatic"
6. **SUMMARY** — resumo human-readable (máx 200 caracteres, sem quebras de linha)
7. **DURATION_MS** — tempo de execução em ms (número inteiro)
8. **ERROR_MESSAGE** — se status="error", mensagem do erro (máx 500 caracteres, null se success)
9. **CONTEXT** — JSON stringificado com params, result, stack trace completo (máx 50KB, truncar se > 50KB)
10. **ENVIRONMENT** — "dev" ou "prod"
11. **LOG_ID** — ID único (timestamp + nonce, ex: "2026080215304512a3b4c")

### Regras de logging

1. **Quem loga:** Cada serviço (pricing, dashboard, etc) DEVE chamar `logging.log()` em seus
   métodos principais, após conclusão ou erro.

2. **O que logar:**
   - Sucesso: chamar com status="success", resumo breve, context = {input, output}
   - Erro: chamar com status="error", errorMessage = exception.message, context = {input, stack}
   - Aviso (opcional): status="warning" para situações previstas mas incomuns

3. **Contexto (máximo detalhe):**
   ```javascript
   context: {
     input: {
       // Todos os params recebidos pelo método
       unitCost: 100,
       targetMarginPct: 0.25,
       marketplace: "shopee"
     },
     output: {
       // Resultado completo (não sumariado)
       suggestedPrice: 199.90,
       netProfit: 44.95,
       statusNfe: "Autorizado"
     },
     stack: undefined  // Se error, exception.stack completa
   }
   ```

4. **Formato de SUMMARY:**
   - "Preço sugerido calculado: R$ 199.90 (Shopee)"
   - "NFe 731 sincronizada com sucesso (3 produtos)"
   - "Erro ao ler pasta Drive: ID inválido"
   - Sempre presente tense, máx 200 chars, sem quebras de linha

5. **Retenção:** Logs mantidos por 90 dias, depois deletados automaticamente
   (clearOldLogs chamado por trigger diário).

6. **Limite de tamanho:** Se context > 50KB, truncar com aviso:
   `context: {...truncated, truncatedAt: "50000 bytes"}`

7. **Performance:** Logging é assíncrono (não bloqueia a ação principal). Se falhar
   a escrita do log, log the failure em console.error() mas nunca faça a ação principal
   falhar por causa de erro de logging.

## Casos de Borda

- **Aba LOGS não existe:** LoggingService.init() cria automaticamente (cabeçalho + formatação)
- **Script Properties não setado:** logging.log() retorna erro mas não joga exception (falha silenciosa no log, ação continua)
- **Context é circular/não-serializável:** JSON.stringify com replacer customizado, substituir [Circular] por string
- **Muitos logs em pouco tempo:** Sem limite, escrever todos (Sheet suporta ~1M linhas)
- **Query com data range inválida:** Retornar [] (sem erro)
- **UPDATED_AT duplicado em mesma ação:** Usar nonce (timestamp + random suffix) para garantir unicidade

## Critérios de Aceite (Given/When/Then)

### Scenario 1: Log de sucesso de função
```
Given: pricing.calculateSuggestedPrice é chamado com unitCost=100, targetMarginPct=0.25
When: Função retorna suggestedPrice=199.90
Then:
  - Aba LOGS contém 1 nova linha
  - UPDATED_AT ≈ agora (ISO 8601)
  - SERVICE = "pricing"
  - ACTION = "calculateSuggestedPrice"
  - STATUS = "success"
  - SUMMARY = "Preço sugerido calculado: R$ 199.90 (Shopee)"
  - CONTEXT = JSON com {input: {unitCost: 100, ...}, output: {suggestedPrice: 199.90, ...}}
  - DURATION_MS = tempo real em ms
  - ERROR_MESSAGE = null
  - CALLER = "WebApp" (ou outra origem)
```

### Scenario 2: Log de erro
```
Given: nfeEntrada.syncFromDrive chamado com driveFolder ID inválido
When: DriveAdapter lança exceção "Folder not found"
Then:
  - Aba LOGS contém 1 nova linha
  - STATUS = "error"
  - SUMMARY = "Erro ao sincronizar NFe: Pasta Drive não encontrada"
  - ERROR_MESSAGE = "Folder not found"
  - CONTEXT = {input: {driveFolder: "invalid_id"}, stack: "DriveApp.getFolderById... Error..."}
  - Ação falha normalmente (erro é propagado)
```

### Scenario 3: Query com filtros
```
Given: Aba LOGS tem 100+ linhas com múltiplos serviços e statuses
When: logging.queryLogs({service: "nfeEntrada", status: "error", limit: 20})
Then:
  - Retorna array com até 20 logs
  - Todos os logs têm SERVICE="nfeEntrada" E STATUS="error"
  - Ordenados por UPDATED_AT DESC (mais recente primeiro)
  - Cada log tem todos os 11 campos
```

### Scenario 4: Limpeza automática
```
Given: Aba LOGS tem logs com 100 dias de idade + logs recentes
When: logging.clearOldLogs({olderThanDays: 90}) é chamado (trigger diário)
Then:
  - Linhas com UPDATED_AT > 90 dias atrás são deletadas
  - Linhas recentes mantidas
  - Retorna {success: true, deletedCount: N}
```

### Scenario 5: Context muito grande
```
Given: pricing.calculateSuggestedPrice recebe array com 10k produtos (context > 50KB)
When: logging.log() é chamado com esse context
Then:
  - CONTEXT é truncado pra 50KB
  - Campo CONTEXT contém "...truncated, truncatedAt: 50000 bytes"
  - Log escrito sem erro
```

## Fora de Escopo

- Exportar logs pra CSV/email (ler diretamente do Sheets se necessário)
- Dashboard de análise de logs (futura feature, por enquanto aba bruta)
- Criptografia de logs sensíveis (por enquanto texto claro)
- Replicação de logs em backup externo
- Alertas em tempo real por erro (implementado depois se necessário)

## Dependências

### Services internos
- `ConfigService.getSheetId()` — saber qual Sheets usar
- `SheetsRepository` (ou novo `LoggingRepository`) — escrita/leitura em Sheets

### Adapters
- `SpreadsheetApp` (nativo Apps Script) — acessar aba LOGS

### Trigger (opcional, recomendado)
- Trigger horário: chamar `logging.clearOldLogs()` uma vez por dia (ex: 2am UTC)

## Notas de Implementação

### Inicialização
```javascript
// LoggingService.init() — criar aba LOGS na primeira execução
// Cabeçalho: UPDATED_AT | SERVICE | ACTION | STATUS | CALLER | SUMMARY | DURATION_MS | ERROR_MESSAGE | CONTEXT | ENVIRONMENT | LOG_ID
// Formatação: header em negrito, colunas congeladas, alternância de cores
```

### Integração em cada serviço
Cada serviço deve registrar sua execução. Exemplo:

```javascript
function calculateSuggestedPrice(params) {
  var startTime = new Date().getTime();
  try {
    // ... lógica ...
    var result = {suggestedPrice: 199.90, ...};
    
    LoggingService.log({
      service: 'pricing',
      action: 'calculateSuggestedPrice',
      status: 'success',
      summary: 'Preço sugerido calculado: R$ ' + result.suggestedPrice,
      context: {input: params, output: result},
      durationMs: new Date().getTime() - startTime,
      caller: 'automatic'
    });
    
    return result;
  } catch (error) {
    LoggingService.log({
      service: 'pricing',
      action: 'calculateSuggestedPrice',
      status: 'error',
      summary: 'Erro ao calcular preço: ' + error.message,
      context: {input: params, stack: error.stack},
      errorMessage: error.message,
      durationMs: new Date().getTime() - startTime,
      caller: 'automatic'
    });
    throw error;
  }
}
```

### JSON.stringify com replacer para circular references
```javascript
function stringifyContext(obj) {
  var seen = new WeakSet();
  return JSON.stringify(obj, function(key, value) {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}
```

### Truncamento de context grande
```javascript
function truncateContext(contextStr, maxBytes = 50000) {
  if (contextStr.length > maxBytes) {
    return contextStr.substring(0, maxBytes) + '...truncated at ' + maxBytes + ' bytes';
  }
  return contextStr;
}
```
