# Spec: Audit de Operações de Escrita (Write Audit)

## Status
Implemented

## Objetivo
Criar trilha de auditoria de **todas as operações de escrita** nas planilhas
dos repositórios de domínio (abas ESTOQUE, ANUNCIOS_SHOPEE, NFE_ENTRADA, etc.).
Hoje cada repository decidirá isoladamente se registra o que mudou, quando e com
que resultado — o comportamento é inconsistente e sem rastreio histórico de
gravações. O Write Audit grava uma entrada de log para cada operação de escrita,
com o que foi alterado, as contagens de linhas, o resultado e o chamador —
independe de serviço. Serve para debug, recuperação e como evidência
de que uma gravação ocorreu e terminou.

**Decisão (2026-08):** a aba `AUDIT_LOG` foi **excluída**. Todo log de escrita
agora vai para a aba `LOGS` (mesma estrutura de `LoggingService`), e
`SheetsRepository.logWriteAudit` virou um **adapter de compatibilidade** que
delega para `LoggingService.log` — os callers antigos continuam funcionando sem
mudança de assinatura.

## Contrato da API Interna

### `SheetsRepository.logWriteAudit(params)` (adapter)
- **Descrição:** delega para `LoggingService.log` na aba `LOGS`. Não lança
  exceção — em caso de falha, apenas `console.warn`.
- **Params** (mesma assinatura legada, mantida por compatibilidade):
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |------|------|-------------|---------|-----------|
  | sheet | string | sim | — | Aba onde a escrita ocorreu (ex.: 'ESTOQUE', 'ANUNCIOS_SHOPEE') → coluna SERVICE |
  | operation | string | sim | — | 'APPEND' \| 'UPDATE' \| 'UPSERT' \| 'DELETE' \| 'TRUNCATE' \| 'CREATE_SHEET' → coluna ACTION |
  | stats | object | não | {} | `{ rows, inserted, updated, deleted }` → resumido no SUMMARY e no CONTEXT |
  | detail | string | não | '' | Texto resumido → SUMMARY |
  | caller | string | não | 'system' | Quem disparou → CALLER |
  | rowId | string | não | '' | Identificador da linha/fonte → CONTEXT |
  | status | string | não | 'OK' | 'OK' \| 'ERROR' \| 'WARN' → STATUS |
- **Retorno:** `{ success: true }` ou `{ success: false, error: string }`

### Estrutura da aba `LOGS` (fonte de verdade)
```
UPDATED_AT | SERVICE | ACTION | STATUS | CALLER | SUMMARY | DURATION_MS | ERROR_MESSAGE | CONTEXT | ENVIRONMENT | LOG_ID
```

- **LOG_ID:** `YYYYMMDDHHMMSS-<nonce8>` (gerado pelo LoggingService).
- **UPDATED_AT:** data BR `dd/MM/yyyy HH:mm:ss`.
- **CONTEXT:** JSON com `{ sheet, operation, rowId, stats }` no caso do adapter.
- Todos os serviço logs também compartilham esta aba — é a única aba de log.

## Regras de Negócio
1. **Chamado pelo repositório de dados**, nunca pelo serviço — o repositório é
   quem conhece a aba, as counts reais e o momento exato da escrita.
2. **Disparado após a operação principal**, nunca antes. Se a operação
   principal falhar, registra `status: 'ERROR'` com a mensagem em `detail`.
3. **Nunca bloqueia:** falha da própria auditoria vira `console.warn`, não
   derruba o processo usado pelo serviço. (O flush de `LoggingService` é
   assíncrono e acontece no `finally` do `ServiceRegistry.dispatch`.)
4. **Formato BR** em `UPDATED_AT` (`dd/MM/yyyy HH:mm:ss`) — regra geral do
   projeto (sem ISO).
5. **Sem granularidade por linha:** chamar uma vez por operação batch (ex.:
   um `syncMain` que grava 50 linhas = 1 log com o stats `inserted: 50`),
   nunca em loop dentro da gravação.

## Casos de Borda
- `LOGS` não existe → `LoggingService.init()` cria com cabeçalho; o flush
  (`LoggingRepository`/`SheetsRepository.getOrCreateSheet`) é robusto.
- Operação com 0 linhas alteradas → ainda grava (ou seja: executada, nada a mudar).
- Falha na planilha principal → registra `status: 'ERROR'` e o erro no `detail`; a
  escrita no log nunca derruba a operação principal.
- Volume grande (ex.: grid NFe) → uma entrada por operação/REFERENCIA, nunca por linha.

## Critérios de Aceite (Given/When/Then)
1. **Importação grande:** Dado `EstoqueRepository.syncFromNFe` importando 50 unidades,
   Quando executa, Então a aba `LOGS` recebe entrada com `SERVICE='ESTOQUE'`,
   `ACTION='SYNC'`, `STATUS='OK'` e CONTEXT com `stats.inserted=50`.
2. **Sem repetição:** Dado um sync que já gravou, Quando roda de novo com 0 mudanças,
   Então grava 1 nova entrada com stats zerados (nunca o mesmo LOG_ID).
3. **Falha da escrita de dados:** Quando a operação principal lança erro, a
   auditoria registra `STATUS='ERROR'` e o erro no SUMMARY, sem lançar exceção.
4. **Compatibilidade:** Quando um caller legado chama `logWriteAudit({sheet,
   operation, stats, detail, caller, rowId, status})`, Então a entrada aparece na
   aba `LOGS` (nunca em `AUDIT_LOG`, que foi removida do projeto).

## Fora de Escopo
- Tela de auditoria (apenas a leitura via `logging.getLogs`, direta no Sheets).
- Auditoria fiscal — é trilha operacional, não nota fiscal (não substitui NFe).
- Cleanup/rotação automática de `LOGS` nesta spec (ver `logging.md` — retenção de 90 dias).
- Audit de leituras (`getRows`, `getItem`, etc.).

## Dependências
- **Services/Adapters:**
  - `LoggingService.log` — gravação na aba LOGS
  - `ConfigService.getSheetId()` — planilha âncora
- **Google Apps Script:**
  - `SpreadsheetApp` — acesso às abas
  - `Utilities` (formatDate) e `Session.getScriptTimeZone()` — data BR

## Notas de Implementação
1. `SheetsRepository.logWriteAudit` é um adapter fino para `LoggingService.log`
   — mantém o nome e a assinatura legada para não quebrar os ~38 callers.
2. Constantes `AUDIT_SHEET`/`AUDIT_HEADERS`/`AUDIT_DETAIL_MAX` e o helper
   `generateAuditId_` foram removidos do `SheetsRepository`.
3. A aba `AUDIT_LOG` foi excluída do spreadsheet (user decision, 2026-08-09).
4. Nenhum arquivo novo no projeto → `filePushOrder` não muda.