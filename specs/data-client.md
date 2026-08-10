# Spec: DataClient — camada única de dados no cliente

## Status
Implemented

## Objetivo

Padronizar TODA interação de dados entre as views (`ui/**/*View.html`) e o
backend GAS (`apiDispatch`). Antes, cada view resolvia do seu jeito: 8
variantes de unwrap do envelope, 4 abordagens de erro, 3 padrões de cache
(`DataStore.getOrFetch`, cache manual `has/get/set`, sem cache) e 2
assinaturas incompatíveis de `withLoading` — o que causava páginas que
"aparecem e outras não" (ex.: resposta `{error}` interpretada como lista
vazia) e política de cache divergente por tela.

O DataClient substitui o `DataStore` client-side (`ui/shared/DataStore.html`
mantém a API antiga delegando ao DataClient, para não quebrar código
existente). Ele NÃO cria acesso a Sheets no cliente: toda leitura/escrita
continua passando por `google.script.run.apiDispatch` → Router →
ServiceRegistry → Repositories. Ele é a fonte única de unwrap, erro, cache,
dedupe de chamadas em voo e invalidação.

## Contrato da API

`window.__DataClient` — exposto por `ui/shared/DataClient.html` (script no
escopo global da página, carregado antes das views no Shell.html).

### `fetchData(action, params, opts)`

- Descrição: busca dados do backend com cache client-side automático
  (TTL 60s + stale-while-revalidate por padrão).
- Params:
  | nome | tipo | obrigatório | default | descrição |
  |---|---|---|---|---|
  | action | string | sim | — | ação no formato `dominio.action` (ex.: `estoque.getItems`) |
  | params | object | não | `{}` | params da ação |
  | opts.cache | boolean | não | `true` | usa cache client-side; `false` = sempre busca fresh e atualiza o cache |
  | opts.key | string | não | derivada | chave de cache. Derivação: `dc.<action>.<hash dos params>`. Para params vazios: `dc.<action>@default` |
  | opts.maxAge | number (ms) | não | 60000 | frescor do cache antes de considerar stale |
  | opts.staleWhileRevalidate | boolean | não | `true` | cache stale resolve imediato + refresh em background |
  | opts.root | Element | não | — | ShadowRoot da view; se informado, erro é exibido via `showError(root, msg)` automaticamente |
  | opts.timeoutMs | number | não | 90000 | tempo limite da chamada de rede |
  | opts.retries | number | não | 1 | retries automáticos em falha transiente (leituras) |
- Retorno: **Promise que resolve o `data` desembrulhado do envelope** (1
  unwrap único). Se o envelope contiver `error`, a promise **rejeita** com
  `Error(message)` — nunca resolve com objeto de erro para a view
  interpretar como lista vazia.
- Erros: rejeita `Error` com a mensagem do backend (envelope `error`) ou
  mensagem de falha de comunicação (`withFailureHandler`).
- Comportamentos:
  - Dedupe: chamadas concorrentes com a mesma key compartilham a mesma
    promise em voo.
  - Cache faltante → busca → `set(key, data)` → resolve.
  - Cache fresco → resolve imediatamente.
  - Cache stale → resolve imediatamente (stale) + refresh em background
    (notifica listeners ao completar; falha de background é silenciosa e
    mantém o stale).
  - `opts.root` + erro primário → `showError(root, message)` automático e
    rejeita.

### `snapshot(action, params, opts)`

- Descrição: resolve com o dado em cache (ou `null`) SEM bater rede —
  render instantâneo no `connectedCallback`; fresh vem de `fetchData`/
  `subscribe` em background.
- Retorno: `data | null` (síncrono).

### `subscribe(prefix, cb)`

- Descrição: registra callback para re-render quando refreshes em
  background (ou `set`/invalidação com prefixo) completarem.
- `cb(key, data)` — `data === null` = invalidação/falha de background.
- Retorno: função unsubscribe.

### `mutateData(action, params, opts)`

- Descrição: escrita (gravar/editar/deletar) SEM cache client-side; invalida
  automaticamente as keys de cache que casam com o prefixo do domínio.
- Params:
  | nome | tipo | obrigatório | default | descrição |
  |---|---|---|---|---|
  | action | string | sim | — | ação de escrita (`dominio.action`) |
  | params | object | não | `{}` | params da ação |
  | opts.invalidatePrefix | string \| array | não | derivado | prefixo(s) a invalidar. Derivado: parte antes do `.` da action (ex.: `estoque` invalida `dc.estoque...`) |
  | opts.root | Element | não | — | se informado, erro exibido via `showError` |
- Retorno: Promise que resolve com `response.data` desembrulhado.
- Erros: rejeita `Error` (mesmo contrato do `fetchData`).
- Comportamento: resolve → `invalidateByPrefix(prefixo)` → resolve data.

### `invalidate(key)`

- Descrição: remove uma chave específica do cache client-side.
- Retorno: `void`.

### `invalidateByPrefix(prefix)`

- Descrição: remove todas as keys que começam com `prefix` (ex.:
  `invalidateByPrefix('estoque')` limpa `dc.estoque.getItems@default`,
  `dc.estoque.getItems.codigo=X`, etc.). Convenção: toda key é
  `dc.<dominio>...`.
- Retorno: `void`.

### `preFetch(entries)`

- Descrição: busca N entradas em paralelo no startup (substitui o preFetch
  do DataStore). Dedupe e erro tolerante (`allSettled`): falha de 1 entrada
  não derruba as outras — a view que precisar vê o erro no fetch próprio.
- Params: `[{action, params, key?}]`.
- Retorno: Promise que resolve com os resultados (nunca rejeita; erros por
  entrada ficam visíveis quando a view faz `fetchData` individual).

### `unwrap(response)` (público, read-only helpers)

- Descrição: aplica o unwrap padrão do envelope GAS em uma resposta já
  retornada (para código legacy que ainda tem `withSuccessHandler` manual).
- Regras:
  1. `response.error` → retorna `null` + flag de erro (use as promises do
     DataClient; este método é só de transição).
  2. `response.data && response.data.data !== undefined` → `response.data.data`
  3. `response.data !== undefined` → `response.data`
  4. senão → `response`

## Arquitetura de Performance (DataClient — fonte única)

Validade para TODA página/componente — não existe decisão de performance
por view:

1. **Cache em memória com TTL + STALE-WHILE-REVALIDATE (default on)**:
   - `maxAge` default 60s. Cache fresco resolve imediato (zero rede).
   - Cache expirado: resolve com o dado stale IMEDIATAMENTE (navegação
     instantânea) e dispara refresh em background; quando termina, atualiza
     o cache e notifica listeners. A UI nunca espera rede para pintar.
2. **Dedupe em voo**: N chamadas concorrentes à mesma key = 1 rede, 1
   promise compartilhada (cliques rápidos entre abas não geram rajada).
3. **Snapshot**: `snapshot(action, params, opts)` resolve o que existe em
   cache (ou null) SEM rede — render imediato no `connectedCallback`; o
   refresh é fetchData/subscribe em background.
4. **Listeners por prefixo**: `subscribe('estoque', cb)` — a view re-renderiza
   quando o refresh em background completa, em vez de re-buscar sozinha.
   Erro de background notifica `cb(key, null)` e NÃO derruba a UI já pintada
   (o stale continua valendo até o próximo ciclo).
5. **Timeout de segurança**: `fetchData` rejeita após 90s (default;
   `opts.timeoutMs` por chamada) — nenhuma página fica presa para sempre.
6. **Retry idempotente**: leituras têm 1 retry automático em falha
   transiente (timeout/rede). Escritas (`mutateData`) retries=0 — nunca
   repetir efeito colateral.
7. **Escrita invalida o domínio inteiro**: `mutateData` → `invalidateByPrefix`
   automático; dados velhos nunca sobrevivem a uma escrita.
8. **preFetch total no boot**: o Shell dispara no startup TODAS as rotas
   com dados de Sheets em paralelo (`allSettled`) — ao navegar, a view
   encontra o cache pronto e renderiza instantâneo; o SWR mantém a
   frescura. `ROUTE_PREFETCH` por aba continua como segurança quando o
   usuário navega antes do boot terminar (dedupe torna o re-fetch livre).
   `logging.flushLogs` roda 1x no fim da rajada.
9. **Server-side cache é otimização, não requisito**: `CacheRepository.set`
   tem guard de 100KB (skip silencioso, nunca lança). Payload grande
   (catálogo, estoque, produtos) é comprimido com **gzip + base64**
   (`GZ1:` prefix) para caber nos 100KB do CacheService — sem isso,
   conjuntos grandes furariam o guard e bateriam no Sheets em todo load.
   O cliente (memória) cobre o resto.
10. **Erro nunca vira lista vazia e nunca trava a tela**: erro de leitura
    primária rejeita + `#error-box`; erro de background é silencioso com
    stale preservado.

## Regras de Negócio

1. **Fonte única de unwrap**: nenhuma view define `_unwrap`/unwrap próprio.
   Toda view usa `fetchData`/`mutateData` (ou `unwrap` na transição).
2. **Erro nunca vira lista vazia**: se o envelope tem `error`, a promise
   rejeita e (com `opts.root`) o erro aparece em `#error-box` — a view que
   interpreta `data.items`/`data.produtos` como vazio só recebe data de
   verdade.
3. **Escrita sempre invalida**: após `mutateData`, o prefixo do domínio é
   invalidado automaticamente — elimina keys órfãs
   (ex.: `carteiraShopee.summary` invalidada mas nunca usada) e o
   esquecimento de invalidar após update.
4. **Convenção de keys**: todas as keys client-side começam com `dc.`.
5. **Nenhum acesso a Sheets no cliente**: DataClient chama
   `google.script.run.apiDispatch` — nada de SpreadsheetApp/UrlFetchApp no
   browser.
6. **Cache server-side (CacheService, 100KB/limite) não é fonte de verdade
   para erro**: CacheRepository.set nunca lança em payload grande (skip
   silencioso) — cache server é otimização, não requisito de corretude.

## Casos de Borda

- Envelope `{error: 'msg'}` → rejeita `Error('msg')`; com `root`, exibe em
  `#error-box`. Nunca resolve.
- Envelope `{data: {data: [...]}}` → resolve `[...]` (ninho duplo).
- Envelope `{data: {items, total}}` → resolve `{items, total}` (view usa
  `data.items`).
- Resposta `null`/undefined sem erro → rejeita `Error('Nenhuma resposta do
  servidor.')`.
- `google.script.run` falha (TimeoutException etc.) → rejeita com
  `err.message`.
- Chamadas concorrentes à mesma key → 1 chamada de rede, 1 promise
  compartilhada.
- `mutateData` seguido de `fetchData` da mesma key → segundo fetch refaz a
  busca (cache invalidado).
- `fetchData(..., {cache:false})` durante `fetchData(..., cache:true)` da
  mesma key: o busca fresh não resolve a promise em voo; cada chamada tem seu
  comportamento.

## Critérios de Aceite (Given/When/Then)

- Given uma view que chama `fetchData('estoque.getItems')` e o backend
  responde `{error: 'Sheet ID não configurado.'}`
  Then a promise rejeita E `#error-box` exibe a mensagem — a view NUNCA
  mostra "Nenhum item encontrado".
- Given duas views acessando a mesma key de cache
  Then ambas veem o MESMO dado cacheado (sem keys divergentes por view).
- Given `mutateData('estoque.updateItem', ...)` e posterior
  `fetchData('estoque.getItems')`
  Then o fetch refaz a busca (invalidação por prefixo `estoque`).
- Given 15 views migradas
  Then nenhuma view contém `_unwrap` próprio, `google.script.run` direto
  (fora DataClient/transição sinalizada), cache manual `has/get/set` ou
  `withLoading` local duplicado.
- Given o backend caindo (failure handler)
  Then todas as views mostram o erro padronizado em `#error-box` (via root).

## Fora de Escopo

- Backend (`ServiceRegistry`, Router, Repositories): já centralizado; não
  muda neste spec.
- Padronizar o ENVELOPE server-side (`{ok,data,error}`): decisão separada,
  não bloqueia o DataClient (o unwrap trata os formatos atuais).
- Novas features de cache (TTL por domínio, cache persistente em
  localStorage): se vierem, entram como ação nova neste spec.

## Dependências

- `ui/shared/UiHelpers.html` — `showError`/`showSuccess` (incluído antes do
  DataClient no Shell.html).
- `ui/shared/DataStore.html` — mantém compat: delega `getOrFetch`/`preFetch`
  ao DataClient (sem duplicar unwrap).
- `google.script.run.apiDispatch` — único ponto de rede (Router GAS).
- Nenhuma ação Tiops nova (DataClient é agnóstico de action).

## Notas de Implementação

- Arquivo novo `ui/shared/DataClient.html` (Web Component NÃO — script
  global, mesmo padrão do DataStore).
- `DataStore.html` vira delegate fino: `window.__DataStore` expõe a mesma
  API chamando `window.__DataClient` por baixo (sem `_unwrap` próprio).
- Views migradas em ondas; cada onda = 1 commit. Onda 1: views que já usam
  `getOrFetch` (Estoque, NFeEntrada, NFeEntradaProdutos, CarteiraShopee
  parcial). Onda 2: cache manual (Dashboard, Catalog, AnunciosShopee,
  Orders, ManualEntrada, ManualSaida, NFeEntradaView etc.). Onda 3: sem
  cache (Calculator, Status, Shell, ShopeeAds).
- `.clasp.json`/Shell.html: DataClient é HTML (não entra no filePushOrder JS;
  entra no include do Shell.html antes das views).