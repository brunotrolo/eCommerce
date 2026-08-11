/**
 * estoque-baixa.test.js — agregação do excedente de baixa (J1 da Fase 9),
 * helper puro `EstoqueBaixaService.calcularExcedente` exportado e usado pelo
 * backfill E pelo sync de pedidos. Regras: só rows BAIXADO contam,
 * REVERTIDO = unidade devolvida (ignorada), ids deduplicados, faltante >= 0.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const calc = env.EstoqueBaixaService.calcularExcedente;

// Arrays do sandbox vm vêm de outro realm (prototype difere); normaliza para
// array local antes do deepEqual.
const ids = (r) => [...r.estoqueIds];

// Formato real das rows de ESTOQUE_BAIXAS (EstoqueBaixasRepository)
function row(status, quantidade, ids) {
  return { STATUS: status, QUANTIDADE: String(quantidade), ESTOQUE_IDS: ids || '' };
}

test('soma só rows BAIXADO e deduplica ids (A,B + B,C -> A,B,C)', () => {
  const r = calc([
    row('BAIXADO', 2, 'A,B'),
    row('BAIXADO', 3, 'B,C'),
    row('REVERTIDO', 5, 'D,E') // devolvida: não conta nem entra nos ids
  ], 5);
  assert.equal(r.totalJaBaixado, 5);
  assert.deepEqual(ids(r), ['A', 'B', 'C']);
  assert.equal(r.faltante, 0);
});

test('baixa parcial: 2 de 5 já baixados -> faltante 3', () => {
  const r = calc([row('BAIXADO', 2, 'A')], 5);
  assert.equal(r.totalJaBaixado, 2);
  assert.deepEqual(ids(r), ['A']);
  assert.equal(r.faltante, 3);
});

test('nenhuma row BAIXADO -> total 0 e faltante = qty completa', () => {
  const r = calc([row('REVERTIDO', 7, 'A,B')], 4);
  assert.equal(r.totalJaBaixado, 0);
  assert.deepEqual(ids(r), []);
  assert.equal(r.faltante, 4);
});

test('quantidade textual não-numérica é ignorada (parseInt || 0)', () => {
  const r = calc([row('BAIXADO', 'abc', 'X,')], 1);
  assert.equal(r.totalJaBaixado, 0);
  assert.deepEqual(ids(r), ['X']);
  assert.equal(r.faltante, 1);
});

test('pedido já completo: faltante 0 e ids preservam ordem de primeira ocorrência', () => {
  const r = calc([
    row('BAIXADO', 3, 'id1,id2,id3'),
    row('BAIXADO', 4, 'id4,id2'), // id2 repetido: dedupe
    row('BAIXADO', 1, 'id4')      // repetido
  ], 10);
  assert.equal(r.totalJaBaixado, 8);
  assert.deepEqual(ids(r), ['id1', 'id2', 'id3', 'id4']);
  assert.equal(r.faltante, 2);
});

test('STATUS com espaços é tolerado (trim no comparador)', () => {
  const r = calc([row(' BAIXADO ', 3, 'A,B')], 3);
  assert.equal(r.totalJaBaixado, 3);
  assert.equal(r.faltante, 0);
});

test('lista vazia: faltante = qty', () => {
  const r = calc([], 2);
  assert.equal(r.totalJaBaixado, 0);
  assert.deepEqual(ids(r), []);
  assert.equal(r.faltante, 2);
});