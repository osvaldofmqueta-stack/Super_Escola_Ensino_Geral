#!/usr/bin/env node
/**
 * SIGA — Reparação de Importação (campos JSONB + ordem FK)
 * ─────────────────────────────────────────────────────────
 * Lê o backup SQL, corrige valores JSONB e importa as tabelas
 * na ordem correcta (respeitando dependências FK).
 *
 * USO:
 *   node scripts/repair-jsonb-import.js backups/siga_backup_XXX.sql
 */

const { Pool } = require("pg");
const fs = require("fs");

const C = {
  reset:"\x1b[0m", bold:"\x1b[1m",
  red:"\x1b[31m", green:"\x1b[32m", yellow:"\x1b[33m",
  blue:"\x1b[34m", cyan:"\x1b[36m",
};
const log   = (m) => console.log(`${C.green}[✔]${C.reset} ${m}`);
const warn  = (m) => console.log(`${C.yellow}[⚠]${C.reset} ${m}`);
const error = (m) => console.error(`${C.red}[✘]${C.reset} ${m}`);
const info  = (m) => console.log(`${C.blue}[ℹ]${C.reset} ${m}`);

// ── Defaults JSONB por nome de coluna ────────────────────────────────────────
const JSONB_DEFAULTS = {
  trimestres:"[]", epocasExame:"{}", disciplinas:"[]", turmasIds:"[]",
  professoresIds:"[]", camposAbertos:"[]", pedidosReabertura:"[]",
  lidaPor:"[]", irtTabela:"[]", fases:"[]", documentosRecebidos:"[]",
  notasDisciplinas:"[]", documentos:"[]", mensagens:"[]", presencaIds:"[]",
  subsidios:"[]", permissoes:"{}", flashScreen:"{}", multaConfig:"{}",
  mesesAnoAcademico:"[9,10,11,12,1,2,3,4,5,6,7]",
  papClasses:'["13ª Classe"]', papDisciplinasContribuintes:"[]",
  // nullable por natureza
  lancamentos:null, dados:null,
  // not-null com default vazio
  disponibilidade:"{}", seccao:'""',
};

function fixJsonbValue(col, rawStr) {
  if (rawStr === null) return null;
  const def = col in JSONB_DEFAULTS ? JSONB_DEFAULTS[col] : "[]";

  // Já é JSON válido?
  try { JSON.parse(rawStr); return rawStr; } catch {}

  // String vazia → default
  if (rawStr.trim() === "") return def;

  // Corrompido com [object Object]
  if (rawStr.includes("[object Object]")) return def;

  // Comma-separated sem colchetes/chavetas → JSON array (ex: professoresIds)
  if (!rawStr.startsWith("[") && !rawStr.startsWith("{") && rawStr.includes(",")) {
    return JSON.stringify(rawStr.split(",").map(s => s.trim()).filter(Boolean));
  }

  // Valor único sem colchetes → array de um elemento
  if (!rawStr.startsWith("[") && !rawStr.startsWith("{")) {
    return JSON.stringify([rawStr]);
  }

  return def;
}

// ── Parser de tokens SQL ──────────────────────────────────────────────────────
function parseToken(s, pos) {
  while (pos < s.length && " \n\r\t".includes(s[pos])) pos++;
  if (pos >= s.length || s[pos] === ")") return null;
  if (s[pos] === ",") return { raw: undefined, end: pos + 1, skip: true };

  if (s.startsWith("NULL", pos))  return { raw: null,   end: pos + 4 };
  if (s.startsWith("TRUE", pos))  return { raw: "TRUE", end: pos + 4 };
  if (s.startsWith("FALSE", pos)) return { raw: "FALSE",end: pos + 5 };

  let isE = false;
  if (s[pos] === "E" && s[pos+1] === "'") { isE = true; pos += 2; }
  else if (s[pos] === "'") { pos++; }
  else {
    let end = pos;
    while (end < s.length && !",)\n".includes(s[end])) end++;
    return { raw: s.slice(pos, end).trim(), end };
  }

  let val = "";
  while (pos < s.length) {
    if (s[pos] === "'" && s[pos+1] === "'")                      { val += "'"; pos += 2; }
    else if (s[pos] === "'")                                      { pos++; break; }
    else if (isE && s[pos] === "\\" && s[pos+1] === "'")         { val += "'"; pos += 2; }
    else if (isE && s[pos] === "\\" && s[pos+1] === "\\")        { val += "\\"; pos += 2; }
    else                                                          { val += s[pos++]; }
  }
  return { raw: val, end: pos };
}

function parseRowValues(rowSql) {
  const values = [];
  let pos = 0;
  while (pos < rowSql.length && rowSql[pos] !== "(") pos++;
  pos++; // skip '('
  while (pos < rowSql.length) {
    while (pos < rowSql.length && " \n\r\t".includes(rowSql[pos])) pos++;
    if (rowSql[pos] === ")") break;
    if (rowSql[pos] === ",") { pos++; continue; }
    const tok = parseToken(rowSql, pos);
    if (!tok) break;
    if (!tok.skip) values.push(tok.raw);
    pos = tok.end;
  }
  return values;
}

// ── Extrai bloco de uma tabela do ficheiro SQL ────────────────────────────────
function getTableBlock(sql, table) {
  const marker = `-- ${table} (`;
  const si = sql.indexOf(marker);
  if (si === -1) return null;
  const lineEnd = sql.indexOf("\n", si);
  const m = sql.slice(si, lineEnd).match(/\((\d+) linhas\)/);
  if (!m || parseInt(m[1]) === 0) return null;
  const nextMarker = sql.indexOf("\n-- ", lineEnd + 1);
  return sql.slice(si, nextMarker !== -1 ? nextMarker : sql.length);
}

// ── Extrai INSERT statements de um bloco ─────────────────────────────────────
function getInserts(block) {
  const result = [];
  const re = /INSERT INTO public\."([^"]+)"\s*\(([^)]+)\)\s*VALUES\s*/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const tableName = m[1];
    const colNames  = m[2].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    let pos = re.lastIndex;
    const rows = [];
    let depth = 0, inStr = false, isE = false, buf = "";

    while (pos < block.length) {
      const ch = block[pos];
      if (!inStr) {
        if (ch === "E" && block[pos+1] === "'")  { inStr = true; isE = true; buf += ch + block[pos+1]; pos += 2; continue; }
        if (ch === "'")                           { inStr = true; isE = false; buf += ch; pos++; continue; }
        if (ch === "(" && depth === 0)            { depth = 1; buf = ch; pos++; continue; }
        if (ch === "(" && depth > 0)              { depth++; buf += ch; pos++; continue; }
        if (ch === ")" && depth > 1)              { depth--; buf += ch; pos++; continue; }
        if (ch === ")" && depth === 1)            { buf += ch; rows.push(buf.trim()); buf = ""; depth = 0; pos++; continue; }
        if (ch === ";" && depth === 0)            { pos++; break; }
        if (depth > 0) buf += ch;
        pos++;
      } else {
        if (isE && ch === "\\" && block[pos+1] === "'")  { buf += ch + block[pos+1]; pos += 2; continue; }
        if (isE && ch === "\\" && block[pos+1] === "\\") { buf += ch + block[pos+1]; pos += 2; continue; }
        if (ch === "'" && block[pos+1] === "'")          { buf += "''"; pos += 2; continue; }
        if (ch === "'")                                   { inStr = false; isE = false; buf += ch; pos++; continue; }
        buf += ch; pos++;
      }
    }
    re.lastIndex = pos;
    result.push({ tableName, colNames, rows });
  }
  return result;
}

// ── Config BD ─────────────────────────────────────────────────────────────────
const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { error("NEON_DATABASE_URL ou DATABASE_URL não definido."); process.exit(1); }

function sanitizeUrl(raw) {
  try {
    const u = new URL(raw.trim().replace(/\.$/, ""));
    ["channel_binding","sslmode","uselibpqcompat"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch { return raw.trim(); }
}
const useSSL = !["localhost","127.0.0.1","helium"].some(h => DB_URL.includes(h));
const pool = new Pool({
  connectionString: sanitizeUrl(DB_URL),
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 3, connectionTimeoutMillis: 15_000,
});

// ── Ordem de importação (FK-safe) ─────────────────────────────────────────────
const IMPORT_ORDER = [
  "provincias", "municipios", "feriados", "lookup_items",
  "cursos", "anos_academicos",
  "professores", "funcionarios",
  "turmas", "turma_disciplinas", "curso_disciplinas",
  "notas", "pautas", "horarios", "sumarios", "planificacoes",
  "avaliacoes_parciais", "conteudos_programaticos",
  "taxas", "salas", "eventos", "materiais",
  "doc_templates", "modelos_avaliacao", "documentos_emitidos",
  "solicitacoes_documentos", "processos_secretaria",
  "rupes", "pagamentos", "recibo_emissoes", "saldo_alunos",
  "movimentos_saldo", "entradas_diversas", "contas_pagar",
  "orcamentos_rubrica", "plano_contas", "folhas_salarios",
  "itens_folha", "tempos_lectivos", "faltas_funcionarios",
  "mensagens", "notificacoes", "comunicados",
  "comunicados_visualizacoes", "chat_mensagens",
  "livros", "emprestimos", "desejos_livros",
  "presencas_biblioteca", "cartao_leituras",
  "audit_logs", "ai_conversas", "ai_feedback",
  "aluno_ficha_emissoes", "alunos_status_historico",
  "credenciais_historico", "saft_exportacoes",
  "saft_hashes", "saft_sequencias", "role_permissions",
  "licenca_solicitacoes", "licenca_historico",
  "licenca_recibo_emissoes", "licenca_codigos", "licenca_cupoes",
  "app_error_logs", "boletim_emissoes",
  "presencas_auditoria", "registos_falta_mensal",
];

// ── Batch insert ──────────────────────────────────────────────────────────────
const BATCH_SIZE = 100;

async function flushBatch(client, table, batch, errors) {
  if (batch.length === 0) return { ok: 0, failed: 0 };

  // All rows in a batch share the same validCols (same INSERT statement)
  const validCols = batch[0].validCols;
  const colList = validCols.map(c => `"${c}"`).join(", ");
  const numCols = validCols.length;

  // Build multi-row VALUES: ($1,$2,...), ($n+1,$n+2,...), ...
  const valueClauses = [];
  const allParams = [];
  let pIdx = 1;
  for (const { params } of batch) {
    valueClauses.push(`(${params.map(() => `$${pIdx++}`).join(", ")})`);
    allParams.push(...params);
  }

  try {
    await client.query(
      `INSERT INTO public."${table}" (${colList}) VALUES ${valueClauses.join(", ")} ON CONFLICT DO NOTHING`,
      allParams
    );
    return { ok: batch.length, failed: 0 };
  } catch (e) {
    // Batch failed — fall back to row-by-row to count exact failures
    let ok = 0, failed = 0;
    for (const { params } of batch) {
      const paramStr = params.map((_, i) => `$${i + 1}`).join(", ");
      try {
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${paramStr}) ON CONFLICT DO NOTHING`,
          params
        );
        ok++;
      } catch (e2) {
        failed++;
        const msg = e2.message.split("\n")[0];
        if (!errors.includes(msg)) errors.push(msg);
      }
    }
    return { ok, failed };
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  const backupFile = process.argv[2];
  if (!backupFile || !fs.existsSync(backupFile)) {
    error(`Ficheiro não encontrado: ${backupFile || "(não especificado)"}`);
    console.log(`  Uso: node scripts/repair-jsonb-import.js backups/siga_backup_XXX.sql`);
    process.exit(1);
  }

  console.log(`\n${C.bold}${C.cyan}SIGA — Reparação de Importação JSONB${C.reset}\n`);
  info(`Ficheiro: ${backupFile}`);
  info(`BD: ${useSSL ? "Neon (NEON_DATABASE_URL)" : "Local (DATABASE_URL)"}`);

  const sql = fs.readFileSync(backupFile, "utf8");
  const client = await pool.connect();
  await client.query("SET search_path TO public");

  // ── Carregar metadados de colunas da BD (tipo + existência) ─────────────────
  info("A carregar metadados das colunas da BD...");
  const metaRes = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  // dbCols[tabela][coluna] = tipo (ex: 'jsonb', 'text', 'integer', ...)
  const dbCols = {};
  for (const row of metaRes.rows) {
    if (!dbCols[row.table_name]) dbCols[row.table_name] = {};
    dbCols[row.table_name][row.column_name] = row.data_type;
  }
  log(`Metadados carregados: ${Object.keys(dbCols).length} tabelas`);

  let grandTotal = 0, grandFailed = 0;

  try {
    for (const table of IMPORT_ORDER) {
      const block = getTableBlock(sql, table);
      if (!block) continue;

      const inserts = getInserts(block);
      if (inserts.length === 0) continue;

      const tableMeta = dbCols[table] || {};
      let tableOk = 0, tableFailed = 0;
      const errors = [];

      for (const ins of inserts) {
        const { colNames, rows } = ins;
        const pendingBatch = [];

        // Filtrar colunas que não existem no schema actual da BD
        const validIdxs = colNames
          .map((c, i) => (c in tableMeta ? i : -1))
          .filter(i => i !== -1);

        const validCols = validIdxs.map(i => colNames[i]);

        for (const rowSql of rows) {
          const values = parseRowValues(rowSql);
          if (values.length === 0) continue;

          // Pegar apenas os valores das colunas válidas
          const filteredVals = validIdxs.map(i => (i < values.length ? values[i] : null));

          if (filteredVals.length === 0) continue;

          // Fixar colunas JSONB (detectadas da BD)
          const fixedVals = filteredVals.map((v, fi) => {
            const col  = validCols[fi];
            const tipo = tableMeta[col];
            if (tipo !== "jsonb" && tipo !== "json") return v;
            return fixJsonbValue(col, v);
          });

          // Construir parâmetros
          const params = fixedVals.map((v, fi) => {
            if (v === null)    return null;
            if (v === "TRUE")  return true;
            if (v === "FALSE") return false;
            const tipo = tableMeta[validCols[fi]];
            // JSONB → passa como string (pg vai converter)
            if (tipo === "jsonb" || tipo === "json") return v;
            // Numérico
            if ((tipo === "integer" || tipo === "real" || tipo === "numeric" ||
                 tipo === "double precision" || tipo === "bigint") &&
                v !== "" && !isNaN(v)) return Number(v);
            return v;
          });

          pendingBatch.push({ params, validCols });

          // Flush batch when full
          if (pendingBatch.length >= BATCH_SIZE) {
            const r = await flushBatch(client, table, pendingBatch, errors);
            tableOk += r.ok; tableFailed += r.failed;
            pendingBatch.length = 0;
          }
        }
        // Flush remaining
        if (pendingBatch.length > 0) {
          const r = await flushBatch(client, table, pendingBatch, errors);
          tableOk += r.ok; tableFailed += r.failed;
          pendingBatch.length = 0;
        }
      }

      grandTotal += tableOk;
      grandFailed += tableFailed;

      if (tableOk > 0 || tableFailed > 0) {
        const icon = tableFailed === 0 ? `${C.green}✔${C.reset}` : `${C.yellow}⚠${C.reset}`;
        console.log(`  ${icon} ${table.padEnd(32)} ok: ${String(tableOk).padStart(5)}  falhas: ${tableFailed}`);
        errors.slice(0, 3).forEach(e => console.log(`       ${C.yellow}↳${C.reset} ${e}`));
      }
    }

    console.log();
    log(`Importação concluída!`);
    log(`Linhas inseridas: ${grandTotal}`);
    if (grandFailed > 0) warn(`Falhas: ${grandFailed} (ver detalhes acima — podem ser conflitos normais)`);

    console.log();
    info("Estado final da base de dados:");
    const statTables = [
      "utilizadores","alunos","professores","turmas","notas","presencas",
      "pagamentos","comunicados","funcionarios","disciplinas",
      "cursos","anos_academicos","horarios","pautas","taxas","salas",
    ];
    for (const t of statTables) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) n FROM public."${t}"`);
        console.log(`   │  ${t.padEnd(24)} ${String(rows[0].n).padStart(6)}`);
      } catch {}
    }

  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
})();
