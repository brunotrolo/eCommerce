# Spec: Baixa Automática de Estoque por Pedido Shopee

## Status
Draft

## ⚠️ Depende de duas premissas não confirmadas

1. Amendment "Captura de Itens por Pedido (ITEMS_JSON)" em
   `specs/orders-import.md`, que assume — **sem confirmação contra o catálogo real
   da Tiops** — que `shopee_get_order_detail.item_list[]` traz `item_id` por item
   (necessário para saber qual anúncio cada linha do pedido representa).
2. Amendment "Campo ITEM_SKU e ação `updateSku`" em `specs/anuncios-shopee.md`, que
   assume que dá para escrever `item_sku` via Tiops — se não der, o pareamento
   ainda funciona (usuário edita manualmente na Shopee), mas o dado de
   `ANUNCIOS_SHOPEE.ITEM_SKU` sincronizado por leitura (`syncListings`/
   `getItemDetail`) continua confiável de qualquer forma para o consumo que esta
   spec faz — só a escrita fica manual.

**Não implementar esta spec sem antes confirmar a premissa 1** (skill
`tiops-contract`: `describe_action` ou inspeção de resposta real) — é a que
bloqueia de fato, porque sem `item_id` no pedido não há como saber a qual anúncio
cada item pertence.

## Objetivo

Integrar as peças já especificadas — captura de item por pedido
(`specs/orders-import.md`, amendment), campo `ITEM_SKU` em `ANUNCIOS_SHOPEE`
(`specs/anuncios-shopee.md`, amendment) e motor central de baixa
(`specs/estoque-baixa.md`) — para que **todo pedido Shopee novo dê baixa automática
no estoque unitário (`ESTOQUE`)**, sem intervenção manual, com reversão automática
em caso de cancelamento e tratamento visível/auditável para devoluções e itens sem
SKU definido. Esta é a peça que resolve, de ponta a ponta, o pedido original do
usuário: "encontrar uma chave que liga o produto no estoque ao pedido na Shopee" —
a chave escolhida é o `item_sku` nativo da Shopee, com `CODIGO_PRODUTO` como valor.

## Contrato da API Interna

Não cria ações novas — estende o comportamento de
`ordersImport.importShopeeOrders` e `ordersImport.syncOrderBySn` (já existentes em
`specs/orders-import.md`), adicionando efeitos colaterais de baixa/reversão de
estoque e novos campos no retorno.

### Retorno estendido de `ordersImport.importShopeeOrders`

```javascript
{
  success: boolean,
  imported: number,
  updated: number,
  errors: array,
  message: string,
  // Campos novos:
  baixasRealizadas: number,     // total de itens que efetivamente baixaram estoque nesta chamada
  pendentesMapeamento: number,  // itens de pedidos sem item_id mapeado ainda
  faltantesEstoque: number      // itens onde a baixa foi parcial (estoque insuficiente)
}
```

`ordersImport.syncOrderBySn` (usado pelo webhook) ganha os mesmos três campos no
retorno.

## Regras de Negócio

### 1. Gatilho: pedido **novo**, não status específico

A baixa dispara assim que um `order_sn` aparece **pela primeira vez** em `PEDIDOS`
(ou seja, `inserted=1` no upsert), **independente do status inicial** (`UNPAID`,
`READY_TO_SHIP`, etc. — não espera `SHIPPED` nem `COMPLETED`). Decisão confirmada
com o usuário: reservar a unidade assim que o pedido existe, para minimizar o risco
de vender a mesma unidade duas vezes (Shopee + saída manual, por exemplo) enquanto o
pedido ainda está em processamento.

Para cada item em `PEDIDOS.ITEMS_JSON` desse pedido, resolver o `codigoProduto` a
partir do `item_id` seguindo esta ordem (nenhuma tabela de mapeamento própria —
consulta direta em `ANUNCIOS_SHOPEE`, já sincronizada separadamente):

1. Buscar a linha em `ANUNCIOS_SHOPEE` com `ITEM_ID` igual ao do item do pedido
   (via `AnunciosShopeeRepository.getItem`), ler `ITEM_SKU`.
2. **`ITEM_SKU === 'SEM_ESTOQUE'`** (sentinela, ver `specs/produto-anuncio-map.md`)
   → item intencionalmente sem controle de estoque. **Ignora silenciosamente** —
   não baixa, não gera pendência, não é erro.
3. **`ITEM_SKU` vazio, OU não vazio mas sem `CODIGO_PRODUTO` correspondente em
   `ESTOQUE`** → item ainda não pareado (ou pareado com um código que não existe em
   `ESTOQUE` — ex. NFe ainda não sincronizada). **Não bloqueia o pedido nem os
   outros itens.** Grava uma linha em `ESTOQUE_BAIXAS` com
   `STATUS='PENDENTE_MAPEAMENTO'` contendo `item_id`, `referenciaOrigem`,
quantidade — para o usuário resolver via `specs/produto-anuncio-map.md` (ou
    sincronizar a NFe pendente) e ser reprocessado depois via
    `estoqueBaixa.reprocessarPendentes()` — que hoje roda automaticamente como
    passo final do botão "Sincronizar" da aba Controle de Estoque (ver
    Scenario 6.1 de `specs/estoque.md`).
4. **`ITEM_SKU` corresponde a um `CODIGO_PRODUTO` real em `ESTOQUE`** → chamar
   `estoqueBaixa.baixarPorProduto({ codigoProduto: ITEM_SKU, quantidade:
   model_quantity_purchased, origem: 'PEDIDO_SHOPEE', referenciaOrigem: 'SHOPEE#' +
   order_sn + ':' + item_id, idempotencyKey: mesmo valor de referenciaOrigem })`.

Não há distinção por `model_id`/variação nesta versão — `ANUNCIOS_SHOPEE.ITEM_SKU`
é por item, não por modelo (ver Fora de Escopo de `specs/produto-anuncio-map.md`);
`idempotencyKey` usa só `item_id`, e se o pedido tiver `model_id` (variação),
ele é ignorado para fins de resolução de SKU nesta v1.

### 2. Reversão por transição de status, sempre por item

Quando um pedido **já existente** (upsert com `updated=1`) muda de status:
- Novo status `CANCELLED` (ou `IN_CANCEL` finalizado) **e** havia baixa registrada
  para algum item desse pedido → para cada item com baixa `STATUS='BAIXADO'` em
  `ESTOQUE_BAIXAS`, chamar `estoqueBaixa.reverterBaixa({ referenciaOrigem,
  motivo:'CANCELADO' })`. A unidade volta a `DISPONÍVEL`.
- Novo status `TO_RETURN` ou (se a Tiops reportar) `RETURNED` **e** havia baixa
  registrada → chamar `estoqueBaixa.reverterBaixa({ referenciaOrigem,
  motivo:'DEVOLVIDO' })`. A unidade vira `DEVOLVIDO`, fica para revisão humana (não
  volta a `DISPONÍVEL` sozinha — pode estar danificada).
- Reversão é **por item**, nunca pelo pedido inteiro de uma vez — um pedido com 2
  itens onde só 1 é cancelado (parcialmente, se a Shopee reportar isso a nível de
  item) só reverte a baixa daquele item específico, usando o `item_id` para saber
  qual `referenciaOrigem` reverter. Se a Shopee só reporta cancelamento a nível de
  pedido inteiro (sem granularidade por item), reverter todos os itens desse pedido
  — comportamento correto por padrão, dado que não há informação mais fina.
- Detectar "status mudou" comparando o `STATUS` gravado antes do upsert (o código
  de `syncOrderBySn` já lê a linha existente antes de decidir insert vs. update —
  reaproveitar essa leitura, sem consulta extra).

### 3. Idempotência herdada do motor central

Nenhuma lógica de idempotência nova aqui — `estoqueBaixa.baixarPorProduto` e
`reverterBaixa` já garantem isso por `idempotencyKey`/`referenciaOrigem` (ver
`specs/estoque-baixa.md`). Rodar `importShopeeOrders` várias vezes sobre o mesmo
pedido, no mesmo status, não gera baixa nem reversão duplicada.

### 4. Pedidos anteriores à ativação desta automação

Pedidos com `CREATE_TIME` anterior à data em que esta spec entra em produção **não
recebem baixa retroativa automática** — evita mexer no estoque atual por vendas que
já aconteceram/foram entregues há tempos, quando o import rodar pela primeira vez
sobre o histórico completo. Implementação: capturar (uma vez, na primeira execução
pós-deploy) um "corte" — ex. maior `CREATE_TIME` já presente em `PEDIDOS` antes do
deploy desta fase — e só aplicar baixa a pedidos com `CREATE_TIME` posterior a esse
corte. Detalhe de implementação fica a critério de quem implementa (ex. constante de
data em Script Properties, setada manualmente uma vez), mas o comportamento (não
baixar histórico) é obrigatório.

## Casos de Borda

- **Item com `ITEM_SKU='SEM_ESTOQUE'`** → ignorado silenciosamente, sem baixa e sem
  pendência (ver Regra 1.2) — é o caminho esperado para produtos sem controle de
  estoque unitário (ex. itens "Art House"/"Casita" sem NFe).
- **Item sem SKU definido, ou SKU sem produto correspondente em `ESTOQUE`** →
  `PENDENTE_MAPEAMENTO`, não bloqueia o pedido (ver Regra 1.3). Visível em
  `pendentesMapeamento` no retorno do import.
- **Estoque insuficiente para o item** (`faltantes > 0` retornado por
  `baixarPorProduto`) → não bloqueia o pedido; soma em `faltantesEstoque` no
  retorno. Não tenta "inventar" unidade nem falha o pedido inteiro — é um sinal de
  atenção para o usuário revisar `ESTOQUE_BAIXAS`/entradas pendentes de
  sincronização.
- **Pedido com múltiplos itens, um mapeado e outro não** → o mapeado baixa
  normalmente; o não mapeado vira `PENDENTE_MAPEAMENTO`. Pedido é gravado por
  inteiro em `PEDIDOS` de qualquer forma (comportamento de import não muda).
- **Falha ao chamar `estoqueBaixa.baixarPorProduto` (ex. `ESTOQUE_LOCK_TIMEOUT`)**
  → tratado como erro não-fatal daquele item específico (soma em `errors` do
  retorno de `importShopeeOrders`, mesmo padrão de erro por item já usado), não
  derruba o import dos demais pedidos/itens.
- **Webhook (`syncOrderBySn`) e import manual (`importShopeeOrders`) processando o
  mesmo pedido quase ao mesmo tempo** → protegido pelo lock dentro de
  `estoqueBaixa.baixarPorProduto`/`reverterBaixa` (ver `specs/estoque-baixa.md`)
  mais a idempotência por `referenciaOrigem`; nenhuma baixa duplicada.
- **Pedido muda de `CANCELLED` de volta para um status ativo** (raro, mas possível
  em teoria) — fora de escopo v1; se a Shopee reportar isso, a unidade já revertida
  para `DISPONÍVEL` não é baixada de novo automaticamente (precisaria de nova
  detecção de "voltou a ativo", não coberta aqui).

## Critérios de Aceite (Given/When/Then)

1. **Baixa automática em pedido novo**
   - Given um pedido real do usuário com 1 item cujo `item_id` corresponde a um
     anúncio com `ANUNCIOS_SHOPEE.ITEM_SKU` já definido como um `codigoProduto`
     com unidades `DISPONÍVEL` em `ESTOQUE`
   - When `ordersImport.syncOrderBySn(orderSn)` processa esse pedido pela primeira
     vez
   - Then a unidade `DISPONÍVEL` mais antiga (FIFO) daquele `codigoProduto` vira
     `VENDIDO` em `ESTOQUE`, e uma linha `STATUS='BAIXADO'` aparece em
     `ESTOQUE_BAIXAS` com a referência desse pedido.

2. **Reprocessar o mesmo pedido não duplica baixa**
   - Given o pedido do critério 1, já processado uma vez
   - When `syncOrderBySn`/`importShopeeOrders` processa o mesmo `order_sn` de novo
     (mesmo status)
   - Then nenhuma unidade adicional vira `VENDIDO` (idempotência confirmada).

3. **Cancelamento reverte a baixa**
   - Given o pedido do critério 1, já com baixa registrada
   - When o status do pedido muda para `CANCELLED` numa sincronização seguinte
   - Then a unidade volta a `STATUS='DISPONÍVEL'` em `ESTOQUE`, e a linha em
     `ESTOQUE_BAIXAS` vira `STATUS='REVERTIDO'`.

4. **Item sem SKU não trava o pedido**
   - Given um pedido com um item cujo anúncio ainda tem `ANUNCIOS_SHOPEE.ITEM_SKU`
     vazio
   - When o pedido é importado
   - Then o pedido é gravado normalmente em `PEDIDOS`, o retorno do import inclui
     `pendentesMapeamento >= 1`, e uma linha `PENDENTE_MAPEAMENTO` aparece em
     `ESTOQUE_BAIXAS`.

5. **Definir o SKU depois reprocessa a pendência**
   - Given o cenário do critério 4
   - When o usuário chama `anunciosShopee.updateSku({itemId, sku:codigoProduto})`
     (via a tela de `specs/produto-anuncio-map.md`) e em seguida
     `estoqueBaixa.reprocessarPendentes()` é chamado
   - Then a baixa que estava `PENDENTE_MAPEAMENTO` é processada e a unidade
     correspondente vira `VENDIDO`.

6. **Pedido histórico não sofre baixa retroativa**
   - Given um pedido com `CREATE_TIME` anterior à data de ativação desta automação
   - When esse pedido é importado pela primeira vez depois da automação estar ativa
   - Then nenhuma baixa é disparada para ele (comportamento de corte de data
     confirmado).

7. **Item marcado sem estoque nunca gera pendência**
   - Given um item de pedido cujo anúncio tem `ANUNCIOS_SHOPEE.ITEM_SKU='SEM_ESTOQUE'`
   - When o pedido é importado
   - Then nenhuma baixa é tentada, nenhuma linha `PENDENTE_MAPEAMENTO` é criada, e
     o retorno do import não conta esse item em `pendentesMapeamento`.

## Fora de Escopo (v1)

- Mercado Livre — motor reaproveitável, mas esta spec cobre só o hook de
  `OrdersImportService` para Shopee. Extensão para ML fica para spec própria
  futura, que precisa antes investigar o schema de `list_orders`/`get_order` do ML.
- Cancelamento parcial a nível de item quando a Shopee só reporta a nível de
  pedido — reverte o pedido inteiro nesse caso (ver Regra 2).
- Notificação proativa (email/push) de `pendentesMapeamento`/`faltantesEstoque` —
  fica visível no retorno do import e nas abas, sem canal de alerta ativo nesta v1.
- Unificar `ManualSaidaService` neste mesmo motor de baixa — documentado como
  trabalho futuro recomendado no plano do projeto, não faz parte desta spec.

## Dependências

- `specs/orders-import.md` (amendment ITEMS_JSON) — **premissa não confirmada, ver
  aviso no topo**.
- `specs/anuncios-shopee.md` (amendment `ITEM_SKU`/`updateSku`) —
  `AnunciosShopeeRepository.getItem()` para ler `ITEM_SKU` por `item_id`.
- `specs/produto-anuncio-map.md` — ferramenta que o usuário usa para popular
  `ITEM_SKU` (não é uma dependência de código desta spec, é o processo que garante
  que os SKUs existam antes da baixa funcionar).
- `specs/estoque-baixa.md` — `estoqueBaixa.baixarPorProduto`/`reverterBaixa`/
  `reprocessarPendentes`.
- `src/02_repositories/EstoqueRepository.js` — checar se `CODIGO_PRODUTO` (=
  `ITEM_SKU`) existe de fato em `ESTOQUE` antes de considerar "mapeado".
- `src/03_services/ordersImport/OrdersImportService.js` (arquivo alterado, não
  novo).
- `src/03_services/pushNotification/PushNotificationService.js` (usa
  `syncOrderBySn` — nenhuma alteração direta nele, mas seu comportamento herda a
  baixa automática via `syncOrderBySn`).

## Notas de Implementação

1. **Nenhum arquivo novo** — só altera `OrdersImportService.js` (dentro de
   `normalizeOrder_`/`importShopeeOrders`/`syncOrderBySn`, no ponto onde hoje decide
   insert vs. update). `filePushOrder` não muda, mas a ordem atual já exige que
   `EstoqueBaixaService`/`EstoqueBaixasRepository` (Fase 3) e o amendment de
   `AnunciosShopeeService`/`Repository` (`ITEM_SKU`/`updateSku`) estejam
   carregados **antes** de `OrdersImportService.js` — já é o caso hoje
   (`AnunciosShopeeRepository.js`/`Service.js` vêm antes de `OrdersImportService.js`
   em `filePushOrder`); só falta inserir `EstoqueBaixaService`/
   `EstoqueBaixasRepository` (Fase 3) também antes.
2. **Implementar só depois de confirmada a premissa 1 do aviso no topo desta spec.**
3. **Ordem de implementação sugerida dentro desta fase:** primeiro a detecção de
   pedido novo → baixa (critérios 1, 2, 4, 7), depois a detecção de mudança de
   status → reversão (critério 3), depois o corte de data para histórico (critério
   6) — cada uma é testável isoladamente com pedidos reais já existentes na
   planilha do usuário.
4. **Teste de ponta a ponta recomendado:** usar 1 pedido real já `COMPLETED`/
   `SHIPPED` na planilha do usuário (não um nunca visto), definir o SKU do item
   correspondente via `anunciosShopee.updateSku` (guiado pela tela de
   `specs/produto-anuncio-map.md`), então chamar `syncOrderBySn` manualmente para
   forçar reprocessamento e observar a baixa acontecer — mais rápido que esperar um
   pedido novo real chegar.
