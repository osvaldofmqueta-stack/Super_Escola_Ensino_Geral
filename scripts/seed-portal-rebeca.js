/**
 * Seed sample data for student "Rebeca Chinawandela Queta" (8ª A)
 * Populates: faltas, diário (sumários), mensagens, materiais, RUPEs
 */
const { Pool } = require("pg");

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const pool = new Pool({ connectionString: url });

const ALUNO_ID = "aluno-rebeca-queta";
const TURMA_ID = "t-8a";
const TURMA_NOME = "8ª A";
const ANO_LETIVO = "2025/2026";

const PROFS = {
  "p-jose":   "José Manuel Gonçalves",
  "p-rosa":   "Rosa Cardoso",
  "p-tomas":  "Tomás Neves Pereira",
  "p-ana":    "Ana Pinto Alves",
  "p-paulo":  "Paulo Rodrigues Sousa",
  "p-rui":    "Rui Marques Ferreira",
  "p-mariah": "Maria Helena Teixeira",
  "p-carlos": "Carlos Sousa Mendes",
};

function dStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function tsStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

async function clear() {
  await pool.query(`DELETE FROM mensagens WHERE "turmaId"=$1`, [TURMA_ID]);
  await pool.query(`DELETE FROM materiais WHERE "turmaId"=$1`, [TURMA_ID]);
  await pool.query(`DELETE FROM sumarios  WHERE "turmaId"=$1`, [TURMA_ID]);
  await pool.query(`DELETE FROM registos_falta_mensal WHERE "alunoId"=$1`, [ALUNO_ID]);
  await pool.query(`DELETE FROM rupes WHERE "alunoId"=$1`, [ALUNO_ID]);
  console.log("[seed] cleared previous demo data for t-8a / rebeca");
}

async function seedMensagens() {
  const items = [
    {
      profId: "p-paulo", profNome: PROFS["p-paulo"],
      assunto: "Bem-vindos ao 3º Trimestre — 8ª A",
      corpo:
        "Caros alunos da 8ª A,\n\n" +
        "Iniciamos o 3º trimestre. As avaliações decorrem entre 12 e 23 de Maio. " +
        "Mantenham o foco e tragam sempre o material completo.\n\n" +
        "Prof. Paulo Rodrigues Sousa\nDirector de Turma — 8ª A",
      daysAgo: 2,
    },
    {
      profId: "p-rosa", profNome: PROFS["p-rosa"],
      assunto: "Trabalho de Matemática — Equações do 1º Grau",
      corpo:
        "Bom dia 8ª A,\n\n" +
        "O trabalho de grupo sobre equações do 1º grau deve ser entregue dia 12 de Maio. " +
        "Cada grupo (3 alunos) entrega: relatório escrito (4-6 páginas) + apresentação oral (10 min).\n\n" +
        "Boa preparação,\nProf.ª Rosa Cardoso",
      daysAgo: 4,
    },
    {
      profId: "p-tomas", profNome: PROFS["p-tomas"],
      assunto: "Leitura obrigatória — Língua Portuguesa",
      corpo:
        "Alunos da 8ª A,\n\n" +
        "Para a próxima aula tragam lido o capítulo 4 de «O Cavaleiro da Dinamarca» " +
        "(Sophia de Mello Breyner). Haverá ficha de leitura.\n\n" +
        "Prof. Tomás Neves Pereira",
      daysAgo: 6,
    },
    {
      profId: "p-ana", profNome: PROFS["p-ana"],
      assunto: "Visita de Estudo — Museu Nacional",
      corpo:
        "Caros encarregados e alunos,\n\n" +
        "Está marcada uma visita de estudo ao Museu Nacional de História para o dia 20 de Maio. " +
        "Custo: 1.500 AOA (transporte + entrada). Autorização entregue até 15/05.\n\n" +
        "Prof.ª Ana Pinto Alves",
      daysAgo: 1,
    },
  ];
  for (const m of items) {
    await pool.query(
      `INSERT INTO mensagens (id, "remetenteId", "remetenteNome", tipo, "turmaId", "turmaNome", assunto, corpo, "lidaPor", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, 'turma', $3, $4, $5, $6, '[]'::jsonb, $7)`,
      [m.profId, m.profNome, TURMA_ID, TURMA_NOME, m.assunto, m.corpo, tsStr(m.daysAgo)]
    );
  }
  console.log(`[seed] ${items.length} mensagens inseridas para ${TURMA_NOME}`);
}

async function seedMateriais() {
  const items = [
    {
      profId: "p-rosa", disciplina: "Matemática",
      titulo: "Resumo — Equações do 1º grau",
      descricao: "Resumo teórico com 12 exercícios resolvidos passo-a-passo.",
      tipo: "resumo",
      conteudo:
        "EQUAÇÕES DO 1º GRAU\n\n" +
        "Uma equação do 1º grau tem a forma  ax + b = 0, com a ≠ 0.\n\n" +
        "Passos para resolver:\n" +
        "  1. Isolar o termo com x num dos membros.\n" +
        "  2. Reduzir os termos semelhantes.\n" +
        "  3. Dividir ambos os membros pelo coeficiente de x.\n\n" +
        "Exemplo: 3x + 6 = 0  →  3x = -6  →  x = -2.\n\n" +
        "Exercícios resolvidos: ver caderno do aluno.",
      daysAgo: 5,
    },
    {
      profId: "p-tomas", disciplina: "Língua Portuguesa",
      titulo: "Ficha de Leitura — O Cavaleiro da Dinamarca",
      descricao: "Capítulo 4. Tabela de personagens, espaço e tempo.",
      tipo: "texto",
      conteudo:
        "FICHA DE LEITURA — Capítulo 4\n\n" +
        "Personagens principais: Cavaleiro, Pero Dias, Vanina.\n" +
        "Espaço: Veneza.\n" +
        "Tempo: séc. XV.\n\n" +
        "Questões para reflexão:\n" +
        "  1. O que motiva a viagem do Cavaleiro?\n" +
        "  2. Caracteriza Vanina em três adjectivos.\n" +
        "  3. Que valores cristãos estão presentes no capítulo?",
      daysAgo: 7,
    },
    {
      profId: "p-mariah", disciplina: "Ciências da Natureza",
      titulo: "Vídeo — Ciclo da Água (Khan Academy)",
      descricao: "Explicação visual do ciclo da água em 8 minutos.",
      tipo: "link",
      conteudo: "https://www.khanacademy.org/science/biology/ecology/biogeochemical-cycles",
      daysAgo: 3,
    },
    {
      profId: "p-paulo", disciplina: "História",
      titulo: "Apontamentos — Reino do Kongo",
      descricao: "Cronologia, principais reis e relação com Portugal.",
      tipo: "resumo",
      conteudo:
        "REINO DO KONGO (séc. XIV-XIX)\n\n" +
        "• Fundado pelo Manikongo Lukeni lua Nimi (~1390).\n" +
        "• Capital: Mbanza Kongo (actual São Salvador).\n" +
        "• Contacto com Portugal: 1482 — Diogo Cão chega à foz do rio Zaire.\n" +
        "• Conversão ao cristianismo: D. João I (Nzinga a Nkuwu, 1491).\n" +
        "• Apogeu sob D. Afonso I (1509-1542).\n" +
        "• Declínio após batalha de Mbwila (1665).\n",
      daysAgo: 10,
    },
  ];
  for (const m of items) {
    await pool.query(
      `INSERT INTO materiais (id, "professorId", "turmaId", "turmaNome", disciplina, titulo, descricao, tipo, conteudo, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [m.profId, TURMA_ID, TURMA_NOME, m.disciplina, m.titulo, m.descricao, m.tipo, m.conteudo, tsStr(m.daysAgo)]
    );
  }
  console.log(`[seed] ${items.length} materiais inseridos para ${TURMA_NOME}`);
}

async function seedSumarios() {
  const items = [
    {
      profId: "p-rosa", disciplina: "Matemática",
      data: dStr(1), horaInicio: "08:00", horaFim: "08:45", numeroAula: 42,
      conteudo: "Resolução de equações do 1º grau com parêntesis. Aplicação da propriedade distributiva. Exercícios 12 a 18 do manual (pág. 87).",
    },
    {
      profId: "p-tomas", disciplina: "Língua Portuguesa",
      data: dStr(1), horaInicio: "08:50", horaFim: "09:35", numeroAula: 40,
      conteudo: "Análise do capítulo 3 de «O Cavaleiro da Dinamarca». Identificação dos recursos estilísticos: metáfora e personificação. Trabalho de casa: ficha de leitura do capítulo 4.",
    },
    {
      profId: "p-paulo", disciplina: "História",
      data: dStr(2), horaInicio: "10:00", horaFim: "10:45", numeroAula: 35,
      conteudo: "O Reino do Kongo — formação e organização social. Visualização de mapas históricos. Discussão sobre o impacto do contacto com os portugueses no séc. XV.",
    },
    {
      profId: "p-mariah", disciplina: "Ciências da Natureza",
      data: dStr(2), horaInicio: "10:50", horaFim: "11:35", numeroAula: 38,
      conteudo: "Ciclo da água: evaporação, condensação, precipitação e infiltração. Experiência demonstrativa em sala. Ficha de consolidação distribuída.",
    },
    {
      profId: "p-jose", disciplina: "Inglês",
      data: dStr(3), horaInicio: "11:40", horaFim: "12:25", numeroAula: 33,
      conteudo: "Past Simple — verbos regulares e irregulares. Drill oral e exercícios escritos (workbook pp. 54-55). Atribuído trabalho de casa: redacção «My last weekend».",
    },
    {
      profId: "p-rui", disciplina: "Geografia",
      data: dStr(4), horaInicio: "08:00", horaFim: "08:45", numeroAula: 30,
      conteudo: "Relevo de Angola — principais formas: planaltos, planícies costeiras e montanhas. Leitura de mapas hipsométricos. TPC: localizar 5 picos no mapa mudo.",
    },
  ];
  for (const s of items) {
    await pool.query(
      `INSERT INTO sumarios (id, "professorId", "professorNome", "turmaId", "turmaNome", disciplina, data, "horaInicio", "horaFim", "numeroAula", conteudo, status, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'aceite', $11)`,
      [s.profId, PROFS[s.profId], TURMA_ID, TURMA_NOME, s.disciplina, s.data, s.horaInicio, s.horaFim, s.numeroAula, s.conteudo, new Date(s.data + "T" + s.horaInicio + ":00").toISOString()]
    );
  }
  console.log(`[seed] ${items.length} sumários inseridos para ${TURMA_NOME}`);
}

async function seedFaltas() {
  const dataReg = dStr(0);
  const items = [
    { disciplina: "Matemática",          mes: 4, total: 3, just: 1, injust: 2, status: "normal",   obs: "Faltou em 02/04, 16/04 e 23/04. Justificação entregue para 02/04 (consulta médica)." },
    { disciplina: "Língua Portuguesa",   mes: 4, total: 2, just: 2, injust: 0, status: "normal",   obs: "Ambas justificadas — atestado médico (gripe)." },
    { disciplina: "Educação Física",     mes: 4, total: 4, just: 0, injust: 4, status: "em_risco", obs: "Comportamento a melhorar. Encarregado contactado em 21/04." },
    { disciplina: "História",            mes: 4, total: 1, just: 1, injust: 0, status: "normal",   obs: "Justificada — falecimento familiar." },
    { disciplina: "Inglês",              mes: 4, total: 2, just: 0, injust: 2, status: "normal",   obs: "" },
  ];
  for (const f of items) {
    await pool.query(
      `INSERT INTO registos_falta_mensal
        (id, "alunoId", "turmaId", disciplina, mes, ano, trimestre,
         "totalFaltas", "faltasJustificadas", "faltasInjustificadas",
         status, observacao, "registadoPor", "registadoPorId", "dataRegisto")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 3, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [ALUNO_ID, TURMA_ID, f.disciplina, f.mes, 2026, f.total, f.just, f.injust, f.status, f.obs, "Paulo Rodrigues Sousa", "p-paulo", dataReg]
    );
  }
  console.log(`[seed] ${items.length} registos de faltas inseridos para Rebeca`);
}

async function seedRupes() {
  // Find existing taxas to reference
  const r = await pool.query(`SELECT id, valor FROM taxas WHERE id IN ('cartao_estudante_anual','outros') OR tipo='propina' LIMIT 5`);
  const taxas = r.rows;
  if (taxas.length === 0) { console.warn("[seed] no taxas found, skipping RUPEs"); return; }

  const propina = taxas.find(t => t.id.startsWith("taxa-prop")) || taxas[0];
  const cartao  = taxas.find(t => t.id === "cartao_estudante_anual") || taxas[0];
  const outros  = taxas.find(t => t.id === "outros") || taxas[0];

  function ref() {
    return Math.floor(100000000 + Math.random() * 899999999).toString();
  }

  const items = [
    { taxaId: propina.id, valor: propina.valor || 5000, daysAgo: 12, status: "pago",      validadeDays: 30 },
    { taxaId: cartao.id,  valor: cartao.valor  || 2500, daysAgo: 5,  status: "ativo",     validadeDays: 25 },
    { taxaId: outros.id,  valor: 1500,                  daysAgo: 1,  status: "ativo",     validadeDays: 29 },
  ];

  for (const it of items) {
    const dGen = dStr(it.daysAgo);
    const dVal = dStr(it.daysAgo - it.validadeDays);
    await pool.query(
      `INSERT INTO rupes (id, "alunoId", "taxaId", valor, referencia, "dataGeracao", "dataValidade", status, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [ALUNO_ID, it.taxaId, it.valor, ref(), dGen, dVal, it.status, tsStr(it.daysAgo)]
    );
  }
  console.log(`[seed] ${items.length} RUPEs inseridos para Rebeca`);
}

(async () => {
  try {
    await clear();
    await seedMensagens();
    await seedMateriais();
    await seedSumarios();
    await seedFaltas();
    await seedRupes();
    console.log("\n✓ Seed concluído com sucesso.");
  } catch (e) {
    console.error("Erro no seed:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
