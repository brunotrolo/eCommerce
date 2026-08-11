# Spec: Estoque Baixa (motor FIFO — reprocessamento do excedente, J1)

## Status
Implemented

## Objetivo
Fechar o **gap de envio** (J1 da Fase 9, `PLANO.md`): quando um pedido vende `N`
unidades de um SKU e a baixa FIFO só consegue `B < N` (estoque parcial), as
`N − B` unidades restantes **nunca eram baixadas**: o `backfillExistingOrders`
(único caminho de reprocessamento, hoje) via uma baixa parcial existente
(`viaReferencia`) como "pedido completo" e marcava o pedido `BAIXADO` — a sobra
ficava no estoque para sempre, divergindo do que foi vendido.

Este domínio (motor FIFO de baixa, `EstoqueBaixaService`) não tinha spec
própria — o código-fonte era a fonte de verdade. Esta spec documenta o
contrato do motor e o delta do J1.

## Contrato da API Interna

### `estoqueBaixa.baixarPorProduto`
- Descrição: baixa unidades FIFO (por `DATA_ENTRADA` BR, mais antiga primeiro)
  de um produto, com lock e idempotência por `idempotencyKey`.
- Params: `codigoProduto` (obrigatório), `quantidade` (>0), `origem`
  (obrigatório), `referenciaOrigem` (obrigatório), `idempotencyKey`
  (obrigatório).
- Retorno: `{ success, baixados, estoque_ids, custoTotal, faltantes,
  jaExistia }` — `faltantes` = quantidade não baixada (baixa é **parcial por
  design**: baixa o que existe e informa o que falta).
- Idempotência: só devolve `jaExistia` quando a row existente tiver
  `STATUS === 'BAIXADO'`; rows `PENDENTE_MAPEAMENTO` não bloqueiam re-tentativa.

### `estoqueBaixa.reprocessarPendentes` (= `backfillExistingOrders`)
- Descrição: varre a aba `PEDIDOS` e re-tenta a baixa de todo pedido com
  `BAIXADO` ∉ { `BAIXADO`, `S` }, atualizando `BAIXADO`/`BAIXA_ESTOQUE_IDS`/
  `TOTAL_COST` em lote ao final.
- **Delta J1**: pedido com baixa parcial pré-existente não é mais tratado como
  completo. O excedente é re-tentado no próprio ciclo:
  - Acumula `QUANTIDADE`/`ESTOQUE_IDS` de **todas** as rows `BAIXADO` da
    mesma `REFERENCIA_ORIGEM` (rows `REVERTIDO` são ignoradas — unidades
    devolvidas).
  - Se o total baixado `≥ quantidade` do pedido → pedido completo
    (`jaExistia: true, viaReferencia: true`), ids/custos agregados.
  - Se `0 < já baixado < quantidade` → re-tenta **só o que falta**
    (`quantidade = qty − jáBaixado`) com chave de idempotência derivada e
    determinística `REFERENCIA_ORIGEM + '#R' + jáBaixado` (nunca colide com a
    tentativa original nem entre retentativas de valores distintos).
  - Se `já baixado = 0` → tentativa normal (comportamento atual).

### Marcador `PENDENTE_MAPEAMENTO` (ESTOQUE_BAIXAS)
- Criado pelo motor quando `origem === 'PEDIDO_SHOPEE'` e não há unidades
  disponíveis. **Delta J1:** `QUANTIDADE` agora registra quantas unidades estão
  pendentes (antes gravava 0). É sinal de observabilidade — o reprocessamento
  é dirigido pela coluna `BAIXADO` do `PEDIDOS`, não por esses marcadores.

## Regras de Negócio
- Status que nunca baixam: `UNPAID`, `CANCELLED`/`CANCELADO`,
  `TO_RETURN`/`RETURNED`/`DEVOLVIDO` (regra pré-existente, mantida).
- `SEM_ESTOQUE` (sentinela de pareamento) nunca gera pendência nem custo.
- A baixa é sempre parcial por design: o motor baixa o disponível e devolve
  `faltantes`; o pedido vira `PARCIAL` e só fica `BAIXADO` quando o somatório
  de tentativas ≥ quantidade vendida.
- Excedente é **eventualmente consistente**: cada ciclo de
  `reprocessarPendentes` avança uma tentativa idempotente do que falta; a
  convergência pode levar N ciclos se o estoque chegar em lotes.
- `PENDENTE_MAPEAMENTO` não bloqueia `baixarPorProduto` (idempotência só
  reconhece `BAIXADO`).

## Casos de Borda
- Baixa parcial em múltiplas tentativas (2 + 2 + 1 de 5): chaves `#R2` e `#R4`
  determinísticas; ids agregados sem duplicar; `PEDIDOS.BAIXA_ESTOQUE_IDS`
  contém as 5 unidades.
- Gate de status conta **unidades vendidas**, não entradas de SKU: pedido de
  SKU único x5 com baixa de 2 fica `PARCIAL`, nunca `BAIXADO` (o `backfill`
  somava `totalBaixas` em unidades contra `totalSkusNoPedido` em entradas —
  corrigido no J1).
- **Sync de pedidos novos** (`OrdersImportService.processBaixaForOrder_`):
  mesmo gate por unidades + crédito de baixas pré-existentes agregadas
  (`jaExistia` credita `totalJaBaixado` da referência, não 1 por entrada) —
  pedido novo com baixa parcial nunca é marcado `BAIXADO`; permanece o
  papel de 1ª tentativa, com a convergência do excedente no backfill.
- Retentativa parcial de novo (faltou 1 de 3): pedido permanece `PARCIAL` até
  convergir — nunca `BAIXADO` incompleto.
- Row `REVERTIDO` na mesma referência: ignorada na agregação (unidade voltou
  ao estoque).
- Estoque zerado: marcador `PENDENTE_MAPEAMENTO` com `QUANTIDADE = pendente`
  (antes 0) e pedido segue `PENDENTE`/`PARCIAL`.
- Idempotência da tentativa original: intacta (`jaExistia` só com `BAIXADO`).

## Critérios de Aceite (Given/When/Then)
- Given pedido de 5 unidades com baixa parcial de 2 (pedido `PARCIAL`), When
  rodar `reprocessarPendentes` com 3 unidades chegando ao estoque, Then as 3
  são baixadas, `BAIXA_ESTOQUE_IDS` tem 5 ids únicos e o pedido vira `BAIXADO`.
- Given o mesmo cenário sem estoque suficiente, When rodar
  `reprocessarPendentes`, Then o pedido permanece `PARCIAL` (nunca `BAIXADO`
  incompleto) e nenhuma unidade nova é marcada.
- Given pedido com 2 baixas parciais + 1 row revertida, When agregar, Then
  somatório considera só as `BAIXADO`, ids únicos, `REVERTIDO` ignorado.
- Given estoque zerado na 1ª tentativa, When a baixa rodar, Then o marcador
  `PENDENTE_MAPEAMENTO` registra a quantidade pendente (não 0).

## Agendamento diário (J2c, 11/08/2026)
- Trigger **1x/dia às 06h** (fuso da planilha) criado pelo menu do editor
  (Agendamento → "Agendar Sync Diário (06h)"), handler `runSyncDiario_` em
  `src/99_Main.js` — executável também a qualquer hora pelo menu ("Rodar
  Sync Diário Agora").
- O job roda em try/catch separados: `OrdersImportService.importShopeeOrders`
  e `EstoqueBaixaService.reprocessarPendentes` — falha de um não aborta o
  outro; resultado completo logado em `LOGS` (action `syncDiario.run`).
- Agendamento é idempotente: delete/recreate do trigger do handler (rodar o
  item de menu de novo não duplica execuções diárias).
- O disparo manual (botão na EstoqueView + Sincronizar Tudo) permanece
  inalterado.

## Fora de Escopo
- J2a (aceite de estoque parcial como decisão do reprocessamento) — **coberto
  pelo J1**: o motor já rebaixa o que existe (parcial por design), o resto
  fica `PARCIAL`/`PENDENTE` e converge ciclo a ciclo via chaves `#R`,
  mantendo idempotência. Sem código novo (evidência: smoke cenário 10).
- J2b (reorder do lote novo acima do já-mapeado) — **decisão 11/08/2026:
  manter FIFO estrito**, sem código.
- J2c (agendamento de ciclos) — **implementado** (ver "Agendamento diário"
  acima).
- Fluxo de saída manual (Tier 1 corrigiu a baixa parcial lá para erro).

## Dependências
- Services: `EstoqueBaixaService` (motor), `OrdersRepository` (PEDIDOS).
- Repositories: `EstoqueRepository`, `EstoqueBaixasRepository`,
  `CacheRepository` (invalidação), `LoggingService`.
- Ações Tiops: nenhuma.

## Notas de Implementação
- Nova função pura `calcularExcedente(rows, qty)` exportada do
  `EstoqueBaixaService` (testável por smoke): agrega `QUANTIDADE`/`ESTOQUE_IDS`
  das rows `BAIXADO` e devolve `{ totalJaBaixado, estoqueIds, faltante }`.
- `validateParams`/validações do engine inalteradas; lock do motor inalterado.
- Smoke: cenário 8 da suíte Estoque Baixa em `src/99_Main.js` (agregação,
  `REVERTIDO` excluído, dedupe e faltante).
- Testes Node no CI: `tests/estoque-baixa.test.js` (harness em
  `tests/helpers/`, rodado por `node --test` nos workflows `ci.yml` e
  `deploy.yml`) cobre os mesmos casos de borda da agregação contra o código
  real de `src/` dentro do sandbox.