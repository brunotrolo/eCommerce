/**
 * ConfigService — configuração central do app: chave da API Tiops, IDs de
 * conta por marketplace, planilha de apoio e taxas de cada canal. Nenhum
 * segredo vive no código-fonte; a API key só existe em Script Properties.
 */
var ConfigService = (function () {
  var SHEET_ID = '1OtJRwUV6A4YiCQ866CkwlDZp7zXOsMcIcp1jUI-jz50';

  var ACCOUNT_IDS = {
    mercado_livre: '3520412809',
    shopee: '1880105398'
  };

  var MARKETPLACE_FEES = {
    shopee: { pct: 0.20, fixed: 0 },
    mercado_livre: { pct: 0.14, fixed: 6 }
  };

  function getApiKey() {
    var key = PropertiesRepository.getScriptProperty('TIOPS_API_KEY');
    if (!key) {
      throw new Error(
        'TIOPS_API_KEY não configurada. Rode setup_() uma vez no editor do ' +
          'Apps Script (Project Settings > Script Properties) para defini-la.'
      );
    }
    return key;
  }

  function getAccountId(marketplace) {
    var id = ACCOUNT_IDS[marketplace];
    if (!id) throw new Error('Marketplace desconhecido: ' + marketplace);
    return id;
  }

  function getSheetId() {
    return SHEET_ID;
  }

  function getMarketplaceFee(marketplace) {
    var fee = MARKETPLACE_FEES[marketplace];
    if (!fee) throw new Error('Marketplace desconhecido: ' + marketplace);
    return fee;
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
    return Object.keys(ACCOUNT_IDS);
  }

  return {
    getApiKey: getApiKey,
    getAccountId: getAccountId,
    getSheetId: getSheetId,
    getMarketplaceFee: getMarketplaceFee,
    listMarketplaces: listMarketplaces,
    getNfeEntradaSheetId: getNfeEntradaSheetId,
    setNfeEntradaSheetId: setNfeEntradaSheetId
  };
})();
