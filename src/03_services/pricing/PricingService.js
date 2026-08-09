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
            marketAveragePrice: { type: 'number', required: false, description: 'Preço médio de mercado, opcional, só para alerta' },
            itemCount: { type: 'number', required: false, default: 1, description: '[Shopee] nº de itens no pedido, afeta a taxa de serviço (R$4/item)' },
            paymentScenario: {
              type: 'string',
              required: false,
              default: 'cartao_avista',
              enum: ['cartao_avista', 'pix_ou_parcelado'],
              description: '[Shopee] cenário de pagamento assumido; default é o pior caso (maior retenção)'
            }
          },
          returns: {
            suggestedPrice: 'number',
            marketplaceFee: 'number',
            commission: 'number',
            serviceFee: 'number',
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
            marketAveragePrice: { type: 'number', required: false },
            itemCount: { type: 'number', required: false, default: 1 },
            paymentScenario: { type: 'string', required: false, default: 'cartao_avista', enum: ['cartao_avista', 'pix_ou_parcelado'] }
          },
          returns: { shopee: 'object', mercado_livre: 'object' }
        },
        calculateNetMargin: {
          description:
            'Motor único de margem: dado um preço de venda já definido (ex.: ' +
            'sincronizado do Catálogo para o Estoque), calcula quanto sobra ' +
            'líquido após a taxa real do canal e a margem real resultante. ' +
            'Único ponto de cálculo de margem do projeto — Estoque e Catálogo ' +
            'devem sempre passar por aqui, nunca duplicar a fórmula.',
          params: {
            salePrice: { type: 'number', required: true, description: 'Preço de venda já definido (R$)' },
            unitCost: { type: 'number', required: true, description: 'Custo unitário (R$)' },
            extraCosts: { type: 'number', required: false, default: 0, description: 'Custos adicionais por unidade' },
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemCount: { type: 'number', required: false, default: 1, description: '[Shopee] nº de itens no pedido' },
            paymentScenario: {
              type: 'string',
              required: false,
              default: 'cartao_avista',
              enum: ['cartao_avista', 'pix_ou_parcelado'],
              description: '[Shopee] cenário de pagamento assumido; default é o pior caso'
            }
          },
          returns: {
            salePrice: 'number',
            marketplaceFee: 'number',
            commission: 'number',
            serviceFee: 'number',
            netReceived: 'number',
            netProfit: 'number',
            netMarginPct: 'number'
          }
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
    if (marketplace === 'shopee') {
      var paymentScenario = params.paymentScenario || 'cartao_avista';
      if (paymentScenario !== 'cartao_avista' && paymentScenario !== 'pix_ou_parcelado') {
        return { error: 'paymentScenario deve ser "cartao_avista" ou "pix_ou_parcelado".' };
      }
      return _calculateShopee(params, unitCost, extraCosts, m, marginBasis, paymentScenario);
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

  function _calculateShopee(params, unitCost, extraCosts, m, marginBasis, paymentScenario) {
    var itemCount = params.itemCount && params.itemCount >= 1 ? params.itemCount : 1;
    var model = ConfigService.getShopeeFeeModel(paymentScenario, itemCount);
    var cost = unitCost + extraCosts;
    var k = 1 - model.commissionPct - model.serviceFeeBasePct;
    var price;

    if (marginBasis === 'cost') {
      price = (cost * (1 + m) + model.serviceFeeFixed) / (1 - model.commissionPct - model.serviceFeeBasePct);
    } else {
      var denom = k - m;
      if (denom <= 0) {
        return {
          error:
            'Margem alvo (' + (m * 100).toFixed(1) + '%) + taxa do canal (' +
            ((1 - k) * 100).toFixed(1) + '%) ultrapassam 100%; ajuste a margem.'
        };
      }
      price = (cost + model.serviceFeeFixed) / denom;
    }

    price = Math.round(price * 100) / 100;

    var commission = Math.round(price * model.commissionPct * 100) / 100;
    var serviceFee = Math.round((price * model.serviceFeeBasePct + model.serviceFeeFixed) * 100) / 100;
    var marketplaceFee = Math.round((commission + serviceFee) * 100) / 100;
    var netProfit = Math.round((price - marketplaceFee - cost) * 100) / 100;
    var netMarginPct = price > 0 ? Math.round((netProfit / price) * 10000) / 10000 : 0;

    var result = {
      suggestedPrice: price,
      marketplaceFee: marketplaceFee,
      commission: commission,
      serviceFee: serviceFee,
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

  /**
   * Motor único de margem — ver specs/pricing.md e specs/estoque.md.
   * Margem sempre sobre o preço de venda (netProfit/salePrice), mesma
   * convenção de calculateSuggestedPrice — nunca sobre o líquido recebido.
   */
  function calculateNetMargin(params) {
    var salePrice = params.salePrice;
    var marketplace = params.marketplace;
    var unitCost = params.unitCost;
    var extraCosts = params.extraCosts || 0;

    if (typeof salePrice !== 'number' || salePrice <= 0) {
      return { error: 'salePrice deve ser um número maior que zero.' };
    }
    if (typeof unitCost !== 'number' || unitCost < 0) {
      return { error: 'unitCost deve ser um número maior ou igual a zero.' };
    }

    var cost = unitCost + extraCosts;
    var marketplaceFee, commission, serviceFee;

    if (marketplace === 'shopee') {
      var paymentScenario = params.paymentScenario || 'cartao_avista';
      if (paymentScenario !== 'cartao_avista' && paymentScenario !== 'pix_ou_parcelado') {
        return { error: 'paymentScenario deve ser "cartao_avista" ou "pix_ou_parcelado".' };
      }
      var itemCount = params.itemCount && params.itemCount >= 1 ? params.itemCount : 1;
      var model = ConfigService.getShopeeFeeModel(paymentScenario, itemCount);
      commission = Math.round(salePrice * model.commissionPct * 100) / 100;
      serviceFee = Math.round((salePrice * model.serviceFeeBasePct + model.serviceFeeFixed) * 100) / 100;
      marketplaceFee = Math.round((commission + serviceFee) * 100) / 100;
    } else {
      var fee = ConfigService.getMarketplaceFee(marketplace);
      marketplaceFee = Math.round((salePrice * fee.pct + fee.fixed) * 100) / 100;
    }

    var netReceived = Math.round((salePrice - marketplaceFee) * 100) / 100;
    var netProfit = Math.round((netReceived - cost) * 100) / 100;
    var netMarginPct = salePrice > 0 ? Math.round((netProfit / salePrice) * 10000) / 10000 : 0;

    var result = {
      salePrice: salePrice,
      marketplaceFee: marketplaceFee,
      netReceived: netReceived,
      netProfit: netProfit,
      netMarginPct: netMarginPct
    };
    if (marketplace === 'shopee') {
      result.commission = commission;
      result.serviceFee = serviceFee;
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
        marketAveragePrice: params.marketAveragePrice,
        itemCount: params.itemCount,
        paymentScenario: params.paymentScenario
      });
    });
    return out;
  }

  return {
    describe: describe,
    calculateSuggestedPrice: calculateSuggestedPrice,
    compareMarketplaces: compareMarketplaces,
    calculateNetMargin: calculateNetMargin
  };
})();
