/**
 * config-repository.test.js — suíte do ConfigRepository + ConfigService contra
 * o fake de Sheets em memória. Prova que as taxas/margens/IDs vêm da aba
 * CONFIG real (não dos fallbacks hardcoded), que set() atualiza/insere linhas
 * e que getOrCreateSheet semeia a aba com DEFAULTS. Só o ConfigService tem
 * cache próprio (_configCache, TTL 5min) — reloadConfig() obrigatório entre
 * testes que re-semeiam a aba.
 */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const SID = env.ConfigService.getSheetId();

beforeEach(() => {
  env._resetGASState();
  env.ConfigService.reloadConfig(); // limpa _configCache entre testes
});

const seedConfig = (overrides) => {
  const rows = [['CHAVE', 'VALOR', 'DESCRICAO']];
  for (const [chave, valor] of Object.entries(overrides)) {
    rows.push([chave, String(valor), '']);
  }
  env.__seedSheet(SID, 'CONFIG', rows);
  env.ConfigService.reloadConfig(); // re-lê a aba recém-seedada (cache limpo)
};

test('sem aba CONFIG: getAll retorna DEFAULTS (fallback do projeto)', () => {
  const cfg = env.ConfigRepository.getAll(SID);
  assert.equal(cfg.shopee_fee_pct, env.ConfigRepository.DEFAULTS.shopee_fee_pct);
  assert.equal(cfg.ml_fee_fixed, env.ConfigRepository.DEFAULTS.ml_fee_fixed);
  assert.equal(cfg.default_margin_pct, env.ConfigRepository.DEFAULTS.default_margin_pct);
  assert.equal(cfg.ml_account_id, env.ConfigRepository.DEFAULTS.ml_account_id);
});

test('getOrCreateSheet semeia aba CONFIG com HEADERS + DEFAULTS', () => {
  env.ConfigRepository.getOrCreateSheet(SID);
  const dump = env.__dumpSheet(SID, 'CONFIG');
  assert.deepEqual([...dump[0]], ['CHAVE', 'VALOR', 'DESCRICAO']);
  assert.equal(String(dump[1][0]), 'shopee_fee_pct');
  assert.equal(dump[1][1], env.ConfigRepository.DEFAULTS.shopee_fee_pct);
  // todas as DEFAULTS presentes, uma linha cada
  const chaves = dump.slice(1).map((r) => String(r[0]));
  for (const k of Object.keys(env.ConfigRepository.DEFAULTS)) {
    assert.ok(chaves.includes(k), `default ${k} deveria estar na aba`);
  }
});

test('taxas da aba CONFIG sobrescrevem fallbacks (numérico parseFloat)', () => {
  seedConfig({
    shopee_fee_pct: 0.25,
    ml_fee_pct: 0.10,
    ml_fee_fixed: 10,
    default_margin_pct: 0.30,
    shopee_commission_pct_cartao: 0.15
  });
  const cfg = env.ConfigRepository.getAll(SID);
  assert.equal(cfg.shopee_fee_pct, 0.25);
  assert.equal(cfg.ml_fee_pct, 0.1);
  assert.equal(cfg.ml_fee_fixed, 10);
  assert.equal(cfg.default_margin_pct, 0.3);
  assert.equal(cfg.shopee_commission_pct_cartao, 0.15);
});

test('ConfigService reflete a aba: getMarketplaceFee e getShopeeFeeModel', () => {
  seedConfig({ ml_fee_pct: 0.10, ml_fee_fixed: 10, shopee_commission_pct_cartao: 0.15 });
  const ml = env.ConfigService.getMarketplaceFee('mercado_livre');
  assert.equal(ml.pct, 0.1);
  assert.equal(ml.fixed, 10);
  const model = env.ConfigService.getShopeeFeeModel('cartao_avista', 1);
  assert.equal(model.commissionPct, 0.15);
});

test('chave string com JSON (sincronizar) passa intacta', () => {
  seedConfig({ sincronizar: JSON.stringify(['ordersImport', 'catalog']) });
  const cfg = env.ConfigRepository.getAll(SID);
  assert.deepEqual(JSON.parse(cfg.sincronizar), ['ordersImport', 'catalog']);
});

test('set atualiza linha existente na aba (mesma chave, 2a coluna)', () => {
  env.ConfigRepository.getOrCreateSheet(SID); // semeador DEFAULTS completo
  const r = env.ConfigRepository.set(SID, 'ml_fee_fixed', 9);
  assert.equal(r.success, true);
  assert.equal(env.ConfigRepository.getAll(SID).ml_fee_fixed, 9);
  const dump = env.__dumpSheet(SID, 'CONFIG');
  const row = dump.find((l) => String(l[0]) === 'ml_fee_fixed');
  assert.equal(row[1], 9);
  // não duplica a linha
  assert.equal(dump.filter((l) => String(l[0]) === 'ml_fee_fixed').length, 1);
});

test('set insere nova linha para chave inexistente', () => {
  seedConfig({ ml_fee_pct: 0.10 });
  env.ConfigRepository.set(SID, 'shopee_commission_pct_pix', 0.12);
  const cfg = env.ConfigRepository.getAll(SID);
  assert.equal(cfg.shopee_commission_pct_pix, 0.12);
  const dump = env.__dumpSheet(SID, 'CONFIG');
  assert.ok(dump.some((l) => String(l[0]) === 'shopee_commission_pct_pix'));
});