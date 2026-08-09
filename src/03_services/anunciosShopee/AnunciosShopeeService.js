/**
 * AnunciosShopeeService — Gestão de anúncios da loja Shopee via Tiops:
 *   - syncListings: sincroniza todos os anúncios (batch 100) e grava em Sheets
 *   - getListings: leitura cacheada (TTL 30min) para a UI
 *   - getItemDetail: detalhes completos de um item (+ SKUs + vendas 30d)
 *   - updatePrice / updateStock: escreve na Shopee e CONFIRMA por releitura
 *   - pauseItem / activateItem / deleteItem: controle de status (unlist)
 *   - getSalesMetrics / getSKUs: métricas e variações
 *
 * Contratos confirmados em docs/referencia/CONTRATOS_CONFIRMADOS.md (2026-08-05):
 *   - shopee_list_items: page_size + offset -> response.item[]
 *   - shopee_get_items_batch: item_id_list[] -> response.item_list[] (lote)
 *   - shopee_get_item: item_id -> response.item_list[0]
 *   - shopee_get_models: item_id -> response.model[] (vazio sem variação)
 *   - shopee_update_price: price_list [{model_id, original_price, price}]
 *   - shopee_update_stock: stock_list [{model_id, seller_stock [{location_id:"BRZ", stock}]}]
 *   - shopee_unlist_item: item_id + unlist (true=pausar, false=ativar)
 *   - shopee_delete_item: item_id (IRREVERSÍVEL)
 *   - shopee_sales_by_item: item_id + period -> total_orders/total_quantity
 *
 * Regras de negócio documentadas no código abaixo.
 */
var AnunciosShopeeService = (function () {
  var CACHE_KEY = 'anuncios_shopee_listings';
  var CACHE_TTL_SECONDS = 1800; // 30 min
  var PAGE_SIZE = 100; // máx. itens por chamada list_items / batch
  var CONFIRM_DELAY_MS = 500; // releitura obrigatória pós-update
  var PERIODO_PADRAO = '30d';

  function describe() {
    return {
      name: 'anunciosShopee',
      actions: {
        syncListings: {
          description: 'Sincroniza todos os anúncios Shopee via TIOPS, atualiza abas ANUNCIOS_* (upsert + históricos + performance) e invalida cache.',
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
        getListings: {
          description: 'Lista de anúncios (cache 30min; senão, lê do Sheets).',
          params: {
            fromCache: { type: 'boolean', required: false, default: true }
          },
          returns: {
            lista: 'array',
            resumo: 'object',
            atualizadoEm: 'string',
            fromCache: 'boolean'
          }
        },
        getItemDetail: {
          description: 'Detalhes completos de um item: base, variações (SKUs) e vendas 30d.',
          params: {
            itemId: { type: 'string', required: true }
          },
          returns: 'object'
        },
        updatePrice: {
          description: 'Atualiza preço de um ou mais itens. Confirma por releitura antes de gravar em Sheets.',
          params: {
            itemIds: { type: 'array', required: true },
            priceList: { type: 'array', required: true, description: '[{itemId, preco}] ou [{itemId, variacoes:[{modelId, preco}]}]' }
          },
          returns: {
            success: 'boolean',
            atualizado: 'number',
            falhas: 'array'
          }
        },
        updateStock: {
          description: 'Atualiza estoque de um ou mais itens. Confirma por releitura antes de gravar em Sheets.',
          params: {
            itemIds: { type: 'array', required: true },
            stockList: { type: 'array', required: true, description: '[{itemId, quantidade}] ou [{itemId, modelos:[{modelId, quantidade}]}]' }
          },
          returns: {
            success: 'boolean',
            atualizado: 'number',
            falhas: 'array'
          }
        },
        pauseItem: {
          description: 'Pausa um anúncio (unlist=true) e confirma por releitura.',
          params: {
            itemId: { type: 'string', required: true }
          },
          returns: {
            success: 'boolean',
            itemId: 'string',
            novoStatus: 'string'
          }
        },
        activateItem: {
          description: 'Ativa um anúncio pausado (unlist=false) e confirma por releitura.',
          params: {
            itemId: { type: 'string', required: true }
          },
          returns: {
            success: 'boolean',
            itemId: 'string',
            novoStatus: 'string'
          }
        },
        deleteItem: {
          description: 'Deleta um anúncio (IRREVERSÍVEL). Marca STATUS=deletado após confirmação.',
          params: {
            itemId: { type: 'string', required: true }
          },
          returns: {
            success: 'boolean',
            itemId: 'string',
            novoStatus: 'string'
          }
        },
        getSalesMetrics: {
          description: 'Métricas de vendas de um item (periodo) ou agregado de todos.',
          params: {
            itemId: { type: 'string', required: false },
            periodo: { type: 'string', required: false, default: '30d' }
          },
          returns: 'object'
        },
        getSKUs: {
          description: 'Lista SKUs de variação de um item.',
          params: {
            itemId: { type: 'string', required: true }
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

  function fetchSales_(shopId, itemId) {
    try {
      var result = callTiops_('shopee_sales_by_item', { item_id: itemId, period: PERIODO_PADRAO, shopId: shopId });
      var resp = result;
      if (resp && resp.response) resp = resp.response;
      if (resp && resp.data) resp = resp.data;
      if (!resp || typeof resp !== 'object') {
        return { total_orders: 0, total_quantity: 0, total_revenue: 0 };
      }
      return {
        total_orders: num_(resp.total_orders),
        total_quantity: num_(resp.total_quantity),
        total_revenue: num_(resp.total_revenue)
      };
    } catch (e) {
      logSalesFailure_(itemId, e);
      return { total_orders: 0, total_quantity: 0, total_revenue: 0 };
    }
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
        caller: 'AnunciosShopeeService.fetchSales_',
        summary: 'shopee_sales_by_item falhou para o item ' + itemId,
        errorMessage: (error && error.message) ? error.message : String(error)
      });
    } catch (logErr) {
      console.error('[AnunciosShopee] Falha ao logar erro de vendas: ' + (logErr.message || logErr));
    }
  }

  function fetchModels_(shopId, itemId) {
    try {
      var result = callTiops_('shopee_get_models', { item_id: itemId, shopId: shopId });
      var resp = result && result.response ? result.response : result;
      return (resp && resp.model) || [];
    } catch (e) {
      return [];
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

  function getModelStock_(model) {
    try {
      return num_(model.stock_info_v2.summary_info.total_available_stock);
    } catch (e) {
      return 0;
    }
  }

  function getBrandName_(item) {
    try {
      return (item.brand && item.brand.original_brand_name) ? String(item.brand.original_brand_name) : '';
    } catch (e) {
      return '';
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

    if (errors.length === 0) CacheRepository.remove(CACHE_KEY);

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

  // ─── getListings (cache 30min) ────────────────────────────────────
  function getListings(params) {
    params = params || {};
    var fromCache = params.fromCache !== false;

    if (fromCache) {
      var cached = CacheRepository.get(CACHE_KEY);
      if (cached && cached.lista) return cached;
    }

    var sheetId = ConfigService.getSheetId();
    var rows = AnunciosShopeeRepository.getAllSlim(sheetId);
    var resumo = buildResumo_(rows);
    var perf = AnunciosShopeeRepository.getPerformance(sheetId);
    var data = {
      lista: rows,
      resumo: resumo,
      atualizadoEm: (perf && perf.DATA_SINCRONIZACAO) || '',
      fromCache: false
    };
    if (rows.length > 0) {
      try {
        CacheRepository.set(CACHE_KEY, { lista: rows, resumo: resumo, atualizadoEm: data.atualizadoEm, fromCache: true }, CACHE_TTL_SECONDS);
      } catch (e) {
        console.warn('[AnunciosShopeeService] Falha ao gravar cache — entregando direto do Sheets: ' + e.message);
      }
    }
    return data;
  }

  // ─── getItemDetail ────────────────────────────────────────────────
  function getItemDetail(params) {
    params = params || {};
    var itemId = String(params.itemId || '').trim();
    if (!itemId) throw new Error('PARAM_REQUIRED: itemId');
    var shopId = getShopId_();

    var result = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
    var item = (result && result.response && result.response.item_list && result.response.item_list[0]) || null;
    if (!item) throw new Error('ITEM_NOT_FOUND: ' + itemId);

    var base = buildItemRow_(item);
    var sales = fetchSales_(shopId, itemId);
    var models = fetchModels_(shopId, itemId);

    var skus = [];
    var nivel = 'sem_variacao';
    if (models.length > 0) {
      nivel = '1_nivel';
      for (var i = 0; i < models.length; i++) {
        skus.push({
          modelId: String(models[i].model_id),
          nomeSKU: models[i].model_name || '',
          preco: round2_(models[i].normal_price),
          estoque: getModelStock_(models[i])
        });
      }
    }

    base.VENDAS_30D = sales.total_quantity;
    base.TIPO_VARIACAO = nivel;

    return {
      itemId: itemId,
      base: base,
      skus: skus,
      vendas: {
        pedidos: sales.total_orders,
        quantidade: sales.total_quantity,
        receita: round2_(sales.total_revenue)
      }
    };
  }

  // ─── updatePrice / updateStock ────────────────────────────────────
  function updatePrice(params) {
    params = params || {};
    var priceList = params.priceList || [];
    if (priceList.length === 0) throw new Error('PARAM_REQUIRED: priceList');
    var shopId = getShopId_();
    var sheetId = ConfigService.getSheetId();
    var atualizado = 0;
    var falhas = [];

    for (var i = 0; i < priceList.length; i++) {
      var entry = priceList[i];
      var itemId = String(entry.itemId || '').trim();
      if (!itemId) continue;
      try {
        var result = updateSinglePrice_(shopId, sheetId, itemId, entry);
        if (result.success) atualizado++;
        else falhas.push({ itemId: itemId, motivo: result.motivo });
      } catch (e) {
        falhas.push({ itemId: itemId, motivo: e.message });
      }
    }

    if (falhas.length === 0) CacheRepository.remove(CACHE_KEY);
    return { success: falhas.length === 0, atualizado: atualizado, falhas: falhas };
  }

  function updateSinglePrice_(shopId, sheetId, itemId, entry) {
    var oldRow = AnunciosShopeeRepository.getItem(sheetId, itemId);
    var oldPrice = oldRow ? num_(oldRow.PRECO) : 0;
    var nome = oldRow ? String(oldRow.NOME || '') : '';

    var priceList;
    if (entry.variacoes && entry.variacoes.length > 0) {
      priceList = [];
      for (var v = 0; v < entry.variacoes.length; v++) {
        priceList.push({
          model_id: num_(entry.variacoes[v].modelId),
          original_price: oldPrice,
          price: num_(entry.variacoes[v].preco)
        });
      }
    } else {
      priceList = [{ model_id: 0, original_price: oldPrice, price: num_(entry.preco) }];
    }

    var result = callTiops_('shopee_update_price', {
      item_id: itemId,
      price_list: priceList,
      shopId: shopId
    });

    // releitura obrigatória (500ms) — nunca confiar na resposta do update
    Utilities.sleep(CONFIRM_DELAY_MS);
    var fresh = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
    var freshItem = (fresh.response && fresh.response.item_list && fresh.response.item_list[0]) || null;
    var confirmedPrice = freshItem ? getPriceInfo_(freshItem).current_price : -1;
    var expected = priceList.length > 0 ? priceList[0].price : num_(entry.preco);

    if (confirmedPrice < 0 || Math.abs(confirmedPrice - expected) > 0.009) {
      return { success: false, motivo: 'Falha ao confirmar mudança. Tente novamente.' };
    }

    AnunciosShopeeRepository.patchMain(sheetId, itemId, {
      PRECO: confirmedPrice,
      ORIGINAL_PRICE: getPriceInfo_(freshItem).original_price,
      DADOS_JSON: JSON.stringify(freshItem),
      DATA_SINCRONIZACAO: nowBR_()
    });
    AnunciosShopeeRepository.logPrecoChange(sheetId, {
      ITEM_ID: itemId,
      NOME_ITEM: nome,
      PRECO_ANTIGO: oldPrice,
      PRECO_NOVO: confirmedPrice,
      DATA_MUDANCA: nowBR_(),
      USUARIO: 'Manual',
      REFERENCIA: 'manual'
    });
    return { success: true };
  }

  function updateStock(params) {
    params = params || {};
    var stockList = params.stockList || [];
    if (stockList.length === 0) throw new Error('PARAM_REQUIRED: stockList');
    var shopId = getShopId_();
    var sheetId = ConfigService.getSheetId();
    var atualizado = 0;
    var falhas = [];

    for (var i = 0; i < stockList.length; i++) {
      var entry = stockList[i];
      var itemId = String(entry.itemId || '').trim();
      if (!itemId) continue;
      try {
        var result = updateSingleStock_(shopId, sheetId, itemId, entry);
        if (result.success) atualizado++;
        else falhas.push({ itemId: itemId, motivo: result.motivo });
      } catch (e) {
        falhas.push({ itemId: itemId, motivo: e.message });
      }
    }

    if (falhas.length === 0) CacheRepository.remove(CACHE_KEY);
    return { success: falhas.length === 0, atualizado: atualizado, falhas: falhas };
  }

  function updateSingleStock_(shopId, sheetId, itemId, entry) {
    var oldRow = AnunciosShopeeRepository.getItem(sheetId, itemId);
    var oldStock = oldRow ? num_(oldRow.ESTOQUE) : 0;
    var nome = oldRow ? String(oldRow.NOME || '') : '';

    var stockList;
    if (entry.modelos && entry.modelos.length > 0) {
      stockList = [];
      for (var m = 0; m < entry.modelos.length; m++) {
        stockList.push({
          model_id: num_(entry.modelos[m].modelId),
          seller_stock: [{ location_id: 'BRZ', stock: num_(entry.modelos[m].quantidade) }]
        });
      }
    } else {
      stockList = [{
        model_id: 0,
        seller_stock: [{ location_id: 'BRZ', stock: num_(entry.quantidade) }]
      }];
    }

    var result = callTiops_('shopee_update_stock', {
      item_id: itemId,
      stock_list: stockList,
      shopId: shopId
    });

    Utilities.sleep(CONFIRM_DELAY_MS);
    var fresh = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
    var freshItem = (fresh.response && fresh.response.item_list && fresh.response.item_list[0]) || null;
    var confirmedStock = freshItem ? getTotalStock_(freshItem) : -1;
    var expected = stockList[0].seller_stock[0].stock;

    if (confirmedStock < 0 || confirmedStock !== expected) {
      return { success: false, motivo: 'Falha ao confirmar mudança. Tente novamente.' };
    }

    AnunciosShopeeRepository.patchMain(sheetId, itemId, {
      ESTOQUE: confirmedStock,
      DADOS_JSON: JSON.stringify(freshItem),
      DATA_SINCRONIZACAO: nowBR_()
    });
    AnunciosShopeeRepository.logEstoqueChange(sheetId, {
      ITEM_ID: itemId,
      NOME_ITEM: nome,
      ESTOQUE_ANTIGO: oldStock,
      ESTOQUE_NOVO: confirmedStock,
      MUDANCA: confirmedStock - oldStock,
      DATA_MUDANCA: nowBR_(),
      MOTIVO: 'Ajuste Manual',
      REFERENCIA: 'manual'
    });
    return { success: true };
  }

  // ─── pause / activate / delete ────────────────────────────────────
  function setUnlistStatus_(itemId, unlist) {
    var shopId = getShopId_();
    var sheetId = ConfigService.getSheetId();
    var target = unlist ? 'pausado' : 'ativo';

    callTiops_('shopee_unlist_item', { item_id: itemId, unlist: unlist, shopId: shopId });

    // releitura obrigatória
    Utilities.sleep(CONFIRM_DELAY_MS);
    var fresh = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
    var freshItem = (fresh.response && fresh.response.item_list && fresh.response.item_list[0]) || null;
    var confirmedStatus = freshItem ? mapStatus_(freshItem.item_status) : '';

    if (confirmedStatus !== target) {
      throw new Error('Falha ao confirmar mudança. Tente novamente.');
    }

    AnunciosShopeeRepository.patchMain(sheetId, itemId, {
      STATUS: confirmedStatus,
      DADOS_JSON: JSON.stringify(freshItem),
      DATA_SINCRONIZACAO: nowBR_()
    });
    CacheRepository.remove(CACHE_KEY);
    return { success: true, itemId: itemId, novoStatus: confirmedStatus };
  }

  function pauseItem(params) {
    var itemId = String((params || {}).itemId || '').trim();
    if (!itemId) throw new Error('PARAM_REQUIRED: itemId');
    return setUnlistStatus_(itemId, true);
  }

  function activateItem(params) {
    var itemId = String((params || {}).itemId || '').trim();
    if (!itemId) throw new Error('PARAM_REQUIRED: itemId');
    return setUnlistStatus_(itemId, false);
  }

  function deleteItem(params) {
    var itemId = String((params || {}).itemId || '').trim();
    if (!itemId) throw new Error('PARAM_REQUIRED: itemId');
    var shopId = getShopId_();
    var sheetId = ConfigService.getSheetId();

    callTiops_('shopee_delete_item', { item_id: itemId, shopId: shopId });

    // releitura: item some da Shopee — marca como deletado no Sheets
    Utilities.sleep(CONFIRM_DELAY_MS);
    var status = 'deletado';
    try {
      var fresh = callTiops_('shopee_get_item', { item_id: itemId, shopId: shopId });
      var freshItem = (fresh.response && fresh.response.item_list && fresh.response.item_list[0]) || null;
      if (freshItem) status = mapStatus_(freshItem.item_status);
    } catch (e) {
      status = 'deletado';
    }

    AnunciosShopeeRepository.patchMain(sheetId, itemId, {
      STATUS: status,
      DADOS_JSON: '',
      DATA_SINCRONIZACAO: nowBR_()
    });
    CacheRepository.remove(CACHE_KEY);
    return { success: true, itemId: itemId, novoStatus: status };
  }

  // ─── getSalesMetrics / getSKUs ────────────────────────────────────
  function getSalesMetrics(params) {
    params = params || {};
    var periodo = params.periodo || PERIODO_PADRAO;

    if (params.itemId) {
      var shopId = getShopId_();
      var result = callTiops_('shopee_sales_by_item', { item_id: String(params.itemId), period: periodo, shopId: shopId });
      var resp = result && result.response ? result.response : result;
      return {
        vendasTotal: num_(resp.total_quantity),
        contagemPedidos: num_(resp.total_orders),
        avaliacaoMedia: 0,
        comentariosTotal: 0,
        visitas: 0,
        conversao: '0%'
      };
    }

    var sheetId = ConfigService.getSheetId();
    var rows = AnunciosShopeeRepository.getAll(sheetId);
    var vendas = 0;
    var pedidos = 0;
    var avaliacoes = 0;
    var comAvaliacao = 0;
    var comentarios = 0;
    for (var i = 0; i < rows.length; i++) {
      vendas += num_(rows[i].VENDAS_30D);
      comentarios += num_(rows[i].NUM_COMENTARIOS);
      var nota = num_(rows[i].AVALIACAO);
      if (nota > 0) {
        avaliacoes += nota;
        comAvaliacao++;
      }
    }
    var media = comAvaliacao > 0 ? round2_(avaliacoes / comAvaliacao) : 0;
    return {
      vendasTotal: vendas,
      contagemPedidos: pedidos,
      avaliacaoMedia: media,
      comentariosTotal: comentarios,
      visitas: 0,
      conversao: '0%'
    };
  }

  function getSKUs(params) {
    var itemId = String((params || {}).itemId || '').trim();
    if (!itemId) throw new Error('PARAM_REQUIRED: itemId');
    var shopId = getShopId_();
    var models = fetchModels_(shopId, itemId);
    var skus = [];
    for (var i = 0; i < models.length; i++) {
      skus.push({
        modelId: String(models[i].model_id),
        nomeSKU: models[i].model_name || '',
        preco: round2_(models[i].normal_price),
        estoque: getModelStock_(models[i])
      });
    }
    return skus;
  }

  return {
    describe: describe,
    syncListings: syncListings,
    getListings: getListings,
    getItemDetail: getItemDetail,
    updatePrice: updatePrice,
    updateStock: updateStock,
    pauseItem: pauseItem,
    activateItem: activateItem,
    deleteItem: deleteItem,
    getSalesMetrics: getSalesMetrics,
    getSKUs: getSKUs,
    // helpers expostos para smoke tests
    mapStatus_: mapStatus_,
    buildItemRow_: buildItemRow_,
    nowBR_: nowBR_
  };
})();
