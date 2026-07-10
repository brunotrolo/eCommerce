# MCP Tiops — Guia de Uso

> **Para um novo chat:** Este arquivo contém as instruções para explorar ao máximo o MCP Tiops e operar na Shopee e Mercado Livre. Comece aqui.

## O Que É

MCP Tiops dá acesso a **260+ ações** de marketplaces (Mercado Livre, Shopee, Shein, Bling, Olist) através da ferramenta `mcp__Tiops__marketplace_action`. Em vez de navegar no site, você executa ações diretamente e recebe o resultado em tempo real.

## Suas Contas Conectadas

```
Mercado Livre: meliUserId = 3520412809
Shopee:        shopId     = 1880105398
```

Sempre confirme os IDs atuais executando a ação `list_accounts`.

---

## Instruções Para Explorar o MCP ao Máximo

Siga esta ordem em um novo chat para descobrir e usar tudo que está disponível:

### 1. Descubra suas contas
Execute `list_accounts`. Retorna cada conta conectada com o `param_to_use` (ex: `meliUserId`, `shopId`) e o `value` a usar nas próximas ações.

### 2. Descubra todas as ações
Execute `list_actions`. Retorna as 260+ ações com nome, descrição e marketplace. Use isto para saber exatamente qual ação existe — **nunca invente nomes de ação**.

### 3. Entenda os parâmetros de uma ação
Antes de chamar qualquer ação nova, execute `describe_action` com `{ action_name: "nome_da_acao" }`. Retorna o schema: parâmetros obrigatórios, opcionais, tipos e valores permitidos.

### 4. Execute a ação
Com os parâmetros certos em mãos, chame a ação. Se der erro, a mensagem geralmente diz o que falta — corrija e tente de novo.

**Regra de ouro:** `list_accounts` → `list_actions` → `describe_action` → executar. Esse fluxo evita a maioria dos erros.

---

## Instruções de Uso Oficiais (documentação Tiops)

Fonte: https://marketplaces.tiops.com.br/docs/api.html

### Autenticação
Chave API obtida no dashboard, aba **"Agentes IA"** (formato `mc_live_XXXXXX`). Enviada via header:
- `Authorization: Bearer mc_live_XXXXXX`, ou
- `x-api-key: mc_live_XXXXXX`

> Ao usar a ferramenta `mcp__Tiops__marketplace_action`, a autenticação já está configurada — você só informa `action` e `params`.

### Endpoint
```
POST https://mcp.tiops.com.br
```

### Formato da Requisição
```json
{
  "action": "action_name",
  "params": { }
}
```

### Formato da Resposta
- **Sucesso:** `{ "status": 200, "data": { ... } }`
- **Erro:** `{ "error": "mensagem" }`

### Parâmetro Identificador Por Marketplace
| Marketplace | Parâmetro | Exemplo |
|-------------|-----------|---------|
| Mercado Livre | `meliUserId` | `3520412809` |
| Shopee | `shopId` | `1880105398` |
| Shein | `supplierId` | `2507079` |
| Bling | `authUserId` | atribuído automaticamente |

---

## Referência de Ações

### Sistema
| Action | Descrição | Params |
|--------|-----------|--------|
| `list_accounts` | Contas conectadas (ML, Shopee, Shein, Bling, Olist) | — |
| `list_actions` | Todas 260+ actions disponíveis | — |
| `describe_action` | Schema e parâmetros de uma action | `action_name` |
| `credits_status` | Saldo, plano, ações usadas no dia | — |
| `me` | Info da conta conectada | — |
| `marketplace_action` | Executa qualquer ação do catálogo | `action` + `params` |

> 🆕 **Agentes IA:** Use `list_accounts` para ver contas + `param_to_use`. Cada conta tem tags para controle de acesso. Use `list_actions` para descobrir todas ações disponíveis.

### Mercado Livre — Anúncios
| Action | Descrição | Principais Params |
|--------|-----------|-------------------|
| `list_items` | Listar anúncios | `limit`, `offset`, `meliUserId` |
| `get_item` | Detalhes do anúncio | `item_id` |
| `create_item` | Criar anúncio | `title`, `category_id`, `price`, `pictures`, `meliUserId` |
| `update_item` | Editar anúncio | `item_id`, campos a alterar |
| `search` | Buscar anúncios | `query` |
| `find_similar` | Clonar anúncio similar | `item_id` |
| `pause_item` / `activate_item` | Pausar/ativar | `item_id` |
| `update_price` | Atualizar preço | `item_id`, `price` |
| `update_stock` | Atualizar estoque | `item_id`, `available_quantity` |
| `get_description` | Ler descrição | `item_id` |
| `update_description` | Editar descrição | `item_id`, `text` |
| `ml_visits` | Métricas de visita | `item_id` |
| `ml_list_questions` | Perguntas recebidas (filtros, ordenação, paginação) | `item_id`, `seller_id`, `status`, `offset`, `limit`, `sort_fields`, `sort_types` |
| `ml_get_question` | Detalhes de pergunta por ID | `question_id` |
| `ml_ask_question` | Fazer pergunta sobre item (como comprador) | `item_id`, `text` |
| `ml_answer_question` | Responder pergunta | `question_id`, `text` |
| `ml_delete_question` | Excluir pergunta | `question_id` |
| `ml_blocked_question_users` | Usuários bloqueados de perguntar | `user_id`, `offset`, `limit` |
| `list_orders` | Pedidos | `meliUserId`, `limit` |
| `get_order` | Detalhes do pedido | `order_id` |
| `get_shipment` | Rastrear envio | `shipment_id` |
| `search_categories` | Buscar categorias | `query` |
| `category_attributes` | Atributos da categoria | `category_id` |

> **+60 ações ML** — use `list_actions` para ver todas.

### Mercado Livre — Ads
| Action | Descrição |
|--------|-----------|
| `ml_ads_get_ad` | Consultar campanha |
| `ml_ads_create_campaign` | Criar campanha |
| `ml_ads_update_campaign` | Editar campanha |
| `ml_ads_update_ad` | Atualizar anúncio na campanha |

> ⚠️ **ML Ads:** somente leitura no momento. Escrita aguardando liberação do Developer Partner.

### Shopee — Produtos
| Action | Descrição | Principais Params |
|--------|-----------|-------------------|
| `shopee_shop` | Info da loja (retorna `shop_id`) | `shopId` |
| `shopee_list_items` | Listar produtos | `shopId`, `page_size`, `offset` |
| `shopee_get_item` | Detalhes do produto | `shopId`, `item_id` |
| `shopee_create_item` | Criar produto | `shopId`, `name`, `description`, `price`, `category_id`, `image` |
| `shopee_update_item` | Editar produto | `shopId`, `item_id` |
| `shopee_update_price` | Atualizar preço | `shopId`, `item_id`, `price` |
| `shopee_update_stock` | Atualizar estoque | `shopId`, `item_id`, `stock` |
| `shopee_unlist_item` | Desativar produto | `shopId`, `item_id` |
| `shopee_get_categories` | Listar categorias | `shopId`, `language` |
| `shopee_get_attributes` | Atributos da categoria | `shopId`, `category_id` |
| `shopee_get_brand_list` | Lista de marcas | `shopId`, `category_id` |
| `shopee_get_logistics_channels` | Canais de envio | `shopId` |
| `shopee_get_models` | Variações do produto | `shopId`, `item_id` |
| `shopee_init_variation` | Criar variação | `shopId`, `item_id` |

### Shopee — Pedidos
| Action | Descrição |
|--------|-----------|
| `shopee_list_orders` | Listar pedidos (filtro: status, data) |
| `shopee_list_orders_detail` | Pedidos com itens detalhados |
| `shopee_get_order` | Detalhes do pedido |
| `shopee_ship_order` | Gerar etiqueta/envio |
| `shopee_get_tracking_number` | Rastrear pedido |
| `shopee_sales_summary` | Resumo de vendas (dias, status) |
| `shopee_sales_by_item` | Vendas por produto |
| `shopee_search_orders` | Buscar pedidos |

### Shopee — Financeiro
| Action | Descrição |
|--------|-----------|
| `shopee_get_shop_income` | Receita da loja |
| `shopee_get_payout_info` | Informações de pagamento |
| `shopee_get_billing_transaction_info` | Transações financeiras |

### Shopee — Ads (PRO)
| Action | Descrição |
|--------|-----------|
| `shopee_ads_daily_performance` | Performance diária |
| `shopee_ads_campaign_daily` | Campanhas por dia |
| `shopee_ads_keyword_list` | Keywords da campanha |
| `shopee_ads_create_keyword` | Criar keyword |
| `shopee_ads_update_keyword` | Atualizar keyword |
| `shopee_ads_delete_keyword` | Remover keyword |
| `shopee_ads_update_budget` | Atualizar orçamento |
| `shopee_ads_get_report` | Relatórios de ads |

### Shopee — Chat
| Action | Descrição |
|--------|-----------|
| `shopee_get_chat_messages` | Mensagens de compradores |
| `shopee_send_chat_message` | Responder comprador |

### Shopee — Devoluções
| Action | Descrição |
|--------|-----------|
| `shopee_get_return_list` | Lista de devoluções |
| `shopee_get_return_detail` | Detalhes da devolução |

### Olist
| Action | Descrição |
|--------|-----------|
| `olist_get_pedidos` | Listar pedidos |
| `olist_get_produtos` | Listar produtos |
| `olist_post_envios_calcular` | Calcular frete |
| `olist_post_envios_contratar` | Contratar envio |

> **178 ações Olist** via `erp_olist_*` — use `list_actions` para todas.

### Shopee Afiliados
| Action | Descrição |
|--------|-----------|
| `shopee_affiliates_search_products` | Buscar produtos para afiliação |
| `shopee_affiliates_generate_link` | Gerar link de afiliado |

---

## Erros
| Erro | Causa |
|------|-------|
| API key inválida | Chave errada ou revogada |
| Token expirado | Reconectar marketplace no painel |
| Limite diário atingido | Verifique seu plano no painel |
| Ação desconhecida | Use `list_actions` para ver nomes corretos |
| Credits insuficientes | Comprar créditos no painel |

> 📖 **Dica:** Use `list_actions` para ver todas 260+ ações. Use `describe_action` com `action_name` para ver parâmetros obrigatórios antes de chamar qualquer ação nova.

---

## Fluxo de Trabalho Típico

1. **`list_accounts`** — pegar os IDs das contas
2. **`list_actions`** — ver o que é possível fazer
3. **`describe_action`** — entender os parâmetros da ação escolhida
4. **Executar** — chamar a ação com os parâmetros corretos
5. **Verificar** — ler `data` na resposta; se `error`, corrigir e repetir

---

**Última atualização:** 2026-07-10
**Contas ativas:** Mercado Livre + Shopee
