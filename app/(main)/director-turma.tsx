import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useAuth } from '@/context/AuthContext';
import { useData, Aluno, Presenca } from '@/context/DataContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import type { PlanoAula } from './professor-plano-aula';

// ─── Tipos de auditoria ───────────────────────────────────────────────────────
type AuditoriaItem = {
  id: string;
  presencaId: string;
  alunoId?: string;
  nomeAluno?: string;
  turmaId?: string;
  disciplina?: string;
  data?: string;
  statusAnterior?: string;
  statusNovo?: string;
  observacaoAnterior?: string;
  observacaoNova?: string;
  alteradoPorId?: string;
  alteradoPorEmail?: string;
  alteradoEm: string;
};

const STATUS_COLOR: Record<string, string> = {
  presente: Colors.success,
  falta: Colors.danger,
  justificada: Colors.warning,
  atraso: Colors.info,
};

function statusLabel(s?: string) {
  if (!s) return '—';
  const m: Record<string, string> = { presente: 'Presente', falta: 'Falta', justificada: 'Justificada', atraso: 'Atraso' };
  return m[s] || s;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ─── Limiares ─────────────────────────────────────────────────────────────────
const LIMITE_FALTAS_ALERTA = 0.25;   // 25% de faltas → alerta
const LIMITE_PRESENCA_RISCO = 75;    // < 75% de presença → risco de reprovação
const LIMITE_NOTA_RISCO = 10;        // NF < 10 → risco de reprovação

type Tab = 'dossier' | 'faltas' | 'alertas' | 'risco' | 'planos' | 'auditoria';

const STATUS_PLANO_CONFIG = {
  rascunho:  { label: 'Rascunho',  color: Colors.textMuted,  icon: 'document-outline' as const },
  submetido: { label: 'Submetido', color: Colors.warning,    icon: 'time-outline' as const },
  aprovado:  { label: 'Aprovado',  color: Colors.success,    icon: 'checkmark-circle' as const },
  rejeitado: { label: 'Rejeitado', color: Colors.danger,     icon: 'close-circle' as const },
};

// ─── Componente: Badge de risco ────────────────────────────────────────────────
function RiscoBadge({ tipo }: { tipo: 'alto' | 'medio' | 'baixo' }) {
  const cfg = {
    alto:  { color: Colors.danger,  label: 'Risco Alto',   icon: 'alert-circle' },
    medio: { color: Colors.warning, label: 'Risco Médio',  icon: 'warning' },
    baixo: { color: Colors.success, label: 'OK',            icon: 'checkmark-circle' },
  }[tipo];
  return (
    <View style={[sR.badge, { backgroundColor: cfg.color + '22' }]}>
      <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
      <Text style={[sR.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Modal de detalhes de faltas de um aluno ──────────────────────────────────
function ModalFaltasAluno({
  visible, aluno, presencas, turmaId, onClose, onJustificar,
}: {
  visible: boolean;
  aluno: Aluno | null;
  presencas: Presenca[];
  turmaId: string;
  onClose: () => void;
  onJustificar: (presencaId: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  if (!aluno) return null;

  const faltasAluno = presencas
    .filter(p => p.alunoId === aluno.id && p.turmaId === turmaId && p.status !== 'P')
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mF.overlay}>
        <View style={[mF.container, { paddingBottom: (Platform.OS === 'web' ? 24 : insets.bottom) + 16 }]}>
          <View style={mF.header}>
            <View>
              <Text style={mF.title}>{aluno.nome} {aluno.apelido}</Text>
              <Text style={mF.sub}>{faltasAluno.length} falta(s) registada(s)</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {faltasAluno.length === 0 ? (
            <View style={mF.empty}>
              <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
              <Text style={mF.emptyText}>Sem faltas registadas</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {faltasAluno.map(p => (
                <View key={p.id} style={[mF.row, { borderLeftColor: p.status === 'J' ? Colors.warning : Colors.danger }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={mF.rowData}>{new Date(p.data).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}</Text>
                    <Text style={mF.rowDisc}>{p.disciplina}</Text>
                    {p.observacao ? <Text style={mF.rowObs}>"{p.observacao}"</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[mF.statusBadge, { backgroundColor: p.status === 'J' ? Colors.warning + '22' : Colors.danger + '22' }]}>
                      <Text style={[mF.statusText, { color: p.status === 'J' ? Colors.warning : Colors.danger }]}>
                        {p.status === 'J' ? 'Justificada' : 'Injustificada'}
                      </Text>
                    </View>
                    {p.status === 'F' && (
                      <TouchableOpacity
                        style={mF.justBtn}
                        onPress={() => onJustificar(p.id)}
                      >
                        <Ionicons name="checkmark" size={12} color={Colors.warning} />
                        <Text style={mF.justBtnText}>Justificar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Ecrã principal ────────────────────────────────────────────────────────────
export default function DirectorTurmaScreen() {
  const { user } = useAuth();
  const { professores, turmas, alunos, notas, presencas, updatePresenca, updateAluno, updateTurma } = useData();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [tab, setTab] = useTabMemory<Tab>('director-turma', 'dossier');
  const [turmaIdx, setTurmaIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [alunoModal, setAlunoModal] = useState<Aluno | null>(null);

  // ── Planos de aula state ──────────────────────────────────────────────────
  const [planos, setPlanos] = useState<PlanoAula[]>([]);
  const [planosLoading, setPlanosLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PlanoAula | null>(null);
  const [rejectObs, setRejectObs] = useState('');

  // ── Auditoria de presenças state ──────────────────────────────────────────
  const [auditoria, setAuditoria] = useState<AuditoriaItem[]>([]);
  const [auditoriaLoading, setAuditoriaLoading] = useState(false);
  const [auditoriaRefreshing, setAuditoriaRefreshing] = useState(false);
  const [auditoriaSearch, setAuditoriaSearch] = useState('');

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);

  // Turmas em que este professor é director
  const minhasTurmas = useMemo(() =>
    prof ? turmas.filter(t => t.professorId === prof.id && t.ativo) : [],
    [prof, turmas]
  );

  const turmaAtual = minhasTurmas[turmaIdx] || minhasTurmas[0];

  const alunosDaTurma = useMemo(() =>
    turmaAtual ? alunos.filter(a => a.turmaId === turmaAtual.id && a.ativo) : [],
    [turmaAtual, alunos]
  );

  const alunosFiltrados = useMemo(() =>
    alunosDaTurma.filter(a =>
      `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(search.toLowerCase())
    ),
    [alunosDaTurma, search]
  );

  // ── Estatísticas de presença por aluno ────────────────────────────────────
  function getStats(alunoId: string) {
    const pr = presencas.filter(p => p.alunoId === alunoId && p.turmaId === turmaAtual?.id);
    const total = pr.length;
    const presentes = pr.filter(p => p.status === 'P').length;
    const faltas = pr.filter(p => p.status === 'F').length;
    const justificadas = pr.filter(p => p.status === 'J').length;
    const pct = total > 0 ? Math.round((presentes / total) * 100) : 100;
    return { total, presentes, faltas, justificadas, pct };
  }

  // ── Média de notas por aluno ───────────────────────────────────────────────
  function getMediaNotas(alunoId: string): number | null {
    const notasAluno = notas.filter(n => n.alunoId === alunoId && n.turmaId === turmaAtual?.id && n.nf > 0);
    if (notasAluno.length === 0) return null;
    const soma = notasAluno.reduce((acc, n) => acc + n.nf, 0);
    return Math.round((soma / notasAluno.length) * 10) / 10;
  }

  // ── Justificar falta ───────────────────────────────────────────────────────
  const handleJustificar = useCallback(async (presencaId: string) => {
    try {
      await updatePresenca(presencaId, { status: 'J' });
      alertSucesso('Falta justificada', 'A falta foi marcada como justificada.');
    } catch {
      alertErro('Erro', 'Não foi possível justificar a falta.');
    }
  }, [updatePresenca]);

  // ── Publicar/ocultar notas por aluno ──────────────────────────────────────
  const handleTogglePublicarNotas = useCallback(async (aluno: Aluno) => {
    const novoValor = !(aluno.publicarNotas ?? true);
    const label = novoValor ? 'Publicar' : 'Ocultar';
    webAlert(
      `${label} Notas`,
      novoValor
        ? `Publicar as notas de ${aluno.nome} ${aluno.apelido} no portal do aluno?`
        : `Ocultar as notas de ${aluno.nome} ${aluno.apelido} do portal do aluno? O aluno não conseguirá ver as suas notas até reactivar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: label, onPress: async () => {
            try {
              await api.patch(`/api/alunos/${aluno.id}/publicar-notas`, { publicarNotas: novoValor });
              await updateAluno(aluno.id, { publicarNotas: novoValor });
              alertSucesso(
                novoValor ? 'Notas publicadas' : 'Notas ocultadas',
                novoValor ? 'O aluno já pode ver as suas notas no portal.' : 'As notas foram ocultadas do portal do aluno.'
              );
            } catch {
              alertErro('Erro', 'Não foi possível actualizar o estado das notas.');
            }
          }
        }
      ]
    );
  }, [updateAluno]);

  // ── Bloquear/liberar lançamento de faltas ─────────────────────────────────
  const handleToggleFaltasBloqueadas = useCallback(async () => {
    if (!turmaAtual) return;
    const novoValor = !turmaAtual.faltasBloqueadas;
    webAlert(
      novoValor ? 'Bloquear Lançamento de Faltas' : 'Liberar Lançamento de Faltas',
      novoValor
        ? `Bloquear o registo de presenças para a turma ${turmaAtual.nome}? Os professores não conseguirão lançar faltas enquanto bloqueado.`
        : `Liberar o registo de presenças para a turma ${turmaAtual.nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: novoValor ? 'Bloquear' : 'Liberar', onPress: async () => {
            try {
              await api.patch(`/api/turmas/${turmaAtual.id}/faltas-bloqueadas`, { faltasBloqueadas: novoValor });
              await updateTurma(turmaAtual.id, { faltasBloqueadas: novoValor });
              alertSucesso(
                novoValor ? 'Faltas bloqueadas' : 'Faltas liberadas',
                novoValor ? 'O lançamento de faltas foi bloqueado.' : 'O lançamento de faltas foi liberado.'
              );
            } catch {
              alertErro('Erro', 'Não foi possível alterar o estado.');
            }
          }
        }
      ]
    );
  }, [turmaAtual, updateTurma]);

  // ── Carregar planos de aula da turma ──────────────────────────────────────
  const loadPlanos = useCallback(async () => {
    if (!turmaAtual) return;
    setPlanosLoading(true);
    try {
      const all = await api.get<PlanoAula[]>('/api/planos-aula');
      const daTurma = all.filter(p => p.turmaId === turmaAtual.id);
      setPlanos(daTurma);
    } catch {
      alertErro('Erro', 'Não foi possível carregar os planos de aula.');
    } finally {
      setPlanosLoading(false);
    }
  }, [turmaAtual]);

  // ── Carregar auditoria de presenças ───────────────────────────────────────
  const loadAuditoria = useCallback(async (refreshing = false) => {
    if (!turmaAtual) return;
    if (refreshing) setAuditoriaRefreshing(true);
    else setAuditoriaLoading(true);
    try {
      const rows = await api.get<AuditoriaItem[]>(
        `/api/presencas/auditoria?turmaId=${turmaAtual.id}&limit=200`
      );
      setAuditoria(rows);
    } catch {
      alertErro('Erro', 'Não foi possível carregar o histórico de correcções.');
    } finally {
      setAuditoriaLoading(false);
      setAuditoriaRefreshing(false);
    }
  }, [turmaAtual]);

  useEffect(() => {
    if (tab === 'planos') loadPlanos();
    if (tab === 'auditoria') loadAuditoria();
  }, [tab, loadPlanos, loadAuditoria]);

  // ── Aprovar plano ─────────────────────────────────────────────────────────
  const handleAprovarPlano = useCallback(async (plano: PlanoAula) => {
    try {
      const updated = await api.patch<PlanoAula>(`/api/planos-aula/${plano.id}/status`, {
        status: 'aprovado',
        aprovadoPor: `${user?.nome || user?.email}`,
      });
      setPlanos(prev => prev.map(p => p.id === plano.id ? { ...p, ...updated } : p));
      alertSucesso('Plano aprovado', 'O plano de aula foi aprovado com sucesso.');
    } catch {
      alertErro('Erro', 'Não foi possível aprovar o plano.');
    }
  }, [user]);

  // ── Rejeitar plano ────────────────────────────────────────────────────────
  const handleRejeitarPlano = useCallback(async () => {
    if (!rejectTarget) return;
    if (!rejectObs.trim()) {
      webAlert('Aviso', 'Por favor indique o motivo da rejeição.');
      return;
    }
    try {
      const updated = await api.patch<PlanoAula>(`/api/planos-aula/${rejectTarget.id}/status`, {
        status: 'rejeitado',
        observacaoDirector: rejectObs.trim(),
      });
      setPlanos(prev => prev.map(p => p.id === rejectTarget.id ? { ...p, ...updated } : p));
      setShowRejectModal(false);
      setRejectTarget(null);
      setRejectObs('');
      alertSucesso('Plano rejeitado', 'O plano foi devolvido ao professor com as suas observações.');
    } catch {
      alertErro('Erro', 'Não foi possível rejeitar o plano.');
    }
  }, [rejectTarget, rejectObs]);

  // ── Alunos em alerta (muitas faltas) ──────────────────────────────────────
  const alunosAlerta = useMemo(() => {
    return alunosDaTurma
      .map(a => ({ aluno: a, stats: getStats(a.id) }))
      .filter(({ stats }) => stats.total > 0 && (1 - stats.presentes / stats.total) >= LIMITE_FALTAS_ALERTA)
      .sort((a, b) => a.stats.pct - b.stats.pct);
  }, [alunosDaTurma, presencas, turmaAtual]);

  // ── Alunos em risco de reprovação ─────────────────────────────────────────
  const alunosRisco = useMemo(() => {
    return alunosDaTurma.map(a => {
      const stats = getStats(a.id);
      const media = getMediaNotas(a.id);
      const riscoPresenca = stats.pct < LIMITE_PRESENCA_RISCO;
      const riscoNotas = media !== null && media < LIMITE_NOTA_RISCO;
      const nivel: 'alto' | 'medio' | 'baixo' =
        riscoPresenca && riscoNotas ? 'alto'
        : riscoPresenca || riscoNotas ? 'medio'
        : 'baixo';
      return { aluno: a, stats, media, riscoPresenca, riscoNotas, nivel };
    }).filter(r => r.nivel !== 'baixo')
      .sort((a, b) => (a.nivel === 'alto' ? -1 : b.nivel === 'alto' ? 1 : 0));
  }, [alunosDaTurma, presencas, notas, turmaAtual]);

  const planosSubmetidos = planos.filter(p => p.status === 'submetido').length;

  const auditoriaFiltrada = useMemo(() => {
    if (!auditoriaSearch.trim()) return auditoria;
    const q = auditoriaSearch.toLowerCase();
    return auditoria.filter(a =>
      (a.nomeAluno || '').toLowerCase().includes(q) ||
      (a.disciplina || '').toLowerCase().includes(q) ||
      (a.alteradoPorEmail || '').toLowerCase().includes(q) ||
      (a.data || '').includes(q)
    );
  }, [auditoria, auditoriaSearch]);

  const tabConfig: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: 'dossier',   label: 'Dossier',  icon: 'folder-open' },
    { key: 'faltas',    label: 'Faltas',   icon: 'calendar-clear' },
    { key: 'alertas',  label: 'Alertas',  icon: 'warning', badge: alunosAlerta.length },
    { key: 'risco',    label: 'Risco',    icon: 'trending-down', badge: alunosRisco.length },
    { key: 'planos',   label: 'Planos',   icon: 'book-outline', badge: planosSubmetidos || undefined },
    { key: 'auditoria', label: 'Auditoria', icon: 'shield-checkmark-outline' },
  ];

  if (!prof) {
    return (
      <View style={s.screen}>
        <TopBar title="Director de Turma" subtitle="Painel exclusivo" />
        <View style={s.empty}>
          <Ionicons name="warning-outline" size={48} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Perfil não encontrado</Text>
          <Text style={s.emptySub}>O seu e-mail não está associado a nenhum professor.</Text>
        </View>
      </View>
    );
  }

  if (minhasTurmas.length === 0) {
    return (
      <View style={s.screen}>
        <TopBar title="Director de Turma" subtitle="Painel exclusivo" />
        <View style={s.empty}>
          <FontAwesome5 name="shield-alt" size={48} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Sem turmas sob sua direcção</Text>
          <Text style={s.emptySub}>Ainda não foi designado como Director de nenhuma turma activa.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <TopBar
        title="Director de Turma"
        subtitle={turmaAtual ? `${turmaAtual.nome} · ${turmaAtual.classe}` : 'Painel exclusivo'}
      />

      {/* Selector de turma (se for director de mais de uma) */}
      {minhasTurmas.length > 1 && (
        <View style={s.turmaTabs}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.turmaTabsInner}>
            {minhasTurmas.map((t, i) => (
              <TouchableOpacity
                key={t.id}
                style={[s.turmaTab, turmaIdx === i && s.turmaTabActive]}
                onPress={() => { setTurmaIdx(i); setSearch(''); }}
              >
                <Text style={[s.turmaTabText, turmaIdx === i && s.turmaTabTextActive]}>{t.nome}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Info bar da turma */}
      {turmaAtual && (
        <View style={s.infoBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.infoBarContent}>
            <View style={s.infoPill}>
              <Ionicons name="people" size={12} color={Colors.info} />
              <Text style={s.infoPillText}>{alunosDaTurma.length} alunos</Text>
            </View>
            <View style={s.infoPill}>
              <Ionicons name="time-outline" size={12} color={Colors.gold} />
              <Text style={s.infoPillText}>{turmaAtual.turno}</Text>
            </View>
            {turmaAtual.sala ? (
              <View style={s.infoPill}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={s.infoPillText}>Sala {turmaAtual.sala}</Text>
              </View>
            ) : null}
            <View style={s.infoPill}>
              <Ionicons name="calendar-outline" size={12} color={Colors.success} />
              <Text style={s.infoPillText}>{turmaAtual.anoLetivo}</Text>
            </View>
            <TouchableOpacity
              style={[s.infoPill, { backgroundColor: turmaAtual.faltasBloqueadas ? Colors.danger + '22' : Colors.surface, borderWidth: 1, borderColor: turmaAtual.faltasBloqueadas ? Colors.danger + '55' : Colors.border }]}
              onPress={handleToggleFaltasBloqueadas}
            >
              <Ionicons name={turmaAtual.faltasBloqueadas ? 'lock-closed' : 'lock-open-outline'} size={12} color={turmaAtual.faltasBloqueadas ? Colors.danger : Colors.textMuted} />
              <Text style={[s.infoPillText, { color: turmaAtual.faltasBloqueadas ? Colors.danger : Colors.textMuted }]}>
                {turmaAtual.faltasBloqueadas ? 'Faltas Bloqueadas' : 'Bloquear Faltas'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {tabConfig.map(tc => (
            <TouchableOpacity
              key={tc.key}
              style={[s.tabBtn, tab === tc.key && s.tabBtnActive]}
              onPress={() => setTab(tc.key)}
            >
              <Ionicons name={tc.icon as any} size={14} color={tab === tc.key ? Colors.gold : Colors.textMuted} />
              <Text style={[s.tabText, tab === tc.key && s.tabTextActive]}>{tc.label}</Text>
              {tc.badge !== undefined && tc.badge > 0 && (
                <View style={s.tabBadge}>
                  <Text style={s.tabBadgeText}>{tc.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Tab: DOSSIER ─────────────────────────────────────────────────────── */}
      {tab === 'dossier' && (
        <>
          <View style={s.searchBox}>
            <StableSearchInput
              value={search}
              onChangeText={setSearch}
              inputStyle={s.searchInput}
              placeholder="Pesquisar aluno..."
              iconName="search"
              iconSize={15}
            />
          </View>
          <FlatList
            data={alunosFiltrados}
            keyExtractor={a => a.id}
            contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyTitle}>Nenhum aluno encontrado</Text>
              </View>
            }
            renderItem={({ item: a, index }) => {
              const stats = getStats(a.id);
              const pctColor = stats.pct >= 75 ? Colors.success : stats.pct >= 50 ? Colors.warning : Colors.danger;
              const idade = a.dataNascimento
                ? Math.floor((Date.now() - new Date(a.dataNascimento).getTime()) / (365.25 * 86400000))
                : null;
              return (
                <View style={s.dossierCard}>
                  <View style={s.dossierTop}>
                    <View style={s.dossierAvatar}>
                      <Text style={s.dossierAvatarText}>{a.nome[0]}{a.apelido[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.dossierNome}>{String(index + 1).padStart(2, '0')}. {a.nome} {a.apelido}</Text>
                      <Text style={s.dossierMat}>{a.numeroMatricula} · {a.genero === 'M' ? 'Masculino' : 'Feminino'}{idade ? ` · ${idade} anos` : ''}</Text>
                      {a.provincia ? <Text style={s.dossierMat}>{a.provincia}{a.municipio ? `, ${a.municipio}` : ''}</Text> : null}
                    </View>
                    <View style={[s.pctCircle, { borderColor: pctColor }]}>
                      <Text style={[s.pctVal, { color: pctColor }]}>{stats.pct}%</Text>
                      <Text style={s.pctLbl}>pres.</Text>
                    </View>
                  </View>
                  <View style={s.dossierEnc}>
                    <Ionicons name="person-circle-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.dossierEncText} numberOfLines={1}>
                      Enc: {a.nomeEncarregado || '—'}
                    </Text>
                    {a.telefoneEncarregado ? (
                      <Text style={s.dossierEncPhone}>{a.telefoneEncarregado}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[s.dossierNotaBtn, { backgroundColor: (a.publicarNotas ?? true) ? Colors.success + '18' : Colors.danger + '18', borderColor: (a.publicarNotas ?? true) ? Colors.success + '44' : Colors.danger + '44' }]}
                    onPress={() => handleTogglePublicarNotas(a)}
                  >
                    <Ionicons name={(a.publicarNotas ?? true) ? 'eye' : 'eye-off'} size={12} color={(a.publicarNotas ?? true) ? Colors.success : Colors.danger} />
                    <Text style={[s.dossierNotaBtnText, { color: (a.publicarNotas ?? true) ? Colors.success : Colors.danger }]}>
                      {(a.publicarNotas ?? true) ? 'Notas Publicadas' : 'Notas Ocultadas'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </>
      )}

      {/* ── Tab: FALTAS ──────────────────────────────────────────────────────── */}
      {tab === 'faltas' && (
        <>
          <View style={s.searchBox}>
            <StableSearchInput
              value={search}
              onChangeText={setSearch}
              inputStyle={s.searchInput}
              placeholder="Pesquisar aluno..."
              iconName="search"
              iconSize={15}
            />
          </View>
          <FlatList
            data={alunosFiltrados}
            keyExtractor={a => a.id}
            contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyTitle}>Nenhum aluno</Text>
              </View>
            }
            renderItem={({ item: a }) => {
              const stats = getStats(a.id);
              const pctColor = stats.pct >= 75 ? Colors.success : stats.pct >= 50 ? Colors.warning : Colors.danger;
              return (
                <TouchableOpacity
                  style={s.faltasCard}
                  onPress={() => setAlunoModal(a)}
                  activeOpacity={0.8}
                >
                  <View style={s.faltasLeft}>
                    <View style={s.faltasAvatar}>
                      <Text style={s.faltasAvatarText}>{a.nome[0]}{a.apelido[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.faltasNome}>{a.nome} {a.apelido}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                        <Text style={[s.faltasStat, { color: Colors.success }]}>✓ {stats.presentes} pres.</Text>
                        <Text style={[s.faltasStat, { color: Colors.danger }]}>✗ {stats.faltas} inj.</Text>
                        <Text style={[s.faltasStat, { color: Colors.warning }]}>~ {stats.justificadas} just.</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[s.pctBadge, { backgroundColor: pctColor + '22' }]}>
                      <Text style={[s.pctBadgeText, { color: pctColor }]}>{stats.pct}%</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}

      {/* ── Tab: ALERTAS ─────────────────────────────────────────────────────── */}
      {tab === 'alertas' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}>
          <View style={s.alertaBanner}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
            <Text style={s.alertaBannerText}>
              Alunos com mais de {Math.round(LIMITE_FALTAS_ALERTA * 100)}% de faltas. Comunique aos encarregados de educação.
            </Text>
          </View>

          {alunosAlerta.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
              <Text style={s.emptyTitle}>Sem alertas activos</Text>
              <Text style={s.emptySub}>Nenhum aluno ultrapassou o limite de faltas.</Text>
            </View>
          ) : (
            alunosAlerta.map(({ aluno: a, stats }) => (
              <View key={a.id} style={s.alertaCard}>
                <View style={s.alertaTop}>
                  <View style={[s.alertaAvatar, { backgroundColor: Colors.danger + '22' }]}>
                    <Text style={[s.alertaAvatarText, { color: Colors.danger }]}>{a.nome[0]}{a.apelido[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertaNome}>{a.nome} {a.apelido}</Text>
                    <Text style={s.alertaMat}>{a.numeroMatricula}</Text>
                  </View>
                  <View style={[s.pctBadge, { backgroundColor: Colors.danger + '22' }]}>
                    <Text style={[s.pctBadgeText, { color: Colors.danger }]}>{stats.pct}%</Text>
                  </View>
                </View>
                <View style={s.alertaStats}>
                  <View style={s.alertaStatItem}>
                    <Text style={[s.alertaStatNum, { color: Colors.danger }]}>{stats.faltas}</Text>
                    <Text style={s.alertaStatLbl}>Injustificadas</Text>
                  </View>
                  <View style={s.alertaStatItem}>
                    <Text style={[s.alertaStatNum, { color: Colors.warning }]}>{stats.justificadas}</Text>
                    <Text style={s.alertaStatLbl}>Justificadas</Text>
                  </View>
                  <View style={s.alertaStatItem}>
                    <Text style={[s.alertaStatNum, { color: Colors.textSecondary }]}>{stats.total}</Text>
                    <Text style={s.alertaStatLbl}>Total registos</Text>
                  </View>
                </View>
                {(a.nomeEncarregado || a.telefoneEncarregado) && (
                  <View style={s.alertaEnc}>
                    <Ionicons name="person-circle-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.alertaEncText}>
                      {a.nomeEncarregado}{a.telefoneEncarregado ? ` · ${a.telefoneEncarregado}` : ''}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.alertaBtn}
                  onPress={() => webAlert(
                    'Contactar Encarregado',
                    `Registe que contactou o encarregado de ${a.nome} ${a.apelido} sobre o excesso de faltas.\n\nEncarregado: ${a.nomeEncarregado || '—'}\nTelefone: ${a.telefoneEncarregado || '—'}`,
                    [{ text: 'Fechar', style: 'cancel' }]
                  )}
                >
                  <Ionicons name="call-outline" size={14} color={Colors.info} />
                  <Text style={s.alertaBtnText}>Ver contacto do encarregado</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Tab: RISCO DE REPROVAÇÃO ─────────────────────────────────────────── */}
      {tab === 'risco' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}>
          <View style={s.legendaRow}>
            <View style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: Colors.danger }]} />
              <Text style={s.legendaText}>Risco Alto — faltas + notas em baixo</Text>
            </View>
            <View style={s.legendaItem}>
              <View style={[s.legendaDot, { backgroundColor: Colors.warning }]} />
              <Text style={s.legendaText}>Risco Médio — um dos factores</Text>
            </View>
          </View>

          {alunosRisco.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={Colors.success} />
              <Text style={s.emptyTitle}>Nenhum aluno em risco</Text>
              <Text style={s.emptySub}>Todos os alunos têm assiduidade e notas adequadas.</Text>
            </View>
          ) : (
            alunosRisco.map(({ aluno: a, stats, media, riscoPresenca, riscoNotas, nivel }) => (
              <View key={a.id} style={[s.riscoCard, { borderLeftColor: nivel === 'alto' ? Colors.danger : Colors.warning }]}>
                <View style={s.riscoTop}>
                  <View style={s.faltasAvatar}>
                    <Text style={s.faltasAvatarText}>{a.nome[0]}{a.apelido[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.faltasNome}>{a.nome} {a.apelido}</Text>
                    <Text style={s.alertaMat}>{a.numeroMatricula}</Text>
                  </View>
                  <RiscoBadge tipo={nivel} />
                </View>
                <View style={s.riscoFactores}>
                  <View style={[s.riscoFactor, riscoPresenca && s.riscoFactorAlert]}>
                    <Ionicons name="calendar-clear-outline" size={13} color={riscoPresenca ? Colors.danger : Colors.success} />
                    <Text style={[s.riscoFactorText, { color: riscoPresenca ? Colors.danger : Colors.success }]}>
                      Presença: {stats.pct}%
                    </Text>
                  </View>
                  <View style={[s.riscoFactor, riscoNotas && s.riscoFactorAlertWarn]}>
                    <Ionicons name="document-text-outline" size={13} color={riscoNotas ? Colors.warning : Colors.success} />
                    <Text style={[s.riscoFactorText, { color: riscoNotas ? Colors.warning : Colors.success }]}>
                      Média NF: {media !== null ? media : 'S/dados'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Tab: PLANOS DE AULA ──────────────────────────────────────────────── */}
      {tab === 'planos' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}>
          <View style={[s.alertaBanner, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '33', borderWidth: 1 }]}>
            <Ionicons name="book-outline" size={16} color={Colors.info} />
            <Text style={[s.alertaBannerText, { color: Colors.info }]}>
              Planos de aula submetidos pelos professores desta turma. Revise, aprove ou devolva com observações.
            </Text>
          </View>

          {planosLoading ? (
            <View style={s.empty}>
              <AppLoader color={Colors.gold} />
              <Text style={s.emptySub}>A carregar planos...</Text>
            </View>
          ) : planos.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>Sem planos de aula</Text>
              <Text style={s.emptySub}>Os professores ainda não submeteram planos para esta turma.</Text>
            </View>
          ) : (
            planos.map(plano => {
              const cfg = STATUS_PLANO_CONFIG[plano.status] || STATUS_PLANO_CONFIG.rascunho;
              return (
                <View key={plano.id} style={[s.planoCard, { borderLeftColor: cfg.color }]}>
                  <View style={s.planoCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.planoDisc}>{plano.disciplina} · {plano.turmaNome}</Text>
                      <Text style={s.planoProf}>{plano.professorNome}</Text>
                      <Text style={s.planoSumario} numberOfLines={2}>{plano.sumario || plano.unidade}</Text>
                      <Text style={s.planoMeta}>{plano.data} · {plano.periodo} · {plano.duracao}</Text>
                    </View>
                    <View style={[s.planoBadge, { backgroundColor: cfg.color + '22' }]}>
                      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                      <Text style={[s.planoBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {plano.observacaoDirector ? (
                    <View style={s.planoObs}>
                      <Ionicons name="chatbubble-outline" size={13} color={Colors.textMuted} />
                      <Text style={s.planoObsText}>{plano.observacaoDirector}</Text>
                    </View>
                  ) : null}

                  {plano.status === 'submetido' && (
                    <View style={s.planoActions}>
                      <TouchableOpacity
                        style={[s.planoActionBtn, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}
                        onPress={() => webAlert('Aprovar Plano', `Aprovar o plano de "${plano.disciplina}" de ${plano.professorNome}?`, [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Aprovar', onPress: () => handleAprovarPlano(plano) },
                        ])}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                        <Text style={[s.planoActionText, { color: Colors.success }]}>Aprovar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.planoActionBtn, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '44' }]}
                        onPress={() => { setRejectTarget(plano); setRejectObs(''); setShowRejectModal(true); }}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                        <Text style={[s.planoActionText, { color: Colors.danger }]}>Devolver</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {plano.status === 'aprovado' && plano.aprovadoPor && (
                    <Text style={s.planoAprovado}>✓ Aprovado por {plano.aprovadoPor}{plano.aprovadoEm ? ` em ${new Date(plano.aprovadoEm).toLocaleDateString('pt-PT')}` : ''}</Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Modal de rejeição do plano */}
      <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => setShowRejectModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.rejectOverlay}>
          <View style={[s.rejectContainer, { paddingBottom: (Platform.OS === 'web' ? 24 : insets.bottom) + 16 }]}>
            <View style={s.rejectHeader}>
              <Text style={s.rejectTitle}>Devolver Plano ao Professor</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {rejectTarget && (
              <Text style={s.rejectSub}>{rejectTarget.disciplina} · {rejectTarget.professorNome}</Text>
            )}
            <Text style={s.rejectLabel}>Observações / Motivo de devolução</Text>
            <TextInput
              style={s.rejectInput}
              placeholder="Descreva o que deve ser corrigido ou melhorado..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={5}
              value={rejectObs}
              onChangeText={setRejectObs}
            />
            <TouchableOpacity style={s.rejectBtn} onPress={handleRejeitarPlano}>
              <Ionicons name="return-down-back-outline" size={16} color="#fff" />
              <Text style={s.rejectBtnText}>Devolver ao Professor</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Tab: AUDITORIA DE PRESENÇAS ─────────────────────────────────────── */}
      {tab === 'auditoria' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: bottomPad + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={auditoriaRefreshing}
              onRefresh={() => loadAuditoria(true)}
              tintColor={Colors.gold}
            />
          }
        >
          {/* Cabeçalho informativo */}
          <View style={s.auditBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.gold} />
            <Text style={s.auditBannerText}>
              Histórico de todas as correcções de presença efectuadas nesta turma — quem alterou, quando e o que mudou.
            </Text>
          </View>

          {/* Pesquisa */}
          <View style={s.searchBox}>
            <StableSearchInput
              value={auditoriaSearch}
              onChangeText={setAuditoriaSearch}
              inputStyle={s.searchInput}
              placeholder="Pesquisar por aluno, disciplina ou utilizador..."
              iconName="search"
              iconSize={15}
            />
          </View>

          {auditoriaLoading ? (
            <View style={s.empty}>
              <ActivityIndicator color={Colors.gold} size="large" />
              <Text style={s.emptySub}>A carregar histórico...</Text>
            </View>
          ) : auditoriaFiltrada.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>
                {auditoria.length === 0 ? 'Sem correcções registadas' : 'Nenhum resultado'}
              </Text>
              <Text style={s.emptySub}>
                {auditoria.length === 0
                  ? 'Nenhuma presença foi corrigida nesta turma ainda.'
                  : 'Tente outros termos de pesquisa.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.auditCount}>{auditoriaFiltrada.length} correcção{auditoriaFiltrada.length !== 1 ? 'ões' : ''}</Text>
              {auditoriaFiltrada.map(item => {
                const antColor = STATUS_COLOR[item.statusAnterior || ''] || Colors.textMuted;
                const novoColor = STATUS_COLOR[item.statusNovo || ''] || Colors.textMuted;
                return (
                  <View key={item.id} style={s.auditCard}>
                    {/* Topo: aluno + disciplina */}
                    <View style={s.auditTop}>
                      <View style={s.auditAvatar}>
                        <Text style={s.auditAvatarText}>
                          {(item.nomeAluno || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.auditNome}>{item.nomeAluno || 'Aluno desconhecido'}</Text>
                        <Text style={s.auditMeta}>
                          {item.disciplina || 'Disciplina —'}
                          {item.data ? ` · ${item.data}` : ''}
                        </Text>
                      </View>
                      <Text style={s.auditTs}>{fmtDate(item.alteradoEm)}</Text>
                    </View>

                    {/* Mudança de estado */}
                    <View style={s.auditChange}>
                      <View style={[s.auditStatusBadge, { backgroundColor: antColor + '22', borderColor: antColor + '55' }]}>
                        <Text style={[s.auditStatusText, { color: antColor }]}>
                          {statusLabel(item.statusAnterior)}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={13} color={Colors.textMuted} />
                      <View style={[s.auditStatusBadge, { backgroundColor: novoColor + '22', borderColor: novoColor + '55' }]}>
                        <Text style={[s.auditStatusText, { color: novoColor }]}>
                          {statusLabel(item.statusNovo)}
                        </Text>
                      </View>
                    </View>

                    {/* Observação nova (se existir) */}
                    {item.observacaoNova ? (
                      <View style={s.auditObs}>
                        <Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} />
                        <Text style={s.auditObsText}>{item.observacaoNova}</Text>
                      </View>
                    ) : null}

                    {/* Rodapé: quem alterou */}
                    <View style={s.auditFooter}>
                      <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
                      <Text style={s.auditFooterText}>{item.alteradoPorEmail || 'Utilizador desconhecido'}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Modal de detalhes de faltas */}
      <ModalFaltasAluno
        visible={!!alunoModal}
        aluno={alunoModal}
        presencas={presencas}
        turmaId={turmaAtual?.id || ''}
        onClose={() => setAlunoModal(null)}
        onJustificar={async (id) => {
          await handleJustificar(id);
        }}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  turmaTabs: { height: 52, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  turmaTabsInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  turmaTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface },
  turmaTabActive: { backgroundColor: Colors.accent },
  turmaTabText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  turmaTabTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  infoBar: { height: 44, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoBarContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  infoPillText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  tabScroll: { height: 50, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, position: 'relative' },
  tabBtnActive: { backgroundColor: `${Colors.gold}22`, borderWidth: 1, borderColor: Colors.gold },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  tabBadge: { backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, marginBottom: 4, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
  // Dossier
  dossierCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 },
  dossierTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dossierAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  dossierAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  dossierNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  dossierMat: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  dossierEnc: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${Colors.info}10`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  dossierEncText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  dossierEncPhone: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  pctCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pctVal: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pctLbl: { fontSize: 8, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  // Faltas
  faltasCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  faltasLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  faltasAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  faltasAvatarText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  faltasNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  faltasStat: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  pctBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pctBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  // Alertas
  alertaBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${Colors.warning}12`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: `${Colors.warning}30` },
  alertaBannerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 17 },
  alertaCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 10 },
  alertaTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertaAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  alertaAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  alertaNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alertaMat: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  alertaStats: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  alertaStatItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  alertaStatNum: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  alertaStatLbl: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  alertaEnc: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${Colors.info}10`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  alertaEncText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  alertaBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', backgroundColor: `${Colors.info}15`, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: `${Colors.info}30` },
  alertaBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  // Risco
  legendaRow: { gap: 6, marginBottom: 12 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendaDot: { width: 10, height: 10, borderRadius: 5 },
  legendaText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  riscoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 10 },
  riscoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riscoFactores: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  riscoFactor: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${Colors.success}12`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  riscoFactorAlert: { backgroundColor: `${Colors.danger}12` },
  riscoFactorAlertWarn: { backgroundColor: `${Colors.warning}12` },
  riscoFactorText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  // Publicar notas button in dossier card
  dossierNotaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  dossierNotaBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  // Planos de aula
  planoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 8 },
  planoCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planoDisc: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  planoProf: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 2 },
  planoSumario: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 4, lineHeight: 17 },
  planoMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3 },
  planoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  planoBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  planoObs: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.surface, borderRadius: 8, padding: 10 },
  planoObsText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 16, fontStyle: 'italic' },
  planoActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  planoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 9 },
  planoActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  planoAprovado: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.success, fontStyle: 'italic' },
  // Auditoria de presenças
  auditBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${Colors.gold}12`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: `${Colors.gold}30` },
  auditBannerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  auditCount: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 10, marginLeft: 2 },
  auditCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 10 },
  auditTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  auditAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${Colors.gold}22`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  auditAvatarText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  auditNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  auditMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  auditTs: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'right', flexShrink: 0 },
  auditChange: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  auditStatusBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  auditStatusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  auditObs: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.surface, borderRadius: 8, padding: 8 },
  auditObsText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 16, fontStyle: 'italic' },
  auditFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  auditFooterText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  // Reject modal
  rejectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  rejectContainer: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20 },
  rejectHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  rejectTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  rejectSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 16 },
  rejectLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 8 },
  rejectInput: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  rejectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 14 },
  rejectBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});

const sR = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});

const mF = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  container: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, borderLeftWidth: 3, paddingLeft: 12, marginBottom: 2 },
  rowData: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  rowDisc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  rowObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 3, fontStyle: 'italic' },
  statusBadge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  justBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.warning}22`, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  justBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.warning },
});
