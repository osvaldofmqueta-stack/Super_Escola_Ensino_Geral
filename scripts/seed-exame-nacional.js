/**
 * Seed: 3 Turmas de Exame Nacional (6ª, 9ª e 12ª classe)
 * com alunos e notas T1+T2+T3 para testar o lançamento do EN.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// anoLetivo nas turmas deve ser o campo "ano" do ano académico, não o ID
const ANO_LETIVO = '2025/2026';
const ANO_STR    = '2025/2026';

// ID de professor válido (tabela professores)
const PROFESSOR_ID = '8cbea5a6-7f9a-46c9-a220-1094c040860d';

const TURMAS = [
  { id: 'turma-en-6a',  nome: '6ª A — EN',  classe: '6ª Classe',  turno: 'Manhã', nivel: 'primario',  cursoId: null },
  { id: 'turma-en-9a',  nome: '9ª A — EN',  classe: '9ª Classe',  turno: 'Manhã', nivel: 'i_ciclo',   cursoId: null },
  { id: 'turma-en-12a', nome: '12ª A — EN', classe: '12ª Classe', turno: 'Manhã', nivel: 'ii_ciclo',  cursoId: 'curso-gi' },
];

// Língua Portuguesa e Matemática são nucleares
const DISCIPLINAS_NUCLEARES = ['d-lp', 'd-mat'];

// 5 alunos fictícios por turma (variados para mostrar aprovados e reprovados)
const ALUNOS_DADOS = [
  { nome: 'Ana',     apelido: 'Ferreira', mt_t1: 16, mt_t2: 15, mac_t3: 14 },
  { nome: 'Bruno',   apelido: 'Sousa',    mt_t1: 9,  mt_t2: 10, mac_t3: 9  },
  { nome: 'Carlos',  apelido: 'Mendes',   mt_t1: 13, mt_t2: 14, mac_t3: 12 },
  { nome: 'Diana',   apelido: 'Costa',    mt_t1: 8,  mt_t2: 9,  mac_t3: 8  },
  { nome: 'Eduardo', apelido: 'Lima',     mt_t1: 17, mt_t2: 16, mac_t3: 18 },
];

async function insertNota(client, { notaId, alunoId, turmaId, discNome, trimestre, mt1Val, macVal }) {
  await client.query(`
    INSERT INTO notas (
      id, "alunoId", "turmaId", disciplina, trimestre, "anoLetivo",
      "professorId", data, lancado,
      aval1, aval2, aval3, aval4, aval5, aval6, aval7, aval8,
      mac1, pp1, ppt, mt1, mac, nf,
      pg1, pg2, ex1, ex2,
      "provaRecuperacao", "escalaMin", "escalaMax", "escalaTipo",
      "notaFormativa", comportamento, "apreciacaoDescritiva"
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,NOW(),false,
      0,0,0,0,0,0,0,0,
      0,0,0,$8,$9,$9,
      0,0,0,0,
      0,0,20,'proporcional',
      0,'',''
    )
    ON CONFLICT (id) DO UPDATE
      SET mt1=EXCLUDED.mt1, mac=EXCLUDED.mac, nf=EXCLUDED.nf, lancado=false
  `, [notaId, alunoId, turmaId, discNome, trimestre, ANO_STR, PROFESSOR_ID, mt1Val, macVal]);
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const turma of TURMAS) {
      // 1. Upsert turma
      await client.query(`
        INSERT INTO turmas (id, nome, classe, turno, "anoLetivo", nivel, "cursoId", sala, capacidade, ativo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Sala 1',30,true)
        ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, classe=EXCLUDED.classe, "anoLetivo"=EXCLUDED."anoLetivo", ativo=true
      `, [turma.id, turma.nome, turma.classe, turma.turno, ANO_LETIVO, turma.nivel, turma.cursoId]);

      console.log(`✅ Turma: ${turma.nome}`);

      for (let i = 0; i < ALUNOS_DADOS.length; i++) {
        const { nome, apelido, mt_t1, mt_t2, mac_t3 } = ALUNOS_DADOS[i];
        const alunoId     = `aluno-${turma.id}-${i}`;
        const numMatricula = `EN${turma.classe.charAt(0)}${String(i + 1).padStart(3, '0')}`;

        // 2. Upsert aluno
        await client.query(`
          INSERT INTO alunos (
            id, "numeroMatricula", nome, apelido, "dataNascimento", genero,
            provincia, municipio, "turmaId", "cursoId", "nomeEncarregado",
            "telefoneEncarregado", ativo, situacao
          ) VALUES ($1,$2,$3,$4,'2008-06-15',$5,'Luanda','Luanda',$6,$7,$8,'923000000',true,'activo')
          ON CONFLICT (id) DO UPDATE SET "turmaId"=EXCLUDED."turmaId", ativo=true
        `, [
          alunoId, numMatricula, nome, apelido,
          i % 2 === 0 ? 'M' : 'F',
          turma.id, turma.cursoId,
          `Encarregado de ${nome} ${apelido}`,
        ]);

        // 3. Notas T1, T2 e T3 para cada disciplina nuclear
        for (const discId of DISCIPLINAS_NUCLEARES) {
          const discRes  = await client.query('SELECT nome FROM disciplinas WHERE id=$1', [discId]);
          const discNome = discRes.rows[0]?.nome || discId;

          // T1 — mt1 contém a média trimestral
          await insertNota(client, {
            notaId: `nota-${alunoId}-${discId}-t1`,
            alunoId, turmaId: turma.id, discNome, trimestre: 1,
            mt1Val: mt_t1, macVal: mt_t1,
          });

          // T2
          await insertNota(client, {
            notaId: `nota-${alunoId}-${discId}-t2`,
            alunoId, turmaId: turma.id, discNome, trimestre: 2,
            mt1Val: mt_t2, macVal: mt_t2,
          });

          // T3 — mac contém MACT₃ (média de avaliação contínua do 3º trimestre)
          await insertNota(client, {
            notaId: `nota-${alunoId}-${discId}-t3`,
            alunoId, turmaId: turma.id, discNome, trimestre: 3,
            mt1Val: mac_t3, macVal: mac_t3,
          });
        }

        // MT₃ esperado = (mt_t1 + mt_t2 + mac_t3) / 3
        const mt3exp = ((mt_t1 + mt_t2 + mac_t3) / 3).toFixed(1);
        console.log(`   👤 ${nome} ${apelido} — MT₁=${mt_t1} MT₂=${mt_t2} MACT₃=${mac_t3} → MT₃≈${mt3exp}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Seed concluído! Turmas de EN prontas com T1+T2+T3.');
    console.log('   Acede a Secretaria → Área Pedagógica → Exame Nacional.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
