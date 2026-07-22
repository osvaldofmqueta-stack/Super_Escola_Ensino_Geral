import type { Express, Request, Response } from "express";
import { requireAuth, requirePermission } from "./auth";
import { query } from "./db";

const ROLES_CONSELHO = ["ceo", "pca", "admin", "director", "pedagogico",
  "membro_conselho_pedagogico", "membro_conselho_escola"];

function isConselhoRole(role: string) {
  return ROLES_CONSELHO.includes(role);
}

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS conselho_membros (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      "tipoConselho" TEXT NOT NULL,
      "utilizadorId" VARCHAR NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      cargo TEXT NOT NULL,
      "mandatoInicio" TEXT NOT NULL,
      "mandatoFim" TEXT,
      ativo BOOLEAN NOT NULL DEFAULT true,
      observacoes TEXT,
      "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conselho_reunioes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      "tipoConselho" TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      "dataReuniao" TEXT NOT NULL,
      "horaInicio" TEXT,
      "horaFim" TEXT,
      local TEXT,
      status TEXT NOT NULL DEFAULT 'agendada',
      agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
      ata TEXT,
      "convocatoriaEmitida" BOOLEAN NOT NULL DEFAULT false,
      presentes JSONB NOT NULL DEFAULT '[]'::jsonb,
      "criadoPor" VARCHAR NOT NULL,
      "anoLetivo" TEXT NOT NULL,
      "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conselho_deliberacoes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      "reuniaoId" VARCHAR REFERENCES conselho_reunioes(id) ON DELETE SET NULL,
      "tipoConselho" TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'deliberacao',
      status TEXT NOT NULL DEFAULT 'pendente',
      "votosFavor" INTEGER NOT NULL DEFAULT 0,
      "votosContra" INTEGER NOT NULL DEFAULT 0,
      "votosAbstencao" INTEGER NOT NULL DEFAULT 0,
      votos JSONB NOT NULL DEFAULT '[]'::jsonb,
      "dataDeliberacao" TEXT NOT NULL,
      "prazoImplementacao" TEXT,
      "responsavelImplementacao" TEXT,
      resultado TEXT,
      "criadoPor" VARCHAR NOT NULL,
      "anoLetivo" TEXT NOT NULL,
      "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conselho_validacoes_pauta (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      "pautaId" VARCHAR REFERENCES pautas(id) ON DELETE CASCADE,
      "turmaId" VARCHAR REFERENCES turmas(id),
      disciplina TEXT,
      trimestre INTEGER,
      "anoLetivo" TEXT NOT NULL,
      "tipoValidacao" TEXT NOT NULL DEFAULT 'pauta_final',
      status TEXT NOT NULL DEFAULT 'pendente',
      "solicitadoPor" VARCHAR NOT NULL,
      "solicitadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      justificativa TEXT,
      "parecerConselho" TEXT,
      "validadoPor" VARCHAR,
      "validadoEm" TIMESTAMPTZ,
      "votosAprovacao" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "reuniaoId" VARCHAR REFERENCES conselho_reunioes(id) ON DELETE SET NULL,
      "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export function registerConselhoRoutes(app: Express) {
  // Ensure tables exist on startup
  ensureTables().catch(e => console.warn("[conselho] Tabelas:", e?.message));

  // ─── STATS / DASHBOARD ───────────────────────────────────────────────────
  app.get("/api/conselho/stats", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { role, userId } = req.jwtUser!;
      const tipo = (role === "membro_conselho_escola") ? "escola" : null;

      const [totalMembros, totalReunioes, reunioesPendentes, deliberacoesPendentes, validacoesPendentes] = await Promise.all([
        query<{ count: string }>(`SELECT COUNT(*) as count FROM conselho_membros WHERE ativo=true ${tipo ? `AND "tipoConselho"=$1` : ""}`, tipo ? [tipo] : []),
        query<{ count: string }>(`SELECT COUNT(*) as count FROM conselho_reunioes ${tipo ? `WHERE "tipoConselho"=$1` : ""}`, tipo ? [tipo] : []),
        query<{ count: string }>(`SELECT COUNT(*) as count FROM conselho_reunioes WHERE status='agendada' ${tipo ? `AND "tipoConselho"=$1` : ""}`, tipo ? [tipo] : []),
        query<{ count: string }>(`SELECT COUNT(*) as count FROM conselho_deliberacoes WHERE status='pendente' ${tipo ? `AND "tipoConselho"=$1` : ""}`, tipo ? [tipo] : []),
        query<{ count: string }>(`SELECT COUNT(*) as count FROM conselho_validacoes_pauta WHERE status='pendente'`),
      ]);

      res.json({
        membros: parseInt(totalMembros[0]?.count ?? "0"),
        reunioes: parseInt(totalReunioes[0]?.count ?? "0"),
        reunioesPendentes: parseInt(reunioesPendentes[0]?.count ?? "0"),
        deliberacoesPendentes: parseInt(deliberacoesPendentes[0]?.count ?? "0"),
        validacoesPendentes: parseInt(validacoesPendentes[0]?.count ?? "0"),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── MEMBROS ──────────────────────────────────────────────────────────────
  app.get("/api/conselho/membros", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipo } = req.query as { tipo?: string };
      const rows = await query<any>(`
        SELECT cm.*, u.nome, u.email, u.role, u.avatar
        FROM conselho_membros cm
        JOIN utilizadores u ON u.id = cm."utilizadorId"
        WHERE cm.ativo = true
        ${tipo ? `AND cm."tipoConselho" = $1` : ""}
        ORDER BY cm.cargo, u.nome
      `, tipo ? [tipo] : []);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/conselho/membros", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipoConselho, utilizadorId, cargo, mandatoInicio, mandatoFim, observacoes } = req.body;
      if (!tipoConselho || !utilizadorId || !cargo || !mandatoInicio) {
        return res.status(400).json({ error: "Campos obrigatórios em falta." });
      }
      const [row] = await query<any>(`
        INSERT INTO conselho_membros ("tipoConselho","utilizadorId",cargo,"mandatoInicio","mandatoFim",observacoes)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [tipoConselho, utilizadorId, cargo, mandatoInicio, mandatoFim || null, observacoes || null]);
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/conselho/membros/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { cargo, mandatoFim, ativo, observacoes } = req.body;
      const [row] = await query<any>(`
        UPDATE conselho_membros SET
          cargo = COALESCE($1, cargo),
          "mandatoFim" = COALESCE($2, "mandatoFim"),
          ativo = COALESCE($3, ativo),
          observacoes = COALESCE($4, observacoes),
          "atualizadoEm" = NOW()
        WHERE id = $5 RETURNING *
      `, [cargo || null, mandatoFim || null, ativo ?? null, observacoes ?? null, id]);
      if (!row) return res.status(404).json({ error: "Membro não encontrado." });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/conselho/membros/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      await query(`UPDATE conselho_membros SET ativo=false, "atualizadoEm"=NOW() WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── REUNIÕES ─────────────────────────────────────────────────────────────
  app.get("/api/conselho/reunioes", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipo, anoLetivo } = req.query as { tipo?: string; anoLetivo?: string };
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (tipo) { params.push(tipo); where += ` AND r."tipoConselho"=$${params.length}`; }
      if (anoLetivo) { params.push(anoLetivo); where += ` AND r."anoLetivo"=$${params.length}`; }

      const rows = await query<any>(`
        SELECT r.*, u.nome as "criadoPorNome"
        FROM conselho_reunioes r
        LEFT JOIN utilizadores u ON u.id = r."criadoPor"
        ${where}
        ORDER BY r."dataReuniao" DESC
      `, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/conselho/reunioes", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipoConselho, titulo, descricao, dataReuniao, horaInicio, horaFim, local, agenda, anoLetivo } = req.body;
      if (!tipoConselho || !titulo || !dataReuniao || !anoLetivo) {
        return res.status(400).json({ error: "Campos obrigatórios em falta." });
      }
      const [row] = await query<any>(`
        INSERT INTO conselho_reunioes
          ("tipoConselho",titulo,descricao,"dataReuniao","horaInicio","horaFim",local,agenda,"criadoPor","anoLetivo")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `, [tipoConselho, titulo, descricao || null, dataReuniao, horaInicio || null, horaFim || null,
          local || null, JSON.stringify(agenda || []), req.jwtUser!.userId, anoLetivo]);
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/conselho/reunioes/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, ata, agenda, horaFim, presentes, convocatoriaEmitida } = req.body;
      const [row] = await query<any>(`
        UPDATE conselho_reunioes SET
          status = COALESCE($1, status),
          ata = COALESCE($2, ata),
          agenda = CASE WHEN $3::text IS NOT NULL THEN $3::jsonb ELSE agenda END,
          "horaFim" = COALESCE($4, "horaFim"),
          presentes = CASE WHEN $5::text IS NOT NULL THEN $5::jsonb ELSE presentes END,
          "convocatoriaEmitida" = COALESCE($6, "convocatoriaEmitida"),
          "atualizadoEm" = NOW()
        WHERE id = $7 RETURNING *
      `, [status || null, ata || null,
          agenda !== undefined ? JSON.stringify(agenda) : null,
          horaFim || null,
          presentes !== undefined ? JSON.stringify(presentes) : null,
          convocatoriaEmitida ?? null, id]);
      if (!row) return res.status(404).json({ error: "Reunião não encontrada." });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/conselho/reunioes/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      await query(`UPDATE conselho_reunioes SET status='cancelada', "atualizadoEm"=NOW() WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── DELIBERAÇÕES ─────────────────────────────────────────────────────────
  app.get("/api/conselho/deliberacoes", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipo, anoLetivo, status } = req.query as Record<string, string>;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (tipo) { params.push(tipo); where += ` AND d."tipoConselho"=$${params.length}`; }
      if (anoLetivo) { params.push(anoLetivo); where += ` AND d."anoLetivo"=$${params.length}`; }
      if (status) { params.push(status); where += ` AND d.status=$${params.length}`; }

      const rows = await query<any>(`
        SELECT d.*, u.nome as "criadoPorNome", r.titulo as "reuniaoTitulo"
        FROM conselho_deliberacoes d
        LEFT JOIN utilizadores u ON u.id = d."criadoPor"
        LEFT JOIN conselho_reunioes r ON r.id = d."reuniaoId"
        ${where}
        ORDER BY d."dataDeliberacao" DESC
      `, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/conselho/deliberacoes", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { tipoConselho, titulo, descricao, tipo, dataDeliberacao, reuniaoId, prazoImplementacao, responsavelImplementacao, anoLetivo } = req.body;
      if (!tipoConselho || !titulo || !descricao || !dataDeliberacao || !anoLetivo) {
        return res.status(400).json({ error: "Campos obrigatórios em falta." });
      }
      const [row] = await query<any>(`
        INSERT INTO conselho_deliberacoes
          ("tipoConselho",titulo,descricao,tipo,"dataDeliberacao","reuniaoId","prazoImplementacao","responsavelImplementacao","criadoPor","anoLetivo")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `, [tipoConselho, titulo, descricao, tipo || "deliberacao", dataDeliberacao,
          reuniaoId || null, prazoImplementacao || null, responsavelImplementacao || null,
          req.jwtUser!.userId, anoLetivo]);
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Votar numa deliberação
  app.post("/api/conselho/deliberacoes/:id/votar", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { voto, justificacao } = req.body; // voto: 'favor' | 'contra' | 'abstencao'
      if (!["favor", "contra", "abstencao"].includes(voto)) {
        return res.status(400).json({ error: "Voto inválido. Use 'favor', 'contra' ou 'abstencao'." });
      }
      const userId = req.jwtUser!.userId;

      const [delib] = await query<any>(`SELECT * FROM conselho_deliberacoes WHERE id=$1`, [id]);
      if (!delib) return res.status(404).json({ error: "Deliberação não encontrada." });

      const votos: any[] = Array.isArray(delib.votos) ? delib.votos : [];
      const existing = votos.findIndex((v: any) => v.utilizadorId === userId);
      const novoVoto = { utilizadorId: userId, voto, justificacao: justificacao || null, votadoEm: new Date().toISOString() };

      if (existing >= 0) votos[existing] = novoVoto;
      else votos.push(novoVoto);

      const favor = votos.filter((v: any) => v.voto === "favor").length;
      const contra = votos.filter((v: any) => v.voto === "contra").length;
      const abstencao = votos.filter((v: any) => v.voto === "abstencao").length;

      const [row] = await query<any>(`
        UPDATE conselho_deliberacoes SET
          votos = $1::jsonb,
          "votosFavor" = $2,
          "votosContra" = $3,
          "votosAbstencao" = $4,
          "atualizadoEm" = NOW()
        WHERE id = $5 RETURNING *
      `, [JSON.stringify(votos), favor, contra, abstencao, id]);
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Fechar deliberação (aprovar/rejeitar)
  app.patch("/api/conselho/deliberacoes/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, resultado, prazoImplementacao, responsavelImplementacao } = req.body;
      const [row] = await query<any>(`
        UPDATE conselho_deliberacoes SET
          status = COALESCE($1, status),
          resultado = COALESCE($2, resultado),
          "prazoImplementacao" = COALESCE($3, "prazoImplementacao"),
          "responsavelImplementacao" = COALESCE($4, "responsavelImplementacao"),
          "atualizadoEm" = NOW()
        WHERE id = $5 RETURNING *
      `, [status || null, resultado || null, prazoImplementacao || null, responsavelImplementacao || null, id]);
      if (!row) return res.status(404).json({ error: "Deliberação não encontrada." });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── VALIDAÇÕES DE PAUTA ──────────────────────────────────────────────────
  app.get("/api/conselho/validacoes", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { status, anoLetivo } = req.query as Record<string, string>;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (status) { params.push(status); where += ` AND v.status=$${params.length}`; }
      if (anoLetivo) { params.push(anoLetivo); where += ` AND v."anoLetivo"=$${params.length}`; }

      const rows = await query<any>(`
        SELECT v.*,
          us.nome as "solicitadoPorNome",
          uv.nome as "validadoPorNome",
          t.nome as "turmaNome",
          t.classe as "turmaClasse"
        FROM conselho_validacoes_pauta v
        LEFT JOIN utilizadores us ON us.id = v."solicitadoPor"
        LEFT JOIN utilizadores uv ON uv.id = v."validadoPor"
        LEFT JOIN turmas t ON t.id = v."turmaId"
        ${where}
        ORDER BY v."criadoEm" DESC
      `, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/conselho/validacoes", requireAuth, async (req: Request, res: Response) => {
    try {
      const { pautaId, turmaId, disciplina, trimestre, anoLetivo, tipoValidacao, justificativa } = req.body;
      if (!anoLetivo) return res.status(400).json({ error: "anoLetivo obrigatório." });
      const [row] = await query<any>(`
        INSERT INTO conselho_validacoes_pauta
          ("pautaId","turmaId",disciplina,trimestre,"anoLetivo","tipoValidacao","solicitadoPor",justificativa)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
      `, [pautaId || null, turmaId || null, disciplina || null, trimestre || null,
          anoLetivo, tipoValidacao || "pauta_final", req.jwtUser!.userId, justificativa || null]);
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/conselho/validacoes/:id", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, parecerConselho, reuniaoId } = req.body;
      const userId = req.jwtUser!.userId;

      const validadoEm = status && status !== "pendente" && status !== "em_revisao" ? "NOW()" : null;

      const [row] = await query<any>(`
        UPDATE conselho_validacoes_pauta SET
          status = COALESCE($1, status),
          "parecerConselho" = COALESCE($2, "parecerConselho"),
          "reuniaoId" = COALESCE($3, "reuniaoId"),
          "validadoPor" = CASE WHEN $1 IN ('aprovada','rejeitada','devolvida') THEN $4 ELSE "validadoPor" END,
          "validadoEm" = CASE WHEN $1 IN ('aprovada','rejeitada','devolvida') THEN NOW() ELSE "validadoEm" END,
          "atualizadoEm" = NOW()
        WHERE id = $5 RETURNING *
      `, [status || null, parecerConselho || null, reuniaoId || null, userId, id]);
      if (!row) return res.status(404).json({ error: "Validação não encontrada." });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── UTILIZADORES DISPONÍVEIS PARA CONSELHO ───────────────────────────────
  app.get("/api/conselho/utilizadores-disponiveis", requireAuth, requirePermission("conselho_pedagogico"), async (req: Request, res: Response) => {
    try {
      const rows = await query<any>(`
        SELECT id, nome, email, role, avatar
        FROM utilizadores
        WHERE ativo = true
          AND role NOT IN ('aluno','encarregado')
        ORDER BY nome
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
