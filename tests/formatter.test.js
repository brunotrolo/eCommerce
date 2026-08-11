/**
 * formatter.test.js — parsing/formação de datas pt-BR (regressão R1 da
 * auditoria da baixa FIFO: `new Date("dd/MM/yyyy")` no V8 troca dia/mês).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadServices } = require('./helpers/load-services');

const env = loadServices();
const F = env.FormatterService;

test('parseDateTime lê "31/12/2025 10:30:00" como dia=31, mês=12 (não 12/31)', () => {
  const d = F.parseDateTime('31/12/2025 10:30:00');
  assert.equal(d.getFullYear(), 2025);
  assert.equal(d.getMonth(), 11); // dezembro
  assert.equal(d.getDate(), 31);
  assert.equal(d.getHours(), 10);
  assert.equal(d.getMinutes(), 30);
});

test('parseDateTime "12/01/2026" mantém dia=12 e mês=01 (trap do V8: vira 01/12)', () => {
  const d = F.parseDateTime('12/01/2026 08:15:00');
  assert.equal(d.getDate(), 12);
  assert.equal(d.getMonth(), 0); // janeiro
});

test('parseDate rejeita data inválida "31/02/2026" (31/02 não existe) -> null', () => {
  assert.equal(F.parseDate('31/02/2026'), null);
});

test('parseDate "29/02/2024" (bissexto) é válido', () => {
  const d = F.parseDate('29/02/2024');
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 29);
});

test('parseDateTime sem hora cai para data pura (comportamento real da casa)', () => {
  const d = F.parseDateTime('05/07/2026');
  assert.equal(d.getDate(), 5);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getHours(), 0);
});

test('parseDateTime rejeita hora inválida "31/12/2025 25:00:00" -> null', () => {
  assert.equal(F.parseDateTime('31/12/2025 25:00:00'), null);
});

test('formatCurrency pt-BR: 1234.5 -> "R$ 1.234,50"', () => {
  assert.equal(F.formatCurrency(1234.5), 'R$ 1.234,50');
});

test('formatCurrency com symbol:false não prefixa R$', () => {
  assert.equal(F.formatCurrency(9.9, { symbol: false }), '9,90');
});

test('formatDate de Date real (roundtrip dd/MM/yyyy)', () => {
  const d = F.parseDate('15/03/2026');
  assert.equal(F.formatDate(d), '15/03/2026');
});

test('parseNumber trata vírgula decimal como separador BR', () => {
  assert.equal(F.parseNumber('1.234,56'), 1234.56);
});

test('parseCurrency "R$ 1.234,50" -> 1234.5', () => {
  assert.equal(F.parseCurrency('R$ 1.234,50'), 1234.5);
});

test('formatCNPJ/CPF/CEP aplicam máscara só com dígitos exatos', () => {
  assert.equal(F.formatCNPJ('12345678000195'), '12.345.678/0001-95');
  assert.equal(F.formatCPF('12345678901'), '123.456.789-01');
  assert.equal(F.formatCEP('01310100'), '01310-100');
  assert.equal(F.formatCPF('123'), '123'); // incompleto: devolve como está
});