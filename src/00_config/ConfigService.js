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

  function getDefaultMargin() {
    var config = _loadConfig();
    return config.default_margin_pct || 0.25;
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
    getAccountId: getAccountId,
    getSheetId: getSheetId,
    getMarketplaceFee: getMarketplaceFee,
    getDefaultMargin: getDefaultMargin,
    getAllConfig: getAllConfig,
    listMarketplaces: listMarketplaces,
    getNfeEntradaSheetId: getNfeEntradaSheetId,
    setNfeEntradaSheetId: setNfeEntradaSheetId
  };
})();
