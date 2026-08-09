/**
 * NFeEntradaProdutosService — desagrega PRODUTOS_JSON das NFes importadas
 * em linhas individuais na aba NFE_ENTRADA_PRODUTOS, uma linha por produto,
 * com referência completa aos dados da NF de origem para auditoria cruzada.
 *
 * Regras de negócio documentadas no código abaixo.
 */
var NFeEntradaProdutosService = (function () {

  function describe() {
    return {
      name: 'nfeEntradaProdutos',
      actions: {
        processarNf: {
          description: 'Desagrega uma NFe específica em linhas na aba NFE_ENTRADA_PRODUTOS.',
          params: {
            numeroNf: { type: 'string', required: true },
            chaveNf: { type: 'string', required: true }
          }
        },
        processarTodasNfs: {
          description: 'Processa todas as NFes não-processadas de NFE_ENTRADA.',
          params: {}
        },
        getProdutos: {
          description: 'Retorna todos os produtos (linhas brutas) da aba NFE_ENTRADA_PRODUTOS.',
          params: {}
        },
        getEstoque: {
          description: 'Retorna estoque agregado por produto com referência às NFs de origem.',
          params: {
            codigoProduto: { type: 'string', required: false }
          }
        },
        getProdutosByNf: {
          description: 'Retorna produtos de uma NF específica para exibição na sidebar.',
          params: {
            numeroNf: { type: 'string', required: true }
          }
        },
        getEstoqueByNf: {
          description: 'Retorna estoque agregado por produto de uma NF específica.',
          params: {
            numeroNf: { type: 'string', required: true }
          }
        },
        updateStatus: {
          description: 'Atualiza o status de um produto (Recebido/Desconsiderar).',
          params: {
            numeroNf: { type: 'string', required: true },
            codigoProduto: { type: 'string', required: true },
            status: { type: 'string', required: true, enum: ['Recebido', 'Desconsiderar'] }
          }
        },
        getProdutosByCodigo: {
          description: 'Retorna todas as entradas (linhas brutas) para um código de produto específico.',
          params: {
            codigoProduto: { type: 'string', required: true }
          }
        },
        calcularRateioItem: {
          description: 'Calcula desconto e despesas acessórias para um item (função pura).',
          params: {
            item: { type: 'object', required: true },
            vProdTotalNota: { type: 'number', required: true },
            vDescNota: { type: 'number', required: true },
            vOutroNota: { type: 'number', required: true },
            temItemComVDesc: { type: 'boolean', required: true },
            temItemComVOutro: { type: 'boolean', required: true },
            isUltimoItem: { type: 'boolean', required: true },
            somaParcialDesconto: { type: 'number', required: true },
            somaParcialOutros: { type: 'number', required: true }
          }
        }
      }
    };
  }

  // ─── helpers de logging ─────────────────────────────────────────────
  function trace_(action, summary, context) {
    LoggingService.log({
      service: 'nfeEntradaProdutos.trace',
      action: action,
      status: 'OK',
      caller: 'webapp',
      summary: summary,
      context: context || {}
    });
  }

  function traceError_(action, summary, context) {
    LoggingService.log({
      service: 'nfeEntradaProdutos.trace',
      action: action,
      status: 'ERROR',
      caller: 'webapp',
      summary: summary,
      context: context || {}
    });
  }

  // ─── helpers de validação ───────────────────────────────────────────
  function parseProdutosJson_(produtosJsonString) {
    if (!produtosJsonString) return [];
    try {
      var parsed = JSON.parse(produtosJsonString);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      throw new Error('Invalid PRODUTOS_JSON: ' + e.message);
    }
  }

  function normalizeAliquota_(raw) {
    var n = parseFloat(raw);
    if (isNaN(n) || n < 0) return 0;
    return n > 1 ? Math.round(n) / 100 : n;
  }

  function round2_(n) {
    return Math.round(n * 100) / 100;
  }

  function generateLogId_() {
    var now = new Date();
    var pad = function (v) { return v < 10 ? '0' + v : '' + v; };
    var ts = '' + now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds());
    var nonce = '';
    for (var i = 0; i < 8; i++) {
      nonce += Math.floor(Math.random() * 16).toString(16);
    }
    return ts + '-' + nonce;
  }

  // ─── calcularRateioItem ──────────────────────────────────────────────
  function calcularRateioItem(params) {
    var item = params.item;
    var vProdTotalNota = params.vProdTotalNota;
    var vDescNota = params.vDescNota;
    var vOutroNota = params.vOutroNota;
    var temItemComVDesc = params.temItemComVDesc;
    var temItemComVOutro = params.temItemComVOutro;
    var isUltimoItem = params.isUltimoItem;
    var somaParcialDesconto = params.somaParcialDesconto;
    var somaParcialOutros = params.somaParcialOutros;

    var vProdItem = item.vProd || 0;
    var vDescItemRaw = item.vDesc;
    var vOutroItemRaw = item.vOutro;

    // Desconto
    var valorDescontoItem = 0;
    var tipoDesconto = 'NENHUM';
    if (temItemComVDesc) {
      tipoDesconto = 'ITEM';
      valorDescontoItem = vDescItemRaw != null ? vDescItemRaw : 0;
    } else if (vDescNota > 0) {
      tipoDesconto = 'RATEADO';
      if (isUltimoItem) {
        valorDescontoItem = round2_(vDescNota - somaParcialDesconto);
      } else {
        var proporcao = vProdTotalNota > 0 ? vProdItem / vProdTotalNota : (1 / (params.totalItems || 1));
        valorDescontoItem = round2_(vDescNota * proporcao);
      }
    }

    // Outros (despesas acessórias)
    var valorOutrosItem = 0;
    var tipoOutros = 'NENHUM';
    if (temItemComVOutro) {
      tipoOutros = 'ITEM';
      valorOutrosItem = vOutroItemRaw != null ? vOutroItemRaw : 0;
    } else if (vOutroNota > 0) {
      tipoOutros = 'RATEADO';
      if (isUltimoItem) {
        valorOutrosItem = round2_(vOutroNota - somaParcialOutros);
      } else {
        var proporcao = vProdTotalNota > 0 ? vProdItem / vProdTotalNota : (1 / (params.totalItems || 1));
        valorOutrosItem = round2_(vOutroNota * proporcao);
      }
    }

    var valorLiquidoItem = round2_(vProdItem - valorDescontoItem + valorOutrosItem);
    var quantidade = item.qCom || 1;
    var valorUnitarioLiquido = round2_(valorLiquidoItem / quantidade);

    return {
      valorDescontoItem: valorDescontoItem,
      tipoDesconto: tipoDesconto,
      valorOutrosItem: valorOutrosItem,
      tipoOutros: tipoOutros,
      valorLiquidoItem: valorLiquidoItem,
      valorUnitarioLiquido: valorUnitarioLiquido
    };
  }

  // ─── processarNf ────────────────────────────────────────────────────
  function processarNf(params) {
    var numeroNf = String(params.numeroNf || '').trim();
    var chaveNf = String(params.chaveNf || '').trim();
    if (!numeroNf) return { error: 'numeroNf é obrigatório.' };
    if (!chaveNf) return { error: 'chaveNf é obrigatório.' };

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    trace_('processarNf:start', 'Início processamento da NF ' + numeroNf, {
      numeroNf: numeroNf, chaveNf: chaveNf
    });

    var nfes = NFeEntradaRepository.getNfes(sheetId);
    var nfe = null;
    for (var i = 0; i < nfes.length; i++) {
      if (String(nfes[i].NUMERO_NF).trim() === numeroNf) {
        nfe = nfes[i];
        break;
      }
    }
    if (!nfe) {
      traceError_('processarNf:not-found', 'NFe não encontrada: ' + numeroNf);
      return { error: 'NFe not found in NFE_ENTRADA' };
    }
    if (nfe.CHAVE_NF && String(nfe.CHAVE_NF).trim() !== '' && String(nfe.CHAVE_NF).trim() !== chaveNf) {
      traceError_('processarNf:chave-mismatch', 'Chave NF não confere', {
        numeroNf: numeroNf, esperada: String(nfe.CHAVE_NF).trim(), recebida: chaveNf
      });
      return { error: 'Chave NF não confere com a NFe encontrada.' };
    }

    var produtos;
    try {
      produtos = parseProdutosJson_(nfe.PRODUTOS_JSON);
    } catch (e) {
      traceError_('processarNf:parse-error', 'Erro ao parsear PRODUTOS_JSON', { numeroNf: numeroNf, error: e.message });
      return { error: e.message };
    }

    if (!produtos.length) {
      trace_('processarNf:empty', 'NFe sem produtos (PRODUTOS_JSON vazio)', { numeroNf: numeroNf });
      return { success: true, processedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'), productCount: 0, totalQuantity: 0, totalValue: 0, errors: [] };
    }

    var nfeProdutosSheetId = sheetId; // usa a mesma planilha, aba diferente
    var insertedRows = [];
    var totalQuantity = 0;
    var totalValue = 0;
    var errors = [];
    var skippedDuplicate = 0;
    var logId = generateLogId_();
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var dataEmissao = nfe.DATA_EMISSAO || '';
    var emitenteCnpj = nfe.EMITENTE_CNPJ || '';
    var emitenteNome = nfe.EMITENTE_NOME || '';

    var vProdTotalNota = 0;
    for (var k = 0; k < produtos.length; k++) {
      vProdTotalNota += parseFloat(produtos[k].vProd) || 0;
    }
    vProdTotalNota = round2_(vProdTotalNota);

    var vDescNota = parseFloat(nfe.VALOR_DESCONTO) || 0;
    var vOutroNota = parseFloat(nfe.VALOR_OUTROS) || 0;

    var temItemComVDesc = false;
    var temItemComVOutro = false;
    for (var m = 0; m < produtos.length; m++) {
      if (produtos[m].vDesc != null) temItemComVDesc = true;
      if (produtos[m].vOutro != null) temItemComVOutro = true;
    }

    var somaDesconto = 0;
    var somaOutros = 0;

    for (var j = 0; j < produtos.length; j++) {
      var prod = produtos[j];
      var cod = prod.cProd || '';
      var aliqRaw = prod.aliquotaIcms || '0';
      var aliq = normalizeAliquota_(aliqRaw);
      var vProd = parseFloat(prod.vProd) || 0;
      var icmsItem = round2_(vProd * aliq);

      if (NFeEntradaProdutosRepository.jaExisteProduto(nfeProdutosSheetId, numeroNf, cod)) {
        skippedDuplicate++;
        trace_('processarNf:skip-dup', 'Produto já existe na aba, skip: ' + cod, {
          numeroNf: numeroNf, codigo: cod
        });
        continue;
      }

      var isUltimo = (j === produtos.length - 1);
      var rateio = calcularRateioItem({
        item: prod,
        vProdTotalNota: vProdTotalNota,
        vDescNota: vDescNota,
        vOutroNota: vOutroNota,
        temItemComVDesc: temItemComVDesc,
        temItemComVOutro: temItemComVOutro,
        isUltimoItem: isUltimo,
        somaParcialDesconto: somaDesconto,
        somaParcialOutros: somaOutros,
        totalItems: produtos.length
      });
      somaDesconto += rateio.valorDescontoItem;
      somaOutros += rateio.valorOutrosItem;

      var skuResult = SkuService.generate({
        descricaoProduto: prod.xProd || cod,
        ncm: prod.NCM || ''
      });

      insertedRows.push({
        numeroNf: numeroNf,
        chaveNf: nfe.CHAVE_NF || chaveNf,
        dataEmissao: dataEmissao,
        emitenteCnpj: emitenteCnpj,
        emitenteNome: emitenteNome,
        codigoProduto: cod,
        sku: skuResult.sku,
        descricaoProduto: prod.xProd || '',
        ncm: prod.NCM || '',
        cfop: prod.CFOP || '',
        quantidade: parseFloat(prod.qCom) || 0,
        valorUnitario: parseFloat(prod.vUnCom) || 0,
        valorTotal: vProd,
        aliquotaIcms: aliq,
        valorIcmsItem: icmsItem,
        status: 'Recebido',
        dataEntrada: now,
        tipoMovimentacao: 'Entrada por NF',
        logId: logId,
        valorDescontoItem: rateio.valorDescontoItem,
        tipoDesconto: rateio.tipoDesconto,
        valorOutrosItem: rateio.valorOutrosItem,
        tipoOutros: rateio.tipoOutros,
        valorLiquidoItem: rateio.valorLiquidoItem,
        valorUnitarioLiquido: rateio.valorUnitarioLiquido
      });
      totalQuantity += insertedRows[insertedRows.length - 1].quantidade;
      totalValue += vProd;
    }

    if (Math.abs(somaDesconto - vDescNota) > 0.01 ||
        Math.abs(somaOutros - vOutroNota) > 0.01) {
      traceError_('processarNf:reconcile-error', 'Reconciliação de rateio não fechou para NF ' + numeroNf, {
        somaDesconto: somaDesconto, valorDescontoNf: vDescNota,
        somaOutros: somaOutros, valorOutrosNf: vOutroNota
      });
    }

    var insertResult = { inserted: 0, errors: [] };
    if (insertedRows.length > 0) {
      insertResult = NFeEntradaProdutosRepository.insertProdutos(insertedRows, nfeProdutosSheetId);
      // Catálogo lê NFE_ENTRADA_PRODUTOS direto (CatalogService.getProducts); sem
      // isso, produto novo/custo novo só aparece lá depois de até 5min (TTL do cache).
      CacheRepository.invalidateByPattern('catalog_');
      CacheRepository.invalidateByPattern('dashboard_');
    }

    NFeEntradaRepository.marcarNfProcessada(sheetId, numeroNf, now);

    var result = {
      success: true,
      processedAt: now,
      productCount: insertResult.inserted,
      totalQuantity: round2_(totalQuantity),
      totalValue: round2_(totalValue),
      skippedDuplicate: skippedDuplicate,
      errors: insertResult.errors
    };

    trace_('processarNf:done', 'NF ' + numeroNf + ' processada: ' + insertResult.inserted + ' inseridos', {
      numeroNf: numeroNf,
      productCount: insertResult.inserted,
      totalQuantity: totalQuantity,
      totalValue: totalValue,
      skippedDuplicate: skippedDuplicate,
      insertErrors: insertResult.errors.length
    });

    return result;
  }

  // ─── processarTodasNfs ──────────────────────────────────────────────
  function processarTodasNfs() {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    trace_('processarTodas:start', 'Início processamento de todas as NFs');

    var nfes = NFeEntradaRepository.getNfesNaoProcessadas(sheetId);
    var totalNfProcessed = 0;
    var totalProductsInserted = 0;
    var errors = [];

    for (var i = 0; i < nfes.length; i++) {
      var nf = nfes[i];
      var numeroNf = String(nf.NUMERO_NF).trim();
      var chaveNf = String(nf.CHAVE_NF).trim();
      if (!numeroNf || !chaveNf) {
        traceError_('processarTodas:skip', 'NF sem NUMERO_NF ou CHAVE_NF obrigatórios, skip', {
          numeroNf: numeroNf, chaveNf: chaveNf
        });
        errors.push({ numeroNf: numeroNf, reason: 'NUMERO_NF ou CHAVE_NF obrigatórios.' });
        continue;
      }

      var result = processarNf({ numeroNf: numeroNf, chaveNf: chaveNf });
      if (result.error) {
        errors.push({ numeroNf: numeroNf, reason: result.error });
      } else {
        totalNfProcessed++;
        totalProductsInserted += result.productCount;
      }
    }

    var done = {
      success: errors.length === 0,
      totalNfProcessed: totalNfProcessed,
      totalProductsInserted: totalProductsInserted,
      errors: errors
    };

    trace_('processarTodas:done', 'Processadas ' + totalNfProcessed + ' NFs com ' + totalProductsInserted + ' produtos', {
      totalNfProcessed: totalNfProcessed,
      totalProductsInserted: totalProductsInserted,
      errorCount: errors.length
    });

    return done;
  }

  // ─── getProdutosByNf ────────────────────────────────────────────────
  function getProdutosByNf(params) {
    var numeroNf = String(params.numeroNf || '').trim();
    if (!numeroNf) return { error: 'numeroNf é obrigatório.' };

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    try {
      var produtos = NFeEntradaProdutosRepository.getProdutosByNf(sheetId, numeroNf);
      trace_('getProdutosByNf:ok', 'NF ' + numeroNf + ': ' + produtos.length + ' produto(s)', {
        numeroNf: numeroNf,
        count: produtos.length
      });
      return { data: produtos };
    } catch (e) {
      traceError_('getProdutosByNf:error', 'Erro ao consultar produtos da NF ' + numeroNf, { error: e.message });
      return { error: 'Erro ao consultar produtos: ' + e.message, data: [] };
    }
  }

  // ─── getEstoqueByNf ────────────────────────────────────────────────
  function getEstoqueByNf(params) {
    var numeroNf = String(params.numeroNf || '').trim();
    if (!numeroNf) return { error: 'numeroNf é obrigatório.' };

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    try {
      var estoque = NFeEntradaProdutosRepository.getEstoqueByNf(sheetId, numeroNf);
      trace_('getEstoqueByNf:ok', 'NF ' + numeroNf + ': ' + estoque.length + ' produto(s)', {
        numeroNf: numeroNf,
        count: estoque.length
      });
      return { data: estoque };
    } catch (e) {
      traceError_('getEstoqueByNf:error', 'Erro ao consultar estoque da NF ' + numeroNf, { error: e.message });
      return { error: 'Erro ao consultar estoque: ' + e.message, data: [] };
    }
  }

  // ─── getEstoque ─────────────────────────────────────────────────────
  function getEstoque(params) {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }
    var codigoProduto = params.codigoProduto || '';
    try {
      var estoque = NFeEntradaProdutosRepository.getEstoque(sheetId, codigoProduto);
      trace_('getEstoque:ok', 'Estoque retornado: ' + estoque.length + ' produto(s)', {
        codigoProduto: codigoProduto,
        count: estoque.length
      });
      return { data: estoque };
    } catch (e) {
      traceError_('getEstoque:error', 'Erro ao consultar estoque', { error: e.message });
      return { error: 'Erro ao consultar estoque: ' + e.message, data: [] };
    }
  }

  // ─── updateStatus ─────────────────────────────────────────────────────
  function updateStatus(params) {
    var numeroNf = String(params.numeroNf || '').trim();
    var codigoProduto = String(params.codigoProduto || '').trim();
    var status = String(params.status || '').trim();
    if (!numeroNf) return { error: 'numeroNf é obrigatório.' };
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };
    if (!status) return { error: 'status é obrigatório.' };

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    try {
      var result = NFeEntradaProdutosRepository.updateStatus(sheetId, numeroNf, codigoProduto, status);
      trace_('updateStatus:ok', 'Produto ' + codigoProduto + ' da NF ' + numeroNf + ' → ' + status, {
        numeroNf: numeroNf, codigoProduto: codigoProduto, status: status
      });
      return { success: true, updated: result.updated };
    } catch (e) {
      traceError_('updateStatus:error', 'Erro ao atualizar status', { error: e.message });
      return { error: 'Erro ao atualizar status: ' + e.message };
    }
  }

  /**
   * Retorna todas as entradas (linhas brutas) para um código de produto específico.
   */
  function getProdutosByCodigo(params) {
    var codigoProduto = params.codigoProduto;
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    try {
      var produtos = NFeEntradaProdutosRepository.getProdutosByCodigo(sheetId, codigoProduto);
      trace_('getProdutosByCodigo:ok', 'Código ' + codigoProduto + ': ' + produtos.length + ' entrada(s)', {
        codigoProduto: codigoProduto, count: produtos.length
      });
      return { data: produtos };
    } catch (e) {
      traceError_('getProdutosByCodigo:error', 'Erro ao consultar entradas do produto ' + codigoProduto, { error: e.message });
      return { error: 'Erro ao consultar entradas: ' + e.message };
    }
  }

  /**
   * Retorna todos os produtos (linhas brutas) da aba NFE_ENTRADA_PRODUTOS,
   * enriquecidos com CATEGORIA (lida da aba ESTOQUE) e preços sugeridos do
   * catálogo (para subtotais na view).
   */
  function getProdutos(params) {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: (sheetId && sheetId.error) || 'Sheet ID not configured.' };
    }

    try {
      var produtos = NFeEntradaProdutosRepository.getProdutos(sheetId);
      var precoMap = {};
      try {
        var catalogo = CatalogService.getProducts({ sortBy: 'code', sortOrder: 'asc' });
        if (catalogo && catalogo.success && catalogo.data) {
          for (var c = 0; c < catalogo.data.length; c++) {
            var cp = catalogo.data[c];
            precoMap[String(cp.codigoProduto || '').trim()] = {
              shopee: cp.precoShopee || 0,
              mercadoLivre: cp.precoMercadoLivre || 0
            };
          }
        }
      } catch (e) {
        console.warn('NFeEntradaProdutosService: erro ao carregar catálogo p/ preços — ' + e.message);
      }
      for (var i = 0; i < produtos.length; i++) {
        var sku = String(produtos[i].SKU || '').trim();
        var cod = String(produtos[i].CODIGO_PRODUTO || '').trim();
        produtos[i].CATEGORIA = SkuService.getCategoryByCodigo(cod, sku);
        var precos = precoMap[cod] || { shopee: 0, mercadoLivre: 0 };
        produtos[i].PRECO_SUGERIDO_SHOPEE = precos.shopee;
        produtos[i].PRECO_SUGERIDO_MERCADO_LIVRE = precos.mercadoLivre;
      }
      trace_('getProdutos:ok', produtos.length + ' produto(s) encontrado(s)', { count: produtos.length });
      return { data: produtos };
    } catch (e) {
      traceError_('getProdutos:error', 'Erro ao consultar produtos', { error: e.message });
      return { error: 'Erro ao consultar produtos: ' + e.message };
    }
  }

  return {
    describe: describe,
    processarNf: processarNf,
    processarTodasNfs: processarTodasNfs,
    getProdutos: getProdutos,
    getEstoque: getEstoque,
    getProdutosByNf: getProdutosByNf,
    getEstoqueByNf: getEstoqueByNf,
    getProdutosByCodigo: getProdutosByCodigo,
    updateStatus: updateStatus,
    calcularRateioItem: calcularRateioItem
  };
})();