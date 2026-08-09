# Spec: Smoke Tests (seguros × destrutivos + anti-drift)

## Status
Implemented

## Objetivo
Resolver os achados **B1** e **S2** do diagnóstico (`docs/DIAGNOSTICO_ARQUITETURA.md`):

- **B1:** `runWriteAuditSmokeTests_` (em `src/99_Main.js`) escreve na aba LOGS da
  planilha **real** de produção quando executado pelo menu. Rodar o teste
  "de brincadeira" corrompe dados de produção. A separação em dois grupos —
  **seguros** (lógica pura + leitura) e **destrutivos** (escrita, com aviso
  explícito e sheetId de teste parametrizável) — elimina o risco de alteração
  acidental.
- **S2:** CatalogService, EstoqueService e CalculatorService consomem
  `PricingService.calculateSuggestedPrice`/`calculateNetMargin` (motor único de
  margem, `PricingService.js:206`). Um fluxo novo pode "esquecer" o motor e
  recalcular a fórmula na mão, divergindo dos demais. Um smoke test **anti-drift**
  recomputa o preço/margem pelo motor e compara com o que os domínios expõem
  para os mesmos inputs — protege a regra "nunca duplicar a fórmula".

## Contrato da API Interna (99_Main.js — funções de orquestração)

### `runSafeSmokeTests_()` — interna (menu GAS)
- Descrição: roda **todos** os smoke tests seguros em sequência com try/catch
  individual por suíte; acumula resultados; loga resumo final com `Logger`.
- Suítes seguras (alvo):
  - `runSmokeTests_` (Pricing — puro)
  - `runNfeSmokeTests_` (NFe Entrada — puro)
  - `runNfeProdutosSmokeTests_` (NFe Produtos — apenas describe/validação de
    erro; **sem** executar `processarTodasNfs` quando sheetId NFe estiver
    configurado — nesse caso o cenário é pulado com aviso, não executado)
  - `runFormatterSmokeTests_`, `runCatalogSmokeTests_` (leitura de catálogo),
    `runCalculatorSmokeTests_`, `runPushSmokeTests_`,
    `runManualSaidaSmokeTests_`, `runCarteiraShopeeSmokeTests_`,
    `runAnunciosShopeeSmokeTests_`, `runEstoqueBaixaSmokeTests_` (cenários de
    erro/leitura), `runDashboardSmokeTests_`
  - `runAntiDriftSmokeTests_` (novo — S2, ver abaixo)
- Comportamento em falha: cada suíte lança exceção própria; o orquestrador a
  captura, registra como falha e continua nas demais. Ao final, se houver
  falhas, `throw new Error` com resumo (o menu mostra o erro no editor).
- Observação: suíte que dependa de dados reais (Catalog/Estoque) falha com
  skip logado quando a planilha não estiver configurada — não quebra o restante.

### `runDestructiveSmokeTests_(testSheetId)` — interna (menu GAS)
- Descrição: roda **apenas** os testes que escrevem na planilha:
  `runWriteAuditSmokeTests_(testSheetId)` (aba LOGS) — com validação quando
  `testSheetId` for fornecido o teste grava na planilha de **teste** em vez da
  real; sem ele, usa a planilha configurada.
- Aviso: loga linha destacada no `Logger` e, se houver UI disponível, exibe
  dialog de confirmação (`SpreadsheetApp.getUi().alert` com botões) antes de
  executar qualquer escrita.
- Params:
  | nome | tipo | obrigatório | default | descrição |
  |---|---|---|---|---|
  | `testSheetId` | string | não | planilha configurada | Sheet ID de planilha de TESTE para isolar a escrita real |
- Retorno: lança `Error` com resumo das falhas ou loga `OK`.

### `runAntiDriftSmokeTests_()` — interna (menu GAS)
- Descrição: protege o motor único de margem. Para cenários fixos de inputs,
  computa `PricingService.calculateSuggestedPrice`/`calculateNetMargin` e
  compara contra o que `CatalogService`/`EstoqueService`/`CalculatorService`
  devolvem para os mesmos inputs.
- Cenários:
  1. `CatalogService.getProducts` (sem margem custom) → para cada produto com
     custo, verificar que `precoShopee`/`precoMercadoLivre` e
     `margemCalculadaShopee`/`margemCalculadaMercadoLivre` batem com
     `PricingService.calculateSuggestedPrice({unitCost, targetMarginPct: 0.25,
     marketplace})` (default) dentro de tolerância. Pula suavemente se não
     houver planilha/dados.
  2. `EstoqueService.calcularMargem_` (via `getItems` quando disponível) →
     compara margem com `PricingService.calculateNetMargin` para o mesmo par
     preço/custo/canal. Pula se não houver dados.
  3. `CalculatorService.calculate` (3 cenários fixos: shopee cartão à vista,
     shopee pix, ML) → preço sugerido deve bater com
     `PricingService.calculateSuggestedPrice` para os mesmos inputs
     (margem de 0.01).
- Critério: divergência > tolerância registra falha com os valores obtidos e
  esperados (facilita localizar qual domínio derivou).

## Regras de Negócio
- **Classificação invariável:** teste que ESCREVE ou DELETA dado real é
  destrutivo — nunca entra em `runSafeSmokeTests_`. Teste de leitura/lógica pura
  é seguro.
- O orquestrador seguro nunca deve abrir dialogs de confirmação: roda em silêncio
  (logs via `Logger`).
- A execução destrutiva só escreve após confirmação explícita do humano **ou**
  quando `testSheetId` apontar para planilha de teste.
- Anti-drift roda sempre dentro do grupo seguro (nunca escreve).

## Casos de Borda
- Planilha não configurada: suítes de I/O logam `skip` e não contam como falha;
  suítes puras passam normalmente.
- `getItems` vazio / catálogo vazio: anti-drift loga `SKIP (sem dados)` e passa.
- `testSheetId` não informado + sem UI (execução por trigger/cron): o teste
  destrutivo loga aviso e **aborta** (não escreve em produção sem confirmação
  explícita).
- `processarTodasNfs` com sheetId NFe configurado: executaria processamento
  real — por isso o cenário é pulado com aviso no grupo seguro (validação de
  contrato continua via describe).

## Critérios de Aceite (Given/When/Then)
- Given menu GAS aberto, When usuário clica "Rodar Todos (Seguros)", Then
  nenhuma escrita ocorre na planilha real e o log mostra resumo por suíte.
- Given `testSheetId` de planilha de teste informado, When usuário roda o
  Write Audit destrutivo, Then escrita acontece apenas na planilha de teste.
- Given catálogo com dados e motor PricingService intacto, When
  `runAntiDriftSmokeTests_` roda, Then nenhuma divergência é reportada.
- Given `processarTodasNfs` com sheetId configurado, When smoke seguro roda,
  Then o cenário é pulado com aviso e nenhuma NF real é processada.

## Fora de Escopo
- Unit tests Node/Jest (item 7 do diagnóstico — infra separada).
- Refatoração do runner para framework de testes (é smoke GAS by design).
- Mudanças em `LoggingService`/`SheetsRepository` (não são necessárias para
  o B1: a parametrização por sheetId é resolvida no próprio teste).

## Dependências
- Services lidos em runtime: `PricingService`, `CatalogService`,
  `EstoqueService`, `CalculatorService`, `NFeEntradaProdutosService`,
  `LoggingService`, `SheetsRepository`, `LoggingRepository`,
  `EstoqueBaixaService`, `AnunciosShopeeService`, `CarteiraShopeeService`,
  `FormatterService`, `PushNotificationService`, `ManualSaidaService`,
  `DashboardService`.
- Nenhuma ação Tiops nova.

## Notas de Implementação
- `runWriteAuditSmokeTests_` aceita `testSheetId` e, quando fornecido, grava a
  linha de auditoria de teste via `SheetsRepository`/`LoggingRepository` na
  planilha de teste (sem tocar a produção); a validação de estrutura da linha
  permanece idêntica.
- Menu GAS dividido em dois submenus: "Testes (Seguros)" e
  "Testes (Destrutivos)".