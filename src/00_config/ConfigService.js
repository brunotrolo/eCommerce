/**
 * ConfigService — configuração central do app. Lê taxas, margens e IDs
 * da aba CONFIG do Google Sheets. Fallback para valores hardcoded se
 * a aba não existir. A API key vive em Script Properties (nunca na planilha).
 */
var ConfigService = (function () {
  var SHEET_ID = '1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50';

  var FALLBACK_ACCOUNT_IDS = {
    mercado_livre: '3520412809',
    shopee: '1880105398'
  };

  var FALLBACK_FEES = {
    shopee: { pct: 0.20, fixed: 0 },
    mercado_livre: { pct: 0.14, fixed: 6 }
  };

  // Modelo de dois componentes da Shopee (comissão + taxa de serviço),
  // derivado por engenharia reversa de 11 pedidos COMPLETED reais.
  // Substitui, só para Shopee, o modelo flat de FALLBACK_FEES.shopee
  // (mantido por compatibilidade com getMarketplaceFee, ainda usado por
  // outros pontos).
  var FALLBACK_SHOPEE_FEE_MODEL = {
    commissionPctCartao: 0.18,
    commissionPctPix: 0.12,
    serviceFeeBasePct: 0.02,
    serviceFeePerItem: 4,
    serviceFeePromoExtra: 16
  };

  var _configCache = null;
  var _cacheTimestamp = 0;
  var CACHE_TTL_MS = 5 * 60 * 1000;

  function describe() {
    return {
      name: 'config',
      actions: {
        getConfig: {
          description: 'Retorna toda a configuração parametrizada (taxas, margens, IDs).',
          params: {},
          returns: { fees: 'object', defaultMargin: 'number', accountIds: 'object' }
        },
        reloadConfig: {
          description: 'Limpa cache e recarrega configuração da planilha.',
          params: {},
          returns: { fees: 'object', defaultMargin: 'number', accountIds: 'object' }
        }
      }
    };
  }

  function getConfig() {
    return { success: true, data: getAllConfig() };
  }

  function reloadConfigAction() {
    return { success: true, data: reloadConfig() };
  }

  function _loadConfig() {
    var now = Date.now();
    if (_configCache && (now - _cacheTimestamp) < CACHE_TTL_MS) {
      return _configCache;
    }
    try {
      _configCache = ConfigRepository.getAll(SHEET_ID);
      _cacheTimestamp = now;
    } catch (e) {
      _configCache = {
        shopee_fee_pct: FALLBACK_FEES.shopee.pct,
        shopee_fee_fixed: FALLBACK_FEES.shopee.fixed,
        ml_fee_pct: FALLBACK_FEES.mercado_livre.pct,
        ml_fee_fixed: FALLBACK_FEES.mercado_livre.fixed,
        default_margin_pct: 0.25,
        shopee_account_id: FALLBACK_ACCOUNT_IDS.shopee,
        ml_account_id: FALLBACK_ACCOUNT_IDS.mercado_livre
      };
    }
    return _configCache;
  }

  function getAccountId(marketplace) {
    var config = _loadConfig();
    if (marketplace === 'shopee') return config.shopee_account_id || FALLBACK_ACCOUNT_IDS.shopee;
    if (marketplace === 'mercado_livre') return config.ml_account_id || FALLBACK_ACCOUNT_IDS.mercado_livre;
    throw new Error('Marketplace desconhecido: ' + marketplace);
  }

  function getSheetId() {
    return SHEET_ID;
  }

  function getMarketplaceFee(marketplace) {
    var config = _loadConfig();
    if (marketplace === 'shopee') {
      return {
        pct: config.shopee_fee_pct || FALLBACK_FEES.shopee.pct,
        fixed: config.shopee_fee_fixed || FALLBACK_FEES.shopee.fixed
      };
    }
    if (marketplace === 'mercado_livre') {
      return {
        pct: config.ml_fee_pct || FALLBACK_FEES.mercado_livre.pct,
        fixed: config.ml_fee_fixed || FALLBACK_FEES.mercado_livre.fixed
      };
    }
    throw new Error('Marketplace desconhecido: ' + marketplace);
  }

  /**
   * Modelo de taxa Shopee de dois componentes (comissão + taxa de serviço) —
   * usado por PricingService para Shopee em vez de getMarketplaceFee (que
   * segue flat, para ML e compatibilidade).
   * @param {string} paymentScenario 'cartao_avista' (default, pior caso) | 'pix_ou_parcelado'
   * @param {number} itemCount nº de itens no pedido, mínimo 1 (default 1)
   * @return {{commissionPct:number, serviceFeeBasePct:number, serviceFeeFixed:number}}
   */
  function getShopeeFeeModel(paymentScenario, itemCount) {
    var config = _loadConfig();
    var isPromo = paymentScenario === 'pix_ou_parcelado';
    var count = itemCount && itemCount >= 1 ? itemCount : 1;

    var commissionPctCartao = config.shopee_commission_pct_cartao || FALLBACK_SHOPEE_FEE_MODEL.commissionPctCartao;
    var commissionPctPix = config.shopee_commission_pct_pix || FALLBACK_SHOPEE_FEE_MODEL.commissionPctPix;
    var serviceFeeBasePct = config.shopee_service_fee_base_pct || FALLBACK_SHOPEE_FEE_MODEL.serviceFeeBasePct;
    var serviceFeePerItem = config.shopee_service_fee_per_item || FALLBACK_SHOPEE_FEE_MODEL.serviceFeePerItem;
    var serviceFeePromoExtra = config.shopee_service_fee_promo_extra || FALLBACK_SHOPEE_FEE_MODEL.serviceFeePromoExtra;

    return {
      commissionPct: isPromo ? commissionPctPix : commissionPctCartao,
      serviceFeeBasePct: serviceFeeBasePct,
      serviceFeeFixed: serviceFeePerItem * count + (isPromo ? serviceFeePromoExtra : 0)
    };
  }

  function getDefaultMargin() {
    var config = _loadConfig();
    return config.default_margin_pct || 0.25;
  }

  function get(chave) {
    var config = _loadConfig();
    return config[chave] !== undefined ? config[chave] : null;
  }

  function getAllConfig() {
    var config = _loadConfig();
    return {
      fees: {
        shopee: { pct: config.shopee_fee_pct, fixed: config.shopee_fee_fixed },
        mercado_livre: { pct: config.ml_fee_pct, fixed: config.ml_fee_fixed }
      },
      defaultMargin: config.default_margin_pct,
      accountIds: {
        shopee: config.shopee_account_id,
        mercado_livre: config.ml_account_id
      }
    };
  }

  function reloadConfig() {
    _configCache = null;
    _cacheTimestamp = 0;
    return getAllConfig();
  }

  var NFE_ENTRADA_KEY = 'SHEETS_ID_NFEENTRADA';

  function getNfeEntradaSheetId() {
    var id = PropertiesRepository.getScriptProperty(NFE_ENTRADA_KEY);
    if (!id) return { error: 'Sheet ID not configured. Use the menu NFe Entrada > Configurar Sheet ID.' };
    return id;
  }

  function setNfeEntradaSheetId(id) {
    PropertiesRepository.setScriptProperty(NFE_ENTRADA_KEY, id);
    return { success: true };
  }

  function listMarketplaces() {
    return ['shopee', 'mercado_livre'];
  }

  return {
    describe: describe,
    getConfig: getConfig,
    reloadConfig: reloadConfigAction,
    get: get,
    getAccountId: getAccountId,
    getSheetId: getSheetId,
    getMarketplaceFee: getMarketplaceFee,
    getShopeeFeeModel: getShopeeFeeModel,
    getDefaultMargin: getDefaultMargin,
    getAllConfig: getAllConfig,
    listMarketplaces: listMarketplaces,
    getNfeEntradaSheetId: getNfeEntradaSheetId,
    setNfeEntradaSheetId: setNfeEntradaSheetId
  };
})();
