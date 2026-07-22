import React, { useState, useEffect, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import {Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getRoleLabel } from '@/utils/genero';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { api } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import { StableSearchInput } from '@/components/StableSearchInput';
import { alertSucesso, alertErro } from '../../utils/toast';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import RequiredMark from '@/components/RequiredMark';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Avaliacao {
  id: string;
  professorId: string;
  periodoLetivo: string;
  avaliador: string;
  avaliadorId: string | null;
  notaPlaneamento: number;
  notaPontualidade: number;
  notaMetodologia: number;
  notaRelacaoAlunos: number;
  notaRelacaoColegas: number;
  notaResultados: number;
  notaDisciplina: number;
  notaDesenvolvimento: number;
  notaFinal: number;
  status: 'rascunho' | 'submetida' | 'aprovada';
  pontosFuertes: string;
  areasMelhoria: string;
  recomendacoes: string;
  avaliacaoEm: string | null;
  criadoEm: string;
  nome?: string;
  apelido?: string;
  numeroProfessor?: string;
  disciplinas?: string[];
}

interface Professor {
  id: string;
  nome: string;
  apelido: string;
  numeroProfessor: string;
  disciplinas: string[];
  ativo: boolean;
}

// ─── Criteria config ──────────────────────────────────────────────────────────
interface Criterio {
  key: keyof Avaliacao;
  label: string;
  desc: string;
  icon: string;
  color: string;
}

const CRITERIOS: Criterio[] = [
  { key: 'notaPlaneamento',     label: 'Planeamento de Aulas',      desc: 'Organização e preparação das aulas',              icon: 'document-text-outline',       color: '#4FC3F7' },
  { key: 'notaPontualidade',    label: 'Pontualidade & Assiduidade', desc: 'Cumprimento de horários e presença regular',      icon: 'time-outline',                color: '#81C784' },
  { key: 'notaMetodologia',     label: 'Metodologia de Ensino',     desc: 'Técnicas e estratégias pedagógicas usadas',       icon: 'bulb-outline',                color: '#FFB74D' },
  { key: 'notaRelacaoAlunos',   label: 'Relação com Alunos',        desc: 'Comunicação, apoio e motivação dos alunos',       icon: 'people-outline',              color: '#CE93D8' },
  { key: 'notaRelacaoColegas',  label: 'Relação com Colegas',       desc: 'Trabalho em equipa e colaboração institucional',  icon: 'hand-left-outline',           color: '#80DEEA' },
  { key: 'notaResultados',      label: 'Resultados Académicos',     desc: 'Aproveitamento e desempenho dos alunos',          icon: 'trending-up-outline',         color: '#A5D6A7' },
  { key: 'notaDisciplina',      label: 'Disciplina em Sala',        desc: 'Gestão e controlo da turma em aula',              icon: 'shield-checkmark-outline',    color: '#FFCC80' },
  { key: 'notaDesenvolvimento', label: 'Desenvolvimento Profissional', desc: 'Formação contínua e auto-aperfeiçoamento',     icon: 'school-outline',              color: '#EF9A9A' },
];

const NIVEIS = [
  { label: '—',             valor: 0, color: '#555' },
  { label: 'Insatisfatório', valor: 1, color: '#EF5350' },
  { label: 'Suficiente',    valor: 2, color: '#FF7043' },
  { label: 'Bom',           valor: 3, color: '#FFC107' },
  { label: 'Muito Bom',     valor: 4, color: '#66BB6A' },
  { label: 'Excelente',     valor: 5, color: '#42A5F5' },
];

const STATUS_CFG = {
  rascunho:  { label: 'Rascunho',  color: '#78909C', icon: 'pencil-outline' as const },
  submetida: { label: 'Submetida', color: '#FFC107', icon: 'send-outline' as const },
  aprovada:  { label: 'Aprovada',  color: '#66BB6A', icon: 'checkmark-circle-outline' as const },
};

const GLASS  = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.12)';

// ─── Critérios por perfil (contribuição distribuída) ──────────────────────────
const CRITERIOS_POR_PAPEL: Record<string, string[]> = {
  chefe_secretaria: ['notaPlaneamento','notaPontualidade','notaMetodologia','notaResultados','notaDisciplina','notaDesenvolvimento'],
  secretaria:       ['notaPlaneamento','notaPontualidade','notaMetodologia','notaResultados','notaDisciplina','notaDesenvolvimento'],
  rh:               ['notaPontualidade','notaRelacaoColegas'],
  aluno:            ['notaRelacaoAlunos'],
};
const PAPEIS_CONTRIB = Object.keys(CRITERIOS_POR_PAPEL);
const PAPEIS_APROVADOR = ['admin','ceo','pca','director','pedagogico','chefe_secretaria'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getNivelCfg(nota: number) {
  return NIVEIS[Math.round(nota)] ?? NIVEIS[0];
}

function NotaBadge({ nota }: { nota: number }) {
  const cfg = getNivelCfg(nota);
  if (nota === 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.color + '28', borderColor: cfg.color }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{nota.toFixed(1)} · {cfg.label}</Text>
    </View>
  );
}

function StarRow({ nota, onChange, color }: { nota: number; onChange?: (n: number) => void; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange && onChange(nota === n ? 0 : n)}
          disabled={!onChange}
          style={{ padding: 2 }}
        >
          <Ionicons
            name={n <= nota ? 'star' : 'star-outline'}
            size={20}
            color={n <= nota ? color : 'rgba(255,255,255,0.25)'}
          />
        </TouchableOpacity>
      ))}
      {nota > 0 && (
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
          {getNivelCfg(nota).label}
        </Text>
      )}
    </View>
  );
}

function RadarBar({ nota, color }: { nota: number; color: string }) {
  const pct = (nota / 5) * 100;
  return (
    <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, flex: 1, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function computeNotaFinal(form: Record<string, number>): number {
  const vals = CRITERIOS.map(c => form[c.key as string] ?? 0).filter(v => v > 0);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function getNotaColor(nota: number) {
  if (nota >= 4.5) return '#42A5F5';
  if (nota >= 3.5) return '#66BB6A';
  if (nota >= 2.5) return '#FFC107';
  if (nota >= 1.5) return '#FF7043';
  return '#EF5350';
}

// ─── Router — despacha para a vista correta por perfil ────────────────────────
export default function AvaliacaoProfessoresScreen() {
  const { user } = useAuth();
  const router = useRouter();
  // chefe_secretaria é avaliador E responsável pela aprovação → vista completa de gestão
  const isParcialOnly = user?.role && PAPEIS_CONTRIB.includes(user.role) && user.role !== 'chefe_secretaria';
  if (isParcialOnly) {
    return <AvaliacaoParcialScreen onBack={() => router.back()} />;
  }
  return <AvaliacaoProfessoresMain />;
}

// ─── Vista de gestão completa (admin / director / CEO / pedagogico) ────────────
function AvaliacaoProfessoresMain() {
  const { user } = useAuth();
  const router = useRouter();

  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todas' | 'rascunho' | 'submetida' | 'aprovada'>('todas');
  const [selectedPeriodo, setSelectedPeriodo] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [viewModal, setViewModal] = useState<Avaliacao | null>(null);
  const [editing, setEditing]   = useState<Avaliacao | null>(null);
  const [showProfSearch, setShowProfSearch] = useState(false);
  const [profSearch, setProfSearch] = useState('');
  const [modalError, setModalError] = useState('');

  const emptyForm = useCallback(() => ({
    professorId: '', profNome: '', periodoLetivo: anoLetivoDe(),
    avaliador: user?.nome ?? '',
    notaPlaneamento: 0, notaPontualidade: 0, notaMetodologia: 0,
    notaRelacaoAlunos: 0, notaRelacaoColegas: 0, notaResultados: 0,
    notaDisciplina: 0, notaDesenvolvimento: 0,
    status: 'rascunho' as 'rascunho' | 'submetida' | 'aprovada',
    pontosFuertes: '', areasMelhoria: '', recomendacoes: '',
  }), [user]);

  const [form, setForm] = useState(emptyForm());

  const loadData = useCallback(async () => {
    try {
      const [avData, profData] = await Promise.all([
        api.get<Avaliacao[]>('/api/avaliacoes-professores'),
        api.get<Professor[]>('/api/professores'),
      ]);
      setAvaliacoes(avData);
      setProfessores(profData.filter(p => p.ativo));
    } catch {
      alertErro('Erro ao carregar dados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Computed ─────────────────────────────────────────────────────────────
  const aprovadas  = avaliacoes.filter(a => a.status === 'aprovada');
  const mediaGeral = aprovadas.length > 0
    ? Math.round((aprovadas.reduce((s, a) => s + (a.notaFinal ?? 0), 0) / aprovadas.length) * 100) / 100
    : 0;
  const pendentes  = avaliacoes.filter(a => a.status !== 'aprovada').length;
  const periodos   = [...new Set(avaliacoes.map(a => a.periodoLetivo))].sort().reverse();

  const filtered = avaliacoes.filter(a => {
    const matchSearch = `${a.nome ?? ''} ${a.apelido ?? ''} ${a.numeroProfessor ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'todas' || a.status === filterStatus;
    const matchPeriodo = !selectedPeriodo || a.periodoLetivo === selectedPeriodo;
    return matchSearch && matchStatus && matchPeriodo;
  });

  const profsFiltrados = professores
    .filter(p => `${p.nome} ${p.apelido} ${p.numeroProfessor}`.toLowerCase().includes(profSearch.toLowerCase()))
    .slice(0, 10);

  const setF = (k: string, v: unknown) => { setModalError(''); setForm(f => ({ ...f, [k]: v })); };

  // ─── Actions ──────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalError('');
    setShowModal(true);
  };

  const openEdit = (av: Avaliacao) => {
    setEditing(av);
    setModalError('');
    setForm({
      professorId: av.professorId,
      profNome: `${av.nome ?? ''} ${av.apelido ?? ''}`.trim(),
      periodoLetivo: av.periodoLetivo,
      avaliador: av.avaliador,
      notaPlaneamento: av.notaPlaneamento ?? 0,
      notaPontualidade: av.notaPontualidade ?? 0,
      notaMetodologia: av.notaMetodologia ?? 0,
      notaRelacaoAlunos: av.notaRelacaoAlunos ?? 0,
      notaRelacaoColegas: av.notaRelacaoColegas ?? 0,
      notaResultados: av.notaResultados ?? 0,
      notaDisciplina: av.notaDisciplina ?? 0,
      notaDesenvolvimento: av.notaDesenvolvimento ?? 0,
      status: av.status,
      pontosFuertes: av.pontosFuertes ?? '',
      areasMelhoria: av.areasMelhoria ?? '',
      recomendacoes: av.recomendacoes ?? '',
    });
    setShowModal(true);
  };

  const guardar = async (statusOverride?: 'rascunho' | 'submetida' | 'aprovada') => {
    setModalError('');
    if (!form.professorId)  { setModalError('Selecione um professor.'); return; }
    if (!form.periodoLetivo) { setModalError('Indique o período lectivo.'); return; }

    const targetStatus = statusOverride ?? form.status;
    if (targetStatus !== 'rascunho') {
      const notasPreenchidas = CRITERIOS.filter(c => ((form as unknown as Record<string, number>)[c.key as string] ?? 0) > 0).length;
      if (notasPreenchidas === 0) {
        setModalError('Preencha pelo menos um critério de avaliação (estrelas) antes de submeter ou aprovar.');
        return;
      }
    }

    const payload = {
      professorId: form.professorId,
      periodoLetivo: form.periodoLetivo,
      avaliador: form.avaliador,
      avaliadorId: user?.id ?? null,
      ...Object.fromEntries(CRITERIOS.map(c => [c.key, (form as unknown as Record<string, number>)[c.key as string] ?? 0])),
      status: statusOverride ?? form.status,
      pontosFuertes: form.pontosFuertes,
      areasMelhoria: form.areasMelhoria,
      recomendacoes: form.recomendacoes,
    };

    try {
      if (editing) {
        await api.put(`/api/avaliacoes-professores/${editing.id}`, payload);
        alertSucesso('Avaliação actualizada');
      } else {
        await api.post('/api/avaliacoes-professores', payload);
        alertSucesso('Avaliação criada');
      }
      setShowModal(false);
      loadData();
    } catch (e: unknown) {
      const msg = (e as Error).message || 'Erro desconhecido';
      setModalError(`Erro ao guardar: ${msg}`);
    }
  };

  useEnterToSave(guardar, showModal);

  const eliminar = (av: Avaliacao) => {
    webAlert('Eliminar Avaliação', `Eliminar avaliação de ${av.nome} ${av.apelido} (${av.periodoLetivo})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/avaliacoes-professores/${av.id}`);
          alertSucesso('Avaliação eliminada');
          loadData();
        } catch { alertErro('Erro ao eliminar'); }
      }},
    ]);
  };

  const agregarContribuicoes = async (av: Avaliacao) => {
    webAlert('Agregar Contribuições', `Agregar todas as avaliações parciais de ${av.nome} ${av.apelido} (${av.periodoLetivo}) e calcular a nota final?\n\nA nota de cada critério é a média de todos os avaliadores que contribuíram (incluindo todos os alunos individualmente).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Agregar', onPress: async () => {
        try {
          const resultado = await api.post<{ notaFinal: number; contagens: Record<string, number> }>(
            '/api/avaliacoes-parciais/agregar',
            { professorId: av.professorId, periodoLetivo: av.periodoLetivo }
          );
          const alunosContrib = resultado.contagens?.notaRelacaoAlunos ?? 0;
          const msg = alunosContrib > 0
            ? `Nota final: ${resultado.notaFinal.toFixed(1)} — ${alunosContrib} aluno(s) contribuíram para "Relação com Alunos"`
            : `Nota final: ${resultado.notaFinal.toFixed(1)} — contribuições calculadas`;
          alertSucesso(msg);
          loadData();
        } catch (e: unknown) { alertErro((e as Error).message || 'Erro ao agregar'); }
      }},
    ]);
  };

  const aprovar = async (av: Avaliacao) => {
    if (av.notaFinal <= 0) {
      alertErro('A nota final é 0. Agrega primeiro as contribuições antes de aprovar.');
      return;
    }
    webAlert('Aprovar Avaliação', `Aprovar a avaliação de ${av.nome} ${av.apelido} (${av.periodoLetivo}) com nota final ${av.notaFinal.toFixed(1)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprovar', onPress: async () => {
        try {
          await api.post(`/api/avaliacoes-professores/${av.id}/aprovar`, {});
          alertSucesso('Avaliação aprovada com sucesso!');
          setViewModal(null);
          loadData();
        } catch (e: unknown) { alertErro((e as Error).message || 'Erro ao aprovar'); }
      }},
    ]);
  };

  const canApprove = PAPEIS_APROVADOR.includes(user?.role ?? '');

  const notaFinalPreviewed = computeNotaFinal(form as unknown as Record<string, number>);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.root}>
        <Header onBack={() => router.back()} onAdd={openNew} />
        <View style={{ padding: 12, width: '100%' }}>
          <SkeletonList rows={6} withAvatar />
          <Text style={styles.loadingText}>A carregar...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header onBack={() => router.back()} onAdd={openNew} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primary} />}
      >
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpi, { borderLeftColor: '#42A5F5' }]}>
            <MaterialCommunityIcons name="account-check-outline" size={20} color="#42A5F5" />
            <Text style={styles.kpiLabel}>Avaliados</Text>
            <Text style={[styles.kpiVal, { color: '#42A5F5' }]}>{aprovadas.length}</Text>
            <Text style={styles.kpiSub}>aprovadas</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#FFC107' }]}>
            <MaterialCommunityIcons name="star-circle-outline" size={20} color="#FFC107" />
            <Text style={styles.kpiLabel}>Média Geral</Text>
            <Text style={[styles.kpiVal, { color: '#FFC107' }]}>{mediaGeral > 0 ? mediaGeral.toFixed(1) : '—'}</Text>
            <Text style={styles.kpiSub}>em 5 pontos</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#EF5350' }]}>
            <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#EF5350" />
            <Text style={styles.kpiLabel}>Pendentes</Text>
            <Text style={[styles.kpiVal, { color: '#EF5350' }]}>{pendentes}</Text>
            <Text style={styles.kpiSub}>por aprovar</Text>
          </View>
        </View>

        {/* Período filter */}
        {periodos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
              <TouchableOpacity
                style={[styles.periodoChip, !selectedPeriodo && styles.periodoChipActive]}
                onPress={() => setSelectedPeriodo('')}
              >
                <Text style={[styles.periodoChipText, !selectedPeriodo && styles.periodoChipTextActive]}>Todos</Text>
              </TouchableOpacity>
              {periodos.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodoChip, selectedPeriodo === p && styles.periodoChipActive]}
                  onPress={() => setSelectedPeriodo(p)}
                >
                  <Text style={[styles.periodoChipText, selectedPeriodo === p && styles.periodoChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Search + Status filter */}
        <View style={styles.searchRow}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar professor..."
            iconSize={18}
            iconColor="#aaa"
          />
        </View>
        <View style={styles.filterRow}>
          {(['todas','rascunho','submetida','aprovada'] as const).map(k => (
            <TouchableOpacity
              key={k}
              style={[styles.filterChip, filterStatus === k && styles.filterChipActive]}
              onPress={() => setFilterStatus(k)}
            >
              <Text style={[styles.filterChipText, filterStatus === k && styles.filterChipTextActive]}>
                {k === 'todas' ? 'Todas' : STATUS_CFG[k].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        {filtered.length === 0 ? (
          <View style={[styles.card, styles.empty]}>
            <MaterialCommunityIcons name="account-star-outline" size={48} color="#aaa" />
            <Text style={styles.emptyText}>
              {search ? 'Nenhuma avaliação encontrada' : 'Nenhuma avaliação registada'}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
                <Text style={styles.emptyBtnText}>Iniciar primeira avaliação</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            {filtered.map((av, idx) => {
              const stCfg = STATUS_CFG[av.status] ?? STATUS_CFG.rascunho;
              const nc = getNotaColor(av.notaFinal ?? 0);
              return (
                <TouchableOpacity
                  key={av.id}
                  style={[styles.row, idx === filtered.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => setViewModal(av)}
                  activeOpacity={0.7}
                >
                  {/* Score circle */}
                  <View style={[styles.scoreCircle, { borderColor: nc }]}>
                    <Text style={[styles.scoreVal, { color: nc }]}>
                      {av.notaFinal > 0 ? av.notaFinal.toFixed(1) : '—'}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowName}>{av.nome} {av.apelido}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={styles.rowSub}>{av.numeroProfessor} · {av.periodoLetivo}</Text>
                      <View style={[styles.badge, { backgroundColor: stCfg.color + '28', borderColor: stCfg.color }]}>
                        <Ionicons name={stCfg.icon} size={10} color={stCfg.color} />
                        <Text style={[styles.badgeText, { color: stCfg.color }]}> {stCfg.label}</Text>
                      </View>
                    </View>
                    {/* mini bars for each criterion */}
                    {CRITERIOS.every(c => ((av[c.key] as number) ?? 0) === 0) ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: 'rgba(255,193,7,0.1)', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                        <Ionicons name="warning-outline" size={12} color="#FFC107" />
                        <Text style={{ color: '#FFC107', fontSize: 10 }}>Pontuações não preenchidas — editar para corrigir</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 3, marginTop: 4 }}>
                        {CRITERIOS.slice(0, 4).map(c => (
                          <View key={c.key as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, width: 90 }}>{c.label.slice(0, 18)}</Text>
                            <RadarBar nota={(av[c.key] as number) ?? 0} color={c.color} />
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, width: 16, textAlign: 'right' }}>
                              {((av[c.key] as number) ?? 0) > 0 ? (av[c.key] as number).toFixed(0) : '—'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.rowMeta}>Avaliado por {av.avaliador}</Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.rowActions}>
                    {canApprove && av.status !== 'aprovada' && (
                      <TouchableOpacity style={styles.actionIcon} onPress={() => agregarContribuicoes(av)}>
                        <Ionicons name="git-merge-outline" size={18} color="#FFC107" />
                      </TouchableOpacity>
                    )}
                    {canApprove && av.status !== 'aprovada' && (
                      <TouchableOpacity style={styles.actionIcon} onPress={() => aprovar(av)}>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#66BB6A" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.actionIcon} onPress={() => openEdit(av)}>
                      <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionIcon} onPress={() => eliminar(av)}>
                      <Ionicons name="trash-outline" size={18} color="#EF5350" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Modal: Edição / Nova avaliação ──────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); setModalError(''); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{editing ? 'Editar Avaliação' : 'Nova Avaliação'}</Text>
              <Text style={styles.modalSub}>Qualidade pedagógica — escala 1 a 5</Text>

              {/* Professor */}
              {!editing ? (
                <>
                  <Text style={styles.fieldLabel}>Professor<RequiredMark /></Text>
                  <TouchableOpacity style={styles.selector} onPress={() => setShowProfSearch(true)}>
                    <Ionicons name="person-outline" size={18} color="#aaa" />
                    <Text style={form.professorId ? styles.selectorText : styles.selectorPlaceholder}>
                      {form.professorId ? form.profNome : 'Selecionar professor...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#aaa" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Professor</Text>
                  <View style={[styles.selector, { opacity: 0.6 }]}>
                    <Ionicons name="person-outline" size={18} color="#aaa" />
                    <Text style={styles.selectorText}>{form.profNome}</Text>
                  </View>
                </>
              )}

              {/* Período & Avaliador */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Período Lectivo<RequiredMark /></Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.periodoLetivo}
                    onChangeText={v => setF('periodoLetivo', v)}
                    placeholder="Ex: 2025 ou 2025-1S"
                    placeholderTextColor="#aaa"
                    returnKeyType="next"
                    blurOnSubmit={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Avaliador</Text>
                  <TextInput
                    style={styles.textInput}
                    value={form.avaliador}
                    onChangeText={v => setF('avaliador', v)}
                    placeholder="Nome"
                    placeholderTextColor="#aaa"
                    returnKeyType="done"
                    onSubmitEditing={() => guardar()}
                  />
                </View>
              </View>

              {/* ── Critérios ─────────────────────────────────────────────── */}
              <Text style={[styles.fieldLabel, { marginTop: 16, fontSize: 13, color: '#fff' }]}>
                Critérios de Avaliação Pedagógica
              </Text>

              {CRITERIOS.map(c => {
                const nota = (form as unknown as Record<string, number>)[c.key as string] ?? 0;
                return (
                  <View key={c.key as string} style={styles.criterioRow}>
                    <View style={[styles.criterioIcon, { backgroundColor: c.color + '22' }]}>
                      <Ionicons name={c.icon as never} size={16} color={c.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.criterioLabel}>{c.label}</Text>
                      <Text style={styles.criterioDesc}>{c.desc}</Text>
                      <View style={{ marginTop: 6 }}>
                        <StarRow nota={nota} color={c.color} onChange={n => setF(c.key as string, n)} />
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Nota final preview */}
              {notaFinalPreviewed > 0 && (
                <View style={styles.notaFinalBox}>
                  <Text style={styles.notaFinalLabel}>Nota Final (média)</Text>
                  <Text style={[styles.notaFinalVal, { color: getNotaColor(notaFinalPreviewed) }]}>
                    {notaFinalPreviewed.toFixed(2)} / 5
                  </Text>
                  <Text style={[styles.notaFinalNivel, { color: getNotaColor(notaFinalPreviewed) }]}>
                    {getNivelCfg(Math.round(notaFinalPreviewed)).label}
                  </Text>
                </View>
              )}

              {/* Comentários qualitativos */}
              <Text style={[styles.fieldLabel, { marginTop: 16, fontSize: 13, color: '#fff' }]}>Comentários</Text>

              <Text style={styles.fieldLabel}>Pontos Fortes</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={form.pontosFuertes}
                onChangeText={v => setF('pontosFuertes', v)}
                placeholder="O que o professor faz bem..."
                placeholderTextColor="#aaa"
                multiline
              />

              <Text style={styles.fieldLabel}>Áreas de Melhoria</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={form.areasMelhoria}
                onChangeText={v => setF('areasMelhoria', v)}
                placeholder="Onde pode melhorar..."
                placeholderTextColor="#aaa"
                multiline
              />

              <Text style={styles.fieldLabel}>Recomendações</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={form.recomendacoes}
                onChangeText={v => setF('recomendacoes', v)}
                placeholder="Sugestões para o professor..."
                placeholderTextColor="#aaa"
                multiline
              />

              {/* Status */}
              <Text style={styles.fieldLabel}>Estado</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['rascunho', 'submetida', 'aprovada'] as const).map(s => {
                  const cfg = STATUS_CFG[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusChip, form.status === s && { backgroundColor: cfg.color + '33', borderColor: cfg.color }]}
                      onPress={() => setF('status', s)}
                    >
                      <Ionicons name={cfg.icon} size={13} color={form.status === s ? cfg.color : '#aaa'} />
                      <Text style={[styles.statusChipText, form.status === s && { color: cfg.color }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Inline error */}
              {!!modalError && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(239,83,80,0.15)', borderWidth: 1, borderColor: '#EF5350', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#EF5350" style={{ marginTop: 1 }} />
                  <Text style={{ color: '#EF5350', fontSize: 13, flex: 1, lineHeight: 18 }}>{modalError}</Text>
                </View>
              )}

              {/* Buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowModal(false); setModalError(''); }}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { flex: 1.2 }]} onPress={() => guardar()}>
                  <Text style={styles.saveBtnText}>{editing ? 'Actualizar' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
              {form.status !== 'aprovada' && (
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#66BB6A', marginTop: 8 }]}
                  onPress={() => guardar('aprovada')}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}> Aprovar Avaliação</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Visualização detalhada ──────────────────────────────────── */}
      <Modal visible={!!viewModal} transparent animationType="fade" onRequestClose={() => setViewModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {viewModal && (
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
              <View style={styles.modalBox}>
                {/* Header */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={[styles.scoreCircleLg, { borderColor: getNotaColor(viewModal.notaFinal ?? 0) }]}>
                    <Text style={[styles.scoreValLg, { color: getNotaColor(viewModal.notaFinal ?? 0) }]}>
                      {viewModal.notaFinal > 0 ? viewModal.notaFinal.toFixed(2) : '—'}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>/ 5</Text>
                  </View>
                  <Text style={[styles.modalTitle, { marginTop: 10 }]}>{viewModal.nome} {viewModal.apelido}</Text>
                  <Text style={styles.modalSub}>{viewModal.numeroProfessor} · {viewModal.periodoLetivo}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <NotaBadge nota={viewModal.notaFinal ?? 0} />
                    {(() => {
                      const cfg = STATUS_CFG[viewModal.status] ?? STATUS_CFG.rascunho;
                      return (
                        <View style={[styles.badge, { backgroundColor: cfg.color + '28', borderColor: cfg.color }]}>
                          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>

                {/* Radar por critério */}
                <Text style={[styles.sectionTitle, { paddingHorizontal: 0 }]}>Critérios Pedagógicos</Text>
                {CRITERIOS.map(c => {
                  const nota = (viewModal[c.key] as number) ?? 0;
                  return (
                    <View key={c.key as string} style={styles.viewCriterioRow}>
                      <View style={[styles.criterioIcon, { backgroundColor: c.color + '22' }]}>
                        <Ionicons name={c.icon as never} size={15} color={c.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.criterioLabel}>{c.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                          <RadarBar nota={nota} color={c.color} />
                          <Text style={{ color: c.color, fontSize: 12, fontWeight: '700', width: 24 }}>
                            {nota > 0 ? nota.toFixed(1) : '—'}
                          </Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
                          {nota > 0 ? getNivelCfg(Math.round(nota)).label : 'Não avaliado'}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* Comentários */}
                {viewModal.pontosFuertes ? (
                  <View style={styles.commentBox}>
                    <Text style={[styles.commentTitle, { color: '#66BB6A' }]}>Pontos Fortes</Text>
                    <Text style={styles.commentText}>{viewModal.pontosFuertes}</Text>
                  </View>
                ) : null}
                {viewModal.areasMelhoria ? (
                  <View style={styles.commentBox}>
                    <Text style={[styles.commentTitle, { color: '#FFC107' }]}>Áreas de Melhoria</Text>
                    <Text style={styles.commentText}>{viewModal.areasMelhoria}</Text>
                  </View>
                ) : null}
                {viewModal.recomendacoes ? (
                  <View style={styles.commentBox}>
                    <Text style={[styles.commentTitle, { color: '#42A5F5' }]}>Recomendações</Text>
                    <Text style={styles.commentText}>{viewModal.recomendacoes}</Text>
                  </View>
                ) : null}

                {/* Incidentes em pautas (atrasos + lançamentos administrativos) */}
                <IncidentesProfessor professorId={viewModal.professorId} />

                <Text style={[styles.rowMeta, { marginTop: 8 }]}>
                  Avaliado por {viewModal.avaliador}{viewModal.avaliacaoEm ? ` em ${new Date(viewModal.avaliacaoEm).toLocaleDateString('pt-AO')}` : ''}
                </Text>

                {canApprove && viewModal.status !== 'aprovada' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#37474F', borderWidth: 1, borderColor: '#FFC107', flex: 1 }]}
                      onPress={() => agregarContribuicoes(viewModal)}
                    >
                      <Ionicons name="git-merge-outline" size={14} color="#FFC107" />
                      <Text style={[styles.saveBtnText, { color: '#FFC107' }]}> Agregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: '#2E7D32', flex: 1 }]}
                      onPress={() => aprovar(viewModal)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                      <Text style={styles.saveBtnText}> Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setViewModal(null)}>
                    <Text style={styles.cancelBtnText}>Fechar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => { setViewModal(null); openEdit(viewModal); }}>
                    <Text style={styles.saveBtnText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Pesquisa de professor ───────────────────────────────────── */}
      <Modal visible={showProfSearch} transparent animationType="fade" onRequestClose={() => setShowProfSearch(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: 480 }]}>
            <Text style={styles.modalTitle}>Selecionar Professor</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#aaa" />
              <TextInput
                style={styles.searchInput}
                placeholder="Nome ou nº de professor..."
                placeholderTextColor="#aaa"
                value={profSearch}
                onChangeText={setProfSearch}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {profsFiltrados.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.optionRow}
                  onPress={() => {
                    setF('professorId', p.id);
                    setF('profNome', `${p.nome} ${p.apelido}`);
                    setShowProfSearch(false);
                    setProfSearch('');
                  }}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name="person" size={16} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.optionName}>{p.nome} {p.apelido}</Text>
                    <Text style={styles.optionMeta}>{p.numeroProfessor} · {Array.isArray(p.disciplinas) ? p.disciplinas.slice(0, 2).join(', ') : ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {profsFiltrados.length === 0 && (
                <Text style={styles.emptyText}>Nenhum professor encontrado</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowProfSearch(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Avaliação Parcial — vista para secretaria / RH / aluno ──────────────────
interface ParcialEntry {
  professorId: string;
  periodoLetivo: string;
  criterio: string;
  nota: number;
  avaliadorNome?: string;
  atualizadoEm?: string;
  nome?: string;
  apelido?: string;
  numeroProfessor?: string;
}

function AvaliacaoParcialScreen({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { config } = useConfig();
  const role = user?.role ?? '';
  const meusCriterios = CRITERIOS_POR_PAPEL[role] ?? [];

  const [professores, setProfessores] = useState<Professor[]>([]);
  const [minhasEntradas, setMinhasEntradas] = useState<ParcialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalProf, setModalProf] = useState<Professor | null>(null);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [search, setSearch] = useState('');

  const periodoLabel = config.avaliacaoPeriodoLabel ?? 'Avaliação de Professores';
  const periodoAberto = config.avaliacaoPeriodoAtivo;

  const loadData = useCallback(async () => {
    try {
      const [profData, parcData] = await Promise.all([
        api.get<Professor[]>('/api/professores'),
        api.get<ParcialEntry[]>('/api/avaliacoes-parciais/meu'),
      ]);
      setProfessores(profData.filter(p => p.ativo));
      setMinhasEntradas(parcData);
    } catch {
      alertErro('Erro ao carregar dados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openModal = (prof: Professor) => {
    const entradas = minhasEntradas.filter(e => e.professorId === prof.id);
    const notasIniciais: Record<string, number> = {};
    for (const c of meusCriterios) {
      const entrada = entradas.find(e => e.criterio === c);
      notasIniciais[c] = entrada?.nota ?? 0;
    }
    setNotas(notasIniciais);
    setModalError('');
    setModalProf(prof);
  };

  const submeter = async () => {
    if (!modalProf) return;
    if (!periodoAberto) { setModalError('O período de avaliação está fechado.'); return; }
    const algumaCriterio = Object.values(notas).some(v => v > 0);
    if (!algumaCriterio) { setModalError('Atribua pelo menos uma nota antes de submeter.'); return; }

    setSaving(true);
    try {
      const periodoLetivo = anoLetivoDe();
      await api.post('/api/avaliacoes-parciais', {
        professorId: modalProf.id,
        periodoLetivo,
        criterios: notas,
      });
      alertSucesso('Avaliação guardada com sucesso!');
      setModalProf(null);
      loadData();
    } catch (e: unknown) {
      setModalError((e as Error).message || 'Erro ao guardar avaliação');
    } finally {
      setSaving(false);
    }
  };

  const profsFiltrados = professores.filter(p =>
    `${p.nome} ${p.apelido} ${p.numeroProfessor}`.toLowerCase().includes(search.toLowerCase())
  );

  const myRoleLabel = getRoleLabel(role, user?.genero);

  const criteriosCfg = CRITERIOS.filter(c => meusCriterios.includes(c.key as string));

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Avaliação de Professores</Text>
        </View>
        <View style={{ padding: 12 }}><SkeletonList rows={5} /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Avaliação de Professores</Text>
          <Text style={styles.headerSub}>{myRoleLabel} · avaliação dos critérios atribuídos</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primary} />}
      >
        {/* Banner estado do período */}
        <View style={[styles.card, {
          backgroundColor: periodoAberto ? '#1B5E20' : '#37474F',
          borderColor: periodoAberto ? '#66BB6A' : '#78909C',
          borderWidth: 1,
          flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
        }]}>
          <MaterialCommunityIcons
            name={periodoAberto ? 'lock-open-outline' : 'lock-outline'}
            size={24}
            color={periodoAberto ? '#66BB6A' : '#78909C'}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
              {periodoAberto ? `Período Aberto — ${periodoLabel}` : 'Período de Avaliação Fechado'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 }}>
              {periodoAberto
                ? 'Pode submeter ou actualizar as suas avaliações.'
                : 'Aguarde a abertura pelo administrador para submeter avaliações.'}
            </Text>
          </View>
        </View>

        {/* Info critérios do perfil */}
        <View style={[styles.card, { marginBottom: 12 }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
            Os seus critérios de avaliação ({meusCriterios.length})
          </Text>
          {criteriosCfg.map(c => (
            <View key={c.key as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name={c.icon as any} size={14} color={c.color} />
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Barra de pesquisa */}
        <View style={styles.searchBar}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar professor..."
            iconColor={Colors.textMuted}
          />
        </View>

        {/* Lista de professores */}
        {profsFiltrados.map(prof => {
          const minhas = minhasEntradas.filter(e => e.professorId === prof.id);
          const totalCriterios = meusCriterios.length;
          const preenchidos = minhas.filter(e => Number(e.nota) > 0).length;
          const concluido = preenchidos === totalCriterios;
          return (
            <TouchableOpacity
              key={prof.id}
              style={[styles.card, { marginBottom: 8 }]}
              onPress={() => openModal(prof)}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    {prof.nome} {prof.apelido}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11 }}>Nº {prof.numeroProfessor}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.badge, {
                    backgroundColor: concluido ? '#1B5E2066' : preenchidos > 0 ? '#E65100' + '44' : 'rgba(255,255,255,0.1)',
                    borderColor: concluido ? '#66BB6A' : preenchidos > 0 ? '#FF7043' : 'rgba(255,255,255,0.2)',
                  }]}>
                    <Text style={[styles.badgeText, {
                      color: concluido ? '#66BB6A' : preenchidos > 0 ? '#FF7043' : Colors.textMuted,
                    }]}>
                      {concluido ? '✓ Completo' : `${preenchidos}/${totalCriterios} critérios`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </View>
              </View>
              {/* Barra de progresso */}
              <View style={{ marginTop: 8, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{
                  width: `${totalCriterios > 0 ? (preenchidos / totalCriterios) * 100 : 0}%`,
                  height: '100%',
                  backgroundColor: concluido ? '#66BB6A' : '#FF7043',
                  borderRadius: 2,
                }} />
              </View>
            </TouchableOpacity>
          );
        })}
        {profsFiltrados.length === 0 && (
          <Text style={styles.emptyText}>Nenhum professor encontrado.</Text>
        )}
      </ScrollView>

      {/* Modal de avaliação do professor */}
      {modalProf && (
        <Modal visible animationType="slide" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: '90%' }]}>
              <ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={styles.modalTitle}>{modalProf.nome} {modalProf.apelido}</Text>
                  <TouchableOpacity onPress={() => setModalProf(null)}>
                    <Ionicons name="close" size={24} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {!periodoAberto && (
                  <View style={{ backgroundColor: '#37474F', borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Ionicons name="lock-closed-outline" size={16} color="#78909C" />
                    <Text style={{ color: '#78909C', fontSize: 12, flex: 1 }}>
                      O período de avaliação está fechado. Pode visualizar as suas notas mas não pode alterar.
                    </Text>
                  </View>
                )}

                {modalError !== '' && (
                  <View style={{ backgroundColor: '#B71C1C22', borderColor: Colors.danger, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                    <Text style={{ color: Colors.danger, fontSize: 12, flex: 1 }}>{modalError}</Text>
                  </View>
                )}

                {criteriosCfg.map(c => (
                  <View key={c.key as string} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Ionicons name={c.icon as any} size={16} color={c.color} />
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{c.label}</Text>
                    </View>
                    <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 8 }}>{c.desc}</Text>
                    <StarRow
                      nota={notas[c.key as string] ?? 0}
                      onChange={periodoAberto ? (n) => {
                        setModalError('');
                        setNotas(prev => ({ ...prev, [c.key as string]: n }));
                      } : undefined}
                      color={c.color}
                    />
                  </View>
                ))}

                {periodoAberto && (
                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={submeter}
                    disabled={saving}
                  >
                    {saving ? <AppLoader size="small" color="#fff" /> : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>Guardar Avaliação</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      )}
    </View>
  );
}

// ─── Header component ─────────────────────────────────────────────────────────
function Header({ onBack, onAdd }: { onBack: () => void; onAdd: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headerTitle}>Avaliação de Professores</Text>
        <Text style={styles.headerSub}>Qualidade pedagógica · pela Direcção</Text>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addBtnTxt}>Nova Avaliação</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// ─── Componente: Incidentes em Pautas (atrasos + lançamentos administrativos) ───
function IncidentesProfessor({ professorId }: { professorId: string }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.get<any[]>(`/api/incidentes-pauta?professorId=${encodeURIComponent(professorId)}`);
        if (!cancel) setItems(r);
      } catch {
        if (!cancel) setItems([]);
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [professorId]);

  if (loading) {
    return (
      <View style={incStyles.box}>
        <Text style={incStyles.title}>📋 Incidentes em Pautas</Text>
        <AppLoader size="small" color={Colors.primary} style={{ marginTop: 6 }} />
      </View>
    );
  }
  const atrasos = (items || []).filter(i => i.tipo === 'atraso');
  const lancAdmin = (items || []).filter(i => i.tipo === 'lancamento_admin');
  if ((items || []).length === 0) {
    return (
      <View style={[incStyles.box, { borderColor: '#2E7D32' + '55', backgroundColor: '#2E7D32' + '11' }]}>
        <Text style={[incStyles.title, { color: '#66BB6A' }]}>✓ Sem incidentes em pautas</Text>
        <Text style={incStyles.empty}>Este professor não tem atrasos nem lançamentos administrativos registados.</Text>
      </View>
    );
  }
  const sugestao = lancAdmin.length > 0
    ? `Sugere-se reduzir as notas de Pontualidade e Planeamento. ${lancAdmin.length} lançamento(s) administrativo(s) registado(s).`
    : `Sugere-se reduzir a nota de Pontualidade. ${atrasos.length} atraso(s) registado(s).`;
  return (
    <View style={[incStyles.box, { borderColor: '#FFC107' + '55', backgroundColor: '#FFC107' + '11' }]}>
      <Text style={[incStyles.title, { color: '#FFC107' }]}>📋 Incidentes em Pautas ({(items || []).length})</Text>
      <View style={incStyles.statRow}>
        {atrasos.length > 0 && (
          <View style={incStyles.statChip}>
            <Ionicons name="alert-circle" size={12} color="#EF5350" />
            <Text style={[incStyles.statText, { color: '#EF5350' }]}>{atrasos.length} atraso(s)</Text>
          </View>
        )}
        {lancAdmin.length > 0 && (
          <View style={incStyles.statChip}>
            <Ionicons name="shield-checkmark" size={12} color="#FFC107" />
            <Text style={[incStyles.statText, { color: '#FFC107' }]}>{lancAdmin.length} lanç. admin.</Text>
          </View>
        )}
      </View>
      <Text style={incStyles.suggest}>💡 {sugestao}</Text>
      <ScrollView style={{ maxHeight: 140, marginTop: 8 }}>
        {(items || []).slice(0, 12).map((inc, i) => (
          <View key={i} style={incStyles.row}>
            <Ionicons name={inc.tipo === 'lancamento_admin' ? 'shield-checkmark' : 'alert-circle'} size={11} color={inc.tipo === 'lancamento_admin' ? '#FFC107' : '#EF5350'} />
            <Text style={incStyles.rowText}>
              {inc.tipo === 'lancamento_admin' ? 'Lanç. Admin.' : 'Atraso'} · {inc.disciplina} · {inc.trimestre}º T · {inc.anoLetivo}
              {inc.descricao ? ` — ${inc.descricao.slice(0, 60)}${inc.descricao.length > 60 ? '…' : ''}` : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const incStyles = StyleSheet.create({
  box: { marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1 },
  title: { fontSize: 12, fontWeight: '700' },
  empty: { color: '#B0BEC5', fontSize: 11, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#0008' },
  statText: { fontSize: 10, fontWeight: '700' },
  suggest: { color: '#FFD54F', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingVertical: 4 },
  rowText: { flex: 1, color: '#CFD8DC', fontSize: 10 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 52, paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 8, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.primary, flexShrink: 0 },
  addBtnTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },

  // KPIs
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpi: {
    flex: 1, backgroundColor: GLASS, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3,
    padding: 12, gap: 3,
  },
  kpiLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 4 },
  kpiVal: { color: '#fff', fontSize: 18, fontWeight: '700' },
  kpiSub: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },

  card: {
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, marginBottom: 12,
    overflow: 'hidden',
  },

  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 14, paddingBottom: 8, marginTop: 4 },

  // Período chips
  periodoChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  periodoChipActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary },
  periodoChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  periodoChipTextActive: { color: '#fff' },

  // Search + Filter
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GLASS, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GLASS, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary },
  filterChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12,
  },
  scoreCircle: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreVal: { fontSize: 14, fontWeight: '800' },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  rowMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  rowActions: { flexDirection: 'column', gap: 6, paddingTop: 4 },
  actionIcon: { padding: 6, borderRadius: 8 },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalBox: {
    backgroundColor: '#141428', borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    padding: 24, width: '100%', maxWidth: 500, alignSelf: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  modalSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', marginBottom: 12 },

  fieldLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 5 },

  selector: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  selectorText: { flex: 1, color: '#fff', fontSize: 14 },
  selectorPlaceholder: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  textInput: {
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: '#fff', fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },

  criterioRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  criterioIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  criterioLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  criterioDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },

  viewCriterioRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },

  notaFinalBox: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    padding: 16, marginTop: 12, alignItems: 'center', gap: 4,
  },
  notaFinalLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  notaFinalVal: { fontSize: 28, fontWeight: '800' },
  notaFinalNivel: { fontSize: 13, fontWeight: '700' },

  commentBox: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    padding: 12, marginTop: 10, gap: 4,
  },
  commentTitle: { fontSize: 12, fontWeight: '700' },
  commentText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  scoreCircleLg: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreValLg: { fontSize: 22, fontWeight: '800' },

  statusChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: 8,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  statusChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },

  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  saveBtn: {
    flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700' },

  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  optionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  optionName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  optionMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
});
