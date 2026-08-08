/**
 * TiopsClient — único ponto do projeto que fala com a API Tiops
 * (https://mcp.tiops.com.br). Nenhum outro arquivo deve chamar UrlFetchApp
 * diretamente para o Tiops; todos os *Service.js passam por aqui.
 *
 * Autenticação: API key via PropertiesService (TIOPS_API_KEY).
 * Contrato: POST https://mcp.tiops.com.br { action, params }
 *   sucesso -> { status: 200, data }     erro -> { error: "mensagem" }
 *   excecao: acoes como `shopee_sales_by_item` devolvem o payload FLAT
 *   (sem wrapper `data`) — o `call` aceita esse corpo como dados diretos.
 *
 * Logging: toda chamada é auditada via LoggingService (sync) com timing,
 * params sanitizados, response summary e erros. Aba LOGS no Sheets.
 */
var TiopsClient = (function () {
  var ENDPOINT = 'https://mcp.tiops.com.br';
  var MAX_RETRIES = 3;
  var BASE_DELAY_MS = 500;

  function call(action, params) {
    var startTime = Date.now();
    var apiKey = PropertiesRepository.getScriptProperty('TIOPS_API_KEY');
    if (!apiKey) {
      var err = 'TIOPS_API_KEY_MISSING: Configure TIOPS_API_KEY em Script Properties.';
      LoggingService.log({
        service: 'TiopsClient',
        action: action,
        status: 'ERROR',
        caller: 'TiopsClient.call',
        summary: err,
        durationMs: Date.now() - startTime,
        errorMessage: err,
        context: { params: sanitizeParams_(params) }
      });
      throw new Error(err);
    }

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ action: action, params: params || {} }),
      headers: { Authorization: 'Bearer ' + apiKey },
      muteHttpExceptions: true
    };

    var lastError = 'erro desconhecido';
    var lastCode = 0;
    var attempts = 0;

    for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      attempts++;
      var attemptStart = Date.now();
      var response = UrlFetchApp.fetch(ENDPOINT, options);
      var code = response.getResponseCode();
      var rawBody = response.getContentText();
      var body = safeParse_(rawBody);
      var attemptMs = Date.now() - attemptStart;

      if (code >= 200 && code < 300 && body && !body.error) {
        var data = body.data;
        // Algumas acoes (ex.: shopee_sales_by_item) retornam o payload FLAT,
        // sem o wrapper { data: ... }. Aceita-se o proprio corpo nesses casos.
        if (data === undefined) {
          data = body;
        }
        var totalMs = Date.now() - startTime;

        LoggingService.log({
          service: 'TiopsClient',
          action: action,
          status: 'OK',
          caller: 'TiopsClient.call',
          summary: action + ' => ' + code + ' (' + totalMs + 'ms, ' + attempts + ' attempt' + (attempts > 1 ? 's' : '') + ')',
          durationMs: totalMs,
          context: {
            params: sanitizeParams_(params),
            httpCode: code,
            attempts: attempts,
            responseDataKeys: data ? Object.keys(data) : [],
            responseSnippet: snippet_(rawBody, 500)
          }
        });

        return data;
      }

      lastError = (body && body.error) || 'HTTP ' + code;
      lastCode = code;

      LoggingService.log({
        service: 'TiopsClient',
        action: action,
        status: 'ERROR',
        caller: 'TiopsClient.call',
        summary: action + ' => attempt ' + (attempt + 1) + '/' + (MAX_RETRIES + 1) + ' failed: ' + lastError + ' (' + code + ', ' + attemptMs + 'ms)',
        durationMs: attemptMs,
        errorMessage: lastError,
        context: {
          params: sanitizeParams_(params),
          httpCode: code,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
          responseSnippet: snippet_(rawBody, 500)
        }
      });

      var isRetryable = code === 429 || code >= 500;
      if (isRetryable && attempt < MAX_RETRIES) {
        var delay = BASE_DELAY_MS * Math.pow(2, attempt);
        Utilities.sleep(delay);
        continue;
      }
      break;
    }

    var totalMs = Date.now() - startTime;
    var errMsg = 'Tiops [' + action + ']: ' + lastError;

    LoggingService.log({
      service: 'TiopsClient',
      action: action,
      status: 'ERROR',
      caller: 'TiopsClient.call',
      summary: errMsg + ' (final after ' + attempts + ' attempts, ' + totalMs + 'ms)',
      durationMs: totalMs,
      errorMessage: errMsg,
      context: {
        params: sanitizeParams_(params),
        lastHttpCode: lastCode,
        totalAttempts: attempts
      }
    });

    throw new Error(errMsg);
  }

  function sanitizeParams_(params) {
    if (!params || typeof params !== 'object') return params;
    var clean = {};
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var val = params[keys[i]];
      if (typeof val === 'string' && val.length > 200) {
        clean[keys[i]] = val.substring(0, 200) + '...[truncated]';
      } else if (typeof val !== 'function') {
        clean[keys[i]] = val;
      }
    }
    return clean;
  }

  function snippet_(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...[truncated]';
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
