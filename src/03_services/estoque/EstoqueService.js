/**
 * EstoqueService — motor de controle de estoque unitário com FIFO.
 * Rastreia cada unidade de produto individualmente.
 * Aba alimentada por NFE_ENTRADA_PRODUTOS e MANUAL_ENTRADA_PRODUTOS.
 * Regras completas em specs/estoque.md.
 */
var EstoqueService = (function () {
  function describe() {
    return {
      name: 'estoque',
      actions: {
        importarDeNfe: {
          description: 'Importa items de NFE_ENTRADA_PRODUTOS (status=Recebido) para ESTOQUE.',
          params: {
            numeroNf: { type: 'string', required: true },
            chaveNf: { type: 'string', required: true }
          },
          returns: { success: 'boolean', itemsImported: 'number', estoque_ids: 'array', errors: 'array' }
        },
        importarDeManualEntrada: {
          description: 'Importa items de MANUAL_ENTRADA_PRODUTOS para ESTOQUE.',
          params: {
            dataCompraInicio: { type: 'string', required: false },
            dataCompraFim: { type: 'string', required: false }
          },
          returns: { success: 'boolean', itemsImported: 'number', estoque_ids: 'array', errors: 'array' }
        },
        getItems: {
          description: 'Lista items com filtros e ordenação.',
          params: {
            codigoProduto: { type: 'string', required: false },
            status: { type: 'string', required: false },
            sortBy: { type: 'string', required: false },
            sortOrder: { type: 'string', required: false }
          },
          returns: { items: 'array' }
        },
        updateStatusBulk: {
          description: 'Atualiza status de múltiplos items.',
          params: {
            estoque_ids: { type: 'object', required: true },
            novoStatus: { type: 'string', required: true }
          },
          returns: { success: 'boolean', updated: 'number', perda_total: 'number' }
        },
        sincronizar: {
          description: 'Processa import pendentes de NFE e MANUAL.',
          params: {},
          returns: { success: 'boolean', itemsImportados: 'number', itemsSincronizados: 'number' }
        },
        updateItem: {
          description: 'Atualiza precoShopee, precoMercadoLivre e/ou status de um item. Preços propagam para todos DISPONÍVEL do mesmo produto.',
          params: {
            estoqueId: { type: 'string', required: true },
            precoVendaShopee: { type: 'number', required: false },
            precoVendaMercadoLivre: { type: 'number', required: false },
            status: { type: 'string', required: false }
          },
          returns: { success: 'boolean', updated: 'number' }
        },
        getPrecosCatalogo: {
          description: 'Retorna preços sugeridos do catálogo para um código de produto.',
          params: {
            codigoProduto: { type: 'string', required: true }
          },
          returns: { precoShopee: 'number', precoMercadoLivre: 'number' }
        },
        getEstoqueAtualPorProduto: {
          description: 'Resume estoque por código de produto.',
          params: {
            codigoProduto: { type: 'string', required: false }
          },
          returns: { data: 'array' }
        }
      }
    };
  }

  function getSheetId_() {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return null;
    }
    return sheetId;
  }

  function gerarEstoqueId_(sheetId, overrideSeq) {
    var now = new Date();
    var date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
    var seq = overrideSeq != null ? overrideSeq : EstoqueRepository.getProximoSequencial(sheetId, date);
    return 'EST-' + date + '-' + String(seq).padStart(3, '0');
  }

  function calcularMargem_(precoVenda, precoCusto) {
    if (!precoVenda || precoVenda === 0) return '';
    var margem = ((precoVenda - precoCusto) / precoVenda) * 100;
    return Math.round(margem * 100) / 100;
  }

  function verificarAlertaEstoqueBaixo_(sheetId, codigoProduto) {
    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
    return items.length === 1;
  }

  function atualizarAlertas_(sheetId, codigoProduto) {
    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
    for (var i = 0; i < items.length; i++) {
      var isLast = items.length === 1;
      if (items[i].ALERTA_ESTOQUE_BAIXO !== isLast) {
        EstoqueRepository.updateRow(sheetId, items[i].ESTOQUE_ID, {
          alertaEstoqueBaixo: isLast
        });
      }
    }
  }

  function importarDeNfe(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var numeroNf = String(params.numeroNf || '').trim();
    var chaveNf = String(params.chaveNf || '').trim();
    if (!numeroNf) return { error: 'numeroNf é obrigatório.' };
    if (!chaveNf) return { error: 'chaveNf é obrigatório.' };

    var nfRows = NFeEntradaProdutosRepository.getProdutosByNf(sheetId, numeroNf);
    if (!nfRows || nfRows.length === 0) {
      return { error: 'Nenhum produto encontrado para NF ' + numeroNf };
    }

    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var estoqueIds = [];
    var errors = [];
    var rowsToInsert = [];
    var seqCounter = EstoqueRepository.getProximoSequencial(sheetId, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'));

    for (var i = 0; i < nfRows.length; i++) {
      var r = nfRows[i];
      var status = String(r.STATUS || '').trim().toLowerCase();
      if (status !== 'recebido') continue;

      var qty = parseInt(r.QUANTIDADE) || 1;
      var custo = parseFloat(r.VALOR_UNITARIO_LIQUIDO) || parseFloat(r.VALOR_UNITARIO) || 0;

      for (var u = 0; u < qty; u++) {
        var estoqueId = gerarEstoqueId_(sheetId, seqCounter++);
        rowsToInsert.push({
          estoqueId: estoqueId,
          codigoProduto: r.CODIGO_PRODUTO || '',
          descricaoProduto: r.DESCRICAO_PRODUTO || '',
          dataEntrada: r.DATA_ENTRADA || now,
          referenciaOrigem: 'NF#' + numeroNf,
          precoCustoOriginal: custo,
          precoVendaShopee: '',
          precoVendaMercadoLivre: '',
          margemShopee: '',
          margemMercadoLivre: '',
          status: 'DISPONÍVEL',
          alertaEstoqueBaixo: false,
          dataSincronizacao: now,
          logId: generateLogId_()
        });
        estoqueIds.push(estoqueId);
      }
    }

    if (rowsToInsert.length > 0) {
      EstoqueRepository.appendRows(sheetId, rowsToInsert);

      var produtos = {};
      for (var j = 0; j < rowsToInsert.length; j++) {
        produtos[rowsToInsert[j].codigoProduto] = true;
      }
      var codigos = Object.keys(produtos);
      for (var p = 0; p < codigos.length; p++) {
        atualizarAlertas_(sheetId, codigos[p]);
      }
    }

    return {
      success: true,
      itemsImported: rowsToInsert.length,
      estoque_ids: estoqueIds,
      errors: errors
    };
  }

  function importarDeManualEntrada(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    params = params || {};
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var estoqueIds = [];
    var errors = [];
    var rowsToInsert = [];
    var seqCounter = EstoqueRepository.getProximoSequencial(sheetId, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'));

    var allRows = ManualEntradaProdutosRepository.getRows(sheetId);

    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      var status = String(r.STATUS || '').trim().toLowerCase();
      if (status !== 'recebido') continue;

      var qty = parseInt(r.QUANTIDADE) || 1;
      var custo = parseFloat(r.VALOR_UNITARIO_LIQUIDO) || parseFloat(r.VALOR_UNITARIO) || 0;

      for (var u = 0; u < qty; u++) {
        var estoqueId = gerarEstoqueId_(sheetId, seqCounter++);
        rowsToInsert.push({
          estoqueId: estoqueId,
          codigoProduto: r.CODIGO_PRODUTO || '',
          descricaoProduto: r.DESCRICAO_PRODUTO || '',
          dataEntrada: r.DATA_ENTRADA || now,
          referenciaOrigem: 'MAN#' + (r.LOG_ID || ''),
          precoCustoOriginal: custo,
          precoVendaShopee: '',
          precoVendaMercadoLivre: '',
          margemShopee: '',
          margemMercadoLivre: '',
          status: 'DISPONÍVEL',
          alertaEstoqueBaixo: false,
          dataSincronizacao: now,
          logId: generateLogId_()
        });
        estoqueIds.push(estoqueId);
      }
    }

    if (rowsToInsert.length > 0) {
      EstoqueRepository.appendRows(sheetId, rowsToInsert);

      var produtos = {};
      for (var j = 0; j < rowsToInsert.length; j++) {
        produtos[rowsToInsert[j].codigoProduto] = true;
      }
      var codigos = Object.keys(produtos);
      for (var p = 0; p < codigos.length; p++) {
        atualizarAlertas_(sheetId, codigos[p]);
      }
    }

    return {
      success: true,
      itemsImported: rowsToInsert.length,
      estoque_ids: estoqueIds,
      errors: errors
    };
  }

  function getItems(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    params = params || {};
    var filters = {};
    if (params.codigoProduto) filters.codigoProduto = params.codigoProduto;
    if (params.status) filters.status = params.status;

    var items = EstoqueRepository.getRows(sheetId, Object.keys(filters).length > 0 ? filters : undefined);

    var sortBy = params.sortBy || 'data_entrada';
    var sortOrder = params.sortOrder || 'asc';

    var sortMap = {
      data_entrada: 'DATA_ENTRADA',
      preco_custo: 'PRECO_CUSTO_ORIGINAL',
      preco_venda: 'PRECO_VENDA_SHOPEE',
      margem: 'MARGEM_SHOPEE'
    };
    var sortField = sortMap[sortBy] || 'DATA_ENTRADA';

    items.sort(function (a, b) {
      var valA = a[sortField];
      var valB = b[sortField];
      if (sortField === 'DATA_ENTRADA') {
        valA = new Date(valA || 0);
        valB = new Date(valB || 0);
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return { items: items };
  }

  function updateStatusBulk(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var estoqueIds = params.estoque_ids;
    var novoStatus = String(params.novoStatus || '').trim().toUpperCase();
    var validStatuses = ['DISPONÍVEL', 'VENDIDO', 'DEVOLVIDO', 'QUEBRADO', 'COM_DEFEITO'];
    if (validStatuses.indexOf(novoStatus) === -1) {
      return { error: 'Status inválido: ' + novoStatus };
    }

    if (!estoqueIds || !Array.isArray(estoqueIds) || estoqueIds.length === 0) {
      return { error: 'estoque_ids é obrigatório e deve ser array.' };
    }

    var allRows = EstoqueRepository.getRows(sheetId);
    var idMap = {};
    for (var i = 0; i < allRows.length; i++) {
      idMap[allRows[i].ESTOQUE_ID] = allRows[i];
    }

    var perdaTotal = 0;
    var updates = {};
    updates.status = novoStatus;

    var produtosAfetados = {};

    for (var j = 0; j < estoqueIds.length; j++) {
      var item = idMap[estoqueIds[j]];
      if (!item) continue;

      if (novoStatus === 'QUEBRADO' || novoStatus === 'COM_DEFEITO') {
        perdaTotal += parseFloat(item.PRECO_CUSTO_ORIGINAL) || 0;
      }

      var cod = item.CODIGO_PRODUTO;
      if (!produtosAfetados[cod]) produtosAfetados[cod] = true;
    }

    var result = EstoqueRepository.updateRowsBulk(sheetId, estoqueIds, updates);

    var codigos = Object.keys(produtosAfetados);
    for (var p = 0; p < codigos.length; p++) {
      atualizarAlertas_(sheetId, codigos[p]);
    }

    return {
      success: result.success,
      updated: result.updated || 0,
      perda_total: Math.round(perdaTotal * 100) / 100
    };
  }

  function sincronizar() {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var totalImportados = 0;
    var totalSincronizados = 0;

    var allNfeRows = NFeEntradaProdutosRepository.getProdutos(sheetId);
    var existingItems = EstoqueRepository.getRows(sheetId);
    var existingRefs = {};
    for (var i = 0; i < existingItems.length; i++) {
      existingRefs[existingItems[i].REFERENCIA_ORIGEM] = true;
    }

    var nfGroups = {};
    for (var j = 0; j < allNfeRows.length; j++) {
      var r = allNfeRows[j];
      var status = String(r.STATUS || '').trim().toLowerCase();
      if (status !== 'recebido') continue;
      var numNf = String(r.NUMERO_NF || '').trim();
      if (!numNf) continue;
      if (!nfGroups[numNf]) nfGroups[numNf] = { chaveNf: r.CHAVE_NF || '', items: [] };
      nfGroups[numNf].items.push(r);
    }

    var nfKeys = Object.keys(nfGroups);
    for (var k = 0; k < nfKeys.length; k++) {
      var ref = 'NF#' + nfKeys[k];
      if (existingRefs[ref]) continue;

      var result = importarDeNfe({
        numeroNf: nfKeys[k],
        chaveNf: nfGroups[nfKeys[k]].chaveNf
      });
      if (result.itemsImported) {
        totalImportados += result.itemsImported;
        totalSincronizados += result.itemsImported;
      }
    }

    var allManualRows = ManualEntradaProdutosRepository.getRows(sheetId);
    for (var m = 0; m < allManualRows.length; m++) {
      var rm = allManualRows[m];
      var statusM = String(rm.STATUS || '').trim().toLowerCase();
      if (statusM !== 'recebido') continue;
      var logId = String(rm.LOG_ID || '').trim();
      var refMan = 'MAN#' + logId;
      if (existingRefs[refMan]) continue;

      var qty = parseInt(rm.QUANTIDADE) || 1;
      var custo = parseFloat(rm.VALOR_UNITARIO_LIQUIDO) || parseFloat(rm.VALOR_UNITARIO) || 0;
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      var rowsToInsert = [];
      var seqCounter = EstoqueRepository.getProximoSequencial(sheetId, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'));
      for (var u = 0; u < qty; u++) {
        rowsToInsert.push({
          estoqueId: gerarEstoqueId_(sheetId, seqCounter++),
          codigoProduto: rm.CODIGO_PRODUTO || '',
          descricaoProduto: rm.DESCRICAO_PRODUTO || '',
          dataEntrada: rm.DATA_ENTRADA || now,
          referenciaOrigem: refMan,
          precoCustoOriginal: custo,
          precoVendaShopee: '',
          precoVendaMercadoLivre: '',
          margemShopee: '',
          margemMercadoLivre: '',
          status: 'DISPONÍVEL',
          alertaEstoqueBaixo: false,
          dataSincronizacao: now,
          logId: generateLogId_()
        });
      }
      if (rowsToInsert.length > 0) {
        EstoqueRepository.appendRows(sheetId, rowsToInsert);
        totalImportados += rowsToInsert.length;
        totalSincronizados += rowsToInsert.length;
        existingRefs[refMan] = true;
      }
    }

    return {
      success: true,
      itemsImportados: totalImportados,
      itemsSincronizados: totalSincronizados
    };
  }

  function updateItem(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var estoqueId = String(params.estoqueId || '').trim();
    if (!estoqueId) return { error: 'estoqueId é obrigatório.' };

    var allRows = EstoqueRepository.getRows(sheetId);
    var targetItem = null;
    for (var i = 0; i < allRows.length; i++) {
      if (String(allRows[i].ESTOQUE_ID || '').trim() === estoqueId) {
        targetItem = allRows[i];
        break;
      }
    }
    if (!targetItem) return { error: 'Item não encontrado: ' + estoqueId };

    var updates = {};
    var codigoProduto = targetItem.CODIGO_PRODUTO;
    var precosChanged = false;

    if (params.precoVendaShopee !== undefined && params.precoVendaShopee !== null) {
      var novoPreco = parseFloat(params.precoVendaShopee) || 0;
      updates.precoVendaShopee = novoPreco;
      var custo = parseFloat(targetItem.PRECO_CUSTO_ORIGINAL) || 0;
      updates.margemShopee = calcularMargem_(novoPreco, custo);
      precosChanged = true;
    }

    if (params.precoVendaMercadoLivre !== undefined && params.precoVendaMercadoLivre !== null) {
      var novoPrecoML = parseFloat(params.precoVendaMercadoLivre) || 0;
      updates.precoVendaMercadoLivre = novoPrecoML;
      var custoML = parseFloat(targetItem.PRECO_CUSTO_ORIGINAL) || 0;
      updates.margemMercadoLivre = calcularMargem_(novoPrecoML, custoML);
      precosChanged = true;
    }

    if (params.status) {
      var validStatuses = ['DISPONÍVEL', 'VENDIDO', 'DEVOLVIDO', 'QUEBRADO', 'COM_DEFEITO'];
      var novoStatus = String(params.status).trim().toUpperCase();
      if (validStatuses.indexOf(novoStatus) === -1) {
        return { error: 'Status inválido: ' + novoStatus };
      }
      updates.status = novoStatus;
    }

    EstoqueRepository.updateRow(sheetId, estoqueId, updates);

    var totalUpdated = 1;

    if (precosChanged && codigoProduto) {
      var itemsDisponiveis = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
      for (var j = 0; j < itemsDisponiveis.length; j++) {
        var item = itemsDisponiveis[j];
        if (String(item.ESTOQUE_ID || '').trim() === estoqueId) continue;

        var bulkUpdates = {};
        if (updates.precoVendaShopee !== undefined) {
          bulkUpdates.precoVendaShopee = updates.precoVendaShopee;
          bulkUpdates.margemShopee = updates.margemShopee;
        }
        if (updates.precoVendaMercadoLivre !== undefined) {
          bulkUpdates.precoVendaMercadoLivre = updates.precoVendaMercadoLivre;
          bulkUpdates.margemMercadoLivre = updates.margemMercadoLivre;
        }
        EstoqueRepository.updateRow(sheetId, item.ESTOQUE_ID, bulkUpdates);
        totalUpdated++;
      }
    }

    if (updates.status && codigoProduto) {
      atualizarAlertas_(sheetId, codigoProduto);
    }

    return { success: true, updated: totalUpdated };
  }

  function getPrecosCatalogo(params) {
    var codigoProduto = String(params.codigoProduto || '').trim();
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };

    try {
      var result = CatalogService.getProducts({ sortBy: 'code', sortOrder: 'asc' });
      var products = (result && result.data) ? result.data : [];
      for (var i = 0; i < products.length; i++) {
        if (String(products[i].codigoProduto || '').trim() === codigoProduto) {
          return {
            precoShopee: products[i].precoShopee || 0,
            precoMercadoLivre: products[i].precoMercadoLivre || 0
          };
        }
      }
    } catch (e) {
      return { error: 'Erro ao buscar catálogo: ' + e.message };
    }

    return { precoShopee: 0, precoMercadoLivre: 0 };
  }

  function getEstoqueAtualPorProduto(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var items = EstoqueRepository.getRows(sheetId);
    var grouped = {};

    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var cod = String(r.CODIGO_PRODUTO || '').trim();
      if (!cod) continue;
      if (params && params.codigoProduto && cod !== params.codigoProduto) continue;

      if (!grouped[cod]) {
        grouped[cod] = {
          codigoProduto: cod,
          descricaoProduto: r.DESCRICAO_PRODUTO || '',
          quantidadeDisponivel: 0,
          quantidadeVendida: 0,
          quantidadeDevolvida: 0,
          quantidadeQuebrada: 0,
          precoCustoMaisRecente: 0,
          precoVendaShopee: '',
          precoVendaMercadoLivre: '',
          margemShopee: '',
          margemMercadoLivre: '',
          alertaEstoqueBaixo: false,
          dataEntradaMaisRecente: '',
          dataUltimaAtualizacao: ''
        };
      }

      var g = grouped[cod];
      var st = String(r.STATUS || '').trim();
      if (st === 'DISPONÍVEL') g.quantidadeDisponivel++;
      else if (st === 'VENDIDO') g.quantidadeVendida++;
      else if (st === 'DEVOLVIDO') g.quantidadeDevolvida++;
      else if (st === 'QUEBRADO' || st === 'COM_DEFEITO') g.quantidadeQuebrada++;

      var custo = parseFloat(r.PRECO_CUSTO_ORIGINAL) || 0;
      if (custo > 0) g.precoCustoMaisRecente = custo;

      if (r.PRECO_VENDA_SHOPEE !== '' && r.PRECO_VENDA_SHOPEE != null) {
        g.precoVendaShopee = r.PRECO_VENDA_SHOPEE;
      }
      if (r.PRECO_VENDA_MERCADO_LIVRE !== '' && r.PRECO_VENDA_MERCADO_LIVRE != null) {
        g.precoVendaMercadoLivre = r.PRECO_VENDA_MERCADO_LIVRE;
      }

      if (r.ALERTA_ESTOQUE_BAIXO === true || r.ALERTA_ESTOQUE_BAIXO === 'true') {
        g.alertaEstoqueBaixo = true;
      }

      var d = r.DATA_ENTRADA || '';
      if (d && (!g.dataEntradaMaisRecente || d > g.dataEntradaMaisRecente)) {
        g.dataEntradaMaisRecente = d;
      }
    }

    var result = [];
    var codes = Object.keys(grouped);
    for (var k = 0; k < codes.length; k++) {
      var g2 = grouped[codes[k]];
      g2.margemShopee = calcularMargem_(g2.precoVendaShopee, g2.precoCustoMaisRecente);
      g2.margemMercadoLivre = calcularMargem_(g2.precoVendaMercadoLivre, g2.precoCustoMaisRecente);
      g2.dataUltimaAtualizacao = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      result.push(g2);
    }

    return { data: result };
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
    for (var i = 0; i < 6; i++) {
      nonce += Math.floor(Math.random() * 16).toString(16);
    }
    return ts + '-' + nonce;
  }

  return {
    describe: describe,
    importarDeNfe: importarDeNfe,
    importarDeManualEntrada: importarDeManualEntrada,
    getItems: getItems,
    updateStatusBulk: updateStatusBulk,
    updateItem: updateItem,
    getPrecosCatalogo: getPrecosCatalogo,
    sincronizar: sincronizar,
    getEstoqueAtualPorProduto: getEstoqueAtualPorProduto
  };
})();
