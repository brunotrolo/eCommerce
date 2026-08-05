/**
 * NFeEntradaRepository — leitura/escrita na aba NFE_ENTRADA do Google Sheets.
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 * Colunas são lidas/escritas por NOME (não por posição), permitindo
 * reordenar colunas na planilha sem quebrar o script.
 */
var NFeEntradaRepository = (function () {
  var SHEET_NAME = 'NFE_ENTRADA';
  var HEADERS = [
    'NUMERO_NF', 'CHAVE_NF', 'DATA_EMISSAO', 'EMITENTE_CNPJ', 'EMITENTE_NOME',
    'EMITENTE_IE', 'EMITENTE_ENDERECO', 'DESTINATARIO_CNPJ', 'DESTINATARIO_NOME',
    'DESTINATARIO_IE', 'DESTINATARIO_ENDERECO', 'VALOR_TOTAL', 'VALOR_DESCONTO',
    'VALOR_FRETE', 'VALOR_ICMS', 'VALOR_PIS', 'VALOR_COFINS', 'VALOR_IBS',
    'VALOR_CBS', 'PRODUTOS_JSON', 'STATUS_NFE', 'NUMERO_PROTOCOLO', 'DATA_SYNC',
    'TIPO_ARQUIVO', 'PROCESSADA_EM', 'VALOR_PRODUTOS', 'VALOR_OUTROS'
  ];

  function getOrCreateSheet(sheetId) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
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
   * Retorna numeros_nf existentes na aba (para deduplicação).
   */
  function getExistingNumeroNf(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var colIdx = colMap['NUMERO_NF'];
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
   * Retorna todas as entradas da aba como array de objetos.
   */
  function getNfes(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return [];

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var headerOrder = [];
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
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
   * Retorna as últimas N entradas (mais recentes primeiro).
   */
  function getRecentNfes(sheetId, limit) {
    var all = getNfes(sheetId);
    all.reverse();
    return all.slice(0, limit || 20);
  }

  /**
   * Insere múltiplas entradas naaba.
   * Usa appendRow (só funciona se colunas estão na ordem do HEADERS).
   * Para ordem livre, usar insertNfesByName.
   */
  function insertNfes(entries, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var inserted = 0;
    var errors = [];

    LoggingService.log({
      service: 'nfeEntrada.trace',
      action: 'repo:insert-start',
      status: 'OK',
      summary: 'Iniciando inserção de ' + entries.length + ' entrada(s) na aba ' + SHEET_NAME,
      context: { sheetId: sheetId, sheetName: SHEET_NAME, entriesCount: entries.length, lastRow: sheet.getLastRow() }
    });

    var fieldToHeader = {
      numeroNf: 'NUMERO_NF',
      chaveNf: 'CHAVE_NF',
      dataEmissao: 'DATA_EMISSAO',
      emitenteCnpj: 'EMITENTE_CNPJ',
      emitenteNome: 'EMITENTE_NOME',
      emitenteIe: 'EMITENTE_IE',
      emitenteEndereco: 'EMITENTE_ENDERECO',
      destinatarioCnpj: 'DESTINATARIO_CNPJ',
      destinatarioNome: 'DESTINATARIO_NOME',
      destinatarioIe: 'DESTINATARIO_IE',
      destinatarioEndereco: 'DESTINATARIO_ENDERECO',
      valorTotal: 'VALOR_TOTAL',
      valorDesconto: 'VALOR_DESCONTO',
      valorFrete: 'VALOR_FRETE',
      valorIcms: 'VALOR_ICMS',
      valorPis: 'VALOR_PIS',
      valorCofins: 'VALOR_COFINS',
      valorIbs: 'VALOR_IBS',
      valorCbs: 'VALOR_CBS',
      produtosJson: 'PRODUTOS_JSON',
      statusNfe: 'STATUS_NFE',
      numeroProtocolo: 'NUMERO_PROTOCOLO',
      dataSync: 'DATA_SYNC',
      tipoArquivo: 'TIPO_ARQUIVO',
      valorProdutos: 'VALOR_PRODUTOS',
      valorOutros: 'VALOR_OUTROS'
    };

    var defaults = {
      'DATA_SYNC': function () { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'); },
      'TIPO_ARQUIVO': 'xml',
      'PROCESSADA_EM': '',
      'VALOR_PRODUTOS': 0,
      'VALOR_OUTROS': 0
    };

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      try {
        var lastRow = sheet.getLastRow();
        var newRow = lastRow + 1;

        var keys = Object.keys(fieldToHeader);
        for (var k = 0; k < keys.length; k++) {
          var field = keys[k];
          var header = fieldToHeader[field];
          var col = colMap[header];
          if (!col) continue;

          var value = e[field];
          if (value === undefined || value === null || value === '') {
            if (defaults[header]) {
              value = typeof defaults[header] === 'function' ? defaults[header]() : defaults[header];
            } else {
              value = '';
            }
          }
          sheet.getRange(newRow, col).setValue(value);
        }

        inserted++;
        LoggingService.log({
          service: 'nfeEntrada.trace',
          action: 'repo:row-inserted',
          status: 'OK',
          summary: 'Linha inserida: nf=' + e.numeroNf + ' emitente=' + e.emitenteNome + ' valor=' + e.valorTotal,
          context: { numeroNf: e.numeroNf, emitenteNome: e.emitenteNome, valorTotal: e.valorTotal, statusNfe: e.statusNfe, tipoArquivo: e.tipoArquivo, rowNumber: newRow }
        });
      } catch (err) {
        errors.push({ numeroNf: e.numeroNf, error: err.message });
        LoggingService.log({
          service: 'nfeEntrada.trace',
          action: 'repo:row-error',
          status: 'ERROR',
          summary: 'Erro ao inserir linha: nf=' + e.numeroNf + ' erro=' + err.message,
          context: { numeroNf: e.numeroNf, error: err.message }
        });
      }
    }

    LoggingService.log({
      service: 'nfeEntrada.trace',
      action: 'repo:insert-done',
      status: errors.length > 0 ? 'ERROR' : 'OK',
      summary: 'Inserção concluída: ' + inserted + ' inserida(s), ' + errors.length + ' erro(s)',
      context: { inserted: inserted, errors: errors, totalRows: sheet.getLastRow() }
    });

    SheetsRepository.logWriteAudit({
      sheet: SHEET_NAME, operation: 'APPEND',
      status: errors.length > 0 ? 'ERROR' : 'OK',
      stats: { rows: entries.length, inserted: inserted },
      caller: 'NFeEntradaRepository',
      detail: 'insertNfes: ' + inserted + ' ok, ' + errors.length + ' erro(s)'
    });

    return { inserted: inserted, errors: errors };
  }

  /**
   * Marca uma NF como processada, gravando o timestamp em PROCESSADA_EM.
   */
  function marcarNfProcessada(sheetId, numeroNf, processadaEm) {
    var sheet = getOrCreateSheet(sheetId);
    var colMap = getColumnMap_(sheet);
    var colNumNf = colMap['NUMERO_NF'];
    var colProcessada = colMap['PROCESSADA_EM'];
    if (!colNumNf || !colProcessada) return;

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var numNfValues = sheet.getRange(2, colNumNf, lastRow - 1, 1).getValues();
    var updated = 0;
    for (var i = 0; i < numNfValues.length; i++) {
      if (String(numNfValues[i][0]).trim() === String(numeroNf).trim()) {
        sheet.getRange(i + 2, colProcessada).setValue(processadaEm);
        updated++;
      }
    }

    if (updated > 0) {
      SheetsRepository.logWriteAudit({
        sheet: SHEET_NAME, operation: 'UPDATE', status: 'OK',
        stats: { rows: updated, updated: updated },
        caller: 'NFeEntradaRepository', rowId: String(numeroNf)
      });
    }
  }

  /** Retorna as NFs ainda não processadas (sem PROCESSADA_EM). */
  function getNfesNaoProcessadas(sheetId) {
    var rows = getNfes(sheetId);
    return rows.filter(function (r) {
      return !r.PROCESSADA_EM;
    });
  }

  return {
    SHEET_NAME: SHEET_NAME,
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getExistingNumeroNf: getExistingNumeroNf,
    getNfes: getNfes,
    getRecentNfes: getRecentNfes,
    insertNfes: insertNfes,
    marcarNfProcessada: marcarNfProcessada,
    getNfesNaoProcessadas: getNfesNaoProcessadas
  };
})();
