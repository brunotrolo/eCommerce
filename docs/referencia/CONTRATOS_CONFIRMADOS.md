# Contratos Tiops confirmados

Registro do que já foi **verificado contra a API real** (via
`list_accounts`/`describe_action`), com data. Consulte aqui antes de gastar
uma chamada de catálogo — e adicione a linha nova sempre que confirmar algo.

## Contas conectadas — confirmado em 2026-08-02

| Marketplace | ID | Param a usar na chamada |
|---|---|---|
| Mercado Livre | `3520412809` | `meliUserId` |
| Shopee | `1880105398` | `shopId` |

O ID da conta **não** é inferido pelo servidor quando você tem mais de uma
conta conectada: toda ação precisa receber explicitamente `meliUserId` ou
`shopId`. Aliases aceitos para o ML: `account_id`, `meliUserId`,
`meli_user_id`.

`ConfigService.getAccountId()` já devolve exatamente esses dois IDs, e os
serviços já passam o nome de param correto por canal — verificado em
`OrdersService`, `ListingsService`, `InventoryPricingService` e
`DashboardService`. Dados lidos direto da Google Sheets, sem dependência externa.

## Observações do catálogo — confirmado em 2026-08-02

- `get_item`/`list_items` (ML) trazem `logistic_type` na raiz do retorno.
  Valores: `fulfillment` (FULL), `xd_drop_off` (envio próprio),
  `cross_docking`, `self_service` (coleta), `flex`, `me1`/`me2`.

## ⚠️ Validade dos tokens de marketplace

| Conta | `expires_at` |
|---|---|
| Mercado Livre | **2026-08-02T03:24Z** |
| Shopee | 2027-07-14T01:57Z |

O token do Mercado Livre expira/expirou em 02/08/2026. Se as chamadas de ML
começarem a falhar com erro de autenticação, a causa mais provável é essa —
reconecte a conta em <https://marketplaces.tiops.com.br> antes de investigar o
código. Isso é renovação de conexão do marketplace na Tiops, não envolve
nenhuma API key no Apps Script (Tiops é um MCP usado apenas pelo Claude Code).

## Carteira Shopee — confirmado em 2026-08-05

Sondagem via MCP Tiops (`shopId` = `1880105398`). Datas de filtro aceitas como
**epoch seconds** (milissegundos rejeitam). Confirmado por resposta real:

| Ação | Params confirmados | Retorno-chave |
|---|---|---|
| `shopee_get_wallet_transactions` | `page_size` (e `shopId`) | `transaction_list[]` (transaction_id, status, amount, current_balance, create_time epoch, description, order_sn, money_flow) |
| `shopee_get_income_overview` | `timestamp` (epoch, fim do mês) + `shop_id` | `response.total_income.released_amount` |
| `shopee_get_escrow_list` | `release_time_from`, `release_time_to` (epoch), `page_size` | `response.escrow_list[]` (escrow_release_time epoch, order_sn, payout_amount) + `more` |

**Regra de negócio (fonte: open.shopee.com docs):** `get_payout_info` e
`get_payout_detail` são exclusivas de sellers **Cross Border (CB)**. A loja
deste projeto é **local BR** — essas chamadas sempre falham (erro genérico de
`page_size` mascarado). Para loja local BR o "payout" = liberação de escrow
(`get_escrow_list`) + entrada na carteira (`get_wallet_transactions`).
`get_payout_detail` é deprecated (substituída por `get_payout_info`).

**Divergências abertas (não forçar nome — pedir `describe_action` ao Claude Code):**

| Ação | Síndrome observada | Suspeita |
|---|---|---|
| `shopee_get_payout_info` | Sempre `error_param: "Invalid or missing page_size"` mesmo enviando `page_size`/`page_no`/`limit`/`offset` em todas as formas | Wrapper Tiops provavelmente lê a paginação de outro lugar (top-level do payload, não `params`) ou exige `describe_action` para nome exato |

## Ainda não confirmados

Estas ações são usadas pelo código mas **não** tiveram nome e schema
verificados contra o catálogo. Confirme na Fase correspondente do `PLANO.md`:

| Ação | Usada em | Fase |
|---|---|---|
| `list_orders`, `get_order` (ML) | `OrdersService` | 3 |
| `shopee_list_orders`, `shopee_get_order_detail` | `OrdersService` | 3 |
| `shopee_get_shop_income` | `DashboardService` | 2 |
| `low_stock_items` | `DashboardService` | 2 |
| `list_items`, `shopee_list_items` | `ListingsService` | 4 |
| `pause_item`, `activate_item` | `ListingsService` | 4 |
| `shopee_update_price`, `shopee_update_stock` | `InventoryPricingService` | 5 |
