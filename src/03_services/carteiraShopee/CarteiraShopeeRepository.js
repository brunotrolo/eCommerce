/**
 * CarteiraShopeeRepository — leitura/escrita nas abas de carteira Shopee:
 *   - CARTEIRA_SHOPEE (resumo, 1 linha snapshot sobrescrita a cada sync)
 *   - CARTEIRA_HISTORICO_TRANSACOES (append-only, deduplicado por REFERENCIA)
 *   - CARTEIRA_HISTORICO_PAYOUT (append-only, deduplicado por REFERENCIA)
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 * Colunas são lidas/escritas por NOME (não por posição).
 */
var CarteiraShopeeRepository = (function () {
  var RESUMO_SHEET = 'CARTEIRA_SHOPEE';
  var TRANSACOES_SHEET = 'CARTEIRA_HISTORICO_TRANSACOES';
  var PAYOUT_SHEET = 'CARTEIRA_HISTORICO_PAYOUT';

  var RESUMO_HEADERS = [
    'DATA_SINCRONIZACAO', 'SALDO_DISPONIVEL', 'SALDO_ESCROW', 'SALDO_TOTAL',
    'PROXIMO_PAYOUT_DATA', 'PROXIMO_PAYOUT_VALOR', 'METODO_PAYOUT',
    'RENDA_PERIODO', 'COMISSAO_SHOPEE', 'TAXAS_PLATAFORMA', 'LIQUIDO_PERIODO',
    'ULTIMO_PAYOUT_DATA', 'ULTIMO_PAYOUT_VALOR', 'STATUS_SINCRONIZACAO'
  ];

  var TRANSACOES_HEADERS = [
    'DATA_TRANSACAO', 'TIPO_TRANSACAO', 'DESCRICAO', 'VALOR', 'SALDO_APOS',
    'STATUS', 'REFERENCIA', 'DATA_REGISTRO'
  ];

  var PAYOUT_HEADERS = [
    'DATA_PAYOUT', 'VALOR', 'METODO', 'STATUS', 'REFERENCIA',
    'DIAS_PARA_RECEBER', 'DATA_REGISTRO'
  ];

  function getOrCreateSheet(sheetId, sheetName, headers) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      return sheet;
    }

    var lastCol = sheet.getLastColumn();
    var headerMap = {};
    if (lastCol > 0) {
      var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var i = 0; i < existing.length; i++) {
        var h = String(existing[i]).trim();
        if (h) headerMap[h] = i + 1;
      }
    }

    var missing = [];
    for (var j = 0; j < headers.length; j++) {
      if (!headerMap[headers[j]]) missing.push(headers[j]);
    }
    if (missing.length > 0) {
      var startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    }
    sheet.setFrozenRows(1);
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

  /**
   * Sobrescreve a linha de resumo da aba CARTEIRA_SHOPEE.
   * Sempre 1 linha de dados (row 2), nunca histórico.
   */
  function writeResumo(sheetId, resumo) {
    var sheet = getOrCreateSheet(sheetId, RESUMO_SHEET, RESUMO_HEADERS);
    var colMap = getColumnMap_(sheet);

    var fieldToHeader = {
      dataSincronizacao: 'DATA_SINCRONIZACAO',
      saldoDisponivel: 'SALDO_DISPONIVEL',
      saldoEscrow: 'SALDO_ESCROW',
      saldoTotal: 'SALDO_TOTAL',
      proximoPayoutData: 'PROXIMO_PAYOUT_DATA',
      proximoPayoutValor: 'PROXIMO_PAYOUT_VALOR',
      metodoPayout: 'METODO_PAYOUT',
      rendaPeriodo: 'RENDA_PERIODO',
      comissaoShopee: 'COMISSAO_SHOPEE',
      taxasPlataforma: 'TAXAS_PLATAFORMA',
      liquidoPeriodo: 'LIQUIDO_PERIODO',
      ultimoPayoutData: 'ULTIMO_PAYOUT_DATA',
      ultimoPayoutValor: 'ULTIMO_PAYOUT_VALOR',
      statusSincronizacao: 'STATUS_SINCRONIZACAO'
    };

    var keys = Object.keys(fieldToHeader);
    for (var i = 0; i < keys.length; i++) {
      var col = colMap[fieldToHeader[keys[i]]];
      if (!col) continue;
      var value = resumo[keys[i]];
      if (value === undefined || value === null) value = '';
      sheet.getRange(2, col).setValue(value);
    }
    return { success: true, sheetName: RESUMO_SHEET };
  }

  /** Retorna o resumo atual (linha 2) como objeto, ou null se vazio. */
  function getResumo(sheetId) {
    var sheet = getOrCreateSheet(sheetId, RESUMO_SHEET, RESUMO_HEADERS);
    if (sheet.getLastRow() < 2) return null;
    var colMap = getColumnMap_(sheet);
    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    var obj = {};
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h) obj[h] = values[i];
    }
    var hasData = false;
    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; j++) {
      if (obj[keys[j]] !== '' && obj[keys[j]] !== null && obj[keys[j]] !== undefined) hasData = true;
    }
    return hasData ? obj : null;
  }

  /** Referências (coluna REFERENCIA) já existentes na aba transações. */
  function getExistingTransacaoRefs(sheetId) {
    return getExistingRefs_(sheetId, TRANSACOES_SHEET, TRANSACOES_HEADERS);
  }

  /** Referências (coluna REFERENCIA) já existentes na aba payouts. */
  function getExistingPayoutRefs(sheetId) {
    return getExistingRefs_(sheetId, PAYOUT_SHEET, PAYOUT_HEADERS);
  }

  function getExistingRefs_(sheetId, sheetName, headers) {
    var sheet = getOrCreateSheet(sheetId, sheetName, headers);
    var colMap = getColumnMap_(sheet);
    var colIdx = colMap['REFERENCIA'];
    if (!colIdx) return [];

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var values = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    var existing = [];
    for (var i = 0; i < values.length; i++) {
      var val = String(values[i][0]).trim();
      if (val) existing.push(val);
    }
    return existing;
  }

  /**
   * Append de transações (deduplicação por REFERENCIA feita pelo chamador,
   * que passa `refsToSkip`). Linhas escritas por nome de coluna.
   */
  function appendTransacoes(sheetId, transacoes, refsToSkip) {
    return appendRows_(sheetId, TRANSACOES_SHEET, TRANSACOES_HEADERS, transacoes, refsToSkip);
  }

  /**
   * Append de payouts (deduplicação por REFERENCIA feita pelo chamador,
   * que passa `refsToSkip`).
   */
  function appendPayouts(sheetId, payouts, refsToSkip) {
    return appendRows_(sheetId, PAYOUT_SHEET, PAYOUT_HEADERS, payouts, refsToSkip);
  }

  function appendRows_(sheetId, sheetName, headers, rows, refsToSkip) {
    var sheet = getOrCreateSheet(sheetId, sheetName, headers);
    var colMap = getColumnMap_(sheet);
    var inserted = 0;
    var skipped = 0;
    var errors = [];
    var refsToSkipMap = {};
    for (var s = 0; s < (refsToSkip || []).length; s++) {
      refsToSkipMap[String(refsToSkip[s]).trim()] = true;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      try {
        var ref = String(row.REFERENCIA || row.referencia || '').trim();
        if (ref && refsToSkipMap[ref]) {
          skipped++;
          continue;
        }
        if (ref) refsToSkipMap[ref] = true;

        var newRow = sheet.getLastRow() + 1;
        var keys = Object.keys(row);
        for (var k = 0; k < keys.length; k++) {
          var col = colMap[keys[k]];
          if (!col) continue;
          var value = row[keys[k]];
          if (value === undefined || value === null) value = '';
          sheet.getRange(newRow, col).setValue(value);
        }
        inserted++;
      } catch (err) {
        errors.push({ referencia: ref || row.referencia, error: err.message });
      }
    }
    return { inserted: inserted, skipped: skipped, errors: errors };
  }

  /** Últimas N transações (mais recentes primeiro) como objetos. */
  function getRecentTransacoes(sheetId, limit) {
    return getRecentRows_(sheetId, TRANSACOES_SHEET, TRANSACOES_HEADERS, limit);
  }

  /** Últimos N payouts (mais recentes primeiro) como objetos. */
  function getRecentPayouts(sheetId, limit) {
    return getRecentRows_(sheetId, PAYOUT_SHEET, PAYOUT_HEADERS, limit);
  }

  function getRecentRows_(sheetId, sheetName, headers, limit) {
    var sheet = getOrCreateSheet(sheetId, sheetName, headers);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var headerOrder = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var rows = [];
    for (var i = 0; i < allValues.length; i++) {
      var obj = {};
      for (var j = 0; j < headerOrder.length; j++) {
        var h = String(headerOrder[j]).trim();
        if (h) obj[h] = allValues[i][j];
      }
      rows.push(obj);
    }
    rows.reverse();
    return rows.slice(0, limit || 20);
  }

  return {
    RESUMO_SHEET: RESUMO_SHEET,
    TRANSACOES_SHEET: TRANSACOES_SHEET,
    PAYOUT_SHEET: PAYOUT_SHEET,
    writeResumo: writeResumo,
    getResumo: getResumo,
    getExistingTransacaoRefs: getExistingTransacaoRefs,
    getExistingPayoutRefs: getExistingPayoutRefs,
    appendTransacoes: appendTransacoes,
    appendPayouts: appendPayouts,
    getRecentTransacoes: getRecentTransacoes,
    getRecentPayouts: getRecentPayouts
  };
})();
