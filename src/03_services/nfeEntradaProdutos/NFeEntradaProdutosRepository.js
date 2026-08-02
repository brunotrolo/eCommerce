/**
 * NFeEntradaProdutosRepository — leitura/escrita na aba NFE_ENTRADA_PRODUTOS
 * do Google Sheets. Cada linha é um produto desagregado de uma NFe, com
 * referência aos dados da NF original (auditoria cruzada com NFE_ENTRADA).
 * Regras completas em specs/nfe-entrada-produtos.md.
 */
var NFeEntradaProdutosRepository = (function () {
  var SHEET_NAME = 'NFE_ENTRADA_PRODUTOS';
  var HEADERS = [
    'NUMERO_NF', 'CHAVE_NF', 'DATA_EMISSAO', 'EMITENTE_CNPJ', 'EMITENTE_NOME',
    'CODIGO_PRODUTO', 'DESCRICAO_PRODUTO', 'NCM', 'CFOP', 'QUANTIDADE',
    'VALOR_UNITARIO', 'VALOR_TOTAL', 'ALIQUOTA_ICMS', 'VALOR_ICMS_ITEM',
    'STATUS', 'DATA_ENTRADA', 'TIPO_MOVIMENTACAO', 'LOG_ID'
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
    var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    var headersMatch = true;
    var hasAnyHeader = false;
    for (var i = 0; i < HEADERS.length; i++) {
      var cellVal = String(firstRow[i]).trim();
      if (cellVal === HEADERS[i]) {
        hasAnyHeader = true;
      } else if (cellVal.length > 0) {
        hasAnyHeader = true;
      }
      if (cellVal !== HEADERS[i]) {
        headersMatch = false;
      }
    }
    if (!headersMatch) {
      if (hasAnyHeader) {
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      } else {
        sheet.insertRowBefore(1);
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      }
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  /**
   * Retorna os produtos desagregados da aba, como array de objetos.
   * @param {string} sheetId
   * @returns {Array<Object>}
   */
  function getProdutos(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var obj = {};
      for (var j = 0; j < HEADERS.length; j++) {
        obj[HEADERS[j]] = values[i][j];
      }
      rows.push(obj);
    }
    return rows;
  }

  /**
   * Verifica se já existem linhas para (numeroNf, codigoProduto).
   * @returns {boolean}
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
   * @param {Array<Object>} produtos — cada item já com todas as colunas
   * @param {string} sheetId
   * @returns {{inserted: number, errors: Array}}
   */
  function insertProdutos(produtos, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var inserted = 0;
    var errors = [];
    for (var i = 0; i < produtos.length; i++) {
      var p = produtos[i];
      try {
        sheet.appendRow([
          p.numeroNf || '',
          p.chaveNf || '',
          p.dataEmissao || '',
          p.emitenteCnpj || '',
          p.emitenteNome || '',
          p.codigoProduto || '',
          p.descricaoProduto || '',
          p.ncm || '',
          p.cfop || '',
          p.quantidade != null ? p.quantidade : 0,
          p.valorUnitario != null ? p.valorUnitario : 0,
          p.valorTotal != null ? p.valorTotal : 0,
          p.aliquotaIcms != null ? p.aliquotaIcms : 0,
          p.valorIcmsItem != null ? p.valorIcmsItem : 0,
          p.status || STATUS_PADRAO,
          p.dataEntrada || new Date().toISOString(),
          p.tipoMovimentacao || TIPO_MOVIMENTO,
          p.logId || ''
        ]);
        inserted++;
      } catch (err) {
        errors.push({ codigoProduto: p.codigoProduto, reason: err.message });
      }
    }
    return { inserted: inserted, errors: errors };
  }

  /**
   * Retorna o estoque agregado por produto (soma das quantidades e última
   * entrada com referência à NF de origem).
   * @param {string} sheetId
   * @param {string} codigoProduto - opcional, filtrar por código
   * @returns {Array<{codigoProduto, descricao, quantidadeTotal, ultimaEntrada, ultimaNfOrigemNumero}>}
   */
  function getEstoque(sheetId, codigoProduto) {
    var rows = getProdutos(sheetId);
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (codigoProduto && String(row.CODIGO_PRODUTO).trim() !== String(codigoProduto).trim()) continue;
      var key = String(row.CODIGO_PRODUTO).trim();
      if (!map[key]) {
        map[key] = {
          codigoProduto: row.CODIGO_PRODUTO,
          descricao: row.DESCRICAO_PRODUTO,
          quantidadeTotal: 0,
          ultimaEntrada: row.DATA_ENTRADA || '',
          ultimaNfOrigemNumero: row.NUMERO_NF || ''
        };
      }
      var qty = parseFloat(row.QUANTIDADE) || 0;
      map[key].quantidadeTotal += qty;
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

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getProdutos: getProdutos,
    jaExisteProduto: jaExisteProduto,
    insertProdutos: insertProdutos,
    getEstoque: getEstoque
  };
})();