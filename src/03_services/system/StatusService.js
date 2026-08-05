var StatusService = (function () {
  function getStatus() {
    return {
      isOnline: true,
      timestamp: formatarDataHora(new Date()),
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
          returns: { isOnline: 'boolean', lastUpdate: 'string' }
        }
      }
    };
  }

  return {
    describe: describe,
    getStatus: getStatus
  };
})();
