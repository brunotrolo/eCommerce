/**
 * EstoqueBaixasRepository — leitura/escrita na aba ESTOQUE_BAIXAS do Google Sheets.
 * Log de negócio para baixas/reversões de estoque (FIFO).
 * Regras de negócio documentadas no código abaixo.
 */
var EstoqueBaixasRepository = (function () {
  var SHEET_NAME = 'ESTOQUE_BAIXAS';
  var HEADERS = [
    'BAIXA_ID', 'REFERENCIA_ORIGEM', 'ORIGEM', 'CODIGO_PRODUTO',
    'QUANTIDADE', 'ESTOQUE_IDS', 'IDEMPOTENCY_KEY', 'STATUS',
    'CRIADO_EM', 'REVERTIDO_EM'
  ];

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
      return sheet;
    }

    var lastCol = sheet.getLastColumn();
    var existingHeaders = [];
    if (lastCol > 0) {
      existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }

    var headerMap = {};
    for (var i = 0; i < existingHeaders.length; i++) {
      var h = String(existingHeaders[i]).trim();
      if (h) headerMap[h] = i + 1;
    }

    var missingHeaders = [];
    for (var j = 0; j < HEADERS.length; j++) {
      if (!headerMap[HEADERS[j]]) {
        missingHeaders.push(HEADERS[j]);
      }
    }

    if (missingHeaders.length > 0) {
      var startCol = lastCol + 1;
      var range = sheet.getRange(1, startCol, 1, missingHeaders.length);
      range.setValues([missingHeaders]);
      sheet.setFrozenRows(1);
    }

    return sheet;
  }

  function getColumnMap_(sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h) map[h] = i + 1;
    }
    return map;
  }

  function getRows(sheetId, filters) {
    var sheet = getOrCreateSheet(sheetId);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerOrder = [];
    for (var h = 0; h < headers.length; h++) {
      headerOrder.push(String(headers[h]).trim());
    }

    var rows = [];
    for (var i = 0; i < allValues.length; i++) {
      var obj = {};
      for (var j = 0; j < headerOrder.length; j++) {
        if (headerOrder[j]) {
          obj[headerOrder[j]] = allValues[i][j];
        }
      }
      rows.push(obj);
    }

    if (filters) {
      if (filters.referenciaOrigem) {
        rows = rows.filter(function (r) {
          return String(r.REFERENCIA_ORIGEM || '').trim() === String(filters.referenciaOrigem).trim();
        });
      }
      if (filters.idempotencyKey) {
        rows = rows.filter(function (r) {
          return String(r.IDEMPOTENCY_KEY || '').trim() === String(filters.idempotencyKey).trim();
        });
      }
      if (filters.status) {
        rows = rows.filter(function (r) {
          return String(r.STATUS || '').trim() === String(filters.status).trim();
        });
      }
      if (filters.origem) {
        rows = rows.filter(function (r) {
          return String(r.ORIGEM || '').trim() === String(filters.origem).trim();
        });
      }
    }

    return rows;
  }

  function findByIdempotencyKey(sheetId, key) {
    var rows = getRows(sheetId, { idempotencyKey: key });
    return rows.length > 0 ? rows[0] : null;
  }

  function findByReferenciaOrigem(sheetId, ref) {
    var rows = getRows(sheetId, { referenciaOrigem: ref });
    return rows.length > 0 ? rows[0] : null;
  }

  function insertRow(sheetId, rowData) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var newRow = sheet.getLastRow() + 1;

    var fieldToHeader = {
      baixaId: 'BAIXA_ID',
      referenciaOrigem: 'REFERENCIA_ORIGEM',
      origem: 'ORIGEM',
      codigoProduto: 'CODIGO_PRODUTO',
      quantidade: 'QUANTIDADE',
      estoqueIds: 'ESTOQUE_IDS',
      idempotencyKey: 'IDEMPOTENCY_KEY',
      status: 'STATUS',
      criadoEm: 'CRIADO_EM',
      revertidoEm: 'REVERTIDO_EM'
    };

    var keys = Object.keys(fieldToHeader);
    for (var k = 0; k < keys.length; k++) {
      var field = keys[k];
      var header = fieldToHeader[field];
      var col = colMap[header];
      if (!col) continue;

      var value = rowData[field];
      if (value === undefined || value === null) {
        value = '';
      }
      sheet.getRange(newRow, col).setValue(value);
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'APPEND', status: 'OK',
      stats: { rows: 1, inserted: 1 }, caller: 'EstoqueBaixasRepository',
      rowId: rowData.baixaId || ''
    });

    return { success: true, rowNumber: newRow };
  }

  function updateRowByBaixaId(sheetId, baixaId, updates) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, error: 'No data rows' };

    var idCol = colMap['BAIXA_ID'];
    if (!idCol) return { success: false, error: 'BAIXA_ID column not found' };

    var allIds = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < allIds.length; i++) {
      if (String(allIds[i][0]).trim() === String(baixaId).trim()) {
        targetRow = i + 2;
        break;
      }
    }
    if (targetRow === -1) return { success: false, error: 'Baixa not found: ' + baixaId };

    var fieldToHeader = {
      status: 'STATUS',
      estoqueIds: 'ESTOQUE_IDS',
      quantidade: 'QUANTIDADE',
      revertidoEm: 'REVERTIDO_EM'
    };

    var keys = Object.keys(updates);
    for (var k = 0; k < keys.length; k++) {
      var field = keys[k];
      var header = fieldToHeader[field];
      if (!header || !colMap[header]) continue;
      sheet.getRange(targetRow, colMap[header]).setValue(updates[field]);
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'UPDATE', status: 'OK',
      stats: { rows: 1, updated: 1 }, caller: 'EstoqueBaixasRepository',
      rowId: baixaId || ''
    });

    return { success: true, row: targetRow };
  }

  function getPendingReprocess() {
    var sheet = getOrCreateSheet(ConfigService.getSheetId());
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerOrder = [];
    for (var h = 0; h < headers.length; h++) {
      headerOrder.push(String(headers[h]).trim());
    }

    var rows = [];
    for (var i = 0; i < allValues.length; i++) {
      var obj = {};
      for (var j = 0; j < headerOrder.length; j++) {
        if (headerOrder[j]) {
          obj[headerOrder[j]] = allValues[i][j];
        }
      }
      if (String(obj.STATUS || '').trim() === 'PENDENTE_MAPEAMENTO') {
        rows.push(obj);
      }
    }

    return rows;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getRows: getRows,
    findByIdempotencyKey: findByIdempotencyKey,
    findByReferenciaOrigem: findByReferenciaOrigem,
    insertRow: insertRow,
    updateRowByBaixaId: updateRowByBaixaId,
    getPendingReprocess: getPendingReprocess
  };
})();
