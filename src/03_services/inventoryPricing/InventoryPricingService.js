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

    if (params.marketplace === 'shopee') {
      // shopee_update_price exige price_list — nunca "price" solto
      // (ver SHOPEE_CRIAR_ANUNCIO.md).
      TiopsClient.call('shopee_update_price', {
        shopId: ConfigService.getAccountId('shopee'),
        item_id: params.itemId,
        price_list: [{ original_price: pricing.suggestedPrice }]
      });
    } else {
      TiopsClient.call('update_price', {
        meliUserId: ConfigService.getAccountId('mercado_livre'),
        item_id: params.itemId,
        price: pricing.suggestedPrice
      });
    }

    // Regra de ouro: nunca confiar na resposta do update — reler pelo GET.
    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { pricing: pricing, listing: confirmed };
  }

  function updateStock(params) {
    if (params.marketplace === 'shopee') {
      TiopsClient.call('shopee_update_stock', {
        shopId: ConfigService.getAccountId('shopee'),
        item_id: params.itemId,
        stock: params.quantity,
        seller_stock: [{ stock: params.quantity }]
      });
    } else {
      TiopsClient.call('update_stock', {
        meliUserId: ConfigService.getAccountId('mercado_livre'),
        item_id: params.itemId,
        available_quantity: params.quantity
      });
    }

    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { listing: confirmed };
  }

  return { describe: describe, applySuggestedPrice: applySuggestedPrice, updateStock: updateStock };
})();
