const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadEnvFromFile() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isValidNeonUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 1 && parsed.hostname.includes("neon.tech");
  } catch {
    return false;
  }
}

async function main() {
  loadEnvFromFile();
  const neonUrl = (process.env.NEON_DATABASE_URL || "").trim();
  const localUrl = (process.env.DATABASE_URL || "").trim();
  const databaseUrl = isValidNeonUrl(neonUrl) ? neonUrl : localUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL ou NEON_DATABASE_URL nao definida.");
  }
  console.log(`[seed-utilizadores] A usar ${isValidNeonUrl(neonUrl) ? "Neon DB" : "banco local"}...`);

  const sqlPath = path.resolve(__dirname, "../database/siga5_utilizadores.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Seed de utilizadores aplicado com sucesso.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de utilizadores:", error.message);
  process.exit(1);
});
