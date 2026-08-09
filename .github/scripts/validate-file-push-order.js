#!/usr/bin/env node
// Valida que .clasp.json → filePushOrder cobre exatamente os arquivos reais
// de src/**/*.js — nem faltando (quebra silenciosa por ordem alfabética do
// GAS), nem sobrando (arquivo deletado mas ainda listado, o que faz
// `clasp push` falhar). Ver specs/ARQUITETURA.md §1.
'use strict';
const fs = require('fs');
const path = require('path');

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full.split(path.sep).join('/'));
    }
  }
  return out;
}

const claspConfig = JSON.parse(fs.readFileSync('.clasp.json', 'utf8'));
const order = new Set(claspConfig.filePushOrder || []);
const actual = new Set(listJsFiles('src'));

const missingFromOrder = [...actual].filter((f) => !order.has(f)).sort();
const missingOnDisk = [...order].filter((f) => !actual.has(f)).sort();

if (missingFromOrder.length === 0 && missingOnDisk.length === 0) {
  console.log(`OK: filePushOrder cobre exatamente os ${actual.size} arquivos .js de src/.`);
  process.exit(0);
}

if (missingFromOrder.length > 0) {
  console.error('Arquivos em src/**/*.js que NÃO estão em .clasp.json → filePushOrder:');
  missingFromOrder.forEach((f) => console.error('  - ' + f));
  console.error('Insira cada um após suas dependências (ver specs/ARQUITETURA.md §1).');
}
if (missingOnDisk.length > 0) {
  console.error('Arquivos listados em filePushOrder que NÃO existem mais em src/:');
  missingOnDisk.forEach((f) => console.error('  - ' + f));
  console.error('Remova-os de .clasp.json → filePushOrder.');
}
process.exit(1);
