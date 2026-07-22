#!/usr/bin/env node
/**
 * Super Escola — Verificação e Garantia de Ligação ao Neon
 * Corre este script no servidor para confirmar que o Neon está activo
 * Uso: node scripts/verificar-neon.js
 */

require("dotenv").config();
const { Pool } = require("pg");

const NEON_URL = (process.env.NEON_DATABASE_URL || "").trim();
const LOCAL_URL = (process.env.DATABASE_URL || "").trim();

function sanitize(url) {
  try {
    const u = new URL(url.replace(/\.$/, ""));
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch { return url.trim(); }
}

function isNeonUrl(url) {
  try { return new URL(url).hostname.includes("neon.tech"); } catch { return false; }
}

async function testConnection(label, url, ssl) {
  const pool = new Pool({
    connectionString: ssl ? sanitize(url) : url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
    max: 1,
  });
  const t0 = Date.now();
  try {
    const res = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM public.utilizadores) AS utilizadores,
        (SELECT COUNT(*) FROM public.alunos)        AS alunos,
        (SELECT COUNT(*) FROM public.notas)         AS notas,
        (SELECT COUNT(*) FROM public.pagamentos)    AS pagamentos
    `);
    const ms = Date.now() - t0;
    const r = res.rows[0];
    console.log(`\n✅ ${label} — LIGADO (${ms}ms)`);
    console.log(`   Utilizadores: ${r.utilizadores} | Alunos: ${r.alunos} | Notas: ${r.notas} | Pagamentos: ${r.pagamentos}`);
    await pool.end();
    return { ok: true, alunos: Number(r.alunos) };
  } catch (e) {
    console.log(`\n❌ ${label} — FALHOU: ${e.message}`);
    await pool.end();
    return { ok: false, alunos: 0 };
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Super Escola — Verificação de Ligação ao Neon       ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const hasNeon  = isNeonUrl(NEON_URL);
  const hasLocal = Boolean(LOCAL_URL);

  if (!hasNeon) {
    console.error("\n❌ NEON_DATABASE_URL não está definida ou é inválida!");
    console.error("   Verifica o ficheiro .env na pasta do projecto.");
    console.error(`   Valor actual: "${NEON_URL || "(vazio)"}"`);
    console.error("\n   Para corrigir no servidor:");
    console.error('   echo "NEON_DATABASE_URL=postgresql://..." >> /var/www/superescola/.env');
    console.error("   pm2 restart superescola --update-env");
    process.exit(1);
  }

  const neon  = await testConnection("NEON (cloud)", NEON_URL, true);
  const local = hasLocal ? await testConnection("LOCAL (fallback)", LOCAL_URL, false) : null;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  DIAGNÓSTICO                                          ║");
  console.log("╠══════════════════════════════════════════════════════╣");

  if (neon.ok) {
    console.log("║  ✅ Neon está activo e acessível                      ║");
    if (neon.alunos > 0) {
      console.log("║  ✅ Base de dados tem dados reais                      ║");
    } else {
      console.log("║  ⚠️  Neon está vazio — podes precisar de seed          ║");
    }
  } else {
    console.log("║  ❌ Neon INACESSÍVEL — verifica a URL e a rede         ║");
    if (local?.ok) {
      console.log("║  ⚠️  A usar LOCAL como fallback (dados podem diferir)  ║");
    } else {
      console.log("║  ❌ LOCAL também falhou — aplicação sem base de dados! ║");
    }
  }

  if (local?.ok && neon.ok) {
    if (local.alunos > neon.alunos) {
      console.log("║  ⚠️  LOCAL tem mais dados que Neon — dados divergentes ║");
      console.log("║     Corre: node scripts/migrar-prod-para-neon.js       ║");
    }
  }

  console.log("╚══════════════════════════════════════════════════════╝\n");

  process.exit(neon.ok ? 0 : 1);
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
