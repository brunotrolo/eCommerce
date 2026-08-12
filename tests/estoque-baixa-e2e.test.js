/**
 * estoque-baixa-e2e.test.js — fluxos REAIS de baixa de estoque contra o fake
 * de Sheets: EstoqueBaixaService.baixarPorProduto (FIFO + idempotência por
 * IDEMPOTENCY_KEY + PENDENTE_MAPEAMENTO), reverterBaixa (CANCELADO/DEVOLVIDO,
 * idempotente) e getBaixaStatus, com LockService real. Cobre os dois
 * repositórios (ESTOQUE + ESTOQUE_BAIXAS) e o LoggingService bufferizado.
 */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const SID = env.ConfigService.getSheetId();

const H = env.EstoqueRepository.HEADERS;
const idx = Object.fromEntries(H.map((h, i) => [h, i]));
const BH = env.EstoqueBaixasRepository.HEADERS;
const bIdx = Object.fromEntries(BH.map((h, i) => [h, i]));

function unit(over) {
  const row = new Array(H.length).fill('');
  row[idx.ESTOQUE_ID] = over.id;
  row[idx.CODIGO_PRODUTO] = over.codigo ?? 'SKU-A';
  row[idx.SKU] = over.codigo ?? 'SKU-A';
  row[idx.DATA_ENTRADA] = over.data ?? '01/01/2026 08:00:00';
  row[idx.REFERENCIA_ORIGEM] = over.ref ?? 'NF#1';
  row[idx.PRECO_CUSTO_ORIGINAL] = over.custo ?? 10;
  row[idx.PRECO_VENDA_SHOPEE] = 50;
  row[idx.PRECO_VENDA_MERCADO_LIVRE] = 55;
  row[idx.STATUS] = 'DISPONÍVEL';
  row[idx.BAIXADO] = 'N';
  return row;
}

beforeEach(() => {
  env._resetGASState();
  env.__seedSheet(SID, 'ESTOQUE', [
    H,
    unit({ id: 'E1', data: '10/01/2026 08:00:00', custo: 10 }),
    unit({ id: 'E2', data: '05/02/2026 08:00:00', custo: 20 }),
    unit({ id: 'E3', data: '20/02/2026 08:00:00', custo: 30 })
  ]);
});

const baixa = (over) =>
  env.EstoqueBaixaService.baixarPorProduto({
    codigoProduto: 'SKU-A',
    quantidade: over.quantidade ?? 2,
    origem: over.origem ?? 'PEDIDO_SHOPEE',
    referenciaOrigem: over.ref ?? 'SHOPEE#O1:SKU-A',
    idempotencyKey: over.key ?? 'SHOPEE#O1:SKU-A',
    ...over.rest
  });

test('baixarPorProduto: FIFO pega as 2 mais antigas, custo somado, ESTOQUE marcado', () => {
  const r = baixa({});
  assert.equal(r.success, true);
  assert.equal(r.baixados, 2);
  assert.deepEqual([...r.estoque_ids], ['E1', 'E2']);
  assert.equal(r.custoTotal, 30);
  assert.equal(r.faltantes, 0);
  assert.equal(r.jaExistia, false);

  const estoque = env.EstoqueRepository.getRows(SID);
  const byId = Object.fromEntries(estoque.map((x) => [x.ESTOQUE_ID, x]));
  assert.equal(byId.E1.BAIXADO, 'S');
  assert.equal(byId.E1.STATUS, 'VENDIDO');
  assert.equal(byId.E2.BAIXADO, 'S');
  assert.equal(byId.E3.BAIXADO, 'N'); // intocada

  const bDump = env.__dumpSheet(SID, 'ESTOQUE_BAIXAS');
  assert.equal(bDump.length, 2);
  assert.equal(bDump[1][bIdx.REFERENCIA_ORIGEM], 'SHOPEE#O1:SKU-A');
  assert.equal(bDump[1][bIdx.ORIGEM], 'PEDIDO_SHOPEE');
  assert.equal(bDump[1][bIdx.QUANTIDADE], 2);
  assert.equal(bDump[1][bIdx.ESTOQUE_IDS], 'E1,E2');
  assert.equal(bDump[1][bIdx.STATUS], 'BAIXADO');
  assert.match(String(bDump[1][bIdx.CRIADO_EM]), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  assert.equal(bDump[1][bIdx.REVERTIDO_EM], '');
});

test('idempotência: mesma idempotencyKey não baixa de novo (jaExistia)', () => {
  baixa({});
  const r2 = baixa({});
  assert.equal(r2.success, true);
  assert.equal(r2.jaExistia, true);
  assert.equal(r2.baixados, 0);
  assert.deepEqual([...r2.estoque_ids], ['E1', 'E2']);
  assert.equal(r2.custoTotal, 30);
  // estoque não muda: E3 segue a única disponível
  const restantes = env.EstoqueRepository.getItemsDisponivelPorProduto(SID, 'SKU-A');
  assert.deepEqual([...restantes.map((x) => x.ESTOQUE_ID)], ['E3']);
  // uma única linha em ESTOQUE_BAIXAS
  assert.equal(env.__dumpSheet(SID, 'ESTOQUE_BAIXAS').length, 2);
});

test('faltantes: baixa parcial baixa o que tiver disponível (SAIDA_MANUAL sem pendência)', () => {
  // 3 disponíveis, pedido 5 → baixa 3 (faltantes 2), row BAIXADA com as 3
  const r = baixa({ quantidade: 5, origem: 'SAIDA_MANUAL', ref: 'MAN#1', key: 'MAN#1' });
  assert.equal(r.baixados, 3);
  assert.equal(r.faltantes, 2);
  assert.deepEqual([...r.estoque_ids], ['E1', 'E2', 'E3']);

  // zero disponíveis → nada baixado, sem pendência (origem ≠ PEDIDO_SHOPEE), sem row
  const r2 = baixa({ quantidade: 1, key: 'MAN#2', ref: 'MAN#2', origem: 'SAIDA_MANUAL' });
  assert.equal(r2.baixados, 0);
  assert.equal(r2.faltantes, 1);
  assert.equal(env.__dumpSheet(SID, 'ESTOQUE_BAIXAS').length, 2); // só headers + 1 row (a parcial)
});

test('PEDIDO_SHOPEE sem estoque: registra PENDENTE_MAPEAMENTO', () => {
  // SKU sem unidades
  const r = env.EstoqueBaixaService.baixarPorProduto({
    codigoProduto: 'SKU-ZZZ',
    quantidade: 1,
    origem: 'PEDIDO_SHOPEE',
    referenciaOrigem: 'SHOPEE#O9:SKU-ZZZ',
    idempotencyKey: 'SHOPEE#O9:SKU-ZZZ'
  });
  assert.equal(r.baixados, 0);
  assert.equal(r.faltantes, 1);
  const pend = env.EstoqueBaixasRepository.getPendingReprocess();
  assert.equal(pend.length, 1);
  assert.equal(pend[0].CODIGO_PRODUTO, 'SKU-ZZZ');
  assert.equal(pend[0].STATUS, 'PENDENTE_MAPEAMENTO');
});

test('validação de params e erro de lock (ESTOQUE_LOCK_TIMEOUT)', () => {
  const inv = env.EstoqueBaixaService.baixarPorProduto({ origem: 'X' });
  assert.equal(inv.success, false);
  assert.match(inv.error, /codigoProduto obrigatório/);
  assert.match(inv.error, /referenciaOrigem obrigatório/);

  // lock já em posse de outra execução -> waitLock lança -> ESTOQUE_LOCK_TIMEOUT
  const lock = env.LockService.getScriptLock();
  lock.waitLock(100);
  try {
    assert.throws(() => baixa({}), /ESTOQUE_LOCK_TIMEOUT/);
  } finally {
    lock.releaseLock();
  }
});

test('reverterBaixa CANCELADO: unidades voltam a DISPONÍVEL/N, baixa REVERTIDO', () => {
  baixa({});
  const r = env.EstoqueBaixaService.reverterBaixa({
    referenciaOrigem: 'SHOPEE#O1:SKU-A',
    motivo: 'CANCELADO'
  });
  assert.equal(r.success, true);
  assert.equal(r.revertidos, 2);
  assert.equal(r.custoTotal, 30);

  const estoque = env.EstoqueRepository.getRows(SID);
  const byId = Object.fromEntries(estoque.map((x) => [x.ESTOQUE_ID, x]));
  assert.equal(byId.E1.STATUS, 'DISPONÍVEL');
  assert.equal(byId.E1.BAIXADO, 'N');
  assert.equal(byId.E2.STATUS, 'DISPONÍVEL');
  assert.equal(byId.E2.BAIXADO, 'N');

  const dump = env.__dumpSheet(SID, 'ESTOQUE_BAIXAS');
  assert.equal(dump[1][bIdx.STATUS], 'REVERTIDO');
  assert.match(String(dump[1][bIdx.REVERTIDO_EM]), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});

test('reverterBaixa DEVOLVIDO: status DEVOLVIDO e idempotente na repetição', () => {
  baixa({});
  env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'SHOPEE#O1:SKU-A', motivo: 'DEVOLVIDO' });
  const estoque = env.EstoqueRepository.getRows(SID);
  const byId = Object.fromEntries(estoque.map((x) => [x.ESTOQUE_ID, x]));
  assert.equal(byId.E1.STATUS, 'DEVOLVIDO');
  assert.equal(byId.E1.BAIXADO, 'N');

  const r2 = env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'SHOPEE#O1:SKU-A', motivo: 'DEVOLVIDO' });
  assert.equal(r2.success, true);
  assert.equal(r2.revertidos, 0);
  // sem dupla reversão no estoque: E1 e E2 seguem DEVOLVIDO, E3 ainda disponível
  assert.equal(env.EstoqueRepository.getRows(SID).filter((x) => x.STATUS === 'DEVOLVIDO').length, 2);
});

test('reverterBaixa: erros — ref inexistente, STATUS_INVALIDO e motivo inválido', () => {
  assert.equal(env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'NOPE' }).success, false);
  const bad = env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'X', motivo: 'OUTRO' });
  assert.equal(bad.success, false);
  assert.match(bad.error, /motivo deve ser CANCELADO ou DEVOLVIDO/);

  // pendência (status PENDENTE_MAPEAMENTO) não pode ser revertida
  env.EstoqueBaixaService.baixarPorProduto({
    codigoProduto: 'SKU-ZZZ',
    quantidade: 1,
    origem: 'PEDIDO_SHOPEE',
    referenciaOrigem: 'SHOPEE#O9:SKU-ZZZ',
    idempotencyKey: 'SHOPEE#O9:SKU-ZZZ'
  });
  const inv = env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'SHOPEE#O9:SKU-ZZZ', motivo: 'CANCELADO' });
  assert.equal(inv.success, false);
  assert.equal(inv.motivo, 'STATUS_INVALIDO');
});

test('getBaixaStatus acompanha o ciclo BAIXADO -> REVERTIDO', () => {
  assert.equal(env.EstoqueBaixaService.getBaixaStatus({ referenciaOrigem: 'SHOPEE#O1:SKU-A' }).jaBaixado, false);
  baixa({});
  const s1 = env.EstoqueBaixaService.getBaixaStatus({ referenciaOrigem: 'SHOPEE#O1:SKU-A' });
  assert.equal(s1.jaBaixado, true);
  assert.equal(s1.status, 'BAIXADO');
  assert.deepEqual([...s1.estoque_ids], ['E1', 'E2']);
  env.EstoqueBaixaService.reverterBaixa({ referenciaOrigem: 'SHOPEE#O1:SKU-A', motivo: 'CANCELADO' });
  const s2 = env.EstoqueBaixaService.getBaixaStatus({ referenciaOrigem: 'SHOPEE#O1:SKU-A' });
  assert.equal(s2.jaBaixado, false);
  assert.equal(s2.status, 'REVERTIDO');
});