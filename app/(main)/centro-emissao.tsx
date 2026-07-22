import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import {Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import PdfProgressModal from '@/components/PdfProgressModal';
import { usePdfProgress } from '@/hooks/usePdfProgress';
import { useTabMemory } from '@/hooks/useTabMemory';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { apiRequest } from '@/lib/query-client';
import { useData, Aluno, Nota } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { StableSearchInput } from '@/components/StableSearchInput';
import DateInput from '@/components/DateInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
// ─── Types ────────────────────────────────────────────────────────────────────

interface Solicitacao {
  id: string;
  alunoId: string;
  tipo: string;
  motivo: string;
  observacao?: string;
  status: string;
  resposta?: string;
  referenciaPagamento?: string;
  createdAt: string;
  updatedAt?: string;
  nomeAluno?: string;
  apelidoAluno?: string;
  alunoNumMatricula?: string;
  nomeTurma?: string;
  classeAluno?: string;
}

interface DisciplinaExame {
  nome: string;
  diaSemana: string;
  data: string;
}

interface Registro {
  id: string;
  nomeCompleto: string;
  classe?: string;
  cursoNome?: string;
  rupeInscricao?: string;
  status?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Solicitações', 'Listas de Admissão', 'Emissão Direta'] as const;
type Tab = typeof TABS[number];

const TIPO_ICONS: Record<string, string> = {
  'Declaração de Matrícula':        'document-text',
  'Certificado de Notas':           'bar-chart',
  'Certificado de Frequência':      'checkmark-circle',
  'Declaração de Conclusão de Curso': 'school',
  'Histórico Escolar':              'time',
  'Diploma':                        'ribbon',
  'Outros':                         'document',
};

const TIPO_COLORS: Record<string, string> = {
  'Declaração de Matrícula':        Colors.info,
  'Certificado de Notas':           '#8b5cf6',
  'Certificado de Frequência':      Colors.success,
  'Declaração de Conclusão de Curso': '#14b8a6',
  'Histórico Escolar':              Colors.warning,
  'Diploma':                        Colors.gold,
  'Outros':                         Colors.textSecondary,
};

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pendente:         { label: 'Pendente',         color: Colors.warning, icon: 'time-outline' },
  em_processamento: { label: 'Em Processamento', color: Colors.info,    icon: 'cog-outline' },
  concluido:        { label: 'Concluído',         color: Colors.success, icon: 'checkmark-circle-outline' },
  cancelado:        { label: 'Cancelado',         color: Colors.danger,  icon: 'close-circle-outline' },
};

const STATUS_FILTERS = ['todos', 'pendente', 'em_processamento', 'concluido', 'cancelado'];

const DOC_TIPOS_EMISSAO = [
  { key: 'declaracao_matricula',  label: 'Declaração de Matrícula',     icon: 'document-text', color: Colors.info },
  { key: 'atestado_frequencia',   label: 'Atestado de Frequência',       icon: 'checkmark-circle', color: Colors.success },
  { key: 'boletim_notas',         label: 'Boletim de Notas',             icon: 'bar-chart', color: '#8b5cf6' },
  { key: 'historico_escolar',     label: 'Histórico Escolar',            icon: 'time', color: Colors.warning },
  { key: 'declaracao_conclusao',  label: 'Declaração de Conclusão',      icon: 'school', color: '#14b8a6' },
  { key: 'certificado_habilitacoes', label: 'Certificado de Habilitações', icon: 'ribbon', color: Colors.gold },
] as const;

const STATUSES_INSCRICAO = ['pendente', 'pendente_pagamento', 'aprovado', 'aguardando_prova', 'aguardando prova', 'em_processamento', 'inscrito'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoje(): string {
  const d = new Date();
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  } catch { return iso; }
}

function numInscricao(r: Registro, idx: number): string {
  if (r.rupeInscricao) {
    const p = r.rupeInscricao.split('-');
    if (p.length >= 4) return p[3];
  }
  return String(10000 + idx);
}

function classeSort(a: string, b: string): number {
  const n = (s: string) => parseInt(s) || 99;
  return n(a) - n(b);
}

// ─── PDF CSS ─────────────────────────────────────────────────────────────────

const DOC_CSS = `
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #111; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 25mm; position: relative; }
    .header { text-align: center; border-bottom: 3px double #111; padding-bottom: 12px; margin-bottom: 20px; }
    .header-brasao { width: 65px; height: auto; display: block; margin: 0 auto 5px; }
    .header-rep { font-size: 9pt; line-height: 1.6; margin: 0; }
    .escola-nome { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .escola-sub { font-size: 10pt; margin-top: 4px; }
    .doc-titulo { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase;
      letter-spacing: 2px; margin: 30px 0 24px; text-decoration: underline; }
    .body-text { font-size: 12pt; line-height: 2; text-align: justify; margin-bottom: 16px; }
    .assinatura { margin-top: 60px; text-align: center; }
    .assinatura .linha { border-top: 1px solid #111; width: 280px; margin: 0 auto 6px; }
    .assinatura p { font-size: 11pt; }
    .local-data { margin-top: 40px; text-align: right; font-size: 11pt; }
    .notas-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 11pt; }
    .notas-table th { background: #1a2540; color: #fff; padding: 8px 10px; text-align: left; font-weight: bold; }
    .notas-table td { padding: 7px 10px; border-bottom: 1px solid #ddd; }
    .notas-table tr:nth-child(even) td { background: #f9f9f9; }
    .nota-val { font-weight: bold; text-align: center; }
    .nota-apto { color: #166534; }
    .nota-reprovado { color: #991b1b; }
    .section-title { font-size: 13pt; font-weight: bold; text-transform: uppercase;
      border-bottom: 2px solid #1a2540; padding-bottom: 4px; margin: 20px 0 12px; letter-spacing: 1px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; font-size: 11pt; }
    .info-item { border-bottom: 1px dotted #bbb; padding-bottom: 4px; }
    .info-label { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-val { font-weight: bold; font-size: 11.5pt; margin-top: 2px; }
    .num-doc { text-align: right; font-size: 9pt; color: #666; margin-bottom: 20px; }
    .footer { position: absolute; bottom: 15mm; left: 25mm; right: 25mm;
      border-top: 1px solid #999; padding-top: 8px; font-size: 8.5pt; color: #666; text-align: center; }
    .verif-section { display:flex; gap:16px; align-items:center; margin:20px 0 14px;
      padding:10px 14px; border:1px solid #dde0ef; border-radius:8px; background:#f9faff; }
    .verif-qr { text-align:center; flex-shrink:0; }
    .verif-qr img { border:1px solid #dde; border-radius:4px; display:block; }
    .verif-bar { flex:1; text-align:center; }
    .verif-info { flex:1.2; font-size:8.5pt; line-height:1.9; color:#555; }
    .verif-info strong { color:#1a2b5f; }
    .verif-sub { font-size:7pt; color:#9ca3af; }
    .verif-label { font-size:7pt; text-transform:uppercase; color:#888; margin-top:3px; letter-spacing:.5px; }
    .print-btn { display:block; margin:24px auto; padding:12px 36px; background:#1a2540; color:#fff;
      border:none; border-radius:8px; font-size:14px; font-family:sans-serif; cursor:pointer; font-weight:bold; }
    @media print {
      body { margin: 0; }
      .print-btn { display: none !important; }
      .page { padding: 15mm 20mm; box-shadow: none; }
    }
  </style>`;

const LISTA_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #f5f5f5; }
  .doc-page { background: #fff; max-width: 210mm; margin: 0 auto 20px; padding: 14mm 18mm 12mm; min-height: 297mm; }
  .doc-header { text-align: center; margin-bottom: 12px; }
  .header-brasao { width: 72px; height: auto; display: block; margin: 0 auto 5px; }
  .header-rep { font-size: 10px; line-height: 1.6; margin: 0; }
  .escola-nome { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .doc-titulo { font-size: 12px; font-weight: bold; margin-bottom: 4px; }
  .doc-subtitulo { font-size: 11px; font-weight: bold; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .disciplinas-line { font-size: 10px; font-weight: bold; background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 3px; padding: 4px 8px; display: inline-block; }
  .local-row { display: flex; align-items: center; gap: 8px; margin: 8px 0 6px; font-size: 11px; flex-wrap: wrap; }
  .local-label { font-weight: bold; }
  .local-sep { flex: 1; }
  .hora-box { margin-left: auto; font-size: 14px; }
  .divider { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .bloco-titulo { font-size: 11px; margin-bottom: 6px; padding: 4px 8px; background: #f8f8f8; border-left: 4px solid #1E3A5F; }
  .sub-bloco-titulo { font-size: 10.5px; margin: 10px 0 4px; padding: 3px 6px; background: #eef2ff; border-left: 3px solid #6366f1; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 6px; font-size: 10.5px; }
  th { background: #fff; font-weight: bold; border-bottom: 2px solid #000; border-top: 1px solid #000; padding: 5px 7px; text-align: left; }
  td { border-bottom: 1px solid #ddd; padding: 4px 7px; vertical-align: middle; }
  .num, .th-num { width: 36px; text-align: center; font-weight: bold; }
  .nome, .th-nome { min-width: 200px; }
  .cand, .th-cand { width: 80px; text-align: center; font-weight: bold; font-family: monospace; }
  .curso-td, .th-curso { min-width: 130px; }
  .assinaturas { display: flex; justify-content: space-between; margin-top: 30px; font-size: 10px; }
  .ass-col { text-align: center; }
  .ass-line { width: 160px; border-top: 1px solid #000; margin: 0 auto 4px; margin-top: 24px; }
  .rodape { margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px; display: flex; justify-content: space-between; font-size: 8px; color: #555; }
  .print-btn { position: fixed; bottom: 18px; right: 18px; background: #1E3A5F; color: #fff; border: none; border-radius: 8px; padding: 12px 22px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 999; }
  @media print {
    .print-btn { display: none !important; }
    body { background: #fff; }
    .doc-page { margin: 0; padding: 10mm 14mm 8mm; box-shadow: none; min-height: auto; }
    @page { size: A4 portrait; margin: 0; }
  }`;

// ─── PDF template builders ─────────────────────────────────────────────────

function safeBarVal(s: string): string {
  return (s || 'DOC000').replace(/[^A-Z0-9\-\. ]/gi,'').substring(0,30) || 'DOC000';
}

function buildVerif(docRef: string, nomeEscola: string, nomeAluno: string, bid: string): string {
  const qrPayload = `SIGA|${docRef}|${nomeEscola}|${nomeAluno}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrPayload)}&bgcolor=ffffff&color=1a2b5f&margin=4&ecc=M`;
  const bcVal = safeBarVal(docRef);
  return `<div class="verif-section">
    <div class="verif-qr">
      <img src="${qrUrl}" alt="QR" width="90" height="90" onerror="this.style.display='none'" />
      <div class="verif-label">QR Verificação</div>
    </div>
    <div class="verif-bar">
      <svg id="bc-${bid}" style="max-width:100%;height:55px"></svg>
      <div class="verif-label">Código de Barras</div>
    </div>
    <div class="verif-info">
      <strong>Ref.:</strong> ${docRef}<br>
      <span class="verif-sub">Documento autêntico. Verifique pelo QR code.</span>
    </div>
  </div>
  <script>
    window.addEventListener('load',function(){
      try{JsBarcode('#bc-${bid}','${bcVal}',{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:9,margin:2,background:'transparent',lineColor:'#1a2b5f',fontOptions:'bold'});}
      catch(e){}
    });
  </script>`;
}

function genDocRef(prefix: string): string {
  return `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
}

function buildDeclaracaoMatricula(aluno: Aluno, turmaNome: string, classe: string, turno: string, anoLetivo: string, nomeEscola: string, directorGeral: string, motivo: string): string {
  const gen = aluno.genero === 'F' ? 'F' : 'M';
  const sufixo = gen === 'F' ? 'a' : '';
  const docRef = genDocRef('DM');
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  return `<!DOCTYPE html><html><head>${DOC_CSS}</head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola}</div>
      <div class="escola-sub">Secretaria Académica — Declaração de Matrícula</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Declaração de Matrícula</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${nomeCompleto.toUpperCase()}</strong>,
      ${gen === 'F' ? 'filha de' : 'filho de'} ${aluno.nomeEncarregado || '___'},
      portador${sufixo} do Bilhete de Identidade n.º <strong>${(aluno as any).bi || '___'}</strong>,
      encontra-se regularmente matriculad${sufixo} nesta instituição, na
      <strong>${classe}</strong>, turma <strong>${turmaNome}</strong>,
      turno da <strong>${turno}</strong>, no ano lectivo <strong>${anoLetivo}</strong>,
      com o número de matrícula <strong>${aluno.numeroMatricula}</strong>.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido d${sufixo || 'o'} interessad${sufixo || 'o'},
      para fins de <strong>${motivo || 'uso geral'}</strong>,
      e é válida pelo prazo de 90 (noventa) dias a contar da data de emissão.
    </div>
    <div class="local-data">${nomeEscola}, ${hoje()}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${directorGeral || 'O(A) Director(a) Geral'}</p>
      <p>Director(a) Geral</p>
    </div>
    ${buildVerif(docRef, nomeEscola, nomeCompleto, 'dm')}
    <div class="footer">${nomeEscola} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${aluno.numeroMatricula} &nbsp;|&nbsp; Emitido em ${hoje()}</div>
  </div></body></html>`;
}

function buildAtestadoFrequencia(aluno: Aluno, turmaNome: string, classe: string, anoLetivo: string, nomeEscola: string, directorGeral: string, motivo: string): string {
  const gen = aluno.genero === 'F' ? 'F' : 'M';
  const sufixo = gen === 'F' ? 'a' : '';
  const docRef = genDocRef('AF');
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  return `<!DOCTYPE html><html><head>${DOC_CSS}</head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola}</div>
      <div class="escola-sub">Secretaria Académica — Atestado de Frequência</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Atestado de Frequência</div>
    <div class="body-text">
      Para os devidos efeitos, atesto que <strong>${nomeCompleto.toUpperCase()}</strong>,
      com o número de matrícula <strong>${aluno.numeroMatricula}</strong>,
      portador${sufixo} do Bilhete de Identidade n.º <strong>${(aluno as any).bi || '___'}</strong>,
      é alun${sufixo || 'o'} desta instituição, matriculad${sufixo || 'o'} na
      <strong>${classe}</strong>, turma <strong>${turmaNome}</strong>,
      no ano lectivo <strong>${anoLetivo}</strong>, e tem frequentado as aulas regularmente.
    </div>
    <div class="body-text">
      O presente atestado é emitido a pedido d${sufixo || 'o'} interessad${sufixo || 'o'}, para fins de <strong>${motivo || 'uso geral'}</strong>.
    </div>
    <div class="body-text">A veracidade desta informação pode ser confirmada junto da Secretaria Académica desta escola.</div>
    <div class="local-data">${nomeEscola}, ${hoje()}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${directorGeral || 'O(A) Director(a) Geral'}</p>
      <p>Director(a) Geral</p>
    </div>
    ${buildVerif(docRef, nomeEscola, nomeCompleto, 'af')}
    <div class="footer">${nomeEscola} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${hoje()}</div>
  </div></body></html>`;
}

function buildBoletimNotas(aluno: Aluno, turmaNome: string, classe: string, anoLetivo: string, notas: Nota[], nomeEscola: string, directorGeral: string): string {
  const docRef = genDocRef('BN');
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  const notasPorDisc: Record<string, Record<number, Nota>> = {};
  for (const n of notas.filter(x => x.alunoId === aluno.id)) {
    if (!notasPorDisc[n.disciplina]) notasPorDisc[n.disciplina] = {};
    notasPorDisc[n.disciplina][n.trimestre] = n;
  }
  const disciplinas = Object.keys(notasPorDisc).sort();
  const rows = disciplinas.map(disc => {
    const t1 = notasPorDisc[disc][1];
    const t2 = notasPorDisc[disc][2];
    const t3 = notasPorDisc[disc][3];
    const nf = t3?.nf ?? t2?.nf ?? t1?.nf;
    const aprovado = typeof nf === 'number' && nf >= 10;
    return `<tr>
      <td>${disc}</td>
      <td class="nota-val">${t1?.nf ?? '—'}</td>
      <td class="nota-val">${t2?.nf ?? '—'}</td>
      <td class="nota-val">${t3?.nf ?? '—'}</td>
      <td class="nota-val ${aprovado ? 'nota-apto' : typeof nf === 'number' ? 'nota-reprovado' : ''}">${nf ?? '—'}</td>
      <td class="nota-val">${typeof nf === 'number' ? (aprovado ? 'APTO' : 'NÃO APTO') : '—'}</td>
    </tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head>${DOC_CSS}</head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola}</div>
      <div class="escola-sub">Secretaria Académica — Boletim de Notas</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Boletim de Notas</div>
    <div class="section-title">Dados do Aluno</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome</div><div class="info-val">${nomeCompleto}</div></div>
      <div class="info-item"><div class="info-label">N.º Matrícula</div><div class="info-val">${aluno.numeroMatricula}</div></div>
      <div class="info-item"><div class="info-label">Turma</div><div class="info-val">${turmaNome}</div></div>
      <div class="info-item"><div class="info-label">Classe</div><div class="info-val">${classe}</div></div>
      <div class="info-item"><div class="info-label">Ano Lectivo</div><div class="info-val">${anoLetivo}</div></div>
    </div>
    <div class="section-title">Resultados Académicos</div>
    <table class="notas-table">
      <thead><tr>
        <th>Disciplina</th><th style="text-align:center">1.º T</th><th style="text-align:center">2.º T</th><th style="text-align:center">3.º T</th><th style="text-align:center">NF</th><th style="text-align:center">Situação</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px">Sem notas registadas</td></tr>'}</tbody>
    </table>
    <div class="local-data">${nomeEscola}, ${hoje()}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${directorGeral || 'O(A) Director(a) Geral'}</p>
      <p>Director(a) Geral</p>
    </div>
    ${buildVerif(docRef, nomeEscola, nomeCompleto, 'bn')}
    <div class="footer">${nomeEscola} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${hoje()}</div>
  </div></body></html>`;
}

function buildDeclaracaoConclusao(aluno: Aluno, turmaNome: string, classe: string, anoLetivo: string, nomeEscola: string, directorGeral: string, motivo: string): string {
  const gen = aluno.genero === 'F' ? 'F' : 'M';
  const sufixo = gen === 'F' ? 'a' : '';
  const docRef = genDocRef('DC');
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  return `<!DOCTYPE html><html><head>${DOC_CSS}</head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola}</div>
      <div class="escola-sub">Secretaria Académica — Declaração de Conclusão</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Declaração de Conclusão de Curso</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${nomeCompleto.toUpperCase()}</strong>,
      portador${sufixo} do Bilhete de Identidade n.º <strong>${(aluno as any).bi || '___'}</strong>,
      concluiu com aproveitamento o <strong>${classe}</strong> (turma ${turmaNome}),
      no ano lectivo <strong>${anoLetivo}</strong>, nesta instituição de ensino.
    </div>
    <div class="body-text">
      A presente declaração é emitida para fins de <strong>${motivo || 'uso geral'}</strong> e serve de comprovativo até à emissão do diploma definitivo.
    </div>
    <div class="local-data">${nomeEscola}, ${hoje()}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${directorGeral || 'O(A) Director(a) Geral'}</p>
      <p>Director(a) Geral</p>
    </div>
    ${buildVerif(docRef, nomeEscola, nomeCompleto, 'dc')}
    <div class="footer">${nomeEscola} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${hoje()}</div>
  </div></body></html>`;
}

function buildDiploma(aluno: Aluno, turmaNome: string, classe: string, anoLetivo: string, nomeEscola: string, directorGeral: string): string {
  const gen = aluno.genero === 'F' ? 'F' : 'M';
  const sufixo = gen === 'F' ? 'a' : '';
  const docRef = genDocRef('CERT');
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  return `<!DOCTYPE html><html><head>${DOC_CSS}
  <style>
    .diploma-borda { border: 8px double #c8860a; padding: 16px; margin-top: 20px; text-align: center; }
    .diploma-titulo { font-size: 22pt; font-weight: bold; letter-spacing: 2px; color: #c8860a; margin-bottom: 12px; }
    .diploma-nome { font-size: 18pt; font-weight: bold; border-bottom: 2px solid #111; display: inline-block; padding-bottom: 4px; margin: 16px 0; }
    .diploma-texto { font-size: 13pt; line-height: 2; margin: 12px 0; }
  </style>
  </head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="diploma-borda">
      <div class="diploma-titulo">CERTIFICADO DE HABILITAÇÕES</div>
      <div class="diploma-texto">O presente certificado é conferido a</div>
      <div class="diploma-nome">${nomeCompleto.toUpperCase()}</div>
      <div class="diploma-texto">
        portador${sufixo} do B.I. n.º <strong>${(aluno as any).bi || '___'}</strong>, por ter concluído com aproveitamento o
        <strong>${classe}</strong>, turma <strong>${turmaNome}</strong>,
        no ano lectivo <strong>${anoLetivo}</strong>, nesta instituição de ensino.
      </div>
    </div>
    <div class="local-data" style="margin-top:30px">${nomeEscola}, ${hoje()}.</div>
    <div style="display:flex;justify-content:space-between;margin-top:50px">
      <div style="text-align:center">
        <div style="border-top:1px solid #111;width:180px;margin:0 auto 6px"></div>
        <p style="font-size:11pt">O(A) Secretári${sufixo || 'o'}(a)</p>
      </div>
      <div style="text-align:center">
        <div style="border-top:1px solid #111;width:180px;margin:0 auto 6px"></div>
        <p style="font-size:11pt">${directorGeral || 'O(A) Director(a) Geral'}</p>
        <p style="font-size:10pt">Director(a) Geral</p>
      </div>
    </div>
    ${buildVerif(docRef, nomeEscola, nomeCompleto, 'cert')}
    <div class="footer">${nomeEscola} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${hoje()}</div>
  </div></body></html>`;
}

// ─── Sala de Exame PDF builders ──────────────────────────────────────────────

function listaHeaderHTML(cfg: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string }, subtitulo: string): string {
  const discTxt = cfg.disciplinas.filter(d => d.nome.trim()).map(d => {
    const det = [d.diaSemana.trim(), d.data.trim()].filter(Boolean).join(', ');
    return det ? `${d.nome.trim()} (${det})` : d.nome.trim();
  }).join(' &nbsp;|&nbsp; ');
  return `<div class="doc-header">
  <img src="/angola-brasao.png" class="header-brasao" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
  <p class="header-rep">REPÚBLICA DE ANGOLA</p>
  <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
  <p class="header-rep">ENSINO GERAL</p>
  <div class="escola-nome">${cfg.nomeEscola.toUpperCase()}</div>
  <div class="doc-titulo">EXAMES DE ADMISSÃO — ${cfg.anoExame}</div>
  <div class="doc-subtitulo">${subtitulo}</div>
  ${discTxt ? `<div class="disciplinas-line"><b>${discTxt}</b></div>` : ''}
</div>
<div class="local-row">
  <div class="local-item"><span class="local-label">LOCAL:</span> <u><b>${cfg.local || '___________'}</b></u></div>
  <div class="local-sep"></div>
  <div class="local-item"><u><b>${cfg.campus || '___________'}</b></u> — SALA: <u><b>${cfg.sala || '___________'}</b></u></div>
  <div class="hora-box"><span class="local-label">Hora:</span> <b>${cfg.hora || '07:30:00'}</b></div>
</div>
<hr class="divider" />`;
}

function listaAssinaturasRodape(nomeEscola: string): string {
  return `<div class="assinaturas">
  <div class="ass-col"><div class="ass-line"></div><div>O Secretário(a)</div></div>
  <div class="ass-col"><div class="ass-line"></div><div>O Director(a)</div></div>
</div>
<div class="rodape">
  <span>${nomeEscola} — Super Escola v1.03</span>
  <span>Emitido em: ${hoje()}</span>
</div>`;
}

function buildICicloHTML(registros: Registro[], cfg: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string }): string {
  const sorted = [...registros].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));
  const byClasse: Record<string, Registro[]> = {};
  for (const r of sorted) { const k = r.classe?.trim() || '—'; if (!byClasse[k]) byClasse[k] = []; byClasse[k].push(r); }
  const classes = Object.keys(byClasse).sort(classeSort);
  if (!classes.length) return '<p style="padding:20px;text-align:center;">Nenhum candidato encontrado.</p>';
  let gIdx = 1;
  return classes.map((cls, ci) => {
    const alunos = byClasse[cls];
    const pb = ci === 0 ? '' : '<div style="page-break-before:always;"></div>';
    const rows = alunos.map((a, i) => `<tr style="background:${i%2===0?'#ffffff':'#eef6ff'}"><td class="num">${gIdx+i}</td><td class="nome">${a.nomeCompleto.toUpperCase()}</td><td class="cand">${numInscricao(a, gIdx+i)}</td></tr>`).join('');
    gIdx += alunos.length;
    return `${pb}<div class="doc-page">${listaHeaderHTML(cfg,'LISTA DE CANDIDATOS POR SALAS DE EXAME — I CICLO')}<div class="bloco-titulo">CLASSE: <b>${cls}</b> &nbsp;·&nbsp; Total: <b>${alunos.length}</b></div><table><thead><tr><th class="th-num"><u>Ord</u></th><th class="th-nome"><u>Nome do Candidato</u></th><th class="th-cand"><u>NºCand</u></th></tr></thead><tbody>${rows}</tbody></table>${listaAssinaturasRodape(cfg.nomeEscola)}</div>`;
  }).join('\n');
}

function buildIICicloHTML(registros: Registro[], cfg: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string }): string {
  const sorted = [...registros].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));
  const byClasse: Record<string, Registro[]> = {};
  for (const r of sorted) { const k = r.classe?.trim() || '—'; if (!byClasse[k]) byClasse[k] = []; byClasse[k].push(r); }
  const classes = Object.keys(byClasse).sort(classeSort);
  if (!classes.length) return '<p style="padding:20px;text-align:center;">Nenhum candidato encontrado.</p>';
  let gIdx = 1;
  return classes.map((cls, ci) => {
    const alunosClasse = byClasse[cls];
    const pb = ci === 0 ? '' : '<div style="page-break-before:always;"></div>';
    const byCurso: Record<string, Registro[]> = {};
    for (const r of alunosClasse) { const k = r.cursoNome?.trim() || 'Sem Curso Definido'; if (!byCurso[k]) byCurso[k] = []; byCurso[k].push(r); }
    const cursosOrdenados = Object.keys(byCurso).sort((a, b) => a.localeCompare(b, 'pt'));
    let cursosHTML = ''; let lIdx = 1;
    for (const curso of cursosOrdenados) {
      const alunos = byCurso[curso];
      const rows = alunos.map((a, i) => `<tr style="background:${i%2===0?'#ffffff':'#eef6ff'}"><td class="num">${lIdx+i}</td><td class="nome">${a.nomeCompleto.toUpperCase()}</td><td class="cand">${numInscricao(a, gIdx+lIdx+i-1)}</td><td class="curso-td">${curso}</td></tr>`).join('');
      cursosHTML += `<div class="sub-bloco-titulo">CURSO: ${curso.toUpperCase()} &nbsp;·&nbsp; ${alunos.length} candidato(s)</div><table><thead><tr><th class="th-num"><u>Ord</u></th><th class="th-nome"><u>Nome do Candidato</u></th><th class="th-cand"><u>NºCand</u></th><th class="th-curso"><u>Curso</u></th></tr></thead><tbody>${rows}</tbody></table>`;
      lIdx += alunos.length;
    }
    gIdx += alunosClasse.length;
    return `${pb}<div class="doc-page">${listaHeaderHTML(cfg,'LISTA DE CANDIDATOS POR SALAS DE EXAME — II CICLO')}<div class="bloco-titulo">CLASSE: <b>${cls}</b> &nbsp;·&nbsp; Total: <b>${alunosClasse.length}</b> &nbsp;·&nbsp; Cursos: <b>${cursosOrdenados.length}</b></div>${cursosHTML}${listaAssinaturasRodape(cfg.nomeEscola)}</div>`;
  }).join('\n');
}

function buildListaFullHTML(body: string, titulo: string): string {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>${titulo}</title><style>${LISTA_CSS}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ Imprimir / Exportar PDF</button>${body}</body></html>`;
}

// ─── Open PDF in new window ───────────────────────────────────────────────────

function openPDF(html: string) {
  if (Platform.OS !== 'web') return;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CentroEmissaoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alunos, notas, turmas } = useData();
  const { config } = useConfig();
  const { anoAtivo } = useAnoAcademico();

  const [activeTab, setActiveTab] = useState<Tab>('Solicitações');

  // ── Solicitações state ───────────────────────────────────────────────────
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [searchSol, setSearchSol] = useState('');
  const [detailModal, setDetailModal] = useState<Solicitacao | null>(null);
  const [resposta, setResposta] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [emittingId, setEmittingId] = useState<string | null>(null);
  const [emittingLabel, setEmittingLabel] = useState('');
  const pdfProgressSol = usePdfProgress();

  // ── Listas de Admissão state ─────────────────────────────────────────────
  const [ciclo, setCiclo] = useState<'I_CICLO' | 'II_CICLO'>('I_CICLO');
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loadingRegistros, setLoadingRegistros] = useState(false);
  const [salaParams, setSalaParams] = useState({
    sala: '', local: '', campus: '', hora: '07:30',
    anoExame: anoLetivoDe(),
  });
  const [disciplinas, setDisciplinas] = useState<DisciplinaExame[]>([
    { nome: '', diaSemana: '', data: '' },
  ]);
  const [generatingLista, setGeneratingLista] = useState(false);

  // ── Emissão Direta state ─────────────────────────────────────────────────
  const [searchAluno, setSearchAluno] = useState('');
  const [selectedAlunoId, setSelectedAlunoId] = useState('');
  const [selectedDocTipo, setSelectedDocTipo] = useState('');
  const [motivoEmissao, setMotivoEmissao] = useState('');
  const [emittingDirect, setEmittingDirect] = useState(false);
  const [livePreviewHtmlDirect, setLivePreviewHtmlDirect] = useState('');

  // ── Load solicitações ────────────────────────────────────────────────────
  const loadSolicitacoes = useCallback(async () => {
    try {
      const data = await apiRequest('GET', '/api/solicitacoes-documentos') as unknown as Solicitacao[];
      setSolicitacoes(data || []);
    } catch { alertErro('Erro ao carregar solicitações'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadSolicitacoes(); }, [loadSolicitacoes]);

  // ── Load registros (admissão) ────────────────────────────────────────────
  const loadRegistros = useCallback(async () => {
    setLoadingRegistros(true);
    try {
      const data = await apiRequest('GET', '/api/registros') as unknown as Registro[];
      setRegistros((data || []).filter((r: Registro) => STATUSES_INSCRICAO.includes(r.status || '')));
    } catch { alertErro('Erro ao carregar inscrições'); }
    finally { setLoadingRegistros(false); }
  }, []);

  useEffect(() => { if (activeTab === 'Listas de Admissão') loadRegistros(); }, [activeTab, loadRegistros]);

  // ── Filtered solicitações ────────────────────────────────────────────────
  const solicitacoesFiltradas = useMemo(() => {
    const q = searchSol.toLowerCase();
    return solicitacoes.filter(s => {
      const matchStatus = filtroStatus === 'todos' || s.status === filtroStatus;
      const nome = `${s.nomeAluno || ''} ${s.apelidoAluno || ''} ${s.alunoNumMatricula || ''}`.toLowerCase();
      const matchSearch = !q || nome.includes(q) || s.tipo.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [solicitacoes, filtroStatus, searchSol]);

  // ── Alunos filtrados (emissão direta) ────────────────────────────────────
  const alunosFiltrados = useMemo(() => {
    const q = searchAluno.toLowerCase();
    return alunos.filter(a => a.ativo && (`${a.nome} ${a.apelido}`.toLowerCase().includes(q) || a.numeroMatricula?.toLowerCase().includes(q))).slice(0, 30);
  }, [alunos, searchAluno]);

  // ── Live preview (Emissão Direta) ────────────────────────────────────────
  useEffect(() => {
    if (!selectedAlunoId || !selectedDocTipo) { setLivePreviewHtmlDirect(''); return; }
    const timer = setTimeout(() => {
      try {
        const aluno = alunos.find(a => a.id === selectedAlunoId);
        if (!aluno) { setLivePreviewHtmlDirect(''); return; }
        const turma = turmas.find(t => t.id === aluno.turmaId);
        const nomeEscola = config?.nomeEscola || 'Super Escola';
        const director = config?.directorGeral || '';
        const anoLetivo = turma?.anoLetivo || anoAtivo?.ano || anoLetivoDe();
        const motivo = motivoEmissao || 'uso geral';
        let html = '';
        switch (selectedDocTipo) {
          case 'declaracao_matricula': html = buildDeclaracaoMatricula(aluno, turma?.nome||'—', turma?.classe||'—', turma?.turno||'—', anoLetivo, nomeEscola, director, motivo); break;
          case 'atestado_frequencia': html = buildAtestadoFrequencia(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director, motivo); break;
          case 'boletim_notas': html = buildBoletimNotas(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, notas, nomeEscola, director); break;
          case 'declaracao_conclusao': html = buildDeclaracaoConclusao(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director, motivo); break;
          case 'certificado_habilitacoes': html = buildDiploma(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director); break;
          case 'historico_escolar': html = buildBoletimNotas(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, notas, nomeEscola, director); break;
          default: html = buildDeclaracaoMatricula(aluno, turma?.nome||'—', turma?.classe||'—', turma?.turno||'—', anoLetivo, nomeEscola, director, motivo);
        }
        setLivePreviewHtmlDirect(html);
      } catch { setLivePreviewHtmlDirect(''); }
    }, 450);
    return () => clearTimeout(timer);
  }, [selectedAlunoId, selectedDocTipo, motivoEmissao, alunos, turmas, config, anoAtivo, notas]);

  // ── Update solicitação status ────────────────────────────────────────────
  const updateStatus = async (sol: Solicitacao, newStatus: string) => {
    setUpdatingId(sol.id);
    try {
      await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: newStatus, resposta: resposta || undefined });
      setSolicitacoes(prev => prev.map(s => s.id === sol.id ? { ...s, status: newStatus } : s));
      setDetailModal(null);
      setResposta('');
      alertSucesso('Status actualizado com sucesso');
    } catch { alertErro('Erro ao actualizar status'); }
    finally { setUpdatingId(null); }
  };

  // ── Emit document from solicitação ────────────────────────────────────────
  const emitirDocumentoSolicitacao = async (sol: Solicitacao) => {
    setEmittingId(sol.id);
    setEmittingLabel(sol.tipo);
    pdfProgressSol.start();
    try {
      const aluno = alunos.find(a => a.id === sol.alunoId);
      if (!aluno) { pdfProgressSol.cancel(); alertErro('Dados do aluno não encontrados'); return; }
      const turma = turmas.find(t => t.id === aluno.turmaId);
      const nomeEscola = config?.nomeEscola || 'Super Escola';
      const director = config?.directorGeral || '';
      const anoLetivo = turma?.anoLetivo || anoAtivo?.ano || anoLetivoDe();
      const motivo = sol.motivo || 'uso geral';
      let html = '';
      switch (sol.tipo) {
        case 'Declaração de Matrícula':
          html = buildDeclaracaoMatricula(aluno, turma?.nome || '—', turma?.classe || '—', turma?.turno || '—', anoLetivo, nomeEscola, director, motivo);
          break;
        case 'Certificado de Frequência':
          html = buildAtestadoFrequencia(aluno, turma?.nome || '—', turma?.classe || '—', anoLetivo, nomeEscola, director, motivo);
          break;
        case 'Certificado de Notas':
          html = buildBoletimNotas(aluno, turma?.nome || '—', turma?.classe || '—', anoLetivo, notas, nomeEscola, director);
          break;
        case 'Declaração de Conclusão de Curso':
          html = buildDeclaracaoConclusao(aluno, turma?.nome || '—', turma?.classe || '—', anoLetivo, nomeEscola, director, motivo);
          break;
        case 'Diploma':
          html = buildDiploma(aluno, turma?.nome || '—', turma?.classe || '—', anoLetivo, nomeEscola, director);
          break;
        default:
          html = buildDeclaracaoMatricula(aluno, turma?.nome || '—', turma?.classe || '—', turma?.turno || '—', anoLetivo, nomeEscola, director, motivo);
      }
      openPDF(html);
      await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: 'em_processamento' });
      setSolicitacoes(prev => prev.map(s => s.id === sol.id ? { ...s, status: 'em_processamento' } : s));
      pdfProgressSol.complete(() => alertSucesso('Documento gerado! Abre em nova janela.'));
    } catch { pdfProgressSol.cancel(); alertErro('Erro ao gerar documento'); }
    finally { setEmittingId(null); }
  };

  // ── Emit lista de admissão ─────────────────────────────────────────────────
  const emitirLista = () => {
    setGeneratingLista(true);
    try {
      const classeEntrada = ciclo === 'I_CICLO' ? '7' : '10';
      const inscritosParaGerar = registros.filter(r => {
        const c = (r.classe || '').replace(/[^0-9]/g, '');
        return c === classeEntrada;
      });
      if (!inscritosParaGerar.length) { alertErro('Sem candidatos para gerar a lista.'); return; }
      const logoUrl = config?.logoUrl || '';
      const cfg = {
        nomeEscola: config?.nomeEscola || 'Super Escola',
        anoExame: salaParams.anoExame || anoLetivoDe(),
        local: salaParams.local,
        campus: salaParams.campus,
        sala: salaParams.sala,
        hora: salaParams.hora,
        disciplinas: disciplinas.filter(d => d.nome.trim()),
        logoUrl,
      };
      const body = ciclo === 'I_CICLO' ? buildICicloHTML(inscritosParaGerar, cfg) : buildIICicloHTML(inscritosParaGerar, cfg);
      const titulo = ciclo === 'I_CICLO' ? `Lista de Admissão I Ciclo — ${cfg.anoExame}` : `Lista de Admissão II Ciclo — ${cfg.anoExame}`;
      openPDF(buildListaFullHTML(body, titulo));
    } finally { setGeneratingLista(false); }
  };

  // ── Emissão direta ─────────────────────────────────────────────────────────
  const emitirDireto = async () => {
    if (!selectedAlunoId || !selectedDocTipo) { alertErro('Seleccione o aluno e o tipo de documento.'); return; }
    setEmittingDirect(true);
    try {
      const aluno = alunos.find(a => a.id === selectedAlunoId);
      if (!aluno) { alertErro('Aluno não encontrado'); return; }
      const turma = turmas.find(t => t.id === aluno.turmaId);
      const nomeEscola = config?.nomeEscola || 'Super Escola';
      const director = config?.directorGeral || '';
      const anoLetivo = turma?.anoLetivo || anoAtivo?.ano || anoLetivoDe();
      let html = '';
      switch (selectedDocTipo) {
        case 'declaracao_matricula': html = buildDeclaracaoMatricula(aluno, turma?.nome||'—', turma?.classe||'—', turma?.turno||'—', anoLetivo, nomeEscola, director, motivoEmissao||'uso geral'); break;
        case 'atestado_frequencia': html = buildAtestadoFrequencia(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director, motivoEmissao||'uso geral'); break;
        case 'boletim_notas': html = buildBoletimNotas(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, notas, nomeEscola, director); break;
        case 'declaracao_conclusao': html = buildDeclaracaoConclusao(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director, motivoEmissao||'uso geral'); break;
        case 'certificado_habilitacoes': html = buildDiploma(aluno, turma?.nome||'—', turma?.classe||'—', anoLetivo, nomeEscola, director); break;
        default: html = buildDeclaracaoMatricula(aluno, turma?.nome||'—', turma?.classe||'—', turma?.turno||'—', anoLetivo, nomeEscola, director, motivoEmissao||'uso geral');
      }
      openPDF(html);
      alertSucesso('Documento gerado! Abre em nova janela.');
    } finally { setEmittingDirect(false); }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: solicitacoes.length,
    pendentes: solicitacoes.filter(s => s.status === 'pendente').length,
    emProcessamento: solicitacoes.filter(s => s.status === 'em_processamento').length,
    concluidas: solicitacoes.filter(s => s.status === 'concluido').length,
  }), [solicitacoes]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <TopBar title="Centro de Emissão" />

      {/* Hero */}
      <View style={s.hero}>
        <View style={s.heroIconWrap}>
          <Ionicons name="print" size={26} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>Centro de Emissão de Documentos</Text>
          <Text style={s.heroSub}>Secretaria Académica — Documentos Protegidos</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: Colors.textSecondary },
          { label: 'Pendentes', value: stats.pendentes, color: Colors.warning },
          { label: 'Em Processamento', value: stats.emProcessamento, color: Colors.info },
          { label: 'Concluídas', value: stats.concluidas, color: Colors.success },
        ].map(st => (
          <View key={st.label} style={s.statCard}>
            <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab bar */}
      <HScrollTabBar style={s.tabBar} contentContainerStyle={{ flexDirection: 'row' }} keyboardShouldPersistTaps="handled">
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={[s.tab, activeTab === t && s.tabActive]}>
            <Text style={[s.tabText, activeTab === t && s.tabTextActive]} numberOfLines={1}>{t}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* ── TAB: Solicitações ─────────────────────────────────────────── */}
      {activeTab === 'Solicitações' && (
        <View style={{ flex: 1 }}>
          {/* Filters */}
          <View style={s.filterRow}>
            <View style={s.searchWrap}>
              <StableSearchInput
                value={searchSol}
                onChangeText={setSearchSol}
                inputStyle={s.searchInput}
                placeholder="Pesquisar aluno ou documento…"
                iconColor={Colors.textSecondary}
              />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {STATUS_FILTERS.map(f => (
              <TouchableOpacity key={f} onPress={() => setFiltroStatus(f)} style={[s.filterChip, filtroStatus === f && s.filterChipActive]}>
                <Text style={[s.filterChipText, filtroStatus === f && s.filterChipTextActive]}>
                  {f === 'todos' ? 'Todos' : STATUS_META[f]?.label || f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <AppLoader color={Colors.gold} size="large" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 12 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSolicitacoes(); }} tintColor={Colors.gold} />}
            >
              {solicitacoesFiltradas.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="document-outline" size={48} color={Colors.textSecondary} />
                  <Text style={s.emptyText}>Nenhuma solicitação encontrada</Text>
                </View>
              ) : solicitacoesFiltradas.map(sol => {
                const sm = STATUS_META[sol.status] || STATUS_META.pendente;
                const cor = TIPO_COLORS[sol.tipo] || Colors.textSecondary;
                const icone = TIPO_ICONS[sol.tipo] || 'document';
                return (
                  <View key={sol.id} style={s.solCard}>
                    <View style={s.solCardHeader}>
                      <View style={[s.solIconWrap, { backgroundColor: cor + '22' }]}>
                        <Ionicons name={icone as any} size={22} color={cor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.solNome}>{sol.nomeAluno} {sol.apelidoAluno}</Text>
                        <Text style={s.solMatricula}>{sol.alunoNumMatricula} {sol.nomeTurma ? `— ${sol.nomeTurma}` : ''}</Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: sm.color + '22' }]}>
                        <Ionicons name={sm.icon as any} size={12} color={sm.color} />
                        <Text style={[s.statusText, { color: sm.color }]}>{sm.label}</Text>
                      </View>
                    </View>
                    <View style={s.solCardBody}>
                      <View style={[s.tipoTag, { backgroundColor: cor + '18', borderColor: cor + '44' }]}>
                        <Text style={[s.tipoTagText, { color: cor }]}>{sol.tipo}</Text>
                      </View>
                      <Text style={s.solMotivo}>{sol.motivo}</Text>
                      <Text style={s.solData}>Solicitado: {formatDate(sol.createdAt)}</Text>
                    </View>
                    <View style={s.solCardActions}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => { setDetailModal(sol); setResposta(sol.resposta || ''); }}>
                        <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
                        <Text style={s.actionBtnText}>Detalhes</Text>
                      </TouchableOpacity>
                      {sol.status !== 'concluido' && sol.status !== 'cancelado' && (
                        <TouchableOpacity
                          style={[s.actionBtnPrimary, emittingId === sol.id && { opacity: 0.6 }]}
                          onPress={() => emitirDocumentoSolicitacao(sol)}
                          disabled={emittingId === sol.id}
                        >
                          {emittingId === sol.id ? (
                            <AppLoader size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="print-outline" size={14} color="#fff" />
                              <Text style={s.actionBtnPrimaryText}>Emitir PDF</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                      {sol.status === 'em_processamento' && (
                        <TouchableOpacity
                          style={s.actionBtnSuccess}
                          onPress={() => updateStatus(sol, 'concluido')}
                          disabled={updatingId === sol.id}
                        >
                          <Ionicons name="checkmark-outline" size={14} color="#fff" />
                          <Text style={s.actionBtnSuccessText}>Concluir</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── TAB: Listas de Admissão ───────────────────────────────────── */}
      {activeTab === 'Listas de Admissão' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
          {/* Ciclo selector */}
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>
              <Ionicons name="school-outline" size={15} color={Colors.gold} /> Ciclo de Ensino
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              {[
                { key: 'I_CICLO' as const, label: 'I Ciclo (7ª Classe)', color: Colors.info },
                { key: 'II_CICLO' as const, label: 'II Ciclo (10ª Classe)', color: '#8b5cf6' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.cicloBtn, ciclo === opt.key && { backgroundColor: opt.color + '22', borderColor: opt.color }]}
                  onPress={() => setCiclo(opt.key)}
                >
                  <Text style={[s.cicloBtnText, ciclo === opt.key && { color: opt.color, fontWeight: '700' }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Parâmetros operacionais */}
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>
              <Ionicons name="settings-outline" size={15} color={Colors.gold} /> Parâmetros do Exame
            </Text>
            <Text style={s.sectionNote}>Estes campos são operacionais — preenchem o cabeçalho da lista. O modelo é protegido.</Text>
            {[
              { key: 'sala', label: 'Sala de Exame', placeholder: 'Ex: Sala 1' },
              { key: 'local', label: 'Local / Morada', placeholder: 'Ex: Rua da Escola, Luanda' },
              { key: 'campus', label: 'Campus / Pavilhão', placeholder: 'Ex: Campus Principal' },
              { key: 'hora', label: 'Hora do Exame', placeholder: 'Ex: 07:30' },
              { key: 'anoExame', label: 'Ano do Exame', placeholder: 'Ex: 2025' },
            ].map(f => (
              <View key={f.key} style={{ marginTop: 10 }}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textSecondary}
                  value={(salaParams as any)[f.key]}
                  onChangeText={v => setSalaParams(p => ({ ...p, [f.key]: v }))}
                />
              </View>
            ))}
          </View>

          {/* Disciplinas */}
          <View style={s.sectionCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.sectionTitle}><Ionicons name="book-outline" size={15} color={Colors.gold} /> Disciplinas do Exame</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setDisciplinas(d => [...d, { nome: '', diaSemana: '', data: '' }])}>
                <Ionicons name="add" size={16} color={Colors.gold} />
              </TouchableOpacity>
            </View>
            {disciplinas.map((d, i) => (
              <View key={i} style={{ marginTop: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{ flex: 2 }}>
                  <TextInput style={s.fieldInput} placeholder="Disciplina" placeholderTextColor={Colors.textSecondary} value={d.nome} onChangeText={v => setDisciplinas(ds => ds.map((x, j) => j === i ? { ...x, nome: v } : x))} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput style={s.fieldInput} placeholder="Dia" placeholderTextColor={Colors.textSecondary} value={d.diaSemana} onChangeText={v => setDisciplinas(ds => ds.map((x, j) => j === i ? { ...x, diaSemana: v } : x))} />
                </View>
                <View style={{ flex: 1 }}>
                  <DateInput
                    style={s.fieldInput}
                    placeholder="Data"
                    placeholderTextColor={Colors.textSecondary}
                    value={d.data}
                    onChangeText={v => setDisciplinas(ds => ds.map((x, j) => j === i ? { ...x, data: v } : x))}
                    label="Data da Disciplina"
                  />
                </View>
                {disciplinas.length > 1 && (
                  <TouchableOpacity style={s.removeBtn} onPress={() => setDisciplinas(ds => ds.filter((_, j) => j !== i))}>
                    <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Info protecção */}
          <View style={s.protectedBanner}>
            <Ionicons name="lock-closed" size={18} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.protectedTitle}>Modelo Protegido</Text>
              <Text style={s.protectedText}>O template oficial não pode ser alterado. Apenas os parâmetros operacionais acima são configuráveis.</Text>
            </View>
          </View>

          {/* Candidatos count */}
          {loadingRegistros ? (
            <AppLoader color={Colors.gold} />
          ) : (
            <View style={s.countBanner}>
              <Ionicons name="people-outline" size={16} color={Colors.info} />
              <Text style={s.countText}>
                {registros.filter(r => {
                  const c = (r.classe || '').replace(/[^0-9]/g, '');
                  return c === (ciclo === 'I_CICLO' ? '7' : '10');
                }).length} candidatos encontrados para {ciclo === 'I_CICLO' ? '7ª Classe' : '10ª Classe'}
              </Text>
            </View>
          )}

          {/* Gerar botão */}
          <TouchableOpacity style={[s.gerarBtn, generatingLista && { opacity: 0.6 }]} onPress={emitirLista} disabled={generatingLista}>
            {generatingLista ? <AppLoader color="#fff" /> : (
              <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={s.gerarBtnText}>Gerar Lista de Admissão por Sala de Exame</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── TAB: Emissão Direta ─────────────────────────────────────────── */}
      {activeTab === 'Emissão Direta' && (
        <View style={{ flex: 1, flexDirection: Platform.OS === 'web' ? 'row' : 'column' }}>
          {/* ── Formulário ── */}
          <ScrollView
            style={{ flex: Platform.OS === 'web' ? undefined : 1, width: Platform.OS === 'web' ? 380 : undefined } as any}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
          >
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}><Ionicons name="person-outline" size={15} color={Colors.gold} /> Seleccionar Aluno</Text>
            <View style={[s.searchWrap, { marginTop: 10 }]}>
              <StableSearchInput
                value={searchAluno}
                onChangeText={v => { setSearchAluno(v); setSelectedAlunoId(''); setLivePreviewHtmlDirect(''); }}
                inputStyle={s.searchInput}
                placeholder="Pesquisar por nome ou matrícula…"
                iconColor={Colors.textSecondary}
              />
            </View>
            {searchAluno.length > 0 && !selectedAlunoId && (
              <ScrollView style={{ maxHeight: 180, marginTop: 6 }} nestedScrollEnabled>
                {alunosFiltrados.map(a => {
                  const turma = turmas.find(t => t.id === a.turmaId);
                  return (
                    <TouchableOpacity key={a.id} style={s.alunoItem} onPress={() => { setSelectedAlunoId(a.id); setSearchAluno(`${a.nome} ${a.apelido}`); }}>
                      <Text style={s.alunoNome}>{a.nome} {a.apelido}</Text>
                      <Text style={s.alunoMeta}>{a.numeroMatricula} {turma ? `· ${turma.nome}` : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {selectedAlunoId && (
              <View style={s.alunoSelected}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={s.alunoSelectedText}>{searchAluno}</Text>
                <TouchableOpacity onPress={() => { setSelectedAlunoId(''); setSearchAluno(''); setLivePreviewHtmlDirect(''); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}><Ionicons name="document-text-outline" size={15} color={Colors.gold} /> Tipo de Documento</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {DOC_TIPOS_EMISSAO.map(dt => (
                <TouchableOpacity
                  key={dt.key}
                  style={[s.docTipoBtn, selectedDocTipo === dt.key && { backgroundColor: dt.color + '22', borderColor: dt.color }]}
                  onPress={() => setSelectedDocTipo(dt.key)}
                >
                  <Ionicons name={dt.icon as any} size={20} color={selectedDocTipo === dt.key ? dt.color : Colors.textSecondary} />
                  <Text style={[s.docTipoBtnText, selectedDocTipo === dt.key && { color: dt.color, fontWeight: '700' }]}>{dt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}><Ionicons name="create-outline" size={15} color={Colors.gold} /> Finalidade</Text>
            <TextInput
              style={[s.fieldInput, { marginTop: 10, minHeight: 44 }]}
              placeholder="Ex: apresentação em entidade bancária, inscrição em concurso…"
              placeholderTextColor={Colors.textSecondary}
              value={motivoEmissao}
              onChangeText={setMotivoEmissao}
            />
          </View>

          <View style={s.protectedBanner}>
            <Ionicons name="lock-closed" size={18} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={s.protectedTitle}>Templates Protegidos</Text>
              <Text style={s.protectedText}>Todos os modelos de documentos são gerados com o formato oficial da escola. Nenhum campo do template pode ser modificado.</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[s.gerarBtn, (!selectedAlunoId || !selectedDocTipo || emittingDirect) && { opacity: 0.5 }]}
            onPress={emitirDireto}
            disabled={!selectedAlunoId || !selectedDocTipo || emittingDirect}
          >
            {emittingDirect ? <AppLoader color="#fff" /> : (
              <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={s.gerarBtnText}>Emitir Documento</Text>
              </>
            )}
          </TouchableOpacity>
          </ScrollView>

          {/* ── Painel de Pré-visualização ao Vivo (web) ── */}
          {Platform.OS === 'web' && (
            <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: Colors.border, backgroundColor: '#e5e7eb' }}>
              <View style={s.livePreviewBar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[s.liveIndicator, { backgroundColor: livePreviewHtmlDirect ? Colors.success : Colors.textMuted }]} />
                  <Text style={s.livePreviewBarTitle}>Pré-visualização em tempo real</Text>
                </View>
                <Text style={s.livePreviewBarSub}>
                  {livePreviewHtmlDirect ? 'A actualizar automaticamente' : 'Seleccione aluno e documento'}
                </Text>
              </View>
              {livePreviewHtmlDirect ? (
                <iframe
                  srcDoc={livePreviewHtmlDirect}
                  style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: '#fff' } as any}
                  title="Pré-visualização do documento"
                />
              ) : (
                <View style={s.livePreviewEmpty}>
                  <Ionicons name="document-outline" size={52} color={Colors.textMuted + '55'} />
                  <Text style={s.livePreviewEmptyTitle}>Aguardando dados</Text>
                  <Text style={s.livePreviewEmptySub}>
                    Seleccione um aluno e o tipo de documento{'\n'}para ver a pré-visualização aqui.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <PdfProgressModal
        visible={pdfProgressSol.visible}
        step={pdfProgressSol.step}
        label={emittingLabel || 'Documento'}
        color={Colors.primary}
      />

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {detailModal && (() => {
              const sm = STATUS_META[detailModal.status] || STATUS_META.pendente;
              const cor = TIPO_COLORS[detailModal.tipo] || Colors.textSecondary;
              return (
                <>
                  <View style={s.modalHeader}>
                    <Text style={s.modalTitle}>Detalhes da Solicitação</Text>
                    <TouchableOpacity onPress={() => setDetailModal(null)}>
                      <Ionicons name="close" size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, padding: 16 }}>
                    <View style={[s.tipoTag, { backgroundColor: cor + '18', borderColor: cor + '44', alignSelf: 'flex-start' }]}>
                      <Text style={[s.tipoTagText, { color: cor }]}>{detailModal.tipo}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Aluno</Text>
                      <Text style={s.detailVal}>{detailModal.nomeAluno} {detailModal.apelidoAluno}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Matrícula</Text>
                      <Text style={s.detailVal}>{detailModal.alunoNumMatricula || '—'}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Turma</Text>
                      <Text style={s.detailVal}>{detailModal.nomeTurma || '—'}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Motivo</Text>
                      <Text style={s.detailVal}>{detailModal.motivo || '—'}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Status</Text>
                      <View style={[s.statusBadge, { backgroundColor: sm.color + '22' }]}>
                        <Text style={[s.statusText, { color: sm.color }]}>{sm.label}</Text>
                      </View>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Solicitado em</Text>
                      <Text style={s.detailVal}>{formatDate(detailModal.createdAt)}</Text>
                    </View>
                    {detailModal.observacao && (
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Observação</Text>
                        <Text style={s.detailVal}>{detailModal.observacao}</Text>
                      </View>
                    )}

                    <Text style={[s.fieldLabel, { marginTop: 8 }]}>Resposta / Nota interna</Text>
                    <TextInput style={[s.fieldInput, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Adicione uma nota ou resposta…" placeholderTextColor={Colors.textSecondary} value={resposta} onChangeText={setResposta} multiline />

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      {detailModal.status !== 'em_processamento' && detailModal.status !== 'concluido' && detailModal.status !== 'cancelado' && (
                        <TouchableOpacity style={[s.modalActionBtn, { backgroundColor: Colors.info }]} onPress={() => updateStatus(detailModal, 'em_processamento')} disabled={updatingId === detailModal.id}>
                          <Ionicons name="cog-outline" size={14} color="#fff" />
                          <Text style={s.modalActionBtnText}>Em Processamento</Text>
                        </TouchableOpacity>
                      )}
                      {detailModal.status !== 'concluido' && (
                        <TouchableOpacity style={[s.modalActionBtn, { backgroundColor: Colors.success }]} onPress={() => updateStatus(detailModal, 'concluido')} disabled={updatingId === detailModal.id}>
                          <Ionicons name="checkmark-outline" size={14} color="#fff" />
                          <Text style={s.modalActionBtnText}>Concluir</Text>
                        </TouchableOpacity>
                      )}
                      {detailModal.status !== 'cancelado' && (
                        <TouchableOpacity style={[s.modalActionBtn, { backgroundColor: Colors.danger }]} onPress={() => updateStatus(detailModal, 'cancelado')} disabled={updatingId === detailModal.id}>
                          <Ionicons name="close-outline" size={14} color="#fff" />
                          <Text style={s.modalActionBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {detailModal.status !== 'concluido' && detailModal.status !== 'cancelado' && (
                      <TouchableOpacity style={s.gerarBtn} onPress={() => { emitirDocumentoSolicitacao(detailModal); setDetailModal(null); }} disabled={emittingId === detailModal.id}>
                        <Ionicons name="print-outline" size={18} color="#fff" />
                        <Text style={s.gerarBtnText}>Emitir PDF Agora</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  heroIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.gold + '20', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  heroSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statCard: { flex: 1, alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, paddingVertical: 8 },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  tabBar: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.gold, fontWeight: '700' },
  filterRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.text, fontSize: 16 },
  filterScroll: { paddingVertical: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  filterChipText: { fontSize: 12, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.gold, fontWeight: '700' },
  solCard: { backgroundColor: Colors.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  solCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  solIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  solNome: { fontSize: 14, fontWeight: '700', color: Colors.text },
  solMatricula: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '600' },
  solCardBody: { padding: 12, gap: 6 },
  tipoTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  tipoTagText: { fontSize: 11, fontWeight: '600' },
  solMotivo: { fontSize: 12, color: Colors.textSecondary },
  solData: { fontSize: 11, color: Colors.textSecondary },
  solCardActions: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.gold },
  actionBtnPrimaryText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  actionBtnSuccess: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.success },
  actionBtnSuccessText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  livePreviewBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  liveIndicator:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  livePreviewBarTitle:   { fontSize: 12, fontWeight: '700', color: Colors.text },
  livePreviewBarSub:     { fontSize: 11, color: Colors.textSecondary },
  livePreviewEmpty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  livePreviewEmptyTitle: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  livePreviewEmptySub:   { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  sectionCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  sectionNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  fieldLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  fieldInput: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.text },
  cicloBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.background },
  cicloBtnText: { fontSize: 13, color: Colors.textSecondary },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.gold + '20', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  protectedBanner: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: Colors.gold + '14', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.gold + '40' },
  protectedTitle: { fontSize: 13, fontWeight: '700', color: Colors.gold },
  protectedText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  countBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: Colors.info + '14', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.info + '40' },
  countText: { fontSize: 13, color: Colors.info, fontWeight: '600' },
  gerarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 16 },
  gerarBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  docTipoBtn: { flexDirection: 'column', alignItems: 'center', gap: 6, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, width: '47%' },
  docTipoBtnText: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  alunoItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  alunoNome: { fontSize: 13, fontWeight: '600', color: Colors.text },
  alunoMeta: { fontSize: 11, color: Colors.textSecondary },
  alunoSelected: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: Colors.success + '15', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.success + '40' },
  alunoSelectedText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.success },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: 12, color: Colors.textSecondary },
  detailVal: { fontSize: 13, color: Colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center', paddingVertical: 9, borderRadius: 8 },
  modalActionBtnText: { fontSize: 11, color: '#fff', fontWeight: '700' },
});
