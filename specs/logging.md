# Spec: Logging System

## Status
Approved

## Objetivo
Sistema de logging centralizado que registra todas as ações dos serviços na aba
`LOGS` do Google Sheets, facilitando debug e auditoria. Logging é assíncrono
e nunca bloqueia a ação principal.

## Contrato da API Interna

### `logging.log`
- **Descrição:** Registra uma entrada de log na aba LOGS.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | service | string | sim | — | Nome do serviço (ex: 'nfeEntrada') |
  | action | string | sim | — | Nome da ação (ex: 'syncAndUpdateSheets') |
  | status | string | sim | — | 'OK' ou 'ERROR' |
  | caller | string | não | 'system' | Quem chamou (ex: 'webapp', 'trigger', 'manual') |
  | summary | string | não | '' | Resumo legível da ação |
  | durationMs | number | não | 0 | Duração em milissegundos |
  | errorMessage | string | não | '' | Mensagem de erro (se status=ERROR) |
  | context | object | não | {} | Contexto adicional (JSON stringificado, máx 50KB) |
- **Retorno:** `{ success: true, logId: string }`
- **Erros:** Nunca lança exceção. Se falhar a escrita, loga em console.error().

### `logging.init`
- **Descrição:** Cria a aba LOGS com headers e formatação. Idempotente.
- **Params:** Nenhum
- **Retorno:** `{ success: true, sheetId: string }`

### `logging.getLogs`
- **Descrição:** Retorna logs filtrados.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | service | string | não | — | Filtrar por serviço |
  | status | string | não | — | Filtrar por status |
  | limit | number | não | 50 | Limite de resultados |
- **Retorno:** `{ logs: Array }`

### `logging.clearOldLogs`
- **Descrição:** Remove logs com mais de 90 dias.
- **Params:** Nenhum
- **Retorno:** `{ deleted: number }`

## Formato da Aba LOGS

Colunas (ordem fixa):
```
UPDATED_AT | SERVICE | ACTION | STATUS | CALLER | SUMMARY | DURATION_MS | ERROR_MESSAGE | CONTEXT | ENVIRONMENT | LOG_ID
```

- **UPDATED_AT:** ISO 8601 timestamp
- **SERVICE:** Nome do serviço
- **ACTION:** Nome da ação
- **STATUS:** 'OK' ou 'ERROR'
- **CALLER:** 'webapp', 'trigger', 'manual'
- **SUMMARY:** Resumo legível
- **DURATION_MS:** Duração em ms
- **ERROR_MESSAGE:** Mensagem de erro (vazio se OK)
- **CONTEXT:** JSON stringificado (máx 50KB, truncar se > 50KB)
- **ENVIRONMENT:** 'dev' ou 'prod'
- **LOG_ID:** Timestamp + nonce (único)

## Regras de Negócio

1. **Logging assíncrono:** Nunca bloqueia a ação principal. Se falhar a
   escrita do log, loga em console.error() mas continua.
2. **LOG_ID único:** Formato `YYYYMMDDHHMMSS-<nonce>` (nonce = random hex 8 chars).
3. **Context truncation:** Se context > 50KB, truncar e adicionar
   `{"_truncated": true}` no final.
4. **Cleanup automático:** Trigger diário remove logs > 90 dias.
5. **Init idempotente:** Se aba LOGS já existe, não recria.

## Critérios de Aceite

### Scenario 1: Log de ação bem-sucedida
```
Given: Serviço qualquer executa ação
When: LoggingService.log({service: 'test', action: 'doStuff', status: 'OK'})
Then:
  - Retorna {success: true, logId: "YYYYMMDDHHMMSS-xxxxxxxx"}
  - Aba LOGS contém 1 linha com SERVICE='test', STATUS='OK'
```

### Scenario 2: Log de erro
```
Given: Serviço falha
When: LoggingService.log({service: 'test', action: 'fail', status: 'ERROR', errorMessage: 'oops'})
Then:
  - Aba LOGS contém linha com STATUS='ERROR', ERROR_MESSAGE='oops'
```

### Scenario 3: Init idempotente
```
Given: Aba LOGS não existe
When: LoggingService.init()
Then: Aba LOGS criada com headers e formatação

Given: Aba LOGS já existe
When: LoggingService.init()
Then: Aba não é recriada (idempotente)
```

### Scenario 4: Clear old logs
```
Given: Aba LOGS com logs de 100 dias atrás
When: LoggingService.clearOldLogs()
Then: Logs > 90 dias removidos,返回 {deleted: N}
```

### Scenario 5: Context truncation
```
Given: Context com 60KB de dados
When: LoggingService.log({context: hugeObject})
Then: CONTEXT na aba contém JSON truncado com {_truncated: true}
```

## Fora de Escopo

- Dashboard de logs em tempo real
- Alertas por email/slack
- Logs de audit trail para compliance
- Log rotation por tamanho (apenas por tempo)

## Dependências

### Services
- `ConfigService.getSheetId()` — ID da planilha

### Repositories
- `LoggingRepository` — escrita/leitura na aba LOGS

### Google Apps Script
- `SpreadsheetApp` — acesso à planilha
- `Utilities` — geração de nonce
