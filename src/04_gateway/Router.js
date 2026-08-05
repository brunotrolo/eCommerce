/**
 * Router — único ponto de entrada do Web App: doGet/doPost (chamadas HTTP
 * externas) e apiDispatch (usado também por google.script.run a partir dos
 * widgets). Nenhum outro arquivo define doGet/doPost.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    var params = e.parameter.params ? JSON.parse(e.parameter.params) : {};
    return ContentService.createTextOutput(JSON.stringify(apiDispatch(e.parameter.action, params))).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  return HtmlService.createTemplateFromFile('ui/shell/Shell')
    .evaluate()
    .setTitle('Painel — Shopee + Mercado Livre')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var rawBody = (e && e.postData && e.postData.contents) || '';
  var body = {};
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    body = {};
  }

  if (isShopeePush_(body)) {
    return handlePushResponse_(body, e);
  }

  if (!body.action) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: 'Ação ausente no corpo da requisição.' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify(apiDispatch(body.action, body.params))).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Detecta push da Shopee: POST sem `action`, com order_sn/status no topo ou
 * aninhado em `data`. Nunca passa pelo apiDispatch.
 */
function isShopeePush_(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.action) return false;
  var data = (typeof body.data === 'object' && body.data !== null) ? body.data : {};
  var hasRef = !!body.order_sn || !!data.order_sn;
  var hasStatus = !!body.status || !!data.status || !!body.order_status || !!data.order_status;
  return hasRef && hasStatus;
}

/**
 * Responde ao push da Shopee: ACK (HTTP 200) em sucesso; em erro, rethrow
 * para o GAS devolver HTTP 500 e a Shopee reenviar o push.
 */
function handlePushResponse_(body, e) {
  try {
    if (typeof PushNotificationService === 'undefined') {
      throw new Error('PushNotificationService não carregado');
    }
    var secret = (e && e.parameter && e.parameter.secret) ? String(e.parameter.secret) : '';
    var result = PushNotificationService.handlePush({ body: body, secret: secret });
    if (result && result.error) {
      throw new Error(result.error);
    }
    return ContentService.createTextOutput('ACK').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    throw new Error('Push handler falhou: ' + err.message);
  }
}

/** Ponto único de dispatch, chamado por doGet/doPost e por google.script.run. */
function apiDispatch(action, params) {
  var startTime = Date.now();
  var result = ServiceRegistry.dispatch(action, params);
  var durationMs = Date.now() - startTime;

  if (typeof window !== 'undefined' && window.__debugCapture_) {
    try {
      window.__debugCapture_({
        action: action,
        params: params || {},
        result: result,
        durationMs: durationMs,
        ts: new Date().toISOString()
      });
    } catch (e) { /* ignore */ }
  }

  return result;
}

/** Usado pelo Shell.html para incluir outros templates HTML (ui/**). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
