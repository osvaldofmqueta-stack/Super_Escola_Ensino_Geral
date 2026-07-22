import React, { useState, useEffect, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, TextInput } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';

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
  cursoNome?: string;
  cursoId?: string;
  status: string;
  criadoEm: string;
  rupeInscricao?: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
}

interface DisciplinaExame {
  nome: string;
  diaSemana: string;
  data: string;
}

type Ciclo = 'I_CICLO' | 'II_CICLO';

const CICLO_CLASSES: Record<Ciclo, string[]> = {
  I_CICLO:  ['7ª Classe'],
  II_CICLO: ['10ª Classe'],
};

const CICLO_LABEL: Record<Ciclo, string> = {
  I_CICLO:  'I Ciclo  (7ª Classe)',
  II_CICLO: 'II Ciclo (10ª Classe)',
};

function classeSort(a: string, b: string): number {
  const num = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
  return num(a) - num(b);
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function anoAtual(): string { return anoLetivoDe(); }

function numInscricao(r: Registro, idx: number): string {
  if (r.rupeInscricao) {
    const p = r.rupeInscricao.split('-');
    if (p.length >= 4) return p[3];
  }
  return String(10000 + idx);
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const SHARED_CSS = `
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
}
`;

// ─── Shared header HTML ───────────────────────────────────────────────────────

function headerHTML(
  config: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string },
  subTitulo: string,
  salaLabel?: string,
) {
  const disciplinasTxt = config.disciplinas
    .filter(d => d.nome.trim())
    .map(d => {
      const s = d.nome.trim();
      const det = [d.diaSemana.trim(), d.data.trim()].filter(Boolean).join(', ');
      return det ? `${s} (${det})` : s;
    })
    .join(' &nbsp;|&nbsp; ');

  return `
<div class="doc-header">
  <img src="/angola-brasao.png" class="header-brasao" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
  <p class="header-rep">REPÚBLICA DE ANGOLA</p>
  <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
  <p class="header-rep">ENSINO GERAL</p>
  <div class="escola-nome">${config.nomeEscola.toUpperCase()}</div>
  <div class="doc-titulo">EXAMES DE ADMISSÃO — ${config.anoExame}</div>
  <div class="doc-subtitulo">${subTitulo}</div>
  ${disciplinasTxt ? `<div class="disciplinas-line"><b>${disciplinasTxt}</b></div>` : ''}
</div>

<div class="local-row">
  <div class="local-item"><span class="local-label">LOCAL:</span> <u><b>${config.local || '___________'}</b></u></div>
  <div class="local-sep"></div>
  <div class="local-item"><u><b>${config.campus || '___________'}</b></u> — SALA: <u><b>${salaLabel || config.sala || '___________'}</b></u></div>
  <div class="hora-box"><span class="local-label">Hora:</span> <b>${config.hora || '07:30:00'}</b></div>
</div>
<hr class="divider" />`;
}

function assinaturasRodape(nomeEscola: string) {
  return `
<div class="assinaturas">
  <div class="ass-col"><div class="ass-line"></div><div>O Secretário(a)</div></div>
  <div class="ass-col"><div class="ass-line"></div><div>O Director(a)</div></div>
</div>
<div class="rodape">
  <span>${nomeEscola} — Sistema QUETA v3</span>
  <span>Emitido em: ${hoje()}</span>
</div>`;
}

// ─── I Ciclo HTML ─────────────────────────────────────────────────────────────

// Divide uma lista ordenada em blocos ("salas") de tamanho máximo `capacidade`.
function distribuirPorSalas<T>(lista: T[], capacidade: number): T[][] {
  const cap = Math.max(1, Math.floor(capacidade) || 30);
  const salas: T[][] = [];
  for (let i = 0; i < lista.length; i += cap) {
    salas.push(lista.slice(i, i + cap));
  }
  return salas.length ? salas : [[]];
}

function buildICicloHTML(
  registros: Registro[],
  config: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string; capacidadeSala: number },
): string {
  const sorted = [...registros].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));

  const byClasse: Record<string, Registro[]> = {};
  for (const r of sorted) {
    const k = r.classe?.trim() || '—';
    if (!byClasse[k]) byClasse[k] = [];
    byClasse[k].push(r);
  }

  const classes = Object.keys(byClasse).sort(classeSort);
  if (classes.length === 0) return '<p style="padding:20px;text-align:center;">Nenhum candidato encontrado.</p>';

  const salaPrefixo = (config.sala || 'Sala').trim();
  let globalIdx = 1;
  let salaCounter = 0;
  let primeiraPagina = true;
  const blocos = classes.map((cls) => {
    const alunos = byClasse[cls];
    const salas = distribuirPorSalas(alunos, config.capacidadeSala);

    const paginasSalas = salas.map((alunosSala) => {
      salaCounter += 1;
      const salaLabel = `${salaPrefixo} ${salaCounter}`;
      const pageBreak = primeiraPagina ? '' : '<div style="page-break-before:always;"></div>';
      primeiraPagina = false;

      const rows = alunosSala.map((a, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#eef6ff';
        return `<tr style="background:${bg}">
          <td class="num">${globalIdx + i}</td>
          <td class="cand">${i + 1}</td>
          <td class="nome">${a.nomeCompleto.toUpperCase()}</td>
          <td class="cand">${numInscricao(a, globalIdx + i)}</td>
        </tr>`;
      }).join('');

      globalIdx += alunosSala.length;

      return `
${pageBreak}
<div class="doc-page">
  ${headerHTML(config, 'LISTA DE CANDIDATOS POR SALAS DE EXAME — I CICLO', salaLabel)}
  <div class="bloco-titulo">CLASSE: <b>${cls}</b> &nbsp;·&nbsp; SALA: <b>${salaLabel}</b> &nbsp;·&nbsp; Candidatos nesta sala: <b>${alunosSala.length}</b></div>
  <table>
    <thead>
      <tr>
        <th class="th-num"><u>Ord</u></th>
        <th class="th-num"><u>Carteira</u></th>
        <th class="th-nome"><u>Nome do Candidato</u></th>
        <th class="th-cand"><u>NºCand</u></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${assinaturasRodape(config.nomeEscola)}
</div>`;
    }).join('\n');

    return paginasSalas;
  }).join('\n');

  return blocos;
}

// ─── II Ciclo HTML ────────────────────────────────────────────────────────────

function buildIICicloHTML(
  registros: Registro[],
  config: { nomeEscola: string; anoExame: string; local: string; campus: string; sala: string; hora: string; disciplinas: DisciplinaExame[]; logoUrl: string; capacidadeSala: number },
): string {
  const sorted = [...registros].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));

  const byClasse: Record<string, Registro[]> = {};
  for (const r of sorted) {
    const k = r.classe?.trim() || '—';
    if (!byClasse[k]) byClasse[k] = [];
    byClasse[k].push(r);
  }

  const classes = Object.keys(byClasse).sort(classeSort);
  if (classes.length === 0) return '<p style="padding:20px;text-align:center;">Nenhum candidato encontrado.</p>';

  const salaPrefixo = (config.sala || 'Sala').trim();
  let globalIdx = 1;
  let salaCounter = 0;
  let primeiraPagina = true;
  const blocos = classes.map((cls) => {
    const alunosClasse = byClasse[cls];

    const byCurso: Record<string, Registro[]> = {};
    for (const r of alunosClasse) {
      const k = r.cursoNome?.trim() || 'Sem Curso Definido';
      if (!byCurso[k]) byCurso[k] = [];
      byCurso[k].push(r);
    }
    const cursosOrdenados = Object.keys(byCurso).sort((a, b) => a.localeCompare(b, 'pt'));

    // Distribui todos os candidatos da classe (independentemente do curso) por salas
    // com capacidade máxima, preservando a ordem alfabética global da classe.
    const salas = distribuirPorSalas(alunosClasse, config.capacidadeSala);

    const paginasSalas = salas.map((alunosSala) => {
      salaCounter += 1;
      const salaLabel = `${salaPrefixo} ${salaCounter}`;
      const pageBreak = primeiraPagina ? '' : '<div style="page-break-before:always;"></div>';
      primeiraPagina = false;

      // Dentro da sala, agrupar por curso apenas para exibição (mantendo numeração de carteira contínua)
      const byCursoNaSala: Record<string, Registro[]> = {};
      for (const r of alunosSala) {
        const k = r.cursoNome?.trim() || 'Sem Curso Definido';
        if (!byCursoNaSala[k]) byCursoNaSala[k] = [];
        byCursoNaSala[k].push(r);
      }
      const cursosNaSala = Object.keys(byCursoNaSala).sort((a, b) => a.localeCompare(b, 'pt'));

      let cursosHTML = '';
      let carteiraIdx = 1;
      let ordIdx = globalIdx;
      for (const curso of cursosNaSala) {
        const alunos = byCursoNaSala[curso];
        const rows = alunos.map((a, i) => {
          const bg = i % 2 === 0 ? '#ffffff' : '#eef6ff';
          return `<tr style="background:${bg}">
            <td class="num">${ordIdx + i}</td>
            <td class="cand">${carteiraIdx + i}</td>
            <td class="nome">${a.nomeCompleto.toUpperCase()}</td>
            <td class="cand">${numInscricao(a, ordIdx + i)}</td>
            <td class="curso-td">${curso}</td>
          </tr>`;
        }).join('');
        cursosHTML += `
          <div class="sub-bloco-titulo">CURSO: ${curso.toUpperCase()} &nbsp;·&nbsp; ${alunos.length} candidato(s)</div>
          <table>
            <thead>
              <tr>
                <th class="th-num"><u>Ord</u></th>
                <th class="th-num"><u>Carteira</u></th>
                <th class="th-nome"><u>Nome do Candidato</u></th>
                <th class="th-cand"><u>NºCand</u></th>
                <th class="th-curso"><u>Curso</u></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`;
        carteiraIdx += alunos.length;
        ordIdx += alunos.length;
      }
      globalIdx += alunosSala.length;

      return `
${pageBreak}
<div class="doc-page">
  ${headerHTML(config, 'LISTA DE CANDIDATOS POR SALAS DE EXAME — II CICLO', salaLabel)}
  <div class="bloco-titulo">CLASSE: <b>${cls}</b> &nbsp;·&nbsp; SALA: <b>${salaLabel}</b> &nbsp;·&nbsp; Candidatos nesta sala: <b>${alunosSala.length}</b> &nbsp;·&nbsp; Cursos: <b>${cursosNaSala.length}</b></div>
  ${cursosHTML}
  ${assinaturasRodape(config.nomeEscola)}
</div>`;
    }).join('\n');

    return paginasSalas;
  }).join('\n');

  return blocos;
}

// ─── Full document wrapper ────────────────────────────────────────────────────

function buildFullHTML(body: string, titulo: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Exportar PDF</button>
  ${body}
</body>
</html>`;
}

// ─── Main component ───────────────────────────────────────────────────────────

const STATUSES_INSCRITOS = ['pendente', 'pendente_pagamento', 'aprovado', 'aguardando_prova', 'aguardando prova', 'em_processamento', 'inscrito'];

export default function ListaInscritosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeEscola, setNomeEscola] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [ciclo, setCiclo] = useState<Ciclo>('II_CICLO');

  const [anoExame, setAnoExame] = useState(anoAtual());
  const [local, setLocal] = useState('');
  const [campus, setCampus] = useState('');
  const [sala, setSala] = useState('');
  const [capacidadeSala, setCapacidadeSala] = useState('30');
  const [hora, setHora] = useState('07:30:00');
  const [disciplinas, setDisciplinas] = useState<DisciplinaExame[]>([
    { nome: 'Língua Portuguesa', diaSemana: '', data: '' },
    { nome: 'Matemática', diaSemana: '', data: '' },
    { nome: '', diaSemana: '', data: '' },
  ]);
  const [showConfig, setShowConfig] = useState(true);

  // ── Filtros de emissão ──────────────────────────────────────────────────────
  const [filtroClasse, setFiltroClasse] = useState<string>('TODAS');
  const [filtroCurso, setFiltroCurso] = useState<string>('TODOS');

  // ── Secções colapsáveis na pré-visualização ─────────────────────────────────
  const [seccoesColapsadas, setSeccoesColapsadas] = useState<Set<string>>(new Set());
  function toggleSeccao(key: string) {
    setSeccoesColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [regRes, cfgRes] = await Promise.all([
        fetch('/api/registros'),
        fetch('/api/config'),
      ]);
      if (regRes.ok) {
        const data = await regRes.json();
        setRegistros(Array.isArray(data) ? data : []);
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setNomeEscola(cfg.nomeEscola || 'QUETA');
        if (cfg.localEscola) setLocal(cfg.localEscola);
      }
    } catch {}
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reset filtros when ciclo changes
  useEffect(() => { setFiltroClasse('TODAS'); setFiltroCurso('TODOS'); }, [ciclo]);

  const classesDoCiclo = CICLO_CLASSES[ciclo];

  const inscritos = registros.filter(r => {
    const s = r.status?.toLowerCase() ?? '';
    const statusOk = STATUSES_INSCRITOS.some(fs => s.includes(fs));
    if (!statusOk) return false;
    const cls = r.classe?.trim() ?? '';
    return classesDoCiclo.some(c => c.toLowerCase() === cls.toLowerCase());
  });

  const classesPresentesNoFiltro = Array.from(new Set(inscritos.map(r => r.classe?.trim()))).sort(classeSort);

  const byClasse: Record<string, Registro[]> = {};
  for (const r of inscritos) {
    const k = r.classe?.trim() || '—';
    if (!byClasse[k]) byClasse[k] = [];
    byClasse[k].push(r);
  }

  // II Ciclo: todos os cursos presentes (selector primário)
  const cursosNoIICiclo: string[] = ciclo === 'II_CICLO'
    ? Array.from(new Set(inscritos.map(r => r.cursoNome?.trim() || 'Sem Curso Definido'))).sort()
    : [];

  // II Ciclo: classes presentes no curso seleccionado (selector secundário)
  const classesNoCurso: string[] = ciclo === 'II_CICLO' && filtroCurso !== 'TODOS'
    ? Array.from(new Set(inscritos
        .filter(r => (r.cursoNome?.trim() || 'Sem Curso Definido') === filtroCurso)
        .map(r => r.classe?.trim())
      )).sort(classeSort)
    : [];

  // Candidatos filtrados para geração
  const inscritosParaGerar = inscritos.filter(r => {
    if (ciclo === 'II_CICLO') {
      // II Ciclo: filtro primário por curso, secundário por classe
      if (filtroCurso !== 'TODOS') {
        const cursoR = r.cursoNome?.trim() || 'Sem Curso Definido';
        if (cursoR !== filtroCurso) return false;
      }
      if (filtroClasse !== 'TODAS' && r.classe?.trim() !== filtroClasse) return false;
    } else {
      // I Ciclo: filtro apenas por classe
      if (filtroClasse !== 'TODAS' && r.classe?.trim() !== filtroClasse) return false;
    }
    return true;
  });

  function updateDisciplina(idx: number, field: keyof DisciplinaExame, val: string) {
    setDisciplinas(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  }
  function addDisciplina() {
    setDisciplinas(prev => [...prev, { nome: '', diaSemana: '', data: '' }]);
  }
  function removeDisciplina(idx: number) {
    setDisciplinas(prev => prev.filter((_, i) => i !== idx));
  }

  function handleGerar() {
    if (Platform.OS !== 'web') return;
    if (inscritosParaGerar.length === 0) return;
    setIsGenerating(true);
    const logoUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/angola-brasao.png`;
    const capacidadeNum = parseInt(capacidadeSala, 10) || 30;
    const cfg = { nomeEscola, anoExame, local, campus, sala, hora, disciplinas, logoUrl, capacidadeSala: capacidadeNum };
    const body = ciclo === 'I_CICLO' ? buildICicloHTML(inscritosParaGerar, cfg) : buildIICicloHTML(inscritosParaGerar, cfg);
    let scopeLabel: string;
    if (ciclo === 'II_CICLO') {
      const c = filtroCurso !== 'TODOS' ? filtroCurso : 'Todos os Cursos';
      const cl = filtroClasse !== 'TODAS' ? ` — ${filtroClasse}` : '';
      scopeLabel = `II Ciclo — ${c}${cl}`;
    } else {
      scopeLabel = filtroClasse !== 'TODAS' ? `I Ciclo — ${filtroClasse}` : 'I Ciclo — Todas as Classes';
    }
    const html = buildFullHTML(body, `Lista de Admissão — ${scopeLabel} — ${nomeEscola}`);
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    setIsGenerating(false);
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <AppLoader color={Colors.gold} size="large" />
        <Text style={styles.loadingText}>A carregar...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />

      <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Lista de Admissão por Sala de Exame</Text>
            <Text style={styles.headerSub}>{inscritos.length} candidato(s) · {classesPresentesNoFiltro.length} classe(s)</Text>
          </View>
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.printBtn, (isGenerating || inscritosParaGerar.length === 0) && { opacity: 0.45 }]}
              onPress={handleGerar}
              disabled={isGenerating || inscritosParaGerar.length === 0}
            >
              {isGenerating
                ? <AppLoader color="#fff" size="small" />
                : <><Ionicons name="print-outline" size={15} color="#fff" /><Text style={styles.printBtnText}>{inscritosParaGerar.length === 0 ? 'Sem candidatos' : `Gerar (${inscritosParaGerar.length})`}</Text></>
              }
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 32 }]} showsVerticalScrollIndicator={false}>

        {/* ── Ciclo selector ── */}
        <View style={styles.cicloRow}>
          {(['I_CICLO', 'II_CICLO'] as Ciclo[]).map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.cicloBtn, ciclo === c && styles.cicloBtnActive]}
              onPress={() => setCiclo(c)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={c === 'I_CICLO' ? 'school-outline' : 'library-outline'}
                size={14}
                color={ciclo === c ? Colors.gold : Colors.textMuted}
              />
              <Text style={[styles.cicloBtnText, ciclo === c && styles.cicloBtnTextActive]}>
                {c === 'I_CICLO' ? 'I Ciclo  (7ª Classe)' : 'II Ciclo (10ª Classe)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {ciclo === 'I_CICLO' && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.gold} />
            <Text style={styles.infoBannerText}>
              I Ciclo: lista de admissão apenas para a 7ª Classe (classe de entrada). As classes 8ª e 9ª são alunos já matriculados.
            </Text>
          </View>
        )}
        {ciclo === 'II_CICLO' && (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.gold} />
            <Text style={styles.infoBannerText}>
              II Ciclo: lista de admissão apenas para a 10ª Classe (classe de entrada), com sub-secção por curso/área. As classes 11ª, 12ª e 13ª são alunos já matriculados.
            </Text>
          </View>
        )}

        {/* ── Config ── */}
        <TouchableOpacity style={styles.sectionToggle} onPress={() => setShowConfig(v => !v)} activeOpacity={0.8}>
          <Ionicons name="settings-outline" size={15} color={Colors.gold} />
          <Text style={styles.sectionToggleText}>Configurações do Documento</Text>
          <Ionicons name={showConfig ? 'chevron-up' : 'chevron-down'} size={15} color={Colors.textMuted} />
        </TouchableOpacity>

        {showConfig && (
          <View style={styles.configCard}>
            <View style={styles.configRow}>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Ano do Exame</Text>
                <TextInput style={styles.configInput} value={anoExame} onChangeText={setAnoExame} placeholderTextColor={Colors.textMuted} placeholder="2026" keyboardType="numeric" />
              </View>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Hora</Text>
                <TextInput style={styles.configInput} value={hora} onChangeText={setHora} placeholderTextColor={Colors.textMuted} placeholder="07:30:00" />
              </View>
            </View>
            <View style={styles.configRow}>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Local</Text>
                <TextInput style={styles.configInput} value={local} onChangeText={setLocal} placeholderTextColor={Colors.textMuted} placeholder="Ex: Luanda" />
              </View>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Campus / Instituto</Text>
                <TextInput style={styles.configInput} value={campus} onChangeText={setCampus} placeholderTextColor={Colors.textMuted} placeholder="Ex: Campus Principal" />
              </View>
            </View>
            <View style={styles.configRow}>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Prefixo das Salas</Text>
                <TextInput style={styles.configInput} value={sala} onChangeText={setSala} placeholderTextColor={Colors.textMuted} placeholder="Ex: Sala (gera Sala 1, Sala 2...)" />
              </View>
              <View style={styles.configField}>
                <Text style={styles.configLabel}>Capacidade por Sala</Text>
                <TextInput style={styles.configInput} value={capacidadeSala} onChangeText={setCapacidadeSala} placeholderTextColor={Colors.textMuted} placeholder="30" keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.gold} />
              <Text style={styles.infoBannerText}>
                Os candidatos são distribuídos automaticamente por sala (ordem alfabética), com número de carteira atribuído em cada sala, respeitando a capacidade definida acima.
              </Text>
            </View>
            <View style={styles.disciplinasSection}>
              <Text style={[styles.configLabel, { marginBottom: 8 }]}>Disciplinas e Datas dos Exames</Text>
              {disciplinas.map((d, i) => (
                <View key={i} style={styles.disciplinaCard}>
                  <View style={styles.disciplinaCardHeader}>
                    <Text style={styles.disciplinaNum}>Disciplina {i + 1}</Text>
                    {disciplinas.length > 1 && (
                      <TouchableOpacity onPress={() => removeDisciplina(i)} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[styles.configInput, styles.disciplinaNomeInput]}
                    value={d.nome}
                    onChangeText={v => updateDisciplina(i, 'nome', v)}
                    placeholder={`Ex: Língua Portuguesa`}
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={styles.disciplinaDateRow}>
                    <TextInput
                      style={[styles.configInput, styles.disciplinaDiaInput]}
                      value={d.diaSemana}
                      onChangeText={v => updateDisciplina(i, 'diaSemana', v)}
                      placeholder="Dia da semana"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TextInput
                      style={[styles.configInput, styles.disciplinaDataInput]}
                      value={d.data}
                      onChangeText={v => updateDisciplina(i, 'data', v)}
                      placeholder="Ex: 07 Mar 2026"
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addDisciplinaBtn} onPress={addDisciplina} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={17} color={Colors.gold} />
                <Text style={styles.addDisciplinaTxt}>Adicionar Disciplina</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Filtro de Emissão ── */}
        {inscritos.length > 0 && (
          <View style={styles.filtroCard}>
            <View style={styles.filtroHeader}>
              <Ionicons name="funnel-outline" size={14} color={Colors.gold} />
              <Text style={styles.filtroTitle}>Filtro de Emissão</Text>
              <Text style={styles.filtroSub}>Seleccione o que pretende emitir</Text>
            </View>

            {/* ── II CICLO: Selector de Curso (primário) ── */}
            {ciclo === 'II_CICLO' && (
              <>
                <Text style={styles.filtroLabel}>Curso</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10, paddingVertical: 2 }}>
                  <TouchableOpacity
                    style={[styles.filtroChip, filtroCurso === 'TODOS' && styles.filtroChipCursoActive]}
                    onPress={() => { setFiltroCurso('TODOS'); setFiltroClasse('TODAS'); }}
                  >
                    <Text style={[styles.filtroChipText, filtroCurso === 'TODOS' && styles.filtroChipTextActive]}>
                      Todos os cursos ({inscritos.length})
                    </Text>
                  </TouchableOpacity>
                  {cursosNoIICiclo.map(curso => {
                    const ct = inscritos.filter(r => (r.cursoNome?.trim() || 'Sem Curso Definido') === curso).length;
                    return (
                      <TouchableOpacity
                        key={curso}
                        style={[styles.filtroChip, filtroCurso === curso && styles.filtroChipCursoActive]}
                        onPress={() => { setFiltroCurso(curso); setFiltroClasse('TODAS'); }}
                      >
                        <Text style={[styles.filtroChipText, filtroCurso === curso && styles.filtroChipTextActive]}>
                          {curso} ({ct})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Selector de Classe (secundário — aparece após escolher curso) */}
                {filtroCurso !== 'TODOS' && classesNoCurso.length > 0 && (
                  <>
                    <Text style={styles.filtroLabel}>Classe  <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', textTransform: 'none', letterSpacing: 0 }}>dentro de {filtroCurso}</Text></Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                        <TouchableOpacity
                          style={[styles.filtroChip, filtroClasse === 'TODAS' && styles.filtroChipActive]}
                          onPress={() => setFiltroClasse('TODAS')}
                        >
                          <Text style={[styles.filtroChipText, filtroClasse === 'TODAS' && styles.filtroChipTextActive]}>
                            Todas as classes ({inscritos.filter(r => (r.cursoNome?.trim() || 'Sem Curso Definido') === filtroCurso).length})
                          </Text>
                        </TouchableOpacity>
                        {classesNoCurso.map(cls => {
                          const ct = inscritos.filter(r => (r.cursoNome?.trim() || 'Sem Curso Definido') === filtroCurso && r.classe?.trim() === cls).length;
                          return (
                            <TouchableOpacity
                              key={cls}
                              style={[styles.filtroChip, filtroClasse === cls && styles.filtroChipActive]}
                              onPress={() => setFiltroClasse(cls)}
                            >
                              <Text style={[styles.filtroChipText, filtroClasse === cls && styles.filtroChipTextActive]}>
                                {cls} ({ct})
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                )}
              </>
            )}

            {/* ── I CICLO: Selector de Classe (único filtro) ── */}
            {ciclo === 'I_CICLO' && (
              <>
                <Text style={styles.filtroLabel}>Classe</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                    <TouchableOpacity
                      style={[styles.filtroChip, filtroClasse === 'TODAS' && styles.filtroChipActive]}
                      onPress={() => setFiltroClasse('TODAS')}
                    >
                      <Text style={[styles.filtroChipText, filtroClasse === 'TODAS' && styles.filtroChipTextActive]}>
                        Todas ({inscritos.length})
                      </Text>
                    </TouchableOpacity>
                    {classesPresentesNoFiltro.map(cls => (
                      <TouchableOpacity
                        key={cls}
                        style={[styles.filtroChip, filtroClasse === cls && styles.filtroChipActive]}
                        onPress={() => setFiltroClasse(cls)}
                      >
                        <Text style={[styles.filtroChipText, filtroClasse === cls && styles.filtroChipTextActive]}>
                          {cls} ({byClasse[cls]?.length ?? 0})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Resumo do que vai ser emitido */}
            <View style={styles.filtroResumo}>
              <Ionicons name="document-text-outline" size={13} color={inscritosParaGerar.length > 0 ? Colors.success : Colors.textMuted} />
              <Text style={[styles.filtroResumoText, { color: inscritosParaGerar.length > 0 ? Colors.success : Colors.textMuted }]}>
                {inscritosParaGerar.length > 0
                  ? `${inscritosParaGerar.length} candidato(s) serão incluídos na lista`
                  : 'Nenhum candidato corresponde ao filtro seleccionado'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Summary cards ── */}
        {classesPresentesNoFiltro.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              {classesPresentesNoFiltro.map(cls => {
                const ct = byClasse[cls]?.length ?? 0;
                const cursosCls = ciclo === 'II_CICLO'
                  ? Array.from(new Set((byClasse[cls] ?? []).map(r => r.cursoNome?.trim() || 'Sem Curso'))).length
                  : null;
                return (
                  <View key={cls} style={styles.classSummary}>
                    <Text style={styles.classSummaryNum}>{ct}</Text>
                    <Text style={styles.classSummaryLabel}>{cls}</Text>
                    {cursosCls !== null && <Text style={styles.classSummarySub}>{cursosCls} curso(s)</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Preview list ── */}
        {inscritos.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              Nenhum candidato inscrito para o {ciclo === 'I_CICLO' ? 'I Ciclo' : 'II Ciclo'}
            </Text>
          </View>
        ) : (
          classesPresentesNoFiltro.map(cls => {
            const alunosClasse = (byClasse[cls] ?? [])
              .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt', { sensitivity: 'base' }));

            const cursosCls = ciclo === 'II_CICLO'
              ? Array.from(new Set(alunosClasse.map(r => r.cursoNome?.trim() || 'Sem Curso'))).sort()
              : null;

            const collapsed = seccoesColapsadas.has(cls);

            return (
              <View key={cls} style={styles.classeGroup}>
                <TouchableOpacity style={styles.classeGroupHeader} onPress={() => toggleSeccao(cls)} activeOpacity={0.75}>
                  <Ionicons name="layers-outline" size={13} color={Colors.gold} />
                  <Text style={styles.classeGroupTitle}>{cls}</Text>
                  <View style={styles.classeGroupBadge}>
                    <Text style={styles.classeGroupBadgeText}>{alunosClasse.length}</Text>
                  </View>
                  {ciclo === 'II_CICLO' && cursosCls && (
                    <Text style={styles.classeGroupSub}>{cursosCls.length} curso(s)</Text>
                  )}
                  <Ionicons
                    name={collapsed ? 'chevron-down-outline' : 'chevron-up-outline'}
                    size={14}
                    color={Colors.textMuted}
                    style={{ marginLeft: 'auto' as any }}
                  />
                </TouchableOpacity>

                {!collapsed && alunosClasse.slice(0, 6).map((r, idx) => (
                  <View key={r.id} style={styles.regRow}>
                    <Text style={styles.regNum}>{idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.regNome}>{r.nomeCompleto}</Text>
                      {ciclo === 'II_CICLO' && (
                        <Text style={styles.regSub}>{r.cursoNome || 'Sem Curso'}</Text>
                      )}
                    </View>
                    <Text style={styles.regCand}>
                      {r.rupeInscricao?.split('-')[3] || '—'}
                    </Text>
                  </View>
                ))}
                {!collapsed && alunosClasse.length > 6 && (
                  <Text style={styles.moreText}>
                    + {alunosClasse.length - 6} candidatos adicionais na impressão
                  </Text>
                )}
              </View>
            );
          })
        )}

        {/* ── Generate button ── */}
        {Platform.OS === 'web' && inscritos.length > 0 && (
          <TouchableOpacity
            style={[styles.gerarBtn, (isGenerating || inscritosParaGerar.length === 0) && { opacity: 0.45 }]}
            onPress={handleGerar}
            disabled={isGenerating || inscritosParaGerar.length === 0}
            activeOpacity={0.85}
          >
            {isGenerating
              ? <AppLoader color="#fff" size="small" />
              : <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.gerarBtnText}>
                    Gerar & Imprimir Lista
                  </Text>
                  <Text style={styles.gerarBtnSub}>
                    {inscritosParaGerar.length > 0
                      ? ciclo === 'II_CICLO'
                        ? `${inscritosParaGerar.length} candidato(s) · ${filtroCurso === 'TODOS' ? 'Todos os cursos' : filtroCurso}${filtroClasse !== 'TODAS' ? ` · ${filtroClasse}` : ''}`
                        : `${inscritosParaGerar.length} candidato(s) · ${filtroClasse === 'TODAS' ? `${classesPresentesNoFiltro.length} classe(s)` : filtroClasse}`
                      : 'Nenhum candidato no filtro seleccionado'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
              </>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#061029' },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E3A5F', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  printBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loadingText: { color: Colors.textMuted, marginTop: 12, fontSize: 14 },
  scroll: { padding: 16, gap: 12 },

  cicloRow: { flexDirection: 'row', gap: 10 },
  cicloBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  cicloBtnActive: { backgroundColor: 'rgba(26,43,95,0.7)', borderColor: Colors.gold + '80' },
  cicloBtnText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  cicloBtnTextActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(234,179,8,0.08)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)' },
  infoBannerText: { flex: 1, fontSize: 11.5, color: Colors.textMuted, lineHeight: 17 },

  sectionToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sectionToggleText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  configCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 8 },
  configRow: { flexDirection: 'row', gap: 10 },
  configField: { flex: 1, gap: 4 },
  configLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  configInput: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 8, color: Colors.text, fontSize: 12 },
  disciplinasSection: { marginTop: 12, gap: 8 },
  disciplinaCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 6 },
  disciplinaCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disciplinaNum: { fontSize: 10, color: Colors.gold, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  disciplinaNomeInput: { width: '100%' },
  disciplinaDateRow: { flexDirection: 'row', gap: 8 },
  disciplinaDiaInput: { flex: 1, minWidth: 0 },
  disciplinaDataInput: { flex: 1.5, minWidth: 0 },
  removeBtn: { padding: 2 },
  addDisciplinaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)', paddingHorizontal: 14, paddingVertical: 10, marginTop: 2 },
  addDisciplinaTxt: { fontSize: 13, color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  summaryCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-around' },
  classSummary: { alignItems: 'center', minWidth: 70, padding: 6 },
  classSummaryNum: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold },
  classSummaryLabel: { fontSize: 10, color: Colors.text, textAlign: 'center', marginTop: 2 },
  classSummarySub: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },

  classeGroup: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  classeGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(26,43,95,0.6)', paddingHorizontal: 12, paddingVertical: 10 },
  classeGroupTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  classeGroupBadge: { backgroundColor: Colors.gold, borderRadius: 12, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center' },
  classeGroupBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#000' },
  classeGroupSub: { fontSize: 10, color: Colors.textMuted },

  regRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  regNum: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, width: 22, textAlign: 'center' },
  regNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  regSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  regCand: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold, minWidth: 44, textAlign: 'right' },

  moreText: { textAlign: 'center', color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', padding: 8 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },

  gerarBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1E3A5F', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginTop: 4 },
  gerarBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  gerarBtnSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },

  filtroCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)', gap: 4 },
  filtroHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  filtroTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  filtroSub: { fontSize: 10, color: Colors.textMuted },
  filtroLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  filtroChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
  filtroChipActive: { borderColor: Colors.gold, backgroundColor: 'rgba(234,179,8,0.15)' },
  filtroChipCursoActive: { borderColor: Colors.info, backgroundColor: 'rgba(59,130,246,0.15)' },
  filtroChipText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  filtroChipTextActive: { color: Colors.text, fontFamily: 'Inter_700Bold' },
  filtroResumo: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  filtroResumoText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
