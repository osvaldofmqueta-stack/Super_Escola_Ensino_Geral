import type { Express, Request, Response } from "express";
import { requireAuth, requirePermission } from "./auth";
import { query } from "./db";

const ROLES_GESTAO = ["ceo", "pca", "admin", "director", "pedagogico", "chefe_secretaria", "secretaria"];

export function registerExameExtraordinarioRoutes(app: Express) {

  // Garantir tabela e colunas (idempotente)
  async function ensureSchema() {
    await query(`
      ALTER TABLE public.alunos
        ADD COLUMN IF NOT EXISTS "matriculaCondicional" boolean NOT NULL DEFAULT false
    `);
    await query(`
      ALTER TABLE public.alunos
        ADD COLUMN IF NOT EXISTS "disciplinasCondicionais" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS public.exames_extraordinarios (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "alunoId" varchar NOT NULL,
        "alunoNome" text NOT NULL,
        "alunoNumeroMatricula" text NOT NULL DEFAULT '',
        "turmaIdOrigem" varchar NOT NULL,
        "turmaNomeOrigem" text NOT NULL,
        "turmaIdAtual" varchar,
        "turmaNomeAtual" text,
        "disciplina" text NOT NULL,
        "anoLetivoOrigem" text NOT NULL,
        "anoLetivoAtual" text NOT NULL,
        "trimestre" integer NOT NULL DEFAULT 1,
        "nota" real,
        "notaAnterior" real,
        "resultado" text NOT NULL DEFAULT 'pendente',
        "status" text NOT NULL DEFAULT 'pendente',
        "dataExame" text,
        "professorId" varchar,
        "professorNome" text,
        "observacoes" text,
        "registadoPor" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exames_ext_unique ON public.exames_extraordinarios ("alunoId","disciplina","anoLetivoOrigem")`);
  }

  // Inicializar schema ao arrancar
  ensureSchema().catch(e => console.warn("[exame-extraordinario] schema init:", e.message));

  // ─── GET /api/exames-extraordinarios ─────────────────────────────────────
  // Lista todos os exames com filtros opcionais
  app.get("/api/exames-extraordinarios", requireAuth, async (req: Request, res: Response) => {
    try {
      const { anoLetivoAtual, anoLetivoOrigem, resultado, status } = req.query as Record<string, string>;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (anoLetivoAtual) { params.push(anoLetivoAtual); conditions.push(`e."anoLetivoAtual" = $${params.length}`); }
      if (anoLetivoOrigem) { params.push(anoLetivoOrigem); conditions.push(`e."anoLetivoOrigem" = $${params.length}`); }
      if (resultado) { params.push(resultado); conditions.push(`e.resultado = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await query<Record<string, unknown>>(
        `SELECT e.*,
                a."numeroMatricula", a."turmaId" AS "turmaIdAluno",
                t.classe AS "classeAtual", t.nome AS "turmaNomeAtualFromDB"
         FROM public.exames_extraordinarios e
         LEFT JOIN public.alunos a ON a.id = e."alunoId"
         LEFT JOIN public.turmas t ON t.id = e."turmaIdAtual"
         ${where}
         ORDER BY e."createdAt" DESC`,
        params
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exames-extraordinarios/alunos-condicionais ─────────────────
  // Lista alunos com matrícula condicional activa
  app.get("/api/exames-extraordinarios/alunos-condicionais", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<Record<string, unknown>>(
        `SELECT a.id, a.nome, a.apelido, a."numeroMatricula",
                a."turmaId", a."matriculaCondicional", a."disciplinasCondicionais",
                t.nome AS "turmaNome", t.classe, t."anoLetivo"
         FROM public.alunos a
         LEFT JOIN public.turmas t ON t.id = a."turmaId"
         WHERE a."matriculaCondicional" = true AND a.ativo = true
         ORDER BY a.nome ASC`
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exames-extraordinarios/:id ─────────────────────────────────
  app.get("/api/exames-extraordinarios/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<Record<string, unknown>>(
        `SELECT e.*, a."numeroMatricula" FROM public.exames_extraordinarios e
         LEFT JOIN public.alunos a ON a.id = e."alunoId"
         WHERE e.id = $1`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Não encontrado." });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── POST /api/exames-extraordinarios ────────────────────────────────────
  // Cria um registo de exame extraordinário para um aluno/disciplina
  app.post("/api/exames-extraordinarios", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.jwtUser!;
      if (!ROLES_GESTAO.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão para criar exames extraordinários." });
      }
      const b = req.body as Record<string, unknown>;

      // Validar obrigatórios
      const required = ["alunoId", "disciplina", "anoLetivoOrigem", "anoLetivoAtual", "turmaIdOrigem"];
      for (const f of required) {
        if (!b[f]) return res.status(400).json({ error: `Campo obrigatório em falta: ${f}` });
      }

      // Buscar dados do aluno
      const alunoRows = await query<Record<string, unknown>>(
        `SELECT a.nome, a.apelido, a."numeroMatricula", a."turmaId",
                t.nome AS "turmaNomeAtual"
         FROM public.alunos a
         LEFT JOIN public.turmas t ON t.id = a."turmaId"
         WHERE a.id = $1`,
        [b.alunoId]
      );
      if (!alunoRows[0]) return res.status(404).json({ error: "Aluno não encontrado." });
      const aluno = alunoRows[0];
      const alunoNome = `${aluno.nome} ${aluno.apelido ?? ""}`.trim();

      // Buscar turma de origem
      const turmaOrigemRows = await query<Record<string, unknown>>(
        `SELECT nome FROM public.turmas WHERE id = $1`,
        [b.turmaIdOrigem]
      );

      const rows = await query<Record<string, unknown>>(
        `INSERT INTO public.exames_extraordinarios
           (id,"alunoId","alunoNome","alunoNumeroMatricula","turmaIdOrigem","turmaNomeOrigem",
            "turmaIdAtual","turmaNomeAtual","disciplina","anoLetivoOrigem","anoLetivoAtual",
            "trimestre","notaAnterior","status","dataExame","professorId","professorNome",
            "observacoes","registadoPor")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pendente',$13,$14,$15,$16,$17)
         ON CONFLICT ("alunoId","disciplina","anoLetivoOrigem") DO UPDATE SET
           "turmaNomeOrigem" = EXCLUDED."turmaNomeOrigem",
           "turmaIdAtual" = EXCLUDED."turmaIdAtual",
           "turmaNomeAtual" = EXCLUDED."turmaNomeAtual",
           "notaAnterior" = EXCLUDED."notaAnterior",
           "dataExame" = EXCLUDED."dataExame",
           "professorId" = EXCLUDED."professorId",
           "professorNome" = EXCLUDED."professorNome",
           "observacoes" = EXCLUDED."observacoes"
         RETURNING *`,
        [
          b.alunoId,
          alunoNome,
          aluno.numeroMatricula ?? "",
          b.turmaIdOrigem,
          turmaOrigemRows[0]?.nome ?? String(b.turmaIdOrigem),
          aluno.turmaId ?? null,
          aluno.turmaNomeAtual ?? null,
          b.disciplina,
          b.anoLetivoOrigem,
          b.anoLetivoAtual,
          b.trimestre ?? 1,
          b.notaAnterior ?? null,
          b.dataExame ?? null,
          b.professorId ?? null,
          b.professorNome ?? null,
          b.observacoes ?? null,
          user.nome ?? user.email,
        ]
      );

      // Marcar aluno como condicional se ainda não estiver
      await query(
        `UPDATE public.alunos
         SET "matriculaCondicional" = true,
             "disciplinasCondicionais" = (
               SELECT jsonb_agg(DISTINCT elem)
               FROM (
                 SELECT elem FROM jsonb_array_elements("disciplinasCondicionais") AS t(elem)
                 UNION ALL
                 SELECT $2::jsonb
               ) sub
             )
         WHERE id = $1`,
        [
          b.alunoId,
          JSON.stringify({
            disciplina: b.disciplina,
            anoLetivoOrigem: b.anoLetivoOrigem,
            turmaIdOrigem: b.turmaIdOrigem,
            notaAnterior: b.notaAnterior ?? null,
          }),
        ]
      );

      res.status(201).json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ─── PUT /api/exames-extraordinarios/:id ─────────────────────────────────
  // Actualiza campos gerais (data, professor, observações)
  app.put("/api/exames-extraordinarios/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.jwtUser!;
      if (!ROLES_GESTAO.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão." });
      }
      const b = req.body as Record<string, unknown>;
      const allowed = ["dataExame", "professorId", "professorNome", "observacoes", "turmaIdAtual", "turmaNomeAtual", "trimestre"] as const;
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const k of allowed) {
        if (b[k] !== undefined) { vals.push(b[k]); sets.push(`"${k}" = $${vals.length}`); }
      }
      if (!sets.length) return res.status(400).json({ error: "Nenhum campo para actualizar." });
      vals.push(req.params.id);
      const rows = await query<Record<string, unknown>>(
        `UPDATE public.exames_extraordinarios SET ${sets.join(",")} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: "Não encontrado." });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ─── POST /api/exames-extraordinarios/:id/registar-resultado ─────────────
  // Lança a nota e actualiza o estado do aluno
  app.post("/api/exames-extraordinarios/:id/registar-resultado", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.jwtUser!;
      if (!ROLES_GESTAO.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão para registar resultado." });
      }
      const b = req.body as Record<string, unknown>;
      const nota = Number(b.nota);
      if (isNaN(nota) || nota < 0 || nota > 20) {
        return res.status(400).json({ error: "Nota inválida. Deve ser entre 0 e 20." });
      }

      // Buscar configuração da escola para nota mínima de aprovação
      const cfgRows = await query<Record<string, unknown>>(
        `SELECT "notaMinimaAprovacao" FROM public.config_geral LIMIT 1`
      );
      const notaMinima = Number(cfgRows[0]?.notaMinimaAprovacao ?? 10);
      const resultado = nota >= notaMinima ? "aprovado" : "reprovado";

      // Actualizar exame
      const examRows = await query<Record<string, unknown>>(
        `UPDATE public.exames_extraordinarios
         SET nota = $1, resultado = $2, status = 'realizado',
             "dataExame" = COALESCE($3, "dataExame"),
             "observacoes" = COALESCE($4, "observacoes")
         WHERE id = $5 RETURNING *`,
        [nota, resultado, b.dataExame ?? null, b.observacoes ?? null, req.params.id]
      );
      if (!examRows[0]) return res.status(404).json({ error: "Exame não encontrado." });
      const exame = examRows[0];

      // Actualizar disciplinasCondicionais do aluno — remover esta disciplina se aprovado
      if (resultado === "aprovado") {
        // Remover disciplina da lista de condicionais
        await query(
          `UPDATE public.alunos
           SET "disciplinasCondicionais" = (
             SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
             FROM jsonb_array_elements("disciplinasCondicionais") AS t(elem)
             WHERE elem->>'disciplina' != $2
                OR elem->>'anoLetivoOrigem' != $3
           )
           WHERE id = $1`,
          [exame.alunoId, exame.disciplina, exame.anoLetivoOrigem]
        );
        // Verificar se ainda há disciplinas condicionais pendentes
        const alunoRows = await query<Record<string, unknown>>(
          `SELECT "disciplinasCondicionais" FROM public.alunos WHERE id = $1`,
          [exame.alunoId]
        );
        const restantes = (alunoRows[0]?.disciplinasCondicionais as unknown[]) ?? [];
        const pendentes = Array.isArray(restantes)
          ? restantes.filter((d: any) => !d.resultado || d.resultado !== "aprovado")
          : [];
        if (pendentes.length === 0) {
          // Levantar a matrícula condicional
          await query(
            `UPDATE public.alunos SET "matriculaCondicional" = false WHERE id = $1`,
            [exame.alunoId]
          );
        }
      }

      // Registar no histórico de situações
      if (resultado === "reprovado") {
        await query(
          `INSERT INTO public.alunos_status_historico
             ("alunoId","situacaoAnterior","situacaoNova","motivo","registadoPor","data")
           VALUES ($1,'activo','activo','Reprovado em Exame Extraordinário — disciplina: ' || $2,$3,NOW()::text)
           ON CONFLICT DO NOTHING`,
          [exame.alunoId, exame.disciplina, user.nome ?? user.email]
        ).catch(() => {});
      }

      res.json({ exame: examRows[0], resultado, notaMinima });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PATCH /api/alunos/:id/marcar-condicional ────────────────────────────
  // Marca ou desmarca um aluno como matrícula condicional
  app.patch("/api/alunos/:id/marcar-condicional", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.jwtUser!;
      if (!ROLES_GESTAO.includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão." });
      }
      const { matriculaCondicional } = req.body as { matriculaCondicional: boolean };
      const rows = await query<Record<string, unknown>>(
        `UPDATE public.alunos SET "matriculaCondicional" = $1 WHERE id = $2 RETURNING id, "matriculaCondicional"`,
        [!!matriculaCondicional, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Aluno não encontrado." });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ─── DELETE /api/exames-extraordinarios/:id ───────────────────────────────
  app.delete("/api/exames-extraordinarios/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.jwtUser!;
      if (!["ceo", "pca", "admin"].includes(user.role)) {
        return res.status(403).json({ error: "Sem permissão para eliminar." });
      }
      const rows = await query<Record<string, unknown>>(
        `DELETE FROM public.exames_extraordinarios WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Não encontrado." });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exames-extraordinarios/estatisticas ─────────────────────────
  app.get("/api/exames-extraordinarios/estatisticas", requireAuth, async (_req: Request, res: Response) => {
    try {
      const [totais, condicionais, porDisciplina, porTrimestre] = await Promise.all([
        query<Record<string, unknown>>(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
            COUNT(*) FILTER (WHERE status = 'realizado') AS realizados,
            COUNT(*) FILTER (WHERE resultado = 'aprovado') AS aprovados,
            COUNT(*) FILTER (WHERE resultado = 'reprovado') AS reprovados,
            COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados
          FROM public.exames_extraordinarios
        `),
        query<Record<string, unknown>>(
          `SELECT COUNT(*) AS total FROM public.alunos WHERE "matriculaCondicional" = true AND ativo = true`
        ),
        query<Record<string, unknown>>(`
          SELECT
            disciplina,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE resultado = 'aprovado') AS aprovados,
            COUNT(*) FILTER (WHERE resultado = 'reprovado') AS reprovados,
            COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes
          FROM public.exames_extraordinarios
          GROUP BY disciplina
          ORDER BY total DESC
          LIMIT 8
        `),
        query<Record<string, unknown>>(`
          SELECT
            trimestre,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE resultado = 'aprovado') AS aprovados,
            COUNT(*) FILTER (WHERE resultado = 'reprovado') AS reprovados
          FROM public.exames_extraordinarios
          GROUP BY trimestre
          ORDER BY trimestre
        `),
      ]);
      res.json({
        ...totais[0],
        alunosCondicionais: condicionais[0]?.total ?? 0,
        porDisciplina,
        porTrimestre,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
