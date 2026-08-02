/**
 * NFeEntradaRepository — leitura/escrita na aba NFE_ENTRADA do Google Sheets.
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 */
var NFeEntradaRepository = (function () {
  var SHEET_NAME = 'NFE_ENTRADA';
  var HEADERS = [
    'NUMERO_NF', 'CHAVE_NF', 'DATA_EMISSAO', 'EMITENTE_CNPJ', 'EMITENTE_NOME',
    'EMITENTE_IE', 'EMITENTE_ENDERECO', 'DESTINATARIO_CNPJ', 'DESTINATARIO_NOME',
    'DESTINATARIO_IE', 'DESTINATARIO_ENDERECO', 'VALOR_TOTAL', 'VALOR_DESCONTO',
    'VALOR_FRETE', 'VALOR_ICMS', 'VALOR_PIS', 'VALOR_COFINS', 'VALOR_IBS',
    'VALOR_CBS', 'PRODUTOS_JSON', 'STATUS_NFE', 'NUMERO_PROTOCOLO', 'DATA_SYNC',
    'TIPO_ARQUIVO', 'PROCESSADA_EM'
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

    var lastHeaderCol = sheet.getLastColumn();
    var missingIndex = HEADERS.indexOf('PROCESSADA_EM');
    if (lastHeaderCol < HEADERS.length && missingIndex !== -1) {
      var extraRange = sheet.getRange(1, lastHeaderCol + 1, 1, HEADERS.length - lastHeaderCol);
      extraRange.setValues([HEADERS.slice(lastHeaderCol)]);
    }
    return sheet;
  }

  /**
   * Retorna numeros_nf existentes na aba (para deduplicação).
   * @param {string} sheetId
   * @returns {string[]} array de números de NF existentes
   */
  function getExistingNumeroNf(sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var numeroNfIndex = HEADERS.indexOf('NUMERO_NF');
    var existing = [];
    for (var i = 1; i < values.length; i++) {
      var val = String(values[i][numeroNfIndex]).trim();
      if (val) existing.push(val);
    }
    return existing;
  }

  /**
   * Retorna todas as entradas da aba como array de objetos.
   * @param {string} sheetId
   * @returns {Array<Object>}
   */
  function getNfes(sheetId) {
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
   * Retorna as últimas N entradas (mais recentes primeiro).
   * @param {string} sheetId
   * @param {number} limit
   * @returns {Array<Object>}
   */
  function getRecentNfes(sheetId, limit) {
    var all = getNfes(sheetId);
    all.reverse();
    return all.slice(0, limit || 20);
  }

  /**
   * Insere múltiplas entradas na aba.
   * @param {Array<Object>} entries — array de objetos com campos do schema
   * @param {string} sheetId
   * @returns {{inserted: number}}
   */
  function insertNfes(entries, sheetId) {
    var sheet = getOrCreateSheet(sheetId);
    var inserted = 0;
    var errors = [];

    LoggingService.log({
      service: 'nfeEntrada.trace',
      action: 'repo:insert-start',
      status: 'OK',
      summary: 'Iniciando inserção de ' + entries.length + ' entrada(s) na aba ' + SHEET_NAME,
      context: { sheetId: sheetId, sheetName: SHEET_NAME, entriesCount: entries.length, lastRow: sheet.getLastRow() }
    });

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var row = [
        e.numeroNf || '',
        e.chaveNf || '',
        e.dataEmissao || '',
        e.emitenteCnpj || '',
        e.emitenteNome || '',
        e.emitenteIe || '',
        e.emitenteEndereco || '',
        e.destinatarioCnpj || '',
        e.destinatarioNome || '',
        e.destinatarioIe || '',
        e.destinatarioEndereco || '',
        e.valorTotal || 0,
        e.valorDesconto || 0,
        e.valorFrete || 0,
        e.valorIcms || 0,
        e.valorPis || 0,
        e.valorCofins || 0,
        e.valorIbs || 0,
        e.valorCbs || 0,
        e.produtosJson || '[]',
        e.statusNfe || '',
        e.numeroProtocolo || '',
        e.dataSync || new Date().toISOString(),
        e.tipoArquivo || 'xml',
        ''
      ];
      try {
        sheet.appendRow(row);
        inserted++;
        LoggingService.log({
          service: 'nfeEntrada.trace',
          action: 'repo:row-inserted',
          status: 'OK',
          summary: 'Linha inserida: nf=' + e.numeroNf + ' emitente=' + e.emitenteNome + ' valor=' + e.valorTotal,
          context: { numeroNf: e.numeroNf, emitenteNome: e.emitenteNome, valorTotal: e.valorTotal, statusNfe: e.statusNfe, tipoArquivo: e.tipoArquivo, rowNumber: sheet.getLastRow() }
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

    return { inserted: inserted, errors: errors };
  }

  /**
   * Marca uma NF como processada, gravando o timestamp em PROCESSADA_EM.
   * @param {string} sheetId
   * @param {string} numeroNf
   * @param {string} processadaEm — ISO string
   */
  function marcarNfProcessada(sheetId, numeroNf, processadaEm) {
    var sheet = getOrCreateSheet(sheetId);
    var numeroNfIndex = HEADERS.indexOf('NUMERO_NF');
    var processadaIndex = HEADERS.indexOf('PROCESSADA_EM');
    var colNumeroNf = numeroNfIndex + 1;
    var colProcessada = processadaIndex + 1;
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][numeroNfIndex]).trim() === String(numeroNf).trim()) {
        sheet.getRange(i + 1, colProcessada).setValue(processadaEm);
      }
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
