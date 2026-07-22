import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, FlatList, Modal, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { useData, Aluno, Turma } from '@/context/DataContext';
import { useFinanceiro, formatAOA, Pagamento, Taxa, RUPEGerado } from '@/context/FinanceiroContext';
import { useConfig } from '@/context/ConfigContext';
import { useAuth } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useLocalSearchParams } from 'expo-router';
import { openPdfInTab } from '@/utils/pdfAuth';
import { api } from '@/lib/api';

// ─── Constantes ───────────────────────────────────────────────────────────────

type ActiveTab = 'propinas' | 'rubricas' | 'combinado';

const TIPO_RUBRICA_LABELS: Record<string, string> = {
  matricula: 'Matrícula',
  material:  'Material Didáctico',
  exame:     'Exame',
  multa:     'Multa',
  outro:     'Outra Rubrica',
  cartao:    'Cartão de Estudante',
};

const TIPO_RUBRICA_ICONS: Record<string, string> = {
  matricula: 'school-outline',
  material:  'book-outline',
  exame:     'document-text-outline',
  multa:     'warning-outline',
  outro:     'cash-outline',
  cartao:    'card-outline',
};

const TIPO_RUBRICA_COLORS: Record<string, string> = {
  matricula: '#7C3AED',
  material:  '#0EA5E9',
  exame:     '#F59E0B',
  multa:     '#EF4444',
  outro:     '#6B7280',
  cartao:    '#10B981',
};

const FREQUENCIA_LABELS: Record<string, string> = {
  mensal:     'Mensal',
  trimestral: 'Trimestral',
  anual:      'Anual',
  unica:      'Pagamento único',
};

const MONTH_NAMES: Record<number, string> = {
  1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL',
  5: 'MAIO', 6: 'JUNHO', 7: 'JULHO', 8: 'AGOSTO',
  9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO',
};

const DEFAULT_MESES_LETIVOS = [
  { num: 9,  nome: 'SETEMBRO' },
  { num: 10, nome: 'OUTUBRO' },
  { num: 11, nome: 'NOVEMBRO' },
  { num: 12, nome: 'DEZEMBRO' },
  { num: 1,  nome: 'JANEIRO' },
  { num: 2,  nome: 'FEVEREIRO' },
  { num: 3,  nome: 'MARÇO' },
  { num: 4,  nome: 'ABRIL' },
  { num: 5,  nome: 'MAIO' },
  { num: 6,  nome: 'JUNHO' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function formatDate(iso: string): string {
  if (!iso) return '__/__/____';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

function getMesAtualPago(pagamentos: Pagamento[]): boolean {
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = String(new Date().getFullYear());
  return pagamentos.some(p =>
    p.mes === mesAtual && p.ano === anoAtual && p.status === 'pago'
  );
}

function getStatusMes(mes: number, anoLetivo: string, pagamentos: Pagamento[]): 'pago' | 'pendente' | 'atraso' | 'futuro' {
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  // Mapear o mês lectivo para o ano correcto
  // Set-Dez = primeiro ano do anoLetivo (ex: 2025 de "2025/26")
  // Jan-Jul = segundo ano (ex: 2026 de "2025/26")
  const anoBase = parseInt(anoLetivo.split('/')[0]) || anoAtual;
  const anoMes = mes >= 8 ? anoBase : anoBase + 1;
  const anoStr = String(anoMes);

  // Priorizar 'pago' sobre 'pendente' caso existam ambos para o mesmo mês
  // (pode acontecer quando um RUPE é gerado e depois confirmado)
  const candidates = pagamentos.filter(p => p.mes === mes && p.ano === anoStr && p.status !== 'cancelado');
  const pag = candidates.find(p => p.status === 'pago') ?? candidates[0];

  if (pag?.status === 'pago') return 'pago';
  if (pag?.status === 'pendente') return 'pendente';

  // Verificar se já passou
  const dataReferencia = new Date(anoMes, mes - 1, 1);
  const dataAtual = new Date(anoAtual, mesAtual - 1, 1);
  if (dataReferencia < dataAtual) return 'atraso';
  if (dataReferencia.getTime() === dataAtual.getTime()) return 'pendente';
  return 'futuro';
}

function getAnoMesStr(mes: number, anoLetivo: string): string {
  const anoBase = parseInt(anoLetivo.split('/')[0]) || new Date().getFullYear();
  const anoMes = mes >= 8 ? anoBase : anoBase + 1;
  return String(anoMes);
}

function getPagamento(mes: number, anoLetivo: string, pagamentos: Pagamento[]): Pagamento | undefined {
  const anoBase = parseInt(anoLetivo.split('/')[0]) || new Date().getFullYear();
  const anoMes = mes >= 8 ? anoBase : anoBase + 1;
  const matches = pagamentos.filter(p => p.mes === mes && p.ano === String(anoMes) && p.status !== 'cancelado');
  // Priorizar 'pago' — evita que um registo 'pendente' mais recente oculte um 'pago' na caderneta
  return matches.find(p => p.status === 'pago') ?? matches[0];
}

// ─── QR Data ─────────────────────────────────────────────────────────────────

function buildQRData(aluno: Aluno, turma: Turma | undefined, nomeEscola: string, mesAtualPago: boolean): string {
  const mesAtual = new Date().getMonth() + 1;
  const mesesNomes = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return [
    `NOME: ${aluno.nome} ${aluno.apelido}`,
    `MATRICULA: ${aluno.numeroMatricula}`,
    `INSTITUICAO: ${nomeEscola}`,
    turma?.nivel === 'II Ciclo'
      ? `CURSO: ${(turma as any).cursoNome ?? turma?.nome ?? ''}`
      : `CLASSE: ${turma?.classe ?? ''}ª`,
    `TURMA: ${turma?.nome ?? ''}`,
    `ANO LECTIVO: ${turma?.anoLetivo ?? ''}`,
    `MES ACTUAL (${mesesNomes[mesAtual]}): ${mesAtualPago ? 'LIQUIDADO' : 'VENCIDO'}`,
    `VERIFICADO EM: ${today()}`,
    `SISTEMA: Super Escola SIGA`,
  ].filter(Boolean).join('\n');
}

// ─── HTML Generator (Caderneta Completa) ─────────────────────────────────────

function generateCadernetaHTML(
  aluno: Aluno,
  turma: Turma | undefined,
  nomeEscola: string,
  pagamentos: Pagamento[],
  anoLetivo: string,
  qrDataUrl: string,
  numeroCaderneta: string,
  mesesLetivos: Array<{ num: number; nome: string }> = DEFAULT_MESES_LETIVOS,
  fotoUrl?: string,
): string {
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  const classe = turma?.classe ?? '—';
  const turmaNome = turma?.nome ?? '—';
  const turno = turma?.turno ?? '—';
  const sala = turma?.sala ?? '—';

  function renderMesHTML(mes: { num: number; nome: string }): string {
    const pag = getPagamento(mes.num, anoLetivo, pagamentos);
    const status = getStatusMes(mes.num, anoLetivo, pagamentos);
    const dataStr = pag?.data ? formatDate(pag.data) : '__/__/____';

    // Cores e estilos por estado — distintos mesmo sem cor (ícone + texto de estado)
    const cfg: Record<string, { bg: string; border: string; badgeBg: string; badgeColor: string; badgeText: string; icon: string }> = {
      pago:     { bg: '#d4edda', border: '#28a745', badgeBg: '#28a745', badgeColor: '#fff', badgeText: 'LIQUIDADO',      icon: '✓' },
      atraso:   { bg: '#fff3cd', border: '#dc3545', badgeBg: '#dc3545', badgeColor: '#fff', badgeText: 'VENCIDO', icon: '!' },
      pendente: { bg: '#fff8e1', border: '#ffc107', badgeBg: '#ffc107', badgeColor: '#000', badgeText: 'EM COBRANÇA',  icon: '○' },
      futuro:   { bg: '#f8f9fa', border: '#adb5bd', badgeBg: '#e9ecef', badgeColor: '#6c757d', badgeText: 'A PRAZO', icon: '·' },
    };
    const c = cfg[status] ?? cfg.futuro;

    return `
      <div class="mes-cell" style="background:${c.bg};border:1.5px solid ${c.border};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;border-bottom:1px solid ${c.border}44;padding-bottom:2px;">
          <div class="mes-nome" style="margin:0;border:none;padding:0;">${mes.nome}</div>
          <span style="background:${c.badgeBg};color:${c.badgeColor};font-size:6pt;font-weight:bold;padding:1px 4px;border-radius:3px;white-space:nowrap;">${c.icon} ${c.badgeText}</span>
        </div>
        <div class="mes-field">Pago aos: <span class="mes-val">${status === 'pago' ? dataStr : '___/___/______'}</span></div>
        <div class="mes-field">Valor: <span class="mes-val">${pag ? formatAOA(pag.valor) : '____________'}</span></div>
        <div class="mes-field">O responsável: <span class="mes-val">${status === 'pago' ? (pag?.criadoPor ?? '___') : '_____________'}</span></div>
        <div class="mes-field">Via: <span class="mes-val">${status === 'pago' ? (({'dinheiro':'Dinheiro','multicaixa':'Multicaixa','cartao_multicaixa':'Multicaixa','transferencia':'Transferência','referencia_bancaria':'RUPE'} as Record<string,string>)[pag?.metodoPagamento ?? ''] ?? pag?.metodoPagamento ?? '___') : '___'}</span></div>
      </div>`;
  }

  // Organizar em grupos de 4 colunas
  const rows: Array<typeof mesesLetivos> = [];
  for (let i = 0; i < mesesLetivos.length; i += 4) {
    rows.push(mesesLetivos.slice(i, i + 4));
  }

  const mesesHTML = rows.map(row => `
    <div class="mes-row">
      ${row.map(m => renderMesHTML(m)).join('')}
      ${row.length < 4 ? '<div class="mes-cell empty"></div>'.repeat(4 - row.length) : ''}
    </div>
  `).join('');

  const mesAtualPago = getMesAtualPago(pagamentos);
  // Build QR source: prefer locally-generated data URL; fall back to external API when empty
  const qrContent = buildQRData(aluno, turma, nomeEscola, mesAtualPago);
  const qrSrc = qrDataUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrContent)}&bgcolor=ffffff&color=000000&margin=4&ecc=M`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Caderneta de Propinas — ${nomeCompleto}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size: A5 landscape; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .page { width: 100%; }
  .header-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 4px; }
  .header-text { flex: 1; text-align: center; }
  .header-text p { font-size: 8.5pt; line-height: 1.45; }
  .escola-nome { font-size: 12pt; font-weight: bold; color: #C0392B; margin: 3px 0; }
  .caderneta-title { font-size: 10pt; font-weight: bold; margin: 3px 0; }
  .qr-box { width: 80px; height: 80px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-status { font-size: 6pt; text-align: center; margin-top: 2px; padding: 2px; border-radius: 3px; }
  .qr-pago { background: #e8f5e9; color: #2e7d32; font-weight: bold; }
  .qr-atraso { background: #fff3e0; color: #e65100; font-weight: bold; }
  .foto-box { width: 80px; height: 80px; border: 1px solid #000; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f5f5; }
  .foto-box img { width: 100%; height: 100%; object-fit: cover; }
  .foto-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: 3px; }
  .foto-placeholder svg { opacity: 0.3; }
  .foto-placeholder span { font-size: 6pt; color: #999; text-align: center; line-height: 1.2; }
  .info-line { display: flex; gap: 16px; margin: 4px 0; font-size: 9pt; flex-wrap: wrap; }
  .info-item { display: flex; align-items: baseline; gap: 4px; }
  .info-item .val { border-bottom: 1px solid #000; min-width: 80px; padding-bottom: 1px; }
  .separator { border-top: 1.5px solid #000; margin: 5px 0; }
  .mes-row { display: flex; gap: 4px; margin-bottom: 4px; }
  .mes-cell {
    flex: 1; padding: 4px 5px; border-radius: 3px;
    border: 1px solid #999; min-height: 60px;
  }
  .mes-cell.empty { border: none; background: transparent; }
  .mes-nome { font-weight: bold; font-size: 8.5pt; text-align: center; margin-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.15); padding-bottom: 2px; }
  .mes-field { font-size: 7.5pt; margin-top: 2px; }
  .mes-val { font-size: 7.5pt; border-bottom: 1px dotted #999; display: inline-block; min-width: 50px; }
  .footer-line { margin-top: 6px; font-size: 8.5pt; }
  .footer-line .field-line { display: flex; align-items: baseline; gap: 4px; margin-bottom: 3px; }
  .footer-line .val { border-bottom: 1px solid #000; flex: 1; min-width: 100px; }
  .obs { font-size: 8pt; line-height: 1.5; margin-top: 4px; }
  .legenda { display:flex; gap:10px; flex-wrap:wrap; margin-top:5px; }
  .legenda-item { display:flex; align-items:center; gap:4px; font-size:7pt; }
  .legenda-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0; border:1px solid rgba(0,0,0,0.2); }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header-row">
    <div class="foto-box">
      ${fotoUrl
        ? `<img src="${fotoUrl}" alt="Foto do aluno" onerror="this.parentNode.innerHTML='<div class=\\'foto-placeholder\\'><svg width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\'><path fill=\\'#999\\' d=\\'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z\\'/></svg><span>Sem foto</span></div>'" />`
        : `<div class="foto-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24"><path fill="#999" d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
            <span>Foto do<br/>Aluno</span>
          </div>`
      }
    </div>
    <div class="header-text">
      <img src="/angola-brasao.png" style="width:55px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p>REPÚBLICA DE ANGOLA</p>
      <p>GOVERNO DA PROVÍNCIA · REPARTIÇÃO MUNICIPAL DE EDUCAÇÃO</p>
      <p class="escola-nome">${nomeEscola.toUpperCase()}</p>
      <p class="caderneta-title">CADERNETA DE PROPINAS N.º <span style="border-bottom:1px solid #000;padding:0 20px;">${numeroCaderneta}</span> / 20<span style="border-bottom:1px solid #000;padding:0 10px;"></span></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box">
        <img src="${qrSrc}" alt="QR" onerror="this.style.opacity='0.3'" />
      </div>
      <div class="qr-status ${mesAtualPago ? 'qr-pago' : 'qr-atraso'}">
        ${mesAtualPago ? '✓ LIQUIDADO' : '⚠ PROPINA VENCIDA'}
      </div>
    </div>
  </div>

  <div class="info-line">
    <div class="info-item"><span>Nome:</span><span class="val">${nomeCompleto}</span></div>
    <div class="info-item"><span>Nº Matrícula:</span><span class="val">${aluno.numeroMatricula}</span></div>
  </div>
  <div class="info-line">
    <div class="info-item"><span>Classe:</span><span class="val">${classe}ª</span></div>
    <div class="info-item"><span>Período/Turno:</span><span class="val">${turno}</span></div>
    <div class="info-item"><span>Turma:</span><span class="val">${turmaNome}</span></div>
    <div class="info-item"><span>Sala Nº:</span><span class="val">${sala}</span></div>
    <div class="info-item"><span>Ano Lectivo:</span><span class="val">${anoLetivo}</span></div>
  </div>

  <div class="separator"></div>

  ${mesesHTML}

  <div class="separator"></div>

  <div class="footer-line">
    <div class="field-line">
      <span>O encarregado de educação:</span>
      <span class="val">${aluno.nomeEncarregado}</span>
      <span>&nbsp;&nbsp;TLF.:</span>
      <span class="val">${aluno.telefoneEncarregado}</span>
    </div>
    <div class="obs">
      <b>OBS:</b> Conserve esta caderneta e apresente-a sempre no acto do pagamento.<br/>
      <b>N.B.</b> As propinas são pagas de 1 a 30 de cada mês, móvel: <span style="border-bottom:1px solid #000;display:inline-block;min-width:80px;"></span><br/>
      DT: <span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;"></span>/<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;"></span>/<span style="border-bottom:1px solid #000;display:inline-block;min-width:40px;"></span>
    </div>
    <div class="legenda">
      <span style="font-size:7pt;font-weight:bold;margin-right:2px;">Legenda:</span>
      <div class="legenda-item"><div class="legenda-dot" style="background:#d4edda;border-color:#28a745;"></div><span>✓ Liquidado</span></div>
      <div class="legenda-item"><div class="legenda-dot" style="background:#fff3cd;border-color:#dc3545;"></div><span>! Vencido (em mora)</span></div>
      <div class="legenda-item"><div class="legenda-dot" style="background:#fff8e1;border-color:#ffc107;"></div><span>○ Em Cobrança (mês actual)</span></div>
      <div class="legenda-item"><div class="legenda-dot" style="background:#f8f9fa;border-color:#adb5bd;"></div><span>· A Prazo (não vencido)</span></div>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─── HTML Generator (Caderneta de Rubricas) ───────────────────────────────────

interface RubricaItem {
  taxa: Taxa;
  pagamento?: Pagamento;
}

function generateCadernetaRubricasHTML(
  aluno: Aluno,
  turma: Turma | undefined,
  nomeEscola: string,
  rubricas: RubricaItem[],
  anoLetivo: string,
): string {
  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
  const classe = turma?.classe ?? '—';
  const turmaNome = turma?.nome ?? '—';
  const turno = turma?.turno ?? '—';
  const sala = turma?.sala ?? '—';

  const totalPago = rubricas.filter(r => r.pagamento?.status === 'pago').reduce((s, r) => s + (r.pagamento?.valor ?? 0), 0);
  const totalPendente = rubricas.filter(r => !r.pagamento || r.pagamento.status !== 'pago').reduce((s, r) => s + r.taxa.valor, 0);

  function renderRubricaRow(r: RubricaItem, idx: number): string {
    const pago = r.pagamento?.status === 'pago';
    const bg = pago ? '#e8f5e9' : r.pagamento ? '#fff3e0' : '#fff';
    const border = pago ? '#4CAF50' : r.pagamento ? '#FF9800' : '#bbb';
    const status = pago ? '✓ LIQUIDADO' : r.pagamento ? '⚠ EM COBRANÇA' : '— SEM REGISTO';
    const statusColor = pago ? '#2e7d32' : r.pagamento ? '#e65100' : '#666';

    return `
    <tr style="background:${bg};">
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;">${idx + 1}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;font-weight:bold;">${TIPO_RUBRICA_LABELS[r.taxa.tipo] ?? r.taxa.tipo}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;">${r.taxa.descricao}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;">${FREQUENCIA_LABELS[r.taxa.frequencia] ?? r.taxa.frequencia}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;text-align:right;">${formatAOA(r.taxa.valor)}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;text-align:center;font-weight:bold;color:${statusColor};">${status}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;">${r.pagamento?.data ? formatDate(r.pagamento.data) : '___/___/______'}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;text-align:right;">${pago ? formatAOA(r.pagamento!.valor) : '____________'}</td>
      <td style="border:1px solid ${border};padding:5px 7px;font-size:8pt;">${r.pagamento?.metodoPagamento ?? '_____________'}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Caderneta de Rubricas — ${nomeCompleto}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size: A4 landscape; margin: 12mm 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .header-row { display:flex; align-items:flex-start; gap:10px; margin-bottom:6px; }
  .header-text { flex:1; text-align:center; }
  .escola-nome { font-size:12pt; font-weight:bold; color:#C0392B; margin:3px 0; }
  .caderneta-title { font-size:10pt; font-weight:bold; margin:3px 0; }
  .info-line { display:flex; gap:14px; margin:4px 0; flex-wrap:wrap; }
  .info-item { display:flex; align-items:baseline; gap:4px; font-size:9pt; }
  .info-item .val { border-bottom:1px solid #000; min-width:80px; padding-bottom:1px; }
  .separator { border-top:1.5px solid #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th { background:#1e3a5f; color:#fff; padding:5px 7px; font-size:8pt; text-align:left; border:1px solid #1e3a5f; }
  .summary-row { margin-top:8px; display:flex; gap:20px; }
  .sum-box { border:1.5px solid #000; border-radius:4px; padding:6px 14px; text-align:center; }
  .sum-label { font-size:8pt; }
  .sum-value { font-size:11pt; font-weight:bold; }
  .footer { margin-top:10px; font-size:8.5pt; }
  .field-line { display:flex; gap:6px; align-items:baseline; margin-bottom:3px; }
  .val { border-bottom:1px solid #000; flex:1; min-width:100px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="header-row">
  <div style="width:40px;flex-shrink:0;"></div>
  <div class="header-text">
    <img src="/angola-brasao.png" style="width:50px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia" onerror="this.style.display='none'" />
    <p>REPÚBLICA DE ANGOLA</p>
    <p>GOVERNO DA PROVÍNCIA · REPARTIÇÃO MUNICIPAL DE EDUCAÇÃO</p>
    <p class="escola-nome">${nomeEscola.toUpperCase()}</p>
    <p class="caderneta-title">CADERNETA DE RUBRICAS / TAXAS — ANO LECTIVO ${anoLetivo}</p>
  </div>
  <div style="width:40px;flex-shrink:0;"></div>
</div>

<div class="info-line">
  <div class="info-item"><span>Nome:</span><span class="val">${nomeCompleto}</span></div>
  <div class="info-item"><span>Nº Matrícula:</span><span class="val">${aluno.numeroMatricula}</span></div>
</div>
<div class="info-line">
  <div class="info-item"><span>Classe:</span><span class="val">${classe}ª</span></div>
  <div class="info-item"><span>Turno:</span><span class="val">${turno}</span></div>
  <div class="info-item"><span>Turma:</span><span class="val">${turmaNome}</span></div>
  <div class="info-item"><span>Sala Nº:</span><span class="val">${sala}</span></div>
  <div class="info-item"><span>Ano Lectivo:</span><span class="val">${anoLetivo}</span></div>
</div>

<div class="separator"></div>

<table>
  <thead>
    <tr>
      <th style="width:28px;">#</th>
      <th style="width:90px;">Tipo</th>
      <th>Descrição</th>
      <th style="width:80px;">Frequência</th>
      <th style="width:90px;text-align:right;">Valor Prev.</th>
      <th style="width:90px;text-align:center;">Estado</th>
      <th style="width:80px;">Data Pagto.</th>
      <th style="width:90px;text-align:right;">Valor Liquidado</th>
      <th style="width:90px;">Método</th>
    </tr>
  </thead>
  <tbody>
    ${rubricas.length > 0
      ? rubricas.map((r, i) => renderRubricaRow(r, i)).join('')
      : '<tr><td colspan="9" style="padding:14px;text-align:center;color:#666;font-style:italic;border:1px solid #ccc;">Nenhuma rubrica/taxa configurada para este nível e ano lectivo.</td></tr>'
    }
  </tbody>
</table>

<div class="summary-row">
  <div class="sum-box" style="border-color:#4CAF50;">
    <div class="sum-label" style="color:#2e7d32;">Total Liquidado</div>
    <div class="sum-value" style="color:#2e7d32;">${formatAOA(totalPago)}</div>
  </div>
  <div class="sum-box" style="border-color:#FF9800;">
    <div class="sum-label" style="color:#e65100;">Total em Dívida</div>
    <div class="sum-value" style="color:#e65100;">${formatAOA(Math.max(0, totalPendente - totalPago))}</div>
  </div>
  <div class="sum-box">
    <div class="sum-label">Rubricas Pagas</div>
    <div class="sum-value">${rubricas.filter(r => r.pagamento?.status === 'pago').length} / ${rubricas.length}</div>
  </div>
</div>

<div class="separator" style="margin-top:8px;"></div>

<div class="footer">
  <div class="field-line">
    <span>Encarregado de Educação:</span>
    <span class="val">${aluno.nomeEncarregado}</span>
    <span>Contacto:</span>
    <span class="val">${aluno.telefoneEncarregado}</span>
  </div>
  <div style="margin-top:4px;font-size:8pt;font-style:italic;">
    <b>OBS:</b> Esta caderneta é emitida pela Direcção da Escola e substitui qualquer outro recibo avulso.
    Conserve este documento durante todo o ano lectivo e apresente-o sempre que solicitado.
  </div>
</div>
</body>
</html>`;
}

// ─── HTML Generator (Caderneta Combinada — Propinas + Rubricas) ───────────────

function generateCombinedCadernetaHTML(
  aluno: Aluno,
  turma: Turma | undefined,
  nomeEscola: string,
  pagamentos: Pagamento[],
  rubricas: RubricaItem[],
  anoLetivo: string,
  qrDataUrl: string,
  numeroCaderneta: string,
  mesesLetivos: Array<{ num: number; nome: string }>,
  fotoUrl?: string,
): string {
  // Extract body content using a robust regex (handles any newline variant)
  function extractBody(html: string): string {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1] : html;
  }
  function extractStyles(html: string): string {
    const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    return m ? m.join('\n') : '';
  }
  // Remove a insígnia (brasão) de uma secção para evitar duplicação no combinado
  function stripBrasao(html: string): string {
    return html.replace(/<img[^>]*angola-brasao[^>]*>/gi, '');
  }

  const propinasHtml = generateCadernetaHTML(aluno, turma, nomeEscola, pagamentos, anoLetivo, qrDataUrl, numeroCaderneta, mesesLetivos, fotoUrl);
  const rubricasHtml = generateCadernetaRubricasHTML(aluno, turma, nomeEscola, rubricas, anoLetivo);

  const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;

  // A página de rubricas não repete a insígnia — apenas mantém o cabeçalho de texto
  const rubricasBody = stripBrasao(extractBody(rubricasHtml));

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Caderneta Completa — ${nomeCompleto}</title>
${extractStyles(propinasHtml)}
${extractStyles(rubricasHtml)}
<style>
  @page { margin: 0; }
  .page-break { page-break-before: always; break-before: page; }
</style>
</head>
<body>
<div class="propinas-page">
${extractBody(propinasHtml)}
</div>
<div class="page-break"></div>
<div class="rubricas-page" style="padding:12mm 10mm;">
${rubricasBody}
</div>
</body>
</html>`;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pago:     { color: Colors.success, bg: Colors.success + '22', icon: 'checkmark-circle', label: 'Liquidado' },
  pendente: { color: Colors.warning, bg: Colors.warning + '22', icon: 'time',             label: 'Em Cobrança' },
  atraso:   { color: Colors.danger,  bg: Colors.danger  + '22', icon: 'alert-circle',     label: 'Vencido' },
  futuro:   { color: Colors.textMuted, bg: Colors.border,       icon: 'ellipse-outline',  label: 'A Prazo' },
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BoletimPropinaScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const params = useLocalSearchParams<{ alunoId?: string }>();

  const { user } = useAuth();
  const { alunos, turmas } = useData();
  const { pagamentos, taxas, getPagamentosAluno, getSaldoAluno, addPagamento, gerarRUPE, getRUPEsAluno } = useFinanceiro();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();

  const anoLetivo = anoSelecionado?.ano ?? String(new Date().getFullYear());

  const mesesLetivos = useMemo(() => {
    const nums = config.mesesAnoAcademico;
    if (nums && nums.length > 0) {
      return nums.map(n => ({ num: n, nome: MONTH_NAMES[n] || String(n) }));
    }
    return DEFAULT_MESES_LETIVOS;
  }, [config.mesesAnoAcademico]);

  const [search, setSearch] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [showSearch, setShowSearch] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('propinas');

  const qrSvgRef = useRef<any>(null);
  const searchRef = useRef<any>(null);
  // Stable callback ref for QRCode — avoids creating a new function on every render
  const qrGetRef = useCallback((ref: any) => { qrSvgRef.current = ref; }, []);

  // ── Modal Pagamento Rápido ──────────────────────────────────────────────────
  type MetodoPag = 'dinheiro' | 'multicaixa' | 'transferencia' | 'cartao_multicaixa';
  type ViaPagamento = 'pos' | 'rupe';
  const [pagModal, setPagModal] = useState<{ mes: { num: number; nome: string }; anoMes: string } | null>(null);
  const [pagForm, setPagForm] = useState<{
    valor: string; data: string; metodoPagamento: MetodoPag; referencia: string; observacao: string;
  }>({ valor: '', data: '', metodoPagamento: 'cartao_multicaixa', referencia: '', observacao: '' });
  const [pagVia, setPagVia] = useState<ViaPagamento>('pos');
  const [pagSaving, setPagSaving] = useState(false);
  const [pagError, setPagError] = useState('');
  const [pagSuccess, setPagSuccess] = useState('');
  const [rupeGerado, setRupeGerado] = useState<RUPEGerado | null>(null);
  const [rupeGerando, setRupeGerando] = useState(false);
  const [rupeCopiado, setRupeCopiado] = useState(false);
  const [ibanCopiado, setIbanCopiado] = useState(false);

  useEffect(() => {
    if (!params.alunoId || !alunos.length) return;
    if (selectedAluno && selectedAluno.id === params.alunoId) return;
    const aluno = alunos.find(a => a.id === params.alunoId);
    if (aluno) {
      setSelectedAluno(aluno);
      setSearch(`${aluno.nome} ${aluno.apelido}`);
      setShowSearch(false);
    }
  }, [params.alunoId, alunos]);

  const alunosFiltrados = useMemo(() => {
    if (!search.trim()) return alunos.filter(a => a.ativo).slice(0, 30);
    const s = search.toLowerCase();
    return alunos.filter(a =>
      a.ativo && (
        a.nome.toLowerCase().includes(s) ||
        a.apelido.toLowerCase().includes(s) ||
        a.numeroMatricula.toLowerCase().includes(s)
      )
    ).slice(0, 30);
  }, [alunos, search]);

  const turmaDoAluno = useMemo(() =>
    selectedAluno ? turmas.find(t => t.id === selectedAluno.turmaId) : undefined,
    [selectedAluno, turmas]
  );

  const pagamentosAluno = useMemo(() =>
    selectedAluno ? getPagamentosAluno(selectedAluno.id) : [],
    [selectedAluno, pagamentos]
  );

  const rupesAluno = useMemo(() =>
    selectedAluno ? getRUPEsAluno(selectedAluno.id) : [],
    [selectedAluno, getRUPEsAluno]
  );

  function getRupePendenteMes(mes: number, anoMesStr: string) {
    return rupesAluno.find(r => r.mes === mes && r.ano === anoMesStr && r.status === 'ativo');
  }

  const mesAtualPago = useMemo(() =>
    getMesAtualPago(pagamentosAluno),
    [pagamentosAluno]
  );

  const numeroCaderneta = selectedAluno
    ? `${selectedAluno.numeroMatricula.replace(/\D/g,'').slice(-4).padStart(4,'0')}`
    : '0000';

  const qrValue = selectedAluno
    ? buildQRData(selectedAluno, turmaDoAluno, config.nomeEscola, mesAtualPago)
    : 'QUETA-PROPINAS';

  // Stats — Propinas
  const totalPago = pagamentosAluno.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
  const totalPendente = pagamentosAluno.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
  const mesesPagos = mesesLetivos.filter(m => getStatusMes(m.num, anoLetivo, pagamentosAluno) === 'pago').length;
  const mesesAtraso = mesesLetivos.filter(m => getStatusMes(m.num, anoLetivo, pagamentosAluno) === 'atraso').length;

  // Rubricas (all non-propina taxas for the student's level + academic year)
  const rubricasAluno = useMemo<RubricaItem[]>(() => {
    if (!selectedAluno) return [];
    const nivel = turmaDoAluno?.classe ? `${turmaDoAluno.classe}ª Classe` : '';
    const taxasRubricas = taxas.filter(t =>
      t.tipo !== 'propina' &&
      t.ativo &&
      t.anoAcademico === anoLetivo &&
      (t.nivel === 'Todos' || !nivel || t.nivel === nivel || t.nivel === turmaDoAluno?.classe?.toString())
    );
    return taxasRubricas.map(taxa => {
      const pag = pagamentosAluno.find(p => p.taxaId === taxa.id && p.ano === anoLetivo);
      return { taxa, pagamento: pag };
    });
  }, [selectedAluno, taxas, pagamentosAluno, anoLetivo, turmaDoAluno]);

  // Rubricas stats
  const rubricasPagas = rubricasAluno.filter(r => r.pagamento?.status === 'pago').length;
  const rubricasTotalPago = rubricasAluno.filter(r => r.pagamento?.status === 'pago').reduce((s, r) => s + (r.pagamento?.valor ?? 0), 0);
  const rubricasPendentes = rubricasAluno.filter(r => !r.pagamento || r.pagamento.status !== 'pago').length;

  // Taxa propina para o nível do aluno — usada para pré-preencher o valor
  const taxaPropina = useMemo(() => {
    const nivel = turmaDoAluno?.classe ? `${turmaDoAluno.classe}ª Classe` : '';
    return (
      taxas.find(t => t.tipo === 'propina' && t.ativo !== false && t.nivel === nivel) ??
      taxas.find(t => t.tipo === 'propina' && t.ativo !== false && t.nivel === 'Todos') ??
      taxas.find(t => t.tipo === 'propina' && t.ativo !== false) ??
      null
    );
  }, [taxas, turmaDoAluno, anoLetivo]);

  function handleSelectAluno(aluno: Aluno) {
    setSelectedAluno(aluno);
    setShowSearch(false);
    setSearch(`${aluno.nome} ${aluno.apelido}`);
  }

  // ── Handlers do Modal de Pagamento Rápido ─────────────────────────────────
  function handleOpenPagModal(mes: { num: number; nome: string }) {
    const anoBase = parseInt(anoLetivo.split('/')[0]) || new Date().getFullYear();
    const anoMes = mes.num >= 8 ? anoBase : anoBase + 1;
    const hoje = new Date();
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    setPagForm({
      valor: taxaPropina ? String(taxaPropina.valor) : '',
      data: dataHoje,
      metodoPagamento: 'cartao_multicaixa',
      referencia: '',
      observacao: '',
    });
    setPagVia('pos');
    setRupeGerado(null);
    setRupeCopiado(false);
    setIbanCopiado(false);
    setPagError('');
    setPagSuccess('');
    setPagModal({ mes, anoMes: String(anoMes) });
  }

  function copiarTexto(valor: string, onDone: () => void) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(valor).then(onDone).catch(() => {});
    } else {
      onDone();
    }
  }

  async function handleGerarRupe() {
    if (!pagModal || !selectedAluno) return;
    const valor = parseFloat(pagForm.valor);
    if (!pagForm.valor || isNaN(valor) || valor <= 0) {
      setPagError('Introduza um valor válido.');
      return;
    }
    if (!taxaPropina) {
      setPagError('Taxa de propina não encontrada. Configure as taxas no módulo Financeiro → Taxas.');
      return;
    }
    setPagError('');
    setRupeGerando(true);
    try {
      const rupe = await gerarRUPE(selectedAluno.id, taxaPropina.id, valor, pagModal.mes.num, pagModal.anoMes);
      setRupeGerado(rupe);
      // Criar pagamento pendente para que o mês apareça imediatamente na caderneta
      // como "Em Cobrança". Quando o RUPE for confirmado (polling automático ou
      // verificação manual), confirmarRupeComoPago encontra este registo pela
      // referência e atualiza-o para status='pago'.
      // Deduplicação: só criar se não existir já um registo activo para este mês.
      const jaExistePagamento = pagamentosAluno.some(
        p => p.mes === pagModal.mes.num && p.ano === pagModal.anoMes && p.status !== 'cancelado'
      );
      if (!jaExistePagamento) {
        try {
          await addPagamento({
            alunoId: selectedAluno.id,
            taxaId: taxaPropina.id,
            valor,
            data: new Date().toISOString().split('T')[0],
            mes: pagModal.mes.num,
            ano: pagModal.anoMes,
            status: 'pendente',
            metodoPagamento: 'referencia_bancaria',
            referencia: rupe.referencia,
            observacao: `RUPE gerado — aguarda confirmação de pagamento`,
          } as any);
        } catch (err) {
          // Não bloquear o fluxo do RUPE — o pagamento pendente será criado
          // automaticamente pela confirmação do RUPE quando for pago.
          console.warn('[caderneta] Falha ao criar pagamento pendente após RUPE:', err);
        }
      }
    } catch (e: any) {
      setPagError(e?.message ?? 'Erro ao gerar a referência RUPE. Tente novamente.');
    } finally {
      setRupeGerando(false);
    }
  }

  function handleImprimirRUPE() {
    if (!rupeGerado || !selectedAluno || !pagModal || Platform.OS !== 'web') return;
    const entidade = config.numeroEntidade || rupeGerado.referencia?.split(' ')[0] || '00000';
    const referencia = rupeGerado.referencia || '';
    const valor = pagForm.valor ? parseFloat(pagForm.valor).toFixed(2) : '0.00';
    const nomeAluno = `${selectedAluno.nome} ${selectedAluno.apelido}`.trim();
    const descricao = `Propina — ${pagModal.mes.nome}`;
    const nomeEscola = config.nomeEscola || 'Escola';
    const validade = rupeGerado.dataValidade
      ? new Date(rupeGerado.dataValidade).toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const dataGeracao = rupeGerado.dataGeracao
      ? new Date(rupeGerado.dataGeracao).toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guia de Pagamento RUPE</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; padding: 20px; }
    .slip { background: #fff; width: 210mm; max-width: 100%; border: 1px solid #ccc; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: #0d5c9e; color: #fff; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
    .header-left h1 { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
    .header-left p { font-size: 10px; opacity: 0.8; margin-top: 2px; }
    .header-right { text-align: right; }
    .header-right .badge { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 20px; padding: 4px 12px; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
    .divider-stripe { height: 6px; background: linear-gradient(90deg, #0d5c9e 0%, #1a82d4 50%, #e8a000 100%); }
    .school-bar { background: #f0f7ff; padding: 10px 20px; border-bottom: 1px solid #dde8f5; display: flex; align-items: center; gap: 10px; }
    .school-bar .school-icon { width: 32px; height: 32px; background: #0d5c9e; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; }
    .school-bar .school-name { font-size: 12px; font-weight: 700; color: #1a3a5c; }
    .school-bar .school-sub { font-size: 10px; color: #5a7a9a; }
    .content { padding: 20px; }
    .section-title { font-size: 9px; font-weight: 700; color: #8a9ab0; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #e8eef5; padding-bottom: 6px; }
    .ref-box { background: #f0f7ff; border: 2px solid #0d5c9e; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
    .ref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ref-item label { font-size: 9px; color: #8a9ab0; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 4px; }
    .ref-item .value { font-size: 22px; font-weight: 700; color: #0d5c9e; letter-spacing: 2px; font-family: 'Courier New', monospace; }
    .ref-item .value-sm { font-size: 14px; font-weight: 700; color: #1a3a5c; letter-spacing: 1px; font-family: 'Courier New', monospace; }
    .amount-box { background: #0d5c9e; color: #fff; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .amount-label { font-size: 10px; opacity: 0.8; }
    .amount-value { font-size: 26px; font-weight: 700; font-family: 'Courier New', monospace; }
    .amount-currency { font-size: 14px; opacity: 0.9; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .info-item { background: #f9fafc; border: 1px solid #e8eef5; border-radius: 6px; padding: 8px 12px; }
    .info-item label { font-size: 8.5px; color: #8a9ab0; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 3px; }
    .info-item .val { font-size: 11px; font-weight: 600; color: #1a3a5c; }
    .instructions { background: #fffbf0; border: 1px solid #f0d080; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .instructions h4 { font-size: 10px; font-weight: 700; color: #8a6000; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .instructions ul { list-style: none; padding: 0; }
    .instructions ul li { font-size: 10px; color: #5a4500; padding: 2px 0; padding-left: 14px; position: relative; }
    .instructions ul li::before { content: "✓"; position: absolute; left: 0; color: #e8a000; font-weight: 700; }
    .footer { background: #f0f7ff; border-top: 1px solid #dde8f5; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
    .footer p { font-size: 8.5px; color: #8a9ab0; }
    .footer .gen-date { font-size: 8.5px; color: #8a9ab0; font-weight: 700; }
    .cut-line { border-top: 2px dashed #ccc; margin: 0 16px; padding-top: 14px; }
    .copy { margin-top: 14px; }
    .copy .copy-label { font-size: 9px; color: #8a9ab0; font-weight: 700; letter-spacing: 1px; text-align: center; margin-bottom: 12px; }
    .copy-compact { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: center; padding: 10px 0; }
    .copy-compact .cp-item label { font-size: 8px; color: #8a9ab0; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .copy-compact .cp-item .cpv { font-size: 12px; font-weight: 700; color: #1a3a5c; font-family: 'Courier New', monospace; }
    .stamp-box { border: 2px solid #ccc; border-radius: 6px; padding: 8px 14px; text-align: center; min-width: 100px; }
    .stamp-box p { font-size: 8px; color: #aaa; }
    @media print {
      body { background: #fff; padding: 0; }
      .slip { border: none; border-radius: 0; box-shadow: none; width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
<div class="slip">
  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <h1>GUIA DE PAGAMENTO — MULTICAIXA</h1>
      <p>Referência de Pagamento ao Estabelecimento de Ensino</p>
    </div>
    <div class="header-right">
      <div class="badge">ANGOLA · AOA</div>
    </div>
  </div>
  <div class="divider-stripe"></div>

  <!-- ESCOLA -->
  <div class="school-bar">
    <div class="school-icon">${nomeEscola.charAt(0).toUpperCase()}</div>
    <div>
      <div class="school-name">${nomeEscola}</div>
      <div class="school-sub">Estabelecimento de Ensino Privado</div>
    </div>
  </div>

  <!-- CONTENT -->
  <div class="content">
    <div class="section-title">Dados de Pagamento Multicaixa / ATM</div>

    <!-- REF BOX -->
    <div class="ref-box">
      <div class="ref-grid">
        <div class="ref-item">
          <label>Entidade</label>
          <div class="value">${entidade.toString().padStart(5, '0')}</div>
        </div>
        <div class="ref-item">
          <label>Referência</label>
          <div class="value-sm">${referencia}</div>
        </div>
      </div>
    </div>

    <!-- AMOUNT -->
    <div class="amount-box">
      <div>
        <div class="amount-label">Montante a Pagar</div>
        <div class="amount-value"><span class="amount-currency">Kz </span>${parseFloat(valor).toLocaleString('pt-AO')}</div>
      </div>
      <div style="text-align:right">
        <div class="amount-label">Validade</div>
        <div style="font-size:11px; font-weight:700;">${validade}</div>
      </div>
    </div>

    <!-- INFO GRID -->
    <div class="info-grid">
      <div class="info-item">
        <label>Nome do Aluno</label>
        <div class="val">${nomeAluno}</div>
      </div>
      <div class="info-item">
        <label>Descrição</label>
        <div class="val">${descricao}</div>
      </div>
      <div class="info-item">
        <label>Data de Emissão</label>
        <div class="val">${dataGeracao}</div>
      </div>
      <div class="info-item">
        <label>Estado</label>
        <div class="val" style="color:#e8a000;">⏳ Aguarda Pagamento</div>
      </div>
    </div>

    <!-- INSTRUCTIONS -->
    <div class="instructions">
      <h4>⚠ Instruções de Pagamento</h4>
      <ul>
        <li>Apresente esta guia ao banco ou utilize o número de Entidade e Referência no ATM Multicaixa.</li>
        <li>Pode pagar em qualquer ATM Multicaixa, Multicaixa Express, Internet Banking ou balcão bancário.</li>
        <li>No ATM escolha: <strong>Pagamento de Serviços → Entidade → Referência → Montante</strong>.</li>
        <li>Guarde o comprovativo emitido pelo ATM — será solicitado pela secretaria.</li>
        <li>O montante deve ser exactamente <strong>Kz ${parseFloat(valor).toLocaleString('pt-AO')}</strong>. Valores diferentes serão rejeitados.</li>
        <li>Referência válida até: <strong>${validade}</strong>.</li>
      </ul>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>Sistema de Gestão Académica — SIGA v3 | Documento gerado automaticamente</p>
    <div class="gen-date">Emitido em: ${dataGeracao}</div>
  </div>

  <!-- CÓPIA DO RECIBO (linha de corte) -->
  <div style="padding: 0 20px 16px;">
    <div class="cut-line">
      <div class="copy">
        <div class="copy-label">✂ &nbsp; TALÃO — GUARDAR APÓS PAGAMENTO &nbsp; ✂</div>
        <div class="copy-compact">
          <div class="cp-item"><label>Entidade</label><div class="cpv">${entidade.toString().padStart(5, '0')}</div></div>
          <div class="cp-item"><label>Referência</label><div class="cpv">${referencia}</div></div>
          <div class="cp-item"><label>Montante</label><div class="cpv">Kz ${parseFloat(valor).toLocaleString('pt-AO')}</div></div>
          <div class="stamp-box"><p>Carimbo / Assinatura</p></div>
        </div>
      </div>
    </div>
  </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }

  async function handleSubmitPag() {
    if (!pagModal || !selectedAluno) return;
    const valor = parseFloat(pagForm.valor);
    if (!pagForm.valor || isNaN(valor) || valor <= 0) {
      setPagError('Introduza um valor válido.');
      return;
    }
    if (!pagForm.data) {
      setPagError('A data de pagamento é obrigatória.');
      return;
    }
    if (!taxaPropina) {
      setPagError('Taxa de propina não encontrada. Configure as taxas no módulo Financeiro → Taxas.');
      return;
    }
    setPagSaving(true);
    setPagError('');
    try {
      await addPagamento({
        alunoId: selectedAluno.id,
        taxaId: taxaPropina.id,
        valor,
        data: pagForm.data,
        mes: pagModal.mes.num,
        ano: pagModal.anoMes,
        status: 'pago',
        metodoPagamento: pagVia === 'pos' ? 'cartao_multicaixa' : 'multicaixa',
        referencia: pagForm.referencia || undefined,
        observacao: pagForm.observacao || undefined,
      } as any);
      setPagSuccess(`Pagamento de ${pagModal.mes.nome} registado com sucesso!`);
      setTimeout(() => { setPagModal(null); setPagSuccess(''); }, 1800);
    } catch (e: any) {
      setPagError(e?.message ?? 'Erro ao registar o pagamento. Tente novamente.');
    } finally {
      setPagSaving(false);
    }
  }

  async function handlePrint() {
    if (!selectedAluno || Platform.OS !== 'web') return;
    setPrinting(true);

    // Gerar QR como data URL PNG usando o pacote 'qrcode' (funciona no browser)
    let qrDataUrlForPrint = '';
    try {
      const QRLib = await import('qrcode');
      const qrText = buildQRData(selectedAluno, turmaDoAluno, config.nomeEscola, mesAtualPago);
      qrDataUrlForPrint = await QRLib.default.toDataURL(qrText, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch (e) {
      console.warn('[QR] Erro ao gerar QR data URL:', e);
    }

    let html: string;
    if (activeTab === 'rubricas') {
      html = generateCadernetaRubricasHTML(
        selectedAluno, turmaDoAluno, config.nomeEscola,
        rubricasAluno, anoLetivo
      );
    } else if (activeTab === 'combinado') {
      html = generateCombinedCadernetaHTML(
        selectedAluno, turmaDoAluno, config.nomeEscola,
        pagamentosAluno, rubricasAluno, anoLetivo, qrDataUrlForPrint, numeroCaderneta, mesesLetivos, selectedAluno.foto ?? undefined
      );
    } else {
      html = generateCadernetaHTML(
        selectedAluno, turmaDoAluno, config.nomeEscola,
        pagamentosAluno, anoLetivo, qrDataUrlForPrint, numeroCaderneta, mesesLetivos, selectedAluno.foto ?? undefined
      );
    }
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    }
    setPrinting(false);
  }

  const TABS_DEF: { key: ActiveTab; label: string; icon: string }[] = [
    { key: 'propinas',  label: 'Propinas',  icon: 'calendar' },
    { key: 'rubricas',  label: 'Rubricas',  icon: 'receipt-outline' },
    { key: 'combinado', label: 'Combinado', icon: 'layers-outline' },
  ];

  const printBtnLabel = activeTab === 'rubricas'
    ? 'Imprimir Caderneta de Rubricas'
    : activeTab === 'combinado'
    ? 'Imprimir Caderneta Completa'
    : 'Imprimir Caderneta de Propinas';

  // Initials avatar helper
  const initials = selectedAluno
    ? `${selectedAluno.nome.charAt(0)}${selectedAluno.apelido.charAt(0)}`.toUpperCase()
    : '';

  // Progress bar for months
  const progressPct = mesesLetivos.length > 0 ? mesesPagos / mesesLetivos.length : 0;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      <TopBar title="Caderneta de Propinas / Rubricas" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Pesquisa de Aluno ── */}
        <View style={styles.searchCard}>
          <View style={styles.searchCardHeader}>
            <View style={styles.searchIconWrap}>
              <Ionicons name="person-circle-outline" size={20} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.searchCardTitle}>Seleccionar Aluno</Text>
              <Text style={styles.searchCardSub}>Pesquise por nome ou número de matrícula</Text>
            </View>
          </View>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={{ marginLeft: 2 }} />
            <StableSearchInput
              ref={searchRef}
              value={search}
              onChangeText={v => { setSearch(v); setShowSearch(true); }}
              inputStyle={[styles.searchInput, !!selectedAluno && { color: Colors.textMuted }]}
              placeholder="Ex: João Silva ou 2025001..."
              iconColor="transparent"
              editable={!selectedAluno}
            />
            {selectedAluno && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedAluno(null);
                  setSearch('');
                  setShowSearch(true);
                  setTimeout(() => searchRef.current?.focus(), 100);
                }}
                style={styles.trocarBtn}
              >
                <Ionicons name="swap-horizontal" size={13} color={Colors.accent} />
                <Text style={styles.trocarBtnText}>Trocar</Text>
              </TouchableOpacity>
            )}
          </View>
          {showSearch && search.length > 0 && (
            <View style={styles.dropdownContainer}>
              <FlatList
                data={alunosFiltrados}
                keyExtractor={a => a.id}
                style={styles.dropdown}
                renderItem={({ item }) => {
                  const t = turmas.find(t => t.id === item.turmaId);
                  const ini = `${item.nome.charAt(0)}${item.apelido.charAt(0)}`.toUpperCase();
                  return (
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => handleSelectAluno(item)}>
                      <View style={styles.dropdownAvatar}>
                        <Text style={styles.dropdownAvatarText}>{ini}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropdownName}>{item.nome} {item.apelido}</Text>
                        <Text style={styles.dropdownSub}>{item.numeroMatricula}{t ? ` · ${t.nome}` : ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.dropdownEmpty}>
                    <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
                    <Text style={styles.emptyDropdown}>Nenhum aluno encontrado</Text>
                  </View>
                }
              />
            </View>
          )}
        </View>

        {selectedAluno ? (
          <>
            {/* ── Hero Card do Aluno ── */}
            <View style={styles.heroCard}>
              <View style={styles.heroAccentBar} />
              <View style={styles.heroBody}>
                <View style={styles.heroLeft}>
                  <View style={styles.heroAvatar}>
                    <Text style={styles.heroAvatarText}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroNome}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
                    <Text style={styles.heroMatricula}>Nº {selectedAluno.numeroMatricula}</Text>
                    <View style={styles.heroTagsRow}>
                      {turmaDoAluno?.classe ? (
                        <View style={styles.heroTag}>
                          <Text style={styles.heroTagText}>{turmaDoAluno.classe}ª Classe</Text>
                        </View>
                      ) : null}
                      {turmaDoAluno?.nome ? (
                        <View style={styles.heroTag}>
                          <Text style={styles.heroTagText}>{turmaDoAluno.nome}</Text>
                        </View>
                      ) : null}
                      {turmaDoAluno?.turno ? (
                        <View style={styles.heroTag}>
                          <Text style={styles.heroTagText}>{turmaDoAluno.turno}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.heroMetaRow}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.heroMeta}>Ano Lectivo {anoLetivo}</Text>
                      {turmaDoAluno?.sala ? (
                        <>
                          <Text style={styles.heroMetaDot}>·</Text>
                          <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                          <Text style={styles.heroMeta}>Sala {turmaDoAluno.sala}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>
                {/* QR Code */}
                <View style={styles.heroQr}>
                  <View style={[styles.qrBox, { borderColor: mesAtualPago ? Colors.success : Colors.danger }]}>
                    <QRCode
                      value={qrValue}
                      size={72}
                      getRef={qrGetRef}
                      backgroundColor="#fff"
                      color="#000"
                    />
                  </View>
                  <View style={[styles.qrBadge, {
                    backgroundColor: mesAtualPago ? Colors.success + '22' : Colors.danger + '22',
                    borderColor: mesAtualPago ? Colors.success : Colors.danger,
                  }]}>
                    <Ionicons name={mesAtualPago ? 'checkmark-circle' : 'alert-circle'} size={10} color={mesAtualPago ? Colors.success : Colors.danger} />
                    <Text style={[styles.qrBadgeText, { color: mesAtualPago ? Colors.success : Colors.danger }]}>
                      {mesAtualPago ? 'LIQUIDADO' : 'VENCIDO'}
                    </Text>
                  </View>
                </View>
              </View>
              {/* Encarregado */}
              <View style={styles.heroEncRow}>
                <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.heroEncText}>
                  {selectedAluno.nomeEncarregado}
                  {selectedAluno.telefoneEncarregado ? ` · ${selectedAluno.telefoneEncarregado}` : ''}
                </Text>
              </View>
            </View>

            {/* ── Tabs + Acções ── */}
            <View style={styles.actionBar}>
              <View style={styles.tabPill}>
                {TABS_DEF.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tabPillBtn, activeTab === t.key && styles.tabPillBtnActive]}
                    onPress={() => setActiveTab(t.key)}
                  >
                    <Ionicons name={t.icon as any} size={13} color={activeTab === t.key ? '#fff' : Colors.textMuted} />
                    <Text style={[styles.tabPillText, activeTab === t.key && styles.tabPillTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.printBtn, printing && styles.printBtnDisabled]}
                  onPress={handlePrint}
                  disabled={printing}
                >
                  {printing
                    ? <AppLoader color="#fff" size="small" />
                    : <Ionicons name="print-outline" size={15} color="#fff" />
                  }
                  <Text style={styles.printBtnText}>
                    {printing ? 'A preparar...' : printBtnLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Conteúdo — Propinas ── */}
            {(activeTab === 'propinas' || activeTab === 'combinado') && (<>

              {/* Stats 2×2 */}
              <View style={styles.statsGrid}>
                <StatCard2 value={`${mesesPagos}/${mesesLetivos.length}`} label="Liquidados" color={Colors.success} icon="checkmark-circle" />
                <StatCard2 value={String(mesesAtraso)} label="Vencidos" color={Colors.danger} icon="alert-circle" />
                <StatCard2 value={formatAOA(totalPago)} label="Total Liquidado" color={Colors.info} icon="cash" small />
                <StatCard2 value={formatAOA(totalPendente)} label="Pendente" color={Colors.warning} icon="time" small />
              </View>

              {/* Saldo em Conta */}
              {(() => {
                const saldoInfo = selectedAluno ? getSaldoAluno(selectedAluno.id) : null;
                if (!saldoInfo || saldoInfo.saldo <= 0) return null;
                return (
                  <View style={styles.saldoCard}>
                    <View style={styles.saldoIconWrap}>
                      <Ionicons name="wallet" size={22} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.saldoLabel}>Saldo em Conta (crédito)</Text>
                      <Text style={styles.saldoValor}>{formatAOA(saldoInfo.saldo)}</Text>
                      {saldoInfo.observacoes ? (
                        <Text style={styles.saldoObs}>{saldoInfo.observacoes}</Text>
                      ) : null}
                    </View>
                    {saldoInfo.dataProximaCobranca ? (
                      <View style={styles.saldoNext}>
                        <Text style={styles.saldoNextLabel}>Próxima cobrança</Text>
                        <Text style={styles.saldoNextData}>{saldoInfo.dataProximaCobranca}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })()}

              {/* Grelha de Meses com Barra de Progresso */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar" size={16} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Propinas — {anoLetivo}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.progressLabel}>{mesesPagos}/{mesesLetivos.length} meses</Text>
                </View>

                {/* Barra de progresso */}
                <View style={styles.progressBarWrap}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
                  </View>
                  <Text style={styles.progressPct}>{Math.round(progressPct * 100)}%</Text>
                </View>

                <View style={styles.mesesGrid}>
                  {mesesLetivos.map(mes => {
                    const status = getStatusMes(mes.num, anoLetivo, pagamentosAluno);
                    const pag = getPagamento(mes.num, anoLetivo, pagamentosAluno);
                    const cfg = STATUS_CFG[status];
                    const isMesAtual = new Date().getMonth() + 1 === mes.num;
                    const rupePendente = !pag ? getRupePendenteMes(mes.num, getAnoMesStr(mes.num, anoLetivo)) : undefined;
                    return (
                      <View
                        key={mes.num}
                        style={[
                          styles.mesCard,
                          { borderColor: cfg.color + '88', backgroundColor: cfg.bg },
                          isMesAtual && styles.mesCardAtual,
                        ]}
                      >
                        {/* Faixa de cor no topo */}
                        <View style={[styles.mesTopStripe, { backgroundColor: cfg.color }]} />
                        <View style={styles.mesHeaderRow}>
                          <Text style={[styles.mesNome, { color: cfg.color }]}>{mes.nome.slice(0, 3)}</Text>
                          <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                        </View>
                        {isMesAtual && (
                          <View style={styles.mesActualPill}>
                            <Text style={styles.mesActualText}>ACTUAL</Text>
                          </View>
                        )}
                        <Text style={[styles.mesStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                        {pag ? (
                          <>
                            <Text style={styles.mesData}>{formatDate(pag.data)}</Text>
                            <Text style={styles.mesValor}>{formatAOA(pag.valor)}</Text>
                            {pag.metodoPagamento ? (
                              <Text style={styles.mesMetodo}>{pag.metodoPagamento}</Text>
                            ) : null}
                            {status === 'pago' && Platform.OS === 'web' && (
                              <TouchableOpacity
                                onPress={() => openPdfInTab(`/api/pdf/recibo/${pag.id}`)}
                                style={styles.mesReciboBtn}
                              >
                                <Ionicons name="receipt-outline" size={9} color={Colors.success} />
                                <Text style={styles.mesReciboBtnText}>Recibo</Text>
                              </TouchableOpacity>
                            )}
                          </>
                        ) : (
                          <>
                            <Text style={styles.mesPendente}>
                              {status === 'futuro' ? 'Não venceu' : 'Sem pagto.'}
                            </Text>
                            {rupePendente && (
                              <View style={styles.mesRupePendentePill}>
                                <Ionicons name="hourglass-outline" size={9} color={Colors.info ?? Colors.warning} />
                                <Text style={styles.mesRupePendenteText}>RUPE p/ confirmar</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Legenda */}
                <View style={styles.legenda}>
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <View key={k} style={styles.legendaItem}>
                      <View style={[styles.legendaDot, { backgroundColor: v.color }]} />
                      <Text style={[styles.legendaText, { color: v.color }]}>{v.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Info do Aluno — colapsável em grid */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                  <Text style={styles.cardTitle}>Dados do Documento</Text>
                </View>
                <View style={styles.infoGrid}>
                  {[
                    { label: 'Nº Matrícula',    value: selectedAluno.numeroMatricula },
                    { label: 'Classe',           value: turmaDoAluno?.classe ? `${turmaDoAluno.classe}ª` : '—' },
                    { label: 'Turma',            value: turmaDoAluno?.nome ?? '—' },
                    { label: 'Turno',            value: turmaDoAluno?.turno ?? '—' },
                    { label: 'Sala',             value: turmaDoAluno?.sala ?? '—' },
                    { label: 'Ano Lectivo',      value: anoLetivo },
                    { label: 'Encarregado',      value: selectedAluno.nomeEncarregado },
                    { label: 'Telefone Enc.',    value: selectedAluno.telefoneEncarregado },
                    { label: 'Escola',           value: config.nomeEscola },
                    { label: 'Meses em atraso',  value: String(mesesAtraso) },
                  ].map(v => (
                    <View key={v.label} style={styles.infoCell}>
                      <Text style={styles.infoCellLabel}>{v.label}</Text>
                      <Text style={styles.infoCellValue}>{v.value || '—'}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.obsBox}>
                  <Ionicons name="information-circle" size={13} color={Colors.textMuted} />
                  <Text style={styles.obsText}>
                    Conserve a caderneta e apresente-a no acto do pagamento. As propinas são pagas de 1 a 30 de cada mês.
                  </Text>
                </View>
              </View>
            </>)}

            {/* ── Conteúdo — Rubricas ── */}
            {(activeTab === 'rubricas' || activeTab === 'combinado') && (<>
              {/* Separador visual no modo combinado */}
              {activeTab === 'combinado' && (
                <View style={styles.combinadoSep}>
                  <View style={styles.combinadoLine} />
                  <View style={styles.combinadoSepPill}>
                    <Ionicons name="receipt-outline" size={11} color="#7C3AED" />
                    <Text style={styles.combinadoSepText}>RUBRICAS / TAXAS</Text>
                  </View>
                  <View style={styles.combinadoLine} />
                </View>
              )}

              {/* Stats Rubricas */}
              <View style={styles.statsGrid}>
                <StatCard2 value={`${rubricasPagas}/${rubricasAluno.length}`} label="Pagas" color={Colors.success} icon="checkmark-circle" />
                <StatCard2 value={String(rubricasPendentes)} label="Por Pagar" color={Colors.danger} icon="alert-circle" />
                <StatCard2 value={formatAOA(rubricasTotalPago)} label="Total Liquidado" color={Colors.info} icon="cash" small />
                <StatCard2 value={String(rubricasAluno.length)} label="Total Rubricas" color="#7C3AED" icon="receipt-outline" />
              </View>

              {/* Lista de Rubricas */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="receipt-outline" size={16} color="#7C3AED" />
                  <Text style={styles.cardTitle}>Rubricas — {anoLetivo}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={styles.rubricaCountBadge}>
                    <Text style={styles.rubricaCountText}>{rubricasAluno.length}</Text>
                  </View>
                </View>

                {rubricasAluno.length === 0 ? (
                  <View style={styles.rubricasEmpty}>
                    <View style={styles.rubricasEmptyIcon}>
                      <Ionicons name="document-outline" size={28} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.rubricasEmptyTitle}>Sem rubricas configuradas</Text>
                    <Text style={styles.rubricasEmptyText}>
                      Configure as taxas no módulo Financeiro → Taxas para este nível e ano lectivo.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.rubricasList}>
                    {rubricasAluno.map((r, idx) => {
                      const pago = r.pagamento?.status === 'pago';
                      const temPagamento = !!r.pagamento;
                      const accentColor = TIPO_RUBRICA_COLORS[r.taxa.tipo] ?? Colors.accent;
                      const statusLabel = pago ? 'Liquidado' : temPagamento ? 'Em Cobrança' : 'Sem registo';
                      const statusColor = pago ? Colors.success : temPagamento ? Colors.warning : Colors.textMuted;
                      const statusIcon = pago ? 'checkmark-circle' : temPagamento ? 'time' : 'ellipse-outline';
                      return (
                        <View key={r.taxa.id} style={[styles.rubricaCard, { borderLeftColor: accentColor }, idx > 0 && styles.rubricaCardGap]}>
                          <View style={styles.rubricaHeader}>
                            <View style={[styles.rubricaIconBox, { backgroundColor: accentColor + '20' }]}>
                              <Ionicons name={(TIPO_RUBRICA_ICONS[r.taxa.tipo] ?? 'cash-outline') as any} size={16} color={accentColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rubricaTipo}>{TIPO_RUBRICA_LABELS[r.taxa.tipo] ?? r.taxa.tipo}</Text>
                              <Text style={styles.rubricaDesc} numberOfLines={1}>{r.taxa.descricao}</Text>
                            </View>
                            <View style={[styles.rubricaStatusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '66' }]}>
                              <Ionicons name={statusIcon as any} size={10} color={statusColor} />
                              <Text style={[styles.rubricaStatusText, { color: statusColor }]}>{statusLabel}</Text>
                            </View>
                          </View>
                          <View style={styles.rubricaBody}>
                            <View style={styles.rubricaRow}>
                              <Text style={styles.rubricaLabel}>Frequência</Text>
                              <Text style={styles.rubricaVal}>{FREQUENCIA_LABELS[r.taxa.frequencia] ?? r.taxa.frequencia}</Text>
                            </View>
                            <View style={styles.rubricaRow}>
                              <Text style={styles.rubricaLabel}>Valor previsto</Text>
                              <Text style={[styles.rubricaVal, { fontFamily: 'Inter_600SemiBold' }]}>{formatAOA(r.taxa.valor)}</Text>
                            </View>
                            {r.pagamento && (<>
                              <View style={styles.rubricaRow}>
                                <Text style={styles.rubricaLabel}>Data pagamento</Text>
                                <Text style={styles.rubricaVal}>{formatDate(r.pagamento.data)}</Text>
                              </View>
                              <View style={styles.rubricaRow}>
                                <Text style={styles.rubricaLabel}>Valor pago</Text>
                                <Text style={[styles.rubricaVal, { color: Colors.success, fontFamily: 'Inter_600SemiBold' }]}>{formatAOA(r.pagamento.valor)}</Text>
                              </View>
                              <View style={styles.rubricaRow}>
                                <Text style={styles.rubricaLabel}>Método</Text>
                                <Text style={styles.rubricaVal}>{r.pagamento.metodoPagamento}</Text>
                              </View>
                              {r.pagamento.referencia ? (
                                <View style={styles.rubricaRow}>
                                  <Text style={styles.rubricaLabel}>Referência</Text>
                                  <Text style={styles.rubricaVal}>{r.pagamento.referencia}</Text>
                                </View>
                              ) : null}
                              {pago && Platform.OS === 'web' && (
                                <TouchableOpacity onPress={() => openPdfInTab(`/api/pdf/recibo/${r.pagamento!.id}`)} style={styles.mesReciboBtn}>
                                  <Ionicons name="receipt-outline" size={10} color={Colors.success} />
                                  <Text style={styles.mesReciboBtnText}>Recibo PDF</Text>
                                </TouchableOpacity>
                              )}
                            </>)}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={36} color={Colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Seleccione um aluno</Text>
            <Text style={styles.emptyText}>
              Pesquise pelo nome ou número de matrícula para visualizar a Caderneta de Propinas e Rubricas.
            </Text>
            <View style={styles.emptyHints}>
              {[
                { icon: 'calendar-outline', text: 'Propinas mensais com status por mês' },
                { icon: 'receipt-outline',  text: 'Rubricas e taxas do ano lectivo' },
                { icon: 'print-outline',    text: 'Impressão em PDF formato caderneta' },
              ].map(h => (
                <View key={h.text} style={styles.emptyHintRow}>
                  <View style={styles.emptyHintIcon}>
                    <Ionicons name={h.icon as any} size={14} color={Colors.accent} />
                  </View>
                  <Text style={styles.emptyHintText}>{h.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Modal de Pagamento — Bottom Sheet Moderno ──────────────────────── */}
      <Modal
        visible={!!pagModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!pagSaving) setPagModal(null); }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { if (!pagSaving) setPagModal(null); }} />

          <View style={styles.modalSheet}>
            {/* Handle bar */}
            <View style={styles.modalHandle} />

            {/* ─── Estado de Sucesso ─── */}
            {pagSuccess ? (
              <View style={styles.modalSuccessState}>
                <View style={styles.modalSuccessCircle}>
                  <Ionicons name="checkmark" size={40} color="#fff" />
                </View>
                <Text style={styles.modalSuccessTitle}>Pagamento Registado!</Text>
                <Text style={styles.modalSuccessMsg}>{pagSuccess}</Text>
              </View>
            ) : (
              <>
                {/* ─── Hero: identidade do pagamento ─── */}
                <View style={styles.modalHero}>
                  <View style={styles.modalHeroLeft}>
                    <Text style={styles.modalHeroLabel}>PROPINA</Text>
                    <Text style={styles.modalHeroMonth}>{pagModal?.mes.nome}</Text>
                    <View style={styles.modalHeroStudentPill}>
                      <Ionicons name="person" size={10} color="#fff" style={{ opacity: 0.75 }} />
                      <Text style={styles.modalHeroStudentText} numberOfLines={1}>
                        {selectedAluno?.nome} {selectedAluno?.apelido}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.modalHeroRight}>
                    <Text style={styles.modalHeroAmountLabel}>Valor a pagar</Text>
                    <View style={styles.modalHeroAmountRow}>
                      <Text style={styles.modalHeroAmountCurrency}>Kz</Text>
                      <TextInput
                        style={styles.modalHeroAmountInput}
                        keyboardType="numeric"
                        value={pagForm.valor}
                        onChangeText={v => setPagForm(f => ({ ...f, valor: v }))}
                        editable={!pagSaving}
                        selectTextOnFocus
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        placeholder="0"
                      />
                    </View>
                    {taxaPropina && (
                      <Text style={styles.modalHeroAmountHint}>
                        Taxa: {formatAOA(taxaPropina.valor)}
                      </Text>
                    )}
                  </View>
                  {!pagSaving && (
                    <TouchableOpacity onPress={() => setPagModal(null)} style={styles.modalHeroClose}>
                      <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* ─── Corpo do formulário ─── */}
                <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">

                  {/* Via de pagamento */}
                  <Text style={styles.modalSectionLabel}>Como pretende pagar?</Text>
                  <View style={styles.modalViaGrid}>
                    {([
                      { key: 'pos'  as ViaPagamento, label: 'Cartão Multicaixa', desc: 'POS / terminal',   icon: 'card',    color: '#059669', bg: '#ECFDF5' },
                      { key: 'rupe' as ViaPagamento, label: 'Referência RUPE',   desc: 'Multicaixa / ATM', icon: 'barcode', color: '#7C3AED', bg: '#F5F3FF' },
                    ]).map(m => {
                      const active = pagVia === m.key;
                      return (
                        <TouchableOpacity
                          key={m.key}
                          style={[
                            styles.modalViaCard,
                            { borderColor: active ? m.color : Colors.border },
                            active && { backgroundColor: m.bg, borderWidth: 2 },
                          ]}
                          onPress={() => { setPagVia(m.key); setPagError(''); }}
                          disabled={pagSaving || rupeGerando}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.modalViaIconBox, { backgroundColor: active ? m.color : Colors.backgroundCard }]}>
                            <Ionicons name={m.icon as any} size={20} color={active ? '#fff' : Colors.textMuted} />
                          </View>
                          <Text style={[styles.modalViaCardLabel, active && { color: m.color, fontFamily: 'Inter_700Bold' }]}>
                            {m.label}
                          </Text>
                          <Text style={styles.modalViaCardDesc}>{m.desc}</Text>
                          {active && (
                            <View style={[styles.modalMetodoCheck, { backgroundColor: m.color }]}>
                              <Ionicons name="checkmark" size={8} color="#fff" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {pagVia === 'pos' ? (
                    <>
                      {/* POS / Cartão Multicaixa */}
                      <View style={styles.posInfoBox}>
                        <Ionicons name="card" size={16} color="#059669" />
                        <Text style={styles.posInfoText}>
                          O aluno paga presencialmente com cartão Multicaixa no terminal POS da escola.
                          Confirme após passar o cartão e obter o comprovativo.
                        </Text>
                      </View>

                      {/* Data */}
                      <Text style={styles.modalSectionLabel}>Data do pagamento</Text>
                      <View style={styles.modalDateRow}>
                        <View style={styles.modalDateIcon}>
                          <Ionicons name="calendar" size={16} color={Colors.accent} />
                        </View>
                        <TextInput
                          style={styles.modalDateInput}
                          placeholder="AAAA-MM-DD"
                          placeholderTextColor={Colors.textMuted}
                          value={pagForm.data}
                          onChangeText={v => setPagForm(f => ({ ...f, data: v }))}
                          editable={!pagSaving}
                          maxLength={10}
                          {...(Platform.OS === 'web' ? { type: 'date' } as any : {})}
                        />
                      </View>

                      {/* Nº comprovativo POS */}
                      <Text style={styles.modalSectionLabel}>Nº Comprovativo POS <Text style={styles.modalOptionalTag}>(opcional)</Text></Text>
                      <View style={styles.modalInlineInput}>
                        <Ionicons name="receipt-outline" size={15} color={Colors.textMuted} />
                        <TextInput
                          style={styles.modalInlineText}
                          placeholder="Ex: 000123456"
                          placeholderTextColor={Colors.textMuted}
                          value={pagForm.referencia}
                          onChangeText={v => setPagForm(f => ({ ...f, referencia: v }))}
                          editable={!pagSaving}
                          keyboardType="default"
                        />
                      </View>

                      {/* Observação */}
                      <Text style={styles.modalSectionLabel}>Observação <Text style={styles.modalOptionalTag}>(opcional)</Text></Text>
                      <TextInput
                        style={styles.modalTextarea}
                        placeholder="Notas adicionais..."
                        placeholderTextColor={Colors.textMuted}
                        value={pagForm.observacao}
                        onChangeText={v => setPagForm(f => ({ ...f, observacao: v }))}
                        multiline
                        numberOfLines={2}
                        editable={!pagSaving}
                      />
                    </>
                  ) : (
                    <>
                      {/* Referência RUPE */}
                      {!rupeGerado ? (
                        <View style={styles.rupeInfoBox}>
                          <Ionicons name="information-circle" size={16} color="#7C3AED" />
                          <Text style={styles.rupeInfoText}>
                            A referência é gerada automaticamente com base no Bilhete de Identidade do aluno.
                            Pode ser paga em qualquer ATM, Multicaixa Express ou balcão bancário.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.modalGenRupeBox}>
                          <View style={styles.rupeBoxHeader2}>
                            <Ionicons name="barcode" size={14} color="#7C3AED" />
                            <Text style={styles.rupeBoxLabel2}>REFERÊNCIA GERADA</Text>
                          </View>
                          <View style={styles.rupeBoxRow2}>
                            <Text style={styles.rupeBoxValue2} selectable numberOfLines={1}>{rupeGerado.referencia}</Text>
                            <TouchableOpacity
                              style={styles.rupeCopyBtn2}
                              onPress={() => copiarTexto(rupeGerado.referencia, () => { setRupeCopiado(true); setTimeout(() => setRupeCopiado(false), 1800); })}
                            >
                              <Ionicons name={rupeCopiado ? 'checkmark' : 'copy-outline'} size={12} color="#7C3AED" />
                              <Text style={styles.rupeCopyTxt2}>{rupeCopiado ? 'Copiado' : 'Copiar'}</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                            {config.numeroEntidade && (
                              <Text style={styles.rupeDate2}>Entidade: {config.numeroEntidade}</Text>
                            )}
                            <Text style={styles.rupeDate2}>Validade: {rupeGerado.dataValidade}</Text>
                          </View>
                          <Text style={styles.rupeStatusHint}>
                            O pagamento fica pendente até ser confirmado após o depósito.
                          </Text>

                          {/* Nº Comprovativo ATM */}
                          <Text style={[styles.modalSectionLabel, { marginTop: 10 }]}>
                            Nº Comprovativo ATM <Text style={styles.modalOptionalTag}>(opcional)</Text>
                          </Text>
                          <View style={styles.modalInlineInput}>
                            <Ionicons name="receipt-outline" size={15} color={Colors.textMuted} />
                            <TextInput
                              style={styles.modalInlineText}
                              placeholder="Ex: 00123456789"
                              placeholderTextColor={Colors.textMuted}
                              value={pagForm.referencia}
                              onChangeText={v => setPagForm(f => ({ ...f, referencia: v }))}
                              editable={!pagSaving}
                              keyboardType="default"
                            />
                          </View>

                          {/* Observação */}
                          <Text style={[styles.modalSectionLabel, { marginTop: 6 }]}>
                            Observação <Text style={styles.modalOptionalTag}>(opcional)</Text>
                          </Text>
                          <TextInput
                            style={styles.modalTextarea}
                            placeholder="Notas adicionais..."
                            placeholderTextColor={Colors.textMuted}
                            value={pagForm.observacao}
                            onChangeText={v => setPagForm(f => ({ ...f, observacao: v }))}
                            multiline
                            numberOfLines={2}
                            editable={!pagSaving}
                          />

                          {/* Confirmação automática via polling EMIS — sem verificação manual */}
                          <View style={[styles.rupeInfoBox, { marginTop: 8, backgroundColor: '#F5F3FF' }]}>
                            <Ionicons name="time-outline" size={14} color="#7C3AED" />
                            <Text style={[styles.rupeInfoText, { color: '#5B21B6' }]}>
                              O sistema confirma o pagamento automaticamente após o depósito no ATM/Multicaixa.
                            </Text>
                          </View>

                          {Platform.OS === 'web' && (
                            <TouchableOpacity
                              style={[styles.rupePrintBtn, { marginTop: 4 }]}
                              onPress={handleImprimirRUPE}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="print-outline" size={13} color="#7C3AED" />
                              <Text style={styles.rupePrintBtnText}>Imprimir Guia de Pagamento</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </>
                  )}

                  {/* Erro */}
                  {!!pagError && (
                    <View style={styles.modalErrorBox}>
                      <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                      <Text style={styles.modalErrorText}>{pagError}</Text>
                    </View>
                  )}
                </ScrollView>

                {/* ─── Botão CTA ─── */}
                <View style={styles.modalCTA}>
                  {pagVia === 'pos' ? (
                    <TouchableOpacity
                      style={[
                        styles.modalConfirmBtn,
                        { backgroundColor: '#059669' },
                        pagSaving && { opacity: 0.65 },
                      ]}
                      onPress={handleSubmitPag}
                      disabled={pagSaving}
                      activeOpacity={0.85}
                    >
                      {pagSaving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="card" size={20} color="#fff" />
                      )}
                      <Text style={styles.modalConfirmBtnText}>
                        {pagSaving
                          ? 'A processar…'
                          : `Confirmar${pagForm.valor ? ' ' + formatAOA(parseFloat(pagForm.valor) || 0) : ''}`}
                      </Text>
                    </TouchableOpacity>
                  ) : !rupeGerado ? (
                    <TouchableOpacity
                      style={[styles.modalConfirmBtn, { backgroundColor: '#7C3AED' }, rupeGerando && { opacity: 0.65 }]}
                      onPress={handleGerarRupe}
                      disabled={rupeGerando}
                      activeOpacity={0.85}
                    >
                      {rupeGerando ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="barcode" size={20} color="#fff" />
                      )}
                      <Text style={styles.modalConfirmBtnText}>
                        {rupeGerando ? 'A gerar referência…' : 'Gerar Referência RUPE'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.modalConfirmBtn, { backgroundColor: '#7C3AED' }]}
                      onPress={() => setPagModal(null)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.modalConfirmBtnText}>Concluído</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard2({
  value, label, color, icon, small,
}: {
  value: string; label: string; color: string; icon: string; small?: boolean;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color, fontSize: small ? 11 : 15 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  // ── Search Card ──
  searchCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  searchCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  searchIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  searchCardTitle: { color: Colors.text, fontSize: 14, fontFamily: 'Inter_700Bold' },
  searchCardSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, gap: 6,
  },
  searchInput: {
    flex: 1, color: Colors.text, fontSize: 14,
    fontFamily: 'Inter_400Regular', paddingVertical: 10,
  },
  clearBtn: { padding: 4 },
  trocarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: Colors.accent + '18', borderRadius: 6,
    borderWidth: 1, borderColor: Colors.accent + '40',
  },
  trocarBtnText: { fontSize: 11, color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  dropdownContainer: {
    marginTop: 6, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, overflow: 'hidden', maxHeight: 240,
    backgroundColor: Colors.backgroundElevated,
  },
  dropdown: { flex: 1 },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.border + '66', gap: 10,
  },
  dropdownAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.accent + '28',
    alignItems: 'center', justifyContent: 'center',
  },
  dropdownAvatarText: { color: Colors.accent, fontSize: 12, fontFamily: 'Inter_700Bold' },
  dropdownName: { color: Colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dropdownSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  dropdownEmpty: { alignItems: 'center', gap: 6, padding: 20 },
  emptyDropdown: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' },

  // ── Hero Card ──
  heroCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  heroAccentBar: { height: 4, backgroundColor: Colors.accent },
  heroBody: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  heroLeft: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  heroAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accent + '22',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroAvatarText: { color: Colors.accent, fontSize: 16, fontFamily: 'Inter_700Bold' },
  heroNome: { color: Colors.text, fontSize: 15, fontFamily: 'Inter_700Bold', lineHeight: 20 },
  heroMatricula: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 1 },
  heroTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  heroTag: {
    backgroundColor: Colors.accent + '18', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  heroTagText: { color: Colors.accent, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  heroMetaDot: { color: Colors.textMuted, fontSize: 11 },
  heroMeta: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' },
  heroQr: { alignItems: 'center', gap: 5, flexShrink: 0 },
  heroEncRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingBottom: 12, marginTop: -4,
  },
  heroEncText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },

  // ── QR ──
  qrBox: { borderWidth: 2, borderRadius: 8, padding: 3, backgroundColor: '#fff' },
  qrBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  qrBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold' },

  // ── Action Bar ──
  actionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  },
  tabPill: {
    flexDirection: 'row', flex: 1, minWidth: 200,
    backgroundColor: Colors.surface,
    borderRadius: 10, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabPillBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 7, borderRadius: 7,
  },
  tabPillBtnActive: {
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3,
  },
  tabPillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  tabPillTextActive: { color: '#fff' },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: Colors.accent, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // ── Stats Grid ──
  statsGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 80, backgroundColor: Colors.surface,
    borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderTopWidth: 3, gap: 6,
  },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // ── Saldo Card ──
  saldoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.success + '10',
    borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: Colors.success + '44',
  },
  saldoIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.success + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  saldoLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_500Medium' },
  saldoValor: { color: Colors.success, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 2 },
  saldoObs: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  saldoNext: { alignItems: 'flex-end' },
  saldoNextLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  saldoNextData: { color: Colors.info, fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // ── Generic Card ──
  card: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { color: Colors.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // ── Progress Bar ──
  progressLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_500Medium' },
  progressBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  progressBarBg: {
    flex: 1, height: 7, borderRadius: 4,
    backgroundColor: Colors.border, overflow: 'hidden',
  },
  progressBarFill: { height: '100%' as any, borderRadius: 4, backgroundColor: Colors.success },
  progressPct: { color: Colors.success, fontSize: 11, fontFamily: 'Inter_700Bold', minWidth: 34, textAlign: 'right' },

  // ── Month Grid ──
  mesesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  mesCard: {
    width: '30%', flexGrow: 1, borderRadius: 10,
    borderWidth: 1.5, minWidth: 88, overflow: 'hidden',
  },
  mesCardAtual: {
    borderWidth: 2.5,
    shadowColor: Colors.gold, shadowOpacity: 0.45, shadowRadius: 8, elevation: 5,
  },
  mesTopStripe: { height: 3, width: '100%' as any },
  mesHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingTop: 7, paddingBottom: 2,
  },
  mesNome: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  mesActualPill: {
    alignSelf: 'flex-start', marginHorizontal: 8, marginBottom: 2,
    backgroundColor: Colors.gold + '33', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  mesActualText: { fontSize: 7, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.3 },
  mesStatusText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 8, marginBottom: 4 },
  mesData: { color: Colors.textSecondary, fontSize: 9, fontFamily: 'Inter_400Regular', paddingHorizontal: 8 },
  mesValor: { color: Colors.text, fontSize: 10, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 8 },
  mesMetodo: {
    color: Colors.textMuted, fontSize: 8, fontFamily: 'Inter_400Regular',
    paddingHorizontal: 8, textTransform: 'capitalize', marginBottom: 4,
  },
  mesReciboBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: 4, marginHorizontal: 8, marginBottom: 7,
    backgroundColor: Colors.success + '18',
    borderWidth: 1, borderColor: Colors.success + '44',
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  mesReciboBtnText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.success },
  mesPendente: {
    color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular',
    paddingHorizontal: 8, paddingBottom: 6, fontStyle: 'italic',
  },

  // ── Legenda ──
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, justifyContent: 'center' },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaDot: { width: 8, height: 8, borderRadius: 4 },
  legendaText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // ── Info Grid ──
  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  infoCell: {
    width: '50%' as any, padding: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  infoCellLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  infoCellValue: { color: Colors.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  obsBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    marginTop: 12, backgroundColor: Colors.backgroundCard,
    borderRadius: 8, padding: 10,
  },
  obsText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, flex: 1 },

  // ── Combinado Separator ──
  combinadoSep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  combinadoLine: { flex: 1, height: 1, backgroundColor: '#7C3AED44' },
  combinadoSepPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#7C3AED18', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#7C3AED44',
  },
  combinadoSepText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#7C3AED', letterSpacing: 0.5 },

  // ── Rubrica List ──
  rubricaCountBadge: {
    backgroundColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  rubricaCountText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  rubricasList: { gap: 0 },
  rubricaCard: {
    borderLeftWidth: 4, backgroundColor: Colors.backgroundCard,
    borderRadius: 10, overflow: 'hidden',
  },
  rubricaCardGap: { marginTop: 8 },
  rubricaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingBottom: 8,
  },
  rubricaIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rubricaTipo: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  rubricaDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  rubricaStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  rubricaStatusText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  rubricaBody: { paddingHorizontal: 12, paddingBottom: 10 },
  rubricaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  rubricaLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  rubricaVal: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.text },

  // ── Rubrica Empty ──
  rubricasEmpty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  rubricasEmptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
  },
  rubricasEmptyTitle: { color: Colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rubricasEmptyText: {
    color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular',
    textAlign: 'center', lineHeight: 17, maxWidth: 260,
  },

  // ── Mês Pagar Button ──
  mesCardClickable: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  mesPagarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  mesPagarBtnText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  mesRupePendentePill: {
    flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4,
    borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
    backgroundColor: Colors.info + '22',
  },
  mesRupePendenteText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.info },

  // ── Modal Pagamento — Bottom Sheet Moderno ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    width: '100%', maxWidth: 560, alignSelf: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 32, shadowOffset: { width: 0, height: -8 },
    elevation: 16, overflow: 'hidden',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginTop: 8, marginBottom: 2,
  },

  // ── Hero ──
  modalHero: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12,
  },
  modalHeroLeft: { flex: 1, gap: 2 },
  modalHeroLabel: {
    fontSize: 9, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.5,
  },
  modalHeroMonth: {
    fontSize: 18, fontFamily: 'Inter_700Bold', color: '#fff', lineHeight: 22,
  },
  modalHeroStudentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  modalHeroStudentText: {
    fontSize: 10, fontFamily: 'Inter_500Medium', color: '#fff', maxWidth: 150,
  },
  modalHeroRight: { alignItems: 'flex-end', gap: 1 },
  modalHeroAmountLabel: {
    fontSize: 9, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.5,
  },
  modalHeroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  modalHeroAmountCurrency: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.8)',
  },
  modalHeroAmountInput: {
    fontSize: 26, fontFamily: 'Inter_700Bold', color: '#fff',
    minWidth: 70, textAlign: 'right', padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  modalHeroAmountHint: {
    fontSize: 9, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.55)',
  },
  modalHeroClose: {
    padding: 4, marginRight: -2,
  },

  // ── Corpo ──
  modalBody: { padding: 14, paddingBottom: 6, gap: 8 },
  modalSectionLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#6B7280', letterSpacing: 0.4, marginBottom: 3,
  },
  modalOptionalTag: { fontFamily: 'Inter_400Regular', color: '#9CA3AF', fontSize: 10 },

  // Métodos (legado, mantido para compatibilidade de estilos)
  modalMetodoGrid: { flexDirection: 'row', gap: 8 },
  modalMetodoCard: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#fff', position: 'relative',
  },
  modalMetodoIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  modalMetodoCardLabel: {
    fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6B7280', textAlign: 'center',
  },
  modalMetodoCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  // Via de pagamento — cartões compactos (Transferência / RUPE)
  modalViaGrid: { flexDirection: 'row', gap: 8 },
  modalViaCard: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#fff', position: 'relative', overflow: 'hidden',
  },
  modalViaIconBox: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  modalViaCardLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#374151', textAlign: 'center',
  },
  modalViaCardDesc: {
    fontSize: 9, fontFamily: 'Inter_400Regular', color: '#9CA3AF', textAlign: 'center',
  },

  // Dados bancários — Transferência
  bankBox: {
    backgroundColor: '#ECFEFF', borderRadius: 10, borderWidth: 1, borderColor: '#A5F3FC',
    paddingHorizontal: 12, paddingVertical: 2,
  },
  bankRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#CFFAFE',
  },
  bankRowLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#0E7490' },
  bankRowValue: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: '#164E63', maxWidth: 200, textAlign: 'right' },
  bankRowValueMono: { fontSize: 12, fontFamily: 'monospace' as any, fontWeight: '700', color: '#164E63', letterSpacing: 0.4 },
  bankCopyBtn: {
    width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#CFFAFE', borderWidth: 1, borderColor: '#67E8F9',
  },
  bankEmptyText: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: '#0E7490', paddingVertical: 8, lineHeight: 16,
  },

  // RUPE — bloco informativo antes de gerar
  rupeInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#F5F3FF', borderRadius: 10, borderWidth: 1, borderColor: '#DDD6FE',
    padding: 10,
  },
  rupeInfoText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: '#5B21B6', lineHeight: 16 },

  // RUPE — bloco de referência gerada (modal)
  modalGenRupeBox: {
    backgroundColor: '#F5F3FF', borderRadius: 14, borderWidth: 1, borderColor: '#DDD6FE',
    padding: 14,
  },
  rupeBoxHeader2: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  rupeBoxLabel2: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#7C3AED', letterSpacing: 0.6 },
  rupeBoxRow2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rupeBoxValue2: { flex: 1, fontSize: 18, fontFamily: 'monospace' as any, fontWeight: '700', color: '#111827', letterSpacing: 0.6 },
  rupeCopyBtn2: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#EDE9FE', borderWidth: 1, borderColor: '#C4B5FD',
  },
  rupeCopyTxt2: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#7C3AED' },
  rupeDate2: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6D28D9' },
  rupeStatusHint: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: '#6B7280', marginTop: 10, lineHeight: 16,
  },
  rupePrintBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#EDE9FE', borderWidth: 1, borderColor: '#C4B5FD',
  },
  rupePrintBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#7C3AED' },
  posInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7',
    borderRadius: 8, padding: 10,
  },
  posInfoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#065F46', lineHeight: 17 },

  // Data
  modalDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  modalDateIcon: {
    alignItems: 'center', justifyContent: 'center',
  },
  modalDateInput: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#111827', padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },

  // Inline input
  modalInlineInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  modalInlineText: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#111827', padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },

  // Textarea
  modalTextarea: {
    backgroundColor: '#F9FAFB', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, fontFamily: 'Inter_400Regular', color: '#111827',
    minHeight: 44, textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },

  // Erro
  modalErrorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.danger + '12', borderRadius: 8,
    padding: 8, borderWidth: 1, borderColor: Colors.danger + '30',
  },
  modalErrorText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger },

  // CTA
  modalCTA: { padding: 12, paddingTop: 6 },
  modalConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: '#059669',
  },
  modalConfirmBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  // Sucesso
  modalSuccessState: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 48, paddingHorizontal: 24, gap: 14,
  },
  modalSuccessCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#059669',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  modalSuccessTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#111827' },
  modalSuccessMsg: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B7280',
    textAlign: 'center', lineHeight: 21,
  },

  // ── Global Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { color: Colors.text, fontSize: 17, fontFamily: 'Inter_700Bold' },
  emptyText: {
    color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular',
    textAlign: 'center', maxWidth: 280, lineHeight: 20,
  },
  emptyHints: { gap: 8, marginTop: 8, alignSelf: 'stretch', paddingHorizontal: 16 },
  emptyHintRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyHintIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.accent + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyHintText: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
});
