/**
 * OrdersService — pedidos normalizados lidos da aba PEDIDOS do Google Sheets.
 * Regras completas em specs/orders.md.
 */
var OrdersService = (function () {
  var SHEET_NAME = 'Pedidos';
  var HEADERS = ['id', 'marketplace', 'status', 'total', 'buyerName', 'createdAt'];

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

  function listUnified(params) {
    var marketplace = params.marketplace || 'all';
    var limit = params.limit || 20;

    var rows = SheetsRepository.getRows(SHEET_NAME);
    var filtered = rows.filter(function (row) {
      if (marketplace === 'all') return true;
      return row.marketplace === marketplace;
    });

    var sorted = filtered.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    var limited = sorted.slice(0, limit);

    var orders = limited.map(function (row) {
      return {
        id: String(row.id),
        marketplace: row.marketplace,
        status: row.status,
        total: Number(row.total) || 0,
        buyerName: row.buyerName || '',
        createdAt: row.createdAt || ''
      };
    });

    return { orders: orders };
  }

  function getDetail(params) {
    var rows = SheetsRepository.getRows(SHEET_NAME);
    var found = rows.filter(function (row) {
      return String(row.id) === String(params.orderId) && row.marketplace === params.marketplace;
    })[0];

    if (!found) {
      return { error: 'Pedido não encontrado: ' + params.orderId };
    }

    return {
      order: {
        id: String(found.id),
        marketplace: found.marketplace,
        status: found.status,
        total: Number(found.total) || 0,
        buyerName: found.buyerName || '',
        createdAt: found.createdAt || ''
      }
    };
  }

  return { describe: describe, listUnified: listUnified, getDetail: getDetail };
})();
