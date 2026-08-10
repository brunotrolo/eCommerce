# Spec: Hardening — Padronização de tratamento de erro nas views

## Status
Implemented (2026-08-10)

## Objetivo
Item 3 da Fase 7 (Endurecimento): um único padrão de feedback de erro em
**todas** as views — os helpers globais de `ui/shared/UiHelpers.html`
(`showError`/`showSuccess`/`withLoading`/`withErrorHandling`) com os boxes
`#error-box`/`#result-box`, estilo via tokens (`.alert-error`, badges). Hoje
existem duplicações locais que precisam sumir: `CalculatorView`,
`ManualEntradaListView`, `ManualSaidaListView` e `ShopeeAdsView` definem
helpers próprios; `AnunciosShopeeView` tem `showError` local; e
`CarteiraShopeeView`, `NFeEntradaView`, `NFeEntradaProdutosView` escrevem
direto no box em alguns pontos.

## Contrato da API Interna
Sem mudança de contrato público: `UiHelpers.html` já é a fonte única
(comentário "spec error-handling-ui.md" no cabeçalho do arquivo). A view
chama `showError(root, msg)`/`showSuccess(root, msg)`/`withLoading(btn,
invoke, onSuccess, msg)`/`withErrorHandling(root, invoke, onSuccess)` — que
já existem. Mudanças são as views passarem a usá-los.

### Views fora do padrão e correção prevista
| View | Problema | Correção |
|---|---|---|
| `CalculatorView.html` | `.catch` injeta `<div class="calc-warning critical">` diretamente | adicionar `#error-box`/`#result-box` e usar `showError(root, msg)`; remover o CSS/HTML de erro próprio |
| `ManualEntradaListView.html` | `.catch` injeta em `.empty-state` via innerHTML | usar `showError` do UiHelpers (com `#error-box`) e separar empty de erro |
| `ManualSaidaListView.html` | idem | idem |
| `ShopeeAdsView.html` | `withLoading` local (semântica diferente) + `showError` local com auto-hide 8s | usar os helpers globais; simplificar para `withErrorHandling` nas cargas e `withLoading` nos botões |
| `AnunciosShopeeView.html` | `showError` local (textContent simples, sem role/dismiss) | usar `showError` global (remover função local) |
| `CarteiraShopeeView.html` (83-84) | escrita direta no error-box no sync | trocar por `showError(root, msg)` |
| `NFeEntradaView.html` (313-318) | manipulação direta de error-box/result-box | trocar por `showError`/`showSuccess` |
| `NFeEntradaProdutosView.html` (304, 427-431) | idem | idem |

## Regras de Negócio
1. Toda chamada `google.script.run` disparada por **botão** usa `withLoading`
   (desabilita + "Processando..." + erro/sucesso nos boxes).
2. Toda chamada **sem botão** (load inicial, refresh automático, sync)
   usa `withErrorHandling` — erro sempre visível, nunca silencioso.
3. Nenhuma view define `showError`/`showSuccess`/`withLoading`/`withTimeout`
   próprios (grep de verificação no aceite).
4. Erros de validação de formulário também passam por `showError` (mesma
   aparência) — hoje alguns caem em caixas locais.
5. `#error-box` sempre com `role="alert"` (já feito pelo helper global) +
   botão dismiss.

## Casos de Borda
- View sem `#error-box` no DOM (box removido acidentalmente): `showError`
  global já é no-op seguro (`if (!errorBox) return;`).
- Chamada com sucesso mas `response.error` (erro de negócio no payload):
  helpers globais já tratam — a view não precisa re-checar.
- Duas chamadas em paralelo na mesma view: cada uma usa seu próprio box
  (não alterar boxes de outras operações em andamento).

## Critérios de Aceite (Given/When/Then)
- Given a busca por helpers locais, When rodo grep em `ui/`, Then não
  existem definições de `showError`/`showSuccess`/`withLoading` locais
  (fora de `UiHelpers.html`).
- Given qualquer view com erro (Tiops, rede, negócio), When a chamada
  falha, Then `#error-box` aparece com `role="alert"`, mensagem e dismiss.
- Given um botão de ação (sync, importar, pausar), When clicado, Then fica
  desabilitado com "Processando..." e o resultado aparece em
  `#result-box`/`#error-box`.
- Given as telas que hoje misturam estilos (Calculator, ShopeeAds,
  listas manuais), When aberta, Then continuam renderizando com o mesmo
  layout visual (regressão zero de CSS).

## Fora de Escopo
- Mudança de comportamento/tokens de `.alert-*`/badges (já em `Styles.html`).
- Toast global (inexistente; não criar agora).
- `StatusView`/`Shell` (widgets de shell, não tratam erro de ação).

## Dependências
- Services usados: nenhum (client-side puro).
- Repositories usados: nenhum.
- Ações Tiops: nenhuma.
- Shared: `UiHelpers.html` (já contém tudo — sem mudança esperada),
  `Styles.html` (sem mudança esperada para itens existentes).

## Notas de Implementação
- `ShopeeAdsView`: o `withLoading` local é promise-based e resolve
  `response.data`; ao trocar para o global, revisar os call-sites de
  `_withLoading` (5 usos) para passar `invoke(success, failure)` no formato
  esperado (com `response.data` já extraído pelo helper).
- `CalculatorView`: usar `#result-box` para o resultado do cálculo? Não —
  o resultado é conteúdo dinâmico da própria tela (cards), não feedback;
  apenas **erro** vai para `#error-box`.