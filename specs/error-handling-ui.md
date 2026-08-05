# Spec: Padronização do Tratamento de Erro nos Widgets

## Status
Draft

## Objetivo
Hoje cada view trata erro do seu próprio jeito: há `withLoading` + `#error-box`
(UiHelpers), `showToast` local duplicado em ~5 views, `_showError`/`_hideError`
por classe em NFeEntrada/NFeEntradaProdutos, e chamadas `google.script.run` que
nem sempre mostram o erro (`catch(function () {})` silencioso). Resultado:
comportamento inconsistente, mensagens divergentes do mesmo erro e dificuldade
de manutenção (o mesmo toast é reimplementado 5 vezes). Esta spec define uma
**única API de feedback de erro/sucesso** no `UiHelpers.html` que todos os
widgets usam, com degradação garantida para (a) erro de negócio retornado em
`response.error`, (b) falha de rede/`withFailureHandler` e (c) exceção síncrona.

## Contrato da API Interna
### `withLoading(button, invoke, onSuccess, successMessage)` — mantido, com erro padronizado
Já existe em `ui/shared/UiHelpers.html`. A partir desta spec, **todas** as
chamadas de `google.script.run` nas views passam por ele (ou por
`withErrorHandling` para chamadas sem botão). Sem repetir alternativas.

### `withErrorHandling(invoke, onSuccess)` — novo
- Descrição: wrapper para chamadas `google.script.run` que NÃO têm botão de
  submit (load inicial, refresh por timer, fetch de dados). Exibe erro no
  `#error-box` do shadow root e sucesso opcional via `#result-box`.
- Param `invoke(success, failure)`: função que monta e dispara
  `google.script.run.withSuccessHandler(success).withFailureHandler(failure)
  .apiDispatch(...)` — mesmo contrato de `withLoading`.
- Param `onSuccess(data)`: renderização específica do widget (opcional).
- Retorno: nada. Sempre mostra erro com o padrão único (ver Regras).
- Erros esperados: nunca lança; `console.error` da exceção interna.

### Funções de erro que passam a ser internas/centralizadas
As views **param de definir** `_showError`, `showError`, `showToast`, helpers
locais de erro/sucesso. Precisou diverger do padrão? Usar o `feedback()` novo.

## Regras de Negócio
1. **Fonte única:** `ui/shared/UiHelpers.html` é o único lugar que monta
   DOM de erro/sucesso. Views não declaram mais essas funções.
2. **Dois canais oficiais de exibição:**
   - Erros de negócio (campanha/validação). → `#error-box` com classe
     `alert alert-error` (já nos tokens). Mensagem vem do `response.error`
     server-side (sempre textContent, nunca innerHTML com input do usuário).
   - Sucesso rápido não-bloqueante (ex.: "Preço atualizado"). → `#result-box`
     com `badge badge-success` (já nos tokens).
   - Estados de carga/erro de *renderização* de tabela → o conteúdo da view
     (ex.: `.empty-state`, `.nfe-empty`), já que a area de erro fica no scroll.
3. **Todo `withFailureHandler` também mostra o erro** — hoje 4 views fazem
   `catch(function () {})` silencioso (dashboard, carteira, anuncios). Proibi
   nenhum erro silencioso no `.catch`/failure (exceto pre-fetch do DataStore
   que tem sua própria política).
4. **Não trocar de padrão por aparência:** erro de negócio SEMPRE em
   `#error-box`, nunca em toast. Toast só para confirmação de ação local.
5. **Acessibilidade:** `#error-box` com `role="alert"` e `aria-live="assertive"`.
6. **Feedback de ação (botão):** manter `disabled + "Processando..."` durante
   chamada — regra do `withLoading` já implementada.

## Casos de Borda
- Chamada retorna `response.error` vazio/undefined e `response.data` nulo →
  exibire-box genérico "Nenhuma resposta do servidor".
- `withFailureHandler` dispara com `err.message` → usar `err.message || 'Erro
  de comunicação com o servidor.'`.
- Chamada em pre-fetch do DataStore → maintained guard do DataStore (NÃO
  mostrar erro na tela em startup; registrar no `window.__debugErrors_`).
- Refresh automático concorrente (2 fetches ao mesmo tempo) → mostra apenas o
  último erro; o anterior com sucesso não sobrescreve um erro posterior.

## Critérios de Aceite (Given/When/Then)
1. **Erro de negócio:** Dado um widget com botão "Sincronizar", Quando a
   backend responde `{ error: '...' }`, Então `#error-box` aparece com
   `alert alert-error`, é descartável (botão ×) e o botão volta a habilitado.
2. **Falha de rede:** Dado a chamada `google.script.run` falha, Quando o
   `withFailureHandler` dispara, Então aparece `#error-box` com a mensagem e
   `console.error` registrado — sem silêncio.
3. **Sucesso:** Dado a ação termina OK, Quando renderiza, Então
   `#result-box` exibe `badge-success` (quando `successMessage` fornecido) e
   a view renderiza os dados.
4. **Nenhum widget define `_showError`/`showToast`/`showError` local:** Given
   o código da view, When passa em pattern match, Then só existem chamadas a
   `uiHelpers` (`withLoading`, `showSuccess`, `feedbackError`) — zero duplicados.
5. **514 views de Estoque (18 `showToast`)** migram para o padrão — GWT:
   atualização de preço inline mostra toast de sucesso (→ `#result-box`) e erro
   (→ `#error-box`) sem quebra da edição.

## Fora de Escopo
- Mudar o layout/design dos alertas (mantém tokens existentes de Styles.html).
- Padronizar estados de vazio/carregamento (Fase 7 item 4 separado).
- Servidor-side `Router.js`/`ServiceRegistry` — só client-side.
- Views de shell (StatusView) e shared (DebugConsole) — já seguem padrão próprio validado.

## Dependências
- **Shared:** `ui/shared/UiHelpers.html` (withLoading existente) e
  `ui/shared/Styles.html` (tokens `--color-*`, `--space-*`, `--radius-*`,
  `--font-size-*`, `--z-notification`).
- **Services/Adapters:** nenhum novo. Views continuam via `apiDispatch`.

## Notas de Implementação
1. `ui/shared/UiHelpers.html` adiciona `showSuccess` (exibe `#result-box`),
   `showError` (exibe `#error-box` com `role="alert"`) e `showPending`
   (`#error-box` com `opacity`/`Buscar...`).
2. Migração ordenada view a view, em commits separados por domínio, SEM tocar
   em `Styles.html`, `DesignSystemLoader.html`, `StatusView.html`,
   `Router.js`, `ServiceRegistry.js` (arquivos compartilhados — AGENTS.md).
3. Regra de ouro: a view mantém o conteúdo próprio (cards, tabela, empty-state);
   **apenas o tratamento de erro/sucesso** é extraído para o helper.
4. Um smoke screen test HMTL é inviável (GAS) — validação por inspeção +
   rodada manual da página cada migração de view (testa TODAS as páginas).

## Migração pendente por view
Estado **atual**, para não re-descobrir:

| View | Padrão hoje | Ação |
|---|---|---|
| Dashboard, Carteira, Anuncios, Listings, Pricing, Catalog | `withLoading` + `error-box` | revisar catch silencioso + `role=alert` |
| Estoque, EstoquePrecoBulk, Manual* | `showToast` local (5 views) | migrar p/ `withLoading`/`feedback` |
| NFeEntrada, NFeEntradaProdutos | `_showError` próprio | migrar p/ helper único |
| Orders (toast), Calculator (sem feedback) | misto | padronizar |