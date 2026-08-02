/**
 * Funções utilitárias para rodar manualmente pelo editor do Apps Script
 * (nunca por trigger/Web App). setup_() configura a API key uma única vez;
 * runSmokeTests_() cobre os critérios de aceite de specs/pricing.md.
 */
function setup_() {
  throw new Error(
    'Não defina a API key por código. No editor do Apps Script, vá em ' +
      'Configurações do Projeto > Propriedades do Script > Adicionar propriedade ' +
      'do script, com a chave "TIOPS_API_KEY" e o valor "mc_live_XXXX".'
  );
}

function runSmokeTests_() {
  var failures = [];

  function expectClose(label, actual, expected, tolerance) {
    tolerance = tolerance || 0.01;
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(label + ': esperado ~' + expected + ', obtido ' + actual);
    }
  }

  function expectError(label, result) {
    if (!result || !result.error) {
      failures.push(label + ': esperado erro, obtido ' + JSON.stringify(result));
    }
  }

  // Given unitCost=50, targetMarginPct=0.25, marketplace=shopee -> 50/(1-0.20-0.25)=90.91
  var r1 = PricingService.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.25, marketplace: 'shopee' });
  expectClose('shopee price@25%', r1.suggestedPrice, 90.91);

  // Given unitCost=50, targetMarginPct=0.25, marketplace=mercado_livre -> (50+6)/(1-0.14-0.25)=91.80
  var r2 = PricingService.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.25, marketplace: 'mercado_livre' });
  expectClose('ml price@25%', r2.suggestedPrice, 91.8);

  // Given targetMarginPct=0.85, marketplace=shopee -> erro (0.20+0.85>1)
  var r3 = PricingService.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.85, marketplace: 'shopee' });
  expectError('margem inviável', r3);

  // Given marketplace inválido -> erro
  var r4 = PricingService.calculateSuggestedPrice({ unitCost: 50, targetMarginPct: 0.25, marketplace: 'amazon' });
  expectError('marketplace desconhecido', r4);

  if (failures.length) {
    Logger.log('FALHOU:\n' + failures.join('\n'));
    throw new Error(failures.length + ' smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de pricing passaram.');
}
