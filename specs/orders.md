# Spec: Pedidos

## Status
Approved

## Objetivo
Listar e detalhar pedidos de Shopee e Mercado Livre num formato normalizado
único, para não precisar saber o shape específico de cada API ao consumir
na UI.

## Contrato da API Interna

### `orders.listUnified`
- Params: `marketplace` (`all`\|`shopee`\|`mercado_livre`, default `all`), `limit` (default 20).
- Retorno: `{ orders: [{ id, marketplace, status, total, buyerName, createdAt }] }`.

### `orders.getDetail`
- Params: `marketplace` (obrigatório), `orderId` (obrigatório).
- Retorno: `{ order: <objeto bruto do canal> }` — detalhe não é normalizado (uso interno/depuração; a normalização vale para a listagem).

## Regras de Negócio
- Mercado Livre: `list_orders` com `meliUserId`; `get_order` com `order_id`.
- Shopee: `shopee_list_orders` com `shopId`; `shopee_get_order` com `order_sn`.
- Normalização de `listUnified`: `id` sempre string; `total` é `total_amount` (ML) ou `total_amount` (Shopee); `buyerName` vem de `buyer.nickname`/`first_name` (ML) ou `buyer_username` (Shopee).

## Casos de Borda
- `marketplace=all`: erro em um canal não deve descartar os resultados do outro — se necessário, decisão de v1 é deixar propagar o erro (ver nota); revisar se algum canal cair com frequência.
- Resposta vazia/`null` de qualquer canal → tratada como lista vazia, nunca `undefined`/exceção.

## Critérios de Aceite (Given/When/Then)
- Given `marketplace=mercado_livre` When `listUnified` é chamado Then só pedidos do ML aparecem, normalizados.
- Given `marketplace=shopee` When `listUnified` é chamado Then só pedidos da Shopee aparecem, normalizados.
- Given um pedido real de cada canal When `getDetail` é chamado com o `orderId` certo Then os dados batem com o app oficial.

## Fora de Escopo (v1)
- Ações de pedido (cancelar, gerar etiqueta) — só leitura na v1.
- Paginação além do `limit` simples.

## Dependências
- `TiopsClient`, `ConfigService.getAccountId`.
- Ações Tiops: `list_orders`, `get_order`, `shopee_list_orders`, `shopee_get_order`.
- Usado por `DashboardService.computeSummary_`.
