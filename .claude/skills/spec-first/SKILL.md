---
name: spec-first
description: Use antes de criar ou editar qualquer arquivo em src/03_services/** ou ui/** deste projeto GAS — garante que existe uma spec em specs/<dominio>.md antes de codar (Spec-Driven Development).
---

# spec-first

Gate de Spec-Driven Development para este projeto (ver `AGENTS.md`, regra
nº 1). Antes de criar/editar um serviço (`src/03_services/<dominio>/*.js`)
ou uma view (`ui/<dominio>/*View.html`):

1. Identifique o domínio (ex.: `pricing`, `orders`, `listings`,
   `inventoryPricing`, `dashboard`, ou um novo).
2. Verifique se `specs/<dominio>.md` existe.
   - **Não existe** → copie `specs/_TEMPLATE.md` e preencha Objetivo,
     Contrato da API Interna, Regras de Negócio, Casos de Borda e Critérios
     de Aceite (Given/When/Then) com `Status: Draft` — **no mesmo fluxo de
     trabalho, antes de codar** (único requisito, não trava o agente).
   - **Existe com `Status: Draft`, `Approved` ou `Implemented`** → prossiga
     com a implementação, usando a spec como fonte de verdade para nomes de
     ação, schema de parâmetros e regras de negócio (não invente campo/regra
     que não esteja na spec — se precisar de algo novo, atualize a spec
     primeiro).
3. O status da spec avança junto com a implementação, pelo próprio agente:
   `Draft` → `Approved` → `Implemented` no mesmo commit/sessão. Ao
   implementar, marque `Implemented` (se estava `Approved`) ou deixe a
   transição `Draft` → `Implemented` registrada junto com o código.

Vale igualmente para sessões de Claude Code e de OpenCode — a regra está em
`AGENTS.md`, não só nesta skill, para nenhuma ferramenta ter passe livre.
No OpenCode, ative com `/spec-first`.

**Nenhuma etapa espera aprovação humana.** O usuário pode revisar e
corrigir depois (pós-hoc), mas o agente nunca fica bloqueado esperando
decisão externa.