# Spec: Hardening — Log de operações de escrita (repositórios)

## Status
Approved

## Objetivo
Item 1 da Fase 7 (Endurecimento, PLANO.md): garantir que **toda operação de
escrita na planilha** registre na aba LOGS "o que mudou, quando, resultado" —
sem depender de cada serviço lembrar de logar. Hoje a auditoria existe e é
usada em boa parte dos repositórios (`SheetsRepository.logWriteAudit`, com
~38 call-sites, e `LoggingService.log` direto em `OrdersRepository`), mas há
lacunas: `OrdersRepository.writeBaixaColumns`/`prepareBaixaBulk`/
`flushBaixaBulk`, `ConfigRepository.set` e a criação de abas
(`getOrCreateSheet` em `OrdersRepository`) não geram log.

## Contrato da API Interna
Sem nova action pública. Mudanças são internas às camadas de repositório
(respeitando a arquitetura: repositories podem chamar `SpreadsheetApp` e
`LoggingService`; nenhum `LoggingService` sai para adapters).

### `SheetsRepository.appendRow` / `SheetsRepository.updateCell`
- Descrição: passam a registrar erro de escrita via `logWriteAudit`, sem mudar
  o comportamento atual.
- Mudança: envolver o corpo em try/catch; em falha → `logWriteAudit({sheet,
  operation: 'APPEND'|'UPDATE', status: 'ERROR', stats, detail: err.message,
  caller: caller atual do método})` e **re-lançar** a exceção (comportamento
  existente se preserva: o erro continua subindo ao serviço).
- Sem log interno de sucesso (callers existentes já auditam; evitar duplicidade
  com os ~38 `logWriteAudit` atuais).

### `OrdersRepository.writeBaixaColumns` / `prepareBaixaBulk` / `flushBaixaBulk`
- Descrição: passam a logar (mesmo estilo do `insertOrdersBulk`/`updateOrderRow`
  existentes, via `LoggingService.log`).
- `writeBaixaColumns`: log com `orderId`, colunas criadas, status OK.
- `prepareBaixaBulk`: log com `orderIds` processados e colunas criadas (o
  flush é que grava; preparação é só diagnóstico).
- `flushBaixaBulk`: log com `rowsWritten`, `orderIdCount`, status OK/ERROR.

### `ConfigRepository.set`
- Descrição: loga `{chave, descricao-valor}` após gravar. Valor entra no
  `context`, não no summary; nunca logar credencial (CONFIG não contém
  segredos hoje, mas a regra permanece).

## Regras de Negócio
1. Auditoria é **best effort**: falha de log nunca derruba a escrita nem a
   ação em curso (padrão já existente de `logWriteAudit`).
2. Aba `LOGS` é destino, nunca fonte de audit (não logar operações da própria
   aba LOGS — evitar recursão).
3. `LoggingService.log` bufferiza e o flush é agrupado (spec `logging.md`) —
   portanto escritas ficam no buffer e são gravadas no fim da rajada; isso
   não muda a semântica de "quando": a linha da LOGS carrega o timestamp
   do evento via logging.
4. Status da escrita: `OK` no sucesso, `ERROR` + `errorMessage` na falha.

## Casos de Borda
- `ConfigRepository.set` com chave nova (appendRow) e com chave existente
  (setValue) — ambos logam com status OK.
- `updateCell` em coluna inexistente (cria header) — log ERROR se a criação
  falhar, OK caso contrário (mesma exceção atual).
- `flushBaixaBulk` com `rowsWritten === 0` — log com contador 0 (no-op
  transparente).
- Escrita na aba LOGS (LoggingRepository) — sem audit adicional (regra 2).

## Critérios de Aceite (Given/When/Then)
- Given uma sync/import de pedidos com baixa em lote, When
  `flushBaixaBulk` grava linhas, Then existe entrada na LOGS com
  `rowsWritten` correto e status OK (verificável via `logging.getLogs`).
- Given `ConfigRepository.set` chamado por qualquer serviço, When grava,
  Then existe entrada na LOGS com a chave no context.
- Given falha simulada de escrita (aba inacessível), When `appendRow`
  lança, Then existe entrada na LOGS com status ERROR e a exceção propaga
  ao chamador como hoje.
- Given o fluxo atual (sem novas escritas), When o boot roda, Then o
  custo/número de setValues não aumenta (logging continua bufferizado).

## Fora de Escopo
- Logging de `PropertiesRepository`/`CacheRepository` (não tocam planilha).
- Exclusão de `logWriteAudit` nos callers existentes (só adição de gaps).
- Mudança na estrutura da aba LOGS ou do `LoggingService`.

## Dependências
- Services usados: `LoggingService` (via `logWriteAudit`/`log`).
- Repositories usados: `SheetsRepository`, `OrdersRepository`,
  `ConfigRepository`, `EstoqueBaixasRepository` (referência do padrão).
- Ações Tiops: nenhuma.

## Notas de Implementação
- Aproveitar `SheetsRepository.logWriteAudit` (adapter já existente) em vez
  de chamar `LoggingService.log` direto nos pontos novos de `OrdersRepository`
  e `ConfigRepository` — mantém a assinatura antiga e a aba unificada LOGS.