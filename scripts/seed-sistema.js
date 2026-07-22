/**
 * SIGA v3 — Seed completo do sistema
 * Popula: lookup_items, anos_academicos, utilizadores base
 * Uso: node scripts/seed-sistema.js
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const val = trimmed.slice(sep + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("ERRO: NEON_DATABASE_URL ou DATABASE_URL não definida.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

// ── LOOKUP ITEMS ────────────────────────────────────────────────────────────
const LOOKUP_ITEMS = [
  // Níveis de ensino
  { categoria: "niveis", valor: "Primário",  label: "Primário",  ordem: 1 },
  { categoria: "niveis", valor: "I Ciclo",   label: "I Ciclo",   ordem: 2 },
  { categoria: "niveis", valor: "II Ciclo",  label: "II Ciclo",  ordem: 3 },

  // Turnos
  { categoria: "turnos", valor: "Manhã",  label: "Manhã",  ordem: 1 },
  { categoria: "turnos", valor: "Tarde",  label: "Tarde",  ordem: 2 },
  { categoria: "turnos", valor: "Noite",  label: "Noite",  ordem: 3 },

  // Classes (Primário → I Ciclo → II Ciclo)
  { categoria: "classes", valor: "Iniciação",  label: "Iniciação",  ordem: 0 },
  { categoria: "classes", valor: "1ª Classe",  label: "1ª Classe",  ordem: 1 },
  { categoria: "classes", valor: "2ª Classe",  label: "2ª Classe",  ordem: 2 },
  { categoria: "classes", valor: "3ª Classe",  label: "3ª Classe",  ordem: 3 },
  { categoria: "classes", valor: "4ª Classe",  label: "4ª Classe",  ordem: 4 },
  { categoria: "classes", valor: "5ª Classe",  label: "5ª Classe",  ordem: 5 },
  { categoria: "classes", valor: "6ª Classe",  label: "6ª Classe",  ordem: 6 },
  { categoria: "classes", valor: "7ª Classe",  label: "7ª Classe",  ordem: 7 },
  { categoria: "classes", valor: "8ª Classe",  label: "8ª Classe",  ordem: 8 },
  { categoria: "classes", valor: "9ª Classe",  label: "9ª Classe",  ordem: 9 },
  { categoria: "classes", valor: "10ª Classe", label: "10ª Classe", ordem: 10 },
  { categoria: "classes", valor: "11ª Classe", label: "11ª Classe", ordem: 11 },
  { categoria: "classes", valor: "12ª Classe", label: "12ª Classe", ordem: 12 },
  { categoria: "classes", valor: "13ª Classe", label: "13ª Classe", ordem: 13 },

  // Tipos de sala
  { categoria: "tipos_sala", valor: "Sala Normal",          label: "Sala Normal",          ordem: 1 },
  { categoria: "tipos_sala", valor: "Laboratório",          label: "Laboratório",          ordem: 2 },
  { categoria: "tipos_sala", valor: "Sala de Informática",  label: "Sala de Informática",  ordem: 3 },
  { categoria: "tipos_sala", valor: "Auditório",            label: "Auditório",            ordem: 4 },
  { categoria: "tipos_sala", valor: "Sala de Reunião",      label: "Sala de Reunião",      ordem: 5 },

  // Tipos de taxa financeira
  { categoria: "tipos_taxa", valor: "propina",   label: "Propina",          ordem: 1 },
  { categoria: "tipos_taxa", valor: "matricula", label: "Matrícula",        ordem: 2 },
  { categoria: "tipos_taxa", valor: "material",  label: "Material Escolar", ordem: 3 },
  { categoria: "tipos_taxa", valor: "exame",     label: "Exame",            ordem: 4 },
  { categoria: "tipos_taxa", valor: "multa",     label: "Multa",            ordem: 5 },
  { categoria: "tipos_taxa", valor: "outro",     label: "Outro",            ordem: 6 },

  // Métodos de pagamento
  { categoria: "metodos_pagamento", valor: "dinheiro",      label: "Dinheiro",         ordem: 1 },
  { categoria: "metodos_pagamento", valor: "transferencia", label: "Transferência",    ordem: 2 },
  { categoria: "metodos_pagamento", valor: "multicaixa",    label: "Multicaixa",       ordem: 3 },

  // Áreas de formação (cursos II Ciclo)
  { categoria: "areas_curso", valor: "Ciências",                         label: "Ciências",                         ordem: 1 },
  { categoria: "areas_curso", valor: "Humanidades",                      label: "Humanidades",                      ordem: 2 },
  { categoria: "areas_curso", valor: "Economia",                         label: "Economia",                         ordem: 3 },
  { categoria: "areas_curso", valor: "Artes Visuais",                    label: "Artes Visuais",                    ordem: 4 },
  { categoria: "areas_curso", valor: "Educação Física",                  label: "Educação Física",                  ordem: 5 },
  { categoria: "areas_curso", valor: "Informática",                      label: "Informática",                      ordem: 6 },
  { categoria: "areas_curso", valor: "Agropecuária",                     label: "Agropecuária",                     ordem: 7 },

  // Disciplinas fallback (usadas quando não há disciplinas no curso)
  { categoria: "disciplinas_fallback", valor: "Língua Portuguesa",    label: "Língua Portuguesa",    ordem: 1 },
  { categoria: "disciplinas_fallback", valor: "Matemática",           label: "Matemática",           ordem: 2 },
  { categoria: "disciplinas_fallback", valor: "Ciências da Natureza", label: "Ciências da Natureza", ordem: 3 },
  { categoria: "disciplinas_fallback", valor: "História",             label: "História",             ordem: 4 },
  { categoria: "disciplinas_fallback", valor: "Geografia",            label: "Geografia",            ordem: 5 },
  { categoria: "disciplinas_fallback", valor: "Educação Física",      label: "Educação Física",      ordem: 6 },
  { categoria: "disciplinas_fallback", valor: "Inglês",               label: "Inglês",               ordem: 7 },
  { categoria: "disciplinas_fallback", valor: "Educação Visual",      label: "Educação Visual",      ordem: 8 },
  { categoria: "disciplinas_fallback", valor: "Educação Moral",       label: "Educação Moral",       ordem: 9 },
  { categoria: "disciplinas_fallback", valor: "Física",               label: "Física",               ordem: 10 },
  { categoria: "disciplinas_fallback", valor: "Química",              label: "Química",              ordem: 11 },
  { categoria: "disciplinas_fallback", valor: "Biologia",             label: "Biologia",             ordem: 12 },
];

// ── ANOS ACADÉMICOS ──────────────────────────────────────────────────────────
const ANOS_ACADEMICOS = [
  {
    id: "aa-2024-2025",
    ano: "2024-2025",
    dataInicio: "2024-09-01",
    dataFim: "2025-07-31",
    ativo: false,
    trimestres: JSON.stringify([
      { numero: 1, nome: "1º Trimestre", inicio: "2024-09-01", fim: "2024-12-15" },
      { numero: 2, nome: "2º Trimestre", inicio: "2025-01-06", fim: "2025-03-31" },
      { numero: 3, nome: "3º Trimestre", inicio: "2025-04-07", fim: "2025-07-15" },
    ]),
    epocasExame: JSON.stringify({
      normal:   { dataInicio: "2025-06-16", dataFim: "2025-06-30", observacoes: "Época Normal" },
      recurso:  { dataInicio: "2025-07-07", dataFim: "2025-07-15", observacoes: "Época de Recurso" },
      especial: { dataInicio: "", dataFim: "", observacoes: "" },
    }),
  },
  {
    id: "aa-2025-2026",
    ano: "2025/2026",
    dataInicio: "2025-09-01",
    dataFim: "2026-07-31",
    ativo: true,
    trimestres: JSON.stringify([
      { numero: 1, nome: "1º Trimestre", inicio: "2025-09-01", fim: "2025-12-15" },
      { numero: 2, nome: "2º Trimestre", inicio: "2026-01-06", fim: "2026-03-31" },
      { numero: 3, nome: "3º Trimestre", inicio: "2026-04-07", fim: "2026-07-15" },
    ]),
    epocasExame: JSON.stringify({
      normal:   { dataInicio: "2026-06-16", dataFim: "2026-06-30", observacoes: "Época Normal" },
      recurso:  { dataInicio: "2026-07-07", dataFim: "2026-07-15", observacoes: "Época de Recurso" },
      especial: { dataInicio: "", dataFim: "", observacoes: "" },
    }),
  },
];

// ── UTILIZADORES BASE ────────────────────────────────────────────────────────
const _adminEmail    = process.env.SEED_ADMIN_EMAIL       || "admin@sige.ao";
const _domain        = _adminEmail.includes("@") ? _adminEmail.split("@")[1] : "sige.ao";
const _adminPwd      = process.env.SEED_ADMIN_PASSWORD    || "Admin@2025";
const _ceoPwd        = process.env.SEED_CEO_PASSWORD      || "Ceo@2025";
const _directorPwd   = process.env.SEED_DIRECTOR_PASSWORD || "Director@2025";
const _encPwd        = process.env.SEED_ENC_PASSWORD      || "Enc@2025";
const _pcaPwd        = process.env.SEED_PCA_PASSWORD      || "PCA@2025";
const _profPwd       = process.env.SEED_PROF_PASSWORD     || "Prof@2025";
const _escolaNome    = process.env.ESCOLA_NOME            || "Escola SIGA";

const UTILIZADORES = [
  { id: "5f50cc2d-84be-4202-8167-2cc7b8862eda", nome: "Administrador do Sistema", email: _adminEmail,              senha: _adminPwd,    role: "admin",       escola: _escolaNome },
  { id: "03005167-7173-49fd-b587-1947ace982bd", nome: "CEO Escolar",              email: `ceo@${_domain}`,         senha: _ceoPwd,      role: "ceo",         escola: "" },
  { id: "3e8fafbe-66b8-4f2a-8d7a-0572698b9fea", nome: "Subdirector Pedagógico",  email: `subdirector@${_domain}`, senha: _directorPwd, role: "director",    escola: _escolaNome },
  { id: "d1rec702-0000-4000-a000-000000000001", nome: "Director",                email: `director@${_domain}`,    senha: _directorPwd, role: "director",    escola: _escolaNome },
  { id: "329d8b64-dbb9-4309-88a4-b72fbe72efea", nome: "Encarregado de Educação", email: `encarregado@${_domain}`, senha: _encPwd,      role: "encarregado", escola: _escolaNome },
  { id: "a65cf916-e5c1-452f-86c5-22c9744a042c", nome: "PCA Escolar",              email: `pca@${_domain}`,         senha: _pcaPwd,      role: "pca",         escola: _escolaNome },
  { id: "285cafb9-076a-47af-ae22-ef47b65c5268", nome: "Professor Exemplo",        email: `professor@${_domain}`,   senha: _profPwd,     role: "professor",   escola: _escolaNome },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. lookup_items — apaga e re-insere por categoria para manter a tabela limpa
    console.log("→ A aplicar lookup_items...");
    const categorias = [...new Set(LOOKUP_ITEMS.map(i => i.categoria))];
    for (const cat of categorias) {
      await client.query(`DELETE FROM public.lookup_items WHERE categoria = $1`, [cat]);
    }
    for (const item of LOOKUP_ITEMS) {
      await client.query(
        `INSERT INTO public.lookup_items (categoria, valor, label, ordem, ativo)
         VALUES ($1, $2, $3, $4, true)`,
        [item.categoria, item.valor, item.label, item.ordem]
      );
    }
    console.log(`   ✓ ${LOOKUP_ITEMS.length} lookup_items inseridos`);

    // 2. anos_academicos
    console.log("→ A aplicar anos_academicos...");
    for (const a of ANOS_ACADEMICOS) {
      await client.query(
        `INSERT INTO public.anos_academicos (id, ano, "dataInicio", "dataFim", ativo, trimestres, "epocasExame")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           ano = EXCLUDED.ano,
           "dataInicio" = EXCLUDED."dataInicio",
           "dataFim" = EXCLUDED."dataFim",
           ativo = EXCLUDED.ativo,
           trimestres = EXCLUDED.trimestres,
           "epocasExame" = EXCLUDED."epocasExame"`,
        [a.id, a.ano, a.dataInicio, a.dataFim, a.ativo, a.trimestres, a.epocasExame]
      );
    }
    console.log(`   ✓ ${ANOS_ACADEMICOS.length} anos_academicos inseridos/actualizados`);

    // 3. utilizadores base
    console.log("→ A aplicar utilizadores base...");
    for (const u of UTILIZADORES) {
      await client.query('SAVEPOINT sp_utilizador');
      try {
        await client.query(
          `INSERT INTO public.utilizadores (id, nome, email, senha, role, escola, ativo)
           VALUES ($1,$2,$3,$4,$5,$6,true)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, u.nome, u.email, u.senha, u.role, u.escola]
        );
        await client.query('RELEASE SAVEPOINT sp_utilizador');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_utilizador');
        if (e.code !== '23505') throw e;
      }
    }
    console.log(`   ✓ ${UTILIZADORES.length} utilizadores verificados (duplicados ignorados)`);

    // 4. solicitacoes_documentos de teste (apenas se a tabela existir e os alunos de seed existirem)
    console.log("→ A verificar solicitacoes_documentos de teste...");
    try {
      const alunoCheck = await client.query(
        `SELECT id FROM public.alunos WHERE id IN ('aluno-final-001','aluno-icilo-001','aluno-prim-001') LIMIT 1`
      );
      if (alunoCheck.rows.length > 0) {
        const SOLIC_TESTE = [
          { id: 'sol-teste-001', alunoId: 'aluno-final-001', tipo: 'Certificado de Notas',          motivo: 'Bolsa de Estudo',   observacao: 'Urgente — prazo até final do mês', status: 'pendente' },
          { id: 'sol-teste-002', alunoId: 'aluno-icilo-001', tipo: 'Declaração de Matrícula',       motivo: 'Visita de Estudo',  observacao: '',                                status: 'pendente' },
          { id: 'sol-teste-003', alunoId: 'aluno-prim-001',  tipo: 'Certificado de Frequência',     motivo: 'Emprego',           observacao: '',                                status: 'em_processamento' },
        ];
        const now = new Date().toISOString();
        for (const s of SOLIC_TESTE) {
          await client.query(
            `INSERT INTO public.solicitacoes_documentos
               (id, "alunoId", tipo, motivo, observacao, status, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               tipo      = EXCLUDED.tipo,
               status    = CASE WHEN solicitacoes_documentos.status = 'concluido' THEN 'pendente' ELSE solicitacoes_documentos.status END,
               "updatedAt" = EXCLUDED."updatedAt"`,
            [s.id, s.alunoId, s.tipo, s.motivo, s.observacao, s.status, now, now]
          );
        }
        console.log(`   ✓ ${SOLIC_TESTE.length} solicitacoes_documentos de teste inseridas/actualizadas`);
      } else {
        console.log('   ⚠ Alunos de teste não encontrados — solicitações ignoradas');
      }
    } catch (e) {
      console.log('   ⚠ solicitacoes_documentos não disponível:', e.message);
    }

    await client.query("COMMIT");
    console.log("\n✅ Seed completo aplicado com sucesso!");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro no seed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
