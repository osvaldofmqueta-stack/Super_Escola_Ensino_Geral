/**
 * migrate-seed.ts — Script de migração e seed autónomo
 *
 * Executa todas as migrações DDL necessárias e semeia dados de sistema
 * na base de dados Neon. Pode ser invocado directamente:
 *
 *   npx tsx server/migrate-seed.ts
 *
 * As mesmas operações também são executadas automaticamente ao iniciar o servidor.
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool, query } from './db';

async function run() {
  console.log('=== SIGA — Migração e Seed ===');
  console.log('Base de dados:', process.env.NEON_DATABASE_URL ? 'Neon (NEON_DATABASE_URL)' : 'DATABASE_URL');

  // ── 1. VERIFICAR LIGAÇÃO ─────────────────────────────────────────────────────
  try {
    await query('SELECT 1', []);
    console.log('[OK] Ligação à base de dados estabelecida.');
  } catch (e) {
    console.error('[ERRO] Não foi possível ligar à base de dados:', (e as Error).message);
    process.exit(1);
  }

  // ── 2. GARANTIR TABELAS BASE ─────────────────────────────────────────────────
  // As tabelas principais já existem se o servidor arrancar uma vez (supabase-db.sql).
  // Este script garante as tabelas e colunas adicionais.

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: 'registros — origemInscricao',
      sql: `ALTER TABLE public.registros ADD COLUMN IF NOT EXISTS "origemInscricao" varchar NOT NULL DEFAULT 'presencial'`,
    },
    {
      name: 'utilizadores — departamento + cargo',
      sql: `ALTER TABLE public.utilizadores
              ADD COLUMN IF NOT EXISTS departamento text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS cargo text NOT NULL DEFAULT ''`,
    },
    {
      name: 'alunos — utilizadorId',
      sql: `ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS "utilizadorId" varchar`,
    },
    {
      name: 'alunos — permitirAcessoComPendencia',
      sql: `ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS "permitirAcessoComPendencia" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'alunos — publicarNotas',
      sql: `ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS "publicarNotas" boolean NOT NULL DEFAULT true`,
    },
    {
      name: 'alunos — bloqueioRenovacao',
      sql: `ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS "bloqueioRenovacao" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'alunos — motivoBloqueioRenovacao',
      sql: `ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS "motivoBloqueioRenovacao" text NOT NULL DEFAULT ''`,
    },
    {
      name: 'professores — utilizadorId',
      sql: `ALTER TABLE public.professores ADD COLUMN IF NOT EXISTS "utilizadorId" varchar`,
    },
    {
      name: 'notas — lancado',
      sql: `ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS "lancado" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'notas — anoLetivo',
      sql: `ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS "anoLetivo" text NOT NULL DEFAULT ''`,
    },
    {
      name: 'notas — aval5-8',
      sql: `ALTER TABLE public.notas
              ADD COLUMN IF NOT EXISTS aval5 real NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS aval6 real NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS aval7 real NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS aval8 real NOT NULL DEFAULT 0`,
    },
    {
      name: 'notas — camposAbertos + pedidosReabertura',
      sql: `ALTER TABLE public.notas
              ADD COLUMN IF NOT EXISTS "camposAbertos" jsonb NOT NULL DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS "pedidosReabertura" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    },
    {
      name: 'turmas — faltasBloqueadas',
      sql: `ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS "faltasBloqueadas" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'disciplinas — componente',
      sql: `ALTER TABLE public.disciplinas ADD COLUMN IF NOT EXISTS componente TEXT NOT NULL DEFAULT ''`,
    },
    {
      name: 'config_geral — notasVisiveis',
      sql: `ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "notasVisiveis" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'config_geral — periodosHorario + ultimoBackup',
      sql: `ALTER TABLE public.config_geral
              ADD COLUMN IF NOT EXISTS "periodosHorario" jsonb,
              ADD COLUMN IF NOT EXISTS "ultimoBackup" text`,
    },
    {
      name: 'cursos — cargaHoraria + duracao + ementa + portaria',
      sql: `ALTER TABLE public.cursos
              ADD COLUMN IF NOT EXISTS "cargaHoraria" integer NOT NULL DEFAULT 0,
              ADD COLUMN IF NOT EXISTS "duracao" text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS "ementa" text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS "portaria" text NOT NULL DEFAULT ''`,
    },
    {
      name: 'curso_disciplinas — removida',
      sql: `ALTER TABLE public.curso_disciplinas ADD COLUMN IF NOT EXISTS "removida" boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'livros — capaUrl',
      sql: `ALTER TABLE public.livros ADD COLUMN IF NOT EXISTS "capaUrl" text NOT NULL DEFAULT ''`,
    },
    {
      name: 'notificacoes — utilizadorId',
      sql: `ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS "utilizadorId" varchar`,
    },
    {
      name: 'funcionarios — bi + nif + telefone + email',
      sql: `ALTER TABLE public.funcionarios
              ADD COLUMN IF NOT EXISTS bi text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS nif text NOT NULL DEFAULT '',
              ADD COLUMN IF NOT EXISTS "dataAdmissao" text NOT NULL DEFAULT ''`,
    },
    {
      name: 'disciplinas — nuclear',
      sql: `ALTER TABLE public.disciplinas ADD COLUMN IF NOT EXISTS nuclear boolean NOT NULL DEFAULT false`,
    },
    {
      name: 'config_geral — maxDeficienciasAprovacao',
      sql: `ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "maxDeficienciasAprovacao" integer NOT NULL DEFAULT 0`,
    },
  ];

  for (const m of migrations) {
    try {
      await query(m.sql, []);
      console.log(`[migração] ${m.name} — OK`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('already exists') || msg.includes('duplicate column') || msg.includes('column') && msg.includes('already')) {
        console.log(`[migração] ${m.name} — já existe`);
      } else {
        console.warn(`[migração] ${m.name} — aviso:`, msg);
      }
    }
  }

  // ── 3. CRIAR TABELAS EXTRA ───────────────────────────────────────────────────
  const createTables: Array<{ name: string; sql: string }> = [
    {
      name: 'plano_contas',
      sql: `CREATE TABLE IF NOT EXISTS public.plano_contas (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo text NOT NULL,
        nome text NOT NULL,
        tipo text NOT NULL,
        "parentId" varchar,
        descricao text NOT NULL DEFAULT '',
        ativo boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'contas_pagar',
      sql: `CREATE TABLE IF NOT EXISTS public.contas_pagar (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        descricao text NOT NULL,
        fornecedor text NOT NULL DEFAULT '',
        valor real NOT NULL,
        "dataVencimento" text NOT NULL,
        "dataPagamento" text,
        status text NOT NULL DEFAULT 'pendente',
        "metodoPagamento" text,
        "planoContaId" varchar,
        referencia text,
        comprovante text,
        observacao text,
        "registadoPor" text NOT NULL DEFAULT 'Sistema',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'feriados',
      sql: `CREATE TABLE IF NOT EXISTS public.feriados (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        data text NOT NULL,
        tipo text NOT NULL DEFAULT 'nacional',
        recorrente boolean NOT NULL DEFAULT true,
        ativo boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`,
    },
  ];

  for (const t of createTables) {
    try {
      await query(t.sql, []);
      console.log(`[tabela] ${t.name} — garantida`);
    } catch (e) {
      console.warn(`[tabela] ${t.name}:`, (e as Error).message);
    }
  }

  // ── 4. SEED — CONTAS DE SISTEMA ──────────────────────────────────────────────
  console.log('\n[seed] A garantir contas de sistema na base de dados...');
  const SYSTEM_ACCOUNTS = [
    { id: 'usr_ceo',            email: 'ceo@sige.ao',         senha: 'Queta@Admin2025!', nome: 'Administrador QUETA',         role: 'ceo',        escola: 'Super Escola' },
    { id: 'usr_financeiro_001', email: 'financeiro@sige.ao', senha: 'Queta@Fin2025!',  nome: 'Gestor Financeiro',           role: 'financeiro', escola: 'Super Escola' },
    { id: 'usr_secretaria_001', email: 'secretaria@sige.ao', senha: 'Queta@Sec2025!',  nome: 'Secretária Académica',        role: 'secretaria', escola: 'Super Escola' },
    { id: 'usr_rh_001',         email: 'rh@sige.ao',         senha: 'Queta@RH2025!',   nome: 'Gestor de Recursos Humanos',  role: 'rh',         escola: 'Super Escola' },
  ];

  for (const acc of SYSTEM_ACCOUNTS) {
    try {
      await query(
        `INSERT INTO public.utilizadores (id, nome, email, senha, role, escola, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (email) DO NOTHING`,
        [acc.id, acc.nome, acc.email, acc.senha, acc.role, acc.escola]
      );
      console.log(`[seed] ${acc.email} (${acc.role}) — OK`);
    } catch (e) {
      console.warn(`[seed] ${acc.email}:`, (e as Error).message);
    }
  }

  // ── 5. SEED — FERIADOS NACIONAIS DE ANGOLA ───────────────────────────────────
  try {
    const count = await query<{ c: string }>(`SELECT COUNT(*) as c FROM public.feriados`, []);
    if (parseInt(count[0]?.c ?? '0') === 0) {
      console.log('[seed] A semear feriados nacionais de Angola...');
      const feriados = [
        { nome: 'Ano Novo', data: '01-01' },
        { nome: 'Dia do Mártir', data: '01-04' },
        { nome: 'Dia do Início da Luta Armada', data: '02-04' },
        { nome: 'Dia Internacional da Mulher', data: '03-08' },
        { nome: 'Dia da Paz e Reconciliação Nacional', data: '04-04' },
        { nome: 'Dia do Trabalhador', data: '05-01' },
        { nome: 'Dia da África', data: '05-25' },
        { nome: 'Dia das Crianças', data: '06-01' },
        { nome: 'Dia dos Heróis Nacionais', data: '09-17' },
        { nome: 'Dia da Independência Nacional', data: '11-11' },
        { nome: 'Natal', data: '12-25' },
      ];
      for (const f of feriados) {
        const ano = new Date().getFullYear();
        await query(
          `INSERT INTO public.feriados (id, nome, data, tipo, recorrente, ativo) VALUES (gen_random_uuid(),$1,$2,'nacional',true,true)`,
          [f.nome, `${ano}-${f.data}`]
        );
      }
      console.log(`[seed] ${feriados.length} feriados semeados.`);
    } else {
      console.log('[seed] Feriados já existem — ignorado.');
    }
  } catch (e) {
    console.warn('[seed] feriados:', (e as Error).message);
  }

  // ── 5b. DEDUPLICAÇÃO — config_geral (garantir apenas uma linha) ──────────────
  try {
    const dupCheck = await query<{ c: string }>(`SELECT COUNT(*) as c FROM public.config_geral`, []);
    const dupCount = parseInt(dupCheck[0]?.c ?? '0');
    if (dupCount > 1) {
      console.warn(`[migration] config_geral tem ${dupCount} linhas duplicadas — a eliminar extras (mantém id ASC).`);
      // Mantém a primeira linha (ORDER BY id ASC) e elimina as restantes
      await query(
        `DELETE FROM public.config_geral WHERE id NOT IN (SELECT id FROM public.config_geral ORDER BY id ASC LIMIT 1)`,
        []
      );
      console.log('[migration] config_geral deduplicada — ficou 1 linha.');
    }
  } catch (e) {
    console.warn('[migration] config_geral dedup:', (e as Error).message);
  }

  // ── 6. SEED — config_geral (linha inicial se vazia) ──────────────────────────
  try {
    const cfg = await query<{ c: string }>(`SELECT COUNT(*) as c FROM public.config_geral`, []);
    if (parseInt(cfg[0]?.c ?? '0') === 0) {
      console.log('[seed] A criar configuração inicial da escola...');
      await query(
        `INSERT INTO public.config_geral (
           id, "nomeEscola", "logoUrl", "pp1Habilitado", "pptHabilitado",
           "notaMinimaAprovacao", "maxAlunosTurma", "numAvaliacoes",
           "macMin", "macMax", "inscricoesAbertas", "propinaHabilitada",
           "exameAntecipadoHabilitado", "exclusaoDuasReprovacoes", "papHabilitado",
           "estagioComoDisciplina", "notasVisiveis"
         ) VALUES (
           gen_random_uuid(), 'Super Escola', '', true, true,
           10, 40, 4,
           0, 20, false, true,
           false, false, false,
           false, false
         )`,
        []
      );
      console.log('[seed] config_geral criada.');
    } else {
      console.log('[seed] config_geral já existe — ignorada.');
    }
  } catch (e) {
    console.warn('[seed] config_geral:', (e as Error).message);
  }

  // ── 7. AUTO-LINK alunos.utilizadorId ─────────────────────────────────────────
  try {
    const r = await query<{ c: string }>(
      `UPDATE public.alunos a
       SET "utilizadorId" = u.id
       FROM public.utilizadores u
       WHERE u."alunoId" = a.id
         AND u.role = 'aluno'
         AND (a."utilizadorId" IS NULL OR a."utilizadorId" = '')
       RETURNING a.id`,
      []
    );
    if (r.length > 0) console.log(`[link] ${r.length} aluno(s) ligado(s) a utilizadores.`);
  } catch (e) {
    console.warn('[link] alunos.utilizadorId:', (e as Error).message);
  }

  // ── RESUMO ───────────────────────────────────────────────────────────────────
  console.log('\n=== Concluído ===');
  const tables = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
    []
  );
  const accounts = await query<{ email: string; role: string }>(
    `SELECT email, role FROM public.utilizadores ORDER BY role, email`,
    []
  );
  console.log(`Tabelas na base de dados: ${tables.length}`);
  console.log('Contas de utilizador:');
  for (const a of accounts) console.log(`  ${a.role.padEnd(12)} ${a.email}`);

  await pool.end();
}

run().catch(e => {
  console.error('[ERRO FATAL]', e);
  process.exit(1);
});
