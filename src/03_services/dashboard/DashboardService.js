/**
 * DashboardService — visão unificada de vendas/pedidos das duas lojas.
 * Consome OrdersService (lê do Google Sheets),
 * com cache curto (CacheRepository) para não sobrecarregar. Regras de negócio documentadas no código abaixo.
 */
var DashboardService = (function () {
  var CACHE_KEY = 'dashboard_summary';
  var CACHE_TTL_SECONDS = 300; // 5 min

  function describe() {
    return {
      name: 'dashboard',
      actions: {
        getSummary: {
          description: 'Resumo unificado: pedidos recentes e vendas por canal. Cacheado por 5 min; forceFresh relê dos dados reais na hora.',
          params: {
            forceFresh: { type: 'boolean', required: false, description: 'Ignora o cache server e recalcula do Google Sheets' }
          },
          returns: {
            orders: 'array',
            salesByChannel: 'object',
            fromCache: 'boolean'
          }
        },
        getSyncOrder: {
          description: 'Retorna a lista de acoes de sincronizacao na ordem configurada na aba CONFIG (chave sincronizar).',
          params: {},
          returns: {
            steps: 'array'
          }
        }
      }
    };
  }

  function getSummary(params) {
    params = params || {};
    // forceFresh=true (botão Atualizar) relê do Sheets/dag na hora; o
    // padrão serve cache de até CACHE_TTL_SECONDS (as escritas do app já
    // invalidam 'dashboard_').
    if (params.forceFresh) CacheRepository.remove(CACHE_KEY);
    var result = CacheRepository.getOrCompute(CACHE_KEY, CACHE_TTL_SECONDS, computeSummary_);
    return Object.assign({}, result.value, { fromCache: result.fromCache });
  }

  function computeSummary_() {
    var recentOrders = OrdersService.listUnified({ marketplace: 'all', limit: 10 }).orders;
    var salesByChannel = computeSalesByChannel_(recentOrders);
    return {
      orders: recentOrders,
      salesByChannel: salesByChannel
    };
  }

  function computeSalesByChannel_(orders) {
    var channels = { shopee: { total: 0, count: 0 }, mercado_livre: { total: 0, count: 0 } };
    var canceledStatuses = { 'CANCELLED': 1, 'IN_CANCEL': 1, 'TO_RETURN': 1 };

    orders.forEach(function (order) {
      var ch = channels[order.marketplace];
      var st = String(order.status || '').toUpperCase();
      if (ch && !canceledStatuses[st]) {
        ch.total += order.total;
        ch.count += 1;
      }
    });

    return {
      shopee: { gmv: channels.shopee.total, orders: channels.shopee.count },
      mercado_livre: { gmv: channels.mercado_livre.total, orders: channels.mercado_livre.count }
    };
  }

  var DEFAULT_SYNC_STEPS = [
    'nfeEntrada.syncAndUpdateSheets',
    'estoque.sincronizar',
    'estoque.sincronizarPrecosCatalogo',
    'anunciosShopee.syncListings',
    'ordersImport.importShopeeOrders',
    'carteiraShopee.syncWallet'
  ];

  function getSyncOrder() {
    var raw = ConfigService.get('sincronizar');
    var steps = [];
    if (raw) {
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) steps = parsed;
      } catch (e) {
        steps = [];
      }
    }

    if (steps.length === 0) {
      return { steps: DEFAULT_SYNC_STEPS.slice() };
    }

    var hasPedidos = steps.indexOf('ordersImport.importShopeeOrders') !== -1;
    if (!hasPedidos) {
      var idx = steps.indexOf('estoque.sincronizarPrecosCatalogo');
      var insertAt = idx >= 0 ? idx + 1 : steps.length;
      steps.splice(insertAt, 0, 'ordersImport.importShopeeOrders');
    }

    return { steps: steps };
  }

  return { describe: describe, getSummary: getSummary, getSyncOrder: getSyncOrder };
})();
