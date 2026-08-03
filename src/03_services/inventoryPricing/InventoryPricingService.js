/**
 * InventoryPricingService — liga a Calculadora de Precificação (PricingService)
 * aos anúncios (aba ANUNCIOS do Google Sheets): calcula preço sugerido e
 * grava no Sheets. Regras em specs/inventory-pricing.md.
 */
var InventoryPricingService = (function () {
  function describe() {
    return {
      name: 'inventoryPricing',
      actions: {
        applySuggestedPrice: {
          description: 'Calcula o preço sugerido e grava no anúncio (Sheets), relendo para confirmar.',
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
          description: 'Atualiza o estoque de um item na planilha.',
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

    var writeResult = updateListingField_(params.marketplace, params.itemId, 'price', pricing.suggestedPrice);
    if (writeResult.error) return { error: writeResult.error };

    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { pricing: pricing, listing: confirmed };
  }

  function updateStock(params) {
    var writeResult = updateListingField_(params.marketplace, params.itemId, 'stock', params.quantity);
    if (writeResult.error) return { error: writeResult.error };

    var confirmed = ListingsService.getDetail({ marketplace: params.marketplace, itemId: params.itemId }).listing;
    return { listing: confirmed };
  }

  function updateListingField_(marketplace, itemId, fieldName, value) {
    var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
    var sheet = ss.getSheetByName('Anuncios');
    if (!sheet) {
      return { error: 'Aba "Anuncios" não encontrada.' };
    }

    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idCol = headers.indexOf('id');
    var mpCol = headers.indexOf('marketplace');
    var fieldCol = headers.indexOf(fieldName);

    if (fieldCol === -1) {
      return { error: 'Coluna "' + fieldName + '" não encontrada na aba Anuncios.' };
    }

    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(itemId) && values[i][mpCol] === marketplace) {
        sheet.getRange(i + 1, fieldCol + 1).setValue(value);
        return { success: true };
      }
    }

    return { error: 'Anúncio não encontrado: ' + itemId };
  }

  return { describe: describe, applySuggestedPrice: applySuggestedPrice, updateStock: updateStock };
})();
