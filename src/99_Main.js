/**
 * Funções utilitárias para rodar manualmente pelo editor do Apps Script
 * (nunca por trigger/Web App). setup_() configura a API key uma única vez;
 * runSmokeTests_() cobre os critérios de aceite de specs/pricing.md.
 * onOpen() cria o menu customizado no editor GAS.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('eCommerce')
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('NFe Entrada')
        .addItem('Configurar Sheet ID', 'showNfeConfigDialog_')
    )
    .addToUi();
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

  if (failures.length) {
    Logger.log('FALHOU NFE:\n' + failures.join('\n'));
    throw new Error(failures.length + ' NFe smoke test(s) falharam.');
  }

  Logger.log('OK — todos os smoke tests de NFe Entrada passaram.');
}
