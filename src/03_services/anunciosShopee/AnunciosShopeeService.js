/**
 * AnunciosShopeeService — ações de sustentação do pareamento de SKU e da aba
 * ANUNCIOS_SHOPEE (fonte de item_sku p/ pedidos). A página "Anúncios Shopee"
 * foi removida em 10/08/2026 (decisão do usuário); restam apenas:
 *   - syncListings: sincroniza todos os anúncios (batch 100) e grava em Sheets
 *                    (passo da cadeia "Sincronizar Tudo" do Dashboard e botão
 *                    "Sincronizar anúncios" do Parear SKU; recria a aba
 *                    ANUNCIOS_SHOPEE se ausente — por design)
 *   - updateSku: grava o item_sku na Shopee e CONFIRMA por releitura
 *               (usado pelo pareamento e pelo sentinela SEM_ESTOQUE)
 *
 * Contratos confirmados em docs/referencia/CONTRATOS_CONFIRMADOS.md:
 *   - shopee_list_items: page_size + offset -> response.item[]
 *   - shopee_get_items_batch: item_id_list[] -> response.item_list[] (lote)
 *   - shopee_get_item: item_id -> response.item_list[0] (releitura)
 *   - shopee_update_item: item_id (uint64 NUMBER) + item_sku
 *   - shopee_sales_by_item: item_id + period -> total_orders/total_quantity
 */
var AnunciosShopeeService = (function () {
  var PAGE_SIZE = 100; // máx. itens por chamada list_items / batch
  var CONFIRM_DELAY_MS = 500; // releitura obrigatória pós-update
  var PERIODO_PADRAO = '30d';

  function describe() {
    return {
      name: 'anunciosShopee',
      actions: {
        syncListings: {
          description: 'Sincroniza todos os anúncios Shopee via TIOPS, atualiza a aba ANUNCIOS_SHOPEE (upsert + históricos + performance) e invalida cache.',
          params: {
            forceFresh: { type: 'boolean', required: false, default: false },
            categoria: { type: 'string', required: false }
          },
          returns: {
            success: 'boolean',
            synced: 'object',
            resumo: 'object',
            errors: 'array'
          }
        },
        updateSku: {
          description: 'Grava o item_sku de um anúncio na Shopee e confirma por releitura antes de gravar em Sheets. Suporta o sentinela SEM_ESTOQUE (item sem controle de estoque unitário).',
          params: {
            itemId: { type: 'string', required: true },
            sku: { type: 'string', required: true }
          },
          returns: {
            success: 'boolean',
            itemId: 'string',
            sku: 'string',
            motivo: 'string (quando falha)'
          }
        }
      }
    };
  }

  // ─── helpers de infra ─────────────────────────────────────────────
  function callTiops_(action, params) {
    try {
      return TiopsClient.call(action, params);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('TIOPS_API_KEY_MISSING') !== -1) throw new Error('TIOPS_API_KEY_MISSING');
      throw new Error('TIOPS_CALL_FAILED: ' + msg);
    }
  }

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  function getShopId_() {
    return ConfigService.getAccountId('shopee');
  }

  function num_(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function round2_(v) {
    return Math.round(num_(v) * 100) / 100;
  }

  /** Epoch (s ou ms) -> dd/MM/yyyy HH:mm:ss. Aceita strings numéricas. */
  function fmtEpochBR_(epoch) {
    if (epoch === undefined || epoch === null || epoch === '') return '';
    var n = num_(epoch);
    if (n <= 0) return '';
    var d = new Date(n > 1e12 ? n : n * 1000);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  /** NORMAL->ativo, UNLIST->pausado, BANNED/DELETED->deletado; fallback: lowercase. */
  function mapStatus_(status) {
    var s = String(status || '').toUpperCase();
    if (s === 'NORMAL') return 'ativo';
    if (s === 'UNLIST') return 'pausado';
    if (s === 'BANNED' || s === 'DELETED') return 'deletado';
    return String(status || 'ativo').toLowerCase();
  }

  function chunk_(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // ─── fetch Tiops ──────────────────────────────────────────────────
  function listItemIds_(shopId, errors) {
    var ids = [];
    var offset = 0;
    var hasMore = true;
    var guard = 0;
    while (hasMore && guard < 50) {
      guard++;
      var result = callTiops_('shopee_list_items', { page_size: PAGE_SIZE, offset: offset, shopId: shopId });
      var items = (result && result.response && result.response.item) || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it && it.item_id !== undefined && it.item_id !== null) ids.push(String(it.item_id));
      }
      var resp = (result && result.response) || {};
      var totalCount = num_(resp.total_count);
      var hasNext = !!(resp.has_next_page);
      var nextOffset = num_(resp.next_offset);
      if (ids.length >= totalCount || !hasNext || items.length === 0) break;
      offset = nextOffset > 0 ? nextOffset : offset + items.length;
    }
    return ids;
  }

  /** Detalhes em lote (max 100 por chamada) — payload idêntico ao get_item. */
  function fetchItemsBatch_(shopId, ids) {
    var rows = [];
    var batches = chunk_(ids, PAGE_SIZE);
    for (var b = 0; b < batches.length; b++) {
      var result = callTiops_('shopee_get_items_batch', { item_id_list: batches[b], shopId: shopId });
      var list = (result && result.response && result.response.item_list) || [];
      for (var i = 0; i < list.length; i++) rows.push(list[i]);
    }
    return rows;
  }

  /** Batch fetchSales via callBatch + UrlFetchApp.fetchAll. Retorna mapa itemId → {total_orders, total_quantity, total_revenue}. */
  function fetchSalesBatch_(shopId, itemIds) {
    var defaultSales = { total_orders: 0, total_quantity: 0, total_revenue: 0 };
    var map = {};
    var batches = chunk_(itemIds, PAGE_SIZE);
    for (var b = 0; b < batches.length; b++) {
      var batch = batches[b];
      var items = batch.map(function (id) {
        return { action: 'shopee_sales_by_item', params: { item_id: id, period: PERIODO_PADRAO, shopId: shopId } };
      });
      var results = TiopsClient.callBatch(items);
      for (var i = 0; i < results.length; i++) {
        var itemId = batch[i];
        var r = results[i];
        if (r.error) {
          logSalesFailure_(itemId, new Error(r.error));
          map[itemId] = { total_orders: 0, total_quantity: 0, total_revenue: 0 };
        } else {
          var resp = r.data;
          if (resp && resp.response) resp = resp.response;
          if (resp && resp.data) resp = resp.data;
          if (!resp || typeof resp !== 'object') {
            map[itemId] = { total_orders: 0, total_quantity: 0, total_revenue: 0 };
          } else {
            map[itemId] = {
              total_orders: num_(resp.total_orders),
              total_quantity: num_(resp.total_quantity),
              total_revenue: num_(resp.total_revenue)
            };
          }
        }
      }
    }
    return map;
  }

  /** Loga falha no sales_by_item (evita zero 'fantasma' sem rastro). */
  function logSalesFailure_(itemId, error) {
    try {
      LoggingService.log({
        service: 'anunciosShopee',
        action: 'fetchSales',
        status: 'ERROR',
        caller: 'AnunciosShopeeService.fetchSalesBatch_',
        summary: 'shopee_sales_by_item falhou para o item ' + itemId,
        errorMessage: (error && error.message) ? error.message : String(error)
      });
    } catch (logErr) {
      console.error('[AnunciosShopee] Falha ao logar erro de vendas: ' + (logErr.message || logErr));
    }
  }

  // ─── mapeamento de dados ──────────────────────────────────────────
  function getFirstImageUrl_(item) {
    try {
      var list = item.image && item.image.image_url_list;
      return (list && list.length > 0) ? String(list[0]) : '';
    } catch (e) {
      return '';
    }
  }

  function getPriceInfo_(item) {
    try {
      var pi = (item.price_info && item.price_info[0]) || {};
      return {
        currency: pi.currency || 'BRL',
        original_price: round2_(pi.original_price),
        current_price: round2_(pi.current_price)
      };
    } catch (e) {
      return { currency: 'BRL', original_price: 0, current_price: 0 };
    }
  }

  function getTotalStock_(item) {
    try {
      return num_(item.stock_info_v2.summary_info.total_available_stock);
    } catch (e) {
      return 0;
    }
  }

  /** Item Shopee (payload de get_item/get_items_batch) -> linha da aba master. */
  function buildItemRow_(item) {
    var price = getPriceInfo_(item);
    var hasModel = !!(item.has_model);
    var sku = getSellerSku_(item);
    return {
      ITEM_ID: String(item.item_id),
      SKU: sku,
      NOME: item.item_name || '',
      CATEGORIA: item.category_id !== undefined && item.category_id !== null ? String(item.category_id) : '',
      PRECO: price.current_price,
      ESTOQUE: getTotalStock_(item),
      STATUS: mapStatus_(item.item_status),
      DATA_CRIACAO: fmtEpochBR_(item.create_time),
      DATA_ATUALIZACAO: fmtEpochBR_(item.update_time),
      IMAGEM_URL: getFirstImageUrl_(item),
      LINK_SHOPEE: item.item_url || '',
      VENDAS_30D: num_(item.sales_30d),
      AVALIACAO: num_(item.rating_star),
      NUM_COMENTARIOS: num_(item.cmt_count),
      TIPO_VARIACAO: hasModel ? '1_nivel' : 'sem_variacao',
      ORIGINAL_PRICE: price.original_price,
      MOEDA: price.currency || 'BRL',
      ATIVO_OUTLET: false,
      DADOS_JSON: JSON.stringify(item),
      DATA_SINCRONIZACAO: nowBR_()
    };
  }

  function getSellerSku_(item) {
    try {
      if (item.tier_variations && item.tier_variations.length > 0) {
        var firstTier = item.tier_variations[0];
        if (firstTier.options && firstTier.options.length > 0) {
          return firstTier.options[0];
        }
      }
      if (item.model) {
        return item.model.seller_sku || '';
      }
      if (item.item_sku) {
        return item.item_sku;
      }
      if (item.seller_sku) {
        return item.seller_sku;
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function buildResumo_(rows) {
    var ativos = 0;
    var pausados = 0;
    var estoque = 0;
    var vendas = 0;
    var avaliacoes = 0;
    var comAvaliacao = 0;
    for (var i = 0; i < rows.length; i++) {
      var s = String(rows[i].STATUS || '');
      if (s === 'ativo') ativos++;
      if (s === 'pausado') pausados++;
      estoque += num_(rows[i].ESTOQUE);
      vendas += num_(rows[i].VENDAS_30D);
      var nota = num_(rows[i].AVALIACAO);
      if (nota > 0) {
        avaliacoes += nota;
        comAvaliacao++;
      }
    }
    return {
      totalAtivos: ativos,
      totalPausados: pausados,
      estoqueTotal: estoque,
      vendasPeriodo: vendas,
      avaliacaoMedia: comAvaliacao > 0 ? round2_(avaliacoes / comAvaliacao) : 0
    };
  }

  // ─── syncListings ─────────────────────────────────────────────────
  function syncListings(params) {
    params = params || {};
    var errors = [];
    var sheetId = ConfigService.getSheetId();
    var shopId;
    try {
      shopId = getShopId_();
    } catch (e) {
      return { success: false, synced: {}, resumo: {}, errors: ['TIOPS_CALL_FAILED: ' + e.message] };
    }

    var items = [];
    try {
      var ids = listItemIds_(shopId, errors);
      var rawItems = fetchItemsBatch_(shopId, ids);

      var rows = [];
      for (var i = 0; i < rawItems.length; i++) {
        var row = buildItemRow_(rawItems[i]);
        if (params.categoria) {
          var cat = String(row.CATEGORIA).toLowerCase();
          if (cat.indexOf(String(params.categoria).toLowerCase()) === -1) continue;
        }
        rows.push(row);
      }

      // vendas 30d por item — batch via callBatch (paralelo)
      var salesMap = fetchSalesBatch_(shopId, rows.map(function (r) { return r.ITEM_ID; }));
      for (var j = 0; j < rows.length; j++) {
        var sales = salesMap[rows[j].ITEM_ID] || { total_orders: 0, total_quantity: 0, total_revenue: 0 };
        rows[j].VENDAS_30D = sales.total_quantity;
      }

      items = rows;
    } catch (e) {
      errors.push('SYNC_FETCH_FAILED: ' + e.message);
    }

    var resumo = buildResumo_(items);
    var deletados = 0;
    for (var d = 0; d < items.length; d++) {
      if (items[d].STATUS === 'deletado') deletados++;
    }
    var timestamp = nowBR_();
    var synced = {
      itemsAtualizados: 0,
      novosCriados: 0,
      pausados: resumo.totalPausados,
      deletados: deletados,
      timestamp: timestamp
    };

    if (items.length > 0) {
      try {
        // registra mudanças de preço/estoque vs. linha anterior antes do upsert
        logDiffsFromSync_(sheetId, items);

        var result = AnunciosShopeeRepository.syncMain(sheetId, items);
        synced.itemsAtualizados = result.atualizados;
        synced.novosCriados = result.novos;
        if (result.errors.length > 0) {
          for (var k = 0; k < result.errors.length; k++) errors.push('SHEETS_WRITE_FAILED: ' + result.errors[k].error);
        }
        AnunciosShopeeRepository.writePerformance(sheetId, {
          periodo: PERIODO_PADRAO,
          totalAnunciosAtivos: resumo.totalAtivos,
          totalEstoque: resumo.estoqueTotal,
          vendasTotal: resumo.vendasPeriodo,
          pedidosTotal: 0,
          avaliacaoMedia: resumo.avaliacaoMedia,
          comentariosTotal: 0,
          visitasTotal: 0,
          taxaConversao: 0,
          dataSincronizacao: timestamp
        });
      } catch (e) {
        errors.push('SHEETS_WRITE_FAILED: ' + e.message);
      }
    } else {
      errors.push('SYNC_NO_ITEMS');
    }

    return {
      success: errors.length === 0,
      synced: synced,
      resumo: resumo,
      errors: errors
    };
  }

  /** Compara novos vs. linhas atuais e loga mudanças de preço/estoque. */
  function logDiffsFromSync_(sheetId, newRows) {
    var oldRows = AnunciosShopeeRepository.getAll(sheetId);
    var oldMap = {};
    for (var i = 0; i < oldRows.length; i++) {
      oldMap[String(oldRows[i].ITEM_ID || '').trim()] = oldRows[i];
    }
    for (var j = 0; j < newRows.length; j++) {
      var row = newRows[j];
      var old = oldMap[String(row.ITEM_ID).trim()];
      if (!old) continue;
      var oldPrice = num_(old.PRECO);
      var newPrice = num_(row.PRECO);
      if (oldPrice !== newPrice && newPrice > 0) {
        AnunciosShopeeRepository.logPrecoChange(sheetId, {
          ITEM_ID: row.ITEM_ID,
          NOME_ITEM: row.NOME,
          PRECO_ANTIGO: oldPrice,
          PRECO_NOVO: newPrice,
          DATA_MUDANCA: nowBR_(),
          USUARIO: 'Sistema',
          REFERENCIA: 'sync'
        });
      }
      var oldStock = num_(old.ESTOQUE);
      var newStock = num_(row.ESTOQUE);
      if (oldStock !== newStock) {
        AnunciosShopeeRepository.logEstoqueChange(sheetId, {
          ITEM_ID: row.ITEM_ID,
          NOME_ITEM: row.NOME,
          ESTOQUE_ANTIGO: oldStock,
          ESTOQUE_NOVO: newStock,
          MUDANCA: newStock - oldStock,
          DATA_MUDANCA: nowBR_(),
          MOTIVO: 'Venda',
          REFERENCIA: 'sync'
        });
      }
    }
  }

  // ─── updateSku ─────────────────────────────────────────────────────
  function updateSku(params) {
    params = params || {};
    var itemId = String(params.itemId || '').trim();
    var sku = String(params.sku || '').trim();
    if (!itemId) return { success: false, motivo: 'PARAM_REQUIRED: itemId' };
    if (!sku) return { success: false, motivo: 'PARAM_REQUIRED: sku' };
    var shopId = getShopId_();
    var sheetId = ConfigService.getSheetId();

    // Contrato confirmado 10/08/2026: item_id precisa ser number (uint64) —
    // string é rejeitado pela Tiops neste endpoint (diferente de price/stock).
    var result = callTiops_('shopee_update_item', {
      item_id: Number(itemId),
      item_sku: sku,
      shopId: shopId
    });

    // releitura obrigatória (500ms) — nunca confiar na resposta do update
    Utilities.sleep(CONFIRM_DELAY_MS);
    var fresh = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
    var freshItem = (fresh.response && fresh.response.item_list && fresh.response.item_list[0]) || null;
    var confirmedSku = freshItem ? String(freshItem.item_sku || '').trim() : '';

    if (!freshItem || confirmedSku !== sku) {
      return { success: false, motivo: 'Falha ao confirmar mudança. Tente novamente.' };
    }

    AnunciosShopeeRepository.patchMain(sheetId, itemId, {
      SKU: confirmedSku,
      DADOS_JSON: JSON.stringify(freshItem),
      DATA_SINCRONIZACAO: nowBR_()
    });
    return { success: true, itemId: itemId, sku: confirmedSku };
  }

  return {
    describe: describe,
    syncListings: syncListings,
    updateSku: updateSku,
    // helpers expostos para smoke tests
    mapStatus_: mapStatus_,
    buildItemRow_: buildItemRow_,
    nowBR_: nowBR_
  };
})();