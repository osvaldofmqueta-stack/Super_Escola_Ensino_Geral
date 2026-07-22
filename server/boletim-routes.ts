import type { Express, Request, Response } from "express";
import { query } from "./db";
import { requireAuth, requirePermission } from "./auth";
import * as crypto from "crypto";
import { anoInicioDe } from "../lib/anoLetivo";
import { calcularTransicaoAngola, calcularObsDisciplina, isClasseICicloRestricao, isClasseIICicloRestricao } from "../lib/angola-transicao";

type JsonObject = Record<string, unknown>;

const TRIMESTRE_MESES: Record<number, number[]> = {
  1: [9, 10, 11, 12],
  2: [1, 2, 3],
  3: [4, 5, 6, 7],
};

const ROLES_EMITIR_BOLETIM = new Set([
  "secretaria",
  "chefe_secretaria",
  "director",
  "ceo",
  "pca",
  "admin",
]);

const ROLES_ASSINAR_BOLETIM = new Set(["director", "ceo", "pca", "admin"]);

function json(res: Response, code: number, payload: unknown) {
  res.status(code).json(payload);
}

function gerarNumeroSerie(tipo: "trimestral" | "anual", anoLetivo: string, trimestre?: number): string {
  const ano = String(anoInicioDe(anoLetivo) + 1);
  const seq = Math.floor(Math.random() * 900000) + 100000;
  if (tipo === "anual") return `BAN-${ano}-${seq}`;
  return `BT-${ano}-T${trimestre}-${seq}`;
}

function gerarHash(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload) + Date.now()).digest("hex").slice(0, 32);
}

async function obterAlunoComUtilizador(userId: string) {
  const rows = await query<JsonObject>(
    `SELECT a.*, t.nome AS turma_nome, t.classe AS turma_classe, t.sala AS turma_sala, t.nivel AS turma_nivel, t."anoLetivo" AS turma_ano_letivo
     FROM public.alunos a
     LEFT JOIN public.turmas t ON t.id = a."turmaId"
     WHERE a."utilizadorId" = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function obterAlunoPorId(alunoId: string) {
  const rows = await query<JsonObject>(
    `SELECT a.*, t.nome AS turma_nome, t.classe AS turma_classe, t.sala AS turma_sala, t.nivel AS turma_nivel, t."anoLetivo" AS turma_ano_letivo
     FROM public.alunos a
     LEFT JOIN public.turmas t ON t.id = a."turmaId"
     WHERE a.id = $1 LIMIT 1`,
    [alunoId],
  );
  return rows[0] || null;
}

async function verificarPropinasEmDia(alunoId: string, anoLetivo: string, ateMes?: number): Promise<{ emDia: boolean; mesesPendentes: number[]; detalhe: string }> {
  const ano = anoInicioDe(anoLetivo) + 1;
  const taxaPropina = await query<JsonObject>(
    `SELECT * FROM public.taxas WHERE tipo='propina' AND ativo=true AND "anoAcademico"=$1 LIMIT 1`,
    [anoLetivo],
  );
  if (!taxaPropina[0]) {
    return { emDia: true, mesesPendentes: [], detalhe: "Sem cobrança de propina configurada para este ano lectivo." };
  }
  const mesesEsperados = ateMes
    ? Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => {
        if (ateMes >= 9) return m >= 9 && m <= ateMes;
        return m >= 9 || m <= ateMes;
      })
    : [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

  const pagos = await query<JsonObject>(
    `SELECT mes FROM public.pagamentos
     WHERE "alunoId"=$1 AND "taxaId"=$2 AND status='pago' AND ano IN ($3, $4)`,
    [alunoId, taxaPropina[0].id, ano - 1, ano],
  );
  const mesesPagos = new Set(pagos.map((p) => Number(p.mes)).filter((m) => !isNaN(m)));
  const pendentes = mesesEsperados.filter((m) => !mesesPagos.has(m));
  const nomesMeses = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return {
    emDia: pendentes.length === 0,
    mesesPendentes: pendentes,
    detalhe: pendentes.length === 0 ? "Propinas em dia." : `Propinas em falta: ${pendentes.map((m) => nomesMeses[m]).join(", ")}`,
  };
}

async function verificarTrimestreLancado(turmaId: string, alunoId: string, trimestre: number, anoLetivo: string): Promise<{ completo: boolean; totalDisciplinas: number; lancadas: number; faltam: string[] }> {
  const disciplinasTurma = await query<JsonObject>(
    `SELECT d.id, d.nome FROM public.turma_disciplinas td
     JOIN public.disciplinas d ON d.id = td."disciplinaId"
     WHERE td."turmaId"=$1`,
    [turmaId],
  );
  if (disciplinasTurma.length === 0) {
    return { completo: false, totalDisciplinas: 0, lancadas: 0, faltam: ["Sem disciplinas atribuídas à turma."] };
  }
  const notas = await query<JsonObject>(
    `SELECT disciplina, lancado FROM public.notas
     WHERE "alunoId"=$1 AND "turmaId"=$2 AND trimestre=$3 AND "anoLetivo"=$4`,
    [alunoId, turmaId, trimestre, anoLetivo],
  );
  const lancadas = notas.filter((n) => n.lancado === true).map((n) => String(n.disciplina));
  const faltam = disciplinasTurma
    .map((d) => String(d.nome))
    .filter((nome) => !lancadas.includes(nome));
  return { completo: faltam.length === 0, totalDisciplinas: disciplinasTurma.length, lancadas: lancadas.length, faltam };
}

async function notificarEncarregado(alunoId: string, titulo: string, mensagem: string, link?: string) {
  try {
    const enc = await query<JsonObject>(
      `SELECT id FROM public.utilizadores WHERE role='encarregado' AND "alunoId"=$1 LIMIT 1`,
      [alunoId],
    );
    if (enc[0]) {
      await query(
        `INSERT INTO public.notificacoes (id, "utilizadorId", titulo, mensagem, tipo, link, lida, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'info', $4, false, NOW())`,
        [enc[0].id, titulo, mensagem, link || null],
      );
    }
  } catch (e) {
    console.warn("[boletim] notify guardian:", (e as Error).message);
  }
}

async function obterNotasAluno(alunoId: string, turmaId: string, anoLetivo: string, trimestre?: number) {
  const where = trimestre
    ? `WHERE n."alunoId"=$1 AND n."turmaId"=$2 AND n."anoLetivo"=$3 AND n.trimestre=$4`
    : `WHERE n."alunoId"=$1 AND n."turmaId"=$2 AND n."anoLetivo"=$3`;
  const params = trimestre ? [alunoId, turmaId, anoLetivo, trimestre] : [alunoId, turmaId, anoLetivo];
  return query<JsonObject>(
    `SELECT n.*, p.nome AS professor_nome FROM public.notas n
     LEFT JOIN public.professores p ON p.id = n."professorId"
     ${where} ORDER BY n.disciplina, n.trimestre`,
    params,
  );
}

async function obterDadosEscola() {
  const rows = await query<JsonObject>(
    `SELECT chave, valor FROM public.config_geral WHERE chave IN
     ('NOME_ESCOLA','MUNICIPIO','PROVINCIA','NOME_DIRECTOR','NOME_DIRECTOR_PEDAGOGICO','NIVEL_ENSINO','TELEFONE_ESCOLA','EMAIL_ESCOLA','MORADA_ESCOLA')`,
    [],
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[String(r.chave)] = String(r.valor || "");
  return out;
}

function calcularSituacao(nf: number | null): { situacao: string; cor: string; bg: string } {
  if (nf === null || isNaN(nf)) return { situacao: "—", cor: "#6b7280", bg: "#f3f4f6" };
  if (nf >= 14) return { situacao: "BOM", cor: "#15803d", bg: "#dcfce7" };
  if (nf >= 10) return { situacao: "APTO", cor: "#15803d", bg: "#dcfce7" };
  return { situacao: "REPROVADO", cor: "#b91c1c", bg: "#fee2e2" };
}

function corNota(nf: number | null): string {
  if (nf === null || isNaN(nf)) return "#6b7280";
  if (nf >= 14) return "#15803d";
  if (nf >= 10) return "#1e40af";
  return "#b91c1c";
}

function nomeMesPt(mes: number): string {
  return ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][mes] || "";
}

function dataActualPt(): string {
  const d = new Date();
  return `${d.getDate()} de ${nomeMesPt(d.getMonth() + 1)} de ${d.getFullYear()}`;
}

function buildBoletimHtml(opts: {
  aluno: JsonObject;
  notas: JsonObject[];
  escola: Record<string, string>;
  tipo: "trimestral" | "anual";
  trimestre?: number;
  numeroSerie: string;
  hash: string;
  baseUrl: string;
  assinadoPor?: string;
  pendenteAssinatura?: boolean;
  /** Art. 23º §2 — I Ciclo (7ª/8ª): restrição pelas disciplinas nucleares */
  restricaoArt23ICiclo?: boolean;
  /** Art. 23º §2 — II Ciclo (10ª/11ª/12ª): mesma restrição */
  restricaoArt23IICiclo?: boolean;
  /** Nomes das disciplinas marcadas como nuclear Art. 23 (ex: ["Língua Portuguesa","Matemática"]) */
  disciplinasNuclearArt23?: string[];
}): string {
  const { aluno, notas, escola, tipo, trimestre, numeroSerie, hash, baseUrl, assinadoPor, pendenteAssinatura } = opts;

  const disciplinas = Array.from(new Set(notas.map((n) => String(n.disciplina))));
  const fmt = (v: any) => (v != null && !isNaN(Number(v)) ? Number(v).toFixed(1) : "—");
  const td = (content: string, opts: { align?: string; bold?: boolean; bg?: string; color?: string; w?: string } = {}) =>
    `<td style="padding:7px 8px;border:1px solid #cbd5e1;text-align:${opts.align || 'center'};${opts.bold ? 'font-weight:700;' : ''}${opts.bg ? `background:${opts.bg};` : ''}${opts.color ? `color:${opts.color};` : ''}${opts.w ? `width:${opts.w};` : ''}">${content}</td>`;

  const todasAsNotas: number[] = [];

  // Usa nf (Nota Final com NPT incluída) da BD; fallback para mt1 quando nf=0
  const nfOuMt = (nota: any): number | null => {
    if (!nota) return null;
    const nfVal = nota.nf != null ? Number(nota.nf) : 0;
    const mtVal = nota.mt1 != null ? Number(nota.mt1) : 0;
    return nfVal > 0 ? nfVal : mtVal > 0 ? mtVal : null;
  };
  const macVal = (nota: any): number | null => {
    if (!nota) return null;
    const m = (nota.mac != null ? Number(nota.mac) : 0) > 0 ? Number(nota.mac) : (nota.mac1 != null ? Number(nota.mac1) : 0);
    return m > 0 ? m : null;
  };
  const nptVal = (nota: any): number | null => {
    if (!nota) return null;
    const v = nota.ppt != null ? Number(nota.ppt) : 0;
    return v > 0 ? v : null;
  };
  const ntVal = (nota: any): number | null => {
    if (!nota) return null;
    const v = nota.mt1 != null ? Number(nota.mt1) : 0;
    return v > 0 ? v : null;
  };

  // Colecta MFDs para cálculo de transição Angola MED (boletim anual)
  const mfdsParaTransicao: { nome: string; mfd: number }[] = [];

  const linhas = disciplinas.map((disc, idx) => {
    const dn = notas.filter((n) => n.disciplina === disc);
    const t1 = dn.find((n) => n.trimestre === 1);
    const t2 = dn.find((n) => n.trimestre === 2);
    const t3 = dn.find((n) => n.trimestre === 3);

    // MFD: usa nf com fallback para mt1 — não exige obrigatoriamente 3 trimestres
    const mfdVals = [t1, t2, t3].map(nfOuMt).filter((v): v is number => v !== null);
    const mfd = tipo === "anual" && mfdVals.length > 0 ? mfdVals.reduce((a, b) => a + b, 0) / mfdVals.length : null;
    const hasAll3 = t1 !== undefined && t2 !== undefined && t3 !== undefined;

    const tActual = trimestre === 1 ? t1 : trimestre === 2 ? t2 : t3;
    const nfFinal = tipo === "trimestral" ? nfOuMt(tActual) : mfd;
    const nfNum = nfFinal != null ? Number(nfFinal) : null;
    const sit = calcularSituacao(nfNum);
    if (nfNum != null) todasAsNotas.push(nfNum);

    // Recolhe para cálculo Angola MED (só anual e com MFD válida)
    if (tipo === "anual" && mfd !== null) {
      mfdsParaTransicao.push({ nome: disc, mfd });
    }

    const zebra = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const siBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${sit.bg};color:${sit.cor};font-weight:700;font-size:10px">${sit.situacao}</span>`;

    // Coluna Obs: T / NT por disciplina (norma Angola MED)
    const obsDisc = tipo === "anual" ? calcularObsDisciplina(mfd, hasAll3) : calcularObsDisciplina(nfNum, hasAll3);
    const obsCell = td(obsDisc.html, { align: 'center' });

    if (tipo === "anual") {
      const tdMac = (n: any) => td(fmt(macVal(n)), { color: '#475569' });
      const tdNpt = (n: any) => td(fmt(nptVal(n)), { color: '#334155' });
      const tdT   = (n: any, v: number | null) => td(fmt(v), { color: corNota(v) });
      return `<tr style="background:${zebra}">
        ${td(`<strong style="font-size:10.5px">${disc}</strong>`, { align: 'left' })}
        ${tdMac(t1)}${tdNpt(t1)}${tdT(t1, nfOuMt(t1))}
        ${tdMac(t2)}${tdNpt(t2)}${tdT(t2, nfOuMt(t2))}
        ${tdMac(t3)}${tdNpt(t3)}${tdT(t3, nfOuMt(t3))}
        ${td(fmt(mfd), { bold: true, color: corNota(mfd) })}
        ${td(siBadge)}
        ${obsCell}
      </tr>`;
    }
    return `<tr style="background:${zebra}">
      ${td(`<strong>${disc}</strong>`, { align: 'left' })}
      ${td(fmt(macVal(tActual)), { color: '#475569' })}
      ${td(fmt(nptVal(tActual)), { color: '#334155' })}
      ${td(fmt(ntVal(tActual)), { color: '#1e40af' })}
      ${td(fmt(nfNum), { bold: true, color: corNota(nfNum) })}
      ${td(siBadge)}
      ${obsCell}
    </tr>`;
  }).join("");

  const totalCom = todasAsNotas.length;
  const mediaGeral = totalCom > 0 ? todasAsNotas.reduce((a, b) => a + b, 0) / totalCom : null;
  const sitGeral = calcularSituacao(mediaGeral);

  // ── Decisão Angola MED: TRANSITA / NÃO TRANSITA (boletim anual) ───────────
  // Decreto Executivo nº 3/20: nota mínima 10 (configurável), mínimo absoluto 7,
  // máximo de 2 negativas permitidas para transitar.
  // Art. 23º §2 — 7ª e 8ª classes: as 2 negativas não podem ser simultaneamente
  // Língua Portuguesa E Matemática (apenas se activado em Configurações Gerais).
  const classeStr = String((aluno as any).turma_classe || "");
  const isICiclo = isClasseICicloRestricao(classeStr);
  const isIICiclo = isClasseIICicloRestricao(classeStr);
  const restricaoActiva =
    (Boolean(opts.restricaoArt23ICiclo) && isICiclo) ||
    (Boolean(opts.restricaoArt23IICiclo) && isIICiclo);
  const nuclearNomes = opts.disciplinasNuclearArt23 || [];
  const transicaoAngola = tipo === "anual"
    ? calcularTransicaoAngola(mfdsParaTransicao, 10, 6, 2, {
        restricaoArt23Activa: restricaoActiva,
        disciplinasNuclearArt23: nuclearNomes.length >= 2 ? nuclearNomes : undefined,
        restricaoPortuguesMatematica: restricaoActiva && nuclearNomes.length < 2,
      })
    : null;

  const validacaoUrl = `${baseUrl}/validar/${numeroSerie}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(validacaoUrl)}`;
  const titulo = tipo === "anual" ? "BOLETIM ANUAL DE NOTAS" : `BOLETIM DO ${trimestre}º TRIMESTRE`;

  // Cabeçalhos da tabela de notas
  const thBase = (label: string, w?: string, align = 'center') =>
    `<th style="padding:7px 5px;border:1px solid #1e3a8a;font-size:10px;font-weight:700;letter-spacing:.4px;text-align:${align};${w ? `width:${w};` : ''}">${label}</th>`;
  const thGroup = (label: string, cols: number, color: string) =>
    `<th colspan="${cols}" style="padding:5px 4px;border:1px solid #1e3a8a;font-size:9.5px;font-weight:700;text-align:center;background:${color};letter-spacing:.5px">${label}</th>`;

  const cabecalhoTabela = tipo === "anual"
    ? /* Duas linhas de cabeçalho para o anual: agrupado por trimestre */
      `<tr style="background:#1e3a8a;color:#fff">
        <th rowspan="2" style="padding:8px 6px;border:1px solid #1e3a8a;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.5px;vertical-align:middle">DISCIPLINA</th>
        ${thGroup('1º TRIMESTRE', 3, '#1e40af')}
        ${thGroup('2º TRIMESTRE', 3, '#1d4ed8')}
        ${thGroup('3º TRIMESTRE', 3, '#2563eb')}
        <th rowspan="2" style="padding:8px 4px;border:1px solid #1e3a8a;font-size:10px;font-weight:700;text-align:center;vertical-align:middle;width:6%;background:#b45309;color:#fff">MFD</th>
        <th rowspan="2" style="padding:8px 4px;border:1px solid #1e3a8a;font-size:10px;font-weight:700;text-align:center;vertical-align:middle;width:11%;background:#1e3a8a;color:#fff">SITUAÇÃO</th>
        <th rowspan="2" style="padding:8px 4px;border:1px solid #1e3a8a;font-size:10px;font-weight:700;text-align:center;vertical-align:middle;width:5%;background:#1b5e20;color:#fff">OBS</th>
       </tr>
       <tr style="background:#1e3a8a;color:#e2e8f0">
        ${thBase('MAC','6%')}${thBase('NPT','6%')}${thBase('T','6%')}
        ${thBase('MAC','6%')}${thBase('NPT','6%')}${thBase('T','6%')}
        ${thBase('MAC','6%')}${thBase('NPT','6%')}${thBase('T','6%')}
       </tr>`
    : /* Cabeçalho simples para o trimestral */
      `<tr style="background:#1e3a8a;color:#fff">
        <th style="padding:10px 8px;border:1px solid #1e3a8a;text-align:left;font-size:11.5px;letter-spacing:.5px">DISCIPLINA</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11px;width:11%">M.A.C.</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11px;width:11%">N.P.T.</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11px;width:11%">N.T.</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11px;width:11%">N.F.</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11.5px;width:18%">SITUAÇÃO</th>
        <th style="padding:10px 6px;border:1px solid #1e3a8a;font-size:11.5px;width:8%;background:#1b5e20;color:#fff">OBS</th>
       </tr>`;

  // anual: DISC + 9 colunas (MAC+NPT+T × 3) + MFD + SIT + OBS = 12
  // trimestral: DISC + MAC + NPT + NT + NF + SIT + OBS = 6
  const colSpanTotal = tipo === "anual" ? 11 : 5;

  // ── Linha de totais: Média Geral + Decisão Angola MED (TRANSITA / NÃO TRANSITA) ──
  let totalRow = '';
  if (mediaGeral != null) {
    if (tipo === "anual" && transicaoAngola) {
      // Boletim Anual: aplica norma Angola MED (Decreto Exec. nº 3/20)
      const transitaBadge = `<span style="display:inline-block;padding:4px 14px;border-radius:12px;background:${transicaoAngola.bg};color:${transicaoAngola.cor};font-weight:900;font-size:12px;letter-spacing:.5px">${transicaoAngola.situacao}</span>`;
      const motivoTip = transicaoAngola.motivo ? `<div style="font-size:9px;color:#64748b;margin-top:3px">${transicaoAngola.motivo}</div>` : '';
      totalRow = `
        <tr style="background:#eff6ff;border-top:2px solid #1e3a8a">
          <td colspan="${colSpanTotal}" style="padding:10px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.5px;font-size:11.5px">Média Geral do Aluno</td>
          <td style="padding:10px 6px;border:1px solid #cbd5e1;text-align:center;font-weight:800;font-size:14px;color:${corNota(mediaGeral)}">${mediaGeral.toFixed(2)}</td>
          <td colspan="2" style="padding:8px 6px;border:1px solid #cbd5e1;text-align:center">${transitaBadge}${motivoTip}</td>
        </tr>`;
    } else {
      // Boletim Trimestral: mantém BOM/APTO/REPROVADO
      const sitBadge = `<span style="display:inline-block;padding:3px 12px;border-radius:12px;background:${sitGeral.bg};color:${sitGeral.cor};font-weight:800;font-size:11px">${sitGeral.situacao}</span>`;
      totalRow = `
        <tr style="background:#eff6ff;border-top:2px solid #1e3a8a">
          <td colspan="${colSpanTotal}" style="padding:10px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.5px;font-size:11.5px">Média Geral do Aluno</td>
          <td style="padding:10px 6px;border:1px solid #cbd5e1;text-align:center;font-weight:800;font-size:14px;color:${corNota(mediaGeral)}">${mediaGeral.toFixed(2)}</td>
          <td colspan="2" style="padding:10px 6px;border:1px solid #cbd5e1;text-align:center">${sitBadge}</td>
        </tr>`;
    }
  }

  const assinaturasBlock = tipo === "anual"
    ? `<table style="width:100%;margin-top:60px;border-collapse:collapse"><tr>
        <td style="text-align:center;padding:0 20px;width:50%">
          <div style="border-top:1px solid #000;padding-top:8px;font-size:12px;font-weight:600">O Director Geral</div>
          <div style="font-size:11px;margin-top:4px;color:#374151">${assinadoPor || escola.NOME_DIRECTOR || "_____________________________"}</div>
        </td>
        <td style="text-align:center;padding:0 20px;width:50%">
          <div style="border-top:1px solid #000;padding-top:8px;font-size:12px;font-weight:600">O Director Pedagógico</div>
          <div style="font-size:11px;margin-top:4px;color:#374151">${escola.NOME_DIRECTOR_PEDAGOGICO || "_____________________________"}</div>
        </td>
      </tr></table>`
    : `<div style="margin-top:60px;text-align:center">
        <div style="border-top:1px solid #000;padding-top:8px;display:inline-block;min-width:300px;font-size:12px;font-weight:600">A Secretaria</div>
       </div>`;

  const aviso = pendenteAssinatura
    ? `<div style="margin-top:16px;padding:12px 14px;background:#fef3c7;border-left:5px solid #f59e0b;border-radius:4px;font-weight:600;color:#92400e;font-size:12px">
        <span style="font-size:14px">⏳</span> Aguardando assinatura dos directores — <strong>documento provisório</strong>, sem validade oficial até ser assinado.
       </div>`
    : "";

  const watermark = pendenteAssinatura
    ? `<div style="position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-25deg);font-size:130px;font-weight:900;color:rgba(245,158,11,.10);letter-spacing:8px;pointer-events:none;z-index:0;font-family:Arial">PROVISÓRIO</div>`
    : "";

  const filiacao = (aluno.nomePai || aluno.nomeMae)
    ? `<tr>
        <td style="padding:5px 10px;border:none"><span style="color:#64748b;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px">Filiação</span><br/><strong style="font-size:12px">${aluno.nomePai || "—"} <span style="color:#94a3b8">e</span> ${aluno.nomeMae || "—"}</strong></td>
       </tr>`
    : '';

  // Boletim anual usa landscape para comportar as 12 colunas MAC+NPT+T×3+MFD
  const pageSize = tipo === "anual" ? "A4 landscape" : "A4";
  const maxWrap  = tipo === "anual" ? "1060px" : "780px";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletim ${numeroSerie}</title>
<style>
  @page { size: ${pageSize}; margin: 0 }
  * { box-sizing: border-box }
  body { font-family: 'Calibri','Segoe UI','Helvetica',Arial,sans-serif; color:#0f172a; margin:0; padding:14mm 14mm 12mm; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .wrap { max-width: ${maxWrap}; margin: 0 auto; position:relative; z-index:1 }
  .hdr { display:flex; align-items:center; gap:14px; padding-bottom:10px; border-bottom:2px solid #1e3a8a }
  .hdrTxt { flex:1; text-align:center }
  .repTxt { font-size:11.5px; color:#475569; letter-spacing:.5px; line-height:1.4 }
  .escNome { font-size:16px; font-weight:800; color:#0f172a; margin-top:2px }
  .escSub { font-size:10.5px; color:#64748b; margin-top:2px }
  .titBlock { margin:14px 0 6px; text-align:center }
  .titBar { display:inline-block; padding:8px 22px; background:#1e3a8a; color:#fff; font-weight:700; letter-spacing:1.5px; font-size:13.5px; border-radius:4px }
  .anoSerie { font-size:11px; color:#475569; margin-top:6px }
  .ident { width:100%; margin:14px 0 8px; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; border-collapse:separate; border-spacing:0 }
  .ident td { padding:5px 10px; vertical-align:top; border-top:1px solid #e2e8f0 }
  .ident td:first-child, .ident tr:first-child td { border-top:none }
  .ident .lbl { color:#64748b; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; display:block; margin-bottom:1px }
  .ident .val { font-size:12.5px; font-weight:600; color:#0f172a }
  @media print { .no-print { display:none } }
</style></head><body>
${watermark}
<div class="wrap">
  <div class="hdr">
    <div class="hdrTxt">
      <div class="repTxt">REPÚBLICA DE ANGOLA<br/>MINISTÉRIO DA EDUCAÇÃO</div>
      <div class="escNome">${escola.NOME_ESCOLA || "Escola"}</div>
      <div class="escSub">${[escola.MORADA_ESCOLA, escola.TELEFONE_ESCOLA && `Tel: ${escola.TELEFONE_ESCOLA}`, escola.EMAIL_ESCOLA].filter(Boolean).join(" · ")}</div>
    </div>
  </div>

  <div class="titBlock">
    <div class="titBar">${titulo}</div>
    <div class="anoSerie">Ano Lectivo: <strong>${aluno.turma_ano_letivo || "—"}</strong> · Nº de Série: <strong>${numeroSerie}</strong></div>
  </div>

  <table class="ident">
    <tr>
      <td style="width:55%"><span class="lbl">Aluno</span><span class="val">${aluno.nome} ${aluno.apelido}</span></td>
      <td style="width:45%"><span class="lbl">Nº Matrícula</span><span class="val">${aluno.numeroMatricula || "—"}</span></td>
    </tr>
    <tr>
      <td><span class="lbl">Classe</span><span class="val">${aluno.turma_classe || "—"}</span></td>
      <td><span class="lbl">Turma</span><span class="val">${aluno.turma_nome || "—"} ${aluno.turma_sala ? `· Sala ${aluno.turma_sala}` : ''}</span></td>
    </tr>
    <tr>
      <td><span class="lbl">Nível</span><span class="val">${aluno.turma_nivel || "—"}</span></td>
      <td><span class="lbl">Bilhete de Identidade</span><span class="val">${aluno.numeroBi || "—"}</span></td>
    </tr>
    ${(aluno.nomePai || aluno.nomeMae) ? `<tr>
      <td colspan="2"><span class="lbl">Filiação</span><span class="val">${aluno.nomePai || "—"} <span style="color:#94a3b8;font-weight:400">e</span> ${aluno.nomeMae || "—"}</span></td>
    </tr>` : ''}
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;border:1px solid #cbd5e1">
    <thead>${cabecalhoTabela}</thead>
    <tbody>${linhas}${totalRow}</tbody>
  </table>

  ${tipo === "anual" && totalCom > 0 ? `
  <table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:11px">
    <tr>
      <td style="padding:8px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;text-align:center;width:33%">
        <div style="color:#64748b;text-transform:uppercase;letter-spacing:.5px;font-size:10px">Disciplinas</div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;margin-top:2px">${totalDisc}</div>
      </td>
      <td style="width:6px"></td>
      <td style="padding:8px 10px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:4px;text-align:center;width:33%">
        <div style="color:#15803d;text-transform:uppercase;letter-spacing:.5px;font-size:10px">Aprovadas</div>
        <div style="font-size:18px;font-weight:800;color:#15803d;margin-top:2px">${aprovadasArr.length}</div>
      </td>
      <td style="width:6px"></td>
      <td style="padding:8px 10px;background:#fee2e2;border:1px solid #fecaca;border-radius:4px;text-align:center;width:33%">
        <div style="color:#b91c1c;text-transform:uppercase;letter-spacing:.5px;font-size:10px">Reprovadas</div>
        <div style="font-size:18px;font-weight:800;color:#b91c1c;margin-top:2px">${reprovadasArr.length}</div>
      </td>
    </tr>
  </table>` : ''}

  ${aviso}

  ${assinaturasBlock}

  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:32px;padding-top:10px;border-top:1px dashed #cbd5e1;font-size:9.5px;color:#64748b">
    <div style="line-height:1.6">
      <div><strong style="color:#334155">Validação:</strong> ${validacaoUrl}</div>
      <div><strong style="color:#334155">Hash:</strong> <span style="font-family:'Courier New',monospace">${hash.slice(0,32)}…</span></div>
      <div><strong style="color:#334155">Emitido em:</strong> ${dataActualPt()}</div>
    </div>
    <div style="text-align:center">
      <img src="${qrSrc}" alt="QR" style="width:90px;height:90px;border:1px solid #e2e8f0;border-radius:4px"/>
      <div style="font-size:8.5px;margin-top:2px;color:#94a3b8">Verifique a autenticidade</div>
    </div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:18px">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#1e3a8a;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600">🖨️  Imprimir Boletim</button>
  </div>
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOLETIM DE NOTAS — II CICLO (10ª–12ª Classe)
//  Formato oficial conforme documento MED Angola
// ═══════════════════════════════════════════════════════════════════════════

export interface DisciplinaNotasIICiclo {
  numero: number;
  nome: string;
  t1: { mac: string; npt: string; mt: string };
  t2: { mac: string; npt: string; mt: string };
  t3: { mac: string; npt: string; mt: string };
  obs: string;
}

export interface BoletimIICicloPayload {
  nomeEscola: string;
  cabecalhoLinha1: string;
  cabecalhoLinha2: string;
  cabecalhoLinha3: string;
  areaFormacao: string;
  classe: string;
  turma: string;
  anoLetivo: string;
  nomeAluno: string;
  numero: string;
  processo: string;
  telefone: string;
  municipio: string;
  dia: string;
  mes: string;
  ano: string;
  subdirectorPedagogico: string;
  disciplinas: DisciplinaNotasIICiclo[];
}

function buildBoletimIICicloHtml(data: BoletimIICicloPayload): string {
  const esc = (s: string) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const linha1 = esc(data.cabecalhoLinha1 || "REPÚBLICA DE ANGOLA");
  const linha2 = esc(data.cabecalhoLinha2 || "");
  const linha3 = esc(data.cabecalhoLinha3 || "");
  const nomeEscola = esc(data.nomeEscola || "");
  const areaFormacao = esc(data.areaFormacao || "");
  const classe = esc(data.classe || "");
  const turma = esc(data.turma || "");
  const anoLetivo = esc(data.anoLetivo || "");
  const nomeAluno = esc(data.nomeAluno || "");
  const numero = esc(data.numero || "");
  const processo = esc(data.processo || "");
  const telefone = esc(data.telefone || "");
  const municipio = esc(data.municipio || "");
  const dia = esc(data.dia || "____");
  const mes = esc(data.mes || "________");
  const ano = esc(data.ano || String(new Date().getFullYear()));
  const subdirPed = esc(data.subdirectorPedagogico || "");

  const linhasTabela = (data.disciplinas || []).map((d, i) => {
    const bg = i % 2 === 0 ? "#fff" : "#f9f9f9";
    const fmt = (v: string) => (v && v !== "0" && v !== "0.0" ? esc(v) : "");
    return `
      <tr style="background:${bg}">
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${i + 1}</td>
        <td style="border:1px solid #000;text-align:left;padding:3px 5px;font-size:9.5pt">${esc(d.nome)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t1.mac)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t1.npt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt;font-weight:bold">${fmt(d.t1.mt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t2.mac)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t2.npt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt;font-weight:bold">${fmt(d.t2.mt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t3.mac)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${fmt(d.t3.npt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt;font-weight:bold">${fmt(d.t3.mt)}</td>
        <td style="border:1px solid #000;text-align:center;padding:3px 2px;font-size:9.5pt">${esc(d.obs || "")}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Boletim de Notas — II Ciclo</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 22mm 18mm 22mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 166mm; margin: 0 auto; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
<div class="page">

  <!-- ══ CABEÇALHO INSTITUCIONAL ══ -->
  <div style="text-align:center;line-height:1.5;margin-bottom:6px;">
    <p style="font-weight:bold;font-size:11pt;">${linha1}</p>
    ${linha2 ? `<p style="font-weight:bold;font-size:11pt;">${linha2}</p>` : ""}
    ${linha3 ? `<p style="font-weight:bold;font-size:11pt;">${linha3}</p>` : ""}
    <p style="font-weight:bold;font-size:12pt;text-decoration:underline;text-transform:uppercase;">${nomeEscola}</p>
  </div>

  <!-- ══ AO ENCARREGADO ══ -->
  <div style="margin:14px 0 10px;padding-left:55%;">
    <p style="font-size:11pt;">AO</p>
    <p style="font-size:11pt;">Pai/Encarregado de</p>
    <p style="font-size:11pt;">Educação</p>
  </div>

  <!-- ══ ÁREA DE FORMAÇÃO ══ -->
  <div style="text-align:center;margin:14px 0 10px;">
    <p style="font-style:italic;font-weight:bold;font-size:12pt;text-decoration:underline;">${areaFormacao}</p>
  </div>

  <!-- ══ LINHA CLASSE / TURMA / ANO LECTIVO ══ -->
  <div style="margin:10px 0 6px;font-size:11pt;">
    <span style="font-weight:bold;text-decoration:underline;">${classe} CLASSE,</span>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    <span><strong>TURMA:</strong> <strong style="text-decoration:underline;">${turma},</strong></span>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    <span><strong>ANO LECTIVO:</strong> <strong style="text-decoration:underline;">${anoLetivo}</strong></span>
  </div>

  <!-- ══ NOME / NÚMERO / PROCESSO / TELEFONE ══ -->
  <div style="margin:6px 0 4px;font-size:11pt;">
    <span style="font-style:italic;font-weight:bold;">Nome:</span>
    <span style="display:inline-block;border-bottom:1px solid #000;min-width:210px;padding:0 4px;">${nomeAluno}</span>
    &nbsp;&nbsp;
    <span style="font-style:italic;font-weight:bold;">número</span>
    <span style="display:inline-block;border-bottom:1px solid #000;min-width:30px;padding:0 3px;">${numero}</span>
    &nbsp;
    <span style="font-style:italic;font-weight:bold;">Processo</span>
    <span style="display:inline-block;border-bottom:1px solid #000;min-width:60px;padding:0 3px;">${processo}</span>
  </div>
  <div style="margin:4px 0 8px;font-size:11pt;">
    <span style="font-style:italic;font-weight:bold;">Tel:</span>
    <span style="display:inline-block;border-bottom:1px solid #000;min-width:160px;padding:0 4px;text-decoration:underline;color:#0000cd;">${telefone}</span>
  </div>

  <!-- ══ TABELA DE NOTAS ══ -->
  <table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:8px;">
    <thead>
      <tr style="background:#e8e8e8;">
        <th rowspan="2" style="border:1px solid #000;padding:4px 2px;text-align:center;font-size:9.5pt;width:5%">Nº</th>
        <th rowspan="2" style="border:1px solid #000;padding:4px 4px;text-align:center;font-size:9.5pt;">Disciplinas</th>
        <th colspan="3" style="border:1px solid #000;padding:4px 2px;text-align:center;font-size:9pt;">NOTAS DO I&ordm; TRIMESTRE</th>
        <th colspan="3" style="border:1px solid #000;padding:4px 2px;text-align:center;font-size:9pt;">NOTAS DO II&ordm; TRIMESTRE</th>
        <th colspan="3" style="border:1px solid #000;padding:4px 2px;text-align:center;font-size:9pt;">NOTAS DO III&ordm; TRIMESTRE</th>
        <th rowspan="2" style="border:1px solid #000;padding:4px 2px;text-align:center;font-size:9.5pt;width:7%">Obs.</th>
      </tr>
      <tr style="background:#e8e8e8;">
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">MAC</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">NPT</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:7%">MT<sub>1</sub></th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">MAC</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">NPT</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:7%">MT<sub>2</sub></th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">MAC</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:6%">NPT</th>
        <th style="border:1px solid #000;padding:3px 2px;text-align:center;font-size:8.5pt;width:7%">MT<sub>3</sub></th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela || '<tr><td colspan="12" style="border:1px solid #000;padding:8px;text-align:center;color:#666;font-style:italic;">Sem disciplinas registadas</td></tr>'}
    </tbody>
  </table>

  <!-- ══ RODAPÉ ══ -->
  <div style="margin-top:24px;font-size:11pt;">
    <p style="text-align:center;">${nomeEscola}</p>
  </div>
  <div style="margin-top:18px;font-size:11pt;">
    <p>${municipio},${dia} / ${mes}/ ${ano}.-</p>
  </div>
  <div style="margin-top:32px;font-size:11pt;">
    <p>O Subdirector Pedagógico</p>
    <p style="margin-top:8px;">${subdirPed}</p>
  </div>

  <!-- ══ BOTÃO IMPRIMIR (só no ecrã) ══ -->
  <div class="no-print" style="margin-top:32px;text-align:center;padding-bottom:20px;">
    <button onclick="window.print()" style="padding:10px 28px;font-size:13px;background:#1e3a8a;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600;font-family:Arial,sans-serif;">
      🖨️ Imprimir Boletim
    </button>
  </div>

</div>
</body>
</html>`;
}

export function registerBoletimRoutes(app: Express) {

  // Helper: get aluno from logged user
  async function alunoDoUtilizador(req: Request) {
    const u = req.jwtUser;
    if (!u || u.role !== "aluno") return null;
    return obterAlunoComUtilizador(u.userId);
  }

  // ─── ALUNO: ELEGIBILIDADE ──────────────────────────────────────────────
  app.get("/api/aluno/boletins/elegibilidade", requireAuth, async (req: Request, res: Response) => {
    try {
      const aluno = await alunoDoUtilizador(req);
      if (!aluno) return json(res, 403, { error: "Apenas alunos podem consultar elegibilidade." });

      const anoLetivo = String(aluno.turma_ano_letivo || "");
      const turmaId = String(aluno.turmaId || "");
      const alunoId = String(aluno.id);

      const trimestres = await Promise.all([1, 2, 3].map(async (t) => {
        const ultimoMes = TRIMESTRE_MESES[t][TRIMESTRE_MESES[t].length - 1];
        const propinas = await verificarPropinasEmDia(alunoId, anoLetivo, ultimoMes);
        const trim = await verificarTrimestreLancado(turmaId, alunoId, t, anoLetivo);
        const jaEmitido = await query<JsonObject>(
          `SELECT id, "numeroSerie", "viaNumero", "dataEmissao" FROM public.boletim_emissoes
           WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='trimestral' AND trimestre=$3
           ORDER BY "dataEmissao" DESC LIMIT 1`,
          [alunoId, anoLetivo, t],
        );
        const elegivel = propinas.emDia && trim.completo;
        const motivo = !trim.completo ? `Notas do ${t}º trimestre ainda não foram lançadas (${trim.lancadas}/${trim.totalDisciplinas} disciplinas).` : !propinas.emDia ? propinas.detalhe : "Pode emitir agora.";
        return { trimestre: t, elegivel, motivo, propinas, notas: trim, ultimaEmissao: jaEmitido[0] || null };
      }));

      const propinasAno = await verificarPropinasEmDia(alunoId, anoLetivo);
      const t1 = await verificarTrimestreLancado(turmaId, alunoId, 1, anoLetivo);
      const t2 = await verificarTrimestreLancado(turmaId, alunoId, 2, anoLetivo);
      const t3 = await verificarTrimestreLancado(turmaId, alunoId, 3, anoLetivo);
      const todosLancados = t1.completo && t2.completo && t3.completo;
      const jaSolicitouAnual = await query<JsonObject>(
        `SELECT id, "numeroSerie", status, "viaNumero", "dataEmissao" FROM public.boletim_emissoes
         WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='anual' ORDER BY "dataEmissao" DESC LIMIT 1`,
        [alunoId, anoLetivo],
      );
      const elegivelAnual = propinasAno.emDia && todosLancados;
      const motivoAnual = !todosLancados
        ? "Aguardando lançamento de todas as notas dos 3 trimestres."
        : !propinasAno.emDia
        ? propinasAno.detalhe
        : jaSolicitouAnual[0]?.status === "pendente_assinatura"
        ? "Pedido enviado — aguarda assinatura dos directores."
        : jaSolicitouAnual[0]?.status === "assinado"
        ? "Boletim anual já assinado. Pode reimprimir (taxa aplicável)."
        : "Pode solicitar o boletim anual. Será emitido após assinatura dos directores.";

      json(res, 200, {
        aluno: { id: aluno.id, nome: aluno.nome, apelido: aluno.apelido, turma: aluno.turma_nome, classe: aluno.turma_classe },
        anoLetivo,
        trimestres,
        anual: { elegivel: elegivelAnual, motivo: motivoAnual, propinas: propinasAno, notas: { t1, t2, t3 }, ultimoPedido: jaSolicitouAnual[0] || null },
      });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  // ─── ALUNO: SOLICITAR BOLETIM ──────────────────────────────────────────
  app.post("/api/aluno/boletins/solicitar", requireAuth, async (req: Request, res: Response) => {
    try {
      const aluno = await alunoDoUtilizador(req);
      if (!aluno) return json(res, 403, { error: "Apenas alunos podem solicitar." });
      const body = (req.body || {}) as JsonObject;
      const tipo = String(body.tipo || "trimestral") as "trimestral" | "anual";
      const trimestre = tipo === "trimestral" ? Number(body.trimestre) : undefined;
      const anoLetivo = String(aluno.turma_ano_letivo || "");
      const turmaId = String(aluno.turmaId || "");
      const alunoId = String(aluno.id);

      if (tipo === "trimestral" && (![1, 2, 3].includes(trimestre as number))) {
        return json(res, 400, { error: "Trimestre inválido (1, 2 ou 3)." });
      }

      // Validar
      const ultimoMes = tipo === "trimestral" ? TRIMESTRE_MESES[trimestre!][TRIMESTRE_MESES[trimestre!].length - 1] : undefined;
      const propinas = await verificarPropinasEmDia(alunoId, anoLetivo, ultimoMes);
      if (!propinas.emDia) return json(res, 402, { error: propinas.detalhe, mesesPendentes: propinas.mesesPendentes });

      if (tipo === "trimestral") {
        const trim = await verificarTrimestreLancado(turmaId, alunoId, trimestre!, anoLetivo);
        if (!trim.completo) return json(res, 409, { error: `Notas incompletas: ${trim.faltam.join(", ")}` });
      } else {
        const [t1, t2, t3] = await Promise.all([1, 2, 3].map((t) => verificarTrimestreLancado(turmaId, alunoId, t, anoLetivo)));
        if (!t1.completo || !t2.completo || !t3.completo) {
          return json(res, 409, { error: "Os 3 trimestres devem ter todas as notas lançadas para emitir o boletim anual." });
        }
      }

      // Calcular via (1ª via grátis, demais cobram taxa)
      const anteriores = await query<JsonObject>(
        tipo === "trimestral"
          ? `SELECT id FROM public.boletim_emissoes WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='trimestral' AND trimestre=$3`
          : `SELECT id FROM public.boletim_emissoes WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='anual'`,
        tipo === "trimestral" ? [alunoId, anoLetivo, trimestre] : [alunoId, anoLetivo],
      );
      const viaNumero = anteriores.length + 1;

      if (viaNumero > 1) {
        // exigir taxa paga
        const taxa = await query<JsonObject>(`SELECT id, valor FROM public.taxas WHERE tipo='reimpressao_boletim' AND ativo=true LIMIT 1`, []);
        if (taxa[0]) {
          const pagouReimp = await query<JsonObject>(
            `SELECT id FROM public.pagamentos
             WHERE "alunoId"=$1 AND "taxaId"=$2 AND status='pago'
               AND id NOT IN (SELECT "pagamentoId" FROM public.boletim_emissoes WHERE "pagamentoId" IS NOT NULL)
             ORDER BY "createdAt" DESC LIMIT 1`,
            [alunoId, taxa[0].id],
          );
          if (!pagouReimp[0]) {
            return json(res, 402, {
              error: `Reimpressão requer pagamento de taxa (${taxa[0].valor} Kz). Aceda ao módulo Financeiro para pagar.`,
              taxaId: taxa[0].id,
              valor: taxa[0].valor,
            });
          }
          (body as any)._pagamentoReimpId = pagouReimp[0].id;
        }
      }

      const numeroSerie = gerarNumeroSerie(tipo, anoLetivo, trimestre);
      const notas = await obterNotasAluno(alunoId, turmaId, anoLetivo, tipo === "trimestral" ? trimestre : undefined);
      const snapshot = { aluno, notas, anoLetivo, tipo, trimestre, geradoEm: new Date().toISOString() };
      const hash = gerarHash(snapshot);

      const status = tipo === "anual" ? "pendente_assinatura" : "emitido";
      await query(
        `INSERT INTO public.boletim_emissoes (id, "alunoId", "anoLetivo", tipo, trimestre, "numeroSerie", hash, "viaNumero",
          "emitidoPor", "emitidoPorId", "emitidoPorNome", status, "taxaPaga", "pagamentoId", "dadosSnapshot")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'aluno', $8, $9, $10, $11, $12, $13)`,
        [alunoId, anoLetivo, tipo, trimestre || null, numeroSerie, hash, viaNumero, req.jwtUser?.userId || null,
         `${aluno.nome} ${aluno.apelido}`, status, viaNumero > 1, (body as any)._pagamentoReimpId || null, JSON.stringify(snapshot)],
      );

      // Notificar encarregado
      const tituloNotif = tipo === "anual" ? "Pedido de Boletim Anual" : `Boletim do ${trimestre}º Trimestre Emitido`;
      const msgNotif = tipo === "anual"
        ? `${aluno.nome} ${aluno.apelido} solicitou o Boletim Anual. Aguarda assinatura dos directores. Nº de Série: ${numeroSerie}`
        : `${aluno.nome} ${aluno.apelido} emitiu o Boletim do ${trimestre}º Trimestre (${aluno.turma_classe}). Nº de Série: ${numeroSerie}`;
      notificarEncarregado(alunoId, tituloNotif, msgNotif, `/validar/${numeroSerie}`).catch(() => {});

      json(res, 201, {
        ok: true,
        numeroSerie,
        hash,
        viaNumero,
        status,
        tipo,
        trimestre,
        urlVisualizacao: `/api/boletins/${numeroSerie}/html`,
        urlValidacao: `/validar/${numeroSerie}`,
        mensagem: tipo === "anual"
          ? "Pedido enviado. Aguarda assinatura dos directores antes da emissão final."
          : "Boletim emitido com sucesso.",
      });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  // ─── ALUNO: ELEGIBILIDADE BOLETIM II CICLO ────────────────────────────
  // Verifica propinas do trimestre — aluno só pode ver o boletim se estiver regularizado
  app.get("/api/aluno/boletins-ii-ciclo/elegibilidade", requireAuth, async (req: Request, res: Response) => {
    try {
      const aluno = await alunoDoUtilizador(req);
      if (!aluno) return json(res, 403, { error: "Apenas alunos podem consultar." });

      const anoLetivo = String(aluno.turma_ano_letivo || "");
      const alunoId = String(aluno.id);
      const classe = String(aluno.turma_classe || "");

      // Detectar se é II Ciclo (10ª a 13ª classe)
      const isIICiclo = /^(10|11|12|13)[ªa°]?\s*(Classe)?/.test(classe.trim());

      const trimestres = await Promise.all([1, 2, 3].map(async (t) => {
        const ultimoMes = TRIMESTRE_MESES[t][TRIMESTRE_MESES[t].length - 1];
        const propinas = await verificarPropinasEmDia(alunoId, anoLetivo, ultimoMes);
        const elegivel = propinas.emDia;
        const motivo = !propinas.emDia ? propinas.detalhe : "Propinas regularizadas. Pode visualizar.";
        return { trimestre: t, elegivel, motivo, propinas };
      }));

      json(res, 200, {
        isIICiclo,
        aluno: {
          id: aluno.id,
          nome: aluno.nome,
          apelido: aluno.apelido,
          turma: aluno.turma_nome,
          classe,
          nivel: aluno.turma_nivel,
        },
        anoLetivo,
        trimestres,
      });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  // ─── ALUNO: HISTÓRICO PRÓPRIO ──────────────────────────────────────────
  app.get("/api/aluno/boletins", requireAuth, async (req: Request, res: Response) => {
    try {
      const aluno = await alunoDoUtilizador(req);
      if (!aluno) return json(res, 403, { error: "Apenas alunos." });
      const rows = await query<JsonObject>(
        `SELECT id, tipo, trimestre, "numeroSerie", "viaNumero", status, "dataEmissao", "dataAssinatura", "assinadoPorDirectorNome"
         FROM public.boletim_emissoes WHERE "alunoId"=$1 ORDER BY "dataEmissao" DESC`,
        [aluno.id],
      );
      json(res, 200, rows);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ─── HTML DO BOLETIM (visualização/impressão) ──────────────────────────
  app.get("/api/boletins/:numeroSerie/html", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await query<JsonObject>(`SELECT * FROM public.boletim_emissoes WHERE "numeroSerie"=$1 LIMIT 1`, [req.params.numeroSerie]);
      const bol = rows[0];
      if (!bol) return res.status(404).send("Boletim não encontrado.");
      // Permissão: o próprio aluno OU emissor OU role com permissão
      const u = req.jwtUser!;
      const podeVer = u.role !== "aluno" || (await alunoDoUtilizador(req))?.id === bol.alunoId;
      if (!podeVer) return res.status(403).send("Sem permissão.");

      const aluno = await obterAlunoPorId(String(bol.alunoId));
      const escola = await obterDadosEscola();
      const notas = await obterNotasAluno(String(bol.alunoId), String(aluno?.turmaId), String(bol.anoLetivo), bol.tipo === "trimestral" ? Number(bol.trimestre) : undefined);
      const cfgArt23 = await query<JsonObject>(`SELECT "restricaoArt23ICiclo", "restricaoArt23IICiclo" FROM public.config_geral LIMIT 1`, []);
      const restricaoArt23ICiclo = cfgArt23.length > 0 ? Boolean(cfgArt23[0].restricaoArt23ICiclo) : false;
      const restricaoArt23IICiclo = cfgArt23.length > 0 ? Boolean(cfgArt23[0].restricaoArt23IICiclo) : false;
      const nuclearArt23Rows = await query<JsonObject>(`SELECT nome FROM public.disciplinas WHERE "nuclearArt23" = true ORDER BY nome`, []);
      const disciplinasNuclearArt23 = nuclearArt23Rows.map(r => String(r.nome));

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const html = buildBoletimHtml({
        aluno: aluno!,
        notas,
        escola,
        tipo: bol.tipo as any,
        trimestre: bol.trimestre as number | undefined,
        numeroSerie: String(bol.numeroSerie),
        hash: String(bol.hash),
        baseUrl,
        assinadoPor: bol.assinadoPorDirectorNome ? String(bol.assinadoPorDirectorNome) : undefined,
        pendenteAssinatura: bol.status === "pendente_assinatura",
        restricaoArt23ICiclo,
        restricaoArt23IICiclo,
        disciplinasNuclearArt23,
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (e) {
      res.status(500).send((e as Error).message);
    }
  });

  // ─── SECRETARIA: PENDENTES DE ASSINATURA ───────────────────────────────
  app.get("/api/secretaria/boletins/pendentes-assinatura", requireAuth, async (req: Request, res: Response) => {
    const role = req.jwtUser?.role || "";
    if (!ROLES_EMITIR_BOLETIM.has(role)) return json(res, 403, { error: "Sem permissão." });
    try {
      const rows = await query<JsonObject>(
        `SELECT b.*, a.nome AS aluno_nome, a.apelido AS aluno_apelido, a."numeroMatricula", t.nome AS turma_nome, t.classe AS turma_classe
         FROM public.boletim_emissoes b
         JOIN public.alunos a ON a.id = b."alunoId"
         LEFT JOIN public.turmas t ON t.id = a."turmaId"
         WHERE b.status='pendente_assinatura' ORDER BY b."dataEmissao" ASC`,
        [],
      );
      json(res, 200, rows);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ─── DIRECTOR: ASSINAR BOLETIM ANUAL ───────────────────────────────────
  app.post("/api/secretaria/boletins/:id/assinar", requireAuth, async (req: Request, res: Response) => {
    const role = req.jwtUser?.role || "";
    if (!ROLES_ASSINAR_BOLETIM.has(role)) return json(res, 403, { error: "Apenas directores podem assinar." });
    try {
      const u = req.jwtUser!;
      const userInfo = await query<JsonObject>(`SELECT nome FROM public.utilizadores WHERE id=$1 LIMIT 1`, [u.userId]);
      const nomeDir = userInfo[0]?.nome || u.email;
      const rows = await query<JsonObject>(
        `UPDATE public.boletim_emissoes SET status='assinado', "assinadoPorDirectorId"=$1, "assinadoPorDirectorNome"=$2, "dataAssinatura"=NOW()
         WHERE id=$3 AND status='pendente_assinatura' RETURNING *`,
        [u.userId, nomeDir, req.params.id],
      );
      if (!rows[0]) return json(res, 404, { error: "Boletim não encontrado ou já assinado." });
      // Notificar aluno (encarregado também)
      notificarEncarregado(String(rows[0].alunoId), "Boletim Anual Assinado",
        `O seu boletim anual (Nº ${rows[0].numeroSerie}) foi assinado pelos directores e está pronto para impressão.`,
        `/validar/${rows[0].numeroSerie}`).catch(() => {});
      json(res, 200, rows[0]);
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ─── SECRETARIA: EMITIR INDIVIDUAL (PARA UM ALUNO) ─────────────────────
  app.post("/api/secretaria/boletins/emitir", requireAuth, async (req: Request, res: Response) => {
    const role = req.jwtUser?.role || "";
    if (!ROLES_EMITIR_BOLETIM.has(role)) return json(res, 403, { error: "Sem permissão para emitir boletins." });
    try {
      const b = (req.body || {}) as JsonObject;
      const alunoId = String(b.alunoId || "");
      const tipo = String(b.tipo || "trimestral") as "trimestral" | "anual";
      const trimestre = tipo === "trimestral" ? Number(b.trimestre) : undefined;
      if (!alunoId) return json(res, 400, { error: "alunoId obrigatório." });
      if (tipo === "trimestral" && ![1, 2, 3].includes(trimestre as number)) return json(res, 400, { error: "Trimestre inválido." });

      const aluno = await obterAlunoPorId(alunoId);
      if (!aluno) return json(res, 404, { error: "Aluno não encontrado." });
      const anoLetivo = String(aluno.turma_ano_letivo || "");
      const turmaId = String(aluno.turmaId || "");

      const numeroSerie = gerarNumeroSerie(tipo, anoLetivo, trimestre);
      const notas = await obterNotasAluno(alunoId, turmaId, anoLetivo, trimestre);
      const snapshot = { aluno, notas, anoLetivo, tipo, trimestre, geradoEm: new Date().toISOString() };
      const hash = gerarHash(snapshot);

      const anteriores = await query<JsonObject>(
        tipo === "trimestral"
          ? `SELECT id FROM public.boletim_emissoes WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='trimestral' AND trimestre=$3`
          : `SELECT id FROM public.boletim_emissoes WHERE "alunoId"=$1 AND "anoLetivo"=$2 AND tipo='anual'`,
        tipo === "trimestral" ? [alunoId, anoLetivo, trimestre] : [alunoId, anoLetivo],
      );
      const viaNumero = anteriores.length + 1;

      // Quando emitido pela secretaria, anual já fica como 'emitido' e pode ser assinado depois,
      // mas aqui se for anual mantemos pendente_assinatura para garantir fluxo.
      const status = tipo === "anual" ? "pendente_assinatura" : "emitido";

      await query(
        `INSERT INTO public.boletim_emissoes (id, "alunoId", "anoLetivo", tipo, trimestre, "numeroSerie", hash, "viaNumero",
          "emitidoPor", "emitidoPorId", "emitidoPorNome", status, "dadosSnapshot")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'secretaria', $8, $9, $10, $11)`,
        [alunoId, anoLetivo, tipo, trimestre || null, numeroSerie, hash, viaNumero, req.jwtUser?.userId || null,
         req.jwtUser?.email || "", status, JSON.stringify(snapshot)],
      );

      notificarEncarregado(alunoId, "Boletim Emitido",
        `A Secretaria emitiu um ${tipo === "anual" ? "boletim anual" : `boletim do ${trimestre}º trimestre`} para ${aluno.nome} ${aluno.apelido}. Nº ${numeroSerie}.`,
        `/validar/${numeroSerie}`).catch(() => {});

      json(res, 201, { ok: true, numeroSerie, status, viaNumero, urlVisualizacao: `/api/boletins/${numeroSerie}/html` });
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ─── SECRETARIA: LOTE POR TURMA ────────────────────────────────────────
  app.post("/api/secretaria/boletins/lote-turma/:turmaId", requireAuth, async (req: Request, res: Response) => {
    const role = req.jwtUser?.role || "";
    if (!ROLES_EMITIR_BOLETIM.has(role)) return json(res, 403, { error: "Sem permissão." });
    try {
      const turmaId = req.params.turmaId;
      const b = (req.body || {}) as JsonObject;
      const tipo = String(b.tipo || "trimestral") as "trimestral" | "anual";
      const trimestre = tipo === "trimestral" ? Number(b.trimestre) : undefined;

      const alunos = await query<JsonObject>(
        `SELECT a.id, a.nome, a.apelido, a."numeroMatricula", t."anoLetivo"
         FROM public.alunos a JOIN public.turmas t ON t.id=a."turmaId"
         WHERE a."turmaId"=$1 AND a.ativo=true ORDER BY a.apelido, a.nome`,
        [turmaId],
      );
      const escola = await obterDadosEscola();
      const cfgArt23b = await query<JsonObject>(`SELECT "restricaoArt23ICiclo", "restricaoArt23IICiclo" FROM public.config_geral LIMIT 1`, []);
      const restricaoArt23ICiclo = cfgArt23b.length > 0 ? Boolean(cfgArt23b[0].restricaoArt23ICiclo) : false;
      const restricaoArt23IICiclo = cfgArt23b.length > 0 ? Boolean(cfgArt23b[0].restricaoArt23IICiclo) : false;
      const nuclearArt23RowsB = await query<JsonObject>(`SELECT nome FROM public.disciplinas WHERE "nuclearArt23" = true ORDER BY nome`, []);
      const disciplinasNuclearArt23 = nuclearArt23RowsB.map(r => String(r.nome));
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const paginas: string[] = [];
      const emitidos: any[] = [];

      for (const al of alunos) {
        const alunoFull = await obterAlunoPorId(String(al.id));
        if (!alunoFull) continue;
        const anoLetivo = String(alunoFull.turma_ano_letivo);
        const numeroSerie = gerarNumeroSerie(tipo, anoLetivo, trimestre);
        const notas = await obterNotasAluno(String(al.id), turmaId, anoLetivo, trimestre);
        const snapshot = { aluno: alunoFull, notas, tipo, trimestre, anoLetivo, geradoEm: new Date().toISOString() };
        const hash = gerarHash(snapshot);
        const status = tipo === "anual" ? "pendente_assinatura" : "emitido";

        await query(
          `INSERT INTO public.boletim_emissoes (id, "alunoId", "anoLetivo", tipo, trimestre, "numeroSerie", hash, "viaNumero",
            "emitidoPor", "emitidoPorId", "emitidoPorNome", status, "dadosSnapshot")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1, 'secretaria', $7, $8, $9, $10)`,
          [al.id, anoLetivo, tipo, trimestre || null, numeroSerie, hash, req.jwtUser?.userId || null, req.jwtUser?.email || "", status, JSON.stringify(snapshot)],
        );

        paginas.push(buildBoletimHtml({
          aluno: alunoFull, notas, escola, tipo, trimestre, numeroSerie, hash, baseUrl,
          pendenteAssinatura: tipo === "anual",
          restricaoArt23ICiclo, restricaoArt23IICiclo, disciplinasNuclearArt23,
        }));
        emitidos.push({ alunoId: al.id, nome: `${al.nome} ${al.apelido}`, numeroSerie });
        notificarEncarregado(String(al.id), "Boletim Emitido",
          `A Secretaria emitiu um ${tipo === "anual" ? "boletim anual" : `boletim do ${trimestre}º trimestre`} para ${al.nome} ${al.apelido}. Nº ${numeroSerie}.`,
          `/validar/${numeroSerie}`).catch(() => {});
      }

      const htmlCompleto = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletins em Lote — Turma</title><style>@page{size:A4;margin: 0} .pageBreak{page-break-after:always} body{font-family:'Times New Roman',serif}</style></head><body>` +
        paginas.map((p, i) => `<div${i < paginas.length - 1 ? ' class="pageBreak"' : ""}>${p.replace(/<!DOCTYPE[\s\S]*?<body>/, "").replace(/<\/body><\/html>$/, "")}</div>`).join("") +
        `</body></html>`;

      // Optional: return HTML directly if `?html=1` else return summary JSON
      if (req.query.html === "1") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(htmlCompleto);
      }
      json(res, 200, { ok: true, total: emitidos.length, emitidos, urlImpressaoLote: `/api/secretaria/boletins/lote-turma/${turmaId}/imprimir?tipo=${tipo}${trimestre ? "&trimestre=" + trimestre : ""}` });
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });

  // ─── IMPRIMIR LOTE: gera HTML único multi-página dos JÁ emitidos ──────
  app.get("/api/secretaria/boletins/lote-turma/:turmaId/imprimir", requireAuth, async (req: Request, res: Response) => {
    const role = req.jwtUser?.role || "";
    if (!ROLES_EMITIR_BOLETIM.has(role)) return res.status(403).send("Sem permissão.");
    try {
      const turmaId = req.params.turmaId;
      const tipo = String(req.query.tipo || "trimestral");
      const trimestre = req.query.trimestre ? Number(req.query.trimestre) : null;
      const params: unknown[] = [turmaId, tipo];
      let where = `a."turmaId"=$1 AND b.tipo=$2`;
      if (trimestre) { where += ` AND b.trimestre=$3`; params.push(trimestre); }
      const rows = await query<JsonObject>(
        `SELECT DISTINCT ON (b."alunoId") b.* FROM public.boletim_emissoes b
         JOIN public.alunos a ON a.id=b."alunoId"
         WHERE ${where} ORDER BY b."alunoId", b."dataEmissao" DESC`,
        params,
      );
      const escola = await obterDadosEscola();
      const cfgArt23c = await query<JsonObject>(`SELECT "restricaoArt23ICiclo", "restricaoArt23IICiclo" FROM public.config_geral LIMIT 1`, []);
      const restricaoArt23ICicloLote = cfgArt23c.length > 0 ? Boolean(cfgArt23c[0].restricaoArt23ICiclo) : false;
      const restricaoArt23IICicloLote = cfgArt23c.length > 0 ? Boolean(cfgArt23c[0].restricaoArt23IICiclo) : false;
      const nuclearArt23RowsC = await query<JsonObject>(`SELECT nome FROM public.disciplinas WHERE "nuclearArt23" = true ORDER BY nome`, []);
      const disciplinasNuclearArt23Lote = nuclearArt23RowsC.map(r => String(r.nome));
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const paginas: string[] = [];
      for (const bol of rows) {
        const aluno = await obterAlunoPorId(String(bol.alunoId));
        if (!aluno) continue;
        const notas = await obterNotasAluno(String(bol.alunoId), String(aluno.turmaId), String(bol.anoLetivo), bol.tipo === "trimestral" ? Number(bol.trimestre) : undefined);
        paginas.push(buildBoletimHtml({
          aluno, notas, escola, tipo: bol.tipo as any, trimestre: bol.trimestre as any,
          numeroSerie: String(bol.numeroSerie), hash: String(bol.hash), baseUrl,
          assinadoPor: bol.assinadoPorDirectorNome ? String(bol.assinadoPorDirectorNome) : undefined,
          pendenteAssinatura: bol.status === "pendente_assinatura",
          restricaoArt23ICiclo: restricaoArt23ICicloLote,
          restricaoArt23IICiclo: restricaoArt23IICicloLote,
          disciplinasNuclearArt23: disciplinasNuclearArt23Lote,
        }));
      }
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletins em Lote</title><style>@page{size:A4;margin: 0} .pageBreak{page-break-after:always} body{font-family:'Times New Roman',serif}</style></head><body>` +
        paginas.map((p, i) => `<div${i < paginas.length - 1 ? ' class="pageBreak"' : ""}>${p.replace(/<!DOCTYPE[\s\S]*?<body>/, "").replace(/<\/body><\/html>$/, "")}</div>`).join("") +
        `</body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (e) { res.status(500).send((e as Error).message); }
  });

  // ═══ BOLETIM II CICLO: DADOS (JSON) ════════════════════════════════════════
  app.get("/api/boletins-ii-ciclo/dados/:alunoId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { alunoId } = req.params;
      const alunoRows = await query<JsonObject>(`
        SELECT a.*,
          t.nome AS turma_nome, t.classe AS turma_classe, t.sala AS turma_sala,
          t.nivel AS turma_nivel, t."anoLetivo" AS turma_ano_letivo,
          t."cursoId" AS turma_curso_id,
          u.telefone AS utilizador_telefone,
          c.nome AS curso_nome, c."areaFormacao" AS curso_area_formacao
        FROM public.alunos a
        LEFT JOIN public.turmas t ON t.id = a."turmaId"
        LEFT JOIN public.utilizadores u ON u.id = a."utilizadorId"
        LEFT JOIN public.cursos c ON c.id = COALESCE(a."cursoId", t."cursoId")
        WHERE a.id = $1 LIMIT 1
      `, [alunoId]);
      if (!alunoRows[0]) return json(res, 404, { error: "Aluno não encontrado." });
      const aluno = alunoRows[0];

      const notas = await obterNotasAluno(
        String(aluno.id),
        String(aluno.turmaId || ""),
        String(aluno.turma_ano_letivo || "")
      );

      const configRows = await query<JsonObject>(`
        SELECT "nomeEscola", "cabecalhoLinha1", "cabecalhoLinha2", "cabecalhoLinha3", "cabecalhoLinha4",
          "directorGeral", "directorPedagogico", "municipioEscola", "provinciaEscola", "logoUrl"
        FROM public.config_geral ORDER BY id ASC LIMIT 1
      `, []);
      const config = configRows[0] || {};

      const disciplinas = await query<JsonObject>(`
        SELECT d.id, d.nome, COALESCE(td.ordem, 0) AS ordem
        FROM public.turma_disciplinas td
        JOIN public.disciplinas d ON d.id = td."disciplinaId"
        WHERE td."turmaId" = $1
        ORDER BY td.ordem ASC, d.nome ASC
      `, [String(aluno.turmaId || "")]);

      json(res, 200, { aluno, notas, config, disciplinas });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  // ═══ BOLETIM II CICLO: HTML PARA IMPRESSÃO ══════════════════════════════════
  app.post("/api/boletins-ii-ciclo/html", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as BoletimIICicloPayload;
      const html = buildBoletimIICicloHtml(body);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (e) {
      res.status(500).send((e as Error).message);
    }
  });

  // ─── PÚBLICO: VALIDAÇÃO POR QR ─────────────────────────────────────────
  app.get("/api/validar/:numeroSerie", async (req: Request, res: Response) => {
    try {
      const rows = await query<JsonObject>(
        `SELECT b."numeroSerie", b.tipo, b.trimestre, b."anoLetivo", b.status, b."dataEmissao", b."dataAssinatura",
                b."assinadoPorDirectorNome", b.hash, b."viaNumero",
                a.nome AS aluno_nome, a.apelido AS aluno_apelido, a."numeroMatricula",
                t.nome AS turma_nome, t.classe AS turma_classe
         FROM public.boletim_emissoes b
         JOIN public.alunos a ON a.id=b."alunoId"
         LEFT JOIN public.turmas t ON t.id=a."turmaId"
         WHERE b."numeroSerie"=$1 LIMIT 1`,
        [req.params.numeroSerie],
      );
      if (!rows[0]) return json(res, 404, { valido: false, erro: "Documento não encontrado nos arquivos." });
      const b = rows[0];
      json(res, 200, {
        valido: true,
        autenticidade: "Documento autêntico, registado nos arquivos da escola.",
        boletim: {
          numeroSerie: b.numeroSerie,
          tipo: b.tipo,
          trimestre: b.trimestre,
          anoLetivo: b.anoLetivo,
          status: b.status,
          viaNumero: b.viaNumero,
          dataEmissao: b.dataEmissao,
          dataAssinatura: b.dataAssinatura,
          assinadoPor: b.assinadoPorDirectorNome,
          hash: b.hash,
        },
        aluno: {
          nome: `${b.aluno_nome} ${b.aluno_apelido}`,
          numeroMatricula: b.numeroMatricula,
          classe: b.turma_classe,
          turma: b.turma_nome,
        },
      });
    } catch (e) { json(res, 500, { valido: false, erro: (e as Error).message }); }
  });
}
