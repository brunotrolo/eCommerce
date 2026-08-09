/**
 * ManualEntradaService — registro de entrada de produtos sem Nota Fiscal.
 * Aba complementar a NFE_ENTRADA_PRODUTOS para compras diretas, fornecedores
 * sem documentação formal, etc. Regras de negócio documentadas no código abaixo.
 */
var ManualEntradaService = (function () {
  function describe() {
    return {
      name: 'manualEntrada',
      actions: {
        addEntry: {
          description: 'Registra uma entrada manual em MANUAL_ENTRADA_PRODUTOS.',
          params: {
            codigoProduto: { type: 'string', required: true },
            descricaoProduto: { type: 'string', required: true },
            quantidade: { type: 'number', required: true },
            valorUnitario: { type: 'number', required: true },
            emitenteNome: { type: 'string', required: true },
            dataCompra: { type: 'string', required: false },
            valorOutrosItem: { type: 'number', required: false },
            observacoes: { type: 'string', required: false },
            ncm: { type: 'string', required: false }
          },
          returns: { success: 'boolean', entryId: 'string', processedAt: 'string', row: 'object', estoqueImportado: 'object', errors: 'array' }
        },
        listEntries: {
          description: 'Lista entradas manuais ou filtra por código de produto.',
          params: {
            codigoProduto: { type: 'string', required: false },
            limit: { type: 'number', required: false }
          },
          returns: { entries: 'array' }
        },
        validateEntry: {
          description: 'Valida dados antes de inserir (sem efetivamente inserir).',
          params: {
            codigoProduto: { type: 'string', required: true },
            descricaoProduto: { type: 'string', required: true },
            quantidade: { type: 'number', required: true },
            valorUnitario: { type: 'number', required: true },
            emitenteNome: { type: 'string', required: true },
            dataCompra: { type: 'string', required: false },
            valorOutrosItem: { type: 'number', required: false },
            observacoes: { type: 'string', required: false },
            ncm: { type: 'string', required: false }
          },
          returns: { valid: 'boolean', warnings: 'array', errors: 'array' }
        },
        getSupplierHistory: {
          description: 'Retorna histórico de fornecedores já usados (autocomplete).',
          params: {},
          returns: { suppliers: 'array' }
        }
      }
    };
  }

  function addEntry(params) {
    var validation = validateEntry(params);
    if (!validation.valid) {
      return { error: validation.errors.join('; ') };
    }

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID não configurado.' };
    }

    var quantidade = parseFloat(params.quantidade) || 0;
    var valorUnitario = parseFloat(params.valorUnitario) || 0;
    var valorOutrosItem = parseFloat(params.valorOutrosItem) || 0;

    var valorTotal = Math.round(quantidade * valorUnitario * 100) / 100;
    var valorLiquidoItem = Math.round((valorTotal + valorOutrosItem) * 100) / 100;
    var valorUnitarioLiquido = quantidade > 0 ? Math.round((valorLiquidoItem / quantidade) * 100) / 100 : 0;

    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd'T'HHmmss");
    var nonce = Utilities.getUuid().substring(0, 6);
    var logId = timestamp + '-' + nonce;

    var skuResult = SkuService.generate({
      descricaoProduto: params.descricaoProduto || params.codigoProduto,
      ncm: params.ncm || ''
    });

    var dataCompra = params.dataCompra || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');

    var rowData = {
      codigoProduto: params.codigoProduto,
      sku: skuResult.sku,
      descricaoProduto: params.descricaoProduto,
      ncm: params.ncm || '',
      quantidade: quantidade,
      valorUnitario: valorUnitario,
      valorTotal: valorTotal,
      status: 'Recebido',
      dataEntrada: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      tipoMovimentacao: 'Entrada Manual',
      logId: logId,
      valorOutrosItem: valorOutrosItem,
      tipoOutros: valorOutrosItem > 0 ? 'ITEM' : 'NENHUM',
      valorLiquidoItem: valorLiquidoItem,
      valorUnitarioLiquido: valorUnitarioLiquido,
      emitenteNome: params.emitenteNome,
      dataCompra: dataCompra,
      observacoes: params.observacoes || ''
    };

    var warnings = [];
    var nfeSheetId = ConfigService.getNfeEntradaSheetId();
    if (nfeSheetId) {
      var existing = NFeEntradaProdutosRepository.getProdutosByCodigo(nfeSheetId, params.codigoProduto);
      if (!existing || existing.length === 0) {
        warnings.push('Produto não encontrado em NFE_ENTRADA_PRODUTOS');
      }
    }

    var result = ManualEntradaProdutosRepository.appendRow(sheetId, rowData);

    var estoqueImportado = null;
    if (result.success) {
      try {
        estoqueImportado = EstoqueService.importarDeManualEntrada({ logId: logId });
        if (estoqueImportado && estoqueImportado.success && estoqueImportado.itemsImported > 0) {
          CacheRepository.invalidateByPattern('catalog_');
          CacheRepository.invalidateByPattern('estoque_');
          CacheRepository.invalidateByPattern('dashboard_');
        }
      } catch (e) {
        estoqueImportado = { error: 'Falha ao incluir no estoque: ' + (e.message || String(e)) };
      }
    }

    return {
      success: result.success,
      entryId: logId,
      processedAt: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
      row: rowData,
      warnings: warnings,
      estoqueImportado: estoqueImportado,
      errors: []
    };
  }

  function listEntries(params) {
    params = params || {};
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID não configurado.' };
    }

    var limit = params.limit || 100;
    var rows = ManualEntradaProdutosRepository.getRows(sheetId, params.codigoProduto);

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
      console.warn('ManualEntradaService: erro ao carregar catálogo p/ preços — ' + e.message);
    }

    var entries = [];
    for (var i = 0; i < rows.length && i < limit; i++) {
      var r = rows[i];
      var sku = String(r.SKU || '').trim();
      var cod = String(r.CODIGO_PRODUTO || '').trim();
      var precos = precoMap[cod] || { shopee: 0, mercadoLivre: 0 };
      entries.push({
        codigoProduto: r.CODIGO_PRODUTO || '',
        sku: sku,
        categoria: SkuService.getCategoryByCodigo(cod, sku),
        descricaoProduto: r.DESCRICAO_PRODUTO || '',
        ncm: r.NCM || '',
        quantidade: parseFloat(r.QUANTIDADE) || 0,
        valorUnitario: parseFloat(r.VALOR_UNITARIO) || 0,
        valorTotal: parseFloat(r.VALOR_TOTAL) || 0,
        status: r.STATUS || '',
        dataEntrada: r.DATA_ENTRADA || '',
        tipoMovimentacao: r.TIPO_MOVIMENTACAO || '',
        logId: r.LOG_ID || '',
        valorOutrosItem: parseFloat(r.VALOR_OUTROS_ITEM) || 0,
        tipoOutros: r.TIPO_OUTROS || '',
        valorLiquidoItem: parseFloat(r.VALOR_LIQUIDO_ITEM) || 0,
        valorUnitarioLiquido: parseFloat(r.VALOR_UNITARIO_LIQUIDO) || 0,
        emitenteNome: r.EMITENTE_NOME || '',
        dataCompra: r.DATA_COMPRA || '',
        observacoes: r.OBSERVACOES || '',
        precoSugeridoShopee: precos.shopee,
        precoSugeridoMercadoLivre: precos.mercadoLivre
      });
    }

    return { entries: entries };
  }

  function validateEntry(params) {
    var errors = [];
    var warnings = [];

    if (!params.codigoProduto || String(params.codigoProduto).trim() === '') {
      errors.push('Missing required field: codigoProduto');
    }
    if (!params.descricaoProduto || String(params.descricaoProduto).trim() === '') {
      errors.push('Missing required field: descricaoProduto');
    }
    if (!params.emitenteNome || String(params.emitenteNome).trim() === '') {
      errors.push('Fornecedor é obrigatório');
    }

    var quantidade = parseFloat(params.quantidade);
    if (isNaN(quantidade) || quantidade <= 0) {
      errors.push('Quantidade must be > 0');
    }

    var valorUnitario = parseFloat(params.valorUnitario);
    if (isNaN(valorUnitario) || valorUnitario < 0) {
      errors.push('valorUnitario must be >= 0');
    }

    return { valid: errors.length === 0, warnings: warnings, errors: errors };
  }

  function getSupplierHistory() {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { suppliers: [] };
    }
    return { suppliers: ManualEntradaProdutosRepository.getSupplierHistory(sheetId) };
  }

  return {
    describe: describe,
    addEntry: addEntry,
    listEntries: listEntries,
    validateEntry: validateEntry,
    getSupplierHistory: getSupplierHistory
  };
})();
