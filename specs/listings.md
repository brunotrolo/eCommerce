# Spec: Anúncios / Listings

## Status
Implemented

## Objetivo
Listar, detalhar, pausar e ativar anúncios das duas lojas, aplicando as
regras já validadas nos playbooks (`docs/referencia/SHOPEE_CRIAR_ANUNCIO.md`,
`docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md`) para não redescobrir as mesmas pegadinhas.

## Contrato da API Interna

### `listings.listUnified`
- Params: `marketplace` (`all`\|`shopee`\|`mercado_livre`, default `all`).
- Retorno: `{ listings: [{ id, marketplace, title, price, stock, status }] }`.

### `listings.getDetail`
- Params: `marketplace`, `itemId` (ambos obrigatórios).
- Retorno: `{ listing: <objeto bruto do canal> }`. Sempre relido em tempo real, nunca cacheado.

### `listings.pause` / `listings.activate`
- Params: `marketplace`, `itemId` (ambos obrigatórios).
- Retorno: `{ success: true, listing: <releitura via getDetail> }`.

## Regras de Negócio (extraídas dos playbooks — não redescobrir)
- **Mercado Livre**: `pause_item`/`activate_item` usam `itemId` (camelCase) — inconsistente com `create_item`, que usa snake_case. Nunca enviar `title` na criação (fora do escopo desta spec, mas vale registrar aqui também).
- **Shopee**: `original_price` + `seller_stock` obrigatórios além de `price`/`stock` (ver `inventory-pricing.md`). `logistic_id`, nunca `logistics_channel_id`. Criação usa `images: [...]` (array); atualização usa `image: {image_id_list: [...]}` (objeto) — nunca confundir os dois. `.webp` é rejeitado — trocar por `.jpg` na URL.
- **Regra de ouro (ambos os canais)**: nunca confiar na resposta de `update_item`/`pause_item`/`activate_item` para confirmar o novo estado — sempre reler com `getDetail` (`get_item`/`shopee_get_item`) depois.

## Casos de Borda
- Título de exibição do ML pode divergir do campo `title` retornado pela API — não usar para exibição sem checar o `permalink` (nota herdada do playbook; a v1 exibe `title || family_name` cru, ciente da limitação).
- Estoque/preço da Shopee vêm de estruturas aninhadas (`price_info.current_price`, `stock_info_v2.summary_info.total_available_stock`) — normalizar sempre, nunca acessar direto na UI.

## Critérios de Aceite (Given/When/Then)
- Given um anúncio ativo real When `pause` é chamado Then o app oficial mostra o anúncio pausado e `getDetail` confirma o novo status.
- Given um anúncio pausado real When `activate` é chamado Then o app oficial mostra o anúncio ativo novamente.
- Given `marketplace=all` When `listUnified` é chamado Then anúncios de ambos os canais aparecem normalizados no mesmo formato.

## Fora de Escopo (v1)
- Criação de anúncio novo (upload de imagem, categoria/atributos obrigatórios, marca) — fica para uma iteração seguinte; v1 cobre listar/detalhar/pausar/ativar.
- Edição de campos além do que `inventory-pricing.md` cobre (preço/estoque).

## Dependências
- `TiopsClient`, `ConfigService.getAccountId`.
- Ações Tiops: `list_items`, `get_item`, `pause_item`, `activate_item`, `shopee_list_items`, `shopee_get_item`, `shopee_update_item`, `shopee_unlist_item`.
- Usado por `DashboardService.findLowStock_` e por `InventoryPricingService`.
