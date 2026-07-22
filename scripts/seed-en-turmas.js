/**
 * seed-en-turmas.js
 * Popula 3 turmas de exame (6ª A, 9ª A, 12ª GI-A) com alunos,
 * notas T1/T2/T3 e notas de EN (ex1 / ex2) para testar o lançamento do Exame Nacional.
 */

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.NEON_DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,
});

const ANO = "2025/2026";

// Turmas alvo (já existem na BD)
const TURMAS = [
  { id: "t-6a",        nome: "6ª A",    classe: "6ª Classe",  cursoId: null },
  { id: "t-9a",        nome: "9ª A",    classe: "9ª Classe",  cursoId: null },
  { id: "seed-12gi-a", nome: "12ª GI-A",classe: "12ª Classe", cursoId: "curso-gi" },
];

// Disciplinas nucleares — LP e Matemática (IDs confirmados na BD)
const NUCLEARES = [
  { id: "d-lp",  nome: "Língua Portuguesa" },
  { id: "d-mat", nome: "Matemática" },
];

// Alunos por turma (5 por turma)
const ALUNOS_POR_TURMA = {
  "t-6a": [
    { id: "en-6a-a1", nome: "Ana",      apelido: "Silva",     bi: "006001001LA045", mat: "6A001" },
    { id: "en-6a-a2", nome: "Bruno",    apelido: "Costa",     bi: "006002002LA045", mat: "6A002" },
    { id: "en-6a-a3", nome: "Catarina", apelido: "Ferreira",  bi: "006003003LA045", mat: "6A003" },
    { id: "en-6a-a4", nome: "Diogo",    apelido: "Mendes",    bi: "006004004LA045", mat: "6A004" },
    { id: "en-6a-a5", nome: "Elisa",    apelido: "Neto",      bi: "006005005LA045", mat: "6A005" },
  ],
  "t-9a": [
    { id: "en-9a-a1", nome: "Fábio",    apelido: "Rodrigues", bi: "009001001LA045", mat: "9A001" },
    { id: "en-9a-a2", nome: "Graça",    apelido: "Pinto",     bi: "009002002LA045", mat: "9A002" },
    { id: "en-9a-a3", nome: "Hugo",     apelido: "Lopes",     bi: "009003003LA045", mat: "9A003" },
    { id: "en-9a-a4", nome: "Inês",     apelido: "Carvalho",  bi: "009004004LA045", mat: "9A004" },
    { id: "en-9a-a5", nome: "João",     apelido: "Alves",     bi: "009005005LA045", mat: "9A005" },
  ],
  "seed-12gi-a": [
    { id: "en-12a-a1", nome: "Kátia",   apelido: "Sousa",     bi: "012001001LA045", mat: "12A001" },
    { id: "en-12a-a2", nome: "Luís",    apelido: "Gomes",     bi: "012002002LA045", mat: "12A002" },
    { id: "en-12a-a3", nome: "Marta",   apelido: "Azevedo",   bi: "012003003LA045", mat: "12A003" },
    { id: "en-12a-a4", nome: "Nuno",    apelido: "Baptista",  bi: "012004004LA045", mat: "12A004" },
    { id: "en-12a-a5", nome: "Olga",    apelido: "Vieira",    bi: "012005005LA045", mat: "12A005" },
  ],
};

// Notas realistas (variadas) por aluno e disciplina
// [aval1, aval2, aval3, mac, pp, mt, ex1, ex2(só 12ª)]
const NOTAS_DADOS = [
  // Muito bom
  { avals: [16,17,16,15,17,16,15,16], mac: 16, pp: 17, mt: 16, ex1: 15, ex2: 14 },
  // Bom
  { avals: [14,13,15,14,12,13,14,13], mac: 14, pp: 12, mt: 13, ex1: 12, ex2: 13 },
  // Suficiente
  { avals: [10,11,10,11,12,10,11,10], mac: 11, pp: 10, mt: 10, ex1: 10, ex2: 11 },
  // Quase reprovado
  { avals: [9,8,10,9,8,9,8,9],        mac: 9,  pp: 8,  mt: 9,  ex1: 8,  ex2: 9  },
  // Bom aluno
  { avals: [18,17,18,17,16,17,18,17], mac: 17, pp: 16, mt: 17, ex1: 16, ex2: 17 },
];

async function run() {
  console.log("=== SEED EN TURMAS ===\n");

  // 1 — Marcar LP e Matemática como nuclear=true
  console.log("1. A marcar disciplinas como nucleares...");
  for (const d of NUCLEARES) {
    await pool.query(
      `UPDATE public.disciplinas SET nuclear = true WHERE id = $1`,
      [d.id]
    );
    console.log(`   ✅ ${d.nome} marcada como nuclear`);
  }

  // 2 — Garantir turma_disciplinas (ligar disciplinas nucleares às 3 turmas)
  console.log("\n2. A ligar disciplinas nucleares às turmas...");
  let tdOrd = 1;
  for (const turma of TURMAS) {
    for (const disc of NUCLEARES) {
      const existing = await pool.query(
        `SELECT id FROM public.turma_disciplinas WHERE "turmaId"=$1 AND "disciplinaId"=$2`,
        [turma.id, disc.id]
      );
      if (existing.rows.length === 0) {
        const tdId = `td-${turma.id}-${disc.id}`;
        await pool.query(
          `INSERT INTO public.turma_disciplinas (id, "turmaId", "disciplinaId", ordem)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [tdId, turma.id, disc.id, tdOrd++]
        );
        console.log(`   ✅ ${turma.nome} ← ${disc.nome}`);
      } else {
        console.log(`   ⏭  ${turma.nome} ← ${disc.nome} (já existe)`);
      }
    }
  }

  // 3 — Criar alunos em cada turma
  console.log("\n3. A criar alunos...");
  for (const turma of TURMAS) {
    const lista = ALUNOS_POR_TURMA[turma.id];
    for (const a of lista) {
      const existing = await pool.query(
        `SELECT id FROM public.alunos WHERE id=$1`, [a.id]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO public.alunos
             (id, "numeroMatricula", nome, apelido, "dataNascimento", genero,
              provincia, municipio, "turmaId", "cursoId",
              "nomeEncarregado", "telefoneEncarregado", ativo, situacao)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,'matriculado')`,
          [
            a.id, a.mat, a.nome, a.apelido,
            "2005-03-15", "M",
            "Luanda", "Luanda",
            turma.id, turma.cursoId,
            `Encarregado de ${a.nome} ${a.apelido}`,
            "+244923000001",
          ]
        );
        console.log(`   ✅ ${a.nome} ${a.apelido} → ${turma.nome}`);
      } else {
        console.log(`   ⏭  ${a.nome} ${a.apelido} já existe`);
      }
    }
  }

  // 4 — Criar notas T1, T2, T3 + ex1 (e ex2 para 12ª)
  console.log("\n4. A criar notas T1/T2/T3 + EN...");
  for (const turma of TURMAS) {
    const lista = ALUNOS_POR_TURMA[turma.id];
    const is12 = turma.classe === "12ª Classe";

    for (let ai = 0; ai < lista.length; ai++) {
      const aluno = lista[ai];
      const nd = NOTAS_DADOS[ai % NOTAS_DADOS.length];

      for (const disc of NUCLEARES) {
        for (const trim of [1, 2, 3]) {
          const notaId = `nota-${turma.id}-${aluno.id}-${disc.id}-t${trim}`;
          const existing = await pool.query(
            `SELECT id FROM public.notas WHERE id=$1`, [notaId]
          );
          if (existing.rows.length > 0) {
            // Actualizar ex1/ex2 no T3 se já existir
            if (trim === 3) {
              await pool.query(
                `UPDATE public.notas SET ex1=$1, ex2=$2, lancado=true WHERE id=$3`,
                [nd.ex1, is12 ? nd.ex2 : null, notaId]
              );
              console.log(`   🔄 ${aluno.nome} ${disc.nome} T3 EN actualizado`);
            }
            continue;
          }

          // Variação por trimestre
          const fator = trim === 1 ? -1 : trim === 2 ? 0 : 1;
          const av = nd.avals.slice(0, 8).map(v => Math.min(20, Math.max(0, v + fator)));

          await pool.query(
            `INSERT INTO public.notas
               (id, "alunoId", "turmaId", disciplina, trimestre,
                aval1, aval2, aval3, aval4, aval5, aval6, aval7, aval8,
                mac1, pp1, mt1, ex1, ex2,
                "anoLetivo", "professorId", data, lancado)
             VALUES ($1,$2,$3,$4,$5,
                     $6,$7,$8,$9,$10,$11,$12,$13,
                     $14,$15,$16,$17,$18,
                     $19,$20,CURRENT_DATE,$21)
             ON CONFLICT DO NOTHING`,
            [
              notaId, aluno.id, turma.id, disc.nome, trim,
              av[0], av[1], av[2], av[3], av[4], av[5], av[6], av[7],
              nd.mac + fator, nd.pp + fator, nd.mt + fator,
              trim === 3 ? nd.ex1 : 0,
              trim === 3 && is12 ? nd.ex2 : 0,
              ANO,
              "8cbea5a6-7f9a-46c9-a220-1094c040860d",
              true,
            ]
          );
        }
      }
      console.log(`   ✅ Notas criadas: ${aluno.nome} ${aluno.apelido} (${turma.nome})`);
    }
  }

  console.log("\n=== SEED CONCLUÍDO ===");
  console.log("Turmas prontas para EN:");
  console.log("  • 6ª A  — 5 alunos, LP + Matemática (nuclear), T3 + ex1 lançados");
  console.log("  • 9ª A  — 5 alunos, LP + Matemática (nuclear), T3 + ex1 lançados");
  console.log("  • 12ª GI-A — 5 alunos, LP + Matemática (nuclear), T3 + ex1 + ex2 lançados");
  console.log("\nVai a Exame Nacional (como Secretaria ou CEO) para ver as turmas.");

  await pool.end();
}

run().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
