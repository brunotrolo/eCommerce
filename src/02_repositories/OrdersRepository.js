/**
 * OrdersRepository — leitura/escrita na aba PEDIDOS do Google Sheets.
 * Usado para importação de pedidos Shopee via Tiops.
 * Regras completas em specs/orders-import.md.
 *
 * Logging: operações de upsert/insert/update são auditadas via LoggingService
 * com timing, contadores e detalhes de cada operação.
 */
var OrdersRepository = (function () {
  var SHEET_NAME = 'PEDIDOS';
  var HEADERS = [
    'ORDER_ID', 'STATUS', 'TOTAL_AMOUNT', 'PAYMENT_METHOD',
    'ACTUAL_SHIPPING_FEE', 'ESTIMATED_SHIPPING_FEE', 'CURRENCY',
    'DAYS_TO_SHIP', 'PAY_TIME', 'PICKUP_TIME', 'UPDATE_TIME',
    'BUYER_USERNAME', 'RECIPIENT_NAME', 'RECIPIENT_CITY',
    'RECIPIENT_STATE', 'RECIPIENT_ZIPCODE', 'RECIPIENT_FULL_ADDRESS',
    'ITEMS_DETAIL', 'ITEM_COUNT', 'TOTAL_WEIGHT_GRAM',
    'MESSAGE_TO_SELLER', 'CREATE_TIME', 'MARKETPLACE'
  ];
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
      sheet.appendRow(HEADERS);
      for (var h = 0; h < HEADERS.length; h++) {
        sheet.getRange(1, h + 1).setFontWeight('bold').setBackground('#f0f0f0');
      }
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
      if (String(headers[i]).trim() === 'ORDER_ID') {
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
      if (String(headers[i]).trim() === 'ORDER_ID') {
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

    var startTime = Date.now();
    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();

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

    var inserted = matrix.length;
    var totalMs = Date.now() - startTime;

    LoggingService.log({
      service: 'OrdersRepo',
      action: 'insertOrdersBulk',
      status: 'OK',
      caller: 'OrdersRepository',
      summary: 'Bulk insert: ' + inserted + ' linhas na planilha',
      durationMs: totalMs,
      context: {
        inserted: inserted,
        newHeadersAdded: missingHeaders.length,
        newHeaders: missingHeaders.slice(0, 10),
        startRow: newRow,
        orderIds: orders.slice(0, 5).map(function (o) { return o.ORDER_ID || ''; })
      }
    });

    return { success: true, inserted: inserted };
  }

  function insertOrder(order) {
    return insertOrdersBulk([order]);
  }

  function getAllOrdersMap() {
    var startTime = Date.now();
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return {};

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var orderIdCol = -1;
    var statusCol = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h === 'ORDER_ID') orderIdCol = i + 1;
      if (h === 'STATUS') statusCol = i + 1;
    }
    if (orderIdCol === -1) return {};

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var map = {};
    for (var r = 0; r < allValues.length; r++) {
      var oid = String(allValues[r][orderIdCol - 1]).trim();
      if (!oid) continue;
      var rowNumber = r + 2;
      var status = statusCol !== -1 ? String(allValues[r][statusCol - 1]).trim() : '';
      map[oid] = { rowNumber: rowNumber, status: status };
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersRepo',
      action: 'getAllOrdersMap',
      status: 'OK',
      caller: 'OrdersRepository',
      summary: 'Mapa carregado: ' + Object.keys(map).length + ' pedidos (' + totalMs + 'ms)',
      durationMs: totalMs,
      context: {
        totalOrders: Object.keys(map).length,
        sheetRows: lastRow - 1,
        hasStatusCol: statusCol !== -1
      }
    });

    return map;
  }

  function updateOrderRow(rowNumber, order) {
    var startTime = Date.now();
    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return false;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    for (var i = 0; i < headers.length; i++) {
      headerMap[String(headers[i]).trim()] = i + 1;
    }

    var updatedFields = [];
    var keys = Object.keys(order);
    for (var k = 0; k < keys.length; k++) {
      var col = headerMap[keys[k]];
      if (col) {
        sheet.getRange(rowNumber, col).setValue(order[keys[k]]);
        updatedFields.push(keys[k]);
      }
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersRepo',
      action: 'updateOrderRow',
      status: 'OK',
      caller: 'OrdersRepository',
      summary: 'Linha ' + rowNumber + ' atualizada: ' + updatedFields.join(', '),
      durationMs: totalMs,
      context: {
        rowNumber: rowNumber,
        updatedFields: updatedFields,
        newValues: order
      }
    });

    return true;
  }

  function upsertOrders(orders) {
    if (!orders || orders.length === 0) return { inserted: 0, updated: 0 };

    var startTime = Date.now();
    var existingMap = getAllOrdersMap();
    var toInsert = [];
    var updated = 0;
    var skipped = 0;
    var updateDetails = [];
    var insertIds = [];

    for (var i = 0; i < orders.length; i++) {
      var order = orders[i];
      var orderId = String(order.ORDER_ID || '').trim();
      if (!orderId) {
        skipped++;
        continue;
      }

      var existing = existingMap[orderId];
      if (existing) {
        var fieldsToUpdate = {};
        var hasChanges = false;
        if (existing.status && order.STATUS && existing.status !== order.STATUS) {
          fieldsToUpdate.STATUS = order.STATUS;
          hasChanges = true;
        }
        if (hasChanges) {
          updateOrderRow(existing.rowNumber, fieldsToUpdate);
          updated++;
          updateDetails.push({
            orderId: orderId,
            from: existing.status,
            to: order.STATUS,
            row: existing.rowNumber
          });
        }
      } else {
        toInsert.push(order);
        insertIds.push(orderId);
        existingMap[orderId] = { rowNumber: -1, status: order.STATUS || '' };
      }
    }

    var inserted = 0;
    if (toInsert.length > 0) {
      var insertResult = insertOrdersBulk(toInsert);
      inserted = insertResult.inserted || toInsert.length;
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersRepo',
      action: 'upsertOrders',
      status: 'OK',
      caller: 'OrdersRepository',
      summary: 'Upsert: ' + inserted + ' novos, ' + updated + ' atualizados, ' + skipped + ' ignorados (' + totalMs + 'ms)',
      durationMs: totalMs,
      context: {
        inputCount: orders.length,
        inserted: inserted,
        updated: updated,
        skipped: skipped,
        updateDetails: updateDetails.slice(0, 20),
        insertIds: insertIds.slice(0, 20),
        existingBefore: Object.keys(existingMap).length - toInsert.length
      }
    });

    return { inserted: inserted, updated: updated };
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
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getAllOrderIds: getAllOrderIds,
    getByOrderId: getByOrderId,
    insertOrdersBulk: insertOrdersBulk,
    insertOrder: insertOrder,
    getAllOrdersMap: getAllOrdersMap,
    updateOrderRow: updateOrderRow,
    upsertOrders: upsertOrders,
    getAll: getAll
  };
})();
