import type { Request, Response, NextFunction } from "express";
import { query } from "./db";

const MODULES: Record<string, string> = {
  alunos:                   "Alunos",
  professores:              "Professores",
  turmas:                   "Turmas",
  notas:                    "Notas",
  presencas:                "Presenças",
  taxas:                    "Taxas/Rubricas",
  pagamentos:               "Pagamentos",
  rupes:                    "RUPEs",
  pautas:                   "Pautas",
  sumarios:                 "Sumários",
  horarios:                 "Horários",
  eventos:                  "Eventos",
  utilizadores:             "Utilizadores",
  salas:                    "Salas",
  "anos-academicos":        "Anos Académicos",
  "anos-academicos-ativo":  "Ano Académico Activo",
  "folhas-salarios":        "Folhas de Salários",
  "itens-folha":            "Itens de Folha",
  "chat-interno":           "Chat Interno",
  "calendario-provas":      "Calendário de Provas",
  materiais:                "Materiais",
  notificacoes:             "Notificações",
  registros:                "Admissão",
  "solicitacoes-abertura":  "Solicitações de Abertura",
  config:                   "Configuração",
  "avaliacoes-professor":   "Avaliação de Professores",
  disciplinas:              "Disciplinas",
  cursos:                   "Cursos",
  transferencias:           "Transferências",
  bolsas:                   "Bolsas e Subsídios",
  biblioteca:               "Biblioteca",
  "user-permissions":       "Gestão de Acessos",
  "audit-logs":             "Auditoria",
  "trabalhos-finais":       "Trabalhos Finais/PAP",
  "quadro-honra":           "Quadro de Honra",
  "saldo-alunos":           "Saldo de Alunos",
  "movimentos-saldo":       "Movimentos de Saldo",
  mensagens:                "Mensagens Internas",
  documentos:               "Documentos",
  "planos-aula":            "Planos de Aula",
  licencas:                 "Licenças",
  "exclusoes-faltas":       "Exclusões de Faltas",
  "calendario-academico":   "Calendário Académico",
  "rh-payroll":             "Processamento de Salários",
  "saldo-aluno":            "Saldo de Aluno",
  // ── Novas funcionalidades ──────────────────────────────────────────────────
  funcionarios:             "Funcionários / Pessoal",
  "processos-secretaria":   "Processos da Secretaria",
  "doc-templates":          "Modelos de Documentos",
  "documentos-emitidos":    "Documentos Emitidos",
  "solicitacoes-documentos":"Solicitações de Documentos",
  licenca:                  "Licença de Software",
  "contas-pagar":           "Contas a Pagar",
  feriados:                 "Feriados",
  "presencas-biblioteca":   "Presenças na Biblioteca",
  "multa-isencoes":         "Multas e Isenções",
  "avaliacoes-parciais":    "Avaliações Parciais",
  "pendencias-alunos":      "Pendências de Alunos",
  "gestao-planos":          "Gestão de Planos",
  "med-config":             "Configuração MED",
  "autenticacao":           "Autenticação",
  "login-aprovacao":        "Aprovação de Login",
};

const SKIP_PATHS = new Set([
  "/api/health",
  "/api/upload",
  "/api/push",
  "/api/notificacoes",
]);

function sanitise(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const sensitive = new Set(["senha", "password", "token", "secret", "auth", "p256dh"]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = sensitive.has(k.toLowerCase()) ? "***" : v;
  }
  return result;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function parseRoute(
  method: string,
  pathname: string
): { acao: string; modulo: string; descricao: string; recursoId?: string } {
  const segments = pathname.replace("/api/", "").split("/").filter(Boolean);
  const resource = segments[0] ?? "sistema";
  const secondSeg = segments[1];
  const hasId =
    secondSeg !== undefined &&
    !secondSeg.startsWith("?") &&
    secondSeg !== "encarregado" &&
    secondSeg !== "unread-count" &&
    secondSeg !== "vapid-key" &&
    secondSeg !== "subscribe" &&
    secondSeg !== "unsubscribe" &&
    secondSeg !== "status" &&
    secondSeg !== "ler";

  const modulo = MODULES[resource] || resource;

  let acao = "outro";
  let descricao = "";

  if (method === "POST") {
    acao = "criar";
    descricao = `Criou registo em ${modulo}`;
  } else if (method === "PUT") {
    acao = "atualizar";
    descricao = `Atualizou registo em ${modulo}`;
  } else if (method === "PATCH") {
    acao = "atualizar";
    descricao = `Atualizou registo em ${modulo}`;
  } else if (method === "DELETE") {
    acao = "eliminar";
    descricao = `Eliminou registo em ${modulo}`;
  }

  return {
    acao,
    modulo,
    descricao,
    recursoId: hasId ? secondSeg : undefined,
  };
}

export interface AuditParams {
  userId: string;
  userEmail: string;
  userRole: string;
  userName?: string;
  acao: string;
  modulo: string;
  descricao: string;
  recursoId?: string;
  ipAddress?: string;
  userAgent?: string;
  dados?: unknown;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await query(
      `INSERT INTO public.audit_logs
         ("userId","userEmail","userRole","userName",acao,modulo,descricao,"recursoId","ipAddress","userAgent",dados)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        params.userId,
        params.userEmail,
        params.userRole,
        params.userName ?? null,
        params.acao,
        params.modulo,
        params.descricao,
        params.recursoId ?? null,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        params.dados !== undefined ? JSON.stringify(sanitise(params.dados)) : null,
      ]
    );
  } catch (e) {
    console.warn("[Audit] Failed to insert log:", e);
  }
}

export function setupAuditMiddleware(app: import("express").Application): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const method = req.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

    const path = req.path;
    if (!path.startsWith("/api/")) return next();
    if (SKIP_PATHS.has(path) || [...SKIP_PATHS].some((p) => path.startsWith(p))) return next();

    const originalJson = res.json;
    res.json = function (body: unknown) {
      const statusCode = res.statusCode;

      if (statusCode >= 200 && statusCode < 300 && req.jwtUser) {
        const user = req.jwtUser;
        const { acao, modulo, descricao, recursoId } = parseRoute(method, path);

        let rid = recursoId;
        if (!rid && body && typeof body === "object") {
          rid = (body as Record<string, string>).id;
        }

        setImmediate(() => {
          logAudit({
            userId:    user.userId,
            userEmail: user.email,
            userRole:  user.role,
            acao,
            modulo,
            descricao,
            recursoId: rid,
            ipAddress: getClientIp(req),
            userAgent: req.headers["user-agent"],
            dados:     req.body,
          }).catch(() => {});
        });
      }

      return originalJson.call(this, body);
    };

    next();
  });
}
