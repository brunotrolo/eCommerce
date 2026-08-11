# Arquitetura do Projeto

## Status
Reference — documento vivo, único ponto de referência para arquitetura de
backend (micro-serviços GAS), frontend (micro-frontends) e design system.
Atualize-o sempre que a arquitetura mudar de fato; não deixe divergir do
código real.

Para regras de negócio e contrato de API de um domínio específico (ex.:
como a margem Shopee é calculada, quais parâmetros `estoque.getItems`
aceita), a fonte de verdade é o próprio código-fonte do serviço (cada
`src/03_services/<domínio>/*.js` expõe `describe()` com o schema real) —
as 28 specs de domínio que existiam aqui foram removidas em 09/08/2026 por
já estarem implementadas e, portanto, sem valor de referência contínua
(mesmo raciocínio já aplicado a `docs/historico/`). Ao iniciar um domínio
**novo**, o gate de SDD continua valendo: siga a skill `spec-first`
(`AGENTS.md`, regra nº 1) e crie `specs/<domínio>.md` a partir de
`specs/_TEMPLATE.md` antes de implementar.

---

## 1. Arquitetura de back-end (micro-serviços em GAS)

Google Apps Script não tem ES modules — todo arquivo `.js` cai no mesmo
escopo global. O projeto organiza isso em camadas de dependência estrita,
carregadas na ordem exata definida por `filePushOrder` em `.clasp.json`
(GAS carregaria alfabeticamente por padrão, o que quebraria referências
entre namespaces):

```
src/00_config/          ConfigService — sem dependências
src/01_adapters/         DriveAdapter, TiopsClient — só usam Config
src/02_repositories/     PropertiesRepository, CacheRepository, SheetsRepository
src/03_services/<domínio>/  LoggingService primeiro, depois os serviços de negócio
src/04_gateway/          ServiceRegistry.js + Router.js — usam todos os serviços
src/99_Main.js           Entrypoint (menu + smoke tests)
```

Regras de camada (from `AGENTS.md`):
- **`src/04_gateway/Router.js`** é o único arquivo com `doGet`/`doPost`. Toda
  chamada (HTTP externa ou `google.script.run` da UI) passa por
  `apiDispatch(action, params)` → `ServiceRegistry.dispatch`.
- **`src/01_adapters/TiopsClient.js`** é o único ponto que chama
  `UrlFetchApp` para a Tiops — nenhum serviço deve fazer isso diretamente.
- **`src/02_repositories/*`** são os únicos arquivos que chamam
  `PropertiesService`/`CacheService`/`SpreadsheetApp` diretamente.
- Nada de `UrlFetchApp`/`PropertiesService`/`CacheService`/`SpreadsheetApp`
  fora de `01_adapters`/`02_repositories` (item do Definition of Done).

Cada domínio expõe `describe()` (ações + schema, no espírito do
`list_actions`/`describe_action` da própria Tiops) e é registrado em
`ServiceRegistry.js` com o padrão defensivo
`safeRef_('nome', function(){ return typeof X !== 'undefined' ? X : undefined; })`
— um serviço quebrado não derruba `doGet()` do app inteiro.

**Domínios reais hoje** (chave de dispatch em `ServiceRegistry.js`): `config`,
`pricing`, `orders`, `dashboard`, `nfeEntrada`, `nfeEntradaProdutos`,
`calculator`, `logging`, `catalog`, `system`, `manualEntrada`, `manualSaida`,
`estoque`, `estoqueBaixa`, `ordersImport`, `pushNotification`,
`anunciosShopee`, `produtoSkuMap`, `sku`. (`listings` e
`inventoryPricing` foram removidos em 09/08/2026 — sucedidos por
`anunciosShopee`/`carteiraShopee`; `carteiraShopee` e `shopeeAds` foram
removidos em 10/08/2026 junto com as páginas, e `anunciosShopee` foi
contraído para `syncListings`/`updateSku` — o repository segue sendo a fonte
de `item_sku` para a baixa de estoque de pedidos.)

Convenção de namespace: um identificador global por arquivo
(`var NomeService = (function(){...})();`), sempre `var` no top-level
(`const` duplicado entre arquivos = `SyntaxError` global), nunca chamar outro
namespace dentro do IIFE de topo — só dentro dos métodos retornados.

### Ordem de carregamento (`filePushOrder`)

| Camada | Pode depender de | NÃO pode depender de |
|--------|-------------------|------------------------|
| 0: Config | nada | tudo |
| 1: Adapters | Config | Repositories, Services, Gateway |
| 2: Repositories | Config, Adapters | Services, Gateway |
| 3a: Logging | Config, Adapters, Repositories | Outros serviços |
| 3b: Services (negócio) | Config, Adapters, Repositories, Logging | Gateway, Main |
| 4: Gateway | tudo (menos Main) | Main |
| 5: Main | tudo | nada |

Ao criar `NovoDominio/NovoService.js`: identifique as dependências reais
(quais `Service.method()` ele chama), insira em `filePushOrder` **após**
todas elas, e teste com `clasp push` — a skill `gas-ops` valida
automaticamente que `filePushOrder` existe e cobre todo `.js` do projeto
antes de cada push, bloqueando se faltar algo.

### DAG de dependências entre serviços (verificada em 09/08/2026)

A DAG abaixo é a fonte de verdade do acoplamento **permitido** entre
domínios. Uma dependência não listada aqui é proibida sem decisão explícita
— se um fluxo novo precisar de outra, atualize esta tabela (e o
`filePushOrder`) no mesmo commit. Regra geral em `AGENTS.md`:
**domínio só consome repos próprios + utilitários** (`Logging`, `Pricing`,
`Sku`, `Formatter`) **+ motores designados explicitamente** (`EstoqueBaixa`
= motor FIFO de baixa).

| Domínio (consumidor) | Depende de (domínios/utilitários) | Tipo |
|---|---|---|
| `catalog` | `PricingService`, `SkuService` | utilitários (motor único de margem) |
| `estoque` | `PricingService`, `CatalogService` | utilitário + leitura de catálogo |
| `manualEntrada` | `SkuService`, `EstoqueService`, `CatalogService` | utilitário + motores designados |
| `manualSaida` | `EstoqueBaixaService`, `CatalogService`, `SkuService` | motor FIFO + leitura catálogo |
| `ordersImport` | `EstoqueBaixaService` | motor FIFO (baixa/reverter) |
| `dashboard` | `OrdersService` | leitura de pedidos |
| `pushNotification` | `OrdersImportService` | orquestração de sync (unidirecional) |
| `estoqueBaixa` | — (motor puro + repos) | — |
| `anunciosShopee` | — (Tiops + repos) | — |

**Importante:** não há ciclos hoje. `ordersImport ↔ pushNotification` é
unidirecional (`push → sync`); a referência comentada a
`PushNotificationService` dentro de `OrdersImportService` é só comentário
de explicação, não chamada real.

---

## 2. Arquitetura de micro-frontends

Cada tela é um **Web Component independente com Shadow DOM**, sem build
step e sem duplicação de CSS:

- `ui/shared/DesignSystemLoader.html` constrói um único `CSSStyleSheet` a
  partir do bloco `<style id="design-tokens-source">` de
  `ui/shared/Styles.html` via `sheet.replaceSync(...)` e expõe em
  `window.__DESIGN_SHEET__`.
- Todo widget faz `shadow.adoptedStyleSheets = [window.__DESIGN_SHEET__]`
  ao montar — mesma fonte de tokens para todas as telas, sem CDN, sem CSS-
  in-JS.
- `ui/shell/Shell.html` mantém a navegação estática e um `<main id="app-view">`.
  `ROUTES` mapeia nome de rota → tag do custom element (ex.:
  `dashboard: 'dashboard-widget'`). `navigate(route)` limpa `#app-view` e
  faz `document.createElement(ROUTES[route])` — cada rota é um Web
  Component isolado, montado sob demanda.
- Cada view parcial (`ui/<domínio>/<Nome>View.html`) é injetada no HTML
  final via `<?!= include('ui/<domínio>/<Nome>View'); ?>` no `Shell.html`
  (server-side, `HtmlService`).

**Regra de ouro de UI:** nunca duplicar o design system existente
(`ui/shared/Styles.html` + Shadow DOM) por Tailwind via CDN ou qualquer
outra solução — ver §4.

### Cache client-side e pré-carregamento (`window.__DataClient`)

`ui/shared/DataClient.html` é o arquivo ÚNICO de dados do cliente: `_cache`
em memória + `_fetching` (mapa de promises em voo, evita corrida se duas
partes da UI pedem a mesma chave ao mesmo tempo) + unwrap único do envelope
+ dedupe + SWR. (A antiga `DataStore.html` foi consolidada nele e removida.)

API: `fetchData(action, params, opts)` (cache TTL 60s + stale-while-
revalidate), `mutateData` (escrita, invalida o domínio por prefixo),
`snapshot` (render do cache sem rede), `get(key)`,
`invalidate(key)`, `preFetch(entries)` (paralelo via `Promise.allSettled`).

No boot, `Shell.html` chama `preFetch([...])` com TODAS as ações de Sheets,
todas com `forceFresh: true` (reload = dados reais do Google Sheets; o
backend remove a key do `CacheService` e relê) — isso é o que garante que,
ao abrir cada página na mesma sessão, os dados já estejam disponíveis no
cache client-side (sincronismo em background com a planilha, sem esperar o
clique do usuário):

```
config.getConfig, dashboard.getSummary, nfeEntrada.getRecent,
nfeEntradaProdutos.getProdutos, catalog.getProducts, orders.listUnified,
estoque.getItems, manualEntrada.listEntries, manualSaida.listExits
```

Cada `*View.html` segue o mesmo padrão de skip-fetch: render do cache
client-side (`fetchData` resolve na hora / `snapshot` antes do network) e o
refresh em background mantém a frescura; botões "Atualizar" chamam
`invalidate()` antes de re-buscar. Ao adicionar uma tela nova, usar o
`DataClient` (nunca `google.script.run` direto) e adicionar a ação principal
dela ao array de `preFetch` do `Shell.html` com `forceFresh: true`.

---

## 3. Performance, cache de servidor e integração

### Cache de servidor (`CacheRepository`)

Wrapper único sobre `CacheService.getScriptCache()` — nenhum outro arquivo
deve chamar `CacheService` diretamente:
- `DEFAULT_TTL_SECONDS = 300` (5 min).
- `get(key)` / `set(key, value, ttlSeconds)` / `remove(key)` /
  `getOrCompute(key, ttlSeconds, computeFn)` (só computa em cache miss).
- Toda chave gravada é rastreada num registro em `PropertiesService`
  (`__CACHE_ACTIVE_KEYS__`), o que viabiliza
  `invalidateByPattern(pattern)` — remove todas as chaves cacheadas cujo
  nome contém `pattern` como substring, reescrevendo o registro com as
  sobreviventes.
- **Isso só funciona para chaves gravadas via `CacheRepository.set()`** —
  nunca usar `CacheService.getScriptCache()` cru num serviço, ou
  `invalidateByPattern` não vai encontrar a chave.

Convenção de nomes de chave: `<domínio>_<algo>` com underscore (ex.:
`dashboard_summary`, `shopee_ads_campaigns`), para que
`invalidateByPattern('dashboard_')` etc. funcione de forma previsível. Todo
fluxo de escrita (import de NF, pedido manual, sync de ads) deve invalidar
os caches de leitura afetados (`catalog_*`, `dashboard_*`, `estoque_*`) ao
final — releitura por cache stale é a causa mais comum de "dado não
atualiza na tela".

### Escrita em lote (`EstoqueRepository` e equivalentes)

Sheets API cobra uma chamada de rede por `getRange`/`setValues` — iterar
IDs chamando `updateRow()` por item vira N leituras + N escritas. O padrão
correto:
- `updateRow(sheetId, id, updates)` — 1 item: 1 leitura (scan pelo ID) + 1
  escrita. Uso pontual, nunca dentro de loop.
- `updateRowsBulk(sheetId, ids, sameUpdates)` — mesmas `updates` para
  vários IDs: 1 leitura da coluna de IDs + 1 leitura do range completo, tudo
  mutado em memória, 1 `setValues` cobrindo o range inteiro.
- `updateRowsBulkPerRow(sheetId, [{id, updates}])` — updates diferentes por
  linha: mesmo princípio, 1 leitura + 1 escrita para o lote inteiro.

Qualquer novo fluxo que precise atualizar múltiplas linhas de uma vez deve
usar uma dessas variantes — nunca um loop de `updateRow()`.

### Integração com marketplaces (Tiops)

Endpoint único `POST https://mcp.tiops.com.br` com corpo
`{action, params}` e `Authorization: Bearer <TIOPS_API_KEY>`
(`PropertiesService.getScriptProperties()`), chamado só por
`TiopsClient.call()` — nenhum serviço deve montar essa chamada por conta
própria. Antes de usar uma ação nova (`TiopsClient.call(action, params)`),
confirme nome e schema contra o catálogo real
(`list_actions`/`describe_action`) em vez de assumir — regra completa na
skill `tiops-contract`; contratos já confirmados ficam registrados em
`docs/referencia/CONTRATOS_CONFIRMADOS.md`.

### CI e Deploy

Todo PR para `main` roda `.github/workflows/ci.yml`: valida JSON de
`.clasp.json`/`appsscript.json`, que `filePushOrder` cobre exatamente
`src/**/*.js` (nem faltando, nem sobrando arquivo deletado) e sintaxe de
cada `.js` (`node --check`) — scripts em `.github/scripts/`, sem
dependências externas. Isso pega antes do merge o erro mais comum do
projeto: arquivo novo sem entrada em `filePushOrder`, que antes só
quebrava silenciosamente na ordem alfabética do GAS.

Ordem obrigatória: `git commit` → `git push origin main` → CI
(`.github/workflows/deploy.yml`) roda a mesma validação e, se passar,
`clasp push --force`, que só atualiza a versão `/dev` (HEAD) do Apps
Script. GitHub é a fonte de verdade — nunca editar direto no editor do
Apps Script. **`clasp deploy` nunca é executado por um agente** — criar
uma versão pública é ação manual e consciente do usuário na UI do Apps
Script (isso também é o que torna o rollback fácil: o HEAD em `/dev` pode
quebrar e ser corrigido por um novo push sem afetar quem usa a versão
publicada). `clasp login` é OAuth interativo, só humano, uma vez.

---

## 4. Design system

Fonte única de tokens: `ui/shared/Styles.html` (mapeados a partir de uma
análise de design Mintlify). Web Components consomem via
`shadow.adoptedStyleSheets` (§2) — nunca duplicar valores em CSS local.

**Cores (tema claro, `:root`)**
| Token | Valor |
|---|---|
| `--color-bg` / `--color-surface` | `#ffffff` |
| `--color-surface-hover` / `--color-surface-alt` | `#f7f7f7` |
| `--color-border` | `#e5e5e5` |
| `--color-border-light` | `#ededed` |
| `--color-disabled` | `#a8a8aa` |
| `--color-text` | `#0a0a0a` |
| `--color-text-secondary` | `#5a5a5c` |
| `--color-text-tertiary` | `#888888` |
| `--color-primary` | `#0a0a0a` (hover `#1c1c1e`, active `#000000`, light `rgba(10,10,10,.06)`) |
| `--color-on-primary` | `#ffffff` |
| `--color-accent` | `#00d4a4` (deep `#00b48a`, soft `rgba(0,212,164,.14)`) |
| success / warning / error / info | `#00b48a`/`#c37d0d`/`#d45656`/`#3772cf` (cada um com variante `-text` mais escura e `-light` em rgba) |
| Shopee | `#ee4d2d` |
| Mercado Livre | `#ffe600` (light `#fffbcc`, text `#3d3d00`, blue `#2968c8`) |

Tema escuro via `@media (prefers-color-scheme: dark)` e
`:root[data-theme="dark"]`: bg `#0a0a0a`, surface `#1c1c1e`, `--color-primary`
inverte para branco, semânticas mantêm o matiz com alpha/text ajustados,
Mercado Livre vira `#ffd966`/text `#ffe08a`.

**Tipografia**: `--font-family-base: Inter, -apple-system, ...`;
`--font-family-mono: "SF Mono", Menlo, ...`. Tamanhos: xs 12px, sm/base 14px,
md 16px, lg 18px, xl 24px, 2xl 32px. Pesos: regular 400, medium 500,
semibold 600, bold 700. Line-height: tight 1.3, normal/base 1.5, relaxed 1.6,
heading 1.25.

**Espaçamento** (base 4px): xs 4, sm 8, md 12, lg 16, xl 24, 2xl 32, 3xl 48;
aliases semânticos `--space-element` (16px), `--space-card` (24px),
`--space-section` (48px).

**Raios**: xs 4, sm 6, md 8, lg 12, xl 16, xxl 24, full 9999px — pills
(botões e badges) sempre usam `full`.

**Sombras**: sm `0 1px 2px rgba(0,0,0,.04)`, md `0 4px 12px rgba(0,0,0,.08)`,
lg `0 24px 48px -8px rgba(0,0,0,.12)`, brand `0 8px 24px rgba(0,212,164,.08)`
(tema escuro redefine as quatro com alpha maior).

**Z-index**: base 1, dropdown 100, modal 1000, tooltip 1100, notification 1200.

**Classes de componente já disponíveis** (não recriar do zero):
`.card`, `.panel`, `.btn` (+ `.btn-secondary`,
`.btn-tertiary`, `.btn--ghost`, `.loading`), `.form-field` (+ `.error`),
`.table`/`.table-container`, `.badge` (success/warning/error/info/
primary/secondary/shopee/mercado-livre — sempre ícone + cor, nunca cor
sozinha), `.alert` (success/warning/error|danger/info +
`.alert-dismiss`), `.stat-grid`/`.stat-card` (+ `--featured`/`--warning`/
`--success`), `.filter-bar`, `.page-actions`/`.page-subtitle`/
`.page-summary`/`.card-hint`/`.filter-label`/`.status-text`, `.result-card`,
`.widget-grid`/`.card-row`, `.app-shell`/`.app-nav`/`.nav-dropdown*`
(específicos do shell).

**Padrão de layout de página** (ordem fixa, ver comentário
"PAGE LAYOUT PADRÃO" em `Styles.html`): `<h1>` → `.page-subtitle` →
`.page-actions` → `.filter-bar` → `.page-summary` → tabela.
