# AGENTS.md — regras deste projeto para qualquer agente de coding

Este arquivo é a fonte única de convenções do projeto, lida tanto por Claude
Code quanto por OpenCode (ou qualquer outro agente usado neste repositório).
`CLAUDE.md` aponta para este arquivo — não duplique regras lá.

## O que é este projeto

App de controle de loja (Shopee + Mercado Livre) em **Google Apps Script**,
um único projeto/Web App (scriptId em `.clasp.json`), com domínios separados
por arquivo dentro do mesmo runtime (não múltiplos deploys). Toda a
integração com os marketplaces passa pela API Tiops
(`POST https://mcp.tiops.com.br`, `{action, params}`) — nunca chamar API de
marketplace diretamente.

## Mapa de documentos (saiba onde procurar antes de perguntar)

| Arquivo | Papel |
|---|---|
| `AGENTS.md` (este) | **Como** construir: convenções, arquitetura, regras invioláveis |
| `PLANO.md` | **O quê** e **quando**: escopo, fases, status, critérios de aceite |
| `docs/HANDOFF_OPENCODE.md` | Prompts prontos de execução, por fase |
| `specs/ARQUITETURA.md` | Arquitetura de micro-serviços, micro-frontends, performance/integração e design system |
| `specs/<dominio>.md` | Contrato de um domínio **novo**, enquanto não implementado — depois de implementado, o código-fonte (`describe()` de cada serviço) é a fonte de verdade |
| `docs/referencia/` | Playbooks de payload validados e análise da API Tiops |

## Divisão de papéis entre os dois agentes

- **Claude Code = guia.** Revisa e aprova specs, decide arquitetura, gera os
  prompts de execução (skill `handoff-prompt`), revisa o diff pronto.
- **OpenCode = executor.** Cria e edita arquivos em `src/` e `ui/`, roda
  `clasp`, commita — seguindo o prompt recebido e as regras deste arquivo.

Nenhum dos dois altera arquitetura, taxas de marketplace, `.clasp.json`,
`.claspignore` ou o workflow de deploy sem decisão explícita do
usuário. Aprovar spec (`Draft` → `Approved`) é decisão do usuário, nunca do
agente. Detalhes em `PLANO.md`, seção 2.

## Regra nº 1: Spec-Driven Development

**Nenhum arquivo de serviço (`src/03_services/**`) ou de UI (`ui/**`) é
criado ou alterado para um domínio sem que `specs/<dominio>.md` exista com
`Status: Approved` ou `Implemented`.** Se a spec não existir, escreva-a a
partir de `specs/_TEMPLATE.md` primeiro e peça aprovação antes de codar.
Isso vale igualmente para sessões de Claude Code e de OpenCode — nenhuma das
duas ferramentas tem passe livre para pular a spec.

## Arquitetura

- Domínios em `src/03_services/<dominio>/<Nome>Service.js`. Cada serviço
  expõe `describe()` (ações + schema, no espírito do `list_actions`/
  `describe_action` da própria Tiops) e é registrado em
  `src/04_gateway/ServiceRegistry.js`.
- `src/04_gateway/Router.js` é o único arquivo com `doGet`/`doPost`. Toda
  chamada (HTTP externa ou `google.script.run` da UI) passa por
  `apiDispatch(action, params)` → `ServiceRegistry.dispatch`.
- `src/01_adapters/TiopsClient.js` é o único ponto que chama `UrlFetchApp`
  para a Tiops. Nenhum serviço deve fazer isso diretamente.
- `src/02_repositories/*` são os únicos arquivos que chamam
  `PropertiesService`/`CacheService`/`SpreadsheetApp` diretamente.

## Convenção de namespace (importante em GAS)

GAS/V8 não tem ES modules — todo arquivo cai no mesmo escopo global. Regras:
- Um identificador global por arquivo, nome = nome do arquivo:
  `var NomeService = (function () { ... return {...}; })();`
- Use `var`, não `const`, no namespace de topo. Um `const` duplicado em dois
  arquivos quebra o projeto inteiro (`SyntaxError` global); `var` degrada
  melhor.
- Nunca chame outro namespace dentro da IIFE de topo — só dentro dos
  métodos retornados.

### Ordem de Carregamento (CRÍTICO para Microsserviços)

**Problema:** GAS carrega arquivos **alfabeticamente** por padrão. Isso quebra
dependências entre namespaces: se `CatalogService` tenta chamar
`NFeEntradaProdutosRepository` mas é carregado antes, dá erro.

**Solução:** `.clasp.json` define `filePushOrder` — lista exata de todos
os arquivos `.js` em **ordem de dependência topológica** (A depende de B? B
carrega **antes** de A).

**Ordem esperada:**
```
1. ConfigService (sem dependências)
2. Adapters (DriveAdapter, TiopsClient) — usam Config
3. Repositories (PropertiesRepository, CacheRepository, SheetsRepository)
4. Services (LoggingService primeiro, depois negócio) — usam Repositories
5. Gateway (ServiceRegistry, Router) — usam todos os Serviços
6. Main (entrypoint) — usa Gateway
```

**Regra ao adicionar novo serviço:** insira-o em `filePushOrder` após todas as
suas dependências. Consulte `specs/ARQUITETURA.md` §1 para detalhes.
**Nunca liste em `filePushOrder` um arquivo que ainda não existe** — `clasp
push` falha se o arquivo referenciado não estiver no disco; adicione a
entrada só no mesmo commit que cria o arquivo.

**Validação:** Skill `gas-ops` verifica que `filePushOrder` existe e contém
todos os arquivos `.js` antes de cada `clasp push`.

### Exceção: `ServiceRegistry.js` (agregador central)

`ServiceRegistry.js` é a única exceção legítima à regra "nunca referenciar
outro namespace fora de um método retornado" — por natureza, um registry
central de serviços precisa conhecer todos eles. Para não tornar essa
exceção um ponto único de falha (um serviço com nome errado ou fora de
ordem derrubaria `doGet()` para **toda** a aplicação, não só a página
daquele serviço), toda entrada usa o padrão defensivo:

```js
pricing: safeRef_('pricing', function () {
  return typeof PricingService !== 'undefined' ? PricingService : undefined;
})
```

`typeof X !== 'undefined'` nunca lança `ReferenceError`, mesmo se `X` não
tiver sido definido ainda. Um serviço ausente vira `null` na tabela (logado
via `console.warn`) em vez de derrubar o script inteiro — `dispatch()` já
trata `service === null` como "serviço desconhecido". **Ao registrar um novo
serviço em `ServiceRegistry.js`, sempre use esse padrão, nunca a referência
direta.**

## Dados sensíveis

Toda credencial (clasp, OAuth, etc.) vive no cofre de secrets do GitHub ou
em estruturas seguras do Google (PropertiesService). Nunca comitadas no código
e nunca expostas em logs ou chats. Ver skill `gas-ops` para validação antes
de push.

### Autenticação MCP Tiops

**Endpoint:** `POST https://mcp.tiops.com.br`

**Autenticação:** Bearer token em header
```
Authorization: Bearer mc_live_XXX
```

**Como obter/configurar:**
1. Você recebeu um token `mc_live_XXX` da Tiops (solicitar se não tiver)
2. No Google Apps Script editor:
   - Clicar em "Projeto" (canto superior esquerdo)
   - Ir a "Configurações do projeto"
   - Aba "Variáveis de ambiente"
   - OU usar Script Properties (menu: Extensões → Apps Script → Propriedades do projeto)
   - Adicionar propriedade: `TIOPS_API_KEY = mc_live_XXX`
3. Em `src/00_config/ConfigService.js` ou `src/02_repositories/PropertiesRepository.js`:
   ```javascript
   var apiKey = PropertiesService.getScriptProperties().getProperty('TIOPS_API_KEY');
   ```
4. `TiopsClient.js` usa essa chave em todas as chamadas de UrlFetchApp

**TiopsClient padrão (usar em todos os serviços):**
```javascript
var TiopsClient = (function () {
  function call(action, params) {
    var apiKey = PropertiesService.getScriptProperties().getProperty('TIOPS_API_KEY');
    if (!apiKey) throw new Error('TIOPS_API_KEY não configurada em Script Properties');
    
    var options = {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      payload: JSON.stringify({ action: action, params: params || {} }),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch('https://mcp.tiops.com.br', options);
    var data = JSON.parse(response.getContentText());
    
    if (data.error) throw new Error('Tiops error: ' + data.error);
    return data;
  }
  
  return { call: call, describe: describe };
})();
```

## Fórmulas de taxa por canal (fato do projeto, não redescobrir)

| Canal | Taxa percentual | Taxa fixa |
|---|---|---|
| Shopee | 20% flat sobre o preço de venda | R$ 0 |
| Mercado Livre | 14% sobre o preço de venda | R$ 6,00 por item |

Ver `src/03_services/pricing/PricingService.js` (`calculateSuggestedPrice`/
`calculateNetMargin`) para as fórmulas completas — motor único, nunca
duplicar o cálculo em outro serviço.

## Micro-frontends (UI)

Cada tela em `ui/<dominio>/<Nome>View.html` é um Web Component
(`customElements.define`) com Shadow DOM próprio (`attachShadow`). Tokens de
design vivem em `ui/shared/Styles.html`; `ui/shared/DesignSystemLoader.html`
constrói um único `CSSStyleSheet` a partir dele, exposto em
`window.__DESIGN_SHEET__`. Todo widget deve fazer
`shadow.adoptedStyleSheets = [window.__DESIGN_SHEET__]` — nunca duplicar CSS
nem usar cor/espaçamento/sombra fora dos tokens de `Styles.html`.

## DataStore — cache client-side para navegação instantânea

`ui/shared/DataStore.html` expõe `window.__DataStore` com:
- `get(key)` / `has(key)` / `set(key, data)` / `invalidate(key)`
- `getOrFetch(key, action, params)` — retorna cache se existe, senão busca
- `preFetch([{key, action, params}])` — busca múltiplos em paralelo no startup

**Padrão para views:** no `connectedCallback`, checar cache primeiro (render
imediato), depois buscar fresh em background. Botões "Atualizar" devem chamar
`invalidate()` antes de fetch.

**Pre-fetch no Shell.html:** dispara `dashboard.getSummary`,
`nfeEntrada.getRecent`, `nfeEntradaProdutos.getProdutos`, `config.getConfig` e
`catalog.getProducts` ao carregar o app.

## StatusView — indicador de status online

`ui/shell/StatusView.html` é um Web Component sticky no nav bar que mostra:
- Bolinha verde (online) / vermelha (offline)
- Timestamp da última atualização
- Timing: total (GAS round-trip + CPU desde page load)

Medição é 100% client-side. O StatusService (`src/03_services/system/`) só
retorna `{isOnline, timestamp, lastUpdate}` — os timers são calculados no
browser.

## Timezone Strategy (datas no ecossistema GAS ↔ UI)

**Regra:** o backend (GAS) é a fonte de verdade para formatação de datas.
O frontend (HTML/JS) exibe strings já formatadas, sem reprocessar com
`new Date(string)`.

- **Backend:** toda data que sai do GAS deve ser formatada como string BR
  (`dd/MM/yyyy` ou `dd/MM/yyyy HH:mm:ss`) usando
  `Session.getScriptTimeZone()` antes de retornar ao cliente.
- **Frontend:** receba a string BR e exiba direto. Nunca faça
  `new Date(r.DATA_TRANSACAO)` — isso interpreta como UTC e desloca o dia.
  Use `fmtDate_()` ou `FormatterService.formatDate()` para exibir.
- **Exceção:** dados numéricos (timestamps ISO) devem ser convertidos pelo
  backend antes de chegar ao frontend. Se o frontend receber ISO, use
  `FormatterService.parseDate()` + métodos locais (`getDate()`, não
  `getUTCDate()`).
- **Padrão `Formatter.html`:** todos os métodos (`formatDate`,
  `formatDateTime`, `formatTime`, `parseDate`, `parseDateTime`) usam
  tempo **local**, nunca UTC.

## Segurança de Arquitetura: Prevenção de Regressões

### Arquivos compartilhados (NÃO alterar sem aprovação explícita)

Estes arquivos afetam **TODAS** as páginas. Qualquer mudança aqui pode
quebrar telas existentes. **Nunca altere sem validação completa:**

| Arquivo | Impacto |
|---|---|
| `ui/shared/Styles.html` | Design tokens — afeta visual de todos os widgets |
| `ui/shared/DesignSystemLoader.html` | Constrói `window.__DESIGN_SHEET__` |
| `ui/shared/UiHelpers.html` | Funções `withLoading()` — usada por todos os widgets |
| `ui/shared/Formatter.html` | Formatação de valores — usada por todos os widgets |
| `ui/shared/DebugConsole.html` | Console de debug — afeta todas as chamadas |
| `ui/shared/DataStore.html` | Cache client-side de dados — usado por todas as views para navegação instantânea |
| `ui/shell/StatusView.html` | Indicador de status online + speed meter — afeta nav bar |
| `src/00_config/FormatterService.js` | Formatter server-side |
| `src/03_services/logging/LoggingService.js` | Log de ações — afeta todos os serviços |
| `src/04_gateway/ServiceRegistry.js` | Dispatcher central — afeta todas as chamadas API |
| `src/04_gateway/Router.js` | Entrada `doGet`/`doPost` — afeta toda a aplicação |
| `src/99_Main.js` | Menu e smoke tests |

### Checklist obrigatório para NOVA PÁGINA

**Antes de criar uma nova página, verifique:**

#### Server-side (GAS)
- [ ] Spec aprovada em `specs/<dominio>.md` com `Status: Approved`
- [ ] Criar `src/03_services/<dominio>/<Nome>Service.js` com `describe()`
- [ ] Criar `src/03_services/<dominio>/<Nome>Repository.js` se necessário
- [ ] Registrar em `ServiceRegistry.js` usando **sempre** `safeRef_()` pattern
- [ ] Adicionar em `.clasp.json` `filePushOrder` **após** todas as dependências
- [ ] Nunca listar em `filePushOrder` um arquivo que ainda não existe

#### Client-side (UI)
- [ ] Criar `ui/<dominio>/<Nome>View.html` como Web Component
- [ ] Adicionar `<?!= include('ui/<dominio>/<Nome>View'); ?>` em Shell.html **depois** dos includes compartilhados
- [ ] Adicionar rota no mapa `ROUTES` em Shell.html
- [ ] Adicionar botão de navegação em Shell.html **antes** do `<theme-toggle>`

#### Validação pós-criação
- [ ] Testar nova página: carregamento, chamadas API, navegação
- [ ] Testar **TODAS** as páginas existentes: Dashboard, Calculadora, Pedidos, Anúncios, NFe Entrada, Entrada Produtos, Estoque, Catálogo
- [ ] Verificar que `FormatterService` está acessível em todas as páginas
- [ ] Verificar que `DebugConsole` funciona em todas as páginas

### Riscos conhecidos

| Risco | Causa | Impacto | Prevenção |
|---|---|---|---|
| `FormatterService is not defined` | Include faltando em Shell.html | Todas as páginas que usam formatação | Sempre incluir Formatter.html em Shell.html |
| Serviço não registrado | Falta entrada em ServiceRegistry.js | Ações do serviço indisponíveis | Usar `safeRef_()` pattern |
| Arquivo não encontrado | `filePushOrder` lista arquivo inexistente | `clasp push` falha | Criar arquivo antes ou adicionar no mesmo commit |
| Conflito de tag Web Component | Duas defs de mesma tag | Segunda definição falha | Usar tags nomeadas (`<domain-widget>`) |
| CSS quebrado | Mudança em Tokens sem validação | Visual corrompido em múltiplas páginas | Testar todas as páginas após mudança |
| Namespace duplicado | `const` duplicado em dois arquivos | `SyntaxError` global | Usar `var`, não `const` para namespaces |
| Ordem de carregamento | Serviço carrega antes de dependência | `ReferenceError` | Seguir `filePushOrder` topológico |

### Padrões defensivos obrigatórios

1. **ServiceRegistry**: sempre `safeRef_()`, nunca referência direta
2. **Namespaces**: sempre `var`, nunca `const` para IIFE de topo
3. **Web Components**: sempre Shadow DOM + `adoptedStyleSheets`
4. **Chamadas API**: sempre via `withLoading()` do UiHelpers
5. **Formatação**: sempre via `FormatterService` (client ou server)
6. **CSS**: sempre via tokens de `Styles.html`, nunca hard-coded

## Regras conhecidas dos marketplaces (não redescobrir na marra)

Ver `docs/referencia/SHOPEE_CRIAR_ANUNCIO.md` e
`docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md` para a lista completa
(regras usadas hoje pelo domínio Anúncios Shopee,
`src/03_services/anunciosShopee/AnunciosShopeeService.js`).
Resumo crítico:
- **Nunca confiar na resposta de um update/pause/activate para confirmar
  estado** — sempre reler com `get_item`/`shopee_get_item` depois.
- Shopee: `shopee_update_price` usa `price_list`, nunca `price` solto.
  `logistic_id`, nunca `logistics_channel_id`.
- Mercado Livre: nunca enviar `title` (usa `family_name`); `pause_item`/
  `activate_item` usam `itemId` (camelCase).

## Workflow clasp / CI

- **REGRA OBRIGATÓRIA: SEMPRE commitar no GitHub ANTES de fazer `clasp push`.**
  O repositório GitHub é a fonte de verdade. Nunca altere o Apps Script
  diretamente sem que o código esteja versionado. Sequência correta:
  1. `git add -A && git commit -m "msg"`
  2. `git push origin main`
  3. `npx @google/clasp push --force`
- `clasp push` para enviar o código ao projeto Apps Script
  (`1zU9zBb8QeqWr-m2YORwyKx-6ypK4JrQhqZ29M3FJs8BmWhkO1VErKy3w`).
- **NUNCA rode `clasp deploy`.** O deploy para produção é automático: todo
  push na branch `main` dispara `.github/workflows/deploy.yml`, que roda
  `clasp push --force` no GitHub Actions. **Não há mais o passo `clasp deploy`
  no CI** — dava origem a 1 versão GAS por push (o projeto chegou a 181/200)
  e ninguém usava essas versões; o usuário acessa apenas o `/dev` (HEAD),
  que o `clasp push` já atualiza sozinho. Agentes devem fazer apenas
  `clasp push` — criar versões é decisão manual e consciente do usuário
  (via UI do Apps Script), nunca automática.
- `clasp login` é interativo (OAuth) e só pode ser feito uma vez,
  manualmente, pelo usuário — nunca por um agente.

## Chamadas à Tiops

Antes de escrever ou alterar qualquer `TiopsClient.call(action, params)`,
confirme nome da ação e schema dos params contra o catálogo real
(`list_actions` / `describe_action`) — não assuma de memória nem por analogia
com o outro canal. Toda ação usada deve constar na seção *Dependências* da
spec do domínio. Regra completa na skill `tiops-contract`.

## Skills do projeto

Fonte única de cada regra: `.claude/skills/<nome>/SKILL.md`. No OpenCode, os
mesmos arquivos são acionados pelos comandos `/nome` definidos em
`.opencode/command/` — ponteiros finos, sem conteúdo duplicado.

| Skill | Quando ativar |
|---|---|
| `spec-first` | antes de criar/alterar `src/03_services/**` ou `ui/**` |
| `tiops-contract` | antes de qualquer chamada nova à Tiops |
| `design-tokens-guard` | ao escrever ou revisar CSS/HTML em `ui/**` |
| `gas-ops` | antes de `clasp push` / `clasp deploy` |
| `gas-app-designer` | ao construir uma tela nova |
| `handoff-prompt` | só no Claude Code: gerar prompt de execução p/ o OpenCode |

## Definition of Done (vale para qualquer tarefa)

1. Existe spec correspondente com `Status: Approved` ou `Implemented`.
2. O código respeita as camadas: nada de `UrlFetchApp`/`PropertiesService`/
   `CacheService`/`SpreadsheetApp` fora de `01_adapters` e `02_repositories`.
3. Nenhuma cor, espaçamento, raio ou sombra hard-coded fora de `Styles.html`.
4. Toda escrita em marketplace é confirmada por releitura.
5. Lógica pura nova tem caso correspondente em `runSmokeTests_()`.
6. Nenhum segredo no diff.
7. O critério de aceite da fase em `PLANO.md` foi verificado de fato — não
   presumido. Marque `Validado` só depois de rodar.
