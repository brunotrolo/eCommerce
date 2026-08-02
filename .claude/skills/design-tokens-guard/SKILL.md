---
name: design-tokens-guard
description: Use ao revisar ou escrever qualquer CSS/HTML em ui/**/*.html deste projeto — garante que cores, espaçamento, raio e sombra vêm sempre dos tokens de ui/shared/Styles.html, nunca hard-coded.
---

# design-tokens-guard

`ui/shared/Styles.html` é a única fonte de verdade visual deste projeto (ver
`AGENTS.md`). Ao escrever ou revisar qualquer `ui/**/*.html`:

1. **Nenhuma cor hex/rgb solta.** Toda cor deve referenciar uma custom
   property já existente em `Styles.html` (`--color-*`). Se a cor que você
   precisa não existe como token, adicione o token em `Styles.html` primeiro
   — não escreva o valor bruto direto no componente.
2. **Nenhum espaçamento/tamanho em px solto** fora dos tokens `--space-*`,
   `--font-size-*`, `--radius-*`. Exceção aceitável: valores de layout muito
   específicos de um único componente (ex.: `max-width: 960px` do shell) —
   use bom senso, mas prefira token sempre que o valor se repete ou é
   conceitualmente um espaçamento/tamanho do design system.
3. **Todo widget novo usa Shadow DOM + tokens compartilhados.** Confirme que
   o widget faz `shadow.adoptedStyleSheets = [window.__DESIGN_SHEET__]` no
   `connectedCallback` (ver `ui/pricing/PricingView.html` como referência) —
   nunca um `<style>` solto dentro do widget duplicando regras já definidas
   em `Styles.html`.
4. **Classes de componente reaproveitadas.** Antes de criar uma classe CSS
   nova, confira se `.card`, `.btn`, `.table`, `.badge`, `.form-field` ou
   `.alert` já resolvem o caso — só crie uma classe nova quando o componente
   for genuinamente diferente desses.

Ao encontrar uma violação (cor/espaçamento hard-coded, `<style>` duplicando
tokens, widget sem Shadow DOM), sinalize e corrija antes de considerar a
tarefa concluída.

Vale igualmente no Claude Code e no OpenCode (`/design-tokens-guard`).
