# Design System — eCommerce Control Panel

Guia de design moderno e profissional para a webapp GAS de gestão Shopee + Mercado Livre.

## Princípios

- **Clareza acima de decoração:** cada elemento estrutural codifica informação
- **Consistência operacional:** estados de pedidos, anúncios e avisos são semânticos
- **Accessibilidade:** contraste WCAA AA+, keyboard support, tema claro/escuro
- **Localização:** tema segue a preferência do OS e toggle manual do usuário

## Palette

### Neutrals (base)
- `#f8f9fa` — surface, backgrounds
- `#e9ecef` — borders, dividers, hover states
- `#dee2e6` — disabled, subtle
- `#6c757d` — secondary text, captions
- `#495057` — tertiary text
- `#212529` — primary text, headings

**Dark theme** (inverte tom mas mantém relação):
- `#1a1d23` — surface
- `#2d3139` — borders
- `#3d414d` — tertiary text
- `#e9ecef` — primary text
- `#b8bcc4` — secondary text

### Semantic
- **Success:** `#198754` (pedido enviado, item ativo)
- **Warning:** `#ffc107` (estoque baixo, revisão pendente)
- **Error:** `#dc3545` (erro, falha, ausência)
- **Info:** `#0d6efd` (notificação, info)

### Marketplace badges
- **Shopee:** `#ee4d2d` (orange) — usar com text color white
- **ML:** `#ffe600` (yellow) — usar com text color #212529

### Primary accent
- `#0d6efd` (blue) — buttons, links, active states

## Typography

### Typefaces
- **Inter 700/800:** headings, labels, strong content
- **Inter 400/500:** body, UI labels, descriptions
- **Roboto Mono 400:** IDs, tracking numbers, data values

**Rationale:** Inter é profissional e webfont-friendly; Roboto Mono dá legibilidade a dados tabulares sem parecer genérico.

### Scale
- **H1:** 32px / 700
- **H2:** 24px / 700
- **H3:** 20px / 600
- **H4:** 16px / 600
- **Body:** 14px / 400 (line-height: 1.6)
- **Small:** 12px / 400 (labels, captions)
- **Mono data:** 13px / 400

### Line length
Body text: max 65ch para legibilidade.

## Spacing

Base unit: **4px**

Scale: 4, 8, 12, 16, 24, 32, 48, 64

- **Compact (padding):** 8px (buttons, form inputs)
- **Standard (card padding):** 16px
- **Generous (section gap):** 24–32px
- **Breathing room (max-width):** 1200px

## Components

### Cards
```
{
  background: surface
  border: 1px border
  border-radius: 8px
  padding: 16px
  box-shadow: 0 1px 3px rgba(0,0,0, 0.08)
}
```

### Buttons
- **Primary:** bg=primary, text=white, padding=8px 16px, radius=6px, font-weight=600
- **Secondary:** bg=surface, border=border, text=text, same padding
- **Tertiary:** no border/bg, text=primary, underline on hover
- **Disabled:** opacity=0.5, cursor=not-allowed

**Focus:** outline=2px solid primary, offset=2px (keyboard accessibility)

### Form inputs
- **Text/Number:** border=border, bg=surface, padding=8px 12px, font-size=14px, radius=6px
- **Label:** above input, font-weight=500, margin-bottom=4px
- **Focus:** border=primary (2px), box-shadow=0 0 0 3px rgba(primary, 0.1)
- **Error state:** border=error, helper text color=error

### Tables
- **Header:** bg=surface-elevated, font-weight=600
- **Rows:** border-bottom=border, hover bg=surface-hover
- **Data columns:** `font-variant-numeric: tabular-nums` para alinhamento
- **Spacing:** padding=12px

### Status badges
- **Active:** bg=green, text=white
- **Pending:** bg=warning, text=#212529
- **Paused:** bg=secondary, text=white
- **Error:** bg=error, text=white
- **Marketplace:** Shopee=orange, ML=yellow

### Loading states
- Button text: "Processando..." com spinner integrado (CSS animation)
- Opacidade: 0.7, cursor=wait
- Disabled durante load

### Error/Success messages
- **Error:** border-left=4px error, bg=error+10% opacity, text=error
- **Success:** border-left=4px success, bg=success+10% opacity, text=success
- **Padding:** 12px
- **Border-radius:** 4px

## Dark theme

Aplicado via `@media (prefers-color-scheme: dark)` e `:root[data-theme="dark"]`.

- Inverte neutrals mantendo contraste mínimo WCAA AA (4.5:1 para texto)
- Semantic colors ganham saturação reduzida em dark (para não queimar os olhos)
- Marketplace badges mantêm cores mas com ajustes de legibilidade

## Implementation

Tokens são CSS custom properties no `<head>` de `ui/shared/Styles.html`:

```css
:root {
  --color-surface: #f8f9fa;
  --color-text: #212529;
  --color-border: #e9ecef;
  --color-primary: #0d6efd;
  --color-success: #198754;
  --color-warning: #ffc107;
  --color-error: #dc3545;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --font-display: 'Inter', sans-serif;
  --font-mono: 'Roboto Mono', monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: #1a1d23;
    --color-text: #e9ecef;
    /* ... */
  }
}

:root[data-theme="light"] {
  /* override */ 
}
:root[data-theme="dark"] {
  /* override */
}
```

Components usam tokens, nunca hard-coded colors.

## Refactoring checklist

- [ ] Remover todos os hard-coded colors de `ui/**/*.html`
- [ ] Remover inline styles — usar classes
- [ ] Buttons: todas usam `.btn`, `.btn-primary`, `.btn-secondary`
- [ ] Forms: labels acima de inputs, sem inline styles
- [ ] Cards: `.card` com padding via token
- [ ] Tables: headers com bg apropriado, rows com borders
- [ ] Loading: `.loading` state em buttons durante fetch
- [ ] Status badges: `.badge-{success|warning|error|info}`
- [ ] Error/success display: `.alert-{success|error}` com colors semânticos
- [ ] Theme toggle: data-theme scripts funcionando (light/dark)

## Referências

- Color contrast: https://webaim.org/resources/contrastchecker/
- WCAA guidelines: https://www.w3.org/WAI/WCAG21/quickref/
- Type scale: https://www.modularscale.com/ (1.25x ratio: 14→17.5→21→26.25...)
- Spacing scale: https://www.designsystems.com/space-grids-and-layouts/
