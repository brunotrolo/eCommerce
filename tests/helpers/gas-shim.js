/**
 * gas-shim — fakes dos globais do Google Apps Script para rodar os serviços
 * reais do src/ dentro do Node (item 7 do DIAGNOSTICO_ARQUITETURA.md §5).
 *
 * Nada de GAS existe fora do GAS; este arquivo fornece implementações em
 * memória dos pontos de integração usados pelos caminhos dos serviços:
 * formatação, precificação, matcher, agregação FIFO, cache/props e — desde
 * as suítes de repositório (11/08/2026) — o Google Sheets completo
 * (SpreadsheetApp.openById + abas + ranges) e LockService. O fake de Sheets
 * espelha o comportamento do GAS real nos padrões usados pelos repos:
 * getSheetByName -> null (aba ausente), getLastRow/getLastColumn = 0 numa aba
 * vazia, ranges fora do grid leem '', insertSheet falha se a aba já existe,
 * e os métodos de estilo (setFrozenRows/setFontWeight/setBackground) são
 * no-ops que retornam o próprio objeto (o GAS encadeia).
 *
 * Helpers expostos no sandbox para os testes:
 *   __seedSheet(sheetId, name, rows)   — cria aba com dados (headers + linhas)
 *   __dumpSheet(sheetId, name)         — retorna a grade completa (getDataRange)
 *   __dumpSpreadsheet(sheetId)         — todas as abas de um id
 *   _resetGASState()                   — limpa sheets, cache, props e lock
 */
'use strict';

const zlib = require('zlib');

const CACHE = new Map();
const SCRIPT_PROPS = new Map();
const SPREADSHEETS = new Map(); // sheetId -> InMemorySpreadsheet
let LOCK_HELD = false;

function toBlob_(bytes) {
  return {
    getBytes: () => bytes,
    getDataAsString: () => bytes.toString('utf8'),
    getContentType: () => ''
  };
}

// ─── Spreadsheet em memória ────────────────────────────────────────────────

class InMemorySpreadsheet {
  constructor(id) {
    this.id = id;
    this.sheets = new Map(); // name -> InMemorySheet
  }
  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }
  insertSheet(name) {
    if (!name) throw new Error('insertSheet: nome obrigatório');
    if (this.sheets.has(name)) throw new Error(`Sheet ${name} já existe`);
    const sheet = new InMemorySheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  getSheets() {
    return [...this.sheets.values()];
  }
}

class InMemorySheet {
  constructor(name) {
    this.name = name;
    this.grid = []; // grid[row-1][col-1]
  }
  getLastRow() {
    return this.grid.length;
  }
  getLastColumn() {
    let max = 0;
    for (const row of this.grid) max = Math.max(max, row.length);
    return max;
  }
  getRange(row, col, numRows, numCols) {
    if (numRows === undefined) return new InMemoryRange(this, row, col, 1, 1);
    return new InMemoryRange(this, row, col, numRows, numCols);
  }
  getDataRange() {
    return new InMemoryRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  appendRow(values) {
    const row = this.getLastRow() + 1;
    new InMemoryRange(this, row, 1, 1, values.length).setValues([values]);
    return this;
  }
  setFrozenRows() {
    return this;
  }
  deleteRow(rowIndex) {
    if (rowIndex >= 1 && rowIndex <= this.grid.length) {
      this.grid.splice(rowIndex - 1, 1);
    }
    return this;
  }
}

class InMemoryRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = this.sheet.grid[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = row[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(matrix) {
    for (let i = 0; i < this.numRows; i++) {
      const src = matrix[i] || [];
      const gi = this.row - 1 + i;
      while (this.sheet.grid.length < gi + 1) this.sheet.grid.push([]);
      const target = this.sheet.grid[gi];
      for (let j = 0; j < this.numCols; j++) {
        target[this.col - 1 + j] = j < src.length ? src[j] : '';
      }
    }
    return this;
  }
  setValue(value) {
    return this.setValues([[value]]);
  }
  getValue() {
    return this.getValues()[0][0];
  }
  setFontWeight() {
    return this;
  }
  setBackground() {
    return this;
  }
}

function createShims() {
  return {
    console: console,

    Logger: {
      log: (...args) => console.log(...args)
    },

    Session: {
      getScriptTimeZone: () => 'America/Sao_Paulo'
    },

    Utilities: {
      // Formato GAS: "dd/MM/yyyy HH:mm:ss" (mesmo output de
      // Utilities.formatDate real — usado por LoggingService/FormatterService)
      formatDate: (date, tz, fmt) => {
        const pad = (n) => String(n).padStart(2, '0');
        return fmt
          .replace(/dd/g, pad(date.getDate()))
          .replace(/MM/g, pad(date.getMonth() + 1))
          .replace(/yyyy/g, String(date.getFullYear()))
          .replace(/HH/g, pad(date.getHours()))
          .replace(/mm/g, pad(date.getMinutes()))
          .replace(/ss/g, pad(date.getSeconds()));
      },
      // Usado por EstoqueBaixaService.generateBaixaId_ (substring(0,8)).
      getUuid: () => {
        const hex = '0123456789abcdef';
        let s = '';
        for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
        return s;
      },
      // base64/gzip/newBlob: CacheRepository usa para payloads grandes
      // (>180KB) — implementado com zlib para os testes de cache realistas.
      base64Encode: (data) => Buffer.from(data).toString('base64'),
      base64Decode: (str) => new Uint8Array(Buffer.from(str, 'base64')),
      newBlob: (content, contentType) => {
        const bytes =
          content instanceof Uint8Array || Buffer.isBuffer(content)
            ? Buffer.from(content)
            : Buffer.from(content === undefined || content === null ? '' : String(content), 'utf8');
        return {
          getBytes: () => bytes,
          getDataAsString: () => bytes.toString('utf8'),
          getContentType: () => contentType
        };
      },
      gzip: (blob) => toBlob_(zlib.gzipSync(Buffer.from(blob.getBytes()))),
      gunzip: (blob) => toBlob_(zlib.gunzipSync(Buffer.from(blob.getBytes())))
    },

    // XmlService.getNamespace roda no load-time de NFeEntradaService (NFE_NS).
    // parse() não é coberto pelo harness (caminho de import de NF fica no smoke).
    XmlService: {
      getNamespace: (prefix, uri) => ({ prefix, uri }),
      parse: () => {
        throw new Error('XmlService.parse não é suportado no harness — cubra no smoke GAS');
      }
    },

    CacheService: {
      getScriptCache: () => ({
        get: (key) => (CACHE.has(key) ? CACHE.get(key) : null),
        put: (key, value, ttlSeconds) => {
          if (value !== null && value !== undefined) CACHE.set(key, value);
        },
        remove: (key) => CACHE.delete(key)
      })
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (SCRIPT_PROPS.has(key) ? SCRIPT_PROPS.get(key) : null),
        setProperty: (key, value) => SCRIPT_PROPS.set(key, String(value)),
        deleteProperty: (key) => SCRIPT_PROPS.delete(key)
      })
    },

    // Fake do Google Sheets em memória. openById auto-cria a planilha no
    // primeiro acesso (o GAS real lançaria com id inválido; aqui o id é
    // apenas a chave do store — facilita testes com qualquer id).
    SpreadsheetApp: {
      openById: (id) => {
        if (!SPREADSHEETS.has(id)) SPREADSHEETS.set(id, new InMemorySpreadsheet(id));
        return SPREADSHEETS.get(id);
      },
      getActiveSpreadsheet: () => {
        if (!SPREADSHEETS.has('__ACTIVE__')) SPREADSHEETS.set('__ACTIVE__', new InMemorySpreadsheet('__ACTIVE__'));
        return SPREADSHEETS.get('__ACTIVE__');
      }
    },

    LockService: {
      // Um único lock global por execução (como no GAS). waitLock lança se já
      // estiver em posse de outra chamada — o que dispara ESTOQUE_LOCK_TIMEOUT
      // no EstoqueBaixaService.
      getScriptLock: () => ({
        waitLock: (ms) => {
          if (LOCK_HELD) throw new Error('Lock já está em posse de outra execução');
          LOCK_HELD = true;
        },
        releaseLock: () => {
          LOCK_HELD = false;
        },
        hasLock: () => LOCK_HELD
      })
    },

    ScriptApp: {
      getService: () => ({
        getUrl: () => 'https://script.google.com/macros/s/AKfycbwTESTONLY/exec'
      })
    },

    // ─── Helpers de teste ────────────────────────────────────────────────
    __seedSheet: (sheetId, sheetName, rows) => {
      const ss = SPREADSHEETS.has(sheetId) ? SPREADSHEETS.get(sheetId) : new InMemorySpreadsheet(sheetId);
      SPREADSHEETS.set(sheetId, ss);
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      } else {
        sheet.grid = [];
      }
      for (const row of rows) sheet.appendRow(row);
      return sheet;
    },

    // Grade retangular completa (equivale a sheet.getDataRange().getValues()).
    __dumpSheet: (sheetId, sheetName) => {
      const ss = SPREADSHEETS.get(sheetId);
      const sheet = ss && ss.getSheetByName(sheetName);
      return sheet ? sheet.getDataRange().getValues() : null;
    },

    __dumpSpreadsheet: (sheetId) => {
      const ss = SPREADSHEETS.get(sheetId);
      if (!ss) return null;
      const out = {};
      for (const [name, sheet] of ss.sheets) out[name] = sheet.getDataRange().getValues();
      return out;
    },

    // Limpa o estado entre testes (cada arquivo de teste roda num processo).
    _resetGASState: () => {
      CACHE.clear();
      SCRIPT_PROPS.clear();
      SPREADSHEETS.clear();
      LOCK_HELD = false;
    }
  };
}

module.exports = { createShims };
