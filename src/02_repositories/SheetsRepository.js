/**
 * SheetsRepository — leitura/escrita na planilha "eCommerce" já existente
 * (ConfigService.getSheetId()). Usado para histórico/log leve (ex.: log de
 * cálculo de preço, log de sincronização de preço/estoque). Nenhum serviço
 * chama SpreadsheetApp diretamente.
 */
var SheetsRepository = (function () {
  var _rowsCache = {};
  var ROWS_CACHE_TTL = 120000;
  var AUDIT_SHEET = 'AUDIT_LOG';
  var AUDIT_HEADERS = [
    'AUDIT_ID', 'SHEET', 'OPERATION', 'STATUS', 'ROWS', 'INSERTED',
    'UPDATED', 'DELETED', 'CALLER', 'ROW_ID', 'DETAIL', 'CREATED_AT'
  ];
  var AUDIT_DETAIL_MAX = 5000;

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
   * Audit de operações de escrita. Não lança exceção — falha vira console.warn.
   * Regras completas em specs/write-audit.md.
   */
  function logWriteAudit(params) {
    params = params || {};
    try {
      var entry = {
        auditId: generateAuditId_(),
        sheet: String(params.sheet || ''),
        operation: String(params.operation || ''),
        status: String(params.status || 'OK'),
        rows: params.stats && params.stats.rows != null ? params.stats.rows : 0,
        inserted: params.stats && params.stats.inserted != null ? params.stats.inserted : 0,
        updated: params.stats && params.stats.updated != null ? params.stats.updated : 0,
        deleted: params.stats && params.stats.deleted != null ? params.stats.deleted : 0,
        caller: params.caller || 'system',
        rowId: params.rowId || '',
        detail: truncate_(params.detail || '', AUDIT_DETAIL_MAX),
        createdAt: nowBR_()
      };
      var sheet = getOrCreateSheet(AUDIT_SHEET, AUDIT_HEADERS);
      sheet.appendRow([
        entry.auditId, entry.sheet, entry.operation, entry.status,
        entry.rows, entry.inserted, entry.updated, entry.deleted,
        entry.caller, entry.rowId, entry.detail, entry.createdAt
      ]);
      return { success: true, auditId: entry.auditId };
    } catch (e) {
      console.warn('[SheetsRepository] Falha ao registrar audit: ' + (e.message || e));
      return { success: false, error: e.message || String(e) };
    }
  }

  function generateAuditId_() {
    var now = new Date();
    var ts = now.getFullYear().toString() +
      pad_(now.getMonth() + 1) +
      pad_(now.getDate()) +
      pad_(now.getHours()) +
      pad_(now.getMinutes()) +
      pad_(now.getSeconds());
    var nonce = '';
    for (var i = 0; i < 8; i++) {
      nonce += Math.floor(Math.random() * 16).toString(16);
    }
    return ts + '-' + nonce;
  }

  function pad_(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function truncate_(str, max) {
    var s = String(str == null ? '' : str);
    if (s.length <= max) return s;
    return s.substring(0, max) + '...';
  }

  function nowBR_() {
    try {
      return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
      return String(new Date());
    }
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
