#!/usr/bin/env node
/**
 * Script de migração independente — aplica todas as migrações pendentes ao Neon DB
 * Uso: npm run db:migrate
 */

require("dotenv").config();
const { Pool } = require("pg");
const path = require("path");

const NEON_URL = (process.env.NEON_DATABASE_URL || "").trim();
const LOCAL_URL = (process.env.DATABASE_URL || "").trim();

function isValidNeonUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 1 && parsed.hostname.includes("neon.tech");
  } catch {
    return false;
  }
}

const dbUrl = isValidNeonUrl(NEON_URL) ? NEON_URL : LOCAL_URL;

if (!dbUrl) {
  console.error("[migrate] ❌ Nenhuma base de dados configurada. Define NEON_DATABASE_URL ou DATABASE_URL.");
  process.exit(1);
}

const isNeon = isValidNeonUrl(NEON_URL) && dbUrl === NEON_URL;
console.log(`[migrate] 🔌 A ligar ao ${isNeon ? "Neon DB (primário)" : "banco local"}...`);

async function run() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { readMigrationFiles } = await import("drizzle-orm/migrator");

  const MIGRATIONS_FOLDER = path.resolve(__dirname, "..", "migrations");
  const MIGRATIONS_SCHEMA = "drizzle";
  const MIGRATIONS_TABLE = "__drizzle_migrations";

  const pool = new Pool({ connectionString: dbUrl, max: 3 });

  try {
    // Garantir que a tabela de controlo existe e que as migrações já aplicadas
    // estão registadas (para não re-aplicar o que o servidor já correu)
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_SCHEMA}."${MIGRATIONS_TABLE}" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const { rows: applied } = await pool.query(
      `SELECT hash FROM ${MIGRATIONS_SCHEMA}."${MIGRATIONS_TABLE}"`
    );
    const appliedHashes = new Set(applied.map(r => r.hash));
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

    let novas = 0;
    for (const migration of migrations) {
      if (!appliedHashes.has(migration.hash)) {
        await pool.query(
          `INSERT INTO ${MIGRATIONS_SCHEMA}."${MIGRATIONS_TABLE}" (hash, created_at) VALUES ($1, $2)`,
          [migration.hash, migration.folderMillis]
        );
        novas++;
      }
    }

    if (novas > 0) {
      console.log(`[migrate] 📝 ${novas} migração(ões) nova(s) registada(s).`);
    }

    // Correr o migrador drizzle (aplica apenas as pendentes, ignora as já registadas)
    console.log("[migrate] ⏳ A verificar e aplicar migrações pendentes...");
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[migrate] ✅ Esquema sincronizado com sucesso.");

    if (isNeon) {
      console.log("[migrate] 🌐 Neon DB atualizado e pronto.");
    }
  } finally {
    await pool.end();
  }
}

async function runSeeds() {
  const seedScripts = [
    { name: "seed-sistema.js",      path: path.resolve(__dirname, "seed-sistema.js") },
    { name: "seed-utilizadores.js", path: path.resolve(__dirname, "seed-utilizadores.js") },
  ];
  for (const s of seedScripts) {
    const fs = require("fs");
    if (!fs.existsSync(s.path)) {
      console.log(`[migrate] ⏩ ${s.name} não encontrado — ignorado.`);
      continue;
    }
    try {
      console.log(`[migrate] 🌱 A correr ${s.name}...`);
      await new Promise((resolve, reject) => {
        const { execFile } = require("child_process");
        const proc = execFile(process.execPath, [s.path], {
          env: process.env,
          timeout: 60000,
        });
        proc.stdout?.pipe(process.stdout);
        proc.stderr?.pipe(process.stderr);
        proc.on("close", code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
        proc.on("error", reject);
      });
      console.log(`[migrate] ✅ ${s.name} concluído.`);
    } catch (e) {
      console.warn(`[migrate] ⚠️  ${s.name} com erros (continuando): ${e.message}`);
    }
  }
}

run()
  .then(() => runSeeds())
  .catch(err => {
    console.error("[migrate] ❌ Falha:", err.message);
    process.exit(1);
  });
