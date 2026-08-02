/**
 * NFeEntradaRepository — leitura/escrita na aba NFE_ENTRADA do Google Sheets.
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 */
var NFeEntradaRepository = (function () {
  var SHEET_NAME = 'NFE_ENTRADA';
  var HEADERS = [
    'numero_nf', 'chave_nf', 'data_emissao', 'emitente_cnpj', 'emitente_nome',
    'emitente_ie', 'emitente_endereco', 'destinatario_cnpj', 'destinatario_nome',
    'destinatario_ie', 'destinatario_endereco', 'valor_total', 'valor_desconto',
    'valor_frete', 'valor_icms', 'valor_pis', 'valor_cofins', 'valor_ibs',
    'valor_cbs', 'produtos_json', 'status_nfe', 'numero_protocolo', 'data_sync',
    'tipo_arquivo'
  ];

  function getOrCreateSheet(sheetId) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
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
    var numeroNfIndex = HEADERS.indexOf('numero_nf');
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
        e.tipoArquivo || 'xml'
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

  return {
    HEADERS: HEADERS,
    getOrCreateSheet: getOrCreateSheet,
    getExistingNumeroNf: getExistingNumeroNf,
    getNfes: getNfes,
    getRecentNfes: getRecentNfes,
    insertNfes: insertNfes
  };
})();
