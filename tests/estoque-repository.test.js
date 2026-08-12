/**
 * estoque-repository.test.js — suíte da aba ESTOQUE via fake de Sheets:
 * leitura com filtros, ordenação FIFO por DATA_ENTRADA (com os DOIS traps de
 * data que o FormatterService valida), appendRow/appendRows, updateRow,
 * updateRowsBulk/PerRow e getProximoSequencial. Seed usa os HEADERS reais
 * exportados pelo repo — filas espelham o layout de produção.
 */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const SID = '1FAKE_ESTOQUE_TEST';

const H = env.EstoqueRepository.HEADERS;
const idx = Object.fromEntries(H.map((h, i) => [h, i]));

function unit(over) {
  const row = new Array(H.length).fill('');
  row[idx.ESTOQUE_ID] = over.id;
  row[idx.CODIGO_PRODUTO] = over.codigo ?? 'SKU-A';
  row[idx.SKU] = over.sku ?? over.codigo ?? 'SKU-A';
  row[idx.DATA_ENTRADA] = over.data ?? '01/01/2026 08:00:00';
  row[idx.REFERENCIA_ORIGEM] = over.ref ?? 'NF#123';
  row[idx.PRECO_CUSTO_ORIGINAL] = over.custo ?? 10;
  row[idx.PRECO_VENDA_SHOPEE] = over.vendaShopee ?? 50;
  row[idx.PRECO_VENDA_MERCADO_LIVRE] = over.vendaMl ?? 55;
  row[idx.STATUS] = over.status ?? 'DISPONÍVEL';
  row[idx.BAIXADO] = over.baixado ?? 'N';
  return row;
}

const seed = (rows) => env.__seedSheet(SID, 'ESTOQUE', [H, ...rows]);
const idsDe = (r) => [...r];

beforeEach(() => env._resetGASState());

test('FIFO: unidades disponíveis ordenadas pela mais antiga DATA_ENTRADA', () => {
  seed([
    unit({ id: 'E1', data: '10/01/2026 08:00:00' }),
    unit({ id: 'E2', data: '05/02/2026 08:00:00' }),
    unit({ id: 'E3', data: '20/02/2026 08:00:00' })
  ]);
  const rows = env.EstoqueRepository.getItemsDisponivelPorProduto(SID, 'SKU-A');
  assert.deepEqual(idsDe(rows.map((r) => r.ESTOQUE_ID)), ['E1', 'E2', 'E3']);
});

test('DATA_ENTRADA inválida (31/02/2026) = timestamp 0 = mais antiga no FIFO', () => {
  seed([
    unit({ id: 'E1', data: '20/02/2026 08:00:00' }),
    unit({ id: 'E2', data: '31/02/2026 08:00:00' }) // dia inexistente
  ]);
  const rows = env.EstoqueRepository.getItemsDisponivelPorProduto(SID, 'SKU-A');
  // parse V8 ingênuo (MM/dd) daria Invalid Date -> 0 para 20/02 também e a
  // ordem dependeria de acaso; o FormatterService rejeita 31/02 -> null -> 0.
  assert.equal(rows[0].ESTOQUE_ID, 'E2');
});

test('trap 12/01 vs 15/02: parse MM/dd inverteria — Formatter mantém dd/MM', () => {
  seed([
    unit({ id: 'E1', data: '12/01/2026 09:00:00' }), // 12 de janeiro
    unit({ id: 'E2', data: '15/02/2026 09:00:00' })  // 15 de fevereiro
  ]);
  // new Date('15/02/2026') = Invalid (mês 15) -> 0 -> E2 na frente (ordem
  // invertida). O serviço lê dd/MM e deve manter E1 (janeiro) primeiro.
  const rows = env.EstoqueRepository.getItemsDisponivelPorProduto(SID, 'SKU-A');
  assert.deepEqual(idsDe(rows.map((r) => r.ESTOQUE_ID)), ['E1', 'E2']);
});

test('unidades BAIXADO=S ficam fora do FIFO mesmo sendo as mais antigas', () => {
  seed([
    unit({ id: 'E1', data: '01/01/2026 08:00:00', baixado: 'S', status: 'VENDIDO' }),
    unit({ id: 'E2', data: '02/02/2026 08:00:00' }),
    unit({ id: 'E3', data: '03/03/2026 08:00:00' })
  ]);
  const rows = env.EstoqueRepository.getItemsDisponivelPorProduto(SID, 'SKU-A');
  assert.deepEqual(idsDe(rows.map((r) => r.ESTOQUE_ID)), ['E2', 'E3']);
});

test('getRows com filtros: codigoProduto, sku e status normalizado (acento)', () => {
  seed([unit({ id: 'E1' }), unit({ id: 'E2', codigo: 'SKU-B', sku: 'SKU-B' })]);
  assert.equal(env.EstoqueRepository.getRows(SID, { codigoProduto: 'SKU-A' }).length, 1);
  assert.equal(env.EstoqueRepository.getRows(SID, { sku: 'SKU-B' }).length, 1);
  assert.equal(env.EstoqueRepository.getRows(SID, { status: 'disponivel' }).length, 2);
});

test('appendRow grava UPPERCASE na descrição e defaults nos campos vazios', () => {
  seed([]);
  const r = env.EstoqueRepository.appendRow(SID, {
    estoqueId: 'EST-20260810-1',
    codigoProduto: 'SKU-A',
    descricaoProduto: 'camiseta azul',
    dataEntrada: '10/08/2026 10:00:00',
    precoCustoOriginal: 12.5
  });
  assert.equal(r.success, true);
  const dump = env.__dumpSheet(SID, 'ESTOQUE');
  assert.equal(dump[1][idx.DESCRICAO_PRODUTO], 'CAMISETA AZUL');
  assert.equal(dump[1][idx.PRECO_CUSTO_ORIGINAL], 12.5);
  assert.equal(dump[1][idx.BAIXADO], ''); // default (não numérico → '')
});

test('getProximoSequencial: retorna próximo na sequência do dia', () => {
  seed([unit({ id: 'EST-20260810-1' }), unit({ id: 'EST-20260810-2' }), unit({ id: 'EST-20260809-9' })]);
  assert.equal(env.EstoqueRepository.getProximoSequencial(SID, '20260810'), 3);
  assert.equal(env.EstoqueRepository.getProximoSequencial(SID, '20260809'), 10);
  assert.equal(env.EstoqueRepository.getProximoSequencial(SID, '20260811'), 1);
});

test('appendRows em lote e updateRow por estoqueId', () => {
  seed([unit({ id: 'E1' })]);
  const r = env.EstoqueRepository.appendRows(SID, [
    { estoqueId: 'E2', codigoProduto: 'SKU-A', dataEntrada: '11/08/2026 10:00:00' },
    { estoqueId: 'E3', codigoProduto: 'SKU-B', dataEntrada: '11/08/2026 10:00:00' }
  ]);
  assert.equal(r.rowsInserted, 2);
  assert.equal(env.EstoqueRepository.getRows(SID).length, 3);

  const u = env.EstoqueRepository.updateRow(SID, 'E2', { status: 'VENDIDO', baixado: 'S' });
  assert.equal(u.success, true);
  const row = env.EstoqueRepository.getRows(SID, { codigoProduto: 'SKU-A' })
    .find((x) => x.ESTOQUE_ID === 'E2');
  assert.equal(row.STATUS, 'VENDIDO');
  assert.equal(row.BAIXADO, 'S');
  // não encontrado
  const nf = env.EstoqueRepository.updateRow(SID, 'NOPE', { status: 'X' });
  assert.equal(nf.success, false);
});

test('updateRowsBulk: várias linhas num único setValues (status/baixado)', () => {
  seed([
    unit({ id: 'E1', custo: 10 }),
    unit({ id: 'E2', custo: 20 }),
    unit({ id: 'E3', custo: 30 }),
    unit({ id: 'E4', codigo: 'OUTRO' })
  ]);
  const r = env.EstoqueRepository.updateRowsBulk(SID, ['E1', 'E3'], { status: 'VENDIDO', baixado: 'S' });
  assert.equal(r.success, true);
  assert.equal(r.updated, 2);
  const rows = env.EstoqueRepository.getRows(SID, { codigoProduto: 'SKU-A' });
  const byId = Object.fromEntries(rows.map((x) => [x.ESTOQUE_ID, x]));
  assert.equal(byId.E1.BAIXADO, 'S');
  assert.equal(byId.E1.STATUS, 'VENDIDO');
  assert.equal(byId.E2.BAIXADO, 'N'); // intocada
  assert.equal(byId.E3.STATUS, 'VENDIDO');
});

test('updateRowsBulkPerRow: updates diferentes por linha ({id, updates:{...}})', () => {
  seed([unit({ id: 'E1' }), unit({ id: 'E2' }), unit({ id: 'E3' })]);
  const r = env.EstoqueRepository.updateRowsBulkPerRow(SID, [
    { id: 'E1', updates: { status: 'VENDIDO', baixado: 'S' } },
    { id: 'E3', updates: { status: 'QUEBRADO', baixado: 'S' } }
  ]);
  assert.equal(r.success, true);
  assert.equal(r.updated, 2);
  const rows = env.EstoqueRepository.getRows(SID, { codigoProduto: 'SKU-A' });
  const byId = Object.fromEntries(rows.map((x) => [x.ESTOQUE_ID, x]));
  assert.equal(byId.E1.STATUS, 'VENDIDO');
  assert.equal(byId.E3.STATUS, 'QUEBRADO');
  assert.equal(byId.E2.STATUS, 'DISPONÍVEL');
});

test('countByStatus: contagem por status (inclui acentos)', () => {
  seed([unit({ id: 'E1' }), unit({ id: 'E2', status: 'VENDIDO' }), unit({ id: 'E3', status: 'DEVOLVIDO' })]);
  const c = env.EstoqueRepository.countByStatus(SID, 'SKU-A');
  assert.equal(c['DISPONÍVEL'], 1);
  assert.equal(c.VENDIDO, 1);
  assert.equal(c.DEVOLVIDO, 1);
});