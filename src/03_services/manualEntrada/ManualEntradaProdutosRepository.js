/**
 * ManualEntradaProdutosRepository — leitura/escrita na aba
 * MANUAL_ENTRADA_PRODUTOS do Google Sheets. Estrutura idêntica a
 * NFE_ENTRADA_PRODUTOS, exceto campos de NF (NUMERO_NF, CHAVE_NF, etc.)
 * substituídos por campos manuais (EMITENTE_NOME, DATA_COMPRA, OBSERVACOES).
 * Regras completas em specs/manual-entrada.md.
 */
var ManualEntradaProdutosRepository = (function () {
  var SHEET_NAME = 'MANUAL_ENTRADA_PRODUTOS';
  var HEADERS = [
    'CODIGO_PRODUTO', 'SKU', 'DESCRICAO_PRODUTO', 'NCM', 'QUANTIDADE',
    'VALOR_UNITARIO', 'VALOR_TOTAL', 'STATUS', 'DATA_ENTRADA',
    'TIPO_MOVIMENTACAO', 'LOG_ID', 'VALOR_OUTROS_ITEM', 'TIPO_OUTROS',
    'VALOR_LIQUIDO_ITEM', 'VALOR_UNITARIO_LIQUIDO', 'EMITENTE_NOME',
    'DATA_COMPRA', 'OBSERVACOES'
  ];
  var STATUS_PADRAO = 'Recebido';
  var TIPO_MOVIMENTACAO = 'Entrada Manual';

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
      for (var k = 0; k < missingHeaders.length; k++) {
        headerMap[missingHeaders[k]] = startCol + k;
      }
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

  function getRows(sheetId, codigoProduto) {
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
      if (codigoProduto && String(obj.CODIGO_PRODUTO || '').trim() !== String(codigoProduto).trim()) {
        continue;
      }
      rows.push(obj);
    }
    return rows;
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
      observacoes: 'OBSERVACOES'
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
        if (field === 'quantidade' || field === 'valorUnitario' || field === 'valorTotal' ||
            field === 'valorOutrosItem' ||
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
      stats: { rows: 1, inserted: 1 }, caller: 'ManualEntradaProdutosRepository',
      rowId: String(rowData.codigoProduto || rowData.logId || '')
    });

    return { success: true, rowNumber: newRow };
  }

  function getSupplierHistory(sheetId) {
    var rows = getRows(sheetId);
    var suppliers = {};
    for (var i = 0; i < rows.length; i++) {
      var name = String(rows[i].EMITENTE_NOME || '').trim();
      if (name) suppliers[name] = true;
    }
    return Object.keys(suppliers).sort();
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getRows: getRows,
    appendRow: appendRow,
    getSupplierHistory: getSupplierHistory
  };
})();
