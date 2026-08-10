/**
 * CacheRepository — wrapper sobre CacheService (TTL curto). Usado por
 * serviços que agregam várias chamadas Tiops (ex.: Dashboard) para não
 * bater cota/rate-limit a cada carregamento da UI.
 */
var CacheRepository = (function () {
  var DEFAULT_TTL_SECONDS = 300; // 5 min
  var KEY_REGISTRY_PROPS = '__CACHE_ACTIVE_KEYS__';
  var KEY_REGISTRY_TTL = 86400; // 24h

  function get(key) {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  }

  var MAX_BYTES = 90 * 1024; // CacheService limita a 100KB por item; margem p/ overhead do JSON

  function set(key, value, ttlSeconds) {
    try {
      var json = JSON.stringify(value);
      if (json.length * 2 > MAX_BYTES) return; // UTF-16: ~2 bytes/char — skip silencioso, não quebra o fluxo
      CacheService.getScriptCache().put(key, json, ttlSeconds || DEFAULT_TTL_SECONDS);
      trackKey_(key);
    } catch (e) {
      // Payload acima do limite do CacheService (100KB) ou falha de quota:
      // segue sem cache — computeFn roda de novo na próxima chamada.
    }
  }

  function remove(key) {
    CacheService.getScriptCache().remove(key);
    untrackKey_(key);
  }

  /**
   * Retorna { value, fromCache } — computeFn só roda em cache miss.
   */
  function getOrCompute(key, ttlSeconds, computeFn) {
    var cached = get(key);
    if (cached !== null) return { value: cached, fromCache: true };
    var value = computeFn();
    set(key, value, ttlSeconds);
    return { value: value, fromCache: false };
  }

  function trackKey_(key) {
    try {
      var props = PropertiesService.getScriptProperties();
      var raw = props.getProperty(KEY_REGISTRY_PROPS);
      var keys = raw ? JSON.parse(raw) : [];
      if (keys.indexOf(key) === -1) {
        keys.push(key);
        props.setProperty(KEY_REGISTRY_PROPS, JSON.stringify(keys));
      }
    } catch (e) { /* best effort */ }
  }

  function untrackKey_(key) {
    try {
      var props = PropertiesService.getScriptProperties();
      var raw = props.getProperty(KEY_REGISTRY_PROPS);
      if (!raw) return;
      var keys = JSON.parse(raw);
      var idx = keys.indexOf(key);
      if (idx !== -1) {
        keys.splice(idx, 1);
        props.setProperty(KEY_REGISTRY_PROPS, JSON.stringify(keys));
      }
    } catch (e) { /* best effort */ }
  }

  /**
   * Remove todas as chaves que casam com o padrão (contém o substring).
   * Ex.: invalidateByPattern('catalog.') remove 'catalog.products', 'catalog.sku.X', etc.
   */
  function invalidateByPattern(pattern) {
    try {
      var props = PropertiesService.getScriptProperties();
      var raw = props.getProperty(KEY_REGISTRY_PROPS);
      if (!raw) return;
      var keys = JSON.parse(raw);
      var remaining = [];
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(pattern) !== -1) {
          CacheService.getScriptCache().remove(keys[i]);
        } else {
          remaining.push(keys[i]);
        }
      }
      props.setProperty(KEY_REGISTRY_PROPS, JSON.stringify(remaining));
    } catch (e) { /* best effort */ }
  }

  return {
    get: get,
    set: set,
    remove: remove,
    getOrCompute: getOrCompute,
    invalidateByPattern: invalidateByPattern
  };
})();
