/**
 * PropertiesRepository — wrapper fino sobre PropertiesService. Seam de
 * testabilidade: nenhum outro arquivo chama PropertiesService diretamente.
 */
var PropertiesRepository = (function () {
  function getScriptProperty(key) {
    return PropertiesService.getScriptProperties().getProperty(key);
  }

  function setScriptProperty(key, value) {
    PropertiesService.getScriptProperties().setProperty(key, value);
  }

  function getUserProperty(key) {
    return PropertiesService.getUserProperties().getProperty(key);
  }

  function setUserProperty(key, value) {
    PropertiesService.getUserProperties().setProperty(key, value);
  }

  return {
    getScriptProperty: getScriptProperty,
    setScriptProperty: setScriptProperty,
    getUserProperty: getUserProperty,
    setUserProperty: setUserProperty
  };
})();
