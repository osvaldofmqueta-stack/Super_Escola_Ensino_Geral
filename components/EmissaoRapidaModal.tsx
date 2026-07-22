import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Assinante { nome: string; cargo: string }

interface DocTemplate { id: string; nome: string; tipo: string; conteudo: string; bloqueado?: boolean }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function fmtDate(d: Date) { return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }

// ─── Built-in doc types ───────────────────────────────────────────────────────

const BUILTIN = [
  { key: 'declaracao_matricula',    label: 'Declaração de Matrícula',    icon: 'document-text',   color: Colors.info,    desc: 'Declara que o aluno está matriculado' },
  { key: 'atestado_frequencia',     label: 'Atestado de Frequência',     icon: 'checkmark-circle', color: Colors.success, desc: 'Comprova frequência regular nas aulas' },
  { key: 'declaracao_conclusao',    label: 'Declaração de Conclusão',    icon: 'school',           color: '#14b8a6',      desc: 'Declara a conclusão do ano/ciclo lectivo' },
  { key: 'certificado_habilitacoes',label: 'Certificado de Habilitações',icon: 'ribbon',           color: Colors.gold,    desc: 'Certifica as habilitações académicas' },
  { key: 'boletim_notas',           label: 'Boletim de Notas',           icon: 'bar-chart',        color: '#8b5cf6',      desc: 'Relatório completo de notas por disciplina' },
  { key: 'historico_escolar',       label: 'Histórico Escolar',          icon: 'time',             color: Colors.warning, desc: 'Histórico académico completo do aluno' },
];

// ─── CSS base ─────────────────────────────────────────────────────────────────

const BASE_CSS = `
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #111; background: #fff; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 25mm; position: relative; }
  .header { text-align: center; border-bottom: 3px double #111; padding-bottom: 12px; margin-bottom: 20px; }
  .escola-nome { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .escola-sub  { font-size: 10pt; margin-top: 4px; }
  .doc-titulo  { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase;
    letter-spacing: 2px; margin: 30px 0 24px; text-decoration: underline; }
  .num-doc { text-align: right; font-size: 9pt; color: #666; margin-bottom: 20px; }
  .body-text { font-size: 12pt; line-height: 2; text-align: justify; margin-bottom: 16px; }
  .local-data { margin-top: 40px; text-align: right; font-size: 11pt; }
  .assinaturas-row { display: flex; justify-content: space-around; align-items: flex-end;
    margin-top: 60px; gap: 20px; flex-wrap: wrap; }
  .assinatura { flex: 1; text-align: center; min-width: 160px; }
  .assinatura .linha { border-top: 1px solid #111; margin-bottom: 8px; }
  .assinatura .nome { font-size: 11pt; font-weight: bold; }
  .assinatura .cargo { font-size: 10pt; color: #444; }
  .footer { position: absolute; bottom: 15mm; left: 25mm; right: 25mm;
    border-top: 1px solid #999; padding-top: 8px; font-size: 8.5pt; color: #666; text-align: center; }
  .section-title { font-size: 13pt; font-weight: bold; text-transform: uppercase;
    border-bottom: 2px solid #1a2540; padding-bottom: 4px; margin: 20px 0 12px; letter-spacing: 1px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; font-size: 11pt; }
  .info-item { border-bottom: 1px dotted #bbb; padding-bottom: 4px; }
  .info-label { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-val { font-weight: bold; font-size: 11.5pt; margin-top: 2px; }
  .notas-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11pt; }
  .notas-table th { background: #1a2540; color: #fff; padding: 8px 10px; text-align: left; font-weight: bold; }
  .notas-table td { padding: 7px 10px; border-bottom: 1px solid #ddd; }
  .notas-table tr:nth-child(even) td { background: #f9f9f9; }
  .nota-val { font-weight: bold; text-align: center; }
  .nota-apto { color: #166534; }
  .nota-rep  { color: #991b1b; }
  .print-btn { display: block; margin: 20px auto; padding: 12px 36px;
    background: #1a2540; color: #fff; border: none; border-radius: 8px;
    font-size: 14px; font-family: sans-serif; cursor: pointer; font-weight: bold; }
  .print-btn:hover { background: #253358; }
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; }
    .page { padding: 15mm 20mm; box-shadow: none; }
  }
</style>`;

// ─── Signatory HTML ───────────────────────────────────────────────────────────

function renderSign(assinantes: Assinante[]): string {
  const ativos = assinantes.filter(a => a.nome.trim());
  if (!ativos.length) return '';
  return `<div class="assinaturas-row">
    ${ativos.map(a => `<div class="assinatura">
      <div class="linha"></div>
      <p class="nome">${a.nome}</p>
      <p class="cargo">${a.cargo}</p>
    </div>`).join('')}
  </div>`;
}

// ─── Built-in HTML builders ───────────────────────────────────────────────────

function v(vars: Record<string,string>, k: string) { return vars[k] || '—'; }
const docNum = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
const gen = (g: string) => g === 'Masculino';

function htmlDeclaracaoMatricula(vars: Record<string,string>, assinantes: Assinante[]): string {
  const isMasc = gen(v(vars,'{{GENERO}}'));
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('DM')}</div>
    <div class="doc-titulo">Declaração de Matrícula</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${v(vars,'{{NOME_COMPLETO}}')}</strong>,
      ${isMasc ? 'filho de' : 'filha de'} <strong>${v(vars,'{{PAI}}')}</strong> e de <strong>${v(vars,'{{MAE}}')}</strong>,
      nascido${isMasc ? '' : 'a'} em ${v(vars,'{{DATA_NASCIMENTO}}')}, natural de ${v(vars,'{{NATURALIDADE}}')},
      portador${isMasc ? '' : 'a'} do Bilhete de Identidade n.º <strong>${v(vars,'{{BI_NUMERO}}')}</strong>,
      encontra-se regularmente matriculado${isMasc ? '' : 'a'} nesta instituição, na
      <strong>${v(vars,'{{CLASSE}}')}</strong>, turma <strong>${v(vars,'{{TURMA}}')}</strong>,
      turno da <strong>${v(vars,'{{TURNO}}')}</strong>, no ano lectivo <strong>${v(vars,'{{ANO_LECTIVO}}')}</strong>,
      com o número de matrícula <strong>${v(vars,'{{NUMERO_MATRICULA}}')}</strong>.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido d${isMasc ? 'o' : 'a'} interessad${isMasc ? 'o' : 'a'},
      para fins de <strong>${v(vars,'{{FINALIDADE}}')}</strong>,
      sendo válida pelo prazo de 90 dias a contar da data de emissão.
    </div>
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v(vars,'{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlAtestadoFrequencia(vars: Record<string,string>, assinantes: Assinante[]): string {
  const isMasc = gen(v(vars,'{{GENERO}}'));
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('AF')}</div>
    <div class="doc-titulo">Atestado de Frequência</div>
    <div class="body-text">
      Para os devidos efeitos, atesto que <strong>${v(vars,'{{NOME_COMPLETO}}')}</strong>,
      com o número de matrícula <strong>${v(vars,'{{NUMERO_MATRICULA}}')}</strong>,
      portador${isMasc ? '' : 'a'} do Bilhete de Identidade n.º <strong>${v(vars,'{{BI_NUMERO}}')}</strong>,
      é alun${isMasc ? 'o' : 'a'} desta instituição, matriculad${isMasc ? 'o' : 'a'} na
      <strong>${v(vars,'{{CLASSE}}')}</strong>, turma <strong>${v(vars,'{{TURMA}}')}</strong>,
      no ano lectivo <strong>${v(vars,'{{ANO_LECTIVO}}')}</strong>, e tem frequentado as aulas regularmente.
    </div>
    <div class="body-text">
      O presente atestado é emitido a pedido d${isMasc ? 'o' : 'a'} interessad${isMasc ? 'o' : 'a'},
      para fins de <strong>${v(vars,'{{FINALIDADE}}')}</strong>.
    </div>
    <div class="body-text">A veracidade desta informação pode ser confirmada junto da Secretaria Académica.</div>
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlDeclaracaoConclusao(vars: Record<string,string>, assinantes: Assinante[]): string {
  const isMasc = gen(v(vars,'{{GENERO}}'));
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('DC')}</div>
    <div class="doc-titulo">Declaração de Conclusão</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${v(vars,'{{NOME_COMPLETO}}')}</strong>,
      ${isMasc ? 'filho de' : 'filha de'} <strong>${v(vars,'{{PAI}}')}</strong> e de <strong>${v(vars,'{{MAE}}')}</strong>,
      portador${isMasc ? '' : 'a'} do Bilhete de Identidade n.º <strong>${v(vars,'{{BI_NUMERO}}')}</strong>,
      com o número de matrícula <strong>${v(vars,'{{NUMERO_MATRICULA}}')}</strong>,
      concluiu com <strong>${v(vars,'{{RESULTADO}}')}</strong> a <strong>${v(vars,'{{CLASSE}}')}</strong>
      desta instituição, no ano lectivo <strong>${v(vars,'{{ANO_LECTIVO}}')}</strong>,
      turma <strong>${v(vars,'{{TURMA}}')}</strong>, turno da <strong>${v(vars,'{{TURNO}}')}</strong>.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido d${isMasc ? 'o' : 'a'} interessad${isMasc ? 'o' : 'a'},
      para fins de <strong>${v(vars,'{{FINALIDADE}}')}</strong>.
    </div>
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlCertificadoHabilitacoes(vars: Record<string,string>, assinantes: Assinante[], notas: any[], alunoId: string): string {
  const isMasc = gen(v(vars,'{{GENERO}}'));
  const notasAluno = notas.filter(n => n.alunoId === alunoId);
  const notasPorDisc: Record<string,number> = {};
  for (const n of notasAluno) {
    const nf = n.nf ?? n.mac ?? 0;
    if (!notasPorDisc[n.disciplina] || nf > notasPorDisc[n.disciplina]) notasPorDisc[n.disciplina] = nf;
  }
  const disc = Object.entries(notasPorDisc).sort(([a],[b]) => a.localeCompare(b));
  const media = disc.length ? (disc.reduce((s,[,nf]) => s+nf, 0)/disc.length).toFixed(1) : '—';
  const rows = disc.map(([d,nf]) =>
    `<tr><td>${d}</td><td class="nota-val ${nf>=10?'nota-apto':'nota-rep'}">${nf}</td><td class="nota-val">${nf>=10?'Apto':'Não Apto'}</td></tr>`
  ).join('');
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">República de Angola — Ministério da Educação</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('CH')}</div>
    <div class="doc-titulo">Certificado de Habilitações</div>
    <div class="body-text">
      Certifica-se que <strong>${v(vars,'{{NOME_COMPLETO}}')}</strong>,
      ${isMasc ? 'filho de' : 'filha de'} <strong>${v(vars,'{{PAI}}')}</strong> e de <strong>${v(vars,'{{MAE}}')}</strong>,
      nascid${isMasc ? 'o' : 'a'} em ${v(vars,'{{DATA_NASCIMENTO}}')},
      portador${isMasc ? '' : 'a'} do Bilhete de Identidade n.º <strong>${v(vars,'{{BI_NUMERO}}')}</strong>,
      com o número de matrícula <strong>${v(vars,'{{NUMERO_MATRICULA}}')}</strong>,
      frequentou com <strong>aproveitamento</strong> a <strong>${v(vars,'{{CLASSE}}')}</strong>
      desta instituição, no ano lectivo <strong>${v(vars,'{{ANO_LECTIVO}}')}</strong>,
      obtendo uma média geral de <strong>${media} Valores</strong>.
    </div>
    ${disc.length > 0 ? `<div class="section-title">Classificações Obtidas</div>
    <table class="notas-table">
      <thead><tr><th>Disciplina</th><th style="text-align:center">Nota Final</th><th style="text-align:center">Resultado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : ''}
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlBoletimNotas(vars: Record<string,string>, assinantes: Assinante[], notas: any[], alunoId: string): string {
  const notasAluno = notas.filter(n => n.alunoId === alunoId);
  const byDisc: Record<string, Record<number,any>> = {};
  for (const n of notasAluno) {
    if (!byDisc[n.disciplina]) byDisc[n.disciplina] = {};
    byDisc[n.disciplina][n.trimestre] = n;
  }
  const disciplinas = Object.keys(byDisc).sort();
  const rows = disciplinas.map(disc => {
    const t1 = byDisc[disc][1]; const t2 = byDisc[disc][2]; const t3 = byDisc[disc][3];
    const nf = t3?.nf ?? t2?.nf ?? t1?.nf ?? '—';
    const ok = typeof nf === 'number' && nf >= 10;
    return `<tr>
      <td>${disc}</td>
      <td class="nota-val">${t1?.nf ?? '—'}</td>
      <td class="nota-val">${t2?.nf ?? '—'}</td>
      <td class="nota-val">${t3?.nf ?? '—'}</td>
      <td class="nota-val ${ok ? 'nota-apto' : typeof nf==='number' ? 'nota-rep' : ''}">${nf}</td>
      <td class="nota-val">${typeof nf==='number' ? (nf>=10?'APTO':'NÃO APTO') : '—'}</td>
    </tr>`;
  }).join('');
  const aptos = disciplinas.filter(d => { const nfs=Object.values(byDisc[d]).map((n:any)=>n.nf??0); return nfs.length>0 && Math.max(...nfs)>=10; }).length;
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica — Boletim de Notas</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('BN')}</div>
    <div class="doc-titulo">Boletim de Notas</div>
    <div class="section-title">Dados do Aluno</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome Completo</div><div class="info-val">${v(vars,'{{NOME_COMPLETO}}')}</div></div>
      <div class="info-item"><div class="info-label">N.º de Matrícula</div><div class="info-val">${v(vars,'{{NUMERO_MATRICULA}}')}</div></div>
      <div class="info-item"><div class="info-label">Turma / Classe</div><div class="info-val">${v(vars,'{{TURMA}}')} — ${v(vars,'{{CLASSE}}')}</div></div>
      <div class="info-item"><div class="info-label">Ano Lectivo</div><div class="info-val">${v(vars,'{{ANO_LECTIVO}}')}</div></div>
      <div class="info-item"><div class="info-label">Turno</div><div class="info-val">${v(vars,'{{TURNO}}')}</div></div>
      <div class="info-item"><div class="info-label">Nível</div><div class="info-val">${v(vars,'{{NIVEL}}')}</div></div>
    </div>
    <div class="section-title">Resultados por Disciplina</div>
    ${disciplinas.length === 0
      ? '<p style="color:#666;font-style:italic;">Sem notas registadas.</p>'
      : `<table class="notas-table">
        <thead><tr><th>Disciplina</th><th style="text-align:center">1.º Trim.</th><th style="text-align:center">2.º Trim.</th><th style="text-align:center">3.º Trim.</th><th style="text-align:center">Nota Final</th><th style="text-align:center">Resultado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:10pt;color:#555;margin-top:8px;">Disciplinas aprovadas: <strong>${aptos}/${disciplinas.length}</strong></p>`}
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v(vars,'{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlHistoricoEscolar(vars: Record<string,string>, assinantes: Assinante[], notas: any[], alunoId: string): string {
  const notasAluno = notas.filter(n => n.alunoId === alunoId);
  const byAno: Record<string, Record<string, Record<number,any>>> = {};
  for (const n of notasAluno) {
    if (!byAno[n.anoLetivo]) byAno[n.anoLetivo] = {};
    if (!byAno[n.anoLetivo][n.disciplina]) byAno[n.anoLetivo][n.disciplina] = {};
    byAno[n.anoLetivo][n.disciplina][n.trimestre] = n;
  }
  const anos = Object.keys(byAno).sort();
  const sections = anos.map(ano => {
    const discs = Object.keys(byAno[ano]).sort();
    const rows = discs.map(disc => {
      const t1=byAno[ano][disc][1]; const t2=byAno[ano][disc][2]; const t3=byAno[ano][disc][3];
      const nf = t3?.nf ?? t2?.nf ?? t1?.nf ?? '—';
      const ok = typeof nf === 'number' && nf >= 10;
      return `<tr>
        <td>${disc}</td>
        <td class="nota-val">${t1?.nf??'—'}</td>
        <td class="nota-val">${t2?.nf??'—'}</td>
        <td class="nota-val">${t3?.nf??'—'}</td>
        <td class="nota-val ${ok?'nota-apto':typeof nf==='number'?'nota-rep':''}">${nf}</td>
      </tr>`;
    }).join('');
    return `<div class="section-title">Ano Lectivo ${ano}</div>
    <table class="notas-table">
      <thead><tr><th>Disciplina</th><th style="text-align:center">1.º Trim.</th><th style="text-align:center">2.º Trim.</th><th style="text-align:center">3.º Trim.</th><th style="text-align:center">Nota Final</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }).join('<div style="margin-top:20px"></div>');
  return `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <div class="escola-nome">${v(vars,'{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica — Histórico Escolar</div>
    </div>
    <div class="num-doc">N.º Doc: ${docNum('HE')}</div>
    <div class="doc-titulo">Histórico Escolar</div>
    <div class="info-grid" style="margin-bottom:20px;">
      <div class="info-item"><div class="info-label">Nome Completo</div><div class="info-val">${v(vars,'{{NOME_COMPLETO}}')}</div></div>
      <div class="info-item"><div class="info-label">N.º de Matrícula</div><div class="info-val">${v(vars,'{{NUMERO_MATRICULA}}')}</div></div>
      <div class="info-item"><div class="info-label">Data de Nascimento</div><div class="info-val">${v(vars,'{{DATA_NASCIMENTO}}')}</div></div>
      <div class="info-item"><div class="info-label">Naturalidade</div><div class="info-val">${v(vars,'{{NATURALIDADE}}')}</div></div>
    </div>
    ${anos.length === 0 ? '<p style="color:#666;font-style:italic;text-align:center;padding:20px">Sem registos de notas.</p>' : sections}
    <div class="local-data">${v(vars,'{{NOME_ESCOLA}}')}, ${v(vars,'{{DATA_ACTUAL}}')}.</div>
    ${renderSign(assinantes)}
    <div class="footer">${v(vars,'{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v(vars,'{{DATA_ACTUAL}}')}</div>
  </div></body></html>`;
}

function htmlCustomTemplate(conteudo: string, vars: Record<string,string>, assinantes: Assinante[]): string {
  let html = conteudo;
  for (const [tag, val] of Object.entries(vars)) {
    html = html.split(tag).join(val);
  }
  const signHtml = renderSign(assinantes);
  if (html.includes('{{ASSINATURAS}}')) {
    html = html.split('{{ASSINATURAS}}').join(signHtml);
  }
  if (!html.includes('<!DOCTYPE')) {
    html = `<!DOCTYPE html><html><head>${BASE_CSS}</head><body>
      <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
      <div class="page">${html}${signHtml}</div></body></html>`;
  }
  return html;
}

function buildVars(aluno: any, turma: any, config: any, anoAtual: string, finalidade: string, resultado: string): Record<string,string> {
  const now = new Date();
  const dataNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento) : null;
  return {
    '{{NOME_COMPLETO}}': `${aluno.nome} ${aluno.apelido}`,
    '{{NOME}}': aluno.nome,
    '{{APELIDO}}': aluno.apelido,
    '{{DATA_NASCIMENTO}}': dataNasc ? `${dataNasc.getDate()}/${dataNasc.getMonth()+1}/${dataNasc.getFullYear()}` : '—',
    '{{GENERO}}': aluno.genero === 'M' ? 'Masculino' : 'Feminino',
    '{{PROVINCIA}}': aluno.provincia || '—',
    '{{MUNICIPIO}}': aluno.municipio || '—',
    '{{NATURALIDADE}}': aluno.municipio || aluno.provincia || '—',
    '{{NUMERO_MATRICULA}}': aluno.numeroMatricula,
    '{{NOME_ENCARREGADO}}': aluno.nomeEncarregado || '—',
    '{{TELEFONE_ENCARREGADO}}': aluno.telefoneEncarregado || '—',
    '{{TURMA}}': turma?.nome || '—',
    '{{CLASSE}}': turma?.classe || '—',
    '{{NIVEL}}': turma?.nivel || '—',
    '{{TURNO}}': turma?.turno || '—',
    '{{ANO_LECTIVO}}': turma?.anoLetivo || anoAtual,
    '{{NOME_ESCOLA}}': config?.nomeEscola || 'Super Escola',
    '{{DATA_ACTUAL}}': fmtDate(now),
    '{{MES_ACTUAL}}': MESES[now.getMonth()],
    '{{ANO_ACTUAL}}': String(now.getFullYear()),
    '{{FINALIDADE}}': finalidade || '—',
    '{{PAI}}': aluno.nomePai || '—',
    '{{MAE}}': aluno.nomeMae || '—',
    '{{BI_NUMERO}}': aluno.numeroBi || '—',
    '{{BI_DATA_EMISSAO}}': aluno.biDataEmissao || '—',
    '{{BI_LOCAL_EMISSAO}}': aluno.biLocalEmissao || '—',
    '{{ENCARREGADO_PROFISSAO}}': aluno.encarregadoProfissao || '—',
    '{{ENCARREGADO_LOCAL_TRABALHO}}': aluno.encarregadoLocalTrabalho || '—',
    '{{ENCARREGADO_RESIDENCIA}}': aluno.encarregadoResidencia || '—',
    '{{RESULTADO}}': resultado || 'APTO',
  };
}

// ─── Pure HTML generator (sem side-effects) ──────────────────────────────────

function generateDocHTML(
  selectedKey: string | null,
  selectedCustomTpl: DocTemplate | null,
  selectedAluno: any,
  turmas: any[],
  config: any,
  anoAtual: string,
  finalidade: string,
  resultado: string,
  assinantes: Assinante[],
  notas: any[],
): string {
  if (!selectedAluno) return '';
  try {
    const turma = turmas.find(t => t.id === selectedAluno.turmaId);
    const vars = buildVars(selectedAluno, turma, config, anoAtual, finalidade, resultado);
    if (selectedCustomTpl) return htmlCustomTemplate(selectedCustomTpl.conteudo, vars, assinantes);
    switch (selectedKey) {
      case 'declaracao_matricula':    return htmlDeclaracaoMatricula(vars, assinantes);
      case 'atestado_frequencia':     return htmlAtestadoFrequencia(vars, assinantes);
      case 'declaracao_conclusao':    return htmlDeclaracaoConclusao(vars, assinantes);
      case 'certificado_habilitacoes':return htmlCertificadoHabilitacoes(vars, assinantes, notas, selectedAluno.id);
      case 'boletim_notas':           return htmlBoletimNotas(vars, assinantes, notas, selectedAluno.id);
      case 'historico_escolar':       return htmlHistoricoEscolar(vars, assinantes, notas, selectedAluno.id);
      default: return '';
    }
  } catch { return ''; }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  alunos: any[];
  turmas: any[];
  notas: any[];
  config: any;
  anoAtual: string;
  user: any;
}

export default function EmissaoRapidaModal({ visible, onClose, alunos, turmas, notas, config, anoAtual, user }: Props) {
  const isWeb = Platform.OS === 'web';

  const [step, setStep] = useState<'tipo' | 'aluno' | 'campos' | 'preview'>('tipo');
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedCustomTpl, setSelectedCustomTpl] = useState<DocTemplate | null>(null);
  const [selectedAluno, setSelectedAluno] = useState<any | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [resultado, setResultado] = useState('APTO');
  const [assinantes, setAssinantes] = useState<Assinante[]>([
    { nome: '', cargo: 'Director(a) Geral' },
    { nome: '', cargo: 'Director(a) Pedagógico(a)' },
    { nome: '', cargo: 'Chefe de Secretaria' },
  ]);
  const [generatedHTML, setGeneratedHTML] = useState('');
  const [generating, setGenerating] = useState(false);
  const [livePreviewHTML, setLivePreviewHTML] = useState('');
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('tipo');
    setSelectedKey(null);
    setSelectedCustomTpl(null);
    setSelectedAluno(null);
    setSearchQ('');
    setFinalidade('');
    setResultado('APTO');
    setGeneratedHTML('');
    setLivePreviewHTML('');
    setShowMobilePreview(false);
    setAssinantes([
      { nome: config?.directorGeral || '', cargo: 'Director(a) Geral' },
      { nome: config?.directorPedagogico || '', cargo: 'Director(a) Pedagógico(a)' },
      { nome: '', cargo: 'Chefe de Secretaria' },
    ]);
    setLoadingTpl(true);
    api.get('/api/doc-templates')
      .then((data: any) => {
        const list = Array.isArray(data) ? data : [];
        setDocTemplates(list.filter((t: any) => !t.bloqueado));
      })
      .catch(() => setDocTemplates([]))
      .finally(() => setLoadingTpl(false));
  }, [visible]);

  // ── Live preview debounce (só no passo campos) ───────────────────────────
  useEffect(() => {
    if (step !== 'campos' || !selectedAluno) { setLivePreviewHTML(''); return; }
    const timer = setTimeout(() => {
      const html = generateDocHTML(selectedKey, selectedCustomTpl, selectedAluno, turmas, config, anoAtual, finalidade, resultado, assinantes, notas);
      setLivePreviewHTML(html);
    }, 400);
    return () => clearTimeout(timer);
  }, [step, selectedAluno, selectedKey, selectedCustomTpl, finalidade, resultado, assinantes, turmas, config, anoAtual, notas]);

  const alunosFiltrados = useMemo(() => {
    if (!searchQ.trim()) return alunos.filter(a => a.ativo).slice(0, 20);
    const q = searchQ.toLowerCase();
    return alunos.filter(a => a.ativo && (
      `${a.nome} ${a.apelido}`.toLowerCase().includes(q) ||
      a.numeroMatricula?.toLowerCase().includes(q)
    )).slice(0, 20);
  }, [alunos, searchQ]);

  function selectedLabel(): string {
    if (selectedCustomTpl) return selectedCustomTpl.nome;
    return BUILTIN.find(b => b.key === selectedKey)?.label || '';
  }

  function requiresNotas(): boolean {
    return ['certificado_habilitacoes','boletim_notas','historico_escolar'].includes(selectedKey || '');
  }

  function handleGenerate() {
    if (!selectedAluno) { webAlert('Aluno necessário', 'Seleccione um aluno.'); return; }
    setGenerating(true);
    setTimeout(() => {
      try {
        const turma = turmas.find(t => t.id === selectedAluno.turmaId);
        const html = generateDocHTML(selectedKey, selectedCustomTpl, selectedAluno, turmas, config, anoAtual, finalidade, resultado, assinantes, notas)
          || `<html><body><p>Tipo desconhecido: ${selectedKey}</p></body></html>`;
        // Log emission
        api.post('/api/documentos-emitidos', {
          alunoId: selectedAluno.id,
          alunoNome: `${selectedAluno.nome} ${selectedAluno.apelido}`,
          alunoNum: selectedAluno.numeroMatricula,
          alunoTurma: turma?.nome || '',
          tipo: selectedCustomTpl ? selectedCustomTpl.nome : selectedLabel(),
          finalidade,
          anoAcademico: turma?.anoLetivo || anoAtual,
          emitidoPor: user?.nome || 'Secretaria',
        }).catch(() => {});
        setGeneratedHTML(html);
        setStep('preview');
      } finally {
        setGenerating(false);
      }
    }, 100);
  }

  function handlePrint() {
    if (!isWeb) { webAlert('Impressão', 'A impressão está disponível na versão web.'); return; }
    const iframe = document.getElementById('emissao-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write(generatedHTML); w.document.close(); w.print(); }
    }
  }

  function handleDownload() {
    if (!isWeb || !generatedHTML) return;
    const blob = new Blob([generatedHTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nome = `${selectedAluno?.nome || 'aluno'}-${selectedAluno?.apelido || ''}-${Date.now()}.html`.replace(/\s+/g, '-');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function updateAssinante(idx: number, field: 'nome' | 'cargo', value: string) {
    setAssinantes(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }

  // ── Step: Tipo ──────────────────────────────────────────────────────────────
  function renderStepTipo() {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={st.stepTitle}>Seleccione o Modelo</Text>
        <Text style={st.stepSub}>Documentos predefinidos e modelos personalizados activos</Text>

        <Text style={st.groupLabel}>Documentos Predefinidos</Text>
        <View style={st.tipoGrid}>
          {BUILTIN.map(b => (
            <TouchableOpacity
              key={b.key}
              style={[st.tipoCard, { borderColor: b.color + '55' }]}
              onPress={() => { setSelectedKey(b.key); setSelectedCustomTpl(null); setStep('aluno'); }}
            >
              <View style={[st.tipoIconWrap, { backgroundColor: b.color + '20' }]}>
                <Ionicons name={b.icon as any} size={22} color={b.color} />
              </View>
              <Text style={[st.tipoLabel, { color: b.color }]}>{b.label}</Text>
              <Text style={st.tipoDesc}>{b.desc}</Text>
              <Ionicons name="chevron-forward" size={14} color={b.color} style={{ alignSelf: 'flex-end', marginTop: 4 }} />
            </TouchableOpacity>
          ))}
        </View>

        {loadingTpl && (
          <View style={{ alignItems: 'center', padding: 16 }}>
            <AppLoader size="small" color={Colors.gold} />
            <Text style={st.stepSub}>A carregar modelos...</Text>
          </View>
        )}

        {!loadingTpl && docTemplates.length > 0 && (
          <>
            <Text style={[st.groupLabel, { marginTop: 16 }]}>Modelos Personalizados</Text>
            {docTemplates.map(tpl => (
              <TouchableOpacity
                key={tpl.id}
                style={st.customCard}
                onPress={() => { setSelectedCustomTpl(tpl); setSelectedKey('custom'); setStep('aluno'); }}
              >
                <View style={[st.tipoIconWrap, { backgroundColor: Colors.gold + '20' }]}>
                  <Ionicons name="document" size={20} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.customLabel}>{tpl.nome}</Text>
                  <Text style={st.tipoDesc}>{tpl.tipo || 'Modelo personalizado'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {!loadingTpl && docTemplates.length === 0 && (
          <View style={st.emptyBox}>
            <Ionicons name="document-outline" size={28} color={Colors.textMuted} />
            <Text style={st.emptyText}>Sem modelos personalizados activos.{'\n'}Crie-os no Editor de Documentos.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Step: Aluno ─────────────────────────────────────────────────────────────
  function renderStepAluno() {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={st.stepTitle}>Seleccione o Aluno</Text>
        <Text style={st.stepSub}>Documento: <Text style={{ color: Colors.gold }}>{selectedLabel()}</Text></Text>

        <View style={st.searchBox}>
          <StableSearchInput
            value={searchQ}
            onChangeText={setSearchQ}
            inputStyle={st.searchInput}
            placeholder="Pesquisar por nome ou matrícula..."
            iconColor={Colors.textMuted}
          />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {alunosFiltrados.length === 0 ? (
            <View style={st.emptyBox}>
              <Ionicons name="person-outline" size={28} color={Colors.textMuted} />
              <Text style={st.emptyText}>Nenhum aluno encontrado</Text>
            </View>
          ) : alunosFiltrados.map(a => {
            const turma = turmas.find(t => t.id === a.turmaId);
            return (
              <TouchableOpacity
                key={a.id}
                style={st.alunoCard}
                onPress={() => { setSelectedAluno(a); setStep('campos'); }}
              >
                <View style={st.alunoAvatar}>
                  <Text style={st.alunoAvatarTxt}>{a.nome[0]}{a.apelido[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.alunoNome}>{a.nome} {a.apelido}</Text>
                  <Text style={st.alunoMeta}>{a.numeroMatricula} · {turma?.nome || '—'} · {turma?.classe || '—'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ── Step: Campos — form content ─────────────────────────────────────────────
  function renderCamposForm() {
    const turma = turmas.find(t => t.id === selectedAluno?.turmaId);
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.stepTitle}>Preencher Campos</Text>

        {/* Aluno selecionado */}
        <View style={st.selectedBar}>
          <View style={[st.alunoAvatar, { width: 36, height: 36, borderRadius: 18 }]}>
            <Text style={[st.alunoAvatarTxt, { fontSize: 13 }]}>{selectedAluno?.nome?.[0]}{selectedAluno?.apelido?.[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.alunoNome}>{selectedAluno?.nome} {selectedAluno?.apelido}</Text>
            <Text style={st.alunoMeta}>{selectedAluno?.numeroMatricula} · {turma?.nome || '—'} · {turma?.classe || '—'}</Text>
          </View>
          <TouchableOpacity onPress={() => setStep('aluno')}>
            <Text style={{ fontSize: 12, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>Alterar</Text>
          </TouchableOpacity>
        </View>

        {/* Finalidade */}
        <Text style={st.fieldLabel}>Finalidade / Destino</Text>
        <TextInput
          style={st.input}
          value={finalidade}
          onChangeText={setFinalidade}
          placeholder="Ex: Bolsa de estudo, emprego, banco..."
          placeholderTextColor={Colors.textMuted}
        />

        {/* Filiação e BI são lidos automaticamente da ficha do aluno */}
        {selectedAluno && (() => {
          const dadosFicha: { label: string; value?: string }[] = [
            { label: 'Nome do Pai', value: selectedAluno.nomePai },
            { label: 'Nome da Mãe', value: selectedAluno.nomeMae },
            { label: 'N.º do Bilhete de Identidade', value: selectedAluno.numeroBi },
          ];
          const emFalta = dadosFicha.filter(d => !d.value || !String(d.value).trim());
          return (
            <View style={st.fichaCard}>
              <View style={st.fichaCardHeader}>
                <Ionicons
                  name={emFalta.length === 0 ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={emFalta.length === 0 ? Colors.success : Colors.warning}
                />
                <Text style={st.fichaCardTitle}>Dados da Ficha do Aluno</Text>
              </View>
              <Text style={st.fichaCardSub}>
                Filiação e Bilhete de Identidade são preenchidos automaticamente a partir da ficha — não precisa de os reintroduzir aqui.
              </Text>
              <View style={st.fichaList}>
                {dadosFicha.map((d, i) => (
                  <View key={i} style={st.fichaRow}>
                    <Text style={st.fichaLabel}>{d.label}</Text>
                    {d.value && String(d.value).trim() ? (
                      <Text style={st.fichaValue} numberOfLines={1}>{d.value}</Text>
                    ) : (
                      <Text style={st.fichaValueEmpty}>Por preencher na ficha</Text>
                    )}
                  </View>
                ))}
              </View>
              {emFalta.length > 0 && (
                <Text style={st.fichaHint}>
                  Para corrigir, abra <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Alunos → {selectedAluno.nome} {selectedAluno.apelido} → Editar Dados</Text>.
                </Text>
              )}
            </View>
          );
        })()}

        {/* Resultado (apenas para certos tipos) */}
        {(selectedKey === 'declaracao_conclusao' || selectedKey === 'certificado_habilitacoes') && (
          <>
            <Text style={st.fieldLabel}>Resultado</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['APTO','NÃO APTO','APROVADO','REPROVADO'].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[st.chip, resultado === r && { backgroundColor: Colors.success + '20', borderColor: Colors.success }]}
                  onPress={() => setResultado(r)}
                >
                  <Text style={[st.chipTxt, resultado === r && { color: Colors.success }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ─── Assinantes ─── */}
        <View style={st.signSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="create" size={14} color={Colors.gold} />
            <Text style={st.signTitle}>Assinantes do Documento</Text>
          </View>

          {assinantes.map((a, i) => (
            <View key={i} style={st.signRow}>
              <View style={st.signNumBadge}>
                <Text style={st.signNum}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <TextInput
                  style={st.input}
                  value={a.nome}
                  onChangeText={val => updateAssinante(i, 'nome', val)}
                  placeholder={`Nome do assinante ${i + 1}`}
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={[st.input, { backgroundColor: Colors.background }]}
                  value={a.cargo}
                  onChangeText={val => updateAssinante(i, 'cargo', val)}
                  placeholder="Cargo / Função"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>
          ))}

          <View style={{ backgroundColor: Colors.info + '15', borderRadius: 8, padding: 10, flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.info} style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 11, color: Colors.textMuted, flex: 1, fontFamily: 'Inter_400Regular' }}>
              Deixe o nome em branco para omitir o assinante. O cargo pode ser editado livremente.
            </Text>
          </View>
        </View>

        {/* Mobile: toggle pré-visualização */}
        {!isWeb && (
          <TouchableOpacity
            style={[st.previewToggleBtn, showMobilePreview && { backgroundColor: Colors.gold + '20', borderColor: Colors.gold }]}
            onPress={() => setShowMobilePreview(v => !v)}
          >
            <Ionicons name={showMobilePreview ? 'eye-off-outline' : 'eye-outline'} size={16} color={showMobilePreview ? Colors.gold : Colors.textMuted} />
            <Text style={[st.previewToggleTxt, showMobilePreview && { color: Colors.gold }]}>
              {showMobilePreview ? 'Ocultar pré-visualização' : 'Pré-visualizar documento'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[st.generateBtn, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <AppLoader size="small" color="#fff" />
            : <Ionicons name="eye" size={18} color="#fff" />}
          <Text style={st.generateBtnTxt}>{generating ? 'A gerar...' : 'Gerar e Imprimir'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Step: Campos ────────────────────────────────────────────────────────────
  function renderStepCampos() {
    if (isWeb) {
      return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Formulário (lado esquerdo) */}
          <View style={{ width: 380, borderRightWidth: 1, borderRightColor: Colors.border }}>
            {renderCamposForm()}
          </View>

          {/* Pré-visualização ao vivo (lado direito) */}
          <View style={{ flex: 1, backgroundColor: '#e5e7eb', position: 'relative' }}>
            {/* Barra topo do painel */}
            <View style={st.livePreviewBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={st.liveIndicator} />
                <Text style={st.livePreviewBarTitle}>Pré-visualização em tempo real</Text>
              </View>
              {livePreviewHTML ? (
                <Text style={st.livePreviewBarSub}>A actualizar conforme preenche os campos</Text>
              ) : (
                <Text style={st.livePreviewBarSub}>Preencha os campos para ver o documento</Text>
              )}
            </View>

            {livePreviewHTML ? (
              <iframe
                srcDoc={livePreviewHTML}
                style={{
                  flex: 1,
                  border: 'none',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#fff',
                } as any}
                title="Pré-visualização"
              />
            ) : (
              <View style={st.livePreviewEmpty}>
                <Ionicons name="document-outline" size={48} color={Colors.textMuted + '66'} />
                <Text style={st.livePreviewEmptyTitle}>Aguardando dados</Text>
                <Text style={st.livePreviewEmptySub}>
                  Seleccione um aluno e preencha os campos{'\n'}para ver a pré-visualização aqui.
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // Mobile: formulário + prévia opcional
    return (
      <View style={{ flex: 1 }}>
        {renderCamposForm()}
        {showMobilePreview && (
          <View style={st.mobilePreviewOverlay}>
            <View style={st.mobilePreviewCard}>
              <View style={st.mobilePreviewHeader}>
                <Text style={st.mobilePreviewTitle}>Pré-visualização</Text>
                <TouchableOpacity onPress={() => setShowMobilePreview(false)}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
                <Ionicons name="phone-portrait-outline" size={40} color={Colors.textMuted} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center' }}>
                  Pré-visualização disponível na versão web
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
                  No browser, o documento aparece em tempo real à direita do formulário.
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── Step: Preview ───────────────────────────────────────────────────────────
  function renderStepPreview() {
    return (
      <View style={{ flex: 1 }}>
        <View style={st.previewBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.previewTitle}>{selectedLabel()}</Text>
            <Text style={st.previewSub}>{selectedAluno?.nome} {selectedAluno?.apelido}</Text>
          </View>
          <TouchableOpacity style={st.printBtn} onPress={handlePrint}>
            <Ionicons name="print" size={15} color="#fff" />
            <Text style={st.printBtnTxt}>Imprimir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={15} color="#fff" />
            <Text style={st.downloadBtnTxt}>Guardar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.newBtn} onPress={() => setStep('campos')}>
            <Ionicons name="arrow-back" size={15} color={Colors.gold} />
            <Text style={st.newBtnTxt}>Editar</Text>
          </TouchableOpacity>
        </View>

        {isWeb ? (
          <iframe
            id="emissao-iframe"
            srcDoc={generatedHTML}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 500 } as any}
            title="Pré-visualização"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' }}>
              Documento gerado com sucesso!
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
              A pré-visualização e impressão estão disponíveis na versão web.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Step bar ────────────────────────────────────────────────────────────────
  const STEPS = [
    { key: 'tipo',    label: 'Modelo',   icon: 'document' },
    { key: 'aluno',   label: 'Aluno',    icon: 'person' },
    { key: 'campos',  label: 'Campos',   icon: 'create' },
    { key: 'preview', label: 'Prévia',   icon: 'eye' },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.container}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Emissão de Documentos</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step bar */}
        <View style={st.stepBar}>
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            const color = done ? Colors.success : active ? Colors.gold : Colors.textMuted;
            return (
              <React.Fragment key={s.key}>
                <TouchableOpacity
                  style={st.stepItem}
                  onPress={() => { if (done) setStep(s.key as any); }}
                  disabled={!done}
                >
                  <View style={[st.stepCircle, { borderColor: color, backgroundColor: done ? Colors.success + '20' : active ? Colors.gold + '20' : 'transparent' }]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color={Colors.success} />
                      : <Ionicons name={s.icon as any} size={14} color={color} />}
                  </View>
                  <Text style={[st.stepLabel, { color }]}>{s.label}</Text>
                </TouchableOpacity>
                {i < STEPS.length - 1 && <View style={[st.stepLine, { backgroundColor: done ? Colors.success : Colors.border }]} />}
              </React.Fragment>
            );
          })}
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {step === 'tipo'    && renderStepTipo()}
          {step === 'aluno'   && renderStepAluno()}
          {step === 'campos'  && renderStepCampos()}
          {step === 'preview' && renderStepPreview()}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  closeBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },

  stepBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepItem:     { alignItems: 'center', gap: 4, minWidth: 52 },
  stepCircle:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  stepLabel:    { fontSize: 10, fontFamily: 'Inter_500Medium' },
  stepLine:     { flex: 1, height: 1.5, marginBottom: 12 },

  stepTitle:    { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  stepSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 14 },
  groupLabel:   { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  tipoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tipoCard:     { width: '47%', borderRadius: 14, borderWidth: 1.5, backgroundColor: Colors.surface, padding: 14, gap: 6 },
  tipoIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tipoLabel:    { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tipoDesc:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 15 },

  customCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.gold + '33' },
  customLabel:  { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  emptyBox:     { alignItems: 'center', padding: 24, gap: 8, marginTop: 8 },
  emptyText:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  searchBox:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  searchInput:  { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, outlineStyle: 'none' as any },

  alunoCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  alunoAvatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.info + '30', alignItems: 'center', justifyContent: 'center' },
  alunoAvatarTxt:{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.info },
  alunoNome:    { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoMeta:    { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  selectedBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '15', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.success + '40', marginBottom: 16 },

  fieldLabel:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input:        { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 12, outlineStyle: 'none' as any },

  fichaCard:        { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  fichaCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fichaCardTitle:   { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  fichaCardSub:     { fontSize: 11.5, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17, marginBottom: 10 },
  fichaList:        { gap: 4 },
  fichaRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: 12 },
  fichaLabel:       { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  fichaValue:       { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: Colors.text, maxWidth: '55%', textAlign: 'right' },
  fichaValueEmpty:  { fontSize: 11.5, fontFamily: 'Inter_400Regular', color: Colors.warning, fontStyle: 'italic' },
  fichaHint:        { marginTop: 10, fontSize: 11.5, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },

  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginBottom: 12 },
  chipTxt:      { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  signSection:  { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  signTitle:    { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  signRow:      { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  signNumBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.gold + '25', borderWidth: 1, borderColor: Colors.gold + '55', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  signNum:      { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold },

  generateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 12, padding: 16, marginTop: 4 },
  generateBtnTxt:{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  previewBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 12, paddingHorizontal: 16 },
  previewTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  previewSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  printBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  printBtnTxt:  { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  downloadBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#166534', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  downloadBtnTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  newBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.gold + '55' },
  newBtnTxt:    { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  // Live preview panel (web split-screen)
  livePreviewBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  liveIndicator:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  livePreviewBarTitle:   { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  livePreviewBarSub:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  livePreviewEmpty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  livePreviewEmptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  livePreviewEmptySub:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Mobile preview toggle
  previewToggleBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  previewToggleTxt:  { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  // Mobile preview overlay
  mobilePreviewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 99, justifyContent: 'flex-end' },
  mobilePreviewCard:    { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%' },
  mobilePreviewHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  mobilePreviewTitle:   { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
});
