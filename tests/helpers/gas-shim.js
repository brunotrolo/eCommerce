/**
 * gas-shim — fakes dos globais do Google Apps Script para rodar os serviços
 * reais do src/ dentro do Node (item 7 do DIAGNOSTICO_ARQUITETURA.md §5).
 *
 * Nada de GAS existe fora do GAS; este arquivo fornece implementações em
 * memória dos pontos de integração usados pelos caminhos PURAS dos serviços
 * (formatação, precificação, matcher, agregação FIFO). Abas/fetch/UI não são
 * simulados: eles continuam cobertos pelo smoke no editor GAS.
 */
'use strict';

const CACHE = new Map();
const SCRIPT_PROPS = new Map();

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
      }
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

    // Sem planilha: abas inexistentes. ConfigService cai nos fallbacks reais
    // (taxas = fato do projeto em FALLBACK_FEES/FALLBACK_SHOPEE_FEE_MODEL).
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => null }),
      getActiveSpreadsheet: () => ({ getSheetByName: () => null })
    },

    // Limpa o estado entre arquivos de teste (cada arquivo roda num processo).
    _resetGASState: () => {
      CACHE.clear();
      SCRIPT_PROPS.clear();
    }
  };
}

module.exports = { createShims };