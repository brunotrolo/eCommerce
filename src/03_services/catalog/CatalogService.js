/**
 * CatalogService — Catálogo unificado de produtos recebidos (status='Recebido'),
 * agrupados por código, com custo unitário líquido mais recente e preços
 * sugeridos para Shopee e Mercado Livre. Regras completas em specs/catalog.md.
 */
var CatalogService = (function () {
  function describe() {
    return {
      name: 'catalog',
      actions: {
        getProducts: {
          description: 'Retorna lista de produtos únicos com status "Recebido", agrupados por código, com preço sugerido para ambos os marketplaces.',
          params: {
            targetMarginShopee: { type: 'number', required: false, default: 0.25, description: 'Margem alvo Shopee (0-1)' },
            targetMarginMercadoLivre: { type: 'number', required: false, default: 0.25, description: 'Margem alvo Mercado Livre (0-1)' },
            sortBy: { type: 'string', required: false, default: 'code', enum: ['code', 'description', 'unitCost', 'suggestedShopee'], description: 'Campo de ordenação' },
            sortOrder: { type: 'string', required: false, default: 'asc', enum: ['asc', 'desc'], description: 'Ordem crescente ou decrescente' }
          },
          returns: {
            success: 'boolean',
            data: 'array',
            totalCount: 'number',
            lastSync: 'string'
          }
        },
        getProductByCode: {
          description: 'Retorna todas as entradas (histórico) de um código de produto específico.',
          params: {
            codigoProduto: { type: 'string', required: true, description: 'Código do produto' }
          },
          returns: {
            success: 'boolean',
            data: 'array',
            count: 'number'
          }
        },
        getCalculationMemory: {
          description: 'Retorna a memória de cálculo detalhada (passo a passo) de como o preço sugerido foi derivado do VALOR_UNITARIO_LIQUIDO.',
          params: {
            codigoProduto: { type: 'string', required: true, description: 'Código do produto' },
            marketplace: { type: 'string', required: true, enum: ['shopee', 'mercado_livre'], description: 'Marketplace' },
            targetMargin: { type: 'number', required: false, default: 0.25, description: 'Margem alvo utilizada' }
          },
          returns: {
            success: 'boolean',
            data: 'object'
          }
        }
      }
    };
  }

  function getProducts(params) {
    params = params || {};
    var cacheKey = 'catalog_products_' + JSON.stringify(params);
    var result = CacheRepository.getOrCompute(cacheKey, 300, function () {
      return computeProducts_(params);
    });
    return result.value;
  }

  function computeProducts_(params) {
    var targetMarginShopee = typeof params.targetMarginShopee === 'number' ? params.targetMarginShopee : 0.25;
    var targetMarginMercadoLivre = typeof params.targetMarginMercadoLivre === 'number' ? params.targetMarginMercadoLivre : 0.25;
    var sortBy = params.sortBy || 'code';
    var sortOrder = params.sortOrder || 'asc';

    if (targetMarginShopee < 0 || targetMarginShopee >= 1) {
      return { error: 'targetMarginShopee deve estar entre 0 (inclusive) e 1 (exclusivo).' };
    }
    if (targetMarginMercadoLivre < 0 || targetMarginMercadoLivre >= 1) {
      return { error: 'targetMarginMercadoLivre deve estar entre 0 (inclusive) e 1 (exclusivo).' };
    }

    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID NFE_ENTRADA_PRODUTOS não configurado.' };
    }

    var allProdutos;
    try {
      allProdutos = NFeEntradaProdutosRepository.getProdutos(sheetId);
    } catch (e) {
      return { error: 'Erro ao buscar produtos NF: ' + e.message };
    }

    var allProdutosManual = [];
    try {
      allProdutosManual = ManualEntradaProdutosRepository.getRows(sheetId);
    } catch (e) {
      console.warn('CatalogService: Erro ao ler aba manual — ' + e.message);
    }

    var allProdutos = allProdutos.concat(allProdutosManual);

    if (!allProdutos || allProdutos.length === 0) {
      return { success: true, data: [], totalCount: 0, lastSync: new Date().toISOString() };
    }

    var filtered = [];
    for (var i = 0; i < allProdutos.length; i++) {
      var status = String(allProdutos[i].STATUS || '').trim().toLowerCase();
      if (status === 'recebido') {
        filtered.push(allProdutos[i]);
      }
    }

    if (filtered.length === 0) {
      return { success: true, data: [], totalCount: 0, lastSync: new Date().toISOString() };
    }

    var grouped = {};
    for (var j = 0; j < filtered.length; j++) {
      var row = filtered[j];
      var cod = String(row.CODIGO_PRODUTO || '').trim();
      if (!cod) continue;

      var dataEmissao = row.DATA_EMISSAO || row.DATA_ENTRADA || '';
      var existing = grouped[cod];

      if (!existing) {
        grouped[cod] = {
          codigoProduto: cod,
          descricaoProduto: row.DESCRICAO_PRODUTO || '',
          valorUnitarioLiquido: parseFloat(row.VALOR_UNITARIO_LIQUIDO),
          dataEmissaoMaisRecente: dataEmissao,
          emitenteMaisRecente: row.EMITENTE_NOME || '',
          totalEntradas: 1,
          _rows: [row]
        };
        if (isNaN(grouped[cod].valorUnitarioLiquido)) {
          grouped[cod].valorUnitarioLiquido = parseFloat(row.VALOR_UNITARIO) || 0;
        }
      } else {
        existing.totalEntradas++;
        existing._rows.push(row);
        var newData = new Date(dataEmissao);
        var existingData = new Date(existing.dataEmissaoMaisRecente);
        if (newData > existingData) {
          existing.valorUnitarioLiquido = parseFloat(row.VALOR_UNITARIO_LIQUIDO);
          if (isNaN(existing.valorUnitarioLiquido)) {
            existing.valorUnitarioLiquido = parseFloat(row.VALOR_UNITARIO) || 0;
          }
          existing.dataEmissaoMaisRecente = dataEmissao;
          existing.emitenteMaisRecente = row.EMITENTE_NOME || '';
        }
      }
    }

    var products = [];
    var codes = Object.keys(grouped);
    for (var k = 0; k < codes.length; k++) {
      var p = grouped[codes[k]];
      var cost = p.valorUnitarioLiquido;

      if (cost < 0) {
        p.precoShopee = 0;
        p.precoMercadoLivre = 0;
        p.margemCalculadaShopee = 0;
        p.margemCalculadaMercadoLivre = 0;
      } else {
        var shopeeResult = PricingService.calculateSuggestedPrice({
          unitCost: cost,
          targetMarginPct: targetMarginShopee,
          marketplace: 'shopee'
        });
        var mlResult = PricingService.calculateSuggestedPrice({
          unitCost: cost,
          targetMarginPct: targetMarginMercadoLivre,
          marketplace: 'mercado_livre'
        });

        p.precoShopee = shopeeResult.suggestedPrice || 0;
        p.precoMercadoLivre = mlResult.suggestedPrice || 0;
        p.margemCalculadaShopee = shopeeResult.netMarginPct || 0;
        p.margemCalculadaMercadoLivre = mlResult.netMarginPct || 0;
      }

      delete p._rows;
      products.push(p);
    }

    var sortField = {
      code: 'codigoProduto',
      description: 'descricaoProduto',
      unitCost: 'valorUnitarioLiquido',
      suggestedShopee: 'precoShopee'
    }[sortBy] || 'codigoProduto';

    products.sort(function (a, b) {
      var valA = a[sortField];
      var valB = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return {
      success: true,
      data: products,
      totalCount: products.length,
      lastSync: new Date().toISOString()
    };
  }

  function getProductByCode(params) {
    if (!params || !params.codigoProduto) {
      return { error: 'Parâmetro obrigatório ausente: codigoProduto' };
    }

    var codigoProduto = String(params.codigoProduto).trim();
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID NFE_ENTRADA_PRODUTOS não configurado.' };
    }

    var allRows;
    try {
      allRows = NFeEntradaProdutosRepository.getProdutosByCodigo(sheetId, codigoProduto);
    } catch (e) {
      return { error: 'Erro ao buscar histórico: ' + e.message };
    }

    var entries = [];
    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      entries.push({
        numeroNf: r.NUMERO_NF || '',
        chaveNf: r.CHAVE_NF || '',
        dataEmissao: r.DATA_EMISSAO || '',
        emitenteCnpj: r.EMITENTE_CNPJ || '',
        emitenteNome: r.EMITENTE_NOME || '',
        quantidade: parseFloat(r.QUANTIDADE) || 0,
        valorUnitario: parseFloat(r.VALOR_UNITARIO) || 0,
        valorLiquidoItem: parseFloat(r.VALOR_LIQUIDO_ITEM) || 0,
        valorUnitarioLiquido: parseFloat(r.VALOR_UNITARIO_LIQUIDO) || parseFloat(r.VALOR_UNITARIO) || 0,
        status: r.STATUS || ''
      });
    }

    entries.sort(function (a, b) {
      var dA = new Date(a.dataEmissao);
      var dB = new Date(b.dataEmissao);
      return dB - dA;
    });

    return { success: true, data: entries, count: entries.length };
  }

  function getCalculationMemory(params) {
    if (!params || !params.codigoProduto) {
      return { error: 'Parâmetro obrigatório ausente: codigoProduto' };
    }
    if (!params.marketplace) {
      return { error: 'Parâmetro obrigatório ausente: marketplace' };
    }

    var marketplace = params.marketplace;
    if (marketplace !== 'shopee' && marketplace !== 'mercado_livre') {
      return { error: 'marketplace deve ser "shopee" ou "mercado_livre".' };
    }

    var targetMargin = typeof params.targetMargin === 'number' ? params.targetMargin : 0.25;
    if (targetMargin < 0 || targetMargin >= 1) {
      return { error: 'targetMargin deve estar entre 0 (inclusive) e 1 (exclusivo).' };
    }

    var codigoProduto = String(params.codigoProduto).trim();
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) {
      return { error: 'Sheet ID NFE_ENTRADA_PRODUTOS não configurado.' };
    }

    var allRows;
    try {
      allRows = NFeEntradaProdutosRepository.getProdutosByCodigo(sheetId, codigoProduto);
    } catch (e) {
      return { error: 'Erro ao buscar produto: ' + e.message };
    }

    if (!allRows || allRows.length === 0) {
      return { error: 'Produto não encontrado: ' + codigoProduto };
    }

    var mostRecent = null;
    var mostRecentDate = null;
    for (var i = 0; i < allRows.length; i++) {
      var row = allRows[i];
      var d = new Date(row.DATA_EMISSAO);
      if (!mostRecent || d > mostRecentDate) {
        mostRecent = row;
        mostRecentDate = d;
      }
    }

    var unitCost = parseFloat(mostRecent.VALOR_UNITARIO_LIQUIDO);
    if (isNaN(unitCost)) unitCost = parseFloat(mostRecent.VALOR_UNITARIO) || 0;
    var descricao = mostRecent.DESCRICAO_PRODUTO || '';

    var fee = ConfigService.getMarketplaceFee(marketplace);
    var feeDescription = marketplace === 'shopee'
      ? 'Shopee: ' + (fee.pct * 100).toFixed(0) + '% flat'
      : 'Mercado Livre: ' + (fee.pct * 100).toFixed(0) + '% + R$ ' + fee.fixed.toFixed(2);

    var denom = 1 - fee.pct - targetMargin;
    var suggestedPrice = denom > 0 ? (unitCost + fee.fixed) / denom : 0;
    suggestedPrice = Math.round(suggestedPrice * 100) / 100;

    var marketplaceFee = Math.round((suggestedPrice * fee.pct + fee.fixed) * 100) / 100;
    var netProfit = Math.round((suggestedPrice - marketplaceFee - unitCost) * 100) / 100;
    var netMargin = suggestedPrice > 0 ? Math.round((netProfit / suggestedPrice) * 10000) / 10000 : 0;

    var passos = [];
    var ordem = 1;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Custo Unitário Líquido',
      valor: unitCost,
      detalhes: 'VALOR_UNITARIO_LIQUIDO = ' + formatBRL_(unitCost),
      formula: formatBRL_(unitCost)
    });
    ordem++;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Margem Alvo (' + (targetMargin * 100).toFixed(0) + '%)',
      valor: targetMargin,
      detalhes: 'Margem desejada sobre o preço de venda',
      formula: (targetMargin * 100).toFixed(0) + '%'
    });
    ordem++;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Taxa ' + (marketplace === 'shopee' ? 'Shopee' : 'Mercado Livre'),
      valor: fee.pct,
      detalhes: feeDescription,
      formula: marketplace === 'shopee'
        ? (fee.pct * 100).toFixed(0) + '% flat'
        : (fee.pct * 100).toFixed(0) + '% + ' + formatBRL_(fee.fixed)
    });
    ordem++;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Fórmula do Preço',
      valor: suggestedPrice,
      detalhes: 'Preço = (Custo + Taxa Fixa) / (1 - Taxa% - Margem%)',
      formula: '(' + formatBRL_(unitCost) + ' + ' + formatBRL_(fee.fixed) + ') / (1 - ' +
        (fee.pct * 100).toFixed(0) + '% - ' + (targetMargin * 100).toFixed(0) + '%)'
    });
    ordem++;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Preço Sugerido Final',
      valor: suggestedPrice,
      detalhes: 'Resultado do cálculo',
      formula: formatBRL_(suggestedPrice)
    });
    ordem++;

    passos.push({
      ordem: ordem,
      descricao: ordem + '. Verificação: Lucro Líquido',
      valor: netProfit,
      detalhes: 'Lucro por unidade após deduções',
      formula: formatBRL_(netProfit) + ' (' + netMargin.toFixed(1) + '% do preço)'
    });

    return {
      success: true,
      data: {
        codigoProduto: codigoProduto,
        descricao: descricao,
        marketplace: marketplace,
        passos: passos,
        resumo: {
          valorUnitarioLiquido: unitCost,
          margemAlvo: targetMargin,
          taxaMarketplace: {
            percentual: fee.pct,
            fixo: fee.fixed,
            descricao: feeDescription
          },
          precoSugerido: suggestedPrice,
          margemLiquida: netMargin,
          lucroLiquidoPorUnidade: netProfit
        }
      }
    };
  }

  function formatBRL_(value) {
    if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  return {
    describe: describe,
    getProducts: getProducts,
    getProductByCode: getProductByCode,
    getCalculationMemory: getCalculationMemory
  };
})();
