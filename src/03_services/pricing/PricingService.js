/**
 * PricingService — Calculadora de Precificação. Generaliza a planilha manual
 * de custo/preço sugerido (Shopee 20% flat, Mercado Livre 14% + R$6/item).
 * Cálculo puro, sem chamadas Tiops. Regras completas em specs/pricing.md.
 */
var PricingService = (function () {
  function describe() {
    return {
      name: 'pricing',
      actions: {
        calculateSuggestedPrice: {
          description:
            'Calcula o preço sugerido de venda dado custo, margem alvo e ' +
            'marketplace, descontando a taxa do canal.',
          params: {
            unitCost: { type: 'number', required: true, description: 'Custo unitário (R$)' },
            extraCosts: { type: 'number', required: false, default: 0, description: 'Custos adicionais por unidade' },
            targetMarginPct: { type: 'number', required: true, description: 'Margem alvo, ex.: 0.25 = 25%' },
            marginBasis: {
              type: 'string',
              required: false,
              default: 'price',
              enum: ['price', 'cost'],
              description: 'Margem calculada sobre o preço de venda ou sobre o custo'
            },
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            marketAveragePrice: { type: 'number', required: false, description: 'Preço médio de mercado, opcional, só para alerta' }
          },
          returns: {
            suggestedPrice: 'number',
            marketplaceFee: 'number',
            grossRevenue: 'number',
            netProfit: 'number',
            netMarginPct: 'number',
            belowMarketAverage: 'boolean'
          }
        },
        compareMarketplaces: {
          description: 'Roda calculateSuggestedPrice para Shopee e Mercado Livre lado a lado.',
          params: {
            unitCost: { type: 'number', required: true },
            extraCosts: { type: 'number', required: false, default: 0 },
            targetMarginPct: { type: 'number', required: true },
            marginBasis: { type: 'string', required: false, default: 'price', enum: ['price', 'cost'] },
            marketAveragePrice: { type: 'number', required: false }
          },
          returns: { shopee: 'object', mercado_livre: 'object' }
        }
      }
    };
  }

  function calculateSuggestedPrice(params) {
    var unitCost = params.unitCost;
    var extraCosts = params.extraCosts || 0;
    var m = params.targetMarginPct;
    var marginBasis = params.marginBasis || 'price';
    var marketplace = params.marketplace;

    if (typeof unitCost !== 'number' || unitCost <= 0) {
      return { error: 'unitCost deve ser um número maior que zero.' };
    }
    if (typeof m !== 'number' || m < 0 || m >= 1) {
      return { error: 'targetMarginPct deve estar entre 0 (inclusive) e 1 (exclusivo).' };
    }

    var fee = ConfigService.getMarketplaceFee(marketplace);
    var cost = unitCost + extraCosts;
    var price;

    if (marginBasis === 'cost') {
      price = (cost * (1 + m) + fee.fixed) / (1 - fee.pct);
    } else {
      var denom = 1 - fee.pct - m;
      if (denom <= 0) {
        return {
          error:
            'Margem alvo (' + (m * 100).toFixed(1) + '%) + taxa do canal (' +
            (fee.pct * 100).toFixed(1) + '%) ultrapassam 100%; ajuste a margem.'
        };
      }
      price = (cost + fee.fixed) / denom;
    }

    price = Math.round(price * 100) / 100;

    var marketplaceFee = Math.round((price * fee.pct + fee.fixed) * 100) / 100;
    var netProfit = Math.round((price - marketplaceFee - cost) * 100) / 100;
    var netMarginPct = price > 0 ? Math.round((netProfit / price) * 10000) / 10000 : 0;

    var result = {
      suggestedPrice: price,
      marketplaceFee: marketplaceFee,
      grossRevenue: price,
      netProfit: netProfit,
      netMarginPct: netMarginPct
    };

    if (typeof params.marketAveragePrice === 'number' && params.marketAveragePrice > 0) {
      result.belowMarketAverage = price < params.marketAveragePrice;
    } else {
      result.belowMarketAverage = false;
    }

    return result;
  }

  function compareMarketplaces(params) {
    var marketplaces = ConfigService.listMarketplaces();
    var out = {};
    marketplaces.forEach(function (marketplace) {
      out[marketplace] = calculateSuggestedPrice({
        unitCost: params.unitCost,
        extraCosts: params.extraCosts,
        targetMarginPct: params.targetMarginPct,
        marginBasis: params.marginBasis,
        marketplace: marketplace,
        marketAveragePrice: params.marketAveragePrice
      });
    });
    return out;
  }

  return {
    describe: describe,
    calculateSuggestedPrice: calculateSuggestedPrice,
    compareMarketplaces: compareMarketplaces
  };
})();
