#!/usr/bin/env node
// Checagem rápida de sintaxe (node --check) em todo src/**/*.js — GAS não
// tem build step, então um erro de sintaxe só aparece em runtime dentro do
// editor do Apps Script. Isto só valida sintaxe, não referências a globais
// do GAS (SpreadsheetApp etc.), que naturalmente não existem no Node.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = listJsFiles('src');
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures.push({ file, stderr: err.stderr ? err.stderr.toString() : String(err) });
  }
}

if (failures.length === 0) {
  console.log(`OK: sintaxe válida em ${files.length} arquivos .js.`);
  process.exit(0);
}

console.error(`Erro de sintaxe em ${failures.length} arquivo(s):`);
failures.forEach(({ file, stderr }) => {
  console.error(`\n--- ${file} ---`);
  console.error(stderr.trim());
});
process.exit(1);
