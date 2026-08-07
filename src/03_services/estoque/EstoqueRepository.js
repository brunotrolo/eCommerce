/**
 * EstoqueRepository — leitura/escrita na aba ESTOQUE do Google Sheets.
 * Cada linha = 1 unidade de produto (rastreamento unitário FIFO).
 * Regras completas em specs/estoque.md.
 */
var EstoqueRepository = (function () {
  var SHEET_NAME = 'ESTOQUE';
  var HEADERS = [
    'ESTOQUE_ID', 'CODIGO_PRODUTO', 'SKU', 'DESCRICAO_PRODUTO', 'DATA_ENTRADA',
    'REFERENCIA_ORIGEM', 'PRECO_CUSTO_ORIGINAL', 'PRECO_VENDA_SHOPEE',
    'PRECO_VENDA_MERCADO_LIVRE', 'MARGEM_SHOPEE', 'MARGEM_MERCADO_LIVRE',
    'STATUS', 'BAIXADO', 'ALERTA_ESTOQUE_BAIXO', 'DATA_SINCRONIZACAO', 'LOG_ID',
    'CATEGORIA'
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
      if (filters.codigoProduto) {
        rows = rows.filter(function (r) {
          return String(r.CODIGO_PRODUTO || '').trim() === String(filters.codigoProduto).trim();
        });
      }
      if (filters.status) {
        var filterStatus = String(filters.status).trim();
        var normalizedFilter = filterStatus.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        rows = rows.filter(function (r) {
          var rowStatus = String(r.STATUS || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
          return rowStatus === normalizedFilter;
        });
      }
      if (filters.numeroNf) {
        rows = rows.filter(function (r) {
          return String(r.REFERENCIA_ORIGEM || '').indexOf('NF#' + filters.numeroNf) !== -1;
        });
      }
    }

    return rows;
  }

  function getItemsDisponivelPorProduto(sheetId, codigoProduto) {
    var rows = getRows(sheetId, { codigoProduto: codigoProduto, status: 'DISPONÍVEL' });
    rows.sort(function (a, b) {
      return new Date(a.DATA_ENTRADA) - new Date(b.DATA_ENTRADA);
    });
    return rows;
  }

  function appendRow(sheetId, rowData) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var newRow = sheet.getLastRow() + 1;

    var fieldToHeader = {
      estoqueId: 'ESTOQUE_ID',
      codigoProduto: 'CODIGO_PRODUTO',
      descricaoProduto: 'DESCRICAO_PRODUTO',
      dataEntrada: 'DATA_ENTRADA',
      referenciaOrigem: 'REFERENCIA_ORIGEM',
      precoCustoOriginal: 'PRECO_CUSTO_ORIGINAL',
      precoVendaShopee: 'PRECO_VENDA_SHOPEE',
      precoVendaMercadoLivre: 'PRECO_VENDA_MERCADO_LIVRE',
      margemShopee: 'MARGEM_SHOPEE',
      margemMercadoLivre: 'MARGEM_MERCADO_LIVRE',
      status: 'STATUS',
      baixado: 'BAIXADO',
      alertaEstoqueBaixo: 'ALERTA_ESTOQUE_BAIXO',
      dataSincronizacao: 'DATA_SINCRONIZACAO',
      logId: 'LOG_ID'
    };

    var keys = Object.keys(fieldToHeader);
    for (var k = 0; k < keys.length; k++) {
      var field = keys[k];
      var header = fieldToHeader[field];
      var col = colMap[header];
      if (!col) continue;

      var value = rowData[field];
      if (field === 'descricaoProduto') {
        value = (value || '').toUpperCase();
      } else if (value === undefined || value === null) {
        if (field === 'precoCustoOriginal' || field === 'precoVendaShopee' ||
            field === 'precoVendaMercadoLivre' || field === 'margemShopee' ||
            field === 'margemMercadoLivre') {
          value = '';
        } else if (field === 'alertaEstoqueBaixo') {
          value = false;
        } else {
          value = '';
        }
      }
      sheet.getRange(newRow, col).setValue(value);
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'APPEND', status: 'OK',
      stats: { rows: 1, inserted: 1 }, caller: 'EstoqueRepository',
      rowId: rowData.estoqueId || rowData.codigoProduto || ''
    });

    return { success: true, rowNumber: newRow };
  }

  function appendRows(sheetId, rowsData) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var startRow = sheet.getLastRow() + 1;

    var fieldToHeader = {
      estoqueId: 'ESTOQUE_ID',
      codigoProduto: 'CODIGO_PRODUTO',
      descricaoProduto: 'DESCRICAO_PRODUTO',
      dataEntrada: 'DATA_ENTRADA',
      referenciaOrigem: 'REFERENCIA_ORIGEM',
      precoCustoOriginal: 'PRECO_CUSTO_ORIGINAL',
      precoVendaShopee: 'PRECO_VENDA_SHOPEE',
      precoVendaMercadoLivre: 'PRECO_VENDA_MERCADO_LIVRE',
      margemShopee: 'MARGEM_SHOPEE',
      margemMercadoLivre: 'MARGEM_MERCADO_LIVRE',
      status: 'STATUS',
      baixado: 'BAIXADO',
      alertaEstoqueBaixo: 'ALERTA_ESTOQUE_BAIXO',
      dataSincronizacao: 'DATA_SINCRONIZACAO',
      logId: 'LOG_ID'
    };

    var fields = Object.keys(fieldToHeader);
    var cols = [];
    for (var c = 0; c < fields.length; c++) {
      cols.push(colMap[fieldToHeader[fields[c]]] || null);
    }

    var allRows = [];
    for (var i = 0; i < rowsData.length; i++) {
      var rowData = rowsData[i];
      var row = [];
      for (var k = 0; k < fields.length; k++) {
        var col = cols[k];
        if (!col) continue;
        var field = fields[k];
        var value = rowData[field];
        if (field === 'descricaoProduto') {
          value = (value || '').toUpperCase();
        } else if (value === undefined || value === null) {
          if (field === 'precoCustoOriginal' || field === 'precoVendaShopee' ||
              field === 'precoVendaMercadoLivre' || field === 'margemShopee' ||
              field === 'margemMercadoLivre') {
            value = '';
          } else if (field === 'alertaEstoqueBaixo') {
            value = false;
          } else {
            value = '';
          }
        }
        row.push(value);
      }
      allRows.push(row);
    }

    if (allRows.length > 0) {
      var validCols = [];
      var insertIndex = [];
      for (var v = 0; v < cols.length; v++) {
        if (cols[v]) {
          validCols.push(cols[v]);
          insertIndex.push(v);
        }
      }

      if (validCols.length > 0) {
        var firstCol = Math.min.apply(null, validCols);
        var lastCol = Math.max.apply(null, validCols);
        var matrix = [];
        for (var r = 0; r < allRows.length; r++) {
          var line = [];
          for (var w = firstCol; w <= lastCol; w++) {
            line.push('');
          }
          for (var f = 0; f < insertIndex.length; f++) {
            line[validCols[f] - firstCol] = allRows[r][insertIndex[f]];
          }
          matrix.push(line);
        }
        var range = sheet.getRange(startRow, firstCol, matrix.length, lastCol - firstCol + 1);
        range.setValues(matrix);
      }
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'APPEND', status: 'OK',
      stats: { rows: allRows.length, inserted: allRows.length },
      caller: 'EstoqueRepository', detail: 'appendRows em lote'
    });

    return { success: true, rowsInserted: allRows.length, startRow: startRow };
  }

  function updateRow(sheetId, estoqueId, updates) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, error: 'No data rows' };

    var idCol = colMap['ESTOQUE_ID'];
    if (!idCol) return { success: false, error: 'ESTOQUE_ID column not found' };

    var allIds = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < allIds.length; i++) {
      if (String(allIds[i][0]).trim() === String(estoqueId).trim()) {
        targetRow = i + 2;
        break;
      }
    }
    if (targetRow === -1) return { success: false, error: 'Item not found: ' + estoqueId };

    var fieldToHeader = {
      codigoProduto: 'CODIGO_PRODUTO',
      descricaoProduto: 'DESCRICAO_PRODUTO',
      dataEntrada: 'DATA_ENTRADA',
      referenciaOrigem: 'REFERENCIA_ORIGEM',
      precoCustoOriginal: 'PRECO_CUSTO_ORIGINAL',
      precoVendaShopee: 'PRECO_VENDA_SHOPEE',
      precoVendaMercadoLivre: 'PRECO_VENDA_MERCADO_LIVRE',
      margemShopee: 'MARGEM_SHOPEE',
      margemMercadoLivre: 'MARGEM_MERCADO_LIVRE',
      status: 'STATUS',
      baixado: 'BAIXADO',
      alertaEstoqueBaixo: 'ALERTA_ESTOQUE_BAIXO',
      dataSincronizacao: 'DATA_SINCRONIZACAO',
      logId: 'LOG_ID'
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
      stats: { rows: 1, updated: 1 }, caller: 'EstoqueRepository',
      rowId: estoqueId || ''
    });

    return { success: true, row: targetRow };
  }

  function updateRowsBulk(sheetId, estoqueIds, updates) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, error: 'No data rows' };

    var idCol = colMap['ESTOQUE_ID'];
    if (!idCol) return { success: false, error: 'ESTOQUE_ID column not found' };

    var allIds = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var idSet = {};
    for (var i = 0; i < estoqueIds.length; i++) {
      idSet[String(estoqueIds[i]).trim()] = true;
    }

    var rowsToUpdate = [];
    for (var j = 0; j < allIds.length; j++) {
      if (idSet[String(allIds[j][0]).trim()]) {
        rowsToUpdate.push(j + 2);
      }
    }

    var fieldToHeader = {
      status: 'STATUS',
      baixado: 'BAIXADO',
      alertaEstoqueBaixo: 'ALERTA_ESTOQUE_BAIXO',
      precoVendaShopee: 'PRECO_VENDA_SHOPEE',
      precoVendaMercadoLivre: 'PRECO_VENDA_MERCADO_LIVRE',
      margemShopee: 'MARGEM_SHOPEE',
      margemMercadoLivre: 'MARGEM_MERCADO_LIVRE',
      dataSincronizacao: 'DATA_SINCRONIZACAO'
    };

    var updated = 0;
    for (var r = 0; r < rowsToUpdate.length; r++) {
      var rowNum = rowsToUpdate[r];
      var keys = Object.keys(updates);
      for (var k = 0; k < keys.length; k++) {
        var field = keys[k];
        var header = fieldToHeader[field];
        if (!header || !colMap[header]) continue;
        sheet.getRange(rowNum, colMap[header]).setValue(updates[field]);
      }
      updated++;
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'UPDATE', status: 'OK',
      stats: { rows: updated, updated: updated },
      caller: 'EstoqueRepository', detail: 'updateRowsBulk'
    });

    return { success: true, updated: updated };
  }

  function countByStatus(sheetId, codigoProduto) {    var rows = getRows(sheetId, { codigoProduto: codigoProduto });
    var counts = { DISPONÍVEL: 0, VENDIDO: 0, DEVOLVIDO: 0, QUEBRADO: 0, COM_DEFEITO: 0 };
    for (var i = 0; i < rows.length; i++) {
      var s = String(rows[i].STATUS || '').trim();
      if (counts[s] !== undefined) counts[s]++;
    }
    return counts;
  }

  function getProximoSequencial(sheetId, dateStr) {
    var sheet = getOrCreateSheet(sheetId);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return 1;

    var colMap = getColumnMap_(sheet);
    var idCol = colMap['ESTOQUE_ID'];
    if (!idCol) return 1;

    var allIds = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    var prefix = 'EST-' + dateStr + '-';
    var maxSeq = 0;
    for (var i = 0; i < allIds.length; i++) {
      var id = String(allIds[i][0] || '');
      if (id.indexOf(prefix) === 0) {
        var seq = parseInt(id.substring(prefix.length), 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    return maxSeq + 1;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getRows: getRows,
    getItemsDisponivelPorProduto: getItemsDisponivelPorProduto,
    appendRow: appendRow,
    appendRows: appendRows,
    updateRow: updateRow,
    updateRowsBulk: updateRowsBulk,
    countByStatus: countByStatus,
    getProximoSequencial: getProximoSequencial
  };
})();
