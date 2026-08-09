# Spec: Calculadora de Precificação

## Status
Implemented

## Changelog
- **09/08/2026** — Adicionado `pricing.calculateNetMargin`, o motor único de
  margem do projeto. Usuário reportou que as páginas Estoque e Catálogo
  mostravam margens muito diferentes para o mesmo tipo de produto — causa
  raiz: `EstoquePrecoService.js`/`EstoqueService.js` tinham cada um sua
  própria função `calcularMargem_` duplicada e idêntica, calculando
  `(preço-custo)/preço` **bruto**, sem descontar nenhuma taxa de
  marketplace (nem Shopee, nem ML) — enquanto `CatalogService.js` já usava
  `PricingService.calculateSuggestedPrice` corretamente. Corrigido: as duas
  cópias de `calcularMargem_` agora delegam para `calculateNetMargin`; bug
  adjacente também corrigido no alerta de prejuízo (comparava preço bruto
  vs. custo, não o líquido pós-taxas) e em `getUltimosPrecosPorProduto`
  (ignorava o param `marketplace`, sempre lia o preço Shopee). Ver
  `specs/estoque.md` e `specs/estoque-preco-update.md` para os cenários
  recalculados.
- **08/08/2026** — `ui/pricing/PricingView.html` (o widget dedicado criado
  na revisão anterior, nunca chegou a ser montado em `Shell.html`) foi
  **removido**. O usuário pediu explicitamente que só exista uma única
  calculadora no app — a que já existia (`CalculatorService`/
  `CalculatorView.html`, botão 🧮 no topo). O modelo Shopee validado
  (`ConfigService.getShopeeFeeModel`) foi incorporado lá, ver
  `specs/calculator.md` v2. `PricingService.calculateSuggestedPrice`/
  `compareMarketplaces` **continuam existindo e em uso** — são a API interna
  consumida por `CatalogService.js` (e potencialmente outros serviços), só a
  UI dedicada é que saiu.
- **08/08/2026** — O usuário pediu um modo reverso ("já decidi vender por
  R$X, quanto sobra líquido depois de todas as taxas?"), além do modo já
  existente custo→preço. Esse modo **não foi adicionado aqui** — foi
  implementado em `CalculatorService.calculate`/`CalculatorView.html`
  (`specs/calculator.md` v2, campo `precoVenda` informado = modo "simular"),
  já que essa é agora a única calculadora do app. `PricingService` continua
  só com o modo custo→preço (`calculateSuggestedPrice`/`compareMarketplaces`),
  que é o que `CatalogService.js` consome.
- **08/08/2026** — Implementado em código: `ConfigService.getShopeeFeeModel`,
  `PricingService.calculateSuggestedPrice`/`compareMarketplaces` (branch Shopee
  com fórmula fechada + params `itemCount`/`paymentScenario`) e
  `ui/pricing/PricingView.html` (seletor de cenário Shopee, breakdown
  comissão/taxa de serviço, cards com cor de marca por canal). Implementado
  diretamente por esta sessão (exceção pontual ao fluxo padrão de handoff
  para OpenCode — ver `CLAUDE.md`). Smoke tests atualizados em
  `src/99_Main.js` (`runSmokeTests_`) com os 3 novos casos Shopee.
- **08/08/2026** — Corrigido o modelo de taxa da Shopee. O modelo anterior
  (20% flat) foi substituído por um modelo de dois componentes (comissão por
  cenário de pagamento + taxa de serviço com parte fixa por item), derivado
  por engenharia reversa de 8 pedidos reais `COMPLETED`. Ver
  `specs/calculator-shopee.md` para os dados brutos, a validação (backtest)
  e a análise completa. Mercado Livre **não foi alterado** nesta revisão —
  segue com o modelo flat 14% + R$6 já existente (fora de escopo desta
  análise; ver `## Fora de Escopo` para a divergência conhecida com
  `CalculatorService.js`).

## Objetivo
Generalizar a planilha manual existente (Custo Unitário, Preço Médio de
Mercado, Sugerido Shopee, Sugerido ML, Taxa, Lucro Líquido) num serviço:
dado custo + margem alvo + marketplace, calcular o preço sugerido descontando
a taxa correta do canal. Esta é a API interna de precificação — não é uma UI
própria (a calculadora do app, com modo custo→preço e o modo reverso
preço→líquido, é `CalculatorService`/`CalculatorView.html`, ver
`specs/calculator.md`); `PricingService` é consumido por outros serviços
(`CatalogService.js` hoje).

## Contrato da API Interna

### `pricing.calculateSuggestedPrice`
- Descrição: calcula o preço sugerido para um único marketplace.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| unitCost | number | sim | — | custo unitário (R$) |
| extraCosts | number | não | 0 | custos adicionais por unidade |
| targetMarginPct | number | sim | — | margem alvo, ex. 0.25 = 25% |
| marginBasis | string (`price`\|`cost`) | não | `price` | margem sobre preço de venda ou sobre custo |
| marketplace | string (`shopee`\|`mercado_livre`) | sim | — | canal |
| marketAveragePrice | number | não | — | só para o alerta `belowMarketAverage` |
| itemCount | number | não | 1 | **[novo]** só Shopee — nº de itens no pedido (afeta taxa de serviço, R$4/item) |
| paymentScenario | string (`cartao_avista`\|`pix_ou_parcelado`) | não | `cartao_avista` | **[novo]** só Shopee — cenário de pagamento assumido para a simulação. Default é o **pior caso** (maior retenção), garantindo que a margem mínima nunca seja violada independente de como o comprador pague |

- Retorno: `{ suggestedPrice, marketplaceFee, grossRevenue, netProfit, netMarginPct, belowMarketAverage }`
  — para Shopee, `marketplaceFee` passa a ser `commission + serviceFee` (ver
  fórmula abaixo); o shape de retorno não muda, só a composição interna do
  valor.
- Erros esperados: `unitCost` inválido; `targetMarginPct` fora de `[0,1)`; margem alvo + taxa do canal `>= 100%`.

### `pricing.compareMarketplaces`
- Descrição: roda `calculateSuggestedPrice` para todos os marketplaces configurados, lado a lado.
- Params: mesmos de `calculateSuggestedPrice`, exceto `marketplace`.
- Retorno: `{ shopee: <shape acima>, mercado_livre: <shape acima> }`.

### `pricing.calculateNetMargin`
- Descrição: **motor único de margem do projeto** (09/08/2026). Dado um
  preço de venda já definido (não um alvo a resolver), calcula o líquido
  recebido após a taxa real do canal e a margem real resultante. Consumido
  por `EstoquePrecoService`/`EstoqueService` (colunas `MARGEM_SHOPEE`/
  `MARGEM_MERCADO_LIVRE` da aba ESTOQUE) — nenhum outro lugar do projeto
  deve reimplementar `(preço-custo)/preço` bruto; sempre chamar esta função.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| salePrice | number | sim | — | preço de venda já definido (R$) |
| unitCost | number | sim | — | custo unitário (R$) |
| extraCosts | number | não | 0 | custos adicionais por unidade |
| marketplace | string (`shopee`\|`mercado_livre`) | sim | — | canal |
| itemCount | number | não | 1 | só Shopee — nº de itens no pedido (na aba ESTOQUE, sempre 1: cada linha = 1 unidade) |
| paymentScenario | string (`cartao_avista`\|`pix_ou_parcelado`) | não | `cartao_avista` | só Shopee — mesmo default conservador (pior caso) de `calculateSuggestedPrice` |

- Retorno: `{ salePrice, marketplaceFee, commission?, serviceFee?, netReceived, netProfit, netMarginPct }`
  — `commission`/`serviceFee` só aparecem para Shopee. `netMarginPct =
  netProfit/salePrice`, mesma convenção de `calculateSuggestedPrice`
  (margem sobre o **preço de venda**, nunca sobre o líquido recebido).
- Erros esperados: `salePrice` inválido (`<= 0`); `unitCost` inválido (`< 0`); `paymentScenario` fora do enum.

## Regras de Negócio

### Taxas por canal

**Mercado Livre** (fixa, `ConfigService.getMarketplaceFee('mercado_livre')`, inalterada):
| Canal | Taxa percentual | Taxa fixa |
|---|---|---|
| Mercado Livre | 14% sobre o preço de venda | R$ 6,00 por item vendido |

**Shopee** (modelo de dois componentes — comissão + taxa de serviço,
`ConfigService.getShopeeFeeModel(paymentScenario, itemCount)`; substitui o
antigo `getMarketplaceFee('shopee')` flat de 20%):

| Componente | Cenário `cartao_avista` (default) | Cenário `pix_ou_parcelado` |
|---|---:|---:|
| Comissão | **18%** do preço de venda | **12%** do preço de venda |
| Taxa de serviço — base | 2% do preço de venda (ambos os cenários) | 2% do preço de venda |
| Taxa de serviço — fixo por item | R$ 4,00 × `itemCount` (ambos) | R$ 4,00 × `itemCount` |
| Taxa de serviço — extra do cenário | — | + R$ 16,00 fixo por pedido |

Origem: engenharia reversa de 8 pedidos `COMPLETED` reais (conta
`1880105398`, 29/07–08/08/2026), validada com **0,58% de erro médio** contra
o valor líquido (`escrow_amount`) real desses pedidos. Ver
`specs/calculator-shopee.md` seções 3–7 para os dados brutos e o backtest
completo.

**Achados relevantes que este modelo captura corretamente** (e que o modelo
antigo, de taxa única, não capturava):
- Desconto Pix ao comprador e tarifa de parcelamento do cartão **não custam
  nada ao vendedor** — são financiados pela Shopee/comprador, não entram na
  fórmula como custo.
- Pedidos Pix ou parcelados têm comissão **menor** (12% vs 18%), não maior —
  por isso o default conservador (`cartao_avista`) é o **pior caso**, não uma
  média.
- A taxa de serviço tem um componente fixo por item (R$4), então pedidos com
  vários itens baratos (kits) têm retenção proporcionalmente mais alta —
  daí o novo parâmetro `itemCount`.
- Cupom próprio do vendedor (`seller_voucher`, distinto de voucher/coin da
  Shopee) é custo real e integral — já suportado pelo parâmetro `extraCosts`
  se o vendedor quiser embuti-lo no custo total antes de calcular.

### Fórmula — margem sobre o preço de venda (`marginBasis: 'price'`, default)

**Mercado Livre** (inalterada): dado `cost = unitCost + extraCosts`, taxa
`fee%`/`fixed` do canal, margem `m`:
```
price = (cost + fixed) / (1 - fee% - m)
```

**Shopee** (novo): comissão `c` (0.18 ou 0.12 conforme `paymentScenario`) e
taxa de serviço fixa `fixedFee = 4*itemCount + (16 se pix_ou_parcelado)`.
O componente fixo não depende do preço (só de `itemCount`/cenário, ambos
conhecidos antes de calcular), então a equação continua linear em `price` e
pode ser isolada algebricamente — não precisa de busca numérica:
```
k = 1 - c - 0.02                         // fração do preço que sobra após comissão + taxa-base
price = (cost + fixedFee) / (k - m)
```
(equivalente à forma usada em `specs/calculator-shopee.md` seção 9.1, que
isola por `liquido_necessario = cost/(1-m)` primeiro — mesma álgebra,
apresentação diferente; ambas produzem o mesmo resultado, confirmado por
round-trip test.)

### Fórmula — margem sobre o custo/markup (`marginBasis: 'cost'`)

**Mercado Livre** (inalterada):
```
price = (cost*(1+m) + fixed) / (1 - fee%)
```

**Shopee** (novo):
```
price = (cost*(1+m) + fixedFee) / (1 - c - 0.02)
```

### Saída sempre inclui, para auditoria
- Mercado Livre: `marketplaceFee` (`price*fee% + fixed`).
- Shopee: `marketplaceFee` = `commission + serviceFee`, onde
  `commission = price*c` e `serviceFee = price*0.02 + fixedFee`. Considerar
  expor os dois separadamente no retorno (`commission`, `serviceFee`) além do
  total, para auditoria — decisão de implementação, não obrigatório pelo
  contrato.
- Em ambos: `grossRevenue` (`price`), `netProfit`, `netMarginPct` recalculado
  a partir do resultado.

## Casos de Borda
- `1 - fee% - m <= 0` (ML) ou `k - m <= 0` (Shopee) → erro de negócio explícito, nunca preço negativo/infinito.
- `unitCost <= 0` → erro de validação.
- `targetMarginPct < 0` ou `>= 1` → erro de validação.
- `marketplace` fora do enum → erro de validação (`ServiceRegistry` já barra antes de chamar o serviço).
- `itemCount < 1` → tratar como 1 (nunca fixo negativo ou zero).
- `paymentScenario` fora do enum → erro de validação; **nunca** silenciosamente cair no cenário mais barato (12%) por omissão — o default seguro é sempre `cartao_avista` (18%, pior caso).
- Arredondamento: preço final sempre 2 casas decimais (`Math.round(price*100)/100`), nunca truncado.
- `compareMarketplaces` reaproveita `calculateSuggestedPrice`, nunca duplica fórmula.
- Preço sugerido abaixo do `marketAveragePrice` informado → não bloqueia, só sinaliza `belowMarketAverage: true`.

## Critérios de Aceite (Given/When/Then)
- Given `unitCost=50, targetMarginPct=0.25, marketplace=mercado_livre` When calculado Then `suggestedPrice ≈ 91.80`.
- Given `unitCost=50, targetMarginPct=0.20, marketplace=shopee` (default `paymentScenario=cartao_avista`, `itemCount=1`) When calculado Then `suggestedPrice = 90.00`, `marketplaceFee = 22.00` (commission 16.20 + serviceFee 5.80), `netProfit = 18.00`, `netMarginPct = 0.20` exato — margem sempre medida sobre o **preço de venda** (`marginBasis: price`), mesma convenção do Mercado Livre, não sobre o valor líquido recebido.
- Given os mesmos parâmetros acima mas `paymentScenario=pix_ou_parcelado` When calculado Then `suggestedPrice = 106.06` (comissão menor, 12% em vez de 18%, mas a taxa de serviço fixa sobe de R$4 para R$20 — o efeito líquido é um preço sugerido mais alto, não mais baixo; contra-intuitivo, mas confira `commission=12.73` + `serviceFee=22.12` = `marketplaceFee=34.85` antes de estranhar).
- Given `unitCost=15, targetMarginPct=0.20, marketplace=shopee, itemCount=3` When calculado Then `suggestedPrice = 45.00` (fixo de R$12 em vez de R$4 — kit de 3 itens; `commission=8.10`, `serviceFee=12.90`).
- Given `targetMarginPct=0.85, marketplace=shopee` When calculado Then retorna `{error: "..."}"`.
- Given `marketplace='amazon'` When calculado Then `ServiceRegistry` retorna erro de validação de enum antes de chamar o serviço.
- Cobertos por `runSmokeTests_()` em `src/99_Main.js` — **adicionar os 3 novos casos Shopee acima aos smoke tests existentes**, não só os 2 antigos.

## Fora de Escopo (v1, ainda válido) / v2 (nesta revisão)
- Taxas escalonadas por categoria/tipo de anúncio (Shopee) — o modelo novo já
  diferencia por cenário de pagamento e nº de itens, mas não por categoria.
- Frete/subsídio de frete no cálculo — confirmado por dados reais que o
  frete é neutro para o vendedor (repasse = custo real, ou comprador paga
  direto), então segue de fora com segurança.
- Persistência automática do cálculo (log em `SheetsRepository` fica para iteração futura).
- **Divergência conhecida, não resolvida nesta revisão**: `CalculatorService.js`
  (calculadora ML do widget flutuante, `specs/calculator.md`) usa uma tabela
  de taxas ML **escalonada por faixa de preço + regime CPF/CNPJ**
  (`ML_FEES_CNPJ`/`ML_FEES_CPF`), diferente do modelo flat 14%+R$6 usado
  aqui. As duas coexistem no código hoje. Não foi feita engenharia reversa
  de pedidos ML reais nesta análise (só Shopee) — não há dados para dizer
  qual dos dois modelos é mais preciso. Repetir a mesma metodologia desta
  revisão (pedidos `COMPLETED` reais + backtest) para Mercado Livre antes de
  tentar unificar os dois.

## Dependências
- `ConfigService.getMarketplaceFee`, `ConfigService.getShopeeFeeModel`, `ConfigService.listMarketplaces`.
- Nenhuma chamada Tiops (cálculo puro).

## Consumidores conhecidos
- `CatalogService.getProducts` → `calculateSuggestedPrice` (preços sugeridos do Catálogo).
- `EstoquePrecoService.js`, `EstoqueService.js` → `calculateNetMargin` (colunas MARGEM_SHOPEE/MARGEM_MERCADO_LIVRE e alertas de prejuízo/margem baixa/alta da aba ESTOQUE).
- `CalculatorService.js` (widget 🧮) → modelo Shopee via `ConfigService.getShopeeFeeModel` diretamente (não via `PricingService`, porque também precisa camadas de Ads/Imposto Simples que não fazem parte deste contrato — ver `specs/calculator.md`).
