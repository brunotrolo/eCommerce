/**
 * load-services — carrega o código REAL de produção no Node.
 *
 * Lê .clasp.json → filePushOrder (a mesma ordem topológica que o GAS usa) e
 * executa cada arquivo do src/ dentro de um sandbox vm que contém os shims do
 * GAS. Como todos os serviços são IIFEs anexados ao escopo global (`var X =
 * (function(){...})()`), depois do load o sandbox expõe X como propriedade:
 * sandbox.PricingService, sandbox.FormatterService etc. — o MESMO código de
 * produção, sem cópia nem require com cache.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createShims } = require('./gas-shim');

const ROOT = path.join(__dirname, '..', '..');

function loadServices() {
  const clasp = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8'));
  const sandbox = createShims();
  vm.createContext(sandbox);

  for (const rel of clasp.filePushOrder) {
    const abs = path.join(ROOT, rel);
    const code = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      throw new Error(`Falha ao carregar ${rel}: ${e.message}`);
    }
  }

  // Re-executa um único arquivo de produção na sandbox (mesma ordem global).
  // Usado entre testes para zerar caches module-level das IIFEs (ex.:
  // OrdersRepository._sheetCache, que sobrevive a _resetGASState e vazaria
  // dados do teste anterior para o seguinte).
  sandbox.__reloadFile = (rel) => {
    if (!clasp.filePushOrder.includes(rel)) {
      throw new Error(`__reloadFile: ${rel} não está no filePushOrder`);
    }
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      throw new Error(`Falha ao recarregar ${rel}: ${e.message}`);
    }
  };

  return sandbox;
}

module.exports = { loadServices };