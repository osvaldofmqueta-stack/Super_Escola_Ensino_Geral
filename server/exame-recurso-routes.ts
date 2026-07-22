import type { Express, Request, Response } from "express";
import { requireAuth } from "./auth";
import { query } from "./db";

const ROLES_SECRETARIA = ["ceo","pca","admin","director","pedagogico","chefe_secretaria","secretaria"];

export function registerExameRecursoRoutes(app: Express) {

  async function ensureSchema() {
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "maxNegativosRecurso" integer NOT NULL DEFAULT 3`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "notaMinRecurso" integer NOT NULL DEFAULT 6`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "notaMaxRecurso" integer NOT NULL DEFAULT 9`);
    await query(`ALTER TABLE public.config_geral ADD COLUMN IF NOT EXISTS "restricaoLPMatRecurso" boolean NOT NULL DEFAULT true`);
  }

  ensureSchema().catch(e => console.warn("[exame-recurso] schema init:", e.message));

  // ─── GET /api/exame-recurso/elegibilidade ────────────────────────────────────
  // Devolve alunos elegíveis para exame de recurso por turma e ano lectivo
  app.get("/api/exame-recurso/elegibilidade", requireAuth, async (req: Request, res: Response) => {
    try {
      const { turmaId, anoLetivo, classe } = req.query as Record<string, string>;
      if (!anoLetivo) return res.status(400).json({ error: "anoLetivo obrigatório" });

      // Carregar config
      const cfgRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`);
      const cfg = cfgRows[0] ?? {};
      const maxNeg = Number(cfg.maxNegativosRecurso ?? 3);
      const notaMin = Number(cfg.notaMinRecurso ?? 6);
      const notaMax = Number(cfg.notaMaxRecurso ?? 9);
      const restricaoLPMat = Boolean(cfg.restricaoLPMatRecurso ?? true);

      // Identificar turmas a analisar
      let turmaIds: string[] = [];
      if (turmaId) {
        turmaIds = [turmaId];
      } else {
        const conditions: string[] = [`t."anoLetivo" = $1`];
        const params: any[] = [anoLetivo];
        if (classe) { params.push(classe); conditions.push(`t.classe = $${params.length}`); }
        const turmas = await query<any>(
          `SELECT id FROM public.turmas t WHERE ${conditions.join(" AND ")}`,
          params
        );
        turmaIds = turmas.map((t: any) => t.id);
      }

      if (!turmaIds.length) return res.json([]);

      // Para cada turma, buscar alunos com notas finais negativas no intervalo [notaMin, notaMax]
      const results: any[] = [];

      for (const tid of turmaIds) {
        // Info da turma
        const turmaInfo = await query<any>(
          `SELECT id, nome, classe, turno, "anoLetivo" FROM public.turmas WHERE id = $1`,
          [tid]
        );
        if (!turmaInfo.length) continue;
        const turma = turmaInfo[0];

        // Alunos da turma
        const alunos = await query<any>(
          `SELECT a.id, a.nome, a.apelido, a."numeroMatricula"
           FROM public.alunos a
           WHERE a."turmaId" = $1 AND a.activo = true`,
          [tid]
        );

        for (const aluno of alunos) {
          // Notas finais (nf) por disciplina para este aluno na turma
          const notas = await query<any>(
            `SELECT disciplina, nf, trimestre
             FROM public.notas
             WHERE "alunoId" = $1 AND "turmaId" = $2
             ORDER BY disciplina, trimestre DESC`,
            [aluno.id, tid]
          );

          // Agrupa por disciplina - pega nota final (trimestre 3, ou mais recente)
          const porDisc: Record<string, any> = {};
          for (const n of notas) {
            if (!porDisc[n.disciplina] || n.trimestre > porDisc[n.disciplina].trimestre) {
              porDisc[n.disciplina] = n;
            }
          }

          // Filtra disciplinas com nota negativa no intervalo
          const negativas = Object.values(porDisc).filter((n: any) => {
            const nf = Number(n.nf ?? 0);
            return nf >= notaMin && nf <= notaMax;
          });

          // Verifica limite máximo
          if (negativas.length === 0 || negativas.length > maxNeg) continue;

          // Restrição LP + Mat para 9ª Classe
          if (restricaoLPMat) {
            const classeNum = parseInt(String(turma.classe).replace(/\D/g,''), 10) || 0;
            if (classeNum === 9) {
              const temLP = negativas.some((n: any) =>
                /l[íi]ngua\s+portuguesa|l\.?\s*portuguesa|portugu[eê]s/i.test(n.disciplina)
              );
              const temMat = negativas.some((n: any) =>
                /matem[aá]tica|mat\.?/i.test(n.disciplina)
              );
              if (temLP && temMat) {
                // não elegível por restrição LP+Mat
                results.push({
                  ...aluno,
                  nomeCompleto: `${aluno.nome} ${aluno.apelido}`,
                  turma,
                  disciplinasNegativas: negativas.map((n: any) => ({ disciplina: n.disciplina, nf: n.nf })),
                  elegivel: false,
                  motivoBloqueio: 'Restrição Art. 33º: LP e Matemática negativas simultaneamente',
                });
                continue;
              }
            }
          }

          results.push({
            ...aluno,
            nomeCompleto: `${aluno.nome} ${aluno.apelido}`,
            turma,
            disciplinasNegativas: negativas.map((n: any) => ({ disciplina: n.disciplina, nf: n.nf })),
            elegivel: true,
            motivoBloqueio: null,
          });
        }
      }

      // Ordenar por turma, depois nome
      results.sort((a, b) => {
        const t = (a.turma?.nome ?? '').localeCompare(b.turma?.nome ?? '');
        if (t !== 0) return t;
        return (a.nomeCompleto ?? '').localeCompare(b.nomeCompleto ?? '');
      });

      res.json({ alunos: results, config: { maxNeg, notaMin, notaMax, restricaoLPMat } });
    } catch (e: any) {
      console.error("[exame-recurso] elegibilidade:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exame-recurso/turmas ───────────────────────────────────────────
  app.get("/api/exame-recurso/turmas", requireAuth, async (req: Request, res: Response) => {
    try {
      const { anoLetivo } = req.query as Record<string, string>;
      const params: any[] = [];
      const cond: string[] = [];
      if (anoLetivo) { params.push(anoLetivo); cond.push(`"anoLetivo" = $${params.length}`); }
      const rows = await query<any>(
        `SELECT id, nome, classe, turno, "anoLetivo" FROM public.turmas ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY classe, nome`,
        params
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exame-recurso/config ───────────────────────────────────────────
  app.get("/api/exame-recurso/config", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<any>(`SELECT "maxNegativosRecurso","notaMinRecurso","notaMaxRecurso","restricaoLPMatRecurso" FROM public.config_geral LIMIT 1`);
      res.json(rows[0] ?? { maxNegativosRecurso: 3, notaMinRecurso: 6, notaMaxRecurso: 9, restricaoLPMatRecurso: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PUT /api/exame-recurso/config ───────────────────────────────────────────
  app.put("/api/exame-recurso/config", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) return res.status(403).json({ error: "Sem permissão" });
      const { maxNegativosRecurso, notaMinRecurso, notaMaxRecurso, restricaoLPMatRecurso } = req.body;
      await query(
        `UPDATE public.config_geral SET
          "maxNegativosRecurso" = COALESCE($1, "maxNegativosRecurso"),
          "notaMinRecurso"      = COALESCE($2, "notaMinRecurso"),
          "notaMaxRecurso"      = COALESCE($3, "notaMaxRecurso"),
          "restricaoLPMatRecurso" = COALESCE($4, "restricaoLPMatRecurso")`,
        [
          maxNegativosRecurso != null ? Number(maxNegativosRecurso) : null,
          notaMinRecurso != null ? Number(notaMinRecurso) : null,
          notaMaxRecurso != null ? Number(notaMaxRecurso) : null,
          restricaoLPMatRecurso != null ? Boolean(restricaoLPMatRecurso) : null,
        ]
      );
      const updated = await query<any>(`SELECT "maxNegativosRecurso","notaMinRecurso","notaMaxRecurso","restricaoLPMatRecurso" FROM public.config_geral LIMIT 1`);
      res.json(updated[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET /api/exame-recurso/lista-html ───────────────────────────────────────
  // Gera lista HTML para impressão: alunos com exame de recurso por turma/classe
  app.get("/api/exame-recurso/lista-html", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!ROLES_SECRETARIA.includes(user.role)) return res.status(403).json({ error: "Sem permissão" });

      const { anoLetivo, turmaId, classe } = req.query as Record<string, string>;
      if (!anoLetivo) return res.status(400).json({ error: "anoLetivo obrigatório" });

      const cfgRows = await query<any>(`SELECT * FROM public.config_geral LIMIT 1`);
      const cfg = cfgRows[0] ?? {};
      const maxNeg = Number(cfg.maxNegativosRecurso ?? 3);
      const notaMin = Number(cfg.notaMinRecurso ?? 6);
      const notaMax = Number(cfg.notaMaxRecurso ?? 9);
      const restricaoLPMat = Boolean(cfg.restricaoLPMatRecurso ?? true);
      const escolaNome = cfg.nome || 'Super Escola';
      const directorGeral = cfg.directorGeral || '';

      // Filtrar turmas
      let turmaIds: string[] = [];
      if (turmaId) {
        turmaIds = [turmaId];
      } else {
        const conditions: string[] = [`t."anoLetivo" = $1`];
        const params: any[] = [anoLetivo];
        if (classe) { params.push(classe); conditions.push(`t.classe = $${params.length}`); }
        const turmas = await query<any>(`SELECT id FROM public.turmas t WHERE ${conditions.join(' AND ')}`, params);
        turmaIds = turmas.map((t: any) => t.id);
      }

      const alunos: any[] = [];
      for (const tid of turmaIds) {
        const turmaInfo = await query<any>(`SELECT id, nome, classe, turno, "anoLetivo" FROM public.turmas WHERE id = $1`, [tid]);
        if (!turmaInfo.length) continue;
        const turma = turmaInfo[0];
        const alunosList = await query<any>(
          `SELECT a.id, a.nome, a.apelido, a."numeroMatricula" FROM public.alunos a WHERE a."turmaId" = $1 AND a.activo = true`,
          [tid]
        );
        for (const aluno of alunosList) {
          const notas = await query<any>(
            `SELECT disciplina, nf, trimestre FROM public.notas WHERE "alunoId" = $1 AND "turmaId" = $2 ORDER BY disciplina, trimestre DESC`,
            [aluno.id, tid]
          );
          const porDisc: Record<string, any> = {};
          for (const n of notas) {
            if (!porDisc[n.disciplina] || n.trimestre > porDisc[n.disciplina].trimestre) porDisc[n.disciplina] = n;
          }
          const negativas = Object.values(porDisc).filter((n: any) => {
            const nf = Number(n.nf ?? 0); return nf >= notaMin && nf <= notaMax;
          });
          if (negativas.length === 0 || negativas.length > maxNeg) continue;
          let elegivel = true;
          let motivoBloqueio = '';
          if (restricaoLPMat) {
            const classeNum = parseInt(String(turma.classe).replace(/\D/g,''), 10) || 0;
            if (classeNum === 9) {
              const temLP = negativas.some((n: any) => /l[íi]ngua\s+portuguesa|l\.?\s*portuguesa|portugu[eê]s/i.test(n.disciplina));
              const temMat = negativas.some((n: any) => /matem[aá]tica|mat\.?/i.test(n.disciplina));
              if (temLP && temMat) { elegivel = false; motivoBloqueio = 'Restrição Art. 33º: LP + Mat'; }
            }
          }
          alunos.push({ ...aluno, nomeCompleto: `${aluno.nome} ${aluno.apelido}`, turma, negativas, elegivel, motivoBloqueio });
        }
      }

      alunos.sort((a, b) => {
        const t = (a.turma?.nome ?? '').localeCompare(b.turma?.nome ?? '');
        return t !== 0 ? t : (a.nomeCompleto ?? '').localeCompare(b.nomeCompleto ?? '');
      });

      const elegiveis = alunos.filter(a => a.elegivel);
      const bloqueados = alunos.filter(a => !a.elegivel);

      // Agrupar por turma
      const porTurma: Record<string, any[]> = {};
      for (const a of elegiveis) {
        const key = `${a.turma.nome} (${a.turma.classe} — ${a.turma.turno})`;
        if (!porTurma[key]) porTurma[key] = [];
        porTurma[key].push(a);
      }

      const hoje = new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });

      let rows = '';
      let n = 0;
      for (const [turmaNome, lista] of Object.entries(porTurma)) {
        rows += `<tr><td colspan="4" style="background:#e8f4fd;font-weight:700;padding:8px 10px;font-size:13px;border-top:2px solid #1e40af;">📚 ${turmaNome}</td></tr>`;
        for (const a of lista) {
          n++;
          const discs = a.negativas.map((d: any) => `${d.disciplina} (${d.nf} val.)`).join(', ');
          rows += `<tr>
            <td style="padding:7px 10px;text-align:center;">${n}</td>
            <td style="padding:7px 10px;">${a.nomeCompleto}</td>
            <td style="padding:7px 10px;text-align:center;">${a.numeroMatricula}</td>
            <td style="padding:7px 10px;font-size:12px;color:#b45309;">${discs}</td>
          </tr>`;
        }
      }

      let bloqRows = '';
      for (const a of bloqueados) {
        const discs = a.negativas.map((d: any) => `${d.disciplina} (${d.nf} val.)`).join(', ');
        bloqRows += `<tr>
          <td style="padding:7px 10px;">${a.nomeCompleto}</td>
          <td style="padding:7px 10px;text-align:center;">${a.numeroMatricula}</td>
          <td style="padding:7px 10px;font-size:12px;color:#991b1b;">${discs}</td>
          <td style="padding:7px 10px;font-size:11px;color:#7f1d1d;">${a.motivoBloqueio}</td>
        </tr>`;
      }

      const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Lista Exame de Recurso — ${escolaNome}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1a1a1a;font-size:13px;}
  h1{font-size:17px;margin:0 0 2px;} h2{font-size:14px;margin:0 0 12px;color:#1e40af;}
  .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #1e40af;padding-bottom:12px;}
  .meta{font-size:11px;color:#555;margin-top:6px;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;}
  th{background:#1e40af;color:#fff;padding:8px 10px;text-align:left;font-size:12px;}
  tr:nth-child(even){background:#f8fafc;}
  td{border-bottom:1px solid #e2e8f0;}
  .section-title{font-size:14px;font-weight:700;color:#1e40af;margin:18px 0 8px;border-left:4px solid #1e40af;padding-left:8px;}
  .info-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;}
  .footer{margin-top:30px;border-top:1px solid #ccc;padding-top:14px;display:flex;justify-content:space-between;}
  .assinatura{text-align:center;} .assinatura .linha{border-top:1px solid #333;width:200px;margin:40px auto 4px;}
  @media print{body{margin:0;padding:10px;}}
</style></head><body>
<div class="header">
  <h1>${escolaNome}</h1>
  <h2>Lista de Alunos — Exame de Recurso (Art. 33º — Decreto 04/2026)</h2>
  <div class="meta">Ano Lectivo: <b>${anoLetivo}</b>${classe ? ` &nbsp;·&nbsp; Classe: <b>${classe}</b>` : ''} &nbsp;·&nbsp; Emitido em: <b>${hoje}</b></div>
</div>
<div class="info-box">
  Critério: até <b>${maxNeg}</b> negativa(s) no intervalo <b>${notaMin}–${notaMax}</b> valores.
  ${restricaoLPMat ? ' Para a 9ª Classe: LP e Matemática não podem ser negativas simultaneamente (Art. 33º §2).' : ''}
  &nbsp;Total elegíveis: <b>${elegiveis.length}</b> &nbsp;·&nbsp; Bloqueados: <b>${bloqueados.length}</b>
</div>

<div class="section-title">Alunos Elegíveis para Exame de Recurso</div>
${elegiveis.length > 0 ? `
<table>
  <thead><tr>
    <th style="width:40px;text-align:center;">Nº</th>
    <th>Nome Completo</th>
    <th style="width:100px;text-align:center;">Matrícula</th>
    <th>Disciplinas Negativas</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>` : '<p style="color:#555;font-style:italic;">Nenhum aluno elegível encontrado.</p>'}

${bloqueados.length > 0 ? `
<div class="section-title" style="color:#b91c1c;border-color:#b91c1c;">Alunos Excluídos (Restrição Art. 33º)</div>
<table>
  <thead><tr>
    <th>Nome Completo</th><th style="width:100px;text-align:center;">Matrícula</th><th>Disciplinas</th><th>Motivo</th>
  </tr></thead>
  <tbody>${bloqRows}</tbody>
</table>` : ''}

<div class="footer">
  <div class="assinatura">
    <div class="linha"></div>
    <div>Director(a) Pedagógico(a)</div>
  </div>
  <div class="assinatura">
    <div class="linha"></div>
    <div>${directorGeral ? `Director(a) Geral — ${directorGeral}` : 'Director(a) Geral'}</div>
  </div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e: any) {
      console.error("[exame-recurso] lista-html:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
