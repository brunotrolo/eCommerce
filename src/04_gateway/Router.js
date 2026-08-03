/**
 * Router — único ponto de entrada do Web App: doGet/doPost (chamadas HTTP
 * externas) e apiDispatch (usado também por google.script.run a partir dos
 * widgets). Nenhum outro arquivo define doGet/doPost.
 */
function doGet(e) {
  StatusService.startGasTimer();
  if (e && e.parameter && e.parameter.action) {
    var params = e.parameter.params ? JSON.parse(e.parameter.params) : {};
    var result = apiDispatch(e.parameter.action, params);
    StatusService.endGasTimer();
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  var htmlOutput = HtmlService.createTemplateFromFile('ui/shell/Shell')
    .evaluate()
    .setTitle('Painel — Shopee + Mercado Livre')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  StatusService.endGasTimer();
  return htmlOutput;
}

function doPost(e) {
  StatusService.startGasTimer();
  var body = JSON.parse(e.postData.contents);
  var result = apiDispatch(body.action, body.params);
  StatusService.endGasTimer();
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
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
