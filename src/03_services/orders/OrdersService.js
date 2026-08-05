/**
 * OrdersService — pedidos normalizados lidos da aba PEDIDOS do Google Sheets.
 * Regras completas em specs/orders.md.
 * Lê tanto formato normalizado (legacy) quanto formato Shopee raw (ordersImport).
 */
var OrdersService = (function () {
  var SHEET_NAME = 'PEDIDOS';

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
          description: 'Detalhe de um pedido específico.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            orderId: { type: 'string', required: true }
          },
          returns: { order: 'object' }
        }
      }
    };
  }

  var STATUS_LABELS = {
    'UNPAID': 'Não Pago',
    'READY_TO_SHIP': 'A Enviar',
    'SHIPPED': 'Enviado',
    'TO_CONFIRM_RECEIVE': 'Entregue',
    'COMPLETED': 'Concluído',
    'CANCELLED': 'Cancelado',
    'IN_CANCEL': 'Em Cancelamento',
    'PROCESSED': 'Processado'
  };

  function num_(value) {
    var n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  // Lógica pura de líquido — testada em runSmokeTests_.
  function calculateNet(params) {
    params = params || {};
    var escrow = num_(params.escrowAmount);
    var base = escrow > 0 ? escrow : num_(params.total);
    return base - num_(params.netCommissionFee) - num_(params.netServiceFee) - num_(params.pixDiscount);
  }

  // Converte Date / epoch(segundos) / ISO / "dd/mm/yyyy hh:mm" para "dd/mm/yyyy hh:mm".
  // Formato BR é a única saída exposta ao cliente (project-wide não expomos ISO na UI).
  function brDateTime_(value) {
    if (value === null || value === undefined || value === '') return '';
    var d;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'number') {
      d = new Date(value > 1000000000 ? value * 1000 : value);
    } else if (typeof value === 'string') {
      d = new Date(value);
      if (isNaN(d.getTime())) return value; // já é BR ou texto — passa direto
    } else {
      return String(value);
    }
    if (isNaN(d.getTime())) return String(value);
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var yyyy = d.getFullYear();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
  }

  // Timestamp numérico (ms) para ordenação estável mesmo com datas em formato BR.
  function tsOf_(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value > 1000000000 ? value * 1000 : value;
    var d = new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function normalizeOrder_(row) {
    var marketplace = row.MARKETPLACE || row.marketplace || 'shopee';
    var orderId = row.ORDER_ID || row.order_id || row.order_sn || row.id || '';
    var status = row.STATUS || row.status || '';
    var total = num_(row.TOTAL_AMOUNT || row.total_amount || row.total || 0);
    var buyerName = row.BUYER_USERNAME || row.buyer_username || row.buyerName || row.buyer_name || '';
    var paymentMethod = row.PAYMENT_METHOD || row.payment_method || row.paymentMethod || '';
    var itemNames = row.ITEM_NAMES || row.item_names || row.itemNames || row.ITEMS_DETAIL || row.items_detail || row.itemsDetail || '';

    var escrowAmount = num_(row.ESCROW_AMOUNT || row.escrow_amount || 0);
    var netCommissionFee = num_(row.NET_COMMISSION_FEE || row.net_commission_fee || 0);
    var netServiceFee = num_(row.NET_SERVICE_FEE || row.net_service_fee || 0);
    var pixDiscount = num_(row.PIX_DISCOUNT || row.pix_discount || 0);
    var netAmount = calculateNet({
      escrowAmount: escrowAmount,
      total: total,
      netCommissionFee: netCommissionFee,
      netServiceFee: netServiceFee,
      pixDiscount: pixDiscount
    });

    return {
      id: String(orderId),
      marketplace: marketplace,
      status: status,
      statusLabel: STATUS_LABELS[status] || status,
      total: total,
      buyerName: buyerName,
      createdAt: brDateTime_(row.CREATE_TIME || row.create_time || row.createdAt || row.created_at || ''),
      paymentMethod: paymentMethod,
      itemNames: itemNames,
      liquid: netAmount,
      escrowAmount: escrowAmount,
      commissionFee: num_(row.COMMISSION_FEE || row.commission_fee || 0),
      netCommissionFee: netCommissionFee,
      serviceFee: num_(row.SERVICE_FEE || row.service_fee || 0),
      netServiceFee: netServiceFee,
      pixDiscount: pixDiscount,
      sellerRebate: num_(row.SELLER_REBATE || row.seller_rebate || 0),
      actualShippingFee: num_(row.ACTUAL_SHIPPING_FEE || row.actual_shipping_fee || 0),
      estimatedShippingFee: num_(row.ESTIMATED_SHIPPING_FEE || row.estimated_shipping_fee || 0),
      recipientName: row.RECIPIENT_NAME || row.recipient_name || '',
      recipientCity: row.RECIPIENT_CITY || row.recipient_city || '',
      recipientState: row.RECIPIENT_STATE || row.recipient_state || '',
      recipientZipcode: row.RECIPIENT_ZIPCODE || row.recipient_zipcode || '',
      recipientFullAddress: row.RECIPIENT_FULL_ADDRESS || row.recipient_full_address || '',
      itemCount: num_(row.ITEM_COUNT || row.item_count || 0),
      totalWeightGram: num_(row.TOTAL_WEIGHT_GRAM || row.total_weight_gram || 0),
      payTime: brDateTime_(row.PAY_TIME || row.pay_time || ''),
      updateTime: brDateTime_(row.UPDATE_TIME || row.update_time || ''),
      messageToSeller: row.MESSAGE_TO_SELLER || row.message_to_seller || '',
      _sortTs: tsOf_(row.CREATE_TIME || row.create_time || row.createdAt || row.created_at || '')
    };
  }

  function withoutSortKey_(order) {
    var clean = {};
    var keys = Object.keys(order);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== '_sortTs') clean[keys[i]] = order[keys[i]];
    }
    return clean;
  }

  function listUnified(params) {
    var marketplace = params.marketplace || 'all';
    var limit = params.limit || 20;

    var rows = SheetsRepository.getRows(SHEET_NAME);
    var normalized = rows.map(normalizeOrder_);

    var filtered = normalized.filter(function (row) {
      if (marketplace === 'all') return true;
      return row.marketplace === marketplace;
    });

    var sorted = filtered.sort(function (a, b) {
      return b._sortTs - a._sortTs;
    });

    var limited = sorted.slice(0, limit).map(withoutSortKey_);

    return { orders: limited };
  }

  function getDetail(params) {
    var rows = SheetsRepository.getRows(SHEET_NAME);
    var normalized = rows.map(normalizeOrder_);

    var found = normalized.filter(function (row) {
      return String(row.id) === String(params.orderId) && row.marketplace === params.marketplace;
    })[0];

    if (!found) {
      return { error: 'Pedido não encontrado: ' + params.orderId };
    }

    return { order: withoutSortKey_(found) };
  }

  return { describe: describe, listUnified: listUnified, getDetail: getDetail, calculateNet: calculateNet };
})();
