/**
 * ManualSaidaProdutosRepository — leitura/escrita na aba
 * MANUAL_SAIDA_PRODUTOS do Google Sheets. Cada linha é uma saída manual
 * de produto (venda direta, devolução, perda, ajuste, brinde).
 * Regras completas em specs/manual-saida.md.
 */
var ManualSaidaProdutosRepository = (function () {
  var SHEET_NAME = 'MANUAL_SAIDA_PRODUTOS';
  var HEADERS = [
    'CODIGO_PRODUTO', 'DESCRICAO_PRODUTO', 'NCM', 'QUANTIDADE',
    'VALOR_UNITARIO', 'VALOR_TOTAL', 'STATUS', 'DATA_ENTRADA',
    'TIPO_MOVIMENTACAO', 'LOG_ID', 'VALOR_OUTROS_ITEM', 'TIPO_OUTROS',
    'VALOR_LIQUIDO_ITEM', 'VALOR_UNITARIO_LIQUIDO', 'EMITENTE_NOME',
    'DATA_COMPRA', 'OBSERVACOES', 'TIPO_SAIDA', 'PRECO_UNITARIO',
    'DATA_SAIDA', 'CLIENTE_NOME', 'MOTIVO_PERDA', 'DATA_REGISTRO'
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
      if (filters.tipoSaida) {
        rows = rows.filter(function (r) {
          return String(r.TIPO_SAIDA || '').trim() === String(filters.tipoSaida).trim();
        });
      }
    }

    return rows;
  }

  function getQtdByCodigo(sheetId, codigoProduto) {
    var rows = getRows(sheetId, { codigoProduto: codigoProduto });
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      total += parseFloat(rows[i].QUANTIDADE) || 0;
    }
    return Math.round(total * 100) / 100;
  }

  function appendRow(sheetId, rowData) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var newRow = sheet.getLastRow() + 1;

    var fieldToHeader = {
      codigoProduto: 'CODIGO_PRODUTO',
      descricaoProduto: 'DESCRICAO_PRODUTO',
      ncm: 'NCM',
      quantidade: 'QUANTIDADE',
      valorUnitario: 'VALOR_UNITARIO',
      valorTotal: 'VALOR_TOTAL',
      status: 'STATUS',
      dataEntrada: 'DATA_ENTRADA',
      tipoMovimentacao: 'TIPO_MOVIMENTACAO',
      logId: 'LOG_ID',
      valorOutrosItem: 'VALOR_OUTROS_ITEM',
      tipoOutros: 'TIPO_OUTROS',
      valorLiquidoItem: 'VALOR_LIQUIDO_ITEM',
      valorUnitarioLiquido: 'VALOR_UNITARIO_LIQUIDO',
      emitenteNome: 'EMITENTE_NOME',
      dataCompra: 'DATA_COMPRA',
      observacoes: 'OBSERVACOES',
      tipoSaida: 'TIPO_SAIDA',
      precoUnitario: 'PRECO_UNITARIO',
      dataSaida: 'DATA_SAIDA',
      clienteNome: 'CLIENTE_NOME',
      motivoPerda: 'MOTIVO_PERDA',
      dataRegistro: 'DATA_REGISTRO'
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
        if (field === 'quantidade' || field === 'precoUnitario' || field === 'valorTotal' ||
            field === 'valorUnitario' || field === 'valorOutrosItem' ||
            field === 'valorLiquidoItem' || field === 'valorUnitarioLiquido') {
          value = 0;
        } else {
          value = '';
        }
      }
      sheet.getRange(newRow, col).setValue(value);
    }

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'APPEND', status: 'OK',
      stats: { rows: 1, inserted: 1 }, caller: 'ManualSaidaProdutosRepository',
      rowId: String(rowData.codigoProduto || rowData.logId || '')
    });

    return { success: true, rowNumber: newRow };
  }

  function getClienteHistory(sheetId) {
    var rows = getRows(sheetId);
    var clientes = {};
    for (var i = 0; i < rows.length; i++) {
      var name = String(rows[i].CLIENTE_NOME || '').trim();
      if (name) clientes[name] = true;
    }
    return Object.keys(clientes).sort();
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getRows: getRows,
    getQtdByCodigo: getQtdByCodigo,
    appendRow: appendRow,
    getClienteHistory: getClienteHistory
  };
})();