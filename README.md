# eCommerce — Painel Shopee + Mercado Livre (Google Apps Script)

Web App em Google Apps Script para controlar a loja pessoal na Shopee e no
Mercado Livre: calculadora de precificação, dashboard unificado, pedidos,
anúncios e sincronização de preço/estoque — tudo integrado via
[MCP Tiops](./docs/referencia/MCP_TIOPS_QUICK_START.md).

**Status:** código das fases 0–5 escrito; nenhuma fase validada em produção
ainda (falta o primeiro deploy). Ver [PLANO.md](./PLANO.md).

## Por onde começar

| Você quer... | Leia |
|---|---|
| entender escopo, fases e o que falta | [PLANO.md](./PLANO.md) |
| escrever ou revisar código | [AGENTS.md](./AGENTS.md) |
| executar uma fase no OpenCode | [docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md) |
| saber o contrato de um domínio | `specs/<dominio>.md` |
| montar payload de marketplace | [docs/referencia/](./docs/referencia/) |

## Arquitetura

Monólito modular: um único projeto Apps Script, domínios separados por
arquivo (não múltiplos deploys). As convenções obrigatórias — namespaces,
Spec-Driven Development, segredos, design system, divisão de papéis entre
Claude Code e OpenCode — estão em **[AGENTS.md](./AGENTS.md)**.

```
src/00_config       → ConfigService (contas, taxas, sheet)
src/01_adapters     → TiopsClient (único cliente HTTP para a Tiops)
src/02_repositories → Properties/Cache/Sheets (únicos que tocam os serviços nativos do GAS)
src/03_services     → Pricing, Orders, Listings, InventoryPricing, Dashboard
src/04_gateway      → ServiceRegistry + Router (doGet/doPost/apiDispatch)
ui/                 → Shell + widgets (Web Components com Shadow DOM) + design tokens
specs/              → uma spec por domínio (Spec-Driven Development)
docs/referencia/    → playbooks de payload validados + análise da API Tiops
docs/historico/     → planejamento superado, mantido só por histórico
.claude/skills/     → regras executáveis (fonte única)
.opencode/command/  → mesmas regras acionáveis por /comando no OpenCode
```

## Especificações (`specs/`)

Cada módulo tem uma spec em markdown (`specs/<dominio>.md`) com objetivo,
contrato de API interna, regras de negócio, casos de borda e critérios de
aceite — escrita **antes** do código, seguindo `specs/_TEMPLATE.md`. Nenhuma
mudança em `src/03_services/**` ou `ui/**` deve acontecer sem uma spec
aprovada correspondente (ver `AGENTS.md`).

## Setup (passo manual, uma única vez)

**Credenciais do clasp para o deploy automático**: rodar `npx clasp login`
localmente, copiar o conteúdo de `~/.clasprc.json` gerado e salvar como
secret `CLASP_CREDENTIALS` no GitHub (Settings > Secrets and variables >
Actions). Esse passo exige login interativo do Google e só pode ser feito
por uma pessoa, nunca por um agente.

## Pipeline e Versionamento

**Desenvolvimento:** Todo push na `main` dispara `.github/workflows/deploy.yml`, que roda
`clasp push --force` para sincronizar o código com o Apps Script no ambiente
`/dev`. Nenhuma versão é criada automaticamente.

**Produção:** Quando uma fase está pronta, você roda manualmente:
```bash
clasp deploy --description "vX — <fase>"
```
Isso cria uma versão publicada e marca um milestone no projeto.

## Links

- [Dashboard Marketplace Connect](https://marketplaces.tiops.com.br)
- [Documentação Oficial da API Tiops](https://marketplaces.tiops.com.br/docs/api.html)
