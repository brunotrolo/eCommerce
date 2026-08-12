# Spec: Catalog (Catálogo)

## Status
Implemented

## Objetivo

Tela "Catálogo" que consolida, por código de produto com status `Recebido`,
as entradas de NF e manuais (estoque) e o preço sugerido por marketplace
(Shopee / Mercado Livre), usando o motor único de margem
(`PricingService`). Desde 11/08/2026 também expõe a **quantidade real
vendida** por produto, somando as saídas manuais registradas E as vendas
de pedidos Shopee pagos (aba PEDIDOS) — antes a coluna "Vendido" só
considerava `MANUAL_SAIDA_PRODUTOS`, mostrando 0 para produtos vendidos
apenas via marketplace.

## Contrato da API Interna

### `catalog.getProducts`
- Descrição: Retorna produtos únicos com status "Recebido", agrupados por `CODIGO_PRODUTO`, com preço sugerido para ambos os marketplaces e quantidade vendida consolidada.
- Params:

| nome | tipo | obrigatório | default | descrição |
|---|---|---|---|---|
| `targetMarginShopee` | number | não | 0.25 | Margem alvo Shopee (0–1) |
| `targetMarginMercadoLivre` | number | não | 0.25 | Margem alvo ML (0–1) |
| `sortBy` | string | não | `code` | `code`, `sku`, `categoria`, `description`, `unitCost`, `suggestedShopee` |
| `sortOrder` | string | não | `asc` | `asc`/`desc` |
| `forceFresh` | boolean | não | false | Ignora cache server e relê o Sheets |

- Retorno: `{ success, data: [produto...], totalCount, lastSync }`. Cada produto tem `codigoProduto, sku, categoria, descricaoProduto, estoqueDisponivel, quantidadeVendida, totalEntradas, valorUnitarioLiquido, dataEmissaoMaisRecente, emitenteMaisRecente, precoShopee, precoMercadoLivre, margemCalculadaShopee, margemCalculadaMercadoLivre`.

### `catalog.getProductByCode`
- Descrição: histórico de entradas de um código (NFs + manuais).
- Params: `codigoProduto` (string, obrigatório).
- Retorno: `{ success, data: [entrada...], count }`.

### `catalog.getCalculationMemory`
- Descrição: memória de cálculo passo a passo do preço sugerido.
- Params: `codigoProduto` (obrigatório), `marketplace` (obrigatório, `shopee`/`mercado_livre`), `targetMargin` (default 0.25).
- Retorno: `{ success, data: { codigoProduto, descricao, marketplace, passos, resumo } }`.

## Regras de Negócio

- **Quantidade vendida** (11/08/2026): `quantidadeVendida = soma(MANUAL_SAIDA_PRODUTOS.QUANTIDADE por CODIGO_PRODUTO) + soma(vendas de PEDIDOS ItemSkus por produto)`.
- **Venda de pedido = pedido que pagou.** Pedido com status `UNPAID`, `CANCELLED`/`CANCELADO`/`IN_CANCEL`, `TO_RETURN`/`RETURNED`/`DEVOLVIDO` **não conta** — mesma regra de baixa de estoque (pedido não pago, cancelado ou devolvido não baixa estoque; logo não é venda). PEDIDO pago com baixa `PENDENTE` (sem estoque) ainda conta como vendido, pois a venda ocorreu.
- **Resolução de SKU do pedido** para o código do produto:
  1. `SKU:qty` em `ITEM_SKUS` do pedido casa direto com o `SKU` do catálogo do produto.
  2. Se o SKU for numérico (item_id Shopee sem SKU pareado na origem), resolve via mapa `item_id → SKU` da aba `ANUNCIOS_SHOPEE` (`ProdutoSkuMapRepository.getItemSkuMap`) e então casa com o catálogo.
  3. Sentinela `SEM_ESTOQUE` = item sem controle de estoque unitário — nunca conta como venda.
- SKUs de pedido que não resolvem para nenhum produto do catálogo são ignorados (logado), sem erro.
- `estoqueDisponivel = estoqueEntrada - estoqueSaida` — **apenas** saídas manuais (equivalente à aba ESTOQUE, que só reflete baixa manual + FI/FIFO; vendas de pedidos baixam ESTOQUE via `EstoqueBaixaService` e não são incluídas no catálogo para não duplicar com entradas já contabilizadas). A coluna "Vendido" é a única que consolida pedidos.
- Preços sugeridos: delegados a `PricingService` (motor único; nunca duplicar fórmulas).

## Casos de Borda

- Produto sem vendas: `quantidadeVendida = 0`.
- Produto vendido só em pedido (0 saídas manuais): passa de 0 para a soma dos itens dos pedidos pagos.
- `ITEM_SKUS` com múltiplos itens `SKU1:2; SKU2:1` → soma por produto, respeitando `qty`.
- Pedido `UNPAID` que depois paga: conta no sync seguinte (status muda para pago).
- Pedido cancelado/devolvido **nunca** converte em venda; cancelado após baixar não reverte a venda do catálogo (a aba PEDIDOS mantém coluna com histórico).

## Critérios de Aceite (Given/When/Then)

- Given um produto com 4 pedidos Shopee pagos (2 unidades cada), When a tela Catálogo carrega, Then `quantidadeVendida >= 8` (ou soma idêntica à aba PEDIDOS).
- Given produto com 5 saídas manuais e 3 vendas de pedido, When carrega, Then `quantidadeVendida = 8`.
- Given pedido `UNPAID`/`CANCELLED`/`DEVOLVIDO`, When carrega, Then suas unidades não entram em `quantidadeVendida`.
- Given item com SKU numérico (sem SKU pareado), When a aba ANUNCIOS_SHOPEE tem o mapeamento, Then resolve e conta no produto correto.
- Given item `SEM_ESTOQUE`, When carrega, Then não é contado como venda.

## Dependências

- Services/repos usados: `NFeEntradaProdutosRepository`, `ManualEntradaProdutosRepository`, `ManualSaidaProdutosRepository`, `OrdersRepository` (aba PEDIDOS, leitura), `ProdutoSkuMapRepository` (aba ANUNCIOS_SHOPEE, leitura), `PricingService`, `SkuService`, `CacheRepository`.
- Ações Tiops: nenhuma direta (dados vêm do Sheets).

## Notas de Implementação

- A agregação de pedidos roda dentro de `computeProducts_` (cache server 300s; `forceFresh` relê o Sheets).
- Resolução de SKU numérico reutiliza `ProdutoSkuMapRepository.getItemSkuMap` (mesmo mapa usado pelo `OrdersImportService`), mantendo uma única fonte de mapeamento.