var StatusService = (function () {
  var gasStartTime = Date.now();
  var gasEndTime = null;

  function startGasTimer() {
    gasStartTime = Date.now();
  }

  function endGasTimer() {
    gasEndTime = Date.now();
  }

  function getStatus() {
    var gasTimeMs = (gasEndTime - gasStartTime) || 0;

    return {
      isOnline: gasEndTime !== null,
      timestamp: new Date().toISOString(),
      timing: {
        gasTimeMs: gasTimeMs,
        cpuTimeMs: 0,
        totalTimeMs: gasTimeMs
      },
      lastUpdate: formatarDataHora(new Date())
    };
  }

  function formatarDataHora(date) {
    var d = String(date.getDate()).padStart(2, '0');
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var y = date.getFullYear();
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    var s = String(date.getSeconds()).padStart(2, '0');
    return d + '/' + m + '/' + y + ', ' + h + ':' + min + ':' + s;
  }

  function describe() {
    return {
      name: 'system',
      actions: {
        getStatus: {
          params: {},
          returns: { isOnline: 'boolean', timing: { gasTimeMs: 'number', cpuTimeMs: 'number' }, lastUpdate: 'string' }
        }
      }
    };
  }

  return {
    describe: describe,
    getStatus: getStatus,
    startGasTimer: startGasTimer,
    endGasTimer: endGasTimer
  };
})();
