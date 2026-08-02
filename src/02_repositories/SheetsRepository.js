/**
 * SheetsRepository — leitura/escrita na planilha "eCommerce" já existente
 * (ConfigService.getSheetId()). Usado para histórico/log leve (ex.: log de
 * cálculo de preço, log de sincronização de preço/estoque). Nenhum serviço
 * chama SpreadsheetApp diretamente.
 */
var SheetsRepository = (function () {
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
  }

  /** Lê uma aba como lista de objetos, usando a primeira linha como cabeçalho. */
  function getRows(sheetName) {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var headers = values[0];
    return values.slice(1).map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = row[i];
      });
      return obj;
    });
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getOrCreateSheet: getOrCreateSheet,
    appendRow: appendRow,
    getRows: getRows
  };
})();
