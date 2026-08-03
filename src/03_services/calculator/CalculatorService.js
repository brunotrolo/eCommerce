/**
 * CalculatorService — Calculadora de Precificação Mercado Livre (PrecificaPro).
 * Cálculo puro (sem I/O), sem chamadas Tiops/Sheets. Regras em specs/calculator.md.
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
        calculateML: {
          description: 'Calcula preço sugerido e lucro líquido para Mercado Livre.',
          params: {
            custoProduto: { type: 'number', required: true, description: 'Custo do produto em R$' },
            custosAdicionais: { type: 'number', required: false, default: 0, description: 'Custos extras em R$' },
            margem: { type: 'number', required: false, default: 0.20, description: 'Margem alvo (0-0.99)' },
            adsPercent: { type: 'number', required: false, default: 0, description: 'Taxa ads sobre venda (0-100)' },
            precoVenda: { type: 'number', required: false, default: null, description: 'Preço manual (null = calcula)' },
            regime: { type: 'string', required: false, default: 'cnpj', enum: ['cpf', 'cnpj'] },
            impostoSimples: { type: 'number', required: false, default: 0.06, description: 'Imposto Simples Nacional (0-1)' },
            campanhadeDestaque: { type: 'boolean', required: false, default: false },
            vendedorIniciante: { type: 'boolean', required: false, default: false }
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

  function calculateML(params) {
    if (!params || typeof params.custoProduto !== 'number') {
      return { error: 'Parâmetro obrigatório ausente: custoProduto' };
    }

    var custoProduto = params.custoProduto;
    var custosAdicionais = params.custosAdicionais || 0;
    var margemAlvo = typeof params.margem === 'number' ? params.margem : 0.20;
    var adsPercent = params.adsPercent || 0;
    var precoVendaManual = params.precoVenda || null;
    var regime = params.regime || 'cnpj';
    var impostoSimples = typeof params.impostoSimples === 'number' ? params.impostoSimples : 0.06;
    var campanha = params.campanhadeDestaque || false;
    var vendedorIniciante = params.vendedorIniciante || false;

    if (custoProduto < 0) return { error: 'custoProduto deve ser ≥ 0.' };
    if (margemAlvo < 0 || margemAlvo >= 1) return { error: 'margem deve estar entre 0 e 0.99.' };
    if (adsPercent < 0 || adsPercent > 100) return { error: 'adsPercent deve estar entre 0 e 100.' };
    if (impostoSimples < 0 || impostoSimples > 1) return { error: 'impostoSimples deve estar entre 0 e 1.' };

    var custoTotal = custoProduto + custosAdicionais;
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

    var mlPercentValue = Math.round(precoVenda * taxasML.pct * 100) / 100;
    var mlFixedValue = taxasML.fixed;
    var adsValor = Math.round(precoVenda * (adsPercent / 100) * 100) / 100;
    var campanhaValor = campanha ? Math.round(precoVenda * 0.035 * 100) / 100 : 0;
    var impostoValor = Math.round(precoVenda * impostoSimples * 100) / 100;

    var subTotal = precoVenda - mlPercentValue - mlFixedValue - adsValor - campanhaValor - impostoValor;
    var lucroLiquido = Math.round((subTotal - custoTotal) * 100) / 100;

    var margemAlcancada = precoVenda > 0 ? Math.round((lucroLiquido / precoVenda) * 10000) / 100 : 0;
    var margemAcimaDoCusto = custoTotal > 0 ? Math.round(((precoVenda / custoTotal) - 1) * 10000) / 100 : 0;

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

    return {
      success: true,
      data: {
        custoProduto: custoProduto,
        custosAdicionais: custosAdicionais,
        custoTotal: custoTotal,
        margemAlvo: margemAlvo,
        precoSugerido: precoSugerido,
        precoVenda: precoVenda,
        taxasML: taxasML,
        adsPercent: adsPercent / 100,
        adsTaxaFixa: adsValor,
        campanhadeDestaque: campanha,
        descomposicao: {
          precoVenda: precoVenda,
          menosML_percent: mlPercentValue,
          menosML_fixo: mlFixedValue,
          menosAds: adsValor,
          menoCampanha: campanhaValor,
          menosImposto: impostoValor,
          subTotal: Math.round(subTotal * 100) / 100,
          menosCustos: custoTotal,
          lucroLiquido: lucroLiquido
        },
        margemAlcancada: margemAlcancada,
        margemAcimaDoCusto: margemAcimaDoCusto,
        avisos: avisos
      }
    };
  }

  return {
    describe: describe,
    calculateML: calculateML
  };
})();
