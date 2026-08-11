/**
 * pricing.test.js — motor único de margem (PricingService) contra as taxas
 * REAIS do projeto (ConfigService + fallbacks: Shopee 20% flat / ML 14% + R$6;
 * modelo de dois componentes da Shopee por engenharia reversa de 11 pedidos).
 * Protege o "fato do projeto" de taxas + as fórmulas de
 * calculateSuggestedPrice/calculateNetMargin (anti-drift entre elas).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const P = env.PricingService;

test('ML: calculateNetMargin(100, custo 50) -> taxa 14%+6 = 20; líquido 80; lucro 30; margem 30%', () => {
  const r = P.calculateNetMargin({ salePrice: 100, unitCost: 50, marketplace: 'mercado_livre' });
  assert.equal(r.marketplaceFee, 20);
  assert.equal(r.netReceived, 80);
  assert.equal(r.netProfit, 30);
  assert.equal(r.netMarginPct, 0.3);
});

test('ML: calculateSuggestedPrice(custo 50, margem 30%) -> preço 100 (56/(1-0.14-0.30))', () => {
  const r = P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.3, marketplace: 'mercado_livre' });
  assert.equal(r.suggestedPrice, 100);
  assert.equal(r.marketplaceFee, 20);
  assert.equal(r.netProfit, 30);
  assert.equal(r.netMarginPct, 0.3);
  assert.equal(r.belowMarketAverage, false);
});

test('ML: flag belowMarketAverage liga quando o preço fica abaixo do mercado', () => {
  const r = P.calculateSuggestedPrice({
    unitCost: 50, targetMarginPct: 0.3, marketplace: 'mercado_livre', marketAveragePrice: 120
  });
  assert.equal(r.belowMarketAverage, true);
});

test('ML: marginBasis=cost -> preço = (custo*(1+m)+fixa)/(1-pct) arredondado 2 casas', () => {
  const r = P.calculateSuggestedPrice({
    unitCost: 50, targetMarginPct: 0.3, marketplace: 'mercado_livre', marginBasis: 'cost'
  });
  assert.equal(r.suggestedPrice, 82.56);
  assert.equal(r.marketplaceFee, 17.56);
});

test('Shopee cartão: netMargin(100, custo 50) -> comissão 18% + serviço 2%+R$4 = 24; margem 26%', () => {
  const r = P.calculateNetMargin({ salePrice: 100, unitCost: 50, marketplace: 'shopee', paymentScenario: 'cartao_avista' });
  assert.equal(r.commission, 18);
  assert.equal(r.serviceFee, 6);
  assert.equal(r.marketplaceFee, 24);
  assert.equal(r.netProfit, 26);
  assert.equal(r.netMarginPct, 0.26);
});

test('Shopee PIX: netMargin(100) -> comissão 12% + serviço 2%+R$4+R$16 = 34; margem 16%', () => {
  const r = P.calculateNetMargin({ salePrice: 100, unitCost: 50, marketplace: 'shopee', paymentScenario: 'pix_ou_parcelado' });
  assert.equal(r.commission, 12);
  assert.equal(r.serviceFee, 22);
  assert.equal(r.marketplaceFee, 34);
  assert.equal(r.netProfit, 16);
});

test('Shopee cartão: sugerido(custo 50, margem 30%) -> 108 (54/(0.8-0.3)); margem real bate 30%', () => {
  const r = P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.3, marketplace: 'shopee', paymentScenario: 'cartao_avista' });
  assert.equal(r.suggestedPrice, 108);
  assert.equal(r.commission, 19.44);
  assert.equal(r.serviceFee, 6.16);
  assert.equal(r.marketplaceFee, 25.6);
  assert.equal(r.netProfit, 32.4);
  assert.equal(r.netMarginPct, 0.3);
});

test('ANTI-DRIFT: sugerido → netMargin (mesmo custo) devolve a margem alvo (fórmulas alinhadas)', () => {
  const r = P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.3, marketplace: 'shopee', paymentScenario: 'cartao_avista' });
  const back = P.calculateNetMargin({ salePrice: r.suggestedPrice, unitCost: 50, marketplace: 'shopee', paymentScenario: 'cartao_avista' });
  assert.ok(Math.abs(back.netMarginPct - 0.3) < 0.01, `drift: ${back.netMarginPct}`);
  const rMl = P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.25, marketplace: 'mercado_livre' });
  const backMl = P.calculateNetMargin({ salePrice: rMl.suggestedPrice, unitCost: 50, marketplace: 'mercado_livre' });
  assert.ok(Math.abs(backMl.netMarginPct - 0.25) < 0.01, `drift ML: ${backMl.netMarginPct}`);
});

test('validação de entrada: unitCost <= 0 rejeitado', () => {
  assert.ok(P.calculateSuggestedPrice({ unitCost: 0, targetMarginPct: 0.3, marketplace: 'mercado_livre' }).error);
  assert.ok(P.calculateNetMargin({ salePrice: 100, unitCost: -1, marketplace: 'mercado_livre' }).error);
});

test('validação de entrada: margem alvo fora de [0, 1) rejeitada', () => {
  assert.ok(P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 1, marketplace: 'mercado_livre' }).error);
  assert.ok(P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: -0.1, marketplace: 'mercado_livre' }).error);
});

test('validação de entrada: margem+taxa sopra 100% vira erro claro (não NaN)', () => {
  const r = P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.9, marketplace: 'mercado_livre' });
  assert.ok(r.error && r.error.indexOf('ultrapassam 100%') !== -1);
});

test('validação de entrada: paymentScenario inválido rejeitado no Shopee', () => {
  assert.ok(P.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.3, marketplace: 'shopee', paymentScenario: 'parcelado' }).error);
  assert.ok(P.calculateNetMargin({ salePrice: 100, unitCost: 50, marketplace: 'shopee', paymentScenario: 'boleto' }).error);
});