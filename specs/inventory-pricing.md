# Spec: Preço e Estoque (sincronização)

## Status
Removed — página e serviço (`inventoryPricing.*`) excluídos por decisão do
usuário (página legacy). O contrato de marketplace abaixo permanece como
referência de regras de preço/estoque para `pricing.md`,
`docs/historico/specs-listings.md` (também removida) e `estoque.md`; não
implementar novas ações sob o namespace `inventoryPricing`.

## Objetivo
Ligar a Calculadora de Precificação a um anúncio real: calcular o preço
sugerido e aplicá-lo de fato no marketplace, além de permitir ajuste de
estoque — sempre confirmando por releitura, nunca confiando na resposta do
update (regra de ouro herdada dos playbooks).

## Contrato da API Interna

### `inventoryPricing.applySuggestedPrice`
- Params: `marketplace`, `itemId`, `unitCost`, `extraCosts` (opcional), `targetMarginPct`, `marginBasis` (opcional) — mesmos de `pricing.calculateSuggestedPrice` mais `itemId`.
- Retorno: `{ pricing: <shape de calculateSuggestedPrice>, listing: <releitura via ListingsService.getDetail> }`.
- Erro: se o cálculo de preço falhar (margem inviável), retorna `{error}` **sem** chamar o marketplace.

### `inventoryPricing.updateStock`
- Params: `marketplace`, `itemId`, `quantity`.
- Retorno: `{ listing: <releitura via ListingsService.getDetail> }`.

## Regras de Negócio
- Preço: reaproveita `PricingService.calculateSuggestedPrice` — nunca duplica a fórmula.
- Shopee: preço via `shopee_update_price` com `price_list: [{original_price}]` — nunca `price` solto (erro `PriceList is required`). Estoque via `shopee_update_stock` com `stock` **e** `seller_stock: [{stock}]`.
- Mercado Livre: preço via `update_price` com `price`; estoque via `update_stock` com `available_quantity`.
- Após qualquer update, sempre relê via `ListingsService.getDetail` antes de retornar — a resposta do update não é fonte de verdade (ver `docs/historico/specs-listings.md`).

## Casos de Borda
- Margem alvo inviável (`1 - fee% - m <= 0`) → retorna erro de `PricingService` e **não** chama o Tiops (evita gravar preço errado por engano).
- `itemId` inexistente → erro do Tiops propagado como `{error}`, tratado na UI (não uma exceção crua).
- `quantity` negativa ou não-inteira → validado pelo schema do `ServiceRegistry` (`type: number`), mas o valor de negócio (`>= 0`) fica a cargo do próprio marketplace rejeitar; não duplicamos essa validação aqui.

## Critérios de Aceite (Given/When/Then)
- Given um item real, custo e margem válidos When `applySuggestedPrice` é chamado Then o preço é alterado no marketplace e a releitura confirma o novo valor.
- Given uma margem alvo inviável When `applySuggestedPrice` é chamado Then retorna erro e nenhuma chamada de update é feita ao Tiops.
- Given um item real When `updateStock` é chamado com uma nova quantidade Then a releitura confirma o novo estoque.

## Fora de Escopo (v1)
- Sincronizar preço/estoque em lote (múltiplos itens de uma vez).
- Histórico de alterações de preço (fica para `SheetsRepository` numa iteração futura).

## Dependências
- `PricingService.calculateSuggestedPrice`, `ListingsService.getDetail`, `TiopsClient`, `ConfigService.getAccountId`.
- Ações Tiops: `update_price`, `update_stock`, `shopee_update_price`, `shopee_update_stock`.
