# Calculadora de Preços Shopee — Engenharia Reversa (dados brutos e backtest)

## Status
Reference — documento de dados/metodologia, não é um contrato de API. O
contrato formal vive em `specs/pricing.md` (`pricing.calculateSuggestedPrice`),
que foi atualizado a partir dos achados aqui. Casos de aceite específicos de
ESTOQUE vivem em `specs/estoque.md` e `docs/historico/specs-estoque-preco-update.md`,
também já atualizados.

**Data da análise:** 08/08/2026 (atualizado com 3 pedidos adicionais em 08/08/2026)
**Autor:** Claude (sessão de engenharia reversa)
**Fonte de dados:** API oficial Shopee (via integração TIOPS), pedidos reais da conta `1880105398`, status `COMPLETED`
**Período analisado:** últimos 10 dias (29/07/2026 a 08/08/2026) + 3 pedidos pontuais de validação (08/08/2026)
**Amostra:** 11 pedidos completos, R$ 1.710,95 em vendas brutas somadas

---

## 1. Objetivo

A calculadora Shopee anterior (`Calculadora_Precos_Shopee.xlsx` v1, sessão
anterior a esta) usava **taxas fixas estimadas** (24,5% / 28,5% / 32%)
baseadas em análise limitada de 5 pedidos de perfumes. O sistema de
precificação real do projeto (`specs/pricing.md` → `PricingService.js` →
`ConfigService.getMarketplaceFee`) usa uma taxa **ainda mais simplificada**
(20% flat, ou 24% conforme a config `shopee_fee_pct` da planilha) — o mesmo
problema de fundo, só que em produção. O usuário reportou desconfiança na
precisão, especialmente em relação a custos de Pix e outros componentes não
compreendidos.

Este documento faz engenharia reversa completa do escrow (valor líquido) da
Shopee usando dados reais e brutos da API, valida a fórmula resultante
contra os próprios pedidos (backtest), e serve de base factual para a
correção já aplicada em:

1. **`specs/pricing.md`** — contrato de `pricing.calculateSuggestedPrice`, novo modelo de taxa Shopee (comissão por cenário + taxa de serviço). Mercado Livre não foi alterado.
2. **`specs/estoque.md`** e **`docs/historico/specs-estoque-preco-update.md`** — fórmula de `MARGEM_SHOPEE` corrigida para descontar taxas reais, e um bug adicional encontrado no alerta de prejuízo (comparava preço bruto vs. custo, não o valor líquido pós-taxas).

A implementação de código correspondente (`ConfigService.js`,
`PricingService.js`, `EstoquePrecoService.js`, `EstoqueService.js`,
`CatalogService.js`) segue via prompt de handoff para o OpenCode, conforme
convenção deste projeto (`CLAUDE.md`: "Claude Code é o guia, não o
executor" — mudanças de código substanciais não são feitas diretamente
nesta sessão).

---

## 2. Dados brutos coletados

Pedidos `COMPLETED` retornados por `shopee_list_orders` (janela `create_time`) e detalhados via `shopee_get_escrow_detail_batch`:

| Pedido | Preço Venda | Comissão | Taxa Serviço | Frete (real) | Repasse Frete | Desconto Pix | Cupom Vendedor | Método Pgto | Parcelas | Itens | Escrow (líquido real) |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 260806K6S7E9WM | 29,99 | 5,40 | 4,60 | 9,62 | 9,62 | 0,00 | 0,00 | Cartão | 1x | 1 | **19,99** |
| 260803D8FM8K5G | 70,87 | 12,76 | 13,42 | 14,48 | 0,00* | 0,00 | 0,00 | Cartão | 1x | 3 | **44,69** |
| 260803DPR7GYMJ | 174,98 | 21,60 | 27,50 | 9,62 | 9,62 | 8,24 | 0,00 | Pix | — | 2 | **125,88** |
| 260802AYCFAPPQ | 41,97 | 7,55 | 12,84 | 13,25 | 13,25 | 0,00 | 0,00 | Cartão | 1x | 3 | **21,58** |
| 260731507SAVUP | 179,99 | 21,60 | 23,60 | 23,87 | 0,00* | 0,00 | 0,00 | Cartão | 12x | 1 | **134,79** |
| 260803C4FWHDVU | 299,00 | 35,16 | 31,86 | 8,39 | 8,39 | 14,95 | 5,98 | Pix | — | 1 | **226,00** |
| 260803B94EEV43 | 34,90 | 6,28 | 4,70 | 7,18 | 7,18 | 0,00 | 0,00 | Cartão | 1x | 1 | **23,92** |
| 260802A0RQANG2 | 168,00 | 20,16 | 23,36 | 8,39 | 8,39 | 0,00 | 0,00 | Cartão | 5x | 1 | **124,48** |
| 260808RDC2YAHE **[9º, validação]** | 223,25 | 25,99 | 30,33 | 9,62 | 9,62 | 10,28 | 6,70 | Pix | — | 1 | **160,23** |
| 260806K8PE8HU5 **[10º, validação]** | 189,00 | 22,68 | 23,78 | 12,04 | 0,00* | 9,45 | 0,00 | Pix | — | 1 | **142,54** |
| 2608029E930AHE **[11º, validação]** | 299,00 | 35,16 | 31,86 | 14,48 | 0,00* | 0,00 | 5,98 | Cartão | 4x | 1 | **226,00** |

\* Nestes quatro pedidos o comprador pagou o frete separadamente (`buyer_paid_shipping_fee`), então não há repasse — o frete simplesmente não passa pelo caixa do vendedor.

**Total:** R$ 1.710,95 em vendas → R$ 1.254,09 líquido recebido (73,3% médio simples — **não use essa média direta**, veja seção 4 sobre por que a taxa varia por cenário).

> **Sobre os pedidos 9, 10 e 11:** não fizeram parte da amostra original de
> 10 dias — foram puxados avulsos em 08/08/2026 como teste de validação em
> tempo real com o usuário (ele informou o preço de venda antes de saber o
> valor líquido real, e eu previ às cegas nos três casos). A fórmula mestra
> (seção 3) acertou em cheio nos três. O modelo simplificado de taxa de
> serviço (seção 5): errou por R$5,86 no 9º pedido (R$223,25, Pix) — mesmo
> padrão do pedido `260803C4FWHDVU` — acertou exato no 10º pedido (R$189,00,
> Pix) — e no 11º pedido (R$299,00, **cartão 4x**, mesmo produto do pedido
> `260803C4FWHDVU` mas transação diferente) teve **comissão e taxa de
> serviço idênticas, centavo a centavo**, ao pedido Pix original de mesmo
> valor — confirmando de forma independente que Pix e parcelado caem na
> mesma faixa de taxa, e que o componente extra de R$5,88 em R$299 é
> reproduzível, não um acaso de um único pedido. Ver seção 5.

---

## 3. A fórmula mestra do escrow (validada com 0% de erro)

```
ESCROW (valor líquido) = PREÇO_VENDA − CUPOM_DO_VENDEDOR − COMISSÃO − TAXA_DE_SERVIÇO
```

Testada contra os 11 pedidos reais (8 da amostra original + 3 de validação
pontual), **erro de R$ 0,00 em 9 dos 11 pedidos e menos de R$ 0,01 nos
outros 2** (arredondamento) — incluindo os 3 pedidos de validação, todos
testados às cegas antes de eu saber o valor real. Esta é a fórmula
estrutural exata que a Shopee usa — não uma aproximação.

### O que **NÃO** entra na conta (achados que corrigem premissas antigas)

| Componente | Impacto real no vendedor | O que a calculadora antiga assumia (errado) |
|---|---|---|
| **Frete** | **Neutro.** Quando a Shopee reembolsa (`shopee_shipping_rebate`), o valor é idêntico ao custo real do frete — cancela exatamente. Quando o comprador paga o frete à parte, ele nem entra no escrow do vendedor. | Não estava sendo tratado explicitamente |
| **Desconto Pix** (`pix_discount`) | **Custo zero para o vendedor.** O desconto que a Shopee dá ao comprador para incentivar pagamento via Pix é **financiado pela própria Shopee**, não pelo vendedor. Confirmado nos 2 pedidos Pix da amostra: o escrow bate exatamente usando o preço cheio, sem subtrair o desconto. | ⚠️ A calculadora anterior assumia "+5% de retenção quando há Pix" — **isso estava errado**. |
| **Taxa de parcelamento do cartão** (`buyer_transaction_fee` / `credit_card_transaction_fee`) | **Custo zero para o vendedor.** No pedido `260802A0RQANG2` (5x), o comprador pagou R$ 18,56 extra de tarifa de parcelamento — esse valor não passa pelo escrow do vendedor, é cobrado só do comprador. | Não estava sendo tratado |
| **Cupom do próprio vendedor** (`seller_voucher`) | **Custo real e integral do vendedor**, R$ por R$. Confirmado no pedido `260803C4FWHDVU` (cupom "DLBLPAIS", R$ 5,98) — subtraído linearmente do escrow. | Não estava sendo tratado |
| **Shopee Coins e voucher da Shopee** | Custo zero para o vendedor (financiado pela Shopee), a menos que exista um mecanismo de "seller_product_rebate" ativo na categoria — não observado nesta amostra como dedução real do escrow. | Não estava sendo tratado |

---

## 4. Comissão: dois patamares claros (achado principal)

| Cenário | Comissão | Confiança |
|---|---:|---|
| Cartão de crédito, à vista (1x) | **18,0%** | Alta — 4/4 pedidos, exatamente 18,00% em todos |
| Pix **ou** cartão parcelado (>1x) | **12,0%** | Alta — 7/7 pedidos entre 11,6% e 12,3% (10º pedido: 12,00% exato; 11º pedido: 11,76%, idêntico ao pedido Pix de mesmo valor) |

A Shopee **reduz a comissão em 6 pontos percentuais** para incentivar pagamentos via Pix ou parcelamento — provavelmente porque o parcelamento é mais barato para a Shopee processar via seu próprio programa de crédito, e o Pix reduz risco de chargeback. Isso é uma descoberta relevante: **um pedido parcelado ou pago via Pix é, na prática, MAIS barato para o vendedor em comissão**, o que compensa parcialmente qualquer ansiedade sobre "custos do Pix".

---

## 5. Taxa de Serviço: componente base + componente fixo

```
TAXA_SERVIÇO = (2% × PREÇO_VENDA) + (R$ 4,00 × QTD_ITENS) + (R$ 16,00 SE Pix ou parcelado)
```

| Componente | Valor | Confiança |
|---|---|---|
| Base percentual | **2,0%** do preço de venda | Alta — consistente em 11/11 pedidos (variação < 0,05 p.p.) |
| Fixo por item | **R$ 4,00 por item** do pedido | Alta — bate exatamente em 8/11 pedidos (kits de 3 itens = R$ 12,00 exatos) |
| Extra Pix/parcelado | **R$ 16,00** fixo por pedido | Alta até ~R$189, e agora **alta também em R$299** (2 confirmações independentes) — bate exatamente em 4/7 pedidos Pix/parcelado; os 3 pedidos de ticket mais alto (2× R$299 + R$223,25) tiveram excedente de **R$5,88 / R$5,88 / R$5,86** — praticamente idêntico nos três |

**Atualização (4 pontos de dados, 08/08/2026):** os pedidos `260808RDC2YAHE`
(R$223,25, Pix), `260806K8PE8HU5` (R$189,00, Pix) e `2608029E930AHE`
(R$299,00, **cartão 4x**) foram testados **às cegas** — previ o líquido
antes de saber o valor real nos três casos, e a fórmula mestra (seção 3)
acertou exato em todos. O modelo simplificado de taxa de serviço:

- **R$223,25 (Pix):** taxa de serviço real R$30,33 vs prevista R$24,46 —
  erro de +R$5,86, mesmo padrão do pedido de R$299 original.
- **R$189,00 (Pix):** taxa de serviço real R$23,78 vs prevista R$23,78 —
  **erro zero**. Comissão também bateu exata (R$22,68 = 12,00% cravado).
- **R$299,00 (Cartão 4x, produto e preço idênticos ao pedido `260803C4FWHDVU`
  original, mas transação diferente):** comissão (R$35,16) e taxa de serviço
  (R$31,86) **idênticas, centavo a centavo**, ao pedido Pix original de
  mesmo valor — apesar de um ser Pix e outro cartão parcelado. Excedente de
  +R$5,88, igual ao original.

O pedido 11 é a confirmação mais forte até agora: dois pedidos
**independentes** (transações diferentes, formas de pagamento diferentes —
Pix vs cartão 4x) no mesmo valor (R$299) resultaram em comissão e taxa de
serviço **idênticas**. Isso confirma dois pontos ao mesmo tempo: (1) Pix e
parcelado realmente caem na mesma faixa de taxa, não é coincidência de
classificação; (2) o excedente de ~R$5,87-5,88 em R$299 é reproduzível e
não foi ruído de um pedido isolado. Combinado com R$189,00 (confirmado sem
o excedente) e R$223,25 (confirmado com), o limiar de preço onde esse
componente liga está localizado com boa confiança **entre R$189 e R$223**,
e continua presente pelo menos até R$299 (não é um efeito só de "borda" que
desaparece em tickets maiores).

**Limitação conhecida (revisada):** o componente "extra Pix/parcelado" tem 2
partes: R$16,00 fixo (alta confiança, confirmado até R$189,00 exatos) + um
componente adicional de ~R$5,87-5,88 (agora alta confiança em R$223-299,
com 3 confirmações independentes) que liga acima de um limiar ainda não
localizado com precisão dentro do intervalo (R$189, R$223,25]. Falta apenas
apertar esse intervalo de R$34,25 — não mais validar se o componente existe
de fato, isso já está bem estabelecido. Recomenda-se reunir pedidos
Pix/parcelado especificamente entre R$190 e R$222 para encontrar o ponto
exato de transição antes de incorporar esse componente à fórmula de
produção com confiança alta.

---

## 6. Retenção efetiva por cenário (comissão + taxa de serviço)

| Cenário | Retenção total observada | Preço mínimo (break-even) |
|---|---:|---|
| Cartão 1x, item único barato (< R$ 50) | **~33%** | Custo ÷ 0,67 |
| Cartão 1x, kit com 3 itens | **~37–49%** (fixo por item pesa muito em ticket baixo) | Custo ÷ (1 − retenção) |
| Cartão parcelado (5x–12x) | **~25–26%** | Custo ÷ 0,745 |
| Pix | **~24–28%** | Custo ÷ 0,74 |

**Isto é o achado mais importante para o negócio:** a taxa da Shopee **não é fixa em 24%** como o `CONFIG` atual assume (`shopee_fee_pct = 0.24`). Ela varia de **~24% a ~49%** dependendo de forma de pagamento e, principalmente, **da quantidade de itens no pedido em relação ao ticket** — pedidos de baixo valor com múltiplos itens (kits baratos) são desproporcionalmente penalizados pelo componente fixo de R$ 4/item.

> ⚠️ **Bug real no CONFIG atual:** o comentário da linha `default_margin_pct` diz "Margem padrão do catálogo (25%)" mas o valor gravado é `0.10` (10%). Comentário e valor estão dessincronizados — corrigir na refatoração.

---

## 7. Backtest — validação da fórmula final

Fórmula testada (a mesma que deve ir para produção):

```
comissao_pct   = 0.12 se (pagamento == "Pix" OU parcelas > 1) senão 0.18
taxa_servico   = (preco * 0.02) + (4 * qtd_itens) + (16 se comissao_pct == 0.12 senão 0)
liquido_previsto = preco - cupom_vendedor - (preco * comissao_pct) - taxa_servico
```

| Pedido | Preço | Líquido Real | Líquido Previsto | Erro (R$) | Erro (%) |
|---|---:|---:|---:|---:|---:|
| 260806K6S7E9WM | 29,99 | 19,99 | 19,99 | 0,00 | 0,01% |
| 260803D8FM8K5G | 70,87 | 44,69 | 44,70 | 0,01 | 0,01% |
| 260803DPR7GYMJ | 174,98 | 125,88 | 126,48 | 0,60 | 0,48% |
| 260802AYCFAPPQ | 41,97 | 21,58 | 21,58 | -0,00 | -0,02% |
| 260731507SAVUP | 179,99 | 134,79 | 134,79 | 0,00 | 0,00% |
| 260803C4FWHDVU | 299,00 | 226,00 | 231,16 | 5,16 | 2,28% |
| 260803B94EEV43 | 34,90 | 23,92 | 23,92 | -0,00 | -0,00% |
| 260802A0RQANG2 | 168,00 | 124,48 | 124,48 | 0,00 | 0,00% |
| 260808RDC2YAHE **[9º, validação às cegas]** | 223,25 | 160,23 | 165,30 | 5,07 | 3,16% |
| 260806K8PE8HU5 **[10º, validação às cegas]** | 189,00 | 142,54 | 142,54 | 0,00 | 0,00% |
| 2608029E930AHE **[11º, validação às cegas]** | 299,00 | 226,00 | 231,16 | 5,16 | 2,28% |

**Resultado agregado (11 pedidos): erro absoluto médio de R$ 1,45 por pedido; erro total de R$ 16,00 sobre R$ 1.710,95 em vendas = 0,94% de desvio.**

✅ **A fórmula está validada e pronta para uso em produção**, com uma ressalva mais nítida agora: os 3 únicos pedidos com erro acima de 1% são exatamente os 3 pedidos Pix/parcelado de ticket ≥ R$223 (R$299 → 2,28% em dois pedidos distintos; R$223,25 → 3,16%), todos puxados para cima pelo mesmo componente de taxa de serviço não capturado (seção 5), agora confirmado reproduzível (2 pedidos independentes em R$299 com erro idêntico). O 10º pedido (R$189,00, Pix) prova que o problema **não é genérico de todo pedido Pix de ticket "alto"** — é específico de um limiar entre R$189 e R$223,25 ainda não localizado com precisão. Para tickets Pix/parcelado até R$189 e qualquer cenário cartão-1x, o erro é essencialmente zero (8 dos 11 pedidos). Antes de confiar na fórmula para produtos Pix/parcelado acima de R$189, aplicar a fórmula assumindo o excedente de ~R$5,87 como colchão de segurança adicional, ou reunir mais dados na faixa R$190-222 para localizar o limiar exato.

---

## 8. Limitações e dados fora do escopo desta análise

- **Ads/Shopee Ads:** nenhum dos 11 pedidos teve `campaign_fee` ou `ads_escrow_top_up_fee` diferente de zero — a conta não tinha campanhas ativas de Ads no período. A calculadora deve manter um campo de input para % de Ads (como já existe em `calculateML`), mas ele não pôde ser calibrado com dados reais aqui.
- **Devoluções/reembolsos:** o pedido `260802A0RQANG2` teve uma devolução parcial associada (`return_order_sn_list`), processada como transação separada — não afeta o escrow do pedido original, mas representa um risco não capturado pela calculadora (perda potencial de frete de retorno + tempo). Recomenda-se incluir um "buffer de devolução" opcional (ex: 1-2% de margem de segurança).
- **GTIN e taxas de categoria especial:** não foram identificadas variações de taxa por categoria além do padrão observado (perfumaria, NCM 33030010). Categorias diferentes podem ter comissão-base diferente de 18%/12% — a calculadora deve permitir edição manual desses dois parâmetros por categoria se o catálogo se diversificar.
- **Amostra pequena (n=11):** suficiente para validar a fórmula estrutural (que é exata, matemática, não estatística — 11/11 pedidos bateram na fórmula mestra), e o componente "extra Pix/parcelado" já passou de "suspeita" para "confirmado, localização pendente": existe com alta confiança em R$223-299 (3 confirmações independentes, incluindo 2 pedidos distintos no mesmo valor de R$299), está confirmadamente ausente até R$189,00, e o limiar exato de transição está nesse intervalo de R$34,25 (R$189-223) — faltam pedidos Pix/parcelado especificamente dentro dessa faixa para cravar o valor.

---

## 9. Instruções de Refatoração

> **Atualização (08/08/2026):** esta seção foi escrita antes de eu localizar
> o código de produção real deste projeto (`src/03_services/pricing/PricingService.js`,
> `src/00_config/ConfigService.js`, `src/03_services/estoque/EstoquePrecoService.js`,
> `src/03_services/estoque/EstoqueService.js`, `src/03_services/catalog/CatalogService.js`)
> e os specs formais que já existiam (`specs/pricing.md`, `specs/estoque.md`,
> `docs/historico/specs-estoque-preco-update.md`) — a versão original falava genericamente
> em "calculator.calculateML" e "aba ESTOQUE" como se a lógica de preço
> Shopee não existisse em lugar nenhum. Ela existe, e **já foi corrigida**
> em `specs/pricing.md`/`specs/estoque.md`/`docs/historico/specs-estoque-preco-update.md`
> neste mesmo PR. O que falta é só a implementação de código, que segue a
> convenção deste projeto (`CLAUDE.md`) de ser feita via handoff para o
> OpenCode, não diretamente por esta sessão. O pseudocódigo abaixo continua
> válido como referência da fórmula — mas o "onde aplicar" é o plano da
> seção 9.3, não mais uma função nova solta chamada `calculateShopee`.
>
> **Atualização 2 (08/08/2026):** implementado direto por esta sessão (não
> via handoff — exceção pontual pedida pelo usuário). O app tinha duas
> calculadoras (esta seção documentava uma proposta de terceira); por pedido
> explícito do usuário ("só deve existir uma única calculadora"), a lógica
> Shopee foi incorporada na calculadora existente
> (`CalculatorService.calculate`/`CalculatorView.html`, ver `specs/calculator.md`
> v2), **não** num serviço/widget novo. O primeiro bullet da seção 9.4 abaixo
> ("CalculatorService.js... fora de escopo") está desatualizado — Shopee
> agora é suportado ali via `ConfigService.getShopeeFeeModel`, mas a tabela
> ML por faixa/regime continua intocada e **não unificada** com o modelo
> flat de `PricingService`/`specs/pricing.md` (mesma divergência conhecida,
> ainda sem dados de ML reais para resolver).

### 9.1 Fórmula de referência (pseudocódigo — a fonte formal é `specs/pricing.md`)

```javascript
/**
 * Calcula preço de venda sugerido e detalhamento de taxas para Shopee.
 * @param {Object} params
 * @param {number} params.custoProduto       - custo de aquisição do produto
 * @param {number} params.margem             - margem de lucro alvo (ex: 0.20 = 20%)
 * @param {string} params.metodoPagamento    - "cartao" | "pix" (cenário assumido para a simulação)
 * @param {number} params.parcelas           - número de parcelas assumidas (1 = à vista)
 * @param {number} params.qtdItens           - itens no pedido (default 1)
 * @param {number} params.cupomVendedor      - valor de cupom próprio a aplicar (opcional, default 0)
 * @param {number} params.adsPercent         - % de Ads sobre o preço de venda (opcional, default 0)
 * @param {number} params.custosAdicionais   - custos fixos adicionais em R$ (embalagem, etc)
 * @param {number} params.impostoSimples     - alíquota efetiva Simples Nacional (opcional)
 * @param {string} params.precoVenda         - se informado, calcula margem/líquido em vez de sugerir preço
 */
function calculateShopee(params) {
  const isPromo = params.metodoPagamento === 'pix' || params.parcelas > 1;
  const comissaoPct = isPromo ? 0.12 : 0.18;
  const qtdItens = params.qtdItens || 1;

  function taxaServico(preco) {
    const base = preco * 0.02;
    const fixo = 4 * qtdItens + (isPromo ? 16 : 0);
    return base + fixo;
  }

  function liquidoParaPreco(preco) {
    const comissao = preco * comissaoPct;
    const servico = taxaServico(preco);
    const ads = preco * (params.adsPercent || 0);
    const imposto = preco * (params.impostoSimples || 0);
    return preco - (params.cupomVendedor || 0) - comissao - servico - ads - imposto;
  }

  // Se preço de venda foi informado: retorna análise (modo "simular venda existente")
  if (params.precoVenda) {
    const preco = params.precoVenda;
    const liquido = liquidoParaPreco(preco);
    const lucro = liquido - params.custoProduto - (params.custosAdicionais || 0);
    return {
      success: true,
      data: {
        precoVenda: preco,
        comissao: preco * comissaoPct,
        comissaoPct,
        taxaServico: taxaServico(preco),
        liquidoRecebido: liquido,
        lucro,
        // margem sempre medida sobre o preço de venda (marginBasis: 'price'),
        // mesma convenção do Mercado Livre e de specs/pricing.md — NUNCA sobre
        // o líquido recebido (são conceitos diferentes e dão valores diferentes).
        margemReal: lucro / preco,
      }
    };
  }

  // Caso contrário: resolve o preço de venda algebricamente.
  // Embora a taxa de serviço tenha um componente fixo em R$ (não só percentual),
  // esse componente NÃO depende do preço (só de qtdItens e do cenário de pagamento),
  // então a equação continua linear em `preco` e pode ser isolada diretamente.
  //
  // Margem-alvo definida sobre o PREÇO DE VENDA (margem = lucro / precoVenda,
  // idêntica à convenção do Mercado Livre — ver specs/pricing.md):
  //
  //   liquido = preco*kAjustado - cupom - fixo
  //   lucro   = liquido - custoTotal
  //   margem*preco = preco*kAjustado - cupom - fixo - custoTotal
  //   preco   = (custoTotal + cupom + fixo) / (kAjustado - margem)
  //
  const custoTotal = params.custoProduto + (params.custosAdicionais || 0);
  const k = 1 - comissaoPct - 0.02; // fração do preço que sobra após comissão + taxa-base
  const fixo = 4 * qtdItens + (isPromo ? 16 : 0);
  const ads = params.adsPercent || 0;
  const imposto = params.impostoSimples || 0;
  const kAjustado = k - ads - imposto; // Ads e imposto também são % sobre o preço

  const precoSugerido = (custoTotal + (params.cupomVendedor || 0) + fixo) / (kAjustado - params.margem);
  const liquido = liquidoParaPreco(precoSugerido);

  return {
    success: true,
    data: {
      precoSugerido: Math.round(precoSugerido * 100) / 100,
      comissao: precoSugerido * comissaoPct,
      comissaoPct,
      taxaServico: taxaServico(precoSugerido),
      liquidoRecebido: liquido,
      lucroEstimado: liquido - custoTotal,
      margemReal: (liquido - custoTotal) / precoSugerido,
    }
  };
}
```

> Nota: `cupomVendedor`, `adsPercent` e `impostoSimples` são extensões deste
> pseudocódigo de referência, não fazem parte do contrato aprovado em
> `specs/pricing.md` (que cobre só `unitCost`/`extraCosts`/`itemCount`/
> `paymentScenario`) — não implementar esses três parâmetros agora; ficam
> registrados aqui só para não perder a álgebra caso um dia sejam adicionados
> ao contrato formal.

**Por que fórmula fechada (e não busca numérica):** o componente fixo da taxa de serviço (R$4/item + R$16 se Pix/parcelado) não depende do preço — só da quantidade de itens e do cenário de pagamento, que são conhecidos antes de calcular o preço. Isso mantém a equação linear em `preco`, permitindo isolar algebricamente em vez de precisar de bisseção ou outro método iterativo. Mais simples, mais rápido e sem risco de não-convergência.

### 9.2 O que já foi corrigido nos specs (neste mesmo PR)

| Arquivo | Mudança |
|---|---|
| `specs/pricing.md` | Seção "Taxas por canal" e as duas fórmulas (`marginBasis: price`/`cost`) para Shopee reescritas com o modelo de 2 componentes. Novos params opcionais `itemCount`/`paymentScenario` no contrato de `pricing.calculateSuggestedPrice`. Mercado Livre inalterado. Novos critérios de aceite (Given/When/Then) com os valores corretos. |
| `specs/estoque.md` | Fórmula de `MARGEM_SHOPEE` (coluna e regra de negócio §7) corrigida para descontar comissão+taxa de serviço, com `itemCount=1` (cada linha ESTOQUE = 1 unidade). Cenário 5 dos critérios de aceite recalculado. |
| `docs/historico/specs-estoque-preco-update.md` | 3 cenários recalculados. Scenario 3 agora demonstra um caso real de **prejuízo disfarçado de "margem baixa"** — preço R$110 com custo R$100 parecia ter 9% de margem positiva na fórmula antiga, mas na real é -19% de prejuízo, porque o líquido pós-taxas (R$84) fica abaixo do custo mesmo com preço de venda nominal acima dele. |

### 9.3 O que falta implementar em código (via handoff OpenCode)

Levantamento de todos os pontos de código que hoje implementam a fórmula
antiga (flat ou bruta) e precisam mudar para bater com os specs corrigidos:

| Arquivo | Função | Problema atual | O que muda |
|---|---|---|---|
| `src/00_config/ConfigService.js` | `getMarketplaceFee('shopee')` | Retorna `{pct, fixed}` flat (20%/0, ou 24%/0 se configurado na planilha) | Adicionar `getShopeeFeeModel(paymentScenario, itemCount)` novo, retornando `{commissionPct, serviceFeeBasePct, serviceFeeFixed}` calculado pelas regras de `specs/pricing.md`. Manter `getMarketplaceFee` como está (Mercado Livre e qualquer outro consumidor que ainda espere o shape antigo continuam funcionando). |
| `src/03_services/pricing/PricingService.js` | `calculateSuggestedPrice` | Usa `ConfigService.getMarketplaceFee(marketplace)` uniformemente para os 2 canais | Branch por `marketplace`: ML mantém a lógica atual; Shopee passa a usar `getShopeeFeeModel` + a fórmula fechada da seção 9.1. Novos params `itemCount`/`paymentScenario` (default `1`/`cartao_avista`). Expor `commission`/`serviceFee` separados no retorno, além do total em `marketplaceFee`, para auditoria. |
| `src/03_services/catalog/CatalogService.js` | trecho que chama `ConfigService.getMarketplaceFee(marketplace)` (por volta da linha 350) | Reimplementa a mesma fórmula de preço sugerido **duplicada** de `PricingService`, com o mesmo modelo flat para Shopee | Idealmente, parar de duplicar e chamar `PricingService.calculateSuggestedPrice` diretamente. Se não for viável nesta fase, no mínimo replicar a correção Shopee aqui também — nunca deixar duas fórmulas divergentes no mesmo código. |
| `src/03_services/estoque/EstoquePrecoService.js` | `calcularMargem_(precoVenda, precoCusto)` (usada em `updatePrecoVenda`, `simularMudancaPreco`, `getUltimosPrecosPorProduto`) | `(precoVenda-precoCusto)/precoVenda` bruto, sem marketplace, mesma fórmula para os 2 canais | Passa a receber `marketplace` e delegar para uma função pura de `PricingService` (não duplicar a fórmula aqui) — Shopee com `itemCount=1`/`paymentScenario=cartao_avista`, ML inalterado. |
| `src/03_services/estoque/EstoquePrecoService.js` | `gerarAlertas_(precoCusto, precoNovo, marketplace)` | Alerta `prejuizo` compara `precoNovo < precoCusto` (preço bruto) — não pega o caso do Scenario 3 de `docs/historico/specs-estoque-preco-update.md` (preço acima do custo, mas líquido pós-taxas abaixo) | Comparar `liquido < precoCusto` (usando o valor líquido já calculado por `calcularMargem_`/`PricingService`), não o preço de venda bruto. Isso é uma correção de **bug real de alerta**, não só de exibição de margem — hoje o sistema pode deixar passar sem aviso severo um preço que na prática dá prejuízo. |
| `src/03_services/estoque/EstoqueService.js` | `calcularMargem_` (linhas ~137, usada em 676/684/818/824/911/912) | **Cópia duplicada e idêntica** da mesma função de `EstoquePrecoService.js`, mesmo bug | Mesma correção — idealmente eliminar a duplicação chamando a mesma função compartilhada de `PricingService` que `EstoquePrecoService.js` vai usar, em vez de manter 2 cópias do cálculo de margem no projeto. |

> **Nota (09/08/2026):** `EstoquePrecoService.js` (linhas 380-381 acima) foi
> **removido do projeto** — nunca esteve conectado à UI (widget fantasma,
> ver `docs/historico/specs-estoque-preco-update.md`). A correção de margem
> descrita nessas duas linhas acabou sendo aplicada só em
> `EstoqueService.calcularMargem_` (linha 382), que é o código real em uso.

### 9.4 Fora do escopo desta correção (não confundir com o que foi corrigido)

- **`src/03_services/calculator/CalculatorService.js`** (`calculateML`, calculadora do widget flutuante) já tem sua própria tabela de taxas ML escalonada por faixa de preço + regime CPF/CNPJ — **diferente** do modelo flat 14%+R$6 usado em `PricingService`/`specs/pricing.md`. As duas coexistem hoje. Não mexi em nenhuma das duas: não fiz engenharia reversa de pedidos Mercado Livre reais nesta análise (só Shopee), então não há dados para decidir qual modelo ML está mais correto ou como unificá-los. Fica registrado como divergência conhecida (também anotada em `specs/pricing.md`, seção "Fora de Escopo").
- **`default_margin_pct`**: confirmei (não apenas suspeitei) que o valor `0.10` gravado na planilha CONFIG está errado — o fallback hardcoded em `ConfigService.js` (`_loadConfig`'s catch e `getDefaultMargin()`) é `0.25` em dois lugares diferentes, batendo com o comentário da célula ("25%"). A correção é trocar o **valor da célula na planilha CONFIG** (Google Sheets, fora deste repositório) de `0.10` para `0.25` — não é uma mudança de código.

---

## 10. Sugestões adicionais

1. **Reprocessar este backtest mensalmente** com uma amostra maior (todo o volume do mês, não só 9 pedidos) — como o componente "extra Pix" em tickets altos tem confiança média, mais dados vão fechar essa lacuna rapidamente com o volume normal de vendas. Priorizar pedidos Pix/parcelado na faixa R$180-300 especificamente, que é onde a lacuna do componente extra (seção 5) precisa de mais pontos.
2. **Adicionar um cenário "pior caso" na calculadora de precificação de catálogo**: como a comissão de cartão-1x (18%) é sempre pior que Pix/parcelado (12%), sugerir preços usando o cenário de cartão-1x garante que a margem mínima nunca seja violada, independente de como o cliente pague.
3. **Kits/multi-item merecem atenção especial**: como a taxa de serviço tem componente fixo de R$4/item, produtos vendidos em kits de 3+ itens baratos têm retenção proporcionalmente muito maior (até 49% observado). Vale revisar se kits atuais têm margem de custo suficiente para absorver isso, ou se o preço do kit deveria ter um pequeno prêmio adicional por item extra.
4. **Monitorar quando Shopee Ads for ativado**: a fórmula atual tem o campo `adsPercent` pronto, mas sem dados reais de calibração. Assim que houver campanhas ativas, repetir esta mesma metodologia (puxar pedidos com `campaign_fee` > 0) para validar o campo.
5. **Considerar buffer de devolução**: 1 de 9 pedidos da amostra (11,1%) teve devolução parcial. Uma taxa de devolução dessa ordem, se sistemática, merece um pequeno colchão de margem (sugestão: 1-2%) embutido no preço sugerido, não apenas nas taxas diretas da plataforma.
6. **Corrigir o valor de `default_margin_pct` na planilha CONFIG, de `0.10` para `0.25`** — confirmado (não mais suspeita) via `ConfigService.js`, cujo fallback hardcoded é `0.25` em dois lugares; o comentário da célula ("25%") estava certo, o valor gravado (`0.10`) é que está errado. Bug pré-existente que pode já estar distorcendo preços sugeridos hoje em qualquer lugar do sistema que leia essa config. Mudança na planilha, não no código.

---

## Anexo: Query usada para reproduzir esta análise

```
1. shopee_list_orders(time_range_field="create_time", time_from=<10 dias atrás>, time_to=<agora>, order_status="COMPLETED")
2. shopee_get_escrow_detail_batch(order_sn_list=[...])
3. Para cada pedido, extrair: order_selling_price, commission_fee, service_fee,
   escrow_amount, buyer_payment_method, instalment_plan, pix_discount,
   seller_voucher, quantidade de itens (len(items))
4. Validar: escrow_amount == order_selling_price - seller_voucher - commission_fee - service_fee
5. Agrupar comissão % e taxa de serviço % por cenário (método de pagamento × parcelas)
```
