import type { Express, Request, Response } from "express";
import { requireAuth } from "./auth";
import { query } from "./db";
import { Resend } from "resend";

// ─── Email helper (melhoria de nota) ─────────────────────────────────────────
async function enviarEmailMelhoria(opts: {
  toEmail: string;
  nomeAluno: string;
  disciplina: string;
  acao: 'aprovado' | 'rejeitado' | 'realizado';
  notaAtual?: number;
  notaFinal?: number;
  motivo?: string;
  escolaNome: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.toEmail) return;
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const primeiroNome = opts.nomeAluno.split(" ")[0] || opts.nomeAluno;

  const corAcao: Record<string, string> = {
    aprovado: '#16a34a',
    rejeitado: '#dc2626',
    realizado: '#1d4ed8',
  };
  const tituloAcao: Record<string, string> = {
    aprovado:  '✅ Pedido de Melhoria Aprovado',
    rejeitado: '❌ Pedido de Melhoria Rejeitado',
    realizado: '📋 Resultado do Exame de Melhoria',
  };
  const cor = corAcao[opts.acao] ?? '#1e40af';
  const titulo = tituloAcao[opts.acao] ?? 'Actualização do Pedido de Melhoria';

  let detalheHtml = '';
  if (opts.acao === 'aprovado') {
    detalheHtml = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      O seu pedido de exame de melhoria de nota para <strong style="color:#fff;">${opts.disciplina}</strong> foi <strong style="color:#4ade80;">aprovado</strong> pela secretaria.<br/>
      Aguarde a convocação para a realização do exame. A nota final será sempre a mais alta (Art. 36º).
    </p>`;
  } else if (opts.acao === 'rejeitado') {
    detalheHtml = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      Infelizmente, o seu pedido de exame de melhoria de nota para <strong style="color:#fff;">${opts.disciplina}</strong> foi <strong style="color:#f87171;">rejeitado</strong>.
      ${opts.motivo ? `<br/><br/><strong style="color:rgba(255,255,255,0.6);">Motivo:</strong> ${opts.motivo}` : ''}
    </p>`;
  } else {
    detalheHtml = `<p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;margin:0 0 16px;">
      O resultado do seu exame de melhoria de nota para <strong style="color:#fff;">${opts.disciplina}</strong> foi registado.
      ${opts.notaFinal != null ? `<br/><br/>🎯 <strong style="color:#60a5fa;">Nota final: ${opts.notaFinal} valores</strong> (a mais alta entre ${opts.notaAtual ?? '—'} e ${opts.notaFinal}).` : ''}
    </p>`;
  }

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:32px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="background:${cor};padding:28px 36px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${titulo}</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${opts.escolaNome} — Exame de Melhoria de Nota (Art. 36º)</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:rgba(255,255,255,0.9);font-size:15px;margin:0 0 16px;">Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,</p>
          ${detalheHtml}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background:rgba(255,255,255,0.05);border-radius:10px;padding:14px 18px;">
              <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Detalhe da Solicitação</p>
              <p style="margin:0;color:#fff;font-size:14px;">📚 Disciplina: <strong>${opts.disciplina}</strong></p>
              ${opts.notaAtual != null ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Nota original: ${opts.notaAtual} val.</p>` : ''}
            </td></tr>
          </table>
          <p style="margin:0;color:rgba(255,255,255,0.4);font-size:11px;">Para mais informações, contacte a secretaria da escola ou aceda ao portal SIGA.</p>
        </td></tr>
        <tr><td style="background:rgba(0,0,0,0.2);padding:16px 36px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:rgba(255,255,255,0.3);font-size:11px;">Email enviado automaticamente pelo ${opts.escolaNome} — SIGA.<br/>Por favor não responda a este email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const r = await resend.emails.send({ from, to: opts.toEmail, subject: `${titulo} — ${opts.disciplina}`, html, text: titulo } as any);
    if (r.error) throw r.error;
  } catch (firstErr: any) {
    // fallback para domínio não verificado
    if (String(firstErr?.message ?? '').includes('testing emails') || String(firstErr?.message ?? '').includes('own email address')) {
      try {
        await resend.emails.send({ from: 'onboarding@resend.dev', to: opts.toEmail, subject: `${titulo} — ${opts.disciplina}`, html, text: titulo } as any);
      } catch (e2) {
        console.warn('[melhoria-nota] email fallback failed:', (e2 as any)?.message);
      }
    } else {
      console.warn('[melhoria-nota] email failed:', firstErr?.message ?? firstErr);
    }
  }
}

async function getAlunoBioEmail(alunoId: string): Promise<{ email?: string; nome?: string }> {
  // Tenta obter email do utilizador ou encarregado do aluno
  const rows = await query<any>(
    `SELECT u.email AS emailUser, a."emailEncarregado", a.nome, a.apelido
     FROM public.alunos a
     LEFT JOIN public.utilizadores u ON u.id = a."userId"
     WHERE a.id = $1`,
    [alunoId]
  ).catch(() => []);
  if (!rows.length) return {};
  const r = rows[0];
  return {
    email: r.emailUser || r.emailEncarregado || undefined,
    nome: `${r.nome ?? ''} ${r.apelido ?? ''}`.trim(),
  };
}

const ROLES_SECRETARIA = ["ceo","pca","admin","director","pedagogico","chefe_secretaria","secretaria"];

export function registerMelhoriaNotaRoutes(app: Express) {

  async function ensureSchema() {
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "melhoriaNotaHabilitada" boolean NOT NULL DEFAULT false`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "maxDisciplinasMelhoria" integer NOT NULL DEFAULT 5`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "prazoHorasMelhoria" integer NOT NULL DEFAULT 48`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "notaMinMelhoria" integer NOT NULL DEFAULT 10`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "notaMaxMelhoria" integer NOT NULL DEFAULT 16`);

    await query(`
      CREATE TABLE IF NOT EXISTS public.solicitacoes_melhoria_nota (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "alunoId" varchar NOT NULL,
        "alunoNome" text NOT NULL DEFAULT '',
        "alunoMatricula" text NOT NULL DEFAULT '',
        "turmaId" varchar NOT NULL,
        "turmaNome" text NOT NULL DEFAULT '',
        "turmaClasse" text NOT NULL DEFAULT '',
        "disciplina" text NOT NULL,
        "anoLetivo" text NOT NULL,
        "notaAtual" real NOT NULL DEFAULT 0,
        "notaMelhoria" real,
        "status" text NOT NULL DEFAULT 'pendente',
        "dataSolicitacao" timestamptz NOT NULL DEFAULT now(),
        "prazoExpiracao" timestamptz,
        "observacoes" text,
        "analisadoPor" text,
        "analisadoEm" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_smn_aluno ON public.solicitacoes_melhoria_nota ("alunoId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_smn_turma ON public.solicitacoes_melhoria_nota ("turmaId")`);
    await query(`CREATE INDEX IF NOT EXISTS idx_smn_ano ON public.solicitacoes_melhoria_nota ("anoLetivo")`);
  }

  ensureSchema().catch(e => console.warn("[melhoria-nota] schema init:", e.message));

  // ─── GET /api/melhoria-nota/config ──────────────────────────────────────────
  app.get("/api/melhoria-nota/config", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<any>(
        `SELECT "melhoriaNotaHabilitada","maxDisciplinasMelhoria","prazoHorasMelhoria","notaMinMelhoria","notaMaxMelhoria" FROM public.config_geral LIMIT 1`
      );
      res.json(rows[0] ?? { melhoriaNotaHabilitada: false, maxDisciplinasMelhoria: 5, prazoHorasMelhoria: 48, notaMinMelhoria: 10, notaMaxMelhoria: 16 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PUT /api/melhoria-nota/config ──────────────────────────────────────────
  app.put("/api/melhoria-nota/config", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) return res.status(403).json({ error: "Sem permissão" });
      const { melhoriaNotaHabilitada, maxDisciplinasMelhoria, prazoHorasMelhoria, notaMinMelhoria, notaMaxMelhoria } = req.body;
      await query(
        `UPDATE public.config_geral SET
          "melhoriaNotaHabilitada"   = COALESCE($1, "melhoriaNotaHabilitada"),
          "maxDisciplinasMelhoria"   = COALESCE($2, "maxDisciplinasMelhoria"),
          "prazoHorasMelhoria"       = COALESCE($3, "prazoHorasMelhoria"),
          "notaMinMelhoria"          = COALESCE($4, "notaMinMelhoria"),
          "notaMaxMelhoria"          = COALESCE($5, "notaMaxMelhoria")`,
        [
          melhoriaNotaHabilitada != null ? Boolean(melhoriaNotaHabilitada) : null,
          maxDisciplinasMelhoria != null ? Number(maxDisciplinasMelhoria) : null,
          prazoHorasMelhoria != null ? Number(prazoHorasMelhoria) : null,
          notaMinMelhoria != null ? Number(notaMinMelhoria) : null,
          notaMaxMelhoria != null ? Number(notaMaxMelhoria) : null,
        ]
      );
      const updated = await query<any>(
        `SELECT "melhoriaNotaHabilitada","maxDisciplinasMelhoria","prazoHorasMelhoria","notaMinMelhoria","notaMaxMelhoria" FROM public.config_geral LIMIT 1`
      );
      res.json(updated[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── POST /api/melhoria-nota/solicitar ──────────────────────────────────────
  // Aluno solicita exame de melhoria para uma disciplina
  app.post("/api/melhoria-nota/solicitar", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { alunoId, turmaId, disciplina, anoLetivo, notaAtual, observacoes } = req.body;

      if (!alunoId || !turmaId || !disciplina || !anoLetivo || notaAtual == null) {
        return res.status(400).json({ error: "Campos obrigatórios em falta" });
      }

      // Carregar config
      const cfgRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`);
      const cfg = cfgRows[0] ?? {};
      if (!cfg.melhoriaNotaHabilitada) {
        return res.status(403).json({ error: "Exame de Melhoria de Nota não está habilitado" });
      }

      const notaMin = Number(cfg.notaMinMelhoria ?? 10);
      const notaMax = Number(cfg.notaMaxMelhoria ?? 16);
      const maxDisc = Number(cfg.maxDisciplinasMelhoria ?? 5);
      const prazoH = Number(cfg.prazoHorasMelhoria ?? 48);

      // Verificar intervalo de nota
      const nota = Number(notaAtual);
      if (nota < notaMin || nota > notaMax) {
        return res.status(400).json({
          error: `Nota ${nota} não está no intervalo elegível para melhoria (${notaMin}–${notaMax})`,
        });
      }

      // Verificar limite de disciplinas já solicitadas
      const jaExistentes = await query<any>(
        `SELECT COUNT(*) AS cnt FROM public.solicitacoes_melhoria_nota
         WHERE "alunoId" = $1 AND "anoLetivo" = $2 AND status NOT IN ('cancelado','rejeitado')`,
        [alunoId, anoLetivo]
      );
      const qtd = Number(jaExistentes[0]?.cnt ?? 0);
      if (qtd >= maxDisc) {
        return res.status(400).json({
          error: `Limite de ${maxDisc} disciplinas para melhoria já atingido`,
        });
      }

      // Verificar se já existe pedido para esta disciplina
      const dupl = await query<any>(
        `SELECT id FROM public.solicitacoes_melhoria_nota
         WHERE "alunoId" = $1 AND "anoLetivo" = $2 AND disciplina = $3 AND status NOT IN ('cancelado','rejeitado')`,
        [alunoId, anoLetivo, disciplina]
      );
      if (dupl.length) {
        return res.status(409).json({ error: "Já existe pedido de melhoria para esta disciplina" });
      }

      // Dados do aluno e turma
      const alunoRows = await query<any>(
        `SELECT a.nome, a.apelido, a."numeroMatricula", t.nome AS "turmaNome", t.classe AS "turmaClasse"
         FROM public.alunos a LEFT JOIN public.turmas t ON t.id = $2
         WHERE a.id = $1`,
        [alunoId, turmaId]
      );
      const inf = alunoRows[0] ?? {};

      const prazoExpiracao = new Date(Date.now() + prazoH * 3600 * 1000);

      const rows = await query<any>(
        `INSERT INTO public.solicitacoes_melhoria_nota
           ("alunoId","alunoNome","alunoMatricula","turmaId","turmaNome","turmaClasse","disciplina","anoLetivo","notaAtual","status","dataSolicitacao","prazoExpiracao","observacoes")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',now(),$10,$11)
         RETURNING *`,
        [
          alunoId,
          `${inf.nome ?? ''} ${inf.apelido ?? ''}`.trim(),
          inf.numeroMatricula ?? '',
          turmaId,
          inf.turmaNome ?? '',
          inf.turmaClasse ?? '',
          disciplina,
          anoLetivo,
          nota,
          prazoExpiracao.toISOString(),
          observacoes ?? null,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (e: any) {
      console.error("[melhoria-nota] solicitar:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/melhoria-nota ──────────────────────────────────────────────────
  // Secretaria: lista todas as solicitações com filtros
  app.get("/api/melhoria-nota", requireAuth, async (req: Request, res: Response) => {
    try {
      const { anoLetivo, turmaId, status, alunoId } = req.query as Record<string, string>;
      const params: any[] = [];
      const cond: string[] = [];
      if (anoLetivo) { params.push(anoLetivo); cond.push(`s."anoLetivo" = $${params.length}`); }
      if (turmaId) { params.push(turmaId); cond.push(`s."turmaId" = $${params.length}`); }
      if (status) { params.push(status); cond.push(`s.status = $${params.length}`); }
      if (alunoId) { params.push(alunoId); cond.push(`s."alunoId" = $${params.length}`); }

      const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
      const rows = await query<any>(
        `SELECT s.* FROM public.solicitacoes_melhoria_nota s ${where} ORDER BY s."dataSolicitacao" DESC`,
        params
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/melhoria-nota/minhas ──────────────────────────────────────────
  // Aluno: as suas próprias solicitações
  app.get("/api/melhoria-nota/minhas", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { anoLetivo } = req.query as Record<string, string>;

      // Encontrar alunoId pelo userId
      const alunoRows = await query<any>(
        `SELECT id FROM public.alunos WHERE "userId" = $1 LIMIT 1`,
        [user.id]
      );
      if (!alunoRows.length) return res.json([]);
      const alunoId = alunoRows[0].id;

      const params: any[] = [alunoId];
      const cond: string[] = [`s."alunoId" = $1`];
      if (anoLetivo) { params.push(anoLetivo); cond.push(`s."anoLetivo" = $${params.length}`); }

      const rows = await query<any>(
        `SELECT s.* FROM public.solicitacoes_melhoria_nota s WHERE ${cond.join(" AND ")} ORDER BY s."dataSolicitacao" DESC`,
        params
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/melhoria-nota/notas-disponiveis ────────────────────────────────
  // Aluno: busca as suas notas elegíveis para melhoria
  app.get("/api/melhoria-nota/notas-disponiveis", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { anoLetivo } = req.query as Record<string, string>;
      if (!anoLetivo) return res.status(400).json({ error: "anoLetivo obrigatório" });

      const alunoRows = await query<any>(
        `SELECT a.id, a."turmaId" FROM public.alunos a WHERE a."userId" = $1 LIMIT 1`,
        [user.id]
      );
      if (!alunoRows.length) return res.json([]);
      const { id: alunoId, turmaId } = alunoRows[0];

      const cfgRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`);
      const cfg = cfgRows[0] ?? {};
      const notaMin = Number(cfg.notaMinMelhoria ?? 10);
      const notaMax = Number(cfg.notaMaxMelhoria ?? 16);

      // Notas finais por disciplina
      const notas = await query<any>(
        `SELECT disciplina, nf, trimestre FROM public.notas
         WHERE "alunoId" = $1 AND "turmaId" = $2
         ORDER BY disciplina, trimestre DESC`,
        [alunoId, turmaId]
      );

      // Pegar nota mais recente por disciplina
      const porDisc: Record<string, any> = {};
      for (const n of notas) {
        if (!porDisc[n.disciplina] || n.trimestre > porDisc[n.disciplina].trimestre) {
          porDisc[n.disciplina] = n;
        }
      }

      const elegiveis = Object.values(porDisc).filter((n: any) => {
        const nf = Number(n.nf ?? 0);
        return nf >= notaMin && nf <= notaMax;
      });

      // Verificar quais já têm pedido
      const jaExistentes = await query<any>(
        `SELECT disciplina FROM public.solicitacoes_melhoria_nota
         WHERE "alunoId" = $1 AND "anoLetivo" = $2 AND status NOT IN ('cancelado','rejeitado')`,
        [alunoId, anoLetivo]
      );
      const discComPedido = new Set(jaExistentes.map((r: any) => r.disciplina));

      res.json({
        alunoId,
        turmaId,
        elegiveis: elegiveis.map((n: any) => ({
          disciplina: n.disciplina,
          notaAtual: n.nf,
          jaSolicitado: discComPedido.has(n.disciplina),
        })),
        config: { notaMin, notaMax },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PUT /api/melhoria-nota/:id/resultado ───────────────────────────────────
  // Secretaria: registar resultado do exame de melhoria
  app.put("/api/melhoria-nota/:id/resultado", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão" });
      }
      const { id } = req.params;
      const { notaMelhoria, status, observacoes } = req.body;
      // status pode ser: 'realizado', 'cancelado', 'rejeitado'

      if (!status) return res.status(400).json({ error: "status obrigatório" });

      // Buscar solicitação
      const existRows = await query<any>(
        `SELECT * FROM public.solicitacoes_melhoria_nota WHERE id = $1`,
        [id]
      );
      if (!existRows.length) return res.status(404).json({ error: "Solicitação não encontrada" });
      const sol = existRows[0];

      // Nota final sempre é a mais alta (decreto art. 36)
      const notaFinal = status === 'realizado' && notaMelhoria != null
        ? Math.max(Number(sol.notaAtual), Number(notaMelhoria))
        : sol.notaAtual;

      const updated = await query<any>(
        `UPDATE public.solicitacoes_melhoria_nota SET
           status = $1,
           "notaMelhoria" = $2,
           "analisadoPor" = $3,
           "analisadoEm" = now(),
           observacoes = COALESCE($4, observacoes)
         WHERE id = $5
         RETURNING *`,
        [status, status === 'realizado' ? notaFinal : null, user.nome ?? user.email, observacoes ?? null, id]
      );

      // Se realizado e há melhoria, atualizar a nota na tabela notas
      if (status === 'realizado' && notaMelhoria != null) {
        try {
          await query(
            `UPDATE public.notas SET "provaRecuperacao" = $1
             WHERE "alunoId" = $2 AND "turmaId" = $3 AND disciplina = $4
             ORDER BY trimestre DESC
             LIMIT 1`,
            [notaFinal, sol.alunoId, sol.turmaId, sol.disciplina]
          );
        } catch (_) {}
      }

      // Email ao aluno com resultado
      try {
        const cfgRows = await query<any>(`SELECT nome FROM public.config_geral LIMIT 1`);
        const escolaNome = cfgRows[0]?.nome ?? 'Super Escola';
        const bio = await getAlunoBioEmail(sol.alunoId);
        if (bio.email && status === 'realizado') {
          enviarEmailMelhoria({
            toEmail: bio.email,
            nomeAluno: bio.nome ?? sol.alunoNome,
            disciplina: sol.disciplina,
            acao: 'realizado',
            notaAtual: Number(sol.notaAtual),
            notaFinal,
            escolaNome,
          }).catch(() => {});
        }
      } catch (_) {}

      res.json(updated[0]);
    } catch (e: any) {
      console.error("[melhoria-nota] resultado:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PUT /api/melhoria-nota/:id/aprovar ─────────────────────────────────────
  // Secretaria aprova o pedido → status 'aprovado' + email ao aluno
  app.put("/api/melhoria-nota/:id/aprovar", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) return res.status(403).json({ error: "Sem permissão" });
      const { id } = req.params;
      const { observacoes } = req.body;

      const rows = await query<any>(`SELECT * FROM public.solicitacoes_melhoria_nota WHERE id = $1`, [id]);
      if (!rows.length) return res.status(404).json({ error: "Não encontrado" });
      const sol = rows[0];
      if (sol.status !== 'pendente') return res.status(400).json({ error: `Pedido já está '${sol.status}'` });

      const updated = await query<any>(
        `UPDATE public.solicitacoes_melhoria_nota
         SET status = 'aprovado', "analisadoPor" = $1, "analisadoEm" = now(),
             observacoes = COALESCE($2, observacoes)
         WHERE id = $3 RETURNING *`,
        [user.nome ?? user.email, observacoes ?? null, id]
      );

      // Email de notificação
      const cfgRows = await query<any>(`SELECT nome FROM public.config_geral LIMIT 1`);
      const escolaNome = cfgRows[0]?.nome ?? 'Super Escola';
      const bio = await getAlunoBioEmail(sol.alunoId);
      if (bio.email) {
        enviarEmailMelhoria({
          toEmail: bio.email,
          nomeAluno: bio.nome ?? sol.alunoNome,
          disciplina: sol.disciplina,
          acao: 'aprovado',
          notaAtual: sol.notaAtual,
          escolaNome,
        }).catch(() => {});
      }

      res.json({ ...updated[0], emailEnviado: !!bio.email });
    } catch (e: any) {
      console.error("[melhoria-nota] aprovar:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PUT /api/melhoria-nota/:id/rejeitar ────────────────────────────────────
  // Secretaria rejeita o pedido → status 'rejeitado' + email com motivo ao aluno
  app.put("/api/melhoria-nota/:id/rejeitar", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) return res.status(403).json({ error: "Sem permissão" });
      const { id } = req.params;
      const { motivo } = req.body;

      const rows = await query<any>(`SELECT * FROM public.solicitacoes_melhoria_nota WHERE id = $1`, [id]);
      if (!rows.length) return res.status(404).json({ error: "Não encontrado" });
      const sol = rows[0];
      if (!['pendente','aprovado'].includes(sol.status)) return res.status(400).json({ error: `Pedido já está '${sol.status}'` });

      const updated = await query<any>(
        `UPDATE public.solicitacoes_melhoria_nota
         SET status = 'rejeitado', "analisadoPor" = $1, "analisadoEm" = now(),
             observacoes = COALESCE($2, observacoes)
         WHERE id = $3 RETURNING *`,
        [user.nome ?? user.email, motivo ?? null, id]
      );

      // Email de notificação
      const cfgRows = await query<any>(`SELECT nome FROM public.config_geral LIMIT 1`);
      const escolaNome = cfgRows[0]?.nome ?? 'Super Escola';
      const bio = await getAlunoBioEmail(sol.alunoId);
      if (bio.email) {
        enviarEmailMelhoria({
          toEmail: bio.email,
          nomeAluno: bio.nome ?? sol.alunoNome,
          disciplina: sol.disciplina,
          acao: 'rejeitado',
          notaAtual: sol.notaAtual,
          motivo: motivo ?? undefined,
          escolaNome,
        }).catch(() => {});
      }

      res.json({ ...updated[0], emailEnviado: !!bio.email });
    } catch (e: any) {
      console.error("[melhoria-nota] rejeitar:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── DELETE /api/melhoria-nota/:id ──────────────────────────────────────────
  // Aluno cancela o seu pedido (só se pendente)
  app.delete("/api/melhoria-nota/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const rows = await query<any>(
        `SELECT * FROM public.solicitacoes_melhoria_nota WHERE id = $1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "Não encontrado" });

      const sol = rows[0];
      if (sol.status !== 'pendente') {
        return res.status(400).json({ error: "Apenas pedidos pendentes podem ser cancelados" });
      }

      // Aluno só pode cancelar o seu próprio
      if (user.role === 'aluno') {
        const alunoRows = await query<any>(
          `SELECT id FROM public.alunos WHERE "userId" = $1 LIMIT 1`,
          [user.id]
        );
        if (!alunoRows.length || alunoRows[0].id !== sol.alunoId) {
          return res.status(403).json({ error: "Sem permissão" });
        }
      } else if (!ROLES_SECRETARIA.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão" });
      }

      await query(
        `UPDATE public.solicitacoes_melhoria_nota SET status = 'cancelado', "analisadoEm" = now() WHERE id = $1`,
        [id]
      );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
