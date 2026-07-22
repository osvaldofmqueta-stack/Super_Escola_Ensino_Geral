/**
 * SIGA v3 — Seed completo de dados de escola
 * ─────────────────────────────────────────────
 * Insere:
 *  • 4 Cursos de II Ciclo + disciplinas ligadas
 *  • 15 Professores (4 com credenciais de acesso)
 *  • 27 Turmas (Primário, I Ciclo, II Ciclo)
 *  • ~1000 Alunos (3 com contas demo + ~997 em massa)
 *  • Notas dos 3 trimestres + Pautas fechadas para 13ª GI-A
 *  • Salas de aula
 *
 * Credenciais criadas:
 *  Chefe Secretaria : chefe.secretaria@escola.ao  / ChefSec@2025
 *  Professor        : prof.silva@escola.ao         / Prof@2025
 *  Prof + Dir Turma : prof.directora@escola.ao     / ProfDir@2025
 *  Director         : director@escola.ao            / Director@2025
 *  Aluno Primário   : aluno.primario@escola.ao     / Aluno@2025
 *  Aluno I Ciclo    : aluno.icilo@escola.ao         / Aluno@2025
 *  Aluno Finalista  : aluno.finalista@escola.ao    / Aluno@2025
 *
 * Uso: node scripts/seed-dados-escola.js
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf("=");
    if (sep <= 0) continue;
    const k = t.slice(0, sep).trim();
    const v = t.slice(sep + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) { console.error("ERRO: DATABASE_URL não definida."); process.exit(1); }
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ANO_LETIVO = "2025/2026";
const ESCOLA = "Escola Secundária N.º 1 de Luanda";
const DATA_HOJE = "2026-04-08";

// ─── GERADORES DE NOMES ───────────────────────────────────────────────────────
const NOMES_M = ["João","Pedro","António","Manuel","Francisco","Carlos","Miguel","David","Rafael","Luís","Filipe","José","Paulo","Rui","André","Bruno","Tomás","Eduardo","Mário","Victor","Daniel","Simão","Augusto","Helder","Adilson","Domingos","Euclides","Arnaldo","Belmiro","Celestino","Nuno","Agostinho","Sérgio","Jacinto","Bernardo","Afonso","Orlando","Benedito","Albino","Osvaldo"];
const NOMES_F = ["Maria","Ana","Sofia","Catarina","Filomena","Esperança","Graça","Paula","Joana","Sandra","Beatriz","Helena","Cláudia","Fernanda","Lurdes","Rosa","Teresa","Isabel","Cristina","Dulce","Carla","Aida","Conceição","Margarida","Susana","Vânia","Inês","Fátima","Yolanda","Olga","Lídia","Ângela","Leonor","Ilda","Amélia","Celeste","Regina","Verónica","Adelaide","Laurinda"];
const APELIDOS = ["Silva","Costa","Santos","Ferreira","Oliveira","Pereira","Souza","Lima","Nascimento","Carvalho","Mendes","Rodrigues","Alves","Dias","Neves","Cunha","Monteiro","Tavares","Moreira","Lopes","Fonseca","Cardoso","Teixeira","Pinto","Sousa","Martins","Freitas","Rocha","Gomes","Correia","Tomás","Gaspar","Simões","Pires","Antunes","Henriques","Matos","Ribeiro","Andrade","Miranda"];

const PROV = [
  { provincia: "Luanda",   municipios: ["Luanda","Viana","Belas","Cacuaco","Cazenga","Kilamba Kiaxi"] },
  { provincia: "Benguela", municipios: ["Benguela","Lobito","Catumbela"] },
  { provincia: "Huambo",   municipios: ["Huambo","Bailundo"] },
  { provincia: "Bié",      municipios: ["Cuíto","Camacupa"] },
  { provincia: "Malanje",  municipios: ["Malanje","Caculama"] },
  { provincia: "Huíla",    municipios: ["Lubango","Matala"] },
  { provincia: "Uíge",     municipios: ["Uíge","Maquela do Zombo"] },
];

function pick(arr, idx) { return arr[idx % arr.length]; }
function genAluno(i, turmaId, cursoId, classe, nivel) {
  const genero = i % 2 === 0 ? "M" : "F";
  const nomeArr = genero === "M" ? NOMES_M : NOMES_F;
  const nome = pick(nomeArr, Math.floor(i / 2));
  const apelido = pick(APELIDOS, i);
  const apelido2 = pick(APELIDOS, i + 7);
  const prov = pick(PROV, i);
  const mun = pick(prov.municipios, i);

  // Birth year based on class
  const classNum = parseInt(String(classe).replace(/[^\d]/g, "")) || 10;
  const baseYear = 2026 - classNum - 6;
  const bYear = baseYear + (i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1);
  const bMonth = String((i % 12) + 1).padStart(2, "0");
  const bDay = String((i % 28) + 1).padStart(2, "0");

  return {
    numeroMatricula: `BULK-${String(i + 1).padStart(4, "0")}`,
    nome,
    apelido: `${apelido} ${apelido2}`,
    dataNascimento: `${bYear}-${bMonth}-${bDay}`,
    genero,
    provincia: prov.provincia,
    municipio: mun,
    turmaId,
    cursoId,
    nomeEncarregado: `${pick(NOMES_F, i + 5)} ${apelido}`,
    telefoneEncarregado: `+244 9${String(20 + (i % 80)).padStart(2,"0")} ${String(100000 + i).padStart(6,"0")}`,
  };
}

// ─── CURSOS ───────────────────────────────────────────────────────────────────
const CURSOS = [
  { id: "curso-gi",  nome: "Gestão Informática",   codigo: "GI",  areaFormacao: "Informática",  descricao: "Curso de Gestão Informática — II Ciclo",   cargaHoraria: 1200, duracao: "3 anos (11ª–13ª)" },
  { id: "curso-ce",  nome: "Ciências Económicas",   codigo: "CE",  areaFormacao: "Economia",     descricao: "Curso de Ciências Económicas — II Ciclo",   cargaHoraria: 1200, duracao: "3 anos (11ª–13ª)" },
  { id: "curso-ct",  nome: "Ciências e Tecnologia", codigo: "CT",  areaFormacao: "Ciências",     descricao: "Curso de Ciências e Tecnologia — II Ciclo", cargaHoraria: 1200, duracao: "3 anos (11ª–13ª)" },
  { id: "curso-hum", nome: "Humanidades e Letras",  codigo: "HUM", areaFormacao: "Humanidades",  descricao: "Curso de Humanidades e Letras — II Ciclo",  cargaHoraria: 1200, duracao: "3 anos (11ª–13ª)" },
];

// ─── DISCIPLINAS ──────────────────────────────────────────────────────────────
const DISC_GLOBAL = [
  { id: "disc-lp",   nome: "Língua Portuguesa",      codigo: "LP",   area: "Línguas",          cargaHoraria: 4 },
  { id: "disc-mat",  nome: "Matemática",              codigo: "MAT",  area: "Ciências Exatas",  cargaHoraria: 4 },
  { id: "disc-ing",  nome: "Inglês",                  codigo: "ING",  area: "Línguas",          cargaHoraria: 3 },
  { id: "disc-ef",   nome: "Educação Física",         codigo: "EF",   area: "Desporto",         cargaHoraria: 2 },
  { id: "disc-hist", nome: "História",                codigo: "HIS",  area: "Ciências Sociais", cargaHoraria: 3 },
  { id: "disc-geo",  nome: "Geografia",               codigo: "GEO",  area: "Ciências Sociais", cargaHoraria: 3 },
  { id: "disc-cnat", nome: "Ciências da Natureza",    codigo: "CNAT", area: "Ciências",         cargaHoraria: 3 },
  { id: "disc-emc",  nome: "Educação Moral e Cívica", codigo: "EMC",  area: "Formação Geral",   cargaHoraria: 2 },
  { id: "disc-evis", nome: "Educação Visual",         codigo: "EV",   area: "Artes",            cargaHoraria: 2 },
  { id: "disc-emp",  nome: "Educação Manual",         codigo: "EMP",  area: "Artes",            cargaHoraria: 2 },
  { id: "disc-fis",  nome: "Física",                  codigo: "FIS",  area: "Ciências",         cargaHoraria: 4 },
  { id: "disc-qui",  nome: "Química",                 codigo: "QUI",  area: "Ciências",         cargaHoraria: 4 },
  { id: "disc-bio",  nome: "Biologia",                codigo: "BIO",  area: "Ciências",         cargaHoraria: 3 },
];

// Disciplinas específicas de Gestão Informática (ligadas ao curso)
const DISC_GI = [
  { id: "disc-gi-info", nome: "Informática de Gestão", codigo: "IG",   area: "Informática",    cargaHoraria: 5, cursoId: "curso-gi" },
  { id: "disc-gi-cont", nome: "Contabilidade Geral",   codigo: "CONT", area: "Contabilidade",  cargaHoraria: 4, cursoId: "curso-gi" },
  { id: "disc-gi-eco",  nome: "Economia",              codigo: "ECO",  area: "Economia",       cargaHoraria: 3, cursoId: "curso-gi" },
  { id: "disc-gi-prog", nome: "Programação",           codigo: "PROG", area: "Informática",    cargaHoraria: 5, cursoId: "curso-gi" },
  { id: "disc-gi-si",   nome: "Sistemas de Informação",codigo: "SI",   area: "Informática",    cargaHoraria: 4, cursoId: "curso-gi" },
  { id: "disc-gi-bd",   nome: "Bases de Dados",        codigo: "BD",   area: "Informática",    cargaHoraria: 4, cursoId: "curso-gi" },
  { id: "disc-gi-redes",nome: "Redes e Comunicações",  codigo: "RC",   area: "Informática",    cargaHoraria: 3, cursoId: "curso-gi" },
];

const DISC_CE = [
  { id: "disc-ce-ep",   nome: "Economia Política",       codigo: "EP",  area: "Economia",       cargaHoraria: 4, cursoId: "curso-ce" },
  { id: "disc-ce-cg",   nome: "Contabilidade e Gestão",  codigo: "CG",  area: "Contabilidade",  cargaHoraria: 4, cursoId: "curso-ce" },
  { id: "disc-ce-dir",  nome: "Direito Comercial",       codigo: "DC",  area: "Direito",        cargaHoraria: 3, cursoId: "curso-ce" },
  { id: "disc-ce-est",  nome: "Estatística",             codigo: "EST", area: "Ciências Exatas",cargaHoraria: 3, cursoId: "curso-ce" },
];

const DISC_CT = [
  { id: "disc-ct-fis",  nome: "Física Aplicada",         codigo: "FA",  area: "Ciências",       cargaHoraria: 4, cursoId: "curso-ct" },
  { id: "disc-ct-qui",  nome: "Química Aplicada",        codigo: "QA",  area: "Ciências",       cargaHoraria: 4, cursoId: "curso-ct" },
  { id: "disc-ct-bio",  nome: "Biologia Aplicada",       codigo: "BA",  area: "Ciências",       cargaHoraria: 3, cursoId: "curso-ct" },
];

const DISC_HUM = [
  { id: "disc-hum-fil", nome: "Filosofia",    codigo: "FIL", area: "Humanidades",     cargaHoraria: 3, cursoId: "curso-hum" },
  { id: "disc-hum-soc", nome: "Sociologia",   codigo: "SOC", area: "Ciências Sociais",cargaHoraria: 3, cursoId: "curso-hum" },
  { id: "disc-hum-lit", nome: "Literatura",   codigo: "LIT", area: "Línguas",         cargaHoraria: 4, cursoId: "curso-hum" },
];

// Disciplinas do 13ª GI-A que aparecem nas notas e pautas
const GI_DISC_NOMES = [
  "Língua Portuguesa", "Matemática", "Inglês",
  "Informática de Gestão", "Contabilidade Geral", "Economia",
  "Programação", "Sistemas de Informação",
];

// ─── SALAS ────────────────────────────────────────────────────────────────────
const SALAS = [
  { id: "sala-a1", nome: "Sala A1",        bloco: "A", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-a2", nome: "Sala A2",        bloco: "A", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-a3", nome: "Sala A3",        bloco: "A", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-b1", nome: "Sala B1",        bloco: "B", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-b2", nome: "Sala B2",        bloco: "B", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-b3", nome: "Sala B3",        bloco: "B", capacidade: 40, tipo: "Sala Normal" },
  { id: "sala-li1",nome: "Lab. Informática 1", bloco: "C", capacidade: 30, tipo: "Sala de Informática" },
  { id: "sala-li2",nome: "Lab. Informática 2", bloco: "C", capacidade: 30, tipo: "Sala de Informática" },
  { id: "sala-lc", nome: "Lab. Ciências",  bloco: "C", capacidade: 25, tipo: "Laboratório" },
  { id: "sala-aud",nome: "Auditório",      bloco: "D", capacidade: 200,tipo: "Auditório" },
];

// ─── UTILIZADORES STAFF ────────────────────────────────────────────────────────
const UTIL_STAFF = [
  { id: "util-chefe-sec",   nome: "Celeste Baptista",      email: "chefe.secretaria@escola.ao", senha: "ChefSec@2025",   role: "chefe_secretaria" },
  { id: "util-prof-silva",  nome: "António da Silva",      email: "prof.silva@escola.ao",       senha: "Prof@2025",      role: "professor" },
  { id: "util-prof-beatriz",nome: "Beatriz Fernandes",     email: "prof.directora@escola.ao",   senha: "ProfDir@2025",   role: "professor" },
  { id: "util-director",    nome: "Amílcar Nzinga Lopes",  email: "director@escola.ao",          senha: "Director@2025",  role: "director" },
];

// ─── UTILIZADORES ALUNOS DEMO ─────────────────────────────────────────────────
const UTIL_ALUNOS = [
  { id: "util-aluno-prim",  nome: "João Manuel Costa",    email: "aluno.primario@escola.ao",  senha: "Aluno@2025", role: "aluno" },
  { id: "util-aluno-icilo", nome: "Maria Fernanda Silva", email: "aluno.icilo@escola.ao",      senha: "Aluno@2025", role: "aluno" },
  { id: "util-aluno-final", nome: "Carlos Alberto Tomás", email: "aluno.finalista@escola.ao",  senha: "Aluno@2025", role: "aluno" },
];

// ─── PROFESSORES ──────────────────────────────────────────────────────────────
const PROFESSORES = [
  { id: "prof-antonio",  numP: "PROF-001", nome: "António",  apelido: "da Silva",         email: "prof.silva@escola.ao",       tel: "+244 923 456 789", hab: "Licenciatura em Língua Portuguesa", disc: ["Língua Portuguesa","Literatura"],        nivel: "II Ciclo",  util: "util-prof-silva",  salario: 250000 },
  { id: "prof-beatriz",  numP: "PROF-002", nome: "Beatriz",  apelido: "Fernandes",         email: "prof.directora@escola.ao",   tel: "+244 924 567 890", hab: "Licenciatura em Informática e Gestão", disc: ["Sistemas de Informação","Informática de Gestão"], nivel: "II Ciclo", util: "util-prof-beatriz", salario: 280000 },
  { id: "prof-jose",     numP: "PROF-003", nome: "José",     apelido: "Manuel Gonçalves",  email: "jose.goncalves@escola.ao",   tel: "+244 912 111 001", hab: "Licenciatura em Educação Primária",    disc: ["Língua Portuguesa","Matemática","Ciências da Natureza"], nivel: "Primário", util: null, salario: 200000 },
  { id: "prof-paulo",    numP: "PROF-004", nome: "Paulo",    apelido: "Rodrigues Sousa",   email: "paulo.rodrigues@escola.ao",  tel: "+244 912 111 002", hab: "Licenciatura em Ciências Sociais",     disc: ["História","Geografia","Educação Moral e Cívica"], nivel: "I Ciclo",  util: null, salario: 220000 },
  { id: "prof-carlos",   numP: "PROF-005", nome: "Carlos",   apelido: "Sousa Mendes",      email: "carlos.sousa@escola.ao",     tel: "+244 912 111 003", hab: "Licenciatura em Matemática",           disc: ["Matemática","Estatística"],              nivel: "II Ciclo",  util: null, salario: 240000 },
  { id: "prof-maria-h",  numP: "PROF-006", nome: "Maria",    apelido: "Helena Teixeira",   email: "maria.helena@escola.ao",     tel: "+244 912 111 004", hab: "Licenciatura em Língua Inglesa",        disc: ["Inglês"],                                nivel: "II Ciclo",  util: null, salario: 230000 },
  { id: "prof-pedro",    numP: "PROF-007", nome: "Pedro",    apelido: "Costa Fonseca",     email: "pedro.costa@escola.ao",      tel: "+244 912 111 005", hab: "Mestrado em Engenharia Informática",    disc: ["Informática de Gestão","Programação","Bases de Dados"], nivel: "II Ciclo", util: null, salario: 300000 },
  { id: "prof-fernanda", numP: "PROF-008", nome: "Fernanda", apelido: "Lopes Nunes",       email: "fernanda.lopes@escola.ao",   tel: "+244 912 111 006", hab: "Licenciatura em Contabilidade e Finanças", disc: ["Contabilidade Geral","Economia","Economia Política"], nivel: "II Ciclo", util: null, salario: 260000 },
  { id: "prof-eduardo",  numP: "PROF-009", nome: "Eduardo",  apelido: "Mendes da Silva",   email: "eduardo.mendes@escola.ao",   tel: "+244 912 111 007", hab: "Licenciatura em História e Geografia",  disc: ["História","Geografia"],                  nivel: "I Ciclo",  util: null, salario: 220000 },
  { id: "prof-rosa",     numP: "PROF-010", nome: "Rosa",     apelido: "Cardoso",            email: "rosa.cardoso@escola.ao",     tel: "+244 912 111 008", hab: "Licenciatura em Biologia",              disc: ["Ciências da Natureza","Biologia"],        nivel: "Primário", util: null, salario: 210000 },
  { id: "prof-tomas",    numP: "PROF-011", nome: "Tomás",    apelido: "Neves Pereira",     email: "tomas.neves@escola.ao",      tel: "+244 912 111 009", hab: "Licenciatura em Educação Física",       disc: ["Educação Física"],                       nivel: "I Ciclo",  util: null, salario: 200000 },
  { id: "prof-ana",      numP: "PROF-012", nome: "Ana",      apelido: "Pinto Alves",       email: "ana.pinto@escola.ao",        tel: "+244 912 111 010", hab: "Licenciatura em Português",             disc: ["Língua Portuguesa","Educação Moral e Cívica"], nivel: "I Ciclo", util: null, salario: 220000 },
  { id: "prof-rui",      numP: "PROF-013", nome: "Rui",      apelido: "Marques Ferreira",  email: "rui.marques@escola.ao",      tel: "+244 912 111 011", hab: "Licenciatura em Física-Química",        disc: ["Física","Química","Física Aplicada","Química Aplicada"], nivel: "II Ciclo", util: null, salario: 250000 },
  { id: "prof-sandra",   numP: "PROF-014", nome: "Sandra",   apelido: "Lima Rodrigues",    email: "sandra.lima@escola.ao",      tel: "+244 912 111 012", hab: "Licenciatura em Ciências Económicas",   disc: ["Economia Política","Contabilidade e Gestão","Direito Comercial"], nivel: "II Ciclo", util: null, salario: 260000 },
  { id: "prof-david",    numP: "PROF-015", nome: "David",    apelido: "Rocha Monteiro",    email: "david.rocha@escola.ao",      tel: "+244 912 111 013", hab: "Licenciatura em Filosofia e Sociologia", disc: ["Filosofia","Sociologia","Literatura"], nivel: "II Ciclo", util: null, salario: 220000 },
];

// ─── TURMAS ───────────────────────────────────────────────────────────────────
// profIds dos professores que leccionam em cada turma (professoresIds JSONB)
const TURMAS = [
  // PRIMÁRIO
  { id: "turma-4-a",     nome: "4ª A",     classe: "4ª Classe",  turno: "Manhã", nivel: "Primário", dirId: "prof-jose",    curso: null,        sala: "Sala A1",         cap: 35, profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-4-b",     nome: "4ª B",     classe: "4ª Classe",  turno: "Tarde", nivel: "Primário", dirId: "prof-rosa",    curso: null,        sala: "Sala A2",         cap: 35, profs: ["prof-rosa","prof-jose","prof-tomas"] },
  { id: "turma-5-a",     nome: "5ª A",     classe: "5ª Classe",  turno: "Manhã", nivel: "Primário", dirId: "prof-jose",    curso: null,        sala: "Sala A3",         cap: 35, profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-5-b",     nome: "5ª B",     classe: "5ª Classe",  turno: "Tarde", nivel: "Primário", dirId: "prof-rosa",    curso: null,        sala: "Sala B1",         cap: 35, profs: ["prof-rosa","prof-jose","prof-tomas"] },
  { id: "turma-6-a",     nome: "6ª A",     classe: "6ª Classe",  turno: "Manhã", nivel: "Primário", dirId: "prof-jose",    curso: null,        sala: "Sala B2",         cap: 35, profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-6-b",     nome: "6ª B",     classe: "6ª Classe",  turno: "Tarde", nivel: "Primário", dirId: "prof-rosa",    curso: null,        sala: "Sala B3",         cap: 35, profs: ["prof-rosa","prof-jose","prof-tomas"] },
  // I CICLO
  { id: "turma-7-a",     nome: "7ª A",     classe: "7ª Classe",  turno: "Manhã", nivel: "I Ciclo",  dirId: "prof-paulo",   curso: null,        sala: "Sala A1",         cap: 35, profs: ["prof-paulo","prof-ana","prof-eduardo","prof-maria-h","prof-tomas"] },
  { id: "turma-7-b",     nome: "7ª B",     classe: "7ª Classe",  turno: "Tarde", nivel: "I Ciclo",  dirId: "prof-ana",     curso: null,        sala: "Sala A2",         cap: 35, profs: ["prof-ana","prof-paulo","prof-eduardo","prof-maria-h","prof-tomas"] },
  { id: "turma-8-a",     nome: "8ª A",     classe: "8ª Classe",  turno: "Manhã", nivel: "I Ciclo",  dirId: "prof-paulo",   curso: null,        sala: "Sala A3",         cap: 35, profs: ["prof-paulo","prof-ana","prof-eduardo","prof-maria-h","prof-carlos","prof-tomas"] },
  { id: "turma-8-b",     nome: "8ª B",     classe: "8ª Classe",  turno: "Tarde", nivel: "I Ciclo",  dirId: "prof-ana",     curso: null,        sala: "Sala B1",         cap: 35, profs: ["prof-ana","prof-paulo","prof-carlos","prof-tomas"] },
  { id: "turma-9-a",     nome: "9ª A",     classe: "9ª Classe",  turno: "Manhã", nivel: "I Ciclo",  dirId: "prof-paulo",   curso: null,        sala: "Sala B2",         cap: 35, profs: ["prof-paulo","prof-eduardo","prof-carlos","prof-maria-h","prof-tomas"] },
  { id: "turma-9-b",     nome: "9ª B",     classe: "9ª Classe",  turno: "Tarde", nivel: "I Ciclo",  dirId: "prof-eduardo", curso: null,        sala: "Sala B3",         cap: 35, profs: ["prof-eduardo","prof-ana","prof-carlos","prof-tomas"] },
  // II CICLO — Gestão Informática
  { id: "turma-10-gi-a", nome: "10ª GI-A", classe: "10ª Classe", turno: "Manhã", nivel: "II Ciclo", dirId: "prof-pedro",   curso: "curso-gi",  sala: "Lab. Informática 1", cap: 35, profs: ["prof-pedro","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-10-gi-b", nome: "10ª GI-B", classe: "10ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-carlos",  curso: "curso-gi",  sala: "Lab. Informática 2", cap: 35, profs: ["prof-carlos","prof-pedro","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-gi-a", nome: "11ª GI-A", classe: "11ª Classe", turno: "Manhã", nivel: "II Ciclo", dirId: "prof-beatriz", curso: "curso-gi",  sala: "Lab. Informática 1", cap: 35, profs: ["prof-beatriz","prof-pedro","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-gi-b", nome: "11ª GI-B", classe: "11ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-pedro",   curso: "curso-gi",  sala: "Lab. Informática 2", cap: 35, profs: ["prof-pedro","prof-beatriz","prof-carlos","prof-tomas"] },
  { id: "turma-12-gi-a", nome: "12ª GI-A", classe: "12ª Classe", turno: "Manhã", nivel: "II Ciclo", dirId: "prof-carlos",  curso: "curso-gi",  sala: "Lab. Informática 1", cap: 35, profs: ["prof-carlos","prof-pedro","prof-beatriz","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-13-gi-a", nome: "13ª GI-A", classe: "13ª Classe", turno: "Manhã", nivel: "II Ciclo", dirId: "prof-beatriz", curso: "curso-gi",  sala: "Lab. Informática 1", cap: 35, profs: ["prof-beatriz","prof-antonio","prof-carlos","prof-maria-h","prof-pedro","prof-fernanda","prof-tomas"] },
  // II CICLO — Ciências Económicas
  { id: "turma-10-ce-a", nome: "10ª CE-A", classe: "10ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-sandra",  curso: "curso-ce",  sala: "Sala A1",         cap: 35, profs: ["prof-sandra","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-ce-a", nome: "11ª CE-A", classe: "11ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-sandra",  curso: "curso-ce",  sala: "Sala A2",         cap: 35, profs: ["prof-sandra","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-12-ce-a", nome: "12ª CE-A", classe: "12ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-fernanda",curso: "curso-ce",  sala: "Sala A3",         cap: 35, profs: ["prof-fernanda","prof-sandra","prof-carlos","prof-tomas"] },
  { id: "turma-13-ce-a", nome: "13ª CE-A", classe: "13ª Classe", turno: "Tarde", nivel: "II Ciclo", dirId: "prof-sandra",  curso: "curso-ce",  sala: "Sala B1",         cap: 35, profs: ["prof-sandra","prof-fernanda","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  // II CICLO — Ciências e Tecnologia
  { id: "turma-10-ct-a", nome: "10ª CT-A", classe: "10ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-rui",     curso: "curso-ct",  sala: "Lab. Ciências",   cap: 30, profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-11-ct-a", nome: "11ª CT-A", classe: "11ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-rui",     curso: "curso-ct",  sala: "Lab. Ciências",   cap: 30, profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-12-ct-a", nome: "12ª CT-A", classe: "12ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-rui",     curso: "curso-ct",  sala: "Lab. Ciências",   cap: 30, profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  // II CICLO — Humanidades
  { id: "turma-10-hum-a",nome: "10ª HUM-A",classe: "10ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-david",   curso: "curso-hum", sala: "Sala B2",         cap: 35, profs: ["prof-david","prof-antonio","prof-carlos","prof-maria-h","prof-tomas"] },
  { id: "turma-11-hum-a",nome: "11ª HUM-A",classe: "11ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-david",   curso: "curso-hum", sala: "Sala B3",         cap: 35, profs: ["prof-david","prof-antonio","prof-carlos","prof-maria-h","prof-tomas"] },
  { id: "turma-13-ct-a", nome: "13ª CT-A", classe: "13ª Classe", turno: "Noite", nivel: "II Ciclo", dirId: "prof-rui",     curso: "curso-ct",  sala: "Lab. Ciências",   cap: 30, profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
];

// ─── ALUNOS DEMO ──────────────────────────────────────────────────────────────
const ALUNOS_DEMO = [
  {
    id: "aluno-prim-001",
    numeroMatricula: "MTR-PRIM-001",
    nome: "João Manuel", apelido: "Costa",
    dataNascimento: "2016-03-15", genero: "M",
    provincia: "Luanda", municipio: "Luanda",
    turmaId: "turma-4-a", cursoId: null,
    nomeEncarregado: "Manuel António Costa",
    telefoneEncarregado: "+244 923 100 001",
    emailEncarregado: "enc.joao.costa@gmail.com",
    utilizadorId: "util-aluno-prim",
  },
  {
    id: "aluno-icilo-001",
    numeroMatricula: "MTR-ICIL-001",
    nome: "Maria Fernanda", apelido: "Silva",
    dataNascimento: "2011-07-22", genero: "F",
    provincia: "Luanda", municipio: "Viana",
    turmaId: "turma-7-a", cursoId: null,
    nomeEncarregado: "Fernanda dos Santos Silva",
    telefoneEncarregado: "+244 923 100 002",
    emailEncarregado: "enc.maria.silva@gmail.com",
    utilizadorId: "util-aluno-icilo",
  },
  {
    id: "aluno-final-001",
    numeroMatricula: "MTR-GI-0001",
    nome: "Carlos Alberto", apelido: "Tomás",
    dataNascimento: "2005-11-08", genero: "M",
    provincia: "Luanda", municipio: "Belas",
    turmaId: "turma-13-gi-a", cursoId: "curso-gi",
    nomeEncarregado: "Alberto Simão Tomás",
    telefoneEncarregado: "+244 923 100 003",
    emailEncarregado: "enc.carlos.tomas@gmail.com",
    utilizadorId: "util-aluno-final",
  },
];

// Professores por disciplina na turma 13ª GI-A
const GI_PROF_MAP = {
  "Língua Portuguesa":     "prof-antonio",
  "Matemática":            "prof-carlos",
  "Inglês":                "prof-maria-h",
  "Informática de Gestão": "prof-pedro",
  "Contabilidade Geral":   "prof-fernanda",
  "Economia":              "prof-fernanda",
  "Programação":           "prof-pedro",
  "Sistemas de Informação":"prof-beatriz",
};

// ─── DISTRIBUIÇÃO DE ALUNOS EM MASSA ─────────────────────────────────────────
// Cada turma recebe ~35 alunos (excluindo os demo já inseridos)
function buildDistribuicao() {
  const dist = [];
  // Excluir turmas dos demos (inserimos apenas os lugares restantes)
  const skipFirst = new Set(["turma-4-a","turma-7-a","turma-13-gi-a"]);
  for (const t of TURMAS) {
    const qtd = skipFirst.has(t.id) ? t.cap - 1 : t.cap;
    dist.push({ turmaId: t.id, cursoId: t.curso, classe: t.classe, nivel: t.nivel, qtd });
  }
  return dist;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. SALAS ──────────────────────────────────────────────────────────────
    console.log("→ Salas...");
    for (const s of SALAS) {
      await client.query(
        `INSERT INTO public.salas (id, nome, bloco, capacidade, tipo, ativo)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, capacidade=EXCLUDED.capacidade`,
        [s.id, s.nome, s.bloco, s.capacidade, s.tipo]
      );
    }
    console.log(`   ✓ ${SALAS.length} salas`);

    // ── 2. CURSOS ─────────────────────────────────────────────────────────────
    console.log("→ Cursos...");
    for (const c of CURSOS) {
      await client.query(
        `INSERT INTO public.cursos (id, nome, codigo, "areaFormacao", descricao, ativo, "cargaHoraria", duracao)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7)
         ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, codigo=EXCLUDED.codigo`,
        [c.id, c.nome, c.codigo, c.areaFormacao, c.descricao, c.cargaHoraria, c.duracao]
      );
    }
    console.log(`   ✓ ${CURSOS.length} cursos`);

    // ── 3. DISCIPLINAS ────────────────────────────────────────────────────────
    console.log("→ Disciplinas...");
    const allDisc = [
      ...DISC_GLOBAL.map(d => ({ ...d, cursoId: null })),
      ...DISC_GI, ...DISC_CE, ...DISC_CT, ...DISC_HUM,
    ];
    const allDiscNomes = allDisc.map(d => d.nome);
    const allDiscIds   = allDisc.map(d => d.id);

    // Remove conflicting records: same nome but different id (from previous runs)
    // First, clean up curso_disciplinas for the IDs we're about to re-insert
    await client.query(
      `DELETE FROM public.curso_disciplinas WHERE "disciplinaId" IN (
         SELECT id FROM public.disciplinas WHERE nome = ANY($1::text[]) AND id != ALL($2::text[])
       )`,
      [allDiscNomes, allDiscIds]
    );
    // Remove disciplinas with matching names but different IDs (stale from old runs)
    await client.query(
      `DELETE FROM public.disciplinas WHERE nome = ANY($1::text[]) AND id != ALL($2::text[])`,
      [allDiscNomes, allDiscIds]
    );

    for (const d of allDisc) {
      await client.query(
        `INSERT INTO public.disciplinas (id, nome, codigo, area, "cargaHoraria", ativo, "cursoId", obrigatoria, ordem)
         VALUES ($1,$2,$3,$4,$5,true,$6,true,0)
         ON CONFLICT (id) DO UPDATE SET
           nome=EXCLUDED.nome, codigo=EXCLUDED.codigo,
           area=EXCLUDED.area, "cargaHoraria"=EXCLUDED."cargaHoraria",
           "cursoId"=EXCLUDED."cursoId"`,
        [d.id, d.nome, d.codigo, d.area, d.cargaHoraria, d.cursoId || null]
      );
    }
    console.log(`   ✓ ${allDisc.length} disciplinas`);

    // ── 4. CURSO_DISCIPLINAS ──────────────────────────────────────────────────
    console.log("→ Ligações curso↔disciplina...");
    const cursodiscs = [
      // GI: LP, MAT, ING, EF + disciplinas específicas
      ...["disc-lp","disc-mat","disc-ing","disc-ef"].map((did, i) => ({ cid: "curso-gi", did, ordem: i + 1 })),
      ...DISC_GI.map((d, i) => ({ cid: "curso-gi", did: d.id, ordem: 10 + i })),
      // CE: LP, MAT, ING, EF, HIST + disciplinas específicas
      ...["disc-lp","disc-mat","disc-ing","disc-ef","disc-hist"].map((did, i) => ({ cid: "curso-ce", did, ordem: i + 1 })),
      ...DISC_CE.map((d, i) => ({ cid: "curso-ce", did: d.id, ordem: 10 + i })),
      // CT: LP, MAT, ING, EF, FIS, QUI, BIO + disciplinas específicas
      ...["disc-lp","disc-mat","disc-ing","disc-ef","disc-fis","disc-qui","disc-bio"].map((did, i) => ({ cid: "curso-ct", did, ordem: i + 1 })),
      ...DISC_CT.map((d, i) => ({ cid: "curso-ct", did: d.id, ordem: 10 + i })),
      // HUM: LP, MAT, ING, EF, HIST, GEO + disciplinas específicas
      ...["disc-lp","disc-mat","disc-ing","disc-ef","disc-hist","disc-geo"].map((did, i) => ({ cid: "curso-hum", did, ordem: i + 1 })),
      ...DISC_HUM.map((d, i) => ({ cid: "curso-hum", did: d.id, ordem: 10 + i })),
    ];
    for (const cd of cursodiscs) {
      await client.query(
        `INSERT INTO public.curso_disciplinas ("cursoId","disciplinaId",obrigatoria,"cargaHoraria",ordem,removida)
         VALUES ($1,$2,true,4,$3,false)
         ON CONFLICT DO NOTHING`,
        [cd.cid, cd.did, cd.ordem]
      );
    }
    console.log(`   ✓ ${cursodiscs.length} ligações`);

    // ── 5. UTILIZADORES STAFF ─────────────────────────────────────────────────
    console.log("→ Utilizadores staff...");
    for (const u of [...UTIL_STAFF, ...UTIL_ALUNOS]) {
      await client.query(
        `INSERT INTO public.utilizadores (id, nome, email, senha, role, escola, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.nome, u.email, u.senha, u.role, ESCOLA]
      );
      // Also handle email conflict (someone may have same email from another seed)
      await client.query(
        `UPDATE public.utilizadores SET nome=$1, senha=$2, role=$3, escola=$4
         WHERE email=$5 AND id!=$6`,
        [u.nome, u.senha, u.role, ESCOLA, u.email, u.id]
      ).catch(() => {});
    }
    console.log(`   ✓ ${UTIL_STAFF.length + UTIL_ALUNOS.length} utilizadores`);

    // ── 6. PROFESSORES ────────────────────────────────────────────────────────
    console.log("→ Professores...");
    for (const p of PROFESSORES) {
      await client.query(
        `INSERT INTO public.professores
           (id, "numeroProfessor", nome, apelido, email, telefone, habilitacoes,
            disciplinas, "turmasIds", "nivelEnsino", ativo, "salarioBase",
            "subsidioAlimentacao", "subsidioTransporte", "dataContratacao", "tipoContrato")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,true,$11,15000,8000,'2020-01-15','efectivo')
         ON CONFLICT (email) DO UPDATE SET
           nome=EXCLUDED.nome, apelido=EXCLUDED.apelido,
           disciplinas=EXCLUDED.disciplinas, "nivelEnsino"=EXCLUDED."nivelEnsino"`,
        [
          p.id, p.numP, p.nome, p.apelido, p.email, p.tel, p.hab,
          JSON.stringify(p.disc),
          JSON.stringify([]),
          p.nivel, p.salario,
        ]
      );
      // Link utilizadorId if exists
      if (p.util) {
        await client.query(
          `UPDATE public.professores SET "utilizadorId"=$1 WHERE id=$2`,
          [p.util, p.id]
        ).catch(() => {});
      }
    }
    console.log(`   ✓ ${PROFESSORES.length} professores`);

    // ── 7. TURMAS ─────────────────────────────────────────────────────────────
    console.log("→ Turmas...");
    for (const t of TURMAS) {
      await client.query(
        `INSERT INTO public.turmas
           (id, nome, classe, turno, "anoLetivo", nivel, "professorId", "professoresIds", "cursoId", sala, capacidade, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,true)
         ON CONFLICT (id) DO UPDATE SET
           nome=EXCLUDED.nome, "professorId"=EXCLUDED."professorId",
           "professoresIds"=EXCLUDED."professoresIds"`,
        [t.id, t.nome, t.classe, t.turno, ANO_LETIVO, t.nivel,
         t.dirId, JSON.stringify(t.profs), t.curso || null, t.sala, t.cap]
      );
    }
    console.log(`   ✓ ${TURMAS.length} turmas`);

    // ── 8. ALUNOS DEMO ────────────────────────────────────────────────────────
    console.log("→ Alunos demo...");
    for (const a of ALUNOS_DEMO) {
      await client.query(
        `INSERT INTO public.alunos
           (id, "numeroMatricula", nome, apelido, "dataNascimento", genero,
            provincia, municipio, "turmaId", "cursoId",
            "nomeEncarregado", "telefoneEncarregado", "emailEncarregado",
            ativo, bloqueado, "utilizadorId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,false,$14)
         ON CONFLICT (id) DO UPDATE SET
           "turmaId"=EXCLUDED."turmaId",
           "utilizadorId"=EXCLUDED."utilizadorId"`,
        [a.id, a.numeroMatricula, a.nome, a.apelido, a.dataNascimento, a.genero,
         a.provincia, a.municipio, a.turmaId, a.cursoId || null,
         a.nomeEncarregado, a.telefoneEncarregado, a.emailEncarregado || null,
         a.utilizadorId]
      );
    }
    console.log(`   ✓ ${ALUNOS_DEMO.length} alunos demo`);

    // ── 9. ALUNOS EM MASSA (~1000) ────────────────────────────────────────────
    console.log("→ Alunos em massa (a remover duplicados BULK anteriores)...");
    // First remove dependent records to avoid FK violations
    await client.query(
      `DELETE FROM public.pagamentos WHERE "alunoId" IN (SELECT id FROM public.alunos WHERE "numeroMatricula" LIKE 'BULK-%')`
    );
    await client.query(
      `DELETE FROM public.notas WHERE "alunoId" IN (SELECT id FROM public.alunos WHERE "numeroMatricula" LIKE 'BULK-%')`
    );
    await client.query(
      `DELETE FROM public.presencas WHERE "alunoId" IN (SELECT id FROM public.alunos WHERE "numeroMatricula" LIKE 'BULK-%')`
    );
    await client.query(
      `DELETE FROM public.alunos WHERE "numeroMatricula" LIKE 'BULK-%'`
    );

    const dist = buildDistribuicao();
    let bulkCount = 0;
    let globalIdx = 0;
    const allBulkAlunos = [];
    for (const { turmaId, cursoId, classe, qtd } of dist) {
      for (let j = 0; j < qtd; j++) {
        const a = genAluno(globalIdx++, turmaId, cursoId, classe, null);
        allBulkAlunos.push(a);
        bulkCount++;
      }
    }
    // Batch insert all alunos in chunks of 50
    const CHUNK = 50;
    for (let start = 0; start < allBulkAlunos.length; start += CHUNK) {
      const chunk = allBulkAlunos.slice(start, start + CHUNK);
      const params = [];
      const valParts = chunk.map((a) => {
        const base = params.length;
        params.push(a.numeroMatricula, a.nome, a.apelido, a.dataNascimento, a.genero,
                    a.provincia, a.municipio, a.turmaId, a.cursoId || null,
                    a.nomeEncarregado, a.telefoneEncarregado);
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},true,false)`;
      });
      await client.query(
        `INSERT INTO public.alunos
           ("numeroMatricula", nome, apelido, "dataNascimento", genero,
            provincia, municipio, "turmaId", "cursoId",
            "nomeEncarregado", "telefoneEncarregado", ativo, bloqueado)
         VALUES ${valParts.join(",")}
         ON CONFLICT DO NOTHING`,
        params
      );
    }
    console.log(`   ✓ ${bulkCount} alunos em massa inseridos`);

    // ── 10. NOTAS DO FINALISTA (3 trimestres × 8 disciplinas) ─────────────────
    console.log("→ Notas do finalista (Carlos Alberto Tomás, 13ª GI-A)...");
    const ALUNO_FINAL_ID = "aluno-final-001";
    const TURMA_13_ID    = "turma-13-gi-a";

    // Remove notas anteriores do aluno finalista para este ano
    await client.query(
      `DELETE FROM public.notas WHERE "alunoId"=$1 AND "anoLetivo"=$2`,
      [ALUNO_FINAL_ID, ANO_LETIVO]
    );

    // Grades per trimestre (nota final >= 10 para aprovação)
    const gradeSets = [
      // T1: notas boas (aprovação garantida)
      { t: 1, aval1: 14, aval2: 15, aval3: 14, aval4: 16, mac1: 15, pp1: 15, mt1: 16, nf: 15 },
      // T2
      { t: 2, aval1: 13, aval2: 14, aval3: 15, aval4: 14, mac1: 14, pp1: 14, mt1: 15, nf: 14 },
      // T3
      { t: 3, aval1: 15, aval2: 16, aval3: 16, aval4: 15, mac1: 15, pp1: 16, mt1: 17, nf: 16 },
    ];

    for (const { t, aval1, aval2, aval3, aval4, mac1, pp1, mt1, nf } of gradeSets) {
      for (const disc of GI_DISC_NOMES) {
        const profId = GI_PROF_MAP[disc] || "prof-beatriz";
        await client.query(
          `INSERT INTO public.notas
             ("alunoId","turmaId",disciplina,trimestre,
              aval1,aval2,aval3,aval4,aval5,aval6,aval7,aval8,
              mac1,pp1,ppt,mt1,nf,mac,
              "anoLetivo","professorId",data,"camposAbertos","pedidosReabertura")
           VALUES ($1,$2,$3,$4, $5,$6,$7,$8,0,0,0,0, $9,$10,$10,$11,$12,$9, $13,$14,$15,'[]'::jsonb,'[]'::jsonb)
           ON CONFLICT DO NOTHING`,
          [ALUNO_FINAL_ID, TURMA_13_ID, disc, t,
           aval1, aval2, aval3, aval4,
           mac1, pp1, mt1, nf,
           ANO_LETIVO, profId, DATA_HOJE]
        );
      }
    }
    console.log(`   ✓ ${gradeSets.length * GI_DISC_NOMES.length} notas inseridas`);

    // ── 11. PAUTAS FECHADAS — 13ª GI-A ────────────────────────────────────────
    console.log("→ Pautas fechadas 13ª GI-A...");
    await client.query(
      `DELETE FROM public.pautas WHERE "turmaId"=$1 AND "anoLetivo"=$2`,
      [TURMA_13_ID, ANO_LETIVO]
    );
    for (let trim = 1; trim <= 3; trim++) {
      for (const disc of GI_DISC_NOMES) {
        const profId = GI_PROF_MAP[disc] || "prof-beatriz";
        await client.query(
          `INSERT INTO public.pautas
             ("turmaId", disciplina, trimestre, "professorId", status, "anoLetivo", "dataFecho")
           VALUES ($1,$2,$3,$4,'fechada',$5,$6)
           ON CONFLICT DO NOTHING`,
          [TURMA_13_ID, disc, trim, profId, ANO_LETIVO, DATA_HOJE]
        );
      }
    }
    console.log(`   ✓ ${3 * GI_DISC_NOMES.length} pautas fechadas`);

    // ── 12. TAMBÉM ADICIONAR NOTAS PARA OUTROS ALUNOS DA 13ª GI-A ────────────
    console.log("→ Notas colectivas da 13ª GI-A (alunos em massa)...");
    const alunos13 = await client.query(
      `SELECT id FROM public.alunos WHERE "turmaId"=$1 AND id != $2 LIMIT 10`,
      [TURMA_13_ID, ALUNO_FINAL_ID]
    );
    for (const row of alunos13.rows) {
      for (const { t, aval1, aval2, aval3, aval4, mac1, pp1, mt1, nf } of gradeSets) {
        for (const disc of GI_DISC_NOMES) {
          const profId = GI_PROF_MAP[disc] || "prof-beatriz";
          await client.query(
            `INSERT INTO public.notas
               ("alunoId","turmaId",disciplina,trimestre,
                aval1,aval2,aval3,aval4,aval5,aval6,aval7,aval8,
                mac1,pp1,ppt,mt1,nf,mac,
                "anoLetivo","professorId",data,"camposAbertos","pedidosReabertura")
             VALUES ($1,$2,$3,$4, $5,$6,$7,$8,0,0,0,0, $9,$10,$10,$11,$12,$9, $13,$14,$15,'[]'::jsonb,'[]'::jsonb)
             ON CONFLICT DO NOTHING`,
            [row.id, TURMA_13_ID, disc, t,
             aval1 - (t % 3), aval2 - (t % 2), aval3, aval4 + (t % 2),
             mac1, pp1, mt1, nf - (t % 2),
             ANO_LETIVO, profId, DATA_HOJE]
          );
        }
      }
    }
    console.log(`   ✓ Notas adicionais para ${alunos13.rows.length} alunos da 13ª GI-A`);

    await client.query("COMMIT");

    // ─── SUMÁRIO ──────────────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║           ✅  SEED CONCLUÍDO COM SUCESSO!           ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Cursos             : ${CURSOS.length}                                ║`);
    console.log(`║  Disciplinas        : ${allDisc.length}                               ║`);
    console.log(`║  Salas              : ${SALAS.length}                               ║`);
    console.log(`║  Professores        : ${PROFESSORES.length}                               ║`);
    console.log(`║  Turmas             : ${TURMAS.length}                               ║`);
    console.log(`║  Alunos demo        : ${ALUNOS_DEMO.length}                                ║`);
    console.log(`║  Alunos em massa    : ~${bulkCount}                             ║`);
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log("║  CREDENCIAIS DE ACESSO:                             ║");
    console.log("║  chefe.secretaria@escola.ao  ChefSec@2025          ║");
    console.log("║  prof.silva@escola.ao         Prof@2025             ║");
    console.log("║  prof.directora@escola.ao     ProfDir@2025          ║");
    console.log("║  director@escola.ao            Director@2025         ║");
    console.log("║  aluno.primario@escola.ao     Aluno@2025  (4ª)      ║");
    console.log("║  aluno.icilo@escola.ao         Aluno@2025  (7ª)      ║");
    console.log("║  aluno.finalista@escola.ao    Aluno@2025  (13ª GI)  ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro no seed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
