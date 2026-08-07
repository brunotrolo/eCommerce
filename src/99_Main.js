/**
 * Funções utilitárias para rodar manualmente pelo editor do Apps Script
 * (nunca por trigger/Web App). setup_() configura a API key uma única vez;
 * runSmokeTests_() cobre os critérios de aceite de specs/pricing.md.
 * onOpen() cria o menu customizado no editor GAS.
 * initLogging_() cria aba LOGS e configura trigger diário de limpeza.
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('eCommerce')
      .addSubMenu(
        SpreadsheetApp.getUi().createMenu('NFe Entrada')
          .addItem('Configurar Sheet ID', 'showNfeConfigDialog_')
          .addItem('Sincronizar com Drive', 'syncNfeFromMenu_')
          .addItem('Diagnóstico da Pasta', 'debugNfeSync_')
      )
      .addSeparator()
      .addSubMenu(
        SpreadsheetApp.getUi().createMenu('Utilitários')
          .addItem('Inicializar Logging', 'initLogging_')
          .addItem('Limpar Logs Antigos', 'clearOldLogs_')
          .addItem('Configurar Sync Diário Anúncios', 'setupAnunciosShopeeTrigger_')
      )
      .addSeparator()
      .addSubMenu(
        SpreadsheetApp.getUi().createMenu('Testes (Smoke Tests)')
          .addItem('Pricing', 'runSmokeTests_')
          .addItem('NFe Entrada', 'runNfeSmokeTests_')
          .addItem('NFe Produtos', 'runNfeProdutosSmokeTests_')
          .addItem('Formatter', 'runFormatterSmokeTests_')
          .addItem('Catalog', 'runCatalogSmokeTests_')
          .addItem('Calculator', 'runCalculatorSmokeTests_')
          .addItem('Push Notification', 'runPushSmokeTests_')
          .addItem('Saída Manual', 'runManualSaidaSmokeTests_')
          .addItem('Carteira Shopee', 'runCarteiraShopeeSmokeTests_')
          .addItem('Anúncios Shopee', 'runAnunciosShopeeSmokeTests_')
          .addItem('Estoque Baixa', 'runEstoqueBaixaSmokeTests_')
          .addItem('Write Audit', 'runWriteAuditSmokeTests_')
      )
      .addToUi();
  } catch (e) {
    // Silently ignore when run from editor (no UI context)
  }
}

function showNfeConfigDialog_() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' +
    'body{font-family:Arial,sans-serif;padding:20px;margin:0}' +
    'h3{margin:0 0 16px;color:#1a1a1a}' +
    'input{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box}' +
    'button{margin-top:12px;padding:10px 24px;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600}' +
    '.btn-primary{background:#0a0a0a;color:#fff}' +
    '.btn-primary:hover{background:#1c1c1e}' +
    '#msg{margin-top:12px;padding:8px 12px;border-radius:4px;display:none;font-size:13px}' +
    '.ok{background:#e6f9f1;color:#00b48a}' +
    '.err{background:#fde8e8;color:#d45656}' +
    '</style></head><body>' +
    '<h3>Configurar Sheet ID — NFe Entrada</h3>' +
    '<p style="color:#5a5a5c;font-size:13px">Cole o ID da planilha Google Sheets que contém a aba NFE_ENTRADA.</p>' +
    '<input id="sid" placeholder="1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50" />' +
    '<br><button class="btn-primary" onclick="save()">Salvar</button>' +
    '<div id="msg"></div>' +
    '<script>function save(){var id=document.getElementById("sid").value.trim();' +
    'if(!id){show("Preencha o ID","err");return}' +
    'google.script.run.withSuccessHandler(function(){show("Sheet ID salvo com sucesso!","ok");' +
    'setTimeout(function(){google.script.host.close()},1200)})' +
    '.withFailureHandler(function(e){show("Erro: "+e.message,"err")})' +
    '.ConfigService_setNfeEntradaSheetId(id)}' +
    'function show(t,c){var m=document.getElementById("msg");m.textContent=t;m.className=c;m.style.display="block"}' +
    '</script></body></html>'
  )
    .setWidth(500)
    .setHeight(240);

  SpreadsheetApp.getUi().showModalDialog(html, 'Configurar NFe Entrada');
}

function ConfigService_setNfeEntradaSheetId(id) {
  return ConfigService.setNfeEntradaSheetId(id);
}

function syncNfeFromMenu_() {
  try {
    var folderId = '1tGl8zs9GOUA1L_i2FJNoimTl00_55qKu';
    var result = apiDispatch('nfeEntrada.syncAndUpdateSheets', { driveFolder: folderId });
    if (result.error) {
      SpreadsheetApp.getUi().alert('Erro: ' + result.error);
    } else {
      SpreadsheetApp.getUi().alert(
        'Sync concluída!\n\n' +
        'Total: ' + result.data.total + '\n' +
        'Inseridas: ' + result.data.inserted + '\n' +
        'Duplicadas: ' + result.data.duplicated + '\n' +
        'Erros: ' + (result.data.errors ? result.data.errors.length : 0)
      );
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Erro: ' + e.message);
  }
}

function setup_() {
  Logger.log('Setup: Integração Tiops desativada. Dados lidos do Google Sheets.');
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

  // Given escrow=120 → escrow JÁ É o valor líquido (taxas já descontadas pela Shopee)
  var netShopee = OrdersService.calculateNet({ escrowAmount: 120, netCommissionFee: 24, netServiceFee: 6, pixDiscount: 0, total: 120 });
  expectClose('líquido shopee (escrow)', netShopee, 120);

  // Given sem escrow (ML) -> base é o total - taxas
  var netMl = OrdersService.calculateNet({ escrowAmount: 0, netCommissionFee: 0, netServiceFee: 0, pixDiscount: 0, total: 100 });
  expectClose('líquido ML sem escrow', netMl, 100);

  // Given escrow=120 com pix → escrow prevalece (pix já está embutido no escrow)
  var netPix = OrdersService.calculateNet({ escrowAmount: 120, netCommissionFee: 24, netServiceFee: 6, pixDiscount: 3, total: 120 });
  expectClose('líquido com pix (escrow)', netPix, 120);

  if (failures.length) {
    Logger.log('FALHOU:\n' + failures.join('\n'));
    throw new Error(failures.length + ' smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de pricing passaram.');
}

function runNfeSmokeTests_() {
  var failures = [];

  // parseXml: XML mínimo com campos obrigatórios
  var xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<NFe><infNFe Id="NFe0000000000000000000000000000007311574356777">' +
    '<ide><nNF>731</nNF><dhRecbto>2026-07-03T10:00:00-03:00</dhRecbto></ide>' +
    '<emit><CNPJ>39557000024455</CNPJ><xNome>AYACHE EXPRESS COMERCIO LTDA</xNome>' +
    '<IE>123456789</IE><enderEmit><xLgr>Rua Teste</xLgr><nro>100</nro><xBairro>Centro</xBairro><xMun>Sao Paulo</xMun><UF>SP</UF></enderEmit></emit>' +
    '<dest><CNPJ>67761861000100</CNPJ><xNome>DANIELLA APARECIDA</xNome><IE>987654321</IE>' +
    '<enderDest><xLgr>Rua Dest</xLgr><nro>200</nro><xBairro>Jardim</xBairro><xMun>Rio de Janeiro</xMun><UF>RJ</UF></enderDest></dest>' +
    '<total><ICMSTot><vNF>633.25</vNF><vDesc>0</vDesc><vFrete>0</vFrete><vICMS>134.10</vICMS><vPIS>10.45</vPIS><vCOFINS>48.38</vCOFINS></ICMSTot></total>' +
    '<det nItem="1"><prod><cProd>0000000006231</cProd><xProd>Maison Delilah</xProd><NCM>33030010</NCM><CFOP>5102</CFOP><qCom>2.0000</qCom><vUnCom>180.00</vUnCom><vProd>360.00</vProd></prod>' +
    '<imposto><ICMS><ICMS00><pICMS>18.0000</pICMS></ICMS00></ICMS></imposto></det>' +
    '<det nItem="2"><prod><cProd>0000000006232</cProd><xProd>Produto 2</xProd><NCM>33030010</NCM><CFOP>5102</CFOP><qCom>1.0000</qCom><vUnCom>145.00</vUnCom><vProd>145.00</vProd></prod>' +
    '<imposto><ICMS><ICMS00><pICMS>18.0000</pICMS></ICMS00></ICMS></imposto></det>' +
    '<det nItem="3"><prod><cProd>0000000006233</cProd><xProd>Produto 3</xProd><NCM>33030010</NCM><CFOP>5102</CFOP><qCom>1.0000</qCom><vUnCom>128.25</vUnCom><vProd>128.25</vProd></prod>' +
    '<imposto><ICMS><ICMS00><pICMS>18.0000</pICMS></ICMS00></ICMS></imposto></det>' +
    '</infNFe></NFe>' +
    '<protNFe><infProt><chNFe>3526073955700002445500200000007311574356777</chNFe><nProt>135260000001234</nProt><cStat>100</cStat></infProt></protNFe>' +
    '</nfeProc>';

  var parsed = NFeEntradaService.parseXml({ xmlContent: xml });
  if (parsed.error) failures.push('parseXml error: ' + parsed.error);
  if (parsed.numeroNf !== '731') failures.push('numeroNf: esperado 731, obtido ' + parsed.numeroNf);
  if (parsed.emitenteNome !== 'AYACHE EXPRESS COMERCIO LTDA') failures.push('emitenteNome: ' + parsed.emitenteNome);
  if (parsed.valorTotal !== 633.25) failures.push('valorTotal: esperado 633.25, obtido ' + parsed.valorTotal);
  if (parsed.valorIcms !== 134.10) failures.push('valorIcms: esperado 134.10, obtido ' + parsed.valorIcms);
  if (parsed.statusNfe !== 'Autorizado') failures.push('statusNfe: esperado Autorizado, obtido ' + parsed.statusNfe);

  var produtos = JSON.parse(parsed.produtosJson);
  if (produtos.length !== 3) failures.push('produtos: esperado 3, obtido ' + produtos.length);
  if (produtos[0] && produtos[0].NCM !== '33030010') failures.push('produtos[0].NCM: ' + (produtos[0] ? produtos[0].NCM : 'undefined'));

  // deduplicateEntries: XML priorizado sobre PDF
  var entries = [
    { numeroNf: '731', tipoArquivo: 'xml' },
    { numeroNf: '731', tipoArquivo: 'pdf' }
  ];
  var deduped = NFeEntradaService.deduplicateEntries({ entries: entries });
  if (deduped.length !== 2) failures.push('dedup length: esperado 2, obtido ' + deduped.length);
  if (deduped[0]._duplicate !== false) failures.push('XML deveria ser mantido');
  if (deduped[1]._duplicate !== true) failures.push('PDF duplicado deveria ser marcado');

  // sanitizeForClient_: Date deve virar string no padrão brasileiro (dd/MM/yyyy HH:mm:ss)
  var sanitized = ServiceRegistry.sanitizeForClient({
    data_emissao: new Date('2026-05-05T12:00:00-03:00'),
    valor_total: 123.45,
    extra: undefined
  });
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(sanitized.data_emissao)) failures.push('sanitizeForClient: Date deveria virar formato BR dd/MM/yyyy HH:mm:ss, obtido ' + sanitized.data_emissao);
  if (!('extra' in sanitized)) failures.push('sanitizeForClient: undefined perdeu o campo?');
  if (sanitized.extra !== '') failures.push('sanitizeForClient: undefined deveria virar string vazia');
  if (sanitized.valor_total !== 123.45) failures.push('sanitizeForClient: número deveria passar intacto');
  if (!Array.isArray(ServiceRegistry.sanitizeForClient([1, new Date(0)]))) failures.push('sanitizeForClient: array deveria virar array');

  // LoggingRepository.parseStoredDate: deve manter datas BR (dd/MM/yyyy[ HH:mm:ss]) e ISO legado
  var brParsed = LoggingRepository.parseStoredDate('05/08/2026 14:30:00');
  if (!(brParsed instanceof Date) || isNaN(brParsed.getTime())) failures.push('parseStoredDate BR: esperado Date válido, obtido ' + brParsed);
  if (brParsed && brParsed.getMonth() !== 7) failures.push('parseStoredDate BR: mês deveria ser agosto (7), obtido ' + (brParsed ? brParsed.getMonth() : 'n/a'));
  var brDateOnly = LoggingRepository.parseStoredDate('05/08/2026');
  if (!(brDateOnly instanceof Date) || isNaN(brDateOnly.getTime())) failures.push('parseStoredDate BR date-only: esperado Date válido');
  if (brDateOnly && brDateOnly.getDate() !== 5) failures.push('parseStoredDate BR date-only: dia deveria ser 5');
  var isoParsed = LoggingRepository.parseStoredDate('2026-08-05T14:30:00Z');
  if (!(isoParsed instanceof Date) || isNaN(isoParsed.getTime())) failures.push('parseStoredDate ISO: esperado Date válido');
  if (LoggingRepository.parseStoredDate('') !== null) failures.push('parseStoredDate empty: esperado null');
  if (LoggingRepository.parseStoredDate(null) !== null) failures.push('parseStoredDate null: esperado null');

  if (failures.length) {
    Logger.log('FALHOU NFE:\n' + failures.join('\n'));
    throw new Error(failures.length + ' NFe smoke test(s) falharam.');
  }

  Logger.log('OK — todos os smoke tests de NFe Entrada passaram.');
}

function runNfeProdutosSmokeTests_() {
  var failures = [];

  if (!NFeEntradaProdutosService || typeof NFeEntradaProdutosService.describe !== 'function') {
    failures.push('NFeEntradaProdutosService não registrado ou sem describe()');
  }

  var desc = NFeEntradaProdutosService.describe();
  if (desc.name !== 'nfeEntradaProdutos') failures.push('describe.name: esperado nfeEntradaProdutos, obtido ' + desc.name);
  if (!desc.actions.processarNf) failures.push('ação processarNf não encontrada');
  if (!desc.actions.processarTodasNfs) failures.push('ação processarTodasNfs não encontrada');
  if (!desc.actions.getEstoque) failures.push('ação getEstoque não encontrada');

  var r1 = NFeEntradaProdutosService.processarNf({});
  if (!r1.error) failures.push('processarNf sem numeroNf deveria retornar erro');

  var r2 = NFeEntradaProdutosService.processarNf({ numeroNf: '999' });
  if (!r2.error) failures.push('processarNf sem chaveNf deveria retornar erro');

  var r3 = NFeEntradaProdutosService.processarTodasNfs();
  if (!r3.error && !r3.totalNfProcessed) failures.push('processarTodasNfs sem sheetId deveria retornar erro ou 0');

  if (failures.length) {
    Logger.log('FALHOU NFE PRODUTOS:\n' + failures.join('\n'));
    throw new Error(failures.length + ' NFe Produtos smoke test(s) falharam.');
  }

  Logger.log('OK — todos os smoke tests de NFe Entrada Produtos passaram.');
}

function runManualSaidaSmokeTests_() {
  var failures = [];

  // fmtDateBR: string ISO (formato antigo/entrada) deve virar dd/MM/yyyy HH:mm:ss
  var iso = ManualSaidaService.fmtDateBR('2026-08-05T05:05:25.403Z');
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(iso)) {
    failures.push('fmtDateBR ISO: esperado dd/MM/yyyy HH:mm:ss, obtido ' + iso);
  }

  // fmtDateBR: string já em formato BR deve passar intacta
  var br = ManualSaidaService.fmtDateBR('05/08/2026 02:30:28');
  if (br !== '05/08/2026 02:30:28') {
    failures.push('fmtDateBR BR: deveria manter intacto, obtido ' + br);
  }

  // fmtDateBR: empty/null devem retornar string vazia
  if (ManualSaidaService.fmtDateBR(null) !== '') failures.push('fmtDateBR null deveria ser vazio');
  if (ManualSaidaService.fmtDateBR('') !== '') failures.push('fmtDateBR vazio deveria ser vazio');

  // fmtDateBR: data apenas (sem hora) permanece como string curta
  var dia = ManualSaidaService.fmtDateBR('05/08/2026');
  if (dia !== '05/08/2026') failures.push('fmtDateBR data curta deveria manter, obtido ' + dia);

  if (failures.length) {
    Logger.log('FALHOU SAIDA MANUAL:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Saida Manual smoke test(s) falharam.');
  }

  Logger.log('OK — todos os smoke tests de Saída Manual passaram.');
}

function runCarteiraShopeeSmokeTests_() {
  var failures = [];

  function expectEqual(label, actual, expected) {
    if (actual !== expected) {
      failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
    }
  }

  function expectClose(label, actual, expected, tolerance) {
    tolerance = tolerance || 0.01;
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(label + ': esperado ~' + expected + ', obtido ' + actual);
    }
  }

  // Cenário 1: describe() registrado com ações corretas
  var desc = CarteiraShopeeService.describe();
  expectEqual('describe.name', desc.name, 'carteiraShopee');
  if (!desc.actions.syncWallet) failures.push('ação syncWallet não encontrada');
  if (!desc.actions.getWalletSnapshot) failures.push('ação getWalletSnapshot não encontrada');
  if (!desc.actions.getTransacoes) failures.push('ação getTransacoes não encontrada');
  if (!desc.actions.getPayoutHistory) failures.push('ação getPayoutHistory não encontrada');

  // Cenário 2: round2 arredonda 2 casas
  expectEqual('round2(10.5551)', CarteiraShopeeService.round2(10.5551), 10.56);
  expectEqual('round2(10.5549)', CarteiraShopeeService.round2(10.5549), 10.55);
  expectEqual('round2(null)', CarteiraShopeeService.round2(null), 0);

  // Cenário 3: classificação de tipo de transação
  expectEqual('tipo venda', CarteiraShopeeService.classifyTipo({ description: 'Venda pedido 123' }), 'Venda');
  expectEqual('tipo payout', CarteiraShopeeService.classifyTipo({ description: 'Payout liberado' }), 'Payout');
  expectEqual('tipo reembolso', CarteiraShopeeService.classifyTipo({ description: 'Refund pedido' }), 'Reembolso');
  expectEqual('tipo taxa', CarteiraShopeeService.classifyTipo({ description: 'Service fee' }), 'Taxa Plataforma');
  expectEqual('tipo MONEY_OUT', CarteiraShopeeService.classifyTipo({ description: '', money_flow: 'MONEY_OUT' }), 'Taxa Plataforma');
  expectEqual('tipo fallback venda', CarteiraShopeeService.classifyTipo({ description: '' }), 'Venda');

  // Cenário 4: mapeamento de status
  expectEqual('status success', CarteiraShopeeService.mapStatus('SUCCESS'), 'Concluído');
  expectEqual('status pending', CarteiraShopeeService.mapStatus('PENDING'), 'Pendente');
  expectEqual('status cancelled', CarteiraShopeeService.mapStatus('CANCELLED'), 'Cancelado');
  expectEqual('status vazio', CarteiraShopeeService.mapStatus(''), 'Concluído');

  // Cenário 5: formatação de data epoch (seconds e millis)
  var dSec = CarteiraShopeeService.fmtDataBR(1754323200); // 2026-08-05 00:00:00 UTC
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dSec)) failures.push('fmtDataBR epoch seconds: ' + dSec);
  var dMs = CarteiraShopeeService.fmtDataBR(1754323200000);
  if (dMs !== dSec) failures.push('fmtDataBR millis deveria igualar seconds: ' + dMs + ' vs ' + dSec);
  expectEqual('fmtDataBR vazio', CarteiraShopeeService.fmtDataBR(null), '');

  // Cenário 6: buildResumoRow com dados de exemplo (regras da spec)
  var resumo = CarteiraShopeeService.buildResumoRow(
    {
      saldoDisponivel: 1250.5,
      saldoEscrow: 500,
      saldoTotal: 1750.5,
      proximoPayout: { data: '10/08/2026', valor: 500, metodo: 'PIX' },
      ultimoPayout: { data: '27/07/2026', valor: 3200 },
      rendaPeriodo: { periodo: '08/2026', total: 5000, comissoes: -1000, tarifas: 0, liquido: 4000 }
    },
    '2026-08-05T14:30:00Z',
    'OK'
  );
  expectEqual('resumo.saldoDisponivel', resumo.saldoDisponivel, 1250.5);
  expectEqual('resumo.proximoPayoutData', resumo.proximoPayoutData, '10/08/2026');
  expectEqual('resumo.metodoPayout', resumo.metodoPayout, 'PIX');
  expectEqual('resumo.comissaoShopee', resumo.comissaoShopee, -1000);
  expectEqual('resumo.liquidoPeriodo', resumo.liquidoPeriodo, 4000);
  expectEqual('resumo.statusSincronizacao', resumo.statusSincronizacao, 'OK');

  // Cenário 7: endOfMonthEpoch retorna epoch do fim do mês corrente
  var eom = CarteiraShopeeService.endOfMonthEpoch(new Date(2026, 7, 5)); // ago/2026
  if (eom <= 0) failures.push('endOfMonthEpoch: esperado > 0, obtido ' + eom);
  if (eom !== CarteiraShopeeService.endOfMonthEpoch(new Date(2026, 7, 31))) {
    failures.push('endOfMonthEpoch: deveria ser estável dentro do mesmo mês');
  }

  if (failures.length) {
    Logger.log('FALHOU CARTEIRA SHOPEE:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Carteira Shopee smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Carteira Shopee passaram.');
}

function initLogging_() {
  var result = LoggingService.init();
  if (result.error) {
    Logger.log('Erro ao inicializar logging: ' + result.error);
    return;
  }
  Logger.log('ABA LOGS criada com sucesso. Sheet ID: ' + result.sheetId);
  setupDailyCleanupTrigger_();
}

function setupDailyCleanupTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'clearOldLogs_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('clearOldLogs_')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log('Trigger diário de limpeza de logs configurado (3h da manhã).');
}

function clearOldLogs_() {
  var result = LoggingService.clearOldLogs();
  Logger.log('Limpeza de logs: ' + result.deleted + ' registros removidos.');
}

function debugNfeSync_() {
  var L = function (action, status, summary, ctx) {
    LoggingService.log({ service: 'nfeEntrada.debug', action: action, status: status || 'OK', summary: summary, context: ctx || {} });
  };

  L('debug:start', 'OK', 'Início diagnóstico da pasta Drive');

  var folderId = '1tGl8zs9GOUA1L_i2FJNoimTl00_55qKu';
  var folder = DriveApp.getFolderById(folderId);
  L('debug:folder', 'OK', 'Pasta: ' + folder.getName(), { folderId: folderId });

  var allFiles = folder.getFiles();
  var files = [];
  while (allFiles.hasNext()) {
    var f = allFiles.next();
    files.push({ name: f.getName(), mime: f.getMimeType(), size: f.getSize() });
  }
  L('debug:files', 'OK', files.length + ' arquivo(s) encontrado(s)', { files: files });

  var xmlApp = folder.getFilesByType('application/xml');
  var xmlAppCount = 0;
  while (xmlApp.hasNext()) { xmlAppCount++; xmlApp.next(); }

  var xmlText = folder.getFilesByType('text/xml');
  var xmlTextCount = 0;
  while (xmlText.hasNext()) { xmlTextCount++; xmlText.next(); }

  var pdfFiles = folder.getFilesByType('application/pdf');
  var pdfCount = 0;
  while (pdfFiles.hasNext()) { pdfCount++; pdfFiles.next(); }

  L('debug: mime counts', 'OK', 'application/xml=' + xmlAppCount + ' text/xml=' + xmlTextCount + ' application/pdf=' + pdfCount,
    { applicationXml: xmlAppCount, textXml: xmlTextCount, applicationPdf: pdfCount });

  L('debug:sheetId', 'OK', 'Sheet ID NFe: ' + ConfigService.getNfeEntradaSheetId());

  L('debug:done', 'OK', 'Diagnóstico concluído — veja os logs acima');
}

function runFormatterSmokeTests_() {
  var failures = [];

  function expect(label, actual, expected) {
    if (actual !== expected) {
      failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
    }
  }

  function expectNull(label, actual) {
    if (actual !== null) {
      failures.push(label + ': esperado null, obtido ' + JSON.stringify(actual));
    }
  }

  // Scenario 1: formatCurrency
  expect('formatCurrency(1234.56)', FormatterService.formatCurrency(1234.56), 'R$ 1.234,56');

  // Scenario 2: parseCurrency
  expect('parseCurrency("R$ 1.234,56")', FormatterService.parseCurrency('R$ 1.234,56'), 1234.56);

  // Scenario 3: Simetria format/parse
  var roundtrip = FormatterService.parseCurrency(FormatterService.formatCurrency(3456.78));
  if (Math.abs(roundtrip - 3456.78) > 0.01) failures.push('Simetria format/parse: esperado 3456.78, obtido ' + roundtrip);

  // Scenario 4: formatDate
  expect('formatDate(2026-12-30)', FormatterService.formatDate(new Date('2026-12-30T00:00:00Z')), '30/12/2026');

  // Scenario 5: parseDate
  var parsedDate = FormatterService.parseDate('30/12/2026');
  if (!parsedDate || parsedDate.getUTCFullYear() !== 2026 || parsedDate.getUTCMonth() !== 11 || parsedDate.getUTCDate() !== 30) {
    failures.push('parseDate("30/12/2026"): não retornou Date válida');
  }

  // Scenario 6: formatPercent
  expect('formatPercent(0.18)', FormatterService.formatPercent(0.18), '18,00%');

  // Scenario 7: parsePercent
  expect('parsePercent("18,00%")', FormatterService.parsePercent('18,00%'), 0.18);

  // Scenario 8: Valores negativos
  expect('formatCurrency(-123.45)', FormatterService.formatCurrency(-123.45), '-R$ 123,45');

  // Scenario 9: Nulos
  expect('formatCurrency(null)', FormatterService.formatCurrency(null), '');
  expect('formatDate(null)', FormatterService.formatDate(null), '');
  expect('formatPercent(null)', FormatterService.formatPercent(null), '');

  // Scenario 10: CNPJ
  expect('formatCNPJ', FormatterService.formatCNPJ('12345678000190'), '12.345.678/0001-90');
  expect('parseCNPJ', FormatterService.parseCNPJ('12.345.678/0001-90'), '12345678000190');

  // CPF
  expect('formatCPF', FormatterService.formatCPF('12345678901'), '123.456.789-01');
  expect('parseCPF', FormatterService.parseCPF('123.456.789-01'), '12345678901');

  // Telefone
  expect('formatPhone(11987654321)', FormatterService.formatPhone('11987654321'), '(11) 98765-4321');
  expect('formatPhone(1133334444)', FormatterService.formatPhone('1133334444'), '(11) 3333-4444');
  expect('parsePhone', FormatterService.parsePhone('(11) 98765-4321'), '11987654321');

  // CEP
  expect('formatCEP', FormatterService.formatCEP('01310100'), '01310-100');
  expect('parseCEP', FormatterService.parseCEP('01310-100'), '01310100');

  // formatTime
  expect('formatTime', FormatterService.formatTime(new Date('2026-12-30T14:30:45Z')), '14:30:45');

  // formatNumber
  expect('formatNumber(1234.567)', FormatterService.formatNumber(1234.567), '1.234,57');

  // parseNumber
  expect('parseNumber("1.234,56")', FormatterService.parseNumber('1.234,56'), 1234.56);

  // formatCurrency sem símbolo
  expect('formatCurrency(1234.5, {symbol:false})', FormatterService.formatCurrency(1234.5, { symbol: false }), '1.234,50');

  if (failures.length) {
    Logger.log('FALHOU FORMATTER:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Formatter smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Formatter passaram.');
}

function runCatalogSmokeTests_() {
  var failures = [];

  function expectClose(label, actual, expected, tolerance) {
    tolerance = tolerance || 0.5;
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(label + ': esperado ~' + expected + ', obtido ' + actual);
    }
  }

  function expectTrue(label, condition) {
    if (!condition) {
      failures.push(label + ': esperado true, obtido false');
    }
  }

  function expectEqual(label, actual, expected) {
    if (actual !== expected) {
      failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
    }
  }

  // Cenário 1: describe() retorna ações corretas
  var desc = CatalogService.describe();
  expectEqual('describe.name', desc.name, 'catalog');
  expectTrue('getProducts action', !!desc.actions.getProducts);
  expectTrue('getProductByCode action', !!desc.actions.getProductByCode);
  expectTrue('getCalculationMemory action', !!desc.actions.getCalculationMemory);

  // Cenário 2: getProducts retorna array (mesmo que vazio)
  var result = CatalogService.getProducts({ sortBy: 'code', sortOrder: 'asc' });
  if (result.error && result.error.indexOf('Sheet ID') === -1) {
    failures.push('getProducts error: ' + result.error);
  }
  if (result.success) {
    expectTrue('getProducts returns array', Array.isArray(result.data));
    expectTrue('getProducts has totalCount', typeof result.totalCount === 'number');
    expectTrue('getProducts has lastSync', typeof result.lastSync === 'string');
  }

  // Cenário 3: getProductByCode sem parâmetro retorna erro
  var r3 = CatalogService.getProductByCode({});
  expectTrue('getProductByCode without codigoProduto returns error', !!r3.error);

  // Cenário 4: getCalculationMemory sem parâmetro retorna erro
  var r4 = CatalogService.getCalculationMemory({});
  expectTrue('getCalculationMemory without params returns error', !!r4.error);

  // Cenário 5: getCalculationMemory com marketplace inválido
  var r5 = CatalogService.getCalculationMemory({ codigoProduto: 'TEST', marketplace: 'invalid' });
  expectTrue('getCalculationMemory invalid marketplace returns error', !!r5.error);

  // Cenário 6: Margem alvo inválida
  var r6 = CatalogService.getProducts({ targetMarginShopee: 1.5 });
  expectTrue('getProducts invalid margin returns error', !!r6.error);

  // Cenário 7: parseDataBR converte dd/MM/yyyy e ISO corretamente (sem inverter dia/mês)
  var brDate = CatalogService.parseDataBR('05/08/2026'); // 5 de agosto
  var isoDate = CatalogService.parseDataBR('2026-08-05T00:00:00Z');
  var brTS = CatalogService.parseDataBR('05/08/2026 14:30:00');
  expectTrue('parseDataBR BR date > 0', brDate > 0);
  expectTrue('parseDataBR ISO date > 0', isoDate > 0);
  expectTrue('parseDataBR BR datetime > 0', brTS > 0);
  // BR "05/08" deve ser maio NÃO — deve ser agosto (ts > 0 já garante parse, mas reforçamos: dia 5 mês 8 → agosto)
  var augCheck = new Date(brDate);
  expectTrue('parseDataBR BR date dia=5', augCheck.getDate() === 5);
  expectTrue('parseDataBR BR date mês=agosto', augCheck.getMonth() === 7); // 0-indexed
  // "15/08/2026" tem dia=15 (>12) que em new Date() direto seria Invalid Date; parser BR deve funcionar
  expectTrue('parseDataBR dia>12 funciona', CatalogService.parseDataBR('15/08/2026') > 0);

  if (failures.length) {
    Logger.log('FALHOU CATALOG:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Catalog smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Catalog passaram.');
}

function runCalculatorSmokeTests_() {
  var failures = [];

  function expectClose(label, actual, expected, tolerance) {
    tolerance = tolerance || 2;
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(label + ': esperado ~' + expected + ', obtido ' + actual);
    }
  }

  function expectTrue(label, condition) {
    if (!condition) {
      failures.push(label + ': esperado true, obtido false');
    }
  }

  // Cenário 1: Básico CNPJ, faixa R$100–199
  var r1 = CalculatorService.calculateML({ custoProduto: 100, margem: 0.20, regime: 'cnpj' });
  expectTrue('cenário1 success', !!r1.success);
  expectTrue('cenário1 data exists', !!r1.data);
  if (r1.data) {
    expectTrue('cenário1 faixa R$100–199', r1.data.taxasML.faixa === 'R$100–199');
    expectTrue('cenário1 taxa 14%', r1.data.taxasML.pct === 0.14);
    expectTrue('cenário1 fixa R$20', r1.data.taxasML.fixed === 20);
    expectTrue('cenário1 preco ~168-175', r1.data.precoVenda >= 165 && r1.data.precoVenda <= 180);
  }

  // Cenário 2: CPF com custo adicional
  var r2 = CalculatorService.calculateML({ custoProduto: 50, custosAdicionais: 10, margem: 0.25, regime: 'cpf' });
  expectTrue('cenário2 success', !!r2.success);
  if (r2.data) {
    expectTrue('cenário2 custoTotal 60', r2.data.custoTotal === 60);
    expectTrue('cenário2 lucro > 0', r2.data.descomposicao.lucroLiquido > 0);
  }

  // Cenário 3: Campanha + ads
  var r3 = CalculatorService.calculateML({ custoProduto: 100, margem: 0.20, campanhadeDestaque: true, adsPercent: 2 });
  expectTrue('cenário3 success', !!r3.success);
  if (r3.data) {
    expectTrue('cenário3 campanha applies', r3.data.descomposicao.menoCampanha > 0);
    expectTrue('cenário3 ads applies', r3.data.descomposicao.menosAds > 0);
  }

  // Cenário 4: Preço manual
  var r4 = CalculatorService.calculateML({ custoProduto: 50, precoVenda: 150 });
  expectTrue('cenário4 success', !!r4.success);
  if (r4.data) {
    expectTrue('cenário4 precoVenda 150', r4.data.precoVenda === 150);
    expectTrue('cenário4 precoSugerido null', r4.data.precoSugerido === null);
  }

  // Cenário 5: Vendedor iniciante
  var r5 = CalculatorService.calculateML({ custoProduto: 100, regime: 'cnpj', vendedorIniciante: true });
  expectTrue('cenário5 success', !!r5.success);
  if (r5.data) {
    expectTrue('cenário5 isento', r5.data.taxasML.isento === true);
    expectTrue('cenário5 taxa 0', r5.data.taxasML.pct === 0);
    expectTrue('cenário5 fixa 0', r5.data.taxasML.fixed === 0);
  }

  // Cenário 6: Imposto alto → aviso
  var r6 = CalculatorService.calculateML({ custoProduto: 100, impostoSimples: 0.15 });
  expectTrue('cenário6 success', !!r6.success);
  if (r6.data) {
    expectTrue('cenário6 has avisos', r6.data.avisos && r6.data.avisos.length > 0);
    var hasLowMargin = r6.data.avisos.some(function (a) { return a.tipo === 'margin_low'; });
    expectTrue('cenário6 margin_low warning', hasLowMargin);
  }

  if (failures.length) {
    Logger.log('FALHOU CALCULATOR:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Calculator smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Calculator passaram.');
}

function runPushSmokeTests_() {
  var failures = [];

  function expectEqual(label, actual, expected) {
    if (actual !== expected) {
      failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
    }
  }

  function expectNull(label, actual) {
    if (actual !== null) {
      failures.push(label + ': esperado null, obtido ' + JSON.stringify(actual));
    }
  }

  // Cenário 1: push top-level (formato com order_sn direto)
  var p1 = PushNotificationService.extractPushFields({ order_sn: '260805ABC', status: 'SHIPPED' });
  expectEqual('push top-level orderSn', p1.orderSn, '260805ABC');
  expectEqual('push top-level status', p1.status, 'SHIPPED');

  // Cenário 2: push aninhado em data (formato com data.order_sn)
  var p2 = PushNotificationService.extractPushFields({
    data: { order_sn: '260805DEF', status: 'READY_TO_SHIP' },
    timestamp: 1700000000
  });
  expectEqual('push nested orderSn', p2.orderSn, '260805DEF');
  expectEqual('push nested status', p2.status, 'READY_TO_SHIP');

  // Cenário 3: fallback order_status (nivel raiz)
  var p3 = PushNotificationService.extractPushFields({ order_sn: '260805GHI', order_status: 'CANCELLED' });
  expectEqual('push order_status fallback', p3.status, 'CANCELLED');

  // Cenário 4: corpo sem order_sn em nenhum nível -> null
  var p4 = PushNotificationService.extractPushFields({ status: 'SHIPPED' });
  expectNull('push sem order_sn', p4);

  // Cenário 5: corpo nulo / não-objeto
  expectNull('push body nulo', PushNotificationService.extractPushFields(null));
  expectNull('push body string', PushNotificationService.extractPushFields('x'));

  if (failures.length) {
    Logger.log('FALHOU PUSH:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Push smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Push Notification passaram.');
}

function runAnunciosShopeeSmokeTests_() {
  var failures = [];

  function expectEqual(label, actual, expected) {
    if (actual !== expected) {
      failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
    }
  }

  function expectTrue(label, condition) {
    if (!condition) {
      failures.push(label + ': esperado true, obtido false');
    }
  }

  // Cenário 1: describe() registrado com ações corretas
  var desc = AnunciosShopeeService.describe();
  expectEqual('describe.name', desc.name, 'anunciosShopee');
  expectTrue('ação syncListings', !!desc.actions.syncListings);
  expectTrue('ação getListings', !!desc.actions.getListings);
  expectTrue('ação getItemDetail', !!desc.actions.getItemDetail);
  expectTrue('ação updatePrice', !!desc.actions.updatePrice);
  expectTrue('ação updateStock', !!desc.actions.updateStock);
  expectTrue('ação pauseItem', !!desc.actions.pauseItem);
  expectTrue('ação activateItem', !!desc.actions.activateItem);
  expectTrue('ação deleteItem', !!desc.actions.deleteItem);
  expectTrue('ação getSalesMetrics', !!desc.actions.getSalesMetrics);
  expectTrue('ação getSKUs', !!desc.actions.getSKUs);

  // Cenário 2: mapStatus_ mapeia status Shopee -> label BR
  expectEqual('status NORMAL', AnunciosShopeeService.mapStatus_('NORMAL'), 'ativo');
  expectEqual('status UNLIST', AnunciosShopeeService.mapStatus_('UNLIST'), 'pausado');
  expectEqual('status BANNED', AnunciosShopeeService.mapStatus_('BANNED'), 'deletado');
  expectEqual('status vazio', AnunciosShopeeService.mapStatus_(''), 'ativo');

  // Cenário 3: buildItemRow_ monta linha com preço/estoque/status da payload
  var row = AnunciosShopeeService.buildItemRow_({
    item_id: 1880105397001,
    item_name: 'Camiseta Teste',
    category_id: 12345,
    item_status: 'NORMAL',
    price_info: [{ currency: 'BRL', original_price: 100, current_price: 89.9 }],
    stock_info_v2: { summary_info: { total_available_stock: 15 } },
    image: { image_url_list: ['http://img/x.jpg'] },
    has_model: false
  });
  expectEqual('ITEM_ID', String(row.ITEM_ID), '1880105397001');
  expectEqual('NOME', row.NOME, 'Camiseta Teste');
  expectEqual('PRECO', row.PRECO, 89.9);
  expectEqual('ESTOQUE', row.ESTOQUE, 15);
  expectEqual('STATUS', row.STATUS, 'ativo');
  expectEqual('TIPO_VARIACAO', row.TIPO_VARIACAO, 'sem_variacao');
  expectEqual('MOEDA', row.MOEDA, 'BRL');
  expectTrue('IMAGEM_URL', row.IMAGEM_URL === 'http://img/x.jpg');

  // Cenário 4: buildItemRow_ com variação
  var rowVar = AnunciosShopeeService.buildItemRow_({
    item_id: 1,
    item_status: 'UNLIST',
    has_model: true,
    price_info: [{ currency: 'BRL', current_price: 20 }],
    stock_info_v2: { summary_info: { total_available_stock: 0 } }
  });
  expectEqual('STATUS variação', rowVar.STATUS, 'pausado');
  expectEqual('TIPO_VARIACAO com modelo', rowVar.TIPO_VARIACAO, '1_nivel');

  // Cenário 5: nowBR_ formata dd/MM/yyyy HH:mm:ss
  expectTrue('nowBR_ formato BR', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(AnunciosShopeeService.nowBR_()));

  if (failures.length) {
    Logger.log('FALHOU ANUNCIOS SHOPEE:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Anuncios Shopee smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Anúncios Shopee passaram.');
}

function runWriteAuditSmokeTests_() {
  var failures = [];

  function expectTrue(label, condition) {
    if (!condition) failures.push(label);
  }

  // Cenário 1: logWriteAudit grava entrada e retorna auditId
  var sheetId = ConfigService.getSheetId();
  var result = SheetsRepository.logWriteAudit({
    sheet: 'TESTE_AUDIT', operation: 'APPEND', status: 'OK',
    stats: { rows: 3, inserted: 3 },
    caller: 'smokeTest', rowId: 'TESTE-001',
    detail: 'smoke test de auditoria'
  });
  expectTrue('auditId retornado', !!result.success && !!result.auditId);

  // Cenário 2: auditId no formato YYYYMMDDHHMMSS-nonce8
  expectTrue('auditId formato', /^\d{14}-[0-9a-f]{8}$/.test(result.auditId));

  // Cenário 3: linha gravada na aba com conteúdo esperado
  var sheet = SpreadsheetApp.openById(sheetId).getSheetByName('AUDIT_LOG');
  if (sheet) {
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(lastRow, 1, 1, 12).getValues()[0];
    expectTrue('AUDIT_ID igual', String(values[0]) === result.auditId);
    expectTrue('SHEET igual', values[1] === 'TESTE_AUDIT');
    expectTrue('OPERATION igual', values[2] === 'APPEND');
    expectTrue('INSERTED igual', values[5] === 3);
    expectTrue('CALLER igual', values[8] === 'smokeTest');
    expectTrue('CREATED_AT formato BR', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(String(values[11])));
  } else {
    failures.push('Aba AUDIT_LOG não criada');
  }

  // Cenário 4: chamada sem planilha não lança (falha vira warn)
  var safe = SheetsRepository.logWriteAudit({ sheet: 'X', operation: 'APPEND' });
  expectTrue('não lança exceção', !safe || safe.success === true || safe.success === false);

  if (failures.length) {
    Logger.log('FALHOU WRITE AUDIT:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Write Audit smoke test(s) falharam — ver log.');
  }
  Logger.log('OK — todos os smoke tests de Write Audit passaram.');
}

function setupAnunciosShopeeTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncAnunciosShopeeDaily') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('syncAnunciosShopeeDaily')
    .timeBased()
    .atHour(3) // 03:00 BRT = 06:00 UTC (script tz é America/Sao_Paulo)
    .everyDays(1)
    .create();

  Logger.log('Trigger diário de sync de anúncios Shopee configurado (06:00 UTC / 03:00 BRT).');
}

function syncAnunciosShopeeDaily() {
  var result = AnunciosShopeeService.syncListings({ forceFresh: true });
  Logger.log('Sync diário anúncios Shopee: success=' + result.success +
    ' atualizados=' + (result.synced ? result.synced.itemsAtualizados : 0) +
    ' novos=' + (result.synced ? result.synced.novosCriados : 0) +
    ' erros=' + result.errors.length);
}

function runEstoqueBaixaSmokeTests_() {
  var failures = [];

  function expectTrue(label, condition) {
    if (!condition) failures.push(label + ': esperado true, obtido false');
  }

  function expectEqual(label, actual, expected) {
    if (actual !== expected) failures.push(label + ': esperado "' + expected + '", obtido "' + actual + '"');
  }

  // Cenário 1: Repositories e Services existem
  expectTrue('EstoqueRepository existe', typeof EstoqueRepository !== 'undefined');
  expectTrue('EstoqueBaixaService existe', typeof EstoqueBaixaService !== 'undefined');
  expectTrue('EstoqueBaixasRepository existe', typeof EstoqueBaixasRepository !== 'undefined');

  // Cenário 2: describe() retorna ações corretas
  var desc = EstoqueBaixaService.describe();
  expectEqual('describe.name', desc.name, 'estoqueBaixa');
  expectTrue('ação baixarPorProduto', !!desc.actions.baixarPorProduto);
  expectTrue('ação reverterBaixa', !!desc.actions.reverterBaixa);
  expectTrue('ação backfillExistingOrders', !!desc.actions.backfillExistingOrders);

  // Cenário 3: getItemsDisponivelPorProduto retorna array (precisa sheetId real)
  var sheetId = ConfigService.getSheetId();
  if (sheetId) {
    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, 'TEST_SKU_NONEXISTENT');
    expectTrue('getItemsDisponivelPorProduto retorna array', Array.isArray(items));

    // Cenário 4: Itens retornados têm campo BAIXADO
    if (items.length > 0) {
      var first = items[0];
      expectTrue('item tem ESTOQUE_ID', typeof first.ESTOQUE_ID !== 'undefined');
      expectTrue('item tem SKU', typeof first.SKU !== 'undefined');
      expectTrue('item tem BAIXADO', typeof first.BAIXADO !== 'undefined');
      expectTrue('item BAIXADO é S ou N', first.BAIXADO === 'S' || first.BAIXADO === 'N' || first.BAIXADO === '');
    }
  } else {
    failures.push('ConfigService.getSheetId() retornou vazio — não pode testar I/O');
  }

  // Cenário 5: baixarPorProduto sem params retorna erro
  var r5 = EstoqueBaixaService.baixarPorProduto({});
  expectTrue('baixarPorProduto sem sheetId retorna erro', !!r5.error);

  // Cenário 6: reverterBaixa sem params retorna erro
  var r6 = EstoqueBaixaService.reverterBaixa({});
  expectTrue('reverterBaixa sem params retorna erro', !!r6.error);

  if (failures.length) {
    Logger.log('FALHOU ESTOQUE BAIXA:\n' + failures.join('\n'));
    throw new Error(failures.length + ' Estoque Baixa smoke test(s) falharam — ver log.');
  }

  Logger.log('OK — todos os smoke tests de Estoque Baixa passaram.');
}

function backfillSkus() {
  Logger.log('Iniciando backfill de SKUs...');
  var result = SkuService.backfill({ dryRun: false });
  Logger.log('Backfill concluído: processados=' + result.processed +
    ' gerados=' + result.generated + ' ignorados=' + result.skipped);
  return result;
}
