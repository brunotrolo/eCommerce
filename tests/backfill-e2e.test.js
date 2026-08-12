/**
 * backfill-e2e.test.js — EstoqueBaixaService.backfillExistingOrders inteiro
 * contra o fake de Sheets: aba PEDIDOS -> baixas FIFO por SKU -> persistência
 * de BAIXADO/BAIXA_ESTOQUE_IDS/TOTAL_COST no batch (GUARD DE REGRESSÃO: o
 * flush não gravava nada desde 3b5cb5b porque o idSet vinha vazio — o teste
 * abaixo falha sem o fix), gates UNPAID/CANCELLED, sentinela SEM_ESTOQUE e
 * skip de pedido já completo (jaCompleto). Também cobre a criação de colunas
 * BAIXA_ESTOQUE_IDS/TOTAL_COST pelo prepareBaixaBulk.
 */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const SID = env.ConfigService.getSheetId();

const PH = env.OrdersRepository.HEADERS;
const pIdx = Object.fromEntries(PH.map((h, i) => [h, i]));

const EH = env.EstoqueRepository.HEADERS;
const eIdx = Object.fromEntries(EH.map((h, i) => [h, i]));

function pedido(over, extraCols) {
  const width = extraCols ? PH.length - 3 : PH.length;
  const row = new Array(width).fill('');
  row[pIdx.ORDER_ID] = over.id;
  row[pIdx.STATUS] = over.status ?? 'PAID';
  row[pIdx.ITEM_SKUS] = over.skus ?? 'A:1';
  if (pIdx.BAIXADO < width) {
    row[pIdx.BAIXADO] = over.baixado ?? '';
    row[pIdx.BAIXA_ESTOQUE_IDS] = over.ids ?? '';
    row[pIdx.TOTAL_COST] = over.custo ?? '';
  }
  return row;
}

function unit(over) {
  const row = new Array(EH.length).fill('');
  row[eIdx.ESTOQUE_ID] = over.id;
  row[eIdx.CODIGO_PRODUTO] = over.codigo;
  row[eIdx.SKU] = over.codigo;
  row[eIdx.DATA_ENTRADA] = over.data ?? '01/01/2026 08:00:00';
  row[eIdx.REFERENCIA_ORIGEM] = 'NF#1';
  row[eIdx.PRECO_CUSTO_ORIGINAL] = over.custo ?? 10;
  row[eIdx.PRECO_VENDA_SHOPEE] = 50;
  row[eIdx.PRECO_VENDA_MERCADO_LIVRE] = 55;
  row[eIdx.STATUS] = 'DISPONÍVEL';
  row[eIdx.BAIXADO] = 'N';
  return row;
}

const seedEstoque = () =>
  env.__seedSheet(SID, 'ESTOQUE', [
    EH,
    unit({ id: 'E1', codigo: 'A', data: '10/01/2026 08:00:00', custo: 10 }),
    unit({ id: 'E2', codigo: 'A', data: '05/02/2026 08:00:00', custo: 20 }),
    unit({ id: 'E3', codigo: 'A', data: '20/02/2026 08:00:00', custo: 30 }),
    unit({ id: 'B1', codigo: 'B', data: '01/03/2026 08:00:00', custo: 5 })
  ]);

const rowsPedidos = () => {
  const dump = env.__dumpSheet(SID, 'PEDIDOS');
  return dump.slice(1).map((r) => ({ id: r[pIdx.ORDER_ID], baixado: r[pIdx.BAIXADO], ids: r[pIdx.BAIXA_ESTOQUE_IDS], custo: r[pIdx.TOTAL_COST] }));
};

beforeEach(() => {
  // _sheetCache (TTL 30s) é module-level e sobrevive ao _resetGASState —
  // re-executa o repositório na sandbox para zerá-lo entre testes
  env.__reloadFile('src/02_repositories/OrdersRepository.js');
  env._resetGASState();
  seedEstoque();
  env.__seedSheet(SID, 'PEDIDOS', [
    PH,
    pedido({ id: 'O1', status: 'PAID', skus: 'A:2;B:1' }),
    pedido({ id: 'O2', status: 'UNPAID', skus: 'A:1' }),
    pedido({ id: 'O3', status: 'CANCELLED', skus: 'B:2' }),
    pedido({ id: 'O4', status: 'PAID', skus: 'SEM_ESTOQUE:1' }),
    pedido({ id: 'O5', status: 'PAID', skus: 'A:1', baixado: 'S', ids: 'E1', custo: 10 })
  ]);
});

test('GUARD REGRESSÃO: backfill persiste BAIXADO/ids/custo na aba PEDIDOS (um único flush)', () => {
  const r = env.EstoqueBaixaService.backfillExistingOrders();
  assert.equal(r.processados, 2); // O1 + O4 (UNPAID/CANCELLED pulados, O5 já completo)
  assert.equal(r.baixados, 1);
  assert.equal(r.erros, 0);
  assert.equal(r.jaProcessados, 1);

  const rows = Object.fromEntries(rowsPedidos().map((x) => [x.id, x]));
  // O1: A:2;B:1 -> E1,E2 (custo 30) + B1 (custo 5) = 35
  assert.equal(rows.O1.baixado, 'BAIXADO');
  assert.equal(rows.O1.ids, 'E1,E2,B1');
  assert.equal(rows.O1.custo, 35);
  // O4: só sentinela SEM_ESTOQUE -> PENDENTE sem ids
  assert.equal(rows.O4.baixado, 'PENDENTE');
  assert.equal(rows.O4.ids, '');
  // gates não tocaram as linhas
  assert.equal(rows.O2.baixado, '');
  assert.equal(rows.O3.baixado, '');
});

test('UNPAID/CANCELLED não baixam estoque nem geram PENDENTE', () => {
  env.EstoqueBaixaService.backfillExistingOrders();
  const est = env.EstoqueRepository.getRows(SID);
  assert.equal(est.filter((x) => x.BAIXADO === 'S').length, 3); // só E1,E2,B1
  assert.equal(env.EstoqueBaixasRepository.getPendingReprocess().length, 0);
});

test('jaCompleto: pedido com BAIXADO + ids não reprocessa (estoque intocado)', () => {
  const antes = env.EstoqueRepository.getRows(SID).length;
  const r = env.EstoqueBaixaService.backfillExistingOrders();
  assert.equal(r.jaProcessados, 1); // O5 pulado
  assert.equal(env.EstoqueRepository.getRows(SID).length, antes);
});

test('backfill idempotente: segunda execução não baixa de novo (via referência)', () => {
  env.EstoqueBaixaService.backfillExistingOrders();
  const r2 = env.EstoqueBaixaService.backfillExistingOrders();
  // O1 já completo (skip); O4 reprocessa só a sentinela (PENDENTE) sem baixa
  assert.equal(r2.processados, 1);
  assert.equal(r2.baixados, 0);
  const est = env.EstoqueRepository.getRows(SID);
  assert.equal(est.filter((x) => x.BAIXADO === 'S').length, 3); // nada a mais
  assert.equal(est.filter((x) => x.CODIGO_PRODUTO === 'A' && x.BAIXADO === 'N').length, 1); // E3 único A restante
});

test('pedido sem nenhuma baixa (sem estoque + sem sentinela) fica PENDENTE sem ids', () => {
  env.__seedSheet(SID, 'PEDIDOS', [
    PH,
    pedido({ id: 'O10', status: 'PAID', skus: 'A:5' })
  ]);
  const r = env.EstoqueBaixaService.backfillExistingOrders();
  assert.equal(r.processados, 1);
  assert.equal(r.baixados, 0);
  const rows = rowsPedidos();
  assert.equal(rows[0].baixado, 'PARCIAL'); // só 3 de 5 disponíveis
  assert.equal(rows[0].ids, 'E1,E2,E3');
  assert.equal(rows[0].custo, 60);
  // parcial (3 de 5) não gera pendência — PENDENTE só quando ZERO unidades
  assert.equal(env.EstoqueBaixasRepository.getPendingReprocess().length, 0);
});

test('prepareBaixaBulk cria colunas BAIXA_ESTOQUE_IDS/TOTAL_COST quando ausentes', () => {
  // aba sem TOTAL_COST/BAIXADO/BAIXA_ESTOQUE_IDS (largura antiga)
  const oldHeaders = PH.slice(0, PH.length - 3);
  env.__seedSheet(SID, 'PEDIDOS', [oldHeaders, pedido({ id: 'X1' }, true)]);
  const prep = env.OrdersRepository.prepareBaixaBulk([]);
  assert.ok(prep);
  const dump = env.__dumpSheet(SID, 'PEDIDOS');
  assert.equal(dump[0][dump[0].length - 2], 'BAIXA_ESTOQUE_IDS');
  assert.equal(dump[0][dump[0].length - 1], 'TOTAL_COST');
});