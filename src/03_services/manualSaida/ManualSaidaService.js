/**
 * ManualSaidaService — registro de saídas de produtos sem integração com
 * marketplace (vendas diretas, devoluções, perdas, ajustes, brindes).
 * Aba complementar a Catálogo para manter estoque agregado atualizado.
 * Regras completas em specs/manual-saida.md.
 */
var ManualSaidaService = (function () {
  var VALID_TYPES = ['Venda', 'Devolução', 'Perda', 'Ajuste', 'Brinde'];

  function describe() {
    return {
      name: 'manualSaida',
      actions: {
        addExit: {
          description: 'Registra uma saída manual em MANUAL_SAIDA_PRODUTOS e dispara baixa automática na aba ESTOQUE (FIFO, origem SAIDA_MANUAL), gravando SKU e ESTOQUE_IDS das unidades baixadas.',
          params: {
            codigoProduto: { type: 'string', required: true },
            descricaoProduto: { type: 'string', required: true },
            quantidade: { type: 'number', required: true },
            tipoSaida: { type: 'string', required: true },
            clienteName: { type: 'string', required: false },
            precoUnitario: { type: 'number', required: false },
            dataCompra: { type: 'string', required: false },
            observacoes: { type: 'string', required: false },
            motivoPerda: { type: 'string', required: false }
          },
          returns: { success: 'boolean', exitId: 'string', processedAt: 'string', estoqueRestante: 'number', estoque_ids: 'array', sku: 'string', row: 'object', errors: 'array' }
        },
        listExits: {
          description: 'Lista saídas manuais ou filtra por código de produto / tipo de saída.',
          params: {
            codigoProduto: { type: 'string', required: false },
            tipoSaida: { type: 'string', required: false },
            limit: { type: 'number', required: false }
          },
          returns: { exits: 'array' }
        },
        validateExit: {
          description: 'Valida dados antes de inserir (sem efetivamente inserir).',
          params: {
            codigoProduto: { type: 'string', required: true },
            descricaoProduto: { type: 'string', required: true },
            quantidade: { type: 'number', required: true },
            tipoSaida: { type: 'string', required: true },
            clienteName: { type: 'string', required: false },
            precoUnitario: { type: 'number', required: false },
            dataCompra: { type: 'string', required: false },
            observacoes: { type: 'string', required: false },
            motivoPerda: { type: 'string', required: false }
          },
          returns: { valid: 'boolean', warnings: 'array', errors: 'array', estoqueDisponivel: 'number' }
        },
        getAvailableProducts: {
          description: 'Retorna lista de produtos disponíveis em estoque com quantidade.',
          params: {
            filtro: { type: 'string', required: false }
          },
          returns: { products: 'array' }
        },
        getClienteHistory: {
          description: 'Retorna histórico de clientes já usados (autocomplete).',
          params: {},
          returns: { clientes: 'array' }
        }
      }
    };
  }

  function addExit(params) {
    var validation = validateExit(params);
    if (!validation.valid) {
      return { error: validation.errors.join('; ') };
    }

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID não configurado.' };
    }

    var quantidade = parseFloat(params.quantidade) || 0;
    var precoUnitario = parseFloat(params.precoUnitario) || 0;
    var tipoSaida = params.tipoSaida;
    var valorTotal = Math.round(quantidade * precoUnitario * 100) / 100;

    var produtoOrigem = _getProdutoOrigem(sheetId, params.codigoProduto);

    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd'T'HHmmss");
    var nonce = Utilities.getUuid().substring(0, 6);
    var logId = timestamp + '-' + nonce;

    var dataSaida = params.dataCompra || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var dataCompraOrigem = produtoOrigem.dataCompra || '';

    var rowData = {
      codigoProduto: params.codigoProduto,
      descricaoProduto: params.descricaoProduto,
      ncm: produtoOrigem.ncm,
      quantidade: quantidade,
      tipoSaida: tipoSaida,
      precoUnitario: precoUnitario,
      valorTotal: valorTotal,
      valorUnitario: precoUnitario,
      valorUnitarioLiquido: precoUnitario,
      valorLiquidoItem: valorTotal,
      status: 'Saído',
      dataSaida: dataSaida,
      tipoMovimentacao: 'Saída Manual',
      logId: logId,
      clienteNome: params.clienteName || '',
      motivoPerda: (tipoSaida === 'Perda' ? (params.motivoPerda || '') : ''),
      dataRegistro: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      observacoes: params.observacoes || '',
      emitenteNome: produtoOrigem.emitenteNome,
      dataCompra: params.dataCompra || dataCompraOrigem,
      valorOutrosItem: produtoOrigem.valorOutrosItem,
      tipoOutros: produtoOrigem.tipoOutros
    };

    var baixa = null;
    try {
      baixa = EstoqueBaixaService.baixarPorProduto({
        codigoProduto: params.codigoProduto,
        quantidade: Math.floor(quantidade),
        origem: 'SAIDA_MANUAL',
        referenciaOrigem: logId,
        idempotencyKey: 'MS-' + logId
      });
    } catch (e) {
      return { error: 'Falha na baixa de estoque: ' + e.message };
    }

    if (!baixa.success || (baixa.faltantes || 0) > 0) {
      return { error: 'Quantidade maior que o estoque disponível na aba ESTOQUE. Nenhuma saída registrada.' };
    }

    rowData.sku = getSkuDaBaixa_(sheetId, baixa.estoque_ids) || produtoOrigem.sku || '';
    rowData.estoqueIds = (baixa.estoque_ids || []).join(',');

    var result = ManualSaidaProdutosRepository.appendRow(sheetId, rowData);

    CacheRepository.invalidateByPattern('frontend.');
    CacheRepository.invalidateByPattern('catalog_');
    CacheRepository.invalidateByPattern('estoque.');
    CacheRepository.invalidateByPattern('dashboard_');

    var estoqueRestante = _getEstoqueDisponivel(sheetId, params.codigoProduto);

    return {
      success: result.success,
      exitId: logId,
      processedAt: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      estoqueRestante: estoqueRestante,
      estoque_ids: baixa.estoque_ids || [],
      sku: rowData.sku,
      row: rowData,
      errors: []
    };
  }

  function listExits(params) {
    params = params || {};
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID não configurado.' };
    }

    var limit = params.limit || 100;
    var filters = {};
    if (params.codigoProduto) filters.codigoProduto = params.codigoProduto;
    if (params.tipoSaida) filters.tipoSaida = params.tipoSaida;

    var rows = ManualSaidaProdutosRepository.getRows(sheetId, filters);

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
      console.warn('ManualSaidaService: erro ao carregar catálogo p/ preços — ' + e.message);
    }

    var exits = [];
    for (var i = 0; i < rows.length && i < limit; i++) {
      var r = rows[i];
      var sku = String(r.SKU || '').trim();
      var cod = String(r.CODIGO_PRODUTO || '').trim();
      var precos = precoMap[cod] || { shopee: 0, mercadoLivre: 0 };
      exits.push({
        codigoProduto: r.CODIGO_PRODUTO || '',
        descricaoProduto: r.DESCRICAO_PRODUTO || '',
        sku: sku,
        categoria: SkuService.getCategoryByCodigo(cod, sku),
        quantidade: parseFloat(r.QUANTIDADE) || 0,
        tipoSaida: r.TIPO_SAIDA || '',
        precoUnitario: parseFloat(r.PRECO_UNITARIO) || 0,
        valorTotal: parseFloat(r.VALOR_TOTAL) || 0,
        status: r.STATUS || '',
        dataSaida: _fmtDataBR_(r.DATA_SAIDA),
        tipoMovimentacao: r.TIPO_MOVIMENTACAO || '',
        logId: r.LOG_ID || '',
        clienteNome: r.CLIENTE_NOME || '',
        motivoPerda: r.MOTIVO_PERDA || '',
        dataRegistro: _fmtDataBR_(r.DATA_REGISTRO),
        estoqueIds: r.ESTOQUE_IDS || '',
        observacoes: r.OBSERVACOES || '',
        ncm: r.NCM || '',
        valorUnitario: parseFloat(r.VALOR_UNITARIO) || 0,
        valorUnitarioLiquido: parseFloat(r.VALOR_UNITARIO_LIQUIDO) || 0,
        valorLiquidoItem: parseFloat(r.VALOR_LIQUIDO_ITEM) || 0,
        emitenteNome: r.EMITENTE_NOME || '',
        dataCompra: _fmtDataBR_(r.DATA_COMPRA),
        valorOutrosItem: parseFloat(r.VALOR_OUTROS_ITEM) || 0,
        tipoOutros: r.TIPO_OUTROS || '',
        precoSugeridoShopee: precos.shopee,
        precoSugeridoMercadoLivre: precos.mercadoLivre
      });
    }

    return { exits: exits };
  }

  function validateExit(params) {
    var errors = [];
    var warnings = [];

    if (!params.codigoProduto || String(params.codigoProduto).trim() === '') {
      errors.push('Missing required field: codigoProduto');
    }
    if (!params.descricaoProduto || String(params.descricaoProduto).trim() === '') {
      errors.push('Missing required field: descricaoProduto');
    }
    if (!params.tipoSaida || String(params.tipoSaida).trim() === '') {
      errors.push('Missing required field: tipoSaida');
    } else if (VALID_TYPES.indexOf(params.tipoSaida) === -1) {
      errors.push('Tipo de saída inválido. Use: ' + VALID_TYPES.join(', '));
    }

    var quantidade = parseFloat(params.quantidade);
    if (isNaN(quantidade) || quantidade <= 0) {
      errors.push('Quantidade must be > 0');
    }

    var estoqueDisponivel = 0;
    if (params.codigoProduto && !isNaN(quantidade) && quantidade > 0) {
      var sheetId = ConfigService.getNfeEntradaSheetId();
      if (sheetId && !(typeof sheetId === 'object' && sheetId.error)) {
        estoqueDisponivel = _getEstoqueDisponivel(sheetId, params.codigoProduto);
        if (quantidade > estoqueDisponivel) {
          errors.push('Quantidade maior que estoque disponível. Apenas ' + estoqueDisponivel + ' em estoque.');
        }
      }
    }

    return { valid: errors.length === 0, warnings: warnings, errors: errors, estoqueDisponivel: estoqueDisponivel };
  }

  function getAvailableProducts(params) {
    params = params || {};
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID não configurado.' };
    }

    var unidades = [];
    try {
      unidades = EstoqueRepository.getRows(sheetId, { baixado: 'N' });
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler aba ESTOQUE — ' + e.message);
    }

    var grouped = {};
    for (var i = 0; i < unidades.length; i++) {
      var r = unidades[i];
      var status = String(r.STATUS || '').trim().toLowerCase();
      if (status && status !== 'disponível' && status !== 'disponivel') continue;

      var cod = String(r.CODIGO_PRODUTO || '').trim();
      if (!cod) continue;

      if (!grouped[cod]) {
        grouped[cod] = {
          codigoProduto: cod,
          descricaoProduto: r.DESCRICAO_PRODUTO || '',
          sku: r.SKU || '',
          estoqueDisponivel: 0,
          somaCusto: 0,
          count: 0
        };
      }
      grouped[cod].estoqueDisponivel += 1;
      grouped[cod].somaCusto += parseFloat(r.PRECO_CUSTO_ORIGINAL) || 0;
      grouped[cod].count++;
    }

    var products = [];
    var codes = Object.keys(grouped);
    var filtro = params.filtro ? String(params.filtro).trim().toLowerCase() : '';

    for (var k = 0; k < codes.length; k++) {
      var p = grouped[codes[k]];
      if (p.estoqueDisponivel <= 0) continue;

      if (filtro) {
        var matchCode = p.codigoProduto.toLowerCase().indexOf(filtro) !== -1;
        var matchDesc = p.descricaoProduto.toLowerCase().indexOf(filtro) !== -1;
        if (!matchCode && !matchDesc) continue;
      }

      products.push({
        codigoProduto: p.codigoProduto,
        descricaoProduto: p.descricaoProduto,
        sku: p.sku,
        estoqueDisponivel: p.estoqueDisponivel,
        precoUnitarioMedio: p.count > 0 ? Math.round((p.somaCusto / p.count) * 100) / 100 : 0
      });
    }

    products.sort(function (a, b) {
      return a.descricaoProduto.toLowerCase() < b.descricaoProduto.toLowerCase() ? -1 : 1;
    });

    return { products: products };
  }

  function getClienteHistory() {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { clientes: [] };
    }
    return { clientes: ManualSaidaProdutosRepository.getClienteHistory(sheetId) };
  }

  function _fmtDataBR_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    }
    var s = String(value || '').trim();
    if (!s) return '';
    if (s.indexOf('T') !== -1) {
      var iso = new Date(s);
      if (!isNaN(iso.getTime())) {
        return Utilities.formatDate(iso, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      }
    }
    return s;
  }

  function _getProdutoOrigem(sheetId, codigoProduto) {
    var info = {
      ncm: '',
      valorUnitarioLiquido: 0,
      emitenteNome: '',
      dataCompra: '',
      valorOutrosItem: 0,
      tipoOutros: '',
      sku: ''
    };
    if (!codigoProduto) return info;

    var cod = String(codigoProduto).trim();
    var rows = [];

    try {
      rows = rows.concat(NFeEntradaProdutosRepository.getProdutos(sheetId));
    } catch (e) { console.warn('ManualSaidaService: Erro ao ler NFeEntradaProdutos — ' + e.message); }

    try {
      rows = rows.concat(ManualEntradaProdutosRepository.getRows(sheetId));
    } catch (e) { console.warn('ManualSaidaService: Erro ao ler ManualEntradaProdutos — ' + e.message); }

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r.CODIGO_PRODUTO || '').trim() !== cod) continue;

      var status = String(r.STATUS || '').trim().toLowerCase();
      if (status && status !== 'recebido') continue;

      var ncm = String(r.NCM || '').trim();
      var vUnit = parseFloat(r.VALOR_UNITARIO) || 0;
      var vUnitLiq = parseFloat(r.VALOR_UNITARIO_LIQUIDO);
      if (isNaN(vUnitLiq)) vUnitLiq = vUnit;
      var vOutros = parseFloat(r.VALOR_OUTROS_ITEM) || 0;

      if (ncm) info.ncm = ncm;
      if (vUnitLiq > 0) info.valorUnitarioLiquido = vUnitLiq;
      if (vOutros > 0) info.valorOutrosItem = vOutros;
      if (r.TIPO_OUTROS) info.tipoOutros = String(r.TIPO_OUTROS);
      if (r.EMITENTE_NOME) info.emitenteNome = String(r.EMITENTE_NOME);
      if (r.DATA_COMPRA) info.dataCompra = _fmtDataBR_(r.DATA_COMPRA);
      if (r.SKU) info.sku = String(r.SKU).trim();
    }

    return info;
  }

  function _getEstoqueDisponivel(sheetId, codigoProduto) {
    var unidades = [];
    try {
      unidades = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto)
        .filter(function (r) {
          return String(r.BAIXADO || '').trim().toUpperCase() !== 'S';
        });
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler aba ESTOQUE — ' + e.message);
      return 0;
    }
    return unidades.length;
  }

  function getSkuDaBaixa_(sheetId, estoqueIds) {
    if (!estoqueIds || estoqueIds.length === 0) return '';
    try {
      var rows = EstoqueRepository.getRows(sheetId);
      var idToSku = {};
      for (var i = 0; i < rows.length; i++) {
        idToSku[rows[i].ESTOQUE_ID] = rows[i].SKU || '';
      }
      for (var j = 0; j < estoqueIds.length; j++) {
        if (idToSku[estoqueIds[j]]) return idToSku[estoqueIds[j]];
      }
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler SKU de baixa — ' + e.message);
    }
    return '';
  }

  return {
    describe: describe,
    addExit: addExit,
    listExits: listExits,
    validateExit: validateExit,
    getAvailableProducts: getAvailableProducts,
    getClienteHistory: getClienteHistory,
    fmtDateBR: _fmtDataBR_
  };
})();