/**
 * TiopsClient — único ponto do projeto que fala com a API Tiops
 * (https://mcp.tiops.com.br). Nenhum outro arquivo deve chamar UrlFetchApp
 * diretamente para o Tiops; todos os *Service.js passam por aqui.
 *
 * Contrato do endpoint (ver docs/referencia/MCP_TIOPS_QUICK_START.md):
 *   POST https://mcp.tiops.com.br  { action, params }
 *   sucesso -> { status: 200, data }     erro -> { error: "mensagem" }
 */
var TiopsClient = (function () {
  var ENDPOINT = 'https://mcp.tiops.com.br';
  var MAX_RETRIES = 3;
  var BASE_DELAY_MS = 500;

  function call(action, params) {
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ action: action, params: params || {} }),
      headers: { Authorization: 'Bearer ' + ConfigService.getApiKey() },
      muteHttpExceptions: true
    };

    var lastError = 'erro desconhecido';

    for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      var response = UrlFetchApp.fetch(ENDPOINT, options);
      var code = response.getResponseCode();
      var body = safeParse_(response.getContentText());

      if (code >= 200 && code < 300 && body && !body.error) {
        return body.data;
      }

      lastError = (body && body.error) || 'HTTP ' + code;

      var isRetryable = code === 429 || code >= 500;
      if (isRetryable && attempt < MAX_RETRIES) {
        Utilities.sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      break;
    }

    throw new Error('Tiops [' + action + ']: ' + lastError);
  }

  function safeParse_(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  return { call: call };
})();
