#!/usr/bin/env node
/**
 * Super Escola — Diagnóstico de Bases de Dados
 * Mostra um resumo comparativo entre o Neon e o PostgreSQL local
 * Uso: node scripts/diagnostico-bd.js
 */

require("dotenv").config();
const { Pool } = require("pg");

const NEON_URL = (process.env.NEON_DATABASE_URL || "").trim();
const LOCAL_URL = (process.env.DATABASE_URL || "").trim();

function sanitize(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch { return url; }
}

async function auditDb(label, connectionString, ssl) {
  const pool = new Pool({
    connectionString: ssl ? sanitize(connectionString) : connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });

  try {
    await pool.query("SELECT 1");
  } catch (e) {
    console.log(`\n❌ ${label}: NÃO ACESSÍVEL — ${e.message}`);
    await pool.end();
    return null;
  }

  const q = (sql) => pool.query(sql).then(r => r.rows).catch(() => []);

  const tabelas = [
    { nome: "utilizadores",        sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN avatar != '' AND avatar IS NOT NULL THEN 1 ELSE 0 END) AS com_foto FROM public.utilizadores` },
    { nome: "alunos",              sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN ativo THEN 1 ELSE 0 END) AS ativos FROM public.alunos` },
    { nome: "professores",         sql: `SELECT COUNT(*) AS total FROM public.professores` },
    { nome: "turmas",              sql: `SELECT COUNT(*) AS total FROM public.turmas` },
    { nome: "anos_academicos",     sql: `SELECT COUNT(*) AS total, string_agg(ano, ', ') AS anos FROM public.anos_academicos` },
    { nome: "pagamentos",          sql: `SELECT COUNT(*) AS total FROM public.pagamentos` },
    { nome: "notas",               sql: `SELECT COUNT(*) AS total FROM public.notas` },
    { nome: "presencas",           sql: `SELECT COUNT(*) AS total FROM public.presencas` },
    { nome: "config_geral",        sql: `SELECT "nomeEscola", "emailEscola" FROM public.config_geral LIMIT 1` },
    { nome: "registros (inscrições)", sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) AS pendentes FROM public.registros` },
    { nome: "doc_templates",       sql: `SELECT COUNT(*) AS total FROM public.doc_templates` },
    { nome: "pautas",              sql: `SELECT COUNT(*) AS total FROM public.pautas` },
    { nome: "eventos",             sql: `SELECT COUNT(*) AS total FROM public.eventos` },
  ];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  📊 ${label}`);
  console.log(`${"═".repeat(60)}`);

  for (const t of tabelas) {
    const rows = await q(t.sql);
    if (!rows.length) {
      console.log(`  ${t.nome.padEnd(28)} → tabela vazia ou não existe`);
    } else {
      const row = rows[0];
      const resumo = Object.entries(row)
        .map(([k, v]) => `${k}: ${v ?? "—"}`)
        .join(" | ");
      console.log(`  ${t.nome.padEnd(28)} → ${resumo}`);
    }
  }

  // Utilizadores com detalhes
  const users = await q(`SELECT nome, role, email,
    CASE WHEN avatar != '' AND avatar IS NOT NULL THEN '✅ tem foto' ELSE '❌ sem foto' END AS foto
    FROM public.utilizadores ORDER BY role`);
  if (users.length) {
    console.log(`\n  👥 Utilizadores:`);
    users.forEach(u => console.log(`     • [${u.role}] ${u.nome} (${u.email}) — ${u.foto}`));
  }

  await pool.end();
  return true;
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   Super Escola — Diagnóstico Comparativo de Bases de Dados ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const hasNeon  = NEON_URL && NEON_URL.includes("neon.tech");
  const hasLocal = Boolean(LOCAL_URL);

  if (!hasNeon && !hasLocal) {
    console.error("\n❌ Nenhuma variável de base de dados configurada!");
    process.exit(1);
  }

  if (hasNeon)  await auditDb("NEON (cloud — base de dados primária)", NEON_URL, true);
  if (hasLocal) await auditDb("LOCAL Replit (fallback)", LOCAL_URL, false);

  if (hasNeon && hasLocal) {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  💡 CONCLUSÃO                                              ║");
    console.log("╠════════════════════════════════════════════════════════════╣");
    console.log("║  Os dados REAIS devem estar na base com mais registos.    ║");
    console.log("║  Se o Neon tiver menos dados → precisas de migrar do      ║");
    console.log("║  servidor antigo para o Neon.                       ║");
    console.log("║                                                            ║");
    console.log("║  Próximo passo: node scripts/migrar-prod-para-neon.js     ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
  }
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
