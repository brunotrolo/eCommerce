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
`OrdersService` e `DashboardService` (ambos lêem direto da Google Sheets,
sem dependência externa) e, para chamadas reais à Tiops, em
`AnunciosShopeeService` foi absorvido pelo domínio Pareamento SKU em
12/08/2026 — hoje as chamadas vivem em `ProdutoSkuMapService`; `ShopeeAdsService`
e `CarteiraShopeeService` (sucessores de `ListingsService`/`InventoryPricingService`, removidos em
09/08/2026 — ver `PLANO.md`, seção "Removidos").

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
| `shopee_update_item` | `item_id` (**number uint64 — string é rejeitado**: `cannot unmarshal string into Go struct field UpdateItemRequest.item_id of type uint64`), `item_sku` (campos no topo) | `response` ecoa o item completo com `item_sku` atualizado. Warning informativo: `gtin is a mandatory field for some category` (não bloqueia). **Sempre relevar com `shopee_get_item`** |
| `shopee_unlist_item` | `item_id`, `unlist: bool` (default true = pausar) | `response.success_list[].unlist` |
| `shopee_delete_item` | `item_id` | success/error |
| `shopee_sales_by_item` | `item_id`, `period` (e.g. "30d") | `total_orders`, `total_quantity`, `total_revenue`, `avg_price`, `orders[]` — **⚠️ payload FLAT, SEM wrapper `{data:...}`** (única ação confirmada até hoje com esse shape; `TiopsClient.call` cobre isso desde 2026-08-08) |
| `shopee_get_item_content_diagnosis_result` | `item_id` | diagnóstico de qualidade do item |

**Aviso crítico:** `shopee_sales_summary` **NÃO existe** no catálogo (citar na spec estava errado). Para agregados de vendas, somar `shopee_sales_by_item` por item ou usar `shopee_get_income_overview` (por mês). ✅ **Corrigido em 2026-08-05:** chamada removida de `OrdersImportService` (pedidos COMPLETED já são cobertos por `shopee_list_orders` com `order_status: COMPLETED` em `ALL_STATUSES`).

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

## Shopee Ads performance — confirmado em 2026-08-09

Sondagem via MCP Tiops (`shopId` = `1880105398`). **⚠️ `shopee_ads_daily_performance`
é agregado da LOJA inteira (param `shopId`) — NÃO aceita `campaign_id` e NÃO
serve para métricas por campanha.** A ação correta por campanha é
`shopee_ads_campaign_daily` (descoberto via `describe_action` + teste real;
enviar `campaign_id` scalar como param rejeita com "campaign_id_list
obrigatório").

| Ação | Params confirmados | Retorno-chave |
|---|---|---|
| `shopee_ads_campaign_daily` | `campaign_id_list` (array de ids), `start_date`, `end_date` (formato **DD-MM-YYYY**) | `data.response.campaign_list[]` — cada item tem `campaign_id` e `metrics_list[]` com `{date, impression, clicks, ctr, expense, broad_gmv, broad_order, broad_order_amount, broad_roi, cr, cpc, direct_gmv, direct_order, direct_order_amount, direct_roi, cpdc}` |

`ShopeeAdsService.syncCampaigns` usa `shopee_ads_campaign_daily` (1 chamada
com `campaign_id_list` de todas as campanhas) e agrega `metrics_list`
sombrando `broad_gmv`+`direct_gmv` (receita) e `broad_order`+`direct_order`
(conversões).

## Teste de contrato global — confirmado em 2026-08-10

Varredura de TODAS as chamadas Tiops em `src/` (31 chamadas, 30 ações únicas,
4 serviços) contra o catálogo real: `list_actions` (568 ações) +
`describe_action` em cada nome. Nenhuma ação foi assumida de memória.

| Ação | Serviço (linha do call) | Status |
|---|---|---|
| `shopee_ads_balance` | `ShopeeAdsService` :156 | ✅ catálogo |
| `shopee_ads_campaigns` | `ShopeeAdsService` :176 | ✅ catálogo |
| `shopee_ads_campaign_daily` | `ShopeeAdsService` :199 | ✅ sondagem real em 2026-08-09 (aba acima) |
| `shopee_ads_hourly_performance` | `ShopeeAdsService` :380 | ✅ catálogo |
| `shopee_ads_pause_campaign` | `ShopeeAdsService` :388 | ✅ catálogo (schema do describe é genérico; resume, abaixo, confirma `campaign_id`) |
| `shopee_ads_resume_campaign` | `ShopeeAdsService` :395 | ✅ catálogo (`campaign_id` obrigatório) |
| `shopee_ads_terminate_campaign` | `ShopeeAdsService` :402 | ❌ **404 — ação NÃO existe no catálogo** (ver divergência abaixo) |
| `shopee_ads_recommended_keywords` | `ShopeeAdsService` :409 | ✅ catálogo |
| `shopee_ads_edit_keywords` | `ShopeeAdsService` :414 | ✅ catálogo |
| `shopee_ads_delete_keywords` | `ShopeeAdsService` :423 | ✅ catálogo |
| `shopee_ads_gms_items` | `ShopeeAdsService` :432 | ✅ catálogo |
| `shopee_ads_recommended_items` | `ShopeeAdsService` :437 | ✅ catálogo |
| `shopee_ads_roi_target` | `ShopeeAdsService` :442 | ✅ catálogo |
| `list_items` (ML) | `ShopeeAdsService` :451 | ✅ catálogo (`limit`, `offset`, `status`, `account_id`/`meliUserId`) |
| `shopee_list_items` | `ProdutoSkuMapService` :146 | ✅ sondagem real 2026-08-05 |
| `shopee_get_items_batch` | `ProdutoSkuMapService` :167 | ✅ sondagem real 2026-08-05 |
| `shopee_sales_by_item` | `ProdutoSkuMapService` :182 (build), :184 (`callBatch`) | ✅ sondagem real 2026-08-05 (payload FLAT, sem `{data}`) |
| `shopee_get_models` | — (sem chamada em `src/` desde 12/08/2026 — ação removida com o domínio antigo) | ✅ sondagem real 2026-08-05 (histórica) |
| `shopee_get_item` | `ProdutoSkuMapService` :489 | ✅ sondagem real 2026-08-05 |
| `shopee_update_price` | — (sem chamada desde 12/08/2026) | ✅ sondagem real 2026-08-05 (histórica — usa `price_list[]`, releitura pós-update) |
| `shopee_update_stock` | — (sem chamada desde 12/08/2026) | ✅ sondagem real 2026-08-05 (histórica — `location_id: "BRZ"`, releitura pós-update) |
| `shopee_update_item` | `ProdutoSkuMapService` :481 (updateSku) | ✅ sondagem real 2026-08-10 (no-op item 58264575830, shopId 1880105398; `item_id` uint64 — string rejeitada; releitura pós-update) |
| `shopee_unlist_item` | — (sem chamada desde 12/08/2026) | ✅ sondagem real 2026-08-05 (histórica — releitura pós-pause; nunca em item real) |
| `shopee_delete_item` | — (sem chamada desde 12/08/2026) | ✅ sondagem real 2026-08-05 (histórica — releitura pós-delete) |
| `shopee_list_orders` | `OrdersImportService` :197 | ✅ catálogo (num pedido 08-10; usado com `order_status`) |
| `shopee_get_order_detail` | `OrdersImportService` :220 | ✅ catálogo |
| `shopee_get_escrow_detail_batch` | `OrdersImportService` :240 | ✅ catálogo |
| `shopee_get_order` | `OrdersImportService` :918 | ✅ catálogo |
| `shopee_get_wallet_transactions` | `CarteiraShopeeService` :160 | ✅ sondagem real 2026-08-05 |
| `shopee_get_escrow_list` | `CarteiraShopeeService` :202 | ✅ sondagem real 2026-08-05 |
| `shopee_get_income_overview` | `CarteiraShopeeService` :283 | ✅ sondagem real 2026-08-05 |

**Divergência AUSENTE (1):** `shopee_ads_terminate_campaign` não existe no
catálogo (404 na API real). A ação "Encerrar campanha" (irreversível) do
`ShopeeAdsView` chamava essa ação — ou seja, essa feature nunca executou de
fato e retorna erro ao usuário. Candidato mais próximo no catálogo:
`shopee_ads_edit_campaign` (existe, mas o schema do describe não expõe
parâmetros) — **não trocar por adivinhação**: verificar o schema com a Tiops
(ou sondagem real) antes de alterar o código, ou remover a feature do UI se
encerrar campanha não for um fluxo necessário.

**Obsoletas — removidas da seção "Ainda não confirmados" (2026-08-10):**
`list_orders`/`get_order` (ML), `shopee_get_shop_income`, `low_stock_items`,
`pause_item`/`activate_item` não têm nenhuma chamada em `src/` — os serviços
que as usavam (`OrdersService`, `DashboardService`, `ListingsService`,
`InventoryPricingService`) foram removidos em 09/08/2026; hoje leem direto
da Google Sheets. Se reaparecerem no código, reconfirmar antes de usar.

## Ecommerce Optimization Ações — confirmado em 2026-08-11

Skill de suporte `ecommerce-optimization` (ver `.claude/skills/ecommerce-optimization/SKILL.md`) que valida e orienta otimizações de anúncios Shopee/Mercado Livre.
**A skill é advisory + gating, não executa mudanças sozinha.** Ações Tiops usadas por referência (quando e se skill recomenda integração futura):

| Ação | Contexto | Status |
|---|---|---|
| `shopee_get_item`, `shopee_update_item`, `shopee_update_price`, `shopee_update_stock` | Pre-flight checks antes de otimização (validar estado atual do item) | ✅ confirmadas em seção "Anuncios Shopee" acima |
| `ml_get_item`, `ml_update_item` (via `update_item` ML) | Pre-flight checks antes de otimização (validar estado atual do item) | ✅ confirmadas em seção anterior |
| `shopee_list_items`, `get_items` (ML) | Listar itens para diagnóstico de buzzwords/preço/descrição em lote | ✅ confirmadas em seções anteriores |

**Importante:** a skill valida **contra estas regras de negócio** (não Tiops API):
1. Sem buzzwords em títulos (detecta palavras de `docs/MARKETING_BUZZWORDS.md`)
2. Preço requer justificativa (escalation se delta >15% ou manual override)
3. Descrição: intervenções menores only (>70% content overlap via Jaccard)
4. Promoções data-driven ou user-requested (nunca inventadas)

Essas regras são **ortogonais** às validações de contrato Tiops — a skill **não faz chamadas Tiops**; apenas analisa conteúdo e recomenda. Se integração futura exigir chamadas (e.g., aplicar mudanças validadas), as ações serão `shopee_update_item`/`ml_update_item` com pre-flight check (post-flight verify obrigatória).
