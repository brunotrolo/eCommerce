# eCommerce — Painel Shopee + Mercado Livre (Google Apps Script)

Web App em Google Apps Script para controlar a loja pessoal na Shopee e no
Mercado Livre: calculadora de precificação, dashboard unificado, pedidos,
anúncios, catálogo de produtos, NFe Entrada e sincronização de preço/estoque —
tudo integrado via [MCP Tiops](./docs/referencia/MCP_TIOPS_QUICK_START.md).

**Status:** código das fases 0–6 e 8 escrito; nenhuma fase validada em produção
ainda (falta o primeiro deploy). Ver [PLANO.md](./PLANO.md).

## Por onde começar

| Você quer... | Leia |
|---|---|
| entender escopo, fases e o que falta | [PLANO.md](./PLANO.md) |
| escrever ou revisar código | [AGENTS.md](./AGENTS.md) |
| executar uma fase no OpenCode | [docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md) |
| saber o contrato de um domínio | `specs/<dominio>.md` |
| montar payload de marketplace | [docs/referencia/](./docs/referencia/) |

## Funcionalidades

| Módulo | Descrição | Spec |
|---|---|---|
| **Dashboard** | Visão unificada: pedidos recentes, receita Shopee, estoque baixo | `specs/dashboard.md` |
| **Precificação** | Preço sugerido por canal (Shopee × ML) a partir de custo + margem | `specs/pricing.md` |
| **Pedidos** | Lista unificada dos dois canais com filtro por marketplace | `specs/orders.md` |
| **Anúncios** | Listar, pausar e reativar anúncios com releitura obrigatória | `specs/listings.md` |
| **Preço & Estoque** | Calcula, aplica preço no canal e confirma por releitura | `specs/inventory-pricing.md` |
| **Catálogo** | Produtos de NFe agrupados por código com preços sugeridos | `specs/catalog.md` |
| **NFe Entrada** | Importação de XMLs/PDFs de NFes do Drive para o Sheets | `specs/nfe-entrada.md` |
| **Entrada Produtos** | Produtos das NFes com busca, filtros e status de recebimento | `specs/nfe-entrada-produtos.md` |
| **Calculadora PrecificaPro** | Calculadora interativa ML com widget flutuante | `specs/calculator.md` |
| **Status Online** | Indicador de status + speed meter no nav bar | `specs/system-status.md` |

## Arquitetura

Monólito modular: um único projeto Apps Script, domínios separados por
arquivo (não múltiplos deploys). As convenções obrigatórias — namespaces,
Spec-Driven Development, segredos, design system, divisão de papéis entre
Claude Code e OpenCode — estão em **[AGENTS.md](./AGENTS.md)**.

```
src/00_config       → ConfigService + FormatterService
src/01_adapters     → TiopsClient (único cliente HTTP para a Tiops), DriveAdapter
src/02_repositories → Properties/Cache/Sheets/Config (únicos que tocam serviços nativos do GAS)
src/03_services     → Pricing, Orders, Listings, InventoryPricing, Dashboard,
                      Catalog, NFeEntrada, NFeEntradaProdutos, Calculator, Status
src/04_gateway      → ServiceRegistry + Router (doGet/doPost/apiDispatch)
ui/shared           → Design tokens, DataStore (cache client-side), UiHelpers,
                      Formatter, DebugConsole, DesignSystemLoader
ui/shell            → Shell (navbar + rotas) + StatusView (indicador online)
ui/<dominio>        → Widgets (Web Components com Shadow DOM)
specs/              → uma spec por domínio (Spec-Driven Development)
docs/referencia/    → playbooks de payload validados + análise da API Tiops
docs/historico/     → planejamento superado, mantido só por histórico
.claude/skills/     → regras executáveis (fonte única)
.opencode/command/  → mesmas regras acionáveis por /comando no OpenCode
```

### DataStore — navegação instantânea

O app pré-busca dados pesados ao carregar (`ui/shared/DataStore.html`):
Dashboard, NFe Entrada, Entrada Produtos, Config e Catálogo ficam em cache
client-side. Navegar entre páginas é instantânea na segunda visita.

### Status Online + Speed Meter

Indicador sticky no nav bar (`ui/shell/StatusView.html`) mostra:
- Bolinha verde (online) / vermelha (offline)
- Timestamp da última atualização
- Timing: total, GAS round-trip e CPU (medido 100% client-side)

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
