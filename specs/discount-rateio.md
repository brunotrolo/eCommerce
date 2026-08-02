# Spec: Rateio de Desconto e Despesas Acessórias por Item (Custo Líquido Real)

## Status
Approved

## Objetivo
**Spec complementar a `nfe-entrada.md` e `nfe-entrada-produtos.md`.** Define como
calcular o **custo real de aquisição por item** de uma NFe, considerando que o
desconto (`vDesc`) e as despesas acessórias (`vOutro`) podem vir do emitente de
duas formas diferentes:

- **Já distribuídos por item** (cada `<det><prod>` traz seu próprio `vDesc`/`vOutro`).
- **Só no total da nota** (`<total><ICMSTot>`), exigindo rateio proporcional.

Hoje `NFE_ENTRADA_PRODUTOS.VALOR_TOTAL` guarda apenas `vProd` bruto (sem desconto,
sem despesas), o que é enganoso para custo real — dois itens com o mesmo `vProd`
podem ter custo final bem diferente se um teve desconto e outro não. Sem isso,
qualquer cálculo de margem (futuro `PricingService`) usaria custo errado.

Resolve o problema: dado o `vProd`/`vDesc`/`vOutro` de cada item (ou só da nota),
calcular `VALOR_LIQUIDO_ITEM` (custo final real) com rastreabilidade total —
bruto vs. líquido, com e sem despesas acessórias.

**Validado com 4 NFes reais do projeto** (647, 688, 731, 805696) — ver Critérios
de Aceite. Todos os cenários hoje observados usam o padrão "item" (nunca o
rateio da nota inteira), mas o rateio é implementado para cobrir emitentes
futuros que possam consolidar o desconto/despesa só no total.

## Contrato da API Interna

### `nfeEntradaProdutos.calcularRateioItem` (função pura, interna)
- **Descrição:** Para um item de uma NFe, determina `VALOR_DESCONTO_ITEM` e
  `VALOR_OUTROS_ITEM`, decidindo entre usar o valor do próprio item ou ratear
  proporcionalmente o valor da nota. Chamada por `processarNf` para cada item
  antes de escrever a linha em `NFE_ENTRADA_PRODUTOS`.
- **Params:**
  | Nome | Tipo | Obr. | Default | Descrição |
  |------|------|------|---------|-----------|
  | item | object | sim | — | `{vProd, vDesc, vOutro}` do item (vDesc/vOutro podem estar ausentes) |
  | vProdTotalNota | number | sim | — | Soma de `vProd` de todos os itens da NF |
  | vDescNota | number | sim | — | `vDesc` do cabeçalho (`ICMSTot`) |
  | vOutroNota | number | sim | — | `vOutro` do cabeçalho (`ICMSTot`) |
  | temItemComVDesc | boolean | sim | — | true se QUALQUER item da NF trouxer campo `vDesc` |
  | temItemComVOutro | boolean | sim | — | true se QUALQUER item da NF trouxer campo `vOutro` |
  | isUltimoItem | boolean | sim | — | true se for o último item da NF (recebe ajuste de arredondamento) |
  | somaParcialDesconto | number | sim | — | soma acumulada de `VALOR_DESCONTO_ITEM` dos itens já processados (para ajuste no último) |
  | somaParcialOutros | number | sim | — | soma acumulada de `VALOR_OUTROS_ITEM` dos itens já processados |
- **Retorno:**
  ```javascript
  {
    valorDescontoItem: number,   // 2 casas decimais
    tipoDesconto: string,        // "ITEM" | "RATEADO" | "NENHUM"
    valorOutrosItem: number,     // 2 casas decimais
    tipoOutros: string,          // "ITEM" | "RATEADO" | "NENHUM"
    valorLiquidoItem: number,    // vProd - valorDescontoItem + valorOutrosItem
    valorUnitarioLiquido: number // valorLiquidoItem / quantidade
  }
  ```
- **Erros esperados:** Nenhum (função pura, sempre retorna um valor; NF com
  dados inconsistentes gera log de warning em `processarNf`, não exception aqui).

## Regras de Negócio

### 1. Determinação do "path" (ITEM vs. RATEADO vs. NENHUM) — por dimensão, por NF
Desconto e despesas acessórias são avaliados **independentemente um do outro**,
mas a decisão do path é **por nota inteira** (não por item), para não misturar
critérios dentro da mesma NF:

```
Para DESCONTO:
  Se temItemComVDesc == true  → TIPO_DESCONTO = "ITEM" (todos os itens da NF)
  Senão se vDescNota > 0      → TIPO_DESCONTO = "RATEADO" (todos os itens da NF)
  Senão                       → TIPO_DESCONTO = "NENHUM"

Para OUTROS (mesma lógica, campo vOutro):
  Se temItemComVOutro == true → TIPO_OUTROS = "ITEM"
  Senão se vOutroNota > 0     → TIPO_OUTROS = "RATEADO"
  Senão                       → TIPO_OUTROS = "NENHUM"
```

`temItemComVDesc`/`temItemComVOutro` = true se **qualquer** item do
`PRODUTOS_JSON` da NF trouxer o campo (mesmo que outro item da mesma nota não
traga — nesse caso o item sem o campo recebe valor 0, não é rateado).

### 2. Cálculo por path

**Path "ITEM":**
```
valorDescontoItem = item.vDesc || 0   (direto do XML, sem cálculo)
valorOutrosItem   = item.vOutro || 0
```

**Path "RATEADO":**
```
proporcao = item.vProd / vProdTotalNota
valorRateado = round(valorNota × proporcao, 2)
```

**Path "NENHUM":**
```
valor = 0
```

### 3. Ajuste de arredondamento (path RATEADO apenas)
Como o rateio proporcional de valores com 2 casas decimais pode não fechar
exatamente a soma da nota (ex: nota com 3 itens e desconto ímpar), o **último
item processado da NF** absorve a diferença:
```
valorUltimoItem = valorNota - somaParcial(demais itens já arredondados)
```
Isso garante `SUM(VALOR_DESCONTO_ITEM) === vDescNota` e
`SUM(VALOR_OUTROS_ITEM) === vOutroNota` sempre, sem resíduo de centavos.
(Path "ITEM" não precisa desse ajuste — vem pronto do XML.)

### 4. Custo líquido do item (aplicável a todos os paths)
```
VALOR_LIQUIDO_ITEM = VALOR_TOTAL (vProd) - VALOR_DESCONTO_ITEM + VALOR_OUTROS_ITEM
VALOR_UNITARIO_LIQUIDO = VALOR_LIQUIDO_ITEM / QUANTIDADE
```
`VALOR_LIQUIDO_ITEM` é o **custo real de aquisição** do item — a base correta
para qualquer cálculo futuro de margem/precificação (`PricingService`).
`VALOR_TOTAL` (bruto, já existente em `NFE_ENTRADA_PRODUTOS`) nunca é alterado
— ele continua sendo o `vProd` puro, para preservar compatibilidade com specs
já implementadas.

### 5. Validação de reconciliação (obrigatória a cada `processarNf`)
Após processar todos os itens de uma NF, validar:
```
SUM(VALOR_DESCONTO_ITEM) da NF ≈ VALOR_DESCONTO (cabeçalho NFE_ENTRADA)   (± 0.01)
SUM(VALOR_OUTROS_ITEM) da NF   ≈ VALOR_OUTROS (cabeçalho NFE_ENTRADA)     (± 0.01)
SUM(VALOR_LIQUIDO_ITEM) da NF  ≈ VALOR_TOTAL (cabeçalho NFE_ENTRADA, vNF) (± 0.01)
```
Se algum desvio > R$ 0.01: `LoggingService.log()` com `status: 'ERROR'` e
`summary` descrevendo o desvio (número da NF, valor esperado vs. calculado).
**Não bloqueia a inserção** — insere os dados calculados mesmo assim, para não
travar o pipeline por inconsistência de origem (Bling/emitente).

## Casos de Borda

- **NF sem desconto nem despesas (NFe 805696, 44 itens):** `TIPO_DESCONTO` e
  `TIPO_OUTROS` = "NENHUM" para todos os itens. `VALOR_LIQUIDO_ITEM = VALOR_TOTAL`.
- **NF com desconto só no header, nenhum item traz `vDesc`:** path "RATEADO"
  para todos os itens dessa NF.
- **Item sem `vDesc` dentro de uma NF onde outros itens têm `vDesc`:** esse
  item específico recebe `VALOR_DESCONTO_ITEM = 0`, mas `TIPO_DESCONTO = "ITEM"`
  (herda o path da NF — não é rateado individualmente).
- **NF com 1 único item:** path "RATEADO" trivial — item recebe 100% do
  desconto/outros da nota (proporção = 1). Ajuste de arredondamento não se aplica
  (não há distribuição a fazer).
- **`vProdTotalNota = 0` (todos os itens com vProd=0):** proporção indefinida —
  usar rateio igualitário (`1/quantidade_itens`) e logar warning
  "vProd total zero, rateio igualitário aplicado".
- **Soma dos itens não reconcilia com o header (dado inconsistente na origem):**
  logar warning conforme Regra 5, inserir mesmo assim (dados calculados
  prevalecem sobre o header, que pode ter erro de digitação do emitente).
- **Desconto negativo (`vDesc < 0`, raro — acréscimo em vez de desconto):**
  aceitar e aplicar a mesma fórmula (o sinal já resolve a subtração).

## Critérios de Aceite (Given/When/Then)

### Scenario 1: NFe 731 — desconto item-level, 3 produtos (dado real do projeto)
```
Given: NFe 731 com vProd=745.00, vDesc=111.75 (header), vOutro=0.00,
       cada item já traz seu próprio vDesc no XML
When: nfeEntradaProdutos.processarNf({numeroNf: "731", ...})
Then:
  - Maison Delilah: VALOR_TOTAL=360.00, VALOR_DESCONTO_ITEM=54.00, TIPO_DESCONTO="ITEM",
    VALOR_OUTROS_ITEM=0.00, TIPO_OUTROS="NENHUM", VALOR_LIQUIDO_ITEM=306.00,
    VALOR_UNITARIO_LIQUIDO=153.00 (306/2)
  - Ameerat Al Arab: VALOR_TOTAL=260.00, VALOR_DESCONTO_ITEM=39.00, VALOR_LIQUIDO_ITEM=221.00
  - Seduction VIP: VALOR_TOTAL=125.00, VALOR_DESCONTO_ITEM=18.75, VALOR_LIQUIDO_ITEM=106.25
  - Reconciliação: SUM(VALOR_LIQUIDO_ITEM) = 306.00+221.00+106.25 = 633.25 = VALOR_TOTAL da NFE_ENTRADA (vNF) ✓
  - SUM(VALOR_DESCONTO_ITEM) = 54.00+39.00+18.75 = 111.75 = VALOR_DESCONTO do header ✓
```

### Scenario 2: NFe 688 — desconto item-level, 9 produtos, sem arredondamento residual
```
Given: NFe 688 com vProd=3017.98, vDesc=452.70 (header), vOutro=0.00,
       cada item traz seu próprio vDesc (15% flat em todos)
When: nfeEntradaProdutos.processarNf({numeroNf: "688", ...})
Then:
  - Todos os 9 itens: TIPO_DESCONTO="ITEM", TIPO_OUTROS="NENHUM"
  - Ex: Lataffa Asad Elixir: VALOR_TOTAL=250.00, VALOR_DESCONTO_ITEM=37.50, VALOR_LIQUIDO_ITEM=212.50
  - Ex: Al Wataniah Durrat Al Aroos (qtd=2): VALOR_TOTAL=259.98, VALOR_DESCONTO_ITEM=39.00,
    VALOR_LIQUIDO_ITEM=220.98, VALOR_UNITARIO_LIQUIDO=110.49
  - Reconciliação: SUM(VALOR_LIQUIDO_ITEM) dos 9 itens = 2565.28 = VALOR_TOTAL (vNF) ✓
  - SUM(VALOR_DESCONTO_ITEM) = 452.70 = VALOR_DESCONTO do header ✓
```

### Scenario 3: NFe 647 — despesas acessórias item-level, sem desconto, 6 produtos
```
Given: NFe 647 com vProd=900.50, vDesc=0.00 (header), vOutro=45.03 (header),
       cada item traz seu próprio vOutro no XML (nenhum traz vDesc)
When: nfeEntradaProdutos.processarNf({numeroNf: "647", ...})
Then:
  - Todos os 6 itens: TIPO_DESCONTO="NENHUM" (VALOR_DESCONTO_ITEM=0.00),
    TIPO_OUTROS="ITEM"
  - Ex: Al Wataniah Durrat Al Aroos: VALOR_TOTAL=110.50, VALOR_OUTROS_ITEM=5.53,
    VALOR_LIQUIDO_ITEM=116.03 (110.50 - 0 + 5.53)
  - Ex: Armaf Club De Nuit: VALOR_TOTAL=212.00, VALOR_OUTROS_ITEM=10.60, VALOR_LIQUIDO_ITEM=222.60
  - Reconciliação: SUM(VALOR_LIQUIDO_ITEM) dos 6 itens = 945.53 = VALOR_TOTAL (vNF) ✓
  - SUM(VALOR_OUTROS_ITEM) = 45.03 = VALOR_OUTROS do header ✓
```

### Scenario 4: NFe 805696 — sem desconto nem despesas, 44 produtos
```
Given: NFe 805696 com vDesc=0.00, vOutro=0.00 (header e todos os itens)
When: nfeEntradaProdutos.processarNf({numeroNf: "805696", ...})
Then:
  - Todos os 44 itens: TIPO_DESCONTO="NENHUM", TIPO_OUTROS="NENHUM"
  - VALOR_LIQUIDO_ITEM = VALOR_TOTAL para todos (sem ajuste)
  - VALOR_UNITARIO_LIQUIDO = VALOR_UNITARIO para todos
  - Reconciliação: SUM(VALOR_LIQUIDO_ITEM) = VALOR_TOTAL do header (1432.16) ✓
```

### Scenario 5: Rateio hipotético — desconto só no header (path RATEADO)
```
Given: NFe fictícia com 3 itens, vProd = [200.00, 300.00, 100.00] (total 600.00),
       vDesc = 50.00 no header, nenhum item traz campo vDesc
When: nfeEntradaProdutos.processarNf(...)
Then:
  - Todos os itens: TIPO_DESCONTO="RATEADO"
  - Item 1: proporção 200/600=0.3333 → valorRateado=round(50×0.3333,2)=16.67
  - Item 2: proporção 300/600=0.5 → valorRateado=25.00
  - Item 3 (último, recebe ajuste): 50.00 - 16.67 - 25.00 = 8.33 (não 16.67 puro)
  - SUM(VALOR_DESCONTO_ITEM) = 16.67+25.00+8.33 = 50.00 exato (sem resíduo) ✓
```

### Scenario 6: Item sem vDesc dentro de NF com path "ITEM"
```
Given: NF com 2 itens; item 1 traz vDesc=10.00, item 2 não traz o campo vDesc
When: nfeEntradaProdutos.processarNf(...)
Then:
  - temItemComVDesc = true (por causa do item 1) → TIPO_DESCONTO="ITEM" para AMBOS
  - Item 1: VALOR_DESCONTO_ITEM=10.00
  - Item 2: VALOR_DESCONTO_ITEM=0.00 (não rateado, path já é "ITEM" pra NF toda)
```

## Fora de Escopo

- Recalcular ICMS/PIS/COFINS/IBS/CBS com base no valor líquido (tributos
  continuam calculados sobre `vBC`/`vProd`, conforme já definido em
  `nfe-entrada-produtos.md`).
- Ajustar `PRODUTOS_JSON` de NFes já sincronizadas antes desta spec (sem
  reprocessamento retroativo automático — se necessário, feature futura).
- Integração direta com `PricingService` (esta spec só disponibiliza
  `VALOR_UNITARIO_LIQUIDO`; o consumo por `PricingService` é feature futura).
- Descontos aplicados após a emissão da NFe (notas de crédito, abatimentos
  contratuais) — fora do escopo de parsing de XML.

## Dependências

### Services
- `NFeEntradaProdutosService` — estende `processarNf` para calcular os novos campos
- `NFeEntradaService` — estende `parseXml` para capturar `vDesc`/`vOutro` por
  item em `PRODUTOS_JSON`, e `valorProdutos`/`valorOutros` no cabeçalho
- `LoggingService` — logar warnings de reconciliação

### Specs relacionadas (amendments necessários)
- `specs/nfe-entrada.md`: `PRODUTOS_JSON` passa a incluir `vDesc`/`vOutro` por
  item (opcionais, default 0); cabeçalho `NFE_ENTRADA` ganha colunas
  `VALOR_PRODUTOS` e `VALOR_OUTROS`
- `specs/nfe-entrada-produtos.md`: `NFE_ENTRADA_PRODUTOS` ganha colunas
  `VALOR_DESCONTO_ITEM`, `TIPO_DESCONTO`, `VALOR_OUTROS_ITEM`, `TIPO_OUTROS`,
  `VALOR_LIQUIDO_ITEM`, `VALOR_UNITARIO_LIQUIDO`

## Notas de Implementação

### Novas colunas em NFE_ENTRADA (adicionar ao FINAL do cabeçalho existente)
Nunca inserir no meio — quebraria a posição das colunas já em produção
(NFe 647, 688, 731, 805696 já sincronizadas). Adicionar sempre ao final:
```
... | PROCESSADA_EM | VALOR_PRODUTOS | VALOR_OUTROS
```
| Campo | Formato | Descrição |
|-------|---------|-----------|
| VALOR_PRODUTOS | number, 2 casas | Soma de `vProd` de todos os itens (bruto, sem desconto) |
| VALOR_OUTROS | number, 2 casas | `vOutro` do `ICMSTot` (despesas acessórias da nota) |

### Novas colunas em NFE_ENTRADA_PRODUTOS (adicionar ao FINAL do cabeçalho existente)
```
... | LOG_ID | VALOR_DESCONTO_ITEM | TIPO_DESCONTO | VALOR_OUTROS_ITEM | TIPO_OUTROS | VALOR_LIQUIDO_ITEM | VALOR_UNITARIO_LIQUIDO
```
| Campo | Formato | Descrição |
|-------|---------|-----------|
| VALOR_DESCONTO_ITEM | number, 2 casas | Desconto atribuído a este item (direto ou rateado) |
| TIPO_DESCONTO | string | "ITEM" \| "RATEADO" \| "NENHUM" |
| VALOR_OUTROS_ITEM | number, 2 casas | Despesas acessórias atribuídas a este item (direto ou rateado) |
| TIPO_OUTROS | string | "ITEM" \| "RATEADO" \| "NENHUM" |
| VALOR_LIQUIDO_ITEM | number, 2 casas | Custo real: `VALOR_TOTAL - VALOR_DESCONTO_ITEM + VALOR_OUTROS_ITEM` |
| VALOR_UNITARIO_LIQUIDO | number, 2 casas | `VALOR_LIQUIDO_ITEM / QUANTIDADE` — custo unitário real |

### Pseudocódigo de `processarNf` (trecho a adicionar)
```javascript
function processarNf(params) {
  var nf = NFeEntradaRepository.getByNumeroNf(params.numeroNf);
  var itens = parseProdutosJson(nf.produtosJson);
  var vProdTotalNota = itens.reduce(function(s, i) { return s + i.vProd; }, 0);
  var temItemComVDesc = itens.some(function(i) { return 'vDesc' in i; });
  var temItemComVOutro = itens.some(function(i) { return 'vOutro' in i; });

  var somaDesconto = 0, somaOutros = 0;
  itens.forEach(function(item, idx) {
    var isUltimo = (idx === itens.length - 1);
    var rateio = NFeEntradaProdutosService.calcularRateioItem({
      item: item,
      vProdTotalNota: vProdTotalNota,
      vDescNota: nf.valorDesconto,
      vOutroNota: nf.valorOutros,
      temItemComVDesc: temItemComVDesc,
      temItemComVOutro: temItemComVOutro,
      isUltimoItem: isUltimo,
      somaParcialDesconto: somaDesconto,
      somaParcialOutros: somaOutros
    });
    somaDesconto += rateio.valorDescontoItem;
    somaOutros += rateio.valorOutrosItem;
    // ... escreve linha em NFE_ENTRADA_PRODUTOS com os campos de `rateio` ...
  });

  // Validação de reconciliação (Regra de Negócio 5)
  if (Math.abs(somaDesconto - nf.valorDesconto) > 0.01 ||
      Math.abs(somaOutros - nf.valorOutros) > 0.01) {
    LoggingService.log({
      service: 'nfeEntradaProdutos', action: 'processarNf', status: 'ERROR',
      summary: 'Reconciliacao de rateio nao fechou para NF ' + params.numeroNf,
      context: {somaDesconto: somaDesconto, valorDescontoNf: nf.valorDesconto,
                somaOutros: somaOutros, valorOutrosNf: nf.valorOutros}
    });
  }
}
```

### Extensão de `PRODUTOS_JSON` (amendment em nfe-entrada.md)
Exemplo com os novos campos opcionais:
```json
[{"cProd":"0000000006231","xProd":"Maison Delilah","NCM":"33030010","CFOP":"5102",
  "qCom":2,"vUnCom":180,"vProd":360,"vDesc":54.00,"aliquotaIcms":"18.0000"}]
```
Se o item não tiver desconto/despesa no XML, o campo simplesmente não aparece
(não gravar `vDesc:0` artificialmente — a ausência do campo é o sinal usado
por `temItemComVDesc`/`temItemComVOutro` para decidir o path).
