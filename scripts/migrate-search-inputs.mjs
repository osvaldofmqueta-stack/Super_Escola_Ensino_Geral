#!/usr/bin/env node
// One-shot migration script: replaces inline search-bar TextInputs with the
// shared <StableSearchInput /> component (declared at module scope so React
// preserves focus across re-renders).
//
// Usage:  node scripts/migrate-search-inputs.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const FILES = [
  'app/(main)/acompanhamento-pautas.tsx',
  'app/(main)/admin.tsx',
  'app/(main)/admissao.tsx',
  'app/(main)/arquivo-documentos.tsx',
  'app/(main)/auditoria.tsx',
  'app/(main)/biblioteca.tsx',
  'app/(main)/boletim-matricula.tsx',
  'app/(main)/boletim-propina.tsx',
  'app/(main)/boletins-secretaria.tsx',
  'app/(main)/bolsas.tsx',
  'app/(main)/centro-emissao.tsx',
  'app/(main)/chat-interno.tsx',
  'app/(main)/desempenho.tsx',
  'app/(main)/disciplinas.tsx',
  'app/(main)/estudio-emissao.tsx',
  'app/(main)/finalistas.tsx',
  'app/(main)/financeiro.tsx',
  'app/(main)/gestao-acessos.tsx',
  'app/(main)/notas.tsx',
  'app/(main)/pedagogico.tsx',
  'app/(main)/professor-mensagens.tsx',
  'app/(main)/professor-turmas.tsx',
  'app/(main)/rh-controle.tsx',
  'app/(main)/rh-faltas-tempos.tsx',
  'app/(main)/rh-hub.tsx',
  'app/(main)/rh-payroll.tsx',
  'app/(main)/rupes-historico.tsx',
  'app/(main)/salas.tsx',
  'app/(main)/secretaria-hub.tsx',
  'app/(main)/solicitacoes-secretaria.tsx',
  'app/(main)/trabalhos-finais.tsx',
  'app/(main)/transferencias.tsx',
  'app/(main)/avaliacao-professores.tsx',
  'app/(main)/editor-documentos.tsx',
  'app/boletim-inscricao.tsx',
  'app/boletim-matricula.tsx',
  'components/EmissaoRapidaModal.tsx',
  'components/FloatingChatButton.tsx',
  'components/GestaoAcessosPanel.tsx',
  'components/ProvinciaMunicipioSelector.tsx',
];

// Compute a relative import specifier from a file to '@/components/StableSearchInput'.
// All listed files live under app/ or components/, both have @/ mapped to repo root.
const STABLE_IMPORT = "import { StableSearchInput } from '@/components/StableSearchInput';";

function ensureImport(src) {
  if (src.includes("from '@/components/StableSearchInput'")) return src;
  // Insert after the last existing import line.
  const lines = src.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s.+from\s+['"]/.test(lines[i])) lastImportIdx = i;
    else if (lastImportIdx >= 0 && lines[i].trim() === '') break;
  }
  if (lastImportIdx === -1) {
    return STABLE_IMPORT + '\n' + src;
  }
  lines.splice(lastImportIdx + 1, 0, STABLE_IMPORT);
  return lines.join('\n');
}

// Match a TextInput JSX element from `<TextInput` through the matching `/>`.
// We bound the regex to avoid eating across multiple elements.
const TEXTINPUT_RE = /<TextInput\b([\s\S]*?)\/>/g;

function parseAttrs(rawAttrs) {
  // Naive extractor: find name=… pairs where … is "...", '...', {...} or {{...}}.
  // Returns { name: rawValue } where rawValue is the original literal (with quotes/braces).
  const out = {};
  // We walk char-by-char to handle nested braces.
  let i = 0;
  const s = rawAttrs;
  while (i < s.length) {
    // Skip whitespace
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    // Read name
    const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(s.slice(i));
    if (!nameMatch) { i++; continue; }
    const name = nameMatch[1];
    i += name.length;
    // Skip whitespace
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '=') {
      // Boolean prop (no value); e.g., multiline
      out[name] = 'true';
      continue;
    }
    i++; // consume '='
    while (i < s.length && /\s/.test(s[i])) i++;
    // Read value: "..", '..', {..}, or {{..}}
    if (s[i] === '"' || s[i] === "'") {
      const quote = s[i];
      let j = i + 1;
      while (j < s.length && s[j] !== quote) j++;
      out[name] = s.slice(i, j + 1);
      i = j + 1;
    } else if (s[i] === '{') {
      let depth = 0;
      let j = i;
      while (j < s.length) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') {
          depth--;
          if (depth === 0) { j++; break; }
        }
        j++;
      }
      out[name] = s.slice(i, j);
      i = j;
    } else {
      // Unquoted value (rare); read until whitespace.
      let j = i;
      while (j < s.length && !/\s/.test(s[j])) j++;
      out[name] = s.slice(i, j);
      i = j;
    }
  }
  return out;
}

const SEARCH_PLACEHOLDER_RE = /(?:[Pp]esquis|[Bb]usca|[Ss]earch)/;

function isSearchInput(attrs) {
  const ph = attrs.placeholder;
  if (!ph) return false;
  return SEARCH_PLACEHOLDER_RE.test(ph);
}

function buildStableInputJsx(attrs, indent) {
  const out = [`<StableSearchInput`];
  const pushAttr = (k, v) => out.push(`${indent}  ${k}=${v}`);
  if (attrs.value) pushAttr('value', attrs.value);
  if (attrs.onChangeText) pushAttr('onChangeText', attrs.onChangeText);
  if (attrs.style) pushAttr('inputStyle', attrs.style);
  if (attrs.placeholder) pushAttr('placeholder', attrs.placeholder);
  if (attrs.placeholderTextColor) {
    // Pass placeholderTextColor through iconColor so icon and placeholder match.
    // (StableSearchInput uses iconColor for both).
    pushAttr('iconColor', attrs.placeholderTextColor);
  }
  if (attrs.autoCapitalize) pushAttr('autoCapitalize', attrs.autoCapitalize);
  if (attrs.returnKeyType) pushAttr('returnKeyType', attrs.returnKeyType);
  out.push(`${indent}/>`);
  return out.join('\n');
}

function indentOf(line) {
  const m = /^(\s*)/.exec(line);
  return m ? m[1] : '';
}

// Find, for a given TextInput match position, whether the IMMEDIATELY surrounding
// JSX is the standard search-bar idiom:
//   <Ionicons name="search…" size=… color=… />
//   <TextInput …/>
//   { value.length > 0 && (<TouchableOpacity onPress={…}><Ionicons name="close-circle" …/></TouchableOpacity>) }
//
// Returns { newJsx, replaceFrom, replaceTo } describing the replacement range
// or { newJsx, replaceFrom, replaceTo } where only the TextInput is replaced.
function expandReplacementRange(src, matchStart, matchEnd, attrs) {
  const valueExpr = (attrs.value || '').replace(/^\{|\}$/g, '').trim();

  // Attempt to extend BACKWARDS to swallow a leading <Ionicons name="search…" .../>
  // only if the icon sits on its own and its only content before the TextInput is whitespace.
  const before = src.slice(Math.max(0, matchStart - 400), matchStart);
  const iconRe = /<Ionicons\s+name="(search[^"]*)"[^/]*\/>\s*$/;
  const iconMatch = before.match(iconRe);
  let newStart = matchStart;
  if (iconMatch) {
    newStart = matchStart - (iconMatch[0].length);
  }

  // Attempt to extend FORWARDS to swallow a clear-button block.
  const after = src.slice(matchEnd, matchEnd + 600);
  // Pattern A: {value.length > 0 && (<TouchableOpacity onPress={() => setter('')}><Ionicons name="close-circle" …/></TouchableOpacity>)}
  // We don't try to match `setter` precisely; we trust the value var.
  let newEnd = matchEnd;
  const clearRe = new RegExp(
    '^\\s*\\{\\s*' +
      // value reference (escaped)
      escapeRegex(valueExpr) +
      '\\s*(?:\\.length\\s*>\\s*0|\\?|&&)' +
      // up to the closing `}` of the JSX expression — non-greedy
      '[\\s\\S]*?</TouchableOpacity>\\s*\\)?\\s*\\}',
  );
  const clearMatch = after.match(clearRe);
  if (clearMatch) {
    newEnd = matchEnd + clearMatch[0].length;
  } else {
    // Pattern B: {value ? (<TouchableOpacity …>…</TouchableOpacity>) : null}
    const clearReB = new RegExp(
      '^\\s*\\{\\s*' +
        escapeRegex(valueExpr) +
        '\\s*\\?[\\s\\S]*?</TouchableOpacity>\\s*\\)\\s*:\\s*null\\s*\\}',
    );
    const m2 = after.match(clearReB);
    if (m2) newEnd = matchEnd + m2[0].length;
    else {
      // Pattern C: {!!value && (...)} or {value && (...)}
      const clearReC = new RegExp(
        '^\\s*\\{\\s*!?!?' +
          escapeRegex(valueExpr) +
          '\\s*&&[\\s\\S]*?</TouchableOpacity>\\s*\\)?\\s*\\}',
      );
      const m3 = after.match(clearReC);
      if (m3) newEnd = matchEnd + m3[0].length;
    }
  }

  return { newStart, newEnd, hadIcon: !!iconMatch };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processFile(relPath) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`SKIP (missing): ${relPath}`);
    return { changed: 0, skipped: 0, file: relPath };
  }
  const original = fs.readFileSync(absPath, 'utf8');
  let src = original;

  const matches = [];
  let m;
  TEXTINPUT_RE.lastIndex = 0;
  while ((m = TEXTINPUT_RE.exec(src))) {
    const attrs = parseAttrs(m[1]);
    if (!isSearchInput(attrs)) continue;
    matches.push({ start: m.index, end: m.index + m[0].length, raw: m[0], attrs });
  }

  if (matches.length === 0) {
    return { changed: 0, skipped: 0, file: relPath };
  }

  // Process in REVERSE order so earlier indices remain valid.
  matches.reverse();
  let changed = 0;
  let skipped = 0;
  for (const it of matches) {
    const range = expandReplacementRange(src, it.start, it.end, it.attrs);
    const lineStart = src.lastIndexOf('\n', range.newStart) + 1;
    const indent = src.slice(lineStart, range.newStart).match(/^\s*/)[0];
    // Avoid double-indenting: indent for child attr lines == indent + 2 spaces, handled by builder.
    const newJsx = buildStableInputJsx(it.attrs, indent);
    src = src.slice(0, range.newStart) + newJsx + src.slice(range.newEnd);
    changed++;
  }

  if (src !== original) {
    src = ensureImport(src);
    fs.writeFileSync(absPath, src);
  }
  return { changed, skipped, file: relPath };
}

const results = [];
for (const f of FILES) {
  results.push(processFile(f));
}

console.log('=== Summary ===');
let total = 0;
for (const r of results) {
  if (r.changed) {
    console.log(`  ${r.file}: ${r.changed} replaced`);
    total += r.changed;
  }
}
console.log(`Total replacements: ${total}`);
