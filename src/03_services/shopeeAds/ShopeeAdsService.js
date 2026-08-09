/**
 * ShopeeAdsService — Gestão de eficiência de anúncios pagos Shopee via Tiops.
 * Sincroniza campanhas, performance e saldo para Google Sheets.
 * Cache: campanhas 5min, performance 15min.
 *
 * Ações Tiops usadas:
 *   shopee_ads_balance — saldo de créditos
 *   shopee_ads_campaigns — listar campanhas
 *   shopee_ads_pause_campaign / resume_campaign / terminate_campaign — ações
 *   shopee_ads_campaign_daily — performance por campanha (campaign_id_list)
 *   shopee_ads_hourly_performance — performance horária
 *   shopee_ads_recommended_keywords / edit_keywords / delete_keywords — keywords
 *   shopee_ads_recommended_items / gms_items — itens
 *   shopee_ads_roi_target — meta de ROAS
 *
 * Regras de negócio documentadas no código abaixo.
 */
var ShopeeAdsService = (function () {
  var CACHE_TTL_CAMPANHAS = 300;   // 5min
  var CACHE_TTL_PERFORMANCE = 900; // 15min
  var CACHE_TTL_BALANCE = 300;     // 5min

  function describe() {
    return {
      name: 'shopeeAds',
      actions: {
        getBalance: {
          description: 'Saldo atual de créditos Shopee Ads.',
          params: {},
          returns: { saldo: 'number', moeda: 'string', atualizadoEm: 'string' }
        },
        syncCampaigns: {
          description: 'Sincroniza campanhas via Tiops e grava no Sheets.',
          params: { forceFresh: { type: 'boolean', required: false, default: false } },
          returns: { success: 'boolean', synced: 'object' }
        },
        getCampaigns: {
          description: 'Lista campanhas (cache 5min).',
          params: { status: { type: 'string', required: false } },
          returns: { campanhas: 'array', resumo: 'object', atualizadoEm: 'string' }
        },
        getDailyPerformance: {
          description: 'Performance diária de campanhas (período).',
          params: {
            campaignId: { type: 'string', required: false },
            dateFrom: { type: 'string', required: false },
            dateTo: { type: 'string', required: false }
          },
          returns: { dados: 'array', resumo: 'object' }
        },
        getHourlyPerformance: {
          description: 'Performance horária de uma campanha num dia.',
          params: { campaignId: { type: 'string', required: true }, date: { type: 'string', required: true } },
          returns: { dados: 'array' }
        },
        pauseCampaign: {
          description: 'Pausa uma campanha ativa.',
          params: { campaignId: { type: 'string', required: true } },
          returns: { success: 'boolean', status: 'string' }
        },
        resumeCampaign: {
          description: 'Retoma uma campanha pausada.',
          params: { campaignId: { type: 'string', required: true } },
          returns: { success: 'boolean', status: 'string' }
        },
        terminateCampaign: {
          description: 'Encerra uma campanha permanentemente.',
          params: { campaignId: { type: 'string', required: true } },
          returns: { success: 'boolean' }
        },
        getKeywords: {
          description: 'Keywords recomendadas para uma campanha.',
          params: { campaignId: { type: 'string', required: true } },
          returns: { keywords: 'array' }
        },
        updateKeywords: {
          description: 'Edita keywords de uma campanha.',
          params: { campaignId: { type: 'string', required: true }, keywords: { type: 'array', required: true } },
          returns: { success: 'boolean', updated: 'number' }
        },
        deleteKeywords: {
          description: 'Remove keywords de uma campanha.',
          params: { campaignId: { type: 'string', required: true }, keywords: { type: 'array', required: true } },
          returns: { success: 'boolean', removed: 'number' }
        },
        getItems: {
          description: 'Itens anunciados numa campanha.',
          params: { campaignId: { type: 'string', required: true } },
          returns: { itens: 'array' }
        },
        getRecommendedItems: {
          description: 'Itens sugeridos para anunciar.',
          params: {},
          returns: { itens: 'array' }
        },
        setRoiTarget: {
          description: 'Define meta de ROAS para campanha automatizada.',
          params: { campaignId: { type: 'string', required: true }, roasTarget: { type: 'number', required: true } },
          returns: { success: 'boolean' }
        },
        getVisitMetrics: {
          description: 'Métricas de visita/conversão por item.',
          params: { itemId: { type: 'string', required: false }, days: { type: 'number', required: false, default: 7 } },
          returns: { visitas: 'number', conversao: 'number', dados: 'array' }
        },
        syncVisitMetrics: {
          description: 'Sincroniza visitas/pedidos por item (get_visits + search_orders_by_item) para a planilha.',
          params: { itemId: { type: 'string', required: false }, days: { type: 'number', required: false, default: 7 } },
          returns: { visitas: 'number', atualizadoEm: 'string', dados: 'array' }
        }
      }
    };
  }

  function callTiops_(action, params) {
    try {
      return TiopsClient.call(action, params);
    } catch (e) {
      var msg = e.message || String(e);
      throw new Error('TIOPS_CALL_FAILED: ' + msg);
    }
  }

  function getSheetId_() {
    return ConfigService.getSheetId();
  }

  function cacheKey_(name) {
    return 'shopee_ads_' + name;
  }

  function getFromCache_(key) {
    return CacheRepository.get(key);
  }

  function setCache_(key, data, ttl) {
    CacheRepository.set(key, data, ttl);
  }

  function invalidateCache_() {
    // Todas as chaves deste serviço nascem de cacheKey_() ('shopee_ads_' + nome),
    // inclusive as dinâmicas por campanha/item (performance_<id>, visitas_<id>) —
    // um único padrão cobre todas, sem precisar listar cada uma.
    CacheRepository.invalidateByPattern('shopee_ads_');
  }

  // --- Ações ---

  function getBalance() {
    var cached = getFromCache_(cacheKey_('balance'), CACHE_TTL_BALANCE);
    if (cached) return cached;

    var result = callTiops_('shopee_ads_balance', {});
    // TiopsClient retorna body.data = { response: { total_balance, data_timestamp } }
    var resp = result.response || result;
    var balance = {
      saldo: resp.total_balance || resp.saldo || resp.balance || 0,
      moeda: resp.currency || 'BRL',
      atualizadoEm: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
    };
    setCache_(cacheKey_('balance'), balance, CACHE_TTL_BALANCE);
    return balance;
  }

  function syncCampaigns(params) {
    var forceFresh = params && params.forceFresh;
    var cached = !forceFresh && getFromCache_(cacheKey_('campanhas_raw'), CACHE_TTL_CAMPANHAS);
    var data;
    if (cached) {
      data = cached;
      SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP1: cached=true, campanhas_raw do cache' });
    } else {
      data = callTiops_('shopee_ads_campaigns', {});
      setCache_(cacheKey_('campanhas_raw'), data, CACHE_TTL_CAMPANHAS);
      SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP1: callTiops shopee_ads_campaigns OK, tipo=' + typeof data + ', keys=' + (data ? Object.keys(data).join(',') : 'null') });
    }

    var campanhas = normalizeCampaigns_(data);
    SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP2: normalizeCampaigns resultado=' + campanhas.length + ' campanhas' });

    // Busca métricas de performance POR CAMPANHA (shopee_ads_campaign_daily
    // agrega por campaign_id_list — diferente de shopee_ads_daily_performance,
    // que é agregado da LOJA inteira). Uma única chamada para todas as campanhas.
    if (campanhas.length > 0) {
      var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');
      var sevenDaysAgo = Utilities.formatDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), Session.getScriptTimeZone(), 'dd-MM-yyyy'
      );

      var campaignIds = campanhas.map(function (c) { return Number(c.CAMPANHA_ID); });

      SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP3: shopee_ads_campaign_daily com campaign_id_list=' + campaignIds.length + ' itens, periodo ' + sevenDaysAgo + ' a ' + today });

      var perfResult = null;
      try {
        perfResult = callTiops_('shopee_ads_campaign_daily', {
          campaign_id_list: campaignIds,
          start_date: sevenDaysAgo,
          end_date: today
        });
      } catch (e) {
        SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'ERROR', caller: 'ShopeeAdsService', detail: 'STEP3b: campaign_daily lançou erro: ' + (e.message || e) });
      }

      SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP4: campaign_daily retornou ' + (perfResult ? 'objeto' : 'null') + (perfResult ? ', keys=' + Object.keys(perfResult).join(',') : '') });

      var comPerf = 0;
      var campanhasPorId = {};
      campanhas.forEach(function (c) { campanhasPorId[String(c.CAMPANHA_ID)] = c; });

      if (perfResult) {
        var resp = (perfResult.response || perfResult) || {};
        var campaignList = resp.campaign_list || resp.campaigns || [];
        if (!Array.isArray(campaignList)) campaignList = [];
        for (var i = 0; i < campaignList.length; i++) {
          var cl = campaignList[i];
          var alvo = campanhasPorId[String(cl.campaign_id)];
          if (!alvo) continue;
          var metrics = cl.metrics_list || [];
          if (!Array.isArray(metrics)) metrics = [];
          var agg = aggregatePerformance_(metrics);
          alvo.IMPRESSOES = agg.impressions;
          alvo.CLIQUES = agg.clicks;
          alvo.CTR = agg.ctr;
          alvo.CVR = agg.cvr;
          alvo.GASTO_TOTAL = agg.cost;
          alvo.VENDAS = agg.revenue;
          alvo.ROAS = agg.roas;
          alvo.CONVERSOES = agg.conversions;
          comPerf++;
        }
      }

      SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP5: performance processada: comPerf=' + comPerf + ', totalCampanhas=' + campanhas.length });

      if (comPerf === 0) {
        var sample = perfResult ? JSON.stringify(perfResult).substring(0, 500) : 'perfResult=null';
        SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'WARN', caller: 'ShopeeAdsService', detail: 'STEP5b: NENHUMA perf processada. Sample[0]=' + sample });
      }
    }

    var sheetId = getSheetId_();
    SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP6: sheetId=' + sheetId + ' (ConfigService.getSheetId=' + ConfigService.getSheetId() + ')' });
    var syncResult = ShopeeAdsRepository.syncCampanhas(sheetId, campanhas);
    invalidateCache_();

    SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP7: syncCampanhas gravou noveos=' + syncResult.novos + ', atualizados=' + syncResult.atualizados + ', errors=' + syncResult.errors.length });

    SheetsRepository.logWriteAudit({ sheet: 'SHOPEE_ADS', operation: 'SYNC_STEP', status: 'OK', caller: 'ShopeeAdsService', detail: 'STEP8: amostra campanha[0]=' + JSON.stringify(campanhas[0]).substring(0, 400) });

    LoggingService.logAction('shopeeAds', 'syncCampaigns', {
      synced: campanhas.length,
      inserted: syncResult.novos,
      updated: syncResult.atualizados,
      errors: syncResult.errors.length
    });

    return { success: true, synced: syncResult };
  }

  function aggregatePerformance_(perfData) {
    var result = { impressions: 0, clicks: 0, cost: 0, revenue: 0, conversions: 0 };
    for (var i = 0; i < perfData.length; i++) {
      var d = perfData[i];
      if (!d) continue;
      result.impressions += Number(d.impressions || d.impression || 0);
      result.clicks += Number(d.clicks || d.click || 0);
      result.cost += Number(d.cost || d.expense || d.spend || d.total_cost || 0);
      // campaign-daily traz broad_gmv E direct_gmv na mesma linha — soma os dois
      var broadGmv = Number(d.broad_gmv || 0);
      var directGmv = Number(d.direct_gmv || 0);
      result.revenue += Number(d.revenue || 0) + broadGmv + directGmv;
      var broadOrder = Number(d.broad_order || 0);
      var directOrder = Number(d.direct_order || 0);
      result.conversions += Number(d.conversions || d.conversion || 0) + broadOrder + directOrder;
    }
    result.ctr = result.impressions > 0 ? Math.round((result.clicks / result.impressions) * 10000) / 100 : 0;
    result.cvr = result.clicks > 0 ? Math.round((result.conversions / result.clicks) * 10000) / 100 : 0;
    result.roas = result.cost > 0 ? Math.round((result.revenue / result.cost) * 100) / 100 : 0;
    return result;
  }

  function normalizeCampaigns_(data) {
    // TiopsClient retorna body.data = { response: { campaign_list: [...] } }
    var resp = (data && data.response) || data || {};
    var list = resp.campaign_list || resp.campaigns || [];
    if (!Array.isArray(list)) list = [];

    return list.map(function (c) {
      return {
        CAMPANHA_ID: String(c.campaign_id || c.id || ''),
        NOME: c.campaign_name || c.name || '',
        TIPO: adTypeLabel_(c.ad_type || c.campaign_type || ''),
        STATUS: c.status || 'ACTIVE',
        ORCAMENTO_DIARIO: c.daily_budget || c.budget || 0,
        GASTO_TOTAL: c.total_spend || c.spend || 0,
        IMPRESSOES: c.impressions || 0,
        CLIQUES: c.clicks || 0,
        CTR: c.ctr || 0,
        CVR: c.cvr || 0,
        ROAS: c.roas || 0,
        VENDAS: c.sales || c.revenue || 0,
        CONVERSOES: c.conversions || c.conversion || 0,
        ITENS_ANUNCADOS: c.item_count || 0,
        DATA_CRIACAO: c.create_time || '',
        DATA_ATUALIZACAO: c.update_time || ''
      };
    });
  }

  function adTypeLabel_(adType) {
    var map = { '0': 'Todos', '1': 'Busca', '2': 'Sugestão de Produto', '3': 'Flash Sale', '4': 'Landing Page' };
    return map[String(adType)] || String(adType);
  }

  function getCampaigns(params) {
    var cacheKey = cacheKey_('campanhas');
    var cached = getFromCache_(cacheKey, CACHE_TTL_CAMPANHAS);
    if (cached && !params.forceFresh) return cached;

    var sheetId = getSheetId_();
    var filtro = params && params.status ? { status: params.status } : null;
    var campanhas = ShopeeAdsRepository.getCampanhas(sheetId, filtro);

    var resumo = {
      total: campanhas.length,
      ativas: campanhas.filter(function (c) { return String(c.STATUS).toUpperCase() === 'ACTIVE'; }).length,
      pausadas: campanhas.filter(function (c) { return String(c.STATUS).toUpperCase() === 'PAUSED'; }).length,
      encerradas: campanhas.filter(function (c) { return String(c.STATUS).toUpperCase() === 'TERMINATED'; }).length,
      gastoTotal: campanhas.reduce(function (sum, c) { return sum + (Number(c.GASTO_TOTAL) || 0); }, 0),
      roasMedio: 0
    };
    if (resumo.total > 0) {
      var somaRoas = campanhas.reduce(function (sum, c) { return sum + (Number(c.ROAS) || 0); }, 0);
      resumo.roasMedio = Math.round((somaRoas / resumo.total) * 100) / 100;
    }

    var result = {
      campanhas: campanhas,
      resumo: resumo,
      atualizadoEm: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
    };
    setCache_(cacheKey, result, CACHE_TTL_CAMPANHAS);
    return result;
  }

  function getDailyPerformance(params) {
    var cacheKey = cacheKey_('performance_' + (params.campaignId || 'all'));
    var cached = getFromCache_(cacheKey, CACHE_TTL_PERFORMANCE);
    if (cached && !params.forceFresh) return cached;

    var sheetId = getSheetId_();
    var dados = ShopeeAdsRepository.getPerformance(sheetId, params.campaignId, params.dateFrom, params.dateTo);

    var resumo = {
      totalImpressoes: 0, totalCliques: 0, totalGasto: 0,
      totalConversoes: 0, totalVendas: 0, ctrMedio: 0, cvrMedio: 0, roasMedio: 0
    };
    for (var i = 0; i < dados.length; i++) {
      var d = dados[i];
      resumo.totalImpressoes += Number(d.IMPRESSOES) || 0;
      resumo.totalCliques += Number(d.CLIQUES) || 0;
      resumo.totalGasto += Number(d.GASTO) || 0;
      resumo.totalConversoes += Number(d.CONVERSOES) || 0;
      resumo.totalVendas += Number(d.VENDAS) || 0;
    }
    if (resumo.totalCliques > 0) resumo.ctrMedio = Math.round((resumo.totalCliques / resumo.totalImpressoes) * 10000) / 100;
    if (resumo.totalImpressoes > 0) resumo.cvrMedio = Math.round((resumo.totalConversoes / resumo.totalCliques) * 10000) / 100;
    if (resumo.totalGasto > 0) resumo.roasMedio = Math.round((resumo.totalVendas / resumo.totalGasto) * 100) / 100;

    var result = { dados: dados, resumo: resumo };
    setCache_(cacheKey, result, CACHE_TTL_PERFORMANCE);
    return result;
  }

  function getHourlyPerformance(params) {
    var result = callTiops_('shopee_ads_hourly_performance', {
      campaign_id: Number(params.campaignId),
      performance_date: params.date
    });
    return { dados: result.data || result.hourly_data || [] };
  }

  function pauseCampaign(params) {
    var result = callTiops_('shopee_ads_pause_campaign', { campaign_id: Number(params.campaignId) });
    invalidateCache_();
    LoggingService.logAction('shopeeAds', 'pauseCampaign', { campaignId: params.campaignId });
    return { success: true, status: 'PAUSED' };
  }

  function resumeCampaign(params) {
    var result = callTiops_('shopee_ads_resume_campaign', { campaign_id: Number(params.campaignId) });
    invalidateCache_();
    LoggingService.logAction('shopeeAds', 'resumeCampaign', { campaignId: params.campaignId });
    return { success: true, status: 'ACTIVE' };
  }

  function terminateCampaign(params) {
    var result = callTiops_('shopee_ads_terminate_campaign', { campaign_id: Number(params.campaignId) });
    invalidateCache_();
    LoggingService.logAction('shopeeAds', 'terminateCampaign', { campaignId: params.campaignId });
    return { success: true };
  }

  function getKeywords(params) {
    var result = callTiops_('shopee_ads_recommended_keywords', { campaign_id: Number(params.campaignId) });
    return { keywords: result.keywords || result.data || [] };
  }

  function updateKeywords(params) {
    var result = callTiops_('shopee_ads_edit_keywords', {
      campaign_id: Number(params.campaignId),
      keywords: params.keywords
    });
    LoggingService.logAction('shopeeAds', 'updateKeywords', { campaignId: params.campaignId, count: params.keywords.length });
    return { success: true, updated: params.keywords.length };
  }

  function deleteKeywords(params) {
    var result = callTiops_('shopee_ads_delete_keywords', {
      campaign_id: Number(params.campaignId),
      keywords: params.keywords
    });
    LoggingService.logAction('shopeeAds', 'deleteKeywords', { campaignId: params.campaignId, count: params.keywords.length });
    return { success: true, removed: params.keywords.length };
  }

  function getItems(params) {
    var result = callTiops_('shopee_ads_gms_items', { campaign_id: Number(params.campaignId) });
    return { itens: result.items || result.data || [] };
  }

  function getRecommendedItems() {
    var result = callTiops_('shopee_ads_recommended_items', {});
    return { itens: result.items || result.data || [] };
  }

  function setRoiTarget(params) {
    var result = callTiops_('shopee_ads_roi_target', {
      campaign_id: Number(params.campaignId),
      roas_target: params.roasTarget
    });
    LoggingService.logAction('shopeeAds', 'setRoiTarget', { campaignId: params.campaignId, roas: params.roasTarget });
    return { success: true };
  }

  function getItensML_(limit) {
    var itemsRes = callTiops_('list_items', { limit: limit || 50 });
    var raw = itemsRes || {};
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw.results && Array.isArray(raw.results)) {
      list = raw.results.map(function (r) { return r.body || r; });
    } else if (Array.isArray(raw.items)) {
      list = raw.items;
    } else if (Array.isArray(raw.data)) {
      list = raw.data;
    }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i] || {};
      var id = String(it.id || it.ITEM_ID || '');
      if (!id) continue;
      out.push({
        ITEM_ID: id,
        NOME_ITEM: it.title || it.item_name || it.NOME_ITEM || '',
        SKU: it.seller_sku || it.item_sku || it.SKU || ''
      });
    }
    return out;
  }

  function dateStr_(daysAgo) {
    var d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  function getVisitMetrics(params) {
    var cacheKey = cacheKey_('visitas_' + (params.itemId || 'all'));
    var cached = getFromCache_(cacheKey, CACHE_TTL_PERFORMANCE);
    if (cached) return cached;

    var sheetId = getSheetId_();
    var dados = ShopeeAdsRepository.getVisitas(sheetId, params.itemId);

    var totalVisitas = 0;
    for (var i = 0; i < dados.length; i++) {
      totalVisitas += Number(dados[i].VISITAS) || 0;
    }
    var result = {
      visitas: totalVisitas,
      conversao: dados.length > 0 ? Math.round((dados.reduce(function (s, d) { return s + (Number(d.CONVERSAO) || 0); }, 0) / dados.length) * 100) / 100 : 0,
      dados: dados
    };
    setCache_(cacheKey, result, CACHE_TTL_PERFORMANCE);
    return result;
  }

  function syncVisitMetrics(params) {
    params = params || {};
    var days = Math.min(Number(params.days) || 7, 90);
    var itemIdFilter = params.itemId ? String(params.itemId) : '';

    var itens = getItensML_(50);
    if (itemIdFilter) {
      itens = itens.filter(function (it) { return it.ITEM_ID === itemIdFilter; });
    }

    var batch = [];
    for (var i = 0; i < itens.length; i++) {
      batch.push({ action: 'get_visits', params: { item_id: itens[i].ITEM_ID, days: days } });
      batch.push({ action: 'search_orders_by_item', params: { item_id: itens[i].ITEM_ID, date_from: dateStr_(days), date_to: dateStr_(0) } });
    }

    var dados = [];
    var visitas = 0;
    var comDados = 0, semDados = 0, erros = 0;
    if (batch.length > 0) {
      var resBatch = TiopsClient.callBatch(batch);
      for (var j = 0; j < itens.length; j++) {
        var it = itens[j];
        var vr = resBatch[j * 2] || {};
        var or = resBatch[j * 2 + 1] || {};
        if (vr.error || or.error) { erros++; continue; }
        var vData = vr.data || {};
        var oData = or.data || {};
        var totalVisitas = Number(vData.total_visits || vData.visits || 0);
        var results = vData.results || [];
        if (totalVisitas === 0 && Array.isArray(results)) {
          var vis = 0;
          for (var k = 0; k < results.length; k++) vis += Number(results[k].total || 0);
          totalVisitas = vis;
        }
        var totalPedidos = Number(oData.paging && oData.paging.total) || 0;
        if (!totalPedidos && Array.isArray(oData.results)) totalPedidos = oData.results.length;
        if (totalVisitas > 0 || totalPedidos > 0) comDados++; else semDados++;
        var conversao = totalVisitas > 0 ? Math.round((totalPedidos / totalVisitas) * 10000) / 100 : 0;
        dados.push({
          ITEM_ID: it.ITEM_ID,
          NOME_ITEM: it.NOME_ITEM,
          SKU: it.SKU,
          VISITAS: totalVisitas,
          CONVERSAO: conversao,
          CLIQUES: 0,
          IMPRESSOES: 0,
          DATA: dateStr_(days) + ' a ' + dateStr_(0)
        });
        visitas += totalVisitas;
      }
    }

    var sheetId = getSheetId_();
    var syncResult = { novos: 0, atualizados: 0, errors: [] };
    if (dados.length > 0) {
      syncResult = ShopeeAdsRepository.syncVisitas(sheetId, dados);
    }

    SheetsRepository.logWriteAudit({
      sheet: 'SHOPEE_ADS_VISITAS', operation: 'SYNC', status: erros > 0 ? 'PARTIAL' : 'OK',
      caller: 'ShopeeAdsService',
      detail: 'syncVisitMetrics: itens=' + itens.length + ', comDados=' + comDados + ', semDados=' + semDados + ', erros=' + erros + ', novos=' + syncResult.novos + ', atualizados=' + syncResult.atualizados,
      stats: { itens: itens.length, comDados: comDados, semDados: semDados, erros: erros, novos: syncResult.novos, atualizados: syncResult.atualizados }
    });

    invalidateCache_();
    var result = {
      visitas: visitas,
      atualizadoEm: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      sincronizados: itens.length,
      dados: dados
    };
    setCache_(cacheKey_('visitas_' + (itemIdFilter || 'all')), result, CACHE_TTL_PERFORMANCE);
    return result;
  }

  return {
    describe: describe,
    getBalance: getBalance,
    syncCampaigns: syncCampaigns,
    getCampaigns: getCampaigns,
    getDailyPerformance: getDailyPerformance,
    getHourlyPerformance: getHourlyPerformance,
    pauseCampaign: pauseCampaign,
    resumeCampaign: resumeCampaign,
    terminateCampaign: terminateCampaign,
    getKeywords: getKeywords,
    updateKeywords: updateKeywords,
    deleteKeywords: deleteKeywords,
    getItems: getItems,
    getRecommendedItems: getRecommendedItems,
    setRoiTarget: setRoiTarget,
    getVisitMetrics: getVisitMetrics,
    syncVisitMetrics: syncVisitMetrics
  };
})();
