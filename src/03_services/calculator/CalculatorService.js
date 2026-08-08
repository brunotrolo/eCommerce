/**
 * CalculatorService — Calculadora de Precificação (PrecificaPro). Suporta
 * Mercado Livre (tabela por faixa de preço/regime, própria deste serviço) e
 * Shopee (modelo de comissão + taxa de serviço validado por engenharia
 * reversa de pedidos reais — ver specs/calculator-shopee.md e
 * ConfigService.getShopeeFeeModel). Cálculo puro (sem I/O), sem chamadas
 * Tiops/Sheets. Regras em specs/calculator.md.
 */
var CalculatorService = (function () {

  var ML_FEES_CNPJ = [
    { max: 8, pct: 0.20, fixedType: 'percent', fixedValue: 0.50 },
    { max: 79, pct: 0.20, fixedType: 'fixed', fixedValue: 4 },
    { max: 99, pct: 0.14, fixedType: 'fixed', fixedValue: 16 },
    { max: 199, pct: 0.14, fixedType: 'fixed', fixedValue: 20 },
    { max: Infinity, pct: 0.14, fixedType: 'fixed', fixedValue: 26 }
  ];

  var ML_FEES_CPF = [
    { max: 8, pct: 0.20, fixedType: 'percent', fixedValue: 0.50 },
    { max: 79, pct: 0.20, fixedType: 'fixed', fixedValue: 7 },
    { max: 99, pct: 0.14, fixedType: 'fixed', fixedValue: 19 },
    { max: 199, pct: 0.14, fixedType: 'fixed', fixedValue: 23 },
    { max: Infinity, pct: 0.14, fixedType: 'fixed', fixedValue: 29 }
  ];

  function describe() {
    return {
      name: 'calculator',
      actions: {
        calculate: {
          description:
            'Calcula preço sugerido (ou decompõe um preço de venda já ' +
            'informado) e lucro líquido, para Shopee ou Mercado Livre.',
          params: {
            marketplace: { type: 'string', required: false, default: 'mercado_livre', enum: ['mercado_livre', 'shopee'] },
            custoProduto: { type: 'number', required: true, description: 'Custo do produto em R$' },
            custosAdicionais: { type: 'number', required: false, default: 0, description: 'Custos extras em R$' },
            margem: { type: 'number', required: false, default: 0.20, description: 'Margem alvo (0-0.99), sobre o preço de venda' },
            adsPercent: { type: 'number', required: false, default: 0, description: 'Taxa ads sobre venda (0-100)' },
            precoVenda: { type: 'number', required: false, default: null, description: 'Preço manual (null = calcula sugerido; informado = simula esse preço)' },
            impostoSimples: { type: 'number', required: false, default: 0.06, description: 'Imposto Simples Nacional (0-1)' },
            regime: { type: 'string', required: false, default: 'cnpj', enum: ['cpf', 'cnpj'], description: '[Mercado Livre] regime tributário' },
            campanhadeDestaque: { type: 'boolean', required: false, default: false, description: '[Mercado Livre] taxa adicional de 3,5%' },
            vendedorIniciante: { type: 'boolean', required: false, default: false, description: '[Mercado Livre] isenção de comissão/taxa fixa' },
            paymentScenario: { type: 'string', required: false, default: 'cartao_avista', enum: ['cartao_avista', 'pix_ou_parcelado'], description: '[Shopee] cenário de pagamento assumido; default é o pior caso' },
            itemCount: { type: 'number', required: false, default: 1, description: '[Shopee] nº de itens no pedido, afeta a taxa de serviço' }
          },
          returns: { success: 'boolean', data: 'object' }
        }
      }
    };
  }

  function getMLFee(precoVenda, regime, vendedorIniciante) {
    if (vendedorIniciante) {
      return { faixa: 'Isento', pct: 0, fixed: 0, isento: true };
    }

    var fees = regime === 'cpf' ? ML_FEES_CPF : ML_FEES_CNPJ;
    var faixaLabel = '';

    for (var i = 0; i < fees.length; i++) {
      if (precoVenda < fees[i].max || fees[i].max === Infinity) {
        var pct = fees[i].pct;
        var fixed = 0;

        if (fees[i].fixedType === 'percent') {
          fixed = Math.round(precoVenda * fees[i].fixedValue * 100) / 100;
          faixaLabel = '< R$8';
        } else {
          fixed = fees[i].fixedValue;
          if (fees[i].max === 79) faixaLabel = 'Até R$79';
          else if (fees[i].max === 99) faixaLabel = 'R$80–99';
          else if (fees[i].max === 199) faixaLabel = 'R$100–199';
          else faixaLabel = '≥ R$200';
        }

        return { faixa: faixaLabel, pct: pct, fixed: fixed, isento: false };
      }
    }

    return { faixa: '≥ R$200', pct: 0.14, fixed: 26, isento: false };
  }

  function calcPriceIteration(custoTotal, margemAlvo, regime, adsPercent, campanha, imposto, vendedorIniciante) {
    var maxIter = 50;
    var price = custoTotal * 2;

    for (var iter = 0; iter < maxIter; iter++) {
      var fee = getMLFee(price, regime, vendedorIniciante);
      var adsFactor = adsPercent / 100;
      var campanhaFactor = campanha ? 0.035 : 0;
      var impostoFactor = imposto;

      var denominator = 1 - fee.pct - adsFactor - campanhaFactor - impostoFactor;
      if (denominator <= 0) return null;

      var newPrice = (custoTotal * (1 + margemAlvo) + fee.fixed) / denominator;
      newPrice = Math.round(newPrice * 100) / 100;

      if (Math.abs(newPrice - price) < 0.01) return newPrice;
      price = newPrice;
    }

    return Math.round(price * 100) / 100;
  }

  function buildAvisos(custoTotal, lucroLiquido, margemAlcancada, adsPercent) {
    var avisos = [];
    if (custoTotal === 0) {
      avisos.push({ tipo: 'zero_cost', msg: 'Custo zerado — lucro infinito' });
    }
    if (lucroLiquido < 0) {
      avisos.push({ tipo: 'negative_profit', msg: 'Preço abaixo do custo — prejuízo!' });
    }
    if (margemAlcancada < 10 && margemAlcancada >= 0) {
      avisos.push({ tipo: 'margin_low', msg: 'Margem realizada (' + margemAlcancada.toFixed(1) + '%) abaixo de 10%' });
    }
    if (adsPercent > 10) {
      avisos.push({ tipo: 'high_ads', msg: 'Ads muito alto (' + adsPercent + '%) — reduz margem significativamente' });
    }
    return avisos;
  }

  function calculate(params) {
    if (!params || typeof params.custoProduto !== 'number') {
      return { error: 'Parâmetro obrigatório ausente: custoProduto' };
    }

    var marketplace = params.marketplace || 'mercado_livre';
    if (marketplace !== 'mercado_livre' && marketplace !== 'shopee') {
      return { error: 'marketplace deve ser "mercado_livre" ou "shopee".' };
    }

    var custoProduto = params.custoProduto;
    var custosAdicionais = params.custosAdicionais || 0;
    var margemAlvo = typeof params.margem === 'number' ? params.margem : 0.20;
    var adsPercent = params.adsPercent || 0;
    var precoVendaManual = params.precoVenda || null;
    var impostoSimples = typeof params.impostoSimples === 'number' ? params.impostoSimples : 0.06;

    if (custoProduto < 0) return { error: 'custoProduto deve ser ≥ 0.' };
    if (margemAlvo < 0 || margemAlvo >= 1) return { error: 'margem deve estar entre 0 e 0.99.' };
    if (adsPercent < 0 || adsPercent > 100) return { error: 'adsPercent deve estar entre 0 e 100.' };
    if (impostoSimples < 0 || impostoSimples > 1) return { error: 'impostoSimples deve estar entre 0 e 1.' };

    var custoTotal = custoProduto + custosAdicionais;

    if (marketplace === 'shopee') {
      return _calculateShopee(params, custoProduto, custosAdicionais, custoTotal, margemAlvo, adsPercent, impostoSimples, precoVendaManual);
    }
    return _calculateML(params, custoProduto, custosAdicionais, custoTotal, margemAlvo, adsPercent, impostoSimples, precoVendaManual);
  }

  function _calculateML(params, custoProduto, custosAdicionais, custoTotal, margemAlvo, adsPercent, impostoSimples, precoVendaManual) {
    var regime = params.regime || 'cnpj';
    var campanha = params.campanhadeDestaque || false;
    var vendedorIniciante = params.vendedorIniciante || false;

    var precoVenda;
    var precoSugerido = null;

    if (precoVendaManual !== null && precoVendaManual > 0) {
      precoVenda = precoVendaManual;
    } else {
      precoSugerido = calcPriceIteration(custoTotal, margemAlvo, regime, adsPercent, campanha, impostoSimples, vendedorIniciante);
      if (precoSugerido === null) {
        return { success: true, data: { avisos: [{ tipo: 'margin_unreachable', msg: 'Margem de ' + (margemAlvo * 100).toFixed(0) + '% impossível com estas taxas' }] } };
      }
      precoVenda = precoSugerido;
    }

    var taxasML = getMLFee(precoVenda, regime, vendedorIniciante);

    var comissaoValor = Math.round(precoVenda * taxasML.pct * 100) / 100;
    var taxaServicoValor = taxasML.fixed;
    var adsValor = Math.round(precoVenda * (adsPercent / 100) * 100) / 100;
    var campanhaValor = campanha ? Math.round(precoVenda * 0.035 * 100) / 100 : 0;
    var impostoValor = Math.round(precoVenda * impostoSimples * 100) / 100;

    var subTotal = precoVenda - comissaoValor - taxaServicoValor - adsValor - campanhaValor - impostoValor;
    var lucroLiquido = Math.round((subTotal - custoTotal) * 100) / 100;

    var margemAlcancada = precoVenda > 0 ? Math.round((lucroLiquido / precoVenda) * 10000) / 100 : 0;
    var margemAcimaDoCusto = custoTotal > 0 ? Math.round(((precoVenda / custoTotal) - 1) * 10000) / 100 : 0;

    return {
      success: true,
      data: {
        marketplace: 'mercado_livre',
        custoProduto: custoProduto,
        custosAdicionais: custosAdicionais,
        custoTotal: custoTotal,
        margemAlvo: margemAlvo,
        precoSugerido: precoSugerido,
        precoVenda: precoVenda,
        taxasCanal: {
          label: taxasML.faixa,
          comissaoPct: taxasML.pct,
          isento: taxasML.isento
        },
        adsPercent: adsPercent / 100,
        adsTaxaFixa: adsValor,
        campanhadeDestaque: campanha,
        regime: regime,
        descomposicao: {
          precoVenda: precoVenda,
          menosComissao: comissaoValor,
          menosTaxaServico: taxaServicoValor,
          menosAds: adsValor,
          menoCampanha: campanhaValor,
          menosImposto: impostoValor,
          subTotal: Math.round(subTotal * 100) / 100,
          menosCustos: custoTotal,
          lucroLiquido: lucroLiquido
        },
        margemAlcancada: margemAlcancada,
        margemAcimaDoCusto: margemAcimaDoCusto,
        avisos: buildAvisos(custoTotal, lucroLiquido, margemAlcancada, adsPercent)
      }
    };
  }

  /**
   * Shopee usa o modelo validado de 2 componentes (comissão + taxa de
   * serviço, ConfigService.getShopeeFeeModel — ver specs/calculator-shopee.md
   * seções 3-7). Ads/Imposto Simples são deduções genéricas de vendedor,
   * fora do escopo da engenharia reversa, aplicadas aqui do mesmo jeito que
   * já eram para Mercado Livre (specs/calculator.md), reduzindo o fator
   * `k` antes de resolver o preço — mesma extensão documentada em
   * specs/calculator-shopee.md §9.1 (kAjustado = k - ads% - imposto%).
   * Margem sempre sobre o preço de venda (marginBasis: price), consistente
   * com specs/pricing.md.
   */
  function _calculateShopee(params, custoProduto, custosAdicionais, custoTotal, margemAlvo, adsPercent, impostoSimples, precoVendaManual) {
    var paymentScenario = params.paymentScenario || 'cartao_avista';
    if (paymentScenario !== 'cartao_avista' && paymentScenario !== 'pix_ou_parcelado') {
      return { error: 'paymentScenario deve ser "cartao_avista" ou "pix_ou_parcelado".' };
    }
    var itemCount = params.itemCount && params.itemCount >= 1 ? params.itemCount : 1;
    var model = ConfigService.getShopeeFeeModel(paymentScenario, itemCount);

    var precoVenda;
    var precoSugerido = null;

    if (precoVendaManual !== null && precoVendaManual > 0) {
      precoVenda = precoVendaManual;
    } else {
      var k = 1 - model.commissionPct - model.serviceFeeBasePct;
      var kAjustado = k - (adsPercent / 100) - impostoSimples;
      var denom = kAjustado - margemAlvo;
      if (denom <= 0) {
        return { success: true, data: { avisos: [{ tipo: 'margin_unreachable', msg: 'Margem de ' + (margemAlvo * 100).toFixed(0) + '% impossível com estas taxas' }] } };
      }
      precoSugerido = Math.round(((custoTotal + model.serviceFeeFixed) / denom) * 100) / 100;
      precoVenda = precoSugerido;
    }

    var comissaoValor = Math.round(precoVenda * model.commissionPct * 100) / 100;
    var taxaServicoValor = Math.round((precoVenda * model.serviceFeeBasePct + model.serviceFeeFixed) * 100) / 100;
    var adsValor = Math.round(precoVenda * (adsPercent / 100) * 100) / 100;
    var impostoValor = Math.round(precoVenda * impostoSimples * 100) / 100;

    var subTotal = precoVenda - comissaoValor - taxaServicoValor - adsValor - impostoValor;
    var lucroLiquido = Math.round((subTotal - custoTotal) * 100) / 100;

    var margemAlcancada = precoVenda > 0 ? Math.round((lucroLiquido / precoVenda) * 10000) / 100 : 0;
    var margemAcimaDoCusto = custoTotal > 0 ? Math.round(((precoVenda / custoTotal) - 1) * 10000) / 100 : 0;

    return {
      success: true,
      data: {
        marketplace: 'shopee',
        custoProduto: custoProduto,
        custosAdicionais: custosAdicionais,
        custoTotal: custoTotal,
        margemAlvo: margemAlvo,
        precoSugerido: precoSugerido,
        precoVenda: precoVenda,
        taxasCanal: {
          label: paymentScenario === 'pix_ou_parcelado' ? 'Pix / parcelado' : 'Cartão à vista',
          comissaoPct: model.commissionPct,
          isento: false
        },
        adsPercent: adsPercent / 100,
        adsTaxaFixa: adsValor,
        paymentScenario: paymentScenario,
        itemCount: itemCount,
        descomposicao: {
          precoVenda: precoVenda,
          menosComissao: comissaoValor,
          menosTaxaServico: taxaServicoValor,
          menosAds: adsValor,
          menoCampanha: 0,
          menosImposto: impostoValor,
          subTotal: Math.round(subTotal * 100) / 100,
          menosCustos: custoTotal,
          lucroLiquido: lucroLiquido
        },
        margemAlcancada: margemAlcancada,
        margemAcimaDoCusto: margemAcimaDoCusto,
        avisos: buildAvisos(custoTotal, lucroLiquido, margemAlcancada, adsPercent)
      }
    };
  }

  return {
    describe: describe,
    calculate: calculate
  };
})();
