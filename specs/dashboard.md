# Spec: Dashboard Unificado

## Status
Approved

## Objetivo
Visão consolidada, na tela inicial, de pedidos recentes das duas lojas,
receita da Shopee e alertas de estoque baixo — sem precisar abrir os dois
apps oficiais separadamente.

## Contrato da API Interna

### `dashboard.getSummary`
- Descrição: resumo unificado, cacheado por 5 minutos (`CacheRepository`).
- Params: nenhum.
- Retorno: `{ orders: OrderSummary[], shopeeIncome: object, lowStock: ListingSummary[], fromCache: boolean }`.
- Erros esperados: propaga erros do Tiops (token expirado, cota) como `{error}`.

## Regras de Negócio
- `orders`: os 10 pedidos mais recentes de `orders.listUnified({marketplace: 'all', limit: 10})`.
- `shopeeIncome`: chamada direta a `shopee_get_shop_income` (não passa por `OrdersService`, é dado financeiro agregado da própria Shopee).
- `lowStock`: qualquer listing (dos dois canais) com `stock <= 3`, via `ListingsService.listUnified`.
- Cache: 5 minutos, chave `dashboard_summary`. Uma segunda chamada dentro da janela retorna do cache (`fromCache: true`), sem nova ida ao Tiops.

## Casos de Borda
- Erro em qualquer chamada agregada (`OrdersService`, `shopee_get_shop_income`, `ListingsService`) propaga como erro único do `getSummary` — a UI mostra o erro em vez de um dashboard parcial silenciosamente errado.
- Nenhum pedido/listing encontrado → arrays vazios, não erro.

## Critérios de Aceite (Given/When/Then)
- Given a primeira chamada do dia When `dashboard.getSummary` é chamado Then `fromCache = false` e os dados vêm direto do Tiops.
- Given uma segunda chamada em menos de 5 minutos When `dashboard.getSummary` é chamado novamente Then `fromCache = true` e nenhuma nova chamada ao Tiops é feita.
- Given um item com `stock = 2` em qualquer canal When o dashboard carrega Then esse item aparece em `lowStock`.

## Fora de Escopo (v1)
- Gráficos de tendência histórica (fica para uma iteração com `dataviz`).
- ROI de campanhas de ads (fora do escopo funcional da v1 já definido).

## Dependências
- `OrdersService.listUnified`, `ListingsService.listUnified`, `CacheRepository`.
- Ações Tiops: `list_orders`, `shopee_list_orders`, `shopee_get_shop_income`, `list_items`, `shopee_list_items`.
