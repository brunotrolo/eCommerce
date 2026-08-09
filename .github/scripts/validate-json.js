#!/usr/bin/env node
// Valida sintaxe JSON de .clasp.json e appsscript.json — um JSON quebrado
// nesses dois arquivos derruba `clasp push` sem aviso claro.
'use strict';
const fs = require('fs');

const files = ['.clasp.json', 'appsscript.json'];
let failed = false;

for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`OK: ${file}`);
  } catch (err) {
    console.error(`Erro de JSON em ${file}: ${err.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
