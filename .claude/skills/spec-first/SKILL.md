---
name: spec-first
description: Use antes de criar ou editar qualquer arquivo em src/03_services/** ou ui/** deste projeto GAS — garante que existe uma spec aprovada em specs/<dominio>.md antes de codar (Spec-Driven Development).
---

# spec-first

Gate de Spec-Driven Development para este projeto (ver `AGENTS.md`, regra
nº 1). Antes de criar/editar um serviço (`src/03_services/<dominio>/*.js`)
ou uma view (`ui/<dominio>/*View.html`):

1. Identifique o domínio (ex.: `pricing`, `orders`, `listings`,
   `inventoryPricing`, `dashboard`, ou um novo).
2. Verifique se `specs/<dominio>.md` existe.
   - **Não existe** → copie `specs/_TEMPLATE.md`, preencha Objetivo,
     Contrato da API Interna, Regras de Negócio, Casos de Borda e Critérios
     de Aceite (Given/When/Then) com `Status: Draft`, e **pare aqui** — peça
     aprovação do usuário antes de escrever qualquer código.
   - **Existe mas `Status: Draft`** → confirme com o usuário que está
     aprovada (`Status: Approved`) antes de implementar.
   - **Existe com `Status: Approved` ou `Implemented`** → prossiga com a
     implementação, usando a spec como fonte de verdade para nomes de ação,
     schema de parâmetros e regras de negócio (não invente campo/regra que
     não esteja na spec — se precisar de algo novo, atualize a spec primeiro).
3. Depois de implementar, atualize o `Status` da spec para `Implemented` se
   ainda estava `Approved`.

Isso vale igualmente para sessões de Claude Code e de OpenCode — a regra
está em `AGENTS.md`, não só nesta skill, para nenhuma ferramenta ter passe livre.
No OpenCode, ative com `/spec-first`.

**Aprovar uma spec é decisão do usuário, nunca do agente.** Um agente pode
redigir o rascunho e recomendar aprovação, mas mudar `Status: Draft` para
`Approved` por conta própria anula o gate inteiro — nesse caso, pare e peça.
