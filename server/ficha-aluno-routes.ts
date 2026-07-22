import type { Express, Request, Response } from "express";
import * as crypto from "crypto";
import { query } from "./db";
import { requireAuth } from "./auth";

type JsonObject = Record<string, unknown>;

const FICHA_SECRET = process.env.SESSION_SECRET || "siga-ficha-individual";

function fichaHash(alunoId: string, numeroMatricula: string, createdAt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${alunoId}|${numeroMatricula}|${createdAt}|${FICHA_SECRET}`)
    .digest("hex")
    .slice(0, 12);
}

function calcIdade(dataNascimento: string): number {
  if (!dataNascimento) return 0;
  const diff = Date.now() - new Date(dataNascimento).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function fmtDateBr(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString("pt-PT");
  } catch {
    return String(s);
  }
}

function fmtAOA(n: number | null | undefined): string {
  const v = Number(n || 0);
  return v.toLocaleString("pt-PT", { maximumFractionDigits: 0 }) + " Kz";
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SITUACAO_LABEL: Record<string, string> = {
  activo: "Activo",
  desistente: "Desistente",
  anulacao_matricula: "Anulação de Matrícula",
  transferido: "Transferido",
  excluido: "Excluído",
  concluido: "Concluído",
};

async function obterAlunoCompleto(alunoId: string) {
  const rows = await query<JsonObject>(
    `SELECT a.*,
      t.nome AS "turmaNome", t.classe AS "turmaClasse", t.turno AS "turmaTurno",
      t.nivel AS "turmaNivel", t.sala AS "turmaSala", t."anoLetivo" AS "turmaAnoLetivo",
      c.nome AS "cursoNome", c."areaFormacao" AS "cursoAreaFormacao"
    FROM public.alunos a
    LEFT JOIN public.turmas t ON t.id = a."turmaId"
    LEFT JOIN public.cursos c ON c.id = a."cursoId"
    WHERE a.id = $1 LIMIT 1`,
    [alunoId],
  );
  return rows[0] || null;
}

async function obterConfig() {
  const rows = await query<JsonObject>(
    `SELECT "nomeEscola", "logoUrl", "notaMinimaAprovacao", "morada",
      "telefoneEscola", "emailEscola", "provinciaEscola", "municipioEscola",
      "directorGeral", "directorPedagogico",
      "macMin", "macMax"
    FROM public.config_geral LIMIT 1`,
    [],
  );
  return rows[0] || {};
}

async function obterNotasAluno(alunoId: string, turmaId: string, anoLetivo: string) {
  return query<JsonObject>(
    `SELECT disciplina, trimestre, mt1, nf, mac, pg1, pg2, ex1, ex2,
       "provaRecuperacao", "anoLetivo"
     FROM public.notas
     WHERE "alunoId"=$1 AND "turmaId"=$2 AND "anoLetivo"=$3
     ORDER BY disciplina, trimestre`,
    [alunoId, turmaId, anoLetivo],
  );
}

async function obterFaltasAluno(alunoId: string, turmaId: string) {
  const rows = await query<JsonObject>(
    `SELECT
      SUM(CASE WHEN status='P' THEN 1 ELSE 0 END)::int AS "presencas",
      SUM(CASE WHEN status='F' THEN 1 ELSE 0 END)::int AS "faltasInjustif",
      SUM(CASE WHEN status='J' THEN 1 ELSE 0 END)::int AS "faltasJustif",
      COUNT(*)::int AS "total"
     FROM public.presencas
     WHERE "alunoId"=$1 AND "turmaId"=$2`,
    [alunoId, turmaId],
  );
  return rows[0] || { presencas: 0, faltasInjustif: 0, faltasJustif: 0, total: 0 };
}

async function obterFinanceiroAluno(alunoId: string) {
  try {
    const rows = await query<JsonObject>(
      `SELECT
        COUNT(*) FILTER (WHERE status='pago')::int AS "pagos",
        COUNT(*) FILTER (WHERE status='pendente')::int AS "pendentes",
        COALESCE(SUM(valor) FILTER (WHERE status='pago'), 0)::float8 AS "totalPago"
       FROM public.pagamentos
       WHERE "alunoId"=$1`,
      [alunoId],
    );
    let saldo = 0;
    try {
      const sRows = await query<JsonObject>(
        `SELECT COALESCE(saldo, 0)::float8 AS "saldo"
         FROM public.saldo_alunos WHERE "alunoId"=$1`,
        [alunoId],
      );
      saldo = Number(sRows[0]?.saldo || 0);
    } catch {
      saldo = 0;
    }
    return { ...(rows[0] || { pagos: 0, pendentes: 0, totalPago: 0 }), saldo };
  } catch {
    return { pagos: 0, pendentes: 0, totalPago: 0, saldo: 0 };
  }
}

type TrimestreFiltro = 1 | 2 | 3 | "anual";

// ─── Carrega o template editável "ficha_individual" do editor ─────────────
// Se existir um template salvo em doc_templates (criado pelo seed do editor
// ou modificado pelo utilizador), o seu conteudo será usado como base, com
// substituição de variáveis. Caso contrário, recorre-se ao HTML hardcoded.
async function obterTemplateFichaEditor(): Promise<string | null> {
  try {
    const rows = await query<JsonObject>(
      `SELECT conteudo FROM public.doc_templates
       WHERE tipo='ficha_individual'
       ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC NULLS LAST
       LIMIT 1`,
      [],
    );
    const c = rows[0]?.conteudo;
    if (typeof c === "string" && c.includes("{{") && c.includes("}}")) {
      return c;
    }
    return null;
  } catch {
    return null;
  }
}

async function obterTemplateReconfirmacao(): Promise<string | null> {
  try {
    const rows = await query<JsonObject>(
      `SELECT conteudo FROM public.doc_templates
       WHERE tipo='ficha_reconfirmacao_matricula'
       ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC NULLS LAST
       LIMIT 1`,
      [],
    );
    const c = rows[0]?.conteudo;
    if (typeof c === "string" && c.includes("{{") && c.includes("}}")) {
      return c;
    }
    return null;
  } catch {
    return null;
  }
}

function calcProximaClasse(classe: string): string {
  const match = String(classe || "").match(/(\d+)/);
  if (!match) return "—";
  const num = parseInt(match[1], 10);
  if (isNaN(num)) return "—";
  if (num >= 13) return "Concluído";
  return `${num + 1}ª Classe`;
}

function calcAnoLectivoProximo(anoLetivo: string): string {
  const parts = String(anoLetivo || "").match(/(\d{4})/g);
  if (!parts || parts.length === 0) return "—";
  const anoInicio = parseInt(parts[0], 10);
  if (isNaN(anoInicio)) return "—";
  return `${anoInicio + 1}/${anoInicio + 2}`;
}

function calcDecisaoAcesso(notas: JsonObject[], notaMin: number): { decisao: string; cor: string; bg: string } {
  const nfsAnual: number[] = [];
  const disciplinas = Array.from(new Set(notas.map(n => String(n.disciplina))));
  for (const disc of disciplinas) {
    const notasDisc = notas.filter(n => n.disciplina === disc);
    const mts = [1, 2, 3].map(t => {
      const x = notasDisc.find(n => Number(n.trimestre) === t);
      return x?.mt1 != null ? Number(x.mt1) : (x?.mt != null ? Number(x.mt) : null);
    }).filter((v): v is number => v != null && !isNaN(v));
    if (mts.length > 0) {
      nfsAnual.push(mts.reduce((a, b) => a + b, 0) / mts.length);
    } else {
      const nfDirect = notasDisc.map(n => n.nf != null ? Number(n.nf) : null).filter((v): v is number => v != null && !isNaN(v));
      if (nfDirect.length > 0) nfsAnual.push(Math.max(...nfDirect));
    }
  }
  if (nfsAnual.length === 0) return { decisao: "—", cor: "#6b7280", bg: "#f3f4f6" };
  const media = nfsAnual.reduce((a, b) => a + b, 0) / nfsAnual.length;
  if (media >= notaMin) return { decisao: "APROVADO", cor: "#15803d", bg: "#dcfce7" };
  return { decisao: "REPROVADO", cor: "#b91c1c", bg: "#fee2e2" };
}

function applyVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function buildFichaHtml(opts: {
  aluno: JsonObject;
  config: JsonObject;
  notas: JsonObject[];
  faltas: JsonObject;
  financeiro: JsonObject;
  reconfirmacoes?: JsonObject[];
  baseUrl: string;
  hash: string;
  emissaoNum: number;
  trimestre: TrimestreFiltro;
  templateBase?: string | null;
}): string {
  const { aluno, config, notas, faltas, financeiro, reconfirmacoes = [], baseUrl, hash, emissaoNum, trimestre } = opts;
  const isAnual = trimestre === "anual";
  const trimNum = isAnual ? 0 : Number(trimestre);
  const trimLabel = isAnual ? "ANUAL" : `${trimNum}º TRIMESTRE`;
  const trimLabelLower = isAnual ? "anual" : `${trimNum}º trimestre`;

  const nomeEscola = String(config.nomeEscola || "Escola");
  const logoUrl = config.logoUrl ? String(config.logoUrl) : "";
  const morada = String(config.morada || "");
  const tel = String(config.telefoneEscola || "");
  const email = String(config.emailEscola || "");
  const notaMin = Number(config.notaMinimaAprovacao || 10);
  const directorGeral = String(config.directorGeral || "");
  const directorPedagogico = String(config.directorPedagogico || "");

  const numMatricula = String(aluno.numeroMatricula || "");
  const nomeCompleto = `${aluno.nome || ""} ${aluno.apelido || ""}`.trim();
  const idade = calcIdade(String(aluno.dataNascimento || ""));
  const situacao = String(aluno.situacao || "activo");
  const situacaoLabel = SITUACAO_LABEL[situacao] || situacao;
  const situacaoCor = situacao === "activo" ? "#16a34a" : situacao === "concluido" ? "#0369a1" : "#dc2626";

  const verifUrl = `${baseUrl}/api/alunos/${aluno.id}/ficha/verificar?h=${hash}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(verifUrl)}&bgcolor=ffffff&color=0D1F35&margin=4&ecc=M`;
  const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(numMatricula || "SEM-MATRICULA")}&code=Code128&dpi=96&imagetype=Png&translate-esc=true`;

  // ─── Notas discriminadas ──────────────────────────────────────────────
  const fmt = (v: number | null) => (v != null && !isNaN(v) ? Number(v).toFixed(1) : "—");
  const disciplinas = Array.from(new Set(notas.map(n => String(n.disciplina)))).sort((a, b) => a.localeCompare(b, "pt"));

  let tabelaNotasHtml = "";
  let totalAprovados = 0;

  if (isAnual) {
    // ── Vista anual: 3 trimestres + MFD + Situação final ────────────
    const linhasNotas = disciplinas.map((disc, idx) => {
      const dn = notas.filter(n => n.disciplina === disc);
      const t1 = dn.find(n => Number(n.trimestre) === 1);
      const t2 = dn.find(n => Number(n.trimestre) === 2);
      const t3 = dn.find(n => Number(n.trimestre) === 3);

      const mt1 = t1?.mt1 != null ? Number(t1.mt1) : (t1?.mt != null ? Number(t1.mt) : null);
      const mt2 = t2?.mt1 != null ? Number(t2.mt1) : (t2?.mt != null ? Number(t2.mt) : null);
      const mt3 = t3?.mt1 != null ? Number(t3.mt1) : (t3?.mt != null ? Number(t3.mt) : null);
      const nf1 = t1?.nf != null ? Number(t1.nf) : null;
      const nf2 = t2?.nf != null ? Number(t2.nf) : null;
      const nf3 = t3?.nf != null ? Number(t3.nf) : null;

      const validos = [mt1, mt2, mt3].filter((v): v is number => v != null && !isNaN(v));
      const mfd = validos.length > 0 ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
      const aprovado = mfd != null && mfd >= notaMin;
      const corLinha = idx % 2 === 0 ? "#fff" : "#f8fafc";
      const corMfd = mfd != null ? (aprovado ? "#16a34a" : "#dc2626") : "#666";

      return `<tr style="background:${corLinha}">
        <td style="text-align:left;padding:5px 8px;border:1px solid #ccc;font-weight:600">${escapeHtml(disc)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(mt1)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(mt2)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(mt3)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(nf1)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(nf2)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(nf3)}</td>
        <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corMfd}">${fmt(mfd)}</td>
        <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corMfd}">${mfd != null ? (aprovado ? "Aprovado" : "Reprovado") : "—"}</td>
      </tr>`;
    }).join("");

    totalAprovados = disciplinas.filter(disc => {
      const dn = notas.filter(n => n.disciplina === disc);
      const mts = [1, 2, 3].map(t => {
        const x = dn.find(n => Number(n.trimestre) === t);
        return x?.mt1 != null ? Number(x.mt1) : (x?.mt != null ? Number(x.mt) : null);
      }).filter((v): v is number => v != null);
      if (mts.length === 0) return false;
      return mts.reduce((a, b) => a + b, 0) / mts.length >= notaMin;
    }).length;

    // ── Médias gerais por trimestre e anual ──────────────────────────
    const avgOf = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x != null && !isNaN(x));
      return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const allMt1 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 1); return t?.mt1 != null ? Number(t.mt1) : null; });
    const allMt2 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 2); return t?.mt1 != null ? Number(t.mt1) : null; });
    const allMt3 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 3); return t?.mt1 != null ? Number(t.mt1) : null; });
    const allNf1 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 1); return t?.nf != null ? Number(t.nf) : null; });
    const allNf2 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 2); return t?.nf != null ? Number(t.nf) : null; });
    const allNf3 = disciplinas.map(disc => { const t = notas.find(n => n.disciplina === disc && Number(n.trimestre) === 3); return t?.nf != null ? Number(t.nf) : null; });
    const avgMt1Anual = avgOf(allMt1);
    const avgMt2Anual = avgOf(allMt2);
    const avgMt3Anual = avgOf(allMt3);
    const avgNf1Anual = avgOf(allNf1);
    const avgNf2Anual = avgOf(allNf2);
    const avgNf3Anual = avgOf(allNf3);
    const allMfds = disciplinas.map(disc => {
      const dn = notas.filter(n => n.disciplina === disc);
      const mts = [1,2,3].map(t => { const x = dn.find(n => Number(n.trimestre) === t); return x?.mt1 != null ? Number(x.mt1) : null; }).filter((v): v is number => v != null);
      return mts.length > 0 ? mts.reduce((a,b) => a+b, 0) / mts.length : null;
    });
    const avgMfdAnual = avgOf(allMfds);
    const corAvgMfd = avgMfdAnual != null ? (avgMfdAnual >= notaMin ? "#16a34a" : "#dc2626") : "#666";

    tabelaNotasHtml = `
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="width:30%">DISCIPLINA</th>
          <th colspan="3" style="background:#1e3a8a">MÉDIA TRIMESTRAL (MT)</th>
          <th colspan="3" style="background:#0e7490">NOTA FINAL (NF)</th>
          <th rowspan="2">MFD</th>
          <th rowspan="2" style="width:11%">SITUAÇÃO</th>
        </tr>
        <tr>
          <th style="background:#1e3a8a">1º T</th>
          <th style="background:#1e3a8a">2º T</th>
          <th style="background:#1e3a8a">3º T</th>
          <th style="background:#0e7490">1º T</th>
          <th style="background:#0e7490">2º T</th>
          <th style="background:#0e7490">3º T</th>
        </tr>
      </thead>
      <tbody>${linhasNotas}</tbody>
      <tfoot>
        <tr style="background:#dbeafe;font-weight:bold;font-size:10.5px">
          <td style="text-align:left;padding:6px 8px;border:1px solid #93c5fd;color:#1e3a8a;font-weight:700">MÉDIA GERAL DAS DISCIPLINAS</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#1e3a8a;font-weight:700">${fmt(avgMt1Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#1e3a8a;font-weight:700">${fmt(avgMt2Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#1e3a8a;font-weight:700">${fmt(avgMt3Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#0e7490;font-weight:700">${fmt(avgNf1Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#0e7490;font-weight:700">${fmt(avgNf2Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:#0e7490;font-weight:700">${fmt(avgNf3Anual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:${corAvgMfd};font-weight:700">${fmt(avgMfdAnual)}</td>
          <td style="padding:6px;border:1px solid #93c5fd">—</td>
        </tr>
        <tr style="background:#f1f5f9;font-weight:bold">
          <td colspan="7" style="padding:6px;border:1px solid #ccc;text-align:right">DISCIPLINAS APROVADAS:</td>
          <td colspan="2" style="padding:6px;border:1px solid #ccc;color:#16a34a;font-weight:bold">${totalAprovados} / ${disciplinas.length}</td>
        </tr>
      </tfoot>
    </table>
    <p style="font-size:9px;color:#64748b;margin-top:4px;font-style:italic">Nota mínima de aprovação: ${notaMin}. MFD = Média Final de Disciplina (média aritmética das MT dos 3 trimestres). A linha azul mostra a média geral de todas as disciplinas.</p>`;
  } else {
    // ── Vista trimestral: MAC, PG1, PG2, MT, NF + Situação parcelar ──
    const linhasNotas = disciplinas.map((disc, idx) => {
      const dn = notas.filter(n => n.disciplina === disc);
      const tr = dn.find(n => Number(n.trimestre) === trimNum);

      const mac = tr?.mac != null ? Number(tr.mac) : null;
      const pg1 = tr?.pg1 != null ? Number(tr.pg1) : null;
      const pg2 = tr?.pg2 != null ? Number(tr.pg2) : null;
      const mt = tr?.mt1 != null ? Number(tr.mt1) : (tr?.mt != null ? Number(tr.mt) : null);
      const nf = tr?.nf != null ? Number(tr.nf) : null;

      const refSituacao = nf != null ? nf : mt;
      const aprovado = refSituacao != null && refSituacao >= notaMin;
      const corLinha = idx % 2 === 0 ? "#fff" : "#f8fafc";
      const corNota = refSituacao != null ? (aprovado ? "#16a34a" : "#dc2626") : "#666";

      if (refSituacao != null && aprovado) totalAprovados++;

      return `<tr style="background:${corLinha}">
        <td style="text-align:left;padding:5px 8px;border:1px solid #ccc;font-weight:600">${escapeHtml(disc)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(mac)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(pg1)}</td>
        <td style="padding:5px;border:1px solid #ccc">${fmt(pg2)}</td>
        <td style="padding:5px;border:1px solid #ccc;font-weight:bold">${fmt(mt)}</td>
        <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corNota}">${fmt(nf)}</td>
        <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corNota}">${refSituacao != null ? (aprovado ? "Aprovado" : "Reprovado") : "—"}</td>
      </tr>`;
    }).join("");

    // ── Médias gerais do trimestre ────────────────────────────────────
    const avgOfTrim = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x != null && !isNaN(x));
      return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const allMtTrim = disciplinas.map(disc => {
      const r = notas.find(n => n.disciplina === disc && Number(n.trimestre) === trimNum);
      return r?.mt1 != null ? Number(r.mt1) : null;
    });
    const allNfTrim = disciplinas.map(disc => {
      const r = notas.find(n => n.disciplina === disc && Number(n.trimestre) === trimNum);
      return r?.nf != null ? Number(r.nf) : null;
    });
    const avgMtTrim = avgOfTrim(allMtTrim);
    const avgNfTrim = avgOfTrim(allNfTrim);
    const corAvgMtTrim = avgMtTrim != null ? (avgMtTrim >= notaMin ? "#16a34a" : "#dc2626") : "#666";
    const corAvgNfTrim = avgNfTrim != null ? (avgNfTrim >= notaMin ? "#16a34a" : "#dc2626") : "#666";

    tabelaNotasHtml = `
    <table>
      <thead>
        <tr>
          <th style="width:32%">DISCIPLINA</th>
          <th style="background:#1e3a8a">MAC</th>
          <th style="background:#1e3a8a">PG1</th>
          <th style="background:#1e3a8a">PG2</th>
          <th style="background:#0e7490">MT</th>
          <th style="background:#0e7490">NF</th>
          <th style="width:13%">SITUAÇÃO</th>
        </tr>
      </thead>
      <tbody>${linhasNotas}</tbody>
      <tfoot>
        <tr style="background:#dbeafe;font-weight:bold;font-size:10.5px">
          <td style="text-align:left;padding:6px 8px;border:1px solid #93c5fd;color:#1e3a8a;font-weight:700">MÉDIA GERAL DAS DISCIPLINAS</td>
          <td style="padding:6px;border:1px solid #93c5fd">—</td>
          <td style="padding:6px;border:1px solid #93c5fd">—</td>
          <td style="padding:6px;border:1px solid #93c5fd">—</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:${corAvgMtTrim};font-weight:700">${fmt(avgMtTrim)}</td>
          <td style="padding:6px;border:1px solid #93c5fd;color:${corAvgNfTrim};font-weight:700">${fmt(avgNfTrim)}</td>
          <td style="padding:6px;border:1px solid #93c5fd">—</td>
        </tr>
        <tr style="background:#f1f5f9;font-weight:bold">
          <td colspan="6" style="padding:6px;border:1px solid #ccc;text-align:right">DISCIPLINAS APROVADAS NO ${trimNum}º TRIMESTRE:</td>
          <td style="padding:6px;border:1px solid #ccc;color:#16a34a;font-weight:bold">${totalAprovados} / ${disciplinas.length}</td>
        </tr>
      </tfoot>
    </table>
    <p style="font-size:9px;color:#64748b;margin-top:4px;font-style:italic">Nota mínima de aprovação: ${notaMin}. MAC = Média de Avaliação Contínua. PG1/PG2 = Provas. MT = Média Trimestral. NF = Nota Final do trimestre. A linha azul mostra a média geral de todas as disciplinas no ${trimNum}º trimestre.</p>`;
  }

  // ─── Avatar SVG fallback (iniciais) ───────────────────────────────────
  const iniciais = `${(aluno.nome || "?").toString().charAt(0)}${(aluno.apelido || "").toString().charAt(0)}`.toUpperCase();
  const avatarBg = aluno.genero === "F" ? "#ec4899" : "#3b82f6";
  const fotoSrc = aluno.foto ? String(aluno.foto) : "";

  // ─── Faltas / Assiduidade ──────────────────────────────────────────────
  const fTotal = Number(faltas.total || 0);
  const fPres = Number(faltas.presencas || 0);
  const fInj = Number(faltas.faltasInjustif || 0);
  const fJus = Number(faltas.faltasJustif || 0);
  const assiduidade = fTotal > 0 ? (fPres / fTotal) * 100 : null;

  // ─── Financeiro ────────────────────────────────────────────────────────
  const fPag = Number(financeiro.pagos || 0);
  const fPend = Number(financeiro.pendentes || 0);
  const fTotalPago = Number(financeiro.totalPago || 0);
  const fSaldo = Number(financeiro.saldo || 0);

  // ─── Secção de Repetências ──────────────────────────────────────────────
  const nRepetencias = reconfirmacoes.length;
  const reconfirmacoesHtml = (() => {
    if (nRepetencias === 0) {
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#dcfce7;border-radius:6px;border:1px solid #86efac;font-size:10.5px;color:#15803d;font-weight:600;">
        &#10003; Sem repetências registadas &mdash; progressão directa em todos os anos.
      </div>`;
    }
    const alertaBloq = nRepetencias > 1
      ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fee2e2;border-left:4px solid #dc2626;border-radius:4px;margin-bottom:8px;font-size:10px;color:#7f1d1d;font-weight:700;">
          &#9888; ALUNO REPETENTE &mdash; ${nRepetencias} reprovações registadas
        </div>`
      : "";
    const linhas = reconfirmacoes
      .map((r, i) => {
        const anoLetivo = escapeHtml(String(r.anoLetivo || "—"));
        const data = fmtDateBr(String(r.data || ""));
        const statusRaw = String(r.status || "");
        const statusLabel = statusRaw === "confirmado" ? "Confirmado" : statusRaw === "cancelado" ? "Cancelado" : statusRaw === "pendente" ? "Em Cobrança" : statusRaw;
        const statusColor = statusRaw === "confirmado" ? "#15803d" : statusRaw === "cancelado" ? "#dc2626" : "#b45309";
        const statusBg    = statusRaw === "confirmado" ? "#dcfce7" : statusRaw === "cancelado" ? "#fee2e2" : "#fef3c7";
        const bg = i % 2 === 0 ? "#fff" : "#f8fafc";
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${bg};border-bottom:1px solid #e2e8f0;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:10.5px;color:#0f172a;">Ano Lectivo ${anoLetivo}</div>
            <div style="font-size:9.5px;color:#64748b;margin-top:1px;">Reconfirmação de matrícula &middot; ${data}</div>
          </div>
          <div style="background:${statusBg};color:${statusColor};border-radius:4px;padding:2px 8px;font-size:9.5px;font-weight:700;">${escapeHtml(statusLabel)}</div>
        </div>`;
      })
      .join("");
    return `${alertaBloq}<div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">${linhas}</div>`;
  })();

  const dataEmissao = new Date().toLocaleString("pt-PT", { dateStyle: "long", timeStyle: "short" });
  const badgeEmissao = emissaoNum === 1
    ? `<div style="background:#dcfce7;color:#15803d;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:bold;border:1px solid #86efac">1ª EMISSÃO (ORIGINAL)</div>`
    : `<div style="background:#fed7aa;color:#9a3412;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:bold;border:1px solid #fb923c">REIMPRESSÃO Nº ${emissaoNum}</div>`;

  // ─── Substituição de variáveis a partir do template editável ──────────
  // Quando existe um template em doc_templates (tipo='ficha_individual'),
  // usamo-lo como base e injectamos todas as variáveis dinâmicas. Assim o
  // utilizador pode editar a estrutura/estilos da ficha pelo editor de
  // documentos sem perder os dados reais (notas, assiduidade, financeiro…).
  if (opts.templateBase) {
    const toolbarHtml = `<div class="toolbar">
  <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
  <button class="btn-reimp" onclick="window.location.reload()">Reimprimir (regista nova cópia)</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>`;
    const logoHtml = logoUrl
      ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo"/>`
      : `<div class="logo" style="width:62px;height:62px"></div>`;
    const linhaContactoEscola = (morada || tel || email)
      ? escapeHtml([morada, tel, email].filter(Boolean).join(" · "))
      : "";
    const tituloDoc = `FICHA INDIVIDUAL DO ALUNO${isAnual ? "" : ` &mdash; ${trimLabel}`}`;
    const avatarHtml = fotoSrc
      ? `<img src="${escapeHtml(fotoSrc)}" alt="Foto" style="width:104px;height:130px;max-width:104px;max-height:130px;object-fit:cover;object-position:center top;display:block;border-radius:5px;"/>`
      : escapeHtml(iniciais);
    const dataNascimentoAvatar = aluno.dataNascimento
      ? `<div class="avatar-birth">${fmtDateBr(String(aluno.dataNascimento))}</div>`
      : "";
    const barcodeImg = `<img src="${barcodeUrl}" alt="Barcode" onerror="this.style.display='none'"/>`;
    const tituloNotas = `${isAnual ? "NOTAS DISCRIMINADAS" : `NOTAS DO ${trimLabel}`} — ${escapeHtml(String(aluno.turmaAnoLetivo || "Ano Actual"))}`;
    const tabelaNotasFicha = disciplinas.length === 0
      ? `<p style="font-size:10px;color:#64748b;font-style:italic;padding:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:4px;text-align:center">Não há notas registadas para este aluno no ${trimLabelLower}.</p>`
      : tabelaNotasHtml;
    const assiduidadeClass = assiduidade != null ? (assiduidade >= 75 ? "ok" : assiduidade >= 50 ? "warn" : "bad") : "";
    const qrImg = `<img src="${qrUrl}" alt="QR Code de Verificação"/>`;

    const vars: Record<string, string> = {
      TOOLBAR: toolbarHtml,
      NOME_ESCOLA: escapeHtml(nomeEscola),
      LOGO_HTML: logoHtml,
      LINHA_CONTACTO_ESCOLA: linhaContactoEscola,
      BADGE_EMISSAO: badgeEmissao,
      TITULO_DOC: tituloDoc,
      AVATAR_HTML: avatarHtml,
      AVATAR_BG: avatarBg,
      DATA_NASCIMENTO_AVATAR: dataNascimentoAvatar,
      NOME_COMPLETO: escapeHtml(nomeCompleto),
      NUMERO_MATRICULA: escapeHtml(numMatricula),
      DATA_NASCIMENTO: fmtDateBr(String(aluno.dataNascimento || "")),
      IDADE: String(idade),
      GENERO: aluno.genero === "F" ? "Feminino" : "Masculino",
      PROVINCIA: escapeHtml(String(aluno.provincia || "—")),
      MUNICIPIO: escapeHtml(String(aluno.municipio || "—")),
      BI: escapeHtml(String(aluno.numeroBi || aluno.numeroCedula || "—")),
      NOME_PAI: escapeHtml(String(aluno.nomePai || "—")),
      NOME_MAE: escapeHtml(String(aluno.nomeMae || "—")),
      SITUACAO: escapeHtml(situacaoLabel),
      SITUACAO_COR: situacaoCor,
      BARCODE_IMG: barcodeImg,
      TURMA: escapeHtml(String(aluno.turmaNome || "—")),
      CLASSE: escapeHtml(String(aluno.turmaClasse || "—")),
      TURNO: escapeHtml(String(aluno.turmaTurno || "—")),
      NIVEL: escapeHtml(String(aluno.turmaNivel || "—")),
      SALA: escapeHtml(String(aluno.turmaSala || "—")),
      ANO_LECTIVO: escapeHtml(String(aluno.turmaAnoLetivo || "—")),
      CURSO: escapeHtml(String(aluno.cursoNome || "Ensino Geral")),
      DATA_MATRICULA: fmtDateBr(aluno.createdAt as string),
      ENCARREGADO_NOME: escapeHtml(String(aluno.nomeEncarregado || "—")),
      ENCARREGADO_TELEFONE: escapeHtml(String(aluno.telefoneEncarregado || "—")),
      ENCARREGADO_EMAIL: escapeHtml(String(aluno.emailEncarregado || "—")),
      ENCARREGADO_PROFISSAO: escapeHtml(String(aluno.encarregadoProfissao || "—")),
      ENCARREGADO_LOCAL_TRABALHO: escapeHtml(String(aluno.encarregadoLocalTrabalho || "—")),
      ENCARREGADO_RESIDENCIA: escapeHtml(String(aluno.encarregadoResidencia || "—")),
      TITULO_NOTAS: tituloNotas,
      TABELA_NOTAS_FICHA: tabelaNotasFicha,
      ASSIDUIDADE_TITULO: `ASSIDUIDADE${isAnual ? "" : " (acumulada do ano lectivo)"}`,
      ASSIDUIDADE_PRESENCAS: String(fPres),
      ASSIDUIDADE_FALTAS_J: String(fJus),
      ASSIDUIDADE_FALTAS_I: String(fInj),
      ASSIDUIDADE_PERCENT: assiduidade != null ? assiduidade.toFixed(1) + "%" : "—",
      ASSIDUIDADE_CLASS: assiduidadeClass,
      FINANCEIRO_TITULO: `SITUAÇÃO FINANCEIRA${isAnual ? "" : " (acumulada do ano lectivo)"}`,
      FIN_PAGAMENTOS: String(fPag),
      FIN_PENDENCIAS: String(fPend),
      FIN_TOTAL_PAGO: fmtAOA(fTotalPago),
      FIN_ESTADO: fPend === 0 ? "Em dia" : "Vencido",
      FIN_PEND_CLASS: fPend > 0 ? "bad" : "ok",
      FIN_ESTADO_CLASS: fPend === 0 ? "ok" : "bad",
      FIN_SALDO: fmtAOA(fSaldo),
      FIN_SALDO_CLASS: fSaldo > 0 ? "ok" : fSaldo < 0 ? "bad" : "",
      QR_VERIFICACAO: qrImg,
      URL_VERIFICACAO: escapeHtml(verifUrl),
      HASH_VERIFICACAO: escapeHtml(hash),
      NUMERO_EMISSAO: String(emissaoNum),
      DIRECTOR_PEDAGOGICO: escapeHtml(directorPedagogico || "_____________________"),
      DIRECTOR_GERAL: escapeHtml(directorGeral || "_____________________"),
      DATA_EMISSAO: escapeHtml(dataEmissao),
    };

    // Envolvemos o resultado num documento mínimo com regras `@media print`
    // para garantir que (1) o cabeçalho da tabela de notas NÃO se repete na
    // 2ª página, (2) as linhas não se partem a meio e (3) o título de secção
    // fica colado à tabela respectiva. O <body> contém o template editado tal
    // como o utilizador o desenhou (estilos inline preservados pelo TinyMCE).
    const inner = applyVars(opts.templateBase, vars);
    return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>Ficha Individual — ${escapeHtml(nomeCompleto)}</title>
<style>
  @page { size: A4; margin: 8mm 6mm; }
  *,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;margin:0;color:#0f172a;line-height:1.4;}
  /* Toolbar (apenas ecrã) ─────────────────────────────────────── */
  .toolbar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px;display:flex;gap:10px;justify-content:center;z-index:10;}
  .toolbar button{padding:8px 18px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;}
  .toolbar .btn-print{background:#16a34a;color:#fff;}
  .toolbar .btn-reimp{background:#f59e0b;color:#fff;}
  .toolbar .btn-close{background:transparent;color:#fff;border:1px solid #fff !important;}
  /* Cabeçalho de tabela de notas (gerada pelo servidor) ───────── */
  table th{background:#0f172a;color:#fff;padding:6px;border:1px solid #0f172a;font-weight:bold;text-align:center;font-size:10px;}
  table td{padding:5px;border:1px solid #ccc;text-align:center;font-size:10px;}
  /* Regras CRÍTICAS de impressão ──────────────────────────────── */
  @media print {
    .toolbar{display:none !important;}
    body{background:#fff !important;}
    /* O cabeçalho da tabela NÃO se repete na página seguinte. */
    thead{display:table-row-group !important;}
    tfoot{display:table-row-group !important;}
    /* Linhas inteiras: nunca se partem a meio. */
    tr{page-break-inside:avoid !important;break-inside:avoid !important;}
    td,th{page-break-inside:avoid !important;break-inside:avoid !important;}
    /* Título de secção fica sempre colado ao bloco seguinte. */
    div[style*="background:#0f172a"]{page-break-after:avoid !important;break-after:avoid !important;}
    table{page-break-before:avoid !important;break-before:avoid !important;}
    /* Imagens não são quebradas. */
    img{page-break-inside:avoid !important;break-inside:avoid !important;}
  }
</style>
</head>
<body>
${toolbarHtml}
${inner}
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>Ficha Individual — ${escapeHtml(nomeCompleto)}</title>
<style>
  @page { size: A4; margin: 0; }
  *,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;background:#eef2f7;margin:0;color:#0d1f35;line-height:1.4;}

  /* ── Toolbar ──────────────────────────────────────────────────── */
  .toolbar{position:sticky;top:0;background:linear-gradient(180deg,#0d1f35 0%,#102a43 100%);color:#fff;padding:12px 18px;display:flex;gap:10px;justify-content:center;align-items:center;z-index:10;box-shadow:0 2px 6px rgba(13,31,53,0.25);}
  .toolbar .tlbl{margin-right:auto;font-size:12px;letter-spacing:0.5px;color:#cbd5e1;}
  .toolbar .tlbl strong{color:#fbbf24;font-weight:600;}
  .toolbar button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12.5px;letter-spacing:0.3px;display:inline-flex;align-items:center;gap:6px;transition:transform .15s ease, box-shadow .15s ease;}
  .toolbar button:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(0,0,0,0.2);}
  .btn-print{background:#16a34a;color:#fff;}
  .btn-reimp{background:#f59e0b;color:#fff;}
  .btn-close{background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4) !important;}

  /* ── Página A4 ────────────────────────────────────────────────── */
  .page{background:#fff;max-width:210mm;min-height:297mm;margin:18px auto;padding:14mm 14mm 12mm;box-shadow:0 2px 18px rgba(13,31,53,0.12);position:relative;border-radius:2px;}
  .page::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#0d1f35 0%,#102a43 50%,#b8893d 100%);border-radius:2px 2px 0 0;}

  /* ── Cabeçalho institucional ─────────────────────────────────── */
  .header{display:flex;align-items:center;gap:14px;padding:6px 0 12px;margin-bottom:14px;border-bottom:1.5px solid #d4a017;position:relative;}
  .header::after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;background:#0d1f35;}
  .header img.logo,.header .logo-ph{width:68px;height:68px;object-fit:contain;flex-shrink:0;}
  .header .titles{flex:1;text-align:center;}
  .header .rep{font-size:9px;text-transform:uppercase;color:#475569;letter-spacing:1.2px;font-weight:600;}
  .header .escola{font-size:15px;font-weight:800;text-transform:uppercase;color:#0d1f35;margin-top:3px;letter-spacing:0.8px;}
  .header .morada{font-size:8.5px;color:#64748b;margin-top:3px;}
  .header .badges{display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0;}

  /* ── Título do documento ─────────────────────────────────────── */
  .titulo{text-align:center;font-size:15px;font-weight:800;color:#fff;margin:6px 0 14px;background:linear-gradient(90deg,#0d1f35 0%,#102a43 100%);padding:10px 12px;border-radius:6px;letter-spacing:2px;text-transform:uppercase;position:relative;box-shadow:0 2px 4px rgba(13,31,53,0.15);}
  .titulo::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#b8893d;border-radius:6px 0 0 6px;}

  /* ── Bloco de identificação ──────────────────────────────────── */
  .ident{display:flex;gap:16px;align-items:stretch;background:linear-gradient(180deg,#fafbfc 0%,#f1f5f9 100%);border:1px solid #cbd5e1;border-left:4px solid #b8893d;border-radius:8px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(13,31,53,0.05);}
  .avatar-wrap{display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;}
  .avatar{width:104px;height:130px;border-radius:6px;background:${avatarBg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;border:3px solid #fff;box-shadow:0 0 0 1px #cbd5e1, 0 2px 6px rgba(0,0,0,0.1);overflow:hidden;flex-shrink:0;position:relative;}
  .avatar img{width:104px;height:130px;max-width:104px;max-height:130px;object-fit:cover;object-position:center top;display:block;position:absolute;top:0;left:0;}
  .avatar-birth{background:#0d1f35;color:#fff;font-size:9px;padding:3px 8px;border-radius:3px;font-weight:600;text-align:center;white-space:nowrap;letter-spacing:0.4px;}
  .ident-data{flex:1;min-width:0;}
  .ident-data h3{font-size:15px;color:#0d1f35;margin:0 0 2px;font-weight:800;letter-spacing:0.3px;}
  .ident-data .matricula{font-size:11px;color:#64748b;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
  .ident-data .matricula strong{color:#0d1f35;font-weight:700;font-family:'SF Mono','Courier New',monospace;background:#fef9f0;padding:2px 8px;border-radius:3px;border:1px solid #f0d99c;}
  .barcode-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;align-self:center;}
  .barcode-wrap img{width:160px;height:46px;object-fit:contain;border:1px solid #e2e8f0;background:#fff;padding:3px;border-radius:3px;}
  .barcode-wrap .matricula-num{font-size:9.5px;color:#64748b;font-family:'SF Mono','Courier New',monospace;letter-spacing:1.2px;}

  /* ── Títulos de secção ───────────────────────────────────────── */
  .secao-titulo{font-size:11px;font-weight:700;color:#0d1f35;background:#fef9f0;padding:7px 12px;border-left:4px solid #b8893d;border-bottom:1px solid #e7d8b3;margin:14px 0 8px;letter-spacing:1.2px;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
  .secao-titulo::before{content:"";width:6px;height:6px;background:#b8893d;border-radius:50%;flex-shrink:0;}

  /* ── Grelha de dados ─────────────────────────────────────────── */
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;}
  .grid .row{display:flex;gap:8px;font-size:10.5px;padding:5px 0;border-bottom:1px dotted #e2e8f0;}
  .grid .row:nth-last-child(-n+2){border-bottom:none;}
  .grid .row .label{color:#64748b;min-width:130px;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;}
  .grid .row .val{color:#0d1f35;flex:1;font-weight:500;}

  /* ── Tabelas de notas ────────────────────────────────────────── */
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:10px;margin-top:6px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(13,31,53,0.05);}
  th{background:#0d1f35;color:#fff;padding:8px 6px;border:none;border-right:1px solid #1e3a5f;font-weight:700;text-align:center;letter-spacing:0.4px;text-transform:uppercase;font-size:9.5px;}
  th:last-child{border-right:none;}
  td{padding:6px 5px;border:none;border-right:1px solid #e2e8f0;border-top:1px solid #e2e8f0;text-align:center;}
  td:last-child{border-right:none;}
  tbody tr:first-child td{border-top:none;}

  /* ── Cards de resumo (assiduidade / financeiro) ──────────────── */
  .resumo-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:8px;}
  .card{background:#fff;border:1px solid #e2e8f0;border-top:3px solid #94a3b8;border-radius:6px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(13,31,53,0.04);transition:transform .2s ease;}
  .card .label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;font-weight:600;}
  .card .val{font-size:18px;font-weight:800;color:#0d1f35;line-height:1.1;}
  .card.ok{border-top-color:#16a34a;background:linear-gradient(180deg,#f0fdf4 0%,#fff 70%);}
  .card.ok .val{color:#16a34a;}
  .card.warn{border-top-color:#f59e0b;background:linear-gradient(180deg,#fffbeb 0%,#fff 70%);}
  .card.warn .val{color:#f59e0b;}
  .card.bad{border-top-color:#dc2626;background:linear-gradient(180deg,#fef2f2 0%,#fff 70%);}
  .card.bad .val{color:#dc2626;}

  /* ── Bloco final (assinaturas + verificação) ─────────────────── */
  .bloco-final{margin-top:18px;background:#fafbfc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;}
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:6px;padding-top:24px;}
  .assinaturas .ass{text-align:center;}
  .assinaturas .ass .linha{border-top:1.5px solid #0d1f35;margin:0 18px;padding-top:6px;}
  .assinaturas .ass .nome{font-size:11px;font-weight:700;color:#0d1f35;letter-spacing:0.3px;}
  .assinaturas .ass .cargo{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;margin-top:2px;font-weight:600;}

  .verificacao{margin-top:18px;display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;}
  .verificacao img{width:96px;height:96px;border:1px solid #e2e8f0;background:#fff;border-radius:4px;}
  .verificacao .info{font-size:9.5px;color:#475569;line-height:1.6;}
  .verificacao .info .lbl{font-weight:700;color:#0d1f35;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:3px;}
  .verificacao .url{font-family:'SF Mono','Courier New',monospace;font-size:8.5px;word-break:break-all;color:#0d1f35;background:#fef9f0;padding:4px 8px;border-radius:3px;border:1px solid #f0d99c;display:inline-block;margin-top:4px;}
  .verificacao .hash{font-family:'SF Mono','Courier New',monospace;font-size:8.5px;color:#64748b;margin-top:6px;display:block;}
  .verificacao .hash strong{color:#0d1f35;}

  .data-emissao{text-align:right;font-size:9.5px;color:#64748b;margin-top:10px;font-style:italic;padding:4px 0;border-top:1px dotted #cbd5e1;}

  @media print{
    .toolbar{display:none !important;}
    body{background:#fff !important;}
    .page{box-shadow:none !important;margin:0 !important;padding:10mm !important;background:#fff !important;border-radius:0 !important;}
    .page::before{display:block !important;}
    .header{border-bottom:1.5px solid #d4a017 !important;}
    .avatar{border:2px solid #fff !important;}
    .avatar-birth{background:#0d1f35 !important;color:#fff !important;}
    .titulo{background:#0d1f35 !important;color:#fff !important;}
    .secao-titulo{background:#fef9f0 !important;}
    th{background:#0d1f35 !important;color:#fff !important;}
    .card{background:#fff !important;}
    .card.ok{background:#f0fdf4 !important;}
    .card.warn{background:#fffbeb !important;}
    .card.bad{background:#fef2f2 !important;}
    /* Cabeçalho da tabela aparece apenas UMA vez (não repete em cada
       página), para que a informação flua continuamente quando partir.
       O rodapé também NÃO repete (caso contrário "MÉDIA GERAL" e
       "DISCIPLINAS APROVADAS" apareceriam duplicados). */
    thead{display:table-row-group;}
    tfoot{display:table-row-group;}
    .secao-titulo{page-break-after:avoid;break-after:avoid;}
    table{page-break-before:avoid;}
    tr{page-break-inside:avoid;break-inside:avoid;}
    tfoot tr{page-break-inside:avoid;break-inside:avoid;}
    .page-break{page-break-before:always;break-before:page;}
    .keep-together{page-break-inside:avoid;break-inside:avoid;}
    .ident,.bloco-final,.verificacao,.resumo-cards{page-break-inside:avoid;break-inside:avoid;}
  }
</style>
</head>
<body>
<div class="toolbar">
  <div class="tlbl">Ficha Individual · <strong>${escapeHtml(nomeCompleto)}</strong></div>
  <button class="btn-print" onclick="window.print()">↓ Imprimir / Guardar PDF</button>
  <button class="btn-reimp" onclick="window.location.reload()">↻ Reimprimir</button>
  <button class="btn-close" onclick="window.close()">✕ Fechar</button>
</div>
<div class="page">
  <div class="header">
    <div style="width:68px;flex-shrink:0;"></div>
    <div class="titles">
      ${logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="Logótipo" style="width:60px;height:60px;object-fit:contain;display:block;margin:0 auto 5px;"/>`
        : `<img src="/angola-brasao.png" alt="Brasão de Angola" style="width:52px;height:auto;display:block;margin:0 auto 5px;" onerror="this.style.display='none'"/>`
      }
      <div class="rep">República de Angola · Ministério da Educação</div>
      <div class="escola">${escapeHtml(nomeEscola)}</div>
      ${morada || tel || email ? `<div class="morada">${escapeHtml([morada, tel, email].filter(Boolean).join(" · "))}</div>` : ""}
    </div>
    <div class="badges">${badgeEmissao}</div>
  </div>

  <div class="titulo">Ficha Individual do Aluno${isAnual ? "" : ` &mdash; ${trimLabel}`}</div>

  <div class="ident">
    <div class="avatar-wrap">
      <div class="avatar">${fotoSrc ? `<img src="${escapeHtml(fotoSrc)}" alt="Foto"/>` : escapeHtml(iniciais)}</div>
      ${aluno.dataNascimento ? `<div class="avatar-birth">${fmtDateBr(String(aluno.dataNascimento))}</div>` : ""}
    </div>
    <div class="ident-data">
      <h3>${escapeHtml(nomeCompleto)}</h3>
      <div class="matricula">Nº de Matrícula: <strong>${escapeHtml(numMatricula)}</strong></div>
      <div class="grid">
        <div class="row"><span class="label">Data Nasc.</span><span class="val">${fmtDateBr(String(aluno.dataNascimento))} (${idade} anos)</span></div>
        <div class="row"><span class="label">Género</span><span class="val">${aluno.genero === "F" ? "Feminino" : "Masculino"}</span></div>
        <div class="row"><span class="label">Província</span><span class="val">${escapeHtml(aluno.provincia)}</span></div>
        <div class="row"><span class="label">Município</span><span class="val">${escapeHtml(aluno.municipio)}</span></div>
        <div class="row"><span class="label">Nº BI / Cédula</span><span class="val">${escapeHtml(aluno.numeroBi || aluno.numeroCedula || "—")}</span></div>
        <div class="row"><span class="label">Situação</span><span class="val" style="color:${situacaoCor};font-weight:700">${escapeHtml(situacaoLabel)}</span></div>
        <div class="row"><span class="label">Nome do Pai</span><span class="val">${escapeHtml(aluno.nomePai || "—")}</span></div>
        <div class="row"><span class="label">Nome da Mãe</span><span class="val">${escapeHtml(aluno.nomeMae || "—")}</span></div>
      </div>
    </div>
    <div class="barcode-wrap">
      <img src="${barcodeUrl}" alt="Barcode" onerror="this.style.display='none'"/>
      <div class="matricula-num">${escapeHtml(numMatricula)}</div>
    </div>
  </div>

  <div class="secao-titulo">Dados Académicos</div>
  <div class="grid">
    <div class="row"><span class="label">Turma</span><span class="val">${escapeHtml(aluno.turmaNome || "—")}</span></div>
    <div class="row"><span class="label">Classe</span><span class="val">${escapeHtml(aluno.turmaClasse || "—")}</span></div>
    <div class="row"><span class="label">Turno</span><span class="val">${escapeHtml(aluno.turmaTurno || "—")}</span></div>
    <div class="row"><span class="label">Nível</span><span class="val">${escapeHtml(aluno.turmaNivel || "—")}</span></div>
    <div class="row"><span class="label">Sala</span><span class="val">${escapeHtml(aluno.turmaSala || "—")}</span></div>
    <div class="row"><span class="label">Ano Lectivo</span><span class="val">${escapeHtml(aluno.turmaAnoLetivo || "—")}</span></div>
    <div class="row"><span class="label">Curso / Área</span><span class="val">${escapeHtml(aluno.cursoNome || "Ensino Geral")}</span></div>
    <div class="row"><span class="label">Data de Matrícula</span><span class="val">${fmtDateBr(aluno.createdAt as string)}</span></div>
  </div>

  <div class="secao-titulo">Encarregado de Educação</div>
  <div class="grid">
    <div class="row"><span class="label">Nome</span><span class="val">${escapeHtml(aluno.nomeEncarregado || "—")}</span></div>
    <div class="row"><span class="label">Telefone</span><span class="val">${escapeHtml(aluno.telefoneEncarregado || "—")}</span></div>
    <div class="row"><span class="label">Email</span><span class="val">${escapeHtml(aluno.emailEncarregado || "—")}</span></div>
    <div class="row"><span class="label">Profissão</span><span class="val">${escapeHtml(aluno.encarregadoProfissao || "—")}</span></div>
    <div class="row"><span class="label">Local de Trabalho</span><span class="val">${escapeHtml(aluno.encarregadoLocalTrabalho || "—")}</span></div>
    <div class="row"><span class="label">Residência</span><span class="val">${escapeHtml(aluno.encarregadoResidencia || "—")}</span></div>
  </div>

  <div class="secao-titulo">${isAnual ? "Notas Discriminadas" : `Notas do ${trimLabel}`} — ${escapeHtml(aluno.turmaAnoLetivo || "Ano Actual")}</div>
  ${disciplinas.length === 0 ? `<p style="font-size:10.5px;color:#64748b;font-style:italic;padding:14px;background:#fef9f0;border:1px dashed #f0d99c;border-radius:6px;text-align:center;margin-top:6px">Não há notas registadas para este aluno no ${trimLabelLower}.</p>` : tabelaNotasHtml}

  <div class="keep-together">
    <div class="secao-titulo">Assiduidade${isAnual ? "" : " (acumulada do ano lectivo)"}</div>
    <div class="resumo-cards">
      <div class="card ok"><div class="label">Presenças</div><div class="val">${fPres}</div></div>
      <div class="card warn"><div class="label">Faltas Justif.</div><div class="val">${fJus}</div></div>
      <div class="card bad"><div class="label">Faltas Injustif.</div><div class="val">${fInj}</div></div>
      <div class="card ${assiduidade != null ? (assiduidade >= 75 ? "ok" : assiduidade >= 50 ? "warn" : "bad") : ""}"><div class="label">Assiduidade</div><div class="val">${assiduidade != null ? assiduidade.toFixed(1) + "%" : "—"}</div></div>
    </div>
  </div>

  <div class="keep-together">
    <div class="secao-titulo">Histórico de Repetências${nRepetencias > 0 ? ` (${nRepetencias})` : ""}</div>
    ${reconfirmacoesHtml}
  </div>

  <div class="keep-together">
    <div class="secao-titulo">Situação Financeira${isAnual ? "" : " (acumulada do ano lectivo)"}</div>
    <div class="resumo-cards" style="grid-template-columns:repeat(5,1fr)">
      <div class="card ok"><div class="label">Pagamentos</div><div class="val">${fPag}</div></div>
      <div class="card ${fPend > 0 ? "bad" : "ok"}"><div class="label">Pendências</div><div class="val">${fPend}</div></div>
      <div class="card"><div class="label">Total Liquidado</div><div class="val" style="font-size:13px">${fmtAOA(fTotalPago)}</div></div>
      <div class="card ${fSaldo > 0 ? "ok" : fSaldo < 0 ? "bad" : ""}"><div class="label">Saldo Actual</div><div class="val" style="font-size:13px">${fmtAOA(fSaldo)}</div></div>
      <div class="card ${fPend === 0 ? "ok" : "bad"}"><div class="label">Estado</div><div class="val" style="font-size:12px">${fPend === 0 ? "Em dia" : "Vencido"}</div></div>
    </div>
  </div>

  <div class="bloco-final keep-together">
    <div class="assinaturas">
      <div class="ass">
        <div class="linha">
          <div class="nome">${escapeHtml(directorPedagogico || "_____________________")}</div>
          <div class="cargo">O(A) Subdirector(a) Pedagógico(a)</div>
        </div>
      </div>
      <div class="ass">
        <div class="linha">
          <div class="nome">${escapeHtml(directorGeral || "_____________________")}</div>
          <div class="cargo">O(A) Director(a) Geral</div>
        </div>
      </div>
    </div>

    <div class="verificacao">
      <img src="${qrUrl}" alt="QR Code de Verificação"/>
      <div class="info">
        <span class="lbl">Verificação de Autenticidade</span>
        Leia o código QR ou aceda ao endereço abaixo para confirmar a validade desta ficha.
        <div class="url">${escapeHtml(verifUrl)}</div>
        <span class="hash">Assinatura: <strong>${escapeHtml(hash)}</strong></span>
      </div>
    </div>

    <div class="data-emissao">Emitida em ${escapeHtml(dataEmissao)} · Emissão Nº ${emissaoNum}</div>
  </div>
</div>
</body></html>`;
}

function buildVerificacaoHtml(opts: {
  aluno: JsonObject | null;
  hashEsperado?: string;
  hashRecebido: string;
  totalEmissoes: number;
}): string {
  const { aluno, hashEsperado, hashRecebido, totalEmissoes } = opts;

  if (!aluno) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ficha Inválida</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Arial;background:#fef2f2;color:#7f1d1d;text-align:center;padding:40px 20px;margin:0}
.card{max-width:420px;margin:0 auto;background:#fff;border:2px solid #dc2626;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,0.08)}
h1{color:#dc2626;margin:8px 0}.icon{font-size:48px}</style></head>
<body><div class="card"><div class="icon">✗</div><h1>Ficha não encontrada</h1>
<p>O documento que está a tentar verificar não corresponde a nenhuma ficha emitida pelo sistema.</p>
<p style="font-size:11px;color:#94a3b8">Se acredita que isto é um erro, contacte a secretaria da escola.</p></div></body></html>`;
  }

  const valido = hashEsperado && hashRecebido === hashEsperado;
  const corPrincipal = valido ? "#16a34a" : "#dc2626";
  const fundoCard = valido ? "#f0fdf4" : "#fef2f2";
  const corBorda = valido ? "#16a34a" : "#dc2626";
  const titulo = valido ? "FICHA AUTÊNTICA" : "ASSINATURA INVÁLIDA";
  const icone = valido ? "✓" : "✗";

  const situacao = String(aluno.situacao || "activo");
  const situacaoLabel = SITUACAO_LABEL[situacao] || situacao;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Verificação de Ficha — ${escapeHtml(aluno.numeroMatricula)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:${fundoCard};color:#0f172a;margin:0;padding:20px;min-height:100vh;}
  .container{max-width:480px;margin:20px auto;}
  .banner{background:${corPrincipal};color:#fff;padding:18px;border-radius:10px 10px 0 0;text-align:center;}
  .banner .icon{font-size:48px;line-height:1;}
  .banner .titulo{font-size:18px;font-weight:bold;margin-top:6px;letter-spacing:1px;}
  .card{background:#fff;border:2px solid ${corBorda};border-top:none;border-radius:0 0 10px 10px;padding:18px;box-shadow:0 4px 14px rgba(0,0,0,0.08);}
  h2{font-size:16px;color:#0f172a;margin:0 0 4px;}
  .matricula{color:#64748b;font-family:'Courier New',monospace;font-size:13px;margin-bottom:14px;}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;}
  .row .lbl{color:#64748b;font-weight:600;}
  .row .val{color:#0f172a;font-weight:500;text-align:right;}
  .meta{margin-top:14px;font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;}
</style></head>
<body><div class="container">
<div class="banner">
  <div class="icon">${icone}</div>
  <div class="titulo">${titulo}</div>
</div>
<div class="card">
  <h2>${escapeHtml(aluno.nome)} ${escapeHtml(aluno.apelido)}</h2>
  <div class="matricula">Matrícula: ${escapeHtml(aluno.numeroMatricula)}</div>
  <div class="row"><span class="lbl">Turma</span><span class="val">${escapeHtml(aluno.turmaNome || "—")}</span></div>
  <div class="row"><span class="lbl">Classe</span><span class="val">${escapeHtml(aluno.turmaClasse || "—")}</span></div>
  <div class="row"><span class="lbl">Ano Lectivo</span><span class="val">${escapeHtml(aluno.turmaAnoLetivo || "—")}</span></div>
  <div class="row"><span class="lbl">Situação Académica</span><span class="val" style="color:${situacao === "activo" ? "#16a34a" : "#dc2626"};font-weight:bold">${escapeHtml(situacaoLabel)}</span></div>
  <div class="row"><span class="lbl">Total de emissões</span><span class="val">${totalEmissoes}</span></div>
  <div class="meta">
    Verificação realizada em ${new Date().toLocaleString("pt-PT")}.<br/>
    Para confirmar a autenticidade desta ficha, contacte directamente a secretaria da escola.
  </div>
</div></div></body></html>`;
}

export function registerFichaAlunoRoutes(app: Express) {
  // ─── Migração: tabela de emissões ─────────────────────────────────────
  (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.aluno_ficha_emissoes (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          "alunoId" varchar NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
          "userId" varchar,
          "userEmail" text,
          "userRole" text,
          "ipAddress" text,
          "userAgent" text,
          "emitidoEm" timestamp with time zone NOT NULL DEFAULT NOW()
        )
      `, []);
      await query(`CREATE INDEX IF NOT EXISTS idx_ficha_emissoes_aluno ON public.aluno_ficha_emissoes("alunoId")`, []);
    } catch (e) {
      console.warn("[migration] aluno_ficha_emissoes:", (e as Error).message);
    }
  })();

  // ─── GET /api/alunos/:id/ficha ────────────────────────────────────────
  app.get("/api/alunos/:id/ficha", requireAuth, async (req: Request, res: Response) => {
    try {
      const alunoId = req.params.id;
      const aluno = await obterAlunoCompleto(alunoId);
      if (!aluno) {
        res.status(404).type("html").send(`<h1>Aluno não encontrado</h1>`);
        return;
      }
      const config = await obterConfig();
      const turmaId = String(aluno.turmaId || "");
      const anoLetivo = String(aluno.turmaAnoLetivo || "");

      const [notas, faltas, financeiro, reconfirmacoes] = await Promise.all([
        turmaId && anoLetivo ? obterNotasAluno(alunoId, turmaId, anoLetivo) : Promise.resolve([]),
        turmaId ? obterFaltasAluno(alunoId, turmaId) : Promise.resolve({ presencas: 0, faltasInjustif: 0, faltasJustif: 0, total: 0 }),
        obterFinanceiroAluno(alunoId),
        query<JsonObject>(
          `SELECT id, "anoLetivo", status, data
           FROM public.reconfirmacoes_matricula
           WHERE "alunoId"=$1
           ORDER BY "anoLetivo" DESC`,
          [alunoId],
        ).catch(() => [] as JsonObject[]),
      ]);

      // Registar emissão
      const u = req.jwtUser;
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 300);
      try {
        await query(
          `INSERT INTO public.aluno_ficha_emissoes ("alunoId", "userId", "userEmail", "userRole", "ipAddress", "userAgent")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [alunoId, u?.userId || null, u?.email || null, u?.role || null, ip, ua],
        );
      } catch (e) {
        console.warn("[ficha] registar emissão:", (e as Error).message);
      }

      const totRows = await query<JsonObject>(
        `SELECT COUNT(*)::int AS total FROM public.aluno_ficha_emissoes WHERE "alunoId"=$1`,
        [alunoId],
      );
      const emissaoNum = Number(totRows[0]?.total || 1);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const hash = fichaHash(alunoId, String(aluno.numeroMatricula), String(aluno.createdAt));

      const trimRaw = String(req.query.trimestre || "anual").toLowerCase();
      const trimestre: TrimestreFiltro = (trimRaw === "1" || trimRaw === "2" || trimRaw === "3")
        ? (Number(trimRaw) as 1 | 2 | 3)
        : "anual";

      const templateBase = await obterTemplateFichaEditor();

      const html = buildFichaHtml({
        aluno,
        config,
        notas,
        faltas: faltas as JsonObject,
        financeiro: financeiro as JsonObject,
        reconfirmacoes: reconfirmacoes as JsonObject[],
        baseUrl,
        hash,
        emissaoNum,
        trimestre,
        templateBase,
      });

      res.type("html").send(html);
    } catch (e) {
      console.error("[ficha] erro:", e);
      res.status(500).type("html").send(`<h1>Erro ao gerar ficha</h1><pre>${(e as Error).message}</pre>`);
    }
  });

  // ─── GET /api/alunos/:id/ficha-reconfirmacao ─────────────────────────
  app.get("/api/alunos/:id/ficha-reconfirmacao", requireAuth, async (req: Request, res: Response) => {
    try {
      const alunoId = req.params.id;

      const templateBase = await obterTemplateReconfirmacao();
      if (!templateBase) {
        res.status(404).type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Template não encontrado</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center;background:#fef2f2;color:#7f1d1d;">
<h2>Template de Reconfirmação não configurado</h2>
<p>Aceda ao Editor de Documentos e configure o template <strong>"Ficha/Boletim de Reconfirmação de Matrícula"</strong>.</p>
</body></html>`);
        return;
      }

      const aluno = await obterAlunoCompleto(alunoId);
      if (!aluno) {
        res.status(404).type("html").send(`<h1>Aluno não encontrado</h1>`);
        return;
      }

      const config = await obterConfig();
      const turmaId = String(aluno.turmaId || "");
      const anoLetivo = String(aluno.turmaAnoLetivo || "");

      const [notas, faltas, financeiro] = await Promise.all([
        turmaId && anoLetivo ? obterNotasAluno(alunoId, turmaId, anoLetivo) : Promise.resolve([]),
        turmaId ? obterFaltasAluno(alunoId, turmaId) : Promise.resolve({ presencas: 0, faltasInjustif: 0, faltasJustif: 0, total: 0 }),
        obterFinanceiroAluno(alunoId),
      ]);

      const u = req.jwtUser;
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
      const ua = String(req.headers["user-agent"] || "").slice(0, 300);
      try {
        await query(
          `INSERT INTO public.aluno_ficha_emissoes ("alunoId", "userId", "userEmail", "userRole", "ipAddress", "userAgent")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [alunoId, u?.userId || null, u?.email || null, u?.role || null, ip, ua],
        );
      } catch (e) {
        console.warn("[ficha-reconfirmacao] registar emissão:", (e as Error).message);
      }

      const totRows = await query<JsonObject>(
        `SELECT COUNT(*)::int AS total FROM public.aluno_ficha_emissoes WHERE "alunoId"=$1`,
        [alunoId],
      );
      const emissaoNum = Number(totRows[0]?.total || 1);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const hash = fichaHash(alunoId, String(aluno.numeroMatricula), String(aluno.createdAt));

      // ── Configurações da escola ─────────────────────────────────────────
      const nomeEscola = String(config.nomeEscola || "Escola");
      const logoUrl = config.logoUrl ? String(config.logoUrl) : "";
      const morada = String(config.morada || "");
      const tel = String(config.telefoneEscola || "");
      const email = String(config.emailEscola || "");
      const notaMin = Number(config.notaMinimaAprovacao || 10);
      const directorGeral = String(config.directorGeral || "");
      const directorPedagogico = String(config.directorPedagogico || "");

      // ── Dados do aluno ──────────────────────────────────────────────────
      const nomeCompleto = `${aluno.nome || ""} ${aluno.apelido || ""}`.trim();
      const numMatricula = String(aluno.numeroMatricula || "");
      const idade = calcIdade(String(aluno.dataNascimento || ""));
      const situacao = String(aluno.situacao || "activo");
      const situacaoLabel = SITUACAO_LABEL[situacao] || situacao;
      const situacaoCor = situacao === "activo" ? "#16a34a" : situacao === "concluido" ? "#0369a1" : "#dc2626";
      const iniciais = `${(aluno.nome || "?").toString().charAt(0)}${(aluno.apelido || "").toString().charAt(0)}`.toUpperCase();
      const avatarBg = aluno.genero === "F" ? "#ec4899" : "#3b82f6";
      const fotoSrc = aluno.foto ? String(aluno.foto) : "";

      // ── Faltas / Assiduidade ────────────────────────────────────────────
      const fTotal = Number((faltas as JsonObject).total || 0);
      const fPres = Number((faltas as JsonObject).presencas || 0);
      const fInj = Number((faltas as JsonObject).faltasInjustif || 0);
      const fJus = Number((faltas as JsonObject).faltasJustif || 0);
      const assiduidade = fTotal > 0 ? (fPres / fTotal) * 100 : null;

      // ── Financeiro ──────────────────────────────────────────────────────
      const fPag = Number((financeiro as JsonObject).pagos || 0);
      const fPend = Number((financeiro as JsonObject).pendentes || 0);
      const fTotalPago = Number((financeiro as JsonObject).totalPago || 0);
      const fSaldo = Number((financeiro as JsonObject).saldo || 0);
      const financeiroEstado = fPend === 0 ? "EM DIA" : "VENCIDO";

      // ── Decisão de acesso (APROVADO / REPROVADO) ─────────────────────
      const decisao = calcDecisaoAcesso(notas, notaMin);

      // ── Classe e ano lectivo seguinte ───────────────────────────────────
      const classeProxima = calcProximaClasse(String(aluno.turmaClasse || ""));
      const anoLectivoProximo = calcAnoLectivoProximo(String(aluno.turmaAnoLetivo || ""));

      // ── Notas HTML ──────────────────────────────────────────────────────
      const isAnual = true;
      const trimLabelLower = "anual";
      const disciplinas = Array.from(new Set(notas.map(n => String(n.disciplina)))).sort((a, b) => a.localeCompare(b, "pt"));
      const fmt = (v: number | null) => (v != null && !isNaN(v) ? Number(v).toFixed(1) : "—");
      let totalAprovados = 0;

      const linhasNotas = disciplinas.map((disc, idx) => {
        const dn = notas.filter(n => n.disciplina === disc);
        const t1 = dn.find(n => Number(n.trimestre) === 1);
        const t2 = dn.find(n => Number(n.trimestre) === 2);
        const t3 = dn.find(n => Number(n.trimestre) === 3);
        const mt1 = t1?.mt1 != null ? Number(t1.mt1) : null;
        const mt2 = t2?.mt1 != null ? Number(t2.mt1) : null;
        const mt3 = t3?.mt1 != null ? Number(t3.mt1) : null;
        const nf1 = t1?.nf != null ? Number(t1.nf) : null;
        const nf2 = t2?.nf != null ? Number(t2.nf) : null;
        const nf3 = t3?.nf != null ? Number(t3.nf) : null;
        const validos = [mt1, mt2, mt3].filter((v): v is number => v != null && !isNaN(v));
        const mfd = validos.length > 0 ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
        const aprovado = mfd != null && mfd >= notaMin;
        if (aprovado) totalAprovados++;
        const corLinha = idx % 2 === 0 ? "#fff" : "#f8fafc";
        const corMfd = mfd != null ? (aprovado ? "#16a34a" : "#dc2626") : "#666";
        return `<tr style="background:${corLinha}">
          <td style="text-align:left;padding:5px 8px;border:1px solid #ccc;font-weight:600">${escapeHtml(disc)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(mt1)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(mt2)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(mt3)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(nf1)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(nf2)}</td>
          <td style="padding:5px;border:1px solid #ccc">${fmt(nf3)}</td>
          <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corMfd}">${fmt(mfd)}</td>
          <td style="padding:5px;border:1px solid #ccc;font-weight:bold;color:${corMfd}">${mfd != null ? (aprovado ? "Aprovado" : "Reprovado") : "—"}</td>
        </tr>`;
      }).join("");

      const tabelaNotasFicha = disciplinas.length === 0
        ? `<p style="font-size:10px;color:#64748b;font-style:italic;padding:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:4px;text-align:center">Não há notas registadas para este aluno no ano lectivo actual.</p>`
        : `<table style="width:100%;border-collapse:collapse;font-size:10px;">
            <thead>
              <tr>
                <th style="background:#0f172a;color:#fff;padding:6px 8px;border:1px solid #0f172a;text-align:left;width:30%">DISCIPLINA</th>
                <th style="background:#1e3a8a;color:#fff;padding:6px;border:1px solid #1e3a8a">MT 1ºT</th>
                <th style="background:#1e3a8a;color:#fff;padding:6px;border:1px solid #1e3a8a">MT 2ºT</th>
                <th style="background:#1e3a8a;color:#fff;padding:6px;border:1px solid #1e3a8a">MT 3ºT</th>
                <th style="background:#0e7490;color:#fff;padding:6px;border:1px solid #0e7490">NF 1ºT</th>
                <th style="background:#0e7490;color:#fff;padding:6px;border:1px solid #0e7490">NF 2ºT</th>
                <th style="background:#0e7490;color:#fff;padding:6px;border:1px solid #0e7490">NF 3ºT</th>
                <th style="background:#374151;color:#fff;padding:6px;border:1px solid #374151">MFD</th>
                <th style="background:#374151;color:#fff;padding:6px;border:1px solid #374151;width:11%">SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody>${linhasNotas}</tbody>
            <tfoot>
              <tr style="background:#f1f5f9;font-weight:bold">
                <td colspan="7" style="padding:5px 8px;border:1px solid #ccc;text-align:right;font-size:10.5px">DISCIPLINAS APROVADAS:</td>
                <td colspan="2" style="padding:5px 8px;border:1px solid #ccc;color:#16a34a;font-weight:bold;font-size:10.5px">${totalAprovados} / ${disciplinas.length}</td>
              </tr>
            </tfoot>
          </table>
          <p style="font-size:8.5px;color:#64748b;margin-top:3px;font-style:italic">Nota mínima de aprovação: ${notaMin}. MT = Média Trimestral. NF = Nota Final. MFD = Média Final de Disciplina.</p>`;

      // ── URLs e QR ────────────────────────────────────────────────────────
      const verifUrl = `${baseUrl}/api/alunos/${alunoId}/ficha/verificar?h=${hash}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(verifUrl)}&bgcolor=ffffff&color=0D1F35&margin=4&ecc=M`;
      const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(numMatricula || "SEM-MATRICULA")}&code=Code128&dpi=96&imagetype=Png&translate-esc=true`;

      // ── Outros ──────────────────────────────────────────────────────────
      const dataEmissao = new Date().toLocaleString("pt-PT", { dateStyle: "long", timeStyle: "short" });
      const dataActual = new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
      const badgeEmissao = emissaoNum === 1
        ? `<div style="background:#dcfce7;color:#15803d;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:bold;border:1px solid #86efac">1ª EMISSÃO (ORIGINAL)</div>`
        : `<div style="background:#fed7aa;color:#9a3412;padding:4px 10px;border-radius:4px;font-size:10px;font-weight:bold;border:1px solid #fb923c">REIMPRESSÃO Nº ${emissaoNum}</div>`;
      const logoHtml = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:64px;height:64px;object-fit:contain;"/>`
        : `<div style="width:64px;height:64px;"></div>`;
      const linhaContactoEscola = [morada, tel, email].filter(Boolean).join(" · ");
      const avatarHtml = fotoSrc
        ? `<img src="${escapeHtml(fotoSrc)}" alt="Foto" style="width:100%;height:100%;object-fit:cover;"/>`
        : escapeHtml(iniciais);
      const qrImg = `<img src="${qrUrl}" alt="QR Code de Verificação" style="width:100px;height:100px;" onerror="this.style.display='none'"/>`;
      const barcodeImg = `<img src="${barcodeUrl}" alt="Barcode" style="max-width:110px;height:40px;" onerror="this.style.display='none'"/>`;
      const notaMinStr = Number.isInteger(notaMin) ? String(notaMin) : notaMin.toFixed(1);

      // ── Mapa de variáveis completo ───────────────────────────────────────
      const vars: Record<string, string> = {
        LOGO_HTML: logoHtml,
        NOME_ESCOLA: escapeHtml(nomeEscola),
        LINHA_CONTACTO_ESCOLA: escapeHtml(linhaContactoEscola),
        BADGE_EMISSAO: badgeEmissao,
        AVATAR_HTML: avatarHtml,
        AVATAR_BG: avatarBg,
        NOME_COMPLETO: escapeHtml(nomeCompleto),
        NUMERO_MATRICULA: escapeHtml(numMatricula),
        DATA_NASCIMENTO: fmtDateBr(String(aluno.dataNascimento || "")),
        IDADE: String(idade),
        GENERO: aluno.genero === "F" ? "Feminino" : "Masculino",
        PROVINCIA: escapeHtml(String(aluno.provincia || "—")),
        MUNICIPIO: escapeHtml(String(aluno.municipio || "—")),
        BI: escapeHtml(String(aluno.numeroBi || aluno.numeroCedula || "—")),
        NOME_PAI: escapeHtml(String(aluno.nomePai || "—")),
        NOME_MAE: escapeHtml(String(aluno.nomeMae || "—")),
        SITUACAO: escapeHtml(situacaoLabel),
        SITUACAO_COR: situacaoCor,
        BARCODE_IMG: barcodeImg,
        TURMA: escapeHtml(String(aluno.turmaNome || "—")),
        CLASSE: escapeHtml(String(aluno.turmaClasse || "—")),
        TURNO: escapeHtml(String(aluno.turmaTurno || "—")),
        NIVEL: escapeHtml(String(aluno.turmaNivel || "—")),
        SALA: escapeHtml(String(aluno.turmaSala || "—")),
        ANO_LECTIVO: escapeHtml(String(aluno.turmaAnoLetivo || "—")),
        CURSO: escapeHtml(String(aluno.cursoNome || "Ensino Geral")),
        DATA_MATRICULA: fmtDateBr(aluno.createdAt as string),
        ENCARREGADO_NOME: escapeHtml(String(aluno.nomeEncarregado || "—")),
        ENCARREGADO_TELEFONE: escapeHtml(String(aluno.telefoneEncarregado || "—")),
        ENCARREGADO_EMAIL: escapeHtml(String(aluno.emailEncarregado || "—")),
        ENCARREGADO_PROFISSAO: escapeHtml(String(aluno.encarregadoProfissao || "—")),
        ENCARREGADO_LOCAL_TRABALHO: escapeHtml(String(aluno.encarregadoLocalTrabalho || "—")),
        ENCARREGADO_RESIDENCIA: escapeHtml(String(aluno.encarregadoResidencia || "—")),
        TABELA_NOTAS_FICHA: tabelaNotasFicha,
        TITULO_NOTAS: `NOTAS DO ANO LECTIVO ${escapeHtml(String(aluno.turmaAnoLetivo || "Actual"))}`,
        ASSIDUIDADE_TITULO: "ASSIDUIDADE (acumulada do ano lectivo)",
        ASSIDUIDADE_PRESENCAS: String(fPres),
        ASSIDUIDADE_FALTAS_J: String(fJus),
        ASSIDUIDADE_FALTAS_I: String(fInj),
        ASSIDUIDADE_PERCENT: assiduidade != null ? assiduidade.toFixed(1) + "%" : "—",
        FINANCEIRO_TITULO: "SITUAÇÃO FINANCEIRA (acumulada do ano lectivo)",
        FIN_PAGAMENTOS: String(fPag),
        FIN_PENDENCIAS: String(fPend),
        FIN_TOTAL_PAGO: fmtAOA(fTotalPago),
        FIN_SALDO: fmtAOA(fSaldo),
        FIN_ESTADO: financeiroEstado,
        DECISAO_ACESSO: decisao.decisao,
        DECISAO_ACESSO_COR: decisao.cor,
        DECISAO_ACESSO_BG: decisao.bg,
        CLASSE_PROXIMA: escapeHtml(classeProxima),
        ANO_LECTIVO_PROXIMO: escapeHtml(anoLectivoProximo),
        QR_VERIFICACAO: qrImg,
        URL_VERIFICACAO: escapeHtml(verifUrl),
        HASH_VERIFICACAO: escapeHtml(hash),
        NUMERO_EMISSAO: String(emissaoNum),
        DIRECTOR_PEDAGOGICO: escapeHtml(directorPedagogico || "_____________________"),
        DIRECTOR_GERAL: escapeHtml(directorGeral || "_____________________"),
        NOME_DIRECTOR_TURMA: escapeHtml(String(aluno.directorTurma || aluno.nomeDirectorTurma || "_____________________")),
        NOME_SUBDIRECTOR_PEDAGOGICO: escapeHtml(directorPedagogico || "_____________________"),
        ASSINATURA_ENCARREGADO: escapeHtml(String(aluno.nomeEncarregado || "_____________________")),
        ASSINATURA_DIRECTOR_TURMA: escapeHtml(String(aluno.directorTurma || aluno.nomeDirectorTurma || "_____________________")),
        ASSINATURA_DIRECTOR_GERAL: escapeHtml(directorGeral || "_____________________"),
        FINANCEIRO_ESTADO: escapeHtml(financeiroEstado),
        FIN_TOTAL_PAGO_TXT: escapeHtml(fmtAOA(fTotalPago)),
        FIN_SALDO_TXT: escapeHtml(fmtAOA(fSaldo)),
        NOTA_MINIMA: escapeHtml(notaMinStr),
        DATA_EMISSAO: escapeHtml(dataEmissao),
        DATA_ACTUAL: escapeHtml(dataActual),
      };

      const inner = applyVars(templateBase, vars);
      const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>Ficha de Reconfirmação de Matrícula — ${escapeHtml(nomeCompleto)}</title>
<style>
  @page { size: A4; margin: 8mm 6mm; }
  *,*::before,*::after{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;margin:0;color:#0f172a;line-height:1.4;}
  .toolbar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px;display:flex;gap:10px;justify-content:center;z-index:10;}
  .toolbar button{padding:8px 18px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;}
  .toolbar .btn-print{background:#16a34a;color:#fff;}
  .toolbar .btn-close{background:transparent;color:#fff;border:1px solid #fff !important;}
  table th{background:#0f172a;color:#fff;padding:6px;border:1px solid #0f172a;font-weight:bold;text-align:center;font-size:10px;}
  table td{padding:5px;border:1px solid #ccc;text-align:center;font-size:10px;}
  @media print {
    .toolbar{display:none !important;}
    body{background:#fff !important;}
    thead{display:table-row-group !important;}
    tfoot{display:table-row-group !important;}
    tr{page-break-inside:avoid !important;break-inside:avoid !important;}
    td,th{page-break-inside:avoid !important;break-inside:avoid !important;}
    div[style*="background:linear-gradient"]{page-break-after:avoid !important;break-after:avoid !important;}
    img{page-break-inside:avoid !important;break-inside:avoid !important;}
  }
</style>
</head>
<body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">&#8595; Imprimir / Guardar PDF</button>
  <button class="btn-close" onclick="window.close()">&#10005; Fechar</button>
</div>
${inner}
</body>
</html>`;

      res.type("html").send(html);
    } catch (e) {
      console.error("[ficha-reconfirmacao] erro:", e);
      res.status(500).type("html").send(`<h1>Erro ao gerar ficha de reconfirmação</h1><pre>${(e as Error).message}</pre>`);
    }
  });

  // ─── GET /api/alunos/:id/boletim-ii-ciclo ─────────────────────────────
  // Mostra os 3 trimestres numa tabela única (formato oficial angolano II Ciclo)
  app.get("/api/alunos/:id/boletim-ii-ciclo", requireAuth, async (req: Request, res: Response) => {
    try {
      const alunoId = req.params.id;

      // 1. Obter template
      const tplRows = await query<JsonObject>(
        `SELECT conteudo FROM public.doc_templates WHERE tipo='boletim_notas_ii_ciclo' AND bloqueado=false ORDER BY atualizado_em DESC LIMIT 1`,
        [],
      );
      if (!tplRows[0]) {
        res.status(404).type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:40px;text-align:center;background:#fef2f2;color:#7f1d1d;">
<h2>Template não configurado</h2>
<p>Aceda ao Editor de Documentos e configure o template <strong>"Boletim de Notas — II Ciclo"</strong>.</p>
</body></html>`);
        return;
      }
      const templateBase = String(tplRows[0].conteudo);

      // 2. Obter dados do aluno (com turma, curso e área de formação)
      const aluno = await obterAlunoCompleto(alunoId);
      if (!aluno) {
        res.status(404).type("html").send(`<h1>Aluno não encontrado</h1>`);
        return;
      }

      // 3. Obter configuração da escola
      const config = await obterConfig();

      const turmaId = String(aluno.turmaId || "");
      const anoLetivo = String(aluno.turmaAnoLetivo || "");

      console.log(`[boletim-ii-ciclo] alunoId=${alunoId} turmaId=${turmaId} anoLetivo=${anoLetivo}`);

      // 4. Notas dos 3 trimestres em query pivotada (MAC, NPT, MT por trimestre)
      // MAC: tenta mac → mac1 → média dos avais brutos (quando professor lança aval1-aval8 sem mac explícito)
      const macFallbackSQL = (_t: number) => {
        const avs = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8'];
        const sum = avs.join('+');
        const cnt = avs.map(a => `CASE WHEN ${a}>0 THEN 1 ELSE 0 END`).join('+');
        return `COALESCE(
          NULLIF(mac::numeric,0),
          NULLIF(mac1::numeric,0),
          NULLIF(CASE WHEN (${sum}) > 0 THEN ROUND((${sum})::numeric / NULLIF(${cnt},0), 1) END, 0),
          NULLIF(mt1::numeric,0),
          NULLIF(nf::numeric,0)
        )`;
      };
      // NPT: ppt → pp1 → (fallback quando sem MAC separado) mt1 → nf
      const nptFallbackSQL = () => `COALESCE(
        NULLIF(ppt::numeric,0),
        NULLIF(pp1::numeric,0),
        CASE WHEN COALESCE(NULLIF(mac::numeric,0), NULLIF(mac1::numeric,0)) IS NULL
          THEN COALESCE(NULLIF(mt1::numeric,0), NULLIF(nf::numeric,0))
          ELSE NULL
        END
      )`;
      const notasRows = await query<JsonObject>(
        `SELECT
          disciplina,
          MAX(CASE WHEN trimestre=1 THEN ${macFallbackSQL(1)} END) AS mac1,
          MAX(CASE WHEN trimestre=1 THEN ${nptFallbackSQL()} END) AS npt1,
          MAX(CASE WHEN trimestre=1 THEN NULLIF(mt1::numeric,0) END)  AS mt1,
          MAX(CASE WHEN trimestre=2 THEN ${macFallbackSQL(2)} END) AS mac2,
          MAX(CASE WHEN trimestre=2 THEN ${nptFallbackSQL()} END) AS npt2,
          MAX(CASE WHEN trimestre=2 THEN NULLIF(mt1::numeric,0) END)  AS mt2,
          MAX(CASE WHEN trimestre=3 THEN ${macFallbackSQL(3)} END) AS mac3,
          MAX(CASE WHEN trimestre=3 THEN ${nptFallbackSQL()} END) AS npt3,
          MAX(CASE WHEN trimestre=3 THEN NULLIF(mt1::numeric,0) END)  AS mt3
         FROM public.notas
         WHERE "alunoId"=$1 AND "turmaId"=$2 AND "anoLetivo"=$3
         GROUP BY disciplina
         ORDER BY disciplina`,
        [alunoId, turmaId, anoLetivo],
      );

      // DIAGNÓSTICO: imprimir os primeiros campos brutos para perceber o que está na BD
      if (notasRows.length > 0) {
        const rawSample = await query<JsonObject>(
          `SELECT disciplina, trimestre, mac, mac1, ppt, pp1, mt1, nf,
                  aval1, aval2, aval3, aval4, aval5, aval6, aval7, aval8,
                  pg1, pg2, ex1, ex2
           FROM public.notas
           WHERE "alunoId"=$1 AND "turmaId"=$2 AND "anoLetivo"=$3
           ORDER BY disciplina, trimestre
           LIMIT 6`,
          [alunoId, turmaId, anoLetivo],
        ).catch(() => [] as JsonObject[]);
        console.log(`[boletim-diag] Campos brutos da BD (primeiras 6 linhas):`, JSON.stringify(rawSample, null, 0));
      }
      if (notasRows.length === 0) {
        // Diagnóstico: verificar se existem notas para este aluno com outros critérios
        const diagRows = await query<JsonObject>(
          `SELECT DISTINCT "turmaId", "anoLetivo", COUNT(*) as total
           FROM public.notas
           WHERE "alunoId"=$1
           GROUP BY "turmaId", "anoLetivo"
           ORDER BY "anoLetivo" DESC
           LIMIT 10`,
          [alunoId],
        ).catch(() => [] as JsonObject[]);
        if (diagRows.length > 0) {
          console.warn(`[boletim-ii-ciclo] AVISO: nenhuma nota encontrada com turmaId=${turmaId} anoLetivo=${anoLetivo}, mas o aluno tem notas noutras combinações:`, JSON.stringify(diagRows));
        } else {
          console.warn(`[boletim-ii-ciclo] AVISO: aluno ${alunoId} não tem notas registadas na tabela public.notas.`);
        }
      } else {
        console.log(`[boletim-ii-ciclo] ${notasRows.length} disciplina(s) encontrada(s):`, notasRows.map((r: JsonObject) => r.disciplina).join(", "));
      }

      // 5. Faltas anuais totais
      let faltasNaoComparencia = 0;
      let faltasIndisciplina = 0;
      try {
        const fRows = await query<JsonObject>(
          `SELECT
            SUM(CASE WHEN status='F' THEN 1 ELSE 0 END)::int AS faltas_f,
            SUM(CASE WHEN status='J' THEN 1 ELSE 0 END)::int AS faltas_j
           FROM public.presencas
           WHERE "alunoId"=$1 AND "turmaId"=$2`,
          [alunoId, turmaId],
        );
        faltasNaoComparencia = Number(fRows[0]?.faltas_f || 0);
        faltasIndisciplina = Number(fRows[0]?.faltas_j || 0);
      } catch { /* presencas opcionais */ }

      // 6. Construir tabela dos 3 trimestres: Nº | Disciplinas | MAC NPT MT1 | MAC NPT MT2 | MAC NPT MT3 | Obs
      const fmt = (v: unknown): string => {
        const n = Number(v);
        return (v != null && v !== "" && !isNaN(n) && n > 0) ? String(Math.round(n * 10) / 10) : "";
      };
      const mtColor = (v: unknown) => (v != null && Number(v) > 0) ? (Number(v) >= 10 ? "#1a5276" : "#c0392b") : "#000";

      const thC = `border:1px solid #000;padding:3px 2px;text-align:center;font-weight:bold;font-size:8pt;background:#efefef;`;
      const tdN = `border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;`;
      const tdD = `border:1px solid #000;padding:3px 5px;text-align:left;font-size:9pt;`;
      const tdV = `border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;min-width:28px;`;
      const tdO = `border:1px solid #000;padding:3px 4px;text-align:left;font-size:8pt;`;

      // Determinar nota final por disciplina para Obs. (Transita / Não Transita)
      // Prioridade: MT3 → NPT3 → MT2 → NPT2 → MT1 → NPT1
      const gradeFinale = (n: JsonObject): number => {
        const candidates = [n.mt3, n.npt3, n.mt2, n.npt2, n.mt1, n.npt1];
        for (const c of candidates) {
          const v = Number(c);
          if (v > 0) return v;
        }
        return 0;
      };

      let negativasCount = 0;
      let disciplinasComNota = 0;

      let linhasNotas = "";
      for (let i = 0; i < notasRows.length; i++) {
        const n = notasRows[i];
        const gf = gradeFinale(n);
        let obsHtml = "&nbsp;";
        if (gf > 0) {
          disciplinasComNota++;
          if (gf >= 10) {
            obsHtml = `<span style="color:#1a5276;font-size:7.5pt;font-weight:bold;">Transita</span>`;
          } else {
            negativasCount++;
            obsHtml = `<span style="color:#c0392b;font-size:7.5pt;font-weight:bold;">Não Transita</span>`;
          }
        }
        linhasNotas += `<tr>
          <td style="${tdN}">${i + 1}</td>
          <td style="${tdD}">${escapeHtml(String(n.disciplina || ""))}</td>
          <td style="${tdV}">${fmt(n.mac1)}</td>
          <td style="${tdV}">${fmt(n.npt1)}</td>
          <td style="${tdV}font-weight:bold;color:${mtColor(n.mt1)};">${fmt(n.mt1)}</td>
          <td style="${tdV}">${fmt(n.mac2)}</td>
          <td style="${tdV}">${fmt(n.npt2)}</td>
          <td style="${tdV}font-weight:bold;color:${mtColor(n.mt2)};">${fmt(n.mt2)}</td>
          <td style="${tdV}">${fmt(n.mac3)}</td>
          <td style="${tdV}">${fmt(n.npt3)}</td>
          <td style="${tdV}font-weight:bold;color:${mtColor(n.mt3)};">${fmt(n.mt3)}</td>
          <td style="${tdO}">${obsHtml}</td>
        </tr>`;
      }
      // 2 linhas em branco extras
      const blankCells = Array(10).fill(`<td style="${tdV}">&nbsp;</td>`).join("");
      const linhaVazia = `<tr><td style="${tdN}">&nbsp;</td><td style="${tdD}">&nbsp;</td>${blankCells}<td style="${tdO}">&nbsp;</td></tr>`;
      linhasNotas += linhaVazia + linhaVazia;

      // Linha de resultado final (Transita / Não Transita)
      const temDados = disciplinasComNota > 0;
      const transitaGeral = temDados && negativasCount === 0;
      const resultadoFinalTexto = !temDados
        ? "Aguarda lançamento de notas"
        : transitaGeral
          ? "✓ TRANSITA"
          : `✗ NÃO TRANSITA (${negativasCount} negativa${negativasCount > 1 ? "s" : ""})`;
      const resultadoCor = !temDados ? "#888" : transitaGeral ? "#1a5276" : "#c0392b";
      linhasNotas += `<tr>
        <td colspan="11" style="border:1px solid #000;padding:5px 8px;text-align:right;font-size:9pt;font-weight:bold;background:#f5f5f5;">
          Resultado Final:
        </td>
        <td style="border:1px solid #000;padding:5px 4px;text-align:center;font-size:8.5pt;font-weight:bold;color:${resultadoCor};background:#f5f5f5;white-space:nowrap;">
          ${resultadoFinalTexto}
        </td>
      </tr>`;

      const tabelaNotasIICiclo = `<table style="width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;">
        <colgroup>
          <col style="width:28px;"/>
          <col style="width:auto;"/>
          <col style="width:30px;"/><col style="width:30px;"/><col style="width:30px;"/>
          <col style="width:30px;"/><col style="width:30px;"/><col style="width:30px;"/>
          <col style="width:30px;"/><col style="width:30px;"/><col style="width:30px;"/>
          <col style="width:55px;"/>
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2" style="${thC}">Nº</th>
            <th rowspan="2" style="${thC}text-align:left;">Disciplinas</th>
            <th colspan="3" style="${thC}">NOTAS DO Iº TRIMESTRE</th>
            <th colspan="3" style="${thC}">NOTAS DO IIº TRIMESTRE</th>
            <th colspan="3" style="${thC}">NOTAS DO IIIº TRIMESTRE</th>
            <th rowspan="2" style="${thC}">Obs.</th>
          </tr>
          <tr>
            <th style="${thC}">MAC</th><th style="${thC}">NPT</th><th style="${thC}">MT1</th>
            <th style="${thC}">MAC</th><th style="${thC}">NPT</th><th style="${thC}">MT2</th>
            <th style="${thC}">MAC</th><th style="${thC}">NPT</th><th style="${thC}">MT3</th>
          </tr>
        </thead>
        <tbody>${linhasNotas}</tbody>
      </table>`;

      // 7. Variáveis de texto
      const dataActual = new Date();
      const mesesNomes = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const dataPorExtenso = `${dataActual.getDate()} de ${mesesNomes[dataActual.getMonth() + 1]} de ${dataActual.getFullYear()}`;

      const nomeEscola = String(config.nomeEscola || "");
      const municipio = String(config.municipioEscola || config.morada || "Luanda");
      const provincia = String(config.provinciaEscola || "");
      const directorGeral = String(config.directorGeral || "___________________________");
      const directorPedagogico = String(config.directorPedagogico || "___________________________");
      const areaFormacao = String(aluno.cursoAreaFormacao || aluno.cursoNome || "Ciências e Tecnologias");

      // Logo / brasão
      const logoUrl = config.logoUrl ? String(config.logoUrl) : "";
      const brasaoHtml = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="Logótipo" style="width:66px;height:66px;object-fit:contain;display:block;"/>`
        : `<img src="/angola-brasao.png" alt="Brasão de Angola" style="width:66px;height:auto;display:block;"/>`;

      const nomeCompleto = `${aluno.nome || ""} ${aluno.apelido || ""}`.trim();
      const telefoneAluno = String(aluno.telefone || "");
      const numeroMatricula = String(aluno.numeroMatricula || "");

      // Derivar ano e município para o rodapé
      const anoLetivoAno = anoLetivo.includes("/")
        ? anoLetivo.split("/").pop()!.trim()
        : String(new Date().getFullYear());
      const municipioTitulo = municipio
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

      // 8. Mapa completo de variáveis
      const vars: Record<string, string> = {
        BRASAO_HTML: brasaoHtml,
        NOME_ESCOLA: escapeHtml(nomeEscola.toUpperCase()),
        NOME_ESCOLA_CURTA: escapeHtml(nomeEscola),
        PROVINCIA: escapeHtml(provincia.toUpperCase()),
        MUNICIPIO: escapeHtml(municipio.toUpperCase()),
        MUNICIPIO_TITULO: escapeHtml(municipioTitulo),
        AREA_FORMACAO: escapeHtml(areaFormacao.toUpperCase()),
        CLASSE: escapeHtml(String(aluno.turmaClasse || "—")),
        TURMA: escapeHtml(String(aluno.turmaNome || "—")),
        ANO_LECTIVO: escapeHtml(anoLetivo || "—"),
        ANO_LECTIVO_ANO: escapeHtml(anoLetivoAno),
        NOME_COMPLETO: escapeHtml(nomeCompleto),
        NUMERO_MATRICULA: escapeHtml(numeroMatricula),
        TELEFONE_ALUNO: escapeHtml(telefoneAluno),
        TABELA_NOTAS_II_CICLO: tabelaNotasIICiclo,
        FALTAS_NAO_COMPARENCIA: String(faltasNaoComparencia || ""),
        FALTAS_INDISCIPLINA: String(faltasIndisciplina || ""),
        COMPORTAMENTO: "",
        DATA_POR_EXTENSO: escapeHtml(dataPorExtenso),
        DATA_EMISSAO_EXTENSO: escapeHtml(dataPorExtenso),
        DATA_ACTUAL: escapeHtml(dataPorExtenso),
        NOME_SUBDIRECTOR_PEDAGOGICO: escapeHtml(directorPedagogico),
        NOME_ENCARREGADO: escapeHtml(String(aluno.nomeEncarregado || "___________________________")),
        DIRECTOR_GERAL: escapeHtml(directorGeral),
        VISTO_DATA: `___/___/______`,
        MINISTERIO_LINHA2: "MINISTÉRIO DA EDUCAÇÃO",
        ANO_LECTIVO_EXIBIR: escapeHtml(anoLetivo || "—"),
        TRIMESTRE_NOME: "ANUAL",
        CURSO: escapeHtml(String(aluno.cursoNome || "")),
        TURNO: escapeHtml(String(aluno.turmaTurno || "")),
        SALA: escapeHtml(String(aluno.turmaSala || "")),
        NOME_DIRECTOR_TURMA: "___________________________",
      };

      const inner = applyVars(templateBase, vars);
      const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<title>Boletim de Notas II Ciclo — ${escapeHtml(nomeCompleto)}</title>
<style>
  @page { size: A4; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #fff; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>${inner}</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(html);
    } catch (e) {
      console.error("[boletim-ii-ciclo] erro:", e);
      res.status(500).type("html").send(`<h1>Erro ao gerar boletim II Ciclo</h1><pre>${(e as Error).message}</pre>`);
    }
  });

  // ─── GET /api/alunos/:id/ficha/verificar (público) ────────────────────
  app.get("/api/alunos/:id/ficha/verificar", async (req: Request, res: Response) => {
    try {
      const alunoId = req.params.id;
      const hashRecebido = String(req.query.h || "");

      const aluno = await obterAlunoCompleto(alunoId);
      if (!aluno) {
        res.status(404).type("html").send(buildVerificacaoHtml({ aluno: null, hashRecebido, totalEmissoes: 0 }));
        return;
      }
      const hashEsperado = fichaHash(alunoId, String(aluno.numeroMatricula), String(aluno.createdAt));
      const totRows = await query<JsonObject>(
        `SELECT COUNT(*)::int AS total FROM public.aluno_ficha_emissoes WHERE "alunoId"=$1`,
        [alunoId],
      );
      const totalEmissoes = Number(totRows[0]?.total || 0);

      const status = hashRecebido === hashEsperado ? 200 : 400;
      res.status(status).type("html").send(buildVerificacaoHtml({ aluno, hashEsperado, hashRecebido, totalEmissoes }));
    } catch (e) {
      console.error("[ficha verificar] erro:", e);
      res.status(500).type("html").send(`<h1>Erro</h1><pre>${(e as Error).message}</pre>`);
    }
  });

  // ─── GET /api/alunos/:id/ficha/emissoes (CEO/auditoria) ───────────────
  app.get("/api/alunos/:id/ficha/emissoes", requireAuth, async (req: Request, res: Response) => {
    try {
      const u = req.jwtUser;
      if (!u || !["ceo", "pca", "admin", "director", "secretaria", "chefe_secretaria"].includes(u.role)) {
        res.status(403).json({ error: "Acesso restrito." });
        return;
      }
      const alunoId = req.params.id;
      const rows = await query(
        `SELECT id, "userId", "userEmail", "userRole", "ipAddress", "userAgent", "emitidoEm"
         FROM public.aluno_ficha_emissoes WHERE "alunoId"=$1
         ORDER BY "emitidoEm" DESC LIMIT 100`,
        [alunoId],
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
