/**
 * Integração com o Ministério da Educação de Angola (MED / SIGE Gov)
 * Gera exportações nos formatos CSV, XML e JSON compatíveis com o SIGE Gov.
 *
 * Relatórios suportados:
 *  - Mapa de Matrículas   (/api/med/export/matriculas)
 *  - Mapa de Professores  (/api/med/export/professores)
 *  - Mapa de Resultados   (/api/med/export/resultados)
 *  - Mapa de Frequências  (/api/med/export/frequencias)
 *  - Relatório Consolidado(/api/med/export/consolidado)
 */

import type { Express, Request, Response } from "express";
import { query } from "./db";
import { requireAuth } from "./auth";
import { logAudit } from "./audit";

type JsonObject = Record<string, unknown>;

function isoNow() { return new Date().toISOString(); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
}

function toXML(rootTag: string, itemTag: string, items: JsonObject[]): string {
  const xmlValue = (v: unknown) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const item2xml = (obj: JsonObject) =>
    `  <${itemTag}>\n` +
    Object.entries(obj).map(([k,v]) => `    <${k}>${xmlValue(v)}</${k}>`).join('\n') +
    `\n  </${itemTag}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag} geradoEm="${isoNow()}">\n${items.map(item2xml).join('\n')}\n</${rootTag}>`;
}

function sendExport(
  res: Response,
  formato: string,
  filename: string,
  headers: string[],
  rows: (string|number|null|undefined)[][],
  xmlRoot: string,
  xmlItem: string,
  jsonData: JsonObject[],
) {
  if (formato === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send('\uFEFF' + toCSV(headers, rows)); // BOM for Excel
  }
  if (formato === 'xml') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xml"`);
    return res.send(toXML(xmlRoot, xmlItem, jsonData));
  }
  // default: json
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.json({ exportadoEm: isoNow(), total: jsonData.length, dados: jsonData });
}

// ─── School config helper ─────────────────────────────────────────────────────

async function getConfig(): Promise<JsonObject> {
  const rows = await query<JsonObject>(`SELECT * FROM public.config_geral LIMIT 1`);
  return rows[0] ?? {};
}

// ─── MED Role guard ──────────────────────────────────────────────────────────

const ALLOWED = ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria'];

function medGuard(req: Request, res: Response): boolean {
  if (!ALLOWED.includes(req.jwtUser?.role ?? '')) {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores podem exportar dados MED.' });
    return false;
  }
  return true;
}

// ─── Register routes ─────────────────────────────────────────────────────────

export function registerMEDRoutes(app: Express) {

  // GET /api/med/config — read MED-specific config
  app.get('/api/med/config', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const cfg = await getConfig();
      res.json({
        codigoMED: cfg.codigoMED ?? '',
        nifEscola: cfg.nifEscola ?? '',
        nomeEscola: cfg.nomeEscola ?? '',
        provinciaEscola: cfg.provinciaEscola ?? '',
        municipioEscola: cfg.municipioEscola ?? '',
        tipoEnsino: cfg.tipoEnsino ?? 'Secundário',
        modalidade: cfg.modalidade ?? 'Presencial',
        directorGeral: cfg.directorGeral ?? '',
        directorPedagogico: cfg.directorPedagogico ?? '',
        directorProvincialEducacao: cfg.directorProvincialEducacao ?? '',
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // PATCH /api/med/config — update MED-specific config fields
  app.patch('/api/med/config', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const allowed = ['codigoMED','nifEscola','nomeEscola','provinciaEscola','municipioEscola',
                       'tipoEnsino','modalidade','directorGeral','directorPedagogico','directorProvincialEducacao'] as const;
      const body = req.body as JsonObject;
      const sets: string[] = [];
      const vals: unknown[] = [];
      allowed.forEach(k => {
        if (body[k] !== undefined) { sets.push(`"${k}"=$${sets.length+1}`); vals.push(body[k]); }
      });
      // Validate nifEscola format if provided
      if (body['nifEscola'] !== undefined) {
        const nif = String(body['nifEscola']).trim();
        if (nif !== '' && !/^\d{9}$/.test(nif)) {
          return res.status(400).json({ error: 'O NIF da escola deve ter exactamente 9 dígitos numéricos (ex: 500123456).' });
        }
      }

      if (!sets.length) return res.status(400).json({ error: 'Sem campos para actualizar.' });
      const existing = await query<JsonObject>(`SELECT id FROM public.config_geral LIMIT 1`);
      let row: JsonObject;
      if (existing[0]) {
        vals.push(existing[0].id);
        const r = await query<JsonObject>(`UPDATE public.config_geral SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
        row = r[0];
      } else {
        const r = await query<JsonObject>(`INSERT INTO public.config_geral DEFAULT VALUES RETURNING id`);
        vals.push(r[0].id);
        const r2 = await query<JsonObject>(`UPDATE public.config_geral SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
        row = r2[0];
      }
      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'atualizar', modulo: 'Integração MED', descricao: 'Configurações MED actualizadas',
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});
      res.json(row);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: Matrículas ───────────────────────────────────────────────────
  app.get('/api/med/export/matriculas', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const { anoLetivo, formato = 'csv' } = req.query as Record<string, string>;
      const cfg = await getConfig();

      let sql = `
        SELECT a.id, a."numeroMatricula", a.nome, a.apelido, a."dataNascimento", a.genero,
               a.provincia, a.municipio, a."nomeEncarregado", a."telefoneEncarregado",
               t.nome AS turma, t.classe, t.turno, t."anoLetivo", t.nivel,
               c.nome AS curso
        FROM public.alunos a
        JOIN public.turmas t ON t.id = a."turmaId"
        LEFT JOIN public.cursos c ON c.id = a."cursoId"
        WHERE a.ativo = true`;
      const params: unknown[] = [];
      if (anoLetivo) { sql += ` AND t."anoLetivo" = $1`; params.push(anoLetivo); }
      sql += ` ORDER BY t.classe, t.nome, a.apelido, a.nome`;

      const rows = await query<JsonObject>(sql, params);

      const headers = ['Nº Matrícula','Nome','Apelido','Data Nascimento','Género','Província Origem',
                       'Município Origem','Turma','Classe','Turno','Nível','Curso','Ano Lectivo',
                       'Nome Encarregado','Telefone Encarregado'];
      const csvRows = rows.map(r => [
        r.numeroMatricula, r.nome, r.apelido, r.dataNascimento, r.genero,
        r.provincia, r.municipio, r.turma, r.classe, r.turno, r.nivel,
        r.curso ?? 'N/A', r.anoLetivo, r.nomeEncarregado, r.telefoneEncarregado,
      ]);

      const jsonData = rows.map(r => ({
        codigoEscola: cfg.codigoMED ?? '',
        nomeEscola: cfg.nomeEscola ?? '',
        anoLetivo: r.anoLetivo,
        numeroMatricula: r.numeroMatricula,
        nome: r.nome,
        apelido: r.apelido,
        dataNascimento: r.dataNascimento,
        genero: r.genero,
        provinciaOrigem: r.provincia,
        municipioOrigem: r.municipio,
        turma: r.turma,
        classe: r.classe,
        turno: r.turno,
        nivel: r.nivel,
        curso: r.curso ?? '',
        encarregado: r.nomeEncarregado,
        telefoneEncarregado: r.telefoneEncarregado,
      }));

      const fname = `MED_Matriculas_${anoLetivo ?? 'todos'}_${new Date().toISOString().slice(0,10)}`;
      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação de matrículas (${rows.length} registos, ${formato.toUpperCase()})`,
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});

      sendExport(res, formato, fname, headers, csvRows as any, 'MapaMatriculas', 'Aluno', jsonData as JsonObject[]);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: Professores ─────────────────────────────────────────────────
  app.get('/api/med/export/professores', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const { formato = 'csv' } = req.query as Record<string, string>;
      const cfg = await getConfig();

      const rows = await query<JsonObject>(`
        SELECT "numeroProfessor", nome, apelido, email, telefone, habilitacoes,
               cargo, categoria, disciplinas, "tipoContrato", "dataContratacao"
        FROM public.professores WHERE ativo = true
        ORDER BY apelido, nome
      `);

      const headers = ['Nº Professor','Nome','Apelido','Email','Telefone','Habilitações',
                       'Cargo','Categoria','Disciplinas','Tipo Contrato','Data Contratação'];
      const csvRows = rows.map(r => [
        r.numeroProfessor, r.nome, r.apelido, r.email, r.telefone, r.habilitacoes,
        r.cargo ?? '', r.categoria ?? '',
        Array.isArray(r.disciplinas) ? (r.disciplinas as string[]).join('; ') : String(r.disciplinas ?? ''),
        r.tipoContrato ?? '', r.dataContratacao ?? '',
      ]);

      const jsonData = rows.map(r => ({
        codigoEscola: cfg.codigoMED ?? '',
        numeroProfessor: r.numeroProfessor,
        nome: r.nome,
        apelido: r.apelido,
        email: r.email,
        telefone: r.telefone,
        habilitacoes: r.habilitacoes,
        cargo: r.cargo ?? '',
        categoria: r.categoria ?? '',
        disciplinas: Array.isArray(r.disciplinas) ? (r.disciplinas as string[]).join('; ') : String(r.disciplinas ?? ''),
        tipoContrato: r.tipoContrato ?? '',
        dataContratacao: r.dataContratacao ?? '',
      }));

      const fname = `MED_Professores_${new Date().toISOString().slice(0,10)}`;
      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação de professores (${rows.length} registos, ${formato.toUpperCase()})`,
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});

      sendExport(res, formato, fname, headers, csvRows as any, 'MapaProfessores', 'Professor', jsonData as JsonObject[]);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: Resultados Académicos ───────────────────────────────────────
  app.get('/api/med/export/resultados', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const { anoLetivo, trimestre, formato = 'csv' } = req.query as Record<string, string>;
      const cfg = await getConfig();

      let sql = `
        SELECT n.id, a."numeroMatricula", a.nome || ' ' || a.apelido AS aluno, a.genero,
               t.nome AS turma, t.classe, t."anoLetivo", n.disciplina, n.trimestre,
               n.mac1, n.pp1, n.ppt, n.mt1, n.nf,
               CASE WHEN n.nf >= ${cfg.notaMinimaAprovacao ?? 10} THEN 'Aprovado' ELSE 'Reprovado' END AS situacao
        FROM public.notas n
        JOIN public.alunos a ON a.id = n."alunoId"
        JOIN public.turmas t ON t.id = n."turmaId"
        WHERE 1=1`;
      const params: unknown[] = [];
      if (anoLetivo) { sql += ` AND t."anoLetivo"=$${params.length+1}`; params.push(anoLetivo); }
      if (trimestre) { sql += ` AND n.trimestre=$${params.length+1}`; params.push(parseInt(trimestre)); }
      sql += ` ORDER BY t.classe, t.nome, a.apelido, n.disciplina`;

      const rows = await query<JsonObject>(sql, params);

      const headers = ['Nº Matrícula','Aluno','Género','Turma','Classe','Ano Lectivo',
                       'Disciplina','Trimestre','MAC','PP','PT','MT','Nota Final','Situação'];
      const csvRows = rows.map(r => [
        r.numeroMatricula, r.aluno, r.genero, r.turma, r.classe, r.anoLetivo,
        r.disciplina, r.trimestre, r.mac1, r.pp1, r.ppt, r.mt1, r.nf, r.situacao,
      ]);

      const jsonData = rows.map(r => ({
        codigoEscola: cfg.codigoMED ?? '',
        nomeEscola: cfg.nomeEscola ?? '',
        anoLetivo: r.anoLetivo,
        numeroMatricula: r.numeroMatricula,
        aluno: r.aluno,
        genero: r.genero,
        turma: r.turma,
        classe: r.classe,
        disciplina: r.disciplina,
        trimestre: r.trimestre,
        mac: r.mac1,
        pp: r.pp1,
        pt: r.ppt,
        mt: r.mt1,
        notaFinal: r.nf,
        situacao: r.situacao,
      }));

      const fname = `MED_Resultados_${anoLetivo ?? 'todos'}${trimestre ? `_T${trimestre}` : ''}_${new Date().toISOString().slice(0,10)}`;
      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação de resultados (${rows.length} registos, ${formato.toUpperCase()})`,
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});

      sendExport(res, formato, fname, headers, csvRows as any, 'MapaResultados', 'Resultado', jsonData as JsonObject[]);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: Frequências / Presenças ─────────────────────────────────────
  app.get('/api/med/export/frequencias', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const { anoLetivo, formato = 'csv' } = req.query as Record<string, string>;
      const cfg = await getConfig();

      let sql = `
        SELECT a."numeroMatricula", a.nome || ' ' || a.apelido AS aluno, a.genero,
               t.nome AS turma, t.classe, t."anoLetivo",
               COUNT(*) AS totalAulas,
               SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presencas,
               SUM(CASE WHEN p.status != 'presente' THEN 1 ELSE 0 END) AS faltas,
               ROUND(100.0 * SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS taxaPresenca
        FROM public.presencas p
        JOIN public.alunos a ON a.id = p."alunoId"
        JOIN public.turmas t ON t.id = p."turmaId"
        WHERE 1=1`;
      const params: unknown[] = [];
      if (anoLetivo) { sql += ` AND t."anoLetivo"=$${params.length+1}`; params.push(anoLetivo); }
      sql += ` GROUP BY a."numeroMatricula", a.nome, a.apelido, a.genero, t.nome, t.classe, t."anoLetivo"
               ORDER BY t.classe, t.nome, a.apelido`;

      const rows = await query<JsonObject>(sql, params);

      const headers = ['Nº Matrícula','Aluno','Género','Turma','Classe','Ano Lectivo',
                       'Total Aulas','Presenças','Faltas','Taxa de Presença (%)'];
      const csvRows = rows.map(r => [
        r.numeroMatricula, r.aluno, r.genero, r.turma, r.classe, r.anoLetivo,
        r.totalaulas, r.presencas, r.faltas, r.taxapresenca,
      ]);

      const jsonData = rows.map(r => ({
        codigoEscola: cfg.codigoMED ?? '',
        nomeEscola: cfg.nomeEscola ?? '',
        anoLetivo: r.anoLetivo,
        numeroMatricula: r.numeroMatricula,
        aluno: r.aluno,
        genero: r.genero,
        turma: r.turma,
        classe: r.classe,
        totalAulas: r.totalaulas,
        presencas: r.presencas,
        faltas: r.faltas,
        taxaPresenca: r.taxapresenca,
      }));

      const fname = `MED_Frequencias_${anoLetivo ?? 'todos'}_${new Date().toISOString().slice(0,10)}`;
      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação de frequências (${rows.length} registos, ${formato.toUpperCase()})`,
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});

      sendExport(res, formato, fname, headers, csvRows as any, 'MapaFrequencias', 'FrequenciaAluno', jsonData as JsonObject[]);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: Relatório Consolidado ───────────────────────────────────────
  app.get('/api/med/export/consolidado', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const { anoLetivo } = req.query as Record<string, string>;
      const cfg = await getConfig();

      const anoFilter = anoLetivo ? `AND t."anoLetivo"=$1` : '';
      const params = anoLetivo ? [anoLetivo] : [];

      const [turmasRows, alunosRow, profRow, notasRow, presRow] = await Promise.all([
        query<JsonObject>(`
          SELECT t.classe, t.nivel, t.turno,
                 COUNT(DISTINCT a.id) AS numAlunos,
                 SUM(CASE WHEN a.genero ILIKE 'Masculino' THEN 1 ELSE 0 END) AS masculino,
                 SUM(CASE WHEN a.genero ILIKE 'Feminino' THEN 1 ELSE 0 END) AS feminino
          FROM public.turmas t
          LEFT JOIN public.alunos a ON a."turmaId" = t.id AND a.ativo = true
          WHERE t.ativo = true ${anoFilter}
          GROUP BY t.classe, t.nivel, t.turno
          ORDER BY t.classe
        `, params),
        query<{ total: string }>(`SELECT COUNT(*) AS total FROM public.alunos WHERE ativo=true`),
        query<{ total: string; ativos: string }>(`SELECT COUNT(*) AS total, SUM(CASE WHEN ativo THEN 1 ELSE 0 END) AS ativos FROM public.professores`),
        query<{ total: string; aprovados: string }>(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN n.nf >= ${cfg.notaMinimaAprovacao ?? 10} THEN 1 ELSE 0 END) AS aprovados
          FROM public.notas n
          JOIN public.turmas t ON t.id = n."turmaId"
          WHERE 1=1 ${anoFilter}
        `, params),
        query<{ presencas: string; total: string }>(`
          SELECT SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presencas, COUNT(*) AS total
          FROM public.presencas p
          JOIN public.turmas t ON t.id = p."turmaId"
          WHERE 1=1 ${anoFilter}
        `, params),
      ]);

      const totalAlunos = parseInt(alunosRow[0]?.total ?? '0');
      const totalProf = parseInt(profRow[0]?.total ?? '0');
      const totalNotas = parseInt(notasRow[0]?.total ?? '0');
      const totalAprovados = parseInt(notasRow[0]?.aprovados ?? '0');
      const totalPresencas = parseInt(presRow[0]?.presencas ?? '0');
      const totalAulas = parseInt(presRow[0]?.total ?? '0');

      const report = {
        escola: {
          codigo: cfg.codigoMED ?? '',
          nome: cfg.nomeEscola ?? '',
          nif: cfg.nifEscola ?? '',
          provincia: cfg.provinciaEscola ?? '',
          municipio: cfg.municipioEscola ?? '',
          tipoEnsino: cfg.tipoEnsino ?? '',
          modalidade: cfg.modalidade ?? '',
          directorGeral: cfg.directorGeral ?? '',
          directorPedagogico: cfg.directorPedagogico ?? '',
          directorProvincialEducacao: cfg.directorProvincialEducacao ?? '',
        },
        anoLetivo: anoLetivo ?? 'Todos',
        geradoEm: isoNow(),
        sumario: {
          totalAlunos,
          totalProfessores: totalProf,
          taxaAprovacao: totalNotas > 0 ? Math.round(100 * totalAprovados / totalNotas) : 0,
          taxaPresenca: totalAulas > 0 ? Math.round(100 * totalPresencas / totalAulas) : 0,
        },
        mapaMatriculas: turmasRows.map(r => ({
          classe: r.classe,
          nivel: r.nivel,
          turno: r.turno,
          numAlunos: r.numalunos,
          masculino: r.masculino,
          feminino: r.feminino,
        })),
      };

      logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
        acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação do relatório consolidado MED`,
        ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
      }).catch(() => {});

      res.json(report);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── EXPORT: XLSX (Matrículas) ───────────────────────────────────────────
  app.get('/api/med/export/xlsx/:tipo', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const tipo = req.params.tipo as string;
      const { anoLetivo } = req.query as Record<string, string>;
      const cfg = await getConfig();

      let headers: string[] = [];
      let rows: (string | number | null | undefined)[][] = [];
      let sheetName = 'Dados';

      if (tipo === 'matriculas') {
        let sql = `
          SELECT a."numeroMatricula", a.nome, a.apelido, a."dataNascimento", a.genero,
                 a.provincia, a.municipio, a."nomeEncarregado", a."telefoneEncarregado",
                 t.nome AS turma, t.classe, t.turno, t."anoLetivo", t.nivel
          FROM public.alunos a
          JOIN public.turmas t ON t.id = a."turmaId"
          WHERE a.ativo = true`;
        const params: unknown[] = [];
        if (anoLetivo) { sql += ` AND t."anoLetivo" = $1`; params.push(anoLetivo); }
        sql += ` ORDER BY t.classe, t.nome, a.apelido, a.nome`;
        const data = await query<JsonObject>(sql, params);
        sheetName = 'Matrículas';
        headers = ['Nº Matrícula','Nome','Apelido','Data Nasc.','Género','Província','Município','Turma','Classe','Turno','Nível','Ano Lectivo','Encarregado','Telefone'];
        rows = data.map(r => [r.numeroMatricula, r.nome, r.apelido, r.dataNascimento, r.genero, r.provincia, r.municipio, r.turma, r.classe, r.turno, r.nivel, r.anoLetivo, r.nomeEncarregado, r.telefoneEncarregado]);
      } else if (tipo === 'professores') {
        const data = await query<JsonObject>(`SELECT "numeroProfessor", nome, apelido, email, telefone, habilitacoes, cargo, categoria, disciplinas, "tipoContrato", "dataContratacao" FROM public.professores WHERE ativo = true ORDER BY apelido, nome`);
        sheetName = 'Professores';
        headers = ['Nº Professor','Nome','Apelido','Email','Telefone','Habilitações','Cargo','Categoria','Disciplinas','Tipo Contrato','Data Contratação'];
        rows = data.map(r => [r.numeroProfessor, r.nome, r.apelido, r.email, r.telefone, r.habilitacoes, r.cargo ?? '', r.categoria ?? '', Array.isArray(r.disciplinas) ? (r.disciplinas as string[]).join('; ') : String(r.disciplinas ?? ''), r.tipoContrato ?? '', r.dataContratacao ?? '']);
      } else if (tipo === 'resultados') {
        let sql = `SELECT a."numeroMatricula", a.nome || ' ' || a.apelido AS aluno, a.genero, t.nome AS turma, t.classe, t."anoLetivo", n.disciplina, n.trimestre, n.mac1, n.pp1, n.ppt, n.mt1, n.nf, CASE WHEN n.nf >= 10 THEN 'Aprovado' ELSE 'Reprovado' END AS situacao FROM public.notas n JOIN public.alunos a ON a.id = n."alunoId" JOIN public.turmas t ON t.id = n."turmaId" WHERE 1=1`;
        const params: unknown[] = [];
        if (anoLetivo) { sql += ` AND t."anoLetivo"=$${params.length+1}`; params.push(anoLetivo); }
        sql += ` ORDER BY t.classe, t.nome, a.apelido, n.disciplina`;
        const data = await query<JsonObject>(sql, params);
        sheetName = 'Resultados';
        headers = ['Nº Matrícula','Aluno','Género','Turma','Classe','Ano Lectivo','Disciplina','Trimestre','MAC','PP','PT','MT','Nota Final','Situação'];
        rows = data.map(r => [r.numeroMatricula, r.aluno, r.genero, r.turma, r.classe, r.anoLetivo, r.disciplina, r.trimestre, r.mac1, r.pp1, r.ppt, r.mt1, r.nf, r.situacao]);
      } else if (tipo === 'frequencias') {
        let sql = `SELECT a."numeroMatricula", a.nome || ' ' || a.apelido AS aluno, a.genero, t.nome AS turma, t.classe, t."anoLetivo", COUNT(*) AS totalAulas, SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presencas, SUM(CASE WHEN p.status != 'presente' THEN 1 ELSE 0 END) AS faltas, ROUND(100.0 * SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS taxaPresenca FROM public.presencas p JOIN public.alunos a ON a.id = p."alunoId" JOIN public.turmas t ON t.id = p."turmaId" WHERE 1=1`;
        const params: unknown[] = [];
        if (anoLetivo) { sql += ` AND t."anoLetivo"=$${params.length+1}`; params.push(anoLetivo); }
        sql += ` GROUP BY a."numeroMatricula", a.nome, a.apelido, a.genero, t.nome, t.classe, t."anoLetivo" ORDER BY t.classe, t.nome, a.apelido`;
        const data = await query<JsonObject>(sql, params);
        sheetName = 'Frequências';
        headers = ['Nº Matrícula','Aluno','Género','Turma','Classe','Ano Lectivo','Total Aulas','Presenças','Faltas','Taxa Presença (%)'];
        rows = data.map(r => [r.numeroMatricula, r.aluno, r.genero, r.turma, r.classe, r.anoLetivo, r.totalaulas, r.presencas, r.faltas, r.taxapresenca]);
      } else {
        return res.status(400).json({ error: 'Tipo inválido. Use: matriculas, professores, resultados, frequencias' });
      }

      // Build minimal XLSX manually (using CSV-in-xlsx approach via the xlsx library if available,
      // otherwise return a structured CSV with .xlsx extension and Excel-compatible BOM)
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();
        const wsData = [headers, ...rows.map(r => r.map(v => v ?? ''))];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        // Style header row
        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
          if (ws[cellAddr]) {
            ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'CC1A1A' } } };
          }
        }
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Add escola info sheet
        const infoData = [
          ['Campo', 'Valor'],
          ['Escola', cfg.nomeEscola ?? ''],
          ['Código MED', cfg.codigoMED ?? ''],
          ['NIF', cfg.nifEscola ?? ''],
          ['Província', cfg.provinciaEscola ?? ''],
          ['Município', cfg.municipioEscola ?? ''],
          ['Tipo de Ensino', cfg.tipoEnsino ?? ''],
          ['Modalidade', cfg.modalidade ?? ''],
          ['Director Geral', cfg.directorGeral ?? ''],
          ['Data de Exportação', new Date().toLocaleString('pt-AO')],
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 22 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsInfo, 'Info Escola');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const fname = `MED_${tipo}_${anoLetivo ?? 'todos'}_${new Date().toISOString().slice(0,10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        logAudit({ userId: req.jwtUser!.userId, userEmail: req.jwtUser!.email ?? '', userRole: req.jwtUser!.role,
          acao: 'exportar', modulo: 'Integração MED', descricao: `Exportação XLSX: ${tipo} (${rows.length} registos)`,
          ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress,
        }).catch(() => {});
        return res.send(buf);
      } catch {
        // Fallback: CSV with BOM
        const csv = toCSV(headers, rows);
        const fname = `MED_${tipo}_${anoLetivo ?? 'todos'}_${new Date().toISOString().slice(0,10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        return res.send('\uFEFF' + csv);
      }
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── HISTORICO de exportações ─────────────────────────────────────────────
  app.get('/api/med/historico', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const rows = await query<JsonObject>(`
        SELECT id, "userEmail", "userRole", acao, descricao, "ipAddress", "criadoEm" AS "createdAt"
        FROM public.audit_logs
        WHERE modulo = 'Integração MED'
        ORDER BY "criadoEm" DESC
        LIMIT 50
      `);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // ─── STATS for dashboard ─────────────────────────────────────────────────
  app.get('/api/med/stats', requireAuth, async (req: Request, res: Response) => {
    if (!medGuard(req, res)) return;
    try {
      const [alunosRow, profRow, turmasRow, notasRow] = await Promise.all([
        query<{ total: string; masculino: string; feminino: string }>(`
          SELECT COUNT(*) AS total,
            SUM(CASE WHEN genero ILIKE 'Masculino' THEN 1 ELSE 0 END) AS masculino,
            SUM(CASE WHEN genero ILIKE 'Feminino' THEN 1 ELSE 0 END) AS feminino
          FROM public.alunos WHERE ativo=true
        `),
        query<{ total: string; ativos: string }>(`SELECT COUNT(*) AS total, SUM(CASE WHEN ativo THEN 1 ELSE 0 END) AS ativos FROM public.professores`),
        query<{ total: string }>(`SELECT COUNT(*) AS total FROM public.turmas WHERE ativo=true`),
        query<{ total: string; aprovados: string; notaminimaaprovacao: string }>(`
          SELECT COUNT(*) AS total,
                 SUM(CASE WHEN n.nf >= COALESCE((SELECT "notaMinimaAprovacao" FROM public.config_geral LIMIT 1), 10) THEN 1 ELSE 0 END) AS aprovados,
                 COALESCE((SELECT "notaMinimaAprovacao" FROM public.config_geral LIMIT 1), 10) AS notaminimaaprovacao
          FROM public.notas n
        `),
      ]);
      const total = parseInt(notasRow[0]?.total ?? '0');
      const aprovados = parseInt(notasRow[0]?.aprovados ?? '0');
      res.json({
        alunos: { total: parseInt(alunosRow[0]?.total ?? '0'), masculino: parseInt(alunosRow[0]?.masculino ?? '0'), feminino: parseInt(alunosRow[0]?.feminino ?? '0') },
        professores: { total: parseInt(profRow[0]?.total ?? '0'), ativos: parseInt(profRow[0]?.ativos ?? '0') },
        turmas: parseInt(turmasRow[0]?.total ?? '0'),
        taxaAprovacao: total > 0 ? Math.round(100 * aprovados / total) : 0,
      });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
