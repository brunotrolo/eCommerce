# Diagnóstico de Arquitetura — Performance, Sustentação e Estabilidade

> **Data:** 09/08/2026
> **Método:** análise de código-fonte (grep + leitura dirigida), sem execução de runtime.
> **Status:** `Diagnóstico entregue — aguardando plano de desenvolvimento (itens 1–7)`

## 1. Resumo executivo

O projeto está **bem estruturado**: camadas respeitadas (`01_adapters` / `02_repositories` isolam as APIs Google),
cache em camadas (server `CacheService` + client `DataStore`), escrita em lote nos hot paths, LockService no
motor FIFO e `safeRef_` no Registry (serviço quebrado não derruba o app inteiro).

Não há bugs críticos nem necessidade de reestruturar domínios. Os achados são de **otimização e blindagem**:

- **1 achado de performance prioritário** (flush de logs a cada dispatch — P1)
- **2 achados de performance secundários** (preload sequencial no servidor — P2; leitura da aba inteira sem cache/limite — P3)
- **2 achados de sustentação** (acoplamento horizontal de motores — S1; risco de drift de lógica de margem — S2)
- **2 achados de estabilidade** (smoke tests destrutivos contra a planilha real — B1; divergência potencial cache client×server — B2)

## 2. Arquitetura verificada (linha de base)

| Camada | Onde | Verificação |
|---|---|---|
| Entrypoint | `src/04_gateway/Router.js` (único `doGet`/`doPost`) | ✅ único ponto |
| Dispatch | `src/04_gateway/ServiceRegistry.js` → `dispatch()` | ✅ `safeRef_` em toda entrada |
| Adaptadores | `src/01_adapters/TiopsClient.js` (único `UrlFetchApp` p/ Tiops) | ✅ sem vazamento |
| Repositórios | `src/02_repositories/*` (único acesso a Sheets/Properties/Cache) | ✅ 44 ocorrências de APIs Google confinadas a repos/adapters/Main |
| Serviços | `src/03_services/<dominio>/<Nome>Service.js` com `describe()` | ✅ padrão seguido |
| Ordem de carga | `.clasp.json` `filePushOrder` + validação CI (`.github/scripts/*`) | ✅ desde o CI novo |

## 3. Pontos fortes (não mudar)

### Performance
- **Caches server-side calibrados**: dashboard, catálogo e estoque 5min — via `CacheRepository.getOrCompute` com TTL por domínio (anúncios Shopee sem TTL próprio: a aba `ANUNCIOS_SHOPEE` é a fonte de verdade; os TTLs de carteira Shopee/shopeeAds citados na v1 não existem mais — domínios removidos em 10/08/2026).
- **Escrita em lote** onde importa: `updateRowsBulk` / `updateRowsBulkPerRow` / `appendRows` (EstoqueRepository); `UrlFetchApp.fetchAll` + batch de escrow (OrdersImportService).
- **Logging bufferizado**: `_logBuffer` + 1 `setValues` por flush (não um `appendRow` por log).

### Sustentação
- `filePushOrder` validado por CI **antes do push** (evita erro clássico de ordem de carga / arquivo esquecido).
- Camada de repositório respeitada de fato (grep em `SpreadsheetApp`/`PropertiesService`/`CacheService`).
- `describe()` + `safeRef_`: serviço ausente vira `null` logado, não derruba o script.

### Estabilidade
- **`LockService`** em `EstoqueBaixaService` (`:75`, `:207`) — protege FIFO contra push de pedido + sync manual simultâneos.
- **Push handler com rethrow → HTTP 500 → Shopee reenvia** — idempotência de webhook correta.
- Logging com try/catch amplo — log nunca derruba a ação principal.
- `sanitizeForClient_` trata Date/undefined — evita surpresas de serialização do `google.script.run`.

## 4. Achados

### 4.1 Performance

#### P1 (prioridade alta) — `flushLogs()` roda no `finally` de **cada** dispatch
- **Onde:** `ServiceRegistry.js:98-101` chama `LoggingService.flushLogs()` a cada ação; `LoggingService.js:172-199` grava em `setValues`.
- **Problema:** no boot, `Shell.html` dispara **14 dispatches** → **14 flushLogs** → **14 chamadas à Sheets API** (1 linha cada) *além* do custo das próprias ações.
- **Impacto:** dobra/atrasa cada preload do app — exatamente onde o usuário espera velocidade.
- **Sugestão:** drenar o buffer **uma única vez ao final da execução** (flag + dreno no último dispatch, ou agrupar por execução com LockService/contador). 14 linhas em 1 `setValues`.

#### P2 (prioridade média) — Preload do Shell: 14 ações "paralelas" que executam **sequenciais** no servidor
- **Onde:** `Shell.html:307-321` `preFetch` / `DataStore.preFetch` com 14 ações.
- **Problema:** `google.script.run` enfileira e executa as chamadas da mesma página dentro de **uma invocação GAS**; o paralelismo é só no cliente. Cada ação ainda paga seu log+flush individual (P1).
- **Impacto:** boot mais lento que o pretendido; métricas de "Shell Perf" não capturam o tempo server-side.
- **Sugestão:** priorizar o preload (as 4–5 primeiras montam a tela inicial) e deixar o resto como lazy-load por aba ativa; agrupar o flush resolve o multiplicador.

#### P3 (prioridade alta) — `getItems` lê a aba inteira sem cache server e sem limite
- **Onde:** `EstoqueService.js:415` `getItems` → `EstoqueRepository.getRows` (range completo, todas as colunas, todas as linhas, ordena em memória). Sem `CacheRepository`. Preload chama `estoque.Items.TODOS`.
- **Impacto:** escala com o volume de unidades (milhares de linhas = segundos + payload grande); botão "Atualizar" paga o scan a cada clique (agravado por B2).
- **Sugestão:** cache server com TTL curto para `getItems` + `limit`/paginação no schema (ou reuso da view consolidada), mantendo a forma do retorno público para não quebrar a UI.

### 4.2 Sustentação

#### S1 (prioridade média) — Acoplamento horizontal: `EstoqueBaixaService` é motor compartilhado por 3 fluxos
- **Chamadas reais (grep, acyclic):**
  - `ManualSaidaService.js:122` → `EstoqueBaixaService.baixarPorProduto`
  - `OrdersImportService.js:748,782` → `EstoqueBaixaService.baixarPorProduto` / `reverterBaixa`
  - `ManualEntradaService` → `EstoqueService`; `estoque`/`manualSaida` → `CatalogService`; `catalog` → `PricingService`/`SkuService`
- **Não há ciclo** (`ordersImport ↔ pushNotification` é unidirecional; ref na linha 582 do OrdersImport é só comentário).
- **Risco:** mudar o FIFO do `EstoqueBaixaService` impacta 3 fluxos distintos (função afeta outra).
- **Sugestão:** regra em `AGENTS.md` — domínio só consome: repos próprios + utilitários (`Logging`/`Pricing`/`Formatter`) + **motores designados explicitamente** (EstoqueBaixa = motor FIFO). Documentar a DAG de dependências em `specs/ARQUITETURA.md` §1 (tabela "Depende de").

#### S2 (prioridade baixa-média) — Risco de drift entre Catalog / Estoque / Sku / Pricing
- **Onde:** quatro domínios tocam preço/margem/custo. A regra "motor único de margem via `PricingService`" existe (`PricingService.js:206`), mas CatalogService também referencia `SkuService` e repos de entrada.
- **Risco:** fluxo novo calcular margem direto, divergindo do motor.
- **Sugestão:** smoke test anti-drift que compara `CatalogService` × `EstoqueService` × `PricingService` para os mesmos inputs.

### 4.3 Estabilidade

#### B1 (prioridade média-alta) — Smoke tests escrevem na planilha real
- **Onde:** `99_Main.js:946-954` (cenário Write Audit) e outros — `appendRow`/`setValues` na aba **real** (incl. LOGS).
- **Risco:** rodar `runSmokeTests_` do menu altera dados de produção.
- **Sugestão:** separar `runSmokeTests` em "safe" (lógica pura, sem I/O) e "destrutivo" (aviso explícito + planilha de teste parametrizável por sheetId).

#### B2 (prioridade baixa) — Divergência potencial de caches client × server
- **Onde:** `DataStore` é em memória (sessão); caches server têm TTL. Padrão das views com `invalidate` no "Atualizar" está **ok**.
- **Risco residual:** `estoque.getItems` sem cache server faz cada "Atualizar" buscar a planilha inteira (depende de P3).
- **Sugestão:** resolver junto com P3.

## 5. Priorização sugerida (retorno × esforço)

| # | Ação | Achado | Impacto | Esforço |
|---|------|--------|---------|---------|
| 1 | Flush de logs agrupado (1 `setValues` por execução) | P1 | Boot ~2x mais rápido; menos I/O na planilha | Baixo |
| 2 | Cache server + limite no `getItems` | P3/B2 | Boot e "Atualizar" estáveis com volume | Baixo |
| 3 | Regra de acoplamento + DAG documentada | S1 | Sustentação: função não impacta outras | Baixo (docs) |
| 4 | Separar smoke tests destrutivos | B1 | Zero risco de corromper produção | Médio |
| 5 | Lazy-load no preload do Shell | P2 | Boot percebido mais rápido | Médio |
| 6 | Smoke anti-drift Catalog × Pricing | S2 | Protege o motor único de margem | Médio |
| 7 | Unit tests locais (Node/Jest) | (base) | Base para tudo acima | Alto (infra) |

**Recomendação de sequência:** 1 → 2 → 3 primeiro (esforço baixo, ganho imediato no boot e blindagem de desenvolvimento); depois 4 (segurança de produção); 5–7 conforme prioridade de risco.

## 6. Regras do projeto que tocam a execução

Antes de implementar os itens, observar (AGENTS.md):
- `ServiceRegistry.js` e `LoggingService.js` são **arquivos compartilhados** — mudança exige aprovação explícita.
- `EstoqueService.js` (item 2) é domínio — exige **spec aprovada** (`specs/<dominio>.md`) antes de qualquer alteração.
- Toda chamada nova/alterada à Tiops passa por `tiops-contract` (itens 2/5 não adicionam chamadas novas — apenas cache/limite).
- Skills: `spec-first`, `gas-ops` (antes de clasp push), `design-tokens-guard` (item 5, UI).
- Workflow: commit → push → `clasp push` (CI valida `filePushOrder`).
- Definition of Done do projeto se aplica a cada item entregue.

## 7. Evidências de verificação (para repetição futura)

```bash
# Camadas: APIs Google só em repos/adapters/Main
grep -rn "SpreadsheetApp\|PropertiesService\|CacheService\|UrlFetchApp" src/ --include="*.js" -l

# Acoplamento entre serviços (chamadas entre namespaces de domínio)
grep -rn "EstoqueBaixaService\.\|EstoqueService\.\|CatalogService\.\|PricingService\.\|SkuService\." src/03_services/ --include="*.js"

# Caches por domínio (TTL)
grep -rn "getOrCompute\|CacheRepository" src/03_services/ --include="*.js"

# Preload do Shell
grep -n "preFetch\|getSummary\|getItems\|getProducts" ui/shell/Shell.html

# Smoke destrutivo
grep -n "runSmokeTests_\|appendRow\|setValues" src/99_Main.js
```

## 8. Segundo diagnóstico — 11/08/2026: auditoria do domínio Estoque (baixa FIFO)

> **Data:** 11/08/2026 — **Método:** análise de código-fonte dirigida ao fluxo
> de baixa (grep + leitura), sem execução de runtime.
> **Resultado:** 3 regressões corrigidas em `eef9a37` (Tier 1); plano dos
> Tiers 2–4 em `PLANO.md` § Fase 9 — aguardando decisão do usuário.

### 8.1 Bugs de regressão (corrigidos — Tier 1)

#### R1 (crítico) — FIFO desordenado por `new Date()` em data BR
- **Onde:** sort em `EstoqueRepository.getItemsDisponivelPorProduto` e
  `EstoqueService` (filtro de `DATA_ENTRADA`) usavam
  `new Date("dd/MM/yyyy HH:mm:ss")`.
- **Problema:** V8/GAS interpreta `MM/dd/yyyy`; `31/12/2025` vira `NaN`
  (ordem arbitrária) e `12/01/2026` troca dia/mês — a baixa FIFO pegava
  **lote errado**.
- **Fix:** `FormatterService.parseDateTime` (dia/mês BR validado; `31/02` →
  `null` → timestamp 0 = mais antigo). Smoke: `runEstoqueBaixaSmokeTests_`
  cenário 7.

#### R2 — `TOTAL_COST` acumulado não era reduzido em reversões
- **Onde:** `OrdersImportService.processBaixaForOrder_` revertia cancelado/
  devolvido removendo só os IDs de `ESTOQUE_BAIXAS`.
- **Fix:** `reverterBaixa` calcula `custoTotal` das units revertidas (mesma
  fórmula do `baixarPorProduto` — `PRECO_CUSTO_ORIGINAL`) e o consome com
  `Math.max(0, …)`.

#### R3 — Saída manual: baixa parcial + erro = estoque sumia sem registro
- **Onde:** `ManualSaidaService.addExit` — `baixarPorProduto` com estoque
  insuficiente baixava parcial (units → `BAIXADO`, linha em
  `ESTOQUE_BAIXAS`) e o serviço retornava "Nenhuma saída registrada".
- **Fix:** pre-check de disponibilidade (`_getEstoqueDisponivel`) antes da
  baixa + `_rollbackBaixa_` em baixa parcial e em falha de `appendRow`.

### 8.2 Achados estruturais (Tiers 2–3 — decisão pendente, plano na Fase 9)

#### A1 — Gap de envio: vendeu N, baixou B < N, excedente nunca mapeado
- `baixarPorProduto` expõe `faltantes` mas nada persiste o excedente;
  `reprocessarPendentes` só conhece `PENDENTE_MAPEAMENTO` → a unidade
  perdida na primeira tentativa fica para sempre sem baixa (J1).

#### A2 — `reprocessarPendentes` exige estoque total (não rebaixa parcial)
- Checagem de suficiência com tudo-ou-nada; rebaixar parcial enxugaria
  estoque ocioso mais rápido (J2a).

#### A3 — Reorder: lote antigo mapeado bloqueia lote novo
- Sem opção de preferir o lote novo da compra quando o antigo não sumiu
  (J2b).

#### A4 — Sync somente manual
- "Sincronizar Tudo" é o único gatilho; não há agendamento de ciclos de
  import/baixa (J2c — mudança de operação, decisão do usuário).

### 8.3 Regras permanentes derivadas

- **Nunca** `new Date(string BR)` no backend — sempre
  `FormatterService.parseDateTime`; registrado em `PLANO.md` §6 (riscos).
- Contrato do motor FIFO: `reverterBaixa` devolve `custoTotal` das unidades
  revertidas (consumido pelos 3 fluxos compartilhados).

## 9. Estado da implementação (atualização 11/08/2026)

A seção §5 foi escrita em 09/08; a sequência recomendada (1→2→3, depois 4)
foi executada. Status atual de cada item:

| # | Item (§5) | Status | Onde / commit |
|---|-----------|--------|---------------|
| 1 | Flush de logs agrupado | ✅ implementado | `LoggingService.js` — buffer com coalescing `MIN_BATCH_SIZE=5` + pendências em `CacheService` (TTL 6h, nunca perdidas) + 1 `setValues` por dreno; `flushLogs()` não-forçado no `finally` do `ServiceRegistry.dispatch`. Commit `a607d1d` |
| 2 | Cache server + limite no `getItems` | ✅ implementado | `EstoqueService.getItems` — `CacheRepository.getOrCompute(cacheKey, 300, …)` só na leitura sem filtros; `forceFresh` remove a key (botão Atualizar relê o Sheets); `limit` capa o retorno com `total` real; escritas invalidam `estoque_/catalog_/dashboard_`. Commits `a607d1d` + `9637f71` (TTL 5min) |
| 3 | Regra de acoplamento + DAG | ✅ feito (docs) | `AGENTS.md` + `specs/ARQUITETURA.md` §1 (verificada em 09/08/2026) |
| 4 | Separar smoke tests destrutivos | ✅ implementado | Menu GAS "Testes (Seguros)" × "Testes (Destrutivos)" (`runSafeSmokeTests_` / `runDestructiveSmokeTests_`). Commit `d4d5564` |
| 5 | Lazy-load no preload do Shell | ✅ implementado | `ROUTE_PREFETCH` por aba no `navigate()` (Shell.html); boot mantém preFetch das 9 rotas com `forceFresh` (design do DataClient, AGENTS.md). Commit `d4d5564` |
| 6 | Smoke anti-drift Catálogo × Pricing | ✅ implementado | `runAntiDriftSmokeTests_` (menu Testes (Seguros) → Anti-Drift Catálogo×Pricing). Commit `d4d5564` |
| 7 | Unit tests locais (Node/Jest) | ✅ implementado | Harness Node sem deps: shims GAS em `tests/helpers/gas-shim.js` + `load-services.js` executa o `src/` REAL na ordem do `filePushOrder` dentro de `vm`; suítes em `tests/{formatter,pricing,estoque-baixa}.test.js` (31 testes, `node --test`). CI roda no `ci.yml` e antes do push no `deploy.yml` |

Decisões da Fase 9 (auditoria da baixa FIFO, §8) também fechadas: Tiers 1–3
entregues (`eef9a37`, `aa19870`/`e3c0c56`, `4f6b68c` — J2a coberto pelo J1,
J2b FIFO estrito sem código, J2c trigger diário 06h via menu Agendamento);
Tier 4 (backlog evolutivo) decidido como "nada agora" — permanece em
`PLANO.md` Fase 9. **Validação real pendente (usuário):** smoke das suítes
no editor GAS, `reprocessarPendentes` em produção e o agendamento diário
(autorização única do trigger).