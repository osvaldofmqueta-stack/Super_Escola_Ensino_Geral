import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const provincias = pgTable("provincias", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: text("nome").notNull().unique(),
});

export const municipios = pgTable("municipios", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: text("nome").notNull(),
  provinciaId: integer("provinciaId").notNull().references(() => provincias.id),
});

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// -----------------------
// UTILIZADORES DO SISTEMA
// -----------------------
export const utilizadores = pgTable("utilizadores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senha: text("senha").notNull(),
  role: text("role").notNull(), // 'admin' | 'professor' | 'aluno' | 'financeiro' | 'rh' | 'encarregado' | 'director' | 'secretaria' | 'pedagogico' | 'chefe_secretaria' | 'ceo' | 'pca'
  escola: text("escola").notNull().default(''),
  ativo: boolean("ativo").notNull().default(true),
  alunoId: varchar("alunoId"), // only for role='encarregado'
  // Campos de enquadramento organizacional (preenchidos pelo RH)
  departamento: text("departamento"), // DepartamentoKey
  cargo: text("cargo"),               // CargoInfo.id
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  avatar: text("avatar"),
  cursoId: varchar("cursoId"), // coordenador_curso: ID do curso que coordena
});

// -----------------------
// FUNCIONÁRIOS (Registo Central de Pessoal — todos os trabalhadores)
// -----------------------
export const funcionarios = pgTable("funcionarios", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Dados Pessoais
  nome: text("nome").notNull(),
  apelido: text("apelido").notNull(),
  dataNascimento: text("dataNascimento").notNull().default(''),
  genero: text("genero").notNull().default(''), // 'M' | 'F'
  bi: text("bi").notNull().default(''),          // Bilhete de Identidade
  nif: text("nif").notNull().default(''),         // Número de Identificação Fiscal
  telefone: text("telefone").notNull().default(''),
  email: text("email").notNull().default(''),
  foto: text("foto"),
  provincia: text("provincia").notNull().default(''),
  municipio: text("municipio").notNull().default(''),
  morada: text("morada").notNull().default(''),

  // Enquadramento Organizacional (baseado na legislação angolana)
  departamento: text("departamento").notNull(), // DepartamentoKey
  cargo: text("cargo").notNull(),               // CargoInfo.id
  especialidade: text("especialidade").notNull().default(''), // e.g., Matemática, Física, etc.

  // Vínculo Contratual
  tipoContrato: text("tipoContrato").notNull().default('efectivo'), // 'efectivo' | 'contratado' | 'prestacao_servicos' | 'temporario' | 'bolseiro'
  dataContratacao: text("dataContratacao").notNull().default(''),
  dataFimContrato: text("dataFimContrato"),       // null = contrato sem prazo
  habilitacoes: text("habilitacoes").notNull().default(''), // Licenciatura, Mestrado, etc.

  // Dados Salariais
  salarioBase: real("salarioBase").notNull().default(0),
  subsidioAlimentacao: real("subsidioAlimentacao").notNull().default(0),
  subsidioTransporte: real("subsidioTransporte").notNull().default(0),
  subsidioHabitacao: real("subsidioHabitacao").notNull().default(0),
  outrosSubsidios: real("outrosSubsidios").notNull().default(0),
  subsidios: jsonb("subsidios").default(sql`'[]'::jsonb`),

  // Remuneração por Tempos Lectivos (colaboradores / prestação de serviços)
  // Para efectivos: salário base fixo + desconto por tempos não dados
  // Para colaboradores: valorPorTempoLectivo × temposSemanais × 4 semanas = salário mensal
  valorPorTempoLectivo: real("valorPorTempoLectivo").notNull().default(0), // valor unitário por tempo lectivo (Kz)
  temposSemanais: integer("temposSemanais").notNull().default(0),           // tempos lectivos por semana

  // Acesso ao Sistema
  utilizadorId: varchar("utilizadorId"), // link to utilizadores — null if no system access
  professorId: varchar("professorId"),   // link to professores — null if not a teacher

  // Estado
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes").notNull().default(''),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFuncionarioSchema = createInsertSchema(funcionarios).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFuncionario = z.infer<typeof insertFuncionarioSchema>;
export type Funcionario = typeof funcionarios.$inferSelect;

// -----------------------
// ANOS ACADÉMICOS
// -----------------------
export const anosAcademicos = pgTable("anos_academicos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ano: text("ano").notNull(),          // '2025/26'
  dataInicio: text("dataInicio").notNull(),
  dataFim: text("dataFim").notNull(),
  ativo: boolean("ativo").notNull().default(false),
  trimestres: jsonb("trimestres").notNull().default(sql`'[]'::jsonb`),
  // Épocas de exame: normal, recurso, especial — cada uma com dataInicio, dataFim e observacoes
  epocasExame: jsonb("epocasExame").default(sql`'{}'::jsonb`),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// ALUNOS
// -----------------------
export const alunos = pgTable("alunos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  numeroMatricula: text("numeroMatricula").notNull(),
  nome: text("nome").notNull(),
  apelido: text("apelido").notNull(),
  dataNascimento: text("dataNascimento").notNull(),
  genero: text("genero").notNull(),
  provincia: text("provincia").notNull(),
  municipio: text("municipio").notNull(),

  turmaId: varchar("turmaId")
    .references(() => turmas.id),

  cursoId: varchar("cursoId").references(() => cursos.id),

  nomePai: text("nomePai").default(''),
  nomeMae: text("nomeMae").default(''),

  // Identificação oficial do aluno
  numeroBi: text("numeroBi").default(''),
  numeroCedula: text("numeroCedula").default(''),
  biDataEmissao: text("biDataEmissao").default(''),
  biLocalEmissao: text("biLocalEmissao").default(''),

  // Encarregado completo
  nomeEncarregado: text("nomeEncarregado").notNull(),
  telefoneEncarregado: text("telefoneEncarregado").notNull(),
  emailEncarregado: text("emailEncarregado"),
  encarregadoProfissao: text("encarregadoProfissao").default(''),
  encarregadoLocalTrabalho: text("encarregadoLocalTrabalho").default(''),
  encarregadoResidencia: text("encarregadoResidencia").default(''),
  encarregadoContacto2: text("encarregadoContacto2").default(''),

  ativo: boolean("ativo").notNull().default(true),
  bloqueado: boolean("bloqueado").notNull().default(false),
  permitirAcessoComPendencia: boolean("permitirAcessoComPendencia").notNull().default(false),
  foto: text("foto"),

  falecido: boolean("falecido").notNull().default(false),
  dataFalecimento: text("dataFalecimento"),
  observacoesFalecimento: text("observacoesFalecimento"),
  registadoFalecimentoPor: text("registadoFalecimentoPor"),

  // Situação académica do aluno (D-AM-T-E e afins)
  // 'activo' | 'desistente' | 'anulacao_matricula' | 'transferido' | 'excluido' | 'concluido'
  situacao: text("situacao").notNull().default('activo'),
  dataSituacao: text("dataSituacao").default(''),
  motivoSituacao: text("motivoSituacao").default(''),
  registadoSituacaoPor: text("registadoSituacaoPor").default(''),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PROFESSORES
// -----------------------
export const professores = pgTable("professores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  numeroProfessor: text("numeroProfessor").notNull(),
  nome: text("nome").notNull(),
  apelido: text("apelido").notNull(),

  disciplinas: jsonb("disciplinas").notNull(),
  turmasIds: jsonb("turmasIds").notNull(),

  telefone: text("telefone").notNull(),
  email: text("email").notNull().unique(),
  habilitacoes: text("habilitacoes").notNull(),
  ativo: boolean("ativo").notNull().default(true),

  // Organização interna
  seccao: text("seccao").notNull().default(''), // Secção dentro do departamento (ex: Secretaria Pedagógica, Arquivo)

  // Dados Salariais (Payroll)
  cargo: text("cargo").default('Professor'),
  categoria: text("categoria").default(''),
  salarioBase: real("salarioBase").default(0),
  subsidioAlimentacao: real("subsidioAlimentacao").default(0),
  subsidioTransporte: real("subsidioTransporte").default(0),
  subsidioHabitacao: real("subsidioHabitacao").default(0),
  dataContratacao: text("dataContratacao"),
  tipoContrato: text("tipoContrato").default('efectivo'), // 'efectivo' | 'contratado' | 'prestacao_servicos'
  // Remuneração por Tempos Lectivos
  valorPorTempoLectivo: real("valorPorTempoLectivo").default(0), // valor por tempo lectivo (Kz) — para colaboradores
  temposSemanais: integer("temposSemanais").default(0),           // tempos lectivos por semana — para colaboradores

  nivelEnsino: text("nivelEnsino").notNull().default('I Ciclo'), // 'Primário' | 'I Ciclo' | 'II Ciclo'

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// FOLHAS DE SALÁRIOS (Payroll)
// -----------------------
export const folhasSalarios = pgTable("folhas_salarios", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  mes: integer("mes").notNull(),           // 1-12
  ano: integer("ano").notNull(),
  descricao: text("descricao").notNull().default(''),
  status: text("status").notNull().default('rascunho'), // 'rascunho' | 'processada' | 'aprovada' | 'paga'
  totalBruto: real("totalBruto").notNull().default(0),
  totalLiquido: real("totalLiquido").notNull().default(0),
  totalInssEmpregado: real("totalInssEmpregado").notNull().default(0),
  totalInssPatronal: real("totalInssPatronal").notNull().default(0),
  totalIrt: real("totalIrt").notNull().default(0),
  totalSubsidios: real("totalSubsidios").notNull().default(0),
  numFuncionarios: integer("numFuncionarios").notNull().default(0),
  processadaPor: text("processadaPor"),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

export const itensFolha = pgTable("itens_folha", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  folhaId: varchar("folhaId").notNull().references(() => folhasSalarios.id, { onDelete: "cascade" }),
  professorId: varchar("professorId").notNull(),
  professorNome: text("professorNome").notNull(),
  cargo: text("cargo").notNull().default('Professor'),
  categoria: text("categoria").notNull().default(''),
  // Vencimentos
  salarioBase: real("salarioBase").notNull().default(0),
  subsidioAlimentacao: real("subsidioAlimentacao").notNull().default(0),
  subsidioTransporte: real("subsidioTransporte").notNull().default(0),
  subsidioHabitacao: real("subsidioHabitacao").notNull().default(0),
  outrosSubsidios: real("outrosSubsidios").notNull().default(0),
  salarioBruto: real("salarioBruto").notNull().default(0),
  // Descontos
  inssEmpregado: real("inssEmpregado").notNull().default(0),   // 3%
  inssPatronal: real("inssPatronal").notNull().default(0),     // 8%
  irt: real("irt").notNull().default(0),                        // IRT Angola
  descontoFaltas: real("descontoFaltas").notNull().default(0), // Desconto por faltas (Kz)
  numFaltasInj: integer("numFaltasInj").notNull().default(0),  // Nº faltas injustificadas
  numMeioDia: integer("numMeioDia").notNull().default(0),      // Nº meios-dias
  outrosDescontos: real("outrosDescontos").notNull().default(0),
  totalDescontos: real("totalDescontos").notNull().default(0),
  // Remuneração extra por tempos lectivos / dias trabalhados (contratados)
  remuneracaoTempos: real("remuneracaoTempos").notNull().default(0), // Total pago por tempos lectivos ou dias
  numTempos: integer("numTempos").notNull().default(0),              // Nº de tempos lectivos / dias
  // Líquido
  salarioLiquido: real("salarioLiquido").notNull().default(0),
  // Meta
  tipoFuncionario: text("tipoFuncionario").notNull().default('professor'), // 'professor' | 'funcionario'
  departamento: text("departamento").notNull().default(''),
  seccao: text("seccao").notNull().default(''),
  observacao: text("observacao"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// FALTAS DE FUNCIONÁRIOS (controlo de faltas do pessoal)
// -----------------------
export const faltasFuncionarios = pgTable("faltas_funcionarios", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  funcionarioId: varchar("funcionarioId").notNull().references(() => funcionarios.id, { onDelete: "cascade" }),
  data: text("data").notNull(), // 'YYYY-MM-DD'
  tipo: text("tipo").notNull().default('injustificada'), // 'justificada' | 'injustificada' | 'meio_dia'
  motivo: text("motivo").notNull().default(''),
  descontavel: boolean("descontavel").notNull().default(true),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),
  registadoPor: text("registadoPor").notNull().default(''),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaltaFuncionarioSchema = createInsertSchema(faltasFuncionarios).omit({ id: true, criadoEm: true });
export type InsertFaltaFuncionario = z.infer<typeof insertFaltaFuncionarioSchema>;
export type FaltaFuncionario = typeof faltasFuncionarios.$inferSelect;

// -----------------------
// TEMPOS LECTIVOS / DIAS TRABALHADOS (pagamento por trabalho efectuado)
// -----------------------
export const temposLectivos = pgTable("tempos_lectivos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  funcionarioId: varchar("funcionarioId").notNull().references(() => funcionarios.id, { onDelete: "cascade" }),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),
  totalUnidades: integer("totalUnidades").notNull().default(0), // tempos lectivos (prof) ou dias (admin)
  valorUnitario: real("valorUnitario").notNull().default(0),
  totalCalculado: real("totalCalculado").notNull().default(0),
  tipo: text("tipo").notNull().default('professor'), // 'professor' | 'admin'
  departamento: text("departamento").notNull().default(''),
  observacoes: text("observacoes").notNull().default(''),
  aprovado: boolean("aprovado").notNull().default(false),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTempoLectivoSchema = createInsertSchema(temposLectivos).omit({ id: true, criadoEm: true, atualizadoEm: true });
export type InsertTempoLectivo = z.infer<typeof insertTempoLectivoSchema>;
export type TempoLectivo = typeof temposLectivos.$inferSelect;

// -----------------------
// CONFIGURAÇÃO RH (valores e taxas definidos pelo Recursos Humanos)
// -----------------------
export const configuracaoRH = pgTable("configuracao_rh", {
  id: integer("id").primaryKey().default(sql`1`),
  valorPorFalta: real("valorPorFalta").notNull().default(0),             // desconto por falta injustificada (Kz)
  valorMeioDia: real("valorMeioDia").notNull().default(0),                // desconto por meio-dia
  taxaTempoLectivo: real("taxaTempoLectivo").notNull().default(0),        // valor global por tempo lectivo (prof. contratado — substituído pelo individual)
  taxaAdminPorDia: real("taxaAdminPorDia").notNull().default(0),          // valor por dia trabalhado (pessoal admin)
  descontoPorTempoNaoDado: real("descontoPorTempoNaoDado").notNull().default(0), // desconto por tempo lectivo não dado (prof. efectivo)
  semanasPorMes: integer("semanasPorMes").notNull().default(4),           // semanas por mês para cálculo de colaboradores
  observacoes: text("observacoes").notNull().default(''),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// SALAS DE AULA
// -----------------------
export const salas = pgTable("salas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  bloco: text("bloco").notNull().default(''),
  capacidade: integer("capacidade").notNull().default(30),
  tipo: text("tipo").notNull().default('Sala Normal'), // "Sala Normal" | "Laboratório" | "Sala de Informática" | "Auditório" | "Sala de Reunião"
  ativo: boolean("ativo").notNull().default(true),
});

// -----------------------
// TURMAS
// -----------------------
export const turmas = pgTable("turmas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  classe: text("classe").notNull(),
  turno: text("turno").notNull(), // "Manhã" | "Tarde" | "Noite"
  anoLetivo: text("anoLetivo").notNull(),
  nivel: text("nivel").notNull(), // "Primário" | "I Ciclo" | "II Ciclo"

  professorId: varchar("professorId")
    .references(() => professores.id),

  professoresIds: jsonb("professoresIds").notNull().default(sql`'[]'::jsonb`),

  cursoId: varchar("cursoId").references(() => cursos.id),

  sala: text("sala").notNull(),
  capacidade: integer("capacidade").notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

// -----------------------
// NOTAS
// -----------------------
export const notas = pgTable("notas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId")
    .notNull()
    .references(() => alunos.id),

  turmaId: varchar("turmaId")
    .notNull()
    .references(() => turmas.id),

  disciplina: text("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(), // 1 | 2 | 3

  aval1: integer("aval1").notNull().default(0),
  aval2: integer("aval2").notNull().default(0),
  aval3: integer("aval3").notNull().default(0),
  aval4: integer("aval4").notNull().default(0),
  aval5: integer("aval5").notNull().default(0),
  aval6: integer("aval6").notNull().default(0),
  aval7: integer("aval7").notNull().default(0),
  aval8: integer("aval8").notNull().default(0),
  mac1: integer("mac1").notNull().default(0),
  pp1: integer("pp1").notNull().default(0),
  ppt: integer("ppt").notNull().default(0),
  mt1: integer("mt1").notNull().default(0),
  nf: integer("nf").notNull().default(0),
  mac: integer("mac").notNull().default(0),
  // 3º Trimestre — Classes de Transição (10ª/11ª Classe): Prova Global
  pg1: integer("pg1").notNull().default(0), // Prova Global do 1º Trimestre
  pg2: integer("pg2").notNull().default(0), // Prova Global do 2º Trimestre
  // 3º Trimestre — 12ª Classe: Exame
  ex1: integer("ex1").notNull().default(0), // Exame do 1º Trimestre
  ex2: integer("ex2").notNull().default(0), // Exame do 2º Trimestre
  // Prova de Recuperação (opcional, se habilitada nas configurações)
  provaRecuperacao: integer("provaRecuperacao").notNull().default(0),

  // Avaliação Formativa — Opção B: nota calculada a partir dos registos formativos
  // Escala 1–5 (igual a aval1–8). Contribui para o MAC com peso percFormativa%.
  notaFormativa: real("notaFormativa").notNull().default(0),

  // Snapshot da escala usada no momento do lançamento — protege o histórico
  // se a escola alterar a escala mais tarde. Permite reinterpretar correctamente
  // notas antigas mesmo após mudanças em config_geral.
  escalaMin: integer("escalaMin").notNull().default(1),
  escalaMax: integer("escalaMax").notNull().default(5),
  escalaTipo: text("escalaTipo").notNull().default('proporcional'),

  anoLetivo: text("anoLetivo").notNull(),
  professorId: varchar("professorId")
    .notNull()
    .references(() => professores.id),

  data: text("data").notNull(),

  lancamentos: jsonb("lancamentos"),
  camposAbertos: jsonb("camposAbertos").default(sql`'[]'::jsonb`),
  pedidosReabertura: jsonb("pedidosReabertura").default(sql`'[]'::jsonb`),
});

// -----------------------
// PRESENÇAS
// -----------------------
export const presencas = pgTable("presencas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId")
    .notNull()
    .references(() => alunos.id),

  turmaId: varchar("turmaId")
    .notNull()
    .references(() => turmas.id),

  disciplina: text("disciplina").notNull(),
  data: text("data").notNull(),
  status: text("status").notNull(), // "P" | "F" | "J"
  observacao: text("observacao"),
});

// -----------------------
// EVENTOS (CALENDÁRIO)
// -----------------------
export const eventos = pgTable("eventos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  data: text("data").notNull(),
  hora: text("hora").notNull(),
  tipo: text("tipo").notNull(),
  local: text("local").notNull(),
  turmasIds: jsonb("turmasIds").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// HORÁRIOS
// -----------------------
export const horarios = pgTable("horarios", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  turmaId: varchar("turmaId")
    .notNull()
    .references(() => turmas.id),

  disciplina: text("disciplina").notNull(),
  professorId: varchar("professorId").references(() => professores.id),
  professorNome: text("professorNome").notNull().default('—'),

  diaSemana: integer("diaSemana").notNull(),
  periodo: integer("periodo").notNull(),
  horaInicio: text("horaInicio").notNull(),
  horaFim: text("horaFim").notNull(),
  sala: text("sala").notNull().default(''),
  anoAcademico: text("anoAcademico").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PAUTAS
// -----------------------
export const pautas = pgTable("pautas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  disciplina: text("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(),
  professorId: varchar("professorId").notNull().references(() => professores.id),
  status: text("status").notNull().default('aberta'), // 'aberta' | 'fechada' | 'pendente_abertura' | 'rejeitada'
  anoLetivo: text("anoLetivo").notNull(),
  dataFecho: text("dataFecho"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// SOLICITAÇÕES DE ABERTURA DE PAUTA
// -----------------------
export const solicitacoesAbertura = pgTable("solicitacoes_abertura", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  pautaId: varchar("pautaId").notNull().references(() => pautas.id),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  turmaNome: text("turmaNome").notNull(),
  disciplina: text("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(),
  professorId: varchar("professorId").notNull().references(() => professores.id),
  professorNome: text("professorNome").notNull(),
  motivo: text("motivo").notNull(),
  status: text("status").notNull().default('pendente'), // 'pendente' | 'aprovada' | 'rejeitada'
  respondidoEm: text("respondidoEm"),
  observacao: text("observacao"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// MENSAGENS (PROFESSOR / TURMA / ALUNO)
// -----------------------
export const mensagens = pgTable("mensagens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  remetenteId: text("remetenteId").notNull(),
  remetenteNome: text("remetenteNome").notNull(),
  tipo: text("tipo").notNull(), // 'turma' | 'privada'
  turmaId: varchar("turmaId"),
  turmaNome: text("turmaNome"),
  destinatarioId: text("destinatarioId"),
  destinatarioNome: text("destinatarioNome"),
  destinatarioTipo: text("destinatarioTipo"), // 'professor' | 'aluno'
  assunto: text("assunto").notNull(),
  corpo: text("corpo").notNull(),
  lidaPor: jsonb("lidaPor").notNull().default(sql`'[]'::jsonb`),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// MATERIAIS DIDÁCTICOS
// -----------------------
export const materiais = pgTable("materiais", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  professorId: varchar("professorId").notNull().references(() => professores.id),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  turmaNome: text("turmaNome").notNull(),
  disciplina: text("disciplina").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull().default(''),
  tipo: text("tipo").notNull(), // 'texto' | 'link' | 'resumo' | 'pdf' | 'docx' | 'ppt'
  conteudo: text("conteudo").notNull(),
  nomeArquivo: text("nomeArquivo"),
  tamanhoArquivo: integer("tamanhoArquivo"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// SUMÁRIOS DE AULAS
// -----------------------
export const sumarios = pgTable("sumarios", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  professorId: varchar("professorId").notNull().references(() => professores.id),
  professorNome: text("professorNome").notNull(),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  turmaNome: text("turmaNome").notNull(),
  disciplina: text("disciplina").notNull(),
  data: text("data").notNull(),
  horaInicio: text("horaInicio").notNull(),
  horaFim: text("horaFim").notNull(),
  numeroAula: integer("numeroAula").notNull(),
  conteudo: text("conteudo").notNull(),
  observacaoAluno: text("observacaoAluno"),
  status: text("status").notNull().default('pendente'), // 'pendente' | 'aceite' | 'rejeitado'
  observacaoRH: text("observacaoRH"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CALENDÁRIO DE PROVAS
// -----------------------
export const calendarioProvas = pgTable("calendario_provas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull().default(''),
  turmasIds: jsonb("turmasIds").notNull().default(sql`'[]'::jsonb`),
  disciplina: text("disciplina").notNull(),
  data: text("data").notNull(),
  hora: text("hora").notNull(),
  tipo: text("tipo").notNull(), // 'teste' | 'exame' | 'trabalho' | 'prova_oral'
  publicado: boolean("publicado").notNull().default(false),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// TAXAS ESCOLARES
// -----------------------
export const taxas = pgTable("taxas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  tipo: text("tipo").notNull(), // 'propina' | 'matricula' | 'material' | 'exame' | 'multa' | 'outro'
  descricao: text("descricao").notNull(),
  valor: real("valor").notNull(),
  frequencia: text("frequencia").notNull(), // 'mensal' | 'trimestral' | 'anual' | 'unica'
  nivel: text("nivel").notNull(),
  anoAcademico: text("anoAcademico").notNull(),
  ativo: boolean("ativo").notNull().default(true),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PAGAMENTOS
// -----------------------
export const pagamentos = pgTable("pagamentos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  taxaId: varchar("taxaId").notNull().references(() => taxas.id),
  valor: real("valor").notNull(),
  data: text("data").notNull(),
  mes: integer("mes"),
  trimestre: integer("trimestre"),
  ano: text("ano").notNull(),
  status: text("status").notNull().default('pendente'), // 'pago' | 'pendente' | 'cancelado'
  metodoPagamento: text("metodoPagamento").notNull(), // 'dinheiro' | 'transferencia' | 'multicaixa'
  referencia: text("referencia"),
  observacao: text("observacao"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// ORÇAMENTOS POR RUBRICA (anual)
// -----------------------
export const orcamentosRubrica = pgTable("orcamentos_rubrica", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  taxaId: varchar("taxaId").notNull().references(() => taxas.id, { onDelete: "cascade" }),
  ano: text("ano").notNull(),
  valorPrevisto: real("valorPrevisto").notNull().default(0),
  observacoes: text("observacoes"),
  criadoPor: text("criadoPor"),

  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// MENSAGENS FINANCEIRAS
// -----------------------
export const mensagensFinanceiras = pgTable("mensagens_financeiras", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  remetente: text("remetente").notNull(),
  texto: text("texto").notNull(),
  data: text("data").notNull(),
  lida: boolean("lida").notNull().default(false),
  tipo: text("tipo").notNull().default('geral'), // 'aviso' | 'bloqueio' | 'rupe' | 'geral'

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// RUPES
// -----------------------
export const rupes = pgTable("rupes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  taxaId: varchar("taxaId").notNull().references(() => taxas.id),
  valor: real("valor").notNull(),
  referencia: text("referencia").notNull(),
  dataGeracao: text("dataGeracao").notNull(),
  dataValidade: text("dataValidade").notNull(),
  status: text("status").notNull().default('ativo'), // 'ativo' | 'pago' | 'expirado'

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// SALDO DE ALUNOS (Crédito / Saldo em Conta)
// -----------------------
export const saldoAlunos = pgTable("saldo_alunos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull().unique().references(() => alunos.id),
  saldo: real("saldo").notNull().default(0),
  dataProximaCobranca: text("dataProximaCobranca"),
  observacoes: text("observacoes"),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// MOVIMENTOS DE SALDO
// -----------------------
export const movimentosSaldo = pgTable("movimentos_saldo", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  tipo: text("tipo").notNull(), // 'credito' | 'debito' | 'transferencia_in' | 'transferencia_out' | 'pagamento_excesso'
  valor: real("valor").notNull(),
  descricao: text("descricao").notNull(),
  pagamentoId: varchar("pagamentoId"),
  criadoPor: text("criadoPor"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PUSH SUBSCRIPTIONS (Web Push / VAPID)
// -----------------------
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  utilizadorId: varchar("utilizadorId").notNull(), // encarregado's user id
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("userAgent"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// NOTIFICAÇÕES
// -----------------------
export const notificacoes = pgTable("notificacoes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  utilizadorId: varchar("utilizadorId"), // null = global/broadcast; set = user-specific
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem").notNull(),
  tipo: text("tipo").notNull().default('info'), // 'info' | 'aviso' | 'urgente' | 'sucesso'
  data: text("data").notNull(),
  lida: boolean("lida").notNull().default(false),
  link: text("link"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// SOLICITAÇÕES DE MATRÍCULA
// -----------------------
export const registros = pgTable("registros", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nomeCompleto: text("nomeCompleto").notNull(),
  dataNascimento: text("dataNascimento").notNull(),
  genero: text("genero").notNull(),
  provincia: text("provincia").notNull(),
  municipio: text("municipio").notNull(),

  // Contacto
  telefone: text("telefone").notNull().default(''),
  email: text("email").notNull().default(''),

  // Localização
  endereco: text("endereco").notNull().default(''),
  bairro: text("bairro").notNull().default(''),

  // Identificação oficial
  numeroBi: text("numeroBi").notNull().default(''),
  numeroCedula: text("numeroCedula").notNull().default(''),

  // Escolaridade
  nivel: text("nivel").notNull(),
  classe: text("classe").notNull(),
  cursoId: varchar("cursoId").references(() => cursos.id),

  // Encarregado
  nomeEncarregado: text("nomeEncarregado").notNull(),
  telefoneEncarregado: text("telefoneEncarregado").notNull(),
  observacoes: text("observacoes").notNull().default(''),

  // Processo de admissão
  // status: 'pendente' | 'aprovado' | 'rejeitado' | 'admitido' | 'reprovado_admissao' | 'matriculado'
  status: text("status").notNull().default('pendente'),
  senhaProvisoria: text("senhaProvisoria"),
  dataProva: text("dataProva"),
  notaAdmissao: real("notaAdmissao"),
  resultadoAdmissao: text("resultadoAdmissao"),
  matriculaCompleta: boolean("matriculaCompleta").notNull().default(false),
  rupeInscricao: text("rupeInscricao"),
  rupeMatricula: text("rupeMatricula"),

  avaliadoEm: text("avaliadoEm"),
  avaliadoPor: text("avaliadoPor"),
  motivoRejeicao: text("motivoRejeicao"),

  // Tipo de inscrição: 'novo' (primeiro ingresso) | 'reconfirmacao' (reprovado do ano anterior)
  tipoInscricao: text("tipoInscricao").notNull().default('novo'),

  // Pagamento da taxa de inscrição confirmado pela área financeira
  pagamentoInscricaoConfirmado: boolean("pagamentoInscricaoConfirmado").notNull().default(false),
  pagamentoInscricaoConfirmadoEm: text("pagamentoInscricaoConfirmadoEm"),
  pagamentoInscricaoConfirmadoPor: text("pagamentoInscricaoConfirmadoPor"),

  // Pagamento da taxa de matrícula confirmado pelo admin
  pagamentoMatriculaConfirmado: boolean("pagamentoMatriculaConfirmado").notNull().default(false),
  pagamentoMatriculaConfirmadoEm: text("pagamentoMatriculaConfirmadoEm"),
  pagamentoMatriculaConfirmadoPor: text("pagamentoMatriculaConfirmadoPor"),

  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PERMISSÕES POR UTILIZADOR
// -----------------------
export const userPermissions = pgTable("user_permissions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  permissoes: jsonb("permissoes").notNull().default(sql`'{}'::jsonb`),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// BIBLIOTECA ESCOLAR
// -----------------------
export const livros = pgTable("livros", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  titulo: text("titulo").notNull(),
  autor: text("autor").notNull(),
  isbn: text("isbn").notNull().default(''),
  categoria: text("categoria").notNull().default('Geral'),
  editora: text("editora").notNull().default(''),
  anoPublicacao: integer("anoPublicacao"),
  quantidadeTotal: integer("quantidadeTotal").notNull().default(1),
  quantidadeDisponivel: integer("quantidadeDisponivel").notNull().default(1),
  localizacao: text("localizacao").notNull().default(''),
  descricao: text("descricao").notNull().default(''),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export const emprestimos = pgTable("emprestimos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  livroId: varchar("livroId").notNull().references(() => livros.id),
  livroTitulo: text("livroTitulo").notNull(),
  alunoId: varchar("alunoId"),
  nomeLeitor: text("nomeLeitor").notNull(),
  tipoLeitor: text("tipoLeitor").notNull().default('aluno'), // 'aluno' | 'professor' | 'externo'
  dataEmprestimo: text("dataEmprestimo").notNull(),
  dataPrevistaDevolucao: text("dataPrevistaDevolucao").notNull(),
  dataDevolucao: text("dataDevolucao"),
  status: text("status").notNull().default('emprestado'), // 'emprestado' | 'devolvido' | 'atrasado'
  observacao: text("observacao"),
  registadoPor: text("registadoPor").notNull().default('Sistema'),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CURSOS
// -----------------------
export const cursos = pgTable("cursos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  codigo: text("codigo").notNull().default(''),
  areaFormacao: text("areaFormacao").notNull(),
  descricao: text("descricao").notNull().default(''),
  ativo: boolean("ativo").notNull().default(true),

  cargaHoraria: integer("cargaHoraria").notNull().default(0),
  duracao: text("duracao").notNull().default(''),
  ementa: text("ementa").notNull().default(''),
  portaria: text("portaria").notNull().default(''),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CONFIGURAÇÕES DA ESCOLA
// -----------------------
export const configGeral = pgTable("config_geral", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nomeEscola: text("nomeEscola").notNull().default('Escola Secundária N.º 1 de Luanda'),
  logoUrl: text("logoUrl"),
  pp1Habilitado: boolean("pp1Habilitado").notNull().default(true),
  pptHabilitado: boolean("pptHabilitado").notNull().default(true),
  notaMinimaAprovacao: integer("notaMinimaAprovacao").notNull().default(10),
  maxAlunosTurma: integer("maxAlunosTurma").notNull().default(35),
  numAvaliacoes: integer("numAvaliacoes").notNull().default(4),
  macMin: integer("macMin").notNull().default(1),
  macMax: integer("macMax").notNull().default(5),
  // Modo de conversão da escala bruta (macMin..macMax) para a canónica 0–20:
  //  'proporcional' = valor/macMax * 20  (ex.: 1→4, 5→20) — convenção informal mais comum
  //  'linear'       = (valor-macMin)/(macMax-macMin) * 20  (ex.: 1→0, 5→20)
  tipoEscala: text("tipoEscala").notNull().default('proporcional'),
  horarioFuncionamento: text("horarioFuncionamento").notNull().default('Seg-Sex: 07:00-19:00 | Sáb: 07:00-13:00'),
  flashScreen: jsonb("flashScreen").notNull().default(sql`'{}'::jsonb`),
  multaConfig: jsonb("multaConfig").notNull().default(sql`'{"percentagem":10,"diasCarencia":5,"ativo":true}'::jsonb`),
  inscricoesAbertas: boolean("inscricoesAbertas").notNull().default(false),
  inscricaoDataInicio: text("inscricaoDataInicio"),
  inscricaoDataFim: text("inscricaoDataFim"),
  propinaHabilitada: boolean("propinaHabilitada").notNull().default(true),

  // Dados bancários para pagamentos
  numeroEntidade: text("numeroEntidade"),
  iban: text("iban"),
  nomeBeneficiario: text("nomeBeneficiario"),
  bancoTransferencia: text("bancoTransferencia"),
  telefoneMulticaixaExpress: text("telefoneMulticaixaExpress"),
  nib: text("nib"),

  // Cabeçalho oficial nos documentos (Mini-Pauta, Relatórios, etc.)
  cabecalhoLinha1: text("cabecalhoLinha1"), // ex.: REPÚBLICA DE ANGOLA
  cabecalhoLinha2: text("cabecalhoLinha2"), // ex.: ADMINISTRAÇÃO DO MUNICÍPIO DE CACUSO
  cabecalhoLinha3: text("cabecalhoLinha3"), // ex.: DIRECÇÃO MUNICIPAL DA EDUCAÇÃO
  cabecalhoLinha4: text("cabecalhoLinha4"), // ex.: LICEU Nº 303 — deixar em branco para usar nomeEscola

  // Dados de identificação MED (Ministério da Educação)
  codigoMED: text("codigoMED"),           // Código atribuído pelo MED
  nifEscola: text("nifEscola"),           // Número de Identificação Fiscal
  provinciaEscola: text("provinciaEscola"),
  municipioEscola: text("municipioEscola"),
  tipoEnsino: text("tipoEnsino").default('Secundário'), // Primário | Secundário | Técnico-Profissional
  modalidade: text("modalidade").default('Presencial'),  // Presencial | Semi-presencial | EaD
  directorGeral: text("directorGeral"),
  directorPedagogico: text("directorPedagogico"),
  directorProvincialEducacao: text("directorProvincialEducacao"),

  // ─── Identidade da empresa proprietária do sistema (editável só pelo CEO) ──
  empresaNome: text("empresaNome").default('Super Escola'),
  empresaTelefone: text("empresaTelefone"),
  empresaEmail: text("empresaEmail"),
  empresaLogo: text("empresaLogo"),       // URL ou base64
  empresaWebsite: text("empresaWebsite"),

  // Licença do sistema
  licencaAtivacao: text("licencaAtivacao"),   // "YYYY-MM-DD" — data em que o sistema foi ativado pela 1ª vez
  licencaExpiracao: text("licencaExpiracao"), // "YYYY-MM-DD" — data de expiração
  licencaPlano: text("licencaPlano").default('avaliacao'),
  licencaNivel: text("licencaNivel").default('rubi'),          // prata | ouro | rubi
  licencaPrecoPorAluno: integer("licencaPrecoPorAluno").default(50), // KZ por aluno matriculado
  licencaSaldoCredito: integer("licencaSaldoCredito").default(0),    // crédito acumulado para desconto na próxima renovação

  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),

  // Taxas salariais (configuráveis pelo admin)
  inssEmpPerc: real("inssEmpPerc").notNull().default(3),           // % INSS empregado
  inssPatrPerc: real("inssPatrPerc").notNull().default(8),          // % INSS patronal
  irtTabela: jsonb("irtTabela").notNull().default(sql`'[]'::jsonb`), // tabela IRT por escalões

  // Meses do ano académico (ordem de exibição no boletim de propinas e painel financeiro)
  mesesAnoAcademico: jsonb("mesesAnoAcademico").notNull().default(sql`'[9,10,11,12,1,2,3,4,5,6]'::jsonb`),

  // Exame Antecipado — permite que alunos com negativa em disciplinas terminais façam exame sem arrastar para o próximo ano
  exameAntecipadoHabilitado: boolean("exameAntecipadoHabilitado").notNull().default(false),

  // Exclusão por duas reprovações na mesma classe (activável/desactivável)
  exclusaoDuasReprovacoes: boolean("exclusaoDuasReprovacoes").notNull().default(false),
  // Art. 23º §2 — I Ciclo: proíbe transição condicional quando as 2 negativas (7–9 val.) são
  // simultaneamente Língua Portuguesa E Matemática (aplica-se a 7ª e 8ª classes)
  restricaoArt23ICiclo: boolean("restricaoArt23ICiclo").notNull().default(false),
  // Art. 23º §2 — II Ciclo (10ª, 11ª, 12ª classes): mesma regra, disciplinas nucleares configuráveis
  restricaoArt23IICiclo: boolean("restricaoArt23IICiclo").notNull().default(false),
  // Art. 23º §10 — número máximo de disciplinas negativas (7-9 val.) que permitem transição condicional
  maxNegativosICiclo: integer("maxNegativosICiclo").notNull().default(2),   // I Ciclo (7ª/8ª): dec. diz 2
  maxNegativosIICiclo: integer("maxNegativosIICiclo").notNull().default(3), // II Ciclo (10ª/11ª): dec. diz 3
  // Restrição II Ciclo: LP + 2 disciplinas específicas da área bloqueiam transição condicional (Art. 23 §10)
  restricaoLPAreaIICiclo: boolean("restricaoLPAreaIICiclo").notNull().default(false),
  // Nº máximo de disciplinas não-nucleares com deficiência que ainda permitem aprovação (0 = desactivado)
  maxDeficienciasAprovacao: integer("maxDeficienciasAprovacao").notNull().default(0),

  // PAP — Prova de Aptidão Profissional (Ensino Técnico-Profissional)
  papHabilitado: boolean("papHabilitado").notNull().default(false),
  // Classes alvo do PAP (ex: ["12ª Classe", "13ª Classe"])
  papClasses: jsonb("papClasses").notNull().default(sql`'["13ª Classe"]'::jsonb`),
  // Se true, o estágio é tratado como disciplina no plano curricular (aparece na pauta normal)
  estagioComoDisciplina: boolean("estagioComoDisciplina").notNull().default(false),
  // Nomes das disciplinas curriculares que contribuem para a nota PAP (além de estágio e defesa)
  papDisciplinasContribuintes: jsonb("papDisciplinasContribuintes").notNull().default(sql`'[]'::jsonb`),

  // ─── Percentagens das Provas (Sistema de Avaliação) ───────────────────────────
  // MAC na Nota Trimestral: percMac + percPp = 100
  percMac: real("percMac").notNull().default(30),       // % do MAC na Nota Trimestral
  percPp: real("percPp").notNull().default(70),         // % da PP na Nota Trimestral
  // Avaliação Formativa — Opção B: activar peso numérico dentro do MAC
  avaliacaoFormativaHabilitada: boolean("avaliacaoFormativaHabilitada").notNull().default(false),
  // % da Avaliação Formativa dentro do MAC (0–50%). Só activo quando avaliacaoFormativaHabilitada=true.
  // MAC_final = MAC_sumativo×(1-percFormativa/100) + notaFormativa×(percFormativa/100)
  percFormativa: real("percFormativa").notNull().default(20),
  // Pesos da Nota Final por trimestre (T1/T2): percNt + percPt = 100
  percNt: real("percNt").notNull().default(60),         // % da Nota Trimestral na NF (T1/T2)
  percPt: real("percPt").notNull().default(40),         // % da PT na NF (T1/T2)
  // 3º Trimestre — Classes de Transição (10ª/11ª): percPg*2 + percNt3 = 100
  percPg: real("percPg").notNull().default(40),         // % de cada Prova Global (T3, 10ª/11ª)
  // 3º Trimestre — 12ª Classe: percExame*2 + percNt3Exam = 100
  percExame: real("percExame").notNull().default(40),   // % de cada Exame (T3, 12ª Classe)
  // Prova de Recuperação
  provaRecuperacaoHabilitada: boolean("provaRecuperacaoHabilitada").notNull().default(false),

  // ─── Exame de Recurso (Art. 33º) ─────────────────────────────────────────────
  // Número máximo de negativas (no intervalo [notaMinRecurso, notaMaxRecurso]) que habilitam ao recurso
  maxNegativosRecurso: integer("maxNegativosRecurso").notNull().default(3),
  // Intervalo de notas considerado "negativa para recurso" (decreto: 6-9)
  notaMinRecurso: integer("notaMinRecurso").notNull().default(6),
  notaMaxRecurso: integer("notaMaxRecurso").notNull().default(9),
  // 9ª Classe: proíbe recurso se LP e Matemática forem simultaneamente negativas
  restricaoLPMatRecurso: boolean("restricaoLPMatRecurso").notNull().default(true),

  // ─── Exame de Melhoria de Nota (Art. 36º) ────────────────────────────────────
  melhoriaNotaHabilitada: boolean("melhoriaNotaHabilitada").notNull().default(false),
  // Número máximo de disciplinas que um aluno pode pedir melhoria (decreto: 5)
  maxDisciplinasMelhoria: integer("maxDisciplinasMelhoria").notNull().default(5),
  // Prazo em horas após publicação dos resultados para solicitar melhoria (decreto: 48h)
  prazoHorasMelhoria: integer("prazoHorasMelhoria").notNull().default(48),
  // Intervalo de notas elegível para melhoria (decreto: 10-16 no secundário)
  notaMinMelhoria: integer("notaMinMelhoria").notNull().default(10),
  notaMaxMelhoria: integer("notaMaxMelhoria").notNull().default(16),

  // ─── 13ª Classe ──────────────────────────────────────────────────────────────
  // Se false, toda a referência à 13ª Classe fica oculta na aplicação (turmas, dropdowns, certificados, PAP, etc.)
  temDecimaTermeira: boolean("temDecimaTermeira").notNull().default(true),
});

// -----------------------
// LOOKUP ITEMS (listas configuráveis do sistema)
// -----------------------
export const lookupItems = pgTable("lookup_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  categoria: text("categoria").notNull(), // classes | niveis | turnos | tipos_sala | areas_conhecimento | areas_curso | tipos_taxa | metodos_pagamento | disciplinas_fallback
  valor: text("valor").notNull(),         // valor técnico (chave usada no código)
  label: text("label").notNull(),         // label de exibição
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  icon: text("icon"),                     // nome do ícone Ionicons (opcional, ex: "car")
  cor: text("cor"),                       // cor hex (opcional, ex: "#3b82f6")
});

// -----------------------
// PLANIFICAÇÕES DE AULA
// -----------------------
export const planificacoes = pgTable("planificacoes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  professorId: varchar("professorId").notNull().references(() => professores.id),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  disciplina: text("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(), // 1 | 2 | 3
  semana: integer("semana").notNull(),       // semana do trimestre
  anoLetivo: text("anoLetivo").notNull(),

  tema: text("tema").notNull(),
  objectivos: text("objectivos").notNull().default(''),
  conteudos: text("conteudos").notNull().default(''),
  metodologia: text("metodologia").notNull().default(''),
  recursos: text("recursos").notNull().default(''),
  avaliacao: text("avaliacao").notNull().default(''),
  observacoes: text("observacoes").notNull().default(''),
  numAulas: integer("numAulas").notNull().default(1),
  cumprida: boolean("cumprida").notNull().default(false),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CONTEÚDOS PROGRAMÁTICOS
// -----------------------
export const conteudosProgramaticos = pgTable("conteudos_programaticos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  disciplina: text("disciplina").notNull(),
  classe: text("classe").notNull(),
  trimestre: integer("trimestre").notNull(),
  anoLetivo: text("anoLetivo").notNull(),

  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull().default(''),
  ordem: integer("ordem").notNull().default(0),
  cumprido: boolean("cumprido").notNull().default(false),
  percentagem: integer("percentagem").notNull().default(0), // 0–100

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// OCORRÊNCIAS DISCIPLINARES
// -----------------------
export const ocorrencias = pgTable("ocorrencias", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  professorId: varchar("professorId").references(() => professores.id),
  registadoPor: text("registadoPor").notNull(),

  tipo: text("tipo").notNull(), // 'comportamento' | 'falta_injustificada' | 'violencia' | 'fraude' | 'outro'
  gravidade: text("gravidade").notNull().default('leve'), // 'leve' | 'moderada' | 'grave'
  descricao: text("descricao").notNull(),
  medidaTomada: text("medidaTomada").notNull().default(''),
  data: text("data").notNull(),
  resolvida: boolean("resolvida").notNull().default(false),
  observacoes: text("observacoes").notNull().default(''),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// DOCUMENTOS EMITIDOS (HISTÓRICO POR ALUNO)
// -----------------------
export const documentosEmitidos = pgTable("documentos_emitidos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("aluno_id"),
  alunoNome: text("aluno_nome").notNull(),
  alunoNum: text("aluno_num").notNull(),
  alunoTurma: text("aluno_turma"),

  tipo: text("tipo").notNull(),
  finalidade: text("finalidade").default(''),
  anoAcademico: text("ano_academico").default(''),

  emitidoPor: text("emitido_por").notNull(),
  emitidoEm: timestamp("emitido_em", { withTimezone: true }).notNull().defaultNow(),

  dadosSnapshot: text("dados_snapshot"),
});

// -----------------------
// MODELOS DE DOCUMENTOS (EDITOR)
// -----------------------
export const docTemplates = pgTable("doc_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  conteudo: text("conteudo").notNull(),
  insigniaBase64: text("insignia_base64"),
  marcaAguaBase64: text("marca_agua_base64"),
  classeAlvo: text("classe_alvo"),
  bloqueado: boolean("bloqueado").notNull().default(false),
  disponivelAluno: boolean("disponivel_aluno").notNull().default(false),

  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// DISCIPLINAS (catálogo)
// -----------------------
export const disciplinas = pgTable("disciplinas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  codigo: text("codigo").notNull().default(''),
  area: text("area").notNull().default(''),
  descricao: text("descricao").notNull().default(''),
  ativo: boolean("ativo").notNull().default(true),

  // Tipo: 'terminal' (termina antes da 12ª) ou 'continuidade' (10ª a 12ª)
  tipo: text("tipo").notNull().default('continuidade'),
  // Classes em que a disciplina é leccionada (valores do lookup 'classes')
  classeInicio: text("classeInicio").notNull().default(''),
  classeFim: text("classeFim").notNull().default(''),

  // Ligação ao curso (opcional — se null é uma disciplina global/partilhada)
  cursoId: varchar("cursoId").references(() => cursos.id),
  // Carga horária semanal e se é obrigatória nesse curso
  cargaHoraria: integer("cargaHoraria").notNull().default(0),
  obrigatoria: boolean("obrigatoria").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  // Disciplina nuclear: não pode ter deficiência para aprovação (fórmula NEN/exame)
  nuclear: boolean("nuclear").notNull().default(false),
  // Disciplina nuclear para Art. 23º §2: quando TODAS as negativas leves do aluno
  // são desta lista, a transição condicional é bloqueada (I e II Ciclo, conforme config)
  nuclearArt23: boolean("nuclearArt23").notNull().default(false),

  // Categoria para distribuição no certificado:
  // 'formacao_geral' | 'formacao_especifica' | 'opcional' | ''
  categoriaFormacao: text("categoriaFormacao").notNull().default(''),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CURSO_DISCIPLINAS (ligação muitos-para-muitos: curso ↔ disciplina do catálogo)
// -----------------------
export const cursoDisciplinas = pgTable("curso_disciplinas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  cursoId: varchar("cursoId")
    .notNull()
    .references(() => cursos.id),

  disciplinaId: varchar("disciplinaId")
    .notNull()
    .references(() => disciplinas.id),

  obrigatoria: boolean("obrigatoria").notNull().default(true),
  cargaHoraria: integer("cargaHoraria").notNull().default(0),
  ordem: integer("ordem").notNull().default(0),
  removida: boolean("removida").notNull().default(false),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// TOKENS DE RESET DE SENHA
// -----------------------
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PLANOS DE AULA
// -----------------------
export const planosAula = pgTable("planos_aula", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  professorId: varchar("professorId").notNull(),
  professorNome: text("professorNome").notNull(),
  turmaId: varchar("turmaId"),
  turmaNome: text("turmaNome").notNull().default(''),
  disciplina: text("disciplina").notNull(),
  unidade: text("unidade").notNull().default(''),
  sumario: text("sumario").notNull().default(''),
  classe: text("classe").notNull().default(''),
  escola: text("escola").notNull().default(''),
  perfilEntrada: text("perfilEntrada").notNull().default(''),
  perfilSaida: text("perfilSaida").notNull().default(''),
  data: text("data").notNull().default(''),
  periodo: text("periodo").notNull().default(''),
  tempo: text("tempo").notNull().default(''),
  duracao: text("duracao").notNull().default(''),
  anoLetivo: text("anoLetivo").notNull().default(''),
  objectivoGeral: text("objectivoGeral").notNull().default(''),
  objectivosEspecificos: text("objectivosEspecificos").notNull().default(''),
  fases: jsonb("fases").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default('rascunho'),
  observacaoDirector: text("observacaoDirector"),
  aprovadoPor: text("aprovadoPor"),
  aprovadoEm: text("aprovadoEm"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// TRANSFERÊNCIAS DE ALUNOS
// -----------------------
export const transferencias = pgTable("transferencias", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  tipo: text("tipo").notNull(), // 'entrada' | 'saida'
  status: text("status").notNull().default("pendente"), // 'pendente' | 'aprovado' | 'concluido' | 'rejeitado'

  nomeAluno: text("nomeAluno").notNull(),
  alunoId: varchar("alunoId"),

  escolaOrigem: text("escolaOrigem"),
  escolaDestino: text("escolaDestino"),
  classeOrigem: text("classeOrigem"),
  classeDestino: text("classeDestino"),
  turmaDestinoId: varchar("turmaDestinoId"),

  motivo: text("motivo"),
  observacoes: text("observacoes"),

  documentosRecebidos: jsonb("documentosRecebidos").default(sql`'[]'::jsonb`),

  dataRequisicao: text("dataRequisicao"),
  dataAprovacao: text("dataAprovacao"),
  dataConclusao: text("dataConclusao"),

  criadoPor: text("criadoPor"),

  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// BOLSAS E DESCONTOS
// -----------------------
export const bolsas = pgTable("bolsas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId")
    .notNull()
    .references(() => alunos.id, { onDelete: "cascade" }),

  tipo: text("tipo").notNull().default("social"),
  // 'social' | 'merito' | 'desportivo' | 'funcionario' | 'parcial' | 'outro'

  percentagem: real("percentagem").notNull().default(100),
  // 0 = sem desconto, 100 = isento total, 50 = 50% de desconto

  descricao: text("descricao").default(""),
  dataInicio: text("dataInicio"),
  dataFim: text("dataFim"), // null = sem prazo definido

  ativo: boolean("ativo").notNull().default(true),
  aprovadoPor: text("aprovadoPor"),
  observacao: text("observacao"),

  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// CHAT INTERNO (Secretaria / Direcção / Professores)
// -----------------------
export const chatMensagens = pgTable("chat_mensagens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  remetenteId:   varchar("remetenteId").notNull(),
  remetenteNome: text("remetenteNome").notNull(),
  remetenteRole: text("remetenteRole").notNull(),

  destinatarioId:   varchar("destinatarioId").notNull(),
  destinatarioNome: text("destinatarioNome").notNull(),
  destinatarioRole: text("destinatarioRole").notNull().default(""),

  corpo: text("corpo").notNull(),
  lida:  boolean("lida").notNull().default(false),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMensagem = typeof chatMensagens.$inferSelect;

// -----------------------
// AVALIAÇÃO DE PROFESSORES
// -----------------------
export const avaliacoesProfessores = pgTable("avaliacoes_professores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  professorId: varchar("professorId")
    .notNull()
    .references(() => professores.id, { onDelete: "cascade" }),

  periodoLetivo: text("periodoLetivo").notNull(), // ex: "2025", "2025-1S"
  avaliador: text("avaliador").notNull(),
  avaliadorId: text("avaliadorId"),

  // Critérios pedagógicos (escala 1-5)
  notaPlaneamento:     real("notaPlaneamento").default(0),
  notaPontualidade:    real("notaPontualidade").default(0),
  notaMetodologia:     real("notaMetodologia").default(0),
  notaRelacaoAlunos:   real("notaRelacaoAlunos").default(0),
  notaRelacaoColegas:  real("notaRelacaoColegas").default(0),
  notaResultados:      real("notaResultados").default(0),
  notaDisciplina:      real("notaDisciplina").default(0),
  notaDesenvolvimento: real("notaDesenvolvimento").default(0),

  notaFinal: real("notaFinal").default(0),

  status: text("status").notNull().default("rascunho"),
  // 'rascunho' | 'submetida' | 'aprovada'

  pontosFuertes:  text("pontosFuertes").default(""),
  areasMelhoria:  text("areasMelhoria").default(""),
  recomendacoes:  text("recomendacoes").default(""),

  avaliacaoEm:  timestamp("avaliacaoEm", { withTimezone: true }),
  criadoEm:     timestamp("criadoEm",    { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// TRABALHOS FINAIS DE CURSO
// -----------------------
export const trabalhosFinals = pgTable("trabalhos_finais", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  titulo: text("titulo").notNull(),
  autor: text("autor").notNull(),
  orientador: text("orientador").notNull(),
  anoConclusao: integer("anoConclusao").notNull(),
  curso: text("curso").notNull(),
  imagemCapa: text("imagemCapa"),
  resumo: text("resumo").default(""),
  visitas: integer("visitas").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrabalhoFinalSchema = createInsertSchema(trabalhosFinals).omit({ id: true, criadoEm: true });
export type InsertTrabalhoFinal = z.infer<typeof insertTrabalhoFinalSchema>;
export type TrabalhoFinal = typeof trabalhosFinals.$inferSelect;

// -----------------------
// AUDIT LOG
// -----------------------
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId:    varchar("userId").notNull(),
  userEmail: text("userEmail").notNull(),
  userRole:  text("userRole").notNull(),
  userName:  text("userName"),

  acao:      text("acao").notNull(),      // 'criar' | 'atualizar' | 'eliminar' | 'login' | 'login_falhado' | 'aprovar' | 'rejeitar' | 'exportar'
  modulo:    text("modulo").notNull(),    // 'Alunos' | 'Professores' | 'Turmas' | ...
  descricao: text("descricao").notNull(), // Human-readable description

  recursoId: varchar("recursoId"),        // ID of the affected resource
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  dados:     jsonb("dados"),              // sanitised request body / extra context

  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------
// PAP — PROVA DE APTIDÃO PROFISSIONAL (13ª Classe)
// -----------------------
export const papAlunos = pgTable("pap_alunos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  anoLetivo: text("anoLetivo").notNull(),

  // Nota do Estágio Curricular (atribuída pelo professor orientador)
  notaEstagio: real("notaEstagio"),

  // Nota da Defesa do PAP / Prova Oral
  notaDefesa: real("notaDefesa"),

  // Notas das disciplinas que contribuem para o PAP: [{nome: string, nota: number}]
  notasDisciplinas: jsonb("notasDisciplinas").notNull().default(sql`'[]'::jsonb`),

  // Nota PAP calculada automaticamente: (avg(disciplinas) + notaEstagio + notaDefesa) / 3
  // Esta é a nota que consta no certificado
  notaPAP: real("notaPAP"),

  professorId: varchar("professorId").notNull().references(() => professores.id),
  observacoes: text("observacoes"),

  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  criadoEm:  timestamp("criadoEm",  { withTimezone: true }).notNull().defaultNow(),
});

export const insertPapAlunoSchema = createInsertSchema(papAlunos).omit({ id: true, criadoEm: true, updatedAt: true });
export type InsertPapAluno = z.infer<typeof insertPapAlunoSchema>;
export type PapAluno = typeof papAlunos.$inferSelect;

// -----------------------
// CONFIGURAÇÕES DE FALTA (por turma/disciplina — definido pelo Director de Turma)
// -----------------------
export const configuracoesFalta = pgTable("configuracoes_falta", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  turmaId: varchar("turmaId").notNull().references(() => turmas.id, { onDelete: "cascade" }),
  disciplina: text("disciplina").notNull(), // nome da disciplina ou '*' para todas
  anoLetivo: text("anoLetivo").notNull(),

  // Número máximo de faltas mensais antes de exclusão
  maxFaltasMensais: integer("maxFaltasMensais").notNull().default(3),

  // Activar controlo de faltas para esta turma/disciplina
  ativo: boolean("ativo").notNull().default(true),

  definidoPor: text("definidoPor").notNull().default(''), // nome do director de turma
  definidoPorId: varchar("definidoPorId"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export type ConfiguracaoFalta = typeof configuracoesFalta.$inferSelect;

// -----------------------
// REGISTOS MENSAIS DE FALTAS (controlo mensal por aluno/disciplina)
// -----------------------
export const registosFaltaMensal = pgTable("registos_falta_mensal", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id, { onDelete: "cascade" }),
  disciplina: text("disciplina").notNull(),
  mes: integer("mes").notNull(),   // 1-12
  ano: integer("ano").notNull(),
  trimestre: integer("trimestre").notNull().default(1), // 1|2|3

  totalFaltas: integer("totalFaltas").notNull().default(0),
  faltasJustificadas: integer("faltasJustificadas").notNull().default(0),
  faltasInjustificadas: integer("faltasInjustificadas").notNull().default(0),

  // 'normal' | 'em_risco' | 'excluido'
  status: text("status").notNull().default('normal'),

  // Registado/revisado pelo director de turma
  observacao: text("observacao").notNull().default(''),
  registadoPor: text("registadoPor").notNull().default(''),
  registadoPorId: varchar("registadoPorId"),

  // Data em que foi registado o levantamento mensal
  dataRegisto: text("dataRegisto").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type RegistoFaltaMensal = typeof registosFaltaMensal.$inferSelect;

// -----------------------
// EXCLUSÕES POR FALTA (registo formal de exclusão por disciplina)
// -----------------------
export const exclusoesFalta = pgTable("exclusoes_falta", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  disciplina: text("disciplina").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  trimestre: integer("trimestre").notNull(),
  mes: integer("mes").notNull(),
  ano: integer("ano").notNull(),

  totalFaltasAcumuladas: integer("totalFaltasAcumuladas").notNull().default(0),
  limiteFaltas: integer("limiteFaltas").notNull().default(3),

  // 'exclusao_disciplina' | 'anulacao_matricula' | 'dupla_reprovacao'
  tipoExclusao: text("tipoExclusao").notNull().default('exclusao_disciplina'),

  motivo: text("motivo").notNull().default(''),
  observacao: text("observacao").notNull().default(''),

  registadoPor: text("registadoPor").notNull(),
  registadoPorId: varchar("registadoPorId"),

  // Status: 'ativo' | 'anulado' (se a exclusão foi revertida por decisão superior)
  status: text("status").notNull().default('ativo'),

  dataExclusao: text("dataExclusao").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type ExclusaoFalta = typeof exclusoesFalta.$inferSelect;

// -----------------------
// SOLICITAÇÕES DE PROVA JUSTIFICADA
// -----------------------
export const solicitacoesProvaJustificada = pgTable("solicitacoes_prova_justificada", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  disciplina: text("disciplina").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  trimestre: integer("trimestre").notNull(),

  // Tipo de prova perdida
  tipoProva: text("tipoProva").notNull().default('teste'), // 'teste' | 'exame' | 'mini_teste' | 'trabalho'

  // Data original da prova perdida
  dataProvaOriginal: text("dataProvaOriginal").notNull(),

  // Data proposta para a prova justificada (pode ser definida pela escola)
  dataProvaJustificada: text("dataProvaJustificada"),

  motivo: text("motivo").notNull(),
  documentoJustificacao: text("documentoJustificacao"), // nome/referência do documento

  // 'pendente' | 'aprovada' | 'rejeitada' | 'realizada'
  status: text("status").notNull().default('pendente'),

  resposta: text("resposta").notNull().default(''),
  respondidoPor: text("respondidoPor").notNull().default(''),
  respondidoEm: text("respondidoEm"),

  solicitadoPor: text("solicitadoPor").notNull(), // nome do encarregado/aluno
  solicitadoPorId: varchar("solicitadoPorId"),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export type SolicitacaoProvaJustificada = typeof solicitacoesProvaJustificada.$inferSelect;

// -----------------------
// ANULAÇÕES DE MATRÍCULA
// -----------------------
export const anulacoesMatricula = pgTable("anulacoes_matricula", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  alunoNome: text("alunoNome").notNull(),
  turmaId: varchar("turmaId"),
  turmaNome: text("turmaNome").notNull().default(''),
  anoLetivo: text("anoLetivo").notNull(),

  // 'voluntaria' | 'disciplinar' | 'financeira' | 'faltas' | 'dupla_reprovacao' | 'outro'
  motivo: text("motivo").notNull(),
  descricao: text("descricao").notNull().default(''),

  dataAnulacao: text("dataAnulacao").notNull(),

  registadoPor: text("registadoPor").notNull(),
  registadoPorId: varchar("registadoPorId"),

  // Documentos associados ao processo
  documentos: jsonb("documentos").notNull().default(sql`'[]'::jsonb`),

  // Se o aluno pode ser re-admitido
  reAdmissaoPermitida: boolean("reAdmissaoPermitida").notNull().default(false),
  observacoes: text("observacoes").notNull().default(''),

  // Status: 'ativa' | 'revertida'
  status: text("status").notNull().default('ativa'),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type AnulacaoMatricula = typeof anulacoesMatricula.$inferSelect;

// -----------------------
// QUADRO DE HONRA
// -----------------------
export const quadroHonra = pgTable("quadro_honra", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  alunoNome: text("alunoNome").notNull(),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  turmaNome: text("turmaNome").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  trimestre: integer("trimestre"), // null = anual

  mediaGeral: real("mediaGeral").notNull().default(0),
  posicaoClasse: integer("posicaoClasse").notNull().default(1),
  posicaoGeral: integer("posicaoGeral"),

  // Melhor da escola no ano académico
  melhorEscola: boolean("melhorEscola").notNull().default(false),

  mencionado: text("mencionado").notNull().default(''), // 'louvor' | 'honra' | 'excelencia'
  publicado: boolean("publicado").notNull().default(false),

  geradoPor: text("geradoPor").notNull().default('Sistema'),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type QuadroHonraEntry = typeof quadroHonra.$inferSelect;

// -----------------------
// PROCESSOS SECRETARIA
// -----------------------
export const processosSecretaria = pgTable("processos_secretaria", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  tipo: text("tipo").notNull(),
  descricao: text("descricao").notNull(),
  solicitante: text("solicitante").notNull(),
  prazo: text("prazo"),
  status: text("status").notNull().default("pendente"),
  prioridade: text("prioridade").notNull().default("media"),

  criadoPor: text("criadoPor").notNull().default("Secretaria"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessoSecretaria = typeof processosSecretaria.$inferSelect;
export const insertProcessoSecretariaSchema = createInsertSchema(processosSecretaria);

// -----------------------
// PLANO DE CONTAS (Hierárquico mãe/filho)
// -----------------------
export const planoContas = pgTable("plano_contas", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  codigo: text("codigo").notNull(),           // e.g. "1", "1.1", "1.1.1"
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),               // 'receita' | 'despesa' | 'ativo' | 'passivo'
  parentId: varchar("parentId"),              // null = conta mãe raiz
  descricao: text("descricao").notNull().default(''),
  ativo: boolean("ativo").notNull().default(true),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanoContas = typeof planoContas.$inferSelect;
export const insertPlanoContasSchema = createInsertSchema(planoContas).omit({ id: true, createdAt: true });

// -----------------------
// CONTAS A PAGAR (Despesas da escola)
// -----------------------
export const contasPagar = pgTable("contas_pagar", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  descricao: text("descricao").notNull(),
  fornecedor: text("fornecedor").notNull().default(''),
  valor: real("valor").notNull(),
  dataVencimento: text("dataVencimento").notNull(),
  dataPagamento: text("dataPagamento"),
  status: text("status").notNull().default('pendente'), // 'pendente' | 'pago' | 'cancelado' | 'em_atraso'
  metodoPagamento: text("metodoPagamento"),             // 'dinheiro' | 'transferencia' | 'multicaixa'
  planoContaId: varchar("planoContaId"),                // FK to plano_contas (optional)
  referencia: text("referencia"),
  comprovante: text("comprovante"),
  observacao: text("observacao"),
  registadoPor: text("registadoPor").notNull().default('Sistema'),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export type ContaPagar = typeof contasPagar.$inferSelect;
export const insertContaPagarSchema = createInsertSchema(contasPagar).omit({ id: true, createdAt: true, updatedAt: true });

// -----------------------
// FERIADOS (Calendário Financeiro)
// -----------------------
export const feriados = pgTable("feriados", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  nome: text("nome").notNull(),
  data: text("data").notNull(),               // 'YYYY-MM-DD'
  tipo: text("tipo").notNull().default('nacional'), // 'nacional' | 'municipal' | 'escolar'
  recorrente: boolean("recorrente").notNull().default(true), // repeats every year
  ativo: boolean("ativo").notNull().default(true),

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type Feriado = typeof feriados.$inferSelect;
export const insertFeriadoSchema = createInsertSchema(feriados).omit({ id: true, createdAt: true });

// -----------------------
// CARTÃO DE ESTUDANTE — Histórico de leituras na portaria
// -----------------------
export const cartaoLeituras = pgTable("cartao_leituras", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  alunoId: varchar("alunoId").notNull().references(() => alunos.id, { onDelete: "cascade" }),
  leitorUserId: varchar("leitorUserId").notNull(),  // utilizador que fez a leitura (porteiro/secretaria)
  leitorNome: text("leitorNome"),
  resultado: text("resultado").notNull(),           // 'verde' | 'amarelo' | 'vermelho'
  motivo: text("motivo"),                           // texto humano explicando
  mesesAtraso: integer("mesesAtraso").notNull().default(0),
  valorDivida: real("valorDivida").notNull().default(0),
  cartaoPago: boolean("cartaoPago").notNull().default(false),
  anoLetivo: text("anoLetivo").notNull(),
  origemLeitura: text("origemLeitura"),             // 'portaria_web' | 'portaria_app' | 'manual'

  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});

export type CartaoLeitura = typeof cartaoLeituras.$inferSelect;
export const insertCartaoLeituraSchema = createInsertSchema(cartaoLeituras).omit({ id: true, createdAt: true });

// =============================================================================
// TABELAS ADICIONAIS (sincronizadas do Neon)
// =============================================================================

// -----------------------
// ACESSOS DIÁRIOS (Portaria QR)
// -----------------------
export const acessosDiarios = pgTable("acessos_diarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  localQrId: varchar("localQrId"),
  localNome: text("localNome"),
  tipo: text("tipo").notNull(),
  data: text("data").notNull(),
  propinasOk: boolean("propinasOk").notNull().default(false),
  mesesAtraso: integer("mesesAtraso").notNull().default(0),
  leitorUserId: varchar("leitorUserId"),
  leitorNome: text("leitorNome"),
  origemLeitura: text("origemLeitura"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type AcessoDiario = typeof acessosDiarios.$inferSelect;
export const insertAcessoDiarioSchema = createInsertSchema(acessosDiarios).omit({ id: true, createdAt: true });

// -----------------------
// LOCAIS QR (Portaria)
// -----------------------
export const locaisQr = pgTable("locais_qr", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("portao"),
  turmaId: varchar("turmaId"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type LocalQr = typeof locaisQr.$inferSelect;
export const insertLocalQrSchema = createInsertSchema(locaisQr).omit({ id: true, createdAt: true });

// -----------------------
// IA — CONVERSAS
// -----------------------
export const aiConversas = pgTable("ai_conversas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  utilizadorId: text("utilizador_id").notNull(),
  titulo: text("titulo").notNull().default("Nova conversa"),
  mensagens: jsonb("mensagens").notNull().default(sql`'[]'::jsonb`),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
export type AiConversa = typeof aiConversas.$inferSelect;
export const insertAiConversaSchema = createInsertSchema(aiConversas).omit({ id: true, criadoEm: true, atualizadoEm: true });

// -----------------------
// IA — FEEDBACK
// -----------------------
export const aiFeedback = pgTable("ai_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  utilizadorId: text("utilizador_id").notNull(),
  mensagemId: text("mensagem_id").notNull(),
  mensagem: text("mensagem"),
  resposta: text("resposta"),
  rating: text("rating").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
export type AiFeedbackItem = typeof aiFeedback.$inferSelect;
export const insertAiFeedbackSchema = createInsertSchema(aiFeedback).omit({ id: true, criadoEm: true });

// -----------------------
// ALUNO FICHA EMISSÕES (auditoria de fichas)
// -----------------------
export const alunoFichaEmissoes = pgTable("aluno_ficha_emissoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  userId: varchar("userId"),
  userEmail: text("userEmail"),
  userRole: text("userRole"),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  emitidoEm: timestamp("emitidoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type AlunoFichaEmissao = typeof alunoFichaEmissoes.$inferSelect;
export const insertAlunoFichaEmissaoSchema = createInsertSchema(alunoFichaEmissoes).omit({ id: true, emitidoEm: true });

// -----------------------
// ALUNOS STATUS HISTÓRICO
// -----------------------
export const alunosStatusHistorico = pgTable("alunos_status_historico", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: text("alunoId").notNull(),
  alunoNome: text("alunoNome").notNull().default(""),
  turmaId: text("turmaId").notNull().default(""),
  turmaNome: text("turmaNome").notNull().default(""),
  situacaoAnterior: text("situacaoAnterior").notNull().default("activo"),
  situacaoNova: text("situacaoNova").notNull(),
  motivo: text("motivo").notNull().default(""),
  registadoPor: text("registadoPor").notNull().default(""),
  registadoPorId: text("registadoPorId").notNull().default(""),
  registadoPorRole: text("registadoPorRole").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type AlunoStatusHistorico = typeof alunosStatusHistorico.$inferSelect;
export const insertAlunoStatusHistoricoSchema = createInsertSchema(alunosStatusHistorico).omit({ id: true, createdAt: true });

// -----------------------
// ANOTAÇÕES DE MATRÍCULA
// -----------------------
export const anotacoesMatricula = pgTable("anotacoes_matricula", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  texto: text("texto").notNull(),
  criadoPor: varchar("criadoPor").notNull().default(""),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type AnotacaoMatricula = typeof anotacoesMatricula.$inferSelect;
export const insertAnotacaoMatriculaSchema = createInsertSchema(anotacoesMatricula).omit({ id: true, criadoEm: true, atualizadoEm: true });

// -----------------------
// AVALIAÇÕES PARCIAIS (professores)
// -----------------------
export const avaliacoesParciais = pgTable("avaliacoes_parciais", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  professorId: varchar("professorId").notNull(),
  periodoLetivo: varchar("periodoLetivo").notNull(),
  criterio: varchar("criterio").notNull(),
  nota: real("nota").notNull().default(0),
  papel: varchar("papel").notNull(),
  avaliadorId: varchar("avaliadorId").notNull().default("unknown"),
  avaliadorNome: varchar("avaliadorNome"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type AvaliacaoParcial = typeof avaliacoesParciais.$inferSelect;
export const insertAvaliacaoParcialSchema = createInsertSchema(avaliacoesParciais).omit({ id: true, criadoEm: true, atualizadoEm: true });

// -----------------------
// CHAT — REAÇÕES
// -----------------------
export const chatReacoes = pgTable("chat_reacoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mensagemId: varchar("mensagemId").notNull(),
  utilizadorId: text("utilizadorId").notNull(),
  utilizadorNome: text("utilizadorNome").notNull().default(""),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export type ChatReacao = typeof chatReacoes.$inferSelect;
export const insertChatReacaoSchema = createInsertSchema(chatReacoes).omit({ id: true, createdAt: true });

// -----------------------
// CORRESPONDÊNCIAS (secretaria)
// -----------------------
export const correspondencias = pgTable("correspondencias", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assunto: text("assunto").notNull(),
  destinatario: text("destinatario").notNull().default(""),
  tipo: text("tipo").notNull().default("saida"),
  data: text("data").notNull(),
  urgente: boolean("urgente").notNull().default(false),
  observacao: text("observacao"),
  registadoPor: text("registadoPor").notNull().default("Secretaria"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type Correspondencia = typeof correspondencias.$inferSelect;
export const insertCorrespondenciaSchema = createInsertSchema(correspondencias).omit({ id: true, createdAt: true });

// -----------------------
// CREDENCIAIS HISTÓRICO
// -----------------------
export const credenciaisHistorico = pgTable("credenciais_historico", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  tipo: varchar("tipo").notNull().default("encarregado"),
  email: varchar("email").notNull().default(""),
  acao: varchar("acao").notNull().default("gerado"),
  geradoPor: varchar("geradoPor").notNull().default(""),
  geradoEm: timestamp("geradoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type CredencialHistorico = typeof credenciaisHistorico.$inferSelect;
export const insertCredencialHistoricoSchema = createInsertSchema(credenciaisHistorico).omit({ id: true, geradoEm: true });

// -----------------------
// DESEJOS DE LIVROS (biblioteca)
// -----------------------
export const desejosLivros = pgTable("desejos_livros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  titulo: text("titulo").notNull(),
  autor: text("autor").notNull().default(""),
  motivo: text("motivo").notNull().default(""),
  alunoId: varchar("alunoId"),
  nomeLeitor: text("nomeLeitor").notNull(),
  status: text("status").notNull().default("pendente"),
  registadoPor: text("registadoPor").notNull().default("Sistema"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type DesejoLivro = typeof desejosLivros.$inferSelect;
export const insertDesejoLivroSchema = createInsertSchema(desejosLivros).omit({ id: true, createdAt: true });

// -----------------------
// ENTRADAS DIVERSAS (financeiro)
// -----------------------
export const entradasDiversas = pgTable("entradas_diversas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  origem: text("origem").notNull(),
  descricao: text("descricao").notNull().default(""),
  valor: real("valor").notNull().default(0),
  data: text("data").notNull(),
  ano: text("ano").notNull(),
  metodoPagamento: text("metodoPagamento").notNull().default("dinheiro"),
  referencia: text("referencia"),
  registroId: varchar("registroId"),
  alunoId: varchar("alunoId"),
  registadoPor: text("registadoPor"),
  observacao: text("observacao"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type EntradaDiversa = typeof entradasDiversas.$inferSelect;
export const insertEntradaDiversaSchema = createInsertSchema(entradasDiversas).omit({ id: true, createdAt: true });

// -----------------------
// INCIDENTES DE PAUTA
// -----------------------
export const incidentesPauta = pgTable("incidentes_pauta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  professorId: varchar("professorId"),
  professorNome: text("professorNome"),
  pautaId: varchar("pautaId"),
  turmaId: varchar("turmaId"),
  turmaNome: text("turmaNome"),
  disciplina: text("disciplina"),
  trimestre: integer("trimestre").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  tipo: text("tipo").notNull(),
  descricao: text("descricao"),
  criadoPor: text("criadoPor"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type IncidentePauta = typeof incidentesPauta.$inferSelect;
export const insertIncidentePautaSchema = createInsertSchema(incidentesPauta).omit({ id: true, criadoEm: true });

// -----------------------
// JUSTIFICAÇÕES DE FALTA
// -----------------------
export const justificacoesFalta = pgTable("justificacoes_falta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  presencaIds: jsonb("presencaIds").notNull().default(sql`'[]'::jsonb`),
  qtdFaltas: integer("qtdFaltas").notNull().default(0),
  disciplina: text("disciplina"),
  justificativa: text("justificativa").notNull().default(""),
  comprovativoUrl: text("comprovativoUrl"),
  comprovativoNome: text("comprovativoNome"),
  status: text("status").notNull().default("pendente"),
  valorTotal: real("valorTotal").notNull().default(0),
  rupeId: varchar("rupeId"),
  aprovadoPor: text("aprovadoPor"),
  aprovadoEm: timestamp("aprovadoEm", { withTimezone: true }),
  motivoRejeicao: text("motivoRejeicao"),
  pagoEm: timestamp("pagoEm", { withTimezone: true }),
  concluidoEm: timestamp("concluidoEm", { withTimezone: true }),
  solicitadoPor: text("solicitadoPor"),
  tipo: text("tipo").notNull().default("paga"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});
export type JustificacaoFalta = typeof justificacoesFalta.$inferSelect;
export const insertJustificacaoFaltaSchema = createInsertSchema(justificacoesFalta).omit({ id: true, createdAt: true });

// -----------------------
// LICENÇA — CÓDIGOS
// -----------------------
export const licencaCodigos = pgTable("licenca_codigos", {
  id: varchar("id").primaryKey(),
  codigo: varchar("codigo").notNull(),
  plano: varchar("plano").notNull(),
  nivel: varchar("nivel").notNull(),
  diasValidade: integer("diasValidade").notNull().default(30),
  precoPorAluno: integer("precoPorAluno").notNull().default(50),
  totalAlunos: integer("totalAlunos").notNull().default(0),
  valorTotal: integer("valorTotal").notNull().default(0),
  creditoAplicado: integer("creditoAplicado").notNull().default(0),
  valorFinal: integer("valorFinal").notNull().default(0),
  dataGeracao: text("dataGeracao").notNull(),
  dataExpiracaoCodigo: text("dataExpiracaoCodigo").notNull(),
  usado: boolean("usado").notNull().default(false),
  usadoPor: varchar("usadoPor"),
  usadoEm: text("usadoEm"),
  criadoPor: varchar("criadoPor"),
  notas: text("notas"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type LicencaCodigo = typeof licencaCodigos.$inferSelect;
export const insertLicencaCodigoSchema = createInsertSchema(licencaCodigos).omit({ criadoEm: true });

// -----------------------
// LICENÇA — CUPÕES
// -----------------------
export const licencaCupoes = pgTable("licenca_cupoes", {
  codigo: varchar("codigo").primaryKey(),
  descontoPerc: integer("descontoPerc").notNull().default(0),
  descontoFixo: integer("descontoFixo").notNull().default(0),
  validoAte: text("validoAte"),
  usosMax: integer("usosMax").notNull().default(0),
  usosFeitos: integer("usosFeitos").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  descricao: text("descricao"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type LicencaCupao = typeof licencaCupoes.$inferSelect;
export const insertLicencaCupaoSchema = createInsertSchema(licencaCupoes).omit({ criadoEm: true });

// -----------------------
// LICENÇA — HISTÓRICO
// -----------------------
export const licencaHistorico = pgTable("licenca_historico", {
  id: varchar("id").primaryKey(),
  plano: varchar("plano").notNull(),
  nivel: varchar("nivel").notNull(),
  totalAlunos: integer("totalAlunos").notNull().default(0),
  precoPorAluno: integer("precoPorAluno").notNull().default(50),
  valorTotal: integer("valorTotal").notNull().default(0),
  descontoAplicado: integer("descontoAplicado").notNull().default(0),
  valorPago: integer("valorPago").notNull().default(0),
  dataAtivacao: text("dataAtivacao").notNull(),
  dataExpiracao: text("dataExpiracao").notNull(),
  ativadoPor: varchar("ativadoPor").notNull(),
  solicitacaoId: varchar("solicitacaoId"),
  metodo: varchar("metodo").notNull().default("codigo"),
  observacao: text("observacao"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type LicencaHistoricoItem = typeof licencaHistorico.$inferSelect;
export const insertLicencaHistoricoSchema = createInsertSchema(licencaHistorico).omit({ criadoEm: true });

// -----------------------
// LICENÇA — RECIBO EMISSÕES
// -----------------------
export const licencaReciboEmissoes = pgTable("licenca_recibo_emissoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  historicoId: varchar("historicoId").notNull(),
  userId: varchar("userId"),
  userNome: text("userNome"),
  userEmail: text("userEmail"),
  userRole: text("userRole"),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  emitidoEm: timestamp("emitidoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type LicencaReciboEmissao = typeof licencaReciboEmissoes.$inferSelect;
export const insertLicencaReciboEmissaoSchema = createInsertSchema(licencaReciboEmissoes).omit({ id: true, emitidoEm: true });

// -----------------------
// LICENÇA — SOLICITAÇÕES
// -----------------------
export const licencaSolicitacoes = pgTable("licenca_solicitacoes", {
  id: varchar("id").primaryKey(),
  solicitanteId: varchar("solicitanteId"),
  solicitanteNome: varchar("solicitanteNome").notNull(),
  solicitanteRole: varchar("solicitanteRole").notNull(),
  plano: varchar("plano").notNull(),
  nivel: varchar("nivel").notNull(),
  totalAlunos: integer("totalAlunos").notNull().default(0),
  precoPorAluno: integer("precoPorAluno").notNull().default(50),
  valorTotal: integer("valorTotal").notNull().default(0),
  mensagem: text("mensagem"),
  status: varchar("status").notNull().default("pendente"),
  respondidoPor: varchar("respondidoPor"),
  respondidoEm: timestamp("respondidoEm", { withTimezone: true }),
  respostaMensagem: text("respostaMensagem"),
  comprovativoUrl: text("comprovativoUrl"),
  comprovativoNome: varchar("comprovativoNome"),
  cupaoCodigo: varchar("cupaoCodigo"),
  descontoAplicado: integer("descontoAplicado").notNull().default(0),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type LicencaSolicitacao = typeof licencaSolicitacoes.$inferSelect;
export const insertLicencaSolicitacaoSchema = createInsertSchema(licencaSolicitacoes).omit({ criadoEm: true });

// -----------------------
// LOGIN APPROVALS
// -----------------------
export const loginApprovals = pgTable("login_approvals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  token: varchar("token").notNull(),
  userId: integer("userId").notNull(),
  status: varchar("status").notNull().default("pending"),
  ip: varchar("ip"),
  device: varchar("device"),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type LoginApproval = typeof loginApprovals.$inferSelect;
export const insertLoginApprovalSchema = createInsertSchema(loginApprovals).omit({ id: true, createdAt: true });

// -----------------------
// MULTA ISENÇÕES
// -----------------------
export const multaIsencoes = pgTable("multa_isencoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  solicitadoPor: text("solicitadoPor").notNull().default(""),
  justificativa: text("justificativa").notNull().default(""),
  status: text("status").notNull().default("pendente"),
  aprovadoPor: text("aprovadoPor"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});
export type MultaIsencao = typeof multaIsencoes.$inferSelect;
export const insertMultaIsencaoSchema = createInsertSchema(multaIsencoes).omit({ id: true, createdAt: true });

// -----------------------
// PEDIDOS DE ABERTURA DE AVALIAÇÃO
// -----------------------
export const pedidosAberturaAvaliacao = pgTable("pedidos_abertura_avaliacao", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  professorId: text("professorId").notNull(),
  professorNome: text("professorNome"),
  turmaId: text("turmaId"),
  turmaNome: text("turmaNome"),
  disciplina: text("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(),
  avaliacao: text("avaliacao").notNull(),
  motivo: text("motivo").notNull(),
  status: text("status").notNull().default("pendente"),
  respondidoPor: text("respondidoPor"),
  respondidoNome: text("respondidoNome"),
  respondidoEm: timestamp("respondidoEm", { withTimezone: true }),
  observacao: text("observacao"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type PedidoAberturaAvaliacao = typeof pedidosAberturaAvaliacao.$inferSelect;
export const insertPedidoAberturaAvaliacaoSchema = createInsertSchema(pedidosAberturaAvaliacao).omit({ id: true, criadoEm: true });

// -----------------------
// PRAZOS MINI PAUTA
// -----------------------
export const prazosMiniPauta = pgTable("prazos_mini_pauta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trimestre: integer("trimestre").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  dataLimite: text("dataLimite").notNull(),
  descricao: text("descricao"),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: text("criadoPor"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  ultimoAvisoEnviado: text("ultimoAvisoEnviado"),
  gracePeriodHoras: integer("gracePeriodHoras").notNull().default(0),
  bloqueioAposPrazo: boolean("bloqueioAposPrazo").notNull().default(false),
});
export type PrazoMiniPauta = typeof prazosMiniPauta.$inferSelect;
export const insertPrazoMiniPautaSchema = createInsertSchema(prazosMiniPauta).omit({ id: true, criadoEm: true });

// -----------------------
// PRESENÇAS AUDITORIA
// -----------------------
export const presencasAuditoria = pgTable("presencas_auditoria", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  presencaId: varchar("presencaId").notNull(),
  alunoId: varchar("alunoId"),
  turmaId: varchar("turmaId"),
  disciplina: text("disciplina"),
  data: text("data"),
  statusAnterior: text("statusAnterior"),
  statusNovo: text("statusNovo"),
  observacaoAnterior: text("observacaoAnterior"),
  observacaoNova: text("observacaoNova"),
  alteradoPorId: varchar("alteradoPorId"),
  alteradoPorEmail: text("alteradoPorEmail"),
  alteradoEm: timestamp("alteradoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type PresencaAuditoria = typeof presencasAuditoria.$inferSelect;
export const insertPresencaAuditoriaSchema = createInsertSchema(presencasAuditoria).omit({ id: true, alteradoEm: true });

// -----------------------
// PRESENÇAS BIBLIOTECA
// -----------------------
export const presencasBiblioteca = pgTable("presencas_biblioteca", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull(),
  nomeAluno: text("nomeAluno").notNull(),
  turmaId: varchar("turmaId"),
  turmaNome: text("turmaNome"),
  sala: text("sala"),
  curso: text("curso"),
  dataPresenca: text("dataPresenca").notNull(),
  horaEntrada: text("horaEntrada").notNull(),
  registadoPor: text("registadoPor").notNull().default("Sistema"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type PresencaBiblioteca = typeof presencasBiblioteca.$inferSelect;
export const insertPresencaBibliotecaSchema = createInsertSchema(presencasBiblioteca).omit({ id: true, createdAt: true });

// -----------------------
// PRORROGAÇÕES PRAZO PAUTA
// -----------------------
export const prorrogacoesPrazoPauta = pgTable("prorrogacoes_prazo_pauta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  professorId: varchar("professorId").notNull(),
  professorNome: text("professorNome"),
  trimestre: integer("trimestre").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  novaDataLimite: text("novaDataLimite").notNull(),
  motivo: text("motivo"),
  concedidoPor: text("concedidoPor"),
  concedidoEm: timestamp("concedidoEm", { withTimezone: true }).notNull().defaultNow(),
  ativo: boolean("ativo").notNull().default(true),
});
export type ProrrogacaoPrazoPauta = typeof prorrogacoesPrazoPauta.$inferSelect;
export const insertProrrogacaoPrazoPautaSchema = createInsertSchema(prorrogacoesPrazoPauta).omit({ id: true, concedidoEm: true });

// -----------------------
// RECIBO EMISSÕES
// -----------------------
export const reciboEmissoes = pgTable("recibo_emissoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pagamentoId: varchar("pagamentoId").notNull(),
  userId: varchar("userId"),
  userNome: text("userNome"),
  userEmail: text("userEmail"),
  userRole: text("userRole"),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  emitidoEm: timestamp("emitidoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type ReciboEmissao = typeof reciboEmissoes.$inferSelect;
export const insertReciboEmissaoSchema = createInsertSchema(reciboEmissoes).omit({ id: true, emitidoEm: true });

// -----------------------
// RECONFIRMAÇÕES DE MATRÍCULA
// -----------------------
export const reconfirmacoesMatricula = pgTable("reconfirmacoes_matricula", {
  id: varchar("id").primaryKey(),
  alunoId: varchar("alunoId").notNull(),
  anoLetivo: varchar("anoLetivo").notNull(),
  status: varchar("status").notNull().default("confirmado"),
  data: timestamp("data", { withTimezone: true }).notNull().defaultNow(),
});
export type ReconfirmacaoMatricula = typeof reconfirmacoesMatricula.$inferSelect;
export const insertReconfirmacaoMatriculaSchema = createInsertSchema(reconfirmacoesMatricula).omit({ data: true });

// -----------------------
// ROLE PERMISSIONS
// -----------------------
export const rolePermissions = pgTable("role_permissions", {
  role: text("role").primaryKey(),
  permissoes: jsonb("permissoes").notNull().default(sql`'{}'::jsonb`),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
export type RolePermission = typeof rolePermissions.$inferSelect;
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ atualizadoEm: true });

// -----------------------
// SAF-T — EXPORTAÇÕES
// -----------------------
export const saftExportacoes = pgTable("saft_exportacoes", {
  id: text("id").primaryKey().default(sql`(gen_random_uuid())::text`),
  ano: integer("ano").notNull(),
  mesInicio: integer("mes_inicio"),
  mesFim: integer("mes_fim"),
  totalDocs: integer("total_docs").notNull().default(0),
  totalValor: real("total_valor").notNull().default(0),
  geradoPor: text("gerado_por"),
  geradoEm: timestamp("gerado_em", { withTimezone: true }).notNull().defaultNow(),
  nomeFicheiro: text("nome_ficheiro"),
});
export type SaftExportacao = typeof saftExportacoes.$inferSelect;
export const insertSaftExportacaoSchema = createInsertSchema(saftExportacoes).omit({ id: true, geradoEm: true });

// -----------------------
// SAF-T — HASHES
// -----------------------
export const saftHashes = pgTable("saft_hashes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pagamentoId: text("pagamento_id").notNull(),
  numeroSerie: text("numero_serie").notNull(),
  serie: text("serie").notNull(),
  ano: integer("ano").notNull(),
  sequencial: integer("sequencial").notNull(),
  hashDoc: text("hash_doc").notNull(),
  hashAnterior: text("hash_anterior").notNull(),
  dataEmissao: text("data_emissao").notNull(),
  valorBruto: real("valor_bruto").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
export type SaftHash = typeof saftHashes.$inferSelect;
export const insertSaftHashSchema = createInsertSchema(saftHashes).omit({ id: true, criadoEm: true });

// -----------------------
// SAF-T — SEQUÊNCIAS
// -----------------------
export const saftSequencias = pgTable("saft_sequencias", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  serie: text("serie").notNull(),
  ano: integer("ano").notNull(),
  ultimoNum: integer("ultimo_num").notNull().default(0),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
export type SaftSequencia = typeof saftSequencias.$inferSelect;
export const insertSaftSequenciaSchema = createInsertSchema(saftSequencias).omit({ id: true, criadoEm: true });

// -----------------------
// SOLICITAÇÕES DE AVALIAÇÃO
// -----------------------
export const solicitacoesAvaliacao = pgTable("solicitacoes_avaliacao", {
  id: varchar("id").primaryKey().default(sql`(gen_random_uuid())::character varying`),
  professorId: varchar("professorId").notNull(),
  professorNome: varchar("professorNome").notNull(),
  turmaId: varchar("turmaId").notNull(),
  turmaNome: varchar("turmaNome").notNull().default(""),
  disciplina: varchar("disciplina").notNull(),
  trimestre: integer("trimestre").notNull(),
  tipoAvaliacao: varchar("tipoAvaliacao").notNull(),
  motivo: text("motivo").notNull().default(""),
  status: varchar("status").notNull().default("pendente"),
  respondidoPor: varchar("respondidoPor"),
  respondidoEm: timestamp("respondidoEm", { withTimezone: true }),
  observacao: text("observacao"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type SolicitacaoAvaliacao = typeof solicitacoesAvaliacao.$inferSelect;
export const insertSolicitacaoAvaliacaoSchema = createInsertSchema(solicitacoesAvaliacao).omit({ id: true, createdAt: true });

// -----------------------
// SOLICITAÇÕES DE DOCUMENTOS
// -----------------------
export const solicitacoesDocumentos = pgTable("solicitacoes_documentos", {
  id: varchar("id").primaryKey(),
  alunoId: varchar("alunoId").notNull(),
  tipo: varchar("tipo").notNull(),
  motivo: text("motivo").notNull().default(""),
  observacao: text("observacao").notNull().default(""),
  status: varchar("status").notNull().default("pendente"),
  resposta: text("resposta"),
  referenciaPagamento: varchar("referenciaPagamento"),
  validadoPorFinanceiro: boolean("validadoPorFinanceiro").notNull().default(false),
  validadoPorFinanceiroId: varchar("validadoPorFinanceiroId"),
  validadoPorFinanceiroNome: varchar("validadoPorFinanceiroNome"),
  validadoPorFinanceiroEm: timestamp("validadoPorFinanceiroEm", { withTimezone: true }),
  motivoRejeicaoFinanceiro: text("motivoRejeicaoFinanceiro"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});
export type SolicitacaoDocumento = typeof solicitacoesDocumentos.$inferSelect;
export const insertSolicitacaoDocumentoSchema = createInsertSchema(solicitacoesDocumentos).omit({ id: true, createdAt: true, updatedAt: true });

// -----------------------
// SOLICITAÇÕES DE EMPRÉSTIMO (biblioteca)
// -----------------------
export const solicitacoesEmprestimo = pgTable("solicitacoes_emprestimo", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  livroId: varchar("livroId").notNull(),
  livroTitulo: text("livroTitulo").notNull(),
  alunoId: varchar("alunoId"),
  nomeLeitor: text("nomeLeitor").notNull(),
  tipoLeitor: text("tipoLeitor").notNull().default("aluno"),
  diasSolicitados: integer("diasSolicitados").notNull().default(14),
  status: text("status").notNull().default("pendente"),
  motivoRejeicao: text("motivoRejeicao"),
  registadoPor: text("registadoPor").notNull().default("Sistema"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type SolicitacaoEmprestimo = typeof solicitacoesEmprestimo.$inferSelect;
export const insertSolicitacaoEmprestimoSchema = createInsertSchema(solicitacoesEmprestimo).omit({ id: true, createdAt: true });

// -----------------------
// MINI PAUTA EMISSÕES (histórico de emissão de pautas)
// -----------------------
export const miniPautaEmissoes = pgTable("mini_pauta_emissoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  turmaId: varchar("turmaId").notNull(),
  turmaNome: text("turmaNome"),
  turmaClasse: text("turmaClasse"),
  anoLetivo: text("anoLetivo").notNull(),
  trimestre: integer("trimestre"),
  disciplina: text("disciplina"),
  templateId: varchar("templateId"),
  templateNome: text("templateNome"),
  emitidoPorId: varchar("emitidoPorId").notNull(),
  emitidoPorNome: text("emitidoPorNome"),
  emitidoPorRole: text("emitidoPorRole"),
  formato: text("formato").notNull().default("pdf"),
  emitidoEm: timestamp("emitidoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type MiniPautaEmissao = typeof miniPautaEmissoes.$inferSelect;
export const insertMiniPautaEmissaoSchema = createInsertSchema(miniPautaEmissoes).omit({ id: true, emitidoEm: true });

// -----------------------
// TURMA DISCIPLINAS (relação turma ↔ disciplina)
// -----------------------
export const turmaDisciplinas = pgTable("turma_disciplinas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  turmaId: varchar("turmaId").notNull(),
  disciplinaId: varchar("disciplinaId").notNull(),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
});
export type TurmaDisciplina = typeof turmaDisciplinas.$inferSelect;
export const insertTurmaDisciplinaSchema = createInsertSchema(turmaDisciplinas).omit({ id: true, createdAt: true });

// -----------------------
// AVALIAÇÃO FORMATIVA (Art. 8º §1 — Dec. Exec. nº 04/2026)
// Registo de observações, comportamento, participação e competências
// separado das notas sumativas — função formativa como modalidade principal
// -----------------------
export const avaliacoesFormativas = pgTable("avaliacoes_formativas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId").notNull().references(() => alunos.id),
  turmaId: varchar("turmaId").notNull().references(() => turmas.id),
  disciplina: text("disciplina").notNull(),
  professorId: varchar("professorId").notNull().references(() => professores.id),
  anoLetivo: text("anoLetivo").notNull(),
  trimestre: integer("trimestre").notNull(), // 1 | 2 | 3
  categoria: text("categoria").notNull(), // 'comportamento' | 'participacao' | 'atitude' | 'competencia' | 'observacao'
  descricao: text("descricao").notNull(),
  nivel: text("nivel").notNull().default('bom'), // 'muito_bom' | 'bom' | 'satisfatorio' | 'insuficiente'
  data: text("data").notNull(),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type AvaliacaoFormativa = typeof avaliacoesFormativas.$inferSelect;
export const insertAvaliacaoFormativaSchema = createInsertSchema(avaliacoesFormativas).omit({ id: true, criadoEm: true, atualizadoEm: true });

// -----------------------
// CONSELHO PEDAGÓGICO & CONSELHO DE ESCOLA (Art. 6º — Dec. Exec. nº 04/2026)
// Órgãos formais de validação académica e supervisão estratégica
// -----------------------

export const conselhoMembros = pgTable("conselho_membros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipoConselho: text("tipoConselho").notNull(), // 'pedagogico' | 'escola'
  utilizadorId: varchar("utilizadorId").notNull().references(() => utilizadores.id, { onDelete: "cascade" }),
  cargo: text("cargo").notNull(), // 'presidente' | 'secretario' | 'vogal' | 'tecnico_educacao' | 'representante_professores' | 'representante_pais' | 'representante_alunos'
  mandatoInicio: text("mandatoInicio").notNull(),
  mandatoFim: text("mandatoFim"),
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type ConselhoMembro = typeof conselhoMembros.$inferSelect;
export const insertConselhoMembroSchema = createInsertSchema(conselhoMembros).omit({ id: true, criadoEm: true, atualizadoEm: true });

export const conselhoReunioes = pgTable("conselho_reunioes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tipoConselho: text("tipoConselho").notNull(), // 'pedagogico' | 'escola'
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  dataReuniao: text("dataReuniao").notNull(),
  horaInicio: text("horaInicio"),
  horaFim: text("horaFim"),
  local: text("local"),
  status: text("status").notNull().default("agendada"), // 'agendada' | 'em_curso' | 'concluida' | 'cancelada'
  agenda: jsonb("agenda").notNull().default(sql`'[]'::jsonb`), // [{ponto: string, descricao?: string}]
  ata: text("ata"), // acta redigida após a reunião
  convocatoriaEmitida: boolean("convocatoriaEmitida").notNull().default(false),
  presentes: jsonb("presentes").notNull().default(sql`'[]'::jsonb`), // [utilizadorId]
  criadoPor: varchar("criadoPor").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type ConselhoReuniao = typeof conselhoReunioes.$inferSelect;
export const insertConselhoReuniaoSchema = createInsertSchema(conselhoReunioes).omit({ id: true, criadoEm: true, atualizadoEm: true });

export const conselhoDeliberacoes = pgTable("conselho_deliberacoes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reuniaoId: varchar("reuniaoId").references(() => conselhoReunioes.id, { onDelete: "set null" }),
  tipoConselho: text("tipoConselho").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull(),
  tipo: text("tipo").notNull().default("deliberacao"), // 'deliberacao' | 'recomendacao' | 'resolucao' | 'parecer'
  status: text("status").notNull().default("pendente"), // 'pendente' | 'aprovada' | 'rejeitada' | 'adiada'
  votosFavor: integer("votosFavor").notNull().default(0),
  votosContra: integer("votosContra").notNull().default(0),
  votosAbstencao: integer("votosAbstencao").notNull().default(0),
  votos: jsonb("votos").notNull().default(sql`'[]'::jsonb`), // [{utilizadorId, voto: 'favor'|'contra'|'abstencao', justificacao?}]
  dataDeliberacao: text("dataDeliberacao").notNull(),
  prazoImplementacao: text("prazoImplementacao"),
  responsavelImplementacao: text("responsavelImplementacao"),
  resultado: text("resultado"),
  criadoPor: varchar("criadoPor").notNull(),
  anoLetivo: text("anoLetivo").notNull(),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type ConselhoDeliberacao = typeof conselhoDeliberacoes.$inferSelect;
export const insertConselhoDeliberacaoSchema = createInsertSchema(conselhoDeliberacoes).omit({ id: true, criadoEm: true, atualizadoEm: true });

export const conselhoValidacoesPauta = pgTable("conselho_validacoes_pauta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pautaId: varchar("pautaId").references(() => pautas.id, { onDelete: "cascade" }),
  turmaId: varchar("turmaId").references(() => turmas.id),
  disciplina: text("disciplina"),
  trimestre: integer("trimestre"),
  anoLetivo: text("anoLetivo").notNull(),
  tipoValidacao: text("tipoValidacao").notNull().default("pauta_final"), // 'pauta_final' | 'reabertura_notas' | 'correcao_avaliacao'
  status: text("status").notNull().default("pendente"), // 'pendente' | 'em_revisao' | 'aprovada' | 'rejeitada' | 'devolvida'
  solicitadoPor: varchar("solicitadoPor").notNull(),
  solicitadoEm: timestamp("solicitadoEm", { withTimezone: true }).notNull().defaultNow(),
  justificativa: text("justificativa"),
  parecerConselho: text("parecerConselho"),
  validadoPor: varchar("validadoPor"),
  validadoEm: timestamp("validadoEm", { withTimezone: true }),
  votosAprovacao: jsonb("votosAprovacao").notNull().default(sql`'[]'::jsonb`),
  reuniaoId: varchar("reuniaoId").references(() => conselhoReunioes.id, { onDelete: "set null" }),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type ConselhoValidacaoPauta = typeof conselhoValidacoesPauta.$inferSelect;
export const insertConselhoValidacaoPautaSchema = createInsertSchema(conselhoValidacoesPauta).omit({ id: true, criadoEm: true, atualizadoEm: true, solicitadoEm: true });

// -----------------------
// ALUMNI (ANTIGOS ALUNOS)
// -----------------------
export const alumni = pgTable("alumni", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  alunoId: varchar("alunoId"),                        // ligação ao aluno original (opcional)
  nome: text("nome").notNull(),
  email: text("email"),
  telefone: text("telefone"),
  dataNascimento: text("dataNascimento"),
  genero: text("genero"),                             // 'M' | 'F'
  anoFormacao: text("anoFormacao").notNull(),          // ex: '2023/2024'
  classe: text("classe").notNull().default(''),
  cursoId: varchar("cursoId"),
  cursoNome: text("cursoNome").notNull().default(''),
  notaFinal: real("notaFinal"),
  situacaoAtual: text("situacaoAtual").notNull().default('desconhecida'), // 'empregado'|'estudante'|'empreendedor'|'desempregado'|'outro'|'desconhecida'
  empregador: text("empregador"),
  cargo: text("cargo"),
  universidade: text("universidade"),
  areaProfissional: text("areaProfissional"),
  localizacao: text("localizacao"),
  foto: text("foto"),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criadoEm", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizadoEm", { withTimezone: true }).notNull().defaultNow(),
});
export type Alumni = typeof alumni.$inferSelect;
export const insertAlumniSchema = createInsertSchema(alumni).omit({ id: true, criadoEm: true, atualizadoEm: true });
