/**
 * ShopeeAdsRepository — leitura/escrita na aba SHOPEE_ADS do Google Sheets.
 * Armazena campanhas, performance diária e métricas de visitas/conversão.
 * Nenhum serviço chama SpreadsheetApp diretamente; tudo passa por aqui.
 * Colunas são lidas/escritas por NOME (não por posição).
 */
var ShopeeAdsRepository = (function () {
  var CAMPANHAS_SHEET = 'SHOPEE_ADS';
  var PERFORMANCE_SHEET = 'SHOPEE_ADS_PERFORMANCE';
  var VISITAS_SHEET = 'SHOPEE_ADS_VISITAS';

  var CAMPANHAS_HEADERS = [
    'CAMPANHA_ID', 'NOME', 'TIPO', 'STATUS', 'ORCAMENTO_DIARIO',
    'GASTO_TOTAL', 'IMPRESSOES', 'CLIQUES', 'CTR', 'CVR',
    'ROAS', 'VENDAS', 'CONVERSOES', 'ITENS_ANUNCADOS',
    'DATA_CRIACAO', 'DATA_ATUALIZACAO', 'DATA_SINCRONIZACAO'
  ];

  var PERFORMANCE_HEADERS = [
    'CAMPANHA_ID', 'NOME_CAMPANHA', 'DATA', 'IMPRESSOES', 'CLIQUES',
    'GASTO', 'CPC', 'CTR', 'CVR', 'CONVERSOES', 'VENDAS', 'ROAS',
    'DATA_REGISTRO'
  ];

  var VISITAS_HEADERS = [
    'ITEM_ID', 'NOME_ITEM', 'SKU', 'VISITAS', 'CONVERSAO',
    'CLIQUES', 'IMPRESSOES', 'DATA', 'DATA_REGISTRO'
  ];

  function getOrCreateSheet_(sheetId, sheetName, headers) {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      return sheet;
    }
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return sheet;
    }
    var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    for (var i = 0; i < existing.length; i++) {
      var h = String(existing[i]).trim();
      if (h) headerMap[h] = i + 1;
    }
    var missing = [];
    for (var j = 0; j < headers.length; j++) {
      if (!headerMap[headers[j]]) missing.push(headers[j]);
    }
    if (missing.length > 0) {
      sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
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

  function buildIdMap_(sheet, colName) {
    var colMap = getColumnMap_(sheet);
    var colIdx = colMap[colName];
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

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  function syncCampanhas(sheetId, campanhas) {
    var sheet = getOrCreateSheet_(sheetId, CAMPANHAS_SHEET, CAMPANHAS_HEADERS);
    var colMap = getColumnMap_(sheet);
    var idMap = buildIdMap_(sheet, 'CAMPANHA_ID');
    var novos = 0, atualizados = 0;
    var errors = [];
    var now = nowBR_();

    for (var i = 0; i < campanhas.length; i++) {
      var c = campanhas[i] || {};
      try {
        var campId = String(c.CAMPANHA_ID || c.campaign_id || '').trim();
        if (!campId) continue;
        var rowIdx = idMap[campId];
        var isNew = !rowIdx;
        if (isNew) {
          rowIdx = sheet.getLastRow() + 1;
          idMap[campId] = rowIdx;
          novos++;
        } else {
          atualizados++;
        }
        var row = new Array(colMap['DATA_SINCRONIZACAO'] || CAMPANHAS_HEADERS.length).fill('');
        var fields = {
          CAMPANHA_ID: campId,
          NOME: c.NOME || c.campaign_name || '',
          TIPO: c.TIPO || c.campaign_type || '',
          STATUS: c.STATUS || c.status || '',
          ORCAMENTO_DIARIO: c.ORCAMENTO_DIARIO || c.daily_budget || '',
          GASTO_TOTAL: c.GASTO_TOTAL || c.total_spend || 0,
          IMPRESSOES: c.IMPRESSOES || c.impressions || 0,
          CLIQUES: c.CLIQUES || c.clicks || 0,
          CTR: c.CTR || c.ctr || 0,
          CVR: c.CVR || c.cvr || 0,
          ROAS: c.ROAS || c.roas || 0,
          VENDAS: c.VENDAS || c.sales || 0,
          CONVERSOES: c.CONVERSOES || c.conversions || 0,
          ITENS_ANUNCADOS: c.ITENS_ANUNCADOS || c.item_count || 0,
          DATA_CRIACAO: c.DATA_CRIACAO || c.create_time || '',
          DATA_ATUALIZACAO: c.DATA_ATUALIZACAO || c.update_time || '',
          DATA_SINCRONIZACAO: now
        };
        var keys = Object.keys(fields);
        for (var k = 0; k < keys.length; k++) {
          var col = colMap[keys[k]];
          if (col) row[col - 1] = fields[keys[k]];
        }
        sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
      } catch (e) {
        errors.push({ campaignId: campId, error: e.message });
      }
    }

    SheetsRepository.logWriteAudit({
      sheet: CAMPANHAS_SHEET, operation: 'UPSERT',
      status: errors.length > 0 ? 'PARTIAL' : 'OK',
      stats: { inserted: novos, updated: atualizados, errors: errors.length },
      caller: 'ShopeeAdsRepository', detail: 'syncCampanhas'
    });
    return { novos: novos, atualizados: atualizados, errors: errors };
  }

  function getCampanhas(sheetId, filtro) {
    var sheet = getOrCreateSheet_(sheetId, CAMPANHAS_SHEET, CAMPANHAS_HEADERS);
    var rows = rowsToObjects_(sheet);
    if (filtro && filtro.status && filtro.status !== 'all') {
      var st = filtro.status.toUpperCase();
      rows = rows.filter(function (r) {
        return String(r.STATUS || '').toUpperCase() === st;
      });
    }
    return rows;
  }

  function syncPerformance(sheetId, dados) {
    if (!dados || dados.length === 0) return { inserted: 0 };
    var sheet = getOrCreateSheet_(sheetId, PERFORMANCE_SHEET, PERFORMANCE_HEADERS);
    var now = nowBR_();
    var rows = [];
    for (var i = 0; i < dados.length; i++) {
      var d = dados[i] || {};
      rows.push([
        d.CAMPANHA_ID || d.campaign_id || '',
        d.NOME_CAMPANHA || d.campaign_name || '',
        d.DATA || d.date || '',
        d.IMPRESSOES || d.impressions || 0,
        d.CLIQUES || d.clicks || 0,
        d.GASTO || d.spend || 0,
        d.CPC || d.cpc || 0,
        d.CTR || d.ctr || 0,
        d.CVR || d.cvr || 0,
        d.CONVERSOES || d.conversions || 0,
        d.VENDAS || d.sales || 0,
        d.ROAS || d.roas || 0,
        now
      ]);
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PERFORMANCE_HEADERS.length).setValues(rows);
    return { inserted: rows.length };
  }

  function getPerformance(sheetId, campaignId, dateFrom, dateTo) {
    var sheet = getOrCreateSheet_(sheetId, PERFORMANCE_SHEET, PERFORMANCE_HEADERS);
    var rows = rowsToObjects_(sheet);
    if (campaignId) {
      rows = rows.filter(function (r) {
        return String(r.CAMPANHA_ID || '') === String(campaignId);
      });
    }
    if (dateFrom) {
      rows = rows.filter(function (r) {
        return String(r.DATA || '') >= dateFrom;
      });
    }
    if (dateTo) {
      rows = rows.filter(function (r) {
        return String(r.DATA || '') <= dateTo;
      });
    }
    return rows;
  }

  function syncVisitas(sheetId, dados) {
    if (!dados || dados.length === 0) return { inserted: 0 };
    var sheet = getOrCreateSheet_(sheetId, VISITAS_SHEET, VISITAS_HEADERS);
    var now = nowBR_();
    var rows = [];
    for (var i = 0; i < dados.length; i++) {
      var d = dados[i] || {};
      rows.push([
        d.ITEM_ID || d.item_id || '',
        d.NOME_ITEM || d.item_name || '',
        d.SKU || d.sku || '',
        d.VISITAS || d.visits || 0,
        d.CONVERSAO || d.conversion_rate || 0,
        d.CLIQUES || d.clicks || 0,
        d.IMPRESSOES || d.impressions || 0,
        d.DATA || d.date || '',
        now
      ]);
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, VISITAS_HEADERS.length).setValues(rows);
    return { inserted: rows.length };
  }

  function getVisitas(sheetId, itemId) {
    var sheet = getOrCreateSheet_(sheetId, VISITAS_SHEET, VISITAS_HEADERS);
    var rows = rowsToObjects_(sheet);
    if (itemId) {
      rows = rows.filter(function (r) {
        return String(r.ITEM_ID || '') === String(itemId);
      });
    }
    return rows;
  }

  return {
    CAMPANHAS_SHEET: CAMPANHAS_SHEET,
    PERFORMANCE_SHEET: PERFORMANCE_SHEET,
    VISITAS_SHEET: VISITAS_SHEET,
    syncCampanhas: syncCampanhas,
    getCampanhas: getCampanhas,
    syncPerformance: syncPerformance,
    getPerformance: getPerformance,
    syncVisitas: syncVisitas,
    getVisitas: getVisitas
  };
})();
