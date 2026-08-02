/**
 * OrdersService — pedidos normalizados de Mercado Livre e Shopee num shape
 * comum. Regras completas em specs/orders.md.
 */
var OrdersService = (function () {
  function describe() {
    return {
      name: 'orders',
      actions: {
        listUnified: {
          description: 'Lista pedidos de ML e/ou Shopee normalizados num formato comum.',
          params: {
            marketplace: { type: 'string', required: false, default: 'all', enum: ['all', 'shopee', 'mercado_livre'] },
            limit: { type: 'number', required: false, default: 20 }
          },
          returns: { orders: 'array' }
        },
        getDetail: {
          description: 'Detalhe de um pedido específico, incluindo status de envio.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            orderId: { type: 'string', required: true }
          },
          returns: { order: 'object' }
        }
      }
    };
  }

  function listUnified(params) {
    var marketplace = params.marketplace || 'all';
    var limit = params.limit || 20;
    var out = [];

    if (marketplace === 'all' || marketplace === 'mercado_livre') {
      var ml = TiopsClient.call('list_orders', {
        meliUserId: ConfigService.getAccountId('mercado_livre'),
        limit: limit
      });
      out = out.concat(normalizeMlOrders_(ml));
    }

    if (marketplace === 'all' || marketplace === 'shopee') {
      var sp = TiopsClient.call('shopee_list_orders', {
        shopId: ConfigService.getAccountId('shopee')
      });
      out = out.concat(normalizeShopeeOrders_(sp));
    }

    return { orders: out };
  }

  function getDetail(params) {
    if (params.marketplace === 'shopee') {
      var shopeeOrder = TiopsClient.call('shopee_get_order', {
        shopId: ConfigService.getAccountId('shopee'),
        order_sn: params.orderId
      });
      return { order: shopeeOrder };
    }

    var mlOrder = TiopsClient.call('get_order', {
      meliUserId: ConfigService.getAccountId('mercado_livre'),
      order_id: params.orderId
    });
    return { order: mlOrder };
  }

  function normalizeMlOrders_(raw) {
    var results = (raw && raw.results) || (Array.isArray(raw) ? raw : []) || [];
    return results.map(function (o) {
      return {
        id: String(o.id),
        marketplace: 'mercado_livre',
        status: o.status,
        total: o.total_amount,
        buyerName: o.buyer && (o.buyer.nickname || o.buyer.first_name),
        createdAt: o.date_created
      };
    });
  }

  function normalizeShopeeOrders_(raw) {
    var results = (raw && raw.order_list) || (Array.isArray(raw) ? raw : []) || [];
    return results.map(function (o) {
      return {
        id: String(o.order_sn),
        marketplace: 'shopee',
        status: o.order_status,
        total: o.total_amount,
        buyerName: o.buyer_username,
        createdAt: o.create_time
      };
    });
  }

  return { describe: describe, listUnified: listUnified, getDetail: getDetail };
})();
