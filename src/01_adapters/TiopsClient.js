/**
 * TiopsClient — DESATIVADO. Integração com API Tiops removida do escopo.
 * Mantido como stub para não quebrar referências existentes.
 * Serviços agora leem dados diretamente do Google Sheets.
 */
var TiopsClient = (function () {
  function call(action, params) {
    throw new Error(
      'TiopsClient está desativado. Integração com APIs de marketplace não disponível no momento.'
    );
  }

  return { call: call };
})();
