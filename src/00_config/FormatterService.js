/**
 * FormatterService — Normalização e Formatação de Dados (pt-BR)
 * Serviço centralizado que garante harmonia visual entre Google Sheets e Web App.
 * Todos os valores (moeda, data, hora, percentual, número, CNPJ, CPF, telefone, CEP)
 * seguem o mesmo padrão pt-BR.
 *
 * Regras completas em specs/formatter.md.
 */
var FormatterService = (function () {

  var LOCALE_CONFIG = {
    code: 'pt-BR',
    currency: {
      symbol: 'R$',
      position: 'left',
      decimalSeparator: ',',
      thousandsSeparator: '.'
    },
    date: {
      format: 'DD/MM/YYYY',
      separator: '/',
      dayFirst: true
    },
    time: {
      format: 'HH:MM:SS',
      separator: ':'
    },
    number: {
      decimalSeparator: ',',
      thousandsSeparator: '.',
      groupSize: 3
    },
    percent: {
      decimalSeparator: ',',
      symbol: '%',
      position: 'right'
    }
  };

  // ─── Helpers privados ──────────────────────────────────────────────

  function padZero(val, length) {
    length = length || 2;
    var s = String(val);
    while (s.length < length) s = '0' + s;
    return s;
  }

  function removeNonDigits(str) {
    return String(str).replace(/\D/g, '');
  }

  function removeNonAlpha(str) {
    return String(str).replace(/[^a-zA-Z0-9]/g, '');
  }

  function roundDecimal(value, decimals) {
    if (value === null || value === undefined) return 0;
    var n = Number(value);
    if (isNaN(n) || !isFinite(n)) return 0;
    decimals = decimals !== undefined ? decimals : 2;
    var factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  }

  function toNumber(value) {
    if (value === null || value === undefined) return 0;
    var n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  function ensureString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  // ─── Formatação: Moeda ────────────────────────────────────────────

  function formatCurrency(value, options) {
    if (value === null || value === undefined) return '';
    var num = toNumber(value);
    var opts = options || {};
    var showSymbol = opts.symbol !== false;
    var decimals = opts.decimals !== undefined ? opts.decimals : 2;

    var isNegative = num < 0;
    if (isNegative) num = Math.abs(num);

    var fixed = num.toFixed(decimals);
    var parts = fixed.split('.');
    var intPart = parts[0];
    var decPart = parts[1] || '';

    var formatted = '';
    var count = 0;
    for (var i = intPart.length - 1; i >= 0; i--) {
      formatted = intPart[i] + formatted;
      count++;
      if (count % 3 === 0 && i > 0) {
        formatted = LOCALE_CONFIG.number.thousandsSeparator + formatted;
      }
    }

    if (decimals > 0) {
      formatted = formatted + LOCALE_CONFIG.currency.decimalSeparator + decPart;
    }

    if (isNegative) formatted = '-' + formatted;
    if (showSymbol) formatted = LOCALE_CONFIG.currency.symbol + ' ' + formatted;

    return formatted;
  }

  // ─── Formatação: Data ─────────────────────────────────────────────

  function formatDate(date, format) {
    if (date === null || date === undefined) return '';
    var d;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'string') {
      var str = date.trim();
      var brParts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}:\d{2})?$/);
      if (brParts) {
        var day = parseInt(brParts[1], 10);
        var month = parseInt(brParts[2], 10) - 1;
        var year = parseInt(brParts[3], 10);
        d = new Date(year, month, day);
        if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return '';
      } else {
        d = new Date(str);
      }
    } else {
      return '';
    }
    if (isNaN(d.getTime())) return '';

    format = format || LOCALE_CONFIG.date.format;
    var outDay = d.getDate();
    var outMonth = d.getMonth() + 1;
    var outYear = d.getFullYear();

    return format
      .replace('DD', padZero(outDay))
      .replace('MM', padZero(outMonth))
      .replace('YYYY', String(outYear))
      .replace('YY', String(outYear).slice(-2));
  }

  // ─── Formatação: Hora ─────────────────────────────────────────────

  function formatTime(date, format) {
    if (date === null || date === undefined) return '';
    var d;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return '';
    }
    if (isNaN(d.getTime())) return '';

    format = format || LOCALE_CONFIG.time.format;
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var seconds = d.getSeconds();

    return format
      .replace('HH', padZero(hours))
      .replace('MM', padZero(minutes))
      .replace('SS', padZero(seconds));
  }

  // ─── Formatação: Data+Hora ────────────────────────────────────────

  function formatDateTime(date, format) {
    if (date === null || date === undefined) return '';
    var d;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'number') {
      d = new Date(date);
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return '';
    }
    if (isNaN(d.getTime())) return '';

    format = format || 'DD/MM/YYYY HH:MM:SS';
    var datePart = formatDate(d, format.split(' ')[0]);
    var timeFormat = format.substring(format.indexOf(' ') + 1);
    var timePart = formatTime(d, timeFormat);

    return datePart + ' ' + timePart;
  }

  // ─── Formatação: Percentual ───────────────────────────────────────

  function formatPercent(value, decimals) {
    if (value === null || value === undefined) return '';
    var num = toNumber(value);
    decimals = decimals !== undefined ? decimals : 2;

    var percent = num * 100;
    var fixed = percent.toFixed(decimals);
    var parts = fixed.split('.');
    var intPart = parts[0];
    var decPart = parts[1] || '';

    var formatted = '';
    var count = 0;
    for (var i = intPart.length - 1; i >= 0; i--) {
      formatted = intPart[i] + formatted;
      count++;
      if (count % 3 === 0 && i > 0) {
        formatted = LOCALE_CONFIG.number.thousandsSeparator + formatted;
      }
    }

    if (decimals > 0) {
      formatted = formatted + LOCALE_CONFIG.percent.decimalSeparator + decPart;
    }

    return formatted + LOCALE_CONFIG.percent.symbol;
  }

  // ─── Formatação: Número ───────────────────────────────────────────

  function formatNumber(value, decimals) {
    if (value === null || value === undefined) return '';
    var num = toNumber(value);
    decimals = decimals !== undefined ? decimals : 2;

    var isNegative = num < 0;
    if (isNegative) num = Math.abs(num);

    var fixed = num.toFixed(decimals);
    var parts = fixed.split('.');
    var intPart = parts[0];
    var decPart = parts[1] || '';

    var formatted = '';
    var count = 0;
    for (var i = intPart.length - 1; i >= 0; i--) {
      formatted = intPart[i] + formatted;
      count++;
      if (count % 3 === 0 && i > 0) {
        formatted = LOCALE_CONFIG.number.thousandsSeparator + formatted;
      }
    }

    if (decimals > 0) {
      formatted = formatted + LOCALE_CONFIG.number.decimalSeparator + decPart;
    }

    if (isNegative) formatted = '-' + formatted;

    return formatted;
  }

  // ─── Formatação: CNPJ ─────────────────────────────────────────────

  function formatCNPJ(cnpj) {
    var digits = removeNonDigits(cnpj);
    if (digits.length !== 14) return ensureString(cnpj);
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  // ─── Formatação: CPF ──────────────────────────────────────────────

  function formatCPF(cpf) {
    var digits = removeNonDigits(cpf);
    if (digits.length !== 11) return ensureString(cpf);
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  // ─── Formatação: Telefone ─────────────────────────────────────────

  function formatPhone(phone) {
    var digits = removeNonDigits(phone);
    if (digits.length === 11) {
      return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    }
    if (digits.length === 10) {
      return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }
    return ensureString(phone);
  }

  // ─── Formatação: CEP ──────────────────────────────────────────────

  function formatCEP(cep) {
    var digits = removeNonDigits(cep);
    if (digits.length !== 8) return ensureString(cep);
    return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  }

  // ─── Parsing: Moeda ───────────────────────────────────────────────

  function parseCurrency(value) {
    if (value === null || value === undefined) return 0;
    var str = ensureString(value);
    str = str.replace(/R\$/gi, '').trim();
    str = str.replace(/\./g, '').replace(',', '.');
    var num = parseFloat(str);
    return isNaN(num) ? 0 : roundDecimal(num);
  }

  // ─── Parsing: Data ────────────────────────────────────────────────

  function parseDate(value, format) {
    if (value === null || value === undefined) return null;
    var str = ensureString(value).trim();
    if (!str) return null;

    format = format || 'DD/MM/YYYY';
    var parts;

    if (format === 'DD/MM/YYYY') {
      parts = str.split('/');
      if (parts.length !== 3) return null;
      var day = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      var d = new Date(year, month, day);
      if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
      return d;
    }

    if (format === 'YYYY-MM-DD') {
      parts = str.split('-');
      if (parts.length !== 3) return null;
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var dd = parseInt(parts[2], 10);
      if (isNaN(y) || isNaN(m) || isNaN(dd)) return null;
      var d2 = new Date(y, m, dd);
      if (d2.getFullYear() !== y || d2.getMonth() !== m || d2.getDate() !== dd) return null;
      return d2;
    }

    var d3 = new Date(str);
    return isNaN(d3.getTime()) ? null : d3;
  }

  // ─── Parsing: Hora ────────────────────────────────────────────────

  function parseTime(value, format) {
    if (value === null || value === undefined) return null;
    var str = ensureString(value).trim();
    if (!str) return null;

    format = format || 'HH:MM:SS';
    var parts = str.split(':');
    if (parts.length < 2) return null;

    var hours = parseInt(parts[0], 10);
    var minutes = parseInt(parts[1], 10);
    var seconds = parts.length > 2 ? parseInt(parts[2], 10) : 0;

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

    return { hours: hours, minutes: minutes, seconds: seconds };
  }

  // ─── Parsing: Data+Hora ───────────────────────────────────────────

  function parseDateTime(value, format) {
    if (value === null || value === undefined) return null;
    var str = ensureString(value).trim();
    if (!str) return null;

    format = format || 'DD/MM/YYYY HH:MM:SS';
    var spaceIdx = str.indexOf(' ');
    if (spaceIdx === -1) return parseDate(str, format.split(' ')[0]);

    var dateStr = str.substring(0, spaceIdx);
    var timeStr = str.substring(spaceIdx + 1);
    var dateFormat = format.split(' ')[0];
    var timeFormat = format.substring(format.indexOf(' ') + 1);

    var d = parseDate(dateStr, dateFormat);
    if (!d) return null;

    var t = parseTime(timeStr, timeFormat);
    if (!t) return null;

    return new Date(
      d.getFullYear(), d.getMonth(), d.getDate(),
      t.hours, t.minutes, t.seconds
    );
  }

  // ─── Parsing: Percentual ──────────────────────────────────────────

  function parsePercent(value) {
    if (value === null || value === undefined) return 0;
    var str = ensureString(value).trim();
    str = str.replace(/%/g, '').trim();
    str = str.replace(/\./g, '').replace(',', '.');
    var num = parseFloat(str);
    if (isNaN(num)) return 0;
    if (Math.abs(num) > 1) return roundDecimal(num / 100);
    return roundDecimal(num);
  }

  // ─── Parsing: Número ──────────────────────────────────────────────

  function parseNumber(value) {
    if (value === null || value === undefined) return 0;
    var str = ensureString(value).trim();
    str = str.replace(/\./g, '').replace(',', '.');
    var num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  // ─── Parsing: CNPJ ────────────────────────────────────────────────

  function parseCNPJ(cnpj) {
    return removeNonDigits(cnpj);
  }

  // ─── Parsing: CPF ─────────────────────────────────────────────────

  function parseCPF(cpf) {
    return removeNonDigits(cpf);
  }

  // ─── Parsing: Telefone ────────────────────────────────────────────

  function parsePhone(phone) {
    return removeNonDigits(phone);
  }

  // ─── Parsing: CEP ─────────────────────────────────────────────────

  function parseCEP(cep) {
    return removeNonDigits(cep);
  }

  // ─── Init ─────────────────────────────────────────────────────────

  function init(locale) {
    locale = locale || 'pt-BR';
    if (locale !== 'pt-BR') {
      Logger.log('[FormatterService] Locale "' + locale + '" não suportado, usando pt-BR como fallback.');
    }
    return { success: true, locale: LOCALE_CONFIG.code, config: LOCALE_CONFIG };
  }

  // ─── Public API ───────────────────────────────────────────────────

  return {
    init: init,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatPercent: formatPercent,
    formatNumber: formatNumber,
    formatCNPJ: formatCNPJ,
    formatCPF: formatCPF,
    formatPhone: formatPhone,
    formatCEP: formatCEP,
    parseCurrency: parseCurrency,
    parseDate: parseDate,
    parseTime: parseTime,
    parseDateTime: parseDateTime,
    parsePercent: parsePercent,
    parseNumber: parseNumber,
    parseCNPJ: parseCNPJ,
    parseCPF: parseCPF,
    parsePhone: parsePhone,
    parseCEP: parseCEP
  };
})();
