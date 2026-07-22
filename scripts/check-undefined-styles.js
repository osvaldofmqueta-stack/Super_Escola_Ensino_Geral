#!/usr/bin/env node
/**
 * Verifica se existem chaves de estilo (style={styles.x} ou contentContainerStyle={styles.x})
 * usadas no JSX mas nunca definidas em nenhum StyleSheet.create() do mesmo ficheiro.
 *
 * Este bug causa texto vertical (uma letra por linha) no React Native Web: a View
 * cai no flexDirection default 'column' quando styles.x é undefined.
 *
 * Diferente de um scanner genérico "varName.key", este script só analisa o
 * CONTEÚDO dos atributos style={...} / contentContainerStyle={...}, evitando
 * falsos positivos quando o mesmo nome de variável (ex: `s`) é reutilizado
 * para outra coisa (Set, objecto de dados, etc.) noutro escopo do ficheiro.
 *
 * Uso: node scripts/check-undefined-styles.js
 * Sai com código 1 se encontrar problemas.
 */
const fs = require('fs');
const path = require('path');

const ROOTS = ['app', 'components'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripStringsAndComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    if (c === '`') {
      out += ' '; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += ' '; i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; out += ' '; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += ' '; i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}

function findStyleSheetBlocks(clean) {
  const blocks = {};
  const re = /([A-Za-z_$][\w$]*)\s*=\s*StyleSheet\.create\(\{/g;
  let m;
  while ((m = re.exec(clean))) {
    const varName = m[1];
    const braceStart = clean.indexOf('{', m.index + m[0].length - 1);
    let depth = 1; let idx = braceStart + 1;
    while (idx < clean.length && depth > 0) {
      if (clean[idx] === '{') depth++;
      else if (clean[idx] === '}') depth--;
      idx++;
    }
    const blockBody = clean.slice(braceStart + 1, idx - 1);
    const keyRe = /(?:^|[,{\n])\s*([A-Za-z_$][\w$]*)\s*:/g;
    let km;
    if (!blocks[varName]) blocks[varName] = new Set();
    while ((km = keyRe.exec(blockBody))) {
      blocks[varName].add(km[1]);
    }
  }
  return blocks;
}

function findObjectAssignMerges(clean) {
  const merges = [];
  // cobre Object.assign(styles, patch) e Object.assign((styles as any), patch)
  const re = /Object\.assign\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?:as\s+any\s*)?\)?\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let m;
  while ((m = re.exec(clean))) merges.push([m[1], m[2]]);
  return merges;
}

function extractBalanced(clean, openIdx) {
  // openIdx points at the '{' right after style= / contentContainerStyle=
  let depth = 1; let idx = openIdx + 1;
  while (idx < clean.length && depth > 0) {
    if (clean[idx] === '{') depth++;
    else if (clean[idx] === '}') depth--;
    idx++;
  }
  return clean.slice(openIdx + 1, idx - 1);
}

function findStyleAttrUsages(clean) {
  const usages = [];
  const attrRe = /\b(?:style|contentContainerStyle)\s*=\s*\{/g;
  let m;
  while ((m = attrRe.exec(clean))) {
    const openIdx = m.index + m[0].length - 1;
    const body = extractBalanced(clean, openIdx);
    const refRe = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g;
    let rm;
    while ((rm = refRe.exec(body))) {
      usages.push([rm[1], rm[2]]);
    }
  }
  return usages;
}

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const clean = stripStringsAndComments(src);
  const blocks = findStyleSheetBlocks(clean);
  const merges = findObjectAssignMerges(clean);
  for (const [target, source] of merges) {
    if (blocks[source]) {
      if (!blocks[target]) blocks[target] = new Set();
      for (const k of blocks[source]) blocks[target].add(k);
    }
  }

  if (Object.keys(blocks).length === 0) return [];

  const usages = findStyleAttrUsages(clean);
  const problems = [];
  for (const [varName, key] of usages) {
    if (!blocks[varName]) continue; // varName não é um StyleSheet conhecido neste ficheiro
    if (!blocks[varName].has(key)) {
      problems.push(`${varName}.${key}`);
    }
  }
  return [...new Set(problems)];
}

let totalProblems = 0;
const report = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const problems = checkFile(file);
    if (problems.length > 0) {
      totalProblems += problems.length;
      report.push({ file, problems });
    }
  }
}

if (report.length === 0) {
  console.log('✅ Nenhuma chave de estilo em falta encontrada.');
  process.exit(0);
} else {
  console.log('❌ Chaves de estilo usadas em style={} / contentContainerStyle={} mas nunca definidas no StyleSheet:\n');
  for (const { file, problems } of report) {
    console.log(`  ${file}`);
    for (const p of problems) console.log(`    - ${p}`);
  }
  console.log(`\nTotal: ${totalProblems} chave(s) em falta em ${report.length} ficheiro(s).`);
  process.exit(1);
}
