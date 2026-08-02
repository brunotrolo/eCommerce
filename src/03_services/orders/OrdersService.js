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

    // Dados de exemplo — valores reais virão via Claude Code + TIOPS MCP
    if (marketplace === 'all' || marketplace === 'mercado_livre') {
      var mockMlOrders = {
        results: [
          { id: '1001', status: 'pago', total_amount: 150.00, buyer: { nickname: 'comprador_ml_1' }, date_created: '2025-08-01T10:30:00Z' },
          { id: '1002', status: 'pago', total_amount: 89.90, buyer: { nickname: 'comprador_ml_2' }, date_created: '2025-08-01T09:15:00Z' }
        ]
      };
      out = out.concat(normalizeMlOrders_(mockMlOrders));
    }

    if (marketplace === 'all' || marketplace === 'shopee') {
      var mockShopeeOrders = {
        order_list: [
          { order_sn: 'SP001', order_status: 'COMPLETED', total_amount: 120.00, buyer_username: 'comprador_shopee_1', create_time: 1722518400 },
          { order_sn: 'SP002', order_status: 'COMPLETED', total_amount: 75.50, buyer_username: 'comprador_shopee_2', create_time: 1722515000 }
        ]
      };
      out = out.concat(normalizeShopeeOrders_(mockShopeeOrders));
    }

    return { orders: out };
  }

  function getDetail(params) {
    // Dados de exemplo — valores reais virão via Claude Code + TIOPS MCP
    if (params.marketplace === 'shopee') {
      var mockShopeeOrder = {
        order_sn: params.orderId,
        order_status: 'COMPLETED',
        total_amount: 120.00,
        buyer_username: 'comprador_shopee',
        create_time: 1722518400,
        items: [
          { item_id: '12345', item_name: 'Produto Teste', quantity: 1, price: 120.00 }
        ]
      };
      return { order: mockShopeeOrder };
    }

    var mockMlOrder = {
      id: params.orderId,
      status: 'pago',
      total_amount: 150.00,
      buyer: { nickname: 'comprador_ml' },
      date_created: '2025-08-01T10:30:00Z',
      order_items: [
        { id: '67890', item: { id: 'SKU001', title: 'Produto Teste' }, quantity: 1, unit_price: 150.00 }
      ]
    };
    return { order: mockMlOrder };
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
