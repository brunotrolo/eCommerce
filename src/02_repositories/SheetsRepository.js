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

  function updateCell(sheetName, rowIndex, columnName, value) {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return false;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colIndex = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === columnName) {
        colIndex = i + 1;
        break;
      }
    }

    if (colIndex === -1) {
      colIndex = headers.length + 1;
      sheet.getRange(1, colIndex).setValue(columnName);
    }

    sheet.getRange(rowIndex, colIndex).setValue(value);
    invalidateRowsCache(sheetName);
    return true;
  }

  /**
   * Adapter: redireciona para LoggingService.log (aba LOGS).
   * Mantém a assinatura antiga {sheet, operation, status, stats, caller, detail}
   * para nao quebrar os 38 callers existentes, mas grava na aba LOGS unificada.
   */
  function logWriteAudit(params) {
    params = params || {};
    try {
      var stats = params.stats || {};
      var summary = params.detail || params.operation || '';
      if (stats.inserted || stats.updated || stats.deleted || stats.rows) {
        summary = summary + ' [rows=' + (stats.rows || 0) + ', ins=' + (stats.inserted || 0) + ', upd=' + (stats.updated || 0) + ', del=' + (stats.deleted || 0) + ']';
      }
      var context = {
        sheet: params.sheet || '',
        operation: params.operation || '',
        rowId: params.rowId || '',
        stats: stats
      };
      LoggingService.log({
        service: params.sheet || 'write-audit',
        action: params.operation || 'WRITE',
        status: params.status || 'OK',
        caller: params.caller || 'system',
        summary: truncate_(summary, 5000),
        context: context
      });
      return { success: true };
    } catch (e) {
      console.warn('[SheetsRepository] Falha ao registrar log: ' + (e.message || e));
      return { success: false, error: e.message || String(e) };
    }
  }

  function truncate_(str, max) {
    var s = String(str == null ? '' : str);
    if (s.length <= max) return s;
    return s.substring(0, max) + '...';
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getOrCreateSheet: getOrCreateSheet,
    appendRow: appendRow,
    getRows: getRows,
    invalidateRowsCache: invalidateRowsCache,
    logWriteAudit: logWriteAudit,
    updateCell: updateCell
  };
})();
