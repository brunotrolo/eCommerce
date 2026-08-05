# Spec: Push Mechanism (Webhooks Shopee)

## Status
Approved

## Objetivo
Receber notificações em tempo real da Shopee quando o status de um pedido
mudar (pagamento, envio, cancelamento, entrega), atualizando a aba PEDIDOS
sem depender só do polling manual do botão "Sincronizar Pedidos Shopee". O
push entrega apenas `order_sn` + `status` — o serviço busca o detalhe
completo na Tiops e faz upsert na planilha, mantendo a mesma fonte de
verdade do `ordersImport`.

## Contrato da API Interna

### `pushNotification.handlePush`
- **Descrição:** Processa um push da Shopee (validado por secret). Busca o
  detalhe completo do pedido via `OrdersImportService.syncOrderBySn` e
  atualiza/insere na planilha. Chamado pelo Router (doPost) — não é pensado
  para uso direto pela UI.
- **Params:**
  | Nome | Tipo | Obrigatório | Default | Descrição |
  |------|------|-------------|---------|-----------|
  | `body` | object | Sim | — | Corpo do push (JSON já parseado) |
  | `secret` | string | Não | '' | Secret de validação (query param da callback URL) |
- **Retorno:**
  ```javascript
  {
    success: boolean,
    orderSn: string,       // order_sn extraído do push
    pushStatus: string,    // status que a Shopee reportou
    syncStatus: string,    // status que ficou salvo na planilha
    inserted: number,      // 1 se pedido novo
    updated: number        // 1 se linha existente atualizada
  }
  ```
- **Erros esperados (throw → HTTP 500 → Shopee reenvia):**
  - `WEBHOOK_SECRET_NOT_CONFIGURED`: secret não cadastrado em Script Properties.
  - `INVALID_WEBHOOK_SECRET`: secret recebido não bate com o cadastrado.
  - `PUSH_WITHOUT_ORDER_SN`: corpo sem `order_sn` (nem `data.order_sn`).
  - Falhas da Tiops/Sheets propagadas do `syncOrderBySn`.

### `pushNotification.setWebhookSecret`
- **Descrição:** Grava o secret do webhook em Script Properties
  (`SHOPEE_WEBHOOK_SECRET`). O mesmo valor deve ser anexado à callback URL
  configurada no console Shopee (`?secret=<valor>`).
- **Params:**
  | Nome | Tipo | Obrigatório | Descrição |
  |------|------|-------------|-----------|
  | `secret` | string | Sim | Mínimo 8 caracteres |
- **Retorno:** `{ success: true }`

### `pushNotification.getWebhookConfig`
- **Descrição:** Informa se o webhook está configurado e qual callback URL
  usar. **Nunca retorna o secret em si.**
- **Params:** {}
- **Retorno:**
  ```javascript
  { configured: boolean, callbackUrl: string }
  ```

## Regras de Negócio

1. **Detecção no Router (`doPost`):** um POST sem campo `action` mas com
   `order_sn`/`status` (ou `data.order_sn`/`data.status`) é tratado como push
   da Shopee — nunca passa pelo `apiDispatch`.
2. **Validação de segurança:** GAS `doPost(e)` não expõe headers de requisição,
   então a assinatura `Authorization` que a Shopee envia **não pode ser
   conferida**. Mitigação: secret em query param da callback URL
   (`?secret=`), comparado contra `SHOPEE_WEBHOOK_SECRET` em Script
   Properties. Vale a global `webhook.secret`.
   - Secret não configurado → rejeita com 500 (evita aceitar pushes "no escuro").
   - Secret divergente → rejeita com 500 (Shopee reenvia e faz log de WARN).
3. **Resposta à Shopee:** em caso de sucesso responder HTTP 2xx com corpo
   vazio (`ACK`). Em erro, `throw` → GAS responde 500 → Shopee reenvia.
4. **Estado nunca confia no push:** o push só dispara; o status salvo vem de
   `shopee_get_order_detail` (releitura — ver AGENTS.md, regras de marketplace).
5. **Upsert:** pedido inexistente → insere linha nova; existente → atualiza
   todas as colunas da linha (via `syncOrderBySn`), incluindo status.

## Casos de Borda

- **Push duplicado / reenvio da Shopee:** idempotente — segunda vez apenas
  atualiza a mesma linha.
- **Push para pedido de outro canal:** `syncOrderBySn` consulta a Shopee; se
  o SN não existe lá, retorna erro do detail e o push é reprocessado.
- **Status que não está no `STATUS_LABELS`:** o valor bruto ainda é gravado
  na planilha; a UI mostra o bruto como fallback.
- **Secret trocado sem atualizar a URL no console Shopee:** pushes passam a
  falhar validação (500) — corrigir a URL da callback.
- **Body com `action` + `order_sn`:** tratado como API dispatch normal (a
  detecção exige ausência de `action`).

## Critérios de Aceite (Given/When/Then)

1. **Caso: push válido de pedido existente**
   - Given pedido `A` na planilha com STATUS `READY_TO_SHIP` e secret correto
   - When Shopee envia `{order_sn: "A", status: "SHIPPED"}`
   - Then a linha de `A` fica com STATUS `SHIPPED` e `handlePush` retorna
     `{success: true, updated: 1}`; resposta HTTP 200.
2. **Caso: push de pedido novo**
   - Given pedido `B` não está na planilha
   - When Shopee envia `{order_sn: "B", status: "UNPAID"}`
   - Then uma linha nova é criada para `B` com todos os campos do detail
     (`inserted: 1`).
3. **Caso: secret inválido**
   - Given `SHOPEE_WEBHOOK_SECRET` = "abc" e push com `?secret=x`
   - When `handlePush` é chamado
   - Then lança `INVALID_WEBHOOK_SECRET` (HTTP 500) e nada é alterado na
     planilha.
4. **Caso: corpo sem order_sn**
   - Given push sem `order_sn` em qualquer nível
   - When `handlePush` é chamado
   - Then lança `PUSH_WITHOUT_ORDER_SN`, sem efeitos na planilha.
5. **Caso: body com action**
   - Given POST `{action: "orders.list", params: {...}}`
   - When `doPost` processa
   - Then vai para `apiDispatch` normal (não trata como push).

## Fora de Escopo

- Webhooks do Mercado Livre (só Shopee v1).
- Verificação da assinatura `Authorization`/`X-Callback-Signature` (GAS não
  expõe headers no `doPost`).
- Fila de reprocessamento/retry com backoff (depende do reenvio da Shopee).
- Configuração da callback URL dentro do painel (feita no console Shopee).

## Dependências

- **Services usados:**
  - `OrdersImportService.syncOrderBySn(orderSn)` — busca detail + escrow e
    upsert na planilha.
  - `PropertiesRepository.getScriptProperty/setScriptProperty` — guarda o
    secret (sem expor a propriedade em logs).
  - `LoggingService.log(...)` — auditoria de cada push.

- **Ações Tiops (via syncOrderBySn):**
  - `shopee_get_order_detail` — detalhe completo do pedido.
  - `shopee_get_escrow_detail_batch` — dados financeiros (para 1 SN).

## Notas de Implementação

1. **Modificação no Router.js (`doPost`):** adicionar detecção
   `isShopeePush_(body)` antes do dispatch; respondere `ACK` em texto puro.
2. **Registro no ServiceRegistry:** padrão defensivo
   `safeRef_('pushNotification', ...)`.
3. **filePushOrder:** inserir `pushNotification/PushNotificationService.js`
   **depois** de `ordersImport/OrdersImportService.js` (usa seus métodos).
4. **Secret** em Script Properties com key `SHOPEE_WEBHOOK_SECRET`; a UI não
   mostra o valor depois de salvo.
5. Smoke test `runPushSmokeTests_()` cobre extração de campos de push nos
   dois formatos (top-level e `data.*`).