/**
 * OrdersRepository — leitura/escrita na aba PEDIDOS do Google Sheets.
 * Usado para importação de pedidos Shopee via Tiops.
 * Regras completas em specs/orders-import.md.
 */
var OrdersRepository = (function () {
  var SHEET_NAME = 'PEDIDOS';

  function getOrCreateSheet() {
    var ss = SpreadsheetApp.openById(ConfigService.getSheetId());
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function getHeaders_() {
    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  }

  function getColumnMap_() {
    var headers = getHeaders_();
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h) map[h] = i + 1;
    }
    return map;
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

  function insertOrder(order) {
    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();

    if (lastCol === 0) {
      var keys = Object.keys(order);
      sheet.getRange(1, 1, 1, keys.length).setValues([keys]);
      for (var h = 0; h < keys.length; h++) {
        sheet.getRange(1, h + 1).setFontWeight('bold').setBackground('#f0f0f0');
      }
      var values = [];
      for (var v = 0; v < keys.length; v++) {
        values.push(order[keys[v]]);
      }
      sheet.getRange(2, 1, 1, keys.length).setValues([values]);
      return { success: true, rowNumber: 2 };
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var existingHeaders = {};
    for (var e = 0; e < headers.length; e++) {
      existingHeaders[String(headers[e]).trim()] = e + 1;
    }

    var newKeys = Object.keys(order);
    var missingHeaders = [];
    for (var m = 0; m < newKeys.length; m++) {
      if (!existingHeaders[newKeys[m]]) {
        missingHeaders.push(newKeys[m]);
      }
    }

    if (missingHeaders.length > 0) {
      var startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      for (var n = 0; n < missingHeaders.length; n++) {
        existingHeaders[missingHeaders[n]] = startCol + n;
      }
      lastCol = sheet.getLastColumn();
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }

    var newRow = sheet.getLastRow() + 1;
    var rowValues = [];
    for (var r = 0; r < headers.length; r++) {
      var key = String(headers[r]).trim();
      rowValues.push(order[key] !== undefined ? order[key] : '');
    }
    sheet.getRange(newRow, 1, 1, rowValues.length).setValues([rowValues]);

    return { success: true, rowNumber: newRow };
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
    getByOrderId: getByOrderId,
    insertOrder: insertOrder,
    getAll: getAll
  };
})();
