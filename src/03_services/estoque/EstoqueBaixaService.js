/**
 * EstoqueBaixaService — motor central de baixa de estoque (FIFO).
 * Seleciona unidades DISPONÍVEIS mais antigas de um codigoProduto e marca
 * VENDIDO, registrando a operação em ESTOQUE_BAIXAS.
 * Regras de negócio documentadas no código abaixo.
 */
var EstoqueBaixaService = (function () {
  var LOCK_TIMEOUT_MS = 5000;

  function describe() {
    return {
      name: 'estoqueBaixa',
      actions: {
        baixarPorProduto: {
          description: 'Baixa N unidades DISPONÍVEIS (FIFO) de um codigoProduto, registrando em ESTOQUE_BAIXAS.',
          params: {
            codigoProduto: { type: 'string', required: true },
            quantidade: { type: 'number', required: true },
            origem: { type: 'string', required: true, description: 'PEDIDO_SHOPEE ou SAIDA_MANUAL' },
            referenciaOrigem: { type: 'string', required: true },
            idempotencyKey: { type: 'string', required: true }
          },
          returns: { success: 'boolean', baixados: 'number', estoque_ids: 'array', faltantes: 'number', jaExistia: 'boolean' }
        },
        reverterBaixa: {
          description: 'Reverte uma baixa por referenciaOrigem.',
          params: {
            referenciaOrigem: { type: 'string', required: true },
            motivo: { type: 'string', required: true, description: 'CANCELADO ou DEVOLVIDO' }
          },
          returns: { success: 'boolean', revertidos: 'number', motivo: 'string' }
        },
        getBaixaStatus: {
          description: 'Consulta se uma referenciaOrigem já foi baixada.',
          params: {
            referenciaOrigem: { type: 'string', required: true }
          },
          returns: { jaBaixado: 'boolean', estoque_ids: 'array', status: 'string', baixadoEm: 'string' }
        },
        reprocessarPendentes: {
          description: 'Lê TODOS os pedidos da aba PEDIDOS e aplica baixa FIFO para os que ainda não foram baixados (BAIXADO ≠ S). Ignora pedidos cancelados/devolvidos.',
          params: {},
          returns: { processados: 'number', baixados: 'number', erros: 'number', jaProcessados: 'number' }
        }
      }
    };
  }

  function generateBaixaId_() {
    var now = new Date();
    var ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    var nonce = Utilities.getUuid().substring(0, 8);
    return ts + '-' + nonce;
  }

  function nowBr_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  function baixarPorProduto(params) {
    var errors = [];
    if (!params.codigoProduto || String(params.codigoProduto).trim() === '') {
      errors.push('codigoProduto obrigatório');
    }
    var quantidade = parseInt(params.quantidade, 10);
    if (isNaN(quantidade) || quantidade <= 0) {
      errors.push('quantidade deve ser > 0');
    }
    if (!params.origem) errors.push('origem obrigatório');
    if (!params.referenciaOrigem) errors.push('referenciaOrigem obrigatório');
    if (!params.idempotencyKey) errors.push('idempotencyKey obrigatório');
    if (errors.length > 0) return { success: false, error: errors.join('; ') };

    var sheetId = ConfigService.getSheetId();
    var lock = LockService.getScriptLock();

    try {
      lock.waitLock(LOCK_TIMEOUT_MS);
    } catch (e) {
      throw new Error('ESTOQUE_LOCK_TIMEOUT: não conseguiu lock em ' + LOCK_TIMEOUT_MS + 'ms');
    }

    try {
      // 1. Check idempotency
      var existing = EstoqueBaixasRepository.findByIdempotencyKey(sheetId, params.idempotencyKey);
      if (existing && String(existing.STATUS).trim() === 'BAIXADO') {
        // Lookup custoTotal from existing estoque items
        var custoTotalExistente = 0;
        var existingIds = (existing.ESTOQUE_IDS || '').split(',').filter(Boolean);
        if (existingIds.length > 0) {
          var allEstoque = EstoqueRepository.getRows(sheetId);
          var estoqueMap = {};
          for (var ei = 0; ei < allEstoque.length; ei++) {
            estoqueMap[allEstoque[ei].ESTOQUE_ID] = allEstoque[ei];
          }
          for (var ej = 0; ej < existingIds.length; ej++) {
            var item = estoqueMap[existingIds[ej]];
            if (item) custoTotalExistente += Number(item.PRECO_CUSTO_ORIGINAL) || 0;
          }
        }
        return {
          success: true,
          baixados: 0,
          estoque_ids: existingIds,
          custoTotal: Math.round(custoTotalExistente * 100) / 100,
          faltantes: 0,
          jaExistia: true
        };
      }

      // 2. Get FIFO units
      var available = EstoqueRepository.getItemsDisponivelPorProduto(sheetId, params.codigoProduto);
      var toBaixar = available.slice(0, quantidade);
      var faltantes = quantidade - toBaixar.length;

      if (toBaixar.length === 0) {
        // Record PENDENTE if from order
        if (params.origem === 'PEDIDO_SHOPEE') {
          var baixaId = generateBaixaId_();
          EstoqueBaixasRepository.insertRow(sheetId, {
            baixaId: baixaId,
            referenciaOrigem: params.referenciaOrigem,
            origem: params.origem,
            codigoProduto: params.codigoProduto,
            quantidade: 0,
            estoqueIds: '',
            idempotencyKey: params.idempotencyKey,
            status: 'PENDENTE_MAPEAMENTO',
            criadoEm: nowBr_(),
            revertidoEm: ''
          });
        }
        return {
          success: true,
          baixados: 0,
          estoque_ids: [],
          faltantes: faltantes,
          jaExistia: false
        };
      }

      // 3. Batch update ESTOQUE status → VENDIDO
      var estoqueIds = [];
      var custoTotal = 0;
      for (var i = 0; i < toBaixar.length; i++) {
        estoqueIds.push(toBaixar[i].ESTOQUE_ID);
        custoTotal += Number(toBaixar[i].PRECO_CUSTO_ORIGINAL) || 0;
      }
      custoTotal = Math.round(custoTotal * 100) / 100;
      if (estoqueIds.length > 0) {
        EstoqueRepository.updateRowsBulk(sheetId, estoqueIds, { status: 'VENDIDO', baixado: 'S' });
      }

      // 4. Insert ESTOQUE_BAIXAS row
      var baixaId = generateBaixaId_();
      EstoqueBaixasRepository.insertRow(sheetId, {
        baixaId: baixaId,
        referenciaOrigem: params.referenciaOrigem,
        origem: params.origem,
        codigoProduto: params.codigoProduto,
        quantidade: toBaixar.length,
        estoqueIds: estoqueIds.join(','),
        idempotencyKey: params.idempotencyKey,
        status: 'BAIXADO',
        criadoEm: nowBr_(),
        revertidoEm: ''
      });

      // 5. Log
      LoggingService.log({
        service: 'EstoqueBaixa', action: 'baixarPorProduto', status: 'OK',
        caller: 'EstoqueBaixaService',
        summary: params.codigoProduto + ': ' + toBaixar.length + ' un. baixadas' + (faltantes > 0 ? ', ' + faltantes + ' faltantes' : ''),
        durationMs: 0,
        context: {
          codigoProduto: params.codigoProduto,
          quantidade: quantidade,
          baixados: toBaixar.length,
          faltantes: faltantes,
          estoqueIds: estoqueIds,
          idempotencyKey: params.idempotencyKey
        }
      });

      return {
        success: true,
        baixados: toBaixar.length,
        estoque_ids: estoqueIds,
        custoTotal: custoTotal,
        faltantes: faltantes,
        jaExistia: false
      };

    } finally {
      lock.releaseLock();
    }
  }

  function reverterBaixa(params) {
    if (!params.referenciaOrigem) return { success: false, error: 'referenciaOrigem obrigatório' };
    var motivo = params.motivo || 'CANCELADO';
    if (motivo !== 'CANCELADO' && motivo !== 'DEVOLVIDO') {
      return { success: false, error: 'motivo deve ser CANCELADO ou DEVOLVIDO' };
    }

    var sheetId = ConfigService.getSheetId();
    var lock = LockService.getScriptLock();

    try {
      lock.waitLock(LOCK_TIMEOUT_MS);
    } catch (e) {
      throw new Error('ESTOQUE_LOCK_TIMEOUT: não conseguiu lock em ' + LOCK_TIMEOUT_MS + 'ms');
    }

    try {
      var existing = EstoqueBaixasRepository.findByReferenciaOrigem(sheetId, params.referenciaOrigem);
      if (!existing) {
        return { success: false, revertidos: 0, motivo: 'REFERENCIA_NAO_ENCONTRADA' };
      }
      if (String(existing.STATUS).trim() === 'REVERTIDO') {
        return { success: true, revertidos: 0, motivo: motivo };
      }
      if (String(existing.STATUS).trim() !== 'BAIXADO') {
        return { success: false, revertidos: 0, motivo: 'STATUS_INVALIDO' };
      }

      // Determine target status
      var targetStatus = motivo === 'CANCELADO' ? 'DISPONÍVEL' : 'DEVOLVIDO';

      // Update ESTOQUE rows (batch)
      var estoqueIds = (existing.ESTOQUE_IDS || '').split(',').filter(Boolean);
      if (estoqueIds.length > 0) {
        EstoqueRepository.updateRowsBulk(sheetId, estoqueIds, { status: targetStatus, baixado: 'N' });
      }

      // Update ESTOQUE_BAIXAS row
      EstoqueBaixasRepository.updateRowByBaixaId(sheetId, existing.BAIXA_ID, {
        status: 'REVERTIDO',
        revertidoEm: nowBr_()
      });

      LoggingService.log({
        service: 'EstoqueBaixa', action: 'reverterBaixa', status: 'OK',
        caller: 'EstoqueBaixaService',
        summary: params.referenciaOrigem + ': ' + estoqueIds.length + ' un. revertidas → ' + targetStatus,
        durationMs: 0,
        context: { referenciaOrigem: params.referenciaOrigem, motivo: motivo, revertidos: estoqueIds.length }
      });

      return { success: true, revertidos: estoqueIds.length, custoTotal: 0, motivo: motivo };

    } finally {
      lock.releaseLock();
    }
  }

  function getBaixaStatus(params) {
    if (!params.referenciaOrigem) return { jaBaixado: false, estoque_ids: [], status: '', baixadoEm: '' };

    var sheetId = ConfigService.getSheetId();
    var existing = EstoqueBaixasRepository.findByReferenciaOrigem(sheetId, params.referenciaOrigem);
    if (!existing) {
      return { jaBaixado: false, estoque_ids: [], status: '', baixadoEm: '' };
    }
    return {
      jaBaixado: String(existing.STATUS).trim() === 'BAIXADO',
      estoque_ids: (existing.ESTOQUE_IDS || '').split(',').filter(Boolean),
      status: String(existing.STATUS).trim(),
      baixadoEm: existing.CRIADO_EM || ''
    };
  }

  function reprocessarPendentes() {
    return backfillExistingOrders();
  }

  function backfillExistingOrders() {
    var t0 = new Date().getTime();
    var sheetId = ConfigService.getSheetId();

    var pedData = OrdersRepository.prepareBaixaBulk([]);
    if (!pedData) return { processados: 0, baixados: 0, erros: 0 };

    var headers = pedData.headers;
    var hIdx = {};
    for (var h = 0; h < headers.length; h++) {
      hIdx[String(headers[h]).trim()] = h;
    }

    var orderIdCol = hIdx['ORDER_ID'];
    var statusCol = hIdx['STATUS'];
    var itemSkusCol = hIdx['ITEM_SKUS'];
    var baixadoCol = hIdx['BAIXADO'];
    var baixaIdsCol = hIdx['BAIXA_ESTOQUE_IDS'];
    var totalCostCol = hIdx['TOTAL_COST'];
    if (orderIdCol === undefined || statusCol === undefined || itemSkusCol === undefined) {
      return { error: 'Missing columns in PEDIDOS' };
    }

    var estoqueCostMap = {};
    var allEstoque = EstoqueRepository.getRows(sheetId);
    for (var em = 0; em < allEstoque.length; em++) {
      estoqueCostMap[allEstoque[em].ESTOQUE_ID] = allEstoque[em];
    }
    var CANCELLED_STATUSES = ['CANCELLED', 'CANCELADO'];
    var RETURN_STATUSES = ['TO_RETURN', 'RETURNED', 'DEVOLVIDO'];

    var processados = 0, baixados = 0, erros = 0, jaProcessados = 0;
    var totalSkusBaixados = 0;
    var totalSkusPulados = 0;
    var updatesMap = {};

    var allData = pedData.allData;

    LoggingService.log({
      service: 'EstoqueBaixa', action: 'backfill.start', status: 'OK',
      caller: 'EstoqueBaixaService',
      summary: 'Iniciando backfill — ' + allData.length + ' pedidos na aba PEDIDOS',
      durationMs: 0,
      context: { totalRows: allData.length }
    });

    for (var r = 0; r < allData.length; r++) {
      var row = allData[r];
      var orderSn = String(row[orderIdCol] || '').trim();
      var status = String(row[statusCol] || '').trim().toUpperCase();
      var itemSkus = String(row[itemSkusCol] || '').trim();
      var currentBaixado = String(row[baixadoCol] || '').trim();

      if (!orderSn || !itemSkus) continue;
      var currentBaixaIds = String(row[baixaIdsCol] || '').trim();
      var jaCompleto = (currentBaixado === 'BAIXADO' || currentBaixado === 'S') && currentBaixaIds !== '';
      if (jaCompleto) { jaProcessados++; continue; }

      var isCancelled = CANCELLED_STATUSES.indexOf(status) !== -1;
      var isReturned = RETURN_STATUSES.indexOf(status) !== -1;

      if (isCancelled) {
        LoggingService.log({
          service: 'EstoqueBaixa', action: 'backfill.skip', status: 'SKIP',
          caller: 'EstoqueBaixaService',
          summary: 'Pedido ' + orderSn + ' pulado — CANCELLED',
          durationMs: 0,
          context: { orderSn: orderSn, status: status }
        });
        continue;
      }

      if (isReturned) {
        LoggingService.log({
          service: 'EstoqueBaixa', action: 'backfill.skip', status: 'SKIP',
          caller: 'EstoqueBaixaService',
          summary: 'Pedido ' + orderSn + ' pulado — ' + status,
          durationMs: 0,
          context: { orderSn: orderSn, status: status }
        });
        continue;
      }

      processados++;
      var totalBaixas = 0;
      var totalSkusNoPedido = 0;
      var orderEstoqueIds = [];
      var orderCustoTotal = 0;
      var itensPedido = itemSkus.split(';');

      LoggingService.log({
        service: 'EstoqueBaixa', action: 'backfill.order.start', status: 'OK',
        caller: 'EstoqueBaixaService',
        summary: 'Pedido ' + orderSn + ' (' + status + ') — ' + itensPedido.length + ' SKU(s) para processar',
        durationMs: 0,
        context: { orderSn: orderSn, status: status, itemSkus: itemSkus }
      });

      for (var i = 0; i < itensPedido.length; i++) {
        var p = itensPedido[i].trim();
        var colonIdx = p.indexOf(':');
        if (colonIdx === -1) continue;
        var sku = p.substring(0, colonIdx).trim();
        var qty = parseInt(p.substring(colonIdx + 1), 10) || 1;
        if (!sku) continue;
        totalSkusNoPedido++;

        var refOrigem = 'SHOPEE#' + orderSn + ':' + sku;
        var idempKey = refOrigem;

        LoggingService.log({
          service: 'EstoqueBaixa', action: 'backfill.item.try', status: 'OK',
          caller: 'EstoqueBaixaService',
          summary: 'Tentando baixa: ' + orderSn + ' → SKU ' + sku + ' x' + qty,
          durationMs: 0,
          context: { orderSn: orderSn, sku: sku, quantidade: qty, refOrigem: refOrigem }
        });

        try {
          var baixasRef = EstoqueBaixasRepository.getRows(sheetId, { referenciaOrigem: refOrigem });
          var bxExistente = null;
          for (var br = baixasRef.length - 1; br >= 0; br--) {
            if (String(baixasRef[br].STATUS || '').trim() === 'BAIXADO') {
              bxExistente = baixasRef[br];
              break;
            }
          }

          var result;
          if (bxExistente) {
            var idsRef = (bxExistente.ESTOQUE_IDS || '').split(',').filter(Boolean);
            var custoRef = 0;
            for (var cj = 0; cj < idsRef.length; cj++) {
              var itemRef = estoqueCostMap[idsRef[cj]];
              if (itemRef) custoRef += Number(itemRef.PRECO_CUSTO_ORIGINAL) || 0;
            }
            result = {
              success: true,
              baixados: 0,
              estoque_ids: idsRef,
              custoTotal: Math.round(custoRef * 100) / 100,
              faltantes: 0,
              jaExistia: true,
              viaReferencia: true
            };
          } else {
            result = baixarPorProduto({
              codigoProduto: sku,
              quantidade: qty,
              origem: 'PEDIDO_SHOPEE',
              referenciaOrigem: refOrigem,
              idempotencyKey: idempKey
            });
          }

          if (result.jaExistia) {
            totalBaixas += qty;
            totalSkusBaixados += qty;
            orderEstoqueIds = orderEstoqueIds.concat(result.estoque_ids || []);
            orderCustoTotal += Number(result.custoTotal) || 0;
            LoggingService.log({
              service: 'EstoqueBaixa', action: 'backfill.item.done', status: 'OK',
              caller: 'EstoqueBaixaService',
              summary: 'Baixa já existente: ' + orderSn + ' → SKU ' + sku + ' (estoque_ids: ' + (result.estoque_ids || []).join(',') + ')',
              durationMs: 0,
              context: { orderSn: orderSn, sku: sku, estoque_ids: result.estoque_ids, jaExistia: true, viaReferencia: !!result.viaReferencia }
            });
          } else if (result.baixados > 0) {
            totalBaixas += result.baixados;
            totalSkusBaixados += result.baixados;
            orderEstoqueIds = orderEstoqueIds.concat(result.estoque_ids || []);
            orderCustoTotal += Number(result.custoTotal) || 0;
            LoggingService.log({
              service: 'EstoqueBaixa', action: 'backfill.item.done', status: 'OK',
              caller: 'EstoqueBaixaService',
              summary: 'Baixa OK: ' + orderSn + ' → SKU ' + sku + ' x' + result.baixados + ' (estoque_ids: ' + (result.estoque_ids || []).join(',') + ')',
              durationMs: 0,
              context: { orderSn: orderSn, sku: sku, baixados: result.baixados, estoque_ids: result.estoque_ids, faltantes: result.faltantes }
            });
          } else {
            totalSkusPulados++;
            LoggingService.log({
              service: 'EstoqueBaixa', action: 'backfill.item.done', status: 'WARN',
              caller: 'EstoqueBaixaService',
              summary: 'Sem estoque: ' + orderSn + ' → SKU ' + sku + ' (faltantes: ' + result.faltantes + ')',
              durationMs: 0,
              context: { orderSn: orderSn, sku: sku, faltantes: result.faltantes, estoque_ids: [] }
            });
          }
        } catch (e) {
          erros++;
          LoggingService.log({
            service: 'EstoqueBaixa', action: 'backfill.item.error', status: 'WARN',
            caller: 'EstoqueBaixaService',
            summary: 'Erro: ' + orderSn + ' → SKU ' + sku + ': ' + e.message,
            durationMs: 0,
            context: { orderSn: orderSn, sku: sku, error: e.message }
          });
        }
      }

      var novoBaixado = 'PENDENTE';
      if (totalSkusNoPedido > 0 && totalBaixas >= totalSkusNoPedido) {
        novoBaixado = 'BAIXADO';
      } else if (totalBaixas > 0) {
        novoBaixado = 'PARCIAL';
      }

      var uniqueIds = [];
      for (var ui = 0; ui < orderEstoqueIds.length; ui++) {
        if (uniqueIds.indexOf(orderEstoqueIds[ui]) === -1) uniqueIds.push(orderEstoqueIds[ui]);
      }
      updatesMap[orderSn] = {
        baixado: novoBaixado,
        estoqueIdsStr: uniqueIds.length > 0 ? uniqueIds.join(',') : '',
        custoTotal: Math.round(orderCustoTotal * 100) / 100
      };
      if (novoBaixado === 'BAIXADO') baixados++;

      LoggingService.log({
        service: 'EstoqueBaixa', action: 'backfill.order.end', status: 'OK',
        caller: 'EstoqueBaixaService',
        summary: 'Pedido ' + orderSn + ' finalizado — BAIXADO=' + novoBaixado + ' (baixas=' + totalBaixas + ')',
        durationMs: 0,
        context: { orderSn: orderSn, baixado: novoBaixado, totalBaixas: totalBaixas }
      });
    }

    OrdersRepository.flushBaixaBulk(pedData, updatesMap);

    var durationMs = new Date().getTime() - t0;
    var summary = 'Backfill concluído — processados: ' + processados + ', baixados: ' + baixados + ', erros: ' + erros + ', já processados: ' + jaProcessados + ', SKUs baixados: ' + totalSkusBaixados + ', SKUs sem estoque: ' + totalSkusPulados;

    LoggingService.log({
      service: 'EstoqueBaixa', action: 'backfill.end', status: 'OK',
      caller: 'EstoqueBaixaService',
      summary: summary,
      durationMs: durationMs,
      context: { processados: processados, baixados: baixados, erros: erros, jaProcessados: jaProcessados, totalSkusBaixados: totalSkusBaixados, totalSkusPulados: totalSkusPulados }
    });

    return { processados: processados, baixados: baixados, erros: erros, jaProcessados: jaProcessados };
  }

  return {
    describe: describe,
    baixarPorProduto: baixarPorProduto,
    reverterBaixa: reverterBaixa,
    getBaixaStatus: getBaixaStatus,
    reprocessarPendentes: reprocessarPendentes,
    backfillExistingOrders: backfillExistingOrders
  };
})();
