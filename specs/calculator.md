# Spec: Calculadora de Precificação (PrecificaPro)

## Status
Implemented

## Changelog
- **08/08/2026** — v2: unificada com Shopee. O app tinha duas calculadoras
  (este widget, só ML; e um widget novo `pricing.compareMarketplaces`/
  `PricingView.html` construído para validar o modelo Shopee). Por pedido do
  usuário ("só deve existir uma única calculadora"), o segundo widget foi
  removido e sua inteligência (modelo de taxa Shopee de 2 componentes,
  `ConfigService.getShopeeFeeModel`, ver `specs/calculator-shopee.md`) foi
  incorporada aqui: `calculator.calculateML` virou `calculator.calculate`
  com novo param `marketplace` (`shopee`\|`mercado_livre`); `taxasML`/
  `menosML_percent`/`menosML_fixo` viraram `taxasCanal`/`menosComissao`/
  `menosTaxaServico` (nomes genéricos, mesmo shape pros dois canais).
  Mercado Livre **não mudou de comportamento** (mesma tabela por
  faixa/regime, mesma fórmula iterativa) — só os nomes dos campos de saída.

## Objetivo

Calculadora interativa única do app (acessível de qualquer página, botão 🧮
no topo) que simula a precificação em **Shopee ou Mercado Livre**, levando
em conta:
- Custo do produto + custos adicionais
- Margem de lucro desejada (%)
- Taxas do canal escolhido (Mercado Livre: por faixa de preço + regime
  CPF/CNPJ; Shopee: comissão por cenário de pagamento + taxa de serviço —
  modelo validado por engenharia reversa, `specs/calculator-shopee.md`)
- Imposto (Simples Nacional, %) e Ads (%) — genéricos, aplicados igual nos
  dois canais
- Campos específicos por canal: Mercado Livre (regime tributário, campanha
  de destaque, vendedor iniciante) vs. Shopee (cenário de pagamento, nº de
  itens no pedido)

Acessível como **widget flutuante** no canto inferior direito de qualquer página,
abre como **modal em tela cheia** ao clicar. Cálculos em tempo real conforme o
usuário digita. Se `precoVenda` for informado, a calculadora muda de modo:
em vez de sugerir um preço a partir do custo+margem, decompõe esse preço já
decidido e mostra quanto sobra líquido (e a margem real resultante).

---

## Contrato da API Interna

### `calculator.calculate`
- Descrição: Calcula preço sugerido (ou decompõe um preço de venda já
  informado) e lucro líquido, para Shopee ou Mercado Livre.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| marketplace | string (`shopee`\|`mercado_livre`) | não | `mercado_livre` | Canal |
| custoProduto | number | sim | — | Custo em R$ |
| custosAdicionais | number | não | 0 | Custos extras em R$ (embalagem, etc) |
| margem | number | não | 0.20 | Margem alvo (ex. 0.20 = 20%), 0–0.99, sobre o preço de venda |
| adsPercent | number | não | 0 | Taxa de ads sobre venda (%), 0–100 |
| precoVenda | number | não | null | Preço manual de venda em R$. Se nulo, calcula automaticamente; se informado, simula esse preço |
| impostoSimples | number | não | 0.06 | Imposto Simples Nacional (%), 0–1 |
| regime | string (`cpf`\|`cnpj`) | não | `cnpj` | **[Mercado Livre]** regime tributário |
| campanhadeDestaque | boolean | não | false | **[Mercado Livre]** aplica taxa adicional de 3.5%? |
| vendedorIniciante | boolean | não | false | **[Mercado Livre]** isento de comissão e taxa fixa? |
| paymentScenario | string (`cartao_avista`\|`pix_ou_parcelado`) | não | `cartao_avista` | **[Shopee]** cenário de pagamento assumido; default é o pior caso |
| itemCount | number | não | 1 | **[Shopee]** nº de itens no pedido, afeta a taxa de serviço (R$4/item) |

- Retorno: `{ success: true, data: {...} }` ou `{ error: string }`

- Estrutura de `data` (genérica para os dois canais):

```javascript
{
  marketplace: string,               // 'shopee' | 'mercado_livre'
  custoProduto: number,              // Custo do produto (input)
  custosAdicionais: number,          // Custos adicionais (input)
  custoTotal: number,                // custoProduto + custosAdicionais

  margemAlvo: number,                // Margem desejada (ex. 0.20 = 20%)
  precoSugerido: number,             // Preço de venda calculado (se precoVenda=null)
  precoVenda: number,                // Preço de venda final (input ou calculado)

  taxasCanal: {
    label: string,                   // ML: "R$80–99", "≥R$200", "< R$8", "Isento"; Shopee: "Cartão à vista", "Pix / parcelado"
    comissaoPct: number,             // Taxa % (ML: por faixa; Shopee: 0.18 ou 0.12)
    isento: boolean                  // true se vendedor iniciante (só ML)
  },

  adsPercent: number,                // Taxa ads (input, ex. 0.02 = 2%)
  adsTaxaFixa: number,               // Se ads > 0, aplica taxa % sobre venda

  campanhadeDestaque: boolean,       // [ML] Aplica 3.5%? (input)
  regime: string,                    // [ML] regime usado
  paymentScenario: string,           // [Shopee] cenário usado
  itemCount: number,                 // [Shopee] nº de itens usado

  descomposicao: {
    precoVenda: number,              // Preço inicial
    menosComissao: number,           // - comissão/taxa % do canal
    menosTaxaServico: number,        // - taxa fixa ML OU taxa de serviço Shopee (2%+fixo)
    menosAds: number,                // - ads
    menoCampanha: number,            // - campanha de destaque (3.5%, só ML — sempre 0 na Shopee)
    menosImposto: number,            // - imposto Simples Nacional
    subTotal: number,                // Receita líquida antes de custos
    menosCustos: number,             // - custo total (produto + adicionais)
    lucroLiquido: number             // Lucro final = subTotal - custos
  },

  margemAlcancada: number,           // % de margem real alcançada = (lucroLiquido / precoVenda) * 100
  margemAcimaDoCusto: number,        // (precoVenda / custoTotal) - 1 (quanto a mais que custo, em %)

  avisos: [                          // Warnings para o usuário
    { tipo: string, msg: string }    // ex. { tipo: 'margin_low', msg: 'Margem abaixo de 10%' }
  ]
}
```

---

## Regras de Negócio

### Cálculo de Preço Sugerido — Mercado Livre (se precoVenda não informado)

Se `precoVenda` é null, usar fórmula iterativa para encontrar preço que atinja margem desejada:

```
preçoVenda = (custoTotal + (custoTotal * margemAlvo)) / (1 - taxasCanal% - ads% - campanha% - imposto%)
```

**Ordem de cálculo:**
1. Somar todas as deduções (comissão do canal + ads + campanha + imposto)
2. Dividir custo+margem pelo fator de retenção
3. Arredondar para 2 casas decimais

Iterativo porque a taxa de comissão ML depende da própria faixa de preço
(circular: preço define faixa, faixa define taxa, taxa define preço) — usa
`calcPriceIteration` (máx. 50 iterações, convergência por diferença < R$0,01).
**Comportamento inalterado nesta revisão.**

### Cálculo de Preço Sugerido — Shopee (se precoVenda não informado)

Shopee usa o modelo de dois componentes validado por engenharia reversa de
pedidos reais (`ConfigService.getShopeeFeeModel(paymentScenario, itemCount)`
— ver `specs/calculator-shopee.md` seções 3-7 para os dados brutos e o
backtest). Ao contrário de ML, o componente fixo da taxa de serviço não
depende do preço (só de `itemCount`/`paymentScenario`, conhecidos antes de
calcular), então a fórmula é **fechada** — não precisa de iteração:

```
k = 1 - commissionPct - serviceFeeBasePct
kAjustado = k - ads% - impostoSimples%
preçoVenda = (custoTotal + serviceFeeFixed) / (kAjustado - margemAlvo)
```

`commissionPct` é 18% (`cartao_avista`, default/pior caso) ou 12%
(`pix_ou_parcelado`); `serviceFeeBasePct` é 2%; `serviceFeeFixed` é
`4*itemCount + (16 se pix_ou_parcelado)`. Margem sempre medida sobre o
**preço de venda**, mesma convenção usada em `specs/pricing.md`. Ads e
Imposto Simples são deduções genéricas de vendedor (não fazem parte da
engenharia reversa Shopee) — aplicadas aqui exatamente como já eram para
Mercado Livre, reduzindo `k` antes de resolver o preço.

### Taxas Mercado Livre (Por Faixa de Preço e Regime)

#### CNPJ:
| Faixa | Taxa | Fixa |
|---|---|---|
| < R$8 | 20% | 50%pr* |
| Até R$79 | 20% | R$4,00 |
| R$80–99 | 14% | R$16,00 |
| R$100–199 | 14% | R$20,00 |
| ≥ R$200 | 14% | R$26,00 |

*%pr = percentual do valor (ex. 50%pr = 50% da taxa %)

#### CPF:
| Faixa | Taxa | Fixa |
|---|---|---|
| < R$8 | 20% | 50%pr |
| Até R$79 | 20% | R$7,00 |
| R$80–99 | 14% | R$19,00 |
| R$100–199 | 14% | R$23,00 |
| ≥ R$200 | 14% | R$29,00 |

**Aplicação:**
- Taxa é sobre `precoVenda`
- Fixa é deduzida do valor de venda (em R$)
- Se vendedor iniciante (`vendedorIniciante: true`): both taxa% e fixa = 0

### Taxas Shopee (Comissão + Taxa de Serviço, por Cenário de Pagamento)

| Componente | `cartao_avista` (default) | `pix_ou_parcelado` |
|---|---:|---:|
| Comissão | 18% do preço de venda | 12% do preço de venda |
| Taxa de serviço — base | 2% do preço de venda | 2% do preço de venda |
| Taxa de serviço — fixo por item | R$ 4,00 × `itemCount` | R$ 4,00 × `itemCount` |
| Taxa de serviço — extra do cenário | — | + R$ 16,00 fixo por pedido |

**Aplicação:**
- Comissão e a parte base da taxa de serviço são sobre `precoVenda`
- A parte fixa da taxa de serviço é deduzida em R$, somada à base
- Não há isenção de vendedor iniciante na Shopee (`taxasCanal.isento` sempre `false`)

### Imposto Simples Nacional

- Percentual fornecido pelo usuário (default 6% conforme escala padrão)
- Aplicado sobre a receita bruta antes de custos
- Fórmula: `impostoValor = precoVenda * impostoSimples%`

### Ads (Publicidade)

- Opcional, taxa percentual sobre a venda (default 0%)
- Aplicado como: `adsValor = precoVenda * adsPercent%`

### Campanha de Destaque

- Taxa adicional fixa de 3.5% sobre a venda
- Só aplicada se `campanhadeDestaque: true`
- Fórmula: `descomposicao.menoCampanha = precoVenda * 0.035`

### Descomposição de Preço

Ordem de dedução (do preço de venda), igual para os dois canais:
1. Comissão do canal (`menosComissao` — ML: taxa % da faixa; Shopee: comissão 18%/12%)
2. Taxa de serviço/fixa do canal (`menosTaxaServico` — ML: taxa fixa da faixa; Shopee: 2%+fixo)
3. Ads (%)
4. Campanha de destaque (3.5%, só ML — sempre 0 na Shopee)
5. Imposto Simples Nacional (%)
6. Custos (produto + adicionais)
7. **Resultado: lucro líquido**

### Validações

- `custoProduto` ≥ 0
- `margem` entre 0 e 0.99 (0% a 99%)
- `adsPercent` entre 0 e 100
- `impostoSimples` entre 0 e 1 (0% a 100%)
- `precoVenda` (se informado) > `custoTotal` (evita perda)
- Margem alvo impossível → aviso "Margem não alcançável" (ex.: 99% com alta taxa)

### Avisos (Warnings)

Retornar array `avisos`:
- `{ tipo: 'margin_low', msg: 'Margem realizada (X%) abaixo de 10%' }` se margem < 10%
- `{ tipo: 'negative_profit', msg: 'Preço abaixo do custo — prejuízo!' }` se lucro < 0
- `{ tipo: 'margin_unreachable', msg: 'Margem de X% impossível com estas taxas' }` se iteração falha
- `{ tipo: 'high_ads', msg: 'Ads muito alto (X%) — reduz margem significativamente' }` se ads > 10%

---

## Casos de Borda

- **Custo = 0:** margem infinita, avisar "Custo zerado"
- **Preço = Custo:** margem = 0%, lícito (breakeven)
- **Faixa < R$8 com %pr:**  percentual é calculado como % do valor em %
  - Ex.: 20% + 50%pr = 20% + (20% * 0.5) = 20% + 10% = 30%
- **Preço muito alto:** mesmo em ≥R$200, aplicar taxa fixa de R$26 (CNPJ) ou R$29 (CPF)
- **Todos os custos são 0:** lucro = receita líquida, margem = 100%
- **Imposto muito alto:** lucro pode ficar negativo, retornar aviso crítico
- **[Shopee] `itemCount < 1`:** tratar como 1 (nunca fixo negativo ou zero)
- **[Shopee] `paymentScenario` fora do enum:** erro de validação; nunca cair silenciosamente no cenário mais barato (12%) — default seguro é sempre `cartao_avista`
- **[Shopee] `kAjustado - margemAlvo <= 0`:** mesmo aviso `margin_unreachable` do ML (ads/imposto/margem somados ultrapassam o que sobra após comissão+taxa de serviço)

---

## Critérios de Aceite (Given/When/Then)

**Cenário 1: Básico CNPJ, faixa R$100–199**
- Given: custoProduto=100, margem=20%, regime=cnpj (marketplace=mercado_livre, default)
- When: `calculator.calculate({...})`
- Then: 
  - precoSugerido ~= R$168–172 (aproximado, depende de iteração)
  - taxasCanal.label = "R$100–199", taxasCanal.comissaoPct=14%, descomposicao.menosTaxaServico=R$20
  - lucroLiquido ≈ R$20 (20% de R$100)
  - margemAlcancada ~= 12–15% (reduz por taxa de 14%)

**Cenário 2: CPF com custo adicional**
- Given: custoProduto=50, custosAdicionais=10, margem=25%, regime=cpf
- When: `calculator.calculate({...})`
- Then:
  - custoTotal = 60
  - descomposicao.menosTaxaServico (pela faixa do preço calculado)
  - lucroLiquido = preçoSugerido - menosComissao - menosTaxaServico - 60
  - margemAlcancada ~= 20% (próximo à margem alvo, após taxas)

**Cenário 3: Campanha de destaque + ads**
- Given: custoProduto=100, margem=20%, campanhadeDestaque=true, adsPercent=2
- When: `calculator.calculate({...})`
- Then:
  - descomposicao.menoCampanha = precoSugerido * 0.035
  - descomposicao.menosAds = precoSugerido * 0.02
  - lucroLiquido reduzido por ambas
  - margemAlcancada reduzida vs. cenário 1

**Cenário 4: Preço manual informado**
- Given: custoProduto=50, precoVenda=150 (manual)
- When: `calculator.calculate({...})`
- Then:
  - precoSugerido não é calculado (fica `null`)
  - precoVenda usado como base
  - descomposição com R$150 de entrada
  - lucroLiquido = 150 - taxas - 50

**Cenário 5: Vendedor iniciante**
- Given: custoProduto=100, regime=cnpj, vendedorIniciante=true
- When: `calculator.calculate({...})`
- Then:
  - taxasCanal.isento = true
  - taxasCanal.comissaoPct = 0, descomposicao.menosTaxaServico = 0
  - lucroLiquido = preço - custos (sem taxas)
  - margemAlcancada ~= margem alvo (sem desconto de taxa)

**Cenário 6: Imposto alto**
- Given: custoProduto=100, impostoSimples=0.15 (15%)
- When: `calculator.calculate({...})`
- Then:
  - descomposicao.menosImposto = precoVenda * 0.15
  - lucroLiquido reduzido significativamente
  - margemAlcancada <10%, retorna aviso

**Cenário 7: Shopee básico, cartão à vista**
- Given: marketplace=shopee, custoProduto=50, margem=20% (default `paymentScenario=cartao_avista`, `itemCount=1`, `adsPercent=0`, `impostoSimples=0`)
- When: `calculator.calculate({...})`
- Then:
  - precoSugerido = 90.00
  - descomposicao.menosComissao = 16.20, descomposicao.menosTaxaServico = 5.80
  - lucroLiquido = 18.00, margemAlcancada = 20.0%

**Cenário 8: Shopee, Pix/parcelado**
- Given: mesmos parâmetros do Cenário 7 mas `paymentScenario=pix_ou_parcelado`
- When: `calculator.calculate({...})`
- Then:
  - precoSugerido = 106.06 (comissão menor, 12%, mas taxa de serviço fixa sobe de R$4 para R$20)
  - descomposicao.menosComissao = 12.73, descomposicao.menosTaxaServico = 22.12

**Cenário 9: Shopee, kit de 3 itens**
- Given: marketplace=shopee, custoProduto=15, margem=20%, itemCount=3 (demais defaults)
- When: `calculator.calculate({...})`
- Then:
  - precoSugerido = 45.00
  - descomposicao.menosComissao = 8.10, descomposicao.menosTaxaServico = 12.90 (fixo de R$12 em vez de R$4 — 3 itens)

**Cenário 10: Shopee, preço manual informado (modo "simular venda")**
- Given: marketplace=shopee, custoProduto=50, precoVenda=90 (manual, demais defaults)
- When: `calculator.calculate({...})`
- Then:
  - precoSugerido não é calculado (fica `null`)
  - descomposicao.subTotal (líquido recebido) = 68.00, lucroLiquido = 18.00, margemAlcancada = 20.0%

---

## Fora de Escopo

- Amazon, Shein, etc
- Histórico de cálculos
- Exportar simulações para CSV/PDF
- Integração com Tiops (apenas cálculo local)
- Variação de preço por qtidade (bulk discount)
- Imposto estadual/ICMS diferenciado por UF
- Múltiplos regimes ao mesmo tempo (apenas um por cálculo)
- Taxas Shopee escalonadas por categoria/tipo de anúncio (o modelo atual diferencia só por cenário de pagamento e nº de itens)
- Unificação com o modelo ML flat de `specs/pricing.md`/`PricingService` — este widget mantém sua própria tabela ML por faixa/regime, não reverse-engineered com pedidos reais (diferença documentada, não resolvida)

---

## Dependências

- `ConfigService.getShopeeFeeModel` — modelo de taxa Shopee validado (comissão + taxa de serviço)
- Nenhuma chamada externa (apenas cálculo em memória)

---

## Notas de Implementação

1. **CalculatorService.js**: serviço puro de cálculo (sem I/O)
   - `describe()`: retorna contrato de `calculate`
   - `calculate(params)`: valida e despacha para `_calculateML`/`_calculateShopee` conforme `marketplace`
   - `_calculateML`: mesma tabela por faixa/regime de sempre, comportamento inalterado
   - `_calculateShopee`: usa `ConfigService.getShopeeFeeModel`, fórmula fechada (sem iteração)

2. **CalculatorView.html**: Web Component modal
   - Floater no canto inferior direito (minimizado até clique)
   - Abre como modal full-screen com dark overlay
   - Seletor de marketplace no topo (Shopee/Mercado Livre, cores de marca) — campos específicos de cada canal aparecem/somem conforme a seleção
   - Inputs: custoProduto, custosAdicionais, margem%, ads%, imposto% (genéricos); regime/campanha/iniciante (só ML); cenário de pagamento/itens (só Shopee)
   - **Resultado em tempo real** conforme digita (debounce 300ms)
   - Descomposição visual de preço (árvore de deduções, rótulos dinâmicos por canal)
   - Avisos em cores: amarelo (warning), vermelho (crítico)
   - Responsivo (mobile: modal ocupa 95vw, desktop: ~600px)

3. **Integração**: adicionar CalculatorView como componente global
   - Já carregado em Shell.html (singleton)
   - Acessível de qualquer página sem import
   - Floater sempre visível

4. **Estilo**: usar Styles.html tokens
   - Cores de aviso/crítico via semânticas do design system
   - Tipografia conforme escala
   - Sem hard-coded

5. **Validação**: em tempo real, feedback imediato
   - Campo vermelho se inválido
   - Tooltip com motivo

---

## Teste de Aceitação Final

Abrir CalculatorView e validar:
- Floater aparece no canto inferior direito ✅
- Clique abre modal ✅
- Digitar custoProduto, margem → preço sugerido aparece em <500ms ✅
- Cenário 1 (básico CNPJ): preço confere com cálculo manual ✅
- Cenário 5 (vendedor iniciante): sem taxa ✅
- Cenário 7 (Shopee básico): preço confere com specs/pricing.md ✅
- Trocar o seletor de marketplace troca os campos visíveis e recalcula ✅
- Todos 10 cenários Given/When/Then passam ✅
- Avisos aparecem quando necessário (low margin, negative profit) ✅
- Responsivo em mobile e desktop ✅
