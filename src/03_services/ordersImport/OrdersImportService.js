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
        diagnoseCost: {
          description: 'Diagnóstico de cálculo de custo para um pedido específico.',
          params: {
            orderSn: { type: 'string', required: true, description: 'Order SN para diagnosticar' }
          }
        },
        testWriteCost: {
          description: 'Teste direto de escrita na coluna TOTAL_COST.',
          params: {}
        },
        testUpdateOrderRow: {
          description: 'Teste direto de updateOrderRow com TOTAL_COST.',
          params: {
            orderSn: { type: 'string', required: false, default: '260711CAQ9KK03' }
          }
        },
        testForceWriteCost: {
          description: 'Teste: fetch order detail + normalizeOrder_ + updateOrderRow com TOTAL_COST.',
          params: {
            orderSn: { type: 'string', required: false, default: '260711CAQ9KK03' }
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
   * Diagnóstico: mostra custo de um pedido específico + costMap completo.
   */
  function diagnoseCost_(orderSn, sheetId) {
    var costMap = {};
    try { costMap = getCostMap_(sheetId || ConfigService.getSheetId()); } catch (e) { return { error: 'getCostMap failed: ' + e.message }; }
    var allOrders = OrdersRepository.getAllOrdersMap();
    var orderIdToRow = {};
    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var skusCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'ITEM_SKUS') skusCol = i + 1;
    }
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2 && skusCol > 0) {
      var skuData = sheet.getRange(2, skusCol, lastRow - 1, 1).getValues();
      var oidData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var r = 0; r < skuData.length; r++) {
        var oid = String(oidData[r][0]).trim();
        if (oid === orderSn) {
          var itemSkus = String(skuData[r][0] || '');
          var parts = itemSkus.split(';');
          var detail = [];
          for (var p = 0; p < parts.length; p++) {
            var pt = parts[p].trim();
            var ci = pt.indexOf(':');
            var sku = ci > -1 ? pt.substring(0, ci).trim() : pt;
            var qty = ci > -1 ? (parseInt(pt.substring(ci + 1), 10) || 1) : 1;
            detail.push({ sku: sku, qty: qty, unitCost: costMap[sku] || 0, total: (costMap[sku] || 0) * qty });
          }
          var totalCost = 0;
          for (var d = 0; d < detail.length; d++) totalCost += detail[d].total;
          return {
            orderSn: orderSn,
            itemSkus: itemSkus,
            detail: detail,
            totalCost: Math.round(totalCost * 100) / 100,
            costMapKeys: Object.keys(costMap),
            costMapSize: Object.keys(costMap).length
          };
        }
      }
    }
    return { orderSn: orderSn, error: 'Order not found or no ITEM_SKUS column', costMapKeys: Object.keys(costMap), costMapSize: Object.keys(costMap).length };
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
      var sku = items[i].item_sku || '';
      if (!sku && items[i].item_id && skuMap[items[i].item_id]) {
        sku = skuMap[items[i].item_id];
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

    var upsertResult = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      upsertResult = OrdersRepository.upsertOrders(toUpsert, true);
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

    if (map[orderSn]) {
      OrdersRepository.updateOrderRow(map[orderSn].rowNumber, order);
      updated = 1;
    } else {
      var ins = OrdersRepository.insertOrdersBulk([order]);
      inserted = ins.inserted || 1;
    }

    LoggingService.log({
      service: 'OrdersImport', action: 'syncOrderBySn', status: 'OK',
      caller: 'PushNotification', summary: orderSn + ' => ' + order.STATUS + ' (ins ' + inserted + ', upd ' + updated + ')',
      durationMs: Date.now() - startTime,
      context: { orderSn: orderSn, status: order.STATUS, inserted: inserted, updated: updated, escrowAvailable: !!escrow }
    });

    return {
      success: true,
      orderSn: orderSn,
      status: order.STATUS,
      inserted: inserted,
      updated: updated
    };
  }

  return { describe: describe, importShopeeOrders: importShopeeOrders, syncOrderBySn: syncOrderBySn, diagnoseCost: function (params) { return diagnoseCost_(params.orderSn); }, testWriteCost: function (params) {
    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var costCol = -1;
    var oidCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'TOTAL_COST') costCol = i + 1;
      if (headers[i] === 'ORDER_ID') oidCol = i + 1;
    }
    if (costCol === -1) return { error: 'TOTAL_COST col not found' };
    var lastRow = sheet.getLastRow();
    var results = [];
    for (var r = 2; r <= Math.min(lastRow, 5); r++) {
      var oid = sheet.getRange(r, oidCol).getValue();
      var cellBefore = sheet.getRange(r, costCol).getValue();
      sheet.getRange(r, costCol).setValue(999.99);
      var cellAfter = sheet.getRange(r, costCol).getValue();
      results.push({ oid: oid, before: cellBefore, after: cellAfter });
    }
    return { costCol: costCol, results: results };
  }, testUpdateOrderRow: function (params) {
    var orderSn = params.orderSn || '260711CAQ9KK03';
    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var oidCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'ORDER_ID') oidCol = i + 1;
    }
    if (oidCol === -1) return { error: 'ORDER_ID col not found' };
    var lastRow = sheet.getLastRow();
    for (var r = 2; r <= lastRow; r++) {
      if (String(sheet.getRange(r, oidCol).getValue()).trim() === orderSn) {
        var testOrder = { ORDER_ID: orderSn, TOTAL_COST: 42.5 };
        var keys = Object.keys(testOrder);
        var costDebug = { keys: keys, hasTotalCost: 'TOTAL_COST' in testOrder };
        var headerMap = {};
        for (var h = 0; h < headers.length; h++) {
          headerMap[String(headers[h]).trim()] = h + 1;
        }
        var results = [];
        for (var k = 0; k < keys.length; k++) {
          var col = headerMap[keys[k]];
          results.push({ key: keys[k], col: col, value: testOrder[keys[k]], willWrite: !!col });
          if (col) {
            sheet.getRange(r, col).setValue(testOrder[keys[k]]);
          }
        }
        var cellAfter = sheet.getRange(r, headerMap['TOTAL_COST']).getValue();
        return { orderSn: orderSn, row: r, costDebug: costDebug, results: results, cellAfter: cellAfter };
      }
    }
    return { error: 'Order not found: ' + orderSn };
  }, testForceWriteCost: function (params) {
    var orderSn = params.orderSn || '260711CAQ9KK03';
    var costMap = {};
    try {
      costMap = getCostMap_(ConfigService.getSheetId());
    } catch (e) {
      return { error: 'getCostMap failed: ' + e.message };
    }

    var detail = null;
    try {
      detail = getOrderDetail_(orderSn);
    } catch (e) {
      return { error: 'getOrderDetail_ failed: ' + e.message };
    }
    if (!detail) return { error: 'detail is null for ' + orderSn };

    var escrow = null;
    try {
      var escrowResult = callTiops_('shopee_get_escrow_detail', { order_sn: orderSn });
      var escrowResp = escrowResult.response || escrowResult;
      escrow = escrowResp.escrow_detail || null;
      if (escrow && escrow.order_income) escrow = escrow.order_income;
    } catch (e) { /* ok */ }

    var skuMap = {};
    try { skuMap = AnunciosShopeeRepository.getItemSkuMap(); } catch (e) { /* ok */ }

    var order = normalizeOrder_(detail, escrow, skuMap, costMap);
    if (!order) return { error: 'normalizeOrder_ returned null' };

    var debugInfo = {
      orderSn: order.ORDER_ID,
      itemSkus: order.ITEM_SKUS,
      totalCost: order.TOTAL_COST,
      orderKeys: Object.keys(order),
      hasTotalCostInOrder: 'TOTAL_COST' in order
    };

    var existingMap = OrdersRepository.getAllOrdersMap();
    var existing = existingMap[orderSn];
    if (!existing) return { error: 'Order not in sheet', debug: debugInfo };

    var writeResult = OrdersRepository.updateOrderRow(existing.rowNumber, order);

    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastCol2 = sheet.getLastColumn();
    var hdrs = sheet.getRange(1, 1, 1, lastCol2).getValues()[0];
    var tcCol = -1;
    for (var i = 0; i < hdrs.length; i++) {
      if (hdrs[i] === 'TOTAL_COST') tcCol = i + 1;
    }
    var cellAfter = tcCol > 0 ? sheet.getRange(existing.rowNumber, tcCol).getValue() : 'col not found';

    return { debug: debugInfo, writeResult: writeResult, cellAfter: cellAfter, rowNumber: existing.rowNumber };
  } };
})();
