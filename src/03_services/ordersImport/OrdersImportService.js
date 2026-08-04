/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Busca pedidos nos status operacionais (UNPAID, READY_TO_SHIP, SHIPPED) e
 * também em COMPLETED/CANCELLED para manter histórico atualizado.
 * Faz upsert: insere novos e atualiza status dos existentes.
 * Regras completas em specs/orders-import.md.
 */
var OrdersImportService = (function () {
  var OPERATIONAL_STATUSES = ['UNPAID', 'READY_TO_SHIP', 'SHIPPED'];
  var ALL_STATUSES = ['UNPAID', 'READY_TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'IN_CANCEL'];

  function describe() {
    return {
      name: 'ordersImport',
      actions: {
        importShopeeOrders: {
          description: 'Busca pedidos Shopee via Tiops (todos os status), insere novos e atualiza status dos existentes.',
          params: {
            mode: { type: 'string', required: false, default: 'all', enum: ['operational', 'all'], description: 'operational=UNPAID/READY_TO_SHIP/SHIPPED, all=todos' }
          },
          returns: {
            success: 'boolean',
            imported: 'number',
            updated: 'number',
            errors: 'array',
            message: 'string'
          }
        }
      }
    };
  }

  function callTiops_(action, params) {
    try {
      return TiopsClient.call(action, params);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('TIOPS_API_KEY_MISSING') !== -1) {
        throw new Error('TIOPS_API_KEY_MISSING');
      }
      throw new Error('Tiops indisponível: ' + msg);
    }
  }

  function listOrderSnsByStatus_(orderStatus) {
    var result = callTiops_('shopee_list_orders', {
      limit: 100,
      order_status: orderStatus
    });

    if (!result) return [];

    var response = result.response || result;
    var orderList = response.order_list || response.orders || [];

    var sns = [];
    for (var i = 0; i < orderList.length; i++) {
      var sn = orderList[i].order_sn || orderList[i].order_id || '';
      if (sn) sns.push(sn);
    }
    return sns;
  }

  function getOrderDetail_(orderSn) {
    var result = callTiops_('shopee_get_order_detail', {
      order_sn: orderSn
    });

    if (!result) return null;

    var response = result.response || result;
    var orderList = response.order_list || [];
    return orderList.length > 0 ? orderList[0] : null;
  }

  function normalizeOrder_(detail) {
    if (!detail) return null;

    var orderId = detail.order_sn || '';
    var status = detail.order_status || '';
    var total = Number(detail.total_amount) || 0;
    var buyer = detail.buyer_username || '';
    var createdAt = detail.create_time || 0;
    if (typeof createdAt === 'number' && createdAt > 1000000000) {
      createdAt = new Date(createdAt * 1000).toISOString();
    }

    var items = detail.item_list || [];
    var itemNames = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].item_name) itemNames.push(items[i].item_name);
    }

    var paymentMethod = detail.payment_method || '';
    var shippingFee = Number(detail.actual_shipping_fee) || 0;

    return {
      order_id: orderId,
      status: status,
      total_amount: total,
      buyer_username: buyer,
      create_time: createdAt,
      payment_method: paymentMethod,
      shipping_fee: shippingFee,
      item_names: itemNames.join(', '),
      marketplace: 'shopee'
    };
  }

  function importShopeeOrders(params) {
    params = params || {};
    var mode = params.mode || 'all';
    var statuses = mode === 'operational' ? OPERATIONAL_STATUSES : ALL_STATUSES;

    var allOrderSns = {};
    var statusMap = {};
    var errors = [];

    for (var s = 0; s < statuses.length; s++) {
      var st = statuses[s];
      try {
        var sns = listOrderSnsByStatus_(st);
        for (var i = 0; i < sns.length; i++) {
          if (!allOrderSns[sns[i]]) {
            allOrderSns[sns[i]] = true;
            statusMap[sns[i]] = st;
          }
        }
      } catch (e) {
        errors.push({ status: st, reason: e.message });
      }
    }

    var uniqueSns = Object.keys(allOrderSns);
    if (uniqueSns.length === 0) {
      return {
        success: errors.length === 0,
        imported: 0,
        updated: 0,
        errors: errors,
        message: errors.length > 0
          ? 'Erros ao buscar status: ' + errors.length
          : 'Nenhum pedido encontrado.'
      };
    }

    var existingMap = OrdersRepository.getAllOrdersMap();

    var toUpsert = [];
    var detailErrors = 0;

    for (var j = 0; j < uniqueSns.length; j++) {
      var sn = uniqueSns[j];
      try {
        var detail = getOrderDetail_(sn);
        var normalized = normalizeOrder_(detail);
        if (normalized) {
          toUpsert.push(normalized);
        }
      } catch (e) {
        detailErrors++;
        errors.push({ order_sn: sn, reason: e.message });
      }
    }

    var result = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      result = OrdersRepository.upsertOrders(toUpsert);
    }

    var imported = result.inserted || 0;
    var updated = result.updated || 0;
    var totalErrors = errors.length;

    var message = imported + ' novos, ' + updated + ' atualizados';
    if (totalErrors > 0) {
      message += ' (' + totalErrors + ' erro' + (totalErrors !== 1 ? 's' : '') + ')';
    }

    return {
      success: totalErrors === 0 || imported > 0 || updated > 0,
      imported: imported,
      updated: updated,
      errors: errors,
      message: message
    };
  }

  return {
    describe: describe,
    importShopeeOrders: importShopeeOrders
  };
})();
