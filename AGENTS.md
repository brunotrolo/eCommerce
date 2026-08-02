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
| `specs/<dominio>.md` | Contrato de cada domínio — fonte de verdade da implementação |
| `docs/referencia/` | Playbooks de payload validados e análise da API Tiops |
| `docs/historico/` | Planejamento superado; valor histórico apenas, **não seguir** |

## Divisão de papéis entre os dois agentes

- **Claude Code = guia.** Revisa e aprova specs, decide arquitetura, gera os
  prompts de execução (skill `handoff-prompt`), revisa o diff pronto.
- **OpenCode = executor.** Cria e edita arquivos em `src/` e `ui/`, roda
  `clasp`, commita — seguindo o prompt recebido e as regras deste arquivo.

Nenhum dos dois altera arquitetura, taxas de marketplace, `appsscript.json`,
`.clasp.json`, `.claspignore` ou o workflow de deploy sem decisão explícita do
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
  métodos retornados (evita depender de ordem de carregamento entre
  arquivos; a ordem de carregamento no GAS segue a ordenação alfabética dos
  nomes de arquivo, por isso os prefixos numéricos `00_`, `01_`, etc. nas
  pastas).

## Dados sensíveis

Toda credencial (clasp, OAuth, etc.) vive no cofre de secrets do GitHub ou
em estruturas seguras do Google (PropertiesService). Nunca comitadas no código
e nunca expostas em logs ou chats. Ver skill `gas-ops` para validação antes
de push.

## Fórmulas de taxa por canal (fato do projeto, não redescobrir)

| Canal | Taxa percentual | Taxa fixa |
|---|---|---|
| Shopee | 20% flat sobre o preço de venda | R$ 0 |
| Mercado Livre | 14% sobre o preço de venda | R$ 6,00 por item |

Ver `specs/pricing.md` para as fórmulas completas.

## Micro-frontends (UI)

Cada tela em `ui/<dominio>/<Nome>View.html` é um Web Component
(`customElements.define`) com Shadow DOM próprio (`attachShadow`). Tokens de
design vivem em `ui/shared/Styles.html`; `ui/shared/DesignSystemLoader.html`
constrói um único `CSSStyleSheet` a partir dele, exposto em
`window.__DESIGN_SHEET__`. Todo widget deve fazer
`shadow.adoptedStyleSheets = [window.__DESIGN_SHEET__]` — nunca duplicar CSS
nem usar cor/espaçamento/sombra fora dos tokens de `Styles.html`.

## Regras conhecidas dos marketplaces (não redescobrir na marra)

Ver `specs/listings.md` e `specs/inventory-pricing.md` para a lista completa
extraída de `docs/referencia/SHOPEE_CRIAR_ANUNCIO.md` e
`docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md`. Resumo crítico:
- **Nunca confiar na resposta de um update/pause/activate para confirmar
  estado** — sempre reler com `get_item`/`shopee_get_item` depois.
- Shopee: `shopee_update_price` usa `price_list`, nunca `price` solto.
  `logistic_id`, nunca `logistics_channel_id`.
- Mercado Livre: nunca enviar `title` (usa `family_name`); `pause_item`/
  `activate_item` usam `itemId` (camelCase).

## Workflow clasp / CI

- `clasp push` para enviar o código ao projeto Apps Script
  (`1zU9zBb8QeqWr-m2YORwyKx-6ypK4JrQhqZ29M3FJs8BmWhkO1VErKy3w`).
- `clasp deploy --description "..."` para criar uma versão de deploy do Web App.
- O deploy para produção é automático: todo push na branch `main` dispara
  `.github/workflows/deploy.yml`, que roda `clasp push` + `clasp deploy` no
  GitHub Actions. `clasp login` é interativo (OAuth) e só pode ser feito uma
  vez, manualmente, pelo usuário — nunca por um agente.

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
