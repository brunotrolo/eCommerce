/**
 * estoque-baixas-repository.test.js — suíte da aba ESTOQUE_BAIXAS:
 * insertRow, find por idempotencyKey/referenciaOrigem, updateRowByBaixaId
 * (reversão), getPendingReprocess (só PENDENTE_MAPEAMENTO) e a migração de
 * headers antigos (colunas faltantes adicionadas ao final).
 */
'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
// getPendingReprocess() usa ConfigService.getSheetId() sem argumento —
// o SID precisa ser o real (não um fake), senão o teste lê outra planilha
const SID = env.ConfigService.getSheetId();

const H = env.EstoqueBaixasRepository.HEADERS;
const idx = Object.fromEntries(H.map((h, i) => [h, i]));

beforeEach(() => env._resetGASState());

function seedBaixa(over) {
  const row = new Array(H.length).fill('');
  row[idx.BAIXA_ID] = over.baixaId ?? 'BX-1';
  row[idx.REFERENCIA_ORIGEM] = over.ref ?? 'SHOPEE#O1:SKU-A';
  row[idx.ORIGEM] = over.origem ?? 'PEDIDO_SHOPEE';
  row[idx.CODIGO_PRODUTO] = over.codigo ?? 'SKU-A';
  row[idx.QUANTIDADE] = over.quantidade ?? 2;
  row[idx.ESTOQUE_IDS] = over.ids ?? 'E1,E2';
  row[idx.IDEMPOTENCY_KEY] = over.key ?? 'K-1';
  row[idx.STATUS] = over.status ?? 'BAIXADO';
  row[idx.CRIADO_EM] = over.criadoEm ?? '11/08/2026 10:00:00';
  row[idx.REVERTIDO_EM] = over.revertidoEm ?? '';
  return row;
}

test('insertRow grava todos os campos na linha nova (após headers)', () => {
  env.EstoqueBaixasRepository.insertRow(SID, {
    baixaId: 'BX-1',
    referenciaOrigem: 'SHOPEE#O1:SKU-A',
    origem: 'PEDIDO_SHOPEE',
    codigoProduto: 'SKU-A',
    quantidade: 2,
    estoqueIds: 'E1,E2',
    idempotencyKey: 'K-1',
    status: 'BAIXADO',
    criadoEm: '11/08/2026 10:00:00',
    revertidoEm: ''
  });
  const dump = env.__dumpSheet(SID, 'ESTOQUE_BAIXAS');
  assert.equal(dump.length, 2); // headers + 1 linha
  assert.equal(dump[1][idx.BAIXA_ID], 'BX-1');
  assert.equal(dump[1][idx.ESTOQUE_IDS], 'E1,E2');
  assert.equal(dump[1][idx.QUANTIDADE], 2);
  assert.equal(dump[1][idx.REVERTIDO_EM], '');
});

test('findByIdempotencyKey / findByReferenciaOrigem retornam a primeira ocorrência', () => {
  env.__seedSheet(SID, 'ESTOQUE_BAIXAS', [
    H,
    seedBaixa({ baixaId: 'BX-1', ref: 'SHOPEE#O1:SKU-A', key: 'K-1' }),
    seedBaixa({ baixaId: 'BX-2', ref: 'SHOPEE#O2:SKU-A', key: 'K-2', status: 'REVERTIDO' })
  ]);
  const byKey = env.EstoqueBaixasRepository.findByIdempotencyKey(SID, 'K-2');
  assert.equal(byKey.BAIXA_ID, 'BX-2');
  assert.equal(byKey.STATUS, 'REVERTIDO');
  const byRef = env.EstoqueBaixasRepository.findByReferenciaOrigem(SID, 'SHOPEE#O1:SKU-A');
  assert.equal(byRef.BAIXA_ID, 'BX-1');
  assert.equal(env.EstoqueBaixasRepository.findByIdempotencyKey(SID, 'K-NOPE'), null);
  assert.equal(env.EstoqueBaixasRepository.findByReferenciaOrigem(SID, 'X'), null);
});

test('updateRowByBaixaId: reversão persiste REVERTIDO + REVERTIDO_EM', () => {
  env.__seedSheet(SID, 'ESTOQUE_BAIXAS', [H, seedBaixa({ baixaId: 'BX-1' })]);
  const r = env.EstoqueBaixasRepository.updateRowByBaixaId(SID, 'BX-1', {
    status: 'REVERTIDO',
    revertidoEm: '12/08/2026 09:00:00'
  });
  assert.equal(r.success, true);
  const dump = env.__dumpSheet(SID, 'ESTOQUE_BAIXAS');
  assert.equal(dump[1][idx.STATUS], 'REVERTIDO');
  assert.equal(dump[1][idx.REVERTIDO_EM], '12/08/2026 09:00:00');
  // baixa inexistente
  const nf = env.EstoqueBaixasRepository.updateRowByBaixaId(SID, 'NOPE', { status: 'X' });
  assert.equal(nf.success, false);
});

test('getPendingReprocess: só rows PENDENTE_MAPEAMENTO, na ordem da aba', () => {
  env.__seedSheet(SID, 'ESTOQUE_BAIXAS', [
    H,
    seedBaixa({ baixaId: 'BX-1', status: 'PENDENTE_MAPEAMENTO', ids: '' }),
    seedBaixa({ baixaId: 'BX-2', status: 'BAIXADO' }),
    seedBaixa({ baixaId: 'BX-3', status: 'PENDENTE_MAPEAMENTO', ids: '', ref: 'SHOPEE#O3:SKU-B', key: 'K-3' })
  ]);
  const pend = env.EstoqueBaixasRepository.getPendingReprocess();
  assert.equal(pend.length, 2);
  assert.equal(pend[0].BAIXA_ID, 'BX-1');
  assert.equal(pend[1].BAIXA_ID, 'BX-3');
});

test('getRows com filtro origem/status combina com find', () => {
  env.__seedSheet(SID, 'ESTOQUE_BAIXAS', [
    H,
    seedBaixa({ baixaId: 'BX-1', origem: 'PEDIDO_SHOPEE' }),
    seedBaixa({ baixaId: 'BX-2', origem: 'SAIDA_MANUAL', ref: 'MAN#1', key: 'K-M' })
  ]);
  assert.equal(env.EstoqueBaixasRepository.getRows(SID, { origem: 'PEDIDO_SHOPEE' }).length, 1);
  assert.equal(env.EstoqueBaixasRepository.getRows(SID, { status: 'BAIXADO' }).length, 2);
});

test('migração de headers: aba antiga (8 colunas) ganha CRIADO_EM/REVERTIDO_EM', () => {
  const oldHeaders = H.slice(0, 8);
  const oldRow = seedBaixa({ baixaId: 'BX-1' }).slice(0, 8);
  env.__seedSheet(SID, 'ESTOQUE_BAIXAS', [oldHeaders, oldRow]);
  env.EstoqueBaixasRepository.getOrCreateSheet(SID);
  const dump = env.__dumpSheet(SID, 'ESTOQUE_BAIXAS');
  assert.equal(dump[0].length, H.length);
  assert.deepEqual([...dump[0].slice(8)], ['CRIADO_EM', 'REVERTIDO_EM']);
  // dados antigos preservados
  assert.equal(dump[1][0], 'BX-1');
  // coluna nova preenchida com '' (célula fora da linha antiga)
  assert.equal(dump[1][8], '');
});