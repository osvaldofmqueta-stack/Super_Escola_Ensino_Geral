import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { RH_TOUR_STEPS, RH_TOUR_KEY } from '@/constants/tourSteps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useData } from '@/context/DataContext';
import ExportMenu from '@/components/ExportMenu';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes, timeAgo } from '@/context/NotificacoesContext';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';
import CollapsibleStats from '@/components/CollapsibleStats';
import { SkeletonPage } from '@/components/Skeleton';

type Tab = 'painel' | 'professores' | 'sumarios' | 'solicitacoes' | 'contratos';
type SumarioFiltro = 'pendente' | 'aceite' | 'rejeitado' | 'todos';

interface PendingProfessor {
  id: string; nome: string; email?: string; telefone?: string;
  funcionarioId?: string; tipoContrato?: string; salarioBase?: number;
  dataContratacao?: string; departamento?: string; cargo?: string;
}
interface PendingFuncionario {
  id: string; nome: string; bi?: string; email?: string; telefone?: string;
  departamento?: string; cargo?: string;
  tipoContrato?: string; salarioBase?: number; dataContratacao?: string;
}

interface HorarioItem {
  id: string;
  turmaId: string;
  disciplina: string;
  professorId?: string;
  professorNome: string;
  diaSemana: number;
  periodo: number;
  horaInicio: string;
  horaFim: string;
  sala: string;
  anoAcademico: string;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function RHHubScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const router = useRouter();
  const { professores, turmas } = useData();
  const {
    sumarios, updateSumario,
    solicitacoes, updateSolicitacao, updatePauta,
    pautas, calendarioProvas, addCalendarioProva, updateCalendarioProva, deleteCalendarioProva,
    isLoading: profLoading,
  } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(RH_TOUR_KEY);

  // Auto-mostrar tour na primeira visita
  useEffect(() => { const t = setTimeout(() => checkAndShow(), 800); return () => clearTimeout(t); }, []);

  const [tab, setTab] = useState<Tab>('painel');
  const [refreshing, setRefreshing] = useState(false);

  // Sumários
  const [selectedSumario, setSelectedSumario] = useState<string | null>(null);
  const [sumFiltro, setSumFiltro] = useState<SumarioFiltro>('pendente');
  const [sumSearch, setSumSearch] = useState('');
  const [observacao, setObservacao] = useState('');

  // Solicitações
  const [selectedSolicitude, setSelectedSolicitude] = useState<string | null>(null);

  // Calendário
  const [showProvaForm, setShowProvaForm] = useState(false);
  const [editingProva, setEditingProva] = useState<string | null>(null);
  const [provaTitulo, setProvaTitulo] = useState('');
  const [provaDesc, setProvaDesc] = useState('');
  const [provaDisciplina, setProvaDisciplina] = useState('');
  const [provaData, setProvaData] = useState('');
  const [provaHora, setProvaHora] = useState('');
  const [provaTipo, setProvaTipo] = useState<string>('teste');
  const [provaTurmasIds, setProvaTurmasIds] = useState<string[]>([]);
  const [showNewTipoForm, setShowNewTipoForm] = useState(false);
  const [newTipoLabel, setNewTipoLabel] = useState('');
  const [customTipos, setCustomTipos] = useState<Array<{id: string; label: string}>>([]);

  // Carrega tipos personalizados da configuração
  useEffect(() => {
    const ct = (config as any)?.tiposProvaCustom;
    if (Array.isArray(ct)) setCustomTipos(ct);
  }, [(config as any)?.tiposProvaCustom]);

  async function adicionarTipoCustom() {
    const label = newTipoLabel.trim();
    if (!label) return;
    const id = 'custom_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (customTipos.some(t => t.id === id || t.label.toLowerCase() === label.toLowerCase())) {
      webAlert('Duplicado', 'Já existe um tipo com esse nome.'); return;
    }
    const updated = [...customTipos, { id, label }];
    setCustomTipos(updated);
    setNewTipoLabel('');
    setShowNewTipoForm(false);
    try { await api.put('/api/config', { tiposProvaCustom: updated }); } catch { /* ignora */ }
  }

  async function removerTipoCustom(id: string) {
    const updated = customTipos.filter(t => t.id !== id);
    setCustomTipos(updated);
    if (provaTipo === id) setProvaTipo('teste');
    try { await api.put('/api/config', { tiposProvaCustom: updated }); } catch { /* ignora */ }
  }

  // Contratos Pendentes
  const [contratosPend, setContratosPend] = useState<{ professores: PendingProfessor[]; funcionarios: PendingFuncionario[] }>({ professores: [], funcionarios: [] });
  const [contratosLoading, setContratosLoading] = useState(false);
  const [contratoFiltro, setContratoFiltro] = useState<'professores' | 'funcionarios'>('professores');
  const [contratoModal, setContratoModal] = useState<{ visible: boolean; tipo: 'professor' | 'funcionario'; id: string; nome: string } | null>(null);
  const [cForm, setCForm] = useState({ tipoContrato: '', salarioBase: '', dataContratacao: '', subsidioAlimentacao: '0', subsidioTransporte: '0', departamento: '', cargo: '' });
  const [cErro, setCErro] = useState('');
  const [cSaving, setCSaving] = useState(false);

  const TIPO_CONTRATO_OPTS = ['Efectivo', 'Prestação de Serviços', 'Contrato a Termo', 'Estágio', 'Avença'];

  async function loadContratos() {
    setContratosLoading(true);
    try {
      const d = await api.get('/api/admin/perfis-pendentes');
      setContratosPend({ professores: (d as any).professores ?? [], funcionarios: (d as any).funcionarios ?? [] });
    } catch { /* ignora */ } finally { setContratosLoading(false); }
  }

  function openContratoModal(tipo: 'professor' | 'funcionario', item: PendingProfessor | PendingFuncionario) {
    setCForm({
      tipoContrato: item.tipoContrato ?? '',
      salarioBase: item.salarioBase ? String(item.salarioBase) : '',
      dataContratacao: item.dataContratacao ? String(item.dataContratacao).substring(0, 10) : '',
      subsidioAlimentacao: '0', subsidioTransporte: '0',
      departamento: item.departamento ?? (tipo === 'professor' ? 'Docente' : ''),
      cargo: item.cargo ?? (tipo === 'professor' ? 'Professor' : ''),
    });
    setCErro('');
    setContratoModal({ visible: true, tipo, id: item.id, nome: item.nome });
  }

  async function submitContrato() {
    if (!cForm.tipoContrato) { setCErro('Seleccione o tipo de contrato.'); return; }
    if (!cForm.salarioBase || isNaN(Number(cForm.salarioBase)) || Number(cForm.salarioBase) <= 0) { setCErro('Salário base inválido.'); return; }
    if (!cForm.dataContratacao) { setCErro('Introduza a data de início do contrato.'); return; }
    if (!contratoModal) return;
    setCSaving(true); setCErro('');
    try {
      await api.put(`/api/admin/perfis-pendentes/${contratoModal.tipo}/${contratoModal.id}/completar-contrato`, {
        tipoContrato: cForm.tipoContrato,
        salarioBase: Number(cForm.salarioBase),
        dataContratacao: cForm.dataContratacao,
        subsidioAlimentacao: Number(cForm.subsidioAlimentacao) || 0,
        subsidioTransporte: Number(cForm.subsidioTransporte) || 0,
        departamento: cForm.departamento || undefined,
        cargo: cForm.cargo || undefined,
      });
      setContratoModal(null);
      await loadContratos();
    } catch (e: any) { setCErro(e?.message ?? 'Erro ao guardar.'); } finally { setCSaving(false); }
  }

  useEffect(() => { if (tab === 'contratos') loadContratos(); }, [tab]);

  // Professores
  const [profSearch, setProfSearch] = useState('');
  const [selectedProfId, setSelectedProfId] = useState<string | null>(null);
  const [profFiltro, setProfFiltro] = useState<'todos' | 'ativo' | 'inativo'>('todos');

  // Horários (carregados via API)
  const [horarios, setHorarios] = useState<HorarioItem[]>([]);
  const [horariosLoading, setHorariosLoading] = useState(false);

  const isRH = ['secretaria', 'admin', 'director', 'ceo', 'pca', 'chefe_secretaria', 'rh'].includes(user?.role ?? '');

  useEffect(() => {
    if (tab === 'painel') loadHorarios();
  }, [tab]);

  async function loadHorarios() {
    try {
      setHorariosLoading(true);
      const data = await api.get<HorarioItem[]>('/api/horarios');
      setHorarios(data);
    } catch {
      setHorarios([]);
    } finally {
      setHorariosLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHorarios();
    setRefreshing(false);
  }, []);

  // ─── Computed metrics ────────────────────────────────────────────────────────
  const profAtivos = useMemo(() => professores.filter(p => p.ativo), [professores]);
  const profInativos = useMemo(() => professores.filter(p => !p.ativo), [professores]);
  const sumPendentes = useMemo(() => sumarios.filter(s => s.status === 'pendente'), [sumarios]);
  const sumAceites = useMemo(() => sumarios.filter(s => s.status === 'aceite'), [sumarios]);
  const sumRejeitados = useMemo(() => sumarios.filter(s => s.status === 'rejeitado'), [sumarios]);
  const solPendentes = useMemo(() => solicitacoes.filter(s => s.status === 'pendente'), [solicitacoes]);
  const provasPublicadas = useMemo(() => calendarioProvas.filter(p => p.publicado), [calendarioProvas]);
  const pautasFechadas = useMemo(() => pautas.filter(p => p.status === 'fechada'), [pautas]);
  const pautasAbertas = useMemo(() => pautas.filter(p => p.status === 'aberta'), [pautas]);

  // Professor performance map: profId → { total, aceites, rejeitados, pendentes }
  const profPerformance = useMemo(() => {
    const map: Record<string, { total: number; aceites: number; rejeitados: number; pendentes: number }> = {};
    sumarios.forEach(s => {
      if (!map[s.professorId]) map[s.professorId] = { total: 0, aceites: 0, rejeitados: 0, pendentes: 0 };
      map[s.professorId].total++;
      if (s.status === 'aceite') map[s.professorId].aceites++;
      else if (s.status === 'rejeitado') map[s.professorId].rejeitados++;
      else map[s.professorId].pendentes++;
    });
    return map;
  }, [sumarios]);

  // Filtered professors
  const profFiltrados = useMemo(() => {
    return professores
      .filter(p => {
        if (profFiltro === 'ativo') return p.ativo;
        if (profFiltro === 'inativo') return !p.ativo;
        return true;
      })
      .filter(p => {
        if (!profSearch.trim()) return true;
        const q = profSearch.toLowerCase();
        return (
          p.nome.toLowerCase().includes(q) ||
          p.apelido.toLowerCase().includes(q) ||
          (p.disciplinas as string[]).some((d: string) => d.toLowerCase().includes(q))
        );
      });
  }, [professores, profSearch, profFiltro]);

  // Filtered sumários
  const sumFiltrados = useMemo(() => {
    return sumarios
      .filter(s => sumFiltro === 'todos' || s.status === sumFiltro)
      .filter(s => {
        if (!sumSearch.trim()) return true;
        const q = sumSearch.toLowerCase();
        return s.professorNome.toLowerCase().includes(q) || s.disciplina.toLowerCase().includes(q) || s.turmaNome.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sumarios, sumFiltro, sumSearch]);

  const sumarioSelecionado = sumarios.find(s => s.id === selectedSumario);
  const solicitSelecionada = solicitacoes.find(s => s.id === selectedSolicitude);
  const profSelecionado = professores.find(p => p.id === selectedProfId);

  // ─── Actions ─────────────────────────────────────────────────────────────────
  async function aceitarSumario() {
    if (!sumarioSelecionado) return;
    await updateSumario(sumarioSelecionado.id, { status: 'aceite', observacaoRH: observacao || undefined });
    await addNotificacao({
      titulo: 'Sumário Aceite',
      mensagem: `O sumário da aula ${sumarioSelecionado.numeroAula} de ${sumarioSelecionado.disciplina} foi aceite.`,
      tipo: 'sucesso', data: new Date().toISOString(),
    });
    setSelectedSumario(null); setObservacao('');
  }

  async function rejeitarSumario() {
    if (!sumarioSelecionado) return;
    if (!observacao.trim()) { webAlert('Obrigatório', 'Indique o motivo da rejeição.'); return; }
    await updateSumario(sumarioSelecionado.id, { status: 'rejeitado', observacaoRH: observacao });
    await addNotificacao({
      titulo: 'Sumário Rejeitado',
      mensagem: `O sumário da aula ${sumarioSelecionado.numeroAula} de ${sumarioSelecionado.disciplina} foi rejeitado. Motivo: ${observacao}`,
      tipo: 'aviso', data: new Date().toISOString(),
    });
    setSelectedSumario(null); setObservacao('');
  }

  async function aprovarSolicitacao() {
    if (!solicitSelecionada) return;
    await updateSolicitacao(solicitSelecionada.id, { status: 'aprovada', respondidoEm: new Date().toISOString(), observacao });
    await updatePauta(solicitSelecionada.pautaId, { status: 'aberta' });
    await addNotificacao({
      titulo: 'Reabertura Aprovada',
      mensagem: `A solicitação de reabertura da pauta de ${solicitSelecionada.disciplina} (${solicitSelecionada.turmaNome}) foi aprovada.`,
      tipo: 'sucesso', data: new Date().toISOString(),
    });
    setSelectedSolicitude(null); setObservacao('');
  }

  async function rejeitarSolicitacao() {
    if (!solicitSelecionada) return;
    await updateSolicitacao(solicitSelecionada.id, { status: 'rejeitada', respondidoEm: new Date().toISOString(), observacao });
    await addNotificacao({
      titulo: 'Reabertura Rejeitada',
      mensagem: `A solicitação de reabertura da pauta de ${solicitSelecionada.disciplina} foi rejeitada.`,
      tipo: 'aviso', data: new Date().toISOString(),
    });
    setSelectedSolicitude(null); setObservacao('');
  }

  async function publicarProva() {
    if (!provaTitulo || !provaData || !provaDisciplina) {
      webAlert('Campos obrigatórios', 'Preencha título, disciplina e data.'); return;
    }
    if (editingProva) {
      await updateCalendarioProva(editingProva, {
        titulo: provaTitulo, descricao: provaDesc, disciplina: provaDisciplina,
        data: provaData, hora: provaHora, tipo: provaTipo, turmasIds: provaTurmasIds, publicado: true,
      });
    } else {
      await addCalendarioProva({
        titulo: provaTitulo, descricao: provaDesc, disciplina: provaDisciplina,
        data: provaData, hora: provaHora, tipo: provaTipo, turmasIds: provaTurmasIds, publicado: false,
      });
    }
    await addNotificacao({
      titulo: 'Nova Prova no Calendário',
      mensagem: `${provaTitulo} de ${provaDisciplina} agendada para ${provaData}.`,
      tipo: 'aviso', data: new Date().toISOString(),
    });
    setShowProvaForm(false); resetProvaForm();
  }

  useEnterToSave(publicarProva, showProvaForm);

  function resetProvaForm() {
    setProvaTitulo(''); setProvaDesc(''); setProvaDisciplina('');
    setProvaData(''); setProvaHora(''); setProvaTurmasIds([]); setEditingProva(null);
    setProvaTipo('teste'); setShowNewTipoForm(false); setNewTipoLabel('');
  }

  async function publicarToggle(id: string, publicado: boolean) {
    await updateCalendarioProva(id, { publicado });
    if (publicado) {
      const prova = calendarioProvas.find(p => p.id === id);
      await addNotificacao({
        titulo: 'Prova Publicada',
        mensagem: `${prova?.titulo} de ${prova?.disciplina} foi publicada.`,
        tipo: 'info', data: new Date().toISOString(),
      });
    }
  }

  const CUSTOM_TIPO_PALETTE = ['#A78BFA', '#22D3EE', '#FB923C', '#F472B6', '#34D399', '#FBBF24'];
  const tipoProvaColor: Record<string, string> = {
    teste: Colors.info, exame: Colors.danger, trabalho: Colors.gold, prova_oral: Colors.success,
    ...Object.fromEntries(customTipos.map((t, i) => [t.id, CUSTOM_TIPO_PALETTE[i % CUSTOM_TIPO_PALETTE.length]])),
  };

  // ─── Access Guard ─────────────────────────────────────────────────────────────
  if (!isRH) {
    return (
      <View style={styles.container}>
        <TopBar title="Hub de Recursos Humanos" subtitle="Acesso restrito" />
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Acesso Restrito</Text>
          <Text style={styles.emptySub}>Esta área é exclusiva para Secretaria, Administração e Direcção.</Text>
        </View>
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (profLoading) return <SkeletonPage variant="tabs-stats" tabs={3} />;

  return (
    <View style={styles.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={RH_TOUR_STEPS} storageKey={RH_TOUR_KEY} />
      <TopBar title="Recursos Humanos" subtitle="Gestão integrada do pessoal docente" rightAction={{ icon: 'compass-outline', onPress: openTour }} />

      {/* KPI grid 2×3 */}
      <CollapsibleStats storageKey="rh-kpi" title="Indicadores" color={Colors.gold} headerStyle={{ paddingHorizontal: 8 }}>
        <View style={styles.kpiGrid}>
          <KPIChip label="Prof. Activos" value={profAtivos.length} color={Colors.success} icon="people" />
          <KPIChip label="Sumários Pend." value={sumPendentes.length} color={Colors.warning} icon="clipboard-outline" />
          <KPIChip label="Solicitações" value={solPendentes.length} color={Colors.accent} icon="document-text-outline" />
          <KPIChip label="Provas Publ." value={provasPublicadas.length} color={Colors.info} icon="calendar-outline" />
          <KPIChip label="Turmas" value={turmas.length} color={Colors.primaryLight} icon="school-outline" />
        </View>
      </CollapsibleStats>

      {/* Tab bar */}
      <HScrollTabBar style={[styles.tabScrollWrap, styles.tabScroll]} contentContainerStyle={styles.tabRow} stickyCount={1}>
        {([
          { key: 'painel',       label: 'Painel',        icon: 'grid-outline' },
          { key: 'professores',  label: 'Professores',   icon: 'people-outline' },
          { key: 'contratos',    label: `Contratos${(contratosPend.professores.length + contratosPend.funcionarios.length) > 0 ? ` (${contratosPend.professores.length + contratosPend.funcionarios.length})` : ''}`, icon: 'file-sign' as any, isMCI: true },
          { key: 'sumarios',     label: `Sumários (${sumPendentes.length})`, icon: 'clipboard-outline' },
          { key: 'solicitacoes', label: `Solicitações (${solPendentes.length})`, icon: 'document-text-outline' },
        ] as { key: Tab; label: string; icon: any; isMCI?: boolean }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            {t.isMCI
              ? <MaterialCommunityIcons name={t.icon} size={16} color={tab === t.key ? Colors.gold : Colors.textMuted} />
              : <Ionicons name={t.icon} size={16} color={tab === t.key ? Colors.gold : Colors.textMuted} />}
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* ── PAINEL ─────────────────────────────────────────────────────────── */}
      {tab === 'painel' && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        >
          {/* Activity chart */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Sumários por Estado</Text>
            <View style={styles.barGroup}>
              <BarStat label="Pendentes" value={sumPendentes.length} total={sumarios.length} color={Colors.warning} />
              <BarStat label="Aceites" value={sumAceites.length} total={sumarios.length} color={Colors.success} />
              <BarStat label="Rejeitados" value={sumRejeitados.length} total={sumarios.length} color={Colors.danger} />
            </View>
          </View>

          {/* Top professors by sumários */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Professores Mais Activos (Sumários)</Text>
            {professores
              .filter(p => profPerformance[p.id]?.total > 0)
              .sort((a, b) => (profPerformance[b.id]?.total ?? 0) - (profPerformance[a.id]?.total ?? 0))
              .slice(0, 5)
              .map((p, i) => {
                const perf = profPerformance[p.id] ?? { total: 0, aceites: 0, rejeitados: 0, pendentes: 0 };
                const taxa = perf.total > 0 ? Math.round((perf.aceites / perf.total) * 100) : 0;
                return (
                  <View key={p.id} style={styles.profRankRow}>
                    <View style={[styles.rankBadge, { backgroundColor: i === 0 ? Colors.gold + '30' : Colors.surface }]}>
                      <Text style={[styles.rankNum, { color: i === 0 ? Colors.gold : Colors.textSecondary }]}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.profRankName} numberOfLines={1}>{p.nome} {p.apelido}</Text>
                      <Text style={styles.profRankSub} numberOfLines={2}>{(p.disciplinas as string[]).join(', ')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.profRankTotal, { color: Colors.success }]}>{taxa}% taxa</Text>
                      <Text style={styles.profRankSub}>{perf.total} sumário(s)</Text>
                    </View>
                  </View>
                );
              })}
            {professores.filter(p => profPerformance[p.id]?.total > 0).length === 0 && (
              <Text style={styles.emptySmall}>Nenhum sumário registado ainda.</Text>
            )}
          </View>

          {/* Solicitações pendentes rápidas */}
          {solPendentes.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Solicitações Pendentes</Text>
              {solPendentes.slice(0, 3).map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.quickItem}
                  onPress={() => { setSelectedSolicitude(s.id); setObservacao(''); setTab('solicitacoes'); }}
                >
                  <View style={[styles.quickDot, { backgroundColor: Colors.warning }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickTitle}>{s.professorNome}</Text>
                    <Text style={styles.quickSub}>{s.disciplina} · {s.turmaNome} · T{s.trimestre}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
              {solPendentes.length > 3 && (
                <TouchableOpacity onPress={() => setTab('solicitacoes')}>
                  <Text style={styles.verMais}>Ver todas ({solPendentes.length}) →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Horário por professor */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Carga Horária por Professor</Text>
            {horariosLoading ? (
              <AppLoader color={Colors.gold} />
            ) : professores.filter(p => p.ativo).map(p => {
              const aulas = horarios.filter(h => h.professorId === p.id || h.professorNome === `${p.nome} ${p.apelido}`);
              if (aulas.length === 0) return null;
              return (
                <View key={p.id} style={styles.cargaRow}>
                  <FontAwesome5 name="chalkboard-teacher" size={14} color={Colors.gold} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.cargaNome}>{p.nome} {p.apelido}</Text>
                    <Text style={styles.cargaSub}>{aulas.length} aula(s) semanais</Text>
                  </View>
                  <View style={[styles.cargaBadge, { backgroundColor: Colors.info + '22' }]}>
                    <Text style={[styles.cargaBadgeText, { color: Colors.info }]}>{aulas.length}h</Text>
                  </View>
                </View>
              );
            })}
            {horarios.length === 0 && !horariosLoading && (
              <Text style={styles.emptySmall}>Sem horários configurados.</Text>
            )}
          </View>

          {/* Gestão de Pessoal quick access */}
          <TouchableOpacity
            style={[styles.sectionCard, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}
            onPress={() => router.push('/(main)/rh-controle' as never)}
            activeOpacity={0.8}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="account-group" size={24} color={Colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Gestão de Pessoal</Text>
              <Text style={styles.emptySmall}>Funcionários · Contratos · Departamentos · Acessos</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Payroll quick access */}
          <TouchableOpacity
            style={[styles.sectionCard, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}
            onPress={() => router.push('/(main)/rh-payroll' as never)}
            activeOpacity={0.8}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="cash-multiple" size={24} color={Colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Folha de Salários</Text>
              <Text style={styles.emptySmall}>Processamento salarial · INSS · IRT Angola</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── PROFESSORES ────────────────────────────────────────────────────── */}
      {tab === 'professores' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBar}>
            <StableSearchInput
              value={profSearch}
              onChangeText={setProfSearch}
              inputStyle={styles.searchInput}
              placeholder="Pesquisar professor ou disciplina..."
              iconColor={Colors.textMuted}
            />
            <ExportMenu
              title="Quadro de Pessoal Docente"
              columns={[
                { header: 'Nº Professor', key: 'numero', width: 14 },
                { header: 'Nome Completo', key: 'nome', width: 26 },
                { header: 'Disciplinas', key: 'disciplinas', width: 30 },
                { header: 'Habilitações', key: 'habilitacoes', width: 20 },
                { header: 'Turmas', key: 'turmas', width: 22 },
                { header: 'Nº Turmas', key: 'numTurmas', width: 10 },
                { header: 'Telefone', key: 'telefone', width: 16 },
                { header: 'Estado', key: 'estado', width: 10 },
              ]}
              rows={profFiltrados.map(p => ({
                numero: p.numeroProfessor,
                nome: `${p.nome} ${p.apelido}`,
                disciplinas: (p.disciplinas as string[]).join(', '),
                habilitacoes: p.habilitacoes,
                turmas: turmas.filter(t => (p.turmasIds as string[]).includes(t.id) || (t.professoresIds ?? []).includes(p.id)).map(t => t.nome).join(', '),
                numTurmas: turmas.filter(t => (p.turmasIds as string[]).includes(t.id) || (t.professoresIds ?? []).includes(p.id)).length,
                telefone: p.telefone ?? '',
                estado: p.ativo ? 'Activo' : 'Inactivo',
              }))}
              school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola', directorGeral: config?.directorGeral }}
              filename="quadro_pessoal_docente"
              landscape
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <View style={styles.filterInner}>
              {(['todos', 'ativo', 'inativo'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, profFiltro === f && styles.filterBtnActive]}
                  onPress={() => setProfFiltro(f)}
                >
                  <Text style={[styles.filterText, profFiltro === f && styles.filterTextActive]}>
                    {f === 'todos' ? `Todos (${professores.length})` : f === 'ativo' ? `Activos (${profAtivos.length})` : `Inactivos (${profInativos.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <FlatList
            data={profFiltrados}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhum professor encontrado</Text>
              </View>
            }
            renderItem={({ item: p }) => {
              const perf = profPerformance[p.id] ?? { total: 0, aceites: 0, rejeitados: 0, pendentes: 0 };
              const turmasProf = turmas.filter(t => (p.turmasIds as string[]).includes(t.id) || (t.professoresIds ?? []).includes(p.id));
              const taxa = perf.total > 0 ? Math.round((perf.aceites / perf.total) * 100) : null;
              return (
                <TouchableOpacity
                  style={[styles.card, !p.ativo && { opacity: 0.6 }]}
                  onPress={() => setSelectedProfId(p.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.profCardTop}>
                    <View style={styles.profAvatar}>
                      <Text style={styles.profAvatarText}>{p.nome[0]}{p.apelido[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.profCardName}>{p.nome} {p.apelido}</Text>
                        <View style={[styles.statusPill, { backgroundColor: p.ativo ? Colors.success + '22' : Colors.danger + '22' }]}>
                          <Text style={[styles.statusPillText, { color: p.ativo ? Colors.success : Colors.danger }]}>
                            {p.ativo ? 'Activo' : 'Inactivo'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.profCardDis}>{(p.disciplinas as string[]).join(' · ')}</Text>
                      <Text style={styles.profCardSub}>{p.habilitacoes}</Text>
                    </View>
                  </View>
                  <View style={styles.profCardStats}>
                    <ProfStat label="Turmas" value={turmasProf.length} color={Colors.info} />
                    <ProfStat label="Sumários" value={perf.total} color={Colors.warning} />
                    <ProfStat label="Aceites" value={perf.aceites} color={Colors.success} />
                    <ProfStat label="Taxa" value={taxa !== null ? `${taxa}%` : 'N/A'} color={taxa !== null && taxa >= 80 ? Colors.success : Colors.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── SUMÁRIOS ───────────────────────────────────────────────────────── */}
      {tab === 'sumarios' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBar}>
            <StableSearchInput
              value={sumSearch}
              onChangeText={setSumSearch}
              inputStyle={styles.searchInput}
              placeholder="Pesquisar professor, disciplina ou turma..."
              iconColor={Colors.textMuted}
            />
            <ExportMenu
              title="Sumários dos Professores"
              columns={[
                { header: 'Professor', key: 'professor', width: 26 },
                { header: 'Disciplina', key: 'disciplina', width: 22 },
                { header: 'Turma', key: 'turma', width: 14 },
                { header: 'Aula Nº', key: 'aula', width: 10 },
                { header: 'Data', key: 'data', width: 12 },
                { header: 'Horário', key: 'horario', width: 14 },
                { header: 'Estado', key: 'estado', width: 12 },
                { header: 'Conteúdo', key: 'conteudo', width: 40 },
              ]}
              rows={sumFiltrados.map(s => ({
                professor: s.professorNome,
                disciplina: s.disciplina,
                turma: s.turmaNome,
                aula: s.numeroAula,
                data: s.data,
                horario: `${s.horaInicio}–${s.horaFim}`,
                estado: s.status === 'aceite' ? 'Aceite' : s.status === 'rejeitado' ? 'Rejeitado' : 'Pendente',
                conteudo: s.conteudo,
              }))}
              school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola', directorGeral: config?.directorGeral }}
              filename="sumarios_professores"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <View style={styles.filterInner}>
              {(['pendente', 'aceite', 'rejeitado', 'todos'] as SumarioFiltro[]).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, sumFiltro === f && styles.filterBtnActive]}
                  onPress={() => setSumFiltro(f)}
                >
                  <Text style={[styles.filterText, sumFiltro === f && styles.filterTextActive]}>
                    {f === 'pendente' ? `Pendentes (${sumPendentes.length})` : f === 'aceite' ? `Aceites (${sumAceites.length})` : f === 'rejeitado' ? `Rejeitados (${sumRejeitados.length})` : `Todos (${sumarios.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <FlatList
            data={sumFiltrados}
            keyExtractor={s => s.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24, flexGrow: 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhum sumário</Text>
                <Text style={styles.emptySub}>
                  {sumFiltro === 'pendente' ? 'Não há sumários pendentes de revisão.' : sumFiltro === 'aceite' ? 'Nenhum sumário aceite ainda.' : sumFiltro === 'rejeitado' ? 'Nenhum sumário rejeitado.' : 'Ainda não foram submetidos sumários.'}
                </Text>
              </View>
            }
            renderItem={({ item: s }) => {
              const sc = s.status === 'aceite' ? Colors.success : s.status === 'rejeitado' ? Colors.danger : Colors.warning;
              return (
                <TouchableOpacity
                  style={[styles.card, { borderLeftColor: sc, borderLeftWidth: 3 }]}
                  onPress={() => { setSelectedSumario(s.id); setObservacao(s.observacaoRH ?? ''); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{s.professorNome}</Text>
                      <Text style={styles.cardSub}>{s.disciplina} · {s.turmaNome} · Aula {s.numeroAula}</Text>
                      <Text style={styles.cardDate}>{s.data} · {s.horaInicio}–{s.horaFim}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                      <Text style={[styles.statusText, { color: sc }]}>
                        {s.status === 'aceite' ? 'Aceite' : s.status === 'rejeitado' ? 'Rejeitado' : 'Pendente'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardConteudo} numberOfLines={2}>{s.conteudo}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── SOLICITAÇÕES ───────────────────────────────────────────────────── */}
      {tab === 'solicitacoes' && (
        <FlatList
          data={[...solicitacoes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhuma solicitação</Text>
            </View>
          }
          renderItem={({ item: sol }) => {
            const sc = sol.status === 'aprovada' ? Colors.success : sol.status === 'rejeitada' ? Colors.danger : Colors.warning;
            return (
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: sc, borderLeftWidth: 3 }]}
                onPress={() => { if (sol.status === 'pendente') { setSelectedSolicitude(sol.id); setObservacao(''); }}}
                activeOpacity={sol.status === 'pendente' ? 0.8 : 1}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{sol.professorNome}</Text>
                    <Text style={styles.cardSub}>{sol.disciplina} · {sol.turmaNome} · T{sol.trimestre}</Text>
                    <Text style={styles.cardDate}>{timeAgo(sol.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                    <Text style={[styles.statusText, { color: sc }]}>
                      {sol.status === 'aprovada' ? 'Aprovada' : sol.status === 'rejeitada' ? 'Rejeitada' : 'Pendente'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardConteudo} numberOfLines={2}>Motivo: {sol.motivo}</Text>
                {sol.observacao && <Text style={[styles.cardConteudo, { color: Colors.textMuted, marginTop: 4 }]} numberOfLines={1}>Resposta: {sol.observacao}</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── CONTRATOS PENDENTES ─────────────────────────────────────────────── */}
      {tab === 'contratos' && (
        <View style={{ flex: 1 }}>
          {/* Sub-filtro Professores / Funcionários */}
          <View style={{ flexDirection: 'row', margin: 12, gap: 8 }}>
            {(['professores', 'funcionarios'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, contratoFiltro === f && styles.filterBtnActive, { flex: 1, alignItems: 'center' }]}
                onPress={() => setContratoFiltro(f)}
              >
                <Text style={[styles.filterText, contratoFiltro === f && styles.filterTextActive]}>
                  {f === 'professores' ? `Professores (${contratosPend.professores.length})` : `Funcionários (${contratosPend.funcionarios.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {contratosLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={Colors.gold} size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: bottomInset + 24 }}
              refreshControl={<RefreshControl refreshing={contratosLoading} onRefresh={loadContratos} tintColor={Colors.gold} />}>
              {/* Banner informativo */}
              <View style={[styles.sectionCard, { borderLeftWidth: 3, borderLeftColor: contratoFiltro === 'professores' ? Colors.warning : Colors.success, padding: 12, marginBottom: 4 }]}>
                <Text style={[styles.cardTitle, { marginBottom: 2 }]}>
                  {contratoFiltro === 'professores' ? 'Professores sem dados contratuais' : 'Funcionários sem dados contratuais'}
                </Text>
                <Text style={styles.cardSub}>
                  {contratoFiltro === 'professores'
                    ? 'Preencha o tipo de contrato, salário e data de início de cada professor.'
                    : 'Preencha os dados contratuais dos funcionários administrativos.'}
                </Text>
              </View>

              {(contratoFiltro === 'professores' ? contratosPend.professores : contratosPend.funcionarios).length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="check-decagram" size={48} color={Colors.success} style={{ opacity: 0.6 }} />
                  <Text style={styles.emptyTitle}>
                    {contratoFiltro === 'professores' ? 'Todos os professores têm contrato preenchido.' : 'Todos os funcionários têm contrato preenchido.'}
                  </Text>
                </View>
              ) : (
                (contratoFiltro === 'professores' ? contratosPend.professores : contratosPend.funcionarios).map((item: any) => {
                  const cor = contratoFiltro === 'professores' ? Colors.warning : Colors.success;
                  return (
                    <View key={item.id} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: cor }]}>
                      <View style={styles.cardTop}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons
                            name={contratoFiltro === 'professores' ? 'account-tie' : 'badge-account-horizontal-outline'}
                            size={20} color={cor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{item.nome}</Text>
                          {item.email && <Text style={styles.cardSub}>{item.email}</Text>}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {item.telefone ? (
                              <View style={styles.tipoBadge}><Text style={[styles.tipoText, { color: Colors.info }]}>{item.telefone}</Text></View>
                            ) : (
                              <View style={[styles.tipoBadge, { backgroundColor: Colors.danger + '18' }]}><Text style={[styles.tipoText, { color: Colors.danger }]}>Sem telefone</Text></View>
                            )}
                            {item.tipoContrato ? (
                              <View style={[styles.tipoBadge, { backgroundColor: cor + '18' }]}><Text style={[styles.tipoText, { color: cor }]}>{item.tipoContrato}</Text></View>
                            ) : (
                              <View style={[styles.tipoBadge, { backgroundColor: Colors.danger + '18' }]}><Text style={[styles.tipoText, { color: Colors.danger }]}>Sem contrato</Text></View>
                            )}
                            {item.salarioBase && Number(item.salarioBase) > 0 ? (
                              <View style={[styles.tipoBadge, { backgroundColor: Colors.success + '18' }]}><Text style={[styles.tipoText, { color: Colors.success }]}>{Number(item.salarioBase).toLocaleString('pt-AO')} Kz</Text></View>
                            ) : (
                              <View style={[styles.tipoBadge, { backgroundColor: Colors.danger + '18' }]}><Text style={[styles.tipoText, { color: Colors.danger }]}>Sem salário</Text></View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[styles.publishBtn, { backgroundColor: cor + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }]}
                          onPress={() => openContratoModal(contratoFiltro === 'professores' ? 'professor' : 'funcionario', item)}
                        >
                          <MaterialCommunityIcons name="file-sign" size={14} color={cor} />
                          <Text style={[styles.publishText, { color: cor }]}>Preencher</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* ═══════════════════════ MODALS ═══════════════════════════════════════ */}

      {/* Modal: Preencher Contrato (RH) */}
      <Modal visible={!!contratoModal?.visible} transparent animationType="slide" onRequestClose={() => setContratoModal(null)}>
        <View style={[styles.overlay, { justifyContent: 'flex-end' }]}>
          <View style={[styles.modalBox, { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 0, borderBottomEndRadius: 0, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
              <View style={{ height: 3, backgroundColor: contratoModal?.tipo === 'professor' ? Colors.warning : Colors.success, borderRadius: 2, marginHorizontal: -20, marginBottom: 18 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (contratoModal?.tipo === 'professor' ? Colors.warning : Colors.success) + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="file-sign" size={20} color={contratoModal?.tipo === 'professor' ? Colors.warning : Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Dados Contratuais</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>{contratoModal?.nome}</Text>
                </View>
                <TouchableOpacity onPress={() => setContratoModal(null)} style={styles.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Tipo de Contrato *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {TIPO_CONTRATO_OPTS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.tipoBtn, { backgroundColor: cForm.tipoContrato === opt ? Colors.gold + '22' : Colors.surface, borderWidth: 1, borderColor: cForm.tipoContrato === opt ? Colors.gold : Colors.border }]}
                    onPress={() => { setCForm(f => ({ ...f, tipoContrato: opt })); setCErro(''); }}
                  >
                    <Text style={[styles.tipoBtnText, cForm.tipoContrato === opt && { color: Colors.gold, fontWeight: '700' }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Salário Base (Kz) *</Text>
              <TextInput style={[styles.input, cErro && !cForm.salarioBase ? { borderColor: Colors.danger } : {}]}
                placeholder="ex: 150000" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={cForm.salarioBase}
                onChangeText={v => { setCForm(f => ({ ...f, salarioBase: v })); setCErro(''); }} />

              <Text style={styles.fieldLabel}>Data de Início *</Text>
              <TextInput style={[styles.input, cErro && !cForm.dataContratacao ? { borderColor: Colors.danger } : {}]}
                placeholder="AAAA-MM-DD" placeholderTextColor={Colors.textMuted}
                value={cForm.dataContratacao}
                onChangeText={v => { setCForm(f => ({ ...f, dataContratacao: v })); setCErro(''); }} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Subsídio Alimentação (Kz)</Text>
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric" value={cForm.subsidioAlimentacao}
                    onChangeText={v => setCForm(f => ({ ...f, subsidioAlimentacao: v }))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Subsídio Transporte (Kz)</Text>
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric" value={cForm.subsidioTransporte}
                    onChangeText={v => setCForm(f => ({ ...f, subsidioTransporte: v }))} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Departamento</Text>
              <TextInput style={styles.input}
                placeholder={contratoModal?.tipo === 'professor' ? 'Docente' : 'ex: Secretaria'}
                placeholderTextColor={Colors.textMuted} value={cForm.departamento}
                onChangeText={v => setCForm(f => ({ ...f, departamento: v }))} />

              <Text style={styles.fieldLabel}>Cargo</Text>
              <TextInput style={styles.input}
                placeholder={contratoModal?.tipo === 'professor' ? 'Professor' : 'ex: Assistente Administrativo'}
                placeholderTextColor={Colors.textMuted} value={cForm.cargo}
                onChangeText={v => setCForm(f => ({ ...f, cargo: v }))} />

              {!!cErro && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                  <Text style={{ color: Colors.danger, fontSize: 13, flex: 1 }}>{cErro}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: contratoModal?.tipo === 'professor' ? Colors.warning : Colors.success, opacity: cSaving ? 0.7 : 1 }]}
                onPress={submitContrato} disabled={cSaving}
              >
                {cSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><MaterialCommunityIcons name="content-save" size={16} color="#fff" /><Text style={styles.saveBtnText}>Guardar Dados Contratuais</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Professor Detail Modal */}
      <Modal visible={!!selectedProfId} transparent animationType="slide" onRequestClose={() => setSelectedProfId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Perfil do Professor</Text>
              <TouchableOpacity onPress={() => setSelectedProfId(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {profSelecionado && (() => {
              const perf = profPerformance[profSelecionado.id] ?? { total: 0, aceites: 0, rejeitados: 0, pendentes: 0 };
              const turmasProf = turmas.filter(t => (profSelecionado.turmasIds as string[]).includes(t.id));
              const sumProf = sumarios.filter(s => s.professorId === profSelecionado.id).slice(0, 5);
              const taxa = perf.total > 0 ? Math.round((perf.aceites / perf.total) * 100) : 0;
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Avatar block */}
                  <View style={styles.profModalAvatar}>
                    <View style={styles.profAvatarLarge}>
                      <Text style={styles.profAvatarLargeText}>{profSelecionado.nome[0]}{profSelecionado.apelido[0]}</Text>
                    </View>
                    <Text style={styles.profModalName}>{profSelecionado.nome} {profSelecionado.apelido}</Text>
                    <View style={[styles.statusPill, { backgroundColor: profSelecionado.ativo ? Colors.success + '22' : Colors.danger + '22', alignSelf: 'center', marginTop: 4 }]}>
                      <Text style={[styles.statusPillText, { color: profSelecionado.ativo ? Colors.success : Colors.danger }]}>
                        {profSelecionado.ativo ? 'Activo' : 'Inactivo'}
                      </Text>
                    </View>
                  </View>

                  <LabelValue label="Nº Professor" value={profSelecionado.numeroProfessor} />
                  <LabelValue label="Email" value={profSelecionado.email} />
                  <LabelValue label="Telefone" value={profSelecionado.telefone} />
                  <LabelValue label="Habilitações" value={profSelecionado.habilitacoes} />
                  <LabelValue label="Disciplinas" value={(profSelecionado.disciplinas as string[]).join(', ')} />
                  <LabelValue label="Turmas Atribuídas" value={turmasProf.length > 0 ? turmasProf.map(t => `${t.nome} (${t.classe})`).join(', ') : 'Nenhuma'} />

                  {/* Performance */}
                  <Text style={[styles.reviewLabel, { marginTop: 16 }]}>Desempenho — Sumários</Text>
                  <View style={styles.perfRow}>
                    <PerfBlock label="Total" value={perf.total} color={Colors.textSecondary} />
                    <PerfBlock label="Aceites" value={perf.aceites} color={Colors.success} />
                    <PerfBlock label="Rejeitados" value={perf.rejeitados} color={Colors.danger} />
                    <PerfBlock label="Taxa" value={`${taxa}%`} color={taxa >= 80 ? Colors.success : Colors.warning} />
                  </View>

                  {/* Recent sumários */}
                  {sumProf.length > 0 && (
                    <>
                      <Text style={[styles.reviewLabel, { marginTop: 16 }]}>Últimos Sumários</Text>
                      {sumProf.map(s => {
                        const sc = s.status === 'aceite' ? Colors.success : s.status === 'rejeitado' ? Colors.danger : Colors.warning;
                        return (
                          <View key={s.id} style={[styles.sumMiniCard, { borderLeftColor: sc, borderLeftWidth: 2 }]}>
                            <Text style={styles.sumMiniTitle}>{s.disciplina} · {s.turmaNome} · Aula {s.numeroAula}</Text>
                            <Text style={styles.sumMiniSub}>{s.data} · <Text style={{ color: sc }}>{s.status}</Text></Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                  <View style={{ height: 16 }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Sumário Review Modal */}
      <Modal visible={!!selectedSumario} transparent animationType="slide" onRequestClose={() => setSelectedSumario(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { padding: 0, overflow: 'hidden' }]}>
            {sumarioSelecionado && (() => {
              const sc = sumarioSelecionado.status === 'aceite' ? Colors.success : sumarioSelecionado.status === 'rejeitado' ? Colors.danger : Colors.warning;
              const sIcon = sumarioSelecionado.status === 'aceite' ? 'checkmark-circle' : sumarioSelecionado.status === 'rejeitado' ? 'close-circle' : 'time';
              const sLabel = sumarioSelecionado.status === 'aceite' ? 'Aceite' : sumarioSelecionado.status === 'rejeitado' ? 'Rejeitado' : 'Pendente';
              const initials = sumarioSelecionado.professorNome?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
              return (
                <>
                  <View style={[styles.reviewModalHead, { backgroundColor: sc + '18' }]}>
                    <TouchableOpacity onPress={() => { setSelectedSumario(null); setObservacao(''); }} style={styles.reviewModalClose}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.reviewAvatar, { backgroundColor: Colors.accent + '33', borderColor: Colors.accent + '55' }]}>
                      <Text style={styles.reviewAvatarText}>{initials}</Text>
                    </View>
                    <Text style={styles.reviewModalName}>{sumarioSelecionado.professorNome}</Text>
                    <View style={[styles.reviewStatusBadge, { backgroundColor: sc + '22', borderColor: sc + '44' }]}>
                      <Ionicons name={sIcon as any} size={12} color={sc} />
                      <Text style={[styles.reviewStatusText, { color: sc }]}>{sLabel}</Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
                    <View style={styles.reviewInfoCard}>
                      <View style={styles.reviewInfoRow}>
                        <MaterialCommunityIcons name="google-classroom" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{sumarioSelecionado.turmaNome} · {sumarioSelecionado.disciplina}</Text>
                      </View>
                      <View style={[styles.reviewInfoRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                        <MaterialCommunityIcons name="clock-outline" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{sumarioSelecionado.data} · {sumarioSelecionado.horaInicio}–{sumarioSelecionado.horaFim}</Text>
                        <View style={styles.aulaChip}>
                          <Text style={styles.aulaChipText}>Aula {sumarioSelecionado.numeroAula}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Conteúdo Lecionado</Text>
                    <View style={styles.conteudoBoxEnhanced}>
                      <MaterialCommunityIcons name="text-box-outline" size={16} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={styles.conteudoText}>{sumarioSelecionado.conteudo}</Text>
                    </View>

                    <Text style={styles.reviewSectionLabel}>
                      Observação{sumarioSelecionado.status === 'pendente' ? ' (obrigatória na rejeição)' : ''}
                    </Text>
                    <TextInput
                      style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                      placeholder="Escreva uma observação..."
                      placeholderTextColor={Colors.textMuted}
                      value={observacao}
                      onChangeText={setObservacao}
                      multiline
                      editable={sumarioSelecionado.status === 'pendente'}
                    />

                    {sumarioSelecionado.status === 'pendente' && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={rejeitarSumario}>
                          <Ionicons name="close-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Rejeitar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={aceitarSumario}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Aceitar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={{ height: 16 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Solicitação Review Modal */}
      <Modal visible={!!selectedSolicitude} transparent animationType="slide" onRequestClose={() => setSelectedSolicitude(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { padding: 0, overflow: 'hidden' }]}>
            {solicitSelecionada && (() => {
              const sc = solicitSelecionada.status === 'aprovada' ? Colors.success : solicitSelecionada.status === 'rejeitada' ? Colors.danger : Colors.warning;
              const initials = solicitSelecionada.professorNome?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
              return (
                <>
                  <View style={[styles.reviewModalHead, { backgroundColor: Colors.warning + '14' }]}>
                    <TouchableOpacity onPress={() => { setSelectedSolicitude(null); setObservacao(''); }} style={styles.reviewModalClose}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.reviewAvatar, { backgroundColor: Colors.gold + '33', borderColor: Colors.gold + '55' }]}>
                      <Text style={[styles.reviewAvatarText, { color: Colors.gold }]}>{initials}</Text>
                    </View>
                    <Text style={styles.reviewModalName}>{solicitSelecionada.professorNome}</Text>
                    <View style={[styles.reviewStatusBadge, { backgroundColor: sc + '22', borderColor: sc + '44' }]}>
                      <MaterialCommunityIcons name="folder-open-outline" size={12} color={sc} />
                      <Text style={[styles.reviewStatusText, { color: sc }]}>Reabertura de Pauta</Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
                    <View style={styles.reviewInfoCard}>
                      <View style={styles.reviewInfoRow}>
                        <MaterialCommunityIcons name="book-open-outline" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{solicitSelecionada.disciplina}</Text>
                      </View>
                      <View style={[styles.reviewInfoRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                        <MaterialCommunityIcons name="google-classroom" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{solicitSelecionada.turmaNome}</Text>
                        <View style={styles.aulaChip}>
                          <Text style={styles.aulaChipText}>Trim. {solicitSelecionada.trimestre}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Motivo do Pedido</Text>
                    <View style={styles.conteudoBoxEnhanced}>
                      <MaterialCommunityIcons name="comment-text-outline" size={16} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={styles.conteudoText}>{solicitSelecionada.motivo}</Text>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Resposta / Observação</Text>
                    <TextInput
                      style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                      placeholder="Escreva uma resposta..."
                      placeholderTextColor={Colors.textMuted}
                      value={observacao}
                      onChangeText={setObservacao}
                      multiline
                      editable={solicitSelecionada.status === 'pendente'}
                    />

                    {solicitSelecionada.status === 'pendente' && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={rejeitarSolicitacao}>
                          <Ionicons name="close-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Rejeitar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={aprovarSolicitacao}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Aprovar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={{ height: 16 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Nova Prova Modal */}
      <Modal visible={showProvaForm} transparent animationType="slide" onRequestClose={() => { setShowProvaForm(false); resetProvaForm(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="calendar-plus" size={20} color={Colors.accent} />
                </View>
                <Text style={styles.modalTitle}>Agendar Prova</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowProvaForm(false); resetProvaForm(); }} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Tipo de Avaliação</Text>
              <View style={styles.tipoCardGrid}>
                {([
                  { id: 'teste', label: 'Teste', icon: 'clipboard-text-outline', custom: false },
                  { id: 'exame', label: 'Exame', icon: 'file-document-outline', custom: false },
                  { id: 'trabalho', label: 'Trabalho', icon: 'briefcase-outline', custom: false },
                  { id: 'prova_oral', label: 'Oral', icon: 'microphone-outline', custom: false },
                  ...customTipos.map(t => ({ id: t.id, label: t.label, icon: 'star-outline', custom: true })),
                ]).map(t => {
                  const color = tipoProvaColor[t.id] || Colors.info;
                  const isActive = provaTipo === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.tipoCard, isActive && { borderColor: color, backgroundColor: color + '18' }]}
                      onPress={() => setProvaTipo(t.id)}
                    >
                      {t.custom && (
                        <TouchableOpacity
                          style={{ position: 'absolute', top: 3, right: 3, zIndex: 10 }}
                          onPress={() => removerTipoCustom(t.id)}
                          hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                        >
                          <Ionicons name="close-circle" size={13} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                      <MaterialCommunityIcons name={t.icon as any} size={20} color={isActive ? color : Colors.textMuted} />
                      <Text style={[styles.tipoCardText, isActive && { color, fontWeight: '700' }]} numberOfLines={2}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                {/* Botão para adicionar tipo personalizado */}
                <TouchableOpacity
                  style={[styles.tipoCard, { borderStyle: 'dashed', borderColor: Colors.border }]}
                  onPress={() => setShowNewTipoForm(true)}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.textMuted} />
                  <Text style={[styles.tipoCardText, { fontSize: 10 }]}>Novo</Text>
                </TouchableOpacity>
              </View>

              {/* Formulário inline para novo tipo */}
              {showNewTipoForm && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Ex: Projecto, Debate..."
                    placeholderTextColor={Colors.textMuted}
                    value={newTipoLabel}
                    onChangeText={setNewTipoLabel}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={adicionarTipoCustom}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.accent, borderRadius: 8, padding: 10 }}
                    onPress={adicionarTipoCustom}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.surface, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.border }}
                    onPress={() => { setShowNewTipoForm(false); setNewTipoLabel(''); }}
                  >
                    <Ionicons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.fieldLabel}>Título<RequiredMark /></Text>
              <TextInput style={styles.input} placeholder="Ex: Teste do 1º Trimestre" placeholderTextColor={Colors.textMuted} value={provaTitulo} onChangeText={setProvaTitulo} returnKeyType="next" blurOnSubmit={false} />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Disciplina<RequiredMark /></Text>
              <TextInput style={styles.input} placeholder="Ex: Matemática" placeholderTextColor={Colors.textMuted} value={provaDisciplina} onChangeText={setProvaDisciplina} returnKeyType="next" blurOnSubmit={false} />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Data<RequiredMark /></Text>
                  <DateInput style={styles.input} value={provaData} onChangeText={setProvaData} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Hora</Text>
                  <TextInput style={styles.input} placeholder="08:00" placeholderTextColor={Colors.textMuted} value={provaHora} onChangeText={setProvaHora} returnKeyType="done" onSubmitEditing={publicarProva} />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Descrição</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} placeholder="Informações adicionais..." placeholderTextColor={Colors.textMuted} value={provaDesc} onChangeText={setProvaDesc} multiline />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Turmas</Text>
              <View style={styles.turmasGrid}>
                {turmas.map(t => {
                  const sel = provaTurmasIds.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.turmaBadge, sel && styles.turmaBadgeActive]}
                      onPress={() => setProvaTurmasIds(prev => sel ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                    >
                      {sel && <Ionicons name="checkmark" size={12} color={Colors.gold} />}
                      <Text style={[styles.turmaBadgeText, sel && styles.turmaBadgeTextActive]}>{t.nome}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={publicarProva}>
                <MaterialCommunityIcons name="calendar-check" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>{editingProva ? 'Actualizar' : 'Agendar Prova'}</Text>
              </TouchableOpacity>
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KPIChip({ label, value, color, icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <View style={[kpiStyles.chip, { borderColor: color + '50', borderTopWidth: 3, borderTopColor: color }]}>
      <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={[kpiStyles.value, { color }]}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
    </View>
  );
}

function BarStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={[barStyles.val, { color }]}>{value}</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ProfStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={profStyles.stat}>
      <Text style={[profStyles.statVal, { color }]}>{value}</Text>
      <Text style={profStyles.statLabel}>{label}</Text>
    </View>
  );
}

function PerfBlock({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={perfStyles.block}>
      <Text style={[perfStyles.val, { color }]}>{value}</Text>
      <Text style={perfStyles.label}>{label}</Text>
    </View>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const kpiStyles = StyleSheet.create({
  chip: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.surface, width: '31.5%', flexGrow: 1 },
  value: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  label: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});

const barStyles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  val: { fontSize: 14, fontWeight: '800' },
  track: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
});

const profStyles = StyleSheet.create({
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});

const perfStyles = StyleSheet.create({
  block: { alignItems: 'center', flex: 1, backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 10 },
  val: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  kpiScroll: { maxHeight: 120, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  kpiRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, gap: 6, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },

  tabScrollWrap: { position: 'relative' },
  tabScrollFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, pointerEvents: 'none' } as any,
  tabScroll: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 4 },
  tabActive: { backgroundColor: Colors.gold + '20' },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: Colors.gold, fontWeight: '700' },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14 },

  filterRow: { maxHeight: 44 },
  filterInner: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterBtnActive: { backgroundColor: Colors.gold + '22', borderWidth: 1, borderColor: Colors.gold },
  filterText: { fontSize: 12, color: Colors.textSecondary },
  filterTextActive: { color: Colors.gold, fontWeight: '700' },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: Colors.textSecondary },
  cardDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  cardConteudo: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tipoBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tipoText: { fontSize: 10, fontWeight: '700' },

  sectionCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  barGroup: {},

  profRankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rankBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rankNum: { fontSize: 13, fontWeight: '800' },
  profRankName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  profRankSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  profRankTotal: { fontSize: 14, fontWeight: '800' },

  quickItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  quickDot: { width: 8, height: 8, borderRadius: 4 },
  quickTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  quickSub: { fontSize: 11, color: Colors.textMuted },
  verMais: { marginTop: 8, fontSize: 12, color: Colors.gold, fontWeight: '600' },

  pautaQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pautaQuickItem: { width: '47.5%', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8, borderWidth: 1, borderColor: Colors.border },
  pautaQuickNum: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  pautaQuickLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },

  cargaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cargaNome: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cargaSub: { fontSize: 11, color: Colors.textMuted },
  cargaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  cargaBadgeText: { fontSize: 12, fontWeight: '700' },

  profCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  profAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  profAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.gold },
  profCardName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  profCardDis: { fontSize: 12, color: Colors.gold, marginTop: 2 },
  profCardSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  profCardStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  publishBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  publishText: { fontSize: 11, fontWeight: '600' },

  solicitBtn: { backgroundColor: Colors.info + '22', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  solicitBtnText: { fontSize: 10, color: Colors.info, fontWeight: '700' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  emptySmall: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', padding: 12 },

  fab: { position: 'absolute', bottom: 80, right: 20 },
  fabGrad: { height: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, elevation: 6, shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  closeBtn: { padding: 4 },

  reviewLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue: { fontSize: 14, color: Colors.text, fontWeight: '600' },

  conteudoBox: { backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border },
  conteudoText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  fieldLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 14, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: Colors.text, borderWidth: 1, borderColor: Colors.border, fontSize: 14 },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 13 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 13 },
  actionBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  profModalAvatar: { alignItems: 'center', paddingBottom: 16 },
  profAvatarLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  profAvatarLargeText: { fontSize: 26, fontWeight: '800', color: Colors.gold },
  profModalName: { fontSize: 18, fontWeight: '800', color: Colors.text },
  perfRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  sumMiniCard: { backgroundColor: Colors.surface, borderRadius: 8, padding: 10, marginBottom: 6 },
  sumMiniTitle: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  sumMiniSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  tipoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  tipoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  tipoBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  turmasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  turmaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  turmaBadgeActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  turmaBadgeText: { fontSize: 12, color: Colors.textMuted },
  turmaBadgeTextActive: { color: Colors.gold, fontWeight: '700' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Review modal — enhanced
  reviewModalHead: { paddingTop: 22, paddingBottom: 18, paddingHorizontal: 20, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, position: 'relative' },
  reviewModalClose: { position: 'absolute', top: 14, right: 14, padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  reviewAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 8 },
  reviewAvatarText: { fontSize: 20, fontWeight: '800', color: Colors.accent },
  reviewModalName: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  reviewStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  reviewStatusText: { fontSize: 12, fontWeight: '700' },
  reviewInfoCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 14 },
  reviewInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  reviewInfoText: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  reviewSectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  aulaChip: { backgroundColor: Colors.accent + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  aulaChipText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  conteudoBoxEnhanced: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 14 },

  // Tipo card grid (prova modal)
  tipoCardGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tipoCard: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 6, position: 'relative', minWidth: 60 },
  tipoCardText: { fontSize: 11, color: Colors.textMuted },
});
