/**
 * EstoqueBaixaService — motor central de baixa de estoque (FIFO).
 * Seleciona unidades DISPONÍVEIS mais antigas de um codigoProduto e marca
 * VENDIDO, registrando a operação em ESTOQUE_BAIXAS.
 * Regras completas em specs/estoque-baixa.md.
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
        return {
          success: true,
          baixados: 0,
          estoque_ids: (existing.ESTOQUE_IDS || '').split(',').filter(Boolean),
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

      // 3. Update ESTOQUE status → VENDIDO
      var estoqueIds = [];
      for (var i = 0; i < toBaixar.length; i++) {
        estoqueIds.push(toBaixar[i].ESTOQUE_ID);
        EstoqueRepository.updateRow(sheetId, toBaixar[i].ESTOQUE_ID, { status: 'VENDIDO', baixado: 'S' });
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

      // Update ESTOQUE rows
      var estoqueIds = (existing.ESTOQUE_IDS || '').split(',').filter(Boolean);
      for (var i = 0; i < estoqueIds.length; i++) {
        EstoqueRepository.updateRow(sheetId, estoqueIds[i], { status: targetStatus, baixado: 'N' });
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

      return { success: true, revertidos: estoqueIds.length, motivo: motivo };

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
    var sheetId = ConfigService.getSheetId();
    var pedSheet = SpreadsheetApp.openById(sheetId).getSheetByName('PEDIDOS');
    if (!pedSheet) return { error: 'PEDIDOS sheet not found' };

    var lastRow = pedSheet.getLastRow();
    var lastCol = pedSheet.getLastColumn();
    if (lastRow < 2) return { processados: 0, baixados: 0, erros: 0 };

    var headers = pedSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var hIdx = {};
    for (var h = 0; h < headers.length; h++) {
      hIdx[String(headers[h]).trim()] = h;
    }

    var orderIdCol = hIdx['ORDER_ID'];
    var statusCol = hIdx['STATUS'];
    var itemSkusCol = hIdx['ITEM_SKUS'];
    var baixadoCol = hIdx['BAIXADO'];
    if (orderIdCol === undefined || statusCol === undefined || itemSkusCol === undefined) {
      return { error: 'Missing columns in PEDIDOS' };
    }
    if (baixadoCol === undefined) {
      pedSheet.getRange(1, lastCol + 1).setValue('BAIXADO');
      baixadoCol = lastCol;
    }

    var allData = pedSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var CANCELLED_STATUSES = ['CANCELLED', 'CANCELADO'];
    var RETURN_STATUSES = ['TO_RETURN', 'RETURNED', 'DEVOLVIDO'];

    var processados = 0, baixados = 0, erros = 0, jaProcessados = 0;

    for (var r = 0; r < allData.length; r++) {
      var row = allData[r];
      var orderSn = String(row[orderIdCol] || '').trim();
      var status = String(row[statusCol] || '').trim().toUpperCase();
      var itemSkus = String(row[itemSkusCol] || '').trim();
      var currentBaixado = String(row[baixadoCol] || '').trim();

      if (!orderSn || !itemSkus) continue;
      if (currentBaixado === 'S') { jaProcessados++; continue; }

      var isCancelled = CANCELLED_STATUSES.indexOf(status) !== -1;
      var isReturned = RETURN_STATUSES.indexOf(status) !== -1;

      processados++;
      var totalBaixas = 0;

      var parts = itemSkus.split(';');
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        var colonIdx = p.indexOf(':');
        if (colonIdx === -1) continue;
        var sku = p.substring(0, colonIdx).trim();
        var qty = parseInt(p.substring(colonIdx + 1), 10) || 1;
        if (!sku) continue;

        var refOrigem = 'SHOPEE#' + orderSn + ':' + sku;

        if (isCancelled || isReturned) {
          continue;
        }

        try {
          var idempKey = refOrigem + ':backfill';
          var result = baixarPorProduto({
            codigoProduto: sku,
            quantidade: qty,
            origem: 'PEDIDO_SHOPEE',
            referenciaOrigem: refOrigem,
            idempotencyKey: idempKey
          });
          if (result.baixados > 0) totalBaixas += result.baixados;
        } catch (e) {
          erros++;
          LoggingService.log({
            service: 'EstoqueBaixa', action: 'backfill', status: 'WARN',
            caller: 'EstoqueBaixaService',
            summary: 'Backfill falhou para ' + sku + ': ' + e.message,
            durationMs: 0, context: { orderSn: orderSn, sku: sku, error: e.message }
          });
        }
      }

      if (totalBaixas > 0) baixados++;
      pedSheet.getRange(r + 2, baixadoCol + 1).setValue(totalBaixas > 0 ? 'S' : 'N');
    }

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
