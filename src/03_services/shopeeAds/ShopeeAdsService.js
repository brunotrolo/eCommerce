/**
 * ShopeeAdsService — Gestão de eficiência de anúncios pagos Shopee via Tiops.
 * Sincroniza campanhas, performance e saldo para Google Sheets.
 * Cache: campanhas 5min, performance 15min.
 *
 * Ações Tiops usadas:
 *   shopee_ads_balance — saldo de créditos
 *   shopee_ads_campaigns — listar campanhas
 *   shopee_ads_pause_campaign / resume_campaign / terminate_campaign — ações
 *   shopee_ads_daily_performance — performance diária
 *   shopee_ads_hourly_performance — performance horária
 *   shopee_ads_recommended_keywords / edit_keywords / delete_keywords — keywords
 *   shopee_ads_recommended_items / gms_items — itens
 *   shopee_ads_roi_target — meta de ROAS
 *
 * Regras em specs/shopee-ads.md.
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

  function getFromCache_(key, ttl) {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setCache_(key, data, ttl) {
    var cache = CacheService.getScriptCache();
    cache.put(key, JSON.stringify(data), ttl);
  }

  function invalidateCache_() {
    var cache = CacheService.getScriptCache();
    var keys = ['shopee_ads_campanhas', 'shopee_ads_balance', 'shopee_ads_performance'];
    cache.removeAll(keys);
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
    } else {
      data = callTiops_('shopee_ads_campaigns', {});
      setCache_(cacheKey_('campanhas_raw'), data, CACHE_TTL_CAMPANHAS);
    }

    var campanhas = normalizeCampaigns_(data);

    // Busca métricas de performance para cada campanha em paralelo
    if (campanhas.length > 0) {
      var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');
      var sevenDaysAgo = Utilities.formatDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), Session.getScriptTimeZone(), 'dd-MM-yyyy'
      );

      var batchItems = campanhas.map(function (c) {
        return {
          action: 'shopee_ads_daily_performance',
          params: {
            campaign_id: Number(c.CAMPANHA_ID),
            start_date: sevenDaysAgo,
            end_date: today
          }
        };
      });

      var batchResults = TiopsClient.callBatch ? TiopsClient.callBatch(batchItems) : [];

      for (var i = 0; i < batchResults.length && i < campanhas.length; i++) {
        var br = batchResults[i];
        if (br && !br.error && br.data) {
          var perf = br.data.response || br.data;
          var perfData = perf.performance_list || perf.data || [];
          if (Array.isArray(perfData) && perfData.length > 0) {
            // Agrega os últimos 7 dias
            var agg = aggregatePerformance_(perfData);
            campanhas[i].IMPRESSOES = agg.impressions;
            campanhas[i].CLIQUES = agg.clicks;
            campanhas[i].CTR = agg.ctr;
            campanhas[i].CVR = agg.cvr;
            campanhas[i].GASTO_TOTAL = agg.cost;
            campanhas[i].VENDAS = agg.revenue;
            campanhas[i].ROAS = agg.roas;
            campanhas[i].CONVERSOES = agg.conversions;
          }
        }
      }
    }

    var sheetId = getSheetId_();
    var syncResult = ShopeeAdsRepository.syncCampanhas(sheetId, campanhas);
    invalidateCache_();

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
      result.impressions += Number(d.impressions || d.impression || 0);
      result.clicks += Number(d.clicks || d.click || 0);
      result.cost += Number(d.cost || d.spend || d.total_cost || 0);
      result.revenue += Number(d.revenue || d.sales || d.gmv || 0);
      result.conversions += Number(d.conversions || d.conversion || 0);
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
    getVisitMetrics: getVisitMetrics
  };
})();
