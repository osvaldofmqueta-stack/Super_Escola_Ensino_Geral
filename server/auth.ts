import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";
import { randomBytes } from "crypto";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.JWT_SECRET_GENERATED ||
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "development" ? randomBytes(32).toString("hex") : "");
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is not set.");
if (!process.env.JWT_SECRET && !process.env.JWT_SECRET_GENERATED && !process.env.SESSION_SECRET && process.env.NODE_ENV === "development") {
  console.warn("JWT_SECRET is not set; using a temporary development-only secret for this server session.");
}
const JWT_EXPIRES = "30d";

export type UserRole =
  | "ceo" | "pca" | "admin" | "director" | "subdirector_pedagogico" | "chefe_secretaria"
  | "secretaria" | "professor" | "aluno" | "financeiro" | "encarregado" | "rh"
  | "pedagogico" | "coordenador_curso"
  | "membro_conselho_pedagogico" | "membro_conselho_escola";

export interface JwtPayload {
  userId: string;
  role: UserRole;
  email: string;
  cursoId?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

const REFRESH_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Verify token ignoring expiry — for the refresh endpoint only. */
export function verifyTokenAllowExpired(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    // Reject tokens that expired more than 30 days ago
    if (payload.exp && Date.now() > payload.exp * 1000 + REFRESH_GRACE_MS) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      jwtUser?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"] ?? "";
  let token: string | null = header.startsWith("Bearer ") ? header.slice(7) : null;
  // Fallback: accept ?token= query param for PDF/iframe requests that can't set headers
  if (!token && typeof req.query.token === "string" && req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
    return;
  }
  req.jwtUser = payload;
  next();
}

/** Middleware for the refresh endpoint: accepts tokens that are expired (up to 30 days old). */
export function requireAuthAllowExpired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"] ?? "";
  const token: string | null = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
    return;
  }
  const payload = verifyTokenAllowExpired(token);
  if (!payload) {
    res.status(401).json({ error: "Sessão expirada há demasiado tempo. Faça login novamente." });
    return;
  }
  req.jwtUser = payload;
  next();
}

const ROLE_DEFAULTS: Record<string, string[]> = {
  ceo:              ["*"],
  pca:              ["*"],
  // chefe_secretaria: supervisão e coordenação total (excl. ceo_dashboard)
  chefe_secretaria: ["secretaria_hub","alunos","professores","turmas","notas","presencas",
                     "financeiro","financeiro_relatorios","extrato_propinas","bolsas",
                     "relatorios","chat_interno","horario","editor_documentos","documentos_hub",
                     "disciplinas","admissao","pedagogico","desempenho","visao_geral",
                     "rh_hub","rh_controle","rh_payroll","gestao_acessos",
                     "auditoria","notificacoes","portal_encarregado","calendario_academico",
                     "transferencias","biblioteca","biblioteca_gestao","boletim_matricula","boletim_propina",
                     "quadro_honra","trabalhos_finais","exclusoes_faltas","plano_aula",
                     "eventos","gestao_academica","grelha","historico","salas","dashboard",
                     "avaliacao_professores","admin",
                     "professor_hub","professor_turmas","professor_pauta","professor_sumario",
                     "professor_mensagens","professor_materiais","portal_estudante","pagamentos_hub",
                     "arquivo_documentos","gerir_avaliacoes","solicitacoes_documentos",
                     // Novas funcionalidades
                     "portaria","saft","sessoes_ativas","configuracoes_sistema",
                     // Decreto 04/2026 — lançamento Exame Nacional (Pauta Final, exclusivo Secretaria)
                     "exame_nacional",
                     "boletins_secretaria","pautas","assistente"],
  // admin: configuração técnica, gestão de utilizadores, auditoria — acesso total incluindo finanças
  admin:            ["dashboard","alunos","professores","turmas","salas","notas","presencas",
                     "horario","historico","disciplinas","grelha","admissao","transferencias",
                     "gestao_academica","editor_documentos","boletim_matricula","documentos_hub",
                     "secretaria_hub","pedagogico","avaliacao_professores","desempenho",
                     "visao_geral","relatorios","quadro_honra","trabalhos_finais",
                     "exclusoes_faltas","biblioteca","biblioteca_gestao","eventos","plano_aula",
                     "notificacoes","chat_interno","calendario_academico","admin",
                     "gestao_acessos","auditoria",
                     "arquivo_documentos","gerir_avaliacoes","solicitacoes_documentos","gerar_documento",
                     "financeiro","financeiro_relatorios","extrato_propinas","bolsas","pagamentos_hub","boletim_propina",
                     "rh_hub","rh_controle","rh_payroll",
                     // Novas funcionalidades
                     "portaria","saft","sessoes_ativas","configuracoes_sistema",
                     // Decreto 04/2026 — lançamento Exame Nacional (Pauta Final)
                     "exame_nacional",
                     "boletins_secretaria","pautas","assistente"],
  // director: supervisão estratégica — vê tudo, gere acessos dos seus colaboradores
  director:         ["dashboard","alunos","professores","turmas","salas","notas","presencas",
                     "horario","historico","disciplinas","grelha","admissao","transferencias",
                     "gestao_academica","pedagogico","avaliacao_professores","desempenho",
                     "visao_geral","relatorios","quadro_honra","trabalhos_finais","exclusoes_faltas",
                     "rh_hub","rh_controle","financeiro","financeiro_relatorios","extrato_propinas","bolsas","pagamentos_hub",
                     "editor_documentos","boletim_matricula","boletim_propina","documentos_hub",
                     "gestao_acessos","auditoria","biblioteca","biblioteca_gestao","eventos",
                     "notificacoes","chat_interno","calendario_academico",
                     "arquivo_documentos","gerir_avaliacoes","gerar_documento",
                     // Novas funcionalidades
                     "portaria","saft","sessoes_ativas","boletins_secretaria","pautas",
                     // Decreto 04/2026 — lançamento Exame Nacional (Pauta Final)
                     "exame_nacional",
                     "assistente"],
  // pedagogico: qualidade académica, currículo, avaliação pedagógica
  pedagogico:       ["dashboard","alunos","professores","turmas","salas","notas","presencas",
                     "horario","historico","disciplinas","grelha","gestao_academica",
                     "pedagogico","avaliacao_professores","desempenho","visao_geral","relatorios",
                     "quadro_honra","trabalhos_finais","exclusoes_faltas","plano_aula",
                     "biblioteca","biblioteca_gestao","notificacoes","chat_interno","eventos","calendario_academico",
                     "gerir_avaliacoes",
                     // Novas funcionalidades
                     "portaria","pautas","assistente"],
  // secretaria: operações académicas diárias — matrícula, documentos, transferências
  // NÃO tem gestão financeira (é do financeiro) nem configurações de sistema (é do admin)
  secretaria:       ["secretaria_hub","alunos","turmas","salas","notas","presencas",
                     "horario","historico","admissao","transferencias","gestao_academica",
                     "disciplinas","grelha",
                     "editor_documentos","boletim_matricula","boletim_propina","documentos_hub",
                     "extrato_propinas","biblioteca","biblioteca_gestao","quadro_honra","trabalhos_finais",
                     "notificacoes","chat_interno","eventos","calendario_academico",
                     "arquivo_documentos","solicitacoes_documentos","gerar_documento",
                     // Novas funcionalidades
                     "portaria","boletins_secretaria","pautas",
                     // Decreto 04/2026 — lançamento Exame Nacional na Pauta Final
                     "exame_nacional",
                     "assistente"],
  // professor: actividade lectiva própria — lança notas, sumários e materiais das suas turmas
  professor:        ["notas","professor_hub","professor_turmas","professor_pauta","professor_sumario",
                     "professor_mensagens","professor_materiais","horario","plano_aula",
                     "trabalhos_finais","biblioteca","quadro_honra","notificacoes",
                     "chat_interno","eventos",
                     // Novas funcionalidades
                     "portaria","assistente"],
  // financeiro: gestão financeira completa — propinas, pagamentos, bolsas, relatórios
  // NÃO acede a dados académicos nem de RH
  financeiro:       ["financeiro","boletim_propina","extrato_propinas","bolsas",
                     "pagamentos_hub","financeiro_relatorios","documentos_hub",
                     "notificacoes","chat_interno",
                     // Novas funcionalidades
                     "saft","assistente"],
  // rh: recursos humanos e processamento salarial
  // NÃO acede a sumários de aula (são registos lectivos do professor)
  rh:               ["rh_hub","rh_controle","rh_payroll","professores","horario",
                     "calendario_academico","notificacoes","chat_interno",
                     // Novas funcionalidades
                     "assistente"],
  // coordenador_curso: coordenação de um curso curricular do II Ciclo do Ensino Secundário.
  // Supervisiona professores do curso, acompanha pautas, planos de aula, finalistas e PAP.
  // Avalia pedagogicamente os docentes do seu curso e emite relatórios de desempenho.
  // NÃO tem acesso a finanças, RH, configurações de sistema nem gestão de acessos.
  coordenador_curso: ["dashboard","notificacoes","chat_interno","eventos","calendario_academico",
                      // Académico (supervisão do curso)
                      "alunos","professores","turmas","salas","notas","presencas",
                      "horario","historico","disciplinas","grelha","gestao_academica",
                      // Pedagógico (core do coordenador de curso)
                      "pedagogico","avaliacao_professores","desempenho","relatorios",
                      "quadro_honra","trabalhos_finais","exclusoes_faltas","plano_aula",
                      "diario_classe","director_turma","relatorio_faltas",
                      // II Ciclo — específico ao coordenador de curso
                      "finalistas","acta_provas","acompanhamento_pautas","gerir_avaliacoes",
                      // Biblioteca e consulta de dossier de aluno
                      "biblioteca","biblioteca_gestao","consulta_aluno",
                      // Novas funcionalidades
                      "pautas","assistente"],
  aluno:            ["portal_estudante","historico","horario","eventos","biblioteca",
                     "pagamentos_hub","quadro_honra","notificacoes"],
  encarregado:      ["portal_encarregado","pagamentos_hub","notificacoes"],
  // membro_conselho_pedagogico: valida avaliações, aprova pautas, participa em reuniões formais
  membro_conselho_pedagogico: [
    "dashboard","conselho_pedagogico","conselho_escola","notificacoes","chat_interno",
    "eventos","calendario_academico",
    "alunos","professores","turmas","notas","presencas","historico","grelha",
    "pedagogico","avaliacao_professores","desempenho","relatorios","pautas",
    "gerir_avaliacoes","quadro_honra","trabalhos_finais","assistente",
  ],
  // membro_conselho_escola: supervisão estratégica, aprova regulamentos e deliberações
  membro_conselho_escola: [
    "dashboard","conselho_pedagogico","conselho_escola","notificacoes","chat_interno",
    "eventos","calendario_academico",
    "alunos","professores","turmas","historico",
    "relatorios","desempenho","visao_geral",
    "quadro_honra","trabalhos_finais","assistente",
  ],
};

export async function getUserPermissions(userId: string, role: UserRole): Promise<string[]> {
  if (role === "ceo" || role === "pca") return ["*"];
  try {
    const rows = await query<{ permissoes: Record<string, boolean> }>(
      `SELECT permissoes FROM public.user_permissions WHERE user_id=$1`, [userId]
    );
    if (rows[0]?.permissoes && typeof rows[0].permissoes === "object") {
      const custom = rows[0].permissoes as Record<string, boolean>;
      return Object.keys(custom).filter(k => custom[k] === true);
    }
  } catch { /* fallback to defaults */ }
  return ROLE_DEFAULTS[role] ?? [];
}

export function requirePermission(permKey: string | string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.jwtUser) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    const { userId, role } = req.jwtUser;
    if (role === "ceo" || role === "pca") { next(); return; }
    const perms = await getUserPermissions(userId, role);
    const keys = Array.isArray(permKey) ? permKey : [permKey];
    if (perms.includes("*") || keys.some(k => perms.includes(k))) {
      next();
    } else {
      const primaryKey = Array.isArray(permKey) ? permKey[0] : permKey;
      res.status(403).json({
        error: `Acesso negado. Não tem permissão para '${primaryKey}'.`,
        permKey: primaryKey,
      });
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.jwtUser) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    if (!roles.includes(req.jwtUser.role)) {
      res.status(403).json({ error: "Acesso negado. Cargo insuficiente." });
      return;
    }
    next();
  };
}
