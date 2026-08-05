/**
 * SheetsRepository — leitura/escrita na planilha "eCommerce" já existente
 * (ConfigService.getSheetId()). Usado para histórico/log leve (ex.: log de
 * cálculo de preço, log de sincronização de preço/estoque). Nenhum serviço
 * chama SpreadsheetApp diretamente.
 */
var SheetsRepository = (function () {
  var _rowsCache = {};
  var ROWS_CACHE_TTL = 120000;

  function getSpreadsheet() {
    return SpreadsheetApp.openById(ConfigService.getSheetId());
  }

  function getOrCreateSheet(sheetName, headerRow) {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (headerRow && headerRow.length) {
        sheet.appendRow(headerRow);
      }
    }
    return sheet;
  }

  function appendRow(sheetName, headerRow, rowValues) {
    var sheet = getOrCreateSheet(sheetName, headerRow);
    sheet.appendRow(rowValues);
    invalidateRowsCache(sheetName);
  }

  function getRows(sheetName) {
    var now = Date.now();
    var cached = _rowsCache[sheetName];
    if (cached && (now - cached.timestamp) < ROWS_CACHE_TTL) {
      return cached.value;
    }
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var headers = values[0];
    var rows = values.slice(1).map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = row[i];
      });
      return obj;
    });
    _rowsCache[sheetName] = { value: rows, timestamp: now };
    return rows;
  }

  function invalidateRowsCache(sheetName) {
    if (sheetName) {
      delete _rowsCache[sheetName];
    } else {
      _rowsCache = {};
    }
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getOrCreateSheet: getOrCreateSheet,
    appendRow: appendRow,
    getRows: getRows,
    invalidateRowsCache: invalidateRowsCache
  };
})();
