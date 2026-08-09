# Spec: Logging (flush agrupado)

## Status
Implemented

## Objetivo
Reduzir o custo de I/O do logging no boot do app. Hoje `ServiceRegistry.dispatch`
chama `LoggingService.flushLogs()` no `finally` de **cada** ação — no preload
do Shell (14 dispatches paralelos, executados numa única execução GAS via
batching do `google.script.run`), isso vira 14 `setValues` de 1 linha na aba
LOGS, dobrando o custo do boot. O objetivo é gravar as entradas de uma rajada
de dispatches em **um único `setValues`**, sem perder logs e sem quebrar a
semântica atual (flush ao fim de execução).

## Contrato da API Interna

### `logging.flushLogs`
- Descrição: drena o buffer de logs pendentes na planilha.
- Params (opcional):
  | nome | tipo | obrigatório | default | descrição |
  |---|---|---|---|---|
  | `force` | boolean | não | `false` | `true` = gravar imediatamente tudo (buffer + pendências), 1 `setValues` |
- Retorno: nada (side-effect; erros silenciosos como hoje).

## Regras de Negócio

1. `log()` / `logAction()` continuam apenas **bufferizando** (memória da
   execução), como hoje — nada muda no produtor.
2. `flushLogs()` assume dois modos:
   - **Modo batch** (padrão, usado no `finally` do `ServiceRegistry.dispatch`):
     concatena buffer + pendências salvas; **grava em 1 `setValues` se o
     total ≥ `MIN_BATCH_SIZE` (5)**; senão, persiste como pendência no
     `CacheRepository` (chave `__LOG_PENDING__`, TTL 6h) para o próximo
     flush.
   - **Modo force** (`force: true`, usado em: chamadas HTTP externas no
     `Router` via `flushLogsForced_`, na ação `logging.flushLogs` chamada
     pelo cliente ao fim do `preFetch`, e no início de `logging.getLogs`):
     grava buffer + pendências em 1 `setValues` e limpa.
3. **Fim determinístico da rajada:** o cliente (`DataStore.preFetch`) chama
   `logging.flushLogs {force:true}` após `Promise.allSettled` — nada fica
   pendente no boot.
4. Garantia de não-perda: pendências < `MIN_BATCH_SIZE` nunca são perdidas —
   ficam no cache (6h) e são drenadas no próximo flush forçado (webhook,
   `getLogs`, fim de preFetch, ação isolada).
5. `clearOldLogs`, `init`: sem mudança. `getLogs` agora drena pendências
   antes de ler (força flush), para a UI nunca mostrar logs "sumidos".

## Casos de Borda
- Rajada com 1 dispatch (clique isolado na UI): flush coalescente → 1
  entrada no buffer; fica pendente no cache e é drenada no próximo flush
  forçado (`getLogs` do DebugConsole drena antes de ler).
- Rajada com 14 dispatches (preload): ~14 bufferizações na mesma execução +
  1 gravação em lote (no crossing do `MIN_BATCH_SIZE`) e o dreno final
  forçado pelo `preFetch`.
- Webhook/push Shopee (HTTP externo, execução isolada): `Router` força flush
  antes de responder — log gravado imediatamente.
- Exceção no meio da rajada: logs já bufferizados ficam como pendência no
  cache — drenados no próximo flush (fallback cobre, nada se perde).
- `flushLogs` chamado sem nada pendente: no-op.

## Critérios de Aceite (Given/When/Then)
- Given o app carregando (preload de 14 ações), When a rajada termina,
  Then as entradas são gravadas em poucos `setValues` (≤ 4, contra 14
  antes) e todas existem na aba LOGS.
- Given uma ação isolada via HTTP (ex.: `doPost` com action), When ela roda,
  Then o log é gravado imediatamente (flush forçado no Router).
- Given um erro dentro de uma ação da rajada, When a rajada termina, Then
  o log de erro está presente no lote final.
- Given pendências < 5 no cache (execução abortada), When `logging.getLogs`
  é chamado, Then as pendências são drenadas e aparecem na resposta.

## Fora de Escopo
- Mudança na estrutura/colunas da aba LOGS.
- Logging de outro destino (Stackdriver/console) além da planilha.
- Mudança nos TTLs de cache de outros domínios.

## Dependências
- Services usados: `ServiceRegistry` (ponto de chamada, `finally`),
  `Router` (`flushLogsForced_` em HTTP externo/push), `ConfigService`.
- Repositories usados: `SheetsRepository` (aba LOGS), `CacheRepository`
  (pendência `__LOG_PENDING__`, TTL 6h).
- Ações Tiops: nenhuma.

## Notas de Implementação
- Decisões tomadas na implementação:
  - `MIN_BATCH_SIZE = 5`.
  - Pendência via `CacheRepository` (`__LOG_PENDING__`, TTL 21600s = máx)
    em vez de semáforo em memória — sobrevive entre execuções GAS.
  - `flushLogsForced_` no `Router` (doGet action, doPost action e push
    ACK); NÃO no `ServiceRegistry.dispatch` (que é usado também pelo
    `google.script.run` — forçar ali quebraria o coalescing do preload).
  - `DataStore.preFetch` faz `logging.flushLogs {force:true}` após
    `allSettled`.
  - `getLogs` drena pendências antes de ler a planilha.
  - Erros de cache são silenciosos (`best effort`): fallback máximo é
    perder uma pendência < 5 — nunca derrubar a ação em curso.