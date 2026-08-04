/**
 * OrdersRepository — leitura/escrita na aba PEDIDOS do Google Sheets.
 * Usado para importação de pedidos Shopee via Tiops.
 * Regras completas em specs/orders-import.md.
 */
var OrdersRepository = (function () {
  var SHEET_NAME = 'PEDIDOS';
  var _sheetCache = null;
  var _sheetCacheTs = 0;
  var SHEET_CACHE_TTL = 30000;

  function getOrCreateSheet() {
    var now = Date.now();
    if (_sheetCache && (now - _sheetCacheTs) < SHEET_CACHE_TTL) {
      return _sheetCache;
    }
    var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.setFrozenRows(1);
    }
    _sheetCache = sheet;
    _sheetCacheTs = now;
    return sheet;
  }

  function getAllOrderIds() {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var orderIdCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === 'order_id') {
        orderIdCol = i + 1;
        break;
      }
    }
    if (orderIdCol === -1) return [];

    var allIds = sheet.getRange(2, orderIdCol, lastRow - 1, 1).getValues();
    var ids = [];
    for (var j = 0; j < allIds.length; j++) {
      var v = String(allIds[j][0]).trim();
      if (v) ids.push(v);
    }
    return ids;
  }

  function getByOrderId(orderId) {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return null;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var orderIdCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === 'order_id') {
        orderIdCol = i + 1;
        break;
      }
    }
    if (orderIdCol === -1) return null;

    var allIds = sheet.getRange(2, orderIdCol, lastRow - 1, 1).getValues();
    for (var j = 0; j < allIds.length; j++) {
      if (String(allIds[j][0]).trim() === String(orderId).trim()) {
        var rowData = sheet.getRange(j + 2, 1, 1, lastCol).getValues()[0];
        var obj = {};
        for (var k = 0; k < headers.length; k++) {
          obj[String(headers[k]).trim()] = rowData[k];
        }
        return obj;
      }
    }
    return null;
  }

  function insertOrdersBulk(orders) {
    if (!orders || orders.length === 0) return { success: true, inserted: 0 };

    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();

    if (lastCol === 0) {
      var allKeys = [];
      var keySet = {};
      for (var a = 0; a < orders.length; a++) {
        var keys = Object.keys(orders[a]);
        for (var b = 0; b < keys.length; b++) {
          if (!keySet[keys[b]]) {
            keySet[keys[b]] = true;
            allKeys.push(keys[b]);
          }
        }
      }
      sheet.getRange(1, 1, 1, allKeys.length).setValues([allKeys]);
      for (var h = 0; h < allKeys.length; h++) {
        sheet.getRange(1, h + 1).setFontWeight('bold').setBackground('#f0f0f0');
      }
      lastCol = allKeys.length;
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var existingHeaders = {};
    for (var e = 0; e < headers.length; e++) {
      existingHeaders[String(headers[e]).trim()] = e + 1;
    }

    var allNewKeys = {};
    for (var n = 0; n < orders.length; n++) {
      var oKeys = Object.keys(orders[n]);
      for (var p = 0; p < oKeys.length; p++) {
        if (!existingHeaders[oKeys[p]] && !allNewKeys[oKeys[p]]) {
          allNewKeys[oKeys[p]] = true;
        }
      }
    }

    var missingHeaders = Object.keys(allNewKeys);
    if (missingHeaders.length > 0) {
      var startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      for (var q = 0; q < missingHeaders.length; q++) {
        existingHeaders[missingHeaders[q]] = startCol + q;
      }
      lastCol = sheet.getLastColumn();
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }

    var matrix = [];
    for (var r = 0; r < orders.length; r++) {
      var row = [];
      for (var s = 0; s < headers.length; s++) {
        var key = String(headers[s]).trim();
        row.push(orders[r][key] !== undefined ? orders[r][key] : '');
      }
      matrix.push(row);
    }

    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, matrix.length, headers.length).setValues(matrix);

    return { success: true, inserted: matrix.length };
  }

  function insertOrder(order) {
    return insertOrdersBulk([order]);
  }

  function getAll() {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var rows = [];
    for (var i = 0; i < allValues.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[String(headers[j]).trim()] = allValues[i][j];
      }
      rows.push(obj);
    }
    return rows;
  }

  return {
    getOrCreateSheet: getOrCreateSheet,
    getAllOrderIds: getAllOrderIds,
    getByOrderId: getByOrderId,
    insertOrdersBulk: insertOrdersBulk,
    insertOrder: insertOrder,
    getAll: getAll
  };
})();
