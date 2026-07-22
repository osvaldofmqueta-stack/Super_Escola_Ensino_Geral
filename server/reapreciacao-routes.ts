/**
 * Art. 38º — Decreto Executivo nº 04/2026
 * Pedido de Reapreciação (48h + Comissão)
 * © Queta Tech, Lda. — Eng. Osvaldo Fernando Muondo Queta
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "./auth";
import { query } from "./db";
import { Resend } from "resend";

type JsonObject = Record<string, unknown>;

// ─── Email helper ─────────────────────────────────────────────────────────────

async function enviarEmailReapreciacao(opts: {
  toEmail: string;
  nomeAluno: string;
  disciplina: string;
  acao: "recebido" | "comissao" | "decidido";
  status?: string;
  notaOriginal?: number;
  notaFinal?: number;
  fundamentoDecisao?: string;
  escolaNome: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.toEmail) return;
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const nome = opts.nomeAluno.split(" ")[0] || opts.nomeAluno;

  const titulosMap: Record<string, string> = {
    recebido:  "📋 Pedido de Reapreciação Recebido",
    comissao:  "👥 Comissão de Reapreciação Constituída",
    decidido:  opts.status === "deferido" ? "✅ Reapreciação Deferida" : "❌ Reapreciação Indeferida",
  };
  const coresMap: Record<string, string> = {
    recebido: "#1d4ed8", comissao: "#7c3aed", decidido: opts.status === "deferido" ? "#16a34a" : "#dc2626",
  };

  let corpo = "";
  if (opts.acao === "recebido") {
    corpo = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      O pedido de reapreciação para <strong style="color:#fff;">${opts.disciplina}</strong> foi recebido e está a ser analisado.<br/>
      A direcção constituirá uma comissão no prazo estabelecido. Será notificado quando houver decisão.
    </p>`;
  } else if (opts.acao === "comissao") {
    corpo = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      A comissão de reapreciação foi constituída para analisar o pedido relativo a <strong style="color:#fff;">${opts.disciplina}</strong>.<br/>
      Aguarde a decisão final da comissão.
    </p>`;
  } else {
    corpo = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      O pedido de reapreciação para <strong style="color:#fff;">${opts.disciplina}</strong> foi <strong>${opts.status === "deferido" ? "✅ DEFERIDO" : "❌ INDEFERIDO"}</strong>.
      ${opts.notaFinal != null && opts.status === "deferido" ? `<br/><br/>🎯 <strong style="color:#60a5fa;">Nota final rectificada: ${opts.notaFinal} valores</strong> (nota original: ${opts.notaOriginal ?? "—"})` : ""}
      ${opts.fundamentoDecisao ? `<br/><br/><strong style="color:rgba(255,255,255,0.6);">Fundamentação:</strong> ${opts.fundamentoDecisao}` : ""}
    </p>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#0a1828;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d1f35,#0a1828);border-radius:16px;border:1px solid rgba(212,175,55,0.2);overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,${coresMap[opts.acao]}22,${coresMap[opts.acao]}11);padding:24px 32px;border-bottom:1px solid rgba(212,175,55,0.15);">
        <p style="margin:0;font-size:18px;font-weight:800;color:#fff;">${titulosMap[opts.acao]}</p>
        <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">Art. 38º — Decreto Executivo nº 04/2026</p>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <p style="color:rgba(255,255,255,0.55);font-size:13px;margin:0 0 16px;">Caro(a) <strong style="color:#fff;">${nome}</strong>,</p>
        ${corpo}
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.3);">${opts.escolaNome} · Plataforma SIGA · Art. 38º Decreto 04/2026</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  try {
    await resend.emails.send({ from, to: opts.toEmail, subject: titulosMap[opts.acao], html });
  } catch { /* silenciar falhas de email */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(res: Response, status: number, body: unknown) {
  return res.status(status).json(body);
}

async function getConfig() {
  const rows = await query<JsonObject>(
    `SELECT "reapreciacaoHabilitada","reapreciacaoPrazosHoras","nomeEscola" FROM public.config_geral LIMIT 1`, []
  );
  return rows[0] ?? {};
}

// Devolve o email do encarregado/utilizador ligado ao aluno
async function getEmailAluno(alunoId: string): Promise<string | null> {
  const rows = await query<{ email?: string }>(
    `SELECT u.email FROM public.utilizadores u
     JOIN public.alunos a ON a."utilizadorId"=u.id
     WHERE a.id=$1 LIMIT 1`, [alunoId]
  );
  return rows[0]?.email ?? null;
}

// ─── Registro de rotas ────────────────────────────────────────────────────────

export function registerReapreciacaoRoutes(app: Express) {

  // ── Migração da tabela (garantir schema actualizado) ─────────────────────

  (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.pedidos_reapreciacao (
          id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "alunoId"     uuid NOT NULL,
          "alunoNome"   text NOT NULL DEFAULT '',
          "turmaId"     uuid,
          "turmaNome"   text NOT NULL DEFAULT '',
          disciplina    text NOT NULL,
          "anoLetivo"   text NOT NULL,
          trimestre     integer NOT NULL DEFAULT 1,
          "tipoAvaliacao" text NOT NULL DEFAULT 'mini_pauta',
          "notaOriginal"  real,
          motivo          text NOT NULL DEFAULT '',
          status          text NOT NULL DEFAULT 'pendente',
          "deadlineAt"    timestamptz,
          "comissaoMembros" jsonb NOT NULL DEFAULT '[]'::jsonb,
          decisao         text,
          "notaFinal"     real,
          "fundamentoDecisao" text,
          "decididoEm"    timestamptz,
          "decididoPor"   text,
          "solicitadoPor"   text NOT NULL DEFAULT '',
          "solicitadoPorId" uuid,
          "createdAt"     timestamptz NOT NULL DEFAULT now(),
          "updatedAt"     timestamptz NOT NULL DEFAULT now()
        )`, []);
      await query(`CREATE INDEX IF NOT EXISTS idx_reapreciacao_aluno  ON public.pedidos_reapreciacao("alunoId","anoLetivo")`, []);
      await query(`CREATE INDEX IF NOT EXISTS idx_reapreciacao_turma  ON public.pedidos_reapreciacao("turmaId",status)`, []);
      await query(`CREATE INDEX IF NOT EXISTS idx_reapreciacao_status ON public.pedidos_reapreciacao(status,"createdAt" DESC)`, []);
      // Adicionar colunas que possam faltar em bases de dados mais antigas
      for (const [col, def] of [
        ['turmaNome', 'text NOT NULL DEFAULT \'\''],
        ['"comissaoMembros"', 'jsonb NOT NULL DEFAULT \'[]\'::jsonb'],
        ['"decididoPor"', 'text'],
        ['"fundamentoDecisao"', 'text'],
      ] as [string, string][]) {
        try { await query(`ALTER TABLE public.pedidos_reapreciacao ADD COLUMN IF NOT EXISTS ${col} ${def}`, []); } catch {}
      }
      console.log('[reapreciacao] ✅ Tabela pedidos_reapreciacao verificada.');
    } catch (e: unknown) {
      console.warn('[reapreciacao] migração:', (e as Error)?.message);
    }
  })();

  // ── GET /api/pedidos-reapreciacao ─────────────────────────────────────────
  // Parâmetros: anoLetivo, turmaId, alunoId, status, trimestre

  app.get("/api/pedidos-reapreciacao", requireAuth, async (req: Request, res: Response) => {
    try {
      const { anoLetivo, turmaId, alunoId, status, trimestre } = req.query as Record<string, string>;
      const role = req.jwtUser?.role;
      const userId = req.jwtUser?.userId;

      const params: unknown[] = [];
      const clauses: string[] = [];

      // Aluno/encarregado: apenas os seus pedidos
      if (role === "aluno" || role === "encarregado") {
        // Encontrar alunoId associado a este utilizador
        const alunoRows = await query<{ id: string }>(
          `SELECT a.id FROM public.alunos a WHERE a."utilizadorId"=$1 LIMIT 1`, [userId]
        );
        const myAlunoId = alunoRows[0]?.id;
        if (!myAlunoId) return json(res, 200, []);
        params.push(myAlunoId);
        clauses.push(`p."alunoId"=$${params.length}`);
      } else if (role === "professor") {
        // Professor: apenas os pedidos das suas turmas
        const turmasRows = await query<{ id: string }>(
          `SELECT id FROM public.turmas WHERE "professorId"=$1`, [userId]
        );
        const ids = turmasRows.map(r => r.id);
        if (ids.length === 0) return json(res, 200, []);
        params.push(ids);
        clauses.push(`p."turmaId"=ANY($${params.length})`);
      }

      if (anoLetivo) { params.push(anoLetivo); clauses.push(`p."anoLetivo"=$${params.length}`); }
      if (turmaId)   { params.push(turmaId);   clauses.push(`p."turmaId"=$${params.length}`); }
      if (alunoId)   { params.push(alunoId);   clauses.push(`p."alunoId"=$${params.length}`); }
      if (status)    { params.push(status);    clauses.push(`p.status=$${params.length}`); }
      if (trimestre) { params.push(parseInt(trimestre)); clauses.push(`p.trimestre=$${params.length}`); }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const rows = await query<JsonObject>(
        `SELECT p.*,
           a.nome as "nomeAlunoRef", a.apelido as "apelidoAlunoRef",
           t.nome as "nomeTurmaRef", t.classe as "classeRef"
         FROM public.pedidos_reapreciacao p
         LEFT JOIN public.alunos a ON a.id=p."alunoId"
         LEFT JOIN public.turmas t ON t.id=p."turmaId"
         ${where}
         ORDER BY p."createdAt" DESC
         LIMIT 200`,
        params
      );
      json(res, 200, rows);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ── POST /api/pedidos-reapreciacao ────────────────────────────────────────
  // Cria novo pedido (aluno/encarregado ou admin)

  app.post("/api/pedidos-reapreciacao", requireAuth, async (req: Request, res: Response) => {
    try {
      const b = req.body as Record<string, unknown>;
      const cfg = await getConfig();

      if (!cfg.reapreciacaoHabilitada) {
        return json(res, 403, { error: "O módulo de Pedido de Reapreciação (Art. 38º) não está habilitado. Active nas Configurações Gerais." });
      }

      const { alunoId, turmaId, disciplina, anoLetivo, trimestre, tipoAvaliacao, notaOriginal, motivo } = b;
      if (!alunoId || !disciplina || !anoLetivo || !motivo) {
        return json(res, 400, { error: "Campos obrigatórios em falta: alunoId, disciplina, anoLetivo, motivo." });
      }

      // Verificar se já existe pedido activo para este aluno/disciplina/trimestre/anoLetivo
      const existente = await query<{ id: string; status: string }>(
        `SELECT id, status FROM public.pedidos_reapreciacao
         WHERE "alunoId"=$1 AND disciplina=$2 AND "anoLetivo"=$3 AND trimestre=$4
           AND status NOT IN ('indeferido','arquivado')
         LIMIT 1`,
        [alunoId, disciplina, anoLetivo, trimestre ?? 1]
      );
      if (existente.length > 0) {
        return json(res, 409, { error: `Já existe um pedido activo (${existente[0].status}) para esta disciplina neste trimestre.` });
      }

      // Calcular deadline (48h ou conforme config)
      const horas = Number(cfg.reapreciacaoPrazosHoras ?? 48);
      const deadlineAt = new Date(Date.now() + horas * 3600 * 1000).toISOString();

      // Info do aluno
      const alunoRows = await query<JsonObject>(
        `SELECT a.nome, a.apelido, t.nome as "turmaNome"
         FROM public.alunos a
         LEFT JOIN public.turmas t ON t.id=$2
         WHERE a.id=$1 LIMIT 1`,
        [alunoId, turmaId ?? null]
      );
      const aluno = alunoRows[0];
      const alunoNome = aluno ? `${aluno.nome} ${aluno.apelido}`.trim() : String(b.alunoNome ?? "");
      const turmaNome = String(aluno?.turmaNome ?? b.turmaNome ?? "");

      const rows = await query<JsonObject>(
        `INSERT INTO public.pedidos_reapreciacao
           ("alunoId","alunoNome","turmaId","turmaNome",disciplina,"anoLetivo",
            trimestre,"tipoAvaliacao","notaOriginal",motivo,status,"deadlineAt",
            "solicitadoPor","solicitadoPorId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12,$13,now(),now())
         RETURNING *`,
        [
          alunoId, alunoNome, turmaId ?? null, turmaNome,
          disciplina, anoLetivo, trimestre ?? 1,
          tipoAvaliacao ?? "mini_pauta", notaOriginal ?? null, motivo,
          deadlineAt,
          req.jwtUser?.email ?? "", req.jwtUser?.userId ?? null,
        ]
      );

      // Notificar aluno por email
      const emailAluno = await getEmailAluno(String(alunoId));
      if (emailAluno) {
        enviarEmailReapreciacao({
          toEmail: emailAluno, nomeAluno: alunoNome,
          disciplina: String(disciplina), acao: "recebido",
          escolaNome: String(cfg.nomeEscola ?? "Super Escola"),
        }).catch(() => {});
      }

      json(res, 201, rows[0]);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ── PUT /api/pedidos-reapreciacao/:id ─────────────────────────────────────
  // Actualiza: atribuição de comissão, decisão final, arquivar

  app.put("/api/pedidos-reapreciacao/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const b = req.body as Record<string, unknown>;
      const role = req.jwtUser?.role;

      const existentes = await query<JsonObject>(
        `SELECT * FROM public.pedidos_reapreciacao WHERE id=$1 LIMIT 1`, [id]
      );
      if (!existentes.length) return json(res, 404, { error: "Pedido não encontrado." });
      const pedido = existentes[0];

      const cfg = await getConfig();
      const setParts: string[] = [];
      const vals: unknown[] = [];

      function addSet(col: string, val: unknown) {
        vals.push(val);
        setParts.push(`"${col}"=$${vals.length}`);
      }

      // ── Atribuir comissão (director/admin) ────────────────────────────
      if (b.comissaoMembros !== undefined) {
        if (!["admin", "director", "ceo"].includes(role ?? "")) {
          return json(res, 403, { error: "Apenas o Director ou Admin podem constituir a comissão." });
        }
        addSet("comissaoMembros", JSON.stringify(b.comissaoMembros));
        addSet("status", "em_analise");

        // Notificar aluno
        const emailAluno = await getEmailAluno(String(pedido.alunoId));
        if (emailAluno) {
          enviarEmailReapreciacao({
            toEmail: emailAluno,
            nomeAluno: String(pedido.alunoNome ?? ""),
            disciplina: String(pedido.disciplina ?? ""),
            acao: "comissao",
            escolaNome: String(cfg.nomeEscola ?? "Super Escola"),
          }).catch(() => {});
        }
      }

      // ── Registar decisão (admin/director/comissão) ────────────────────
      if (b.decisao !== undefined) {
        if (!["admin", "director", "ceo", "professor"].includes(role ?? "")) {
          return json(res, 403, { error: "Sem permissão para registar decisão." });
        }
        const decisoesValidas = ["deferido", "indeferido", "deferido_parcial"];
        const decisao = decisoesValidas.includes(String(b.decisao)) ? String(b.decisao) : "indeferido";

        addSet("decisao", decisao);
        addSet("status", decisao === "deferido" || decisao === "deferido_parcial" ? "deferido" : "indeferido");
        addSet("notaFinal", b.notaFinal ?? null);
        addSet("fundamentoDecisao", b.fundamentoDecisao ?? "");
        addSet("decididoEm", new Date().toISOString());
        addSet("decididoPor", req.jwtUser?.email ?? "");

        // Notificar aluno
        const emailAluno = await getEmailAluno(String(pedido.alunoId));
        if (emailAluno) {
          enviarEmailReapreciacao({
            toEmail: emailAluno,
            nomeAluno: String(pedido.alunoNome ?? ""),
            disciplina: String(pedido.disciplina ?? ""),
            acao: "decidido",
            status: decisao,
            notaOriginal: Number(pedido.notaOriginal ?? 0),
            notaFinal: b.notaFinal != null ? Number(b.notaFinal) : undefined,
            fundamentoDecisao: String(b.fundamentoDecisao ?? ""),
            escolaNome: String(cfg.nomeEscola ?? "Super Escola"),
          }).catch(() => {});
        }

        // Se deferido, actualizar a nota original na pauta
        if ((decisao === "deferido" || decisao === "deferido_parcial") && b.notaFinal != null) {
          try {
            await query(
              `UPDATE public.notas SET nf=$1,"updatedAt"=now()
               WHERE "alunoId"=$2 AND "turmaId"=$3 AND disciplina=$4 AND trimestre=$5
                 AND "anoLetivo"=$6`,
              [
                Number(b.notaFinal), pedido.alunoId, pedido.turmaId,
                pedido.disciplina, pedido.trimestre, pedido.anoLetivo,
              ]
            );
          } catch { /* nota pode não existir — não é bloqueante */ }
        }
      }

      // ── Arquivar ──────────────────────────────────────────────────────
      if (b.status === "arquivado") {
        addSet("status", "arquivado");
      }

      if (!setParts.length) return json(res, 400, { error: "Nenhum campo para actualizar." });
      vals.push(new Date().toISOString()); setParts.push(`"updatedAt"=$${vals.length}`);
      vals.push(id);

      const rows = await query<JsonObject>(
        `UPDATE public.pedidos_reapreciacao SET ${setParts.join(",")} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      json(res, 200, rows[0]);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ── DELETE /api/pedidos-reapreciacao/:id ──────────────────────────────────
  // Apenas admin/ceo pode eliminar (raro — usa arquivar normalmente)

  app.delete("/api/pedidos-reapreciacao/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const role = req.jwtUser?.role;
      if (!["admin", "ceo"].includes(role ?? "")) {
        return json(res, 403, { error: "Apenas administradores podem eliminar pedidos." });
      }
      await query(`DELETE FROM public.pedidos_reapreciacao WHERE id=$1`, [req.params.id]);
      json(res, 200, { ok: true });
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ── GET /api/pedidos-reapreciacao/verificar-prazo ─────────────────────────
  // Verifica se ainda está dentro do prazo para um aluno/disciplina/trimestre

  app.get("/api/pedidos-reapreciacao/verificar-prazo", requireAuth, async (req: Request, res: Response) => {
    try {
      const cfg = await getConfig();
      const horas = Number(cfg.reapreciacaoPrazosHoras ?? 48);
      const habilitado = !!cfg.reapreciacaoHabilitada;
      const { alunoId, disciplina, anoLetivo, trimestre } = req.query as Record<string, string>;

      // Verificar se já existe pedido
      if (alunoId && disciplina && anoLetivo && trimestre) {
        const existente = await query<{ status: string; "deadlineAt": string }>(
          `SELECT status,"deadlineAt" FROM public.pedidos_reapreciacao
           WHERE "alunoId"=$1 AND disciplina=$2 AND "anoLetivo"=$3 AND trimestre=$4
             AND status NOT IN ('arquivado')
           ORDER BY "createdAt" DESC LIMIT 1`,
          [alunoId, disciplina, anoLetivo, parseInt(trimestre)]
        );
        if (existente.length) {
          return json(res, 200, {
            habilitado, prazoHoras: horas,
            jaExistePedido: true,
            statusPedido: existente[0].status,
            deadlineAt: existente[0].deadlineAt,
            dentroDoProazo: true,
          });
        }
      }

      json(res, 200, { habilitado, prazoHoras: horas, jaExistePedido: false, dentroDoProazo: true });
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ── GET /api/pedidos-reapreciacao/stats ───────────────────────────────────
  // Estatísticas para dashboard admin

  app.get("/api/pedidos-reapreciacao/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const { anoLetivo } = req.query as Record<string, string>;
      const params: unknown[] = [];
      let where = "WHERE 1=1";
      if (anoLetivo) { params.push(anoLetivo); where += ` AND "anoLetivo"=$${params.length}`; }

      const rows = await query<JsonObject>(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status='pendente')::int as pendentes,
           COUNT(*) FILTER (WHERE status='em_analise')::int as "emAnalise",
           COUNT(*) FILTER (WHERE status='deferido')::int as deferidos,
           COUNT(*) FILTER (WHERE status='indeferido')::int as indeferidos,
           COUNT(*) FILTER (WHERE status='arquivado')::int as arquivados
         FROM public.pedidos_reapreciacao ${where}`,
        params
      );
      json(res, 200, rows[0] ?? {});
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });
}
