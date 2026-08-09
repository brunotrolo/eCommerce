/**
 * EstoquePrecoService — atualização de preços de venda em estoque.
 * Atualiza PRECO_VENDA_SHOPEE e PRECO_VENDA_MERCADO_LIVRE para todos
 * items DISPONÍVEL de um produto, recalculando margens automaticamente.
 * Regras completas em specs/estoque-preco-update.md.
 */
var EstoquePrecoService = (function () {
  function describe() {
    return {
      name: 'estoquePreco',
      actions: {
        updatePrecoVenda: {
          description: 'Atualiza preço de venda para todos items DISPONÍVEL de um produto.',
          params: {
            codigoProduto: { type: 'string', required: true },
            precoVendaShopee: { type: 'number', required: false },
            precoVendaMercadoLivre: { type: 'number', required: false }
          },
          returns: {
            success: 'boolean', itemsAtualizados: 'number', descricaoProduto: 'string',
            precosAntigos: 'object', precosNovos: 'object', margensNovas: 'object',
            alertasGerados: 'array'
          }
        },
        simularMudancaPreco: {
          description: 'Simula mudança de preço sem aplicar (preview de margem e avisos).',
          params: {
            codigoProduto: { type: 'string', required: true },
            novoPrecoShopee: { type: 'number', required: false },
            novoPrecoMercadoLivre: { type: 'number', required: false }
          },
          returns: {
            codigoProduto: 'string', descricaoProduto: 'string',
            precoCustoMaisRecente: 'number',
            precoAtualShopee: 'number', precoAtualMercadoLivre: 'number',
            precoSimuladoShopee: 'number', precoSimuladoMercadoLivre: 'number',
            margemSimuladaShopee: 'number', margemSimuladaMercadoLivre: 'number',
            alertas: 'array'
          }
        },
        getUltimosPrecosPorProduto: {
          description: 'Retorna preço atual e estado de um produto.',
          params: {
            codigoProduto: { type: 'string', required: true },
            marketplace: { type: 'string', required: false }
          },
          returns: {
            codigoProduto: 'string', descricaoProduto: 'string',
            precoCustoMaisRecente: 'number', precoAtual: 'number', margemAtual: 'number'
          }
        }
      }
    };
  }

  function getSheetId_() {
    var sheetId = ConfigService.getNfeEntradaSheetId();
    if (!sheetId || (typeof sheetId === 'object' && sheetId.error)) return null;
    return sheetId;
  }

  var MARKETPLACE_LABELS_ = { shopee: 'Shopee', mercado_livre: 'Mercado Livre' };

  /**
   * Motor único de margem — sempre via PricingService.calculateNetMargin,
   * nunca (preço-custo)/preço bruto. Ver specs/pricing.md e specs/estoque.md.
   * @param {string} marketplace 'shopee' | 'mercado_livre'
   * @return {number|string} margem em % (ex.: 10.67), ou '' se preço inválido
   */
  function calcularMargem_(precoVenda, precoCusto, marketplace) {
    if (!precoVenda || precoVenda === 0) return '';
    var result = PricingService.calculateNetMargin({
      salePrice: precoVenda,
      unitCost: precoCusto,
      marketplace: marketplace
    });
    if (result.error) return '';
    return Math.round(result.netMarginPct * 10000) / 100;
  }

  function gerarAlertas_(precoCusto, precoNovo, marketplace) {
    var label = MARKETPLACE_LABELS_[marketplace] || marketplace;
    var alertas = [];
    if (precoNovo <= 0) {
      alertas.push({ tipo: 'preco_zero', marketplace: label, msg: 'Preço zero ou negativo' });
      return alertas;
    }

    var result = PricingService.calculateNetMargin({
      salePrice: precoNovo,
      unitCost: precoCusto,
      marketplace: marketplace
    });
    if (result.error) {
      alertas.push({ tipo: 'erro_calculo', marketplace: label, msg: result.error });
      return alertas;
    }

    var margem = Math.round(result.netMarginPct * 10000) / 100;

    if (result.netReceived < precoCusto) {
      alertas.push({
        tipo: 'prejuizo',
        marketplace: label,
        msg: 'Prejuízo ' + label + ': líquido R$' + result.netReceived.toFixed(2) + ' abaixo do custo R$' + precoCusto.toFixed(2)
      });
    }
    if (margem >= 0 && margem < 10) {
      alertas.push({
        tipo: 'margem_baixa',
        marketplace: label,
        msg: 'Margem ' + label + ' será ' + margem.toFixed(1) + '%, abaixo de 10%'
      });
    }
    if (margem > 80) {
      alertas.push({
        tipo: 'margem_alta',
        marketplace: label,
        msg: 'Margem muito alta (' + margem.toFixed(1) + '%), verificar'
      });
    }
    return alertas;
  }

  function updatePrecoVenda(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var codigoProduto = String(params.codigoProduto || '').trim();
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };

    var precoShopee = params.precoVendaShopee != null ? parseFloat(params.precoVendaShopee) : null;
    var precoML = params.precoVendaMercadoLivre != null ? parseFloat(params.precoVendaMercadoLivre) : null;

    if (precoShopee === null && precoML === null) {
      return { error: 'Informe ao menos um preço (Shopee ou Mercado Livre).' };
    }

    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
    if (items.length === 0) {
      return { error: 'Nenhum item DISPONÍVEL para este produto.' };
    }

    var precoCusto = parseFloat(items[0].PRECO_CUSTO_ORIGINAL) || 0;
    var descricao = items[0].DESCRICAO_PRODUTO || '';

    var precosAntigos = {
      shopee: items[0].PRECO_VENDA_SHOPEE || '',
      mercadoLivre: items[0].PRECO_VENDA_MERCADO_LIVRE || ''
    };

    var alertas = [];
    var updates = {};
    var estoqueIds = [];

    for (var i = 0; i < items.length; i++) {
      estoqueIds.push(items[i].ESTOQUE_ID);
    }

    if (precoShopee !== null) {
      if (precoShopee <= 0) {
        return { error: 'Preço deve ser > 0.' };
      }
      var margemS = calcularMargem_(precoShopee, precoCusto, 'shopee');
      updates.precoVendaShopee = precoShopee;
      updates.margemShopee = margemS;
      alertas = alertas.concat(gerarAlertas_(precoCusto, precoShopee, 'shopee'));
    }

    if (precoML !== null) {
      if (precoML <= 0) {
        return { error: 'Preço deve ser > 0.' };
      }
      var margemML = calcularMargem_(precoML, precoCusto, 'mercado_livre');
      updates.precoVendaMercadoLivre = precoML;
      updates.margemMercadoLivre = margemML;
      alertas = alertas.concat(gerarAlertas_(precoCusto, precoML, 'mercado_livre'));
    }

    var result = EstoqueRepository.updateRowsBulk(sheetId, estoqueIds, updates);

    return {
      success: true,
      itemsAtualizados: result.updated || 0,
      descricaoProduto: descricao,
      precosAntigos: precosAntigos,
      precosNovos: {
        shopee: precoShopee,
        mercadoLivre: precoML
      },
      margensNovas: {
        shopee: precoShopee !== null ? calcularMargem_(precoShopee, precoCusto, 'shopee') : '',
        mercadoLivre: precoML !== null ? calcularMargem_(precoML, precoCusto, 'mercado_livre') : ''
      },
      alertasGerados: alertas
    };
  }

  function simularMudancaPreco(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var codigoProduto = String(params.codigoProduto || '').trim();
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };

    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
    if (items.length === 0) {
      return { error: 'Nenhum item DISPONÍVEL para este produto.' };
    }

    var precoCusto = parseFloat(items[0].PRECO_CUSTO_ORIGINAL) || 0;
    var descricao = items[0].DESCRICAO_PRODUTO || '';
    var precoAtualS = items[0].PRECO_VENDA_SHOPEE || '';
    var precoAtualML = items[0].PRECO_VENDA_MERCADO_LIVRE || '';

    var novoPrecoS = params.novoPrecoShopee != null ? parseFloat(params.novoPrecoShopee) : null;
    var novoPrecoML = params.novoPrecoMercadoLivre != null ? parseFloat(params.novoPrecoMercadoLivre) : null;

    var alertas = [];

    var margemSimS = '';
    if (novoPrecoS !== null) {
      margemSimS = calcularMargem_(novoPrecoS, precoCusto, 'shopee');
      alertas = alertas.concat(gerarAlertas_(precoCusto, novoPrecoS, 'shopee'));
    }

    var margemSimML = '';
    if (novoPrecoML !== null) {
      margemSimML = calcularMargem_(novoPrecoML, precoCusto, 'mercado_livre');
      alertas = alertas.concat(gerarAlertas_(precoCusto, novoPrecoML, 'mercado_livre'));
    }

    return {
      codigoProduto: codigoProduto,
      descricaoProduto: descricao,
      precoCustoMaisRecente: precoCusto,
      precoAtualShopee: precoAtualS,
      precoAtualMercadoLivre: precoAtualML,
      precoSimuladoShopee: novoPrecoS,
      precoSimuladoMercadoLivre: novoPrecoML,
      margemSimuladaShopee: margemSimS,
      margemSimuladaMercadoLivre: margemSimML,
      alertas: alertas
    };
  }

  function getUltimosPrecosPorProduto(params) {
    var sheetId = getSheetId_();
    if (!sheetId) return { error: 'Sheet ID não configurado.' };

    var codigoProduto = String(params.codigoProduto || '').trim();
    if (!codigoProduto) return { error: 'codigoProduto é obrigatório.' };

    var items = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, codigoProduto);
    if (items.length === 0) {
      return { error: 'Produto não encontrado em ESTOQUE.' };
    }

    var marketplace = params.marketplace === 'mercado_livre' ? 'mercado_livre' : 'shopee';
    var item = items[0];
    var precoCusto = parseFloat(item.PRECO_CUSTO_ORIGINAL) || 0;
    var precoVenda = marketplace === 'shopee'
      ? (parseFloat(item.PRECO_VENDA_SHOPEE) || 0)
      : (parseFloat(item.PRECO_VENDA_MERCADO_LIVRE) || 0);
    var margem = calcularMargem_(precoVenda, precoCusto, marketplace);

    return {
      codigoProduto: codigoProduto,
      descricaoProduto: item.DESCRICAO_PRODUTO || '',
      precoCustoMaisRecente: precoCusto,
      precoAtual: precoVenda,
      margemAtual: margem
    };
  }

  return {
    describe: describe,
    updatePrecoVenda: updatePrecoVenda,
    simularMudancaPreco: simularMudancaPreco,
    getUltimosPrecosPorProduto: getUltimosPrecosPorProduto
  };
})();
