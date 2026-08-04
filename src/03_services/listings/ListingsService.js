/**
 * ListingsService — anúncios lidos da aba ANUNCIOS do Google Sheets.
 * Regras completas em specs/listings.md.
 */
var ListingsService = (function () {
  var SHEET_NAME = 'Anuncios';
  var HEADERS = ['id', 'marketplace', 'title', 'price', 'stock', 'status'];

  function describe() {
    return {
      name: 'listings',
      actions: {
        listUnified: {
          description: 'Lista anúncios de ML e/ou Shopee normalizados num formato comum.',
          params: {
            marketplace: { type: 'string', required: false, default: 'all', enum: ['all', 'shopee', 'mercado_livre'] }
          },
          returns: { listings: 'array' }
        },
        getDetail: {
          description: 'Detalhe de um anúncio específico.',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { listing: 'object' }
        },
        pause: {
          description: 'Pausa um anúncio (atualiza status na planilha).',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { success: 'boolean' }
        },
        activate: {
          description: 'Reativa um anúncio pausado (atualiza status na planilha).',
          params: {
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'] },
            itemId: { type: 'string', required: true }
          },
          returns: { success: 'boolean' }
        }
      }
    };
  }

  function listUnified(params) {
    var marketplace = params.marketplace || 'all';

    var rows = SheetsRepository.getRows(SHEET_NAME);
    var filtered = rows.filter(function (row) {
      if (marketplace === 'all') return true;
      return row.marketplace === marketplace;
    });

    var listings = filtered.map(function (row) {
      return {
        id: String(row.id),
        marketplace: row.marketplace,
        title: row.title || '',
        price: Number(row.price) || 0,
        stock: Number(row.stock) || 0,
        status: row.status || 'active'
      };
    });

    return { listings: listings };
  }

  function getDetail(params) {
    var rows = SheetsRepository.getRows(SHEET_NAME);
    var found = rows.filter(function (row) {
      return String(row.id) === String(params.itemId) && row.marketplace === params.marketplace;
    })[0];

    if (!found) {
      return { error: 'Anúncio não encontrado: ' + params.itemId };
    }

    return {
      listing: {
        id: String(found.id),
        marketplace: found.marketplace,
        title: found.title || '',
        price: Number(found.price) || 0,
        stock: Number(found.stock) || 0,
        status: found.status || 'active'
      }
    };
  }

  function pause(params) {
    return updateStatus_(params, 'paused');
  }

  function activate(params) {
    return updateStatus_(params, 'active');
  }

  function updateStatus_(params, newStatus) {
    var rows = SheetsRepository.getRows(SHEET_NAME);
    var headers = Object.keys(rows[0] || {});
    var idCol = headers.indexOf('id');
    var mpCol = headers.indexOf('marketplace');
    var statusCol = headers.indexOf('status');

    var sheet = SheetsRepository.getOrCreateSheet(SHEET_NAME);
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(params.itemId) && values[i][mpCol] === params.marketplace) {
        sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
        SheetsRepository.invalidateRowsCache(SHEET_NAME);
        return getDetail(params);
      }
    }

    return { error: 'Anúncio não encontrado para atualizar: ' + params.itemId };
  }

  return {
    describe: describe,
    listUnified: listUnified,
    getDetail: getDetail,
    pause: pause,
    activate: activate
  };
})();
