/**
 * SIGA v3 — Reset completo + Seed para testes
 * ─────────────────────────────────────────────
 * Limpa toda a base de dados transaccional e popula com:
 *  • 1 Curso técnico (Gestão Informática)
 *  • Disciplinas para cada ciclo (Primário, I Ciclo, II Ciclo)
 *  • 3 Turmas finalistas: 6ª A, 9ª A, 13ª GI-A
 *  • 6 Salas
 *  • 10 Professores (mix efectivos/colaboradores)
 *  • 6 Funcionários administrativos
 *  • ~25 Alunos por turma (com notas T1+T2 — aprovados e reprovados)
 *  • 5 Alunos matriculados sem turma atribuída
 *  • Horários completos para as 3 turmas
 *  • turma_disciplinas + curso_disciplinas links
 *  • Utilizadores demo para login (director, chefe, professor, alunos)
 *
 * Uso: node scripts/reset-and-seed.js
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
const DATA_HOJE = "2026-04-21";

// Tabelas transaccionais a limpar (CASCADE para FKs)
// Preserva: provincias, municipios, lookup_items, doc_templates, configuracao_rh,
//           config_geral, anos_academicos, role_permissions, users
const TABLES_TO_TRUNCATE = [
  "audit_logs", "push_subscriptions", "notificacoes", "password_reset_tokens",
  "chat_mensagens", "mensagens_financeiras", "mensagens",
  "presencas_biblioteca", "emprestimos", "desejos_livros", "solicitacoes_emprestimo", "livros",
  "trabalhos_finais", "pap_alunos",
  "documentos_emitidos", "solicitacoes_documentos", "processos_secretaria",
  "calendario_provas", "solicitacoes_avaliacao", "pedidos_abertura_avaliacao",
  "avaliacoes_parciais", "solicitacoes_abertura", "prazos_mini_pauta",
  "anotacoes_matricula", "anulacoes_matricula", "reconfirmacoes_matricula",
  "registros", "ocorrencias", "bolsas",
  "rupes", "multa_isencoes", "pagamentos", "saldo_alunos", "movimentos_saldo", "transferencias",
  "contas_pagar", "plano_contas", "correspondencias",
  "registos_falta_mensal", "exclusoes_falta", "configuracoes_falta",
  "tempos_lectivos", "faltas_funcionarios", "itens_folha", "folhas_salarios",
  "avaliacoes_professores",
  "horario_deleted_turmas", "disciplina_deleted_seeds", "doc_deleted_seeds",
  "feriado_deleted_seeds", "lookup_deleted_seeds", "feriados",
  "marketing_leads",
  "horarios", "pautas", "presencas", "notas",
  "sumarios", "planos_aula", "planificacoes", "conteudos_programaticos", "materiais",
  "quadro_honra", "user_permissions",
  "turma_disciplinas", "curso_disciplinas",
  "alunos", "turmas", "professores", "funcionarios",
  "disciplinas", "cursos", "salas",
];

// ─── DADOS BASE ────────────────────────────────────────────────────────────────
const NOMES_M = ["João","Pedro","António","Manuel","Francisco","Carlos","Miguel","David","Rafael","Luís","Filipe","José","Paulo","Rui","André","Bruno","Tomás","Eduardo","Mário","Victor","Daniel","Simão","Augusto","Helder","Adilson","Domingos","Belmiro","Celestino","Nuno","Bernardo","Afonso","Orlando","Albino","Osvaldo","Edgar","Hélio","Joaquim","Alberto","Aderito","Domingas"];
const NOMES_F = ["Maria","Ana","Sofia","Catarina","Filomena","Esperança","Graça","Paula","Joana","Sandra","Beatriz","Helena","Cláudia","Fernanda","Lurdes","Rosa","Teresa","Isabel","Cristina","Dulce","Carla","Aida","Conceição","Margarida","Susana","Vânia","Inês","Fátima","Yolanda","Olga","Lídia","Ângela","Leonor","Adelaide","Laurinda","Domingas","Eulália","Mafalda","Felizarda","Vitória"];
const APELIDOS = ["Silva","Costa","Santos","Ferreira","Oliveira","Pereira","Sousa","Lima","Nascimento","Carvalho","Mendes","Rodrigues","Alves","Dias","Neves","Cunha","Monteiro","Tavares","Moreira","Lopes","Fonseca","Cardoso","Teixeira","Pinto","Martins","Freitas","Rocha","Gomes","Correia","Tomás","Gaspar","Simões","Pires","Antunes","Henriques","Matos","Ribeiro","Andrade","Miranda","Quintas","Nunes","Bento","Mussinda","Kiala","Quissanga","Tchipanga","Camunga","Kayombo","Kasamba"];

const PROV = [
  { provincia: "Luanda",   municipios: ["Luanda","Viana","Belas","Cacuaco","Cazenga","Kilamba Kiaxi"] },
  { provincia: "Benguela", municipios: ["Benguela","Lobito","Catumbela"] },
  { provincia: "Huambo",   municipios: ["Huambo","Bailundo"] },
  { provincia: "Bié",      municipios: ["Cuíto","Camacupa"] },
  { provincia: "Huíla",    municipios: ["Lubango","Matala"] },
];

function pick(arr, idx) { return arr[Math.abs(idx) % arr.length]; }

function discsForClasse(classeNum, source) {
  return source.filter(d => {
    const ini = parseInt(String(d.classeInicio).replace(/[^\d]/g, '')) || 0;
    const fim = parseInt(String(d.classeFim).replace(/[^\d]/g, '')) || 99;
    return classeNum >= ini && classeNum <= fim;
  });
}

// ─── CURSO ─────────────────────────────────────────────────────────────────────
const CURSO = {
  id: "curso-gi",
  nome: "Gestão Informática",
  codigo: "GI",
  areaFormacao: "Informática",
  descricao: "Curso Técnico-Profissional de Gestão Informática — II Ciclo",
  cargaHoraria: 1200,
  duracao: "4 anos (10ª–13ª)",
};

// ─── DISCIPLINAS (catálogo único, sem duplicatas — UNIQUE constraint em nome) ─
// Cada disciplina tem o seu intervalo classeInicio→classeFim que cobre os 3 ciclos.
const DISCIPLINAS = [
  // Comuns / Transversais
  { id: "d-lp",    nome: "Língua Portuguesa",         codigo: "LP",   area: "Línguas",           classeInicio: "1ª Classe",  classeFim: "13ª Classe", carga: 5 },
  { id: "d-mat",   nome: "Matemática",                 codigo: "MAT",  area: "Ciências Exatas",   classeInicio: "1ª Classe",  classeFim: "13ª Classe", carga: 5 },
  { id: "d-ef",    nome: "Educação Física",            codigo: "EF",   area: "Desporto",          classeInicio: "1ª Classe",  classeFim: "13ª Classe", carga: 2 },
  { id: "d-emc",   nome: "Educação Moral e Cívica",    codigo: "EMC",  area: "Formação Geral",    classeInicio: "1ª Classe",  classeFim: "9ª Classe",  carga: 2 },
  // Primário
  { id: "d-est",   nome: "Estudo do Meio",             codigo: "EM",   area: "Ciências Sociais",  classeInicio: "1ª Classe",  classeFim: "4ª Classe",  carga: 3 },
  { id: "d-cnat",  nome: "Ciências da Natureza",       codigo: "CNAT", area: "Ciências",          classeInicio: "5ª Classe",  classeFim: "6ª Classe",  carga: 3 },
  { id: "d-hisang",nome: "História de Angola",         codigo: "HISA", area: "Ciências Sociais",  classeInicio: "5ª Classe",  classeFim: "6ª Classe",  carga: 3 },
  { id: "d-geop",  nome: "Geografia",                  codigo: "GEO",  area: "Ciências Sociais",  classeInicio: "5ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  { id: "d-ev",    nome: "Educação Visual e Plástica", codigo: "EVP",  area: "Artes",             classeInicio: "1ª Classe",  classeFim: "9ª Classe",  carga: 2 },
  // I Ciclo
  { id: "d-ing",   nome: "Inglês",                     codigo: "ING",  area: "Línguas",           classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  { id: "d-fra",   nome: "Francês",                    codigo: "FRA",  area: "Línguas",           classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 2 },
  { id: "d-fis",   nome: "Física",                     codigo: "FIS",  area: "Ciências",          classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  { id: "d-qui",   nome: "Química",                    codigo: "QUI",  area: "Ciências",          classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  { id: "d-bio",   nome: "Biologia",                   codigo: "BIO",  area: "Ciências",          classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  { id: "d-his",   nome: "História",                   codigo: "HIS",  area: "Ciências Sociais",  classeInicio: "7ª Classe",  classeFim: "9ª Classe",  carga: 3 },
  // II Ciclo (Curso GI)
  { id: "d-ingt",  nome: "Inglês Técnico",             codigo: "INGT", area: "Línguas",           classeInicio: "10ª Classe", classeFim: "13ª Classe", carga: 3, cursoId: "curso-gi" },
  { id: "d-fil",   nome: "Filosofia",                  codigo: "FIL",  area: "Humanidades",       classeInicio: "10ª Classe", classeFim: "11ª Classe", carga: 2, cursoId: "curso-gi" },
  { id: "d-info",  nome: "Informática de Gestão",      codigo: "IG",   area: "Informática",       classeInicio: "10ª Classe", classeFim: "13ª Classe", carga: 5, cursoId: "curso-gi" },
  { id: "d-prog",  nome: "Programação",                codigo: "PROG", area: "Informática",       classeInicio: "11ª Classe", classeFim: "13ª Classe", carga: 5, cursoId: "curso-gi" },
  { id: "d-cont",  nome: "Contabilidade Geral",        codigo: "CONT", area: "Contabilidade",     classeInicio: "10ª Classe", classeFim: "13ª Classe", carga: 4, cursoId: "curso-gi" },
  { id: "d-eco",   nome: "Economia",                   codigo: "ECO",  area: "Economia",          classeInicio: "10ª Classe", classeFim: "13ª Classe", carga: 3, cursoId: "curso-gi" },
  { id: "d-bd",    nome: "Bases de Dados",             codigo: "BD",   area: "Informática",       classeInicio: "12ª Classe", classeFim: "13ª Classe", carga: 4, cursoId: "curso-gi" },
  { id: "d-si",    nome: "Sistemas de Informação",     codigo: "SI",   area: "Informática",       classeInicio: "12ª Classe", classeFim: "13ª Classe", carga: 4, cursoId: "curso-gi" },
];

// ─── SALAS ─────────────────────────────────────────────────────────────────────
const SALAS = [
  { id: "sala-1", nome: "Sala 1",          bloco: "A", capacidade: 35, tipo: "Sala Normal" },
  { id: "sala-2", nome: "Sala 2",          bloco: "A", capacidade: 35, tipo: "Sala Normal" },
  { id: "sala-3", nome: "Sala 3",          bloco: "B", capacidade: 35, tipo: "Sala Normal" },
  { id: "sala-li", nome: "Lab. Informática", bloco: "C", capacidade: 30, tipo: "Sala de Informática" },
  { id: "sala-lab", nome: "Laboratório",   bloco: "C", capacidade: 30, tipo: "Laboratório" },
  { id: "sala-aud", nome: "Auditório",     bloco: "D", capacidade: 150, tipo: "Auditório" },
];

// ─── PROFESSORES (10) ──────────────────────────────────────────────────────────
const PROFESSORES = [
  { id: "p-jose",     numP: "PROF-001", nome: "José",     apelido: "Manuel Gonçalves",  email: "jose.goncalves@escola.ao",     tel: "+244 923 100 001", hab: "Licenciatura em Educação Primária",   nivel: "Primário", contrato: "efectivo",  salario: 200000,
    disc: ["Língua Portuguesa","Matemática","Estudo do Meio","Ciências da Natureza","Educação Moral e Cívica"] },
  { id: "p-rosa",     numP: "PROF-002", nome: "Rosa",     apelido: "Cardoso Neves",     email: "rosa.cardoso@escola.ao",        tel: "+244 923 100 002", hab: "Licenciatura em História e Geografia", nivel: "Primário", contrato: "efectivo",  salario: 195000,
    disc: ["História de Angola","Geografia","Educação Visual e Plástica"] },
  { id: "p-tomas",    numP: "PROF-003", nome: "Tomás",    apelido: "Pereira Lopes",     email: "tomas.pereira@escola.ao",       tel: "+244 923 100 003", hab: "Licenciatura em Educação Física",      nivel: "Primário", contrato: "prestacao_servicos", salario: 0,
    disc: ["Educação Física"] },
  { id: "p-ana",      numP: "PROF-004", nome: "Ana",      apelido: "Pinto da Silva",    email: "ana.pinto@escola.ao",            tel: "+244 923 100 004", hab: "Licenciatura em Português",            nivel: "I Ciclo",  contrato: "efectivo",  salario: 220000,
    disc: ["Língua Portuguesa","Educação Moral e Cívica"] },
  { id: "p-paulo",    numP: "PROF-005", nome: "Paulo",    apelido: "Rodrigues Sousa",   email: "paulo.rodrigues@escola.ao",     tel: "+244 923 100 005", hab: "Licenciatura em História",             nivel: "I Ciclo",  contrato: "efectivo",  salario: 220000,
    disc: ["História","Geografia"] },
  { id: "p-rui",      numP: "PROF-006", nome: "Rui",      apelido: "Marques Ferreira",  email: "rui.marques@escola.ao",          tel: "+244 923 100 006", hab: "Licenciatura em Física-Química",       nivel: "I Ciclo",  contrato: "contratado", salario: 230000,
    disc: ["Física","Química","Biologia"] },
  { id: "p-mariah",   numP: "PROF-007", nome: "Maria",    apelido: "Helena Teixeira",   email: "maria.helena@escola.ao",         tel: "+244 923 100 007", hab: "Licenciatura em Línguas Modernas",      nivel: "I Ciclo",  contrato: "efectivo",  salario: 215000,
    disc: ["Inglês","Francês","Inglês Técnico"] },
  { id: "p-carlos",   numP: "PROF-008", nome: "Carlos",   apelido: "Sousa Mendes",      email: "carlos.sousa@escola.ao",        tel: "+244 923 100 008", hab: "Licenciatura em Matemática",            nivel: "II Ciclo", contrato: "efectivo",  salario: 250000,
    disc: ["Matemática"] },
  { id: "p-pedro",    numP: "PROF-009", nome: "Pedro",    apelido: "Costa Fonseca",     email: "pedro.costa@escola.ao",          tel: "+244 923 100 009", hab: "Mestrado em Engenharia Informática",    nivel: "II Ciclo", contrato: "efectivo",  salario: 320000,
    disc: ["Informática de Gestão","Programação","Bases de Dados","Sistemas de Informação"] },
  { id: "p-fernanda", numP: "PROF-010", nome: "Fernanda", apelido: "Lopes Nunes",       email: "fernanda.lopes@escola.ao",      tel: "+244 923 100 010", hab: "Licenciatura em Contabilidade e Gestão", nivel: "II Ciclo", contrato: "prestacao_servicos", salario: 0,
    disc: ["Contabilidade Geral","Economia","Filosofia"] },
];

// ─── FUNCIONÁRIOS ADMINISTRATIVOS ─────────────────────────────────────────────
const FUNCIONARIOS = [
  { id: "f-director",   nome: "Amílcar",   apelido: "Nzinga Lopes",   email: "director@escola.ao",          tel: "+244 923 200 001", departamento: "direcao",         cargo: "director",          esp: "Gestão Escolar",     contrato: "efectivo", salario: 450000, hab: "Mestrado em Gestão Educacional" },
  { id: "f-chefesec",   nome: "Celeste",   apelido: "Baptista",       email: "chefe.secretaria@escola.ao",  tel: "+244 923 200 002", departamento: "administrativo",  cargo: "chefe_secretaria",  esp: "Administração Escolar", contrato: "efectivo", salario: 280000, hab: "Licenciatura em Gestão" },
  { id: "f-secretaria", nome: "Domingas",  apelido: "Quissanga",      email: "secretaria@escola.ao",        tel: "+244 923 200 003", departamento: "administrativo",  cargo: "secretaria",        esp: "Secretariado",       contrato: "efectivo", salario: 180000, hab: "Bacharelato em Secretariado" },
  { id: "f-financeiro", nome: "Manuel",    apelido: "Tomás Bento",    email: "financeiro@escola.ao",        tel: "+244 923 200 004", departamento: "financeiro",      cargo: "financeiro",        esp: "Contabilidade",      contrato: "efectivo", salario: 260000, hab: "Licenciatura em Contabilidade" },
  { id: "f-rh",         nome: "Sandra",    apelido: "Mussinda",       email: "rh@escola.ao",                tel: "+244 923 200 005", departamento: "rh",              cargo: "rh",                esp: "Recursos Humanos",   contrato: "efectivo", salario: 250000, hab: "Licenciatura em Gestão de RH" },
  { id: "f-bib",        nome: "Vitória",   apelido: "Camunga",        email: "biblioteca@escola.ao",        tel: "+244 923 200 006", departamento: "biblioteca",      cargo: "bibliotecario",     esp: "Biblioteconomia",    contrato: "contratado", salario: 150000, hab: "Bacharelato em Biblioteconomia" },
];

// ─── UTILIZADORES PARA LOGIN ──────────────────────────────────────────────────
const UTIL_LOGIN = [
  { id: "u-director",  nome: "Amílcar Nzinga Lopes",  email: "director@escola.ao",         senha: "Director@2025",  role: "director" },
  { id: "u-chefesec",  nome: "Celeste Baptista",      email: "chefe.secretaria@escola.ao", senha: "ChefSec@2025",   role: "chefe_secretaria" },
  { id: "u-secretaria",nome: "Domingas Quissanga",    email: "secretaria@escola.ao",       senha: "Secretaria@2025",role: "secretaria" },
  { id: "u-financeiro",nome: "Manuel Tomás Bento",    email: "financeiro@escola.ao",       senha: "Financeiro@2025",role: "financeiro" },
  { id: "u-rh",        nome: "Sandra Mussinda",       email: "rh@escola.ao",                senha: "Rh@2025",        role: "rh" },
  { id: "u-prof-pedro",nome: "Pedro Costa Fonseca",   email: "pedro.costa@escola.ao",       senha: "Prof@2025",      role: "professor" },
  { id: "u-prof-ana",  nome: "Ana Pinto da Silva",    email: "ana.pinto@escola.ao",         senha: "Prof@2025",      role: "professor" },
  { id: "u-prof-jose", nome: "José Manuel Gonçalves", email: "jose.goncalves@escola.ao",    senha: "Prof@2025",      role: "professor" },
];

// ─── TURMAS (3 finalistas) ────────────────────────────────────────────────────
const TURMAS = [
  { id: "t-6a",   nome: "6ª A",     classe: "6ª Classe",  turno: "Manhã", nivel: "Primário", curso: null,        sala: "Sala 1",           dirId: "p-jose",  cap: 35, profs: ["p-jose","p-rosa","p-tomas"], discs: discsForClasse(6, DISCIPLINAS).filter(d => !d.cursoId) },
  { id: "t-9a",   nome: "9ª A",     classe: "9ª Classe",  turno: "Manhã", nivel: "I Ciclo",  curso: null,        sala: "Sala 2",           dirId: "p-paulo", cap: 35, profs: ["p-ana","p-paulo","p-rui","p-mariah","p-tomas","p-carlos"], discs: discsForClasse(9, DISCIPLINAS).filter(d => !d.cursoId) },
  { id: "t-13gi", nome: "13ª GI-A", classe: "13ª Classe", turno: "Tarde", nivel: "II Ciclo", curso: "curso-gi",  sala: "Lab. Informática", dirId: "p-pedro", cap: 30, profs: ["p-pedro","p-carlos","p-mariah","p-fernanda","p-ana","p-tomas"], discs: discsForClasse(13, DISCIPLINAS) },
];

// ─── HORÁRIOS ──────────────────────────────────────────────────────────────────
// 5 dias × 4 períodos por turma = 20 slots
const PERIODOS_MANHA = [
  { p: 1, ini: "07:00", fim: "07:45" },
  { p: 2, ini: "07:50", fim: "08:35" },
  { p: 3, ini: "08:50", fim: "09:35" },
  { p: 4, ini: "09:40", fim: "10:25" },
  { p: 5, ini: "10:40", fim: "11:25" },
];
const PERIODOS_TARDE = [
  { p: 1, ini: "13:00", fim: "13:45" },
  { p: 2, ini: "13:50", fim: "14:35" },
  { p: 3, ini: "14:50", fim: "15:35" },
  { p: 4, ini: "15:40", fim: "16:25" },
  { p: 5, ini: "16:40", fim: "17:25" },
];

// Mapa: disciplina → professor (preferência)
function professorParaDisciplina(turma, disc) {
  const candidatos = PROFESSORES.filter(p => turma.profs.includes(p.id) && p.disc.some(pd => pd === disc.nome || pd.toLowerCase() === disc.nome.toLowerCase()));
  if (candidatos.length > 0) return candidatos[0];
  // Fallback: qualquer professor da turma
  return PROFESSORES.find(p => turma.profs.includes(p.id)) || PROFESSORES[0];
}

// ─── GERADORES DE ALUNOS ──────────────────────────────────────────────────────
function genAluno(globalIdx, turmaId, cursoId, classeFinal) {
  const genero = globalIdx % 2 === 0 ? "M" : "F";
  const nomeArr = genero === "M" ? NOMES_M : NOMES_F;
  const nome = pick(nomeArr, Math.floor(globalIdx / 2));
  const apelido1 = pick(APELIDOS, globalIdx);
  const apelido2 = pick(APELIDOS, globalIdx + 11);
  const prov = pick(PROV, globalIdx);
  const mun = pick(prov.municipios, globalIdx);

  // Idade adequada à classe (Angola: criança entra com 6 anos na 1ª classe)
  const baseYear = 2026 - classeFinal - 6;
  const bYear = baseYear - (globalIdx % 3);
  const bMonth = String((globalIdx % 12) + 1).padStart(2, "0");
  const bDay = String((globalIdx % 27) + 1).padStart(2, "0");

  return {
    numeroMatricula: `MTR-${String(globalIdx + 1).padStart(5, "0")}`,
    nome,
    apelido: `${apelido1} ${apelido2}`,
    dataNascimento: `${bYear}-${bMonth}-${bDay}`,
    genero,
    provincia: prov.provincia,
    municipio: mun,
    turmaId,
    cursoId,
    nomeEncarregado: `${pick(NOMES_F, globalIdx + 7)} ${apelido1}`,
    telefoneEncarregado: `+244 9${String(20 + (globalIdx % 80)).padStart(2,"0")} ${String(100000 + globalIdx).padStart(6,"0")}`,
  };
}

// ─── NOTAS: gera nota para um aluno num trimestre ─────────────────────────────
// pattern: "aprovado", "reprovado_leve", "reprovado_pesado"
function gerarNotaSet(pattern, trimestre, idxOffset) {
  // Variação ligeira por offset
  const v = (n) => Math.max(0, Math.min(20, n + (idxOffset % 3) - 1));

  let mac, pp, mt, nf;
  if (pattern === "aprovado") {
    mac = v(15); pp = v(14); mt = v(14); nf = v(14);
  } else if (pattern === "aprovado_baixo") {
    mac = v(12); pp = v(11); mt = v(11); nf = v(11);
  } else if (pattern === "reprovado_leve") {
    mac = v(10); pp = v(8); mt = v(9); nf = v(9);
  } else { // reprovado_pesado
    mac = v(8); pp = v(6); mt = v(7); nf = v(7);
  }
  return {
    aval1: mac, aval2: v(mac - 1), aval3: v(mac + 1), aval4: 0,
    mac1: mac, pp1: pp, mt1: mt, nf, mac,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 0. RESET — TRUNCATE TABELAS TRANSACCIONAIS ───────────────────────────
    console.log("→ A limpar tabelas transaccionais...");
    // Apaga utilizadores que NÃO são contas de sistema (admin/ceo/pca padrões)
    await client.query(`
      DELETE FROM utilizadores
      WHERE email NOT IN ('admin@sige.ao','ceo@sige.ao','pca@sige.ao','director@sige.ao')
    `);
    // TRUNCATE em massa com CASCADE (tabelas existentes apenas)
    const existingTables = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `);
    const existingNames = new Set(existingTables.rows.map(r => r.tablename));
    const toTruncate = TABLES_TO_TRUNCATE.filter(t => existingNames.has(t));
    if (toTruncate.length > 0) {
      const truncateSQL = `TRUNCATE TABLE ${toTruncate.map(t => `"${t}"`).join(",")} RESTART IDENTITY CASCADE`;
      await client.query(truncateSQL);
    }
    console.log(`   ✓ ${toTruncate.length} tabelas limpas`);

    // ── 1. SALAS ──────────────────────────────────────────────────────────────
    console.log("→ Salas...");
    for (const s of SALAS) {
      await client.query(
        `INSERT INTO public.salas (id, nome, bloco, capacidade, tipo, ativo)
         VALUES ($1,$2,$3,$4,$5,true)`,
        [s.id, s.nome, s.bloco, s.capacidade, s.tipo]
      );
    }
    console.log(`   ✓ ${SALAS.length} salas`);

    // ── 2. CURSO ──────────────────────────────────────────────────────────────
    console.log("→ Curso...");
    await client.query(
      `INSERT INTO public.cursos (id, nome, codigo, "areaFormacao", descricao, ativo, "cargaHoraria", duracao)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7)`,
      [CURSO.id, CURSO.nome, CURSO.codigo, CURSO.areaFormacao, CURSO.descricao, CURSO.cargaHoraria, CURSO.duracao]
    );
    console.log(`   ✓ 1 curso (Gestão Informática)`);

    // ── 3. DISCIPLINAS ────────────────────────────────────────────────────────
    console.log("→ Disciplinas...");
    for (const d of DISCIPLINAS) {
      await client.query(
        `INSERT INTO public.disciplinas (id, nome, codigo, area, "cargaHoraria", ativo, "cursoId",
            "classeInicio", "classeFim", obrigatoria, ordem, tipo)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,true,0,'continuidade')`,
        [d.id, d.nome, d.codigo, d.area, d.carga, d.cursoId || null, d.classeInicio, d.classeFim]
      );
    }
    console.log(`   ✓ ${DISCIPLINAS.length} disciplinas`);

    // ── 4. CURSO_DISCIPLINAS (todas as disciplinas que o curso GI lecciona) ───
    console.log("→ Ligações curso ↔ disciplina...");
    const discsCursoGI = discsForClasse(13, DISCIPLINAS); // todas as disciplinas até 13ª (cobre 10-13)
    let cdCount = 0;
    for (let i = 0; i < discsCursoGI.length; i++) {
      const d = discsCursoGI[i];
      await client.query(
        `INSERT INTO public.curso_disciplinas ("cursoId","disciplinaId",obrigatoria,"cargaHoraria",ordem,removida)
         VALUES ($1,$2,true,$3,$4,false)`,
        [CURSO.id, d.id, d.carga, i + 1]
      );
      cdCount++;
    }
    console.log(`   ✓ ${cdCount} ligações curso↔disciplina`);

    // ── 5. UTILIZADORES (login) ───────────────────────────────────────────────
    console.log("→ Utilizadores para login...");
    for (const u of UTIL_LOGIN) {
      await client.query(
        `INSERT INTO public.utilizadores (id, nome, email, senha, role, escola, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (email) DO UPDATE SET senha=EXCLUDED.senha, role=EXCLUDED.role, nome=EXCLUDED.nome`,
        [u.id, u.nome, u.email, u.senha, u.role, ESCOLA]
      );
    }
    console.log(`   ✓ ${UTIL_LOGIN.length} utilizadores`);

    // ── 6. PROFESSORES ────────────────────────────────────────────────────────
    console.log("→ Professores...");
    for (const p of PROFESSORES) {
      const valorTempo = p.contrato === "prestacao_servicos" ? 5000 : 0;
      const temposSem = p.contrato === "prestacao_servicos" ? 18 : 0;
      const utilId = UTIL_LOGIN.find(u => u.email === p.email)?.id || null;
      await client.query(
        `INSERT INTO public.professores
           (id, "numeroProfessor", nome, apelido, email, telefone, habilitacoes,
            disciplinas, "turmasIds", "nivelEnsino", ativo, "salarioBase",
            "subsidioAlimentacao", "subsidioTransporte", "dataContratacao", "tipoContrato",
            "valorPorTempoLectivo", "temposSemanais", "utilizadorId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,true,$11,15000,8000,'2023-09-01',$12,$13,$14,$15)`,
        [
          p.id, p.numP, p.nome, p.apelido, p.email, p.tel, p.hab,
          JSON.stringify(p.disc), JSON.stringify([]),
          p.nivel, p.salario, p.contrato, valorTempo, temposSem, utilId,
        ]
      );
    }
    console.log(`   ✓ ${PROFESSORES.length} professores`);

    // ── 7. FUNCIONÁRIOS ───────────────────────────────────────────────────────
    console.log("→ Funcionários administrativos...");
    for (let i = 0; i < FUNCIONARIOS.length; i++) {
      const f = FUNCIONARIOS[i];
      const utilId = UTIL_LOGIN.find(u => u.email === f.email)?.id || null;
      const bi = `00410${String(i).padStart(2,"0")}LA0${40 + i}`;
      const nif = `54000000${String(i).padStart(2,"0")}`;
      await client.query(
        `INSERT INTO public.funcionarios
           (id, nome, apelido, "dataNascimento", genero, bi, nif, telefone, email,
            provincia, municipio, morada, departamento, cargo, especialidade,
            "tipoContrato", "dataContratacao", habilitacoes,
            "salarioBase", "subsidioAlimentacao", "subsidioTransporte", "subsidioHabitacao",
            "valorPorTempoLectivo", "temposSemanais", "utilizadorId", ativo)
         VALUES ($1,$2,$3,'1985-05-15','M',$4,$5,$6,$7,
                 'Luanda','Luanda','Bairro Sambizanga, Rua A',$8,$9,$10,$11,'2020-01-15',$12,
                 $13,15000,10000,0,0,0,$14,true)`,
        [
          f.id, f.nome, f.apelido, bi, nif, f.tel, f.email,
          f.departamento, f.cargo, f.esp, f.contrato, f.hab,
          f.salario, utilId,
        ]
      );
    }
    console.log(`   ✓ ${FUNCIONARIOS.length} funcionários`);

    // ── 8. TURMAS ─────────────────────────────────────────────────────────────
    console.log("→ Turmas...");
    for (const t of TURMAS) {
      await client.query(
        `INSERT INTO public.turmas
           (id, nome, classe, turno, "anoLetivo", nivel, "professorId", "professoresIds", "cursoId", sala, capacidade, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,true)`,
        [t.id, t.nome, t.classe, t.turno, ANO_LETIVO, t.nivel,
         t.dirId, JSON.stringify(t.profs), t.curso || null, t.sala, t.cap]
      );
    }
    console.log(`   ✓ ${TURMAS.length} turmas finalistas`);

    // ── 9. TURMA_DISCIPLINAS ─────────────────────────────────────────────────
    console.log("→ Ligações turma ↔ disciplina...");
    let tdCount = 0;
    for (const t of TURMAS) {
      for (let oi = 0; oi < t.discs.length; oi++) {
        const d = t.discs[oi];
        await client.query(
          `INSERT INTO public.turma_disciplinas (id, "turmaId","disciplinaId",ordem)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [`td-${t.id}-${d.id}`, t.id, d.id, oi + 1]
        );
        tdCount++;
      }
    }
    console.log(`   ✓ ${tdCount} ligações turma↔disciplina`);

    // ── 10. ALUNOS ───────────────────────────────────────────────────────────
    console.log("→ Alunos (25 por turma + 5 sem turma)...");
    let globalIdx = 0;
    const alunosPorTurma = {};
    for (const t of TURMAS) {
      const classeFinal = parseInt(String(t.classe).replace(/[^\d]/g, "")) || 6;
      alunosPorTurma[t.id] = [];
      for (let j = 0; j < 25; j++) {
        const a = genAluno(globalIdx++, t.id, t.curso, classeFinal);
        const r = await client.query(
          `INSERT INTO public.alunos
             ("numeroMatricula", nome, apelido, "dataNascimento", genero,
              provincia, municipio, "turmaId", "cursoId",
              "nomeEncarregado", "telefoneEncarregado", ativo, bloqueado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,false)
           RETURNING id`,
          [a.numeroMatricula, a.nome, a.apelido, a.dataNascimento, a.genero,
           a.provincia, a.municipio, a.turmaId, a.cursoId || null,
           a.nomeEncarregado, a.telefoneEncarregado]
        );
        alunosPorTurma[t.id].push(r.rows[0].id);
      }
    }
    // 5 alunos sem turma (matriculados aguardando atribuição)
    for (let j = 0; j < 5; j++) {
      const a = genAluno(globalIdx++, null, null, 10);
      await client.query(
        `INSERT INTO public.alunos
           ("numeroMatricula", nome, apelido, "dataNascimento", genero,
            provincia, municipio, "turmaId", "cursoId",
            "nomeEncarregado", "telefoneEncarregado", ativo, bloqueado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,$8,$9,true,false)`,
        [`MTR-NEW-${String(j + 1).padStart(3, "0")}`, a.nome, a.apelido, a.dataNascimento, a.genero,
         a.provincia, a.municipio,
         a.nomeEncarregado, a.telefoneEncarregado]
      );
    }
    console.log(`   ✓ ${globalIdx} alunos (${TURMAS.length}×25 com turma + 5 sem turma)`);

    // ── 11. HORÁRIOS (5 dias × 5 períodos por turma) ─────────────────────────
    console.log("→ Horários...");
    let horCount = 0;
    for (const t of TURMAS) {
      const periodos = t.turno === "Manhã" ? PERIODOS_MANHA : PERIODOS_TARDE;
      // Distribui disciplinas pelos slots (5 dias × 5 períodos = 25 slots)
      const slots = [];
      for (let dia = 1; dia <= 5; dia++) {
        for (const per of periodos) {
          slots.push({ dia, p: per.p, ini: per.ini, fim: per.fim });
        }
      }
      // Para cada disciplina, atribui aulas semanais (limita a 4 por disciplina)
      const alocacoes = [];
      for (const d of t.discs) {
        const aulas = Math.min(Math.max(2, Math.floor(d.carga / 1)), 4);
        for (let h = 0; h < aulas; h++) alocacoes.push(d);
      }
      // Distribui alocações pelos slots disponíveis
      for (let i = 0; i < Math.min(alocacoes.length, slots.length); i++) {
        const slot = slots[i];
        const d = alocacoes[i];
        const prof = professorParaDisciplina(t, d);
        await client.query(
          `INSERT INTO public.horarios
             ("turmaId", disciplina, "professorId", "professorNome",
              "diaSemana", periodo, "horaInicio", "horaFim", sala, "anoAcademico")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT DO NOTHING`,
          [t.id, d.nome, prof.id, `${prof.nome} ${prof.apelido}`,
           slot.dia, slot.p, slot.ini, slot.fim, t.sala, ANO_LETIVO]
        );
        horCount++;
      }
    }
    console.log(`   ✓ ${horCount} horários`);

    // ── 12. NOTAS (T1 e T2 — para testar pauta final; T3 vazio para mini pauta) ─
    console.log("→ Notas (T1 e T2 com aprovados/reprovados; T3 vazio)...");
    const notasRows = [];
    for (const t of TURMAS) {
      const alunoIds = alunosPorTurma[t.id];
      for (let i = 0; i < alunoIds.length; i++) {
        const alunoId = alunoIds[i];
        let pattern;
        if (i < 15) pattern = "aprovado";
        else if (i < 21) pattern = "aprovado_baixo";
        else if (i < 23) pattern = "reprovado_leve";
        else pattern = "reprovado_pesado";

        for (let trim = 1; trim <= 2; trim++) {
          for (const d of t.discs) {
            const prof = professorParaDisciplina(t, d);
            const n = gerarNotaSet(pattern, trim, i + trim);
            notasRows.push([alunoId, t.id, d.nome, trim,
              n.aval1, n.aval2, n.aval3, n.aval4,
              n.mac1, n.pp1, n.mt1, n.nf, n.mac,
              ANO_LETIVO, prof.id, DATA_HOJE]);
          }
        }
      }
    }
    // Bulk insert in chunks
    const NOTAS_CHUNK = 100;
    for (let s = 0; s < notasRows.length; s += NOTAS_CHUNK) {
      const chunk = notasRows.slice(s, s + NOTAS_CHUNK);
      const vals = [];
      const params = [];
      chunk.forEach((row) => {
        const b = params.length;
        params.push(...row);
        vals.push(`($${b+1},$${b+2},$${b+3},$${b+4}, $${b+5},$${b+6},$${b+7},$${b+8},0,0,0,0, $${b+9},$${b+10},$${b+10},$${b+11},$${b+12},$${b+13}, $${b+14},$${b+15},$${b+16},'[]'::jsonb,'[]'::jsonb)`);
      });
      await client.query(
        `INSERT INTO public.notas
           ("alunoId","turmaId",disciplina,trimestre,
            aval1,aval2,aval3,aval4,aval5,aval6,aval7,aval8,
            mac1,pp1,ppt,mt1,nf,mac,
            "anoLetivo","professorId",data,"camposAbertos","pedidosReabertura")
         VALUES ${vals.join(",")}`,
        params
      );
    }
    console.log(`   ✓ ${notasRows.length} notas (T1+T2)`);

    // ── 13. PAUTAS (T1+T2 fechadas, T3 abertas) ──────────────────────────────
    console.log("→ Pautas T1/T2 fechadas, T3 abertas...");
    const pautaRows = [];
    for (const t of TURMAS) {
      for (const d of t.discs) {
        const prof = professorParaDisciplina(t, d);
        for (let trim = 1; trim <= 2; trim++) {
          pautaRows.push([t.id, d.nome, trim, prof.id, "fechada", ANO_LETIVO, DATA_HOJE]);
        }
        pautaRows.push([t.id, d.nome, 3, prof.id, "aberta", ANO_LETIVO, null]);
      }
    }
    for (const r of pautaRows) {
      await client.query(
        `INSERT INTO public.pautas
           ("turmaId", disciplina, trimestre, "professorId", status, "anoLetivo", "dataFecho")
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        r
      );
    }
    console.log(`   ✓ ${pautaRows.length} pautas`);
    let pautaCount = pautaRows.length;
    let notaCount = notasRows.length;

    await client.query("COMMIT");

    // ─── SUMÁRIO ──────────────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║              ✅  RESET + SEED CONCLUÍDO!                  ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log(`║  Curso              : 1 (Gestão Informática)              ║`);
    console.log(`║  Disciplinas        : ${String(DISCIPLINAS.length).padEnd(3)} (Prim+ICic+IICic)                ║`);
    console.log(`║  Salas              : ${String(SALAS.length).padEnd(3)}                                       ║`);
    console.log(`║  Professores        : ${String(PROFESSORES.length).padEnd(3)}                                       ║`);
    console.log(`║  Funcionários       : ${String(FUNCIONARIOS.length).padEnd(3)}                                       ║`);
    console.log(`║  Turmas finalistas  : 3 (6ª A, 9ª A, 13ª GI-A)            ║`);
    console.log(`║  Alunos             : ${String(globalIdx).padEnd(3)} (${TURMAS.length}×25 + 5 sem turma)            ║`);
    console.log(`║  Horários           : ${String(horCount).padEnd(3)}                                       ║`);
    console.log(`║  Notas              : ${String(notaCount).padEnd(4)} (T1+T2)                              ║`);
    console.log(`║  Pautas             : ${String(pautaCount).padEnd(3)} (T1/T2 fechadas, T3 abertas)         ║`);
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║  CREDENCIAIS DE ACESSO:                                  ║");
    console.log("║  director@escola.ao              Director@2025           ║");
    console.log("║  chefe.secretaria@escola.ao      ChefSec@2025            ║");
    console.log("║  secretaria@escola.ao            Secretaria@2025         ║");
    console.log("║  financeiro@escola.ao            Financeiro@2025         ║");
    console.log("║  rh@escola.ao                    Rh@2025                 ║");
    console.log("║  pedro.costa@escola.ao           Prof@2025               ║");
    console.log("║  ana.pinto@escola.ao             Prof@2025               ║");
    console.log("║  jose.goncalves@escola.ao        Prof@2025               ║");
    console.log("║  admin@sige.ao  (sistema, preservado)                    ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");

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
