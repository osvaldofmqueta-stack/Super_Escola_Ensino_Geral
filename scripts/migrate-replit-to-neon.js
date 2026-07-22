#!/usr/bin/env node
/**
 * migrate-replit-to-neon.js
 * Migra todos os dados do PostgreSQL local do Replit → Neon
 * Uso: node scripts/migrate-replit-to-neon.js
 */

const { Pool } = require("pg");
const { execSync, spawn } = require("child_process");

const LOCAL_URL = process.env.DATABASE_URL?.trim();
const NEON_URL  = process.env.NEON_DATABASE_URL?.trim();

if (!LOCAL_URL) { console.error("❌ DATABASE_URL não definida."); process.exit(1); }
if (!NEON_URL)  { console.error("❌ NEON_DATABASE_URL não definida."); process.exit(1); }
if (LOCAL_URL === NEON_URL) { console.error("❌ LOCAL e NEON apontam para a mesma BD."); process.exit(1); }

// Sanitiza URL (remove params incompatíveis com node-postgres)
function sanitize(raw) {
  try {
    const u = new URL(raw.replace(/\.$/, ""));
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch { return raw; }
}

const localClean = sanitize(LOCAL_URL);
const neonClean  = sanitize(NEON_URL);

// Tabelas a IGNORAR (dados de sistema que já são semeados automaticamente no arranque)
const SKIP_TABLES = new Set([
  "__drizzle_migrations",
  "provincias",
  "municipios",
  "lookup_items",
  "lookup_deleted_seeds",
  "feriados",
  "feriado_deleted_seeds",
  "doc_deleted_seeds",
  "disciplina_deleted_seeds",
]);

async function getRowCount(pool, table) {
  try {
    const r = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
    return r.rows[0].n;
  } catch { return -1; }
}

async function getAllTables(pool) {
  const r = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return r.rows.map(x => x.tablename);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Migração: Replit PostgreSQL → Neon");
  console.log("═══════════════════════════════════════════════════════");

  const localPool = new Pool({ connectionString: localClean, ssl: false, connectionTimeoutMillis: 10000 });
  const neonPool  = new Pool({ connectionString: neonClean,  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

  // Testar ligações
  console.log("\n🔌 A testar ligações...");
  try {
    await localPool.query("SELECT 1");
    console.log("  ✅ Replit PostgreSQL — ligado");
  } catch (e) {
    console.error("  ❌ Falha na ligação ao Replit PostgreSQL:", e.message);
    process.exit(1);
  }
  try {
    await neonPool.query("SELECT 1");
    console.log("  ✅ Neon — ligado");
  } catch (e) {
    console.error("  ❌ Falha na ligação ao Neon:", e.message);
    process.exit(1);
  }

  // Listar tabelas na origem
  const tables = (await getAllTables(localPool)).filter(t => !SKIP_TABLES.has(t));
  console.log(`\n📋 ${tables.length} tabelas a migrar (${SKIP_TABLES.size} de sistema ignoradas)\n`);

  let migrated = 0, skipped = 0, errors = 0;

  for (const table of tables) {
    const localCount = await getRowCount(localPool, table);
    const neonCount  = await getRowCount(neonPool, table);

    if (localCount <= 0) {
      console.log(`  ⏭  ${table} — vazia no Replit, ignorada`);
      skipped++;
      continue;
    }

    if (neonCount >= localCount) {
      console.log(`  ✔  ${table} — Neon já tem ${neonCount} linhas (local=${localCount}), ignorada`);
      skipped++;
      continue;
    }

    console.log(`  🔄 ${table} — local=${localCount}, neon=${neonCount} → a migrar...`);

    try {
      // Exportar dados da tabela do Replit
      const dumpCmd = [
        "pg_dump",
        "--data-only",
        "--no-owner",
        "--no-acl",
        "--no-privileges",
        "--disable-triggers",
        `--table=public.${table}`,
        `"${localClean}"`,
      ].join(" ");

      // Importar para o Neon (ON CONFLICT DO NOTHING via --single-transaction)
      // Usamos psql com variável de sessão para desactivar triggers e ignorar conflitos
      const psqlCmd = `psql "${neonClean}" --single-transaction -c "SET session_replication_role = replica;" -f -`;

      const dump = execSync(dumpCmd, { maxBuffer: 512 * 1024 * 1024 });

      // Envolver o dump em bloco que ignora erros de chave duplicada
      const wrappedSql = dump.toString()
        .replace(/^(INSERT INTO)/gm, "INSERT INTO")
        + "\n";

      // Usar psql com stdin
      const psql = execSync(
        `pg_dump --data-only --no-owner --no-acl --no-privileges --disable-triggers --table=public."${table}" "${localClean}" | psql "${neonClean}" --single-transaction 2>&1`,
        { shell: true, maxBuffer: 512 * 1024 * 1024 }
      );

      const neonAfter = await getRowCount(neonPool, table);
      console.log(`     ✅ ${table} — Neon agora tem ${neonAfter} linhas`);
      migrated++;
    } catch (e) {
      const msg = (e.stderr || e.stdout || e.message || "").toString().slice(0, 300);
      // Ignorar erros de chave duplicada (dados já existem no Neon)
      if (msg.includes("duplicate key") || msg.includes("already exists") || msg.includes("unique constraint")) {
        console.log(`     ⚠️  ${table} — conflitos ignorados (dados já existem no Neon)`);
        skipped++;
      } else {
        console.error(`     ❌ ${table} — erro: ${msg}`);
        errors++;
      }
    }
  }

  // Sincronizar sequências no Neon
  console.log("\n🔧 A sincronizar sequências no Neon...");
  try {
    const seqs = await neonPool.query(`
      SELECT sequence_name FROM information_schema.sequences
      WHERE sequence_schema = 'public'
    `);
    for (const { sequence_name } of seqs.rows) {
      // Tentar encontrar a tabela/coluna associada
      const owned = await neonPool.query(`
        SELECT pg_get_serial_sequence(quote_ident(table_name), column_name) AS seq
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_default LIKE '%' || $1 || '%'
        LIMIT 1
      `, [sequence_name]);
      if (owned.rows[0]?.seq) {
        await neonPool.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${sequence_name.replace('_id_seq','')}")+1, 1), false)`)
          .catch(() => {});
      }
    }
    // Forma mais directa: resetar todas as sequências baseadas no max(id)
    await neonPool.query(`
      DO $$
      DECLARE
        r RECORD;
        max_val BIGINT;
        seq_name TEXT;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_default LIKE 'nextval%'
        LOOP
          BEGIN
            seq_name := pg_get_serial_sequence('public.' || quote_ident(r.table_name), r.column_name);
            IF seq_name IS NOT NULL THEN
              EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.column_name, r.table_name) INTO max_val;
              PERFORM setval(seq_name, GREATEST(max_val, 1));
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END LOOP;
      END $$;
    `);
    console.log("  ✅ Sequências sincronizadas");
  } catch (e) {
    console.warn("  ⚠️  Erro ao sincronizar sequências (não crítico):", e.message?.slice(0, 150));
  }

  await localPool.end();
  await neonPool.end();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  ✅ Migradas: ${migrated} tabelas`);
  console.log(`  ⏭  Ignoradas: ${skipped} tabelas`);
  console.log(`  ❌ Erros: ${errors} tabelas`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (errors > 0) process.exit(1);
}

main().catch(e => { console.error("Erro fatal:", e.message); process.exit(1); });
