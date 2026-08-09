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
| Carteira Shopee | `src/03_services/carteiraShopee/CarteiraShopeeService.js` | Saldo, extrato e histórico de repasses da carteira Shopee. |
| Anúncios Shopee | `src/03_services/anunciosShopee/AnunciosShopeeService.js` | Sincroniza, lista, atualiza preço/estoque de anúncios Shopee direto pela Tiops. |
| Shopee Ads | `src/03_services/shopeeAds/ShopeeAdsService.js` | Gestão de campanhas de anúncios pagos: saldo, campanhas, performance, pausar/retomar/encerrar, visitas/conversão. |

### Motores internos (sem página própria)

- `PricingService` — motor único de sugestão de preço e margem.
- `SkuService` — categoria/label de produto.
- `PushNotificationService` (mas **INATIVO**) — webhook Shopee, aguarda app próprio na Shopee Open Platform (Tiops detém as credenciais hoje).

### Specs em Draft, sem código ainda

- `specs/estoque-baixa-shopee.md`, `specs/produto-anuncio-map.md` — auto-declaradas Draft, sem implementação (únicas specs de domínio que sobreviveram à consolidação de 09/08/2026 — ver "Estado real de hoje" — por serem trabalho futuro, não histórico). Não pular a aprovação antes de codar (regra nº 1 do `AGENTS.md`).

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
| 2 | Dashboard | ✅ | ⬜ |
| 3 | Pedidos | ✅ | ⬜ |
| 4 | Catálogo | ✅ | ⬜ |
| 5 | Anúncios | ✅ | ⬜ |
| 6 | Preço & Estoque | ✅ | ⬜ |
| 7 | Endurecimento | ⬜ | ⬜ |
| 8 | Calculadora PrecificaPro | ✅ | ✅ |
| — | Status Online + Speed Meter | ✅ | ⬜ |
| — | DataStore (cache client-side) | ✅ | ⬜ |
| — | Estoque (unidades FIFO) | ✅ | ✅ |
| — | Webhook Shopee (Push) | ✅ | ⬜ |
| — | Shopee Ads (Gestão de Anúncios Pagos) | ✅ | ⬜ |

> **Estado real de hoje:** o app roda em produção (Web App deployado via
> `clasp push` automático no merge em `main`, sem passo `clasp deploy`
> manual). O fluxo funcional ativo é o domínio **Estoque**: 157 unidades
> rastreadas unitariamente (FIFO), alimentado por NFe + Manual com importação
> passo a passo (modal de progresso) e preços sincronizáveis com o catálogo.
>
> **Fórmula de taxa Shopee corrigida (08/08/2026):** o flat 20% antigo foi
> substituído por um modelo de 2 componentes (comissão 18% cartão-à-vista /
> 12% Pix-ou-parcelado + taxa de serviço 2%+R$4/item+R$16 promo), derivado
> por engenharia reversa de **11 pedidos `COMPLETED` reais** da conta,
> validado com <1% de erro médio. ML segue com sua tabela por faixa/regime,
> não revisada com dados reais ainda.
> Fases 0, 1 e 8 foram validadas por cálculos/smoke executados. As demais
> fases dependem de dado real dos marketplaces via Tiops e/ou de acesso ao
> editor Apps Script (`runSmokeTests_`) — pendente de validação manual
> ativa.
>
> **Motor único de margem (09/08/2026):** usuário reportou que Estoque e
> Catálogo mostravam margens muito diferentes pro mesmo produto. Causa:
> `EstoquePrecoService.js`/`EstoqueService.js` tinham cada um sua própria
> cópia de `calcularMargem_` calculando `(preço-custo)/preço` bruto, sem
> descontar taxa de marketplace nenhuma (nem Shopee, nem ML), enquanto
> `CatalogService.js` já usava `PricingService.calculateSuggestedPrice`
> corretamente. Adicionado `pricing.calculateNetMargin` (motor único); as
> duas cópias de `calcularMargem_` agora delegam para lá. Bug adjacente
> também corrigido: alerta de prejuízo comparava preço bruto vs. custo, não
> o líquido pós-taxas — um preço nominalmente acima do custo podia esconder
> prejuízo real. Ver `PricingService.js`/`EstoqueService.js` (a feature de
> atualização de preço em lote foi removida em 09/08/2026 — ver nota acima).
>
> **Botão "Recalcular Preços de Venda" (antes "Sincronizar Preços
> Catálogo", 09/08/2026):** pedido do usuário para o motor "sempre
> recalcular com base no PRECO_CUSTO_ORIGINAL". Antes, o botão copiava o
> preço já calculado pelo Catálogo (que agrega por "custo mais recente por
> código de produto") — divergente do custo real de um item específico se
> ele veio de um lote/NFe mais antigo. Agora `EstoqueService.sincronizarPrecosCatalogo`
> chama `PricingService.calculateSuggestedPrice` direto, item por item, com
> o `PRECO_CUSTO_ORIGINAL` daquele item. Achado um terceiro ponto do motor
> ainda no modelo Shopee flat 20% antigo nesta mesma revisão:
> `CatalogService.getCalculationMemory` (sidebar "Histórico" do Catálogo)
> tinha sua própria cópia da fórmula, divergindo do preço real mostrado na
> linha do produto — corrigido para delegar também.
>
> **Webhook Shopee:** código implementado e testado
> (`PushNotificationService.js`), mas **inativo** — a Tiops detém as
> credenciais de API da loja, logo os pushes vão para a callback URL da
> Tiops, não para nós. Para ativar, o usuário precisa criar app próprio na
> Shopee Open Platform e migrar as credenciais.
>
> **Otimização de performance (09/08/2026, PR #28):** auditoria de
> performance encontrou 3 classes de problema, todas corrigidas. (1) Bugs de
> invalidação de cache: `CarteiraShopeeService`/`ManualSaidaService`/`EstoqueService`
> invalidavam o cache do Dashboard com o padrão `'dashboard.'` (ponto), mas a
> chave real é `'dashboard_summary'` (underscore) — nunca casava, cache só
> expirava pelo TTL de 5min; `ShopeeAdsService` chamava `CacheService` direto
> (viola a camada de `02_repositories`) com chaves fixas que não batiam com
> as reais (`campanhas_raw` vs `campanhas`; `performance_<id>` dinâmico vs
> literal `performance`) — cache de performance nunca era limpo após
> pausar/retomar/encerrar campanha; `NFeEntradaProdutosService`/
> `OrdersImportService` nunca invalidavam `catalog_`/`dashboard_` ao gravar
> dados novos. (2) Escrita em loop: `EstoqueService.updateItem`/
> `atualizarAlertas_`/`atualizarAlertasBulk_` faziam 1 leitura + 1 escrita
> **por item** num loop, em vez de 1 leitura + 1 escrita pro lote inteiro
> (helpers `updateRowsBulk`/`updateRowsBulkPerRow` já existiam, só não eram
> usados aqui). (3) Preload/cache client-side inconsistente: `Shell.html` já
> pré-carrega ~10 domínios em paralelo ao abrir o app
> (`window.__DataStore.preFetch`), mas Carteira Shopee e Shopee Ads nunca
> entravam na lista, e Pedidos mostrava o cache por um instante mas sempre
> refazia a chamada ao backend de qualquer jeito (preload desperdiçado) —
> agora as 4 páginas seguem o mesmo padrão de skip-fetch real de
> Catálogo/Estoque.
>
> **Limpeza de código morto (09/08/2026):** auditoria completa não achou
> arquivo órfão em `src/**` (bate 1:1 com `filePushOrder` do `.clasp.json`),
> mas achou um segundo caso de widget fantasma
> (`EstoquePrecoBulkView.html`/`EstoquePrecoService.js`, ver seção 3
> "Removidos" acima) e várias referências mortas em documentação (spec
> arquivada sem marcar `Status: Removed`, links pra `listings.md` num
> caminho que não existe mais, `README.md` citando "Listings" como serviço
> ativo) — todas corrigidas nesta mesma revisão.
>
> **`docs/historico/` eliminada por completo (09/08/2026):** pedido do
> usuário para deixar o projeto enxuto — planos/specs antigos já
> superados/removidos não ficam mais guardados numa pasta separada, o
> resumo de "o que foi removido e por quê" vive só aqui no `PLANO.md`
> (seção 3, "Removidos", acima) e no `AGENTS.md` (tabela de riscos
> conhecidos). Removidos: `docs/historico/` inteira (ROADMAP_Executivo.md
> e Phase1_Implementation_Guide.md — planejamento do MVP antigo em
> planilha+Bling, arquitetura totalmente diferente da atual; specs
> arquivadas de Anúncios/Listings e Atualização de Preço em Lote — corpo
> completo já não agregava nada além do resumo que já está aqui),
> `docs/DESIGN_SYSTEM.md` (paleta de cores não batia mais com o sistema de
> tokens real em `ui/shared/Styles.html`, era plano de design anterior já
> superado) e `docs/referencia/catalogo_mercado_livre.md` (checklist manual
> de 17 produtos específicos pra listar no ML, tarefa pontual já
> presumivelmente executada, não é playbook técnico reutilizável como o
> resto de `docs/referencia/`).

### Fase 0 — Fundação + pipeline de sincronização (/dev)

Entregue no código: `.clasp.json`, `appsscript.json`, `ConfigService`,
repositórios, `ServiceRegistry`, `Router`, Shell + design tokens, `AGENTS.md`,
workflow do GitHub Actions (apenas push automático, deploy manual).

**Critério de aceite:**
- [ ] Push na `main` dispara o workflow e ele termina verde.
- [ ] Você roda `clasp deploy --description "v0 — fundacao"` manualmente.
- [ ] A URL do Web App abre e o Shell renderiza com os tokens aplicados.
- [ ] `curl "<url>?action=ping"` devolve `{"pong":true,...}`.
- [ ] `apiDispatch('ping', {})` funciona pelo console do navegador.

### Fase 1 — Precificação

**Critério de aceite:**
- [ ] `runSmokeTests_()` roda no editor sem lançar erro.
- [ ] Shopee, custo 50, margem 25% → R$ 90,91.
- [ ] Mercado Livre, custo 50, margem 25% → R$ 91,80.
- [ ] Margem de 85% na Shopee devolve erro de negócio, não preço absurdo.
- [ ] Os mesmos números batem com a sua planilha manual original.

### Fase 2 — Dashboard

**Critério de aceite:**
- [ ] Os números conferem com os apps oficiais no mesmo dia.
- [ ] Segunda carga em menos de 5 min vem do cache (confirmar por log/tempo).
- [ ] Falha da Tiops mostra mensagem de erro na tela, não tela em branco.

### Fase 3 — Pedidos

**Critério de aceite:**
- [ ] Um pedido real de cada canal confere com o app oficial (ID, data, valor, status).
- [ ] O Dashboard continua correto depois de passar a consumir `OrdersService`.
- [ ] Canal sem pedido no período devolve lista vazia, não erro.

### Fase 4 — Catálogo

**Critério de aceite:**
- [x] `catalog.getProducts()` retorna produtos únicos de NFE_ENTRADA_PRODUTOS com status='Recebido', agrupados por código.
- [x] Produto que aparece em 3 NFes mostra 1 linha com custo mais recente (maior DATA_EMISSAO).
- [x] `catalog.getProductByCode()` retorna histórico completo (todas as 3 entradas).
- [x] Preço sugerido para cada marketplace bate com PricingService.calculateSuggestedPrice() (mesma margem).
- [x] Clique no preço sugerido abre sidebar com memória de cálculo passo-a-passo.
- [x] Ordenação por código, descrição, custo e preço sugerido funciona crescente e decrescente.
- [x] Margem exibida reflete a retenção real após taxa do marketplace (ex.: 20% Shopee → margem líquida < margem alvo).
- [x] Aba NFE_ENTRADA_PRODUTOS vazia retorna lista vazia, não erro.

### Fase 5 — Anúncios

**Critério de aceite:**
- [ ] Pausar e reativar um anúncio de teste real funciona nos dois canais.
- [ ] O estado é confirmado por releitura (`get_item` / `shopee_get_item`),
      nunca só pela resposta do update.
- [ ] Anúncio inexistente devolve erro tratado na UI.

### Fase 6 — Preço & Estoque

**Critério de aceite:**
- [ ] Fluxo completo calcular → aplicar → reler → confirmar, num item de teste.
- [ ] O preço novo aparece no app oficial do canal.
- [ ] Caminho de erro (item inexistente, preço inválido) tratado na UI.

### Fase 7 — Endurecimento (a fazer)

Só entra depois que 0–6 estiverem **validadas**. Escopo:

- Log de operações de escrita em `SheetsRepository` (o que mudou, quando, resultado).
- Padronização do tratamento de erro em todos os widgets (hoje cada view trata do seu jeito).
- Teste de contrato contra a Tiops: para cada ação usada, confirmar via
  `list_actions`/`describe_action` que nome e params ainda batem.
- Estado de carregamento e vazio em todas as telas.

Cada item vira uma spec própria antes de virar código (regra nº 1 do `AGENTS.md`).

### Fase 8 — Calculadora PrecificaPro

**Como foi desenvolvida (histórico, 08/08/2026):**
1. Engenharia reversa das taxas Shopee com 11 pedidos `COMPLETED` reais
   (dados brutos no histórico do git) → correção formal em
   `ConfigService.getShopeeFeeModel`/`PricingService.calculateSuggestedPrice`.
2. Primeira tentativa: widget dedicado novo (`PricingView.html`) —
   descoberto **nunca montado no Shell**, órfão, inacessível ao usuário.
3. Usuário pediu **uma única calculadora**: o widget novo foi removido; o
   modelo Shopee validado foi incorporado na calculadora já existente
   (`CalculatorService.calculate`/`CalculatorView.html`, botão 🧮), que
   antes só suportava Mercado Livre.
4. Usuário pediu os dois modos de cálculo explícitos (custo→preço e
   preço→líquido) — já existiam implicitamente (campo Preço de Venda vazio
   vs. preenchido), viraram um seletor visível ("Formador de Preço" /
   "Receita Líquida").
5. **Bug real encontrado e corrigido**: `.calc-form-row[hidden]` não
   escondia nada — mesma especificidade CSS que o `[hidden]` padrão do
   browser, regra de autor vencia. Seções de Shopee e ML apareciam juntas
   sempre. Confirmado renderizando o widget via Playwright/Chromium
   headless (não só leitura de código) antes e depois do fix.
6. Ajustes finos: Imposto Simples default 0% (era 6%), botão Mercado Livre
   com azul da marca (token `--color-mercado-livre-blue` novo).
7. **Investigado e descartado**: um vídeo/artigo de terceiros alegando nova
   tabela de comissão Shopee escalonada por preço (idêntica à tabela ML já
   existente no projeto) a partir de 01/03/2026 — contradito pelos 11
   pedidos reais (18%/12% consistente em toda a faixa R$29,99–R$299,00,
   nunca 20%/14%). Não aplicado à calculadora; retomar em
   `ConfigService.getShopeeFeeModel` se dados futuros confirmarem a mudança.

**Critério de aceite:**
- [x] Floater aparece no canto superior direito (botão 🧮), acessível de qualquer página.
- [x] Clique abre modal calculadora em tela cheia.
- [x] Seletor de marketplace (Shopee/Mercado Livre) troca as taxas e os campos específicos do canal.
- [x] Seletor de modo (Formador de Preço/Receita Líquida) troca Margem↔Preço de Venda e o cabeçalho do resultado.
- [x] Digitar custo + margem → preço sugerido aparece em <500ms.
- [x] Cenário básico ML (custo R$100, margem 20%, CNPJ, faixa R$100–199): preço confere com cálculo manual.
- [x] Cenário básico Shopee (custo R$50, margem 20%, cartão à vista): preço R$90,00, confere com o motor de `PricingService`.
- [x] Vendedor iniciante (ML): sem taxa (0% + R$0).
- [x] Todos os 10 cenários Given/When/Then (ML + Shopee) cobertos em `runCalculatorSmokeTests_()` (`src/99_Main.js`) passam — pendente rodar no editor real do Apps Script.
- [x] Avisos aparecem (low margin <10%, negative profit, high ads, margin unreachable).
- [x] Responsivo em mobile (95vw) e desktop (~600px).
- [x] Descomposição visual de preço (árvore de deduções) clara, com rótulos dinâmicos por canal.

### Shopee Ads — Gestão de Anúncios Pagos

**Critério de aceite:**
- [ ] A página "Shopee Ads" aparece no menu Vendas.
- [ ] Ao carregar, exibe saldo de créditos Shopee (verde >R$50, amarelo <R$50, vermelho =R$0).
- [ ] Lista campanhas com métricas: impressões, cliques, CTR, CVR, ROAS, vendas.
- [ ] ROAS colorido: >2 verde, 1–2 amarelo, <1 vermelho.
- [ ] Ação pausar: confirmação → campanha fica PAUSED na Shopee.
- [ ] Ação retomar: confirmação → campanha fica ACTIVE.
- [ ] Ação encerrar: confirmação dupla → campanha TERMINATED (irreversível).
- [ ] Toggle "Campanhas Ads" ↔ "Visitas / Conversão" funciona.
- [ ] Métricas de visitas mostram itens, visitas, cliques, conversão.
- [ ] Cache: segunda carga em <5s (cache 5min campanhas).
- [ ] Sync: botão "Sincronizar Campanhas" atualiza dados via Tiops.
- [ ] Erro Tiops: exibe mensagem de erro, não tela em branco.

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

> ⚠️ O token da conta do **Mercado Livre** na Tiops expira em **02/08/2026**.
> Se as chamadas de ML falharem com erro de autenticação, reconecte a conta em
> <https://marketplaces.tiops.com.br> antes de investigar o código.

---

## 6. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Agente inventar nome/params de ação da Tiops | skill `tiops-contract` — confirmar em `list_actions`/`describe_action` antes de codar |
| Dois agentes divergirem de convenção | `AGENTS.md` é fonte única; `CLAUDE.md` só aponta para ele |
| Update de marketplace "dar OK" sem ter aplicado | releitura obrigatória — regra em `AGENTS.md` e nas specs 4 e 5 |
| Colisão de nome no escopo global do GAS | um `var Namespace` por arquivo, pastas numeradas |
| API key vazar em commit | só em Script Properties; skill `gas-ops` checa antes do push |
| Fonte externa (vídeo/artigo) sobre taxa de marketplace desatualizada ou errada | sempre validar contra pedidos `COMPLETED` reais da conta antes de mudar a calculadora — caso concreto: vídeo alegando tabela Shopee escalonada (idêntica à do ML) foi contradito por 11 pedidos reais (ver histórico do git e `ConfigService.js`) |
| `[hidden]` não esconder elemento com `display` explícito na mesma classe | sempre adicionar `.classe[hidden] { display: none; }` (maior especificidade) ao criar `.form-row`/`.field` que alterna visibilidade — bug real encontrado na calculadora (PR #21) |
| Widget novo criado mas nunca montado no Shell (`<tag>` ausente) | conferir `ui/shell/Shell.html` tem tanto o `include()` quanto a tag `<widget-x>` antes de considerar uma UI "pronta" — aconteceu duas vezes: `PricingView.html` (PR #18) e `EstoquePrecoBulkView.html` (achado e removido em auditoria de 09/08/2026, ficou com include mas sem `<tag>` desde a criação; tinha ainda um bug de prefixo de ação — `estoque.simularMudancaPreco` em vez de `estoquePreco.simularMudancaPreco` — nunca teria funcionado mesmo se estivesse acessível) |
