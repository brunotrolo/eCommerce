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
