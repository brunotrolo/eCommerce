# Spec: Motor Central de Baixa de Estoque (ESTOQUE_BAIXAS)

## Status
Approved

> 07/08/2026 — Aprovado ajuste de idempotência do `reprocessarPendentes`: o
> backfill deve usar a **mesma** `idempotencyKey` da importação
> (`SHOPEE#<order_sn>:<sku>`, sem sufixo `:backfill`) para não rebaixar itens
> que a importação já baixou (evita dupla-baixa em pedidos `PARCIAL`/`PENDENTE`
> reprocessados). Seção `reprocessarPendentes` e Regra 2 atualizadas.
>
> 07/08/2026 — Correção pós-validação: o backfill escrevia apenas a coluna
> `BAIXADO` de `PEDIDOS`, deixando `BAIXA_ESTOQUE_IDS`/`TOTAL_COST` vazias nos
> pedidos antigos (estoque consumido, mas sem registro de quais unidades).
> Agora o backfill também (a) acumula `estoque_ids`/`custoTotal` por pedido e
> grava `BAIXA_ESTOQUE_IDS`/`TOTAL_COST` (criando as colunas se faltarem), e
> (b) só pula linhas já `BAIXADO`/`S` **quando `BAIXA_ESTOQUE_IDS` não está
> vazio** — linhas marcadas sem IDs entram de novo, encontram a baixa pela
> `REFERENCIA_ORIGEM` (nunca rebaixam, mesmo com chave legada) e preenchem a
> coluna. Resolve pedidos antigos (pré-window da API) que ficaram "BAIXADO sem
> item".

## Objetivo

Centralizar, num único serviço, a lógica de "tirar N unidades do estoque de um
`codigoProduto`" — hoje inexistente. A aba `ESTOQUE` (unitária, FIFO, ver
`specs/estoque.md`) só tem fluxo de entrada; a única forma de marcar uma unidade
como `VENDIDO` hoje é `estoque.updateStatusBulk`, que exige que o usuário escolha
manualmente cada `ESTOQUE_ID` — não há seleção FIFO automática, não há idempotência,
não há registro de por que/quando uma baixa aconteceu.

Este serviço (`EstoqueBaixaService`) é o motor que **Pedidos Shopee**
(`specs/estoque-baixa-shopee.md`, a criar) e, futuramente, **Saída Manual**
(`specs/manual-saida.md`) vão chamar para dar baixa de forma consistente,
auditável e sem duplicar a mesma unidade duas vezes. Resolve diretamente o "grande
desafio" de controle de estoque automatizado e auditável pedido pelo usuário.

## Contrato da API Interna

### `estoqueBaixa.baixarPorProduto`
- **Descrição:** seleciona as unidades `DISPONÍVEL` mais antigas (FIFO) de um
  `codigoProduto` e marca `VENDIDO`, registrando a operação em `ESTOQUE_BAIXAS`.
  Idempotente por `idempotencyKey` — chamar duas vezes com a mesma chave não baixa
  duas vezes.
- **Params:**
  | Nome | Tipo | Obrigatório | Descrição |
  |------|------|-------------|-----------|
  | `codigoProduto` | string | sim | Código do produto em `ESTOQUE` |
  | `quantidade` | number | sim | Unidades a baixar (> 0) |
  | `origem` | string | sim | `'PEDIDO_SHOPEE'` \| `'SAIDA_MANUAL'` (enum aberto para futuros canais) |
  | `referenciaOrigem` | string | sim | Identificador de rastreio, ex. `"SHOPEE#<order_sn>"` ou `"MAN#<logId>"` — mesmo padrão de `REFERENCIA_ORIGEM` já usado na entrada |
  | `idempotencyKey` | string | sim | Chave única da operação, ex. `referenciaOrigem + ':' + item_id` |
- **Retorno:**
  ```javascript
  {
    success: boolean,
    baixados: number,       // unidades efetivamente marcadas VENDIDO nesta chamada
    estoque_ids: [string],  // ESTOQUE_ID das unidades baixadas
    faltantes: number,      // quantidade - baixados, se estoque insuficiente (nunca negativo)
    jaExistia: boolean      // true se idempotencyKey já tinha sido processada (baixados=0 nesse caso)
  }
  ```
- **Erros esperados:** `codigoProduto`/`quantidade`/`origem`/`referenciaOrigem`/`idempotencyKey`
  ausentes ou inválidos. **Nunca lança erro por estoque insuficiente** — retorna
  `faltantes > 0` (quem chama decide se isso é bloqueante).

### `estoqueBaixa.reverterBaixa`
- **Descrição:** reverte uma baixa já registrada, identificada por
  `referenciaOrigem`. Usado quando um pedido é cancelado ou devolvido depois de já
  ter dado baixa.
- **Params:**
  | Nome | Tipo | Obrigatório | Descrição |
  |------|------|-------------|-----------|
  | `referenciaOrigem` | string | sim | Mesma referência usada em `baixarPorProduto` |
  | `motivo` | string | sim | `'CANCELADO'` \| `'DEVOLVIDO'` |
- **Regra de negócio central:**
  - `motivo:'CANCELADO'` → as unidades voltam para `STATUS='DISPONÍVEL'` em `ESTOQUE`
    (a unidade nunca chegou a sair fisicamente, ou o cancelamento invalida a venda).
  - `motivo:'DEVOLVIDO'` → as unidades vão para `STATUS='DEVOLVIDO'` em `ESTOQUE`
    (**nunca** pula direto para `DISPONÍVEL` — a unidade pode estar danificada; fica
    para revisão humana via `estoque.updateStatusBulk`, já existente, decidir se
    volta a `DISPONÍVEL` ou vai para `QUEBRADO`/`COM_DEFEITO`).
- **Retorno:** `{ success: boolean, revertidos: number, motivo: string }`.
- **Erros esperados:** `referenciaOrigem` sem baixa registrada (ou já revertida)
  retorna `{ success: false, revertidos: 0, motivo: 'REFERENCIA_NAO_ENCONTRADA' }`
  — nunca lança exceção (chamador pode reprocessar sem se preocupar em checar antes).

### `estoqueBaixa.getBaixaStatus`
- **Descrição:** consulta se uma referência já foi baixada — usado por chamadores
  que querem checar antes de tentar (complementa, não substitui, a garantia de
  idempotência interna de `baixarPorProduto`).
- **Params:** `{ referenciaOrigem: string }`
- **Retorno:** `{ jaBaixado: boolean, estoque_ids: [string], status: string, baixadoEm: string }`

### `estoqueBaixa.reprocessarPendentes`
- **Descrição:** varre **toda a aba `PEDIDOS`** (não só `ESTOQUE_BAIXAS`), linha por
  linha, e aplica baixa FIFO para todo pedido que ainda não tem `BAIXADO='BAIXADO'`
  ou `BAIXADO='S'`. Destina-se a cubrir pedidos antigos que a API Shopee não retorna
  mais na janela de listagem (ex.: pedidos de julho fora dos ~15 dias do
  `shopee_list_orders`) — casos em que a importação nunca "enxerga" o pedido para
  dar a baixa.
- **Regras de varredura:**
  - Pula pedidos sem `ORDER_ID`/`ITEM_SKUS`, e os já marcados `BAIXADO`/`S`.
  - Pula `CANCELLED`/`CANCELADO` e `TO_RETURN`/`RETURNED`/`DEVOLVIDO` — sempre
    registra log (`backfill.skip`).
  - Para cada SKU usa `origem:'PEDIDO_SHOPEE'`,
    `referenciaOrigem:'SHOPEE#'+order_sn+':'+sku` e
    **`idempotencyKey` = `referenciaOrigem`** (mesma chave da importação em
    `OrdersImportService.processBaixaForOrder_`). Isso faz o backfill reconhecer
    baixas já feitas (`jaExistia:true`) e **nunca rebaixar** um item que a
    importação já baixou — decisão crítica para pedidos `PARCIAL`/`PENDENTE`.
  - Atualiza as colunas da aba `PEDIDOS`: `BAIXADO` (`BAIXADO` se todos os SKUs
    baixados, `PARCIAL` se só parte, `PENDENTE` se nenhum) e também
    `BAIXA_ESTOQUE_IDS` (CSV dos `ESTOQUE_ID` consumidos, somados por pedido) e
    `TOTAL_COST` (soma dos `PRECO_CUSTO_ORIGINAL` das unidades baixadas).
  - **Pulo de linha já processada só é completo quando a baixa está registrada:**
    uma linha `BAIXADO`/`S` com `BAIXA_ESTOQUE_IDS` vazio **não** é pulada —
    entra no fluxo de preenchimento, que localiza a baixa existente por
    `REFERENCIA_ORIGEM` (sem chamar `baixarPorProduto`, logo sem risco de
    rebaixar, mesmo se a `IDEMPOTENCY_KEY` histórica for de formato legado) e
    grava a coluna.
- **Params:** nenhum.
- **Retorno:** `{ processados: number, baixados: number, erros: number, jaProcessados: number }`.
- **Nota:** se as colunas `BAIXADO`, `BAIXA_ESTOQUE_IDS` ou `TOTAL_COST` não
  existirem na aba `PEDIDOS`, elas são criadas na última coluna livre.

## Formato da Aba ESTOQUE_BAIXAS

Log de negócio (não é log técnico genérico como `AUDIT_LOG` — é o registro de que
uma baixa de estoque aconteceu, com semântica própria de reversão).

```
BAIXA_ID | REFERENCIA_ORIGEM | ORIGEM | CODIGO_PRODUTO | QUANTIDADE | ESTOQUE_IDS | IDEMPOTENCY_KEY | STATUS | CRIADO_EM | REVERTIDO_EM
```

| Campo | Formato | Descrição |
|-------|---------|-----------|
| BAIXA_ID | string | `YYYYMMDDHHMMSS-<nonce8>`, mesmo padrão de `LOG_ID` do projeto |
| REFERENCIA_ORIGEM | string | Ex. `"SHOPEE#260711CAQ9KK03"`, `"MAN#20260803T184122-2b1631"` |
| ORIGEM | string | `'PEDIDO_SHOPEE'` \| `'SAIDA_MANUAL'` |
| CODIGO_PRODUTO | string | Produto baixado |
| QUANTIDADE | number | Quantidade efetivamente baixada (pode ser < solicitada se `faltantes > 0`) |
| ESTOQUE_IDS | string | CSV dos `ESTOQUE_ID` afetados (ex. `"EST-20260803-001,EST-20260803-002"`) |
| IDEMPOTENCY_KEY | string | Chave única — índice de consulta antes de qualquer baixa nova |
| STATUS | string | `'BAIXADO'` \| `'REVERTIDO'` \| `'PENDENTE_MAPEAMENTO'` |
| CRIADO_EM | dd/MM/yyyy HH:mm:ss | Timestamp BR (`Session.getScriptTimeZone()`, nunca ISO — regra do projeto) |
| REVERTIDO_EM | dd/MM/yyyy HH:mm:ss | Preenchido só se `STATUS='REVERTIDO'` |

## Regras de Negócio

1. **FIFO reaproveitado, não reimplementado.** `baixarPorProduto` usa
   `EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto)`, que já
   retorna as unidades `DISPONÍVEL` ordenadas por `DATA_ENTRADA` ascendente. Pega os
   primeiros N. Nenhuma lógica de ordenação nova.
2. **Idempotência por `IDEMPOTENCY_KEY`.** Antes de tocar `ESTOQUE`,
   `baixarPorProduto` consulta `ESTOQUE_BAIXAS` pela chave. Se existir linha com
   `STATUS='BAIXADO'`, retorna `{ success: true, baixados: 0, jaExistia: true,
   estoque_ids: <os mesmos da vez anterior> }` sem tocar `ESTOQUE` de novo.
   **Todos os chamadores usam a mesma convenção de chave** —
   `SHOPEE#<order_sn>:<sku>` (importação e `reprocessarPendentes`); nunca inventar
   sufixo por chamador, senão a idempotência entre eles quebra e o mesmo item é
   baixado duas vezes.
3. **Lock obrigatório.** `baixarPorProduto` e `reverterBaixa` executam dentro de
   `LockService.getScriptLock()` (timeout curto, poucos segundos) ao redor do ciclo
   ler-`ESTOQUE_BAIXAS`→gravar. **Este é o primeiro uso de `LockService` no
   projeto** — necessário porque o webhook (`PushNotificationService.syncOrderBySn`)
   e o import manual/cron (`OrdersImportService.importShopeeOrders`) podem processar
   o mesmo pedido quase simultaneamente. Se não conseguir o lock a tempo, lança erro
   claro (`ESTOQUE_LOCK_TIMEOUT`) em vez de travar — GAS tem limite de 6 min de
   execução por chamada, o lock nunca pode ser a causa de estourar esse limite.
4. **Nunca cria unidade negativa.** Se `quantidade` pedida for maior que o
   `DISPONÍVEL` real, baixa o que existir (`baixados < quantidade`) e retorna
   `faltantes = quantidade - baixados`. Quem chama decide o que fazer com
   `faltantes > 0` — este serviço nunca lança erro fatal por estoque insuficiente.
5. **Reversão é sempre por referência completa**, não por unidade individual — uma
   baixa de N unidades reverte as N de uma vez (a granularidade por item de um
   pedido multi-item é responsabilidade de quem chama, que deve gerar uma
   `idempotencyKey`/`referenciaOrigem` por item, não por pedido inteiro, quando o
   pedido tem mais de um produto).
6. **`ESTOQUE_BAIXAS` é o log de negócio; `LoggingService.log()` continua sendo
   chamado à parte** (auditoria técnica genérica), seguindo o padrão já
   estabelecido no projeto — não substituem um ao outro.

## Casos de Borda

- **Duas chamadas simultâneas para o mesmo `codigoProduto`, origens diferentes**
  (ex. pedido Shopee e saída manual do mesmo produto ao mesmo tempo) — o lock
  garante serialização; a segunda chamada espera a primeira liberar antes de ler
  `ESTOQUE` de novo (evita duas baixas lerem o mesmo conjunto de unidades
  `DISPONÍVEL` e "roubarem" a mesma unidade).
- **`quantidade` = 0 ou negativa** → erro de validação, não processa.
- **Estoque zerado (`DISPONÍVEL` = 0) no momento da baixa** → `baixados: 0,
  faltantes: quantidade` — não é erro, é um resultado válido que o chamador audita.
- **`reverterBaixa` chamado para uma `referenciaOrigem` já revertida** → idempotente,
  retorna `{ success: true, revertidos: 0 }` (não reverte duas vezes, não lança erro).
- **`reverterBaixa` chamado para uma `referenciaOrigem` que nunca foi baixada** →
  `{ success: false, revertidos: 0, motivo: 'REFERENCIA_NAO_ENCONTRADA' }`.
- **Lock não obtido dentro do timeout** → lança `ESTOQUE_LOCK_TIMEOUT` explícito;
  chamador (import de pedidos) trata como erro não-fatal daquele item específico,
  não derruba o import inteiro (mesmo padrão de erro por item já usado em
  `OrdersImportService`).

## Critérios de Aceite (Given/When/Then)

1. **Baixa simples respeitando FIFO**
   - Given `codigoProduto='6231'` com 3 unidades `DISPONÍVEL` em `ESTOQUE`, entradas
     em 01/08, 02/08, 03/08 (nessa ordem)
   - When `baixarPorProduto({codigoProduto:'6231', quantidade:1, ...})`
   - Then a unidade com `DATA_ENTRADA=01/08` (mais antiga) vira `VENDIDO`; as outras
     2 continuam `DISPONÍVEL`.

2. **Idempotência**
   - Given uma baixa já registrada com `idempotencyKey='SHOPEE#ABC:123'`
   - When `baixarPorProduto` é chamado de novo com a mesma `idempotencyKey`
   - Then retorna `{ baixados: 0, jaExistia: true }` e nenhuma unidade adicional
     vira `VENDIDO`.

3. **Estoque insuficiente**
   - Given `codigoProduto='X'` com apenas 1 unidade `DISPONÍVEL`
   - When `baixarPorProduto({codigoProduto:'X', quantidade:3, ...})`
   - Then retorna `{ baixados: 1, faltantes: 2 }`, sem lançar exceção, sem criar
     unidade negativa.

4. **Reversão por cancelamento**
   - Given uma baixa de 2 unidades já registrada (`STATUS='BAIXADO'`)
   - When `reverterBaixa({referenciaOrigem, motivo:'CANCELADO'})`
   - Then as 2 unidades voltam a `STATUS='DISPONÍVEL'` em `ESTOQUE`, e a linha em
     `ESTOQUE_BAIXAS` vira `STATUS='REVERTIDO'`.

5. **Reversão por devolução não pula para disponível**
   - Given uma baixa de 1 unidade já registrada
   - When `reverterBaixa({referenciaOrigem, motivo:'DEVOLVIDO'})`
   - Then a unidade vira `STATUS='DEVOLVIDO'` em `ESTOQUE` (não `DISPONÍVEL`).

6. **Concorrência não duplica baixa**
   - Given duas chamadas a `baixarPorProduto` para o mesmo `codigoProduto` e a mesma
     `idempotencyKey`, disparadas quase ao mesmo tempo (simulação de webhook + cron)
   - When ambas executam
   - Then apenas uma efetivamente baixa (a segunda detecta `jaExistia:true` via
     `ESTOQUE_BAIXAS`, protegida pelo lock).

## Fora de Escopo (v1)

- Seleção de unidade específica fora de FIFO (ex. escolher por proximidade de
  validade) — não há campo de validade em `ESTOQUE` hoje.
- Baixa parcial configurável por política (ex. "baixar o que der e ignorar o
  resto") — o comportamento de `faltantes > 0` já cobre isso; decisão de bloquear
  ou não fica com quem chama.
- Notificação/alerta automático quando `faltantes > 0` (fica para os chamadores,
  ex. `estoque-baixa-shopee.md`, decidirem como expor isso na UI).

## Dependências

- **Repositories:**
  - `EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto)` — já
    existe, retorna FIFO.
  - `EstoqueRepository.updateRowsBulk`/`updateRow` — já existem, usados para marcar
    `VENDIDO`/`DISPONÍVEL`/`DEVOLVIDO`.
  - `EstoqueBaixasRepository` (novo) — I/O da aba `ESTOQUE_BAIXAS`.
- **Google Apps Script:** `LockService.getScriptLock()` (uso novo no projeto),
  `SpreadsheetApp`, `Utilities` (geração de `BAIXA_ID`).
- **Services:** `LoggingService.log()` (auditoria técnica em paralelo ao registro
  de negócio em `ESTOQUE_BAIXAS`).

## Notas de Implementação

1. **Estrutura de arquivos:**
   ```
   src/03_services/estoque/EstoqueBaixaService.js   # novo — motor de baixa
   src/02_repositories/EstoqueBaixasRepository.js    # novo — I/O aba ESTOQUE_BAIXAS
   ```
   `EstoqueBaixaService.js` fica na mesma pasta de domínio `estoque` (não pasta
   própria) porque estende o mesmo domínio de `EstoqueService.js`/
   `EstoqueRepository.js` — não é um domínio novo, é a metade "saída" do domínio
   que hoje só tem "entrada".

2. **`filePushOrder`:** inserir `EstoqueBaixasRepository.js` no bloco de
   repositories (depois de `EstoqueRepository.js`, que ele não depende mas mantém
   agrupamento por camada) e `EstoqueBaixaService.js` logo depois de
   `EstoqueService.js` em `03_services` (depende de `EstoqueRepository` e do novo
   `EstoqueBaixasRepository`).

3. **Registro em `ServiceRegistry.js`:** padrão defensivo já usado no projeto:
   ```javascript
   estoqueBaixa: safeRef_('estoqueBaixa', function () {
     return typeof EstoqueBaixaService !== 'undefined' ? EstoqueBaixaService : undefined;
   })
   ```

4. **Geração de `BAIXA_ID`:** reaproveitar o mesmo padrão de `generateLogId_()` já
   presente em `EstoqueService.js` (timestamp + nonce hex de 6 chars) — não duplicar
   a função, expor como helper compartilhado ou replicar o padrão simples
   (é 6 linhas, replicar é aceitável dado que `EstoqueService` não exporta esse
   helper hoje).

5. **Este serviço é testável isoladamente**, sem depender de pedido Shopee real —
   os critérios de aceite podem ser verificados chamando `apiDispatch('estoqueBaixa.
   baixarPorProduto', {...})` diretamente contra um `codigoProduto` real de
   `ESTOQUE`, antes de qualquer integração com `OrdersImportService`
   (`specs/estoque-baixa-shopee.md`, que consome este serviço).
