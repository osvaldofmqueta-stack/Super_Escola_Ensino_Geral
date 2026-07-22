#!/usr/bin/env node
/**
 * Super Escola / SIGA — Backup & Restore da Base de Dados Neon
 * ─────────────────────────────────────────────────────────────
 * Script Node.js puro — sem dependência de versão do pg_dump.
 *
 * USO:
 *   node scripts/backup-neon.js export
 *   node scripts/backup-neon.js export backups/meu_backup.sql
 *   node scripts/backup-neon.js import backups/meu_backup.sql
 *   node scripts/backup-neon.js list
 *   node scripts/backup-neon.js stats
 */

const { Pool } = require("pg");
const fs   = require("fs");
const path = require("path");

// ── Cores ──────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m",
};
const log    = (m) => console.log(`${C.green}[✔]${C.reset} ${m}`);
const warn   = (m) => console.log(`${C.yellow}[⚠]${C.reset} ${m}`);
const error  = (m) => console.error(`${C.red}[✘]${C.reset} ${m}`);
const info   = (m) => console.log(`${C.blue}[ℹ]${C.reset} ${m}`);
const header = (m) => console.log(`\n${C.bold}${C.cyan}${m}${C.reset}\n`);

// ── Config ─────────────────────────────────────────────────────────────────
const BACKUP_DIR = path.join(process.cwd(), "backups");
const NEON_URL   = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!NEON_URL) {
  error("NEON_DATABASE_URL não está definida nos Secrets do Replit.");
  process.exit(1);
}

function sanitizeUrl(raw) {
  try {
    const u = new URL(raw.trim().replace(/\.$/, ""));
    u.searchParams.delete("channel_binding");
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return raw.trim()
      .replace(/[?&]channel_binding=[^&]*/g, "")
      .replace(/[?&]sslmode=[^&]*/g, "");
  }
}

const pool = new Pool({
  connectionString: sanitizeUrl(NEON_URL),
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 15_000,
});

// ── Utilitários ────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

function escapeValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number")  return String(val);
  if (val instanceof Date)      return `'${val.toISOString()}'`;
  // Objectos e arrays (colunas JSONB) — serializar como JSON com dollar-quoting
  if (typeof val === "object") {
    const json = JSON.stringify(val).replace(/\$/g, "\\$");
    return `$json$${JSON.stringify(val)}$json$::jsonb`;
  }
  const str = String(val).replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `E'${str}'`;
}

const quoteIdent = (n) => `"${n.replace(/"/g, '""')}"`;
const quoteTbl   = (n) => `public.${quoteIdent(n)}`;

// ── Estatísticas ───────────────────────────────────────────────────────────
async function showStats(client) {
  const tables = [
    "utilizadores","alunos","professores","turmas",
    "pagamentos","notas","presencas","comunicados",
    "funcionarios","disciplinas",
  ];
  const results = [];
  for (const t of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM ${quoteTbl(t)}`);
      results.push({ tabela: t, total: Number(rows[0].n) });
    } catch { /* tabela não existe — ignorar */ }
  }
  if (results.length === 0) { warn("Sem dados para mostrar."); return; }
  const maxLen = Math.max(...results.map(r => r.tabela.length));
  results.forEach(r =>
    console.log(`   │  ${r.tabela.padEnd(maxLen)}  ${String(r.total).padStart(6)}`)
  );
}

// ── Lista de tabelas acessíveis ────────────────────────────────────────────
async function getAccessibleTables(client) {
  const { rows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const SKIP = new Set([
    "__drizzle_migrations", "spatial_ref_sys",
    "geography_columns", "geometry_columns",
  ]);

  const result = [];
  for (const { tablename } of rows) {
    if (SKIP.has(tablename)) continue;
    try {
      await client.query(`SELECT 1 FROM ${quoteTbl(tablename)} LIMIT 0`);
      result.push(tablename);
    } catch { /* sem permissão */ }
  }
  return result;
}

// ── DDL de uma tabela ──────────────────────────────────────────────────────
async function getTableDDL(client, table) {
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type, character_maximum_length,
           column_default, is_nullable, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  if (cols.length === 0) return null;

  const { rows: constraints } = await client.query(`
    SELECT tc.constraint_name, tc.constraint_type,
           kcu.column_name,
           ccu.table_name  AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           cc.check_clause
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    LEFT JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name AND tc.constraint_schema = cc.constraint_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position
  `, [table]);

  const { rows: indexes } = await client.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = $1
      AND indexname NOT IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = $1
      )
  `, [table]);

  let ddl = `CREATE TABLE IF NOT EXISTS ${quoteTbl(table)} (\n`;

  const colDefs = cols.map(col => {
    const type =
      col.udt_name === "jsonb"  ? "jsonb" :
      col.udt_name === "uuid"   ? "uuid"  :
      col.data_type === "character varying" ? `varchar(${col.character_maximum_length || 255})` :
      col.data_type === "USER-DEFINED" ? col.udt_name :
      col.data_type;
    let def = `  ${quoteIdent(col.column_name)} ${type}`;
    if (col.is_nullable === "NO") def += " NOT NULL";
    if (col.column_default)       def += ` DEFAULT ${col.column_default}`;
    return def;
  });

  // Agrupar constraints por nome
  const cmap = {};
  constraints.forEach(c => {
    if (!cmap[c.constraint_name]) cmap[c.constraint_name] = { ...c, columns: [] };
    if (c.column_name) cmap[c.constraint_name].columns.push(c.column_name);
  });

  const constraintDefs = [];
  Object.values(cmap).forEach(c => {
    const colsStr = c.columns.map(quoteIdent).join(", ");
    if (c.constraint_type === "PRIMARY KEY") {
      constraintDefs.push(`  CONSTRAINT ${quoteIdent(c.constraint_name)} PRIMARY KEY (${colsStr})`);
    } else if (c.constraint_type === "UNIQUE") {
      constraintDefs.push(`  CONSTRAINT ${quoteIdent(c.constraint_name)} UNIQUE (${colsStr})`);
    } else if (c.constraint_type === "FOREIGN KEY") {
      constraintDefs.push(
        `  CONSTRAINT ${quoteIdent(c.constraint_name)} FOREIGN KEY (${colsStr})` +
        ` REFERENCES public.${quoteIdent(c.foreign_table_name)}(${quoteIdent(c.foreign_column_name)})` +
        ` ON DELETE SET NULL`
      );
    } else if (c.constraint_type === "CHECK" && c.check_clause && !c.check_clause.includes("IS NOT NULL")) {
      constraintDefs.push(`  CONSTRAINT ${quoteIdent(c.constraint_name)} CHECK (${c.check_clause})`);
    }
  });

  ddl += [...colDefs, ...constraintDefs].join(",\n");
  ddl += "\n);\n";

  indexes.forEach(idx => { ddl += `${idx.indexdef};\n`; });

  return ddl;
}

// ══════════════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════════════
async function cmdExport(outputFile) {
  if (!outputFile) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    outputFile = path.join(BACKUP_DIR, `siga_backup_${ts}.sql`);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  header("🗄️  SIGA — Exportar Base de Dados Neon");

  const client = await pool.connect();
  // Garantir search_path nesta sessão
  await client.query("SET search_path TO public");

  try {
    const { rows: [{ version }] }             = await client.query("SELECT version()");
    const { rows: [{ current_database: db }] } = await client.query("SELECT current_database()");

    info(`Base de dados: ${db}`);
    info(`Versão PG:     ${version.split(" ").slice(0, 2).join(" ")}`);
    info(`Destino:       ${outputFile}`);
    console.log();
    info("Estatísticas actuais:");
    await showStats(client);
    console.log();

    const tables = await getAccessibleTables(client);
    info(`Tabelas encontradas: ${tables.length}`);
    console.log();
    log("A exportar estrutura e dados...");

    const stream = fs.createWriteStream(outputFile, { encoding: "utf8" });
    const write  = (s) => new Promise((res, rej) => {
      if (!stream.write(s)) stream.once("drain", res);
      else res();
    });

    // Cabeçalho
    await write(`-- ============================================================\n`);
    await write(`-- Super Escola / SIGA — Backup Completo\n`);
    await write(`-- Data:    ${new Date().toISOString()}\n`);
    await write(`-- Base:    ${db}\n`);
    await write(`-- PG:      ${version.split(",")[0]}\n`);
    await write(`-- ============================================================\n\n`);
    await write(`SET client_encoding = 'UTF8';\n`);
    await write(`SET standard_conforming_strings = on;\n`);
    await write(`SET search_path TO public;\n\n`);
    await write(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n`);
    await write(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n`);

    // Estrutura
    await write(`-- ============================================================\n`);
    await write(`-- ESTRUTURA DAS TABELAS\n`);
    await write(`-- ============================================================\n\n`);

    for (const table of tables) {
      try {
        const ddl = await getTableDDL(client, table);
        if (ddl) {
          await write(`-- Tabela: ${table}\n`);
          await write(ddl);
          await write("\n");
        }
      } catch (e) {
        warn(`DDL de '${table}' falhou: ${e.message.split("\n")[0]}`);
      }
    }

    // Dados
    await write(`-- ============================================================\n`);
    await write(`-- DADOS\n`);
    await write(`-- ============================================================\n\n`);

    let totalRows = 0;
    for (const table of tables) {
      try {
        const { rows: [{ n }] } = await client.query(`SELECT COUNT(*) AS n FROM ${quoteTbl(table)}`);
        const rowCount = Number(n);
        if (rowCount === 0) continue;

        const { rows: colInfo } = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        const colNames  = colInfo.map(c => c.column_name);
        const colIdents = colNames.map(quoteIdent).join(", ");

        await write(`-- ${table} (${rowCount} linhas)\n`);
        await write(`TRUNCATE TABLE ${quoteTbl(table)} CASCADE;\n`);

        const BATCH = 500;
        let offset = 0;
        while (offset < rowCount) {
          const { rows } = await client.query(
            `SELECT * FROM ${quoteTbl(table)} ORDER BY 1 LIMIT $1 OFFSET $2`,
            [BATCH, offset]
          );
          if (rows.length === 0) break;

          await write(`INSERT INTO ${quoteTbl(table)} (${colIdents}) VALUES\n`);
          const valueRows = rows.map(row =>
            `  (${colNames.map(col => escapeValue(row[col])).join(", ")})`
          );
          await write(valueRows.join(",\n") + ";\n");
          totalRows += rows.length;
          offset += BATCH;
        }
        await write("\n");
        process.stdout.write(`\r  → ${table.padEnd(40)} ${rowCount} linhas`);
      } catch (e) {
        warn(`\nDados de '${table}' falharam: ${e.message.split("\n")[0]}`);
      }
    }
    console.log();

    await write(`\n-- Fim: ${new Date().toISOString()}\n`);
    await new Promise((res, rej) => { stream.end(); stream.on("finish", res); stream.on("error", rej); });

    const { size } = fs.statSync(outputFile);
    console.log();
    log(`✅ Backup concluído com sucesso!`);
    log(`Ficheiro:    ${C.bold}${outputFile}${C.reset}`);
    log(`Tamanho:     ${fmtBytes(size)}`);
    log(`Tabelas:     ${tables.length}`);
    log(`Total rows:  ${totalRows.toLocaleString()}`);
    console.log();
    info(`Para restaurar:`);
    console.log(`  node scripts/backup-neon.js import ${outputFile}`);

  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  IMPORT
// ══════════════════════════════════════════════════════════════════════════
async function cmdImport(inputFile) {
  if (!inputFile) {
    error("Especifica o ficheiro SQL a importar.");
    console.log("  Uso: node scripts/backup-neon.js import backups/siga_backup_XXX.sql");
    process.exit(1);
  }
  if (!fs.existsSync(inputFile)) {
    error(`Ficheiro não encontrado: ${inputFile}`);
    await cmdList();
    process.exit(1);
  }

  const { size } = fs.statSync(inputFile);
  header("🔄  SIGA — Importar/Restaurar Base de Dados Neon");
  info(`Ficheiro: ${inputFile}`);
  info(`Tamanho:  ${fmtBytes(size)}`);
  console.log();
  warn("ATENÇÃO: Esta operação substitui dados existentes na base de dados!");
  console.log();

  if (process.stdin.isTTY) {
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => {
      rl.question(`${C.yellow}Confirmas o restauro? (escreve 'sim' para continuar): ${C.reset}`, ans => {
        rl.close();
        if (ans !== "sim") { warn("Operação cancelada."); process.exit(0); }
        resolve();
      });
    });
  }

  log("A importar base de dados...");
  const sql = fs.readFileSync(inputFile, "utf8");

  const client = await pool.connect();
  await client.query("SET search_path TO public");
  let ok = 0, failed = 0;
  try {
    // Dividir por statements preservando blocos multi-linha
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    const IGNORABLE = new Set(["42P07","42701","42710","42P01","23505","42P06"]);
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        ok++;
      } catch (e) {
        if (!IGNORABLE.has(e.code)) {
          failed++;
          if (failed <= 15) warn(`  (${e.code}) ${e.message.split("\n")[0]}`);
        }
      }
    }

    console.log();
    log(`✅ Importação concluída!`);
    log(`Statements OK:      ${ok}`);
    if (failed > 0) warn(`Statements falhados: ${failed} (podem ser normais — tabelas já existentes, etc.)`);
    console.log();
    info("Estado actual da base de dados:");
    await showStats(client);

  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  LIST
// ══════════════════════════════════════════════════════════════════════════
async function cmdList() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  header("📋  Backups disponíveis");
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".sql")).sort().reverse();
  if (files.length === 0) {
    warn(`Nenhum backup em ./${path.relative(process.cwd(), BACKUP_DIR)}/`);
    info("Cria um: node scripts/backup-neon.js export");
    return;
  }
  console.log(`  ${"Ficheiro".padEnd(54)} ${"Tamanho".padStart(9)}  Data`);
  console.log(`  ${"─".repeat(82)}`);
  files.forEach(f => {
    const fp = path.join(BACKUP_DIR, f);
    const { size, mtime } = fs.statSync(fp);
    console.log(`  ${f.padEnd(54)} ${fmtBytes(size).padStart(9)}  ${mtime.toLocaleString("pt-PT")}`);
  });
  console.log();
}

// ══════════════════════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════════════════════
async function cmdStats() {
  header("📊  Estado da Base de Dados Neon");
  const client = await pool.connect();
  await client.query("SET search_path TO public");
  try {
    const { rows: [{ version }] }             = await client.query("SELECT version()");
    const { rows: [{ current_database: db }] } = await client.query("SELECT current_database()");
    info(`Base: ${db}`);
    info(`PG:   ${version.split(" ").slice(0, 2).join(" ")}`);
    console.log();
    await showStats(client);
    console.log();
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  HELP
// ══════════════════════════════════════════════════════════════════════════
function cmdHelp() {
  console.log(`
${C.bold}${C.cyan}Super Escola / SIGA — Backup & Restore${C.reset}

  ${C.bold}COMANDOS:${C.reset}

  export [ficheiro.sql]    Exporta a BD completa (schema + dados)
  import <ficheiro.sql>    Restaura a BD a partir de um backup
  list                     Lista os backups disponíveis
  stats                    Mostra estatísticas da BD actual

  ${C.bold}EXEMPLOS:${C.reset}

  node scripts/backup-neon.js export
  node scripts/backup-neon.js export backups/pre_migracao.sql
  node scripts/backup-neon.js import backups/siga_backup_2026-06-18T23-00-00.sql
  node scripts/backup-neon.js list
  node scripts/backup-neon.js stats
`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Ponto de entrada
// ══════════════════════════════════════════════════════════════════════════
(async () => {
  const [,, cmd, arg] = process.argv;
  try {
    switch (cmd) {
      case "export": await cmdExport(arg); break;
      case "import": await cmdImport(arg); break;
      case "list":   await cmdList();      break;
      case "stats":  await cmdStats();     break;
      case "help": case "--help": case "-h": cmdHelp(); break;
      default:
        error(`Comando desconhecido: '${cmd || ""}'`);
        cmdHelp();
        process.exit(1);
    }
  } catch (err) {
    error(`Erro inesperado: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
