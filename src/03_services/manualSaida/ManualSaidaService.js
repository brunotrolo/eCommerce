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
          description: 'Registra uma saída manual em MANUAL_SAIDA_PRODUTOS.',
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
          returns: { success: 'boolean', exitId: 'string', processedAt: 'string', estoqueRestante: 'number', row: 'object', errors: 'array' }
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

    var valorUnitarioLiquido = produtoOrigem.valorUnitarioLiquido;

    var rowData = {
      codigoProduto: params.codigoProduto,
      descricaoProduto: params.descricaoProduto,
      ncm: produtoOrigem.ncm,
      quantidade: quantidade,
      tipoSaida: tipoSaida,
      precoUnitario: precoUnitario,
      valorTotal: valorTotal,
      valorUnitario: valorUnitarioLiquido,
      valorUnitarioLiquido: valorUnitarioLiquido,
      valorLiquidoItem: Math.round(valorUnitarioLiquido * quantidade * 100) / 100,
      status: 'Saído',
      dataSaida: dataSaida,
      tipoMovimentacao: 'Saída Manual',
      logId: logId,
      clienteNome: params.clienteName || '',
      motivoPerda: (tipoSaida === 'Perda' ? (params.motivoPerda || '') : ''),
      dataRegistro: now.toISOString(),
      observacoes: params.observacoes || '',
      emitenteNome: produtoOrigem.emitenteNome,
      dataCompra: params.dataCompra || dataCompraOrigem,
      valorOutrosItem: produtoOrigem.valorOutrosItem,
      tipoOutros: produtoOrigem.tipoOutros
    };

    var result = ManualSaidaProdutosRepository.appendRow(sheetId, rowData);

    var estoqueRestante = _getEstoqueDisponivel(sheetId, params.codigoProduto);

    return {
      success: result.success,
      exitId: logId,
      processedAt: now.toISOString(),
      estoqueRestante: estoqueRestante,
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

    var exits = [];
    for (var i = 0; i < rows.length && i < limit; i++) {
      var r = rows[i];
      exits.push({
        codigoProduto: r.CODIGO_PRODUTO || '',
        descricaoProduto: r.DESCRICAO_PRODUTO || '',
        quantidade: parseFloat(r.QUANTIDADE) || 0,
        tipoSaida: r.TIPO_SAIDA || '',
        precoUnitario: parseFloat(r.PRECO_UNITARIO) || 0,
        valorTotal: parseFloat(r.VALOR_TOTAL) || 0,
        status: r.STATUS || '',
        dataSaida: r.DATA_SAIDA || '',
        tipoMovimentacao: r.TIPO_MOVIMENTACAO || '',
        logId: r.LOG_ID || '',
        clienteNome: r.CLIENTE_NOME || '',
        motivoPerda: r.MOTIVO_PERDA || '',
        dataRegistro: r.DATA_REGISTRO || '',
        observacoes: r.OBSERVACOES || '',
        ncm: r.NCM || '',
        valorUnitario: parseFloat(r.VALOR_UNITARIO) || 0,
        valorUnitarioLiquido: parseFloat(r.VALOR_UNITARIO_LIQUIDO) || 0,
        valorLiquidoItem: parseFloat(r.VALOR_LIQUIDO_ITEM) || 0
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

    var nfProdutos = [];
    try {
      nfProdutos = NFeEntradaProdutosRepository.getProdutos(sheetId);
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler NFeEntradaProdutos — ' + e.message);
    }

    var manualProdutos = [];
    try {
      manualProdutos = ManualEntradaProdutosRepository.getRows(sheetId);
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler ManualEntradaProdutos — ' + e.message);
    }

    var allProdutos = nfProdutos.concat(manualProdutos);

    var grouped = {};
    for (var i = 0; i < allProdutos.length; i++) {
      var row = allProdutos[i];
      var status = String(row.STATUS || '').trim().toLowerCase();
      if (status !== 'recebido') continue;

      var cod = String(row.CODIGO_PRODUTO || '').trim();
      if (!cod) continue;

      var qty = parseFloat(row.QUANTIDADE) || 0;
      var vUnitLiq = parseFloat(row.VALOR_UNITARIO_LIQUIDO);
      if (isNaN(vUnitLiq)) vUnitLiq = parseFloat(row.VALOR_UNITARIO) || 0;

      if (!grouped[cod]) {
        grouped[cod] = {
          codigoProduto: cod,
          descricaoProduto: row.DESCRICAO_PRODUTO || '',
          estoqueEntrada: 0,
          valorUnitarioLiquido: vUnitLiq,
          count: 0
        };
      }
      grouped[cod].estoqueEntrada += qty;
      grouped[cod].count++;
      grouped[cod].valorUnitarioLiquido = vUnitLiq;
    }

    var saidas = [];
    try {
      saidas = ManualSaidaProdutosRepository.getRows(sheetId);
    } catch (e) {
      console.warn('ManualSaidaService: Erro ao ler ManualSaidaProdutos — ' + e.message);
    }

    var saidasByCodigo = {};
    for (var j = 0; j < saidas.length; j++) {
      var sc = String(saidas[j].CODIGO_PRODUTO || '').trim();
      var sq = parseFloat(saidas[j].QUANTIDADE) || 0;
      if (!saidasByCodigo[sc]) saidasByCodigo[sc] = 0;
      saidasByCodigo[sc] += sq;
    }

    var products = [];
    var codes = Object.keys(grouped);
    var filtro = params.filtro ? String(params.filtro).trim().toLowerCase() : '';

    for (var k = 0; k < codes.length; k++) {
      var p = grouped[codes[k]];
      var estoqueSaida = saidasByCodigo[codes[k]] || 0;
      var estoqueDisponivel = Math.max(0, Math.round((p.estoqueEntrada - estoqueSaida) * 100) / 100);

      if (estoqueDisponivel <= 0) continue;

      if (filtro) {
        var matchCode = p.codigoProduto.toLowerCase().indexOf(filtro) !== -1;
        var matchDesc = p.descricaoProduto.toLowerCase().indexOf(filtro) !== -1;
        if (!matchCode && !matchDesc) continue;
      }

      products.push({
        codigoProduto: p.codigoProduto,
        descricaoProduto: p.descricaoProduto,
        estoqueDisponivel: estoqueDisponivel,
        precoUnitarioMedio: Math.round(p.valorUnitarioLiquido * 100) / 100
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

  function _getProdutoOrigem(sheetId, codigoProduto) {
    var info = {
      ncm: '',
      valorUnitarioLiquido: 0,
      emitenteNome: '',
      dataCompra: '',
      valorOutrosItem: 0,
      tipoOutros: ''
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
      if (r.DATA_COMPRA) info.dataCompra = String(r.DATA_COMPRA);
    }

    return info;
  }

  function _getEstoqueDisponivel(sheetId, codigoProduto) {
    var entradaNF = 0;
    try {
      var nfRows = NFeEntradaProdutosRepository.getProdutos(sheetId);
      for (var i = 0; i < nfRows.length; i++) {
        if (String(nfRows[i].CODIGO_PRODUTO || '').trim() === String(codigoProduto).trim()) {
          var st = String(nfRows[i].STATUS || '').trim().toLowerCase();
          if (st === 'recebido') {
            entradaNF += parseFloat(nfRows[i].QUANTIDADE) || 0;
          }
        }
      }
    } catch (e) { /* ignore */ }

    var entradaManual = 0;
    try {
      var manualRows = ManualEntradaProdutosRepository.getRows(sheetId);
      for (var j = 0; j < manualRows.length; j++) {
        if (String(manualRows[j].CODIGO_PRODUTO || '').trim() === String(codigoProduto).trim()) {
          entradaManual += parseFloat(manualRows[j].QUANTIDADE) || 0;
        }
      }
    } catch (e) { /* ignore */ }

    var saida = ManualSaidaProdutosRepository.getQtdByCodigo(sheetId, codigoProduto);

    return Math.max(0, Math.round((entradaNF + entradaManual - saida) * 100) / 100);
  }

  return {
    describe: describe,
    addExit: addExit,
    listExits: listExits,
    validateExit: validateExit,
    getAvailableProducts: getAvailableProducts,
    getClienteHistory: getClienteHistory
  };
})();