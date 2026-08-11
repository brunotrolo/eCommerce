# Spec: Shell (P2) — Lazy-Load do Preload

- **Status:** Implemented
- **Data:** 09/08/2026
- **Origem:** `docs/DIAGNOSTICO_ARQUITETURA.md`, item 5 (P2)

## Problema

O `Shell.html` dispara o preload no boot via `window.__DataClient.preFetch(...)`
abrangendo TODAS as rotas com dados de Sheets (13 chaves), incluindo telas que
o usuário talvez não visite (carteira, anúncios, ads). Para o requisito do
usuário "**reload = dados reais do Google Sheets**", todas as 13 entradas
carregam com `forceFresh: true` — clareza da fonte de dados primeiro;
navegação entre abas continua instantânea porque o cache client-side em
memória guarda o que o boot leu.

## Objetivo

No boot, ler os dados reais do Sheets de TODAS as rotas em paralelo
(`forceFresh: true`), de modo que qualquer aba abra sem rede (render do
cache client-side) e SEM nunca exibir dados velhos após reload. O preload
**lazy por aba** (`ROUTE_PREFETCH`, sem `forceFresh`) permanece como
segurança para navegar antes do boot terminar.

## Decisões

1. **Boot — preFetch com 13 entradas, todas com `forceFresh: true`** (fonte:
   `ui/shell/Shell.html` — atualizada 09/08/2026):

   | key | action | params |
   |---|---|---|
   | `config.config` | `config.getConfig` | `{ forceFresh: true }` |
   | `dashboard.summary` | `dashboard.getSummary` | `{ forceFresh: true }` |
   | `estoque.Items.TODOS` | `estoque.getItems` | `{ forceFresh: true }` |
   | `catalog.products.code.asc` | `catalog.getProducts` | `{ sortBy: 'code', sortOrder: 'asc', forceFresh: true }` |
   | `orders.all.30` | `orders.listUnified` | `{ marketplace: 'all', limit: 30, forceFresh: true }` |
   | `nfeEntrada.recent` | `nfeEntrada.getRecent` | `{ limit: 20, forceFresh: true }` |
   | `nfeEntradaProdutos.produtos` | `nfeEntradaProdutos.getProdutos` | `{ forceFresh: true }` |
   | `manualEntrada.listEntries` | `manualEntrada.listEntries` | `{ limit: 500, forceFresh: true }` |
   | `manualSaida.listExits` | `manualSaida.listExits` | `{ limit: 500, forceFresh: true }` |
   (removidas em 10/08/2026 junto com as páginas: `carteiraShopee.snapshot`,
   `anunciosShopee.listings`, `shopeeAds.campanhas`, `shopeeAds.balance`).

   `forceFresh` remove a key do `CacheService` no backend antes da releitura
   (services que NÃO honram `forceFresh`: sem cache server = sempre fresh;
   outros DEVS devem honrar — regra em `specs/data-client.md`).

2. **Mapa `ROUTE_PREFETCH`** (tag da rota → lista `{key, action, params}`,
   SEM `forceFresh` — só cobre o caso de navegar antes do boot terminar;
   dedupe torna o re-fetch livre):

   | Rota | Entradas de preload |
   |---|---|
   | `orders` | `orders.all.30` (`orders.listUnified`) |
   | `nfeEntrada` | `nfeEntrada.recent {limit:20}` |
   | `nfeEntradaProdutos` | `nfeEntradaProdutos.produtos {}` |
   | `manualEntrada` | `manualEntrada.listEntries {limit:500}` |
   | `manualSaida` | `manualSaida.listExits {limit:500}` |
   | `produtoSkuMap` | `produtoSkuMap.sugestoes {}` |
   | `dashboard` | fora do mapa (crítico cobre) |

   As chaves acima foram confirmadas como as que as views leem/gravam
   (grep de `__DataClient` nas views em 09/08/2026).

3. **Disparo:** dentro de `navigate()`, após trocar a rota:
   `window.__DataClient.preFetch(ROUTE_PREFETCH[tag])` — `preFetch` já ignora
   chaves cacheadas e deduplica chamadas em voo (`_fetching`); resultado
   fire-and-forget via `Promise.allSettled` (não atrapalha a aba).

4. **Views inalteradas:** nenhuma view precisa de mudança — todas já fazem
   `fetchData`/`snapshot` com fallback de cache (render imediato + fresh em
   background), então a ausência do preload ativo não quebra nada.

## Critérios de aceite

- [x] Boot dispara as 8 chaves, todas com `forceFresh: true` (dados reais
      do Sheets em todo reload). Carteira Shopee, Anúncios Shopee e Shopee
      Ads saíram do boot em 10/08/2026 (páginas removidas).
- [x] `navigate()` dispara `preFetch` das chaves da rota destino (quando a
      rota estiver no mapa), sem await/bloqueio.
- [x] Rota sem entrada no mapa não dispara nada.
- [x] Nenhuma view alterada para a navegação; aba troca instantânea no cache
      client-side (mesma sessão, acabou de ler no boot).
- [x] Includes: `DataStore.html` removido — `DataClient.html` único.

## Regressão

- Carregar app → confirmar nos logs que o boot dispara apenas as 8
  chaves listadas (chaves críticas).
- Navegar para Parear SKU → confirmar `produtoSkuMap.sugestoes` disparada na
  navegação (não no boot).
- Navegar para Dashboard a partir de outra aba → Tabela instantânea via
  cache (nothing novo disparado).