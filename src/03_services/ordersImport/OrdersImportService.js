/**
 * OrdersImportService — importação de pedidos Shopee para Google Sheets via Tiops.
 * Regras completas em specs/orders-import.md.
 */
var OrdersImportService = (function () {
  function describe() {
    return {
      name: 'ordersImport',
      actions: {
        importShopeeOrders: {
          description: 'Busca pedidos Shopee via Tiops, verifica duplicatas por order_id, insere novos em Sheets.',
          params: {
            limit: { type: 'number', required: false, default: 100, description: 'Quantos pedidos buscar (máx 100)' },
            offset: { type: 'number', required: false, default: 0, description: 'Paginação — offset da última busca' }
          },
          returns: {
            success: 'boolean',
            imported: 'number',
            duplicates: 'number',
            errors: 'array',
            message: 'string'
          }
        }
      }
    };
  }

  function importShopeeOrders(params) {
    params = params || {};
    var limit = Math.min(params.limit || 100, 100);
    var offset = params.offset || 0;

    var response;
    try {
      response = TiopsClient.call('shopee_list_orders', {
        limit: limit,
        offset: offset
      });
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('TIOPS_API_KEY_MISSING') !== -1) {
        return { success: false, error: 'TIOPS_API_KEY_MISSING', message: 'Configure TIOPS_API_KEY em Script Properties.' };
      }
      return { success: false, error: 'TIOPS_CALL_FAILED', message: 'Tiops indisponível: ' + msg };
    }

    var orders = [];
    if (response && response.orders) {
      orders = response.orders;
    } else if (Array.isArray(response)) {
      orders = response;
    }

    if (!orders || orders.length === 0) {
      return {
        success: true,
        imported: 0,
        duplicates: 0,
        errors: [],
        message: 'Nenhum pedido novo encontrado.'
      };
    }

    var imported = 0;
    var duplicates = 0;
    var errors = [];

    for (var i = 0; i < orders.length; i++) {
      var order = orders[i];
      var orderId = String(order.order_id || '').trim();

      if (!orderId) {
        errors.push({ orderId: '(sem id)', reason: 'order_id vazio' });
        continue;
      }

      try {
        var existing = OrdersRepository.getByOrderId(orderId);
        if (existing) {
          duplicates++;
        } else {
          OrdersRepository.insertOrder(order);
          imported++;
        }
      } catch (e) {
        errors.push({ orderId: orderId, reason: e.message || 'Erro ao gravar' });
      }
    }

    var message = 'Importados ' + imported + ', ' + duplicates + ' duplicata' + (duplicates !== 1 ? 's' : '');
    if (errors.length > 0) {
      message += ' (' + errors.length + ' erro' + (errors.length !== 1 ? 's' : '') + ')';
    }

    return {
      success: true,
      imported: imported,
      duplicates: duplicates,
      errors: errors,
      message: message
    };
  }

  return {
    describe: describe,
    importShopeeOrders: importShopeeOrders
  };
})();
