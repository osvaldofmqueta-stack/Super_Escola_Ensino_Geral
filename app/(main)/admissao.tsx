import React, { useState, useEffect, useMemo } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import DatePickerField from '@/components/DatePickerField';
import { webAlert } from '@/utils/webAlert';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
function buildQrImageUrl(data: string, size = 100): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=132145&color=ffffff&margin=4&ecc=M`;
}
function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function anoAtual(): string { return String(new Date().getFullYear()); }
function formatDate(val: string | undefined): string {
  if (!val) return '___/___/______';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return val; }
}

function gerarListaResultadosPDF(registros: Registro[], nomeEscola: string, cicloSelecao: 'I' | 'II' = 'I', cursoFiltro?: string, tem13: boolean = true) {
  if (Platform.OS !== 'web') return;

  const II_CICLO = tem13
    ? ['10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe']
    : ['10ª Classe', '11ª Classe', '12ª Classe'];

  function classeSort(a: string, b: string) {
    const n = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
    return n(a) - n(b);
  }

  function numCand(r: Registro, idx: number): string {
    if (r.rupeInscricao) {
      const p = r.rupeInscricao.split('-');
      if (p.length >= 4) return p[3];
    }
    return String(10000 + idx);
  }

  // Use the explicit selection made by the user
  const temIICiclo = cicloSelecao === 'II';

  // ── I CICLO (7ª Classe): todos os candidatos juntos com coluna de resultado ──
  function buildICicloVitrine(lista: Registro[]): string {
    if (lista.length === 0) return '<p style="text-align:center;padding:20px;color:#888;">Nenhum candidato encontrado.</p>';
    const sorted = [...lista].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));
    // group by class (in case there are multiple I ciclo classes)
    const byClasse: Record<string, Registro[]> = {};
    for (const r of sorted) {
      const cl = r.classe?.trim() || 'Sem Classe';
      if (!byClasse[cl]) byClasse[cl] = [];
      byClasse[cl].push(r);
    }
    const classes = Object.keys(byClasse).sort(classeSort);
    let html = '';
    for (const cls of classes) {
      const alunos = byClasse[cls];
      const masc = alunos.filter(a => a.genero === 'M').length;
      const fem = alunos.filter(a => a.genero === 'F').length;
      const admCount = alunos.filter(a => a.status === 'admitido' || a.status === 'matriculado').length;
      const nAdmCount = alunos.filter(a => a.status === 'reprovado_admissao').length;
      html += `<div class="classe-header">${cls} &nbsp;·&nbsp; ${alunos.length} candidatos (M: ${masc} · F: ${fem}) &nbsp;·&nbsp; Admitidos: <span style="color:#1a7a2e;font-weight:bold">${admCount}</span> &nbsp;·&nbsp; Não Admitidos: <span style="color:#c0392b;font-weight:bold">${nAdmCount}</span></div>
      <table><thead><tr>
        <th class="col-ord">Ord.</th>
        <th class="col-nome">Nome Completo</th>
        <th class="col-cand">NºCand</th>
        <th class="col-sex">Sexo</th>
        <th class="col-nota">Nota</th>
        <th class="col-resultado">Resultado</th>
      </tr></thead><tbody>`;
      alunos.forEach((a, i) => {
        const nota = a.notaAdmissao !== null && a.notaAdmissao !== undefined ? `${a.notaAdmissao}/20` : '—';
        const isAdm = a.status === 'admitido' || a.status === 'matriculado';
        const resultado = isAdm ? 'ADMITIDO' : (a.status === 'reprovado_admissao' ? 'NÃO ADMITIDO' : 'PENDENTE');
        const resCor = isAdm ? '#1a7a2e' : (a.status === 'reprovado_admissao' ? '#c0392b' : '#888');
        const rowBg = isAdm ? (i % 2 === 0 ? '#f0fff4' : '#e6f9ed') : (i % 2 === 0 ? '#fff' : '#fff8f8');
        html += `<tr style="background:${rowBg}">
          <td class="col-ord" style="text-align:center;font-weight:bold">${i + 1}</td>
          <td class="col-nome">${a.nomeCompleto.toUpperCase()}</td>
          <td class="col-cand" style="text-align:center;font-family:monospace">${numCand(a, i + 1)}</td>
          <td class="col-sex" style="text-align:center">${a.genero || '—'}</td>
          <td class="col-nota" style="text-align:center;font-weight:bold;color:${a.notaAdmissao !== null && a.notaAdmissao !== undefined && a.notaAdmissao >= 10 ? '#1a7a2e' : '#c0392b'}">${nota}</td>
          <td class="col-resultado" style="text-align:center;font-weight:bold;font-size:9px;color:${resCor}">${resultado}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }
    return html;
  }

  // ── II CICLO (10ª Classe): admitidos por curso, depois não admitidos ──
  function buildIICicloVitrine(lista: Registro[]): string {
    const admitidos = lista.filter(r => r.status === 'admitido' || r.status === 'matriculado');
    const naoAdmitidos = lista.filter(r => r.status === 'reprovado_admissao');
    let html = '';

    // Admitidos por classe e por curso
    if (admitidos.length > 0) {
      html += `<div class="sec-header" style="background:#e8f5e9;border-left:5px solid #1a7a2e;">✓ ADMITIDOS &nbsp;·&nbsp; ${admitidos.length} candidato(s)</div>`;
      const byClasse: Record<string, Registro[]> = {};
      for (const r of admitidos) {
        const cl = r.classe?.trim() || 'Sem Classe';
        if (!byClasse[cl]) byClasse[cl] = [];
        byClasse[cl].push(r);
      }
      for (const cls of Object.keys(byClasse).sort(classeSort)) {
        const alunosClasse = byClasse[cls].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));
        const byCurso: Record<string, Registro[]> = {};
        for (const r of alunosClasse) {
          const k = r.cursoNome?.trim() || 'Sem Curso';
          if (!byCurso[k]) byCurso[k] = [];
          byCurso[k].push(r);
        }
        const cursos = Object.keys(byCurso).sort((a, b) => a.localeCompare(b, 'pt'));
        const masc = alunosClasse.filter(a => a.genero === 'M').length;
        const fem = alunosClasse.filter(a => a.genero === 'F').length;
        html += `<div class="classe-header">${cls} &nbsp;·&nbsp; ${alunosClasse.length} candidatos admitidos (M: ${masc} · F: ${fem}) &nbsp;·&nbsp; ${cursos.length} curso(s)</div>`;
        let ord = 1;
        for (const curso of cursos) {
          const alunos = byCurso[curso];
          html += `<div class="curso-header">CURSO: ${curso.toUpperCase()} &nbsp;·&nbsp; ${alunos.length} candidato(s)</div>
          <table><thead><tr>
            <th class="col-ord">Ord.</th>
            <th class="col-nome">Nome Completo</th>
            <th class="col-cand">NºCand</th>
            <th class="col-sex">Sexo</th>
            <th class="col-nota">Nota</th>
          </tr></thead><tbody>`;
          alunos.forEach((a, i) => {
            const nota = a.notaAdmissao !== null && a.notaAdmissao !== undefined ? `${a.notaAdmissao}/20` : '—';
            const bg = i % 2 === 0 ? '#f0fff4' : '#e6f9ed';
            html += `<tr style="background:${bg}">
              <td class="col-ord" style="text-align:center;font-weight:bold">${ord + i}</td>
              <td class="col-nome">${a.nomeCompleto.toUpperCase()}</td>
              <td class="col-cand" style="text-align:center;font-family:monospace">${numCand(a, ord + i)}</td>
              <td class="col-sex" style="text-align:center">${a.genero || '—'}</td>
              <td class="col-nota" style="text-align:center;font-weight:bold;color:${a.notaAdmissao !== null && a.notaAdmissao !== undefined && a.notaAdmissao >= 10 ? '#1a7a2e' : '#c0392b'}">${nota}</td>
            </tr>`;
          });
          html += `</tbody></table>`;
          ord += alunos.length;
        }
      }
    }

    // Não admitidos — lista simples
    if (naoAdmitidos.length > 0) {
      html += `<div style="page-break-before:auto;margin-top:16px;"></div>`;
      html += `<div class="sec-header" style="background:#fdecea;border-left:5px solid #c0392b;">✗ NÃO ADMITIDOS &nbsp;·&nbsp; ${naoAdmitidos.length} candidato(s)</div>`;
      const sorted = [...naoAdmitidos].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));
      html += `<table><thead><tr>
        <th class="col-ord">Ord.</th>
        <th class="col-nome">Nome Completo</th>
        <th class="col-cand">NºCand</th>
        <th class="col-sex">Sexo</th>
        <th class="col-nota">Nota</th>
      </tr></thead><tbody>`;
      sorted.forEach((a, i) => {
        const nota = a.notaAdmissao !== null && a.notaAdmissao !== undefined ? `${a.notaAdmissao}/20` : '—';
        const bg = i % 2 === 0 ? '#fff' : '#fff5f5';
        html += `<tr style="background:${bg}">
          <td class="col-ord" style="text-align:center;font-weight:bold">${i + 1}</td>
          <td class="col-nome">${a.nomeCompleto.toUpperCase()}</td>
          <td class="col-cand" style="text-align:center;font-family:monospace">${numCand(a, i + 1)}</td>
          <td class="col-sex" style="text-align:center">${a.genero || '—'}</td>
          <td class="col-nota" style="text-align:center;font-weight:bold;color:#c0392b">${nota}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }
    return html;
  }

  // Filter records by the selected ciclo
  const registrosCiclo = temIICiclo
    ? registros.filter(r => II_CICLO.includes(r.classe?.trim() || ''))
    : registros.filter(r => !II_CICLO.includes(r.classe?.trim() || ''));

  // If II ciclo and a specific course is selected, filter further for admitidos
  const registrosParaPDF = (temIICiclo && cursoFiltro)
    ? registrosCiclo.filter(r => (r.status !== 'admitido' && r.status !== 'matriculado') || (r.cursoNome?.trim() === cursoFiltro))
    : registrosCiclo;

  const admitidos = registrosParaPDF.filter(r => r.status === 'admitido' || r.status === 'matriculado');
  const naoAdmitidos = registrosParaPDF.filter(r => r.status === 'reprovado_admissao');
  const total = admitidos.length + naoAdmitidos.length;
  const taxaAprov = total > 0 ? Math.round((admitidos.length / total) * 100) : 0;

  // Tipo de vitrine conforme selecção
  const cursoLabel = cursoFiltro ? ` — ${cursoFiltro}` : '';
  const tipoVitrine = temIICiclo ? `II Ciclo — por Curso${cursoLabel}` : 'I Ciclo — Lista Geral (7ª Classe)';
  const conteudo = temIICiclo
    ? buildIICicloVitrine(registrosParaPDF)
    : buildICicloVitrine(registrosParaPDF);

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Lista de Resultados de Admissão — ${nomeEscola}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10.5px; color: #000; background: #f5f5f5; }
  .doc-page { background: #fff; max-width: 210mm; margin: 0 auto; padding: 14mm 18mm 12mm; min-height: 297mm; }

  .doc-header { text-align: center; margin-bottom: 12px; }
  .header-brasao { width: 72px; height: auto; display: block; margin: 0 auto 5px; }
  .header-rep { font-size: 10px; line-height: 1.6; margin: 0; }
  .escola-nome { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-top: 4px; }
  .doc-titulo { font-size: 13px; font-weight: bold; text-decoration: underline; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .doc-meta { font-size: 9.5px; color: #444; }

  .totais { display: flex; gap: 20px; background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 4px; padding: 8px 14px; margin: 10px 0 14px; flex-wrap: wrap; }
  .totais div { font-size: 10px; }
  .totais b { font-size: 13px; }
  .tipo-badge { display:inline-block; background:#1E3A5F; color:#fff; font-size:8px; font-weight:bold; letter-spacing:1px; padding:2px 8px; border-radius:10px; margin-top:4px; text-transform:uppercase; }

  .sec-header { color: #000; font-weight: bold; font-size: 11.5px; text-transform: uppercase; padding: 7px 12px; margin: 16px 0 6px; letter-spacing: 0.6px; border-radius: 3px; }
  .classe-header { font-weight: bold; font-size: 10.5px; padding: 4px 10px; margin: 10px 0 3px; background: #f0f0f0; border-left: 3px solid #555; }
  .curso-header { font-size: 10px; font-weight: bold; padding: 3px 8px; margin: 6px 0 2px; background: #eef2ff; border-left: 3px solid #6366f1; }

  table { border-collapse: collapse; width: 100%; margin-bottom: 4px; font-size: 9.5px; }
  th { background: #1E3A5F; color: #fff; font-weight: bold; padding: 4px 6px; text-align: left; border: none; }
  td { border-bottom: 1px solid #e0e0e0; padding: 3px 6px; vertical-align: middle; }
  .col-ord { width: 30px; }
  .col-cand { width: 70px; }
  .col-sex { width: 36px; }
  .col-nota { width: 50px; }
  .col-resultado { width: 90px; }

  hr.div { border: none; border-top: 2px solid #000; margin: 10px 0 6px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 32px; font-size: 10px; }
  .sig-block { text-align: center; }
  .sig-line { width: 170px; border-top: 1px solid #000; margin: 28px auto 4px; }
  .footer { margin-top: 12px; border-top: 1px solid #ccc; padding-top: 5px; display: flex; justify-content: space-between; font-size: 8px; color: #555; }
  .print-btn { position: fixed; bottom: 16px; right: 16px; background: #1E3A5F; color: #fff; border: none; border-radius: 8px; padding: 11px 22px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999; }
  @media print {
    .print-btn { display: none !important; }
    body { background: #fff; }
    .doc-page { margin: 0; padding: 10mm 15mm 8mm; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimir / PDF</button>
  <div class="doc-page">
    <div class="doc-header">
      <img src="/angola-brasao.png" class="header-brasao" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="escola-nome">${nomeEscola.toUpperCase()}</div>
      <div class="doc-titulo">Lista de Resultados de Admissão — ${anoAtual()}</div>
      <div class="doc-meta">Emitido em: ${hoje()} &nbsp;|&nbsp; Ano Lectivo: ${anoAtual()}</div>
      <div><span class="tipo-badge">${tipoVitrine}</span></div>
    </div>
    <hr class="div" />

    <div class="totais">
      <div>Total com resultado: <b>${total}</b></div>
      <div>Admitidos: <b style="color:#1a7a2e">${admitidos.length}</b></div>
      <div>Não Admitidos: <b style="color:#c0392b">${naoAdmitidos.length}</b></div>
      <div>Taxa de Aprovação: <b>${taxaAprov}%</b></div>
    </div>

    ${conteudo}

    <div class="sig-row">
      <div class="sig-block"><div class="sig-line"></div><div>O Secretário(a)</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Director(a) da Escola</div></div>
    </div>
    <div class="footer">
      <span>${nomeEscola} — Super Escola v1.03</span>
      <span>Resultados de Admissão ${anoAtual()}</span>
      <span>Emitido: ${hoje()}</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

async function imprimirBoletimMatriculaAdmissao(reg: Registro) {
  if (Platform.OS !== 'web') return;
  const schoolRes = await fetch('/api/config').catch(() => null);
  const school = schoolRes?.ok ? await schoolRes.json() : {};
  const nomeEscola = school.nomeEscola || 'QUETA';

  const _partes = String(reg.nomeCompleto || '').trim().split(/\s+/);
  const generoLabel = reg.genero === 'M' ? 'Masculino' : 'Feminino';
  const numeroMatricula = `MAT-${anoAtual()}-${reg.id.slice(0, 6).toUpperCase()}`;
  const qrData = JSON.stringify({ tipo: 'BOLETIM_MATRICULA', id: reg.id, nome: reg.nomeCompleto, classe: reg.classe });
  const qrUrl = buildQrImageUrl(qrData, 110);

  const html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Boletim de Matrícula — ${reg.nomeCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; }
  .page { width: 100%; }
  .header-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
  .header-text { flex: 1; text-align: center; }
  .header-text p { font-size: 9.5pt; line-height: 1.55; }
  .header-text .bold { font-weight: bold; }
  .header-text .title { font-size: 13pt; font-weight: bold; margin-top: 6px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 2px; }
  .header-text .codigo { font-size: 9pt; margin-top: 4px; color: #333; }
  .qr-box { width: 90px; height: 90px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 3px; }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-label { font-size: 6pt; text-align: center; margin-top: 3px; color: #444; font-weight: bold; }
  .alerta { background: #1E3A5F; color: #fff; text-align: center; font-weight: bold; font-size: 9.5pt; padding: 4px 0; margin: 8px 0; letter-spacing: 0.8px; text-transform: uppercase; }
  .status-box { border: 1.5px solid #1E3A5F; border-radius: 4px; padding: 10px 14px; margin: 10px 0; display: flex; gap: 20px; align-items: center; background: #f7f9ff; }
  .status-label { font-size: 9pt; color: #444; }
  .status-value { font-size: 11pt; font-weight: bold; color: #1E3A5F; }
  .mat-num { font-size: 12pt; font-weight: bold; color: #0a5e14; letter-spacing: 1px; }
  .section-title { font-weight: bold; font-size: 10pt; margin: 10px 0 4px; padding: 3px 6px; background: #f0f0f0; border-left: 3px solid #1E3A5F; text-transform: uppercase; }
  .field-line { display: flex; align-items: baseline; gap: 4px; margin-bottom: 5px; font-size: 9.5pt; flex-wrap: wrap; }
  .field-line .label { white-space: nowrap; color: #444; }
  .field-line .value { border-bottom: 1px solid #555; flex: 1; min-width: 60px; padding-bottom: 1px; font-weight: 600; }
  .multi-field { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 5px; font-size: 9.5pt; }
  .multi-field .item { display: flex; align-items: baseline; gap: 4px; }
  .multi-field .item .label { color: #444; white-space: nowrap; }
  .multi-field .item .value { border-bottom: 1px solid #555; min-width: 60px; padding-bottom: 1px; font-weight: 600; }
  .declaracao { margin-top: 14px; border-top: 2px solid #000; padding-top: 10px; }
  .declaracao-title { font-weight: bold; text-align: center; font-size: 11pt; margin-bottom: 8px; text-transform: uppercase; }
  .decl-text { font-size: 9.5pt; line-height: 1.65; margin-bottom: 6px; text-align: justify; }
  .local-data { text-align: center; margin: 12px 0 6px; font-size: 9.5pt; }
  .signature-area { display: flex; justify-content: space-between; margin-top: 16px; }
  .sig-block { text-align: center; font-size: 9pt; }
  .sig-line { border-top: 1px solid #000; width: 160px; margin: 28px auto 4px; }
  .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 6px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #555; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header-row">
    <div style="width:50px;flex-shrink:0;"></div>
    <div class="header-text">
      <p>REPÚBLICA DE ANGOLA</p><p>MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="bold">${nomeEscola}</p>
      <p class="title">Boletim de Matrícula</p>
      <p class="codigo">Nº Matrícula: <strong>${numeroMatricula}</strong> &nbsp;|&nbsp; Data: <strong>${hoje()}</strong> &nbsp;|&nbsp; Ano Lectivo: <strong>${anoAtual()}</strong></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box"><img src="${qrUrl}" alt="QR" /></div>
      <div class="qr-label">${numeroMatricula}</div>
    </div>
  </div>
  <div class="alerta">Boletim de Matrícula — Secretaria</div>
  <div class="status-box">
    <div><div class="status-label">Estado</div><div class="status-value">Matriculado(a)</div></div>
    <div><div class="status-label">Nº de Matrícula</div><div class="mat-num">${numeroMatricula}</div></div>
    <div><div class="status-label">Classe</div><div class="status-value">${reg.classe}</div></div>
    <div><div class="status-label">Nível</div><div class="status-value">${reg.nivel}</div></div>
  </div>
  <div class="section-title">A — Dados Pessoais do Aluno</div>
  <div class="field-line"><span class="label">Nome Completo:</span><span class="value">${reg.nomeCompleto}</span></div>
  <div class="multi-field">
    <div class="item"><span class="label">Data de Nascimento:</span><span class="value">${formatDate(reg.dataNascimento)}</span></div>
    <div class="item"><span class="label">Sexo:</span><span class="value">${generoLabel}</span></div>
  </div>
  <div class="multi-field">
    <div class="item"><span class="label">Província:</span><span class="value">${reg.provincia}</span></div>
    <div class="item"><span class="label">Município:</span><span class="value">${reg.municipio}</span></div>
  </div>
  <div class="multi-field">
    <div class="item"><span class="label">Telefone:</span><span class="value">${reg.telefone}</span></div>
    <div class="item"><span class="label">Email:</span><span class="value">${reg.email}</span></div>
  </div>
  <div class="section-title">B — Dados do Encarregado de Educação</div>
  <div class="field-line"><span class="label">Nome Completo:</span><span class="value">${reg.nomeEncarregado}</span></div>
  <div class="field-line"><span class="label">Telefone:</span><span class="value">${reg.telefoneEncarregado}</span></div>
  <div class="declaracao">
    <div class="declaracao-title">Declaração sob Compromisso de Honra</div>
    <div class="decl-text">
      Eu, <span style="border-bottom:1px solid #000;display:inline-block;min-width:220px;font-weight:600;">${reg.nomeCompleto}</span>,
      do sexo ${generoLabel}, de nacionalidade Angolana, declaro que todos os dados fornecidos são verídicos e aceito as condições de matrícula.
    </div>
    <div class="local-data">Luanda,&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;">&nbsp;</span>&nbsp;de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">&nbsp;</span>&nbsp;de&nbsp;<strong>${anoAtual()}</strong></div>
    <div class="signature-area">
      <div class="sig-block"><div class="sig-line"></div><div>Assinatura do(a) Aluno(a) / Encarregado</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Funcionário da Secretaria</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Director(a) da Escola</div></div>
    </div>
  </div>
  <div class="footer"><span>${nomeEscola} — Sistema QUETA v3</span><span>Nº Matrícula: ${numeroMatricula}</span><span>Emitido: ${hoje()}</span></div>
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  }
}

interface Registro {
  id: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: string;
  provincia: string;
  municipio: string;
  telefone: string;
  email: string;
  nivel: string;
  classe: string;
  status: string;
  senhaProvisoria?: string;
  dataProva?: string;
  notaAdmissao?: number;
  resultadoAdmissao?: string;
  matriculaCompleta?: boolean;
  rupeInscricao?: string;
  rupeMatricula?: string;
  tipoInscricao?: string;
  pagamentoInscricaoConfirmado?: boolean;
  pagamentoInscricaoConfirmadoEm?: string;
  pagamentoInscricaoConfirmadoPor?: string;
  pagamentoMatriculaConfirmado?: boolean;
  pagamentoMatriculaConfirmadoEm?: string;
  pagamentoMatriculaConfirmadoPor?: string;
  cursoNome?: string;
  alunoId?: string;
  criadoEm: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
}

type TabKey = 'pagamento' | 'pendentes' | 'aprovados' | 'resultado' | 'concluidos';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente_pagamento: { label: 'Aguarda Pagamento', color: '#E67E22' },
  pendente: { label: 'Pendente', color: Colors.warning },
  aprovado: { label: 'Aprovado p/ Exame', color: '#3498DB' },
  rejeitado: { label: 'Rejeitado', color: Colors.danger },
  admitido: { label: 'Admitido', color: Colors.success },
  reprovado_admissao: { label: 'Reprovado', color: Colors.danger },
  matriculado: { label: 'Matriculado', color: Colors.gold },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABEL[status] ?? { label: status, color: Colors.textMuted };
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.color + '20' }]}>
      <Text style={[badge.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
});

const PAGE_SIZE = 20;

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;

  // Compute page numbers to show: always first, last, current ±1, with ellipsis
  const pages: (number | '…')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (current - 1 > 2) pages.push('…');
  if (current - 1 > 1) add(current - 1);
  add(current);
  if (current + 1 < total) add(current + 1);
  if (current + 2 < total) pages.push('…');
  add(total);

  return (
    <View style={pgStyles.bar}>
      {/* Prev */}
      <TouchableOpacity
        style={[pgStyles.navBtn, current === 1 && pgStyles.navBtnDisabled]}
        onPress={() => current > 1 && onChange(current - 1)}
        disabled={current === 1}
      >
        <Ionicons name="chevron-back" size={14} color={current === 1 ? '#3a4a6b' : '#9aa5be'} />
      </TouchableOpacity>

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === '…' ? (
          <Text key={`ellipsis-${i}`} style={pgStyles.ellipsis}>…</Text>
        ) : (
          <TouchableOpacity
            key={p}
            style={[pgStyles.pageBtn, p === current && pgStyles.pageBtnActive]}
            onPress={() => onChange(p as number)}
          >
            <Text style={[pgStyles.pageBtnText, p === current && pgStyles.pageBtnTextActive]}>{p}</Text>
          </TouchableOpacity>
        )
      )}

      {/* Next */}
      <TouchableOpacity
        style={[pgStyles.navBtn, current === total && pgStyles.navBtnDisabled]}
        onPress={() => current < total && onChange(current + 1)}
        disabled={current === total}
      >
        <Ionicons name="chevron-forward" size={14} color={current === total ? '#3a4a6b' : '#9aa5be'} />
      </TouchableOpacity>

      {/* Label */}
      <Text style={pgStyles.label}>Página {current} de {total}</Text>
    </View>
  );
}

export default function AdmissaoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { config } = useConfig();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeEscola, setNomeEscola] = useState('QUETA');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('pendentes');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [vitrineCiclo, setVitrineCiclo] = useState<'I' | 'II'>('I');
  const [vitrineCurso, setVitrineCurso] = useState<string>('');

  const [modalRejeitar, setModalRejeitar] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [modalProva, setModalProva] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [dataProva, setDataProva] = useState('');
  const [modalNota, setModalNota] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [nota, setNota] = useState('');
  const [modalDetalhes, setModalDetalhes] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [modalConfirmarPagamento, setModalConfirmarPagamento] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [modalConfirmarPagamentoInscricao, setModalConfirmarPagamentoInscricao] = useState<{ visible: boolean; reg: Registro | null }>({ visible: false, reg: null });
  const [isActing, setIsActing] = useState(false);
  const [vagasMap, setVagasMap] = useState<Record<string, { capacidade: number; vagasDisponiveis: number; vagasOcupadas: number }>>({});
  const [bloqueioMap, setBloqueioMap] = useState<Record<string, { bloqueado: boolean; disciplinas?: string[]; classeAnterior?: string; verificado: boolean }>>({});

  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  async function fetchVagas(classes: string[]) {
    if (classes.length === 0) return;
    const entries = await Promise.all(
      classes.map(cls =>
        fetch(`/api/vagas/${encodeURIComponent(cls)}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    const map: Record<string, any> = {};
    classes.forEach((cls, i) => { if (entries[i]) map[cls] = entries[i]; });
    setVagasMap(map);
  }

  async function load() {
    setIsLoading(true);
    try {
      const [res, cfgRes] = await Promise.all([fetch('/api/registros'), fetch('/api/config')]);
      const data = await res.json();
      const regs = Array.isArray(data) ? data : [];
      setRegistros(regs);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setNomeEscola(cfg.nomeEscola || 'QUETA');
      }
      const resultadoClasses = [...new Set(
        regs.filter((r: any) => r.status === 'admitido' || r.status === 'reprovado_admissao' || r.status === 'matriculado')
          .map((r: any) => r.classe as string)
      )];
      fetchVagas(resultadoClasses);
    } catch { setRegistros([]); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // Reset to page 1 whenever the tab or search query changes
  useEffect(() => { setCurrentPage(1); }, [activeTab, search]);

  useEffect(() => {
    if (activeTab !== 'resultado') return;
    if (!config.bloqueioMatriculaHabilitado) return;
    const admitidos = registros.filter(r => r.status === 'admitido' && !bloqueioMap[r.id]);
    if (!admitidos.length) return;
    admitidos.forEach(async reg => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/registros/${reg.id}/verificar-bloqueio-art23`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        setBloqueioMap(prev => ({ ...prev, [reg.id]: { ...data, verificado: true } }));
      } catch {}
    });
  }, [activeTab, registros, config.bloqueioMatriculaHabilitado]);

  const filtered = useMemo(() => {
    const byTab: Record<TabKey, Registro[]> = {
      pagamento: registros.filter(r => r.status === 'pendente_pagamento'),
      pendentes: registros.filter(r => r.status === 'pendente'),
      aprovados: registros.filter(r => r.status === 'aprovado'),
      resultado: registros.filter(r => r.status === 'admitido' || r.status === 'reprovado_admissao'),
      concluidos: registros.filter(r => r.status === 'matriculado' || r.status === 'rejeitado'),
    };
    const list = byTab[activeTab] ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(r => r.nomeCompleto.toLowerCase().includes(q) || r.classe.toLowerCase().includes(q));
  }, [registros, activeTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function aprovar(reg: Registro) {
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: 'aprovado', avaliadoPor: user?.nome, avaliadoEm: new Date().toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error();
      await load();
      alertSucesso('Candidato aprovado', `${reg.nomeCompleto} foi aprovado(a) para o exame de admissão.`);
    } catch { alertErro('Erro', 'Não foi possível aprovar. Tente novamente.'); }
    finally { setIsActing(false); }
  }

  async function rejeitar() {
    const reg = modalRejeitar.reg;
    if (!reg || !motivoRejeicao.trim()) { webAlert('Motivo obrigatório', 'Indique o motivo da rejeição.'); return; }
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: 'rejeitado', motivoRejeicao: motivoRejeicao.trim(), avaliadoPor: user?.nome, avaliadoEm: new Date().toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error();
      await load();
      setModalRejeitar({ visible: false, reg: null });
      setMotivoRejeicao('');
      alertSucesso('Candidatura rejeitada', `A candidatura de ${reg.nomeCompleto} foi rejeitada.`);
    } catch { alertErro('Erro', 'Não foi possível rejeitar. Tente novamente.'); }
    finally { setIsActing(false); }
  }

  async function publicarDataProva() {
    const reg = modalProva.reg;
    if (!reg || !dataProva.trim()) { webAlert('Data obrigatória', 'Seleccione a data do exame.'); return; }
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}/publicar-data-prova`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ dataProva: dataProva.trim() }),
      });
      if (!res.ok) throw new Error();
      await load();
      setModalProva({ visible: false, reg: null });
      setDataProva('');
      alertSucesso('Data publicada', 'A data do exame foi publicada com sucesso.');
    } catch { alertErro('Erro', 'Não foi possível publicar a data.'); }
    finally { setIsActing(false); }
  }

  async function executarConfirmarPagamentoInscricao() {
    const reg = modalConfirmarPagamentoInscricao.reg;
    if (!reg) return;
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}/confirmar-pagamento-inscricao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ confirmadoPor: user?.nome || 'Admin' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      setModalConfirmarPagamentoInscricao({ visible: false, reg: null });
      alertSucesso('Pagamento confirmado', `O pagamento de inscrição de ${reg.nomeCompleto} foi confirmado. A candidatura pode agora ser analisada.`);
    } catch (e: any) {
      alertErro('Erro', e.message || 'Não foi possível confirmar o pagamento.');
    } finally {
      setIsActing(false);
    }
  }

  function confirmarPagamentoMatricula(reg: Registro) {
    setModalConfirmarPagamento({ visible: true, reg });
  }

  async function executarConfirmarPagamento() {
    const reg = modalConfirmarPagamento.reg;
    if (!reg) return;
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}/confirmar-pagamento-matricula`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ confirmadoPor: user?.nome || 'Admin' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      setModalConfirmarPagamento({ visible: false, reg: null });
      alertSucesso('Pagamento confirmado', `O pagamento de ${reg.nomeCompleto} foi confirmado. O estudante já pode concluir a matrícula.`);
    } catch (e: any) {
      alertErro('Erro', e.message || 'Não foi possível confirmar o pagamento.');
    } finally {
      setIsActing(false);
    }
  }

  async function lancarNota() {
    const reg = modalNota.reg;
    if (!reg || nota.trim() === '') { webAlert('Nota obrigatória', 'Introduza a nota do exame.'); return; }
    const n = parseFloat(nota.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 20) { webAlert('Nota inválida', 'A nota deve estar entre 0 e 20.'); return; }
    setIsActing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/registros/${reg.id}/lancar-nota`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ notaAdmissao: n }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
      setModalNota({ visible: false, reg: null });
      setNota('');
      const resultado = n >= 10 ? 'ADMITIDO' : 'NÃO ADMITIDO';
      alertSucesso('Nota lançada', `${reg.nomeCompleto}: ${n}/20 — ${resultado}`);
    } catch (e: any) { alertErro('Erro', e.message || 'Não foi possível lançar a nota.'); }
    finally { setIsActing(false); }
  }

  const TABS = [
    { key: 'pagamento' as TabKey, label: 'Pag. Inscrição', icon: 'cash-outline', count: registros.filter(r => r.status === 'pendente_pagamento').length },
    { key: 'pendentes' as TabKey, label: 'Pendentes', icon: 'hourglass-outline', count: registros.filter(r => r.status === 'pendente').length },
    { key: 'aprovados' as TabKey, label: 'Aprovados', icon: 'checkmark-circle-outline', count: registros.filter(r => r.status === 'aprovado').length },
    { key: 'resultado' as TabKey, label: 'Resultado', icon: 'trophy-outline', count: registros.filter(r => ['admitido', 'reprovado_admissao'].includes(r.status)).length },
    { key: 'concluidos' as TabKey, label: 'Concluídos', icon: 'ribbon-outline', count: registros.filter(r => ['matriculado', 'rejeitado'].includes(r.status)).length },
  ];

  function renderItem({ item: reg }: { item: Registro }) {
    return (
      <View style={styles.regCard}>
        <View style={styles.regCardTop}>
          <View style={styles.regAvatar}>
            <Text style={styles.regAvatarText}>{reg.nomeCompleto[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.regNome}>{reg.nomeCompleto}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={styles.regSub}>{reg.nivel} · {reg.classe}</Text>
              <View style={[badge.wrap, { backgroundColor: reg.tipoInscricao === 'reconfirmacao' ? 'rgba(52,152,219,0.15)' : 'rgba(155,89,182,0.15)' }]}>
                <Text style={[badge.text, { color: reg.tipoInscricao === 'reconfirmacao' ? '#3498DB' : '#9B59B6' }]}>
                  {reg.tipoInscricao === 'reconfirmacao' ? 'Reconfirmação' : 'Novo'}
                </Text>
              </View>
            </View>
            {reg.email ? <Text style={styles.regEmail}>{reg.email}</Text> : null}
          </View>
          <StatusBadge status={reg.status} />
        </View>

        {reg.dataProva && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={12} color={Colors.gold} />
            <Text style={styles.infoText}>Exame: {reg.dataProva}</Text>
          </View>
        )}
        {reg.notaAdmissao !== undefined && reg.notaAdmissao !== null && (
          <View style={styles.infoRow}>
            <Ionicons name="ribbon-outline" size={12} color={reg.notaAdmissao >= 10 ? Colors.success : Colors.danger} />
            <Text style={styles.infoText}>Nota: {reg.notaAdmissao}/20 — {reg.notaAdmissao >= 10 ? 'Admitido' : 'Reprovado'}</Text>
          </View>
        )}
        {reg.status === 'pendente_pagamento' && reg.rupeInscricao && (
          <View style={[styles.infoRow, { backgroundColor: 'rgba(230,126,34,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 2 }]}>
            <Ionicons name="receipt-outline" size={12} color="#E67E22" />
            <Text style={[styles.infoText, { color: '#E67E22', fontFamily: 'Inter_600SemiBold' }]}>RUPE Inscrição: {reg.rupeInscricao}</Text>
          </View>
        )}
        {reg.senhaProvisoria && (
          <View style={styles.infoRow}>
            <Ionicons name="lock-closed-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.infoText}>Senha: {reg.senhaProvisoria}</Text>
          </View>
        )}

        <View style={styles.regActions}>
          <TouchableOpacity style={styles.regActionBtn} onPress={() => setModalDetalhes({ visible: true, reg })}>
            <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.regActionText}>Ver</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.regActionBtn, styles.btnBoletim]} onPress={() => router.push(`/boletim-inscricao?id=${reg.id}` as any)}>
            <Ionicons name="document-text-outline" size={14} color={Colors.gold} />
            <Text style={[styles.regActionText, { color: Colors.gold }]}>Boletim</Text>
          </TouchableOpacity>

          {/* Pag. Inscrição actions */}
          {reg.status === 'pendente_pagamento' && (
            reg.pagamentoInscricaoConfirmado ? (
              <View style={[styles.regActionBtn, { borderColor: Colors.success + '50', backgroundColor: 'rgba(39,174,96,0.08)' }]}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={[styles.regActionText, { color: Colors.success }]}>Pag. Confirmado</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.regActionBtn, { borderColor: '#E67E22' + '70', backgroundColor: 'rgba(230,126,34,0.1)' }]}
                onPress={() => setModalConfirmarPagamentoInscricao({ visible: true, reg })}
                disabled={isActing}
              >
                <Ionicons name="cash-outline" size={14} color="#E67E22" />
                <Text style={[styles.regActionText, { color: '#E67E22' }]}>Confirmar Pag.</Text>
              </TouchableOpacity>
            )
          )}

          {/* Pendentes actions */}
          {reg.status === 'pendente' && <>
            <TouchableOpacity style={[styles.regActionBtn, styles.btnSuccess]} onPress={() => aprovar(reg)} disabled={isActing}>
              <Ionicons name="checkmark" size={14} color={Colors.success} />
              <Text style={[styles.regActionText, { color: Colors.success }]}>Aprovar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.regActionBtn, styles.btnDanger]} onPress={() => { setModalRejeitar({ visible: true, reg }); setMotivoRejeicao(''); }}>
              <Ionicons name="close" size={14} color={Colors.danger} />
              <Text style={[styles.regActionText, { color: Colors.danger }]}>Rejeitar</Text>
            </TouchableOpacity>
          </>}

          {/* Aprovados actions */}
          {reg.status === 'aprovado' && <>
            <TouchableOpacity style={[styles.regActionBtn, styles.btnGold]} onPress={() => { setModalProva({ visible: true, reg }); setDataProva(reg.dataProva || ''); }}>
              <Ionicons name="calendar-outline" size={14} color={Colors.gold} />
              <Text style={[styles.regActionText, { color: Colors.gold }]}>Data Prova</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.regActionBtn, styles.btnSuccess]} onPress={() => { setModalNota({ visible: true, reg }); setNota(reg.notaAdmissao !== undefined ? String(reg.notaAdmissao) : ''); }}>
              <Ionicons name="ribbon-outline" size={14} color={Colors.success} />
              <Text style={[styles.regActionText, { color: Colors.success }]}>Lançar Nota</Text>
            </TouchableOpacity>
          </>}

          {/* Admitido — aviso bloqueio Art. 23º §5 */}
          {reg.status === 'admitido' && config.bloqueioMatriculaHabilitado && (() => {
            const b = bloqueioMap[reg.id];
            if (!b) return null;
            if (!b.verificado) return null;
            if (b.bloqueado) {
              return (
                <View style={{ marginTop: 8, backgroundColor: Colors.danger + '12', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.danger + '40', gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="lock-closed" size={13} color={Colors.danger} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.danger }}>Bloqueado — Art. 23º §5</Text>
                  </View>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.danger, lineHeight: 14 }}>
                    Disciplinas não aprovadas na {b.classeAnterior}: {(b.disciplinas ?? []).join(', ')}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 14 }}>
                    O aluno não poderá concluir a matrícula enquanto esta situação não for regularizada.
                  </Text>
                </View>
              );
            }
            return (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.success + '12', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: Colors.success + '30' }}>
                <Ionicons name="checkmark-circle-outline" size={13} color={Colors.success} />
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.success }}>Sem bloqueio Art. 23º §5 — pode concluir a matrícula</Text>
              </View>
            );
          })()}

          {/* Admitido actions — confirmar pagamento */}
          {reg.status === 'admitido' && (
            reg.pagamentoMatriculaConfirmado ? (
              <View style={[styles.regActionBtn, { borderColor: Colors.success + '50', backgroundColor: 'rgba(39,174,96,0.08)' }]}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={[styles.regActionText, { color: Colors.success }]}>Pagamento Confirmado</Text>
              </View>
            ) : (
              <TouchableOpacity style={[styles.regActionBtn, { borderColor: Colors.gold + '70', backgroundColor: 'rgba(240,165,0,0.1)' }]} onPress={() => confirmarPagamentoMatricula(reg)} disabled={isActing}>
                <Ionicons name="cash-outline" size={14} color={Colors.gold} />
                <Text style={[styles.regActionText, { color: Colors.gold }]}>Confirmar Pagamento</Text>
              </TouchableOpacity>
            )
          )}

          {/* Matriculado — imprimir boletim de matrícula */}
          {reg.status === 'matriculado' && (
            <>
              <TouchableOpacity
                style={[styles.regActionBtn, { borderColor: 'rgba(39,174,96,0.4)', backgroundColor: 'rgba(39,174,96,0.08)' }]}
                onPress={() => imprimirBoletimMatriculaAdmissao(reg)}
              >
                <Ionicons name="print-outline" size={14} color={Colors.success} />
                <Text style={[styles.regActionText, { color: Colors.success }]}>Boletim Matrícula</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.regActionBtn, { borderColor: 'rgba(8,145,178,0.4)', backgroundColor: 'rgba(8,145,178,0.07)' }]}
                onPress={() => {
                  const destino = reg.alunoId
                    ? `/comprovativo-matricula?alunoId=${reg.alunoId}&tipo=${reg.tipoInscricao === 'reconfirmacao' ? 'reconfirmacao' : 'matricula'}`
                    : `/comprovativo-matricula?classe=${encodeURIComponent(reg.classe)}&cursoNome=${encodeURIComponent(reg.cursoNome || '')}&tipo=${reg.tipoInscricao === 'reconfirmacao' ? 'reconfirmacao' : 'matricula'}`;
                  router.push(destino as any);
                }}
              >
                <Ionicons name="school-outline" size={14} color="#0891b2" />
                <Text style={[styles.regActionText, { color: '#0891b2' }]}>Comprovativo + Disciplinas</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Processo de Admissão" subtitle="Gestão de inscrições e resultados" />

      <HScrollTabBar style={styles.tabsRow} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled" stickyCount={1}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, activeTab === t.key && styles.tabActive]} onPress={() => setActiveTab(t.key)}>
            <Ionicons name={t.icon as any} size={13} color={activeTab === t.key ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]} numberOfLines={1}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, activeTab === t.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === t.key && styles.tabBadgeTextActive]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      <View style={styles.searchWrap}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={styles.searchInput}
          placeholder="Pesquisar nome ou classe..."
          iconColor={Colors.textMuted}
        />
      </View>

      {activeTab === 'aprovados' && Platform.OS === 'web' && (
        <TouchableOpacity
          style={[styles.listaBtn, { backgroundColor: '#1A4B2F' }]}
          onPress={() => router.push('/lista-inscritos' as any)}
        >
          <Ionicons name="list-outline" size={15} color="#fff" />
          <Text style={styles.listaBtnText}>Gerar Lista de Candidatos por Sala de Exame</Text>
        </TouchableOpacity>
      )}

      {activeTab === 'resultado' && Platform.OS === 'web' && (() => {
        const tem13 = (config as any).temDecimaTermeira !== false;
        const II_CICLO_V = tem13
          ? ['10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe']
          : ['10ª Classe', '11ª Classe', '12ª Classe'];
        const cursosIICiclo = [...new Set(
          registros
            .filter(r => II_CICLO_V.includes(r.classe?.trim() || '') && (r.status === 'admitido' || r.status === 'matriculado'))
            .map(r => r.cursoNome?.trim() || 'Sem Curso')
        )].sort((a, b) => a.localeCompare(b, 'pt'));

        const corI = '#22c55e';
        const corII = '#6366f1';
        const corAct = vitrineCiclo === 'I' ? corI : corII;

        return (
          <View style={{ marginHorizontal: 12, marginBottom: 8, backgroundColor: '#131f3a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: corAct + '55' }}>
            <Text style={{ color: '#9aa5be', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
              Vitrine — Seleccionar Tipo
            </Text>

            {/* Toggle I / II Ciclo */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => { setVitrineCiclo('I'); setVitrineCurso(''); }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 7, backgroundColor: vitrineCiclo === 'I' ? corI : '#1e2d4f', alignItems: 'center', borderWidth: 1, borderColor: vitrineCiclo === 'I' ? corI : '#2d3a5c' }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>I Ciclo</Text>
                <Text style={{ color: vitrineCiclo === 'I' ? '#d1fae5' : '#6b7fa3', fontSize: 9, marginTop: 1 }}>7ª Classe — Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setVitrineCiclo('II')}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 7, backgroundColor: vitrineCiclo === 'II' ? corII : '#1e2d4f', alignItems: 'center', borderWidth: 1, borderColor: vitrineCiclo === 'II' ? corII : '#2d3a5c' }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>II Ciclo</Text>
                <Text style={{ color: vitrineCiclo === 'II' ? '#e0e7ff' : '#6b7fa3', fontSize: 9, marginTop: 1 }}>10ª Classe — Por Curso</Text>
              </TouchableOpacity>
            </View>

            {/* Seleção de curso (II Ciclo) */}
            {vitrineCiclo === 'II' && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: '#9aa5be', fontSize: 10, marginBottom: 6 }}>
                  Curso {cursosIICiclo.length === 0 ? '(nenhum admitido registado)' : '(opcional — vazio = todos os cursos):'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setVitrineCurso('')}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: vitrineCurso === '' ? corII : '#1e2d4f', borderWidth: 1, borderColor: vitrineCurso === '' ? corII : '#2d3a5c' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>Todos os Cursos</Text>
                  </TouchableOpacity>
                  {cursosIICiclo.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setVitrineCurso(c)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: vitrineCurso === c ? corII : '#1e2d4f', borderWidth: 1, borderColor: vitrineCurso === c ? corII : '#2d3a5c' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10 }}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Botão gerar */}
            <TouchableOpacity
              style={[styles.listaBtn, { marginHorizontal: 0, backgroundColor: vitrineCiclo === 'I' ? '#1A4B2F' : '#312e81', marginTop: 2 }]}
              onPress={() => gerarListaResultadosPDF(registros, nomeEscola, vitrineCiclo, vitrineCurso || undefined, (config as any).temDecimaTermeira !== false)}
            >
              <Ionicons name="newspaper-outline" size={15} color="#fff" />
              <Text style={styles.listaBtnText}>
                {vitrineCiclo === 'I'
                  ? 'Gerar Vitrine — I Ciclo (PDF)'
                  : `Gerar Vitrine — II Ciclo${vitrineCurso ? ` · ${vitrineCurso}` : ' · Todos os Cursos'} (PDF)`}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {isLoading ? (
        <View style={{ padding: 12 }}>
          <SkeletonList rows={5} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Nenhuma inscrição neste separador</Text>
          <TouchableOpacity onPress={load} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />
            <Text style={styles.refreshBtnText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        <FlatList
          data={paginated}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 12 }}
          showsVerticalScrollIndicator={false}
          onRefresh={load}
          refreshing={isLoading}
          ListHeaderComponent={activeTab === 'resultado' && Object.keys(vagasMap).length > 0 ? (
            <View style={{ backgroundColor: '#0d1b2a', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1e3a5f' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: '#9aa5be', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                Vagas por Classe
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(vagasMap).map(([cls, v]) => {
                  const pct = v.capacidade > 0 ? Math.round((v.vagasOcupadas / v.capacidade) * 100) : 0;
                  const cor = v.vagasDisponiveis === 0 ? Colors.danger : v.vagasDisponiveis <= 5 ? Colors.warning : Colors.success;
                  return (
                    <View key={cls} style={{ backgroundColor: '#132040', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: cor + '40', minWidth: 110 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#e2e8f0' }}>{cls}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <View style={{ flex: 1, height: 4, backgroundColor: '#1e3a5f', borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ width: `${pct}%`, height: 4, backgroundColor: cor, borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontSize: 10, color: '#9aa5be' }}>{pct}%</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: cor, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>
                        {v.vagasDisponiveis} vaga{v.vagasDisponiveis !== 1 ? 's' : ''} livres
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6b7fa3' }}>{v.vagasOcupadas}/{v.capacidade} ocupadas</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        />
        <PaginationBar current={safePage} total={totalPages} onChange={setCurrentPage} />
        </>
      )}

      {/* ── Rejeitar Modal ── */}
      <Modal visible={modalRejeitar.visible} transparent animationType="slide" onRequestClose={() => setModalRejeitar({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={mStyles.container}>
            <Text style={mStyles.title}>Rejeitar Inscrição</Text>
            {modalRejeitar.reg && <Text style={mStyles.name}>{modalRejeitar.reg.nomeCompleto}</Text>}
            <Text style={mStyles.label}>Motivo da Rejeição<RequiredMark /></Text>
            <TextInput
              style={mStyles.textarea}
              value={motivoRejeicao}
              onChangeText={setMotivoRejeicao}
              placeholder="Descreva o motivo..."
              placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={mStyles.actions}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setModalRejeitar({ visible: false, reg: null })}>
                <Text style={mStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: Colors.danger }]} onPress={rejeitar} disabled={isActing}>
                {isActing ? <AppLoader color="#fff" size="small" /> : <Text style={mStyles.actionText}>Rejeitar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Data da Prova Modal ── */}
      <Modal visible={modalProva.visible} transparent animationType="slide" onRequestClose={() => setModalProva({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={mStyles.container}>
            <Text style={mStyles.title}>Publicar Data do Exame</Text>
            {modalProva.reg && <Text style={mStyles.name}>{modalProva.reg.nomeCompleto}</Text>}
            <Text style={mStyles.label}>Data do Exame<RequiredMark /></Text>
            <DatePickerField
              label=""
              value={dataProva}
              onChange={setDataProva}
              required
              style={{ marginBottom: 0 }}
            />
            <View style={mStyles.actions}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setModalProva({ visible: false, reg: null })}>
                <Text style={mStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: Colors.gold }]} onPress={publicarDataProva} disabled={isActing}>
                {isActing ? <AppLoader color="#fff" size="small" /> : <Text style={mStyles.actionText}>Publicar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Lançar Nota Modal ── */}
      <Modal visible={modalNota.visible} transparent animationType="slide" onRequestClose={() => setModalNota({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={mStyles.container}>
            <Text style={mStyles.title}>Lançar Nota de Admissão</Text>
            {modalNota.reg && <Text style={mStyles.name}>{modalNota.reg.nomeCompleto}</Text>}
            <Text style={mStyles.label}>Nota (0 – 20)<RequiredMark /></Text>
            <TextInput
              style={mStyles.input}
              value={nota}
              onChangeText={setNota}
              placeholder="Ex: 14.5"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={lancarNota}
            />
            <Text style={mStyles.hint}>Nota ≥ 10: Admitido · Nota {'<'} 10: Reprovado</Text>
            <View style={mStyles.actions}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setModalNota({ visible: false, reg: null })}>
                <Text style={mStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: Colors.success }]} onPress={lancarNota} disabled={isActing}>
                {isActing ? <AppLoader color="#fff" size="small" /> : <Text style={mStyles.actionText}>Lançar Nota</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Confirmar Pagamento Inscrição Modal ── */}
      <Modal visible={modalConfirmarPagamentoInscricao.visible} transparent animationType="slide" onRequestClose={() => setModalConfirmarPagamentoInscricao({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={mStyles.container}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(230,126,34,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="receipt-outline" size={18} color="#E67E22" />
              </View>
              <Text style={mStyles.title}>Confirmar Pagamento da Inscrição</Text>
            </View>
            {modalConfirmarPagamentoInscricao.reg && (
              <>
                <Text style={mStyles.name}>{modalConfirmarPagamentoInscricao.reg.nomeCompleto}</Text>
                <View style={{ backgroundColor: 'rgba(230,126,34,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(230,126,34,0.25)', padding: 12, gap: 6 }}>
                  <Text style={[mStyles.label, { marginBottom: 2 }]}>Referência RUPE — Taxa de Inscrição</Text>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#E67E22', letterSpacing: 0.5 }}>
                    {modalConfirmarPagamentoInscricao.reg.rupeInscricao || '(não gerado)'}
                  </Text>
                </View>
                <Text style={[mStyles.hint, { marginTop: 4 }]}>
                  Verifique o comprovativo de pagamento apresentado pelo candidato antes de confirmar. Após a confirmação, a candidatura passa para análise da secretaria. Esta acção não pode ser revertida.
                </Text>
              </>
            )}
            <View style={mStyles.actions}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setModalConfirmarPagamentoInscricao({ visible: false, reg: null })}>
                <Text style={mStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: '#E67E22' }]} onPress={executarConfirmarPagamentoInscricao} disabled={isActing}>
                {isActing ? <AppLoader color="#fff" size="small" /> : <Text style={mStyles.actionText}>Confirmar Pagamento</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Confirmar Pagamento Modal ── */}
      <Modal visible={modalConfirmarPagamento.visible} transparent animationType="slide" onRequestClose={() => setModalConfirmarPagamento({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={mStyles.container}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(240,165,0,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="cash-outline" size={18} color={Colors.gold} />
              </View>
              <Text style={mStyles.title}>Confirmar Pagamento</Text>
            </View>
            {modalConfirmarPagamento.reg && (
              <>
                <Text style={mStyles.name}>{modalConfirmarPagamento.reg.nomeCompleto}</Text>
                <View style={{ backgroundColor: 'rgba(240,165,0,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(240,165,0,0.2)', padding: 12, gap: 6 }}>
                  <Text style={[mStyles.label, { marginBottom: 2 }]}>Referência RUPE — Matrícula</Text>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.5 }}>
                    {modalConfirmarPagamento.reg.rupeMatricula || '(não gerado)'}
                  </Text>
                </View>
                <Text style={[mStyles.hint, { marginTop: 4 }]}>
                  Confirme apenas após verificar fisicamente o comprovativo de pagamento RUPE apresentado pelo estudante. Esta acção não pode ser revertida.
                </Text>
              </>
            )}
            <View style={mStyles.actions}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setModalConfirmarPagamento({ visible: false, reg: null })}>
                <Text style={mStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.actionBtn, { backgroundColor: Colors.success }]} onPress={executarConfirmarPagamento} disabled={isActing}>
                {isActing ? <AppLoader color="#fff" size="small" /> : <Text style={mStyles.actionText}>Confirmar Pagamento</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Detalhes Modal ── */}
      <Modal visible={modalDetalhes.visible} transparent animationType="slide" onRequestClose={() => setModalDetalhes({ visible: false, reg: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={[mStyles.container, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={mStyles.title}>Detalhes da Inscrição</Text>
              <TouchableOpacity onPress={() => setModalDetalhes({ visible: false, reg: null })}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {modalDetalhes.reg && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {[
                  ['Nome', modalDetalhes.reg.nomeCompleto],
                  ['Data Nascimento', modalDetalhes.reg.dataNascimento],
                  ['Género', modalDetalhes.reg.genero === 'M' ? 'Masculino' : 'Feminino'],
                  ['Tipo de Inscrição', modalDetalhes.reg.tipoInscricao === 'reconfirmacao' ? 'Reconfirmação (Reprovado ano anterior)' : 'Novo Aluno'],
                  ['Nível / Classe', `${modalDetalhes.reg.nivel} — ${modalDetalhes.reg.classe}`],
                  ['Província / Município', `${modalDetalhes.reg.provincia} / ${modalDetalhes.reg.municipio}`],
                  ['Telefone', modalDetalhes.reg.telefone],
                  ['Email', modalDetalhes.reg.email],
                  ['Encarregado', modalDetalhes.reg.nomeEncarregado],
                  ['Tel. Encarregado', modalDetalhes.reg.telefoneEncarregado],
                  ['Senha Provisória', modalDetalhes.reg.senhaProvisoria || '—'],
                  ['Status', STATUS_LABEL[modalDetalhes.reg.status]?.label ?? modalDetalhes.reg.status],
                  ['Data Exame', modalDetalhes.reg.dataProva || 'Não publicada'],
                  ['Nota Admissão', modalDetalhes.reg.notaAdmissao !== undefined ? `${modalDetalhes.reg.notaAdmissao}/20` : '—'],
                  ['Pagamento Matrícula', modalDetalhes.reg.pagamentoMatriculaConfirmado ? `✓ Confirmado em ${modalDetalhes.reg.pagamentoMatriculaConfirmadoEm || '—'} por ${modalDetalhes.reg.pagamentoMatriculaConfirmadoPor || '—'}` : '⏳ Aguardando confirmação'],
                ].map(([label, value]) => (
                  <View key={label} style={mStyles.detailRow}>
                    <Text style={mStyles.detailLabel}>{label}</Text>
                    <Text style={mStyles.detailValue}>{value}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabsRow: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabsContent: { flexDirection: 'row', gap: 2, alignItems: 'center', paddingHorizontal: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: 'rgba(240,165,0,0.1)' },
  tabText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: Colors.gold },
  tabBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  tabBadgeTextActive: { color: '#fff' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, minHeight: 40 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  refreshBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  listaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1E3A5F', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginBottom: 6, flexWrap: 'wrap' },
  listaBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff', flex: 1 },

  regCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10 },
  regCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  regAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(240,165,0,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)' },
  regAvatarText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.gold },
  regNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  regSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 1 },
  regEmail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  regActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  regActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: Colors.border },
  regActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  btnSuccess: { borderColor: Colors.success + '50', backgroundColor: 'rgba(39,174,96,0.08)' },
  btnDanger: { borderColor: Colors.danger + '50', backgroundColor: 'rgba(231,76,60,0.08)' },
  btnGold: { borderColor: Colors.gold + '50', backgroundColor: 'rgba(240,165,0,0.08)' },
  btnBoletim: { borderColor: 'rgba(240,165,0,0.35)', backgroundColor: 'rgba(240,165,0,0.06)' },
});

const pgStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: 4,
    paddingVertical: 10, paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: Colors.background,
  },
  navBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  navBtnDisabled: { opacity: 0.35 },
  pageBtn: {
    minWidth: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  pageBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pageBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#9aa5be' },
  pageBtnTextActive: { color: '#0a0f1e' },
  ellipsis: { fontSize: 12, color: '#3a4a6b', paddingHorizontal: 2 },
  label: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: '#4a5a7b',
    marginLeft: 8,
  },
});

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: '#0F1F40', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.1)', width: '100%', maxWidth: 480 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  name: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5, textTransform: 'uppercase' },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, height: 52, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },
  textarea: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, height: 100, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginTop: 2 },
});
