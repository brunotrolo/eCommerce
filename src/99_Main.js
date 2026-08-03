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
      )
      .addSeparator()
      .addSubMenu(
        SpreadsheetApp.getUi().createMenu('Testes (Smoke Tests)')
          .addItem('Pricing', 'runSmokeTests_')
          .addItem('NFe Entrada', 'runNfeSmokeTests_')
          .addItem('NFe Produtos', 'runNfeProdutosSmokeTests_')
          .addItem('Formatter', 'runFormatterSmokeTests_')
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

  // sanitizeForClient_: Date deve virar ISO string para google.script.run
  var sanitized = ServiceRegistry.sanitizeForClient({
    data_emissao: new Date('2026-05-05T12:00:00-03:00'),
    valor_total: 123.45,
    extra: undefined
  });
  if (sanitized.data_emissao !== '2026-05-05T15:00:00.000Z') failures.push('sanitizeForClient: Date deveria virar ISO string, obtido ' + sanitized.data_emissao);
  if (!('extra' in sanitized)) failures.push('sanitizeForClient: undefined perdeu o campo?');
  if (sanitized.extra !== '') failures.push('sanitizeForClient: undefined deveria virar string vazia');
  if (sanitized.valor_total !== 123.45) failures.push('sanitizeForClient: número deveria passar intacto');
  if (!Array.isArray(ServiceRegistry.sanitizeForClient([1, new Date(0)]))) failures.push('sanitizeForClient: array deveria virar array');

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
