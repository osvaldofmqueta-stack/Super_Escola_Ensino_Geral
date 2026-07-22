import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList, Platform, Alert } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useData, Aluno, Nota } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { apiRequest } from '@/lib/query-client';
import RequiredMark from '@/components/RequiredMark';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeComportamento(ocorrencias: { gravidade: string }[]): string {
  if (ocorrencias.length === 0) return 'Muito Bom';
  const gravs = ocorrencias.map(o => o.gravidade);
  if (gravs.includes('grave')) return 'Mau';
  if (gravs.includes('moderada')) return 'Regular';
  return 'Bom';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DocTipo =
  | 'declaracao_matricula'
  | 'atestado_frequencia'
  | 'certificado_habilitacoes'
  | 'boletim_notas'
  | 'historico_escolar'
  | 'declaracao_conclusao'
  | 'declaracao_finalista'
  | 'custom';

interface DocTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  insigniaBase64?: string;
}

interface DocTipoConfig {
  key: DocTipo;
  label: string;
  desc: string;
  icon: string;
  color: string;
  requiresNotas: boolean;
  soFinalistas?: boolean;
}

// ─── Document type config ─────────────────────────────────────────────────────

const DOC_TIPOS: DocTipoConfig[] = [
  {
    key: 'declaracao_matricula',
    label: 'Declaração de Matrícula',
    desc: 'Declara que o aluno está matriculado na escola',
    icon: 'document-text',
    color: Colors.info,
    requiresNotas: false,
  },
  {
    key: 'atestado_frequencia',
    label: 'Atestado de Frequência',
    desc: 'Comprova que o aluno frequenta as aulas regularmente',
    icon: 'checkmark-circle',
    color: Colors.success,
    requiresNotas: false,
  },
  {
    key: 'certificado_habilitacoes',
    label: 'Certificado de Habilitações',
    desc: 'Certifica as habilitações académicas do aluno',
    icon: 'ribbon',
    color: Colors.gold,
    requiresNotas: true,
  },
  {
    key: 'boletim_notas',
    label: 'Boletim de Notas',
    desc: 'Relatório completo das notas por disciplina e trimestre',
    icon: 'bar-chart',
    color: '#8b5cf6',
    requiresNotas: true,
  },
  {
    key: 'historico_escolar',
    label: 'Histórico Escolar',
    desc: 'Histórico académico completo do aluno',
    icon: 'time',
    color: Colors.warning,
    requiresNotas: true,
  },
  {
    key: 'declaracao_conclusao',
    label: 'Declaração de Conclusão',
    desc: 'Declara que o aluno concluiu o ano/ciclo lectivo',
    icon: 'school',
    color: '#14b8a6',
    requiresNotas: false,
  },
  {
    key: 'declaracao_finalista',
    label: 'Declaração de Finalista',
    desc: 'Exclusivo 13ª Classe — declara que o aluno é finalista e está a realizar a PAP',
    icon: 'trophy',
    color: '#f59e0b',
    requiresNotas: false,
    soFinalistas: true,
  },
];

// ─── Months helper ────────────────────────────────────────────────────────────
const MESES_EXT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function formatDate(d: Date) {
  return `${d.getDate()} de ${MESES_EXT[d.getMonth()]} de ${d.getFullYear()}`;
}

// ─── Variable builder ─────────────────────────────────────────────────────────

function buildVarMap(
  aluno: Aluno,
  turma: { nome: string; classe: string; turno: string; nivel: string; anoLetivo: string; cursoId?: string; professorId?: string } | undefined,
  notas: Nota[],
  config: { nomeEscola: string; directorGeral?: string; logoUrl?: string },
  anoAtual: string,
  finalidade: string,
  extra: Record<string, string>,
): Record<string, string> {
  const now = new Date();
  const dataNasc = aluno.dataNascimento ? new Date(aluno.dataNascimento) : null;

  // Compute per-disciplina final grade (NF from trimestre 3, fallback trimestre 2 or 1)
  const notasPorDisc: Record<string, number> = {};
  for (const n of notas.filter(x => x.alunoId === aluno.id)) {
    if (!notasPorDisc[n.disciplina] || n.trimestre > (notas.find(x => x.disciplina === n.disciplina && x.alunoId === aluno.id && x.trimestre === notasPorDisc[n.disciplina])?.trimestre ?? 0)) {
      notasPorDisc[n.disciplina] = n.nf ?? n.mac ?? 0;
    }
  }

  const DISC_MAP: Record<string, string> = {
    'Língua Portuguesa': 'LP', 'Língua Estrangeira': 'LE', 'Matemática': 'MAT',
    'Informática': 'INF', 'Educação Física': 'EF', 'História': 'HIS',
    'Geografia': 'GEO', 'Introdução ao Direito': 'INTRO_DIR',
    'Introdução à Economia': 'INTRO_ECO', 'Direito': 'DIR', 'Economia': 'ECO',
    'Gestão de Empresas': 'GEST', 'Contabilidade': 'CONT', 'Filosofia': 'FIL',
    'Direito Comercial': 'DIR_COM', 'Economia Política': 'ECO_POL',
    'Contabilidade e Gestão': 'CONT_GEST', 'Empreendedorismo': 'EMPREEND',
    'Direito Empresarial': 'DIR_EMP', 'Economia Avançada': 'ECO_AV',
    'Gestão Financeira': 'GEST_FIN', 'Contabilidade Avançada': 'CONT_AV',
  };

  const notaVars: Record<string, string> = {};
  for (const [disc, key] of Object.entries(DISC_MAP)) {
    notaVars[`{{NOTA_${key}}}`] = notasPorDisc[disc] !== undefined ? String(notasPorDisc[disc]) : '—';
  }

  const resultado = extra.resultado || 'APTO';
  const resultadoLetra = resultado.charAt(0).toUpperCase();
  const pautaNum = extra.pautaNumero || String(Math.floor(Math.random() * 900 + 100)).padStart(3, '0');
  const processoNum = extra.processoNumero || String(Math.floor(Math.random() * 900 + 100));
  const nivelFmt = turma?.nivel || '—';
  const cicloFmt = nivelFmt.includes('Ciclo') ? `${nivelFmt.replace(' Ciclo', 'º Ciclo')}` : nivelFmt;

  return {
    '{{NOME_COMPLETO}}': `${aluno.nome} ${aluno.apelido}`,
    '{{NOME}}': aluno.nome,
    '{{APELIDO}}': aluno.apelido,
    '{{DATA_NASCIMENTO}}': dataNasc ? `${dataNasc.getDate()}/${dataNasc.getMonth() + 1}/${dataNasc.getFullYear()}` : '—',
    '{{DIA_NASC}}': dataNasc ? String(dataNasc.getDate()) : '—',
    '{{MES_NASC}}': dataNasc ? MESES_EXT[dataNasc.getMonth()] : '—',
    '{{ANO_NASC}}': dataNasc ? String(dataNasc.getFullYear()) : '—',
    '{{GENERO}}': aluno.genero === 'M' ? 'Masculino' : 'Feminino',
    '{{PROVINCIA}}': aluno.provincia || '—',
    '{{MUNICIPIO}}': aluno.municipio || '—',
    '{{NATURALIDADE}}': aluno.municipio || aluno.provincia || '—',
    '{{NUMERO_MATRICULA}}': aluno.numeroMatricula,
    '{{NOME_ENCARREGADO}}': aluno.nomeEncarregado || '—',
    '{{TELEFONE_ENCARREGADO}}': aluno.telefoneEncarregado || '—',
    '{{ENCARREGADO_PROFISSAO}}': extra.encarregadoProfissao || aluno.encarregadoProfissao || '—',
    '{{ENCARREGADO_LOCAL_TRABALHO}}': extra.encarregadoLocalTrabalho || aluno.encarregadoLocalTrabalho || '—',
    '{{ENCARREGADO_RESIDENCIA}}': extra.encarregadoResidencia || aluno.encarregadoResidencia || '—',
    '{{TURMA}}': turma?.nome || '—',
    '{{CLASSE}}': turma?.classe || '—',
    '{{NIVEL}}': nivelFmt,
    '{{CICLO}}': cicloFmt,
    '{{TURNO}}': turma?.turno || '—',
    '{{ANO_LECTIVO}}': turma?.anoLetivo || anoAtual,
    '{{NOME_ESCOLA}}': config.nomeEscola,
    '{{NOME_DIRECTOR}}': config.directorGeral || 'O Director',
    '{{LOGO_URL}}': (config as any).logoUrl || '',
    '{{DATA_ACTUAL}}': formatDate(now),
    '{{MES_ACTUAL}}': MESES_EXT[now.getMonth()],
    '{{ANO_ACTUAL}}': String(now.getFullYear()),
    '{{FINALIDADE}}': finalidade || '—',
    '{{PAI}}': aluno.nomePai || extra.pai || '—',
    '{{MAE}}': aluno.nomeMae || extra.mae || '—',
    '{{BI_NUMERO}}': aluno.numeroBi || extra.biNumero || '—',
    '{{BI_DATA_EMISSAO}}': aluno.biDataEmissao || extra.biDataEmissao || '—',
    '{{BI_LOCAL_EMISSAO}}': aluno.biLocalEmissao || extra.biLocalEmissao || '—',
    '{{PROCESSO_NUMERO}}': processoNum,
    '{{PAUTA_NUMERO}}': pautaNum,
    '{{RESULTADO}}': resultado,
    '{{RESULTADO_LETRA}}': resultadoLetra,
    '{{AREA}}': extra.area || nivelFmt,
    '{{CURSO}}': extra.curso || nivelFmt,
    '{{NOME_DIRECTOR_TURMA}}': extra.nomeDirectorTurma || '',
    '{{NOME_SUBDIRECTOR_PEDAGOGICO}}': (config as any).directorPedagogico || '',
    '{{NOME_DIRECTOR_PEDAGOGICO}}': (config as any).directorPedagogico || '',
    '{{COMPORTAMENTO}}': extra.comportamento || '',
    ...notaVars,
  };
}

function replaceVars(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [tag, val] of Object.entries(vars)) {
    result = result.split(tag).join(val);
  }
  return result;
}

// ─── Built-in HTML templates ──────────────────────────────────────────────────

const BASE_PRINT_CSS = `
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
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
      padding:10px 14px; border:1px solid #dde0ef; border-radius:8px; background:#f9faff;
      page-break-inside:avoid; }
    .verif-qr { text-align:center; flex-shrink:0; }
    .verif-qr img { border:1px solid #dde; border-radius:4px; display:block; }
    .verif-bar { flex:1; text-align:center; }
    .verif-info { flex:1.2; font-size:8.5pt; line-height:1.9; color:#555; }
    .verif-info strong { color:#1a2b5f; }
    .verif-sub { font-size:7pt; color:#9ca3af; }
    .verif-label { font-size:7pt; text-transform:uppercase; color:#888; margin-top:3px; letter-spacing:.5px; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      .page { padding: 15mm 20mm; box-shadow: none; }
    }
    .btn-toolbar { display:flex; gap:10px; justify-content:center; margin: 20px auto 4px; }
    .print-btn {
      display: inline-block; padding: 12px 28px;
      background: #1a2540; color: #fff; border: none; border-radius: 8px;
      font-size: 14px; font-family: sans-serif; cursor: pointer; font-weight: bold;
      letter-spacing: 0.5px;
    }
    .print-btn:hover { background: #253358; }
    .download-btn {
      display: inline-block; padding: 12px 28px;
      background: #166534; color: #fff; border: none; border-radius: 8px;
      font-size: 14px; font-family: sans-serif; cursor: pointer; font-weight: bold;
      letter-spacing: 0.5px;
    }
    .download-btn:hover { background: #14532d; }
  </style>`;

function safeBarVal(s: string): string {
  return (s || 'DOC000').replace(/[^A-Z0-9\-\. ]/gi, '').substring(0, 30) || 'DOC000';
}

function buildVerifSection(docRef: string, qrPayload: string, barcodeId: string): string {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrPayload)}&bgcolor=ffffff&color=1a2b5f&margin=4&ecc=M`;
  const bcVal = safeBarVal(docRef);
  return `<div class="verif-section">
    <div class="verif-qr">
      <img src="${qrUrl}" alt="QR" width="90" height="90" onerror="this.style.display='none'" />
      <div class="verif-label">QR Verificação</div>
    </div>
    <div class="verif-bar">
      <svg id="bc-${barcodeId}" style="max-width:100%;height:55px"></svg>
      <div class="verif-label">Código de Barras</div>
    </div>
    <div class="verif-info">
      <strong>Ref.:</strong> ${docRef}<br>
      <span class="verif-sub">Documento autêntico. Verifique pelo QR code.</span>
    </div>
  </div>
  <script>
    window.addEventListener('load',function(){
      try{JsBarcode('#bc-${barcodeId}','${bcVal}',{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:9,margin:2,background:'transparent',lineColor:'#1a2b5f',fontOptions:'bold'});}
      catch(e){var el=document.getElementById('bc-${barcodeId}');if(el)el.style.display='none';}
    });
  </script>`;
}

function buildDeclaracaoMatricula(vars: Record<string, string>): string {
  const v = (k: string) => vars[k] || '—';
  const docRef = `DM-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const qrPayload = `QUETA|DM|${v('{{NUMERO_MATRICULA}}')}|${v('{{NOME_COMPLETO}}')}|${v('{{NOME_ESCOLA}}')}|${docRef}`;
  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Declaração de Matrícula</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${v('{{NOME_COMPLETO}}')}</strong>,
      ${v('{{GENERO}}') === 'Masculino' ? 'filho de' : 'filha de'} ${v('{{PAI}}')} e de ${v('{{MAE}}')},
      nascido${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} em ${v('{{DATA_NASCIMENTO}}')}, natural de ${v('{{NATURALIDADE}}')},
      portador${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} do Bilhete de Identidade n.º <strong>${v('{{BI_NUMERO}}')}</strong>,
      encontra-se regularmente matriculado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} nesta instituição, na
      <strong>${v('{{CLASSE}}')}</strong>, turma <strong>${v('{{TURMA}}')}</strong>,
      turno da <strong>${v('{{TURNO}}')}</strong>, no ano lectivo <strong>${v('{{ANO_LECTIVO}}')}</strong>,
      com o número de matrícula <strong>${v('{{NUMERO_MATRICULA}}')}</strong>.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido do${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} interessado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''},
      para fins de <strong>${v('{{FINALIDADE}}')}</strong>,
      e é válida pelo prazo de 90 (noventa) dias a contar da data de emissão.
    </div>
    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    ${buildVerifSection(docRef, qrPayload, 'dm')}
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v('{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function buildAtestadoFrequencia(vars: Record<string, string>): string {
  const v = (k: string) => vars[k] || '—';
  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: AF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}</div>
    <div class="doc-titulo">Atestado de Frequência</div>
    <div class="body-text">
      Para os devidos efeitos, atesto que <strong>${v('{{NOME_COMPLETO}}')}</strong>,
      com o número de matrícula <strong>${v('{{NUMERO_MATRICULA}}')}</strong>,
      portador${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} do Bilhete de Identidade n.º <strong>${v('{{BI_NUMERO}}')}</strong>,
      é aluno${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} desta instituição, matriculado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} na
      <strong>${v('{{CLASSE}}')}</strong>, turma <strong>${v('{{TURMA}}')}</strong>,
      no ano lectivo <strong>${v('{{ANO_LECTIVO}}')}</strong>, e tem frequentado as aulas regularmente.
    </div>
    <div class="body-text">
      O presente atestado é emitido a pedido do${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} interessado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''},
      para fins de <strong>${v('{{FINALIDADE}}')}</strong>.
    </div>
    <div class="body-text">
      A veracidade desta informação pode ser confirmada junto da Secretaria Académica desta escola.
    </div>
    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

// ─── Helpers para agrupamento por categoria de formação ──────────────────────
const CAT_ORDER = ['formacao_geral', 'formacao_especifica', 'opcional', ''];
const CAT_LABELS: Record<string, string> = {
  formacao_geral:      'Formação Geral',
  formacao_especifica: 'Formação Específica',
  opcional:            'Opcional',
  '':                  'Outras Disciplinas',
};
const CAT_COLORS: Record<string, string> = {
  formacao_geral:      '#1e40af',
  formacao_especifica: '#6d28d9',
  opcional:            '#065f46',
  '':                  '#374151',
};

function groupByCategoria(
  disciplinas: string[],
  discCategorias: Record<string, string>,
): Array<{ cat: string; label: string; color: string; discs: string[] }> {
  const groups: Record<string, string[]> = {};
  for (const disc of disciplinas) {
    const cat = discCategorias[disc] ?? '';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(disc);
  }
  return CAT_ORDER
    .filter(cat => groups[cat]?.length)
    .map(cat => ({
      cat,
      label: CAT_LABELS[cat] ?? 'Outras',
      color: CAT_COLORS[cat] ?? '#374151',
      discs: groups[cat].sort(),
    }));
}

function hasCategorias(disciplinas: string[], discCategorias: Record<string, string>): boolean {
  return disciplinas.some(d => discCategorias[d] && discCategorias[d] !== '');
}

function buildBoletimNotas(vars: Record<string, string>, notas: Nota[], aluno: Aluno, discCategorias: Record<string, string> = {}): string {
  const v = (k: string) => vars[k] || '—';

  const notasPorDisc: Record<string, Record<number, Nota>> = {};
  for (const n of notas.filter(x => x.alunoId === aluno.id)) {
    if (!notasPorDisc[n.disciplina]) notasPorDisc[n.disciplina] = {};
    notasPorDisc[n.disciplina][n.trimestre] = n;
  }

  const disciplinas = Object.keys(notasPorDisc).sort();
  const usaCategorias = hasCategorias(disciplinas, discCategorias);

  function buildRow(disc: string): string {
    const t1 = notasPorDisc[disc][1];
    const t2 = notasPorDisc[disc][2];
    const t3 = notasPorDisc[disc][3];
    const nf = t3?.nf ?? t2?.nf ?? t1?.nf ?? '—';
    const aprovado = typeof nf === 'number' ? nf >= 10 : false;
    return `<tr>
      <td>${disc}</td>
      <td class="nota-val">${t1?.nf ?? '—'}</td>
      <td class="nota-val">${t2?.nf ?? '—'}</td>
      <td class="nota-val">${t3?.nf ?? '—'}</td>
      <td class="nota-val ${aprovado ? 'nota-apto' : typeof nf === 'number' ? 'nota-reprovado' : ''}">${nf}</td>
      <td class="nota-val">${typeof nf === 'number' ? (nf >= 10 ? 'APTO' : 'NÃO APTO') : '—'}</td>
    </tr>`;
  }

  const totalDisc = disciplinas.length;
  const disciplinasApto = disciplinas.filter(d => {
    const nfs = Object.values(notasPorDisc[d]).map(n => n.nf ?? 0);
    return nfs.length > 0 && Math.max(...nfs) >= 10;
  }).length;

  let tabelaHTML = '';
  if (disciplinas.length === 0) {
    tabelaHTML = '<p style="color:#666;font-style:italic;">Sem notas registadas para este aluno no ano lectivo seleccionado.</p>';
  } else if (usaCategorias) {
    const grupos = groupByCategoria(disciplinas, discCategorias);
    tabelaHTML = grupos.map(g => `
      <div style="margin-bottom:4px;margin-top:12px;">
        <div style="background:${g.color};color:#fff;padding:5px 10px;font-size:9pt;font-weight:bold;letter-spacing:.5px;border-radius:4px 4px 0 0;">${g.label}</div>
        <table class="notas-table" style="margin-top:0;border-radius:0 0 4px 4px;">
          <thead><tr>
            <th>Disciplina</th>
            <th style="text-align:center">1.º Trim.</th>
            <th style="text-align:center">2.º Trim.</th>
            <th style="text-align:center">3.º Trim.</th>
            <th style="text-align:center">Nota Final</th>
            <th style="text-align:center">Resultado</th>
          </tr></thead>
          <tbody>${g.discs.map(buildRow).join('')}</tbody>
        </table>
      </div>`).join('') +
      `<p style="font-size:10pt;color:#555;margin-top:10px;">Disciplinas aprovadas: <strong>${disciplinasApto}/${totalDisc}</strong></p>`;
  } else {
    tabelaHTML = `<table class="notas-table">
      <thead><tr>
        <th>Disciplina</th>
        <th style="text-align:center">1.º Trim.</th>
        <th style="text-align:center">2.º Trim.</th>
        <th style="text-align:center">3.º Trim.</th>
        <th style="text-align:center">Nota Final</th>
        <th style="text-align:center">Resultado</th>
      </tr></thead>
      <tbody>${disciplinas.map(buildRow).join('')}</tbody>
    </table>
    <p style="font-size:10pt;color:#555;margin-top:8px;">Disciplinas aprovadas: <strong>${disciplinasApto}/${totalDisc}</strong></p>`;
  }

  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica — Boletim de Notas</div>
    </div>
    <div class="num-doc">N.º Doc: BN-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}</div>
    <div class="doc-titulo">Boletim de Notas</div>

    <div class="section-title">Dados do Aluno</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome Completo</div><div class="info-val">${v('{{NOME_COMPLETO}}')}</div></div>
      <div class="info-item"><div class="info-label">N.º de Matrícula</div><div class="info-val">${v('{{NUMERO_MATRICULA}}')}</div></div>
      <div class="info-item"><div class="info-label">Turma</div><div class="info-val">${v('{{TURMA}}')} — ${v('{{CLASSE}}')}</div></div>
      <div class="info-item"><div class="info-label">Ano Lectivo</div><div class="info-val">${v('{{ANO_LECTIVO}}')}</div></div>
      <div class="info-item"><div class="info-label">Turno</div><div class="info-val">${v('{{TURNO}}')}</div></div>
      <div class="info-item"><div class="info-label">Nível</div><div class="info-val">${v('{{NIVEL}}')}</div></div>
    </div>

    <div class="section-title">Resultados por Disciplina</div>
    ${tabelaHTML}

    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v('{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function buildCertificadoHabilitacoes(vars: Record<string, string>, notas: Nota[], aluno: Aluno, discCategorias: Record<string, string> = {}): string {
  const v = (k: string) => vars[k] || '—';

  const notasPorDisc: Record<string, number> = {};
  for (const n of notas.filter(x => x.alunoId === aluno.id)) {
    const nfAtual = n.nf ?? n.mac ?? 0;
    if (!notasPorDisc[n.disciplina] || nfAtual > notasPorDisc[n.disciplina]) {
      notasPorDisc[n.disciplina] = nfAtual;
    }
  }

  const disciplinas = Object.entries(notasPorDisc).sort(([a], [b]) => a.localeCompare(b));
  const todasAprovadas = disciplinas.length > 0 && disciplinas.every(([, nf]) => nf >= 10);
  const mediaGeral = disciplinas.length > 0
    ? (disciplinas.reduce((s, [, nf]) => s + nf, 0) / disciplinas.length).toFixed(1)
    : '—';

  const usaCategorias = hasCategorias(disciplinas.map(([d]) => d), discCategorias);

  function buildDiscRow([disc, nf]: [string, number]): string {
    return `<tr><td>${disc}</td><td class="nota-val ${nf >= 10 ? 'nota-apto' : 'nota-reprovado'}">${nf}</td><td class="nota-val">${nf >= 10 ? 'Apto' : 'Não Apto'}</td></tr>`;
  }

  let tabelaHTML = '';
  if (disciplinas.length === 0) {
    tabelaHTML = '';
  } else if (usaCategorias) {
    const grupos = groupByCategoria(disciplinas.map(([d]) => d), discCategorias);
    tabelaHTML = `<div class="section-title">Classificações Obtidas</div>` +
      grupos.map(g => `
        <div style="margin-bottom:4px;margin-top:10px;">
          <div style="background:${g.color};color:#fff;padding:5px 10px;font-size:9pt;font-weight:bold;letter-spacing:.5px;border-radius:4px 4px 0 0;">${g.label}</div>
          <table class="notas-table" style="margin-top:0;border-radius:0 0 4px 4px;">
            <thead><tr><th>Disciplina</th><th style="text-align:center">Nota Final</th><th style="text-align:center">Resultado</th></tr></thead>
            <tbody>${g.discs.map(d => buildDiscRow([d, notasPorDisc[d]])).join('')}</tbody>
          </table>
        </div>`).join('');
  } else {
    const rows = disciplinas.map(buildDiscRow).join('');
    tabelaHTML = `<div class="section-title">Classificações Obtidas</div>
    <table class="notas-table">
      <thead><tr><th>Disciplina</th><th style="text-align:center">Nota Final</th><th style="text-align:center">Resultado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">República de Angola — Ministério da Educação</div>
    </div>
    <div class="num-doc">N.º Doc: CH-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}</div>
    <div class="doc-titulo">Certificado de Habilitações</div>
    <div class="body-text">
      Certifica-se que <strong>${v('{{NOME_COMPLETO}}')}</strong>,
      ${v('{{GENERO}}') === 'Masculino' ? 'filho de' : 'filha de'} ${v('{{PAI}}')} e de ${v('{{MAE}}')},
      nascido${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} em ${v('{{DATA_NASCIMENTO}}')},
      portador${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} do Bilhete de Identidade n.º <strong>${v('{{BI_NUMERO}}')}</strong>,
      com o número de matrícula <strong>${v('{{NUMERO_MATRICULA}}')}</strong>,
      frequentou com <strong>${todasAprovadas ? 'aproveitamento' : 'presença'}</strong> a
      <strong>${v('{{CLASSE}}')}</strong> desta instituição,
      no ano lectivo <strong>${v('{{ANO_LECTIVO}}')}</strong>,
      obtendo uma média geral de <strong>${mediaGeral} Valores</strong>.
    </div>

    ${disciplinas.length > 0 ? `
    <div class="section-title">Classificações Obtidas</div>
    <table class="notas-table">
      <thead><tr><th>Disciplina</th><th style="text-align:center">Nota Final</th><th style="text-align:center">Resultado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : ''}

    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v('{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function buildHistoricoEscolar(vars: Record<string, string>, notas: Nota[], aluno: Aluno): string {
  const v = (k: string) => vars[k] || '—';

  const notasPorAno: Record<string, Record<string, Record<number, Nota>>> = {};
  for (const n of notas.filter(x => x.alunoId === aluno.id)) {
    if (!notasPorAno[n.anoLetivo]) notasPorAno[n.anoLetivo] = {};
    if (!notasPorAno[n.anoLetivo][n.disciplina]) notasPorAno[n.anoLetivo][n.disciplina] = {};
    notasPorAno[n.anoLetivo][n.disciplina][n.trimestre] = n;
  }

  const anosOrdenados = Object.keys(notasPorAno).sort();

  const anosSections = anosOrdenados.map(ano => {
    const disciplinas = Object.keys(notasPorAno[ano]).sort();
    const rows = disciplinas.map(disc => {
      const t3 = notasPorAno[ano][disc][3];
      const t2 = notasPorAno[ano][disc][2];
      const t1 = notasPorAno[ano][disc][1];
      const nf = t3?.nf ?? t2?.nf ?? t1?.nf ?? '—';
      const aprovado = typeof nf === 'number' && nf >= 10;
      return `<tr>
        <td>${disc}</td>
        <td class="nota-val">${t1?.nf ?? '—'}</td>
        <td class="nota-val">${t2?.nf ?? '—'}</td>
        <td class="nota-val">${t3?.nf ?? '—'}</td>
        <td class="nota-val ${aprovado ? 'nota-apto' : typeof nf === 'number' ? 'nota-reprovado' : ''}">${nf}</td>
      </tr>`;
    }).join('');

    return `<div class="section-title">Ano Lectivo ${ano}</div>
    <table class="notas-table">
      <thead><tr><th>Disciplina</th><th style="text-align:center">1.º Trim.</th><th style="text-align:center">2.º Trim.</th><th style="text-align:center">3.º Trim.</th><th style="text-align:center">Nota Final</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }).join('<div style="margin-top:24px"></div>');

  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica — Histórico Escolar</div>
    </div>
    <div class="num-doc">N.º Doc: HE-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}</div>
    <div class="doc-titulo">Histórico Escolar</div>

    <div class="section-title">Identificação do Aluno</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome Completo</div><div class="info-val">${v('{{NOME_COMPLETO}}')}</div></div>
      <div class="info-item"><div class="info-label">N.º de Matrícula</div><div class="info-val">${v('{{NUMERO_MATRICULA}}')}</div></div>
      <div class="info-item"><div class="info-label">Data de Nascimento</div><div class="info-val">${v('{{DATA_NASCIMENTO}}')}</div></div>
      <div class="info-item"><div class="info-label">Turma Actual</div><div class="info-val">${v('{{TURMA}}')} — ${v('{{CLASSE}}')}</div></div>
      <div class="info-item"><div class="info-label">Encarregado</div><div class="info-val">${v('{{NOME_ENCARREGADO}}')}</div></div>
      <div class="info-item"><div class="info-label">BI N.º</div><div class="info-val">${v('{{BI_NUMERO}}')}</div></div>
    </div>

    ${anosOrdenados.length === 0
      ? '<p style="color:#666;font-style:italic;">Sem histórico de notas registado no sistema.</p>'
      : anosSections}

    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v('{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function buildDeclaracaoConclusao(vars: Record<string, string>): string {
  const v = (k: string) => vars[k] || '—';
  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">Secretaria Académica</div>
    </div>
    <div class="num-doc">N.º Doc: DC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}</div>
    <div class="doc-titulo">Declaração de Conclusão</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${v('{{NOME_COMPLETO}}')}</strong>,
      portador${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} do Bilhete de Identidade n.º <strong>${v('{{BI_NUMERO}}')}</strong>,
      com o número de matrícula <strong>${v('{{NUMERO_MATRICULA}}')}</strong>,
      concluiu${v('{{GENERO}}') === 'Feminino' ? '' : ''} com sucesso a <strong>${v('{{CLASSE}}')}</strong>
      nesta instituição, no ano lectivo <strong>${v('{{ANO_LECTIVO}}')}</strong>,
      tendo sido considerado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} <strong>${v('{{RESULTADO}}')}</strong>.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido do${v('{{GENERO}}') === 'Feminino' ? 'a' : ''} interessado${v('{{GENERO}}') === 'Feminino' ? 'a' : ''},
      para fins de <strong>${v('{{FINALIDADE}}')}</strong>.
    </div>
    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function buildDeclaracaoFinalista(vars: Record<string, string>): string {
  const v = (k: string) => vars[k] || '—';
  const genF = v('{{GENERO}}') === 'Feminino';
  const docRef = `DF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
  <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  <div class="page">
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${v('{{NOME_ESCOLA}}')}</div>
      <div class="escola-sub">República de Angola — Ministério da Educação</div>
    </div>
    <div class="num-doc">N.º Doc: ${docRef}</div>
    <div class="doc-titulo">Declaração de Finalista</div>
    <div class="body-text">
      Para os devidos efeitos, declaro que <strong>${v('{{NOME_COMPLETO}}')}</strong>,
      ${genF ? 'filha de' : 'filho de'} <strong>${v('{{PAI}}')}</strong> e de <strong>${v('{{MAE}}')}</strong>,
      nasc${genF ? 'ida' : 'ido'} em <strong>${v('{{DATA_NASCIMENTO}}')}</strong>,
      portador${genF ? 'a' : ''} do Bilhete de Identidade n.º <strong>${v('{{BI_NUMERO}}')}</strong>,
      com o número de matrícula <strong>${v('{{NUMERO_MATRICULA}}')}</strong>,
      é alun${genF ? 'a' : 'o'} <strong>FINALISTA</strong> do Curso de <strong>${v('{{CURSO}}')}</strong>
      nesta instituição, frequentando a <strong>${v('{{CLASSE}}')}</strong>, turma <strong>${v('{{TURMA}}')}</strong>,
      no ano lectivo <strong>${v('{{ANO_LECTIVO}}')}</strong>.
    </div>
    <div class="body-text">
      O${genF ? 'a' : ''} referid${genF ? 'a' : 'o'} alun${genF ? 'a' : 'o'} encontra-se a frequentar regularmente as aulas
      e a realizar a <strong>Prova de Aptidão Profissional (PAP)</strong>,
      requisito obrigatório para conclusão do ensino técnico-profissional.
    </div>
    <div class="body-text">
      A presente declaração é emitida a pedido d${genF ? 'a' : 'o'} interessad${genF ? 'a' : 'o'},
      para fins de <strong>${v('{{FINALIDADE}}')}</strong>.
    </div>
    <div class="local-data">${v('{{NOME_ESCOLA}}')}, ${v('{{DATA_ACTUAL}}')}.</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${v('{{NOME_DIRECTOR}}')}</p>
      <p>Director${genF ? 'a' : ''} Geral</p>
    </div>
    <div class="footer">
      ${v('{{NOME_ESCOLA}}')} — Secretaria Académica &nbsp;|&nbsp; Matrícula n.º ${v('{{NUMERO_MATRICULA}}')} &nbsp;|&nbsp; ${docRef} &nbsp;|&nbsp; Emitido em ${v('{{DATA_ACTUAL}}')}
    </div>
  </div>
  </body></html>`;
}

function injectBrasao(html: string, brasaoSrc: string): string {
  if (!brasaoSrc || brasaoSrc === '/angola-brasao.png') return html;
  return html
    .split('src="/angola-brasao.png"').join(`src="${brasaoSrc}"`)
    .split("src='/angola-brasao.png'").join(`src='${brasaoSrc}'`);
}

function generateHTML(
  tipo: DocTipo,
  vars: Record<string, string>,
  notas: Nota[],
  aluno: Aluno,
  customTemplate?: DocTemplate,
): string {
  const brasaoSrc = customTemplate?.insigniaBase64 || vars['{{LOGO_URL}}'] || '/angola-brasao.png';

  if (tipo === 'custom' && customTemplate) {
    let content = replaceVars(customTemplate.conteudo, vars);
    content = injectBrasao(content, brasaoSrc);
    return `<!DOCTYPE html><html><head>${BASE_PRINT_CSS}</head><body>
      <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
      <div class="page">${content}</div>
    </body></html>`;
  }
  let html: string;
  switch (tipo) {
    case 'declaracao_matricula': html = buildDeclaracaoMatricula(vars); break;
    case 'atestado_frequencia': html = buildAtestadoFrequencia(vars); break;
    case 'certificado_habilitacoes': html = buildCertificadoHabilitacoes(vars, notas, aluno); break;
    case 'boletim_notas': html = buildBoletimNotas(vars, notas, aluno); break;
    case 'historico_escolar': html = buildHistoricoEscolar(vars, notas, aluno); break;
    case 'declaracao_conclusao': html = buildDeclaracaoConclusao(vars); break;
    case 'declaracao_finalista': html = buildDeclaracaoFinalista(vars); break;
    default: html = buildDeclaracaoMatricula(vars); break;
  }
  return injectBrasao(html, brasaoSrc);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GerarDocumentoScreen() {
  const { alunos, turmas, notas, professores } = useData();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ alunoId?: string; tipo?: string; solicitacaoId?: string }>();

  const anoAtual = anoSelecionado?.ano || String(new Date().getFullYear());

  // Steps: 'aluno' | 'tipo' | 'extras' | 'preview'
  const [step, setStep] = useState<'aluno' | 'tipo' | 'extras' | 'preview'>('aluno');

  const [searchAluno, setSearchAluno] = useState('');
  const [soFinalistas, setSoFinalistas] = useState(false);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [selectedTipo, setSelectedTipo] = useState<DocTipo | null>(null);
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<DocTemplate | null>(null);
  const [finalidade, setFinalidade] = useState('');
  const [extraPai, setExtraPai] = useState('');
  const [extraMae, setExtraMae] = useState('');
  const [extraBi, setExtraBi] = useState('');
  const [extraBiDataEmissao, setExtraBiDataEmissao] = useState('');
  const [extraBiLocalEmissao, setExtraBiLocalEmissao] = useState('');
  const [extraEncarregadoProfissao, setExtraEncarregadoProfissao] = useState('');
  const [extraResultado, setExtraResultado] = useState('APTO');

  const [customTemplates, setCustomTemplates] = useState<DocTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [docHistory, setDocHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const iframeRef = useRef<any>(null);
  const [generatedHTML, setGeneratedHTML] = useState<string>('');

  useEffect(() => {
    setLoadingTemplates(true);
    api.get<DocTemplate[]>('/api/doc-templates')
      .then(tpls => setCustomTemplates(tpls || []))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));

    api.get<any[]>('/api/documentos-emitidos')
      .then(h => setDocHistory(h || []))
      .catch(() => {});
  }, []);

  // Track which alunoId was already pre-selected to avoid re-running when alunos array reference refreshes
  const preSelectedAlunoIdRef = useRef<string | null>(null);

  // Pre-select aluno + tipo from URL params (when launched from solicitações modal)
  useEffect(() => {
    if (!params.alunoId || alunos.length === 0) return;
    // Guard: skip if we already pre-selected this exact alunoId (prevents reset on every DataContext poll)
    if (preSelectedAlunoIdRef.current === params.alunoId) return;
    const aluno = alunos.find(a => a.id === params.alunoId);
    if (!aluno) return;
    preSelectedAlunoIdRef.current = params.alunoId;
    setSelectedAluno(aluno);
    if (params.tipo && DOC_TIPOS.some(d => d.key === params.tipo)) {
      setSelectedTipo(params.tipo as DocTipo);
      setStep('extras');
    } else {
      setStep('tipo');
    }
    // Mark solicitacao as em_processamento silently
    if (params.solicitacaoId) {
      apiRequest('PUT', `/api/solicitacoes-documentos/${params.solicitacaoId}`, { status: 'em_processamento' }).catch(() => {});
    }
  }, [params.alunoId, params.tipo, params.solicitacaoId, alunos]);

  const alunosFiltrados = useMemo(() => {
    const q = searchAluno.toLowerCase().trim();
    if (!q) return alunos.filter(a => a.ativo).slice(0, 30);
    return alunos.filter(a =>
      a.ativo &&
      `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [alunos, searchAluno]);

  const turmaDoAluno = useMemo(() => {
    if (!selectedAluno) return undefined;
    return turmas.find(t => t.id === selectedAluno.turmaId);
  }, [selectedAluno, turmas]);

  const notasDoAluno = useMemo(() => {
    if (!selectedAluno) return [];
    return notas.filter(n => n.alunoId === selectedAluno.id);
  }, [notas, selectedAluno]);

  function handleSelectAluno(aluno: Aluno) {
    setSelectedAluno(aluno);
    setStep('tipo');
  }

  function handleSelectTipo(tipo: DocTipo, template?: DocTemplate) {
    setSelectedTipo(tipo);
    setSelectedCustomTemplate(template || null);
    setStep('extras');
  }

  async function handleGenerate() {
    if (!selectedAluno || !selectedTipo) return;
    setGenerating(true);
    try {
      const directorTurma = turmaDoAluno?.professorId
        ? professores.find(p => p.id === turmaDoAluno.professorId)
        : undefined;
      const nomeDirectorTurma = directorTurma
        ? `${directorTurma.nome} ${directorTurma.apelido || ''}`.trim()
        : '';

      // Fetch disciplinary occurrences for this student to derive comportamento
      let comportamento = '';
      try {
        const ocos = await api.get<{ gravidade: string }[]>(`/api/ocorrencias?alunoId=${selectedAluno.id}`);
        comportamento = computeComportamento(Array.isArray(ocos) ? ocos : []);
      } catch { comportamento = ''; }

      const vars = buildVarMap(
        selectedAluno,
        turmaDoAluno,
        notasDoAluno,
        config,
        anoAtual,
        finalidade,
        {
          pai: extraPai,
          mae: extraMae,
          biNumero: extraBi,
          biDataEmissao: extraBiDataEmissao,
          biLocalEmissao: extraBiLocalEmissao,
          encarregadoProfissao: extraEncarregadoProfissao,
          resultado: extraResultado,
          nomeDirectorTurma,
          comportamento,
        },
      );
      const html = generateHTML(
        selectedTipo,
        vars,
        notasDoAluno,
        selectedAluno,
        selectedCustomTemplate ?? undefined,
      );
      setGeneratedHTML(html);
      setStep('preview');

      // Log document emission
      try {
        const label = selectedTipo === 'custom'
          ? (selectedCustomTemplate?.nome || 'Documento Personalizado')
          : (DOC_TIPOS.find(d => d.key === selectedTipo)?.label || selectedTipo);
        await api.post('/api/documentos-emitidos', {
          alunoId: selectedAluno.id,
          alunoNome: `${selectedAluno.nome} ${selectedAluno.apelido}`,
          alunoNum: selectedAluno.numeroMatricula,
          alunoTurma: turmaDoAluno?.nome || '',
          tipo: label,
          finalidade: finalidade || '',
          anoAcademico: anoAtual,
          emitidoPor: user?.nome || 'Secretaria',
        });
        const updated = await api.get<any[]>('/api/documentos-emitidos');
        setDocHistory(updated || []);
      } catch { /* non-critical */ }
    } finally {
      setGenerating(false);
    }
  }

  function handlePrint() {
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('doc-preview-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow) {
        iframe.contentWindow.print();
      }
    }
  }

  function handleDownload() {
    if (Platform.OS !== 'web' || !generatedHTML) return;
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

  function reset() {
    setStep('aluno');
    setSelectedAluno(null);
    setSelectedTipo(null);
    setSelectedCustomTemplate(null);
    setFinalidade('');
    setExtraPai('');
    setExtraMae('');
    setExtraBi('');
    setExtraBiDataEmissao('');
    setExtraBiLocalEmissao('');
    setExtraEncarregadoProfissao('');
    setExtraResultado('APTO');
    setGeneratedHTML('');
    setSearchAluno('');
  }

  const isWeb = Platform.OS === 'web';

  // ─── Render steps ──────────────────────────────────────────────────────────

  function renderStepBar() {
    const steps = [
      { key: 'aluno', label: 'Aluno', icon: 'person' },
      { key: 'tipo', label: 'Documento', icon: 'document-text' },
      { key: 'extras', label: 'Detalhes', icon: 'create' },
      { key: 'preview', label: 'PDF', icon: 'print' },
    ] as const;
    const currentIdx = steps.findIndex(s => s.key === step);

    return (
      <View style={s.stepBar}>
        {steps.map((st, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <React.Fragment key={st.key}>
              <TouchableOpacity
                style={s.stepItem}
                onPress={() => {
                  if (done) {
                    if (st.key === 'aluno') reset();
                    else if (st.key === 'tipo') setStep('tipo');
                    else if (st.key === 'extras') setStep('extras');
                  }
                }}
              >
                <View style={[
                  s.stepCircle,
                  done && { backgroundColor: Colors.success, borderColor: Colors.success },
                  active && { backgroundColor: Colors.gold, borderColor: Colors.gold },
                ]}>
                  {done
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Ionicons name={st.icon as any} size={14} color={active ? '#fff' : Colors.textMuted} />}
                </View>
                <Text style={[s.stepLabel, active && { color: Colors.gold }, done && { color: Colors.success }]}>
                  {st.label}
                </Text>
              </TouchableOpacity>
              {i < steps.length - 1 && (
                <View style={[s.stepLine, done && { backgroundColor: Colors.success }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  }

  function renderStepAluno() {
    return (
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>Seleccionar Aluno</Text>
        <Text style={s.stepSub}>Pesquise e seleccione o aluno para gerar o documento</Text>

        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Nome, apelido ou número de matrícula..."
            placeholderTextColor={Colors.textMuted}
            value={searchAluno}
            onChangeText={setSearchAluno}
            autoFocus
          />
          {searchAluno.length > 0 && (
            <TouchableOpacity onPress={() => setSearchAluno('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={alunosFiltrados}
          keyExtractor={a => a.id}
          style={{ flex: 1, marginTop: 8 }}
          renderItem={({ item: aluno }) => {
            const turma = turmas.find(t => t.id === aluno.turmaId);
            return (
              <TouchableOpacity style={s.alunoCard} onPress={() => handleSelectAluno(aluno)}>
                <View style={s.alunoAvatar}>
                  <Text style={s.alunoAvatarTxt}>
                    {aluno.nome[0]}{aluno.apelido[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alunoNome}>{aluno.nome} {aluno.apelido}</Text>
                  <Text style={s.alunoMeta}>
                    {aluno.numeroMatricula} · {turma?.nome || '—'} · {turma?.classe || '—'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
              <Ionicons name="person-outline" size={40} color={Colors.textMuted} />
              <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
                {searchAluno ? 'Nenhum aluno encontrado' : 'Pesquise um aluno acima'}
              </Text>
            </View>
          }
        />
      </View>
    );
  }

  function renderStepTipo() {
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {selectedAluno && (
          <View style={s.selectedAlunoBar}>
            <View style={[s.alunoAvatar, { width: 36, height: 36 }]}>
              <Text style={[s.alunoAvatarTxt, { fontSize: 13 }]}>
                {selectedAluno.nome[0]}{selectedAluno.apelido[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.selectedAlunoNome}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
              <Text style={s.selectedAlunoMeta}>{selectedAluno.numeroMatricula} · {turmaDoAluno?.nome || '—'}</Text>
            </View>
            <TouchableOpacity onPress={() => setStep('aluno')}>
              <Text style={s.changeBtn}>Alterar</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.stepTitle}>Tipo de Documento</Text>
        <Text style={s.stepSub}>Escolha o documento a gerar</Text>

        <View style={s.docGrid}>
          {DOC_TIPOS.filter(tipo => config.temDecimaTermeira !== false || !tipo.soFinalistas).map(tipo => (
            <TouchableOpacity
              key={tipo.key}
              style={[s.docCard, { borderColor: tipo.color + '44' }]}
              onPress={() => handleSelectTipo(tipo.key)}
            >
              <View style={[s.docCardIcon, { backgroundColor: tipo.color + '20' }]}>
                <Ionicons name={tipo.icon as any} size={24} color={tipo.color} />
              </View>
              <Text style={s.docCardLabel}>{tipo.label}</Text>
              <Text style={s.docCardDesc}>{tipo.desc}</Text>
              {tipo.requiresNotas && notasDoAluno.length === 0 && (
                <View style={s.docCardWarn}>
                  <Ionicons name="warning-outline" size={11} color={Colors.warning} />
                  <Text style={s.docCardWarnTxt}>Sem notas no sistema</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {customTemplates.length > 0 && (
          <>
            <Text style={[s.stepTitle, { marginTop: 16 }]}>Templates Personalizados</Text>
            {customTemplates.map(tpl => (
              <TouchableOpacity
                key={tpl.id}
                style={s.customTplCard}
                onPress={() => handleSelectTipo('custom', tpl)}
              >
                <View style={[s.docCardIcon, { backgroundColor: Colors.gold + '20', width: 38, height: 38, borderRadius: 10 }]}>
                  <Ionicons name="document" size={18} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alunoNome}>{tpl.nome}</Text>
                  <Text style={s.alunoMeta}>{tpl.tipo}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  function renderStepExtras() {
    const tipoConfig = DOC_TIPOS.find(d => d.key === selectedTipo);
    const label = selectedTipo === 'custom'
      ? (selectedCustomTemplate?.nome || 'Template personalizado')
      : tipoConfig?.label;

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {selectedAluno && (
          <View style={s.selectedAlunoBar}>
            <View style={[s.alunoAvatar, { width: 36, height: 36 }]}>
              <Text style={[s.alunoAvatarTxt, { fontSize: 13 }]}>
                {selectedAluno.nome[0]}{selectedAluno.apelido[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.selectedAlunoNome}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
              <Text style={s.selectedAlunoMeta}>{label}</Text>
            </View>
          </View>
        )}

        <Text style={s.stepTitle}>Detalhes do Documento</Text>
        <Text style={s.stepSub}>Preencha as informações adicionais (opcional)</Text>

        <View style={s.extrasSection}>
          <Text style={s.extrasLabel}>Finalidade<RequiredMark /></Text>
          <TextInput
            style={s.extrasInput}
            placeholder="Ex: Bolsa de estudo, emprego, transferência..."
            placeholderTextColor={Colors.textMuted}
            value={finalidade}
            onChangeText={setFinalidade}
          />
        </View>

        {(() => {
          const dadosFicha: { label: string; value?: string }[] = [
            { label: 'Nome do Pai', value: selectedAluno?.nomePai },
            { label: 'Nome da Mãe', value: selectedAluno?.nomeMae },
            { label: 'N.º do Bilhete de Identidade', value: selectedAluno?.numeroBi },
            { label: 'Data de Emissão do BI', value: selectedAluno?.biDataEmissao },
            { label: 'Arquivo / Local de Emissão do BI', value: selectedAluno?.biLocalEmissao },
            { label: 'Profissão do Encarregado', value: selectedAluno?.encarregadoProfissao },
            { label: 'Local de Trabalho do Encarregado', value: selectedAluno?.encarregadoLocalTrabalho },
            { label: 'Residência do Encarregado', value: selectedAluno?.encarregadoResidencia },
          ];
          const emFalta = dadosFicha.filter(d => !d.value || !d.value.trim());
          const preenchidos = dadosFicha.length - emFalta.length;
          return (
            <View style={s.extrasSection}>
              <View style={s.extrasSectionHeader}>
                <Ionicons name="folder-open" size={14} color={Colors.textMuted} />
                <Text style={s.extrasSectionTitle}>Dados da Ficha do Aluno</Text>
              </View>
              <View style={s.fichaCard}>
                <View style={s.fichaCardHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={emFalta.length === 0 ? Colors.success : Colors.warning} />
                  <Text style={s.fichaCardTitle}>
                    {emFalta.length === 0
                      ? 'Todos os dados estão preenchidos na ficha'
                      : `${preenchidos} de ${dadosFicha.length} campos preenchidos`}
                  </Text>
                </View>
                <Text style={s.fichaCardSub}>
                  Filiação, Bilhete de Identidade e dados do encarregado são lidos automaticamente da ficha do aluno — não precisa de os reintroduzir aqui.
                </Text>

                <View style={s.fichaList}>
                  {dadosFicha.map((d, i) => (
                    <View key={i} style={s.fichaRow}>
                      <Text style={s.fichaLabel}>{d.label}</Text>
                      {d.value && d.value.trim() ? (
                        <Text style={s.fichaValue} numberOfLines={1}>{d.value}</Text>
                      ) : (
                        <Text style={s.fichaValueEmpty}>Por preencher na ficha</Text>
                      )}
                    </View>
                  ))}
                </View>

                {emFalta.length > 0 && (
                  <TouchableOpacity
                    style={s.fichaEditBtn}
                    onPress={() => router.push({ pathname: '/(main)/alunos', params: { abrirAluno: selectedAluno?.id || '' } })}
                  >
                    <Ionicons name="create-outline" size={14} color={Colors.gold} />
                    <Text style={s.fichaEditBtnTxt}>Editar Ficha do Aluno</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}

        {(selectedTipo === 'certificado_habilitacoes' || selectedTipo === 'declaracao_conclusao') && (
          <View style={s.extrasSection}>
            <Text style={s.extrasLabel}>Resultado</Text>
            <View style={s.resultadoRow}>
              {['APTO', 'NÃO APTO', 'APROVADO', 'REPROVADO'].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[s.resultadoChip, extraResultado === r && { backgroundColor: Colors.success + '30', borderColor: Colors.success }]}
                  onPress={() => setExtraResultado(r)}
                >
                  <Text style={[s.resultadoChipTxt, extraResultado === r && { color: Colors.success }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={s.extrasSection}>
          <View style={{ backgroundColor: Colors.info + '15', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name="information-circle" size={18} color={Colors.info} style={{ marginTop: 1 }} />
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, flex: 1 }}>
              Os dados académicos (turma, classe, notas, ano lectivo) são preenchidos automaticamente a partir do sistema.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.generateBtn, generating && { opacity: 0.7 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <AppLoader size="small" color="#fff" />
            : <Ionicons name="document-text" size={18} color="#fff" />}
          <Text style={s.generateBtnTxt}>
            {generating ? 'A gerar...' : 'Gerar Documento'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  function renderStepPreview() {
    return (
      <View style={{ flex: 1 }}>
        <View style={s.previewBar}>
          <View style={{ flex: 1 }}>
            <Text style={s.previewTitle}>Documento Gerado</Text>
            <Text style={s.previewSub}>
              {selectedAluno?.nome} {selectedAluno?.apelido} ·{' '}
              {DOC_TIPOS.find(d => d.key === selectedTipo)?.label || selectedCustomTemplate?.nome}
            </Text>
          </View>
          <TouchableOpacity style={s.printBtn} onPress={handlePrint}>
            <Ionicons name="print" size={16} color="#fff" />
            <Text style={s.printBtnTxt}>Imprimir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={16} color="#fff" />
            <Text style={s.downloadBtnTxt}>Guardar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.newDocBtn} onPress={reset}>
            <Ionicons name="add" size={16} color={Colors.gold} />
            <Text style={s.newDocBtnTxt}>Novo</Text>
          </TouchableOpacity>
        </View>

        {isWeb ? (
          <iframe
            id="doc-preview-iframe"
            srcDoc={generatedHTML}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600 } as any}
            title="Pré-visualização do documento"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Ionicons name="document-text" size={48} color={Colors.gold} />
            <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 16, textAlign: 'center' }}>
              Documento gerado com sucesso!
            </Text>
            <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
              A impressão de documentos está disponível na versão web do sistema.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ─── History sidebar (web only) ───────────────────────────────────────────

  function renderHistorySidebar() {
    if (!isWeb || !showHistory) return null;
    return (
      <View style={s.historySidebar}>
        <View style={s.historyHeader}>
          <Text style={s.historyTitle}>Histórico de Emissões</Text>
          <TouchableOpacity onPress={() => setShowHistory(false)}>
            <Ionicons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }}>
          {docHistory.length === 0 ? (
            <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, padding: 16, textAlign: 'center' }}>
              Sem emissões registadas
            </Text>
          ) : docHistory.slice(0, 30).map((doc, i) => {
            const aluno = alunos.find(a => a.id === doc.alunoId);
            return (
              <View key={doc.id || i} style={s.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyItemTitle}>{doc.descricao || doc.tipo}</Text>
                  <Text style={s.historyItemSub}>
                    {aluno ? `${aluno.nome} ${aluno.apelido}` : doc.alunoId}
                  </Text>
                  <Text style={s.historyItemDate}>
                    {doc.emitidoEm ? new Date(doc.emitidoEm).toLocaleDateString('pt-PT') : '—'} · {doc.emitidoPor || '—'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <TopBar
        title="Gerar Documentos"
        subtitle="Geração automática de PDF"
        rightAction={{ icon: 'time-outline', onPress: () => setShowHistory(v => !v) }}
      />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          {renderStepBar()}

          <View style={s.content}>
            {step === 'aluno' && renderStepAluno()}
            {step === 'tipo' && renderStepTipo()}
            {step === 'extras' && renderStepExtras()}
            {step === 'preview' && renderStepPreview()}
          </View>
        </View>

        {renderHistorySidebar()}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 56 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.backgroundElevated,
  },
  stepLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  stepLine: { flex: 1, height: 1.5, backgroundColor: Colors.border, marginBottom: 12 },

  content: { flex: 1, padding: 16 },

  stepTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  stepSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 16 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text,
    outlineStyle: 'none' as any,
  },

  alunoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  alunoAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.info + '30', alignItems: 'center', justifyContent: 'center',
  },
  alunoAvatarTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.info },
  alunoNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  selectedAlunoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.success + '15', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.success + '40', marginBottom: 16,
  },
  selectedAlunoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  selectedAlunoMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  changeBtn: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  docGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8,
  },
  docCard: {
    width: '47%', borderRadius: 14, borderWidth: 1.5,
    backgroundColor: Colors.surface, padding: 14, gap: 6,
  },
  docCardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docCardLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 4 },
  docCardDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  docCardWarn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  docCardWarnTxt: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.warning },

  customTplCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.gold + '33',
  },

  extrasSection: { marginBottom: 16 },
  extrasSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  extrasSectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  extrasLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginBottom: 6 },
  extrasInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text,
    marginBottom: 10, outlineStyle: 'none' as any,
  },
  fichaCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14,
  },
  fichaCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fichaCardTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  fichaCardSub: { fontSize: 11.5, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17, marginBottom: 12 },
  fichaList: { gap: 6 },
  fichaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '55', gap: 12,
  },
  fichaLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  fichaValue: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: Colors.text, maxWidth: '55%', textAlign: 'right' },
  fichaValueEmpty: { fontSize: 11.5, fontFamily: 'Inter_400Regular', color: Colors.warning, fontStyle: 'italic' },
  fichaEditBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '12',
  },
  fichaEditBtnTxt: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  resultadoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultadoChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  resultadoChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 12, padding: 16, marginTop: 8,
  },
  generateBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  previewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    padding: 12, paddingHorizontal: 16,
  },
  previewTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  previewSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  printBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#166534', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  downloadBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  newDocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.gold + '55',
  },
  newDocBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  historyToggleBtn: { position: 'relative', padding: 4 },
  historyBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: Colors.info, borderRadius: 8, width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  historyBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff' },

  historySidebar: {
    width: 280, borderLeftWidth: 1, borderLeftColor: Colors.border,
    backgroundColor: Colors.surface, flexDirection: 'column',
  },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  historyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  historyItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  historyItemTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  historyItemSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  historyItemDate: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
});
