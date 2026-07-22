#!/usr/bin/env node
/**
 * seed-mapa-aproveitamento.js
 *
 * Seeds:
 *  1. Adds trimestre 3 notes to existing 13ª GI-A students (MT3 completion)
 *  2. Creates 10ª, 11ª, 12ª GI turmas with students + full 3-trimestre notes
 *  3. Creates "Produção Vegetal" course with 10ª–13ª turmas + students + full notes
 *
 * Run: node scripts/seed-mapa-aproveitamento.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.NEON_DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const ANO = '2025-2026';
const DEFAULT_PROF_ID = 'p-ana';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function nota(min = 10, max = 20) { return rnd(min, max); }
function notaFraca() { return rnd(7, 9); }

const NOMES_M = ['António','Bernardo','Carlos','Domingos','Eduardo','Francisco','Geraldo','Hélio','Ismael','José','Kilamba','Luís','Manuel','Nuno','Osvaldo','Paulo','Ricardo','Sandro','Tiago','Ulisses','Valter','Wando','Xavier','Yuri','Zacarias'];
const NOMES_F = ['Ana','Beatriz','Carla','Débora','Elisa','Filipa','Graça','Helena','Inês','Joana','Karina','Lídia','Maria','Nádia','Olga','Paula','Raquel','Sandra','Teresa','Ursola','Vânia','Wanda','Xénia','Yara','Zita'];
const APELIDOS = ['Baptista','Cardoso','da Silva','de Almeida','dos Santos','Fernandes','Gonçalves','Lopes','Marques','Mendes','Neto','Oliveira','Pereira','Ramos','Rodrigues','Sousa','Teixeira','Tomás','Valente','Xavier'];

let alunoSeq = 9000;
function makeAluno(turmaId, cursoId, genero) {
  const nome = genero === 'M' ? NOMES_M[rnd(0, NOMES_M.length - 1)] : NOMES_F[rnd(0, NOMES_F.length - 1)];
  const apelido = APELIDOS[rnd(0, APELIDOS.length - 1)];
  alunoSeq++;
  const yr = rnd(2000, 2008);
  const mon = String(rnd(1, 12)).padStart(2, '0');
  const day = String(rnd(1, 28)).padStart(2, '0');
  return {
    id: uuidv4(),
    numeroMatricula: `MTR-${String(alunoSeq).padStart(4, '0')}`,
    nome, apelido, genero, turmaId, cursoId,
    dataNascimento: `${yr}-${mon}-${day}`,
  };
}

// ─── GI Disciplines ───────────────────────────────────────────────────────────
const GI_DISCS = [
  { id: 'd-lp',   nome: 'Língua Portuguesa' },
  { id: 'd-mat',  nome: 'Matemática' },
  { id: 'd-ingt', nome: 'Inglês Técnico' },
  { id: 'd-ef',   nome: 'Educação Física' },
  { id: 'd-info', nome: 'Informática de Gestão' },
  { id: 'd-cont', nome: 'Contabilidade Geral' },
  { id: 'd-eco',  nome: 'Economia' },
  { id: 'd-prog', nome: 'Programação' },
  { id: 'd-si',   nome: 'Sistemas de Informação' },
  { id: 'd-bd',   nome: 'Bases de Dados' },
];

// ─── PV Disciplines (shared names resolved at runtime) ────────────────────────
// Names that already exist in GI will reuse existing IDs
const PV_DISCS_SEED = [
  { id: 'pv-lp',   nome: 'Língua Portuguesa',  shared: true },
  { id: 'pv-mat',  nome: 'Matemática',           shared: true },
  { id: 'pv-ing',  nome: 'Inglês Técnico',       shared: true }, // reuse d-ingt
  { id: 'pv-ef',   nome: 'Educação Física',      shared: true },
  { id: 'pv-pv',   nome: 'Produção Vegetal',     shared: false },
  { id: 'pv-ag',   nome: 'Agricultura Geral',    shared: false },
  { id: 'pv-bot',  nome: 'Botânica Agrícola',    shared: false },
  { id: 'pv-solo', nome: 'Solo e Fertilidade',   shared: false },
  { id: 'pv-mec',  nome: 'Mecanização Agrícola', shared: false },
  { id: 'pv-irr',  nome: 'Irrigação e Drenagem', shared: false },
  { id: 'pv-zoo',  nome: 'Zootecnia',             shared: false },
];
let PV_DISCS = []; // resolved at runtime

// ─── Build full T1+T2+T3 notas ───────────────────────────────────────────────
function buildNotas(alunoId, turmaId, discs, aprovado = true) {
  const rows = [];
  for (const disc of discs) {
    for (let t = 1; t <= 3; t++) {
      const mt = aprovado
        ? (Math.random() < 0.85 ? nota(10, 20) : nota(10, 14))
        : (Math.random() < 0.4  ? nota(10, 20) : notaFraca());
      rows.push({ id: uuidv4(), alunoId, turmaId, disciplina: disc.nome, trimestre: t, mt1: mt, nf: mt });
    }
  }
  return rows;
}

// ─── Build ONLY T3 notas ─────────────────────────────────────────────────────
function buildT3Notas(alunoId, turmaId, discs) {
  return discs.map(disc => ({
    id: uuidv4(), alunoId, turmaId,
    disciplina: disc.nome, trimestre: 3,
    mt1: nota(10, 20), nf: nota(10, 20),
  }));
}

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function insertNota(client, n) {
  await client.query(
    `INSERT INTO public.notas
       (id,"alunoId","turmaId",disciplina,trimestre,mt1,nf,"anoLetivo",lancado,"professorId",data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,CURRENT_DATE)
     ON CONFLICT DO NOTHING`,
    [n.id, n.alunoId, n.turmaId, n.disciplina, n.trimestre, n.mt1, n.nf, ANO, DEFAULT_PROF_ID]
  );
}

async function insertAluno(client, a) {
  await client.query(
    `INSERT INTO public.alunos
       (id,"numeroMatricula",nome,apelido,"dataNascimento",genero,provincia,municipio,
        "turmaId","cursoId",ativo,bloqueado,falecido,
        "nomeEncarregado","telefoneEncarregado",
        "nomePai","nomeMae","numeroBi","numeroCedula",
        "biDataEmissao","biLocalEmissao",
        "encarregadoProfissao","encarregadoLocalTrabalho","encarregadoResidencia","encarregadoContacto2",
        situacao,"dataSituacao","motivoSituacao","registadoSituacaoPor",
        "permitirAcessoComPendencia","publicarNotas","bloqueioRenovacao","motivoBloqueioRenovacao")
     VALUES
       ($1,$2,$3,$4,$5,$6,'Luanda','Luanda',
        $7,$8,true,false,false,
        'Encarregado','000000000',
        'Pai Desconhecido','Mãe Desconhecida','0000000','0000000',
        '2000-01-01','Luanda',
        'Sem Profissão','Sem Local','Luanda','000000001',
        'activo',NOW(),'','',
        false,true,false,'')
     ON CONFLICT (id) DO NOTHING`,
    [a.id, a.numeroMatricula, a.nome, a.apelido, a.dataNascimento, a.genero, a.turmaId, a.cursoId]
  );
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ═══════════════════════════════════════════════════════════
    // 1. 13ª GI-A — add T3 notes + mark all as lancado=true
    // ═══════════════════════════════════════════════════════════
    console.log('1. Fixing 13ª GI-A — adding MT3 notes + marking all as lancado...');
    await client.query(`UPDATE public.notas SET lancado=true WHERE "turmaId"='t-13gi'`);

    const existing13 = await client.query(
      `SELECT id FROM public.alunos WHERE "turmaId"='t-13gi' AND ativo=true`
    );
    const t3Exist = await client.query(
      `SELECT DISTINCT "alunoId" FROM public.notas WHERE "turmaId"='t-13gi' AND trimestre=3`
    );
    const hasT3 = new Set(t3Exist.rows.map(r => r.alunoId));

    for (const { id: alunoId } of existing13.rows) {
      if (!hasT3.has(alunoId)) {
        for (const n of buildT3Notas(alunoId, 't-13gi', GI_DISCS)) {
          await insertNota(client, n);
        }
      }
    }
    console.log(`   ✓ MT3 complete for ${existing13.rows.length} students in 13ª GI-A`);

    // ═══════════════════════════════════════════════════════════
    // 2. 10ª, 11ª, 12ª GI turmas + students + full notes
    // ═══════════════════════════════════════════════════════════
    const giTurmas = [
      { id: 'seed-10gi-a', nome: '10ª GI-A', classe: '10ª Classe' },
      { id: 'seed-11gi-a', nome: '11ª GI-A', classe: '11ª Classe' },
      { id: 'seed-12gi-a', nome: '12ª GI-A', classe: '12ª Classe' },
    ];

    for (const turma of giTurmas) {
      console.log(`2. Creating/verifying ${turma.nome}...`);

      await client.query(
        `INSERT INTO public.turmas
           (id,nome,classe,turno,"anoLetivo",nivel,"cursoId",sala,capacidade,ativo,"professoresIds","faltasBloqueadas")
         VALUES ($1,$2,$3,'Manhã',$4,'II Ciclo','curso-gi','Lab. Informática 1',35,true,'[]',false)
         ON CONFLICT (id) DO NOTHING`,
        [turma.id, turma.nome, turma.classe, ANO]
      );

      for (let i = 0; i < GI_DISCS.length; i++) {
        await client.query(
          `INSERT INTO public.turma_disciplinas ("turmaId","disciplinaId","ordem")
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [turma.id, GI_DISCS[i].id, i + 1]
        );
      }

      const existCount = await client.query(
        `SELECT COUNT(*) as cnt FROM public.alunos WHERE "turmaId"=$1`, [turma.id]
      );

      if (parseInt(existCount.rows[0].cnt) < 5) {
        const estudantes = [];
        for (let i = 0; i < 8; i++) estudantes.push(makeAluno(turma.id, 'curso-gi', 'M'));
        for (let i = 0; i < 7; i++) estudantes.push(makeAluno(turma.id, 'curso-gi', 'F'));

        for (const a of estudantes) {
          await insertAluno(client, a);
          const aprovado = Math.random() > 0.15;
          for (const n of buildNotas(a.id, turma.id, GI_DISCS, aprovado)) {
            await insertNota(client, n);
          }
        }
        console.log(`   ✓ Created ${estudantes.length} students + notes for ${turma.nome}`);
      } else {
        const allStudents = await client.query(
          `SELECT id FROM public.alunos WHERE "turmaId"=$1 AND ativo=true`, [turma.id]
        );
        for (const { id: alunoId } of allStudents.rows) {
          const t3c = await client.query(
            `SELECT COUNT(*) as cnt FROM public.notas WHERE "alunoId"=$1 AND "turmaId"=$2 AND trimestre=3`,
            [alunoId, turma.id]
          );
          if (parseInt(t3c.rows[0].cnt) === 0) {
            for (const n of buildT3Notas(alunoId, turma.id, GI_DISCS)) {
              await insertNota(client, n);
            }
          }
        }
        await client.query(`UPDATE public.notas SET lancado=true WHERE "turmaId"=$1`, [turma.id]);
        console.log(`   ✓ Verified existing students in ${turma.nome}`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. Produção Vegetal course + 10ª–13ª turmas + students
    // ═══════════════════════════════════════════════════════════
    console.log('3. Creating Produção Vegetal course...');
    await client.query(
      `INSERT INTO public.cursos
         (id,nome,codigo,"areaFormacao",descricao,ativo,"cargaHoraria",duracao,ementa,portaria)
       VALUES
         ('curso-pv','Produção Vegetal','PV','Agricultura',
          'Curso Técnico de Produção Vegetal — II Ciclo',
          true,1400,'4 anos (10ª–13ª)','','')
       ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, ativo=true`,
    );

    // Resolve PV disciplines: reuse existing IDs for shared names, insert new for unique names
    PV_DISCS = [];
    for (const disc of PV_DISCS_SEED) {
      if (disc.shared) {
        const existing = await client.query(
          `SELECT id FROM public.disciplinas WHERE nome=$1`, [disc.nome]
        );
        if (existing.rows.length > 0) {
          PV_DISCS.push({ id: existing.rows[0].id, nome: disc.nome });
        } else {
          // Insert as new unique disc
          await client.query(
            `INSERT INTO public.disciplinas
               (id,nome,codigo,area,descricao,ativo,tipo,"classeInicio","classeFim","cargaHoraria",obrigatoria,ordem,componente)
             VALUES ($1,$2,$3,'Agricultura','',true,'normal','10ª Classe','13ª Classe',4,true,1,'base')
             ON CONFLICT (nome) DO UPDATE SET id=disciplinas.id RETURNING id`,
            [disc.id, disc.nome, disc.id.toUpperCase()]
          );
          PV_DISCS.push({ id: disc.id, nome: disc.nome });
        }
      } else {
        // PV-specific: insert with unique name
        const r = await client.query(
          `INSERT INTO public.disciplinas
             (id,nome,codigo,area,descricao,ativo,tipo,"classeInicio","classeFim","cargaHoraria",obrigatoria,ordem,componente)
           VALUES ($1,$2,$3,'Agricultura','',true,'normal','10ª Classe','13ª Classe',4,true,1,'base')
           ON CONFLICT (nome) DO UPDATE SET ativo=true RETURNING id`,
          [disc.id, disc.nome, disc.id.toUpperCase()]
        );
        const resolvedId = r.rows.length > 0 ? r.rows[0].id : disc.id;
        PV_DISCS.push({ id: resolvedId, nome: disc.nome });
      }
    }
    console.log('   ✓ PV course + disciplines created/verified:', PV_DISCS.map(d=>d.nome).join(', '));

    const pvTurmas = [
      { id: 'seed-10pv-a', nome: '10ª PV-A', classe: '10ª Classe', nM: 10, nF: 9 },
      { id: 'seed-11pv-a', nome: '11ª PV-A', classe: '11ª Classe', nM: 9,  nF: 8 },
      { id: 'seed-12pv-a', nome: '12ª PV-A', classe: '12ª Classe', nM: 9,  nF: 7 },
      { id: 'seed-13pv-a', nome: '13ª PV-A', classe: '13ª Classe', nM: 8,  nF: 6 },
    ];

    for (const turma of pvTurmas) {
      console.log(`   Creating ${turma.nome}...`);
      await client.query(
        `INSERT INTO public.turmas
           (id,nome,classe,turno,"anoLetivo",nivel,"cursoId",sala,capacidade,ativo,"professoresIds","faltasBloqueadas")
         VALUES ($1,$2,$3,'Manhã',$4,'II Ciclo','curso-pv','Sala B1',35,true,'[]',false)
         ON CONFLICT (id) DO NOTHING`,
        [turma.id, turma.nome, turma.classe, ANO]
      );

      for (let i = 0; i < PV_DISCS.length; i++) {
        await client.query(
          `INSERT INTO public.turma_disciplinas ("turmaId","disciplinaId","ordem")
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [turma.id, PV_DISCS[i].id, i + 1]
        );
      }

      const existCount = await client.query(
        `SELECT COUNT(*) as cnt FROM public.alunos WHERE "turmaId"=$1`, [turma.id]
      );
      if (parseInt(existCount.rows[0].cnt) > 0) {
        await client.query(`UPDATE public.notas SET lancado=true WHERE "turmaId"=$1`, [turma.id]);
        console.log(`   ✓ ${turma.nome} already exists — verified lancado`);
        continue;
      }

      const estudantes = [];
      for (let i = 0; i < turma.nM; i++) estudantes.push(makeAluno(turma.id, 'curso-pv', 'M'));
      for (let i = 0; i < turma.nF; i++) estudantes.push(makeAluno(turma.id, 'curso-pv', 'F'));

      let created = 0;
      for (const a of estudantes) {
        await insertAluno(client, a);
        const aprovado = Math.random() > 0.18;
        for (const n of buildNotas(a.id, turma.id, PV_DISCS, aprovado)) {
          await insertNota(client, n);
        }
        created++;
      }
      console.log(`   ✓ Created ${created} students + notes for ${turma.nome}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seed completed successfully!');
    console.log('   — 13ª GI-A: MT3 complete + all lancado=true');
    console.log('   — 10ª/11ª/12ª GI-A: created with full 3-trimestre notes');
    console.log('   — Produção Vegetal: 10ª–13ª PV-A with students + notes');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
