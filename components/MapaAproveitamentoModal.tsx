import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Curso { id: string; nome: string; codigo?: string; ativo: boolean }
interface GrupoCurso { id: string; nome: string; nivel: string; isVirtual: boolean }

// Deriva os "grupos de curso" a partir das turmas em escopo.
// Cada grupo agrega turmas pelo seu cursoId real; turmas sem cursoId
// (tipicamente Primário e I Ciclo, que são ensino geral) ficam num
// pseudo-curso "Ensino Geral - <nivel>" para que o mapa também as inclua.
function derivarGruposCurso(
  turmasEscopo: any[],
  cursosDisponiveis: Curso[]
): GrupoCurso[] {
  const cursosMap = new Map(cursosDisponiveis.map(c => [c.id, c]));
  const grupos = new Map<string, GrupoCurso>();
  for (const t of turmasEscopo) {
    const nivel = (t.nivel || '').trim() || '—';
    if (t.cursoId && cursosMap.has(t.cursoId)) {
      const c = cursosMap.get(t.cursoId)!;
      if (!grupos.has(c.id)) grupos.set(c.id, { id: c.id, nome: c.nome, nivel, isVirtual: false });
    } else {
      const key = `__sem-curso__${nivel}`;
      if (!grupos.has(key)) grupos.set(key, { id: key, nome: `Ensino Geral (${nivel})`, nivel, isVirtual: true });
    }
  }
  return Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

// Filtro inverso: turma pertence a um grupo se cursoId === id (real)
// OU se grupo é virtual (sem-curso-<nivel>) e turma não tem cursoId e nivel coincide.
function turmaPertenceAoGrupo(t: any, g: GrupoCurso): boolean {
  if (g.isVirtual) {
    return !t.cursoId && (t.nivel || '').trim() === g.nivel;
  }
  return t.cursoId === g.id;
}

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

const CLASSES_II_CICLO = ['10', '11', '12', '13'];
const TURNOS = ['Todos', 'Manhã', 'Tarde', 'Noite'];
const CICLOS = ['Todos', 'Primário', 'I Ciclo', 'II Ciclo'] as const;
type Ciclo = typeof CICLOS[number];
const TRIMESTRES = [1, 2, 3];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmtDateFooter(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd} / ${mm} / ${d.getFullYear()}`;
}

// Normaliza formato do ano lectivo: "2025-2026" ↔ "2025/2026"
function anoMatch(a: string, b: string) {
  return (a || '').replace(/-/g, '/').trim() === (b || '').replace(/-/g, '/').trim();
}

// ─── Common CSS ───────────────────────────────────────────────────────────────
// Paleta verde alinhada à Mini-Pauta:
//   #c6efce  cabeçalho claro
//   #1a6b3c  cabeçalho escuro (texto branco)
//   #a8d5a2  destaque secundário (MFD)
//   #d4edda  células destacadas (totais por trimestre)
//   #e8f5e9  linha listrada
//   #155724  texto aprovado
//   #cc0000  texto reprovado

const BASE_CSS = `
<meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body{font-family:'Times New Roman',serif;background:#fff;color:#000;font-size:10px;}
  .btn-toolbar{display:flex;gap:8px;justify-content:center;margin:14px auto;}
  .print-btn{display:inline-block;padding:9px 22px;font-size:12px;background:#1a6b3c;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;}
  .print-btn:hover{background:#155724;}
  .download-btn{display:inline-block;padding:9px 22px;font-size:12px;background:#166534;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;}
  .download-btn:hover{background:#14532d;}
  .page{padding:14mm 16mm;page-break-after:always;position:relative;}
  .page:last-child{page-break-after:auto;}

  /* Visto do Director da Escola (canto superior esquerdo) */
  .visto-box{position:absolute;top:5mm;left:8mm;border:1px solid #1a6b3c;background:#f0f9f1;padding:3px 8px;min-width:140px;text-align:center;border-radius:3px;line-height:1.2;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  .visto-box .visto-label{font-size:9px;font-weight:bold;text-transform:uppercase;color:#1a3a1a;letter-spacing:0.5px;}
  .visto-box .visto-data{font-size:7.5px;color:#1a3a1a;}
  .visto-box .visto-name{font-size:8px;font-weight:bold;color:#1a3a1a;margin-top:1px;}
  .visto-box .visto-role{font-size:7px;color:#1a6b3c;text-transform:uppercase;font-weight:bold;}

  /* Cabeçalho Oficial */
  .header{text-align:center;margin-bottom:10px;padding-top:2mm;}
  .header img{width:60px;height:60px;object-fit:contain;margin-bottom:2px;}
  .header .rep{font-size:10px;line-height:1.6;text-transform:uppercase;}
  .header .escola-name{font-size:12px;font-weight:bold;text-decoration:underline;text-transform:uppercase;margin-top:2px;color:#1a3a1a;}

  /* Título do Mapa */
  .mapa-title{font-size:10.5px;font-weight:bold;margin:10px 0 2px;color:#1a3a1a;}
  .mapa-sub{font-size:10px;margin-bottom:2px;}
  .curso-badge{text-align:right;font-size:9.5px;font-style:italic;font-weight:bold;margin-bottom:6px;color:#1a6b3c;}

  /* Tabelas (paleta Mini-Pauta) */
  table{width:100%;border-collapse:collapse;margin-bottom:8px;}
  th,td{border:1px solid #777;padding:2px 3px;text-align:center;vertical-align:middle;font-size:8.5px;}
  th{background:#c6efce !important;color:#1a3a1a;font-weight:bold;text-align:center;}
  th.dark{background:#1a6b3c !important;color:#fff !important;}
  th.mid{background:#a8d5a2 !important;color:#1a3a1a;}
  td.left{text-align:left;padding-left:4px;}
  td.bold{font-weight:bold;}
  td.mt{background:#d4edda !important;font-weight:bold;}
  td.mfd{background:#c6efce !important;font-weight:bold;}
  tr.total-row td{background:#a8d5a2 !important;color:#1a3a1a;font-weight:bold;}
  tr:nth-child(even):not(.total-row) td:not(.mt):not(.mfd){background:#e8f5e9;}
  .aprovado{color:#155724;font-weight:bold;}
  .reprovado{color:#cc0000;font-weight:bold;}

  /* Legenda D-AM-T-E (destacada) */
  .legenda{margin-top:8px;padding:8px 14px;background:#fffbe6;border:2px solid #c8900a;border-radius:5px;font-size:9px;line-height:1.8;font-weight:bold;}
  .legenda strong{color:#7a4a00;text-transform:uppercase;letter-spacing:0.6px;font-size:10px;margin-right:10px;}
  .legenda .item{display:inline-block;margin-right:16px;color:#222;}
  .legenda .item b{color:#1a3a1a;font-weight:bold;text-decoration:underline;}

  /* Rodapé */
  .local-date{margin-top:18px;font-size:10px;font-style:italic;}
  .footer{display:flex;justify-content:flex-end;margin-top:28px;}
  .sig{text-align:center;min-width:240px;}
  .sig-line{border-top:1px solid #000;padding-top:4px;font-size:10px;font-weight:bold;}
  .sig-name{font-size:10px;font-weight:bold;}
  .sig-role{font-size:9px;text-transform:uppercase;color:#1a6b3c;margin-top:1px;}

  @media print{
    .no-print{display:none!important;}
    body{padding:0;}
    .page{padding:8mm 10mm;}
    @page{size:A4 landscape;margin: 0;}
  }
</style>`;

// ─── Mapa por Trimestre (Imagem 1) ────────────────────────────────────────────
// Colunas: CURSO | CLASSE | Período | Matriculados MF/F | Avaliados MF/F |
//          Aprovados MF/F | Reprovados MF/F | Desistentes MF/F |
//          Anuл.Matríc MF/F | Transferidos MF/F | Excluídos MF/F | % Aptos | % N/Aptos

function buildMapaTrimestreHTML(params: {
  trimestre: number;
  turno: string;
  anoLetivo: string;
  cursosDisponiveis: Curso[];
  cursoId: string;
  ciclo: Ciclo;
  alunos: any[];
  turmas: any[];
  notas: any[];
  config: any;
}): string {
  const { trimestre, turno, anoLetivo, cursosDisponiveis, cursoId, ciclo, alunos, turmas, notas, config } = params;

  const nomeEscola = config?.nomeEscola || 'Super Escola';
  const logoUrl = config?.logoUrl || '';
  const nota_min = config?.notaMinimaAprovacao ?? 10;
  const municipioEscola = (config?.municipioEscola || '').trim() || nomeEscola;
  const directorPedagogico = (config?.directorPedagogico || '').trim();
  const directorGeral = (config?.directorGeral || '').trim();
  const hoje = new Date();
  const hojeRodape = fmtDateFooter(hoje);
  const trLabel = `${trimestre}º Trimestre`;

  // Turmas em escopo: aplica todos os filtros (ano, turno, ciclo)
  // anoMatch normaliza "2025-2026" ↔ "2025/2026" para evitar falha de comparação
  const turmasEscopo = turmas.filter(t =>
    (!anoLetivo || anoMatch(t.anoLetivo, anoLetivo)) &&
    (turno === 'Todos' || t.turno === turno) &&
    (ciclo === 'Todos' || (t.nivel || '').trim() === ciclo)
  );

  // Deriva grupos (cursos reais + Ensino Geral para turmas sem cursoId)
  let gruposFiltrados = derivarGruposCurso(turmasEscopo, cursosDisponiveis);
  if (cursoId) {
    gruposFiltrados = gruposFiltrados.filter(g => g.id === cursoId);
  }

  // Período dinâmico: deriva turnos reais das turmas em escopo
  const turnosNoEscopo = Array.from(new Set(
    turmasEscopo.map(t => (t.turno || '').trim()).filter(Boolean)
  ));
  const turnoLabel = turno !== 'Todos'
    ? turno
    : (turnosNoEscopo.length > 0 ? turnosNoEscopo.join(', ') : 'Manhã, Tarde, Noite');
  const cicloLabel = ciclo === 'Todos' ? '' : ciclo;

  // Agrupa turmas por grupo de curso
  const pagesHTML = gruposFiltrados.map(grupo => {
    const turmasDoCurso = turmasEscopo.filter(t => turmaPertenceAoGrupo(t, grupo)).sort((a, b) => {
      const classeDiff = parseInt(a.classe) - parseInt(b.classe);
      if (classeDiff !== 0) return classeDiff;
      return (a.nome || '').localeCompare(b.nome || '');
    });

    if (turmasDoCurso.length === 0) return '';

    let totMF = 0, totF = 0;
    let totAvalMF = 0, totAvalF = 0;
    let totAproMF = 0, totAproF = 0;
    let totRepMF = 0, totRepF = 0;
    let totDesMF = 0, totDesF = 0;
    let totAnulMF = 0, totAnulF = 0;
    let totTransMF = 0, totTransF = 0;
    let totExcMF = 0, totExcF = 0;

    const rows = turmasDoCurso.map(turma => {
      const alunosDaTurma = alunos.filter(a => a.turmaId === turma.id);
      const matMF = alunosDaTurma.length;
      const matF = alunosDaTurma.filter(a => a.genero === 'F').length;

      const notasDaTurma = notas.filter(n => n.turmaId === turma.id && n.trimestre === trimestre);
      const alunosComNotas = new Set(notasDaTurma.map((n: any) => n.alunoId));
      const avalMF = alunosComNotas.size;
      const avalF = alunosDaTurma.filter(a => alunosComNotas.has(a.id) && a.genero === 'F').length;

      // Calcula aprovados/reprovados por média
      let aproMF = 0, aproF = 0, repMF = 0, repF = 0;
      alunosDaTurma.forEach(aluno => {
        if (!alunosComNotas.has(aluno.id)) return;
        const notasAluno = notasDaTurma.filter((n: any) => n.alunoId === aluno.id);
        const vals = notasAluno.map((n: any) => n.mt1 ?? n.nf ?? null).filter((v: any): v is number => typeof v === 'number' && v > 0);
        if (vals.length === 0) return;
        const media = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        if (media >= nota_min) {
          aproMF++;
          if (aluno.genero === 'F') aproF++;
        } else {
          repMF++;
          if (aluno.genero === 'F') repF++;
        }
      });

      // Desistentes = matriculados não avaliados e não ativos
      const desMF = alunosDaTurma.filter(a => !a.ativo && !alunosComNotas.has(a.id)).length;
      const desF = alunosDaTurma.filter(a => !a.ativo && !alunosComNotas.has(a.id) && a.genero === 'F').length;

      // Totais globais
      totMF += matMF; totF += matF;
      totAvalMF += avalMF; totAvalF += avalF;
      totAproMF += aproMF; totAproF += aproF;
      totRepMF += repMF; totRepF += repF;
      totDesMF += desMF; totDesF += desF;
      totAnulMF += 0; totAnulF += 0;
      totTransMF += 0; totTransF += 0;
      totExcMF += 0; totExcF += 0;

      const pctAptos = avalMF > 0 ? Math.round((aproMF / avalMF) * 100) : 0;
      const pctNAptos = avalMF > 0 ? Math.round((repMF / avalMF) * 100) : 0;

      return `<tr>
        <td class="left">${turma.nome}</td>
        <td>${turma.classe}ª</td>
        <td>${turma.turno || 'Manhã'}</td>
        <td>${matMF}</td><td>${matF}</td>
        <td>${avalMF}</td><td>${avalF}</td>
        <td>${aproMF}</td><td>${aproF}</td>
        <td>${repMF}</td><td>${repF}</td>
        <td>${desMF}</td><td>${desF}</td>
        <td>0</td><td>0</td>
        <td>0</td><td>0</td>
        <td>0</td><td>0</td>
        <td>${pctAptos}%</td>
        <td>${pctNAptos}%</td>
      </tr>`;
    }).join('');

    const totPctAptos = totAvalMF > 0 ? Math.round((totAproMF / totAvalMF) * 100) : 0;
    const totPctNAptos = totAvalMF > 0 ? Math.round((totRepMF / totAvalMF) * 100) : 0;

    // Classes presentes nas turmas deste curso (dinâmico — substitui "10ª,11ª,12ª,13ªClasses")
    const classesDoCurso = Array.from(new Set(turmasDoCurso.map(t => String(t.classe))))
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(c => `${c}ª`)
      .join(', ');
    const classesLabel = classesDoCurso ? `${classesDoCurso} Classes` : '';
    const anoLetivoLabel = anoLetivo && anoLetivo.trim() ? anoLetivo.trim() : '—';

    return `<div class="page">
      <div class="visto-box">
        <div class="visto-label">VISTO</div>
        <div class="visto-data">Data ___/___/______</div>
        <div class="visto-name">${directorGeral || '_______________________'}</div>
        <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
      </div>

      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo"/>` : ''}
        <div class="rep">REPÚBLICA DE ANGOLA<br/>MINISTÉRIO DA EDUCAÇÃO</div>
        <div class="escola-name">${nomeEscola}</div>
      </div>

      <div class="mapa-title">Mapa de Aproveitamento Escolar dos Alunos Referente ao ${trLabel}, do Ano Lectivo ${anoLetivoLabel}${classesLabel ? ` (${classesLabel})` : ''} — Período ${turnoLabel}</div>
      <div class="mapa-sub"><strong>Nome da Escola:</strong> ${nomeEscola} &nbsp;&nbsp; <strong>Período:</strong> ${turnoLabel}${cicloLabel ? ` &nbsp;&nbsp; <strong>Ciclo:</strong> ${cicloLabel}` : ''}</div>
      <div class="curso-badge">Curso: ${grupo.nome} &nbsp;·&nbsp; Ciclo: ${grupo.nivel}</div>

      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width:90px;">TURMA</th>
            <th rowspan="2" style="width:36px;">CLASSE</th>
            <th rowspan="2" style="width:42px;">Período</th>
            <th colspan="2">Alunos<br/>Matriculados</th>
            <th colspan="2">Alunos<br/>Avaliados</th>
            <th colspan="2">Alunos<br/>Aprovados</th>
            <th colspan="2">Alunos<br/>Reprovados</th>
            <th colspan="2">Alunos<br/>Desistentes</th>
            <th colspan="2">Alunos Anuл.<br/>Matrícula</th>
            <th colspan="2">Alunos<br/>Transferidos</th>
            <th colspan="2">Alunos<br/>Excluídos</th>
            <th rowspan="2" style="width:26px;">%<br/>Aptos</th>
            <th rowspan="2" style="width:30px;">%<br/>N/Aptos</th>
          </tr>
          <tr>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
            <th>MF</th><th>F</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="3" class="left bold">Total</td>
            <td>${totMF}</td><td>${totF}</td>
            <td>${totAvalMF}</td><td>${totAvalF}</td>
            <td>${totAproMF}</td><td>${totAproF}</td>
            <td>${totRepMF}</td><td>${totRepF}</td>
            <td>${totDesMF}</td><td>${totDesF}</td>
            <td>0</td><td>0</td>
            <td>0</td><td>0</td>
            <td>0</td><td>0</td>
            <td>${totPctAptos}%</td>
            <td>${totPctNAptos}%</td>
          </tr>
        </tbody>
      </table>

      <div class="legenda">
        <strong>&#9658; Legenda:</strong>
        <span class="item"><b>MF</b> = Masculino + Feminino</span>
        <span class="item"><b>F</b> = Feminino</span>
        <span class="item"><b>D</b> = Desistente</span>
        <span class="item"><b>AM</b> = Anulação de Matrícula</span>
        <span class="item"><b>T</b> = Transferido</span>
        <span class="item"><b>E</b> = Excluído</span>
      </div>

      <div class="local-date">${municipioEscola}, ${hojeRodape}.</div>
      <div class="footer">
        <div class="sig">
          <div class="sig-name">${directorPedagogico || '___________________________________'}</div>
          <div class="sig-line">O(A) Subdirector(a) Pedagógico(a)</div>
        </div>
      </div>
    </div>`;
  }).filter(Boolean).join('\n');

  const content = pagesHTML || `<div class="page"><p style="text-align:center;padding:40px;color:#666;">Sem dados para os filtros seleccionados.</p></div>`;

  return `<!DOCTYPE html><html lang="pt"><head>${BASE_CSS}</head><body>
    <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
    ${content}
    <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  </body></html>`;
}

// ─── Mapa Geral por Classe (Imagem 2) ─────────────────────────────────────────
// Colunas: Nome do Curso | [por cada classe: Aprovados M/F/Total | Reprovados M/F/Total | D-AM-T-E M/F/Total] | TOTAL GERAL Aptos MF/MF | N/Aptos MF | D-AM-T-E MF/MF

function buildMapaGeralHTML(params: {
  trimestre: number;
  turno: string;
  anoLetivo: string;
  cursosDisponiveis: Curso[];
  cursoId: string;
  ciclo: Ciclo;
  alunos: any[];
  turmas: any[];
  notas: any[];
  config: any;
}): string {
  const { trimestre, turno, anoLetivo, cursosDisponiveis, cursoId, ciclo, alunos, turmas, notas, config } = params;

  const nomeEscola = config?.nomeEscola || 'Super Escola';
  const logoUrl = config?.logoUrl || '';
  const nota_min = config?.notaMinimaAprovacao ?? 10;
  const municipioEscola = (config?.municipioEscola || '').trim() || nomeEscola;
  const directorPedagogico = (config?.directorPedagogico || '').trim();
  const directorGeral = (config?.directorGeral || '').trim();
  const hoje = new Date();
  const hojeRodape = fmtDateFooter(hoje);
  const trLabel = `${trimestre}º Trimestre`;

  const cicloLabel = ciclo === 'Todos' ? '' : ciclo;

  // Turmas em escopo: aplica todos os filtros (ano, turno, ciclo)
  // anoMatch normaliza "2025-2026" ↔ "2025/2026" para evitar falha de comparação
  const turmasNoEscopo = turmas.filter(t =>
    (!anoLetivo || anoMatch(t.anoLetivo, anoLetivo)) &&
    (turno === 'Todos' || t.turno === turno) &&
    (ciclo === 'Todos' || (t.nivel || '').trim() === ciclo)
  );

  // Deriva grupos (cursos reais + Ensino Geral) e aplica filtro de curso
  let gruposFiltrados = derivarGruposCurso(turmasNoEscopo, cursosDisponiveis);
  if (cursoId) {
    gruposFiltrados = gruposFiltrados.filter(g => g.id === cursoId);
  }

  const classesDinamicas = Array.from(new Set(turmasNoEscopo.map(t => String(t.classe))))
    .filter(c => c && c !== 'undefined' && c !== 'null')
    .sort((a, b) => parseInt(a) - parseInt(b));
  const classes = classesDinamicas.length > 0 ? classesDinamicas : CLASSES_II_CICLO;
  const classesLabel = classes.map(c => `${c}ª`).join(', ') + ' Classes';
  const anoLetivoLabel = anoLetivo && anoLetivo.trim() ? anoLetivo.trim() : '—';

  // Período dinâmico: deriva turnos reais das turmas em escopo
  const turnosNoEscopo = Array.from(new Set(
    turmasNoEscopo.map(t => (t.turno || '').trim()).filter(Boolean)
  ));
  const turnoLabel = turno !== 'Todos'
    ? turno
    : (turnosNoEscopo.length > 0 ? turnosNoEscopo.join(', ') : 'Manhã, Tarde, Noite');

  // Para cada grupo (curso real ou Ensino Geral) e classe, calcula estatísticas
  function calcStats(grupo: GrupoCurso, classe: string) {
    const turmasFiltradas = turmasNoEscopo.filter(t =>
      turmaPertenceAoGrupo(t, grupo) && t.classe === classe
    );

    let aproM = 0, aproF = 0;
    let repM = 0, repF = 0;
    let desM = 0, desF = 0;

    turmasFiltradas.forEach(turma => {
      const alunosDaTurma = alunos.filter(a => a.turmaId === turma.id);
      const notasDaTurma = notas.filter((n: any) => n.turmaId === turma.id && n.trimestre === trimestre);
      const alunosComNotas = new Set(notasDaTurma.map((n: any) => n.alunoId));

      alunosDaTurma.forEach(aluno => {
        if (!alunosComNotas.has(aluno.id)) {
          if (!aluno.ativo) {
            if (aluno.genero === 'F') desF++; else desM++;
          }
          return;
        }
        const notasAluno = notasDaTurma.filter((n: any) => n.alunoId === aluno.id);
        const vals = notasAluno.map((n: any) => n.mt1 ?? n.nf ?? null).filter((v: any): v is number => typeof v === 'number' && v > 0);
        if (vals.length === 0) return;
        const media = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        const isF = aluno.genero === 'F';
        if (media >= nota_min) { isF ? aproF++ : aproM++; }
        else { isF ? repF++ : repM++; }
      });
    });

    return {
      aproM, aproF, aproTotal: aproM + aproF,
      repM, repF, repTotal: repM + repF,
      desM, desF, desTotal: desM + desF,
    };
  }

  // Cabeçalho com colspan por classe
  const thClasses = classes.map(c =>
    `<th colspan="9" class="dark">${c}ª Classe</th>`
  ).join('');

  const thClassesSub = classes.map(() =>
    `<th colspan="3">Alunos<br/>Aprovados</th><th colspan="3">Alunos<br/>Reprovados</th><th colspan="3">D-AM-T-E</th>`
  ).join('');

  const thMFTotal = classes.map(() =>
    `<th>M</th><th>F</th><th>Total</th><th>M</th><th>F</th><th>Total</th><th>M</th><th>F</th><th>Total</th>`
  ).join('');

  // Totais por classe para a linha de total
  const classeGrandTotals: Record<string, { aproM: number; aproF: number; aproTotal: number; repM: number; repF: number; repTotal: number; desM: number; desF: number; desTotal: number }> = {};
  classes.forEach(c => { classeGrandTotals[c] = { aproM: 0, aproF: 0, aproTotal: 0, repM: 0, repF: 0, repTotal: 0, desM: 0, desF: 0, desTotal: 0 }; });

  let grandAproMF = 0, grandAproF = 0;
  let grandRepMF = 0, grandRepF = 0;
  let grandDesMF = 0, grandDesF = 0;

  const cursoRows = gruposFiltrados.map(grupo => {
    let totalAproM = 0, totalAproF = 0;
    let totalRepM = 0, totalRepF = 0;
    let totalDesM = 0, totalDesF = 0;

    const classeCells = classes.map(c => {
      const s = calcStats(grupo, c);
      classeGrandTotals[c].aproM += s.aproM;
      classeGrandTotals[c].aproF += s.aproF;
      classeGrandTotals[c].aproTotal += s.aproTotal;
      classeGrandTotals[c].repM += s.repM;
      classeGrandTotals[c].repF += s.repF;
      classeGrandTotals[c].repTotal += s.repTotal;
      classeGrandTotals[c].desM += s.desM;
      classeGrandTotals[c].desF += s.desF;
      classeGrandTotals[c].desTotal += s.desTotal;
      totalAproM += s.aproM; totalAproF += s.aproF;
      totalRepM += s.repM; totalRepF += s.repF;
      totalDesM += s.desM; totalDesF += s.desF;
      return `<td>${s.aproM}</td><td>${s.aproF}</td><td>${s.aproTotal}</td>
              <td>${s.repM}</td><td>${s.repF}</td><td>${s.repTotal}</td>
              <td>${s.desM}</td><td>${s.desF}</td><td>${s.desTotal}</td>`;
    }).join('');

    grandAproMF += totalAproM; grandAproF += totalAproF;
    grandRepMF += totalRepM; grandRepF += totalRepF;
    grandDesMF += totalDesM; grandDesF += totalDesF;

    return `<tr>
      <td class="left">${grupo.nome}${grupo.nivel ? ` <span style="color:#1a6b3c;font-style:italic;">(${grupo.nivel})</span>` : ''}</td>
      ${classeCells}
      <td>${totalAproM + totalRepM}</td><td>${totalAproF + totalRepF}</td>
      <td>${totalDesM}</td><td>${totalDesF}</td>
    </tr>`;
  }).join('');

  // Linha de totais
  const totalCells = classes.map(c => {
    const s = classeGrandTotals[c];
    return `<td>${s.aproM}</td><td>${s.aproF}</td><td>${s.aproTotal}</td>
            <td>${s.repM}</td><td>${s.repF}</td><td>${s.repTotal}</td>
            <td>${s.desM}</td><td>${s.desF}</td><td>${s.desTotal}</td>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt"><head>${BASE_CSS}</head><body>
    <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
    <div class="page">
      <div class="visto-box">
        <div class="visto-label">VISTO</div>
        <div class="visto-data">Data ___/___/______</div>
        <div class="visto-name">${directorGeral || '_______________________'}</div>
        <div class="visto-role">O(A) DIRECTOR(A) DA ESCOLA</div>
      </div>

      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo"/>` : ''}
        <div class="rep">REPÚBLICA DE ANGOLA<br/>MINISTÉRIO DA EDUCAÇÃO</div>
        <div class="escola-name">${nomeEscola}</div>
      </div>

      <div class="mapa-title">Mapa de Aproveitamento Escolar dos Alunos Referente ao ${trLabel}, do Ano Lectivo ${anoLetivoLabel} (${classesLabel}) — Período ${turnoLabel}</div>
      <div class="mapa-sub"><strong>Nome da Escola:</strong> ${nomeEscola} &nbsp;&nbsp; <strong>Período:</strong> ${turnoLabel}${cicloLabel ? ` &nbsp;&nbsp; <strong>Ciclo:</strong> ${cicloLabel}` : ''}</div>

      <table style="margin-top:8px;">
        <thead>
          <tr>
            <th rowspan="3" style="width:130px;">Nome do Curso</th>
            ${thClasses}
            <th colspan="4" class="dark">TOTAL GERAL</th>
          </tr>
          <tr>
            ${thClassesSub}
            <th colspan="2">Aptos</th>
            <th colspan="2">N/Aptos</th>
          </tr>
          <tr>
            ${thMFTotal}
            <th>MF</th><th>MF</th><th>MF</th><th>MF</th>
          </tr>
        </thead>
        <tbody>
          ${cursoRows}
          <tr class="total-row">
            <td class="left bold">Total</td>
            ${totalCells}
            <td>${grandAproMF}</td><td>${grandAproF}</td>
            <td>${grandRepMF}</td><td>${grandRepF}</td>
          </tr>
        </tbody>
      </table>

      <div class="legenda">
        <strong>&#9658; Legenda D-AM-T-E:</strong>
        <span class="item"><b>D</b> = Desistente</span>
        <span class="item"><b>AM</b> = Anulação de Matrícula</span>
        <span class="item"><b>T</b> = Transferido</span>
        <span class="item"><b>E</b> = Excluído</span>
        <span class="item"><b>M</b> = Masculino</span>
        <span class="item"><b>F</b> = Feminino</span>
        <span class="item"><b>MF</b> = Masculino + Feminino</span>
      </div>

      <div class="local-date">${municipioEscola}, ${hojeRodape}.</div>
      <div class="footer">
        <div class="sig">
          <div class="sig-name">${directorPedagogico || '___________________________________'}</div>
          <div class="sig-line">O(A) Subdirector(a) Pedagógico(a)</div>
        </div>
      </div>
    </div>
    <div class="btn-toolbar no-print"><button class="print-btn" onclick="window.print()">🖨 Imprimir</button><button class="download-btn" onclick="(function(){try{var b=new Blob([document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='documento.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){}})()">📥 Guardar</button></div>
  </body></html>`;

  return html;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MapaAproveitamentoModal({
  visible, onClose, alunos, turmas, notas, config, anoAtual, user,
}: Props) {
  const isWeb = Platform.OS === 'web';

  const [step, setStep] = useState<'filtros' | 'preview'>('filtros');
  const [tipoMapa, setTipoMapa] = useState<'trimestre' | 'geral'>('trimestre');
  const [trimestre, setTrimestre] = useState<1 | 2 | 3>(1);
  const [turno, setTurno] = useState<string>('Todos');
  const [ciclo, setCiclo] = useState<Ciclo>('Todos');
  const [anoLetivo, setAnoLetivo] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState('');

  // Grupos visíveis para os chips de "Curso" — derivados das turmas que passam
  // os filtros actuais (ano, turno, ciclo). Inclui pseudo-curso "Ensino Geral".
  const gruposVisiveis = React.useMemo(() => {
    const turmasEscopo = (turmas || []).filter((t: any) =>
      (!anoLetivo || anoMatch(t.anoLetivo, anoLetivo)) &&
      (turno === 'Todos' || t.turno === turno) &&
      (ciclo === 'Todos' || (t.nivel || '').trim() === ciclo)
    );
    return derivarGruposCurso(turmasEscopo, cursos);
  }, [turmas, cursos, anoLetivo, turno, ciclo]);

  // Se o cursoId seleccionado deixa de existir nos grupos visíveis, limpa-o
  useEffect(() => {
    if (cursoId && !gruposVisiveis.some(g => g.id === cursoId)) {
      setCursoId('');
    }
  }, [gruposVisiveis, cursoId]);

  useEffect(() => {
    if (!visible) return;
    setStep('filtros');
    setTipoMapa('trimestre');
    setTrimestre(1);
    setTurno('Todos');
    setCiclo('Todos');
    setAnoLetivo(anoAtual);
    setCursoId('');
    setGeneratedHTML('');
    setLoadingCursos(true);
    api.get('/api/cursos')
      .then((data: any) => {
        const list = Array.isArray(data) ? data : [];
        setCursos(list.filter((c: Curso) => c.ativo));
      })
      .catch(() => setCursos([]))
      .finally(() => setLoadingCursos(false));
  }, [visible]);

  function handleGenerate() {
    if (!anoLetivo.trim()) {
      webAlert('Ano Académico obrigatório', 'Indique o ano académico.');
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      try {
        const baseParams = {
          trimestre,
          turno,
          ciclo,
          anoLetivo: anoLetivo.trim(),
          cursosDisponiveis: cursos,
          cursoId,
          alunos,
          turmas,
          notas,
          config,
        };
        const html = tipoMapa === 'trimestre'
          ? buildMapaTrimestreHTML(baseParams)
          : buildMapaGeralHTML(baseParams);
        setGeneratedHTML(html);
        setStep('preview');
      } finally {
        setGenerating(false);
      }
    }, 80);
  }

  function handlePrint() {
    if (!isWeb) {
      webAlert('Impressão', 'A impressão está disponível na versão web.');
      return;
    }
    const iframe = document.getElementById('mapa-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    } else {
      const w = window.open('', '_blank');
      if (w) { w.document.write(generatedHTML); w.document.close(); w.print(); }
    }
  }

  // ── Render: Filtros ─────────────────────────────────────────────────────────
  function renderFiltros() {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.stepTitle}>Mapa de Aproveitamento</Text>
        <Text style={st.stepSub}>Configure os filtros para gerar o mapa</Text>

        {/* Tipo de Mapa */}
        <Text style={st.fieldLabel}>Tipo de Mapa</Text>
        <View style={st.chipRow}>
          {([
            { key: 'trimestre', label: 'Por Turma (Trimestre)', icon: 'list' },
            { key: 'geral', label: 'Geral por Curso/Classe', icon: 'grid' },
          ] as const).map(({ key, label, icon }) => (
            <TouchableOpacity
              key={key}
              style={[st.typeChip, tipoMapa === key && { backgroundColor: Colors.accent + '20', borderColor: Colors.accent }]}
              onPress={() => setTipoMapa(key)}
            >
              <Ionicons name={icon as any} size={13} color={tipoMapa === key ? Colors.accent : Colors.textMuted} />
              <Text style={[st.chipTxt, tipoMapa === key && { color: Colors.accent, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trimestre */}
        <Text style={st.fieldLabel}>Trimestre</Text>
        <View style={st.chipRow}>
          {TRIMESTRES.map(t => (
            <TouchableOpacity
              key={t}
              style={[st.chip, trimestre === t && { backgroundColor: Colors.info + '20', borderColor: Colors.info }]}
              onPress={() => setTrimestre(t as 1 | 2 | 3)}
            >
              <Text style={[st.chipTxt, trimestre === t && { color: Colors.info, fontFamily: 'Inter_700Bold' }]}>
                {t}º Trimestre
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Regime/Turno */}
        <Text style={st.fieldLabel}>Regime / Turno</Text>
        <View style={st.chipRow}>
          {TURNOS.map(t => (
            <TouchableOpacity
              key={t}
              style={[st.chip, turno === t && { backgroundColor: Colors.gold + '20', borderColor: Colors.gold }]}
              onPress={() => setTurno(t)}
            >
              <Text style={[st.chipTxt, turno === t && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ciclo */}
        <Text style={st.fieldLabel}>Ciclo</Text>
        <View style={st.chipRow}>
          {CICLOS.map(c => (
            <TouchableOpacity
              key={c}
              style={[st.chip, ciclo === c && { backgroundColor: Colors.info + '20', borderColor: Colors.info }]}
              onPress={() => setCiclo(c)}
            >
              <Text style={[st.chipTxt, ciclo === c && { color: Colors.info, fontFamily: 'Inter_700Bold' }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ano Académico */}
        <Text style={st.fieldLabel}>Ano Académico</Text>
        <TextInput
          style={st.input}
          value={anoLetivo}
          onChangeText={setAnoLetivo}
          placeholder="Ex: 2024/2025"
          placeholderTextColor={Colors.textMuted}
        />

        {/* Curso */}
        <Text style={st.fieldLabel}>Curso</Text>
        {loadingCursos ? (
          <AppLoader size="small" color={Colors.gold} style={{ marginBottom: 12 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[st.chip, cursoId === '' && { backgroundColor: Colors.success + '20', borderColor: Colors.success }]}
                onPress={() => setCursoId('')}
              >
                <Text style={[st.chipTxt, cursoId === '' && { color: Colors.success, fontFamily: 'Inter_700Bold' }]}>
                  Todos os Cursos
                </Text>
              </TouchableOpacity>
              {gruposVisiveis.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[st.chip, cursoId === g.id && { backgroundColor: Colors.success + '20', borderColor: Colors.success }]}
                  onPress={() => setCursoId(g.id)}
                >
                  <Text style={[st.chipTxt, cursoId === g.id && { color: Colors.success, fontFamily: 'Inter_700Bold' }]}>
                    {g.nome}{g.nivel ? ` · ${g.nivel}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Assinantes (lidos automaticamente da configuração da Escola) */}
        <View style={st.signSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="checkmark-done-circle" size={14} color={Colors.gold} />
            <Text style={st.signTitle}>Assinantes</Text>
          </View>
          <Text style={st.signRow}>
            <Text style={{ fontFamily: 'Inter_700Bold' }}>Subdirector Pedagógico:</Text>{' '}
            {(config?.directorPedagogico || '').trim() || (
              <Text style={{ color: Colors.danger }}>Por preencher em Admin → Escola</Text>
            )}
          </Text>
          <Text style={st.signRow}>
            <Text style={{ fontFamily: 'Inter_700Bold' }}>Visto (Director da Escola):</Text>{' '}
            {(config?.directorGeral || '').trim() || (
              <Text style={{ color: Colors.danger }}>Por preencher em Admin → Escola</Text>
            )}
          </Text>
          <Text style={st.signHint}>
            Os nomes são lidos directamente da configuração da Escola. Para alterar, vá a Admin → Escola.
          </Text>
        </View>

        <TouchableOpacity
          style={[st.generateBtn, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <AppLoader size="small" color="#fff" />
            : <Ionicons name="eye" size={18} color="#fff" />}
          <Text style={st.generateBtnTxt}>{generating ? 'A gerar...' : 'Visualizar Mapa'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Render: Preview ─────────────────────────────────────────────────────────
  function renderPreview() {
    return (
      <View style={{ flex: 1 }}>
        <View style={st.previewBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.previewTitle}>
              {tipoMapa === 'trimestre' ? 'Mapa por Turma' : 'Mapa Geral por Curso/Classe'}
            </Text>
            <Text style={st.previewSub}>
              {trimestre}º Trimestre · {anoLetivo} · Regime {turno}
            </Text>
          </View>
          <TouchableOpacity style={st.printBtn} onPress={handlePrint}>
            <Ionicons name="print" size={15} color="#fff" />
            <Text style={st.printBtnTxt}>Imprimir / PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.editBtn} onPress={() => setStep('filtros')}>
            <Ionicons name="arrow-back" size={15} color={Colors.gold} />
            <Text style={st.editBtnTxt}>Filtros</Text>
          </TouchableOpacity>
        </View>

        {isWeb ? (
          <iframe
            id="mapa-iframe"
            srcDoc={generatedHTML}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 500 } as any}
            title="Mapa de Aproveitamento"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' }}>
              Mapa gerado com sucesso!
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
              A pré-visualização e impressão estão disponíveis na versão web.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Mapa de Aproveitamento</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step indicator */}
        <View style={st.stepBar}>
          {(['filtros', 'preview'] as const).map((s, i) => {
            const labels = ['Filtros', 'Prévia'];
            const icons = ['options', 'eye'];
            const done = step === 'preview' && s === 'filtros';
            const active = step === s;
            const color = done ? Colors.success : active ? Colors.gold : Colors.textMuted;
            return (
              <React.Fragment key={s}>
                <TouchableOpacity
                  style={st.stepItem}
                  onPress={() => { if (done) setStep(s); }}
                  disabled={!done}
                >
                  <View style={[st.stepCircle, { borderColor: color, backgroundColor: done ? Colors.success + '20' : active ? Colors.gold + '20' : 'transparent' }]}>
                    {done
                      ? <Ionicons name="checkmark" size={14} color={Colors.success} />
                      : <Ionicons name={icons[i] as any} size={14} color={color} />}
                  </View>
                  <Text style={[st.stepLabel, { color }]}>{labels[i]}</Text>
                </TouchableOpacity>
                {i < 1 && <View style={[st.stepLine, { backgroundColor: done ? Colors.success : Colors.border }]} />}
              </React.Fragment>
            );
          })}
        </View>

        <View style={{ flex: 1 }}>
          {step === 'filtros' && renderFiltros()}
          {step === 'preview' && renderPreview()}
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
  stepItem:     { alignItems: 'center', gap: 4, minWidth: 60 },
  stepCircle:   { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  stepLabel:    { fontSize: 10, fontFamily: 'Inter_500Medium' },
  stepLine:     { flex: 1, height: 1.5, marginBottom: 12 },

  stepTitle:    { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  stepSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 16 },
  fieldLabel:   { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  typeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipTxt:      { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  hintTxt:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: -10, marginBottom: 16, fontStyle: 'italic' },
  input:        { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 12, outlineStyle: 'none' as any },

  signSection:  { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  signTitle:    { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  signRow:      { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 6 },
  signHint:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', marginTop: 6 },

  generateBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 12, padding: 16, marginTop: 4 },
  generateBtnTxt:{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  previewBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 12, paddingHorizontal: 16 },
  previewTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  previewSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  printBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  printBtnTxt:  { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  editBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.gold + '55' },
  editBtnTxt:   { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
});
