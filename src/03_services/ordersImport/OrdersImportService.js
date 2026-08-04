/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Busca pedidos nos status operacionais (UNPAID, READY_TO_SHIP, SHIPPED) e
 * também em COMPLETED/CANCELLED para manter histórico atualizado.
 * Fonte adicional: shopee_sales_summary pega pedidos COMPLETED extras.
 * Escrow via batch (1 chamada para N pedidos) — economiza ações.
 * Faz upsert: insere novos e atualiza status dos existentes.
 * Regras completas em specs/orders-import.md.
 *
 * Logging: toda etapa é auditada via LoggingService (sync).
 */
var OrdersImportService = (function () {
  var OPERATIONAL_STATUSES = ['UNPAID', 'READY_TO_SHIP', 'SHIPPED'];
  var ALL_STATUSES = ['UNPAID', 'READY_TO_SHIP', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'IN_CANCEL'];
  var ESCROW_BATCH_SIZE = 20;

  function describe() {
    return {
      name: 'ordersImport',
      actions: {
        importShopeeOrders: {
          description: 'Busca pedidos Shopee via Tiops (todos os status + sales_summary), insere novos e atualiza existentes.',
          params: {
            mode: { type: 'string', required: false, default: 'all', enum: ['operational', 'all'] }
          },
          returns: { success: 'boolean', imported: 'number', updated: 'number', errors: 'array', message: 'string' }
        }
      }
    };
  }

  function callTiops_(action, params) {
    try {
      return TiopsClient.call(action, params);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('TIOPS_API_KEY_MISSING') !== -1) throw new Error('TIOPS_API_KEY_MISSING');
      throw new Error('Tiops indisponível: ' + msg);
    }
  }

  function formatDateTime_(ts) {
    if (!ts) return '';
    var d;
    if (typeof ts === 'number' && ts > 1000000000) {
      d = new Date(ts * 1000);
    } else if (typeof ts === 'string') {
      d = new Date(ts);
    } else {
      return String(ts);
    }
    if (isNaN(d.getTime())) return String(ts);
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var yyyy = d.getFullYear();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
  }

  function formatItemsDetail_(items) {
    if (!items || items.length === 0) return '';
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var sku = it.item_sku || '';
      var name = it.item_name || '';
      var qty = it.model_quantity_purchased || 1;
      var price = it.model_discounted_price || 0;
      parts.push(name + ' (SKU:' + sku + ' x' + qty + ' R$' + price + ')');
    }
    return parts.join(' | ');
  }

  function listOrderSnsByStatus_(orderStatus) {
    var startTime = Date.now();
    var result = callTiops_('shopee_list_orders', { limit: 100, order_status: orderStatus });
    if (!result) return [];

    var response = result.response || result;
    var orderList = response.order_list || response.orders || [];
    var sns = [];
    for (var i = 0; i < orderList.length; i++) {
      var sn = orderList[i].order_sn || orderList[i].order_id || '';
      if (sn) sns.push(sn);
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'listOrderSns', status: 'OK',
      caller: 'OrdersImportService',
      summary: 'shopee_list_orders[' + orderStatus + '] => ' + sns.length + ' pedidos',
      durationMs: Date.now() - startTime,
      context: { orderStatus: orderStatus, orderCount: sns.length }
    });
    return sns;
  }

  function getCompletedOrdersFromSalesSummary_() {
    var startTime = Date.now();
    try {
      var result = callTiops_('shopee_sales_summary', {});
      if (!result) return [];

      var response = result.response || result;
      var orders = response.orders || [];

      var sns = [];
      for (var i = 0; i < orders.length; i++) {
        if (orders[i].order_sn) sns.push(orders[i].order_sn);
      }

      LoggingService.log({
        service: 'OrdersImport', action: 'salesSummary', status: 'OK',
        caller: 'OrdersImportService',
        summary: 'shopee_sales_summary => ' + sns.length + ' pedidos COMPLETED (receita: R$ ' + (response.total_revenue || 0) + ')',
        durationMs: Date.now() - startTime,
        context: {
          orderCount: sns.length,
          totalRevenue: response.total_revenue || 0,
          totalOrders: response.total_orders || 0,
          avgOrderValue: response.avg_order_value || 0
        }
      });
      return sns;
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'salesSummary', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'sales_summary indisponível: ' + e.message,
        durationMs: Date.now() - startTime, errorMessage: e.message
      });
      return [];
    }
  }

  function getOrderDetail_(orderSn) {
    var startTime = Date.now();
    var result = callTiops_('shopee_get_order_detail', { order_sn: orderSn });
    if (!result) return null;

    var response = result.response || result;
    var orderList = response.order_list || [];
    var detail = orderList.length > 0 ? orderList[0] : null;

    LoggingService.log({
      service: 'OrdersImport', action: 'getOrderDetail', status: detail ? 'OK' : 'ERROR',
      caller: 'OrdersImportService',
      summary: 'shopee_get_order_detail[' + orderSn + '] => ' + (detail ? 'OK' : 'not found'),
      durationMs: Date.now() - startTime,
      context: { orderSn: orderSn, found: !!detail, orderStatus: detail ? detail.order_status : '' }
    });
    return detail;
  }

  function getEscrowDetailBatch_(orderSns) {
    if (!orderSns || orderSns.length === 0) return {};
    var startTime = Date.now();
    var result = callTiops_('shopee_get_escrow_detail_batch', { order_sn_list: orderSns });
    if (!result) return {};

    var response = result.response || [];
    var escrowMap = {};
    var found = 0;
    var notFound = 0;

    for (var i = 0; i < response.length; i++) {
      var item = response[i];
      var escrow = item.escrow_detail || {};
      var sn = escrow.order_sn || '';
      if (sn && escrow.order_income) {
        escrowMap[sn] = escrow.order_income;
        found++;
      } else if (sn) {
        notFound++;
      }
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'getEscrowBatch', status: 'OK',
      caller: 'OrdersImportService',
      summary: 'shopee_get_escrow_detail_batch[' + orderSns.length + '] => ' + found + ' com dados, ' + notFound + ' sem',
      durationMs: Date.now() - startTime,
      context: {
        requested: orderSns.length,
        found: found,
        notFound: notFound,
        actionsUsed: 1
      }
    });
    return escrowMap;
  }

  function normalizeOrder_(detail, escrow) {
    if (!detail) return null;

    var items = detail.item_list || [];
    var itemNames = [];
    var totalWeightGram = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].item_name) itemNames.push(items[i].item_name);
      totalWeightGram += (items[i].weight || 0) * 1000;
    }

    var addr = detail.recipient_address || {};

    var order = {
      ORDER_ID: detail.order_sn || '',
      STATUS: detail.order_status || '',
      TOTAL_AMOUNT: Number(detail.total_amount) || 0,
      PAYMENT_METHOD: detail.payment_method || '',
      ACTUAL_SHIPPING_FEE: Number(detail.actual_shipping_fee) || 0,
      ESTIMATED_SHIPPING_FEE: Number(detail.estimated_shipping_fee) || 0,
      CURRENCY: detail.currency || 'BRL',
      DAYS_TO_SHIP: detail.days_to_ship || 0,
      PAY_TIME: formatDateTime_(detail.pay_time),
      PICKUP_TIME: formatDateTime_(detail.pickup_done_time),
      UPDATE_TIME: formatDateTime_(detail.update_time),
      BUYER_USERNAME: detail.buyer_username || '',
      RECIPIENT_NAME: addr.name || '',
      RECIPIENT_CITY: addr.city || '',
      RECIPIENT_STATE: addr.state || '',
      RECIPIENT_ZIPCODE: addr.zipcode || '',
      RECIPIENT_FULL_ADDRESS: addr.full_address || '',
      ITEMS_DETAIL: formatItemsDetail_(items),
      ITEM_COUNT: items.length,
      TOTAL_WEIGHT_GRAM: Math.round(totalWeightGram),
      MESSAGE_TO_SELLER: detail.message_to_seller || '',
      CREATE_TIME: formatDateTime_(detail.create_time),
      MARKETPLACE: 'shopee'
    };

    if (escrow) {
      order.ESCROW_AMOUNT = Number(escrow.escrow_amount) || 0;
      order.COMMISSION_FEE = Number(escrow.commission_fee) || 0;
      order.NET_COMMISSION_FEE = Number(escrow.net_commission_fee) || 0;
      order.SERVICE_FEE = Number(escrow.service_fee) || 0;
      order.NET_SERVICE_FEE = Number(escrow.net_service_fee) || 0;
      order.PIX_DISCOUNT = Number(escrow.pix_discount) || 0;
      order.SELLER_REBATE = Number(escrow.seller_product_rebate && escrow.seller_product_rebate.amount) || 0;
      order.SELLER_REBATE_COMMISSION_OFFSET = Number(escrow.seller_product_rebate && escrow.seller_product_rebate.commission_fee_offset) || 0;
      order.SELLER_REBATE_SERVICE_OFFSET = Number(escrow.seller_product_rebate && escrow.seller_product_rebate.service_fee_offset) || 0;
    }

    return order;
  }

  function importShopeeOrders(params) {
    var importStart = Date.now();
    params = params || {};
    var mode = params.mode || 'all';
    var statuses = mode === 'operational' ? OPERATIONAL_STATUSES : ALL_STATUSES;

    LoggingService.log({
      service: 'OrdersImport', action: 'importShopeeOrders', status: 'OK',
      caller: 'UI', summary: 'Iniciando importação mode=' + mode,
      durationMs: 0, context: { mode: mode, statuses: statuses }
    });

    var allOrderSns = {};
    var errors = [];
    var statusCounts = {};

    for (var s = 0; s < statuses.length; s++) {
      var st = statuses[s];
      try {
        var sns = listOrderSnsByStatus_(st);
        statusCounts[st] = sns.length;
        for (var i = 0; i < sns.length; i++) {
          if (!allOrderSns[sns[i]]) allOrderSns[sns[i]] = st;
        }
      } catch (e) {
        errors.push({ status: st, reason: e.message });
        statusCounts[st] = -1;
      }
    }

    var beforeSales = Object.keys(allOrderSns).length;

    if (mode === 'all') {
      try {
        var salesSns = getCompletedOrdersFromSalesSummary_();
        for (var j = 0; j < salesSns.length; j++) {
          if (!allOrderSns[salesSns[j]]) {
            allOrderSns[salesSns[j]] = 'COMPLETED';
          }
        }
      } catch (e) {
        errors.push({ status: 'SALES_SUMMARY', reason: e.message });
      }
    }

    var uniqueSns = Object.keys(allOrderSns);
    var fromSales = uniqueSns.length - beforeSales;

    LoggingService.log({
      service: 'OrdersImport', action: 'mergeSources', status: 'OK',
      caller: 'OrdersImportService',
      summary: uniqueSns.length + ' pedidos únicos (' + beforeSales + ' de list_orders + ' + fromSales + ' de sales_summary)',
      durationMs: Date.now() - importStart,
      context: { total: uniqueSns.length, fromList: beforeSales, fromSales: fromSales, statusCounts: statusCounts }
    });

    if (uniqueSns.length === 0) {
      var totalMs = Date.now() - importStart;
      LoggingService.log({
        service: 'OrdersImport', action: 'importShopeeOrders',
        status: errors.length > 0 ? 'ERROR' : 'OK',
        caller: 'UI', summary: 'Importação concluída (vazio): 0 pedidos (' + totalMs + 'ms)',
        durationMs: totalMs, context: { errors: errors }
      });
      return { success: errors.length === 0, imported: 0, updated: 0, errors: errors, message: 'Nenhum pedido encontrado.' };
    }

    var existingMap = OrdersRepository.getAllOrdersMap();
    var toFetchDetail = [];
    for (var k = 0; k < uniqueSns.length; k++) {
      if (!existingMap[uniqueSns[k]]) toFetchDetail.push(uniqueSns[k]);
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'planFetches', status: 'OK',
      caller: 'OrdersImportService',
      summary: uniqueSns.length + ' pedidos: ' + toFetchDetail.length + ' precisam detail, ' + (uniqueSns.length - toFetchDetail.length) + ' já existem',
      durationMs: Date.now() - importStart,
      context: { needDetail: toFetchDetail.length, alreadyExist: uniqueSns.length - toFetchDetail.length }
    });

    var details = {};
    var detailErrors = 0;
    for (var d = 0; d < toFetchDetail.length; d++) {
      var sn = toFetchDetail[d];
      try {
        var detail = getOrderDetail_(sn);
        if (detail) {
          details[sn] = detail;
        } else {
          detailErrors++;
          errors.push({ order_sn: sn, reason: 'detail not found' });
        }
      } catch (e) {
        detailErrors++;
        errors.push({ order_sn: sn, reason: e.message });
      }
    }

    var allDetailSns = Object.keys(details);
    var escrowMap = {};

    for (var b = 0; b < allDetailSns.length; b += ESCROW_BATCH_SIZE) {
      var batch = allDetailSns.slice(b, b + ESCROW_BATCH_SIZE);
      try {
        var batchResult = getEscrowDetailBatch_(batch);
        var batchKeys = Object.keys(batchResult);
        for (var e = 0; e < batchKeys.length; e++) {
          escrowMap[batchKeys[e]] = batchResult[batchKeys[e]];
        }
      } catch (escrowErr) {
        LoggingService.log({
          service: 'OrdersImport', action: 'escrowBatch', status: 'WARN',
          caller: 'OrdersImportService',
          summary: 'Escrow batch falhou: ' + escrowErr.message,
          durationMs: Date.now() - importStart, errorMessage: escrowErr.message
        });
      }
    }

    var toUpsert = [];
    for (var u = 0; u < allDetailSns.length; u++) {
      var orderSn = allDetailSns[u];
      var normalized = normalizeOrder_(details[orderSn], escrowMap[orderSn]);
      if (normalized) toUpsert.push(normalized);
    }

    var upsertResult = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      upsertResult = OrdersRepository.upsertOrders(toUpsert);
    }

    var imported = upsertResult.inserted || 0;
    var updated = upsertResult.updated || 0;
    var totalMs = Date.now() - importStart;
    var totalErrors = errors.length;

    var message = imported + ' novos, ' + updated + ' atualizados';
    if (totalErrors > 0) message += ' (' + totalErrors + ' erro' + (totalErrors !== 1 ? 's' : '') + ')';

    LoggingService.log({
      service: 'OrdersImport', action: 'importShopeeOrders',
      status: totalErrors > 0 && imported === 0 && updated === 0 ? 'ERROR' : 'OK',
      caller: 'UI', summary: 'Importação concluída: ' + message + ' (' + totalMs + 'ms)',
      durationMs: totalMs, context: {
        mode: mode, imported: imported, updated: updated, totalErrors: totalErrors,
        escrowBatchCalls: Math.ceil(allDetailSns.length / ESCROW_BATCH_SIZE),
        errors: errors.slice(0, 10)
      }
    });

    return {
      success: totalErrors === 0 || imported > 0 || updated > 0,
      imported: imported, updated: updated, errors: errors, message: message
    };
  }

  return { describe: describe, importShopeeOrders: importShopeeOrders };
})();
