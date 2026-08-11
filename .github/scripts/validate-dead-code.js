// validate-dead-code.js — auditoria de "código morto" ALIAS-AWARE.
// Pegou a classe de regressão de 10-11/08/2026 (uso de API removida via
// alias `dc = window.__DataClient; dc.has(...)` que auditoria ingênua não
// via). Roda local: `node .github/scripts/validate-dead-code.js` (raiz do
// repo). Exit 1 = achados. NÃO faz parte do CI por ora (workflow não alterado
// sem decisão explícita) — pode ser adicionado em ci.yml/deploy.yml.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const uiDir = path.join(ROOT, 'ui');
const srcDir = path.join(ROOT, 'src');

const GAS_BUILTINS = new Set(['CacheService','PropertiesService','LockService','XmlService','ContentService','HtmlService','UrlFetchApp','SpreadsheetApp','DriveApp','Utilities','Session','Logger','console','MailApp','DocumentApp','SlidesApp','ScriptApp','GmailApp','ContactsApp','CalendarApp','Base','BigQuery','Charts','DataStudioApp','Jdbc','LanguageApp','Maps','OptimizationService','People','PicturesService','SitesApp','UrlShortener','CardService','Forms','Sheets','Tasks','GroupsApp']);

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}
function extractJs(html) {
  const out = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join('\n');
}
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

const findings = [];
function add(msg) { findings.push(msg); }

// ─── mapa GLOBAL de ids e declarations CSS ──────────────────────────────
const allUi = walk(uiDir, '.html');
const globalIds = new Set();
for (const f of allUi) {
  const html = fs.readFileSync(f, 'utf8');
  let m;
  const idRe = /\bid="([^"]+)"/g;
  while ((m = idRe.exec(html))) globalIds.add(m[1]);
}
// classes cobertas por declaração CSS em qualquer arquivo (ou token de componente)
// parsing por RULE: pega o grupo de seletores antes de cada '{', quebra por
// vírgula (seletores agrupados) e extrai todos os nomes de classe de cada um
// (lida com composto `.alert.alert-error` e pseudo `.sort-asc::after`).
const cssCovered = new Set();
const ruleRe = /([^{}]+)\{/g;
for (const f of allUi) {
  const html = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = ruleRe.exec(html))) {
    m[1].split(',').forEach(sel => {
      let sm;
      const clsRe = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
      while ((sm = clsRe.exec(sel))) cssCovered.add(sm[1]);
    });
  }
}

// ─── 1. DataClient (alias-aware) ────────────────────────────────────────
const dcExports = new Set(['fetchData','mutateData','snapshot','preFetch','invalidate','invalidateByPrefix','unwrap','run','get','has','set']);
for (const f of allUi) {
  if (f.endsWith('DataClient.html')) continue;
  const js = extractJs(fs.readFileSync(f, 'utf8'));
  const aliases = new Set();
  let am;
  const aliasRe = /var\s+(\w+)\s*=\s*(?:window\.)?__DataClient\s*;/g;
  while ((am = aliasRe.exec(js))) aliases.add(am[1]);
  const callRe = /(?:__DataClient|([a-zA-Z_$][\w$]*))\.(fetchData|mutateData|snapshot|preFetch|invalidateByPrefix|invalidate|unwrap|run|get|has|set|subscribe|getOrFetch|getTimestamp)\(/g;
  let cm;
  while ((cm = callRe.exec(js))) {
    const alias = cm[1], method = cm[2];
    if (alias && !aliases.has(alias)) continue;
    if (!dcExports.has(method)) add(`${rel(f)}: ${alias ? 'dc' : '__DataClient'}.${method}() nao existe no DataClient`);
  }
}

// ─── 2. FormatterService (client) ──────────────────────────────────────
for (const f of allUi) {
  if (/Formatter\.html$|Styles\.html$|UiHelpers\.html$|DataClient\.html$/.test(f)) continue;
  const js = extractJs(fs.readFileSync(f, 'utf8'));
  const fmRe = /FormatterService\.([a-zA-Z_$][\w$]*)\s*\(/g;
  let fm;
  while ((fm = fmRe.exec(js))) {
    const mname = fm[1];
    if (!/^format(Currency|Date|Time|DateTime|Percent)$/.test(mname) && !/^parse(Date|Time|DateTime)$/.test(mname)) {
      add(`${rel(f)}: FormatterService.${mname}() nao e metodos publico do Formatter.html`);
    }
  }
}

// ─── 3. DOM ids (mapa global entre arquivos) ───────────────────────────
for (const f of allUi) {
  const js = extractJs(fs.readFileSync(f, 'utf8'));
  const useRe = /(?:getElementById\('([^']+)'\)|querySelector(?:All)?\(\s*'#([a-zA-Z0-9_-]+)'\))/g;
  let um;
  while ((um = useRe.exec(js))) {
    const id = um[1] || um[2];
    if (id && !globalIds.has(id)) {
      add(`${rel(f)}: usa #${id} sem id= correspondente em nenhum template ui/`);
    }
  }
}

// ─── 4. Classes CSS usadas sem declaração ──────────────────────────────
const GENERIC = new Set(['btn','button','card','row','col','container','table','thead','tbody','tr','th','td','input','select','label','span','div','h1','h2','h3','p','i','strong','small','header','footer','form','section','main','nav','ul','li','a','img','textarea','option','primary','secondary','danger','success','warning','hidden','active','disabled','loading','loading-state','empty','error','info','modal','overlay','badge','chip','flex','grid','center','left','right','wrap','nowrap','inline','block','pointer','relative','absolute','sticky','fixed','positive','negative','critical','title','subtitle','body','head','foot','value','text','number','currency','percent','overlay','status','row-open','row-edited']);
for (const f of allUi) {
  if (f.endsWith('Styles.html')) continue;
  const html = fs.readFileSync(f, 'utf8');
  const used = new Set();
  let cm2;
  const classInTmpl = /class="([^"]+)"/g;
  while ((cm2 = classInTmpl.exec(html))) {
    if (cm2[1].includes("'") || cm2[1].includes('"') || cm2[1].includes('+')) continue; // concatenação JS
    cm2[1].split(/\s+/).forEach(c => c && used.add(c));
  }
  const clsAdd = /classList\.(?:add|remove|toggle)\(['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]\)/g;
  while ((cm2 = clsAdd.exec(extractJs(html)))) used.add(cm2[1]);
  for (const c of used) {
    if (!cssCovered.has(c) && !GENERIC.has(c)) {
      add(`${rel(f)}: classe '.${c}' usada sem declaracao CSS em Styles.html/nenhum <style>`);
    }
  }
}

// ─── 5. SERVER: refs cruzadas a identificador inexistente ──────────────
function existsIn(src, name) {
  return new RegExp('function\\s+' + name + '\\b').test(src)
    || new RegExp('(^|[^\\w$])' + name + '\\s*:\\s*function\\b').test(src)
    || new RegExp('(^|[^\\w$])' + name + '\\s*:\\s*[a-zA-Z_$]\\w*\\s*[,}]').test(src)
    || new RegExp('(^|[^\\w$])' + name + '\\s*=\\s*function\\b').test(src)
    || new RegExp('(^|[^\\w$])' + name + '\\s*=').test(src);
}
for (const f of walk(srcDir, '.js')) {
  const js = fs.readFileSync(f, 'utf8');
  const refRe = /\b([A-Z][a-zA-Z0-9]+(?:Repository|Service|Client|Adapter))\s*\.\s*([a-zA-Z_$][\w$]*)\s*\(/g;
  let rm;
  while ((rm = refRe.exec(js))) {
    const ns = rm[1], ident = rm[2];
    if (GAS_BUILTINS.has(ns) || GAS_BUILTINS.has(ident)) continue;
    const defFiles = walk(srcDir, '.js').filter(p => {
      const s = fs.readFileSync(p, 'utf8');
      return new RegExp('var\\s+' + ns + '\\s*=').test(s) || new RegExp('function\\s+' + ns + '\\b').test(s);
    });
    if (defFiles.length === 0) {
      add(`${rel(f)}: referencia ${ns} (nada define esse namespace)`);
      continue;
    }
    if (!existsIn(fs.readFileSync(defFiles[0], 'utf8'), ident)) {
      add(`${rel(f)}: ${ns}.${ident}() nao definido em ${rel(defFiles[0])}`);
    }
  }
}

// ─── 6. describe() de cada serviço: ações sem implementação ────────────
const SCHEMA_KEYS = new Set(['description','params','returns','type','required','default','properties','items','title']);
for (const f of walk(srcDir, '.js').filter(p => /Service\.js$/.test(p))) {
  const src = fs.readFileSync(f, 'utf8');
  const dm = src.match(/describe\s*[:=]\s*(?:function\s*\([^)]*\)\s*\{|[\w$]*\s*\([^)]*\)\s*\{)/);
  if (!dm) continue;
  const start = dm.index + dm[0].length;
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth <= 0) { end = i; break; } }
  }
  if (end === -1) continue;
  const block = src.slice(start, end);
  const actionRe = /^\s{4}(\w+):\s*\{/gm;
  let m, missing = [];
  while ((m = actionRe.exec(block))) {
    const a = m[1];
    if (SCHEMA_KEYS.has(a)) continue;
    const hasFn = new RegExp('function\\s+' + a + '\\b').test(src)
      || new RegExp('(^|[^\\w$])' + a + '\\s*:\\s*function').test(src)
      || new RegExp('(^|[^\\w$])' + a + '\\s*:\\s*[a-zA-Z_$][\\w$]*\\s*[,}]').test(src);
    if (!hasFn) missing.push(a);
  }
  missing.forEach(a => add(`${rel(f)}: acao describe '${a}' sem implementacao`));
}

if (findings.length) {
  console.log('AUDITORIA: ' + findings.length + ' achado(s):');
  findings.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('AUDITORIA OK: nenhum uso de API removida, id inexistente, classe orfa, ref quebrada ou acao describe sem implementacao.');