/**
 * LoggingService — logging centralizado para todos os serviços.
 * Registra ações na aba LOGS do Google Sheets. Logging é assíncrono:
 * nunca bloqueia a ação principal.
 *
 * Regras completas em specs/logging.md.
 */
var LoggingService = (function () {
  var _logBuffer = [];
  function describe() {
    return {
      name: 'logging',
      actions: {
        log: {
          description: 'Registra uma entrada de log na aba LOGS.',
          params: {
            service: { type: 'string', required: true },
            action: { type: 'string', required: true },
            status: { type: 'string', required: true, enum: ['OK', 'ERROR'] },
            caller: { type: 'string', required: false },
            summary: { type: 'string', required: false },
            durationMs: { type: 'number', required: false },
            errorMessage: { type: 'string', required: false },
            context: { type: 'object', required: false }
          }
        },
        init: {
          description: 'Cria a aba LOGS com headers e formatação.',
          params: {}
        },
        getLogs: {
          description: 'Retorna logs filtrados.',
          params: {
            service: { type: 'string', required: false },
            status: { type: 'string', required: false },
            limit: { type: 'number', required: false }
          }
        },
        clearOldLogs: {
          description: 'Remove logs com mais de 90 dias.',
          params: {}
        }
      }
    };
  }

  function generateLogId_() {
    var now = new Date();
    var ts = now.getFullYear().toString() +
      pad_(now.getMonth() + 1) +
      pad_(now.getDate()) +
      pad_(now.getHours()) +
      pad_(now.getMinutes()) +
      pad_(now.getSeconds());
    var nonce = '';
    for (var i = 0; i < 8; i++) {
      nonce += Math.floor(Math.random() * 16).toString(16);
    }
    return ts + '-' + nonce;
  }

  function pad_(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function getEnvironment_() {
    try {
      var url = ScriptApp.getService().getUrl();
      if (url && url.indexOf('/dev') !== -1) return 'dev';
    } catch (e) {}
    return 'prod';
  }

  // ─── log ────────────────────────────────────────────────────────────
  function log(params) {
    var sheetId = ConfigService.getSheetId();
    if (!sheetId) {
      console.error('[LoggingService] Sheet ID not configured');
      return { success: false, logId: '' };
    }

    var logId = generateLogId_();
    var entry = {
      updatedAt: nowBR_(),
      service: params.service || '',
      action: params.action || '',
      status: params.status || 'OK',
      caller: params.caller || 'system',
      summary: params.summary || '',
      durationMs: params.durationMs || 0,
      errorMessage: params.errorMessage || '',
      context: params.context || {},
      environment: getEnvironment_(),
      logId: logId
    };

    try {
      LoggingRepository.insertLog(entry, sheetId);
      return { success: true, logId: logId };
    } catch (e) {
      console.error('[LoggingService] Failed to write log: ' + (e.message || e));
      return { success: false, logId: logId };
    }
  }

  // ─── init ───────────────────────────────────────────────────────────
  function init() {
    var sheetId = ConfigService.getSheetId();
    if (!sheetId) {
      return { error: 'Sheet ID not configured' };
    }

    try {
      if (LoggingRepository.sheetExists(sheetId)) {
        return { success: true, sheetId: sheetId, message: 'Sheet already exists' };
      }
      LoggingRepository.getOrCreateSheet(sheetId);
      return { success: true, sheetId: sheetId };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ─── getLogs ────────────────────────────────────────────────────────
  function getLogs(params) {
    var sheetId = ConfigService.getSheetId();
    if (!sheetId) return { logs: [] };

    try {
      var logs = LoggingRepository.getLogs({
        service: params.service || '',
        status: params.status || '',
        limit: params.limit || 50
      }, sheetId);
      return { logs: logs };
    } catch (e) {
      console.error('[LoggingService] Failed to read logs: ' + (e.message || e));
      return { logs: [] };
    }
  }

  // ─── clearOldLogs ───────────────────────────────────────────────────
  function clearOldLogs() {
    var sheetId = ConfigService.getSheetId();
    if (!sheetId) return { deleted: 0 };

    try {
      return LoggingRepository.clearOldLogs(sheetId);
    } catch (e) {
      console.error('[LoggingService] Failed to clear old logs: ' + (e.message || e));
      return { deleted: 0 };
    }
  }

  // ─── logAction (helper para wrappers) ───────────────────────────────
  /**
   * Wrapper para logging assíncrono em outros serviços.
   * Uso: LoggingService.logAction('serviceName', 'actionName', params, result, startTime)
   */
  function logAction(service, action, params, result, startTime) {
    var durationMs = startTime ? Date.now() - startTime : 0;
    var status = (result && result.error) ? 'ERROR' : 'OK';
    var summary = status === 'ERROR' ? (result.error || 'Unknown error') : action + ' completed';
    var errorMessage = status === 'ERROR' ? (result.error || '') : '';
    var context = {
      params: sanitizeContext_(params),
      resultKeys: result ? Object.keys(result) : []
    };

    _logBuffer.push({
      service: service,
      action: action,
      status: status,
      caller: 'webapp',
      summary: summary,
      durationMs: durationMs,
      errorMessage: errorMessage,
      context: context
    });
  }

  function flushLogs() {
    if (_logBuffer.length === 0) return;
    var sheetId = ConfigService.getSheetId();
    if (!sheetId) { _logBuffer = []; return; }
    try {
      var sheet = SheetsRepository.getOrCreateSheet('LOGS', [
        'updatedAt', 'service', 'action', 'status', 'caller', 'summary',
        'durationMs', 'errorMessage', 'context', 'environment', 'logId'
      ]);
      var rows = [];
      for (var i = 0; i < _logBuffer.length; i++) {
        var entry = _logBuffer[i];
        rows.push([
          nowBR_(),
          entry.service, entry.action, entry.status, entry.caller,
          entry.summary, entry.durationMs, entry.errorMessage,
          JSON.stringify(entry.context), getEnvironment_(), generateLogId_()
        ]);
      }
      if (rows.length > 0) {
        var startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
      }
    } catch (e) {
      console.error('[LoggingService] Failed to flush logs: ' + e.message);
    }
    _logBuffer = [];
  }

  function sanitizeContext_(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var clean = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var val = obj[keys[i]];
      if (typeof val === 'string' && val.length > 200) {
        clean[keys[i]] = val.substring(0, 200) + '...';
      } else if (typeof val !== 'function') {
        clean[keys[i]] = val;
      }
    }
    return clean;
  }

  function nowBR_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  }

  return {
    describe: describe,
    log: log,
    init: init,
    getLogs: getLogs,
    clearOldLogs: clearOldLogs,
    logAction: logAction,
    flushLogs: flushLogs
  };
})();
