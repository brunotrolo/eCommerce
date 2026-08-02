# Spec: Calculadora de Precificação

## Status
Approved

## Objetivo
Generalizar a planilha manual existente (Custo Unitário, Preço Médio de
Mercado, Sugerido Shopee, Sugerido ML, Taxa, Lucro Líquido) num serviço:
dado custo + margem alvo + marketplace, calcular o preço sugerido descontando
a taxa correta do canal.

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

- Retorno: `{ suggestedPrice, marketplaceFee, grossRevenue, netProfit, netMarginPct, belowMarketAverage }`
- Erros esperados: `unitCost` inválido; `targetMarginPct` fora de `[0,1)`; margem alvo + taxa do canal `>= 100%`.

### `pricing.compareMarketplaces`
- Descrição: roda `calculateSuggestedPrice` para todos os marketplaces configurados, lado a lado.
- Params: mesmos de `calculateSuggestedPrice`, exceto `marketplace`.
- Retorno: `{ shopee: <shape acima>, mercado_livre: <shape acima> }`.

## Regras de Negócio

### Taxas por canal (fixas, `ConfigService.getMarketplaceFee`)
| Canal | Taxa percentual | Taxa fixa |
|---|---|---|
| Shopee | 20% flat sobre o preço de venda | R$ 0 |
| Mercado Livre | 14% sobre o preço de venda | R$ 6,00 por item vendido |

### Fórmula — margem sobre o preço de venda (`marginBasis: 'price'`, default)
Dado `cost = unitCost + extraCosts`, taxa `fee%`/`fixed` do canal, margem `m`:
```
price = (cost + fixed) / (1 - fee% - m)
```

### Fórmula — margem sobre o custo/markup (`marginBasis: 'cost'`)
```
price = (cost*(1+m) + fixed) / (1 - fee%)
```

### Saída sempre inclui, para auditoria
`marketplaceFee` (`price*fee% + fixed`), `grossRevenue` (`price`), `netProfit`, `netMarginPct` recalculado a partir do resultado.

## Casos de Borda
- `1 - fee% - m <= 0` → erro de negócio explícito, nunca preço negativo/infinito.
- `unitCost <= 0` → erro de validação.
- `targetMarginPct < 0` ou `>= 1` → erro de validação.
- `marketplace` fora do enum → erro de validação (`ServiceRegistry` já barra antes de chamar o serviço).
- Arredondamento: preço final sempre 2 casas decimais (`Math.round(price*100)/100`), nunca truncado.
- `compareMarketplaces` reaproveita `calculateSuggestedPrice`, nunca duplica fórmula.
- Preço sugerido abaixo do `marketAveragePrice` informado → não bloqueia, só sinaliza `belowMarketAverage: true`.

## Critérios de Aceite (Given/When/Then)
- Given `unitCost=50, targetMarginPct=0.25, marketplace=shopee` When calculado Then `suggestedPrice ≈ 90.91`.
- Given `unitCost=50, targetMarginPct=0.25, marketplace=mercado_livre` When calculado Then `suggestedPrice ≈ 91.80`.
- Given `targetMarginPct=0.85, marketplace=shopee` When calculado Then retorna `{error: "..."}"`.
- Given `marketplace='amazon'` When calculado Then `ServiceRegistry` retorna erro de validação de enum antes de chamar o serviço.
- Cobertos por `runSmokeTests_()` em `src/99_Main.js`.

## Fora de Escopo (v1)
- Taxas escalonadas por categoria/tipo de anúncio.
- Frete/subsídio de frete no cálculo.
- Persistência automática do cálculo (log em `SheetsRepository` fica para iteração futura).

## Dependências
- `ConfigService.getMarketplaceFee`, `ConfigService.listMarketplaces`.
- Nenhuma chamada Tiops (cálculo puro).
