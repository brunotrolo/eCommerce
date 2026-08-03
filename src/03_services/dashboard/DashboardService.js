/**
 * DashboardService — visão unificada de vendas/pedidos das duas lojas.
 * Consome OrdersService e ListingsService (ambos lêem do Google Sheets),
 * com cache curto (CacheRepository) para não sobrecarregar. Regras em specs/dashboard.md.
 */
var DashboardService = (function () {
  var CACHE_KEY = 'dashboard_summary';
  var CACHE_TTL_SECONDS = 300; // 5 min

  function describe() {
    return {
      name: 'dashboard',
      actions: {
        getSummary: {
          description: 'Resumo unificado: pedidos recentes, vendas por canal e alertas de estoque baixo. Cacheado por 5 min.',
          params: {},
          returns: {
            orders: 'array',
            salesByChannel: 'object',
            lowStock: 'array',
            fromCache: 'boolean'
          }
        }
      }
    };
  }

  function getSummary() {
    var result = CacheRepository.getOrCompute(CACHE_KEY, CACHE_TTL_SECONDS, computeSummary_);
    return Object.assign({}, result.value, { fromCache: result.fromCache });
  }

  function computeSummary_() {
    var recentOrders = OrdersService.listUnified({ marketplace: 'all', limit: 10 }).orders;

    var salesByChannel = computeSalesByChannel_(recentOrders);
    var lowStock = findLowStock_();

    return {
      orders: recentOrders,
      salesByChannel: salesByChannel,
      lowStock: lowStock
    };
  }

  function computeSalesByChannel_(orders) {
    var channels = { shopee: { total: 0, count: 0 }, mercado_livre: { total: 0, count: 0 } };

    orders.forEach(function (order) {
      var ch = channels[order.marketplace];
      if (ch) {
        ch.total += order.total;
        ch.count += 1;
      }
    });

    return {
      shopee: { gmv: channels.shopee.total, orders: channels.shopee.count },
      mercado_livre: { gmv: channels.mercado_livre.total, orders: channels.mercado_livre.count }
    };
  }

  function findLowStock_() {
    var listings = ListingsService.listUnified({ marketplace: 'all' }).listings;
    return listings.filter(function (item) {
      return typeof item.stock === 'number' && item.stock <= 3;
    });
  }

  return { describe: describe, getSummary: getSummary };
})();
