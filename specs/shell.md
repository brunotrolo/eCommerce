# Spec: Shell (P2) — Lazy-Load do Preload

- **Status:** Implemented
- **Data:** 09/08/2026
- **Origem:** `docs/DIAGNOSTICO_ARQUITETURA.md`, item 5 (P2)

## Problema

O `Shell.html` dispara o preload de **13 chaves** do DataStore no boot
(`window.__DataStore.preFetch(...)`), incluindo telas que o usuário talvez
não visite (carteira, anúncios, ads). Em rotas de rede lentas (decisão de
mercado: clareza da fonte de dados > latência de cache) essas chamadas são
feitas mesmo sem necessidade, alongando o primeiro paint e a fila do
esperado por outras abas.

## Objetivo

Preload crítico mínimo no boot (5 chaves, todas de telas da primeira dobra)
+ preload **lazy por aba** disparado na navegação, fire-and-forget, sem
bloquear a renderização da aba destino.

## Decisões

1. **Boot:** `preFetch` reduzido para 5 entradas:
   | key | action | params |
   |---|---|---|
   | `config.config` | `config.getConfig` | `{}` |
   | `dashboard.summary` | `dashboard.getSummary` | `{}` |
   | `estoque.Items.TODOS` | `estoque.getItems` | `{}` |
   | `catalog.products.code.asc` | `catalog.getProducts` | `{ sortBy: 'code', sortOrder: 'asc' }` |
   | `orders.all.30` | `orders.getRecent` | `{ limit: 30 }` |

2. **Mapa `ROUTE_PREFETCH`** (tag da rota → lista `{key, action, params}`):
   | Rota | Entradas de preload |
   |---|---|
   | `orders` | `orders.all.30` (`orders.listUnified`) |
   | `nfeEntrada` | `nfeEntrada.recent {limit:20}` |
   | `nfeEntradaProdutos` | `nfeEntradaProdutos.produtos {}` |
   | `manualEntrada` | `manualEntrada.listEntries {limit:500}` |
   | `manualSaida` | `manualSaida.listExits {limit:500}` |
   | `carteiraShopee` | `carteiraShopee.snapshot {}` |
   | `anunciosShopee` | `anunciosShopee.listings {}` |
   | `shopeeAds` | `shopeeAds.campanhas {}` + `shopeeAds.balance {}` |
   | `dashboard` | fora do mapa (crítico cobre) |

   As chaves acima foram confirmadas como as que as views leem/gravam
   (grep de `__DataStore` nas views em 09/08/2026).

3. **Disparo:** dentro de `navigate()`, após trocar a rota:
   `window.__DataStore.preFetch(ROUTE_PREFETCH[tag])` — `preFetch` já ignora
   chaves cacheadas e deduplica chamadas em voo (`_fetching`); resultado
   fire-and-forget via `Promise.allSettled` (não atrapalha a aba).

4. **Views inalteradas:** nenhuma view precisa de mudança — todas já fazem
   `getOrFetch` com fallback de cache (render imediato + fresh em
   background), então a ausência do preload ativo não quebra nada.

## Critérios de aceite

- [x] Boot dispara apenas as 5 chaves críticas.
- [x] `navigate()` dispara `preFetch` das chaves da rota destino (quando a
      rota estiver no mapa), sem await/bloqueio.
- [x] Rota sem entrada no mapa não dispara nada.
- [x] Nenhuma view alterada; navegação para todas as 9 telas continua igual.
- [x] `Formatters`/`UiHelpers`/`DataStore` includes intactos (nada removido).

## Regressão

- Carregar app → confirmar no DebugConsole que apenas 5 chamadas de boot
  acontecem (chaves críticas).
- Navegar para Shopee Ads → confirmar `shopeeAds.campanhas` e
  `shopeeAds.balance` disparadas na navegação (não no boot).
- Navegar para Dashboard a partir de outra aba → Tabela instantânea via
  cache (nothing novo disparado).