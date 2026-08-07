/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Busca pedidos nos status operacionais (UNPAID, READY_TO_SHIP, SHIPPED) e
 * também em COMPLETED/CANCELLED para manter histórico atualizado.
 * Escrow via batch (1 chamada para N pedidos) — economiza ações.
 * Faz upsert: insere novos e atualiza status dos existentes.
 * Regras completas em specs/orders-import.md.
 *
 * Logging: toda etapa é auditada via LoggingService (sync).
 */
var OrdersImportService = (function () {
  var OPERATIONAL_STATUSES = ['UNPAID', 'READY_TO_SHIP', 'SHIPPED'];
  var ALL_STATUSES = ['UNPAID', 'INVOICE_PENDING', 'PROCESSED', 'READY_TO_SHIP', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED', 'RETRY_SHIP', 'IN_CANCEL', 'CANCELLED', 'TO_RETURN'];
  var ESCROW_BATCH_SIZE = 20;

  function describe() {
    return {
      name: 'ordersImport',
      actions: {
        importShopeeOrders: {
          description: 'Busca pedidos Shopee via Tiops (todos os status), insere novos e atualiza existentes.',
          params: {
            mode: { type: 'string', required: false, default: 'all', enum: ['operational', 'all'] },
            forceOrderSns: { type: 'array', required: false, default: [], description: 'Order SNs específicos para buscar (ignora filtro de status/list)' }
          },
          returns: { success: 'boolean', imported: 'number', updated: 'number', errors: 'array', message: 'string' }
        },
        recalcAllCosts: {
          description: 'Recalcula TOTAL_COST de todas as linhas existentes no PEDIDOS a partir de ITEM_SKUS + costMap.',
          params: {}
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

  /**
   * Constrói mapa SKU => custo_unitário_líquido a partir de NFE_ENTRADA_PRODUTOS
   * e MANUAL_ENTRADA_PRODUTOS. Para SKUs com múltiplas entradas, usa o custo
   * da entrada mais recente (por DATA_ENTRADA ou DATA_EMISSAO).
   */
  function getCostMap_(sheetId) {
    var costMap = {};
    var dateMap = {};

    // 1. Ler NFE_ENTRADA_PRODUTOS
    try {
      var nfeRows = NFeEntradaProdutosRepository.getProdutos(sheetId);
      for (var i = 0; i < nfeRows.length; i++) {
        var row = nfeRows[i];
        var sku = String(row.SKU || row.CODIGO_PRODUTO || '').trim();
        var cost = Number(row.VALOR_UNITARIO_LIQUIDO) || 0;
        if (!sku || cost <= 0) continue;
        var dateStr = String(row.DATA_EMISSAO || row.DATA_ENTRADA || '');
        if (!dateStr || dateStr > (dateMap[sku] || '')) {
          costMap[sku] = cost;
          dateMap[sku] = dateStr;
        }
      }
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'getCostMap_NFE', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'Erro lendo NFE_ENTRADA_PRODUTOS: ' + e.message,
        durationMs: 0, context: { error: e.message }
      });
    }

    // 2. Ler MANUAL_ENTRADA_PRODUTOS (pode sobrescrever NFE se mais recente)
    try {
      var manualRows = ManualEntradaProdutosRepository.getRows(sheetId);
      for (var j = 0; j < manualRows.length; j++) {
        var mrow = manualRows[j];
        var msku = String(mrow.CODIGO_PRODUTO || mrow.SKU || '').trim();
        var mcost = Number(mrow.VALOR_UNITARIO_LIQUIDO) || 0;
        if (!msku || mcost <= 0) continue;
        var mdate = String(mrow.DATA_ENTRADA || mrow.DATA_COMPRA || '');
        if (!mdate || mdate > (dateMap[msku] || '')) {
          costMap[msku] = mcost;
          dateMap[msku] = mdate;
        }
      }
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'getCostMap_MANUAL', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'Erro lendo MANUAL_ENTRADA_PRODUTOS: ' + e.message,
        durationMs: 0, context: { error: e.message }
      });
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'getCostMap', status: 'OK',
      caller: 'OrdersImportService',
      summary: 'costMap total: ' + Object.keys(costMap).length + ' SKUs. Keys: ' + Object.keys(costMap).slice(0, 10).join(', '),
      durationMs: 0, context: { skuCount: Object.keys(costMap).length, sampleKeys: Object.keys(costMap).slice(0, 10) }
    });

    return costMap;
  }

  /**
   * Calcula o custo total de um pedido a partir de ITEM_SKUS ("SKU:qty; SKU:qty")
   * e do costMap {SKU: custo_unitario}.
   */
  function calculateTotalCost_(itemSkus, costMap) {
    if (!itemSkus || !costMap) return 0;
    var parts = itemSkus.split(';');
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var colonIdx = p.indexOf(':');
      if (colonIdx === -1) continue;
      var sku = p.substring(0, colonIdx).trim();
      var qty = parseInt(p.substring(colonIdx + 1), 10) || 1;
      var unitCost = costMap[sku] || 0;
      total += unitCost * qty;
    }
    return Math.round(total * 100) / 100;
  }

  function formatItemsDetail_(items, skuMap) {
    if (!items || items.length === 0) return '';
    skuMap = skuMap || {};
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var sku = '';
      if (it.item_id && skuMap[it.item_id]) {
        sku = skuMap[it.item_id];
      } else {
        sku = it.item_sku || '';
      }
      var name = it.item_name || '';
      var qty = it.model_quantity_purchased || 1;
      var price = it.model_discounted_price || 0;
      parts.push(name + ' (SKU:' + sku + ' x' + qty + ' R$' + price + ')');
    }
    return parts.join('; ');
  }

  function formatItemSkus_(items, skuMap) {
    if (!items || items.length === 0) return '';
    skuMap = skuMap || {};
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var sku = '';
      if (items[i].item_id && skuMap[items[i].item_id]) {
        sku = skuMap[items[i].item_id];
      } else {
        sku = items[i].item_sku || '';
      }
      var qty = items[i].model_quantity_purchased || 1;
      if (sku) parts.push(sku + ':' + qty);
    }
    return parts.join('; ');
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

  function normalizeOrder_(detail, escrow, skuMap, costMap) {
    if (!detail) return null;

    var items = detail.item_list || [];
    var itemNames = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].item_name) itemNames.push(items[i].item_name);
    }

    var order = {
      ORDER_ID: detail.order_sn || '',
      STATUS: detail.order_status || '',
      TOTAL_AMOUNT: Number(detail.total_amount) || 0,
      PAYMENT_METHOD: detail.payment_method || '',
      CURRENCY: detail.currency || 'BRL',
      DAYS_TO_SHIP: detail.days_to_ship || 0,
      PAY_TIME: formatDateTime_(detail.pay_time),
      PICKUP_TIME: formatDateTime_(detail.pickup_done_time),
      UPDATE_TIME: formatDateTime_(detail.update_time),
      BUYER_USERNAME: detail.buyer_username || '',
      ITEMS_DETAIL: formatItemsDetail_(items, skuMap),
      ITEM_SKUS: formatItemSkus_(items, skuMap),
      ITEM_COUNT: items.length,
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

    order.TOTAL_COST = calculateTotalCost_(order.ITEM_SKUS, costMap || {});

    if (order.TOTAL_COST > 0) {
      LoggingService.log({
        service: 'OrdersImport', action: 'costCalc', status: 'OK',
        caller: 'OrdersImportService',
        summary: order.ORDER_ID + ' => TOTAL_COST=' + order.TOTAL_COST + ' (ITEM_SKUS: ' + order.ITEM_SKUS + ')',
        durationMs: 0, context: { orderSn: order.ORDER_ID, totalCost: order.TOTAL_COST, itemSkus: order.ITEM_SKUS }
      });
    }

    return order;
  }

  function importShopeeOrders(params) {
    var importStart = Date.now();
    params = params || {};
    var mode = params.mode || 'all';
    var forceOrderSns = params.forceOrderSns || [];
    var statuses = mode === 'operational' ? OPERATIONAL_STATUSES : ALL_STATUSES;

    var skuMap = {};
    try {
      skuMap = AnunciosShopeeRepository.getItemSkuMap(ConfigService.getSheetId());
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'skuMapLoad', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'Fallback: skuMap vazio (' + e.message + ')',
        durationMs: 0, context: { error: e.message }
      });
    }

    var costMap = {};
    try {
      var sheetId = ConfigService.getSheetId();
      costMap = getCostMap_(sheetId);
      LoggingService.log({
        service: 'OrdersImport', action: 'costMapLoad', status: 'OK',
        caller: 'OrdersImportService',
        summary: 'costMap carregado: ' + Object.keys(costMap).length + ' SKUs com custo',
        durationMs: 0, context: { skuCount: Object.keys(costMap).length }
      });
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'costMapLoad', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'Fallback: costMap vazio (' + e.message + ')',
        durationMs: 0, context: { error: e.message }
      });
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'importShopeeOrders', status: 'OK',
      caller: 'UI', summary: 'Iniciando importação mode=' + mode + (forceOrderSns.length > 0 ? ' force=' + forceOrderSns.length : ''),
      durationMs: 0, context: { mode: mode, statuses: statuses, forceCount: forceOrderSns.length }
    });

    var allOrderSns = {};
    var errors = [];
    var statusCounts = {};

    for (var s = 0; s < forceOrderSns.length; s++) {
      allOrderSns[forceOrderSns[s]] = 'FORCE';
    }

    for (var s2 = 0; s2 < statuses.length; s2++) {
      var st = statuses[s2];
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

    var uniqueSns = Object.keys(allOrderSns);

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

    var toFetchDetail = uniqueSns.slice();

    LoggingService.log({
      service: 'OrdersImport', action: 'planFetches', status: 'OK',
      caller: 'OrdersImportService',
      summary: uniqueSns.length + ' pedidos: ' + toFetchDetail.length + ' para buscar detail (todos)',
      durationMs: Date.now() - importStart,
      context: { needDetail: toFetchDetail.length }
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
      var normalized = normalizeOrder_(details[orderSn], escrowMap[orderSn], skuMap, costMap);
      if (normalized) toUpsert.push(normalized);
    }

    if (toUpsert.length > 0) {
      var debugOrder = toUpsert[0];
      LoggingService.log({
        service: 'OrdersImport', action: 'debugFirstOrder', status: 'OK',
        caller: 'OrdersImportService',
        summary: 'First order: OID=' + debugOrder.ORDER_ID + ' SKUs=' + debugOrder.ITEM_SKUS + ' COST=' + debugOrder.TOTAL_COST,
        durationMs: 0, context: {
          ORDER_ID: debugOrder.ORDER_ID, ITEM_SKUS: debugOrder.ITEM_SKUS,
          TOTAL_COST: debugOrder.TOTAL_COST, ITEMS_DETAIL: (debugOrder.ITEMS_DETAIL || '').substring(0, 200),
          keys: Object.keys(debugOrder)
        }
      });
    }

    // Read existing statuses before upsert (for revert detection)
    var oldStatuses = {};
    try {
      var existingMap = OrdersRepository.getAllOrdersMap();
      var existingKeys = Object.keys(existingMap);
      for (var e = 0; e < existingKeys.length; e++) {
        oldStatuses[existingKeys[e]] = existingMap[existingKeys[e]].STATUS || '';
      }
    } catch (e) { /* fallback: no oldStatuses, baixa still works for new orders */ }

    var upsertResult = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      upsertResult = OrdersRepository.upsertOrders(toUpsert, true);
    }

    var imported = upsertResult.inserted || 0;
    var updated = upsertResult.updated || 0;

    // Process stock baixa for new orders and status changes
    var baixasRealizadas = 0, pendentesMapeamento = 0, faltantesEstoque = 0, revertsRealizadas = 0;
    for (var b = 0; b < toUpsert.length; b++) {
      var o = toUpsert[b];
      var isNew = !oldStatuses[o.ORDER_ID];
      var oldSt = oldStatuses[o.ORDER_ID] || null;
      try {
        var bx = processBaixaForOrder_(o, isNew, oldSt);
        baixasRealizadas += bx.baixas;
        pendentesMapeamento += bx.pendentes;
        faltantesEstoque += bx.faltantes;
        revertsRealizadas += bx.reverts;
      } catch (e) {
        LoggingService.log({
          service: 'OrdersImport', action: 'processBaixa', status: 'WARN',
          caller: 'OrdersImportService',
          summary: 'Baixa falhou para order ' + o.ORDER_ID + ': ' + e.message,
          durationMs: 0, context: { orderSn: o.ORDER_ID, error: e.message }
        });
      }
    }

    var totalMs = Date.now() - importStart;
    var totalErrors = errors.length;

    var message = imported + ' novos, ' + updated + ' atualizados';
    if (totalErrors > 0) message += ' (' + totalErrors + ' erro' + (totalErrors !== 1 ? 's' : '') + ')';

    LoggingService.log({
      service: 'OrdersImport', action: 'importShopeeOrders',
      status: totalErrors > 0 && imported === 0 && updated === 0 ? 'ERROR' : 'OK',
      caller: 'UI', summary: 'Importação concluída: ' + message + ' (' + totalMs + 'ms)' +
        (baixasRealizadas > 0 ? ' baixas=' + baixasRealizadas : '') +
        (revertsRealizadas > 0 ? ' reverts=' + revertsRealizadas : ''),
      durationMs: totalMs, context: {
        mode: mode, imported: imported, updated: updated, totalErrors: totalErrors,
        baixasRealizadas: baixasRealizadas, pendentesMapeamento: pendentesMapeamento,
        faltantesEstoque: faltantesEstoque, revertsRealizadas: revertsRealizadas,
        escrowBatchCalls: Math.ceil(allDetailSns.length / ESCROW_BATCH_SIZE),
        errors: errors.slice(0, 10)
      }
    });

    return {
      success: totalErrors === 0 || imported > 0 || updated > 0,
      imported: imported, updated: updated, errors: errors, message: message,
      baixasRealizadas: baixasRealizadas, pendentesMapeamento: pendentesMapeamento,
      faltantesEstoque: faltantesEstoque, revertsRealizadas: revertsRealizadas
    };
  }

  /**
   * Sincroniza um único pedido pelo order_sn: busca detail + escrow, normaliza
   * e faz upsert. Se o pedido já existe, atualiza TODAS as colunas da linha
   * (não só STATUS). Usado pelo PushNotificationService nos webhooks Shopee.
   */
  function syncOrderBySn(orderSn) {
    if (!orderSn) return { success: false, error: 'orderSn obrigatório' };

    var startTime = Date.now();
    var detail = null;
    try {
      detail = getOrderDetail_(orderSn);
    } catch (e) {
      return { success: false, error: 'detail error: ' + e.message };
    }

    if (!detail) {
      LoggingService.log({
        service: 'OrdersImport', action: 'syncOrderBySn', status: 'ERROR',
        caller: 'PushNotification', summary: 'order_sn não encontrado na Shopee: ' + orderSn,
        durationMs: Date.now() - startTime, context: { orderSn: orderSn }
      });
      return { success: false, error: 'detail not found: ' + orderSn };
    }

    var escrow = null;
    try {
      var escrowMap = getEscrowDetailBatch_([orderSn]);
      escrow = escrowMap[orderSn] || null;
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'syncOrderBySn', status: 'WARN',
        caller: 'PushNotification', summary: 'escrow indisponível para ' + orderSn + ': ' + e.message,
        durationMs: Date.now() - startTime, context: { orderSn: orderSn }
      });
    }

    var skuMap = {};
    try {
      skuMap = AnunciosShopeeRepository.getItemSkuMap(ConfigService.getSheetId());
    } catch (e) {
      // fallback silencioso: sem skuMap, usa item_sku da Shopee
    }

    var costMap = {};
    try {
      costMap = getCostMap_(ConfigService.getSheetId());
    } catch (e) {
      // fallback silencioso: sem costMap, TOTAL_COST = 0
    }

    var order = normalizeOrder_(detail, escrow, skuMap, costMap);
    if (!order) return { success: false, error: 'normalize failed' };

    var map = OrdersRepository.getAllOrdersMap();
    var inserted = 0;
    var updated = 0;
    var oldStatus = map[orderSn] ? (map[orderSn].STATUS || '') : null;
    var isNew = !map[orderSn];

    if (map[orderSn]) {
      OrdersRepository.updateOrderRow(map[orderSn].rowNumber, order);
      updated = 1;
    } else {
      var ins = OrdersRepository.insertOrdersBulk([order]);
      inserted = ins.inserted || 1;
    }

    // Process stock baixa
    var baixasRealizadas = 0, pendentesMapeamento = 0, faltantesEstoque = 0, revertsRealizadas = 0;
    try {
      var bx = processBaixaForOrder_(order, isNew, oldStatus);
      baixasRealizadas = bx.baixas;
      pendentesMapeamento = bx.pendentes;
      faltantesEstoque = bx.faltantes;
      revertsRealizadas = bx.reverts;
    } catch (e) {
      LoggingService.log({
        service: 'OrdersImport', action: 'processBaixa', status: 'WARN',
        caller: 'OrdersImportService',
        summary: 'Baixa falhou para ' + orderSn + ': ' + e.message,
        durationMs: 0, context: { orderSn: orderSn, error: e.message }
      });
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'syncOrderBySn', status: 'OK',
      caller: 'PushNotification', summary: orderSn + ' => ' + order.STATUS + ' (ins ' + inserted + ', upd ' + updated + ')' +
        (baixasRealizadas > 0 ? ' baixas=' + baixasRealizadas : '') +
        (revertsRealizadas > 0 ? ' reverts=' + revertsRealizadas : ''),
      durationMs: Date.now() - startTime,
      context: { orderSn: orderSn, status: order.STATUS, inserted: inserted, updated: updated, escrowAvailable: !!escrow,
        baixasRealizadas: baixasRealizadas, pendentesMapeamento: pendentesMapeamento,
        faltantesEstoque: faltantesEstoque, revertsRealizadas: revertsRealizadas }
    });

    return {
      success: true,
      orderSn: orderSn,
      status: order.STATUS,
      inserted: inserted,
      updated: updated,
      baixasRealizadas: baixasRealizadas,
      pendentesMapeamento: pendentesMapeamento,
      faltantesEstoque: faltantesEstoque,
      revertsRealizadas: revertsRealizadas
    };
  }

  var CANCELLED_STATUSES = ['CANCELLED', 'IN_CANCEL'];
  var RETURN_STATUSES = ['TO_RETURN', 'RETURNED'];

  /**
   * Processa baixa de estoque para um pedido recém-inserido ou revertido.
   * @param {object} order - Pedido normalizado (ORDER_ID, ITEM_SKUS, STATUS)
   * @param {boolean} isNew - true se pedido é novo (inserted)
   * @param {string|null} oldStatus - status anterior (null se novo)
   */
  function processBaixaForOrder_(order, isNew, oldStatus) {
    var itemSkus = order.ITEM_SKUS || '';
    if (!itemSkus) return { baixas: 0, pendentes: 0, faltantes: 0, reverts: 0 };

    var baixas = 0, pendentes = 0, faltantes = 0, reverts = 0;
    var orderSn = order.ORDER_ID;

    // Parse ITEM_SKUS: "SKU:qty; SKU:qty"
    var parts = itemSkus.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var colonIdx = p.indexOf(':');
      if (colonIdx === -1) continue;
      var sku = p.substring(0, colonIdx).trim();
      var qty = parseInt(p.substring(colonIdx + 1), 10) || 1;
      if (!sku) continue;

      var refOrigem = 'SHOPEE#' + orderSn + ':' + sku;
      var idempKey = refOrigem;

      if (isNew) {
        // New order → baixar
        try {
          var result = EstoqueBaixaService.baixarPorProduto({
            codigoProduto: sku,
            quantidade: qty,
            origem: 'PEDIDO_SHOPEE',
            referenciaOrigem: refOrigem,
            idempotencyKey: idempKey
          });
          if (result.baixados > 0) baixas++;
          if (result.faltantes > 0) faltantes++;
          if (result.jaExistia) baixas++; // already counted
          if (result.baixados === 0 && result.faltantes === qty && !result.jaExistia) pendentes++;
        } catch (e) {
          LoggingService.log({
            service: 'OrdersImport', action: 'baixa', status: 'WARN',
            caller: 'OrdersImportService',
            summary: 'Baixa falhou para ' + sku + ': ' + e.message,
            durationMs: 0, context: { orderSn: orderSn, sku: sku, error: e.message }
          });
        }
      } else if (oldStatus && !isNew) {
        // Status change → check revert
        var newStatus = String(order.STATUS || '').trim().toUpperCase();
        var oldS = String(oldStatus).trim().toUpperCase();
        var shouldRevertCancel = CANCELLED_STATUSES.indexOf(newStatus) !== -1 && CANCELLED_STATUSES.indexOf(oldS) === -1;
        var shouldRevertReturn = RETURN_STATUSES.indexOf(newStatus) !== -1 && RETURN_STATUSES.indexOf(oldS) === -1;

        if (shouldRevertCancel || shouldRevertReturn) {
          var motivo = shouldRevertCancel ? 'CANCELADO' : 'DEVOLVIDO';
          try {
            var revResult = EstoqueBaixaService.reverterBaixa({
              referenciaOrigem: refOrigem,
              motivo: motivo
            });
            if (revResult.revertidos > 0) reverts++;
          } catch (e) {
            LoggingService.log({
              service: 'OrdersImport', action: 'reverterBaixa', status: 'WARN',
              caller: 'OrdersImportService',
              summary: 'Reversão falhou para ' + sku + ': ' + e.message,
              durationMs: 0, context: { orderSn: orderSn, sku: sku, error: e.message }
            });
          }
        }
      }
    }

    // Update BAIXADO on PEDIDOS sheet
    if (baixas > 0 || reverts > 0) {
      try {
        var pedSheet = SpreadsheetApp.openById(ConfigService.getSheetId()).getSheetByName('PEDIDOS');
        if (pedSheet) {
          var pedHeaders = pedSheet.getRange(1, 1, 1, pedSheet.getLastColumn()).getValues()[0];
          var pedOrderIdCol = -1, pedBaixadoCol = -1;
          for (var ph = 0; ph < pedHeaders.length; ph++) {
            var h = String(pedHeaders[ph]).trim();
            if (h === 'ORDER_ID') pedOrderIdCol = ph + 1;
            if (h === 'BAIXADO') pedBaixadoCol = ph + 1;
          }
          if (pedOrderIdCol > 0 && pedBaixadoCol > 0) {
            var pedData = pedSheet.getRange(2, pedOrderIdCol, pedSheet.getLastRow() - 1, 1).getValues();
            for (var pr = 0; pr < pedData.length; pr++) {
              if (String(pedData[pr][0]).trim() === String(orderSn).trim()) {
                pedSheet.getRange(pr + 2, pedBaixadoCol).setValue(baixas > 0 ? 'S' : 'N');
                break;
              }
            }
          }
        }
      } catch (e) { /* non-critical */ }
    }

    return { baixas: baixas, pendentes: pendentes, faltantes: faltantes, reverts: reverts };
  }

  function recalcAllCosts_() {
    var sheetId = ConfigService.getSheetId();
    var costMap = {};
    try { costMap = getCostMap_(sheetId); } catch (e) { return { error: 'getCostMap failed: ' + e.message }; }
    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { error: 'empty sheet' };
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    for (var i = 0; i < headers.length; i++) headerMap[headers[i]] = i + 1;
    var skusCol = headerMap['ITEM_SKUS'];
    var costCol = headerMap['TOTAL_COST'];
    if (!skusCol || !costCol) return { error: 'missing columns', hasSkus: !!skusCol, hasCost: !!costCol };
    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var updated = 0;
    for (var r = 0; r < allData.length; r++) {
      var itemSkus = String(allData[r][skusCol - 1] || '').trim();
      var newCost = calculateTotalCost_(itemSkus, costMap);
      var oldCost = allData[r][costCol - 1];
      if (newCost > 0 && newCost !== oldCost) {
        sheet.getRange(r + 2, costCol).setValue(newCost);
        updated++;
      } else if (itemSkus && newCost === 0 && oldCost !== 0) {
        sheet.getRange(r + 2, costCol).setValue(0);
        updated++;
      }
    }
    return { totalRows: lastRow - 1, updated: updated, costMapSize: Object.keys(costMap).length };
  }

  return { describe: describe, importShopeeOrders: importShopeeOrders, syncOrderBySn: syncOrderBySn, recalcAllCosts: function () { return recalcAllCosts_(); } };
})();
