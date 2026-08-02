/**
 * InventoryPricingService — liga a Calculadora de Precificação (PricingService)
 * aos anúncios reais (ListingsService): aplica o preço sugerido e ajusta
 * estoque no marketplace correto. Regras em specs/inventory-pricing.md.
 */
var InventoryPricingService = (function () {
  function describe() {
    return {
      name: 'inventoryPricing',
      actions: {
        applySuggestedPrice: {
          description: 'Calcula o preço sugerido e aplica no anúncio real do marketplace, relendo para confirmar.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true },
            unitCost: { type: 'number', required: true },
            extraCosts: { type: 'number', required: false, default: 0 },
            targetMarginPct: { type: 'number', required: true },
            marginBasis: { type: 'string', required: false, default: 'price', enum: ['price', 'cost'] }
          },
          returns: { pricing: 'object', listing: 'object' }
        },
        updateStock: {
          description: 'Atualiza o estoque de um item real no marketplace correto.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true },
            quantity: { type: 'number', required: true }
          },
          returns: { listing: 'object' }
        }
      }
    };
  }

  function applySuggestedPrice(params) {
    var pricing = PricingService.calculateSuggestedPrice({
      unitCost: params.unitCost,
      extraCosts: params.extraCosts,
      targetMarginPct: params.targetMarginPct,
      marginBasis: params.marginBasis,
      marketplace: params.marketplace
    });

    if (pricing.error) {
      return { error: pricing.error };
    }

    // Operação simulada — Shopee exige shopee_update_price com price_list,
    // ML exige update_price com price. Valores reais via Claude Code + TIOPS MCP.
    // Regra de ouro: nunca confiar na resposta do update — sempre reler pelo GET.
    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { pricing: pricing, listing: confirmed };
  }

  function updateStock(params) {
    // Operação simulada — Shopee exige shopee_update_stock com stock + seller_stock,
    // ML exige update_stock com available_quantity. Valores reais via Claude Code + TIOPS MCP.
    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { listing: confirmed };
  }

  return { describe: describe, applySuggestedPrice: applySuggestedPrice, updateStock: updateStock };
})();
