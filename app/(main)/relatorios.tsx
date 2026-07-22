import React, { useMemo, useState } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';
import { BarChart, LineChart, PieChart } from '@/components/Charts';

const { width } = Dimensions.get('window');
const CHART_W = Math.min(width - 64, 340);

type Periodo = 'T1' | 'T2' | 'T3' | 'Anual';
type TipoMapa = 'notas' | 'presencas' | 'aprovacao';

function MetricCard({ label, value, color, icon, desc }: any) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}15` }]}>
        {icon}
      </View>
      <View style={styles.metricContent}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
        {desc && <Text style={styles.metricDesc}>{desc}</Text>}
      </View>
    </View>
  );
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Print Functions ──────────────────────────────────────────────────────────

function printHTML(html: string) {
  if (Platform.OS !== 'web') return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function baseHTMLHead(title: string, nomeEscola: string, anoLetivo: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 landscape; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  h1 { font-size: 13pt; text-align: center; margin-bottom: 2px; }
  .sub { text-align: center; font-size: 9pt; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { background: #1E3A5F; color: #fff; padding: 6px 8px; font-size: 8.5pt; text-align: left; }
  td { padding: 5px 8px; font-size: 8.5pt; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f5f5f5; }
  .header-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 8.5pt; color: #333; }
  .badge-ok { color: #1a7a3a; font-weight: bold; }
  .badge-fail { color: #c0392b; font-weight: bold; }
  .badge-warn { color: #e67e22; font-weight: bold; }
  .footer { margin-top: 18px; font-size: 8pt; color: #777; text-align: center; }
  .stat-row { display: flex; gap: 16px; margin: 10px 0; }
  .stat-box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; min-width: 100px; text-align: center; }
  .stat-val { font-size: 15pt; font-weight: bold; }
  .stat-lbl { font-size: 8pt; color: #666; }
</style>
</head>
<body>
<div style="text-align:center;margin-bottom:10px;">
  <img src="/angola-brasao.png" style="width:60px;height:auto;display:block;margin:0 auto 5px;" alt="Insígnia" onerror="this.style.display='none'" />
  <p style="font-size:9pt;margin:0;line-height:1.6;">REPÚBLICA DE ANGOLA</p>
  <p style="font-size:9pt;margin:0;line-height:1.6;">MINISTÉRIO DA EDUCAÇÃO</p>
  <p style="font-size:9pt;margin:0;line-height:1.6;">ENSINO GERAL</p>
</div>
<h1>${nomeEscola}</h1>
<p class="sub">${title} — Ano Lectivo: ${anoLetivo} — Emitido em: ${hoje()}</p>`;
}

function gerarHTMLNotas(
  periodo: Periodo,
  turmas: any[], alunos: any[], notas: any[],
  nomeEscola: string, anoLetivo: string,
): string {
  const trimestre = periodo === 'T1' ? 1 : periodo === 'T2' ? 2 : periodo === 'T3' ? 3 : null;
  const titulo = `Mapa de Notas — ${periodo}`;

  const rows = turmas.map(turma => {
    const turmAlunos = alunos.filter(a => a.turmaId === turma.id && a.ativo);
    const linhas = turmAlunos.map(aluno => {
      const notasAluno = trimestre
        ? notas.filter(n => n.alunoId === aluno.id && n.trimestre === trimestre)
        : notas.filter(n => n.alunoId === aluno.id);

      const disciplinas = [...new Set(notasAluno.map((n: any) => n.disciplina))];

      if (trimestre) {
        const media = notasAluno.length
          ? (notasAluno.reduce((s: number, n: any) => s + n.mac, 0) / notasAluno.length).toFixed(1)
          : '—';
        const aprovado = notasAluno.length && notasAluno.every((n: any) => n.mac >= 10);
        return { aluno, media, aprovado, disciplinas };
      } else {
        // Anual: média de todas as notas
        const media = notasAluno.length
          ? (notasAluno.reduce((s: number, n: any) => s + n.mac, 0) / notasAluno.length).toFixed(1)
          : '—';
        const aprovado = notasAluno.length && notasAluno.every((n: any) => n.mac >= 10);
        return { aluno, media, aprovado, disciplinas };
      }
    });
    return { turma, linhas };
  }).filter(t => t.linhas.length > 0);

  let html = baseHTMLHead(titulo, nomeEscola, anoLetivo);
  rows.forEach(({ turma, linhas }) => {
    const aprovados = linhas.filter(l => l.aprovado).length;
    html += `
    <h3 style="margin-top:18px;font-size:10pt;border-bottom:2px solid #1E3A5F;padding-bottom:4px;">
      Turma: ${turma.nome} — Classe ${turma.classe} — ${turma.nivel}
    </h3>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${linhas.length}</div><div class="stat-lbl">Alunos</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1a7a3a">${aprovados}</div><div class="stat-lbl">Aprovados</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#c0392b">${linhas.length - aprovados}</div><div class="stat-lbl">Reprovados</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nome Completo</th>
          <th>Nº Matrícula</th>
          <th>Média (${periodo})</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${l.aluno.nome} ${l.aluno.apelido}</td>
            <td>${l.aluno.numeroMatricula}</td>
            <td><strong>${l.media}</strong>/20</td>
            <td class="${l.aprovado ? 'badge-ok' : l.media === '—' ? '' : 'badge-fail'}">
              ${l.media === '—' ? '—' : l.aprovado ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  });

  html += `<p class="footer">Documento gerado pelo QUETA — ${hoje()}</p></body></html>`;
  return html;
}

function gerarHTMLPresencas(
  periodo: Periodo,
  turmas: any[], alunos: any[], presencas: any[],
  nomeEscola: string, anoLetivo: string,
): string {
  const titulo = `Mapa de Presenças — ${periodo}`;
  let html = baseHTMLHead(titulo, nomeEscola, anoLetivo);

  turmas.forEach(turma => {
    const turmAlunos = alunos.filter(a => a.turmaId === turma.id && a.ativo);
    if (turmAlunos.length === 0) return;

    const linhas = turmAlunos.map(aluno => {
      const pAluno = presencas.filter(p => p.alunoId === aluno.id);
      const total = pAluno.length;
      const presentes = pAluno.filter(p => p.status === 'P').length;
      const faltas = pAluno.filter(p => p.status === 'F').length;
      const justificadas = pAluno.filter(p => p.status === 'J').length;
      const taxa = total > 0 ? Math.round((presentes / total) * 100) : null;
      return { aluno, total, presentes, faltas, justificadas, taxa };
    });

    const totalPresentes = linhas.reduce((s, l) => s + l.presentes, 0);
    const totalFaltas = linhas.reduce((s, l) => s + l.faltas, 0);
    const totalRegistos = linhas.reduce((s, l) => s + l.total, 0);
    const taxaGeral = totalRegistos > 0 ? Math.round((totalPresentes / totalRegistos) * 100) : 0;

    html += `
    <h3 style="margin-top:18px;font-size:10pt;border-bottom:2px solid #1E3A5F;padding-bottom:4px;">
      Turma: ${turma.nome} — Classe ${turma.classe} — ${turma.nivel}
    </h3>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${linhas.length}</div><div class="stat-lbl">Alunos</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1a7a3a">${totalPresentes}</div><div class="stat-lbl">Presenças</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#c0392b">${totalFaltas}</div><div class="stat-lbl">Faltas</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1E3A5F">${taxaGeral}%</div><div class="stat-lbl">Taxa Presença</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nome Completo</th>
          <th>Nº Matrícula</th>
          <th>Total Aulas</th>
          <th>Presenças</th>
          <th>Faltas</th>
          <th>Justificadas</th>
          <th>Taxa (%)</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${l.aluno.nome} ${l.aluno.apelido}</td>
            <td>${l.aluno.numeroMatricula}</td>
            <td>${l.total}</td>
            <td class="badge-ok">${l.presentes}</td>
            <td class="badge-fail">${l.faltas}</td>
            <td class="badge-warn">${l.justificadas}</td>
            <td>${l.taxa !== null ? `${l.taxa}%` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  });

  html += `<p class="footer">Documento gerado pelo QUETA — ${hoje()}</p></body></html>`;
  return html;
}

function gerarHTMLAprovacao(
  periodo: Periodo,
  turmas: any[], alunos: any[], notas: any[],
  nomeEscola: string, anoLetivo: string,
): string {
  const trimestre = periodo === 'T1' ? 1 : periodo === 'T2' ? 2 : periodo === 'T3' ? 3 : null;
  const titulo = `Mapa de Aprovação/Reprovação — ${periodo}`;
  let html = baseHTMLHead(titulo, nomeEscola, anoLetivo);

  const resumoGeral: any[] = [];

  turmas.forEach(turma => {
    const turmAlunos = alunos.filter(a => a.turmaId === turma.id && a.ativo);
    if (turmAlunos.length === 0) return;

    const linhas = turmAlunos.map(aluno => {
      const notasAluno = trimestre
        ? notas.filter(n => n.alunoId === aluno.id && n.trimestre === trimestre)
        : notas.filter(n => n.alunoId === aluno.id);
      const media = notasAluno.length
        ? (notasAluno.reduce((s: number, n: any) => s + n.mac, 0) / notasAluno.length)
        : null;
      const aprovado = media !== null && media >= 10;
      return { aluno, media, aprovado };
    });

    const aprovados = linhas.filter(l => l.aprovado).length;
    const reprovados = linhas.filter(l => l.media !== null && !l.aprovado).length;
    const semNotas = linhas.filter(l => l.media === null).length;
    const taxa = linhas.length > 0 ? Math.round((aprovados / linhas.length) * 100) : 0;

    resumoGeral.push({ turma, total: linhas.length, aprovados, reprovados, semNotas, taxa });

    html += `
    <h3 style="margin-top:18px;font-size:10pt;border-bottom:2px solid #1E3A5F;padding-bottom:4px;">
      Turma: ${turma.nome} — Classe ${turma.classe} — ${turma.nivel}
    </h3>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${linhas.length}</div><div class="stat-lbl">Total</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1a7a3a">${aprovados}</div><div class="stat-lbl">Aprovados</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#c0392b">${reprovados}</div><div class="stat-lbl">Reprovados</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1E3A5F">${taxa}%</div><div class="stat-lbl">Taxa Aprov.</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nome Completo</th>
          <th>Nº Matrícula</th>
          <th>Média Final</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${l.aluno.nome} ${l.aluno.apelido}</td>
            <td>${l.aluno.numeroMatricula}</td>
            <td><strong>${l.media !== null ? l.media.toFixed(1) : '—'}</strong>${l.media !== null ? '/20' : ''}</td>
            <td class="${l.media === null ? '' : l.aprovado ? 'badge-ok' : 'badge-fail'}">
              ${l.media === null ? 'Sem notas' : l.aprovado ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  });

  // Resumo geral no fim
  if (resumoGeral.length > 0) {
    const totalAlunos = resumoGeral.reduce((s, r) => s + r.total, 0);
    const totalAprov = resumoGeral.reduce((s, r) => s + r.aprovados, 0);
    const totalReprov = resumoGeral.reduce((s, r) => s + r.reprovados, 0);
    const taxaGeral = totalAlunos > 0 ? Math.round((totalAprov / totalAlunos) * 100) : 0;

    html += `
    <h3 style="margin-top:24px;font-size:10pt;border-bottom:2px solid #C0392B;padding-bottom:4px;">
      Resumo Geral — Todas as Turmas
    </h3>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-val">${totalAlunos}</div><div class="stat-lbl">Total Alunos</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1a7a3a">${totalAprov}</div><div class="stat-lbl">Aprovados</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#c0392b">${totalReprov}</div><div class="stat-lbl">Reprovados</div></div>
      <div class="stat-box"><div class="stat-val" style="color:#1E3A5F">${taxaGeral}%</div><div class="stat-lbl">Taxa Geral</div></div>
    </div>
    <table>
      <thead>
        <tr><th>Turma</th><th>Classe</th><th>Nível</th><th>Total</th><th>Aprovados</th><th>Reprovados</th><th>Taxa (%)</th></tr>
      </thead>
      <tbody>
        ${resumoGeral.map(r => `
          <tr>
            <td>${r.turma.nome}</td>
            <td>${r.turma.classe}</td>
            <td>${r.turma.nivel}</td>
            <td>${r.total}</td>
            <td class="badge-ok">${r.aprovados}</td>
            <td class="badge-fail">${r.reprovados}</td>
            <td>${r.taxa}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  html += `<p class="footer">Documento gerado pelo QUETA — ${hoje()}</p></body></html>`;
  return html;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RelatoriosScreen() {
  const { alunos, professores, turmas, notas, presencas } = useData();
  const { config } = useConfig();
  const { anos, anoAtivo } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useTabMemory<'geral' | 'notas' | 'presencas' | 'mapas'>('relatorios', 'geral');
  const [periodo, setPeriodo] = useState<Periodo>('T1');
  const [tipoMapa, setTipoMapa] = useState<TipoMapa>('notas');
  const [anoFiltroId, setAnoFiltroId] = useState<string | null>(null);
  const [turmaFiltroId, setTurmaFiltroId] = useState<string>('todas');
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const router = useRouter();
  const nomeEscola = config?.nomeEscola ?? 'Super Escola';
  const anoLetivo = anoAtivo?.ano ?? String(new Date().getFullYear());

  // Ano lectivo seleccionado nos Mapas (default = ano activo ou o mais recente)
  const anoFiltro = useMemo(() => {
    if (anoFiltroId) return anos.find(a => a.id === anoFiltroId) ?? null;
    if (anoAtivo) return anoAtivo;
    return anos[0] ?? null;
  }, [anoFiltroId, anos, anoAtivo]);

  // Turmas do ano lectivo filtrado
  const turmasFiltroAno = useMemo(() => {
    if (!anoFiltro) return turmas.filter(t => t.ativo);
    return turmas.filter(t => t.anoLetivo === anoFiltro.ano && t.ativo);
  }, [anoFiltro, turmas]);

  // Turma(s) seleccionada(s)
  const turmasFiltradas = useMemo(() => {
    if (turmaFiltroId === 'todas') return turmasFiltroAno;
    return turmasFiltroAno.filter(t => t.id === turmaFiltroId);
  }, [turmaFiltroId, turmasFiltroAno]);

  const geralStats = useMemo(() => {
    const totalAlunos = alunos.filter(a => a.ativo).length;
    const totalProfs = professores.filter(p => p.ativo).length;
    const totalTurmas = turmas.filter(t => t.ativo).length;
    const aprovados = notas.filter(n => n.mac >= 10).length;
    const reprovados = notas.filter(n => n.mac < 10).length;
    const taxaAprovacao = notas.length ? Math.round((aprovados / notas.length) * 100) : 0;
    const mediaGeral = notas.length ? (notas.reduce((s, n) => s + n.mac, 0) / notas.length) : 0;

    const generoM = alunos.filter(a => a.genero === 'M').length;
    const generoF = alunos.filter(a => a.genero === 'F').length;

    return { totalAlunos, totalProfs, totalTurmas, aprovados, reprovados, taxaAprovacao, mediaGeral: parseFloat(mediaGeral.toFixed(1)), generoM, generoF };
  }, [alunos, professores, turmas, notas]);

  const notasStats = useMemo(() => {
    const disciplinas = [...new Set(notas.map(n => n.disciplina))];
    const disciplinaData = disciplinas.map((d, i) => {
      const disciplinaNotas = notas.filter(n => n.disciplina === d);
      const media = disciplinaNotas.reduce((s, n) => s + n.mac, 0) / disciplinaNotas.length;
      const taxa = Math.round((disciplinaNotas.filter(n => n.mac >= 10).length / disciplinaNotas.length) * 100);
      const colors = [Colors.gold, Colors.accent, Colors.info, Colors.success, Colors.warning];
      return { disciplina: d, media: parseFloat(media.toFixed(1)), taxa, color: colors[i % colors.length], label: d.substring(0, 4) };
    });

    const classesData = turmas.map((t, i) => {
      const turmaAlunos = alunos.filter(a => a.turmaId === t.id).map(a => a.id);
      const turmaNotas = notas.filter(n => turmaAlunos.includes(n.alunoId));
      const media = turmaNotas.length ? turmaNotas.reduce((s, n) => s + n.mac, 0) / turmaNotas.length : 0;
      const colors = [Colors.info, Colors.gold, Colors.success, Colors.accent];
      return { label: t.nome, value: parseFloat(media.toFixed(1)), color: colors[i % colors.length] };
    });

    const trimestreData = [1, 2, 3].map(t => {
      const tNotas = notas.filter(n => n.trimestre === t);
      const media = tNotas.length ? tNotas.reduce((s, n) => s + n.mac, 0) / tNotas.length : 0;
      return { label: `T${t}`, value: parseFloat(media.toFixed(1)) };
    });

    return { disciplinaData, classesData, trimestreData };
  }, [notas, turmas, alunos]);

  const presencaStats = useMemo(() => {
    const totalPresencas = presencas.length;
    const presentes = presencas.filter(p => p.status === 'P').length;
    const faltas = presencas.filter(p => p.status === 'F').length;
    const justificadas = presencas.filter(p => p.status === 'J').length;
    const taxaPresenca = totalPresencas ? Math.round((presentes / totalPresencas) * 100) : 0;

    return { totalPresencas, presentes, faltas, justificadas, taxaPresenca };
  }, [presencas]);

  // ── Mapas Stats (preview cards) ──────────────────────────────────────────
  const mapasStats = useMemo(() => {
    const trimestre = periodo === 'T1' ? 1 : periodo === 'T2' ? 2 : periodo === 'T3' ? 3 : null;
    const turmaIds = new Set(turmasFiltradas.map(t => t.id));
    const alunosFiltrados = alunos.filter(a => turmaIds.has(a.turmaId) && a.ativo);
    const alunoIds = new Set(alunosFiltrados.map(a => a.id));

    const notasFiltradas = notas.filter(n =>
      turmaIds.has(n.turmaId) && (trimestre ? n.trimestre === trimestre : true)
    );

    const aprovados = notasFiltradas.filter(n => n.mac >= 10).length;
    const taxa = notasFiltradas.length ? Math.round((aprovados / notasFiltradas.length) * 100) : 0;
    const media = notasFiltradas.length
      ? (notasFiltradas.reduce((s, n) => s + n.mac, 0) / notasFiltradas.length).toFixed(1)
      : '—';

    const presencasFiltradas = presencas.filter(p => alunoIds.has(p.alunoId));
    const presentes = presencasFiltradas.filter(p => p.status === 'P').length;
    const taxaPresenca = presencasFiltradas.length
      ? Math.round((presentes / presencasFiltradas.length) * 100)
      : 0;

    return {
      taxa, media, taxaPresenca,
      totalAlunos: alunosFiltrados.length,
      totalTurmas: turmasFiltradas.length,
      totalNotas: notasFiltradas.length,
    };
  }, [periodo, notas, presencas, turmasFiltradas, alunos]);

  const handlePrint = () => {
    if (Platform.OS !== 'web') return;
    const anoImpresso = anoFiltro?.ano ?? anoLetivo;
    if (tipoMapa === 'notas') {
      printHTML(gerarHTMLNotas(periodo, turmasFiltradas, alunos, notas, nomeEscola, anoImpresso));
    } else if (tipoMapa === 'presencas') {
      printHTML(gerarHTMLPresencas(periodo, turmasFiltradas, alunos, presencas, nomeEscola, anoImpresso));
    } else {
      printHTML(gerarHTMLAprovacao(periodo, turmasFiltradas, alunos, notas, nomeEscola, anoImpresso));
    }
  };

  const renderGeral = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        <MetricCard label="Total de Alunos" value={geralStats.totalAlunos} color={Colors.info} icon={<Ionicons name="people" size={20} color={Colors.info} />} />
        <MetricCard label="Professores" value={geralStats.totalProfs} color={Colors.gold} icon={<Ionicons name="person" size={20} color={Colors.gold} />} />
        <MetricCard label="Turmas Activas" value={geralStats.totalTurmas} color={Colors.success} icon={<Ionicons name="library" size={20} color={Colors.success} />} />
        <MetricCard label="Taxa de Aprovação" value={`${geralStats.taxaAprovacao}%`} color={Colors.accent} icon={<Ionicons name="checkmark-circle" size={20} color={Colors.accent} />} />
        <MetricCard label="Média Geral" value={`${geralStats.mediaGeral}/20`} color={Colors.warning} icon={<Ionicons name="stats-chart" size={20} color={Colors.warning} />} desc="Escala 0–20" />
        <MetricCard label="Aprovados" value={geralStats.aprovados} color={Colors.success} icon={<Ionicons name="school" size={20} color={Colors.success} />} />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Distribuição por Género</Text>
        <View style={styles.chartCard}>
          <PieChart
            data={[
              { label: 'Masculino', value: geralStats.generoM, color: Colors.info },
              { label: 'Feminino', value: geralStats.generoF, color: Colors.accent },
            ]}
            size={160}
          />
        </View>
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Alunos por Nível</Text>
        <View style={styles.chartCard}>
          <PieChart
            data={[
              { label: 'Primário', value: alunos.filter(a => turmas.find(t => t.id === a.turmaId)?.nivel === 'Primário').length, color: Colors.success },
              { label: 'I Ciclo', value: alunos.filter(a => turmas.find(t => t.id === a.turmaId)?.nivel === 'I Ciclo').length, color: Colors.gold },
              { label: 'II Ciclo', value: alunos.filter(a => turmas.find(t => t.id === a.turmaId)?.nivel === 'II Ciclo').length, color: Colors.accent },
            ]}
            size={160}
          />
        </View>
      </View>

      {/* Acesso rápido — Transição Condicional */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f59e0b', gap: 12, marginTop: 4 }}
        onPress={() => router.push('/(main)/relatorio-transicao-condicional' as any)}
        activeOpacity={0.8}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f59e0b22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="alert-circle" size={20} color="#d97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#92400e' }}>Transição Condicional — Art. 23 §10</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#b45309', marginTop: 2 }}>Ver alunos com negativas condicionais (I e II Ciclo)</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#d97706" />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderNotas = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Média por Disciplina</Text>
        <View style={styles.chartCard}>
          <BarChart data={notasStats.disciplinaData.map(d => ({ label: d.label, value: d.media, color: d.color }))} maxValue={20} height={180} width={CHART_W} />
        </View>
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Média por Turma</Text>
        <View style={styles.chartCard}>
          <BarChart data={notasStats.classesData} maxValue={20} height={160} width={CHART_W} />
        </View>
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Evolução Trimestral</Text>
        <View style={styles.chartCard}>
          <LineChart data={notasStats.trimestreData} color={Colors.gold} height={150} width={CHART_W} />
        </View>
      </View>

      <View style={styles.disciplinaList}>
        {notasStats.disciplinaData.map(d => (
          <View key={d.disciplina} style={styles.disciplinaRow}>
            <View style={[styles.disciplinaDot, { backgroundColor: d.color }]} />
            <Text style={styles.disciplinaNome}>{d.disciplina}</Text>
            <View style={styles.disciplinaRight}>
              <Text style={[styles.disciplinaMedia, { color: d.color }]}>{d.media}/20</Text>
              <Text style={styles.disciplinaTaxa}>{d.taxa}% aprovação</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderPresencas = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        <MetricCard label="Taxa de Presença" value={`${presencaStats.taxaPresenca}%`} color={Colors.success} icon={<Ionicons name="checkmark-circle" size={20} color={Colors.success} />} />
        <MetricCard label="Total Registos" value={presencaStats.totalPresencas} color={Colors.info} icon={<Ionicons name="list" size={20} color={Colors.info} />} />
        <MetricCard label="Presenças" value={presencaStats.presentes} color={Colors.success} icon={<Ionicons name="person" size={20} color={Colors.success} />} />
        <MetricCard label="Faltas" value={presencaStats.faltas} color={Colors.danger} icon={<Ionicons name="close-circle" size={20} color={Colors.danger} />} />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Registo de Presenças</Text>
        <View style={styles.chartCard}>
          <PieChart
            data={[
              { label: 'Presentes', value: presencaStats.presentes, color: Colors.success },
              { label: 'Faltas', value: presencaStats.faltas, color: Colors.danger },
              { label: 'Justificadas', value: presencaStats.justificadas, color: Colors.warning },
            ]}
            size={160}
          />
        </View>
      </View>

      {presencaStats.totalPresencas === 0 && (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Sem registos de presenças ainda.</Text>
          <Text style={styles.emptySubtext}>Use o módulo de Presenças para registar faltas e presenças.</Text>
        </View>
      )}
    </ScrollView>
  );

  const PERIODOS: Periodo[] = ['T1', 'T2', 'T3', 'Anual'];
  const TIPOS_MAPA: { key: TipoMapa; label: string; icon: string; desc: string; color: string }[] = [
    { key: 'notas', label: 'Mapa de Notas', icon: 'document-text', desc: 'Notas por aluno e turma', color: Colors.info },
    { key: 'presencas', label: 'Mapa de Presenças', icon: 'calendar', desc: 'Assiduidade por aluno e turma', color: Colors.gold },
    { key: 'aprovacao', label: 'Mapa de Aprovação', icon: 'ribbon', desc: 'Aprovados e reprovados por turma', color: Colors.success },
  ];

  const tipoAtual = TIPOS_MAPA.find(t => t.key === tipoMapa)!;

  // Linha-resumo do que vai ser impresso
  const descFiltro = [
    anoFiltro?.ano ?? 'Todos os anos',
    periodo,
    turmaFiltroId === 'todas'
      ? `${turmasFiltroAno.length} turma(s)`
      : turmasFiltroAno.find(t => t.id === turmaFiltroId)?.nome ?? 'Turma',
  ].join(' · ');

  const renderMapas = () => (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>

      {/* ── FILTROS ─────────────────────────────────────────── */}
      <View style={styles.filtrosCard}>
        <View style={styles.filtrosHeader}>
          <Ionicons name="funnel" size={16} color={Colors.gold} />
          <Text style={styles.filtrosTitle}>Filtros do Mapa</Text>
        </View>

        {/* 1 – Ano Lectivo */}
        <Text style={styles.filtroLabel}>Ano Lectivo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroScroll}>
          <View style={styles.filtroRow}>
            {anos.length === 0 && (
              <View style={[styles.filtroChip, styles.filtroChipDisabled]}>
                <Text style={styles.filtroChipText}>Nenhum ano configurado</Text>
              </View>
            )}
            {anos.map(a => {
              const sel = anoFiltro?.id === a.id;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.filtroChip, sel && styles.filtroChipActive]}
                  onPress={() => {
                    setAnoFiltroId(a.id);
                    setTurmaFiltroId('todas');
                  }}
                >
                  {a.ativo && <View style={styles.filtroActiveDot} />}
                  <Text style={[styles.filtroChipText, sel && styles.filtroChipTextActive]}>
                    {a.ano}
                  </Text>
                  {a.ativo && <Text style={styles.filtroActiveTag}>Activo</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* 2 – Trimestre */}
        <Text style={[styles.filtroLabel, { marginTop: 14 }]}>Trimestre / Período</Text>
        <View style={styles.periodoRow}>
          {PERIODOS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodoBtn, periodo === p && styles.periodoBtnActive]}
              onPress={() => setPeriodo(p)}
            >
              <Text style={[styles.periodoBtnText, periodo === p && styles.periodoBtnTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 3 – Turma / Curso */}
        <Text style={[styles.filtroLabel, { marginTop: 14 }]}>Turma / Curso</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtroScroll}>
          <View style={styles.filtroRow}>
            <TouchableOpacity
              style={[styles.filtroChip, turmaFiltroId === 'todas' && styles.filtroChipActive]}
              onPress={() => setTurmaFiltroId('todas')}
            >
              <Ionicons name="grid" size={13} color={turmaFiltroId === 'todas' ? Colors.text : Colors.textMuted} />
              <Text style={[styles.filtroChipText, turmaFiltroId === 'todas' && styles.filtroChipTextActive]}>
                Todas ({turmasFiltroAno.length})
              </Text>
            </TouchableOpacity>
            {turmasFiltroAno.map(t => {
              const sel = turmaFiltroId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.filtroChip, sel && { ...styles.filtroChipActive, backgroundColor: Colors.info }]}
                  onPress={() => setTurmaFiltroId(t.id)}
                >
                  <Text style={[styles.filtroChipText, sel && styles.filtroChipTextActive]}>
                    {t.nome}
                  </Text>
                  <Text style={[styles.filtroChipSub, sel && { color: 'rgba(255,255,255,0.7)' }]}>
                    {t.classe} · {t.turno}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {turmasFiltroAno.length === 0 && (
              <View style={[styles.filtroChip, styles.filtroChipDisabled]}>
                <Text style={styles.filtroChipText}>Sem turmas para este ano</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ── TIPO DE MAPA ─────────────────────────────────────── */}
      <View style={styles.mapSection}>
        <Text style={styles.mapSectionTitle}>Tipo de Mapa</Text>
        <View style={styles.tiposGrid}>
          {TIPOS_MAPA.map(tipo => (
            <TouchableOpacity
              key={tipo.key}
              style={[styles.tipoCard, tipoMapa === tipo.key && { borderColor: tipo.color, borderWidth: 2 }]}
              onPress={() => setTipoMapa(tipo.key)}
              activeOpacity={0.75}
            >
              <View style={[styles.tipoIcon, { backgroundColor: `${tipo.color}20` }]}>
                <Ionicons name={tipo.icon as any} size={22} color={tipoMapa === tipo.key ? tipo.color : Colors.textMuted} />
              </View>
              <View style={styles.tipoTextGroup}>
                <Text style={[styles.tipoLabel, tipoMapa === tipo.key && { color: tipo.color }]}>{tipo.label}</Text>
                <Text style={styles.tipoDesc}>{tipo.desc}</Text>
              </View>
              {tipoMapa === tipo.key && (
                <View style={[styles.tipoCheck, { backgroundColor: tipo.color }]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── RESUMO DOS FILTROS ───────────────────────────────── */}
      <View style={styles.resumoFiltroCard}>
        <Ionicons name="information-circle" size={16} color={Colors.gold} />
        <Text style={styles.resumoFiltroText}>
          <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{tipoAtual.label}</Text>
          {'  ·  '}{descFiltro}
        </Text>
      </View>

      {/* ── MÉTRICAS ─────────────────────────────────────────── */}
      <View style={styles.metricsGrid}>
        <MetricCard
          label="Total de Alunos"
          value={mapasStats.totalAlunos}
          color={Colors.info}
          icon={<Ionicons name="people" size={20} color={Colors.info} />}
          desc={descFiltro}
        />
        <MetricCard
          label="Turmas"
          value={mapasStats.totalTurmas}
          color={Colors.gold}
          icon={<Ionicons name="library" size={20} color={Colors.gold} />}
        />
        {tipoMapa !== 'presencas' && (
          <>
            <MetricCard
              label="Taxa de Aprovação"
              value={`${mapasStats.taxa}%`}
              color={Colors.success}
              icon={<Ionicons name="checkmark-circle" size={20} color={Colors.success} />}
              desc={periodo}
            />
            <MetricCard
              label="Média Geral"
              value={`${mapasStats.media}/20`}
              color={Colors.warning}
              icon={<Ionicons name="stats-chart" size={20} color={Colors.warning} />}
              desc={periodo}
            />
          </>
        )}
        {tipoMapa === 'presencas' && (
          <MetricCard
            label="Taxa de Presença"
            value={`${mapasStats.taxaPresenca}%`}
            color={Colors.success}
            icon={<Ionicons name="calendar" size={20} color={Colors.success} />}
          />
        )}
      </View>

      {/* ── TURMAS INCLUÍDAS ─────────────────────────────────── */}
      <View style={styles.mapSection}>
        <Text style={styles.mapSectionTitle}>Turmas no Mapa ({turmasFiltradas.length})</Text>
        {turmasFiltradas.map(turma => {
          const count = alunos.filter(a => a.turmaId === turma.id && a.ativo).length;
          const trNum = periodo === 'T1' ? 1 : periodo === 'T2' ? 2 : periodo === 'T3' ? 3 : null;
          const turmaNotas = notas.filter(n =>
            n.turmaId === turma.id && (trNum ? n.trimestre === trNum : true)
          );
          const aprovados = tipoMapa !== 'presencas'
            ? turmaNotas.filter(n => n.mac >= 10).length
            : presencas.filter(p =>
                alunos.find(a => a.id === p.alunoId && a.turmaId === turma.id) && p.status === 'P'
              ).length;
          const cor = tipoMapa === 'presencas' ? Colors.gold : Colors.success;

          return (
            <View key={turma.id} style={styles.turmaPreviewCard}>
              <View style={[styles.turmaBadge, { backgroundColor: cor + '20' }]}>
                <Ionicons name="library" size={16} color={cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.turmaNome}>{turma.nome}</Text>
                <Text style={styles.turmaInfo}>
                  Classe {turma.classe} · {turma.nivel} · {turma.turno} · {count} alunos
                </Text>
              </View>
              <View style={styles.turmaPreviewRight}>
                <Text style={[styles.turmaAprov, { color: cor }]}>{aprovados}</Text>
                <Text style={styles.turmaAprovLabel}>
                  {tipoMapa === 'presencas' ? 'presenças' : 'aprovados'}
                </Text>
              </View>
            </View>
          );
        })}
        {turmasFiltradas.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhuma turma corresponde aos filtros.</Text>
            <Text style={styles.emptySubtext}>Selecciona um ano lectivo diferente ou verifica as turmas.</Text>
          </View>
        )}
      </View>

      {/* ── BOTÃO IMPRIMIR ───────────────────────────────────── */}
      {Platform.OS === 'web' && turmasFiltradas.length > 0 && (
        <TouchableOpacity style={styles.printBtn} onPress={handlePrint} activeOpacity={0.8}>
          <Ionicons name="print" size={20} color="#fff" />
          <View>
            <Text style={styles.printBtnText}>Imprimir / Exportar PDF</Text>
            <Text style={styles.printBtnSub}>{tipoAtual.label} · {descFiltro}</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );

  const TABS: { key: 'geral' | 'notas' | 'presencas' | 'mapas'; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'notas', label: 'Notas' },
    { key: 'presencas', label: 'Presenças' },
    { key: 'mapas', label: 'Mapas' },
  ];

  return (
    <View style={styles.screen}>
      <TopBar title="Relatórios" subtitle="Análise académica" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            {tab.key === 'mapas' && (
              <Ionicons
                name="print"
                size={13}
                color={activeTab === tab.key ? Colors.text : Colors.textMuted}
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flex: 1, paddingBottom: bottomPad }}>
        {activeTab === 'geral' && renderGeral()}
        {activeTab === 'notas' && renderNotas()}
        {activeTab === 'presencas' && renderPresencas()}
        {activeTab === 'mapas' && renderMapas()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  tabsScroll: { flexGrow: 0, marginHorizontal: 16, marginVertical: 10 },
  tabs: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', gap: 2 },
  tab: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row' },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  tabTextActive: { color: Colors.text },
  tabContent: { padding: 16, gap: 16 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flex: 1, minWidth: '44%', backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricContent: { flex: 1 },
  metricValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginTop: 2 },
  metricDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  chartSection: { gap: 8 },
  chartTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  chartCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, alignItems: 'center' },
  disciplinaList: { gap: 8 },
  disciplinaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 10 },
  disciplinaDot: { width: 10, height: 10, borderRadius: 5 },
  disciplinaNome: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  disciplinaRight: { alignItems: 'flex-end', gap: 2 },
  disciplinaMedia: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  disciplinaTaxa: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  empty: { alignItems: 'center', gap: 8, paddingTop: 40 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  emptySubtext: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  // Mapas styles
  mapSection: { gap: 10 },
  mapSectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  // Filtros card
  filtrosCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 8 },
  filtrosHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  filtrosTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  filtroLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  filtroScroll: { flexGrow: 0 },
  filtroRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  filtroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  filtroChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filtroChipDisabled: { opacity: 0.5 },
  filtroChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  filtroChipTextActive: { color: Colors.text },
  filtroChipSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  filtroActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  filtroActiveTag: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.success },
  // Resumo filtro
  resumoFiltroCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.gold + '40' },
  resumoFiltroText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, lineHeight: 18 },
  // Período
  periodoRow: { flexDirection: 'row', gap: 8 },
  periodoBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  periodoBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  periodoBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  periodoBtnTextActive: { color: Colors.text },
  // Tipos
  tiposGrid: { gap: 10 },
  tipoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipoIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tipoTextGroup: { flex: 1 },
  tipoLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  tipoDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  tipoCheck: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Turmas preview
  turmaPreviewCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 12 },
  turmaPreviewLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  turmaBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  turmaNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaInfo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  turmaPreviewRight: { alignItems: 'flex-end' },
  turmaAprov: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  turmaAprovLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  // Print button
  printBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 },
  printBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  printBtnSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
