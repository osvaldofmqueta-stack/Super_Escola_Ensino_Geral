/**
 * SIGA — Seed de dados de amostra
 * ─────────────────────────────────
 * Insere dados mínimos para demonstração da Consulta de Aluno:
 *  • 1 Ano Académico (2025/2026)
 *  • 3 Turmas (10ª, 11ª, 12ª classe)
 *  • 12 Alunos distribuídos pelas turmas
 *  • Notas dos 3 trimestres
 *  • Pagamentos (mistura pago/pendente)
 *  • Presenças
 *
 * Uso: node scripts/seed-amostra.js
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const sep = t.indexOf('=');
    if (sep <= 0) continue;
    const k = t.slice(0, sep).trim();
    const v = t.slice(sep + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('ERRO: DATABASE_URL não definida.'); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const uid = () => crypto.randomUUID();
const ANO = '2025/2026';
const HOJE = new Date().toISOString().slice(0, 10);

const NOMES_M = ['João', 'Pedro', 'António', 'Manuel', 'Carlos', 'Miguel', 'David', 'Rafael'];
const NOMES_F = ['Maria', 'Ana', 'Sofia', 'Catarina', 'Esperança', 'Graça', 'Beatriz', 'Helena'];
const APELIDOS = ['Silva', 'Costa', 'Santos', 'Ferreira', 'Oliveira', 'Pereira', 'Neves', 'Cunha', 'Monteiro', 'Tavares', 'Lopes', 'Rodrigues'];
const PROV = 'Luanda';
const MUNS = ['Luanda', 'Viana', 'Belas', 'Cacuaco', 'Cazenga'];
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const DISCIPLINAS_10 = ['Língua Portuguesa', 'Matemática', 'Inglês', 'História', 'Biologia', 'Física', 'Química', 'Educação Física'];
const DISCIPLINAS_11 = ['Língua Portuguesa', 'Matemática', 'Inglês', 'Geografia', 'Biologia', 'Física', 'Filosofia', 'Educação Física'];
const DISCIPLINAS_12 = ['Língua Portuguesa', 'Matemática', 'Inglês', 'História', 'Biologia', 'Filosofia', 'Educação Cívica', 'Educação Física'];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Ano Académico ──────────────────────────────────────────────────────────
    const anoId = uid();
    await client.query(`
      INSERT INTO public.anos_academicos (id, ano, ativo, "dataInicio", "dataFim", trimestres)
      VALUES ($1, $2, true, '2025-09-01', '2026-07-31', '[]'::jsonb)
      ON CONFLICT DO NOTHING
    `, [anoId, ANO]);
    console.log('✓ Ano académico 2025/2026');

    // ── Turmas ────────────────────────────────────────────────────────────────
    const turmaA = uid(), turmaB = uid(), turmaC = uid();
    const turmas = [
      { id: turmaA, nome: '10ª A', classe: '10ª Classe', turno: 'Manhã', nivel: 'II Ciclo', discs: DISCIPLINAS_10 },
      { id: turmaB, nome: '11ª B', classe: '11ª Classe', turno: 'Tarde',  nivel: 'II Ciclo', discs: DISCIPLINAS_11 },
      { id: turmaC, nome: '12ª C', classe: '12ª Classe', turno: 'Manhã', nivel: 'II Ciclo', discs: DISCIPLINAS_12 },
    ];
    for (const t of turmas) {
      await client.query(`
        INSERT INTO public.turmas (id, nome, classe, turno, nivel, "anoLetivo", sala, capacidade, ativo, "faltasBloqueadas")
        VALUES ($1, $2, $3, $4, $5, $6, 'Sala 1', 35, true, false)
        ON CONFLICT DO NOTHING
      `, [t.id, t.nome, t.classe, t.turno, t.nivel, ANO]);
    }
    console.log('✓ 3 turmas criadas');

    // ── Taxa de Propina ────────────────────────────────────────────────────────
    let taxaId;
    const taxaRes = await client.query(`SELECT id FROM public.taxas WHERE tipo='propina' LIMIT 1`);
    if (taxaRes.rows.length > 0) {
      taxaId = taxaRes.rows[0].id;
      console.log('✓ Usando taxa de propina existente');
    } else {
      taxaId = uid();
      await client.query(`
        INSERT INTO public.taxas (id, descricao, tipo, valor, "anoAcademico", frequencia, nivel, ativo)
        VALUES ($1, 'Propina Mensal', 'propina', 15000, $2, 'mensal', 'II Ciclo', true)
      `, [taxaId, ANO]);
      console.log('✓ Taxa de propina criada');
    }

    // ── Alunos ────────────────────────────────────────────────────────────────
    let matCounter = 3001;
    const alunos = [];

    const gerarAluno = (turmaId) => {
      const genero = Math.random() < 0.5 ? 'M' : 'F';
      const isM = genero === 'M';
      const nome = rnd(isM ? NOMES_M : NOMES_F);
      const apelido = rnd(APELIDOS);
      const anoNasc = rndInt(2000, 2008);
      const mesNasc = String(rndInt(1, 12)).padStart(2, '0');
      const diaNasc = String(rndInt(1, 28)).padStart(2, '0');
      return {
        id: uid(),
        numeroMatricula: String(matCounter++),
        nome, apelido, genero,
        dataNascimento: `${anoNasc}-${mesNasc}-${diaNasc}`,
        provincia: PROV,
        municipio: rnd(MUNS),
        turmaId,
        numeroBi: `${rndInt(100000000, 999999999)}LA0${rndInt(10, 99)}`,
        nomeEncarregado: `${rnd(['António', 'José', 'Manuel', 'Filomena', 'Maria'])} ${apelido}`,
        telefoneEncarregado: `+244 9${rndInt(10, 99)} ${rndInt(100, 999)} ${rndInt(100, 999)}`,
      };
    };

    for (const t of turmas) {
      for (let i = 0; i < 4; i++) {
        alunos.push(gerarAluno(t.id));
      }
    }

    for (const a of alunos) {
      await client.query(`
        INSERT INTO public.alunos (
          id, "numeroMatricula", nome, apelido, genero, "dataNascimento",
          provincia, municipio, "turmaId", "numeroBi",
          "nomeEncarregado", "telefoneEncarregado",
          ativo, bloqueado, "permitirAcessoComPendencia", "publicarNotas",
          falecido, situacao, "dataSituacao", "motivoSituacao", "registadoSituacaoPor",
          "bloqueioRenovacao", "motivoBloqueioRenovacao"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          true,false,false,true,false,'activo','','',''
          ,false,''
        ) ON CONFLICT DO NOTHING
      `, [
        a.id, a.numeroMatricula, a.nome, a.apelido, a.genero, a.dataNascimento,
        a.provincia, a.municipio, a.turmaId, a.numeroBi,
        a.nomeEncarregado, a.telefoneEncarregado,
      ]);
    }
    console.log(`✓ ${alunos.length} alunos criados`);

    // ── Professor de referência ───────────────────────────────────────────────
    const profRes = await client.query(`SELECT id FROM public.professores LIMIT 1`);
    const profId = profRes.rows[0]?.id || null;
    if (!profId) { console.log('⚠ Nenhum professor encontrado — a ignorar notas.'); }

    // ── Notas (3 trimestres) ──────────────────────────────────────────────────
    let notasCount = 0;
    if (profId) {
      for (const a of alunos) {
        const turma = turmas.find(t => t.id === a.turmaId);
        if (!turma) continue;
        for (const disc of turma.discs) {
          for (let tri = 1; tri <= 3; tri++) {
            const nota = rndInt(6, 19);
            await client.query(`
              INSERT INTO public.notas
                (id, "alunoId", "turmaId", disciplina, trimestre, mt1, nf, "anoLetivo",
                 "professorId", data, aval1, aval2, aval3, aval4, aval5, aval6, aval7, aval8, mac1, pp1, ppt, mac)
              VALUES
                ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, 0,0,0,0,0,0,0,0,0,0,0,0)
              ON CONFLICT DO NOTHING
            `, [uid(), a.id, a.turmaId, disc, tri, nota, ANO, profId, HOJE]);
            notasCount++;
          }
        }
      }
    }
    console.log(`✓ ${notasCount} notas lançadas`);

    // ── Pagamentos (meses de Set a Abr) ───────────────────────────────────────
    // pagamentos: alunoId, taxaId, valor, data (text, not null), mes, ano (text!), status, metodoPagamento (not null)
    let pagCount = 0;
    const MESES_LETIVOS = [9, 10, 11, 12, 1, 2, 3, 4];
    for (const a of alunos) {
      for (const mes of MESES_LETIVOS) {
        const anoNum = mes >= 9 ? 2025 : 2026;
        const isPago = Math.random() < 0.7;
        const dataStr = `${anoNum}-${String(mes).padStart(2, '0')}-01`;
        await client.query(`
          INSERT INTO public.pagamentos
            (id, "alunoId", "taxaId", valor, data, mes, ano, status, "metodoPagamento")
          VALUES ($1, $2, $3, 15000, $4, $5, $6, $7, 'dinheiro')
          ON CONFLICT DO NOTHING
        `, [uid(), a.id, taxaId, dataStr, mes, String(anoNum), isPago ? 'pago' : 'pendente']);
        pagCount++;
      }
    }
    console.log(`✓ ${pagCount} registos de pagamento`);

    // ── Presenças (últimas 4 semanas, segunda-sexta) ───────────────────────────
    // presencas: alunoId, turmaId, disciplina (not null!), data, status
    let presCount = 0;
    const hoje = new Date();
    for (const a of alunos) {
      const turma = turmas.find(t => t.id === a.turmaId);
      const disc = turma ? turma.discs[0] : 'Língua Portuguesa';
      for (let w = 0; w < 4; w++) {
        for (let d = 0; d < 5; d++) {
          const dt = new Date(hoje);
          dt.setDate(hoje.getDate() - (w * 7) - d);
          const dataStr = dt.toISOString().slice(0, 10);
          const r = Math.random();
          const status = r < 0.85 ? 'P' : r < 0.95 ? 'F' : 'J';
          await client.query(`
            INSERT INTO public.presencas (id, "alunoId", "turmaId", disciplina, data, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
          `, [uid(), a.id, a.turmaId, disc, dataStr, status]);
          presCount++;
        }
      }
    }
    console.log(`✓ ${presCount} registos de presença`);

    await client.query('COMMIT');
    console.log('\n✅ Seed concluído com sucesso!');
    console.log('\nAlunos criados (pesquisar por nome ou matrícula):');
    for (const a of alunos) {
      const t = turmas.find(t => t.id === a.turmaId);
      console.log(`  Nº ${a.numeroMatricula} — ${a.nome} ${a.apelido} (${t?.nome})`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
