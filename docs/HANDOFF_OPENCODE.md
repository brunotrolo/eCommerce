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

### Fase 0 — Validar fundação e pipeline

```
CONTEXTO
Projeto GAS de controle de loja Shopee + Mercado Livre. Todo o código das
fases 0-5 já existe no repositório mas nunca foi executado no Apps Script.
Esta tarefa é a primeira validação real da fundação.

SKILL
Ative /gas-ops antes de qualquer comando clasp.

TAREFA
1. Confira que .claspignore libera apenas appsscript.json, src/**/*.js e
   ui/**/*.html, e que nenhum segredo aparece em src/ ou ui/.
2. Rode `clasp push --force` e reporte qualquer arquivo rejeitado.
3. Rode `clasp deploy --description "v0 — fundacao"` e me devolva a URL do
   Web App.
4. Abra a URL e confirme que o Shell renderiza (navbar + área de conteúdo)
   com os tokens de cor aplicados, não com a aparência crua do navegador.
5. Rode `curl "<url do web app>?action=ping"` e cole a resposta.

RESTRIÇÕES
- Não altere appsscript.json nem .clasp.json.
- Não escreva a API key em lugar nenhum do código.
- Se o push falhar, reporte o erro exato antes de tentar corrigir.

ACEITE
Workflow verde, Shell renderizando com estilo, e ?action=ping devolvendo
{"pong":true,...}.
```

### Fase 1 — Validar Precificação

```
CONTEXTO
Fase 1 do PLANO.md. PricingService (src/03_services/pricing/PricingService.js)
e PricingView.html já estão escritos, conforme specs/pricing.md (Status:
Implemented). Nunca foram executados.

SKILL
Ative /spec-first e trate specs/pricing.md como fonte de verdade.

TAREFA
1. Leia specs/pricing.md e confira, linha a linha, que PricingService
   implementa exatamente as duas fórmulas descritas (marginBasis 'price' e
   'cost') e todos os casos de borda listados.
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
já escritos, conforme specs/dashboard.md.

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
já escritos, conforme specs/orders.md. O DashboardService deve consumir o
OrdersService em vez de duplicar a busca de pedidos.

SKILL
Ative /tiops-contract e /spec-first.

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

### Fase 4 — Validar Anúncios

```
CONTEXTO
Fase 4 do PLANO.md. ListingsService (listUnified, getDetail, pause, activate)
e ListingsView.html já escritos, conforme specs/listings.md.

SKILL
Ative /tiops-contract. As regras de payload dos dois canais estão em
docs/referencia/SHOPEE_CRIAR_ANUNCIO.md e
docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md — leia antes, não redescubra.

TAREFA
1. Confirme que pause/activate usam os nomes e o casing corretos por canal
   (ML: itemId camelCase; Shopee: conforme o playbook).
2. Verifique que TODA operação de escrita relê o item depois
   (get_item / shopee_get_item) e só reporta sucesso se a releitura
   confirmar o estado novo.
3. Pause e reative um anúncio de teste real em cada canal.
4. Teste um itemId inexistente e confirme erro tratado na UI.

RESTRIÇÕES
- NUNCA confie na resposta do update/pause/activate como confirmação.
- Não envie `title` para o Mercado Livre (usa family_name).
- Não use `logistics_channel_id` na Shopee (é `logistic_id`).

ACEITE
Pause e activate confirmados por releitura nos dois canais; item inexistente
com erro tratado.
```

### Fase 5 — Validar Preço & Estoque

```
CONTEXTO
Fase 5 do PLANO.md. InventoryPricingService (applySuggestedPrice,
updateStock) já escrito, conforme specs/inventory-pricing.md. Ele liga
PricingService (fase 1) e ListingsService (fase 4).

SKILL
Ative /spec-first e /tiops-contract.

TAREFA
1. Confirme que applySuggestedPrice REUSA PricingService.calculateSuggestedPrice
   e não reimplementa a fórmula.
2. Confirme que shopee_update_price usa price_list e que a Shopee recebe
   original_price + seller_stock quando exigido.
3. Rode o fluxo completo num item de teste: calcular → aplicar → reler →
   confirmar. Cole o valor antes e depois.
4. Confirme no app oficial do canal que o preço novo apareceu.
5. Teste item inexistente e preço inválido; confirme erro tratado na UI.

RESTRIÇÕES
- Fórmula de preço existe em um lugar só: PricingService.
- Releitura obrigatória depois de cada escrita.

ACEITE
Fluxo completo funcionando num item real de cada canal, com confirmação por
releitura e no app oficial.
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
