/**
 * DashboardService — visão unificada de vendas/pedidos das duas lojas.
 * Consome OrdersService (normalizado) + chamadas agregadas diretas ao
 * Tiops para métricas de venda, com cache curto (CacheRepository) para não
 * bater rate limit a cada carregamento da tela. Regras em specs/dashboard.md.
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
            shopeeIncome: 'object',
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
    // Dados de exemplo — valores reais virão via Claude Code + TIOPS MCP
    var shopeeIncome = {
      gmv: 1250.50,
      netProfit: 312.60,
      orders: 8,
      fromCache: true
    };
    var lowStock = findLowStock_();

    return {
      orders: recentOrders,
      shopeeIncome: shopeeIncome,
      lowStock: lowStock
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
