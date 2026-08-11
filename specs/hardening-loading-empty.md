# Spec: Hardening — Estados de carregamento e vazio (todas as telas)

## Status
Implemented (2026-08-10)

> Nota (10/08/2026): `withErrorHandling` do `UiHelpers.html` foi removido
> (órfão sem chamadores) — a menção no Contrato abaixo fica como histórico.

## Objetivo
Item 4 da Fase 7 (Endurecimento): toda tela deve ter **estado de
carregamento** (primeira carga) e **estado vazio** (lista/dados sem
registros), consistentes via tokens do design system. Hoje o CSS de
loading/empty está duplicado por view (`.catalog-empty`, `.nfe-empty`,
`.empty-state` em 3 views, `.loading` local em Estoque/Manual*) e 4 telas
não têm loading ou empty nenhum (Dashboard, Orders, CarteiraShopee,
Calculator — sem empty; AnunciosShopee sem loading).

## Contrato da API Interna
Sem novas actions. Mudanças client-side:
- `ui/shared/Styles.html`: **novos tokens** (aditivo, sem alterar tokens
  existentes):
  - `.empty-state` — container de lista vazia (typography token, cor token,
    padding/spacing token; ícone opcional por conteúdo da view).
  - `.loading-state` — texto "Carregando..." padronizado com token de cor
    secundária (espinha dorsal sem skeleton nesta fase).
- Views: usam `.empty-state` (mensagem descritiva + opção de ação quando
  fizer sentido, ex.: botão de sincronizar) e `.loading-state` durante
  fetches sem botão.
- Sem mudança em `UiHelpers.html` nesta spec (load/empty são markup + token;
  o fluxo de fetch segue `withErrorHandling` da spec de erro).

### Lacunas a fechar por view
| View | Loading hoje | Empty hoje | Ação |
|---|---|---|---|
| DashboardView | nenhum | "Nenhuma etapa configurada" (parcial) | `#loading-state` no fetch inicial; empty unificado para cada card/sessão quando lista vazia |
| OrdersView | nenhum | "Nenhum pedido encontrado." | `#loading-state` no load/refresh |
| CarteiraShopeeView | nenhum | nenhum | `#loading-state` no sync; `#empty-state` quando sem transações |
| AnunciosShopeeView | nenhum (badge de cache) | "Nenhum anúncio ainda..." | `#loading-state` no load |
| CalculatorView | nenhum | nenhum | (não tem lista — fora do padrão list/empty; só loading do já existente no botão) |
| CatalogView | `Carregando...` (botão) + `catalog-empty` | "Nenhum produto encontrado." | trocar `.catalog-empty` local por token `.empty-state` |
| EstoqueView | `#loading-state` + `.loading` local (CSS) | "Nenhum item encontrado." | remover CSS local de `.empty-state`/`.loading`; usar. token |
| NFeEntrada(Produtos) | "Carregando..." em `nfe-sidebar-empty` | sim | trocar `.nfe-empty`/`.nfe-sidebar-empty` locais por tokens |
| Manual(Entrada/Saida)View | `div.loading` local | sim | idem |
| Manual(Entrada/Saida)ListView | option "Carregando produtos..." | sim | manter (select), trocar `.empty-state` local pelo token |
| ShopeeAdsView | "Carregando..."/"Sincronizando..." botão | "Nenhum registro encontrado." | manter fluxo, tokens onde houver CSS local |

## Regras de Negócio
1. Loading aparece **antes** do fetch e some **depois** (em sucesso ou
   erro — erro usa `#error-box` por cima).
2. Empty só quando a resposta deu sucesso e a lista veio vazia — **nunca**
   confundir com erro (bug atual de `ManualEntradaListView`/`ManualSaidaListView`
   que jogam erro no `.empty-state`).
3. Vazio com ação: quando a tela tem botão de sync/import, o empty sugere
   usar o botão (texto, não botão duplicado).
4. CSS de loading/empty vem **só** de `Styles.html` (design-tokens-guard):
   toda duplicação local é removida nesta fase.

## Casos de Borda
- Fetch em paralelo (preload): cada seção mostra seu loading; primeira
  resposta esconde; resposta tardia não esconde o empty de outra seção.
- Lista vazia com filtro ativo (ex.: estoque por status): mensagem pode
  mencionar o filtro ("Nenhum item com esse status").
- View com abas/etapas (Dashboard): empty por seção, não tela inteira.

## Critérios de Aceite (Given/When/Then)
- Given qualquer tela com dados (Dashboard, Orders, Carteira, Anúncios),
  When abre pela 1ª vez, Then aparece "Carregando..." (token) até a
  resposta, e some após.
- Given resposta OK com lista vazia, When renderiza, Then aparece
  `#empty-state` com token `.empty-state` (nunca um erro).
- Given resposta de erro, When renderiza, Then aparece `#error-box` (spec
  de erro), não `.empty-state`.
- Given grep de CSS em `ui/`, When busco `empty-state|loading|catalog-empty|nfe-empty`,
  Then só há referências a tokens de `Styles.html` (nada de definições
  locais).

## Fora de Escopo
- Skeletons/placeholders avançados.
- Estados de vazio em `StatusView`/`Shell` (não são listas).
- Mudança de textos de negócio existentes (só padroniza apresentação).

## Dependências
- Services usados: nenhum.
- Repositories usados: nenhum.
- Ações Tiops: nenhuma.
- Shared: `Styles.html` (tokens novos — arquivo compartilhado, mudança
  aditiva; validar TODAS as páginas após, checklist AGENTS.md).

## Notas de Implementação
- Tokens novos em `Styles.html` no mesmo lugar dos `.alert-*`/badges.
- O `.catalog-empty`/`.nfe-empty` locais são substitutos visuais do mesmo
  conceito — a troca é 1:1 (mesma estética), apenas movendo a regra para o
  token, evitando regressão visual.
- CSS local removido junto da troca (não deixar morto, como já foi
  corrigido em passagens anteriores do projeto).