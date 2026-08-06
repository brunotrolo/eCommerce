/**
 * ConfigRepository — leitura da aba CONFIG do Google Sheets.
 * Estrutura: CHAVE | VALOR | DESCRIÇÃO
 * Cada linha é uma propriedade parametrizável (taxas, margens, IDs, etc.).
 * Regras completas em specs/config.md (quando existir).
 */
var ConfigRepository = (function () {
  var SHEET_NAME = 'CONFIG';
  var HEADERS = ['CHAVE', 'VALOR', 'DESCRICAO'];

  var DEFAULTS = {
    shopee_fee_pct: 0.20,
    shopee_fee_fixed: 0,
    ml_fee_pct: 0.14,
    ml_fee_fixed: 6,
    default_margin_pct: 0.25,
    shopee_account_id: '1880105398',
    ml_account_id: '3520412809',
    sincronizar: JSON.stringify([
      'nfeEntrada.syncAndUpdateSheets',
      'estoque.sincronizar',
      'estoque.sincronizarPrecosCatalogo',
      'anunciosShopee.syncListings',
      'ordersImport.importShopeeOrders',
      'carteiraShopee.syncWallet'
    ])
  };

  function getOrCreateSheet(sheetId) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');

      var keys = Object.keys(DEFAULTS);
      for (var i = 0; i < keys.length; i++) {
        var desc = '';
        if (keys[i].indexOf('fee_pct') !== -1) desc = 'Taxa percentual (ex.: 0.20 = 20%)';
        else if (keys[i].indexOf('fee_fixed') !== -1) desc = 'Taxa fixa em R$';
        else if (keys[i].indexOf('margin') !== -1) desc = 'Margem padrao (ex.: 0.25 = 25%)';
        else if (keys[i].indexOf('account_id') !== -1) desc = 'ID da conta no marketplace';
        else if (keys[i] === 'sincronizar') desc = 'JSON com ordem das acoes de sincronizacao';
        sheet.appendRow([keys[i], DEFAULTS[keys[i]], desc]);
      }
      return sheet;
    }
    return sheet;
  }

  function getAll(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return DEFAULTS;

    var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var config = {};
    var keys = Object.keys(DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      config[keys[i]] = DEFAULTS[keys[i]];
    }

    for (var j = 0; j < values.length; j++) {
      var chave = String(values[j][0]).trim();
      var valor = values[j][1];
      if (chave && DEFAULTS.hasOwnProperty(chave)) {
        if (typeof DEFAULTS[chave] === 'number') {
          config[chave] = parseFloat(valor) || DEFAULTS[chave];
        } else {
          config[chave] = String(valor) || DEFAULTS[chave];
        }
      }
    }
    return config;
  }

  function get(sheetId, chave) {
    var config = getAll(sheetId);
    return config[chave] !== undefined ? config[chave] : null;
  }

  function set(sheetId, chave, valor) {
    var sheet = getOrCreateSheet(sheetId);
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][0]).trim() === chave) {
          sheet.getRange(i + 2, 2).setValue(valor);
          return { success: true };
        }
      }
    }
    var desc = '';
    if (chave.indexOf('fee_pct') !== -1) desc = 'Taxa percentual';
    else if (chave.indexOf('fee_fixed') !== -1) desc = 'Taxa fixa em R$';
    else if (chave.indexOf('margin') !== -1) desc = 'Margem padrao';
    else if (chave.indexOf('account_id') !== -1) desc = 'ID da conta';
    else if (chave === 'sincronizar') desc = 'JSON com ordem das acoes de sincronizacao';
    sheet.appendRow([chave, valor, desc]);
    return { success: true };
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    DEFAULTS: DEFAULTS,
    getOrCreateSheet: getOrCreateSheet,
    getAll: getAll,
    get: get,
    set: set
  };
})();
