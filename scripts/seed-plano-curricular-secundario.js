/**
 * SIGA v3 — Seed do Plano Curricular do Ensino Secundário Geral (I e II Ciclos)
 * Fonte: INIDE/MED — Plano Curricular do Ensino Secundário Geral, 2019 (1.ª Edição)
 *
 * - Actualiza/cria disciplinas do I Ciclo (7ª-9ª classe) exclusivas deste ciclo
 * - Cria os 4 "cursos" oficiais do II Ciclo (áreas de conhecimento) com as suas
 *   disciplinas de Formação Geral, Formação Específica e Opção
 *
 * Idempotente: pode ser executado várias vezes sem duplicar registos
 * (identifica disciplinas pelo `codigo` e cursos pelo `codigo`).
 *
 * Uso: node scripts/seed-plano-curricular-secundario.js
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

const pool = new Pool({ connectionString: databaseUrl });

// ─────────────────────────────────────────────────────────────────────────
// I CICLO (7ª-9ª classe) — disciplinas exclusivas deste ciclo
// (LP, Matemática, Educação Física, Ed. Moral e Cívica e Ed. Visual e
// Plástica são partilhadas com o Ensino Primário no catálogo actual e não
// são alteradas aqui para não afectar turmas já existentes de 1ª-6ª classe)
// ─────────────────────────────────────────────────────────────────────────

const I_CICLO_UPDATES = [
  // codigo existente -> novos valores (cargaHoraria semanal representativa + descrição com o detalhe oficial)
  { codigo: "BIO", cargaHoraria: 2, area: "Ciências Naturais",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — 7ª: 2h, 8ª: 2h, 9ª: 3h/semana — Total: 210h" },
  { codigo: "FIS", cargaHoraria: 2, area: "Ciências Exactas",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — 7ª: 3h, 8ª: 2h, 9ª: 2h/semana — Total: 210h" },
  { codigo: "QUI", cargaHoraria: 2, area: "Ciências Exactas",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — 7ª: 2h, 8ª: 3h, 9ª: 2h/semana — Total: 210h" },
  { codigo: "HIS", cargaHoraria: 3, area: "Ciências Sociais e Humanas",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — 7ª: 3h, 8ª: 3h, 9ª: 2h/semana — Total: 240h" },
  { codigo: "ING", cargaHoraria: 3, area: "Línguas e Comunicação",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — Língua Estrangeira I — 7ª: 3h, 8ª: 3h, 9ª: 3h/semana — Total: 270h" },
  { codigo: "FRA", cargaHoraria: 3, area: "Línguas e Comunicação",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — Língua Estrangeira I — 7ª: 3h, 8ª: 3h, 9ª: 3h/semana — Total: 270h" },
];

const I_CICLO_NOVAS = [
  {
    nome: "Educação Laboral", codigo: "EDL", area: "Formação Profissional",
    descricao: "Plano Curricular INIDE/MED 2019 (I Ciclo) — 7ª: 2h, 8ª: 2h, 9ª: 2h/semana — Total: 180h",
    tipo: "continuidade", classeInicio: "7ª Classe", classeFim: "9ª Classe",
    cargaHoraria: 2, obrigatoria: true, categoriaFormacao: "",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// II CICLO (10ª-12ª classe) — 4 áreas de conhecimento (cursos)
// ─────────────────────────────────────────────────────────────────────────

const CURSOS_II_CICLO = [
  {
    codigo: "CFB",
    nome: "Ciências Físicas e Biológicas",
    areaFormacao: "Ciências Físicas e Biológicas",
    descricao: "Área vocacionada para Engenharia, Medicina, Ciências da Saúde, Enfermagem Geral, Ciências Biológicas, Agronomia, Medicina Veterinária, Psicologia, Ciências da Educação, entre outros.",
    duracao: "3 anos (10ª-12ª classe)",
    cargaHoraria: 30,
    portaria: "Plano Curricular do Ensino Secundário Geral — INIDE/MED, 2019",
    ementa: "Formação Geral: Língua Portuguesa (3/3/3), Língua Estrangeira (3/3/3), Matemática (4/3/3), Informática (4/-/-), Educação Física (2/2/2), Filosofia (-/2/2), Empreendedorismo (2/2/2). Formação Específica: Física (4/4/4), Química (4/3/3), Biologia (4/4/4), Geologia (-/2/2), Opção — Geometria Descritiva/Sociologia/Psicologia (-/2/2). Total semanal: 30h/30h/30h — Total anual: 2700h.",
  },
  {
    codigo: "CEJ",
    nome: "Ciências Económico-Jurídicas",
    areaFormacao: "Ciências Económico-Jurídicas",
    descricao: "Área orientada para Economia, Direito, Psicologia, Ciências da Educação, Ciências da Comunicação, Ciência Política, Gestão, entre outros.",
    duracao: "3 anos (10ª-12ª classe)",
    cargaHoraria: 30,
    portaria: "Plano Curricular do Ensino Secundário Geral — INIDE/MED, 2019",
    ementa: "Formação Geral: Língua Portuguesa (3/3/3), Língua Estrangeira (3/3/3), Matemática (4/4/-), Informática (4/-/-), Educação Física (2/2/2), Filosofia (-/2/2), Empreendedorismo (2/2/2). Formação Específica: Introdução ao Direito (3/3/2), Introdução à Economia (3/2/3), História (3/3/3), Geografia (3/3/3), Desenvolvimento Económico e Social (-/-/4), Opção — Antropologia/Sociologia/Psicologia (-/2/2). Total semanal: 30h/27h/27h — Total anual: 2640h.",
  },
  {
    codigo: "CH",
    nome: "Ciências Humanas",
    areaFormacao: "Ciências Humanas",
    descricao: "Área vocacionada para Línguas, História, Geografia, Filosofia, Sociologia, Psicologia, Ciências da Comunicação, Ciência Política e afins.",
    duracao: "3 anos (10ª-12ª classe)",
    cargaHoraria: 30,
    portaria: "Plano Curricular do Ensino Secundário Geral — INIDE/MED, 2019",
    ementa: "Formação Geral: Língua Portuguesa (4/4/4), Língua Estrangeira (3/3/3), Matemática (3/2/-), Informática (4/-/-), Educação Física (2/2/2), Filosofia (-/2/2), Empreendedorismo (2/2/2). Formação Específica: Língua Estrangeira (2ª) (4/4/4), História (3/3/3), Geografia (3/3/3), Literatura (-/2/2), Opção — Antropologia/Psicologia/Desenvolvimento Económico e Social/Sociologia (-/2/2). Total semanal: 26h/27h/25h — Total anual: 2520h.",
  },
  {
    codigo: "AV",
    nome: "Artes Visuais",
    areaFormacao: "Artes Visuais",
    descricao: "Área orientada para o acesso a cursos de Artes Plásticas, Música, Arquitectura, Design, Belas Artes e afins.",
    duracao: "3 anos (10ª-12ª classe)",
    cargaHoraria: 27,
    portaria: "Plano Curricular do Ensino Secundário Geral — INIDE/MED, 2019",
    ementa: "Formação Geral: Língua Portuguesa (4/3/3), Língua Estrangeira (3/3/3), Matemática (3/-/-), Informática (4/-/-), Educação Física (2/2/2), Filosofia (-/2/2), Empreendedorismo (2/2/2). Formação Específica: Desenho (3/3/2), Teoria e Prática do Design (-/3/3), Geometria Descritiva (3/3/-), História das Artes (2/3/3), Técnica de Expressão Artística (3/4/4), Opção — Psicologia/Sociologia (-/2/2). Total semanal: 27h/28h/25h — Total anual: 2450h.",
  },
];

// Disciplinas novas do catálogo global exclusivas ao II Ciclo Geral
const II_CICLO_NOVAS = [
  { nome: "Informática", codigo: "INF2", area: "Formação Geral", tipo: "terminal", classeInicio: "10ª Classe", classeFim: "10ª Classe", categoriaFormacao: "formacao_geral" },
  { nome: "Filosofia", codigo: "FIL", area: "Formação Geral", tipo: "continuidade", classeInicio: "11ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_geral" },
  { nome: "Física (II Ciclo)", codigo: "FIS2", area: "Ciências Físicas e Biológicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Química (II Ciclo)", codigo: "QUI2", area: "Ciências Físicas e Biológicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Biologia (II Ciclo)", codigo: "BIO2", area: "Ciências Físicas e Biológicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Geologia", codigo: "GLG", area: "Ciências Físicas e Biológicas", tipo: "continuidade", classeInicio: "11ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Geometria Descritiva", codigo: "GDE", area: "Artes Visuais", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Sociologia", codigo: "SOC", area: "Ciências Sociais e Humanas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "opcional" },
  { nome: "Psicologia", codigo: "PSI", area: "Ciências Sociais e Humanas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "opcional" },
  { nome: "Introdução ao Direito", codigo: "IDIR", area: "Ciências Económico-Jurídicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Introdução à Economia", codigo: "IECO", area: "Ciências Económico-Jurídicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "História (II Ciclo)", codigo: "HIS2", area: "Ciências Sociais e Humanas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Geografia (II Ciclo)", codigo: "GEO2", area: "Ciências Sociais e Humanas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Desenvolvimento Económico e Social", codigo: "DES", area: "Ciências Económico-Jurídicas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Antropologia", codigo: "ANT", area: "Ciências Sociais e Humanas", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "opcional" },
  { nome: "Língua Estrangeira II", codigo: "FRA2", area: "Línguas e Comunicação", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Literatura", codigo: "LIT", area: "Línguas e Comunicação", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Desenho", codigo: "DSN", area: "Artes Visuais", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Teoria e Prática do Design", codigo: "TPD", area: "Artes Visuais", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "História das Artes", codigo: "HART", area: "Artes Visuais", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
  { nome: "Técnica de Expressão Artística", codigo: "TEA", area: "Artes Visuais", tipo: "continuidade", classeInicio: "10ª Classe", classeFim: "12ª Classe", categoriaFormacao: "formacao_especifica" },
];

// Mapeamento curso -> lista de disciplinas { codigo, cargaHoraria, obrigatoria, ordem, categoriaFormacao }
// (codigo refere-se ao catálogo global — reaproveita LP/MAT/EF/ING/EMP já existentes)
const CURSO_DISCIPLINAS = {
  CFB: [
    { codigo: "LP", cargaHoraria: 3, obrigatoria: true, ordem: 1, categoriaFormacao: "formacao_geral" },
    { codigo: "ING", cargaHoraria: 3, obrigatoria: true, ordem: 2, categoriaFormacao: "formacao_geral" },
    { codigo: "MAT", cargaHoraria: 3, obrigatoria: true, ordem: 3, categoriaFormacao: "formacao_geral" },
    { codigo: "INF2", cargaHoraria: 4, obrigatoria: true, ordem: 4, categoriaFormacao: "formacao_geral" },
    { codigo: "EF", cargaHoraria: 2, obrigatoria: true, ordem: 5, categoriaFormacao: "formacao_geral" },
    { codigo: "FIL", cargaHoraria: 2, obrigatoria: true, ordem: 6, categoriaFormacao: "formacao_geral" },
    { codigo: "EMP", cargaHoraria: 2, obrigatoria: true, ordem: 7, categoriaFormacao: "formacao_geral" },
    { codigo: "FIS2", cargaHoraria: 4, obrigatoria: true, ordem: 8, categoriaFormacao: "formacao_especifica" },
    { codigo: "QUI2", cargaHoraria: 3, obrigatoria: true, ordem: 9, categoriaFormacao: "formacao_especifica" },
    { codigo: "BIO2", cargaHoraria: 4, obrigatoria: true, ordem: 10, categoriaFormacao: "formacao_especifica" },
    { codigo: "GLG", cargaHoraria: 2, obrigatoria: true, ordem: 11, categoriaFormacao: "formacao_especifica" },
    { codigo: "GDE", cargaHoraria: 2, obrigatoria: false, ordem: 12, categoriaFormacao: "opcional" },
    { codigo: "SOC", cargaHoraria: 2, obrigatoria: false, ordem: 13, categoriaFormacao: "opcional" },
    { codigo: "PSI", cargaHoraria: 2, obrigatoria: false, ordem: 14, categoriaFormacao: "opcional" },
  ],
  CEJ: [
    { codigo: "LP", cargaHoraria: 3, obrigatoria: true, ordem: 1, categoriaFormacao: "formacao_geral" },
    { codigo: "ING", cargaHoraria: 3, obrigatoria: true, ordem: 2, categoriaFormacao: "formacao_geral" },
    { codigo: "MAT", cargaHoraria: 4, obrigatoria: true, ordem: 3, categoriaFormacao: "formacao_geral" },
    { codigo: "INF2", cargaHoraria: 4, obrigatoria: true, ordem: 4, categoriaFormacao: "formacao_geral" },
    { codigo: "EF", cargaHoraria: 2, obrigatoria: true, ordem: 5, categoriaFormacao: "formacao_geral" },
    { codigo: "FIL", cargaHoraria: 2, obrigatoria: true, ordem: 6, categoriaFormacao: "formacao_geral" },
    { codigo: "EMP", cargaHoraria: 2, obrigatoria: true, ordem: 7, categoriaFormacao: "formacao_geral" },
    { codigo: "IDIR", cargaHoraria: 3, obrigatoria: true, ordem: 8, categoriaFormacao: "formacao_especifica" },
    { codigo: "IECO", cargaHoraria: 3, obrigatoria: true, ordem: 9, categoriaFormacao: "formacao_especifica" },
    { codigo: "HIS2", cargaHoraria: 3, obrigatoria: true, ordem: 10, categoriaFormacao: "formacao_especifica" },
    { codigo: "GEO2", cargaHoraria: 3, obrigatoria: true, ordem: 11, categoriaFormacao: "formacao_especifica" },
    { codigo: "DES", cargaHoraria: 4, obrigatoria: true, ordem: 12, categoriaFormacao: "formacao_especifica" },
    { codigo: "ANT", cargaHoraria: 2, obrigatoria: false, ordem: 13, categoriaFormacao: "opcional" },
    { codigo: "SOC", cargaHoraria: 2, obrigatoria: false, ordem: 14, categoriaFormacao: "opcional" },
    { codigo: "PSI", cargaHoraria: 2, obrigatoria: false, ordem: 15, categoriaFormacao: "opcional" },
  ],
  CH: [
    { codigo: "LP", cargaHoraria: 4, obrigatoria: true, ordem: 1, categoriaFormacao: "formacao_geral" },
    { codigo: "ING", cargaHoraria: 3, obrigatoria: true, ordem: 2, categoriaFormacao: "formacao_geral" },
    { codigo: "MAT", cargaHoraria: 3, obrigatoria: true, ordem: 3, categoriaFormacao: "formacao_geral" },
    { codigo: "INF2", cargaHoraria: 4, obrigatoria: true, ordem: 4, categoriaFormacao: "formacao_geral" },
    { codigo: "EF", cargaHoraria: 2, obrigatoria: true, ordem: 5, categoriaFormacao: "formacao_geral" },
    { codigo: "FIL", cargaHoraria: 2, obrigatoria: true, ordem: 6, categoriaFormacao: "formacao_geral" },
    { codigo: "EMP", cargaHoraria: 2, obrigatoria: true, ordem: 7, categoriaFormacao: "formacao_geral" },
    { codigo: "FRA2", cargaHoraria: 4, obrigatoria: true, ordem: 8, categoriaFormacao: "formacao_especifica" },
    { codigo: "HIS2", cargaHoraria: 3, obrigatoria: true, ordem: 9, categoriaFormacao: "formacao_especifica" },
    { codigo: "GEO2", cargaHoraria: 3, obrigatoria: true, ordem: 10, categoriaFormacao: "formacao_especifica" },
    { codigo: "LIT", cargaHoraria: 2, obrigatoria: true, ordem: 11, categoriaFormacao: "formacao_especifica" },
    { codigo: "ANT", cargaHoraria: 2, obrigatoria: false, ordem: 12, categoriaFormacao: "opcional" },
    { codigo: "PSI", cargaHoraria: 2, obrigatoria: false, ordem: 13, categoriaFormacao: "opcional" },
    { codigo: "DES", cargaHoraria: 2, obrigatoria: false, ordem: 14, categoriaFormacao: "opcional" },
    { codigo: "SOC", cargaHoraria: 2, obrigatoria: false, ordem: 15, categoriaFormacao: "opcional" },
  ],
  AV: [
    { codigo: "LP", cargaHoraria: 3, obrigatoria: true, ordem: 1, categoriaFormacao: "formacao_geral" },
    { codigo: "ING", cargaHoraria: 3, obrigatoria: true, ordem: 2, categoriaFormacao: "formacao_geral" },
    { codigo: "MAT", cargaHoraria: 3, obrigatoria: true, ordem: 3, categoriaFormacao: "formacao_geral" },
    { codigo: "INF2", cargaHoraria: 4, obrigatoria: true, ordem: 4, categoriaFormacao: "formacao_geral" },
    { codigo: "EF", cargaHoraria: 2, obrigatoria: true, ordem: 5, categoriaFormacao: "formacao_geral" },
    { codigo: "FIL", cargaHoraria: 2, obrigatoria: true, ordem: 6, categoriaFormacao: "formacao_geral" },
    { codigo: "EMP", cargaHoraria: 2, obrigatoria: true, ordem: 7, categoriaFormacao: "formacao_geral" },
    { codigo: "DSN", cargaHoraria: 3, obrigatoria: true, ordem: 8, categoriaFormacao: "formacao_especifica" },
    { codigo: "TPD", cargaHoraria: 3, obrigatoria: true, ordem: 9, categoriaFormacao: "formacao_especifica" },
    { codigo: "GDE", cargaHoraria: 3, obrigatoria: true, ordem: 10, categoriaFormacao: "formacao_especifica" },
    { codigo: "HART", cargaHoraria: 3, obrigatoria: true, ordem: 11, categoriaFormacao: "formacao_especifica" },
    { codigo: "TEA", cargaHoraria: 4, obrigatoria: true, ordem: 12, categoriaFormacao: "formacao_especifica" },
    { codigo: "PSI", cargaHoraria: 2, obrigatoria: false, ordem: 13, categoriaFormacao: "opcional" },
    { codigo: "SOC", cargaHoraria: 2, obrigatoria: false, ordem: 14, categoriaFormacao: "opcional" },
  ],
};

async function main() {
  const client = await pool.connect();
  try {
    console.log("── Plano Curricular do Ensino Secundário Geral — INIDE/MED 2019 ──\n");

    // 1) Actualizar disciplinas exclusivas do I Ciclo já existentes
    console.log("1) A actualizar disciplinas do I Ciclo (7ª-9ª)...");
    for (const d of I_CICLO_UPDATES) {
      const r = await client.query(
        `UPDATE disciplinas SET "cargaHoraria" = $1, area = $2, descricao = $3 WHERE codigo = $4 RETURNING nome`,
        [d.cargaHoraria, d.area, d.descricao, d.codigo]
      );
      console.log(r.rowCount ? `   ✓ ${r.rows[0].nome} (${d.codigo}) actualizada` : `   ⚠ código ${d.codigo} não encontrado`);
    }

    // 2) Criar disciplinas em falta no I Ciclo
    console.log("\n2) A criar disciplinas em falta no I Ciclo...");
    for (const d of I_CICLO_NOVAS) {
      const exists = await client.query(`SELECT id FROM disciplinas WHERE codigo = $1`, [d.codigo]);
      if (exists.rowCount > 0) { console.log(`   • ${d.nome} (${d.codigo}) já existe — ignorado`); continue; }
      await client.query(
        `INSERT INTO disciplinas (nome, codigo, area, descricao, tipo, "classeInicio", "classeFim", "cargaHoraria", obrigatoria, "categoriaFormacao")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.nome, d.codigo, d.area, d.descricao, d.tipo, d.classeInicio, d.classeFim, d.cargaHoraria, d.obrigatoria, d.categoriaFormacao]
      );
      console.log(`   ✓ ${d.nome} (${d.codigo}) criada`);
    }

    // 3) Actualizar Empreendedorismo (disciplina única partilhada por I e II Ciclo — 7ª a 12ª,
    // mesma carga horária semanal de 2h em ambos os ciclos segundo o documento oficial)
    console.log("\n3) A ajustar Empreendedorismo (I e II Ciclo, 7ª-12ª classe)...");
    const emp = await client.query(
      `UPDATE disciplinas SET area = 'Formação Geral', "categoriaFormacao" = 'formacao_geral',
         "classeInicio" = '7ª Classe', "classeFim" = '12ª Classe', "cargaHoraria" = 2, tipo = 'continuidade',
         descricao = 'Plano Curricular INIDE/MED 2019 — I Ciclo (7ª-9ª): 2h/semana (Total 180h). II Ciclo Formação Geral (10ª-12ª): 2h/semana (Total 180h).'
       WHERE codigo = 'EMP' RETURNING nome`
    );
    console.log(emp.rowCount ? `   ✓ ${emp.rows[0].nome} actualizada` : `   ⚠ código EMP não encontrado`);

    // 4) Criar disciplinas novas do catálogo global (II Ciclo)
    console.log("\n4) A criar disciplinas do II Ciclo (Formação Geral/Específica/Opção)...");
    for (const d of II_CICLO_NOVAS) {
      const exists = await client.query(`SELECT id FROM disciplinas WHERE codigo = $1`, [d.codigo]);
      if (exists.rowCount > 0) { console.log(`   • ${d.nome} (${d.codigo}) já existe — ignorado`); continue; }
      await client.query(
        `INSERT INTO disciplinas (nome, codigo, area, tipo, "classeInicio", "classeFim", "categoriaFormacao")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [d.nome, d.codigo, d.area, d.tipo, d.classeInicio, d.classeFim, d.categoriaFormacao]
      );
      console.log(`   ✓ ${d.nome} (${d.codigo}) criada`);
    }

    // 5) Criar os 4 cursos (áreas de conhecimento) do II Ciclo
    console.log("\n5) A criar as 4 áreas de conhecimento do II Ciclo...");
    const cursoIds = {};
    for (const c of CURSOS_II_CICLO) {
      const existing = await client.query(`SELECT id FROM cursos WHERE codigo = $1`, [c.codigo]);
      if (existing.rowCount > 0) {
        cursoIds[c.codigo] = existing.rows[0].id;
        await client.query(
          `UPDATE cursos SET nome=$1, "areaFormacao"=$2, descricao=$3, duracao=$4, "cargaHoraria"=$5, portaria=$6, ementa=$7 WHERE id=$8`,
          [c.nome, c.areaFormacao, c.descricao, c.duracao, c.cargaHoraria, c.portaria, c.ementa, existing.rows[0].id]
        );
        console.log(`   • ${c.nome} (${c.codigo}) já existia — dados actualizados`);
        continue;
      }
      const ins = await client.query(
        `INSERT INTO cursos (nome, codigo, "areaFormacao", descricao, duracao, "cargaHoraria", portaria, ementa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [c.nome, c.codigo, c.areaFormacao, c.descricao, c.duracao, c.cargaHoraria, c.portaria, c.ementa]
      );
      cursoIds[c.codigo] = ins.rows[0].id;
      console.log(`   ✓ ${c.nome} (${c.codigo}) criado`);
    }

    // 6) Ligar disciplinas aos cursos (curso_disciplinas)
    console.log("\n6) A associar disciplinas aos cursos (curso_disciplinas)...");
    for (const [cursoCodigo, lista] of Object.entries(CURSO_DISCIPLINAS)) {
      const cursoId = cursoIds[cursoCodigo];
      if (!cursoId) { console.log(`   ⚠ curso ${cursoCodigo} não encontrado — a saltar`); continue; }
      for (const item of lista) {
        const discRes = await client.query(`SELECT id, nome FROM disciplinas WHERE codigo = $1`, [item.codigo]);
        if (discRes.rowCount === 0) { console.log(`   ⚠ disciplina ${item.codigo} não encontrada — a saltar`); continue; }
        const disciplinaId = discRes.rows[0].id;
        const already = await client.query(
          `SELECT id FROM curso_disciplinas WHERE "cursoId" = $1 AND "disciplinaId" = $2`,
          [cursoId, disciplinaId]
        );
        if (already.rowCount > 0) {
          await client.query(
            `UPDATE curso_disciplinas SET obrigatoria=$1, "cargaHoraria"=$2, ordem=$3, removida=false WHERE id=$4`,
            [item.obrigatoria, item.cargaHoraria, item.ordem, already.rows[0].id]
          );
          continue;
        }
        await client.query(
          `INSERT INTO curso_disciplinas ("cursoId", "disciplinaId", obrigatoria, "cargaHoraria", ordem)
           VALUES ($1,$2,$3,$4,$5)`,
          [cursoId, disciplinaId, item.obrigatoria, item.cargaHoraria, item.ordem]
        );
      }
      console.log(`   ✓ ${cursoCodigo}: ${lista.length} disciplinas associadas`);
    }

    console.log("\n✔ Seed do Plano Curricular concluído com sucesso.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("ERRO no seed do plano curricular:", err);
  process.exit(1);
});
