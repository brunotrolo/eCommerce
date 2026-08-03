/**
 * NFeEntradaProdutosRepository — leitura/escrita na aba NFE_ENTRADA_PRODUTOS
 * do Google Sheets. Cada linha é um produto desagregado de uma NFe, com
 * referência aos dados da NF original (auditoria cruzada com NFE_ENTRADA).
 * Colunas são lidas/escritas por NOME (não por posição), permitindo
 * reordenar colunas na planilha sem quebrar o script.
 * Regras completas em specs/nfe-entrada-produtos.md.
 */
var NFeEntradaProdutosRepository = (function () {
  var SHEET_NAME = 'NFE_ENTRADA_PRODUTOS';
  var HEADERS = [
    'NUMERO_NF', 'CHAVE_NF', 'DATA_EMISSAO', 'EMITENTE_CNPJ', 'EMITENTE_NOME',
    'CODIGO_PRODUTO', 'DESCRICAO_PRODUTO', 'NCM', 'CFOP', 'QUANTIDADE',
    'VALOR_UNITARIO', 'VALOR_TOTAL', 'ALIQUOTA_ICMS', 'VALOR_ICMS_ITEM',
    'STATUS', 'DATA_ENTRADA', 'TIPO_MOVIMENTACAO', 'LOG_ID',
    'VALOR_DESCONTO_ITEM', 'TIPO_DESCONTO', 'VALOR_OUTROS_ITEM', 'TIPO_OUTROS',
    'VALOR_LIQUIDO_ITEM', 'VALOR_UNITARIO_LIQUIDO'
  ];
  var STATUS_PADRAO = 'Recebido';
  var TIPO_MOVIMENTACAO = 'Entrada por NF';

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

  /**
   * Retorna mapa {headerName: columnIndex} (1-based) das colunas na planilha.
   */
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

  /**
   * Retorna os produtos desagregados da aba, como array de objetos.
   */
  function getProdutos(sheetId) {
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
    return rows;
  }

  /**
   * Verifica se já existem linhas para (numeroNf, codigoProduto).
   */
  function jaExisteProduto(sheetId, numeroNf, codigoProduto) {
    var rows = getProdutos(sheetId);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].NUMERO_NF).trim() === String(numeroNf).trim() &&
        String(rows[i].CODIGO_PRODUTO).trim() === String(codigoProduto).trim()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Insere N produtos na aba NFE_ENTRADA_PRODUTOS.
   */
  function insertProdutos(produtos, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var inserted = 0;
    var errors = [];

    var fieldToHeader = {
      numeroNf: 'NUMERO_NF',
      chaveNf: 'CHAVE_NF',
      dataEmissao: 'DATA_EMISSAO',
      emitenteCnpj: 'EMITENTE_CNPJ',
      emitenteNome: 'EMITENTE_NOME',
      codigoProduto: 'CODIGO_PRODUTO',
      descricaoProduto: 'DESCRICAO_PRODUTO',
      ncm: 'NCM',
      cfop: 'CFOP',
      quantidade: 'QUANTIDADE',
      valorUnitario: 'VALOR_UNITARIO',
      valorTotal: 'VALOR_TOTAL',
      aliquotaIcms: 'ALIQUOTA_ICMS',
      valorIcmsItem: 'VALOR_ICMS_ITEM',
      status: 'STATUS',
      dataEntrada: 'DATA_ENTRADA',
      tipoMovimentacao: 'TIPO_MOVIMENTACAO',
      logId: 'LOG_ID',
      valorDescontoItem: 'VALOR_DESCONTO_ITEM',
      tipoDesconto: 'TIPO_DESCONTO',
      valorOutrosItem: 'VALOR_OUTROS_ITEM',
      tipoOutros: 'TIPO_OUTROS',
      valorLiquidoItem: 'VALOR_LIQUIDO_ITEM',
      valorUnitarioLiquido: 'VALOR_UNITARIO_LIQUIDO'
    };

    for (var i = 0; i < produtos.length; i++) {
      var p = produtos[i];
      try {
        var newRow = sheet.getLastRow() + 1;

        var keys = Object.keys(fieldToHeader);
        for (var k = 0; k < keys.length; k++) {
          var field = keys[k];
          var header = fieldToHeader[field];
          var col = colMap[header];
          if (!col) continue;

          var value = p[field];
          if (field === 'descricaoProduto') {
            value = (value || '').toUpperCase();
          } else if (field === 'status' && (!value || value === '')) {
            value = STATUS_PADRAO;
          } else if (field === 'dataEntrada' && (!value || value === '')) {
            value = new Date().toISOString();
          } else if (field === 'tipoMovimentacao' && (!value || value === '')) {
            value = TIPO_MOVIMENTACAO;
          } else if (value === undefined || value === null) {
            if (field === 'quantidade' || field === 'valorUnitario' || field === 'valorTotal' ||
                field === 'aliquotaIcms' || field === 'valorIcmsItem' ||
                field === 'valorDescontoItem' || field === 'valorOutrosItem' ||
                field === 'valorLiquidoItem' || field === 'valorUnitarioLiquido') {
              value = 0;
            } else if (field === 'tipoDesconto' || field === 'tipoOutros') {
              value = 'NENHUM';
            } else {
              value = '';
            }
          }
          sheet.getRange(newRow, col).setValue(value);
        }

        inserted++;
      } catch (err) {
        errors.push({ codigoProduto: p.codigoProduto, reason: err.message });
      }
    }
    return { inserted: inserted, errors: errors };
  }

  /**
   * Atualiza o STATUS de um produto específico (codigoProduto).
   */
  function updateStatus(sheetId, numeroNf, codigoProduto, novoStatus) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var colStatus = colMap['STATUS'];
    var colCod = colMap['CODIGO_PRODUTO'];
    if (!colStatus || !colCod) return { updated: false, count: 0 };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { updated: false, count: 0 };

    var allValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var updated = 0;

    for (var i = 0; i < allValues.length; i++) {
      var codValue = allValues[i][colCod - 1];
      if (String(codValue).trim() === String(codigoProduto).trim()) {
        sheet.getRange(i + 2, colStatus).setValue(novoStatus);
        updated++;
      }
    }
    return { updated: updated > 0, count: updated };
  }

  /**
   * Retorna os produtos de uma NF específica, para exibição na sidebar.
   */
  function getProdutosByNf(sheetId, numeroNf) {
    var rows = getProdutos(sheetId);
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].NUMERO_NF).trim() === String(numeroNf).trim()) {
        result.push(rows[i]);
      }
    }
    return result;
  }

  /**
   * Retorna estoque agregado por produto para uma NF específica.
   */
  function getEstoqueByNf(sheetId, numeroNf) {
    var rows = getProdutos(sheetId);
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (String(row.NUMERO_NF).trim() !== String(numeroNf).trim()) continue;
      var key = String(row.CODIGO_PRODUTO).trim();
      var qty = parseFloat(row.QUANTIDADE) || 0;
      var vUnitLiq = parseFloat(row.VALOR_UNITARIO_LIQUIDO);
      if (isNaN(vUnitLiq)) vUnitLiq = parseFloat(row.VALOR_UNITARIO) || 0;
      if (!map[key]) {
        map[key] = {
          codigoProduto: row.CODIGO_PRODUTO,
          descricao: row.DESCRICAO_PRODUTO,
          emitenteNome: row.EMITENTE_NOME || '',
          ncm: row.NCM || '',
          quantidadeTotal: 0,
          valorUnitario: parseFloat(row.VALOR_UNITARIO) || 0,
          valorUnitarioLiquido: vUnitLiq,
          valorTotal: 0,
          ultimaEntrada: row.DATA_ENTRADA || '',
          ultimaNfOrigemNumero: row.NUMERO_NF || '',
          status: row.STATUS || 'Recebido'
        };
      }
      map[key].quantidadeTotal += qty;
    }

    var keys = Object.keys(map);
    var result = [];
    for (var j = 0; j < keys.length; j++) {
      var item = map[keys[j]];
      item.quantidadeTotal = Math.round(item.quantidadeTotal * 100) / 100;
      item.valorTotal = Math.round(item.quantidadeTotal * item.valorUnitarioLiquido * 100) / 100;
      result.push(item);
    }
    return result;
  }

  /**
   * Retorna o estoque agregado por produto.
   */
  function getEstoque(sheetId, codigoProduto) {
    var rows = getProdutos(sheetId);
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (codigoProduto && String(row.CODIGO_PRODUTO).trim() !== String(codigoProduto).trim()) continue;
      var key = String(row.CODIGO_PRODUTO).trim();
      var qty = parseFloat(row.QUANTIDADE) || 0;
      var vUnit = parseFloat(row.VALOR_UNITARIO) || 0;
      var vUnitLiq = parseFloat(row.VALOR_UNITARIO_LIQUIDO);
      var vTotalRow = parseFloat(row.VALOR_TOTAL);
      if (isNaN(vUnitLiq)) vUnitLiq = vUnit;
      if (isNaN(vTotalRow)) vTotalRow = qty * vUnitLiq;
      if (!map[key]) {
        map[key] = {
          codigoProduto: row.CODIGO_PRODUTO,
          descricao: row.DESCRICAO_PRODUTO,
          emitenteNome: row.EMITENTE_NOME || '',
          ncm: row.NCM || '',
          quantidadeTotal: 0,
          valorUnitario: vUnit,
          valorUnitarioLiquido: vUnitLiq,
          valorTotal: 0,
          ultimaEntrada: row.DATA_ENTRADA || '',
          ultimaNfOrigemNumero: row.NUMERO_NF || '',
          status: row.STATUS || 'Recebido'
        };
      }
      map[key].quantidadeTotal += qty;
      map[key].valorUnitario = vUnit;
      map[key].valorUnitarioLiquido = vUnitLiq;
      map[key].valorTotal += vTotalRow;
      var entrada = row.DATA_ENTRADA || '';
      if (entrada > String(map[key].ultimaEntrada)) {
        map[key].ultimaEntrada = entrada;
        map[key].ultimaNfOrigemNumero = row.NUMERO_NF || '';
      }
    }

    var keys = Object.keys(map);
    var result = [];
    for (var j = 0; j < keys.length; j++) {
      var item = map[keys[j]];
      item.quantidadeTotal = Math.round(item.quantidadeTotal * 100) / 100;
      result.push(item);
    }
    return result;
  }

  /**
   * Retorna todas as entradas (linhas brutas) para um código de produto específico.
   */
  function getProdutosByCodigo(sheetId, codigoProduto) {
    var rows = getProdutos(sheetId);
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].CODIGO_PRODUTO).trim() === String(codigoProduto).trim()) {
        result.push(rows[i]);
      }
    }
    return result;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getProdutos: getProdutos,
    jaExisteProduto: jaExisteProduto,
    insertProdutos: insertProdutos,
    updateStatus: updateStatus,
    getProdutosByNf: getProdutosByNf,
    getProdutosByCodigo: getProdutosByCodigo,
    getEstoqueByNf: getEstoqueByNf,
    getEstoque: getEstoque
  };
})();
