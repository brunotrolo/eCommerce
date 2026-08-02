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
  var body = JSON.parse(e.postData.contents);
  return ContentService.createTextOutput(JSON.stringify(apiDispatch(body.action, body.params))).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Ponto único de dispatch, chamado por doGet/doPost e por google.script.run. */
function apiDispatch(action, params) {
  return ServiceRegistry.dispatch(action, params);
}

/** Usado pelo Shell.html para incluir outros templates HTML (ui/**). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
