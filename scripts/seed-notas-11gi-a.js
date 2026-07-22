/**
 * Seed de notas para a turma 11ª GI-A, disciplina "Informática de Gestão", 1º Trimestre
 * - 35 alunos no total
 * - 32 com notas lançadas (3 sem notas)
 * - 6 alunos com negativas (nf < 10)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

// Cálculos conforme professor-pauta.tsx
function calcMac(avais) {
  const vals = avais.filter(v => v > 0);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length));
}

function calcNT(mac, pp, percMac, percPp) {
  return Math.round(mac * (percMac / 100) + pp * (percPp / 100));
}

function calcNF_T1T2(nt, pt, percNt, percPt) {
  return Math.round(nt * (percNt / 100) + pt * (percPt / 100));
}

// Percentagens padrão do sistema
const pMac = 30, pPp = 70, pNt = 60, pPt = 40;

// Gerar notas: tipo 'pass' ou 'fail'
function gerarNota(tipo) {
  let avais, pp1, ppt;

  if (tipo === 'fail') {
    // Notas negativas: avais baixos, pp baixo
    avais = [
      Math.floor(Math.random() * 2) + 1,  // 1-2
      Math.floor(Math.random() * 2) + 1,
      Math.floor(Math.random() * 2) + 1,
      Math.floor(Math.random() * 2) + 1,
      Math.floor(Math.random() * 2) + 1,
    ];
    pp1 = Math.floor(Math.random() * 5) + 3;    // 3-7
    ppt = Math.floor(Math.random() * 5) + 3;    // 3-7
  } else {
    // Notas positivas: avais bons
    avais = [
      Math.floor(Math.random() * 2) + 3,  // 3-4 or 4-5
      Math.floor(Math.random() * 2) + 3,
      Math.floor(Math.random() * 3) + 3,  // 3-5
      Math.floor(Math.random() * 2) + 3,
      Math.floor(Math.random() * 2) + 4,  // 4-5
    ];
    pp1 = Math.floor(Math.random() * 6) + 12;   // 12-17
    ppt = Math.floor(Math.random() * 6) + 11;   // 11-16
  }

  const mac = calcMac(avais);
  const nt  = calcNT(mac, pp1, pMac, pPp);
  const nf  = calcNF_T1T2(nt, ppt, pNt, pPt);
  const mt1 = nt;

  return { avais, pp1, ppt, mac, mt1, nf };
}

async function main() {
  // Buscar alunos ordenados por nome
  const alunosRes = await pool.query(
    'SELECT id FROM alunos WHERE "turmaId" = $1 ORDER BY nome ASC',
    ['turma-11-gi-a']
  );
  const alunos = alunosRes.rows;
  console.log(`[seed] ${alunos.length} alunos encontrados na turma 11ª GI-A`);

  // 32 alunos com notas; últimos 3 sem notas
  const alunosComNotas = alunos.slice(0, 32);
  // Primeiros 6 com negativas, restantes com positivas
  const tiposNota = [
    'fail','fail','fail','fail','fail','fail',  // 6 com negativas
    ...Array(26).fill('pass')                   // 26 com positivas
  ];

  // Verificar notas existentes e remover (idempotente)
  await pool.query(
    `DELETE FROM notas WHERE "turmaId" = $1 AND disciplina = $2 AND trimestre = $3`,
    ['turma-11-gi-a', 'Informática de Gestão', 1]
  );
  console.log('[seed] Notas existentes removidas (idempotente)');

  // Inserir notas
  for (let i = 0; i < alunosComNotas.length; i++) {
    const aluno = alunosComNotas[i];
    const tipo = tiposNota[i];
    const { avais, pp1, ppt, mac, mt1, nf } = gerarNota(tipo);

    await pool.query(
      `INSERT INTO notas (
        id, "alunoId", "turmaId", disciplina, trimestre,
        aval1, aval2, aval3, aval4, aval5, aval6, aval7, aval8,
        mac1, pp1, ppt, mt1, nf, mac,
        pg1, pg2, ex1, ex2, "provaRecuperacao",
        "anoLetivo", "professorId", data, lancamentos
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,
        $25,$26,$27,$28::jsonb
      )`,
      [
        uuidv4(),
        aluno.id,
        'turma-11-gi-a',
        'Informática de Gestão',
        1,
        avais[0], avais[1], avais[2], avais[3], avais[4], 0, 0, 0,
        mac, pp1, ppt, mt1, nf, mac,
        0, 0, 0, 0, 0,
        '2024/2025',
        'prof-antonio',
        '2026-01-15',
        JSON.stringify({})
      ]
    );
    console.log(`[seed] Aluno ${i+1}/32 (${tipo}): nf=${nf}, avais=[${avais.join(',')}], pp1=${pp1}, ppt=${ppt}`);
  }

  console.log('\n[seed] ✓ Concluído!');
  console.log(`  - 32 notas inseridas (6 negativas, 26 positivas)`);
  console.log(`  - 3 alunos sem notas (sem registo)`);

  await pool.end();
}

main().catch(e => { console.error('[seed] ERRO:', e.message); process.exit(1); });
