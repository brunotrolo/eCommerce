/**
 * NFeEntradaProdutosService — desagrega PRODUTOS_JSON das NFes importadas
 * em linhas individuais na aba NFE_ENTRADA_PRODUTOS, uma linha por produto,
 * com referência completa aos dados da NF de origem para auditoria cruzada.
 *
 * Regras completas em specs/nfe-entrada-produtos.md.
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
        getEstoque: {
          description: 'Retorna estoque agregado por produto com referência às NFs de origem.',
          params: {
            codigoProduto: { type: 'string', required: false }
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
      return { success: true, processedAt: new Date().toISOString(), productCount: 0, totalQuantity: 0, totalValue: 0, errors: [] };
    }

    var nfeProdutosSheetId = sheetId; // usa a mesma planilha, aba diferente
    var insertedRows = [];
    var totalQuantity = 0;
    var totalValue = 0;
    var errors = [];
    var skippedDuplicate = 0;
    var logId = generateLogId_();
    var now = new Date().toISOString();
    var dataEmissao = nfe.DATA_EMISSAO || '';
    var emitenteCnpj = nfe.EMITENTE_CNPJ || '';
    var emitenteNome = nfe.EMITENTE_NOME || '';

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

      insertedRows.push({
        numeroNf: numeroNf,
        chaveNf: nfe.CHAVE_NF || chaveNf,
        dataEmissao: dataEmissao,
        emitenteCnpj: emitenteCnpj,
        emitenteNome: emitenteNome,
        codigoProduto: cod,
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
        logId: logId
      });
      totalQuantity += insertedRows[insertedRows.length - 1].quantidade;
      totalValue += vProd;
    }

    var insertResult = { inserted: 0, errors: [] };
    if (insertedRows.length > 0) {
      insertResult = NFeEntradaProdutosRepository.insertProdutos(insertedRows, nfeProdutosSheetId);
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

  return {
    describe: describe,
    processarNf: processarNf,
    processarTodasNfs: processarTodasNfs,
    getEstoque: getEstoque
  };
})();