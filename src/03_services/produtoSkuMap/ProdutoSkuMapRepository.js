/**
 * ProdutoSkuMapRepository — leitura/escrita na aba ANUNCIOS_SHOPEE (inventário
 * master de anúncios Shopee, fonte de item_sku) e abas auxiliares:
 *   - ANUNCIOS_SHOPEE (1 linha por item, upsert por ITEM_ID)
 *   - ANUNCIOS_HISTORICO_PRECOS (append-only)
 *   - ANUNCIOS_HISTORICO_ESTOQUE (append-only)
 *   - ANUNCIOS_PERFORMANCE (1 linha snapshot sobrescrita a cada sync)
 * Antigo AnunciosShopeeRepository (domínio anunciosShopee removido em
 * 12/08/2026): absorvido pelo domínio produtoSkuMap. Sem página de UI desde
 * 12/08/2026 (ProdutoSkuMapView removida) — consumido por Dashboard
 * (cadeia Sincronizar Tudo), OrdersImportService, CatalogService e
 * EstoqueBaixaService.
 *
 * Regra de leitura (mudança deliberada na migração): leituras (getAll/
 * getItemSkuMap) NUNCA criam a aba — se ela não existir, devolvem []/{},
 * sem efeito colateral no Sheets. Só as escritas (syncMain/patchMain/
 * appendRows_) usam getOrCreateSheet, porque syncListings/updateSku são
 * explicitamente a fonte que popula a aba.
 *
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 * Colunas são lidas/escritas por NOME (não por posição).
 * Datas sempre no padrão BR (dd/MM/yyyy HH:mm:ss) — só BR neste projeto.
 */
var ProdutoSkuMapRepository = (function () {
  var MAIN_SHEET = 'ANUNCIOS_SHOPEE';
  var PRECO_SHEET = 'ANUNCIOS_HISTORICO_PRECOS';
  var ESTOQUE_SHEET = 'ANUNCIOS_HISTORICO_ESTOQUE';
  var PERFORMANCE_SHEET = 'ANUNCIOS_PERFORMANCE';

  var MAIN_HEADERS = [
    'ITEM_ID', 'SKU', 'NOME', 'CATEGORIA', 'PRECO', 'ESTOQUE', 'STATUS',
    'DATA_CRIACAO', 'DATA_ATUALIZACAO', 'IMAGEM_URL', 'LINK_SHOPEE',
    'VENDAS_30D', 'AVALIACAO', 'NUM_COMENTARIOS', 'TIPO_VARIACAO',
    'ORIGINAL_PRICE', 'MOEDA', 'ATIVO_OUTLET', 'DADOS_JSON', 'DATA_SINCRONIZACAO'
  ];

  var PRECO_HEADERS = [
    'ITEM_ID', 'NOME_ITEM', 'PRECO_ANTIGO', 'PRECO_NOVO', 'DATA_MUDANCA',
    'USUARIO', 'REFERENCIA'
  ];

  var ESTOQUE_HEADERS = [
    'ITEM_ID', 'NOME_ITEM', 'ESTOQUE_ANTIGO', 'ESTOQUE_NOVO', 'MUDANCA',
    'DATA_MUDANCA', 'MOTIVO', 'REFERENCIA'
  ];

  var PERFORMANCE_HEADERS = [
    'PERIODO', 'TOTAL_ANUNCIOS_ATIVOS', 'TOTAL_ESTOQUE', 'VENDAS_TOTAL',
    'PEDIDOS_TOTAL', 'AVALIACAO_MEDIA', 'COMENTARIOS_TOTAL', 'VISITAS_TOTAL',
    'TAXA_CONVERSAO', 'DATA_SINCRONIZACAO'
  ];

  /** Só para escritas. Leituras nunca chamam isto (ver getSheet_). */
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

  /** Leitura SEM efeito colateral: null se a aba não existir. */
  function getSheet_(sheetId, sheetName) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    return sheet || null;
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

  function rowsToObjects_(sheet) {
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
    return rows;
  }

  /** Índice (linha no Sheets) do item, ou null se não existir. */
  function findItemRow_(sheet, itemId) {
    var colMap = getColumnMap_(sheet);
    var colIdx = colMap['ITEM_ID'];
    if (!colIdx) return null;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var values = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === String(itemId).trim()) return i + 2;
    }
    return null;
  }

  /** Mapa itemId → rowIndex para busca O(1). Uma única leitura do Sheets. */
  function buildItemIdMap_(sheet) {
    var colMap = getColumnMap_(sheet);
    var colIdx = colMap['ITEM_ID'];
    var lastRow = sheet.getLastRow();
    if (!colIdx || lastRow < 2) return {};
    var values = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    var map = {};
    for (var i = 0; i < values.length; i++) {
      var id = String(values[i][0]).trim();
      if (id) map[id] = i + 2;
    }
    return map;
  }

  /**
   * Upsert de listings: atualiza linha existente por ITEM_ID, insere se novo.
   * Dev () para o chamador decidir histórico — aqui apenas reflete o estado
   * atual em ANUNCIOS_SHOPEE.
   */
  function syncMain(sheetId, items) {
    var sheet = getOrCreateSheet(sheetId, MAIN_SHEET, MAIN_HEADERS);
    var colMap = getColumnMap_(sheet);
    var itemIdMap = buildItemIdMap_(sheet);
    var novos = 0;
    var atualizados = 0;
    var errors = [];
    var now = nowBR_();

    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      try {
        var itemId = String(item.ITEM_ID || item.item_id || '').trim();
        if (!itemId) continue;
        var existingRow = itemIdMap[itemId];
        var isNew = !existingRow;
        var rowIdx;
        if (isNew) {
          rowIdx = sheet.getLastRow() + 1;
          itemIdMap[itemId] = rowIdx;
          novos++;
        } else {
          rowIdx = existingRow;
          atualizados++;
        }
        writeMainRow_(sheet, rowIdx, colMap, item, now);
      } catch (e) {
        errors.push({ itemId: (item && (item.ITEM_ID || item.item_id)) || '', error: e.message });
      }
    }
    SheetsRepository.logWriteAudit({
      sheet: MAIN_SHEET, operation: 'UPSERT',
      status: errors.length > 0 ? 'ERROR' : 'OK',
      stats: { rows: atualizados + novos, inserted: novos, updated: atualizados },
      caller: 'ProdutoSkuMapRepository',
      detail: 'syncMain: ' + novos + ' novos, ' + atualizados + ' atualizados, ' + errors.length + ' erro(s)'
    });
    return { novos: novos, atualizados: atualizados, errors: errors };
  }

  function writeMainRow_(sheet, rowIdx, colMap, item, now) {
    var fieldToHeader = {
      ITEM_ID: 'ITEM_ID',
      SKU: 'SKU',
      NOME: 'NOME',
      CATEGORIA: 'CATEGORIA',
      PRECO: 'PRECO',
      ESTOQUE: 'ESTOQUE',
      STATUS: 'STATUS',
      DATA_CRIACAO: 'DATA_CRIACAO',
      DATA_ATUALIZACAO: 'DATA_ATUALIZACAO',
      IMAGEM_URL: 'IMAGEM_URL',
      LINK_SHOPEE: 'LINK_SHOPEE',
      VENDAS_30D: 'VENDAS_30D',
      AVALIACAO: 'AVALIACAO',
      NUM_COMENTARIOS: 'NUM_COMENTARIOS',
      TIPO_VARIACAO: 'TIPO_VARIACAO',
      ORIGINAL_PRICE: 'ORIGINAL_PRICE',
      MOEDA: 'MOEDA',
      ATIVO_OUTLET: 'ATIVO_OUTLET',
      DADOS_JSON: 'DADOS_JSON',
      DATA_SINCRONIZACAO: 'DATA_SINCRONIZACAO'
    };
    var lastCol = sheet.getLastColumn();
    var row = [];
    for (var c = 1; c <= lastCol; c++) row.push('');
    var keys = Object.keys(fieldToHeader);
    for (var i = 0; i < keys.length; i++) {
      var col = colMap[fieldToHeader[keys[i]]];
      if (!col) continue;
      var value = item[keys[i]];
      if (value === undefined || value === null) value = '';
      row[col - 1] = value;
    }
    if (colMap['DATA_ATUALIZACAO']) row[colMap['DATA_ATUALIZACAO'] - 1] = now;
    if (colMap['DATA_SINCRONIZACAO']) row[colMap['DATA_SINCRONIZACAO'] - 1] = now;
    sheet.getRange(rowIdx, 1, 1, lastCol).setValues([row]);
  }

  /** Lê todas as linhas do inventário como objetos (chave = header). */
  function getAll(sheetId) {
    var sheet = getSheet_(sheetId, MAIN_SHEET);
    if (!sheet) return [];
    return rowsToObjects_(sheet);
  }

  /**
   * Retorna mapa item_id → SKU a partir da aba ANUNCIOS_SHOPEE.
   * Usado por OrdersImportService para preencher SKUs em pedidos onde
   * a Shopee não retorna item_sku (caso da maioria dos pedidos antigos) e
   * pelo CatalogService para resolver vendas de pedidos por código de
   * produto. Leitura sem efeito colateral: aba ausente → {}.
   */
  function getItemSkuMap(sheetId) {
    sheetId = (typeof sheetId === 'string' && sheetId) ? sheetId : ConfigService.getSheetId();
    var sheet = getSheet_(sheetId, MAIN_SHEET);
    if (!sheet) return {};
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol === 0) return {};

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var itemIdCol = -1;
    var skuCol = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).trim();
      if (h === 'ITEM_ID') itemIdCol = i + 1;
      if (h === 'SKU') skuCol = i + 1;
    }
    if (itemIdCol === -1 || skuCol === -1) return {};

    var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var map = {};
    for (var r = 0; r < allValues.length; r++) {
      var itemId = String(allValues[r][itemIdCol - 1]).trim();
      var sku = String(allValues[r][skuCol - 1]).trim();
      if (itemId && sku) {
        map[itemId] = sku;
      }
    }
    return map;
  }

  /** Atualiza campos específicos (por header) de um item já existente. */
  function patchMain(sheetId, itemId, updates) {
    var sheet = getOrCreateSheet(sheetId, MAIN_SHEET, MAIN_HEADERS);
    var rowIdx = findItemRow_(sheet, itemId);
    if (rowIdx === null) return { success: false, error: 'Item não encontrado: ' + itemId };
    var colMap = getColumnMap_(sheet);
    var lastCol = sheet.getLastColumn();
    var row = sheet.getRange(rowIdx, 1, 1, lastCol).getValues()[0];
    var keys = Object.keys(updates || {});
    for (var i = 0; i < keys.length; i++) {
      var col = colMap[keys[i]];
      if (!col) continue;
      var value = updates[keys[i]];
      if (value === undefined || value === null) value = '';
      row[col - 1] = value;
    }
    if (colMap['DATA_ATUALIZACAO']) row[colMap['DATA_ATUALIZACAO'] - 1] = nowBR_();
    sheet.getRange(rowIdx, 1, 1, lastCol).setValues([row]);
    SheetsRepository.logWriteAudit({
      sheet: MAIN_SHEET, operation: 'UPDATE', status: 'OK',
      stats: { rows: 1, updated: 1 },
      caller: 'ProdutoSkuMapRepository', rowId: String(itemId)
    });
    return { success: true, row: rowIdx };
  }

  function appendRows_(sheetId, sheetName, headers, rows) {
    var sheet = getOrCreateSheet(sheetId, sheetName, headers);
    var colMap = getColumnMap_(sheet);
    var lastCol = sheet.getLastColumn();
    var inserted = 0;
    var errors = [];
    var matrix = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      try {
        var line = [];
        for (var c = 1; c <= lastCol; c++) line.push('');
        var keys = Object.keys(row);
        for (var k = 0; k < keys.length; k++) {
          var col = colMap[keys[k]];
          if (!col) continue;
          var value = row[keys[k]];
          if (value === undefined || value === null) value = '';
          line[col - 1] = value;
        }
        matrix.push(line);
        inserted++;
      } catch (e) {
        errors.push({ error: e.message });
      }
    }
    if (matrix.length > 0) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, matrix.length, lastCol).setValues(matrix);
    }
    SheetsRepository.logWriteAudit({
      sheet: sheetName, operation: 'APPEND',
      status: errors.length > 0 ? 'ERROR' : 'OK',
      stats: { rows: rows.length, inserted: inserted },
      caller: 'ProdutoSkuMapRepository',
      detail: 'appendRows_: ' + inserted + ' ok, ' + errors.length + ' erro(s)'
    });
    return { inserted: inserted, errors: errors };
  }

  function logPrecoChange(sheetId, entry) {
    return appendRows_(sheetId, PRECO_SHEET, PRECO_HEADERS, [entry]);
  }

  function logEstoqueChange(sheetId, entry) {
    return appendRows_(sheetId, ESTOQUE_SHEET, ESTOQUE_HEADERS, [entry]);
  }

  /** Snapshot de performance (linha 2) — sempre sobrescreve, 1 linha de dados. */
  function writePerformance(sheetId, perf) {
    var sheet = getOrCreateSheet(sheetId, PERFORMANCE_SHEET, PERFORMANCE_HEADERS);
    var colMap = getColumnMap_(sheet);
    var lastCol = sheet.getLastColumn();
    var row = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    var fieldToHeader = {
      periodo: 'PERIODO',
      totalAnunciosAtivos: 'TOTAL_ANUNCIOS_ATIVOS',
      totalEstoque: 'TOTAL_ESTOQUE',
      vendasTotal: 'VENDAS_TOTAL',
      pedidosTotal: 'PEDIDOS_TOTAL',
      avaliacaoMedia: 'AVALIACAO_MEDIA',
      comentariosTotal: 'COMENTARIOS_TOTAL',
      visitasTotal: 'VISITAS_TOTAL',
      taxaConversao: 'TAXA_CONVERSAO',
      dataSincronizacao: 'DATA_SINCRONIZACAO'
    };
    var keys = Object.keys(fieldToHeader);
    for (var i = 0; i < keys.length; i++) {
      var col = colMap[fieldToHeader[keys[i]]];
      if (!col) continue;
      var value = perf[keys[i]];
      if (value === undefined || value === null) value = '';
      row[col - 1] = value;
    }
    sheet.getRange(2, 1, 1, lastCol).setValues([row]);
    SheetsRepository.logWriteAudit({
      sheet: PERFORMANCE_SHEET, operation: 'UPSERT', status: 'OK',
      stats: { rows: 1, updated: 1 },
      caller: 'ProdutoSkuMapRepository', rowId: String(perf.periodo || '')
    });
    return { success: true, sheetName: PERFORMANCE_SHEET };
  }

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  return {
    MAIN_SHEET: MAIN_SHEET,
    PRECO_SHEET: PRECO_SHEET,
    ESTOQUE_SHEET: ESTOQUE_SHEET,
    PERFORMANCE_SHEET: PERFORMANCE_SHEET,
    syncMain: syncMain,
    getAll: getAll,
    getItemSkuMap: getItemSkuMap,
    patchMain: patchMain,
    logPrecoChange: logPrecoChange,
    logEstoqueChange: logEstoqueChange,
    writePerformance: writePerformance
  };
})();