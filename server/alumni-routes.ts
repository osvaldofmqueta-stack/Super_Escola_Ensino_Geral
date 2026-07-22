import type { Express, Request, Response } from "express";
import { requireAuth, requireRole } from "./auth";
import { query } from "./db";

const ADMIN_ROLES = ['admin', 'director', 'subdirector_pedagogico', 'chefe_secretaria', 'secretaria', 'ceo', 'pca'] as const;

type JsonObject = Record<string, unknown>;
function json(res: Response, status: number, data: unknown) {
  return res.status(status).json(data);
}

export async function registerAlumniRoutes(app: Express) {
  // ─── Ensure table exists ─────────────────────────────────────────────────────
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS public.alumni (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "alunoId" varchar,
        nome text NOT NULL,
        email text,
        telefone text,
        "dataNascimento" text,
        genero text,
        "anoFormacao" text NOT NULL,
        classe text NOT NULL DEFAULT '',
        "cursoId" varchar,
        "cursoNome" text NOT NULL DEFAULT '',
        "notaFinal" real,
        "situacaoAtual" text NOT NULL DEFAULT 'desconhecida',
        empregador text,
        cargo text,
        universidade text,
        "areaProfissional" text,
        localizacao text,
        foto text,
        observacoes text,
        "criadoEm" timestamptz NOT NULL DEFAULT NOW(),
        "atualizadoEm" timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    // Unique constraint: prevent duplicate alumni import per aluno+anoFormacao
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS alumni_alunoId_anoFormacao_unique
        ON public.alumni ("alunoId", "anoFormacao")
        WHERE "alunoId" IS NOT NULL
    `);
    console.log('[migration] alumni table ensured.');
  } catch (e) {
    console.warn('[migration] alumni:', (e as Error).message);
  }

  // ─── GET /api/alumni — lista todos ───────────────────────────────────────────
  app.get("/api/alumni", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await query<JsonObject>(
        `SELECT * FROM public.alumni ORDER BY "anoFormacao" DESC, nome ASC`
      );
      return json(res, 200, rows);
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── GET /api/alumni/stats ───────────────────────────────────────────────────
  app.get("/api/alumni/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await query<JsonObject>(
        `SELECT
           COUNT(*)::int                                                         AS total,
           COUNT(*) FILTER (WHERE "situacaoAtual"='empregado')::int             AS empregados,
           COUNT(*) FILTER (WHERE "situacaoAtual"='estudante')::int             AS estudantes,
           COUNT(*) FILTER (WHERE "situacaoAtual"='empreendedor')::int          AS empreendedores,
           COUNT(*) FILTER (WHERE "situacaoAtual"='desempregado')::int          AS desempregados,
           COUNT(*) FILTER (WHERE "situacaoAtual"='desconhecida')::int          AS desconhecidos,
           COUNT(DISTINCT "anoFormacao")::int                                    AS anos,
           AVG("notaFinal")::numeric(5,2)                                        AS mediaNotas
         FROM public.alumni`
      );
      return json(res, 200, rows[0] ?? {});
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── GET /api/alumni/:id ─────────────────────────────────────────────────────
  app.get("/api/alumni/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<JsonObject>(
        `SELECT * FROM public.alumni WHERE id=$1 LIMIT 1`, [req.params.id]
      );
      if (!rows[0]) return json(res, 404, { error: 'Alumni não encontrado.' });
      return json(res, 200, rows[0]);
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── POST /api/alumni — criar ─────────────────────────────────────────────────
  app.post("/api/alumni", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const b = req.body as Record<string, unknown>;
      if (!b.nome || !b.anoFormacao)
        return json(res, 400, { error: 'nome e anoFormacao são obrigatórios.' });
      const rows = await query<JsonObject>(
        `INSERT INTO public.alumni
           ("alunoId", nome, email, telefone, "dataNascimento", genero,
            "anoFormacao", classe, "cursoId", "cursoNome", "notaFinal",
            "situacaoAtual", empregador, cargo, universidade,
            "areaProfissional", localizacao, foto, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          b.alunoId ?? null,
          b.nome,
          b.email ?? null,
          b.telefone ?? null,
          b.dataNascimento ?? null,
          b.genero ?? null,
          b.anoFormacao,
          b.classe ?? '',
          b.cursoId ?? null,
          b.cursoNome ?? '',
          b.notaFinal != null ? Number(b.notaFinal) : null,
          b.situacaoAtual ?? 'desconhecida',
          b.empregador ?? null,
          b.cargo ?? null,
          b.universidade ?? null,
          b.areaProfissional ?? null,
          b.localizacao ?? null,
          b.foto ?? null,
          b.observacoes ?? null,
        ]
      );
      return json(res, 201, rows[0]);
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── PUT /api/alumni/:id — actualizar ─────────────────────────────────────────
  app.put("/api/alumni/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const b = req.body as Record<string, unknown>;
      const rows = await query<JsonObject>(
        `UPDATE public.alumni SET
           nome                = COALESCE($1, nome),
           email               = COALESCE($2, email),
           telefone            = COALESCE($3, telefone),
           "dataNascimento"    = COALESCE($4, "dataNascimento"),
           genero              = COALESCE($5, genero),
           "anoFormacao"       = COALESCE($6, "anoFormacao"),
           classe              = COALESCE($7, classe),
           "cursoId"           = COALESCE($8, "cursoId"),
           "cursoNome"         = COALESCE($9, "cursoNome"),
           "notaFinal"         = COALESCE($10, "notaFinal"),
           "situacaoAtual"     = COALESCE($11, "situacaoAtual"),
           empregador          = COALESCE($12, empregador),
           cargo               = COALESCE($13, cargo),
           universidade        = COALESCE($14, universidade),
           "areaProfissional"  = COALESCE($15, "areaProfissional"),
           localizacao         = COALESCE($16, localizacao),
           foto                = COALESCE($17, foto),
           observacoes         = COALESCE($18, observacoes),
           "atualizadoEm"      = NOW()
         WHERE id = $19
         RETURNING *`,
        [
          b.nome ?? null, b.email ?? null, b.telefone ?? null,
          b.dataNascimento ?? null, b.genero ?? null,
          b.anoFormacao ?? null, b.classe ?? null,
          b.cursoId ?? null, b.cursoNome ?? null,
          b.notaFinal != null ? Number(b.notaFinal) : null,
          b.situacaoAtual ?? null, b.empregador ?? null, b.cargo ?? null,
          b.universidade ?? null, b.areaProfissional ?? null,
          b.localizacao ?? null, b.foto ?? null,
          b.observacoes ?? null, id,
        ]
      );
      if (!rows[0]) return json(res, 404, { error: 'Alumni não encontrado.' });
      return json(res, 200, rows[0]);
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── DELETE /api/alumni/:id ───────────────────────────────────────────────────
  app.delete("/api/alumni/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      await query(`DELETE FROM public.alumni WHERE id=$1`, [req.params.id]);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });

  // ─── POST /api/alumni/importar-de-finalistas ──────────────────────────────────
  // Cria registros alumni a partir de alunos já formados no sistema
  app.post("/api/alumni/importar-de-finalistas", requireAuth, requireRole(...ADMIN_ROLES), async (req: Request, res: Response) => {
    try {
      const { alunoIds, anoFormacao } = req.body as { alunoIds: string[]; anoFormacao: string };
      if (!alunoIds?.length || !anoFormacao)
        return json(res, 400, { error: 'alunoIds e anoFormacao são obrigatórios.' });

      const alunos = await query<JsonObject>(
        `SELECT a.*, t.classe, t.nome AS "turmaNome", c.nome AS "cursoNome", c.id AS "cursoIdReal"
         FROM public.alunos a
         LEFT JOIN public.turmas t ON t.id = a."turmaId"
         LEFT JOIN public.cursos c ON c.id = a."cursoId"
         WHERE a.id = ANY($1::text[])`,
        [alunoIds]
      );

      let created = 0;
      let skipped = 0;
      for (const a of alunos) {
        const existing = await query<JsonObject>(
          `SELECT id FROM public.alumni WHERE "alunoId"=$1 AND "anoFormacao"=$2 LIMIT 1`,
          [a.id, anoFormacao]
        );
        if (existing.length > 0) { skipped++; continue; }

        const nome = `${a.nome ?? ''} ${a.apelido ?? ''}`.trim();
        await query(
          `INSERT INTO public.alumni
             ("alunoId", nome, email, telefone, "dataNascimento", genero,
              "anoFormacao", classe, "cursoId", "cursoNome", "situacaoAtual")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'desconhecida')`,
          [
            a.id, nome, a.email ?? null, a.telefone ?? null,
            a.dataNascimento ?? null, a.genero ?? null,
            anoFormacao, a.classe ?? '',
            a.cursoIdReal ?? null, a.cursoNome ?? '',
          ]
        );
        created++;
      }

      return json(res, 200, { created, skipped, total: alunos.length });
    } catch (e) { return json(res, 500, { error: (e as Error).message }); }
  });
}
