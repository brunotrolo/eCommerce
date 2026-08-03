# Spec: Calculadora de Precificação Mercado Livre (PrecificaPro)

## Status
Approved

## Objetivo

Calculadora interativa que simula a precificação no Mercado Livre levando em conta:
- Custo do produto + custos adicionais
- Margem de lucro desejada (%)
- Taxas de Mercado Livre por faixa de preço
- Imposto (Simples Nacional, %)
- Taxas adicionais (ads, campanha de destaque)
- Regime tributário (CPF vs CNPJ) com comportamentos diferentes

Acessível como **widget flutuante** no canto inferior direito de qualquer página,
abre como **modal em tela cheia** ao clicar. Cálculos em tempo real conforme o
usuário digita.

---

## Contrato da API Interna

### `calculator.calculateML`
- Descrição: Calcula preço sugerido e lucro líquido para Mercado Livre
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| custoProduto | number | sim | — | Custo em R$ |
| custosAdicionais | number | não | 0 | Custos extras em R$ (embalagem, etc) |
| margem | number | não | 0.20 | Margem alvo (ex. 0.20 = 20%), 0–0.99 |
| adsPercent | number | não | 0 | Taxa de ads sobre venda (%), 0–100 |
| precoVenda | number | não | null | Preço manual de venda em R$. Se nulo, calcula automaticamente |
| regime | string (`cpf`\|`cnpj`) | não | `cnpj` | Regime tributário |
| impostoSimples | number | não | 0.06 | Imposto Simples Nacional (%), 0–1 |
| campanhadeDestaque | boolean | não | false | Aplica taxa adicional de 3.5%? |
| vendedorIniciante | boolean | não | false | Isento de comissão e taxa fixa? |

- Retorno: `{ success: true, data: {...} }` ou `{ error: string }`

- Estrutura de `data`:

```javascript
{
  custoProduto: number,              // Custo do produto (input)
  custosAdicionais: number,          // Custos adicionais (input)
  custoTotal: number,                // custoProduto + custosAdicionais
  
  margemAlvo: number,                // Margem desejada (ex. 0.20 = 20%)
  precoSugerido: number,             // Preço de venda calculado (se precoVenda=null)
  precoVenda: number,                // Preço de venda final (input ou calculado)
  
  taxasML: {
    faixa: string,                   // Ex. "R$80–99", "≥R$200", "< R$8"
    percentual: number,              // Taxa % (ex. 0.14 = 14%)
    fixo: number,                    // Taxa fixa (ex. 16, 20, 26)
    isento: boolean                  // true se vendedor iniciante
  },
  
  adsPercent: number,                // Taxa ads (input, ex. 0.02 = 2%)
  adsTaxaFixa: number,               // Se ads > 0, aplica taxa % sobre venda
  
  campanhadeDestaque: boolean,       // Aplica 3.5%? (input)
  descomposicao: {
    precoVenda: number,              // Preço inicial
    menosML_percent: number,          // - taxa % de ML
    menosML_fixo: number,             // - taxa fixa de ML
    menosAds: number,                 // - ads
    menoCampanha: number,             // - campanha de destaque (3.5%)
    menosImposto: number,             // - imposto Simples Nacional
    subTotal: number,                // Receita líquida antes de custos
    menosCustos: number,              // - custo total (produto + adicionais)
    lucroLiquido: number              // Lucro final = subTotal - custos
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

### Cálculo de Preço Sugerido (se precoVenda não informado)

Se `precoVenda` é null, usar fórmula iterativa para encontrar preço que atinja margem desejada:

```
preçoVenda = (custoTotal + (custoTotal * margemAlvo)) / (1 - taxasML% - ads% - campanha% - imposto%)
```

**Ordem de cálculo:**
1. Somar todas as deduções (taxa % de ML + ads + campanha + imposto)
2. Dividir custo+margem pelo fator de retenção
3. Arredondar para 2 casas decimais

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

Ordem de dedução (do preço de venda):
1. Taxa % de ML (calculada com base na faixa)
2. Taxa fixa de ML (em R$)
3. Ads (%)
4. Campanha de destaque (3.5%)
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

---

## Critérios de Aceite (Given/When/Then)

**Cenário 1: Básico CNPJ, faixa R$100–199**
- Given: custoProduto=100, margem=20%, regime=cnpj
- When: `calculator.calculateML({...})`
- Then: 
  - precoSugerido ~= R$168–172 (aproximado, depende de iteração)
  - taxasML.faixa = "R$100–199", taxa=14%, fixa=R$20
  - lucroLiquido ≈ R$20 (20% de R$100)
  - margemAlcancada ~= 12–15% (reduz por taxa de 14%)

**Cenário 2: CPF com custo adicional**
- Given: custoProduto=50, custosAdicionais=10, margem=25%, regime=cpf
- When: `calculator.calculateML({...})`
- Then:
  - custoTotal = 60
  - taxasML.fixa (pela faixa do preço calculado)
  - lucroLiquido = preçoSugerido - taxasML% - taxasML$ - 60
  - margemAlcancada ~= 20% (próximo à margem alvo, após taxas)

**Cenário 3: Campanha de destaque + ads**
- Given: custoProduto=100, margem=20%, campanhadeDestaque=true, adsPercent=2
- When: `calculator.calculateML({...})`
- Then:
  - descomposicao.menoCampanha = precoSugerido * 0.035
  - descomposicao.adsValor = precoSugerido * 0.02
  - lucroLiquido reduzido por ambas
  - margemAlcancada reduzida vs. cenário 1

**Cenário 4: Preço manual informado**
- Given: custoProduto=50, precoVenda=150 (manual)
- When: `calculator.calculateML({...})`
- Then:
  - precoSugerido não é calculado
  - precoVenda usado como base
  - descomposição com R$150 de entrada
  - lucroLiquido = 150 - taxas - 50

**Cenário 5: Vendedor iniciante**
- Given: custoProduto=100, regime=cnpj, vendedorIniciante=true
- When: `calculator.calculateML({...})`
- Then:
  - taxasML.isento = true
  - taxasML.percentual = 0, taxasML.fixo = 0
  - lucroLiquido = preço - custos (sem taxas)
  - margemAlcancada ~= margem alvo (sem desconto de taxa)

**Cenário 6: Imposto alto**
- Given: custoProduto=100, impostoSimples=0.15 (15%)
- When: `calculator.calculateML({...})`
- Then:
  - descomposicao.menosImposto = precoVenda * 0.15
  - lucroLiquido reduzido significativamente
  - margemAlcancada <10%, retorna aviso

---

## Fora de Escopo (v1)

- Shopee (tarifário diferente)
- Amazon, Shein, etc
- Histórico de cálculos
- Exportar simulações para CSV/PDF
- Integração com Tiops (apenas cálculo local)
- Variação de preço por qtidade (bulk discount)
- Imposto estadual/ICMS diferenciado por UF
- Múltiplos regimes ao mesmo tempo (apenas um por cálculo)

---

## Dependências

- `PricingService` (reutiliza fórmula de cálculo iterativo, se existir)
- Nenhuma chamada externa (apenas cálculo em memória)

---

## Notas de Implementação

1. **CalculatorService.js**: serviço puro de cálculo (sem I/O)
   - `describe()`: retorna contrato de `calculateML`
   - `calculateML(params)`: executa cálculo conforme acima
   - Suportar fácil adição de `calculateShopee()` depois

2. **CalculatorView.html**: Web Component modal
   - Floater no canto inferior direito (minimizado até clique)
   - Abre como modal full-screen com dark overlay
   - Formulário em abas: "ML" (Mercado Livre) + futuramente Shopee
   - Inputs: custoProduto, custosAdicionais, margem%, ads%, regime radio, imposto%, checkboxes
   - **Resultado em tempo real** conforme digita (debounce 300ms)
   - Descomposição visual de preço (árvore de deduções)
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
- Todos 6 cenários Given/When/Then passam ✅
- Avisos aparecem quando necessário (low margin, negative profit) ✅
- Responsivo em mobile e desktop ✅
