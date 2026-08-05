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

## Anuncios Shopee — confirmado em 2026-08-05

Sondagem via MCP Tiops (`shopId` = `1880105398`). Item sem variação usa `model_id: 0` e `location_id: "BRZ"`. Status mapping: `NORMAL`→ativo, `UNLIST`→pausado, `BANNED`→deletado.

| Ação | Params confirmados | Retorno-chave |
|---|---|---|
| `shopee_list_items` | `page_size, offset` (opcional) | `response.item[]` (item_id, item_status, update_time epoch, item_url), `total_count`, `has_next_page`, `next_offset` |
| `shopee_get_item` | `item_id` | `response.item_list[0]`: item_id, item_name, category_id, item_status, `price_info[0]`{currency, original_price, current_price}, `image.image_url_list[0]`, item_url, `stock_info_v2.summary_info.total_available_stock`, `has_model` (bool variações), create_time, update_time (epoch), `brand.original_brand_name`, item_sku, gtin_code |
| `shopee_get_items_batch` | `item_id_list` (array) — **mesmo payload de `shopee_get_item`, em lote** | `response.item_list[]` com os mesmos campos de `shopee_get_item`. Ideal para sync performático (1 chamada/N itens) |
| `shopee_get_models` | `item_id` | `response.tier_variation[]`, `response.model[]` (cada model: `model_id`, `model_name`, `normal_price`, `stock_info_v2`) — vazio para item sem variação |
| `shopee_update_price` | `item_id`, `price_list:[{model_id, original_price, price}]` | `response.success_list[].original_price`, `failure_list` |
| `shopee_update_stock` | `item_id`, `stock_list:[{model_id, seller_stock:[{location_id:"BRZ", stock:N}]}]` | `response.success_list[].stock`, `failure_list` |
| `shopee_unlist_item` | `item_id`, `unlist: bool` (default true = pausar) | `response.success_list[].unlist` |
| `shopee_delete_item` | `item_id` | success/error |
| `shopee_sales_by_item` | `item_id`, `period` (e.g. "30d") | `total_orders`, `total_quantity`, `total_revenue`, `avg_price`, `orders[]` |
| `shopee_get_item_content_diagnosis_result` | `item_id` | diagnóstico de qualidade do item |

**Aviso crítico:** `shopee_sales_summary` **NÃO existe** no catálogo (citar na spec estava errado). Para agregados de vendas, somar `shopee_sales_by_item` por item ou usar `shopee_get_income_overview` (por mês).

**Não testar `shopee_unlist_item`/`shopee_delete_item` em item real** — resposta 200 com `success_list` causa estado real de pause/delete imediato. Use `item_id` fake ou só `describe_action` para sondar.

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
