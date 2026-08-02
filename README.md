# eCommerce — Painel Shopee + Mercado Livre (Google Apps Script)

Web App em Google Apps Script para controlar a loja pessoal na Shopee e no
Mercado Livre: calculadora de precificação, dashboard unificado, pedidos,
anúncios e sincronização de preço/estoque — tudo integrado via
[MCP Tiops](./MCP_TIOPS_QUICK_START.md).

## Arquitetura

Monólito modular: um único projeto Apps Script, domínios separados por
arquivo (não múltiplos deploys). Ver **[AGENTS.md](./AGENTS.md)** para as
convenções obrigatórias (namespaces, Spec-Driven Development, segredos,
design system) — lido tanto por Claude Code quanto por OpenCode.

```
src/00_config       → ConfigService (contas, taxas, sheet)
src/01_adapters     → TiopsClient (único cliente HTTP para a Tiops)
src/02_repositories → Properties/Cache/Sheets (únicos que tocam os serviços nativos do GAS)
src/03_services     → Pricing, Orders, Listings, InventoryPricing, Dashboard
src/04_gateway      → ServiceRegistry + Router (doGet/doPost/apiDispatch)
ui/                 → Shell + widgets (Web Components com Shadow DOM) + design tokens
specs/              → uma spec por domínio (Spec-Driven Development)
```

## Especificações (`specs/`)

Cada módulo tem uma spec em markdown (`specs/<dominio>.md`) com objetivo,
contrato de API interna, regras de negócio, casos de borda e critérios de
aceite — escrita **antes** do código, seguindo `specs/_TEMPLATE.md`. Nenhuma
mudança em `src/03_services/**` ou `ui/**` deve acontecer sem uma spec
aprovada correspondente (ver `AGENTS.md`).

## Setup (passos manuais, uma única vez)

1. **API key da Tiops**: no editor do Apps Script, Project Settings > Script
   Properties, adicionar `TIOPS_API_KEY` = `mc_live_XXXX`. Nunca commitar a chave.
2. **Credenciais do clasp para o deploy automático**: rodar `npx clasp login`
   localmente, copiar o conteúdo de `~/.clasprc.json` gerado e salvar como
   secret `CLASP_CREDENTIALS` no GitHub (Settings > Secrets and variables >
   Actions). Esse passo exige login interativo do Google e só pode ser feito
   por uma pessoa, nunca por um agente.

## Deploy

Todo push na branch `main` dispara `.github/workflows/deploy.yml`, que roda
`clasp push` + `clasp deploy` automaticamente — sem passo manual depois do
setup inicial.

## Guias de marketplace

- **[MCP_TIOPS_QUICK_START.md](./MCP_TIOPS_QUICK_START.md)** — uso geral do MCP Tiops.
- **[SHOPEE_CRIAR_ANUNCIO.md](./SHOPEE_CRIAR_ANUNCIO.md)** — payload/regras validadas para anúncios Shopee.
- **[MERCADO_LIVRE_CRIAR_ANUNCIO.md](./MERCADO_LIVRE_CRIAR_ANUNCIO.md)** — payload/regras validadas para anúncios Mercado Livre.

## Links

- [Dashboard Marketplace Connect](https://marketplaces.tiops.com.br)
- [Documentação Oficial da API Tiops](https://marketplaces.tiops.com.br/docs/api.html)
