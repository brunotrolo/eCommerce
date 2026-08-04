/**
 * TiopsClient — único ponto do projeto que fala com a API Tiops
 * (https://mcp.tiops.com.br). Nenhum outro arquivo deve chamar UrlFetchApp
 * diretamente para o Tiops; todos os *Service.js passam por aqui.
 *
 * Autenticação: API key via PropertiesService (TIOPS_API_KEY).
 * Contrato: POST https://mcp.tiops.com.br { action, params }
 *   sucesso -> { status: 200, data }     erro -> { error: "mensagem" }
 */
var TiopsClient = (function () {
  var ENDPOINT = 'https://mcp.tiops.com.br';
  var MAX_RETRIES = 3;
  var BASE_DELAY_MS = 500;

  function call(action, params) {
    var apiKey = PropertiesRepository.getScriptProperty('TIOPS_API_KEY');
    if (!apiKey) {
      throw new Error('TIOPS_API_KEY_MISSING: Configure TIOPS_API_KEY em Script Properties.');
    }

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ action: action, params: params || {} }),
      headers: { Authorization: 'Bearer ' + apiKey },
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

  function describe() {
    return {
      name: 'tiops',
      actions: {
        call: {
          description: 'Chama uma ação na API Tiops.',
          params: {
            action: { type: 'string', required: true },
            params: { type: 'object', required: false }
          },
          returns: { data: 'any' }
        }
      }
    };
  }

  return { call: call, describe: describe };
})();
