# Handoff Claude Code → OpenCode

Prompts prontos para colar no OpenCode. Claude Code decide **o quê** e **por
quê**; o OpenCode executa o **como**.

- Escopo, fases e critérios de aceite: [`PLANO.md`](../PLANO.md)
- Convenções obrigatórias: [`AGENTS.md`](../AGENTS.md)

---

## 1. Como o OpenCode enxerga este repositório

O OpenCode lê o `AGENTS.md` da raiz automaticamente a cada sessão — logo, as
convenções do projeto já entram no contexto sem você precisar repetir. O que
**não** entra sozinho é a intenção da tarefa: é isso que os prompts abaixo
entregam.

**Ativar uma skill no OpenCode:** os comandos ficam em `.opencode/command/` e
são invocados com `/nome`:

| Comando | Quando usar |
|---|---|
| `/spec-first` | antes de criar ou alterar qualquer serviço ou view |
| `/tiops-contract` | antes de escrever qualquer chamada nova à Tiops |
| `/design-tokens-guard` | ao escrever ou revisar CSS/HTML em `ui/**` |
| `/gas-ops` | antes de `clasp push` / `clasp deploy` |
| `/gas-app-designer` | ao construir uma tela nova |

Cada comando é um ponteiro fino para o arquivo canônico em
`.claude/skills/<nome>/SKILL.md` — mesma regra valendo nas duas ferramentas,
sem conteúdo duplicado. Se o `/comando` não estiver disponível na sua versão
do OpenCode, o efeito é idêntico escrevendo na mão:
`Leia .claude/skills/<nome>/SKILL.md e siga à risca.`

---

## 2. Anatomia de um bom prompt de execução

Todo prompt que sai daqui tem cinco blocos. Se faltar um, o OpenCode vai
preencher a lacuna adivinhando — que é exatamente o que queremos evitar.

```
1. CONTEXTO   → qual fase, qual domínio, o que já existe
2. SKILL      → qual skill ativar antes de começar
3. TAREFA     → o que fazer, em passos numerados e verificáveis
4. RESTRIÇÕES → o que NÃO pode mudar
5. ACEITE     → como saber que terminou
```

---

## 3. Prompts por fase

### Fase 0 — Validar fundação e pipeline (/dev)

```
CONTEXTO
Projeto GAS de controle de loja Shopee + Mercado Livre. Todo o código das
fases 0-5 já existe no repositório mas nunca foi executado no Apps Script.
Esta tarefa é a primeira validação real da fundação.

O pipeline agora funciona assim:
- GitHub Actions: `git push main` → `clasp push --force` (automático); **sem**
  `clasp deploy` — o `/dev` (HEAD) já reflete o push
- **Agentes NUNCA rodam `clasp deploy`** — apenas `clasp push`

SKILL
Ative /gas-ops antes de qualquer comando clasp.

TAREFA
1. Confira que .claspignore libera apenas appsscript.json, src/**/*.js e
   ui/**/*.html, e que nenhum segredo aparece em src/ ou ui/.
2. Faça um push na main e aguarde o workflow terminar (deve mostrar verde).
3. Verifique na URL do Web App que o Shell renderiza (navbar + área de conteúdo)
   com os tokens de cor aplicados, não com a aparência crua do navegador.
4. Rode `curl "<url do web app>?action=ping"` e cole a resposta.

RESTRIÇÕES
- Não altere appsscript.json nem .clasp.json.
- Não escreva a API key em lugar nenhum do código.
- Se o push falhar, reporte o erro exato antes de tentar corrigir.
- O workflow via GitHub Actions faz push + deploy automaticamente; agentes só fazem push.

ACEITE
Workflow verde, Shell renderizando com estilo no /dev, e ?action=ping devolvendo
{"pong":true,...}.
```

### Fase 1 — Validar Precificação

```
CONTEXTO
Fase 1 do PLANO.md. PricingService (src/03_services/pricing/PricingService.js)
e PricingView.html já estão escritos. Nunca foram executados.

SKILL
Ative /spec-first.

TAREFA
1. Leia PricingService.js e confira, linha a linha, que implementa
   exatamente as duas fórmulas (marginBasis 'price' e 'cost') e todos os
   casos de borda documentados no próprio código.
2. Rode runSmokeTests_() no editor do Apps Script e cole o log.
3. Se algum teste falhar, corrija o SERVIÇO para bater com a spec — nunca
   ajuste o teste para passar.
4. Na UI, calcule custo=50 e margem=25% e confirme Shopee R$ 90,91 e
   Mercado Livre R$ 91,80.
5. Teste margem de 85% na Shopee e confirme que aparece mensagem de erro
   legível na tela, não NaN nem Infinity.

RESTRIÇÕES
- Não mude as taxas (Shopee 20% flat, ML 14% + R$6) — são fato do projeto.
- Não adicione campo que não esteja na spec. Se precisar de um, pare e
  atualize a spec primeiro.

ACEITE
runSmokeTests_() passa, os quatro valores acima conferem, e o caso de margem
inviável mostra erro tratado.
```

### Fase 2 — Validar Dashboard

```
CONTEXTO
Fase 2 do PLANO.md. DashboardService + CacheRepository + DashboardView.html
já escritos.

SKILL
Ative /tiops-contract antes de tocar em qualquer chamada à Tiops.

TAREFA
1. Para cada ação Tiops usada pelo DashboardService, confirme nome e params
   contra list_actions/describe_action e reporte divergências.
2. Abra o Dashboard e compare os números com os apps oficiais da Shopee e do
   Mercado Livre no mesmo dia. Reporte cada diferença com o valor esperado e
   o obtido.
3. Recarregue a tela dentro de 5 minutos e confirme pelo tempo de resposta
   (ou por log) que a segunda carga veio do cache.
4. Simule falha da Tiops (chave inválida temporária, por exemplo) e confirme
   que a tela mostra erro legível em vez de ficar em branco.

RESTRIÇÕES
- Nenhum serviço chama UrlFetchApp direto: tudo passa por TiopsClient.
- Nenhum serviço chama CacheService direto: tudo passa por CacheRepository.

ACEITE
Números conferindo, cache confirmado, erro tratado na tela.
```

### Fase 3 — Validar Pedidos

```
CONTEXTO
Fase 3 do PLANO.md. OrdersService (listUnified, getDetail) e OrdersView.html
já escritos. O DashboardService deve consumir o OrdersService em vez de
duplicar a busca de pedidos.

SKILL
Ative /tiops-contract.

TAREFA
1. Confirme as ações Tiops de pedidos dos dois canais via describe_action.
2. Verifique que a normalização de OrdersService produz o mesmo shape para
   ML e Shopee (id, canal, data ISO, valor, status, itens) — reporte
   qualquer campo que sobre ou falte em um dos canais.
3. Pegue um pedido real de cada canal e compare campo a campo com o app
   oficial.
4. Confirme que o DashboardService usa OrdersService e que o Dashboard não
   regrediu depois disso.
5. Teste um período sem pedidos e confirme que devolve lista vazia, não erro.

RESTRIÇÕES
- Datas sempre normalizadas para ISO 8601 no serviço, nunca formatadas na UI
  a partir de string crua do marketplace.
- Não duplique a busca de pedidos no DashboardService.

ACEITE
Pedido real de cada canal conferindo, Dashboard sem regressão, lista vazia
tratada.
```

### Fase 4 — ~~Validar Anúncios~~ (Removida 09/08/2026)

`ListingsService`/`ListingsView.html` foram excluídos do projeto — página
sem utilidade, decisão do usuário (ver `PLANO.md`, seção "Removidos"). Não
use o prompt desta fase; o sucessor **Pareamento SKU**
(`ProdutoSkuMapService`) também foi **removido em 13/08/2026** (decisão do
usuário) — pedidos Shopee usam apenas o `item_sku` nativo do pedido.

### Fase 5 — ~~Validar Preço & Estoque~~ (Removida)

`InventoryPricingService` foi excluído do projeto junto com `ListingsService`
(dependia dele); regras de preço/estoque seguem em `PricingService`/
`EstoqueService`. Não use o prompt desta fase.

RESTRIÇÕES
- Fórmula de preço existe em um lugar só: PricingService.
- Releitura obrigatória depois de cada escrita.

ACEITE
Fluxo completo funcionando num item real de cada canal, com confirmação por
releitura e no app oficial.
```

---

### Status Online + Speed Meter

```
CONTEXTO
Indicador visual global que mostra status online e timing de carregamento.
StatusService (src/03_services/system/StatusService.js) retorna
{isOnline, timestamp, lastUpdate}. StatusView (ui/shell/StatusView.html)
é um Web Component sticky no nav bar. A medição de timing é 100% client-side:
GAS time = round-trip da chamada google.script.run, CPU time = desde
performance.timing.navigationStart até a resposta.

SKILL
Ative /design-tokens-guard para CSS e /gas-ops para deploy.

TAREFA
1. Verifique que StatusService está registrado em ServiceRegistry.js com
   padrão defensivo typeof/safeRef_().
2. Verifique que StatusView.html está incluído em Shell.html e renderiza
   no nav bar, à esquerda do botão Calculadora.
3. Confirme que o indicador mostra 🟢 (verde) quando online e 🔴
   (vermelho) quando offline.
4. Confirme que o timing mostra "X.XXs (GAS: X.XXs | CPU: X.XXs)".
5. Abra Extensões → Logger no editor Apps Script e confirme que
   os logs do StatusView aparecem (constructor, connectedCallback, fetch).

RESTRIÇÕES
- Timing é 100% client-side, sem chamadas server extras.
- StatusService.js é simples: só retorna {isOnline, timestamp, lastUpdate}.
- Design tokens: usar --color-success e --color-error de Styles.html.

ACEITE
Status 🟢 aparece, timing funciona, logs visíveis no Logger do Apps Script.
```

---

### DataClient — Arquivo Único de Dados (cache + API)

```
CONTEXTO
DataClient (ui/shared/DataClient.html) é o arquivo ÚNICO de dados do
cliente, exposto em window.__DataClient (a antiga DataStore.html foi
consolidada nele e removida). API: fetchData (cache TTL 60s + SWR, dedupe,
retry 1x), mutateData (escrita, invalida domínio por prefixo), snapshot
(render do cache sem rede), get/invalidate, preFetch.
Toda view usa __DataClient — nunca google.script.run direto.

No boot o Shell dispara o preFetch de TODAS as rotas com forceFresh:true —
reload = dados reais do Google Sheets (o backend remove a key do
CacheService e relê). Navegação entre abas na mesma sessão é instantânea
(cache client-side em memória).

Views: todas as *View.html usam window.__DataClient.

SKILL
Ative /gas-ops para deploy.

TAREFA
1. Verifique que DataClient.html está incluído em Shell.html (antes dos
   includes de views).
2. Confirme que o pré-fetch do boot dispara as 13 ações com forceFresh:true.
3. Navegue entre Dashboard, NFe Entrada, Entrada Produtos e Catálogo —
   confirme que a segunda visita é instantânea (sem loading).
4. Clique "Atualizar" em Dashboard e confirme que os dados são buscados
   novamente (invalidate + fetch).
5. Confirme no Logger do Apps Script que as chamadas de pré-fetch
   aparecem.

RESTRIÇÕES
- DataClient é só cache client-side, não armazena nada no servidor.
- Views devem funcionar normalmente mesmo sem cache (fallback para fetch).
- Dados parametrizados (Orders, Listings) continuam buscando no servidor a
  cada troca de filtro.
- Service novo com cache server-side DEVE honrar params.forceFresh.

ACEITE
Navegação entre páginas é instantânea na segunda visita; prefetch funciona;
logs confirmam as chamadas; fallback sem cache funciona.
```

---

## 4. Prompt genérico — domínio novo do zero

Use quando o escopo crescer além dos 5 domínios da v1 (ex.: Fase 6).

```
CONTEXTO
Novo domínio "<NOME>" neste projeto GAS. Ainda não existe spec nem código.

SKILL
Ative /spec-first. NÃO escreva código antes da spec estar aprovada.

TAREFA
1. Copie specs/_TEMPLATE.md para specs/<nome>.md e preencha Objetivo,
   Contrato da API Interna, Regras de Negócio, Casos de Borda e Critérios de
   Aceite (Given/When/Then), com Status: Draft.
2. PARE e me mostre a spec para aprovação.
3. Só depois de eu responder "aprovado": implemente
   src/03_services/<nome>/<Nome>Service.js seguindo a convenção de namespace
   do AGENTS.md, registre em ServiceRegistry, e crie ui/<nome>/<Nome>View.html
   como Web Component com Shadow DOM usando os tokens compartilhados.
4. Atualize o Status da spec para Implemented.

RESTRIÇÕES
- Um `var <Nome>Service = (function(){...})()` por arquivo, nunca const.
- Nenhuma chamada a UrlFetchApp/PropertiesService/CacheService/SpreadsheetApp
  fora de 01_adapters e 02_repositories.
- Nenhuma cor ou espaçamento hard-coded na view.

ACEITE
Spec aprovada, serviço registrado e despachável por apiDispatch, view
renderizando com os tokens.
```

---

## 5. Prompt genérico — correção de bug

```
CONTEXTO
Bug em <domínio>: <o que acontece> / <o que deveria acontecer>.
Spec de referência: specs/<dominio>.md.

TAREFA
1. Reproduza o bug e me diga a causa raiz antes de corrigir.
2. Confira se a spec cobre esse caso.
   - Cobre → o código está errado, corrija o código.
   - Não cobre → é lacuna de spec: atualize a spec primeiro, me mostre, e só
     então corrija o código.
3. Corrija e adicione o caso ao runSmokeTests_() quando for lógica pura.

RESTRIÇÕES
Não corrija sintoma sem entender a causa. Não amplie o escopo da correção
para refatoração não pedida.

ACEITE
Bug não reproduz mais, spec e código coerentes, smoke test cobrindo o caso.
```

### Refactoring pré-Fase 0 — Qualidade visual e padrões UI

```
CONTEXTO
Antes de validar a fundação (Fase 0), a UI precisa de refactoring para
parecer profissional. Hoje os widgets têm anti-padrões: nenhum loading state,
duplicação de lógica de erro/sucesso, captura de `self` em closures,
hard-coded styles.

SKILL
Ative /simplify e /design-tokens-guard antes de começar.

TAREFA
1. Para cada widget em ui/*View.html:
   - Adicione loading state: desabilite o botão e mostre "Processando..." enquanto aguarda resposta
   - Standardize erro: sempre em #error-box com class .alert.alert-danger
   - Standardize sucesso: sempre em #result-box com .badge.badge-success
   - Elimine `self =` — use arrow functions no listener ou `.bind()`

2. Extraia a lógica comum (loading + error handling + sucesso) em função
   auxiliar `withLoading(fn)` que todos os widgets reaproveitem.

3. Verifique que nenhum CSS está hard-coded — tudo vem de Styles.html via
   classes (.btn, .card, .badge, .alert, --color-*, --space-*).

4. Rode `clasp push --force` e confirme que não há erros de sintaxe.

RESTRIÇÕES
- Não mude a estrutura de pastas ou nomes de widgets.
- Não altere specs ou assinaturas de métodos no ServiceRegistry.
- Todos os tokens de design já existem em ui/shared/Styles.html.

ACEITE
Todos os 5 widgets carregam sem erro; sucesso/erro renderizam de forma
consistente; botões desabilitam enquanto processam; nenhuma closure desnecessária; zero CSS fora de Styles.html.
```

---

> **Nota (09/08/2026):** as duas seções de refatoração de design que ficavam
> aqui (hierarquia visual e modernização de tokens) já foram executadas e
> citavam widgets removidos do projeto (`PricingView`, `ListingsView`,
> `InventoryPricingView`) — removidas por não terem mais valor de prompt
> reutilizável. O sistema de design atual vive só em `ui/shared/Styles.html`
> (tokens) e `AGENTS.md` (regras de uso); ative `/design-tokens-guard` ao
> tocar CSS/HTML em `ui/**`.

---

## 6. Quando o OpenCode não conseguir confirmar um contrato da Tiops

A sessão do Claude Code tem o MCP da Tiops conectado e consegue rodar
`list_actions`/`describe_action` na hora. Se o OpenCode não tiver esse acesso,
a resposta certa dele é **parar e pedir**, nunca adivinhar o nome da ação.
Traga a pergunta para cá no formato:

```
Preciso confirmar o contrato da Tiops para <operação> no canal <shopee|ml>.
Qual o nome exato da ação e o schema dos params?
```

Devolvo o contrato confirmado e ele fica registrado na seção *Dependências* da
spec do domínio, para nenhuma sessão futura precisar consultar de novo.

---

## 7. O que NÃO delegar ao OpenCode

Estas decisões voltam para o Claude Code (ou para você):

- Mudar arquitetura de camadas ou criar uma camada nova.
- Aprovar spec (`Status: Draft` → `Approved`) — aprovação é sua, não do agente.
- Alterar as taxas de marketplace ou qualquer regra de negócio de dinheiro.
- Mexer em `appsscript.json`, `.clasp.json`, `.claspignore` ou no workflow de deploy.
- Adicionar dependência externa ou biblioteca ao projeto.
- Qualquer coisa que envolva a API key.

---

## 8. Ao final de cada fase, volte aqui

Traga para o Claude Code: o diff (`git diff main...HEAD --stat` e os
trechos relevantes), o log do `runSmokeTests_()` e o resultado dos critérios
de aceite. A revisão fecha a fase e marca o `PLANO.md`.
