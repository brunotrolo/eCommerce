/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Busca pedidos nos status operacionais (UNPAID, READY_TO_SHIP, SHIPPED) e
 * também em COMPLETED/CANCELLED para manter histórico atualizado.
 * Faz upsert: insere novos e atualiza status dos existentes.
 * Regras completas em specs/orders-import.md.
 *
 * Logging: toda etapa é auditada via LoggingService (sync) — cada chamada
 * Tiops, cada detail fetch, cada upsert, cada erro. Aba LOGS no Sheets.
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
    var result = callTiops_('shopee_list_orders', {
      limit: 100,
      order_status: orderStatus
    });

    if (!result) {
      LoggingService.log({
        service: 'OrdersImport',
        action: 'listOrderSns',
        status: 'ERROR',
        caller: 'OrdersImportService',
        summary: 'shopee_list_orders[' + orderStatus + '] retornou null/undefined',
        durationMs: Date.now() - startTime,
        errorMessage: 'empty result',
        context: { orderStatus: orderStatus }
      });
      return [];
    }

    var response = result.response || result;
    var orderList = response.order_list || response.orders || [];

    var sns = [];
    for (var i = 0; i < orderList.length; i++) {
      var sn = orderList[i].order_sn || orderList[i].order_id || '';
      if (sn) sns.push(sn);
    }

    LoggingService.log({
      service: 'OrdersImport',
      action: 'listOrderSns',
      status: 'OK',
      caller: 'OrdersImportService',
      summary: 'shopee_list_orders[' + orderStatus + '] => ' + sns.length + ' pedidos',
      durationMs: Date.now() - startTime,
      context: {
        orderStatus: orderStatus,
        orderCount: sns.length,
        orderSns: sns.slice(0, 20),
        rawResponseKeys: Object.keys(response)
      }
    });

    return sns;
  }

  function getOrderDetail_(orderSn) {
    var startTime = Date.now();
    var result = callTiops_('shopee_get_order_detail', {
      order_sn: orderSn
    });

    if (!result) {
      LoggingService.log({
        service: 'OrdersImport',
        action: 'getOrderDetail',
        status: 'ERROR',
        caller: 'OrdersImportService',
        summary: 'shopee_get_order_detail[' + orderSn + '] retornou null',
        durationMs: Date.now() - startTime,
        errorMessage: 'empty result',
        context: { orderSn: orderSn }
      });
      return null;
    }

    var response = result.response || result;
    var orderList = response.order_list || [];
    var detail = orderList.length > 0 ? orderList[0] : null;

    LoggingService.log({
      service: 'OrdersImport',
      action: 'getOrderDetail',
      status: detail ? 'OK' : 'ERROR',
      caller: 'OrdersImportService',
      summary: 'shopee_get_order_detail[' + orderSn + '] => ' + (detail ? 'OK (status=' + (detail.order_status || '?') + ')' : 'not found'),
      durationMs: Date.now() - startTime,
      errorMessage: detail ? '' : 'order_sn ' + orderSn + ' not in response',
      context: {
        orderSn: orderSn,
        found: !!detail,
        orderStatus: detail ? detail.order_status : '',
        totalAmount: detail ? detail.total_amount : '',
        buyerUsername: detail ? detail.buyer_username : '',
        itemCount: detail && detail.item_list ? detail.item_list.length : 0,
        rawResponseKeys: Object.keys(response)
      }
    });

    return detail;
  }

  function normalizeOrder_(detail) {
    if (!detail) return null;

    var items = detail.item_list || [];
    var itemNames = [];
    var totalWeightGram = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].item_name) itemNames.push(items[i].item_name);
      totalWeightGram += (items[i].weight || 0) * 1000;
    }

    var addr = detail.recipient_address || {};

    return {
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
  }

  function importShopeeOrders(params) {
    var importStart = Date.now();
    params = params || {};
    var mode = params.mode || 'all';
    var statuses = mode === 'operational' ? OPERATIONAL_STATUSES : ALL_STATUSES;

    LoggingService.log({
      service: 'OrdersImport',
      action: 'importShopeeOrders',
      status: 'OK',
      caller: 'UI',
      summary: 'Iniciando importação mode=' + mode + ', statuses=' + statuses.join(','),
      durationMs: 0,
      context: { mode: mode, statuses: statuses }
    });

    var allOrderSns = {};
    var statusMap = {};
    var errors = [];
    var statusCounts = {};

    for (var s = 0; s < statuses.length; s++) {
      var st = statuses[s];
      try {
        var sns = listOrderSnsByStatus_(st);
        statusCounts[st] = sns.length;
        for (var i = 0; i < sns.length; i++) {
          if (!allOrderSns[sns[i]]) {
            allOrderSns[sns[i]] = true;
            statusMap[sns[i]] = st;
          }
        }
      } catch (e) {
        errors.push({ status: st, reason: e.message });
        statusCounts[st] = -1;
        LoggingService.log({
          service: 'OrdersImport',
          action: 'listByStatus',
          status: 'ERROR',
          caller: 'OrdersImportService',
          summary: 'Erro ao listar status ' + st + ': ' + e.message,
          durationMs: Date.now() - importStart,
          errorMessage: e.message,
          context: { status: st }
        });
      }
    }

    var uniqueSns = Object.keys(allOrderSns);

    LoggingService.log({
      service: 'OrdersImport',
      action: 'listAllStatuses',
      status: 'OK',
      caller: 'OrdersImportService',
      summary: 'Listagem concluída: ' + uniqueSns.length + ' pedidos únicos de ' + statuses.length + ' status',
      durationMs: Date.now() - importStart,
      context: {
        statusCounts: statusCounts,
        uniqueOrderCount: uniqueSns.length,
        errors: errors.length
      }
    });

    if (uniqueSns.length === 0) {
      var totalMs = Date.now() - importStart;
      LoggingService.log({
        service: 'OrdersImport',
        action: 'importShopeeOrders',
        status: errors.length > 0 ? 'ERROR' : 'OK',
        caller: 'UI',
        summary: 'Importação concluída (vazio): 0 pedidos (' + totalMs + 'ms)',
        durationMs: totalMs,
        errorMessage: errors.length > 0 ? errors.length + ' erros na listagem' : '',
        context: { errors: errors }
      });
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
    var existingCount = Object.keys(existingMap).length;

    LoggingService.log({
      service: 'OrdersImport',
      action: 'loadExisting',
      status: 'OK',
      caller: 'OrdersImportService',
      summary: 'Planilha carregada: ' + existingCount + ' pedidos existentes',
      durationMs: Date.now() - importStart,
      context: { existingOrderCount: existingCount }
    });

    var toUpsert = [];
    var detailErrors = 0;
    var detailSuccess = 0;

    for (var j = 0; j < uniqueSns.length; j++) {
      var sn = uniqueSns[j];
      try {
        var detail = getOrderDetail_(sn);
        var normalized = normalizeOrder_(detail);
        if (normalized) {
          toUpsert.push(normalized);
          detailSuccess++;
        } else {
          detailErrors++;
          errors.push({ order_sn: sn, reason: 'detail normalization returned null' });
        }
      } catch (e) {
        detailErrors++;
        errors.push({ order_sn: sn, reason: e.message });
        LoggingService.log({
          service: 'OrdersImport',
          action: 'getOrderDetail',
          status: 'ERROR',
          caller: 'OrdersImportService',
          summary: 'Erro ao buscar detail ' + sn + ': ' + e.message,
          durationMs: Date.now() - importStart,
          errorMessage: e.message,
          context: { orderSn: sn, progress: (j + 1) + '/' + uniqueSns.length }
        });
      }
    }

    LoggingService.log({
      service: 'OrdersImport',
      action: 'fetchDetails',
      status: 'OK',
      caller: 'OrdersImportService',
      summary: 'Details buscados: ' + detailSuccess + ' OK, ' + detailErrors + ' erros',
      durationMs: Date.now() - importStart,
      context: {
        totalSns: uniqueSns.length,
        detailSuccess: detailSuccess,
        detailErrors: detailErrors
      }
    });

    var upsertResult = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      var upsertStart = Date.now();
      upsertResult = OrdersRepository.upsertOrders(toUpsert);

      LoggingService.log({
        service: 'OrdersImport',
        action: 'upsertOrders',
        status: 'OK',
        caller: 'OrdersImportService',
        summary: 'Upsert concluído: ' + upsertResult.inserted + ' novos, ' + upsertResult.updated + ' atualizados',
        durationMs: Date.now() - upsertStart,
        context: {
          inputCount: toUpsert.length,
          inserted: upsertResult.inserted,
          updated: upsertResult.updated,
          skipped: toUpsert.length - upsertResult.inserted - upsertResult.updated
        }
      });
    }

    var imported = upsertResult.inserted || 0;
    var updated = upsertResult.updated || 0;
    var totalErrors = errors.length;
    var totalMs = Date.now() - importStart;

    var message = imported + ' novos, ' + updated + ' atualizados';
    if (totalErrors > 0) {
      message += ' (' + totalErrors + ' erro' + (totalErrors !== 1 ? 's' : '') + ')';
    }

    LoggingService.log({
      service: 'OrdersImport',
      action: 'importShopeeOrders',
      status: totalErrors > 0 && imported === 0 && updated === 0 ? 'ERROR' : 'OK',
      caller: 'UI',
      summary: 'Importação concluída: ' + message + ' (' + totalMs + 'ms)',
      durationMs: totalMs,
      errorMessage: totalErrors > 0 ? totalErrors + ' erros' : '',
      context: {
        mode: mode,
        imported: imported,
        updated: updated,
        totalErrors: totalErrors,
        errors: errors.slice(0, 10)
      }
    });

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
