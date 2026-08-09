# eCommerce — Painel Shopee + Mercado Livre (Google Apps Script)

Web App em Google Apps Script para controlar a loja pessoal na Shopee e no
Mercado Livre: calculadora de precificação, dashboard unificado, pedidos,
anúncios, catálogo de produtos, NFe Entrada e sincronização de preço/estoque —
tudo integrado via [MCP Tiops](./docs/referencia/MCP_TIOPS_QUICK_START.md).

**Status:** em produção (Web App atualizado automaticamente a cada merge em
`main`). Estoque é o fluxo funcional central, com uso real diário; demais
domínios com código escrito, validação manual pendente em alguns. Ver
[PLANO.md](./PLANO.md), seção "Fases e status".

## Por onde começar

| Você quer... | Leia |
|---|---|
| entender escopo, fases e o que falta | [PLANO.md](./PLANO.md) |
| escrever ou revisar código | [AGENTS.md](./AGENTS.md) |
| executar uma fase no OpenCode | [docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md) |
| entender a arquitetura (micro-serviços, micro-frontends, performance, design system) | [specs/ARQUITETURA.md](./specs/ARQUITETURA.md) |
| montar payload de marketplace | [docs/referencia/](./docs/referencia/) |

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard** | Visão unificada: pedidos recentes, receita Shopee, estoque baixo |
| **Precificação** | Preço sugerido por canal (Shopee × ML) a partir de custo + margem |
| **Pedidos** | Lista unificada dos dois canais com filtro por marketplace |
| **Catálogo** | Produtos de NFe agrupados por código com preços sugeridos |
| **NFe Entrada** | Importação de XMLs/PDFs de NFes do Drive para o Sheets |
| **Entrada Produtos** | Produtos das NFes com busca, filtros e status de recebimento |
| **Calculadora PrecificaPro** | Calculadora interativa ML com widget flutuante |
| **Status Online** | Indicador de status + speed meter no nav bar |

## Arquitetura

Monólito modular: um único projeto Apps Script, domínios separados por
arquivo (não múltiplos deploys). As convenções obrigatórias — namespaces,
Spec-Driven Development, segredos, design system, divisão de papéis entre
Claude Code e OpenCode — estão em **[AGENTS.md](./AGENTS.md)**.

```
src/00_config       → ConfigService + FormatterService
src/01_adapters     → TiopsClient (único cliente HTTP para a Tiops), DriveAdapter
src/02_repositories → Properties/Cache/Sheets/Config (únicos que tocam serviços nativos do GAS)
src/03_services     → Pricing, Orders, OrdersImport, Dashboard, Catalog,
                      NFeEntrada, NFeEntradaProdutos, ManualEntrada, ManualSaida,
                      Estoque, EstoqueBaixa, CarteiraShopee, AnunciosShopee,
                      ShopeeAds, Calculator, Sku, PushNotification (inativo), Status
src/04_gateway      → ServiceRegistry + Router (doGet/doPost/apiDispatch)
ui/shared           → Design tokens, DataStore (cache client-side), UiHelpers,
                      Formatter, DebugConsole, DesignSystemLoader
ui/shell            → Shell (navbar + rotas) + StatusView (indicador online)
ui/<dominio>        → Widgets (Web Components com Shadow DOM)
specs/              → ARQUITETURA.md (doc vivo) + spec de domínios novos em
                      andamento (Spec-Driven Development)
docs/referencia/    → playbooks de payload validados + análise da API Tiops
.claude/skills/     → regras executáveis (fonte única)
.opencode/command/  → mesmas regras acionáveis por /comando no OpenCode
```

### DataStore — navegação instantânea

O app pré-busca em paralelo, ao carregar (`ui/shared/DataStore.html`), os
dados de praticamente todas as páginas (Config, Dashboard, NFe Entrada,
Entrada Produtos, Catálogo, Pedidos, Estoque, Manual Entrada/Saída,
Anúncios Shopee, Carteira Shopee, Shopee Ads) — ver lista completa e
detalhes em `specs/ARQUITETURA.md` §2. Cada página já mostra dado do cache
ao ser aberta, sem esperar round-trip.

### Status Online + Speed Meter

Indicador sticky no nav bar (`ui/shell/StatusView.html`) mostra:
- Bolinha verde (online) / vermelha (offline)
- Timestamp da última atualização
- Timing: total, GAS round-trip e CPU (medido 100% client-side)

## Especificações (`specs/`)

`specs/ARQUITETURA.md` é o documento vivo de arquitetura (micro-serviços,
micro-frontends, performance/integração, design system) — mantenha-o
atualizado conforme a arquitetura muda. Contrato de API e regra de negócio
por domínio vivem no próprio código (`describe()` de cada serviço).

Ao começar um domínio **novo**, o gate de Spec-Driven Development continua
valendo: escreva `specs/<dominio>.md` a partir de `specs/_TEMPLATE.md` com
objetivo, contrato de API interna, regras de negócio, casos de borda e
critérios de aceite **antes** do código, e peça aprovação. Nenhuma mudança
em `src/03_services/**` ou `ui/**` para um domínio novo acontece sem essa
spec aprovada (ver `AGENTS.md`).

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
