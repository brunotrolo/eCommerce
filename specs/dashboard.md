# Spec: Dashboard Unificado

## Status
Implemented

## Objetivo
Visão consolidada, na tela inicial, de pedidos recentes das duas lojas e
vendas por canal — sem precisar abrir os dois apps oficiais separadamente.

## Contrato da API Interna

### `dashboard.getSummary`
- Descrição: resumo unificado, cacheado por 5 minutos (`CacheRepository`).
- Params: nenhum.
- Retorno: `{ orders: OrderSummary[], salesByChannel: { shopee: {gmv, orders}, mercado_livre: {gmv, orders} }, fromCache: boolean }`.

### `dashboard.getSyncOrder`
- Descrição: retorna a ordem das ações de sincronização da aba CONFIG (chave
  `sincronizar`).
- Params: nenhum.
- Retorno: `{ steps: string[] }`.

## Regras de Negócio
- `orders`: os 10 pedidos mais recentes de `orders.listUnified({marketplace: 'all', limit: 10})`.
- `salesByChannel`: soma do GMV por canal (Shopee / Mercado Livre), excluindo
  pedidos cancelados (`CANCELLED`, `IN_CANCEL`, `TO_RETURN`).
- Cache: 5 minutos, chave `dashboard_summary`. Uma segunda chamada dentro da
  janela retorna do cache (`fromCache: true`), sem nova ida ao Tiops.

### Ordem de sincronização (`getSyncOrder`)
- Lista padrão (usada quando a CONFIG ainda não tem valor):
  `nfeEntrada.syncAndUpdateSheets` → `estoque.sincronizar` →
  `estoque.sincronizarPrecosCatalogo` → `anunciosShopee.syncListings` →
  `ordersImport.importShopeeOrders` → `carteiraShopee.syncWallet`.
- **Garantia (desde 09/08/2026):** mesmo que a CONFIG tenha um valor antigo
  sem a etapa de pedidos, `getSyncOrder` sempre insere
  `ordersImport.importShopeeOrders` (logo após
  `estoque.sincronizarPrecosCatalogo` quando presente; senão no fim). Isso
  garante que a sincronização "Tudo" da UI nunca pule a importação de pedidos.

## Casos de Borda
- Erro em qualquer chamada agregada (`OrdersService`) propaga como erro único
  do `getSummary` — a UI mostra o erro em vez de um dashboard parcial
  silenciosamente errado.
- Nenhum pedido encontrado → arrays vazios, não erro.
- Config `sincronizar` inválida/inexistente → lista padrão completa.

## Critérios de Aceite (Given/When/Then)
- Given a primeira chamada do dia When `dashboard.getSummary` é chamado Then `fromCache = false` e os dados vêm direto do Tiops.
- Given uma segunda chamada em menos de 5 minutos When `dashboard.getSummary` é chamado novamente Then `fromCache = true` e nenhuma nova chamada ao Tiops é feita.
- Given CONFIG.sincronizar sem `ordersImport.importShopeeOrders` When `dashboard.getSyncOrder` é chamado Then a etapa de pedidos está presente (sem duplicatas).

## Fora de Escopo (v1)
- Gráficos de tendência histórica (fica para uma iteração com `dataviz`).
- ROI de campanhas de ads (fora do escopo funcional da v1 já definido).

## Dependências
- `OrdersService.listUnified`, `ConfigService.get('sincronizar')`, `CacheRepository`.
- Ações Tiops: `list_orders`, `shopee_list_orders`.