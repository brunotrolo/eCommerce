/**
 * OrdersRepository — leitura/escrita na aba PEDIDOS do Google Sheets.
 * Usado para importação de pedidos Shopee via Tiops.
 * Regras de negócio documentadas no código abaixo.
 *
 * Logging: operações de upsert/insert/update são auditadas via LoggingService
 * com timing, contadores e detalhes de cada operação.
 */
var OrdersRepository = (function () {
  var SHEET_NAME = 'PEDIDOS';
  var HEADERS = [
    'ORDER_ID', 'STATUS', 'TOTAL_AMOUNT', 'PAYMENT_METHOD',
    'CURRENCY', 'DAYS_TO_SHIP', 'PAY_TIME', 'PICKUP_TIME', 'UPDATE_TIME',
    'BUYER_USERNAME', 'ITEMS_DETAIL', 'ITEM_SKUS', 'ITEM_COUNT',
    'MESSAGE_TO_SELLER', 'CREATE_TIME', 'MARKETPLACE',
    'ESCROW_AMOUNT', 'COMMISSION_FEE', 'NET_COMMISSION_FEE',
    'SERVICE_FEE', 'NET_SERVICE_FEE', 'PIX_DISCOUNT',
    'SELLER_REBATE', 'SELLER_REBATE_COMMISSION_OFFSET',
    'SELLER_REBATE_SERVICE_OFFSET', 'TOTAL_COST', 'BAIXADO', 'BAIXA_ESTOQUE_IDS'
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
    var itemSkusCol = -1;
    var baixaEstoqueIdsCol = -1;
    var baixadoCol = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h === 'ORDER_ID') orderIdCol = i + 1;
      if (h === 'STATUS') statusCol = i + 1;
      if (h === 'ITEM_SKUS') itemSkusCol = i + 1;
      if (h === 'BAIXA_ESTOQUE_IDS') baixaEstoqueIdsCol = i + 1;
      if (h === 'BAIXADO') baixadoCol = i + 1;
    }
    if (orderIdCol === -1) return {};

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var map = {};
    for (var r = 0; r < allValues.length; r++) {
      var oid = String(allValues[r][orderIdCol - 1]).trim();
      if (!oid) continue;
      var rowNumber = r + 2;
      var status = statusCol !== -1 ? String(allValues[r][statusCol - 1]).trim() : '';
      var itemSkus = itemSkusCol !== -1 ? String(allValues[r][itemSkusCol - 1] || '').trim() : '';
      var baixaEstoqueIds = baixaEstoqueIdsCol !== -1 ? String(allValues[r][baixaEstoqueIdsCol - 1] || '').trim() : '';
      var baixado = baixadoCol !== -1 ? String(allValues[r][baixadoCol - 1] || '').trim() : '';
      map[oid] = { rowNumber: rowNumber, status: status, itemSkus: itemSkus, baixaEstoqueIds: baixaEstoqueIds, baixado: baixado };
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

    var keys = Object.keys(order);
    var missingHeaders = [];
    for (var k = 0; k < keys.length; k++) {
      if (!headerMap[keys[k]]) missingHeaders.push(keys[k]);
    }
    if (missingHeaders.length > 0) {
      var startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      for (var m = 0; m < missingHeaders.length; m++) {
        headerMap[missingHeaders[m]] = startCol + m;
      }
      lastCol = sheet.getLastColumn();
    }

    for (var k2 = 0; k2 < keys.length; k2++) {
      var col = headerMap[keys[k2]];
      if (col) {
        sheet.getRange(rowNumber, col).setValue(order[keys[k2]]);
      }
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersRepo',
      action: 'updateOrderRow',
      status: 'OK',
      caller: 'OrdersRepository',
      summary: 'Linha ' + rowNumber + ' atualizada',
      durationMs: totalMs,
      context: {
        rowNumber: rowNumber,
        newValues: order
      }
    });

    return true;
  }

  function upsertOrders(orders, updateAll) {
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
        if (updateAll) {
          // Protege ITEM_SKUS existente: se o novo valor é vazio, preserva o antigo
          // Evita que reimportações/syncs apaguem SKUs quando skuMap falha ou Shopee não retorna item_sku
          if (!order.ITEM_SKUS && existing.itemSkus) {
            LoggingService.log({
              service: 'OrdersRepo', action: 'upsertOrders', status: 'WARN',
              caller: 'OrdersRepository',
              summary: 'ITEM_SKUS vazio preservado para ' + orderId + ': ' + existing.itemSkus,
              durationMs: 0, context: { orderId: orderId, preservedSkus: existing.itemSkus }
            });
            order.ITEM_SKUS = existing.itemSkus;
          }
          // Protege BAIXA_ESTOQUE_IDS existente: mesmo raciocínio do ITEM_SKUS
          if (!order.BAIXA_ESTOQUE_IDS && existing.baixaEstoqueIds) {
            order.BAIXA_ESTOQUE_IDS = existing.baixaEstoqueIds;
          }
          updateOrderRow(existing.rowNumber, order);
          updated++;
          updateDetails.push({
            orderId: orderId,
            from: existing.status,
            to: order.STATUS,
            row: existing.rowNumber,
            allFields: true
          });
        } else {
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

  /**
   * Lê múltiplos pedidos por ORDER_ID em um batch (única leitura da sheet).
   * Retorna mapa orderId → {row, data} ou null se não encontrado.
   */
  function readPedidosBatch(orderIds) {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return {};

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var orderIdCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === 'ORDER_ID') { orderIdCol = i + 1; break; }
    }
    if (orderIdCol === -1) return {};

    var allIds = sheet.getRange(2, orderIdCol, lastRow - 1, 1).getValues();
    var idSet = {};
    var orderIdsList = [];
    for (var j = 0; j < orderIds.length; j++) {
      var key = String(orderIds[j]).trim();
      if (!idSet[key]) { idSet[key] = true; orderIdsList.push(key); }
    }

    var targetRows = [];
    var targetRowNums = [];
    for (var k = 0; k < allIds.length; k++) {
      var val = String(allIds[k][0]).trim();
      if (idSet[val]) {
        targetRows.push(k);
        targetRowNums.push(k + 2);
      }
    }
    if (targetRows.length === 0) return {};

    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var result = {};
    for (var r = 0; r < targetRows.length; r++) {
      var rowNum = targetRows[r];
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        obj[String(headers[c]).trim()] = allData[rowNum][c];
      }
      obj.__ROW = targetRowNums[r];
      result[obj.ORDER_ID] = obj;
    }
    return result;
  }

  /**
   * Escreve colunas BAIXADO, BAIXA_ESTOQUE_IDS, TOTAL_COST para um pedido.
   * Cria as colunas se não existirem.
   */
  function writeBaixaColumns(orderId, baixado, estoqueIdsStr, custoTotal) {
    var sheet = getOrCreateSheet();
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var hIdx = {};
    for (var i = 0; i < headers.length; i++) {
      hIdx[String(headers[i]).trim()] = i + 1;
    }

    var baixadoCol = hIdx['BAIXADO'];
    var estoqueIdsCol = hIdx['BAIXA_ESTOQUE_IDS'];
    var costCol = hIdx['TOTAL_COST'];
    var estoqueIdsColCriada = false;
    var costColCriada = false;

    if (!estoqueIdsCol) {
      estoqueIdsCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, estoqueIdsCol).setValue('BAIXA_ESTOQUE_IDS');
      estoqueIdsColCriada = true;
    }
    if (!costCol) {
      costCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, costCol).setValue('TOTAL_COST');
      costColCriada = true;
    }

    var orderIdCol = hIdx['ORDER_ID'];
    if (!orderIdCol) return;

    var allIds = sheet.getRange(2, orderIdCol, sheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < allIds.length; j++) {
      if (String(allIds[j][0]).trim() === String(orderId).trim()) {
        var row = j + 2;
        sheet.getRange(row, baixadoCol).setValue(baixado);
        sheet.getRange(row, estoqueIdsCol).setValue(estoqueIdsStr);
        sheet.getRange(row, costCol).setValue(custoTotal);
        logWriteAuditOrder_('WRITE_BAIXA_COLUMNS', orderId, {
          rows: 1, updated: 1,
          colunasCriadas: (estoqueIdsColCriada ? 1 : 0) + (costColCriada ? 1 : 0)
        });
        return;
      }
    }
  }

  /**
   * Batch: lê todas as linhas para update em memória + write único.
   * Retorna {headers, rows, orderIdCol, baixadoCol, estoqueIdsCol, costCol, idSet}
   * pronto para update in-memory + setValues. idSet é null quando orderIds é
   * vazio (backfill: atualiza todos os pedidos em updatesMap no flush).
   */
  function prepareBaixaBulk(orderIds) {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return null;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var hIdx = {};
    for (var i = 0; i < headers.length; i++) {
      hIdx[String(headers[i]).trim()] = i + 1;
    }

    var baixadoCol = hIdx['BAIXADO'];
    var estoqueIdsCol = hIdx['BAIXA_ESTOQUE_IDS'];
    var costCol = hIdx['TOTAL_COST'];
    var colunasCriadas = 0;

    if (!estoqueIdsCol) {
      estoqueIdsCol = lastCol + 1;
      sheet.getRange(1, estoqueIdsCol).setValue('BAIXA_ESTOQUE_IDS');
      lastCol = sheet.getLastColumn();
      colunasCriadas++;
    }
    if (!costCol) {
      costCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, costCol).setValue('TOTAL_COST');
      lastCol = sheet.getLastColumn();
      colunasCriadas++;
    }

    var orderIdCol = hIdx['ORDER_ID'];
    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var idSet = null;
    if (orderIds && orderIds.length > 0) {
      idSet = {};
      for (var j = 0; j < orderIds.length; j++) {
        idSet[String(orderIds[j]).trim()] = true;
      }
    }

    logWriteAuditOrder_('PREPARE_BAIXA_BULK', '', {
      rows: orderIds.length,
      colunasCriadas: colunasCriadas
    });

    return {
      sheet: sheet,
      headers: headers,
      lastCol: lastCol,
      allData: allData,
      baixadoCol: baixadoCol,
      estoqueIdsCol: estoqueIdsCol,
      costCol: costCol,
      orderIdCol: orderIdCol,
      idSet: idSet
    };
  }

  /**
   * Aplica writes em memória (prepareBaixaBulk result) e faz flush único.
   */
  function flushBaixaBulk(prepared, updatesMap) {
    if (!prepared) return;
    var sheet = prepared.sheet;
    var rowsWritten = 0;

    for (var i = 0; i < prepared.allData.length; i++) {
      var orderId = String(prepared.allData[i][prepared.orderIdCol - 1]).trim();
      // idSet null (prepareBaixaBulk([])/sem filtro) = atualiza todos os
      // pedidos em updatesMap — é o caminho do backfill em lote, onde nenhum
      // pedido seria persistido se o filtro fosse aplicado (regressão
      // silenciosa desde 3b5cb5b, 08/08/2026).
      if (prepared.idSet && !prepared.idSet[orderId]) continue;

      var upd = updatesMap[orderId];
      if (!upd) continue;

      prepared.allData[i][prepared.baixadoCol - 1] = upd.baixado;
      prepared.allData[i][prepared.estoqueIdsCol - 1] = upd.estoqueIdsStr;
      prepared.allData[i][prepared.costCol - 1] = upd.custoTotal;
      rowsWritten++;
    }

    if (rowsWritten > 0) {
      try {
        sheet.getRange(2, 1, prepared.allData.length, prepared.lastCol).setValues(prepared.allData);
      } catch (e) {
        logWriteAuditOrder_('FLUSH_BAIXA_BULK', '', {
          rows: rowsWritten,
          updated: 0,
          error: (e && e.message) ? e.message : String(e)
        }, 'ERROR');
        throw e;
      }
    }

    logWriteAuditOrder_('FLUSH_BAIXA_BULK', '', {
      rows: rowsWritten,
      updated: rowsWritten
    });
  }

  // Auditoria padronizada das operações de escrita de baixa (via adapter
  // SheetsRepository.logWriteAudit → aba LOGS unificada). Best effort.
  function logWriteAuditOrder_(operation, orderId, stats, status) {
    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME,
      operation: operation,
      status: status || 'OK',
      stats: stats || {},
      caller: 'OrdersRepository',
      rowId: orderId || ''
    });
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
    getAll: getAll,
    readPedidosBatch: readPedidosBatch,
    writeBaixaColumns: writeBaixaColumns,
    prepareBaixaBulk: prepareBaixaBulk,
    flushBaixaBulk: flushBaixaBulk
  };
})();
