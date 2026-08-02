/**
 * CacheRepository — wrapper sobre CacheService (TTL curto). Usado por
 * serviços que agregam várias chamadas Tiops (ex.: Dashboard) para não
 * bater cota/rate-limit a cada carregamento da UI.
 */
var CacheRepository = (function () {
  var DEFAULT_TTL_SECONDS = 300; // 5 min

  function get(key) {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  }

  function set(key, value, ttlSeconds) {
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds || DEFAULT_TTL_SECONDS);
  }

  function remove(key) {
    CacheService.getScriptCache().remove(key);
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

  return { get: get, set: set, remove: remove, getOrCompute: getOrCompute };
})();
