/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Busca pedidos nos status operacionais (UNPAID, READY_TO_SHIP, SHIPPED) e
 * também em COMPLETED/CANCELLED para manter histórico atualizado.
 * Escrow via batch (1 chamada para N pedidos) — economiza ações.
 * Faz upsert: insere novos e atualiza status dos existentes.
 * Regras de negócio documentadas no código abaixo.
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
        },
        restoreEmptySkus: {
          description: 'Restaura ITEM_SKUS vazios re-buscando pedidos no Shopee e aplicando skuMap de ANUNCIOS_SHOPEE.',
          params: {}
        },
        backfillEstoqueIdsAndCosts: {
          description: 'Preenche BAIXA_ESTOQUE_IDS e TOTAL_COST em pedidos existentes a partir de ESTOQUE_BAIXAS + PRECO_CUSTO_ORIGINAL.',
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

    // Batch detail fetches via UrlFetchApp.fetchAll (1 round-trip for N orders)
    var BATCH_SIZE = 50;
    for (var d = 0; d < toFetchDetail.length; d += BATCH_SIZE) {
      var batchSns = toFetchDetail.slice(d, d + BATCH_SIZE);
      var batchItems = batchSns.map(function (sn) {
        return { action: 'shopee_get_order_detail', params: { order_sn: sn } };
      });
      try {
        var batchResults = TiopsClient.callBatch(batchItems);
        for (var b = 0; b < batchResults.length; b++) {
          var sn = batchSns[b];
          var res = batchResults[b];
          if (res && res.error) {
            detailErrors++;
            errors.push({ order_sn: sn, reason: res.error });
          } else {
            var response = (res && res.data) ? (res.data.response || res.data) : (res ? (res.response || res) : null);
            var orderList = response ? (response.order_list || []) : [];
            var detail = orderList.length > 0 ? orderList[0] : null;
            if (detail) {
              details[sn] = detail;
            } else {
              detailErrors++;
              errors.push({ order_sn: sn, reason: 'detail not found' });
            }
          }
        }
      } catch (e) {
        detailErrors += batchSns.length;
        for (var errIdx = 0; errIdx < batchSns.length; errIdx++) {
          errors.push({ order_sn: batchSns[errIdx], reason: e.message });
        }
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
    var oldBaixadoStatuses = {};
    try {
      var existingMap = OrdersRepository.getAllOrdersMap();
      var existingKeys = Object.keys(existingMap);
      for (var e = 0; e < existingKeys.length; e++) {
        oldStatuses[existingKeys[e]] = existingMap[existingKeys[e]].status || '';
        oldBaixadoStatuses[existingKeys[e]] = existingMap[existingKeys[e]].baixado || '';
        oldBaixadoStatuses[existingKeys[e]] = existingMap[existingKeys[e]].baixado || '';
      }
    } catch (e) { /* fallback: no oldStatuses, baixa still works for new orders */ }

    var upsertResult = { inserted: 0, updated: 0 };
    if (toUpsert.length > 0) {
      upsertResult = OrdersRepository.upsertOrders(toUpsert, true);
    }

    var imported = upsertResult.inserted || 0;
    var updated = upsertResult.updated || 0;

    if (imported > 0 || updated > 0) {
      // Dashboard mostra pedidos recentes (dashboard.getSummary); Estoque também
      // muda aqui via baixa automática logo abaixo — sem isso, ambos ficam até
      // 5min desatualizados após um import real.
      CacheRepository.invalidateByPattern('dashboard_');
      CacheRepository.invalidateByPattern('estoque_');
    }

    // Process stock baixa for new orders, status changes, and unprocessed orders
    var baixasRealizadas = 0, pendentesMapeamento = 0, faltantesEstoque = 0, revertsRealizadas = 0;
    for (var b = 0; b < toUpsert.length; b++) {
      var o = toUpsert[b];
      var isNew = !oldStatuses[o.ORDER_ID];
      var oldSt = oldStatuses[o.ORDER_ID] || null;
      var oldBaixado = oldBaixadoStatuses[o.ORDER_ID] || '';
      try {
        var bx = processBaixaForOrder_(o, isNew, oldSt, oldBaixado);
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
    var oldStatus = map[orderSn] ? (map[orderSn].status || '') : null;
    var oldBaixado = map[orderSn] ? (map[orderSn].baixado || '') : '';
    var isNew = !map[orderSn];

    if (map[orderSn]) {
      // Protege ITEM_SKUS existente: se o novo valor é vazio, preserva o antigo
      if (!order.ITEM_SKUS && map[orderSn].itemSkus) {
        LoggingService.log({
          service: 'OrdersImport', action: 'syncOrderBySn', status: 'WARN',
          caller: 'OrdersImportService',
          summary: 'ITEM_SKUS vazio preservado para ' + orderSn + ': ' + map[orderSn].itemSkus,
          durationMs: 0, context: { orderSn: orderSn, preservedSkus: map[orderSn].itemSkus }
        });
        order.ITEM_SKUS = map[orderSn].itemSkus;
      }
      // Protege BAIXA_ESTOQUE_IDS existente (mesmo raciocínio do ITEM_SKUS)
      if (!order.BAIXA_ESTOQUE_IDS && map[orderSn].baixaEstoqueIds) {
        order.BAIXA_ESTOQUE_IDS = map[orderSn].baixaEstoqueIds;
      }
      OrdersRepository.updateOrderRow(map[orderSn].rowNumber, order);
      updated = 1;
    } else {
      var ins = OrdersRepository.insertOrdersBulk([order]);
      inserted = ins.inserted || 1;
    }

    // Process stock baixa
    var baixasRealizadas = 0, pendentesMapeamento = 0, faltantesEstoque = 0, revertsRealizadas = 0;
    try {
      var bx = processBaixaForOrder_(order, isNew, oldStatus, oldBaixado);
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
  var UNPAID_STATUS = 'UNPAID';
  var SEM_ESTOQUE_SKU_ = 'SEM_ESTOQUE';

  /**
   * Processa baixa de estoque para um pedido recém-inserido ou revertido.
   * @param {object} order - Pedido normalizado (ORDER_ID, ITEM_SKUS, STATUS)
   * @param {boolean} isNew - true se pedido é novo (inserted)
   * @param {string|null} oldStatus - status anterior (null se novo)
   */
  function processBaixaForOrder_(order, isNew, oldStatus, oldBaixado) {
    var itemSkus = order.ITEM_SKUS || '';
    if (!itemSkus) return { baixas: 0, pendentes: 0, faltantes: 0, reverts: 0, custoTotal: 0, estoqueIds: '' };

    var baixas = 0, pendentes = 0, faltantes = 0, reverts = 0;
    var totalSkusNoPedido = 0;
    var orderSn = order.ORDER_ID;
    var custoTotal = 0;
    var allEstoqueIds = [];

    // Determine if baixa should run: new order OR existing order with empty BAIXADO
    var shouldBaixar = isNew || (oldBaixado !== undefined && oldBaixado === '');

    // Parse ITEM_SKUS: "SKU:qty; SKU:qty"
    var parts = itemSkus.split(';');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      var colonIdx = p.indexOf(':');
      if (colonIdx === -1) continue;
      var sku = p.substring(0, colonIdx).trim();
      var qty = parseInt(p.substring(colonIdx + 1), 10) || 1;
      if (!sku) continue;
      // Sentinela do pareamento: item_sku=SEM_ESTOQUE = item sem controle de
      // estoque unitário (decidido na ferramenta de pareamento) — nunca gera
      // pendência nem custo na baixa.
      if (sku === SEM_ESTOQUE_SKU_) continue;
      // J1 (11/08/2026): conta UNIDADES (qty), não entradas — senão uma
      // baixa parcial de um SKU x5 (2 de 5) marcaria o pedido como BAIXADO
      // e o backfill o pularia, deixando o excedente sem rebaixada.
      totalSkusNoPedido += qty;

      var refOrigem = 'SHOPEE#' + orderSn + ':' + sku;
      var idempKey = refOrigem;

      // J1: agrega rows BAIXADO pré-existentes da referência — quando uma
      // baixa parcial anterior existe, o gate precisa creditar essas
      // unidades (senão o pedido vira BAIXADO incompleto ou PENDENTE).
      var excedenteRef = { totalJaBaixado: 0 };
      if (typeof EstoqueBaixaService.calcularExcedente === 'function') {
        excedenteRef = EstoqueBaixaService.calcularExcedente(
          EstoqueBaixasRepository.getRows(ConfigService.getSheetId(), { referenciaOrigem: refOrigem }),
          qty
        );
      }

      // Regra de negócio: pedido cancelado, devolvido OU NÃO PAGO (UNPAID)
      // nunca baixa estoque (o item só sai do estoque quando há pagamento).
      var orderStatusU = String(order.STATUS || '').trim().toUpperCase();
      if (CANCELLED_STATUSES.indexOf(orderStatusU) !== -1 ||
          RETURN_STATUSES.indexOf(orderStatusU) !== -1 ||
          orderStatusU === UNPAID_STATUS) {
        continue;
      }

      if (shouldBaixar) {
        // New order or unprocessed order → baixar
        try {
          var result = EstoqueBaixaService.baixarPorProduto({
            codigoProduto: sku,
            quantidade: qty,
            origem: 'PEDIDO_SHOPEE',
            referenciaOrigem: refOrigem,
            idempotencyKey: idempKey
          });
          if (result.baixados > 0 || result.jaExistia) {
            // J1: conta UNIDADES baixadas — novas (result.baixados) ou já
            // existentes na referência (aggregate, ex.: baixa parcial que
            // voltou num sync posterior sem estoque suficiente).
            baixas += result.jaExistia ? excedenteRef.totalJaBaixado : result.baixados;
            custoTotal += Number(result.custoTotal) || 0;
            if (result.estoque_ids && result.estoque_ids.length > 0) {
              allEstoqueIds = allEstoqueIds.concat(result.estoque_ids);
            }
          }
          if (result.faltantes > 0) faltantes++;
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
            if (revResult.revertidos > 0) {
              reverts++;
              custoTotal = Math.max(0, custoTotal - (Number(revResult.custoTotal) || 0));
              // Remove reverted estoqueIds from accumulated list
              var revIds = (revResult.estoque_ids || []).length > 0 ? revResult.estoque_ids : [];
              // Lookup the existing baixa to get the IDs that were reverted
              var existingBaixa = EstoqueBaixasRepository.findByReferenciaOrigem(
                ConfigService.getSheetId(), refOrigem
              );
              if (existingBaixa && existingBaixa.ESTOQUE_IDS) {
                var revertedIds = existingBaixa.ESTOQUE_IDS.split(',').filter(Boolean);
                for (var ri = 0; ri < revertedIds.length; ri++) {
                  var idx = allEstoqueIds.indexOf(revertedIds[ri]);
                  if (idx !== -1) allEstoqueIds.splice(idx, 1);
                }
              }
            }
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

    // Update BAIXADO, BAIXA_ESTOQUE_IDS and TOTAL_COST on PEDIDOS sheet
    if (baixas > 0 || reverts > 0 || faltantes > 0) {
      custoTotal = Math.round(custoTotal * 100) / 100;
      var estoqueIdsStr = allEstoqueIds.join(',');
      try {
        var novoBaixado = 'PENDENTE';
        if (totalSkusNoPedido > 0 && baixas >= totalSkusNoPedido) {
          novoBaixado = 'BAIXADO';
        } else if (baixas > 0) {
          novoBaixado = 'PARCIAL';
        }
        OrdersRepository.writeBaixaColumns(orderSn, novoBaixado, estoqueIdsStr, custoTotal);
      } catch (e) { /* non-critical */ }
    }

    return { baixas: baixas, pendentes: pendentes, faltantes: faltantes, reverts: reverts, custoTotal: custoTotal, estoqueIds: allEstoqueIds.join(',') };
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

  function restoreEmptySkus_() {
    var startTime = Date.now();
    var sheetId = ConfigService.getSheetId();

    var skuMap = {};
    try {
      skuMap = AnunciosShopeeRepository.getItemSkuMap(sheetId);
    } catch (e) {
      return { error: 'skuMap load failed: ' + e.message };
    }
    if (Object.keys(skuMap).length === 0) {
      return { error: 'skuMap is empty — cannot restore SKUs' };
    }

    var sheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { totalRows: 0, restored: 0, errors: 0 };

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    for (var i = 0; i < headers.length; i++) headerMap[headers[i]] = i + 1;

    var orderIdCol = headerMap['ORDER_ID'];
    var itemSkusCol = headerMap['ITEM_SKUS'];
    var itemsDetailCol = headerMap['ITEMS_DETAIL'];
    if (!orderIdCol || !itemSkusCol) return { error: 'missing columns' };

    var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var emptySkus = [];
    for (var r = 0; r < allData.length; r++) {
      var oid = String(allData[r][orderIdCol - 1] || '').trim();
      var skus = String(allData[r][itemSkusCol - 1] || '').trim();
      if (oid && !skus) {
        emptySkus.push({ orderId: oid, row: r + 2, detail: itemsDetailCol ? String(allData[r][itemsDetailCol - 1] || '') : '' });
      }
    }

    if (emptySkus.length === 0) {
      return { totalRows: lastRow - 1, restored: 0, errors: 0, message: 'Nenhum ITEM_SKUS vazio encontrado' };
    }

    var restored = 0;
    var errors = 0;
    var costMap = {};
    try { costMap = getCostMap_(sheetId); } catch (e) { /* non-critical */ }

    for (var i = 0; i < emptySkus.length; i++) {
      var target = emptySkus[i];
      try {
        var result = callTiops_('shopee_get_order', { order_sn: target.orderId });
        var response = result.response || result;
        var detail = response || {};

        var items = detail.item_list || [];
        if (items.length === 0 && detail.items) items = detail.items;
        if (items.length === 0) {
          errors++;
          continue;
        }

        var newSkus = formatItemSkus_(items, skuMap);
        if (!newSkus) {
          errors++;
          continue;
        }

        var skusColIdx = itemSkusCol;
        sheet.getRange(target.row, skusColIdx).setValue(newSkus);

        if (costMap && Object.keys(costMap).length > 0) {
          var costColIdx = headerMap['TOTAL_COST'];
          if (costColIdx) {
            var newCost = calculateTotalCost_(newSkus, costMap);
            sheet.getRange(target.row, costColIdx).setValue(newCost);
          }
        }

        restored++;
        Utilities.sleep(200);
      } catch (e) {
        errors++;
        LoggingService.log({
          service: 'OrdersImport', action: 'restoreEmptySkus', status: 'WARN',
          caller: 'OrdersImportService',
          summary: 'Falha ao restaurar SKU para ' + target.orderId + ': ' + e.message,
          durationMs: 0, context: { orderId: target.orderId, error: e.message }
        });
      }
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersImport', action: 'restoreEmptySkus',
      status: errors > 0 && restored === 0 ? 'ERROR' : 'OK',
      caller: 'OrdersImportService',
      summary: 'Restaurados ' + restored + '/' + emptySkus.length + ' SKUs (' + totalMs + 'ms)',
      durationMs: totalMs, context: { totalEmpty: emptySkus.length, restored: restored, errors: errors }
    });

    return { totalRows: lastRow - 1, totalEmpty: emptySkus.length, restored: restored, errors: errors };
  }

  /**
   * Backfill BAIXA_ESTOQUE_IDS e TOTAL_COST para pedidos existentes.
   * Consulta ESTOQUE_BAIXAS por REFERENCIA_ORIGEM = 'SHOPEE#<ORDER_ID>:*',
   * lê PRECO_CUSTO_ORIGINAL dos itens de ESTOQUE e grava no PEDIDOS.
   */
  function backfillEstoqueIdsAndCosts_() {
    var startTime = Date.now();
    var sheetId = ConfigService.getSheetId();

    var pedSheet = SheetsRepository.getOrCreateSheet('PEDIDOS');
    var lastRow = pedSheet.getLastRow();
    var lastCol = pedSheet.getLastColumn();
    if (lastRow < 2) return { totalRows: 0, updated: 0, errors: 0 };

    var headers = pedSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    for (var i = 0; i < headers.length; i++) headerMap[headers[i]] = i + 1;

    var orderIdCol = headerMap['ORDER_ID'];
    var baixadoCol = headerMap['BAIXADO'];
    var estoqueIdsCol = headerMap['BAIXA_ESTOQUE_IDS'];
    var costCol = headerMap['TOTAL_COST'];
    if (!orderIdCol) return { error: 'missing ORDER_ID column' };

    // Ensure new columns exist
    if (!estoqueIdsCol) {
      estoqueIdsCol = lastCol + 1;
      pedSheet.getRange(1, estoqueIdsCol).setValue('BAIXA_ESTOQUE_IDS');
    }
    if (!costCol) {
      costCol = pedSheet.getLastColumn() + 1;
      pedSheet.getRange(1, costCol).setValue('TOTAL_COST');
    }

    var allData = pedSheet.getRange(2, 1, lastRow - 1, pedSheet.getLastColumn()).getValues();

    // Load ESTOQUE for cost lookup
    var estoqueRows = EstoqueRepository.getRows(sheetId);
    var estoqueMap = {};
    for (var es = 0; es < estoqueRows.length; es++) {
      estoqueMap[estoqueRows[es].ESTOQUE_ID] = estoqueRows[es];
    }

    // Load all ESTOQUE_BAIXAS
    var baixasRows = EstoqueBaixasRepository.getRows(sheetId);
    // Index by REFERENCIA_ORIGEM prefix 'SHOPEE#<orderId>'
    var baixasByOrder = {};
    for (var bx = 0; bx < baixasRows.length; bx++) {
      var ref = String(baixasRows[bx].REFERENCIA_ORIGEM || '');
      var match = ref.match(/^SHOPEE#(\d+):/);
      if (match) {
        var oid = match[1];
        if (!baixasByOrder[oid]) baixasByOrder[oid] = [];
        baixasByOrder[oid].push(baixasRows[bx]);
      }
    }

    var updated = 0;
    var errors = 0;

    for (var r = 0; r < allData.length; r++) {
      var oid = String(allData[r][orderIdCol - 1] || '').trim();
      if (!oid) continue;

      var baixado = baixadoCol ? String(allData[r][baixadoCol - 1] || '').trim().toUpperCase() : '';
      // Skip if already BAIXADO or legacy S (fully processed)
      if (baixado === 'BAIXADO' || baixado === 'S') continue;

      var orderBaixas = baixasByOrder[oid] || [];
      if (orderBaixas.length === 0) continue;

      // Collect unique estoqueIds and sum costs
      var allIds = [];
      var custoTotal = 0;
      for (var ob = 0; ob < orderBaixas.length; ob++) {
        if (String(orderBaixas[ob].STATUS).trim() !== 'BAIXADO') continue;
        var ids = (orderBaixas[ob].ESTOQUE_IDS || '').split(',').filter(Boolean);
        for (var id = 0; id < ids.length; id++) {
          if (allIds.indexOf(ids[id]) === -1) allIds.push(ids[id]);
          var item = estoqueMap[ids[id]];
          if (item) custoTotal += Number(item.PRECO_CUSTO_ORIGINAL) || 0;
        }
      }

      custoTotal = Math.round(custoTotal * 100) / 100;
      var row = r + 2;

      if (estoqueIdsCol > 0) {
        pedSheet.getRange(row, estoqueIdsCol).setValue(allIds.join(','));
      }
      if (costCol > 0) {
        pedSheet.getRange(row, costCol).setValue(custoTotal);
      }
      updated++;
    }

    var totalMs = Date.now() - startTime;
    LoggingService.log({
      service: 'OrdersImport', action: 'backfillEstoqueIdsAndCosts',
      status: 'OK', caller: 'OrdersImportService',
      summary: 'Backfill concluído: ' + updated + ' pedidos atualizados (' + totalMs + 'ms)',
      durationMs: totalMs, context: { totalRows: lastRow - 1, updated: updated }
    });

    return { totalRows: lastRow - 1, updated: updated, errors: errors };
  }

  return { describe: describe, importShopeeOrders: importShopeeOrders, syncOrderBySn: syncOrderBySn, recalcAllCosts: function () { return recalcAllCosts_(); }, restoreEmptySkus: function () { return restoreEmptySkus_(); }, backfillEstoqueIdsAndCosts: function () { return backfillEstoqueIdsAndCosts_(); } };
})();
