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
    'IN_CANCEL': 'Em Cancelamento'
  };

  function normalizeOrder_(row) {
    if (row.id !== undefined && row.marketplace !== undefined) {
      return {
        id: String(row.id),
        marketplace: row.marketplace,
        status: row.status || '',
        statusLabel: STATUS_LABELS[row.status] || row.status || '',
        total: Number(row.total) || 0,
        buyerName: row.buyerName || '',
        createdAt: row.createdAt || '',
        paymentMethod: row.paymentMethod || '',
        itemNames: row.itemNames || ''
      };
    }

    var marketplace = row.marketplace || 'shopee';
    var orderId = row.order_id || row.order_sn || row.id || '';
    var status = row.status || '';
    var total = Number(row.total_amount || row.total || 0);
    var buyerName = row.buyer_username || row.buyerName || row.buyer_name || '';
    var createdAt = row.create_time || row.createdAt || row.created_at || '';

    if (typeof createdAt === 'number' && createdAt > 1000000000) {
      createdAt = new Date(createdAt * 1000).toISOString();
    }

    return {
      id: String(orderId),
      marketplace: marketplace,
      status: status,
      statusLabel: STATUS_LABELS[status] || status,
      total: total,
      buyerName: buyerName,
      createdAt: createdAt,
      paymentMethod: row.payment_method || row.paymentMethod || '',
      itemNames: row.item_names || row.itemNames || ''
    };
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
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    var limited = sorted.slice(0, limit);

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

    return { order: found };
  }

  return { describe: describe, listUnified: listUnified, getDetail: getDetail };
})();
