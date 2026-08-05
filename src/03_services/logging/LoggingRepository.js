/**
 * LoggingRepository — leitura/escrita na aba LOGS do Google Sheets.
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 */
var LoggingRepository = (function () {
  var SHEET_NAME = 'LOGS';
  var HEADERS = [
    'UPDATED_AT', 'SERVICE', 'ACTION', 'STATUS', 'CALLER',
    'SUMMARY', 'DURATION_MS', 'ERROR_MESSAGE', 'CONTEXT',
    'ENVIRONMENT', 'LOG_ID'
  ];
  var MAX_CONTEXT_BYTES = 50000;
  var RETENTION_DAYS = 90;

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
    }
    return sheet;
  }

  function sheetExists(sheetId) {
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      return !!ss.getSheetByName(SHEET_NAME);
    } catch (e) {
      return false;
    }
  }

  function insertLog(entry, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var contextStr = '';
    if (entry.context) {
      try {
        contextStr = JSON.stringify(entry.context);
        if (contextStr.length > MAX_CONTEXT_BYTES) {
          contextStr = contextStr.substring(0, MAX_CONTEXT_BYTES - 20) + ',"_truncated":true}';
        }
      } catch (e) {
        contextStr = '{"_serializeError":"' + (e.message || 'unknown') + '"}';
      }
    }

    var row = [
      entry.updatedAt || nowBR_(),
      entry.service || '',
      entry.action || '',
      entry.status || '',
      entry.caller || 'system',
      entry.summary || '',
      entry.durationMs || 0,
      entry.errorMessage || '',
      contextStr,
      entry.environment || 'dev',
      entry.logId || ''
    ];
    sheet.appendRow(row);
  }

  function getLogs(filters, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    var logs = [];
    for (var i = 1; i < values.length; i++) {
      var obj = {};
      for (var j = 0; j < HEADERS.length; j++) {
        obj[HEADERS[j]] = values[i][j];
      }

      if (filters.service && obj.SERVICE !== filters.service) continue;
      if (filters.status && obj.STATUS !== filters.status) continue;

      logs.push(obj);
    }

    logs.reverse();
    var limit = filters.limit || 50;
    return logs.slice(0, limit);
  }

  function clearOldLogs(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return { deleted: 0 };

    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    var rowsToDelete = [];
    for (var i = 1; i < values.length; i++) {
      var dateStr = values[i][0];
      if (!dateStr) continue;
      var logDate = parseStoredDate_(dateStr);
      if (!logDate) continue;
      if (logDate < cutoff) {
        rowsToDelete.push(i + 1);
      }
    }

    for (var j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
    }

    return { deleted: rowsToDelete.length };
  }

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  function parseStoredDate_(str) {
    if (typeof str === 'object' && str instanceof Date) return str;
    var s = String(str || '').trim();
    if (!s) return null;
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      return new Date(
        Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4]) || 0, Number(m[5]) || 0, Number(m[6]) || 0
      );
    }
    var legacy = new Date(s);
    return isNaN(legacy.getTime()) ? null : legacy;
  }

  return {
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    sheetExists: sheetExists,
    insertLog: insertLog,
    getLogs: getLogs,
    clearOldLogs: clearOldLogs,
    // Exposto para smoke tests (lógica pura)
    parseStoredDate: parseStoredDate_
  };
})();
