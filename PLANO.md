# PLANO.md — plano vivo do projeto

> Documento **vivo**: é a única fonte de verdade sobre escopo, fases e status
> (inclusive de planos e specs antigos já superados/removidos — não existe
> pasta de arquivo morto separada, tudo fica registrado direto aqui).
> Regras de código e convenções ficam em [AGENTS.md](./AGENTS.md).
> Prompts prontos para executar cada fase ficam em
> [docs/HANDOFF_OPENCODE.md](./docs/HANDOFF_OPENCODE.md).

---

## 1. Objetivo do produto

Um Web App em Google Apps Script, de uso pessoal, que centraliza a operação da
loja na **Shopee** e no **Mercado Livre** — substituindo a rotina hoje feita
manualmente nos apps oficiais + planilha. Toda integração com marketplace
passa pela API Tiops (`POST https://mcp.tiops.com.br`).

**Não-objetivos (v1):** multiusuário, multi-loja, Amazon/Shein/Bling,
automação por trigger sem supervisão, app mobile nativo.

---

## 2. Modelo de trabalho: dois agentes, papéis distintos

| | Claude Code (aqui) | OpenCode |
|---|---|---|
| Papel | **Guia / arquiteto** | **Executor** |
| Faz | revisa plano e specs, decide arquitetura, escreve os prompts de execução, revisa o diff pronto | cria e edita arquivos em `src/`, `ui/`, roda `clasp`, commita |
| Não faz | escrever código de implementação em massa | decidir arquitetura ou mudar spec por conta própria |

O motivo é econômico: o raciocínio de arquitetura é caro em tokens e acontece
uma vez; a digitação de código é barata e repetitiva. Claude Code produz o
**pacote de execução** (prompt + skill + critério de aceite), OpenCode executa.

Ciclo padrão de uma fase:

```
1. Claude Code  → confere/ajusta specs/<dominio>.md   (Status: Approved)
2. Claude Code  → gera o prompt da fase                (skill handoff-prompt)
3. Você         → cola o prompt no OpenCode
4. OpenCode     → implementa, roda skills, commita
5. Você         → valida pelos critérios de aceite da fase (seção 4)
6. Claude Code  → revisa o diff, marca a fase como Validada aqui
```

---

## 3. Escopo funcional v1 — domínios

Numeração 1-8 abaixo é o registro histórico do escopo fundador do projeto
(mantida por rastreabilidade). O app cresceu bem além disso — a segunda
tabela lista os domínios adicionados depois, todos com spec
`Approved`/`Implemented` e código rodando em produção hoje (auditoria de
09/08/2026, ver "Estado real de hoje" abaixo).

| # | Domínio | Serviço | O que entrega |
|---|---|---|---|
| 1 | **Precificação** | `src/03_services/pricing/PricingService.js` | Preço sugerido por canal a partir de custo + margem, descontando taxa. Comparativo Shopee × ML lado a lado. Motor interno (sem página própria), consumido por Calculadora/Catálogo/Estoque. |
| 2 | **Dashboard** | `src/03_services/dashboard/DashboardService.js` | Visão única: pedidos recentes, receita, estoque baixo. Cache de 5 min. |
| 3 | **Pedidos** | `src/03_services/orders/OrdersService.js` | Lista unificada dos dois canais em shape normalizado + detalhe do pedido. |
| 4 | **Catálogo** | `src/03_services/catalog/CatalogService.js` | Produtos recebidos (NFe) agrupados por código, com custo mais recente e preços sugeridos para ambos canais. |
| 5 | ~~**Anúncios**~~ | — | ~~Listar, ver detalhe, pausar e reativar anúncios, com releitura obrigatória de confirmação.~~ **Removida 09/08/2026** — página sem utilidade excluída do projeto. Substituída na prática pelo domínio **Anúncios Shopee** da tabela abaixo. |
| 6 | ~~Preço & Estoque~~ | — | ~~Liga Precificação + Anúncios: calcula, aplica no canal, confirma relendo.~~ **Removida** — página e serviço legacy excluídos; regras de preço/estoque seguem em `PricingService`/`EstoqueService`. |
| 8 | **Calculadora PrecificaPro** | `src/03_services/calculator/CalculatorService.js` | Calculadora interativa **única** do app (Shopee + Mercado Livre) com widget flutuante (modal), botão 🧮 no topo. Dois seletores: canal (Shopee/ML) e modo (Formador de Preço custo→preço, ou Receita Líquida preço→líquido). Shopee usa o modelo de taxa validado por engenharia reversa de pedidos reais; ML mantém sua tabela por faixa/regime, inalterada. |

### Domínios adicionados após o escopo inicial (todos ativos em produção)

| Domínio | Serviço | O que entrega |
|---|---|---|
| **Estoque (unidades FIFO)** | `src/03_services/estoque/EstoqueService.js` | Rastreamento unitário FIFO por unidade, alimentado por NFe/Manual, preços/margens recalculáveis via motor único. **Fluxo funcional central do app hoje.** |
| Baixa de Estoque | `src/03_services/estoque/EstoqueBaixaService.js` | Motor interno: dá baixa FIFO nas unidades vendidas a partir de pedidos importados/reprocessados; sem página própria. |
| NFe Entrada | `src/03_services/nfeEntrada/NFeEntradaService.js` | Sincroniza NFes do Drive, marca como processadas. |
| NFe Entrada Produtos | `src/03_services/nfeEntradaProdutos/NFeEntradaProdutosService.js` | Extrai produtos de cada NFe (com rateio de desconto/outros), alimenta Catálogo e Estoque. |
| Manual Entrada | `src/03_services/manualEntrada/ManualEntradaService.js` | Entrada de estoque sem NFe (compra direta, brinde, ajuste). |
| Manual Saída | `src/03_services/manualSaida/ManualSaidaService.js` | Saída de estoque sem venda (perda, brinde, ajuste), com baixa FIFO automática. |
| Carteira Shopee | ~~`src/03_services/carteiraShopee/CarteiraShopeeService.js`~~ | **Removida 10/08/2026** — página e automações excluídas (decisão do usuário). |
| Anúncios Shopee | ~~`src/03_services/anunciosShopee/AnunciosShopeeService.js`~~ | **Removido 13/08/2026** (decisão do usuário) — absorvido em 12/08/2026 pelo Pareamento SKU e removido com ele; a aba `ANUNCIOS_SHOPEE` não é mais criada nem consumida. |
| Shopee Ads | ~~`src/03_services/shopeeAds/ShopeeAdsService.js`~~ | **Removida 10/08/2026** — página e automações excluídas (decisão do usuário). |
| Pareamento SKU (backend only) | ~~`src/03_services/produtoSkuMap/ProdutoSkuMapService.js`~~ | **Removido 13/08/2026** (decisão do usuário) — pedidos Shopee usam apenas o `item_sku` nativo; abas `ANUNCIOS_SHOPEE`/`ANUNCIOS_PERFORMANCE` e passos `syncListings`/`updateSku` eliminados da cadeia, do `ServiceRegistry` e do `filePushOrder`. |

### Motores internos (sem página própria)

- `PricingService` — motor único de sugestão de preço e margem.
- `SkuService` — categoria/label de produto.
- `PushNotificationService` (mas **INATIVO**) — webhook Shopee, aguarda app próprio na Shopee Open Platform (Tiops detém as credenciais hoje).

### Specs em Draft, sem código ainda

(nenhuma — todas as specs ativas estão `Approved`/`Implemented`. A única spec
com Draft histórico era `produto-anuncio-map.md`, implementada em 10/08/2026
— ver "Pareamento SKU" na tabela de domínios acima e
`specs/ARQUITETURA.md`.)

### Removidos

- **Anúncios** (Removido 09/08/2026) — página sem utilidade excluída; substituída na prática pelo domínio **Anúncios Shopee**.
- **Preço & Estoque** (Removido) — página e serviço legacy excluídos; regras de preço/estoque seguem em `PricingService`/`EstoqueService`.
- **Atualização de Preço em Estoque em lote** (Removido 09/08/2026) — `EstoquePrecoBulkView.html` nunca foi conectado ao Shell (widget fantasma, mesmo problema do `PricingView.html` original) e tinha um bug de prefixo de ação que a impediria de funcionar mesmo se estivesse acessível. Funcionalidade equivalente (propagação de preço/margem pra todos os itens `DISPONÍVEL` do produto) já existe em `estoque.updateItem`.

---

## 4. Fases e status

Duas colunas de status, porque **código escrito ≠ funcionando**:

- **Código** — os arquivos existem no repositório e passam na revisão.
- **Validado** — rodou no Apps Script real, com dado real, e bateu com o
  critério de aceite abaixo.

| Fase | Escopo | Código | Validado |
|---|---|---|:---:|
| 0 | Fundação + pipeline de deploy | ✅ | ✅ |
| 1 | Precificação | ✅ | ✅ |
| 2 | Dashboard | ✅ | ✅ |
| 3 | Pedidos | ✅ | ✅ |
| 4 | Catálogo | ✅ | ✅ |
| 5 | Anúncios | — | Removida (09/08/2026) |
| 6 | Preço & Estoque | — | Removida (09/08/2026) |
| 7 | Endurecimento | ✅ | ⬜ |
| 8 | Calculadora PrecificaPro | ✅ | ✅ |
| 9 | Auditoria de regressões — Estoque FIFO (Tier 1) | ✅ (11/08/2026) | ⬜ |
| 9 | Auditoria — Tier 2 (J1: revisão de envio — excedente de baixa parcial) | ✅ (11/08/2026) | ⬜ |
| 9 | Auditoria — Tier 3 (J2: decisões + trigger diário 06h) | ✅ (11/08/2026) | ⬜ |
| — | Auditoria — Tier 4 (backlog evolutivo — decidido: nada agora) | ⬜ backlog | ⬜ |
| — | Status Online + Speed Meter | ✅ | ⬜ |
| — | DataStore (cache client-side) | ✅ | ⬜ |
| — | Estoque (unidades FIFO) | ✅ | ✅ |
| — | Webhook Shopee (Push) | ✅ | ⬜ |
| — | Carteira Shopee | ✅ | Removida (10/08/2026) |
| — | Anúncios Shopee (contraído p/ syncListings+updateSku) | ✅ | Removida (10/08/2026) |
| — | Shopee Ads (Gestão de Anúncios Pagos) | ✅ | Removida (10/08/2026) |
| — | Pareamento SKU (Anúncio Shopee ↔ Estoque) | ✅ | ✅ |

> **Estado real de hoje:** o app roda em produção (deploy automático, ver
> `specs/ARQUITETURA.md` § CI e Deploy). O fluxo funcional ativo é o domínio
> **Estoque**: 157 unidades rastreadas unitariamente (FIFO), alimentado por
> NFe + Manual, com preços sincronizáveis com o catálogo via motor único de
> margem (`PricingService`). Fases 0–4 e 8 validadas — 0, 1 e 8 por
> cálculo/smoke, 2–4 por conferência manual do usuário com dados reais
> (09/08/2026); restam pendentes de validação ativa Status Online,
> DataStore/DataClient e Webhook Shopee (ver tabela acima), além
> da fase 7 (Endurecimento — código entregue em 10/08/2026, validação final
> do usuário ainda pendente). **Pareamento SKU validado em 10/08/2026**
> (usuário): UI renderiza dados reais, coluna `SKU` de `ANUNCIOS_SHOPEE` tem
> valores reais de `CODIGO_PRODUTO` nos 43 anúncios e `getSugestoes()`
> retorna `{ pendentes: [], total: 0 }` (critério de aceite 4; critério 1
> coberto por smoke test; critérios 2/3 entram em uso quando houver anúncio
> novo sem `item_sku` ou item marcado `SEM_ESTOQUE`).
>
> **Auditoria da baixa FIFO (11/08/2026):** Tier 1 entregue (3 regressões,
> commit `eef9a37` — FIFO por `new Date()` em data BR, `TOTAL_COST` em
> reversões, saída manual com baixa parcial); **Tier 2 (J1: gap de envio —
> excedente de baixa parcial nunca era rebaixado) entregue** no mesmo dia
> (spec `specs/estoque-baixa.md` + backfill com agregação de rows `BAIXADO`
> e retry do remanescente com chave `#R<já-baixado>`, gate por unidades no
> backfill e no sync — validado por smoke, cenários 8-10); **Tier 3**
> fechado: J2a coberto pelo J1, J2b decidido (FIFO estrito), J2c
> implementado (trigger diário 06h via menu Agendamento); **Tier 4** ficou
> backlog (decisão do usuário: nada agora).
>
> **Webhook Shopee:** código implementado e testado
> (`PushNotificationService.js`), mas **inativo** — a Tiops detém as
> credenciais de API da loja, logo os pushes vão para a callback URL da
> Tiops, não para nós. Para ativar, o usuário precisa criar app próprio na
> Shopee Open Platform e migrar as credenciais.
>
> Histórico de bugs corrigidos, otimizações de performance e limpezas de
> código morto/documentação fica no log de commits do git, não aqui —
> lições que viram regra permanente estão em `AGENTS.md`/`specs/ARQUITETURA.md`;
> precedentes concretos que valem como aviso ficam na tabela de riscos
> (seção 6, abaixo).

### Fase 0 — Fundação + pipeline de sincronização (/dev)

Validada — `.clasp.json`, `appsscript.json`, `ConfigService`, repositórios,
`ServiceRegistry`, `Router`, Shell + design tokens, CI/CD (ver
`specs/ARQUITETURA.md` § CI e Deploy).

### Fase 1 — Precificação

Validada — `runSmokeTests_()` (`src/99_Main.js`) cobre os cenários Shopee/ML
e o caso de margem inviável.

### Fase 2 — Dashboard

**Critério de aceite:**
- [x] Os números conferem com os apps oficiais no mesmo dia.
- [x] Segunda carga em menos de 5 min vem do cache (confirmar por log/tempo).
- [x] Falha da Tiops mostra mensagem de erro na tela, não tela em branco.

### Fase 3 — Pedidos

**Critério de aceite:**
- [x] Um pedido real de cada canal confere com o app oficial (ID, data, valor, status).
- [x] O Dashboard continua correto depois de passar a consumir `OrdersService`.
- [x] Canal sem pedido no período devolve lista vazia, não erro.

### Fase 4 — Catálogo

Critérios de aceite todos cobertos (agrupamento por código, preço sugerido
via `PricingService`, memória de cálculo, ordenação, margem líquida real,
lista vazia sem erro). **Validado em 09/08/2026 por conferência manual do
usuário no app real.**

### Fase 5 — Anúncios

**Removida em 09/08/2026** — página sem utilidade excluída do projeto;
substituída na prática pela contração **Anúncios Shopee**
(`syncListings`/`updateSku`, a partir de 10/08/2026 — ver tabela acima). Critérios de aceite originais não se aplicam mais:
- ~~Pausar e reativar um anúncio de teste real funciona nos dois canais.~~
- ~~O estado é confirmado por releitura (`get_item` / `shopee_get_item`),
      nunca só pela resposta do update.~~
- ~~Anúncio inexistente devolve erro tratado na UI.~~

### Fase 6 — Preço & Estoque

**Removida em 09/08/2026** — página e serviço legacy excluídos; as regras de
preço/estoque seguem em `PricingService`/`EstoqueService`. Critérios de
aceite originais não se aplicam mais:
- ~~Fluxo completo calcular → aplicar → reler → confirmar, num item de teste.~~
- ~~O preço novo aparece no app oficial do canal.~~
- ~~Caminho de erro (item inexistente, preço inválido) tratado na UI.~~

### Fase 7 — Endurecimento (código ✅ 10/08/2026 — validação ⬜ usuário)

Só entra depois que 0–4 e 8 estiverem **validadas** (5 e 6 foram removidas
em 09/08/2026 — não bloqueiam mais). Entregue (código, specs Implemented,
commits `a41a0c7`→`1b76c28`):

- ✅ Log de operações de escrita em `SheetsRepository` (o que mudou, quando, resultado) — audit de UPDATE nos repos de estoque (ex-`AnunciosShopeeRepository`, removido em 13/08/2026).
- ✅ Padronização do tratamento de erro em todos os widgets — helpers únicos de `UiHelpers.html` (`withLoading`/`showError`/`showSuccess`); zero helpers locais nas views. (`withErrorHandling`/`withTimeout` existiam aqui mas foram removidos em 10/08/2026 — órfãos sem chamadores.)
- ✅ Teste de contrato contra a Tiops — teste global 30 ações vs `list_actions`/`describe_action`, registro por serviço em `docs/referencia/CONTRATOS_CONFIRMADOS.md`; feature `shopee_ads_terminate_campaign` removida (404 real).
- ✅ Estado de carregamento e vazio em todas as telas — tokens `.empty-state`/`.loading-state` em `Styles.html`, aplicados em todas as views.
- ✅ **[Adicionado 2026-08-11]** Integração da skill `ecommerce-optimization` (advisory + gating) para otimização de anúncios Shopee/Mercado Livre — valida 4 restrições de negócio (sem buzzwords, preço com justificativa, descrição: edits menores, sem promoções inventadas) em fluxos de edição de listagem.

Validação ⬜ (usuário): Status Online + Speed Meter, DataStore/DataClient, Webhook Shopee (inativo — requer app na Shopee Open Platform). As páginas Carteira Shopee, Anúncios Shopee, Shopee Ads foram removidas em 10/08/2026 e a página Parear SKU em 12/08/2026 (decisão do usuário) — não fazem mais parte da validação.

### Fase 8 — Calculadora PrecificaPro

Validada — calculadora única (Shopee + ML) via `CalculatorService.calculate`,
com os 10 cenários Given/When/Then cobertos em `runCalculatorSmokeTests_()`
(`src/99_Main.js`). Histórico de como chegou a esse formato (tentativa de
widget dedicado descartada, bug de CSS `[hidden]`) está no log de commits e,
como lição permanente, na tabela de riscos (seção 6).

### Fase 9 — Auditoria de regressões do estoque FIFO (Tiers 1–3 ✅ 11/08/2026; Tier 4 backlog)

Origem: auditoria dirigida do fluxo de baixa de estoque (11/08/2026) sobre
`EstoqueBaixaService`/`EstoqueRepository`/`OrdersImportService`/
`ManualSaidaService`/`EstoqueService` — sem relato de bug do usuário, achados
por análise estática e boas práticas de datas. Evidências completas em
`docs/DIAGNOSTICO_ARQUITETURA.md` §8. **Testes automatizados das regressões
desta auditoria + taxas/formatação agora rodam no CI** (`tests/*.test.js` via
`node --test`, harness em `tests/helpers/` — item 7 do DIAGNOSTICO §9).

#### Tier 1 — Bugs de regressão (código ✅ commit `eef9a37`, validação ⬜ usuário)

1. **FIFO desordenado por `new Date()` em data BR** — `DATA_ENTRADA` é
   `dd/MM/yyyy HH:mm:ss`; o V8 lê `MM/dd/yyyy` (silencioso) → a baixa pegava
   **lote errado**. Fix: `FormatterService.parseDateTime` (valida dia/mês,
   `31/02` → null → timestamp 0 = mais antigo) em
   `EstoqueRepository.getItemsDisponivelPorProduto` e no sort `DATA_ENTRADA`
   do `EstoqueService`. Smoke novo na suíte Estoque Baixa (cenário 7).
2. **`TOTAL_COST` não refletia reversões** — cancelado/devolvido revertia as
   unidades (IDs removidos) mas o custo acumulado do pedido ficava
   superestimado. Fix: `reverterBaixa` calcula e retorna `custoTotal` das
   unidades revertidas (mesma fórmula do `baixarPorProduto`);
   `processBaixaForOrder_` subtrai com `Math.max(0, …)`.
3. **Saída manual corrompia estoque em falha** — baixa **parcial** gravava
   units como `BAIXADO` + linha em `ESTOQUE_BAIXAS` e o serviço ainda
   retornava "Nenhuma saída registrada" (estoque sumia sem registro). Fix:
   pre-check de disponibilidade antes da baixa + rollback idempotente
   (`_rollbackBaixa_` → `reverterBaixa`) também quando `appendRow` falha;
   WARN em `LoggingService`.

Validação local: `node --check` nos 6 arquivos + `validate-dead-code.js` 0
achados. **Validação no app real ⬜:** rodar smoke da suíte Estoque Baixa
(menu) + conferir a ordem FIFO numa baixa real.

#### Tier 2 — Gap de envio (J1) — entregue 11/08/2026

**J1 — Vendeu N, baixa conseguiu B < N (baixa parcial):** o
`backfillExistingOrders` tratava uma row `BAIXADO` existente (mesma
`REFERENCIA_ORIGEM`) como "pedido completo" mesmo com `QUANTIDADE < qty` —
a sobra (N − B) nunca era rebaixada e o pedido virava `BAIXADO`; e o gate de
status contava entradas de SKU em vez de unidades. **Entregue:**
`specs/estoque-baixa.md` + backfill com agregação de todas as rows `BAIXADO`
da referência (soma `QUANTIDADE`, ids únicos, `REVERTIDO` ignorado) com
retry do remanescente na chave determinística `#R<já-baixado>`; gate
`PEDIDOS.BAIXADO` conta unidades (backfill **e** sync de pedidos — no sync,
`jaExistia` credita o agregado da referência); marcador
`PENDENTE_MAPEAMENTO` grava a quantidade pendente real. Não alterou o motor
FIFO nem a UI (`PARCIAL` já
existe). Smoke cenário 8/9. **Validação no app real ⬜** — rodar smoke da
suíte Estoque Baixa (menu) e conferir a aba `ESTOQUE_BAIXAS` após um
`reprocessarPendentes` real.

#### Tier 3 — Decisões de comportamento do reprocessamento (J2)

| Item | Problema | Plano | Decisão |
|---|---|---|---|
| **J2a** | `reprocessarPendentes` só rebaixa com estoque total; parcial enxugaria mais rápido | rebaixar o que tem + PENDENTE para o resto, mantendo idempotência | ✅ coberto pelo J1 (11/08/2026) — motor já rebaixa o que existe (baixa parcial por design), o resto fica `PARCIAL` e converge ciclo a ciclo via chave `#R`; evidência no smoke cenário 10 |
| **J2b** | PENDENTE rebaixa lote antigo (mapeado) antes do lote novo da compra | opção de reorder: lote novo na frente quando o antigo não sumir | ✅ decidido 11/08/2026: **manter FIFO estrito** (sem código) — coerência de custo/contabilidade; reavaliar se o lote antigo não girar na prática |
| **J2c** | Sync é manual ("Sincronizar Tudo"); pedidos só baixam no ciclo | avaliar trigger diário conservador (mudança de operação) | ✅ implementado 11/08/2026: menu **Agendamento → Agendar Sync Diário (06h)** — 1x/dia (fuso da planilha), `ordersImport` + `reprocessarPendentes` em try/catch separados; idempotente (deleta trigger existente do handler); botão manual continua |

Critério de aceite do Tier 3: após uma semana de uso real, zero divergências
entre `ESTOQUE`/`ESTOQUE_BAIXAS`/`PEDIDOS` (BAIXADO/PARCIAL/PENDENTE
coerentes com o status de pagamento) e `TOTAL_COST` igual à soma das units
baixadas.

#### Tier 4 — Backlog evolutivo (não bloqueia nada)

- Histórico/auditoria de baixa por unit (quem vendeu, quando) — hoje só o
  estado atual é persistido.
- Alerta de estoque zerado/ocioso por produto (extensão de
  `_getEstoqueDisponivel`).
- Itens de performance do diagnóstico de 09/08 foram entregues depois deste
  backlog: P1 (dreno único de logs, commit `a607d1d`) e P3/B2 (cache server
  5min + `limit` no `getItems`, `a607d1d` + `9637f71`); B1/S2/P2 (smoke
  destrutivos separados, anti-drift Catálogo×Pricing, lazy preload por aba no
  Shell) em `d4d5564`. Estado completo em `docs/DIAGNOSTICO_ARQUITETURA.md`
  §9.

### Shopee Ads — Gestão de Anúncios Pagos

**Removida em 10/08/2026** — página e automações excluídas (decisão do
usuário: sem utilidade para o projeto). Critérios de aceite originais não se
aplicam mais:
- ~~A página "Shopee Ads" aparece no menu Vendas.~~
- ~~Ao carregar, exibe saldo de créditos Shopee (verde >R$50, amarelo <R$50, vermelho =R$0).~~
- ~~Lista campanhas com métricas: impressões, cliques, CTR, CVR, ROAS, vendas.~~
- ~~ROAS colorido: >2 verde, 1–2 amarelo, <1 vermelho.~~
- ~~Ação pausar: confirmação → campanha fica PAUSED na Shopee.~~
- ~~Ação retomar: confirmação → campanha fica ACTIVE.~~
- ~~Ação encerrar: confirmação dupla → campanha TERMINATED (irreversível).~~
- ~~Toggle "Campanhas Ads" ↔ "Visitas / Conversão" funciona.~~
- ~~Métricas de visitas mostram itens, visitas, cliques, conversão.~~
- ~~Cache: segunda carga em <5s (cache 5min campanhas).~~
- ~~Sync: botão "Sincronizar Campanhas" atualiza dados via Tiops.~~
- ~~Erro Tiops: exibe mensagem de erro, não tela em branco.~~

---

## 5. Recursos já existentes (reaproveitar, nunca recriar)

| Recurso | ID |
|---|---|
| Projeto Apps Script | `1zU9zBb8QeqWr-m2YORwyKx-6ypK4JrQhqZ29M3FJs8BmWhkO1VErKy3w` |
| Google Sheet "eCommerce" | `1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50` |
| Endpoint Tiops | `POST https://mcp.tiops.com.br` |
| Conta Mercado Livre | `3520412809` (param `meliUserId`) |
| Conta Shopee | `1880105398` (param `shopId`) |

Contratos da Tiops já verificados contra a API real ficam em
[`docs/referencia/CONTRATOS_CONFIRMADOS.md`](./docs/referencia/CONTRATOS_CONFIRMADOS.md)
— consulte antes de gastar uma chamada de catálogo.

> ⚠️ O token da conta do **Mercado Livre** na Tiops expirou em 02/08/2026 (ver
> validade atual em `docs/referencia/CONTRATOS_CONFIRMADOS.md`). Se as
> chamadas de ML falharem com erro de autenticação, reconecte a conta em
> <https://marketplaces.tiops.com.br> antes de investigar o código.

---

## 6. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Agente inventar nome/params de ação da Tiops | skill `tiops-contract` — confirmar em `list_actions`/`describe_action` antes de codar |
| Dois agentes divergirem de convenção | `AGENTS.md` é fonte única; `CLAUDE.md` só aponta para ele |
| Update de marketplace "dar OK" sem ter aplicado | releitura obrigatória — regra em `AGENTS.md`, aplicada hoje em `EstoqueService` |
| Colisão de nome no escopo global do GAS | um `var Namespace` por arquivo, pastas numeradas |
| API key vazar em commit | só em Script Properties; skill `gas-ops` checa antes do push |
| Fonte externa (vídeo/artigo) sobre taxa de marketplace desatualizada ou errada | sempre validar contra pedidos `COMPLETED` reais da conta antes de mudar a calculadora — caso concreto: vídeo alegando tabela Shopee escalonada (idêntica à do ML) foi contradito por 11 pedidos reais (ver histórico do git e `ConfigService.js`) |
| `[hidden]` não esconder elemento com `display` explícito na mesma classe | sempre adicionar `.classe[hidden] { display: none; }` (maior especificidade) ao criar `.form-row`/`.field` que alterna visibilidade — bug real encontrado na calculadora (PR #21) |
| Widget novo criado mas nunca montado no Shell (`<tag>` ausente) | conferir `ui/shell/Shell.html` tem tanto o `include()` quanto a tag `<widget-x>` antes de considerar uma UI "pronta" — aconteceu duas vezes: `PricingView.html` (PR #18) e `EstoquePrecoBulkView.html` (achado e removido em auditoria de 09/08/2026, ficou com include mas sem `<tag>` desde a criação; tinha ainda um bug de prefixo de ação — `estoque.simularMudancaPreco` em vez de `estoquePreco.simularMudancaPreco` — nunca teria funcionado mesmo se estivesse acessível) |
| `new Date()` em string de data BR (`dd/MM/yyyy HH:mm:ss`) | nunca usar `new Date` em strings BR no backend — o V8 lê `MM/dd` silenciosamente (e `31/12` vira NaN); sempre `FormatterService.parseDateTime`, que valida dia/mês e devolve `null` para data inválida — bug real no FIFO de 11/08/2026: baixa pegava lote errado |
