/**
 * ListingsService — anúncios (listar/detalhar/pausar/ativar) nos dois
 * canais. Regras completas, incluindo as pegadinhas de payload de cada
 * marketplace, em specs/listings.md (extraídas de docs/referencia/SHOPEE_CRIAR_ANUNCIO.md e
 * docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md).
 */
var ListingsService = (function () {
  function describe() {
    return {
      name: 'listings',
      actions: {
        listUnified: {
          description: 'Lista anúncios de ML e/ou Shopee normalizados num formato comum.',
          params: {
            marketplace: { type: 'string', required: false, default: 'all', enum: ['all', 'shopee', 'mercado_livre'] }
          },
          returns: { listings: 'array' }
        },
        getDetail: {
          description: 'Detalhe de um anúncio específico. Sempre relido do canal (nunca cacheado) para refletir o estado real.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { listing: 'object' }
        },
        pause: {
          description: 'Pausa um anúncio.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { success: 'boolean' }
        },
        activate: {
          description: 'Reativa um anúncio pausado.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { success: 'boolean' }
        }
      }
    };
  }

  function listUnified(params) {
    var marketplace = params.marketplace || 'all';
    var out = [];

    // Dados de exemplo — valores reais virão via Claude Code + TIOPS MCP
    if (marketplace === 'all' || marketplace === 'mercado_livre') {
      var mockMlListings = {
        results: [
          { id: '201', title: 'Produto ML 1', price: 149.90, available_quantity: 15, status: 'active' },
          { id: '202', title: 'Produto ML 2', price: 79.50, available_quantity: 2, status: 'active' }
        ]
      };
      out = out.concat(normalizeMlListings_(mockMlListings));
    }

    if (marketplace === 'all' || marketplace === 'shopee') {
      var mockShopeeListings = {
        item: [
          { item_id: '301', item_name: 'Produto Shopee 1', price_info: { current_price: 129.90 }, stock_info_v2: { summary_info: { total_available_stock: 20 } }, item_status: 'NORMAL' },
          { item_id: '302', item_name: 'Produto Shopee 2', price_info: { current_price: 59.90 }, stock_info_v2: { summary_info: { total_available_stock: 1 } }, item_status: 'NORMAL' }
        ]
      };
      out = out.concat(normalizeShopeeListings_(mockShopeeListings));
    }

    return { listings: out };
  }

  function getDetail(params) {
    // Dados de exemplo — valores reais virão via Claude Code + TIOPS MCP
    if (params.marketplace === 'shopee') {
      var mockShopeeItem = {
        item_id: params.itemId,
        item_name: 'Produto Shopee Exemplo',
        price_info: { current_price: 129.90 },
        stock_info_v2: { summary_info: { total_available_stock: 20 } },
        item_status: 'NORMAL'
      };
      return { listing: mockShopeeItem };
    }

    var mockMlItem = {
      id: params.itemId,
      title: 'Produto ML Exemplo',
      price: 149.90,
      available_quantity: 15,
      status: 'active'
    };
    return { listing: mockMlItem };
  }

  // Regra de ouro dos playbooks: NUNCA confiar na resposta do pause/activate/
  // update para confirmar estado — sempre reler com getDetail depois.
  function pause(params) {
    return setActiveState_(params, false);
  }

  function activate(params) {
    return setActiveState_(params, true);
  }

  function setActiveState_(params, shouldActivate) {
    // Operação simulada — valores reais via Claude Code + TIOPS MCP
    // Shopee: usa shopee_update_item/shopee_unlist_item (ambos via update via update_item)
    // Mercado Livre: usa pause_item/activate_item com itemId camelCase
    // Sempre relê com getDetail para confirmar o estado real.

    var confirmed = getDetail(params).listing;
    return { success: true, listing: confirmed };
  }

  function normalizeMlListings_(raw) {
    var results = (raw && raw.results) || (Array.isArray(raw) ? raw : []) || [];
    return results.map(function (item) {
      return {
        id: String(item.id),
        marketplace: 'mercado_livre',
        title: item.title || item.family_name,
        price: item.price,
        stock: item.available_quantity,
        status: item.status
      };
    });
  }

  function normalizeShopeeListings_(raw) {
    var results = (raw && raw.item) || (Array.isArray(raw) ? raw : []) || [];
    return results.map(function (item) {
      return {
        id: String(item.item_id),
        marketplace: 'shopee',
        title: item.item_name,
        price: item.price_info && item.price_info.current_price,
        stock: item.stock_info_v2 && item.stock_info_v2.summary_info && item.stock_info_v2.summary_info.total_available_stock,
        status: item.item_status
      };
    });
  }

  return {
    describe: describe,
    listUnified: listUnified,
    getDetail: getDetail,
    pause: pause,
    activate: activate
  };
})();
