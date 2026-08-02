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

    if (marketplace === 'all' || marketplace === 'mercado_livre') {
      var ml = TiopsClient.call('list_items', { meliUserId: ConfigService.getAccountId('mercado_livre') });
      out = out.concat(normalizeMlListings_(ml));
    }

    if (marketplace === 'all' || marketplace === 'shopee') {
      var sp = TiopsClient.call('shopee_list_items', { shopId: ConfigService.getAccountId('shopee') });
      out = out.concat(normalizeShopeeListings_(sp));
    }

    return { listings: out };
  }

  function getDetail(params) {
    if (params.marketplace === 'shopee') {
      var shopeeItem = TiopsClient.call('shopee_get_item', {
        shopId: ConfigService.getAccountId('shopee'),
        item_id: params.itemId
      });
      return { listing: shopeeItem };
    }

    var mlItem = TiopsClient.call('get_item', { item_id: params.itemId });
    return { listing: mlItem };
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
    if (params.marketplace === 'shopee') {
      // Shopee não tem pause/activate dedicados documentados no playbook atual;
      // ambos os canais expõem via update_item/unlist_item equivalentes.
      TiopsClient.call(shouldActivate ? 'shopee_update_item' : 'shopee_unlist_item', {
        shopId: ConfigService.getAccountId('shopee'),
        item_id: params.itemId,
        unlist: !shouldActivate
      });
    } else {
      // Mercado Livre: pause_item/activate_item usam itemId (camelCase),
      // inconsistente com create_item (snake_case) — ver docs/referencia/MERCADO_LIVRE_CRIAR_ANUNCIO.md.
      TiopsClient.call(shouldActivate ? 'activate_item' : 'pause_item', {
        meliUserId: ConfigService.getAccountId('mercado_livre'),
        itemId: params.itemId
      });
    }

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
