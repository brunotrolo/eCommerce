/**
 * CarteiraShopeeService — Consolida a carteira financeira Shopee via Tiops
 * num único snapshot + históricos no Google Sheets:
 *   - Saldo disponível / escrow / total
 *   - Próximo payout (liberações de escrow futuras)
 *   - Renda do período (income_overview)
 *   - Histórico de transações (wallet_transactions)
 *   - Histórico de pagamentos (escrow_list passado)
 *
 * Contratos confirmados em docs/referencia/CONTRATOS_CONFIRMADOS.md (2026-08-05):
 *   - shopee_get_wallet_transactions: page_size + shopId -> transaction_list[].current_balance
 *   - shopee_get_income_overview: timestamp (epoch fim do mês) + shop_id -> total_income.released_amount
 *   - shopee_get_escrow_list: release_time_from/to (epoch SECONDS) + page_size -> escrow_list[]
 * payout_info/payout_detail NÃO usar (Cross Border only).
 *
 * Regras de negócio documentadas no código abaixo.
 */
var CarteiraShopeeService = (function () {
  var CACHE_KEY = 'carteira_shopee_snapshot';
  var CACHE_TTL_SECONDS = 3600; // 1h
  var TX_PAGE_SIZE = 100;
  var METODO_PAYOUT = 'PIX';
  var ESCROW_FUTURE_DAYS = 30;
  var ESCROW_PAST_DAYS = 90;
  var ESCROW_MAX_ITEMS = 500;

  function describe() {
    return {
      name: 'carteiraShopee',
      actions: {
        syncWallet: {
          description: 'Sincroniza saldo, renda, escrow, transações e payouts da carteira Shopee via Tiops e escreve no Sheets.',
          params: {
            forceFresh: { type: 'boolean', required: false, default: false }
          },
          returns: {
            success: 'boolean',
            synced: 'object',
            dados: 'object',
            errors: 'array'
          }
        },
        getWalletSnapshot: {
          description: 'Snapshot atual da carteira (cache 1h ou sync fresh).',
          params: {
            fromCache: { type: 'boolean', required: false, default: true }
          },
          returns: {
            saldo: 'object',
            payout: 'object',
            renda: 'object',
            atualizadoEm: 'string'
          }
        },
        getTransacoes: {
          description: 'Lista transações recentes da aba CARTEIRA_HISTORICO_TRANSACOES.',
          params: {
            limit: { type: 'number', required: false, default: 50 },
            tipo: { type: 'string', required: false }
          },
          returns: 'array'
        },
        getPayoutHistory: {
          description: 'Histórico de pagamentos (escrow liberados) da aba CARTEIRA_HISTORICO_PAYOUT.',
          params: {
            limit: { type: 'number', required: false, default: 12 }
          },
          returns: 'array'
        }
      }
    };
  }

  function callTiops_(action, params) {
    try {
      return TiopsClient.call(action, params);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.indexOf('TIOPS_API_KEY_MISSING') !== -1) throw new Error('TIOPS_API_KEY_MISSING');
      throw new Error('TIOPS_CALL_FAILED: ' + msg);
    }
  }

  // ─── syncWallet ────────────────────────────────────────────────────
  function syncWallet(params) {
    params = params || {};
    var errors = [];
    var sheetId = ConfigService.getSheetId();
    var shopId;
    try {
      shopId = ConfigService.getAccountId('shopee');
    } catch (e) {
      return { success: false, synced: {}, dados: null, errors: ['TIOPS_CALL_FAILED: ' + e.message] };
    }

    var saldo = fetchSaldo_(shopId, errors);
    var escrow = fetchEscrow_(shopId, errors);
    var renda = fetchRendaPeriodo_(shopId, errors);

    var dados = buildDados_(saldo.disponivel, escrow.saldoEscrow, escrow.proximoPayout, escrow.ultimoPayout, renda);
    var timestamp = nowBR_();

    var synced = {
      saldoAtualizado: saldo.success,
      transacoesAtualizadas: 0,
      payoutAtualizado: escrow.success,
      timestamp: timestamp
    };

    if (errors.length > 0) {
      return { success: false, synced: synced, dados: dados, errors: errors };
    }

    // Escrita em Sheets
    try {
      var resumo = buildResumoRow_(dados, timestamp, 'OK');
      CarteiraShopeeRepository.writeResumo(sheetId, resumo);
    } catch (e) {
      return { success: false, synced: synced, dados: dados, errors: ['SHEETS_WRITE_FAILED: ' + e.message] };
    }

    var txResult = appendTransacoes_(sheetId, saldo.transacoes, errors);
    var payoutResult = appendPayouts_(sheetId, escrow.payouts, errors);

    synced.transacoesAtualizadas = txResult.inserted;
    synced.payoutAtualizado = payoutResult.inserted > 0 || escrow.success;

    // Invalida cache e grava snapshot fresco
    CacheRepository.remove(CACHE_KEY);
    CacheRepository.set(CACHE_KEY, { snapshot: dados, computedEm: timestamp }, CACHE_TTL_SECONDS);
    CacheRepository.invalidateByPattern('dashboard_');

    return { success: errors.length === 0, synced: synced, dados: dados, errors: errors };
  }

  function appendTransacoes_(sheetId, transacoes, errors) {
    try {
      var existingRefs = CarteiraShopeeRepository.getExistingTransacaoRefs(sheetId);
      return CarteiraShopeeRepository.appendTransacoes(sheetId, transacoes, existingRefs);
    } catch (e) {
      errors.push('SHEETS_WRITE_FAILED: ' + e.message);
      return { inserted: 0, skipped: 0, errors: [e.message] };
    }
  }

  function appendPayouts_(sheetId, payouts, errors) {
    try {
      var existingRefs = CarteiraShopeeRepository.getExistingPayoutRefs(sheetId);
      return CarteiraShopeeRepository.appendPayouts(sheetId, payouts, existingRefs);
    } catch (e) {
      errors.push('SHEETS_WRITE_FAILED: ' + e.message);
      return { inserted: 0, skipped: 0, errors: [e.message] };
    }
  }

  // ─── Fetch Tiops ───────────────────────────────────────────────────
  function fetchSaldo_(shopId, errors) {
    var out = { disponivel: null, transacoes: [], success: false };
    try {
      var result = callTiops_('shopee_get_wallet_transactions', { page_size: TX_PAGE_SIZE, shopId: shopId });
      var response = result.response || result;
      var list = response.transaction_list || [];
      var rows = [];
      for (var i = 0; i < list.length; i++) {
        rows.push(txnToRow_(list[i]));
      }
      // Mais recente primeiro (maior create_time)
      rows.sort(function (a, b) { return (b._ts || 0) - (a._ts || 0); });
      var cleanRows = rows.map(function (r) {
        var copy = {};
        var keys = Object.keys(r);
        for (var k = 0; k < keys.length; k++) {
          if (keys[k] !== '_ts') copy[keys[k]] = r[keys[k]];
        }
        return copy;
      });
      out.transacoes = cleanRows;
      if (cleanRows.length > 0) {
        out.disponivel = Number(cleanRows[0].SALDO_APOS) || 0;
        out.success = true;
      }
    } catch (e) {
      errors.push(e.message);
    }
    return out;
  }

  function fetchEscrow_(shopId, errors) {
    var out = { saldoEscrow: 0, proximoPayout: null, ultimoPayout: null, payouts: [], success: false };
    var nowMs = Date.now();
    var nowSec = Math.floor(nowMs / 1000);
    var fromSec = nowSec - ESCROW_PAST_DAYS * 86400;
    var toSec = nowSec + ESCROW_FUTURE_DAYS * 86400;

    try {
      var allReleases = [];
      var more = true;
      var guard = 0;

      while (more && guard < 10) {
        guard++;
        var result = callTiops_('shopee_get_escrow_list', {
          release_time_from: fromSec,
          release_time_to: toSec,
          page_size: 100,
          shopId: shopId
        });
        var response = result.response || result;
        var list = response.escrow_list || [];
        allReleases = allReleases.concat(list);
        more = !!response.more;
        if (list.length === 0) more = false;
        if (allReleases.length >= ESCROW_MAX_ITEMS) more = false;
      }

      var escrowSum = 0;
      var futuro = [];
      var passado = [];

      for (var i = 0; i < allReleases.length; i++) {
        var r = allReleases[i];
        var releaseTime = Number(r.escrow_release_time) || 0;
        var amount = Number(r.payout_amount) || 0;
        if (releaseTime > nowSec) {
          escrowSum += amount;
          futuro.push(r);
        } else if (releaseTime > 0) {
          passado.push(r);
        }
      }

      passado.sort(function (a, b) { return (Number(b.escrow_release_time) || 0) - (Number(a.escrow_release_time) || 0); });
      futuro.sort(function (a, b) { return (Number(a.escrow_release_time) || 0) - (Number(b.escrow_release_time) || 0); });

      var proximoPayout = null;
      if (futuro.length > 0) {
        var somaFuturo = 0;
        for (var f = 0; f < futuro.length; f++) somaFuturo += Number(futuro[f].payout_amount) || 0;
        proximoPayout = {
          data: formatDataBR_(futuro[0].escrow_release_time),
          valor: round2_(somaFuturo),
          metodo: METODO_PAYOUT
        };
      }

      var ultimoPayout = null;
      if (passado.length > 0) {
        ultimoPayout = {
          data: formatDataBR_(passado[0].escrow_release_time),
          valor: round2_(Number(passado[0].payout_amount) || 0)
        };
      }

      var payouts = [];
      for (var p = 0; p < passado.length; p++) {
        payouts.push({
          DATA_PAYOUT: formatDataBR_(passado[p].escrow_release_time),
          VALOR: round2_(Number(passado[p].payout_amount) || 0),
          METODO: METODO_PAYOUT,
          STATUS: 'Concluído',
          REFERENCIA: String(passado[p].order_sn || 'escrow_' + (passado[p].escrow_release_time || p)),
          DIAS_PARA_RECEBER: '',
          DATA_REGISTRO: nowBR_()
        });
      }

      return {
        saldoEscrow: round2_(escrowSum),
        proximoPayout: proximoPayout,
        ultimoPayout: ultimoPayout,
        payouts: payouts,
        success: true
      };
    } catch (e) {
      errors.push(e.message);
      return out;
    }
  }

  function fetchRendaPeriodo_(shopId, errors) {
    try {
      var timestampEpoch = endOfMonthEpoch_(new Date());
      var result = callTiops_('shopee_get_income_overview', { timestamp: timestampEpoch, shop_id: shopId });
      var response = result.response || result;
      var totalIncome = response.total_income || response;
      var liquido = Number(totalIncome.released_amount) || 0;
      var total = liquido / 0.80;
      return {
        periodo: formatMesBR_(new Date()),
        liquido: round2_(liquido),
        total: round2_(total),
        comissoes: round2_(-total * 0.20),
        tarifas: 0
      };
    } catch (e) {
      errors.push(e.message);
      return { periodo: formatMesBR_(new Date()), liquido: 0, total: 0, comissoes: 0, tarifas: 0 };
    }
  }

  // ─── Builders ──────────────────────────────────────────────────────
  function buildDados_(saldoDisponivel, saldoEscrow, proximoPayout, ultimoPayout, renda) {
    var disponivel = saldoDisponivel === null ? 0 : saldoDisponivel;
    return {
      saldoDisponivel: round2_(disponivel),
      saldoEscrow: round2_(saldoEscrow || 0),
      saldoTotal: round2_(disponivel + (saldoEscrow || 0)),
      proximoPayout: proximoPayout || { data: null, valor: 0, metodo: METODO_PAYOUT },
      ultimoPayout: ultimoPayout || { data: null, valor: 0 },
      rendaPeriodo: renda || { periodo: '', total: 0, comissoes: 0, tarifas: 0 },
      atualizadoEm: nowBR_()
    };
  }

  function buildResumoRow_(dados, timestamp, statusSync) {
    var r = dados.rendaPeriodo || {};
    var px = dados.proximoPayout || {};
    var up = dados.ultimoPayout || {};
    return {
      dataSincronizacao: timestamp,
      saldoDisponivel: dados.saldoDisponivel,
      saldoEscrow: dados.saldoEscrow,
      saldoTotal: dados.saldoTotal,
      proximoPayoutData: px.data || '',
      proximoPayoutValor: px.valor || 0,
      metodoPayout: px.metodo || METODO_PAYOUT,
      rendaPeriodo: r.total || 0,
      comissaoShopee: r.comissoes || 0,
      taxasPlataforma: r.tarifas || 0,
      liquidoPeriodo: r.liquido || 0,
      ultimoPayoutData: up.data || '',
      ultimoPayoutValor: up.valor || 0,
      statusSincronizacao: statusSync || 'OK'
    };
  }

  // ─── getWalletSnapshot ─────────────────────────────────────────────
  function getWalletSnapshot(params) {
    params = params || {};
    var fromCache = params.fromCache !== false;

    if (fromCache) {
      var cached = CacheRepository.get(CACHE_KEY);
      if (cached && cached.snapshot) {
        return normalizeSnapshot_(cached.snapshot, cached.computedEm || cached.snapshot.atualizadoEm, true);
      }
    }

    var data = syncWallet({ forceFresh: true });
    if (data.dados) {
      return normalizeSnapshot_(data.dados, data.synced.timestamp, false);
    }

    // Fallback: último snapshot em Sheets (não limpa dados em caso de erro)
    var resumo = CarteiraShopeeRepository.getResumo(ConfigService.getSheetId());
    if (resumo) {
      return {
        saldo: {
          disponivel: Number(resumo.SALDO_DISPONIVEL) || 0,
          escrow: Number(resumo.SALDO_ESCROW) || 0,
          total: Number(resumo.SALDO_TOTAL) || 0
        },
        payout: {
          proximaData: resumo.PROXIMO_PAYOUT_DATA || null,
          proximoValor: Number(resumo.PROXIMO_PAYOUT_VALOR) || 0,
          metodo: resumo.METODO_PAYOUT || METODO_PAYOUT,
          ultimoPagamento: resumo.ULTIMO_PAYOUT_DATA ? { data: resumo.ULTIMO_PAYOUT_DATA, valor: Number(resumo.ULTIMO_PAYOUT_VALOR) || 0 } : null
        },
        renda: {
          periodo: resumo.DATA_SINCRONIZACAO ? formatMesBR_(new Date()) : '',
          vendas: Number(resumo.RENDA_PERIODO) || 0,
          comissao: Number(resumo.COMISSAO_SHOPEE) || 0,
          taxasPlataforma: Number(resumo.TAXAS_PLATAFORMA) || 0,
          liquido: Number(resumo.LIQUIDO_PERIODO) || 0
        },
        atualizadoEm: resumo.DATA_SINCRONIZACAO || '',
        fromCache: true,
        fromSheets: true
      };
    }

    return { error: 'Sem dados de carteira. Sincronize primeiro.' };
  }

  function normalizeSnapshot_(dados, timestamp, fromCache) {
    var px = dados.proximoPayout || {};
    var r = dados.rendaPeriodo || {};
    return {
      saldo: {
        disponivel: round2_(dados.saldoDisponivel || 0),
        escrow: round2_(dados.saldoEscrow || 0),
        total: round2_(dados.saldoTotal || 0)
      },
      payout: {
        proximaData: px.data || null,
        proximoValor: px.valor || 0,
        metodo: px.metodo || METODO_PAYOUT,
        ultimoPagamento: dados.ultimoPayout && dados.ultimoPayout.data
          ? { data: dados.ultimoPayout.data, valor: dados.ultimoPayout.valor || 0 }
          : null
      },
      renda: {
        periodo: r.periodo || '',
        vendas: r.total || 0,
        comissao: r.comissoes || 0,
        taxasPlataforma: r.tarifas || 0,
        liquido: r.liquido || 0
      },
      atualizadoEm: timestamp || nowBR_(),
      fromCache: fromCache
    };
  }

  // ─── getTransacoes / getPayoutHistory ──────────────────────────────
  function getTransacoes(params) {
    params = params || {};
    var rows = CarteiraShopeeRepository.getRecentTransacoes(ConfigService.getSheetId(), params.limit || 50);
    var tipo = params.tipo && String(params.tipo).toLowerCase();
    if (tipo) {
      var mapTipo = { venda: 'Venda', payout: 'Payout', reembolso: 'Reembolso', taxa: 'Taxa Plataforma' };
      var expected = mapTipo[tipo];
      if (expected) {
        rows = rows.filter(function (r) {
          var t = String(r.TIPO_TRANSACAO || '');
          return t.indexOf(expected) !== -1;
        });
      }
    }
    return rows;
  }

  function getPayoutHistory(params) {
    params = params || {};
    return CarteiraShopeeRepository.getRecentPayouts(ConfigService.getSheetId(), params.limit || 12);
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function txnToRow_(t) {
    return {
      _ts: Number(t.create_time) || 0,
      DATA_TRANSACAO: dtFromEpoch_(t.create_time),
      TIPO_TRANSACAO: classifyTipo_(t),
      DESCRICAO: String(t.description || t.remark || ''),
      VALOR: round2_(Number(t.amount) || 0),
      SALDO_APOS: round2_(Number(t.current_balance) || 0),
      STATUS: mapStatus_(t.status),
      REFERENCIA: String(t.transaction_id || t.order_sn || ''),
      DATA_REGISTRO: nowBR_()
    };
  }

  function classifyTipo_(t) {
    var d = String(t.description || t.remark || '').toLowerCase();
    if (d.indexOf('venda') !== -1 || d.indexOf('sale') !== -1 || d.indexOf('order') !== -1 || d.indexOf('pedido') !== -1) return 'Venda';
    if (d.indexOf('payout') !== -1 || d.indexOf('retirad') !== -1 || d.indexOf('withdraw') !== -1) return 'Payout';
    if (d.indexOf('refund') !== -1 || d.indexOf('reembolso') !== -1) return 'Reembolso';
    if (d.indexOf('taxa') !== -1 || d.indexOf('fee') !== -1 || d.indexOf('service') !== -1 || d.indexOf('comiss') !== -1) return 'Taxa Plataforma';
    if (t.money_flow === 'MONEY_OUT') return 'Taxa Plataforma';
    return 'Venda';
  }

  function mapStatus_(s) {
    var st = String(s || '').toUpperCase();
    if (st.indexOf('SUCCESS') !== -1 || st.indexOf('COMPLET') !== -1 || st.indexOf('DONE') !== -1) return 'Concluído';
    if (st.indexOf('CANCEL') !== -1 || st.indexOf('FAIL') !== -1) return 'Cancelado';
    if (st.indexOf('PENDING') !== -1 || st.indexOf('PROCESS') !== -1) return 'Pendente';
    return s ? String(s) : 'Concluído';
  }

  function round2_(n) {
    if (n === null || n === undefined || isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function dtFromEpoch_(ts) {
    if (!ts) return '';
    var d = toDate_(ts);
    if (!d) return '';
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var yyyy = d.getFullYear();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
  }

  function formatDataBR_(epochSec) {
    if (!epochSec) return '';
    var d = toDate_(epochSec);
    if (!d) return '';
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  function toDate_(ts) {
    var num = Number(ts) || 0;
    if (num === 0) return null;
    // Aceita epoch seconds (10 dígitos) ou millis (13 dígitos)
    var ms = num > 100000000000 ? num : num * 1000;
    var d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatMesBR_(d) {
    if (!d) return '';
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return mm + '/' + d.getFullYear();
  }

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  function endOfMonthEpoch_(d) {
    var y = d.getFullYear();
    var m = d.getMonth();
    var nextMonth = new Date(y, m + 1, 1, 0, 0, 0);
    var lastDayMs = nextMonth.getTime() - 1;
    return Math.floor(lastDayMs / 1000);
  }

  return {
    describe: describe,
    syncWallet: syncWallet,
    getWalletSnapshot: getWalletSnapshot,
    getTransacoes: getTransacoes,
    getPayoutHistory: getPayoutHistory,
    // Expostos para smoke tests (lógica pura)
    classifyTipo: classifyTipo_,
    mapStatus: mapStatus_,
    fmtDataBR: formatDataBR_,
    round2: round2_,
    endOfMonthEpoch: endOfMonthEpoch_,
    buildResumoRow: buildResumoRow_
  };
})();