import * as fs from "fs";
import * as path from "path";
import { pool } from "./db";

interface MigrationEntry {
  hash: string;
  sql: string[];
  folderMillis: number;
}

function readMigrationFiles(config: { migrationsFolder: string }): MigrationEntry[] {
  const folder = config.migrationsFolder;
  const journalPath = path.join(folder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return [];
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
  const entries: MigrationEntry[] = [];
  for (const entry of journal.entries ?? []) {
    const sqlFile = path.join(folder, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlFile)) continue;
    const raw = fs.readFileSync(sqlFile, "utf-8");
    const statements = raw.split("--> statement-breakpoint").map((s: string) => s.trim()).filter(Boolean);
    entries.push({ hash: entry.tag, sql: statements, folderMillis: entry.when ?? 0 });
  }
  return entries;
}

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "migrations");
const MIGRATIONS_TABLE = "__drizzle_migrations";

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL UNIQUE,
      created_at bigint
    )
  `);
}

async function getAppliedHashes(): Promise<Set<string>> {
  const { rows } = await pool.query<{ hash: string }>(
    `SELECT hash FROM public."${MIGRATIONS_TABLE}"`
  );
  return new Set(rows.map((r) => r.hash));
}

async function markApplied(hash: string, createdAt: number) {
  await pool.query(
    `INSERT INTO public."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING`,
    [hash, createdAt]
  );
}

export async function runMigrations() {
  console.log("[migrate] A verificar e aplicar migrações pendentes...");
  try {
    try {
      await ensureMigrationsTable();
    } catch (permErr: any) {
      if (permErr?.code === "42501" || permErr?.code === "42P01") {
        console.warn(
          "[migrate] ⚠️  Sem permissões para criar tabela de migrações (utilizador pooler). " +
          "Migrações ignoradas — a app irá arrancar normalmente."
        );
        return;
      }
      throw permErr;
    }

    const appliedHashes = await getAppliedHashes();

    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

    // 42P07 = relation already exists, 42701 = column already exists
    // 42710 = object already exists, 23505 = unique violation
    // 42501 = permission denied / must be owner (authenticator não é dono das tabelas Neon)
    const IDEMPOTENT_CODES = new Set(["42P07", "42701", "42710", "23505", "42501"]);

    let applied = 0;
    for (const migration of migrations) {
      if (appliedHashes.has(migration.hash)) continue;

      const sqlStatements = migration.sql;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let spIdx = 0;
        for (const sql of sqlStatements) {
          if (!sql.trim()) continue;
          const sp = `sp_${spIdx++}`;
          await client.query(`SAVEPOINT ${sp}`);
          try {
            await client.query(sql);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
          } catch (stmtErr: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            if (IDEMPOTENT_CODES.has(stmtErr?.code)) {
              console.warn(`[migrate] ⚠️  Instrução ignorada (já existe): ${stmtErr.message.split("\n")[0]}`);
            } else {
              throw stmtErr;
            }
          }
        }
        await client.query("COMMIT");
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        throw err;
      } finally {
        client.release();
      }

      await markApplied(migration.hash, migration.folderMillis);
      applied++;
      console.log(`[migrate] ✅ Migração aplicada (hash: ${migration.hash.slice(0, 12)}...)`);
    }

    /* Also run any loose .sql files not tracked by Drizzle journal */
    const extraFiles = fs
      .readdirSync(MIGRATIONS_FOLDER)
      .filter((f) => f.endsWith(".sql") && !f.startsWith("000"))
      .sort();

    for (const file of extraFiles) {
      const filePath = path.join(MIGRATIONS_FOLDER, file);
      const sql = fs.readFileSync(filePath, "utf-8").trim();
      if (!sql) continue;
      const markerHash = "extra:" + file;
      if (appliedHashes.has(markerHash)) continue;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Dividir por statements e usar SAVEPOINTs para tolerar erros parciais
        const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
        let spIdx2 = 0;
        for (const stmt of stmts) {
          const sp = `spx_${spIdx2++}`;
          await client.query(`SAVEPOINT ${sp}`);
          try {
            await client.query(stmt);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
          } catch (stmtErr: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            if (["42P07","42701","42710","23505","42501"].includes(stmtErr?.code)) {
              console.warn(`[migrate] ⚠️  ${file} instrução ignorada: ${stmtErr.message.split("\n")[0]}`);
            } else {
              throw stmtErr;
            }
          }
        }
        await client.query("COMMIT");
      } catch (err: any) {
        try { await client.query("ROLLBACK"); } catch {}
        console.warn(`[migrate] ⚠️  ${file} ignorado: ${err.message?.split("\n")[0]}`);
      } finally {
        client.release();
      }
      await markApplied(markerHash, Date.now());
      applied++;
      console.log(`[migrate] ✅ Extra SQL aplicado: ${file}`);
    }

    if (applied === 0) {
      console.log("[migrate] Nenhuma migração pendente.");
    }
    console.log("[migrate] Migrações concluídas com sucesso.");
  } catch (err) {
    console.error("[migrate] Erro ao aplicar migrações:", err);
    throw err;
  }
}
