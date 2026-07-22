import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import { getAuthToken } from '@/context/AuthContext';

interface AlunoSemTurma {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  classe?: string;
  nivel?: string;
  cursoId?: string;
  cursoNome?: string;
  turmaIdAtribuida?: string; // turma seleccionada localmente antes de guardar
}

interface Turma {
  id: string;
  nome: string;
  classe: string;
  turno: string;
  anoLetivo: string;
  curso?: string;
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function OrganizarTurmasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { turmas, alunos: alunosTodos, professores } = useData();
  const { config } = useConfig();
  const [cursosList, setCursosList] = useState<{ id: string; nome: string }[]>([]);

  const [alunos, setAlunos] = useState<AlunoSemTurma[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Classe seleccionada para filtrar
  const [classeActiva, setClasseActiva] = useState<string>('');

  // Modal de selecção de turma para um grupo inteiro
  const [modalGrupo, setModalGrupo] = useState<{
    visible: boolean;
    classe: string;
    cursoNome?: string;
    alunoIds: string[];
  }>({ visible: false, classe: '', alunoIds: [] });

  // Modal de selecção de turma para um aluno individual
  const [modalAluno, setModalAluno] = useState<{
    visible: boolean;
    alunoId: string;
    nome: string;
    classe: string;
  }>({ visible: false, alunoId: '', nome: '', classe: '' });

  // Modal de geração de listas
  const [modalListas, setModalListas] = useState(false);
  const [listasExpanded, setListasExpanded] = useState<'I Ciclo' | 'II Ciclo' | null>(null);

  // Modal de distribuição automática
  const [modalAuto, setModalAuto] = useState(false);
  const [autoMetodo, setAutoMetodo] = useState<'alfabetica' | 'genero' | 'aleatoria'>('alfabetica');
  const [autoPreview, setAutoPreview] = useState<{ alunoId: string; turmaId: string; nome: string }[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoStep, setAutoStep] = useState<'config' | 'preview'>('config');

  useEffect(() => {
    carregarAlunos();
    fetch('/api/cursos').then(r => r.json()).then((data: any[]) => setCursosList(data || [])).catch(() => {});
  }, []);

  async function carregarAlunos() {
    setLoading(true);
    try {
      const res = await fetch('/api/alunos/sem-turma', {
        headers: { Authorization: `Bearer ${await getAuthToken() ?? ''}` },
      });
      const data = await res.json();
      setAlunos(Array.isArray(data) ? data : []);
    } catch {
      alertErro('Erro ao carregar alunos sem turma.');
    } finally {
      setLoading(false);
    }
  }

  // Agrupar por classe
  const classes = useMemo(() => {
    const set = new Set(alunos.map(a => a.classe || 'Sem classe'));
    return Array.from(set).sort((a, b) => {
      const n = (s: string) => parseInt(s) || 999;
      return n(a) - n(b);
    });
  }, [alunos]);

  // Seleccionar classe activa por defeito
  useEffect(() => {
    if (classes.length > 0 && !classeActiva) setClasseActiva(classes[0]);
  }, [classes]);

  // Alunos da classe activa, agrupados por curso (especialmente para 10ª)
  const gruposDaClasse = useMemo(() => {
    const da = alunos.filter(a => (a.classe || 'Sem classe') === classeActiva);
    const is10 = classeActiva.startsWith('10');
    if (is10) {
      const map: Record<string, AlunoSemTurma[]> = {};
      for (const a of da) {
        const key = a.cursoNome || 'Sem Curso';
        if (!map[key]) map[key] = [];
        map[key].push(a);
      }
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'pt'));
    }
    return [['Todos', da]] as [string, AlunoSemTurma[]][];
  }, [alunos, classeActiva]);

  // Turmas compatíveis com a classe activa
  function turmasParaClasse(classe: string): Turma[] {
    return (turmas as Turma[]).filter(t =>
      t.classe && t.classe.toString().replace(/[ªa°]/g, '') === classe.replace(/[ªa°]/g, '').trim().split(' ')[0]
    );
  }

  function atribuirTurmaAoGrupo(turmaId: string, alunoIds: string[]) {
    setAlunos(prev => prev.map(a =>
      alunoIds.includes(a.id) ? { ...a, turmaIdAtribuida: turmaId } : a
    ));
    setModalGrupo(m => ({ ...m, visible: false }));
    setModalAluno(m => ({ ...m, visible: false }));
  }

  async function previewDistribuicaoAuto() {
    const turmasClasse = turmasParaClasse(classeActiva);
    if (turmasClasse.length === 0) {
      webAlert('Sem turmas', `Não existem turmas criadas para a ${classeActiva}.\nCrie as turmas primeiro.`);
      return;
    }
    setAutoLoading(true);
    try {
      const res = await fetch('/api/alunos/distribuir-automatico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken() ?? ''}` },
        body: JSON.stringify({ classe: classeActiva, turmaIds: turmasClasse.map(t => t.id), metodo: autoMetodo, guardar: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      if (data.total === 0) { webAlert('Sem alunos', `Não há alunos sem turma para a ${classeActiva}.`); return; }
      setAutoPreview(data.atribuicoes);
      setAutoStep('preview');
    } catch (e: any) {
      alertErro(e.message || 'Erro ao calcular distribuição.');
    } finally {
      setAutoLoading(false);
    }
  }

  async function confirmarDistribuicaoAuto() {
    setSaving(true);
    try {
      // Aplicar previsão localmente para que o utilizador veja os badges e possa ainda ajustar
      setAlunos(prev => prev.map(a => {
        const found = autoPreview.find(p => p.alunoId === a.id);
        return found ? { ...a, turmaIdAtribuida: found.turmaId } : a;
      }));
      setModalAuto(false);
      setAutoStep('config');
      setAutoPreview([]);
      alertSucesso(`${autoPreview.length} aluno(s) distribuídos — reveja e clique Guardar para confirmar.`);
    } finally {
      setSaving(false);
    }
  }

  async function guardarAtribuicoes() {
    const comTurma = alunos.filter(a => a.turmaIdAtribuida);
    if (comTurma.length === 0) {
      webAlert('Sem atribuições', 'Seleccione pelo menos uma turma para algum aluno.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/alunos/atribuir-turmas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken() ?? ''}`,
        },
        body: JSON.stringify({
          atribuicoes: comTurma.map(a => ({ alunoId: a.id, turmaId: a.turmaIdAtribuida! })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      alertSucesso(`${data.actualizados} aluno(s) atribuído(s) às turmas com sucesso!`);
      carregarAlunos();
    } catch (e: any) {
      alertErro(e.message || 'Erro ao guardar atribuições.');
    } finally {
      setSaving(false);
    }
  }

  const totalComAtribuicao = alunos.filter(a => a.turmaIdAtribuida).length;

  // ── PDF List Generation ─────────────────────────────────────────────────
  function buildListasCicloHtml(ciclo: 'I Ciclo' | 'II Ciclo' | 'Todos', classeEspecifica?: string): string {
    const now = new Date();
    const dataActual = `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
    const escolaNome = (config as any).nomeEscola || 'QUETA';
    const directorNome = (config as any).nomeDirector || '___________________________';

    const I_CICLO_CLASSES = ['7', '8', '9'];
    const II_CICLO_CLASSES = ['10', '11', '12', '13'];

    const turmasFiltradas = (turmas as any[]).filter(t => {
      const num = String(t.classe).replace(/[ªa°\s]/g, '').split(' ')[0];
      if (classeEspecifica) return num === classeEspecifica;
      if (ciclo === 'I Ciclo') return I_CICLO_CLASSES.includes(num);
      if (ciclo === 'II Ciclo') return II_CICLO_CLASSES.includes(num);
      return true;
    }).sort((a: any, b: any) => {
      const na = parseInt(String(a.classe)) || 0;
      const nb = parseInt(String(b.classe)) || 0;
      if (na !== nb) return na - nb;
      return a.nome.localeCompare(b.nome, 'pt');
    });

    if (turmasFiltradas.length === 0) return '';

    const cssBase = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
      .page { padding: 18mm 16mm; page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
      .header { text-align: center; margin-bottom: 10px; }
      .header p { margin: 1px 0; font-size: 11px; font-weight: bold; text-transform: uppercase; }
      .info-block { margin-bottom: 6px; font-size: 11px; }
      .info-row { display: flex; gap: 20px; margin-bottom: 3px; flex-wrap: wrap; }
      .info-row span { white-space: nowrap; }
      .curso-tag { display: inline-block; background: #1a2540; color: #fff; font-size: 9px; font-weight: bold; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
      .doc-title { text-align: center; font-size: 13px; font-weight: bold; text-decoration: underline; margin: 8px 0; text-transform: uppercase; letter-spacing: 1px; }
      .main-table { border-collapse: collapse; width: 100%; font-size: 10px; margin-bottom: 16px; }
      .main-table th { background: #00BCD4; color: #fff; font-weight: bold; border: 1px solid #000; padding: 4px 5px; text-align: center; }
      .main-table td { border: 1px solid #000; padding: 3px 4px; }
      .stat-title { text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 5px; text-transform: uppercase; }
      .stat-table { border-collapse: collapse; margin: 0 auto; min-width: 300px; font-size: 10px; }
      .stat-table th, .stat-table td { border: 1px solid #000; padding: 3px 7px; text-align: center; }
      .stat-table .h { background: #00BCD4; color: #fff; font-weight: bold; }
      .sig-row { display: flex; justify-content: space-between; margin-top: 20px; font-size: 10px; }
      .sig-block { text-align: center; min-width: 140px; }
      .sig-line { width: 130px; border-top: 1px solid #000; margin: 26px auto 4px; }
      @media print {
        .page { padding: 10mm 12mm; }
        @page { size: A4 portrait; margin: 0; }
        .main-table th, .stat-table .h {
          background: #00BCD4 !important;
          color: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      .main-table th, .stat-table .h {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }`;

    const pages = turmasFiltradas.map((turma: any) => {
      const num = String(turma.classe).replace(/[ªa°\s]/g, '').split(' ')[0];
      const isIICiclo = II_CICLO_CLASSES.includes(num);
      const prof = (professores as any[]).find(p => p.id === turma.professorId);
      const profNome = prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : '___________________________';
      const curso = isIICiclo ? cursosList.find(c => c.id === turma.cursoId) : null;
      const cursoNome = curso?.nome || '';

      const alunosDaTurma = (alunosTodos as any[])
        .filter(a => a.ativo && a.turmaId === turma.id)
        .sort((a: any, b: any) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`, 'pt'));

      function calcAge(d: string) {
        if (!d) return '';
        const birth = new Date(d);
        if (isNaN(birth.getTime())) return '';
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        return age > 0 ? age : '';
      }

      function fmtDate(d: string) {
        if (!d) return '';
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString('pt-PT');
      }

      const total = alunosDaTurma.length;
      const masc = alunosDaTurma.filter((a: any) => a.genero === 'M').length;
      const fem = alunosDaTurma.filter((a: any) => a.genero === 'F').length;
      const pctM = total > 0 ? Math.round((masc / total) * 100) : 0;
      const pctF = total > 0 ? Math.round((fem / total) * 100) : 0;

      const rows = alunosDaTurma.map((a: any, i: number) => `
        <tr style="background:${i % 2 === 1 ? '#FFF9C4' : '#fff'}">
          <td style="text-align:center;font-weight:bold;">${i + 1}</td>
          <td style="padding-left:5px;">${a.nome.toUpperCase()} ${a.apelido.toUpperCase()}</td>
          <td style="text-align:center;">${calcAge(a.dataNascimento)}</td>
          <td style="text-align:center;">${a.genero || ''}</td>
          <td style="text-align:center;">${fmtDate(a.dataNascimento)}</td>
          <td style="text-align:center;">${a.telefoneEncarregado || ''}</td>
        </tr>`).join('');

      return `<div class="page">
        <div class="header">
          <img src="${window.location.origin}/angola-brasao.png" style="width:58px;height:auto;display:block;margin:0 auto 3px;" onerror="this.style.display='none'" />
          <p>REPÚBLICA DE ANGOLA</p>
          <p>MINISTÉRIO DA EDUCAÇÃO</p>
          <p>ENSINO GERAL</p>
          <p style="margin-top:3px;">${escolaNome}</p>
        </div>
        <div class="info-block">
          ${isIICiclo && cursoNome ? `<div><span class="curso-tag">${cursoNome}</span></div>` : ''}
          <div class="info-row">
            <span><strong>${turma.classe}</strong></span>
            <span><strong>SALA:</strong> ${turma.sala || '___'}</span>
            <span><strong>TURMA:</strong> ${turma.nome}</span>
            <span><strong>PERÍODO:</strong> ${(turma.turno || '').toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span><strong>PROFESSOR(A) DT:</strong> ${profNome}</span>
            <span><strong>ANO LECTIVO:</strong> ${turma.anoLetivo}</span>
          </div>
        </div>
        <div class="doc-title">Lista da Turma</div>
        <table class="main-table">
          <thead><tr>
            <th style="width:28px;">Nº</th>
            <th style="width:38%;text-align:left;padding-left:5px;">NOME DO ALUNO</th>
            <th>IDADE</th><th>SEXO</th>
            <th>DATA DE<br>NASCIMENTO</th>
            <th>CONTACTOS</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:8px;color:#888;font-style:italic;">Nenhum aluno atribuído a esta turma</td></tr>'}</tbody>
        </table>
        <div class="stat-title">Mapa Estatístico</div>
        <table class="stat-table">
          <thead><tr><th colspan="2" class="h"></th><th class="h">Nº DE ALUNOS</th><th class="h">VALOR %</th></tr></thead>
          <tbody>
            <tr><td rowspan="2" class="h">GÉNERO</td><td class="h">MASCULINO</td><td>${masc}</td><td>${pctM}%</td></tr>
            <tr><td class="h">FEMININO</td><td>${fem}</td><td>${pctF}%</td></tr>
            <tr><td colspan="2" class="h">TOTAL</td><td>${total}</td><td>100%</td></tr>
          </tbody>
        </table>
        <div class="sig-row">
          <div class="sig-block">
            <div class="sig-line"></div>
            <div>Director(a) de Turma</div>
          </div>
          <div class="sig-block">
            <div>${dataActual}</div>
            <div class="sig-line"></div>
            <div>Director(a) da Escola<br><small>${directorNome}</small></div>
          </div>
        </div>
      </div>`;
    });

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>Listas de Turma — ${ciclo}</title>
  <style>${cssBase}</style>
</head>
<body>${pages.join('')}</body>
</html>`;
  }

  function gerarListasPDF(ciclo: 'I Ciclo' | 'II Ciclo' | 'Todos', classeEspecifica?: string) {
    if (Platform.OS !== 'web') {
      webAlert('Funcionalidade Web', 'A geração de PDF está disponível apenas na versão web.');
      return;
    }
    const html = buildListasCicloHtml(ciclo, classeEspecifica);
    if (!html) {
      alertErro(`Não existem turmas para ${classeEspecifica ? classeEspecifica + 'ª Classe' : ciclo}.`);
      return;
    }
    const win = window.open('', '_blank');
    if (!win) { alertErro('Não foi possível abrir a janela de impressão.'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
    setModalListas(false);
    setListasExpanded(null);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title="Organizar Alunos em Turmas" onBack={() => router.back()} />

      {/* Resumo */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{alunos.length}</Text>
          <Text style={styles.summaryLabel}>Sem Turma</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: Colors.success }]}>{totalComAtribuicao}</Text>
          <Text style={styles.summaryLabel}>Atribuídos</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>{alunos.length - totalComAtribuicao}</Text>
          <Text style={styles.summaryLabel}>Pendentes</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={guardarAtribuicoes}
          disabled={saving || totalComAtribuicao === 0}
        >
          {saving
            ? <AppLoader size="small" color="#fff" />
            : <><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={styles.saveBtnText}>Guardar</Text></>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.listasBtn} onPress={() => setModalListas(true)}>
          <Ionicons name="print-outline" size={16} color={Colors.primary} />
          <Text style={styles.listasBtnText}>Listas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.listasBtn, { backgroundColor: '#f0fdf4', borderColor: Colors.success }]}
          onPress={() => { setAutoStep('config'); setAutoPreview([]); setModalAuto(true); }}
        >
          <Ionicons name="shuffle" size={16} color={Colors.success} />
          <Text style={[styles.listasBtnText, { color: Colors.success }]}>Auto</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs por classe */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {classes.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.tab, classeActiva === c && styles.tabActive]}
            onPress={() => setClasseActiva(c)}
          >
            <Text style={[styles.tabText, classeActiva === c && styles.tabTextActive]}>{c}</Text>
            <View style={[styles.tabBadge, classeActiva === c && styles.tabBadgeActive]}>
              <Text style={styles.tabBadgeText}>
                {alunos.filter(a => (a.classe || 'Sem classe') === c).length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 12 }}>
          <SkeletonList rows={5} withAvatar />
        </View>
      ) : alunos.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="check-circle" size={56} color={Colors.success} />
          <Text style={styles.emptyTitle}>Todos os alunos têm turma!</Text>
          <Text style={styles.emptyDesc}>Não há alunos sem turma atribuída neste momento.</Text>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 32 }}>
          {gruposDaClasse.map(([grupo, alunosGrupo]) => {
            const turmasDisp = turmasParaClasse(classeActiva);
            const todosAtribuidos = alunosGrupo.every(a => a.turmaIdAtribuida);
            const algumAtribuido = alunosGrupo.some(a => a.turmaIdAtribuida);
            const turmaDom = alunosGrupo[0]?.turmaIdAtribuida
              ? turmas.find((t: any) => t.id === alunosGrupo[0]?.turmaIdAtribuida)?.nome
              : null;
            const is10 = classeActiva.startsWith('10');

            return (
              <View key={grupo} style={styles.grupo}>
                {/* Cabeçalho do grupo */}
                <View style={styles.grupoHeader}>
                  <View style={{ flex: 1 }}>
                    {is10 && grupo !== 'Todos' && (
                      <Text style={styles.cursoTag}>{grupo}</Text>
                    )}
                    <Text style={styles.grupoTitle}>
                      {is10 ? `${grupo} — ${classeActiva}` : classeActiva}
                    </Text>
                    <Text style={styles.grupoCount}>{alunosGrupo.length} aluno(s)</Text>
                  </View>
                  <View style={styles.grupoActions}>
                    {todosAtribuidos && (
                      <View style={styles.atribuidoBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={styles.atribuidoText}>{turmaDom || 'Atribuído'}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.atribuirGrupoBtn}
                      onPress={() => setModalGrupo({
                        visible: true,
                        classe: classeActiva,
                        cursoNome: is10 ? grupo : undefined,
                        alunoIds: alunosGrupo.map(a => a.id),
                      })}
                    >
                      <Ionicons name="people" size={14} color="#fff" />
                      <Text style={styles.atribuirGrupoBtnText}>
                        {algumAtribuido ? 'Alterar Turma' : 'Atribuir Turma ao Grupo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Lista de alunos do grupo */}
                {alunosGrupo.map(aluno => {
                  const turmaAluno = aluno.turmaIdAtribuida
                    ? turmas.find((t: any) => t.id === aluno.turmaIdAtribuida)
                    : null;
                  return (
                    <TouchableOpacity
                      key={aluno.id}
                      style={styles.alunoRow}
                      onPress={() => setModalAluno({
                        visible: true,
                        alunoId: aluno.id,
                        nome: `${aluno.nome} ${aluno.apelido}`,
                        classe: classeActiva,
                      })}
                    >
                      <View style={styles.alunoAvatar}>
                        <Text style={styles.alunoAvatarText}>
                          {aluno.nome?.[0]}{aluno.apelido?.[0]}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.alunoNome}>{aluno.nome} {aluno.apelido}</Text>
                        <Text style={styles.alunoMat}>{aluno.numeroMatricula}</Text>
                      </View>
                      {turmaAluno ? (
                        <View style={styles.turmaBadge}>
                          <Ionicons name="checkmark" size={12} color={Colors.success} />
                          <Text style={styles.turmaBadgeText}>{(turmaAluno as any).nome}</Text>
                        </View>
                      ) : (
                        <View style={styles.semTurmaBadge}>
                          <Ionicons name="time-outline" size={12} color={Colors.warning} />
                          <Text style={styles.semTurmaText}>Pendente</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal: Distribuição Automática */}
      <Modal visible={modalAuto} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            {autoStep === 'config' ? (
              <>
                <Text style={styles.modalTitle}>Distribuição Automática</Text>
                <Text style={styles.modalDesc}>
                  Classe: {classeActiva} · {turmasParaClasse(classeActiva).length} turma(s) disponível(eis)
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>Método de ordenação:</Text>
                {[
                  { key: 'alfabetica', label: 'Ordem Alfabética', desc: 'Distribui os alunos por ordem A→Z, round-robin entre as turmas', icon: 'text' as const },
                  { key: 'genero', label: 'Equilíbrio de Género', desc: 'Intercala M/F para que cada turma tenha proporções semelhantes', icon: 'people' as const },
                  { key: 'aleatoria', label: 'Aleatória', desc: 'Distribuição aleatória — cada execução produz um resultado diferente', icon: 'shuffle' as const },
                ].map(({ key, label, desc, icon }) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.turmaOpcao, autoMetodo === key && { borderColor: Colors.success, backgroundColor: '#f0fdf4' }]}
                    onPress={() => setAutoMetodo(key as any)}
                  >
                    <Ionicons name={icon} size={20} color={autoMetodo === key ? Colors.success : Colors.textMuted} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.turmaOpcaoNome, autoMetodo === key && { color: Colors.success }]}>{label}</Text>
                      <Text style={styles.turmaOpcaoInfo}>{desc}</Text>
                    </View>
                    {autoMetodo === key && <Ionicons name="checkmark-circle" size={20} color={Colors.success} />}
                  </TouchableOpacity>
                ))}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalAuto(false)}>
                    <Text style={styles.modalCancelarText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.atribuirGrupoBtn, { flex: 1, justifyContent: 'center', opacity: autoLoading ? 0.6 : 1 }]}
                    onPress={previewDistribuicaoAuto}
                    disabled={autoLoading}
                  >
                    {autoLoading
                      ? <AppLoader size="small" color="#fff" />
                      : <><Ionicons name="eye" size={14} color="#fff" /><Text style={styles.atribuirGrupoBtnText}>Pré-visualizar</Text></>
                    }
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Confirmar Distribuição</Text>
                <Text style={styles.modalDesc}>{autoPreview.length} aluno(s) · método: {autoMetodo}</Text>
                <ScrollView style={{ maxHeight: 340 }}>
                  {autoPreview.map((item, i) => {
                    const turma = turmas.find((t: any) => t.id === item.turmaId);
                    return (
                      <View key={item.alunoId} style={[styles.alunoRow, { paddingVertical: 8 }]}>
                        <View style={[styles.alunoAvatar, { backgroundColor: Colors.success + '22' }]}>
                          <Text style={[styles.alunoAvatarText, { color: Colors.success }]}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.alunoNome}>{item.nome}</Text>
                        </View>
                        <View style={styles.turmaBadge}>
                          <Ionicons name="arrow-forward" size={11} color={Colors.success} />
                          <Text style={styles.turmaBadgeText}>{(turma as any)?.nome || '—'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                  A distribuição ficará pendente até clicar "Guardar" no ecrã principal.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity style={styles.modalCancelar} onPress={() => setAutoStep('config')}>
                    <Text style={styles.modalCancelarText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.atribuirGrupoBtn, { flex: 1, justifyContent: 'center', backgroundColor: Colors.success }]}
                    onPress={confirmarDistribuicaoAuto}
                  >
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.atribuirGrupoBtnText}>Aplicar Distribuição</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: selecção de turma para grupo */}
      <Modal visible={modalGrupo.visible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalBoxCenter}>
            <Text style={styles.modalTitle}>Atribuir Turma ao Grupo</Text>
            <Text style={styles.modalDesc}>
              {modalGrupo.cursoNome ? `Curso: ${modalGrupo.cursoNome} — ` : ''}{modalGrupo.classe} • {modalGrupo.alunoIds.length} aluno(s)
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {turmasParaClasse(modalGrupo.classe).length === 0 ? (
                <Text style={styles.semTurmasMsg}>
                  Não existem turmas criadas para a {modalGrupo.classe}.{'\n'}
                  Crie as turmas primeiro no módulo de Turmas.
                </Text>
              ) : turmasParaClasse(modalGrupo.classe).map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.turmaOpcao}
                  onPress={() => atribuirTurmaAoGrupo(t.id, modalGrupo.alunoIds)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.turmaOpcaoNome}>{t.nome}</Text>
                    <Text style={styles.turmaOpcaoInfo}>{t.turno} · {t.anoLetivo}</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={22} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalGrupo(m => ({ ...m, visible: false }))}>
              <Text style={styles.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Gerar Listas em PDF */}
      <Modal visible={modalListas} transparent animationType="fade" onRequestClose={() => { setModalListas(false); setListasExpanded(null); }}>
        <View style={styles.modalOverlayCenter}>
          <View style={[styles.modalBoxCenter, { maxHeight: '85%' }]}>
            {/* Cabeçalho colorido */}
            <View style={{ backgroundColor: '#0369a1', borderRadius: 12, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="document-text-outline" size={24} color="#fff" />
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Gerar Listas de Turma</Text>
                <Text style={{ fontSize: 11, color: '#bfdbfe', marginTop: 1 }}>Escolha o ciclo ou uma classe específica</Text>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>

              {/* I CICLO */}
              <TouchableOpacity
                style={[styles.listasOpcao, { borderLeftColor: '#0369a1', borderLeftWidth: 4 }]}
                onPress={() => setListasExpanded(listasExpanded === 'I Ciclo' ? null : 'I Ciclo')}
              >
                <Ionicons name="school-outline" size={20} color="#0369a1" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listasOpcaoNome, { color: '#0369a1' }]}>I Ciclo</Text>
                  <Text style={styles.listasOpcaoSub}>7ª, 8ª e 9ª Classe</Text>
                </View>
                <Ionicons name={listasExpanded === 'I Ciclo' ? 'chevron-up' : 'chevron-down'} size={16} color="#0369a1" />
              </TouchableOpacity>
              {listasExpanded === 'I Ciclo' && (
                <View style={styles.listasSub}>
                  {['7', '8', '9'].map(cl => (
                    <TouchableOpacity key={cl} style={styles.listasSubBtn} onPress={() => gerarListasPDF('I Ciclo', cl)}>
                      <Text style={styles.listasSubBtnText}>{cl}ª Classe</Text>
                      <Ionicons name="print" size={14} color="#0369a1" />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.listasSubBtn, { backgroundColor: '#0369a122' }]} onPress={() => gerarListasPDF('I Ciclo')}>
                    <Text style={[styles.listasSubBtnText, { color: '#0369a1', fontWeight: '700' }]}>Todas (7ª a 9ª)</Text>
                    <Ionicons name="print" size={14} color="#0369a1" />
                  </TouchableOpacity>
                </View>
              )}

              {/* II CICLO */}
              <TouchableOpacity
                style={[styles.listasOpcao, { borderLeftColor: '#7c3aed', borderLeftWidth: 4 }]}
                onPress={() => setListasExpanded(listasExpanded === 'II Ciclo' ? null : 'II Ciclo')}
              >
                <Ionicons name="ribbon-outline" size={20} color="#7c3aed" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listasOpcaoNome, { color: '#7c3aed' }]}>II Ciclo</Text>
                  <Text style={styles.listasOpcaoSub}>
                    {config.temDecimaTermeira !== false ? '10ª a 13ª Classe • por Curso' : '10ª a 12ª Classe • por Curso'}
                  </Text>
                </View>
                <Ionicons name={listasExpanded === 'II Ciclo' ? 'chevron-up' : 'chevron-down'} size={16} color="#7c3aed" />
              </TouchableOpacity>
              {listasExpanded === 'II Ciclo' && (
                <View style={styles.listasSub}>
                  {(config.temDecimaTermeira !== false ? ['10', '11', '12', '13'] : ['10', '11', '12']).map(cl => (
                    <TouchableOpacity key={cl} style={styles.listasSubBtn} onPress={() => gerarListasPDF('II Ciclo', cl)}>
                      <Text style={styles.listasSubBtnText}>{cl}ª Classe</Text>
                      <Ionicons name="print" size={14} color="#7c3aed" />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.listasSubBtn, { backgroundColor: '#7c3aed22' }]} onPress={() => gerarListasPDF('II Ciclo')}>
                    <Text style={[styles.listasSubBtnText, { color: '#7c3aed', fontWeight: '700' }]}>
                      {config.temDecimaTermeira !== false ? 'Todas (10ª a 13ª)' : 'Todas (10ª a 12ª)'}
                    </Text>
                    <Ionicons name="print" size={14} color="#7c3aed" />
                  </TouchableOpacity>
                </View>
              )}

              {/* TODOS */}
              <TouchableOpacity
                style={[styles.listasOpcao, { borderLeftColor: '#0d9488', borderLeftWidth: 4 }]}
                onPress={() => gerarListasPDF('Todos')}
              >
                <Ionicons name="layers-outline" size={20} color="#0d9488" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listasOpcaoNome, { color: '#0d9488' }]}>Todos os Ciclos</Text>
                  <Text style={styles.listasOpcaoSub}>Todas as turmas — do 7º ao 13º</Text>
                </View>
                <Ionicons name="print" size={18} color="#0d9488" />
              </TouchableOpacity>

            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 14, backgroundColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
              onPress={() => { setModalListas(false); setListasExpanded(null); }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: selecção de turma para aluno individual */}
      <Modal visible={modalAluno.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Atribuir Turma</Text>
            <Text style={styles.modalDesc}>{modalAluno.nome} · {modalAluno.classe}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {turmasParaClasse(modalAluno.classe).length === 0 ? (
                <Text style={styles.semTurmasMsg}>
                  Não existem turmas criadas para a {modalAluno.classe}.
                </Text>
              ) : turmasParaClasse(modalAluno.classe).map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.turmaOpcao}
                  onPress={() => atribuirTurmaAoGrupo(t.id, [modalAluno.alunoId])}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.turmaOpcaoNome}>{t.nome}</Text>
                    <Text style={styles.turmaOpcaoInfo}>{t.turno} · {t.anoLetivo}</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={22} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelar} onPress={() => setModalAluno(m => ({ ...m, visible: false }))}>
              <Text style={styles.modalCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 16, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center' },

  summaryBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryNum: { fontSize: 20, fontWeight: '800', color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  listasBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0f9ff', borderWidth: 1.5, borderColor: Colors.primary,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  listasBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  modalDesc: { fontSize: 12, color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  listasOpcao: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb',
    padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  listasOpcaoNome: { fontWeight: '700', fontSize: 14 },
  listasOpcaoSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  listasSub: {
    marginTop: -6, marginBottom: 10, paddingLeft: 8,
    borderLeftWidth: 2, borderLeftColor: Colors.border, marginLeft: 8,
  },
  listasSubBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    backgroundColor: Colors.background, marginBottom: 5,
    borderWidth: 1, borderColor: Colors.border,
  },
  listasSubBtnText: { fontSize: 13, color: Colors.text, fontWeight: '600' },

  tabsScroll: { maxHeight: 48, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabsContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  tabActive: { backgroundColor: Colors.primary + '22' },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: Colors.primary },
  tabBadge: { backgroundColor: Colors.border, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: Colors.primary },
  tabBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  body: { flex: 1, padding: 12 },

  grupo: {
    backgroundColor: Colors.card, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  grupoHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: Colors.primary + '14', borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 8,
  },
  cursoTag: {
    fontSize: 10, fontWeight: '700', color: Colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  grupoTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  grupoCount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  grupoActions: { alignItems: 'flex-end', gap: 6 },
  atribuidoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  atribuidoText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  atribuirGrupoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7,
  },
  atribuirGrupoBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  alunoRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '55',
  },
  alunoAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  alunoAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  alunoNome: { fontSize: 14, fontWeight: '600', color: Colors.text },
  alunoMat: { fontSize: 11, color: Colors.textMuted },
  turmaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '1A', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  turmaBadgeText: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  semTurmaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warning + '1A', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  semTurmaText: { fontSize: 11, color: Colors.warning, fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: {
    backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 14, paddingBottom: 16, maxHeight: '35%',
  },
  modalBoxCenter: {
    backgroundColor: Colors.card, borderRadius: 16,
    padding: 16, paddingBottom: 12, width: '100%', maxHeight: '60%',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalDesc: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  semTurmasMsg: {
    textAlign: 'center', color: Colors.textMuted, fontSize: 13,
    paddingVertical: 10, lineHeight: 18,
  },
  turmaOpcao: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: Colors.background, borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  turmaOpcaoNome: { fontSize: 15, fontWeight: '700', color: Colors.text },
  turmaOpcaoInfo: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  modalCancelar: {
    marginTop: 12, alignItems: 'center', padding: 12,
    backgroundColor: Colors.border + '55', borderRadius: 10,
  },
  modalCancelarText: { color: Colors.textMuted, fontWeight: '600', fontSize: 14 },
});
