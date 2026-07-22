import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Image, Modal, Dimensions } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes } from '@/context/NotificacoesContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { api } from '@/lib/api';
import CartaoFuncionarioVisual from '@/components/CartaoFuncionarioVisual';
import { useConfig } from '@/context/ConfigContext';
import { BarChart, DonutChart, HorizontalBarChart, GaugeChart } from '@/components/Charts';
import CollapsibleStats from '@/components/CollapsibleStats';
import ProfessorTour, { useProfessorTour } from '@/components/ProfessorTour';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = Math.min(SCREEN_W - 64, 320);

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmt(v: number) {
  return v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
}

function StatCard({ value, label, color, icon }: { value: string | number; label: string; color: string; icon: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={26} color={color} style={{ marginBottom: 8 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, route, badge, color }: { icon: string; label: string; route: string; badge?: number; color?: string; }) {
  const router = useRouter();
  return (
    <TouchableOpacity style={styles.quickAction} onPress={() => router.push(route as any)} activeOpacity={0.7}>
      <View style={[styles.quickActionIcon, { backgroundColor: (color || Colors.info) + '22' }]}>
        <Ionicons name={icon as any} size={24} color={color || Colors.info} />
        {badge !== undefined && badge > 0 && (
          <View style={styles.qaBadge}>
            <Text style={styles.qaBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Painel de Estimativa Salarial ────────────────────────────────────────────
interface ReciboEstimado {
  semPerfil?: boolean;
  nome?: string;
  cargo?: string;
  tipoContrato?: string;
  mes?: number;
  ano?: number;
  temposSemanais?: number;
  temposEsperados?: number;
  temposTrabalhados?: number;
  diasUteisCorridos?: number;
  totalDiasUteisNoMes?: number;
  isCurrentMonth?: boolean;
  faltasMes?: number;
  salarioBase?: number;
  valorPorTempoLectivo?: number;
  salColaborador?: number;
  descontoTempos?: number;
  descontoFaltas?: number;
  subsidioAlimentacao?: number;
  subsidioTransporte?: number;
  subsidioHabitacao?: number;
  salarioBruto?: number;
  inssEmpregado?: number;
  irt?: number;
  salarioLiquido?: number;
  semanasPorMes?: number;
  inssEmpPerc?: number;
}

const TIPO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', colaborador: 'Colaborador',
  contratado: 'Contratado', prestacao_servicos: 'Prestação de Serviços',
};

function EstimativaSalarialCard() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano] = useState(now.getFullYear());
  const [data, setData] = useState<ReciboEstimado | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number, a: number) => {
    setLoading(true);
    try {
      const r = await api.get(`/api/meu-recibo-estimado?mes=${m}&ano=${a}`);
      setData(r);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(mes, ano); }, [mes, ano]);

  const mesAnterior = () => {
    if (mes === 1) return;
    setMes(m => m - 1);
  };
  const mesSeguinte = () => {
    if (mes === now.getMonth() + 1 && ano === now.getFullYear()) return;
    setMes(m => m + 1);
  };

  if (loading) {
    return (
      <View style={sal.card}>
        <AppLoader color={Colors.gold} style={{ padding: 20 }} />
      </View>
    );
  }

  if (!data || data.semPerfil) return null;

  const isColaborador = ['colaborador', 'contratado', 'prestacao_servicos'].includes(data.tipoContrato ?? '');
  const temFalta = (data.faltasMes ?? 0) > 0;

  return (
    <View style={sal.card}>
      {/* Cabeçalho */}
      <View style={sal.header}>
        <View style={sal.headerLeft}>
          <MaterialCommunityIcons name="cash-multiple" size={18} color={Colors.gold} />
          <Text style={sal.title}>Estimativa de Vencimento</Text>
        </View>
        <View style={sal.mesNav}>
          <TouchableOpacity onPress={mesAnterior} disabled={mes === 1}>
            <Ionicons name="chevron-back" size={16} color={mes === 1 ? Colors.textMuted : Colors.gold} />
          </TouchableOpacity>
          <Text style={sal.mesLabel}>{MESES[mes - 1]}</Text>
          <TouchableOpacity onPress={mesSeguinte} disabled={mes === now.getMonth() + 1}>
            <Ionicons name="chevron-forward" size={16} color={mes === now.getMonth() + 1 ? Colors.textMuted : Colors.gold} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Perfil do Professor */}
      {(data.nome || data.cargo) && (
        <View style={sal.perfilBox}>
          <View style={sal.perfilAvatar}>
            <Ionicons name="person" size={20} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            {data.nome ? <Text style={sal.perfilNome}>{data.nome}</Text> : null}
            {data.cargo ? <Text style={sal.perfilCargo}>{data.cargo}</Text> : null}
          </View>
          <View style={sal.tipoBadge}>
            <Text style={sal.tipoText}>{TIPO_LABEL[data.tipoContrato ?? ''] ?? data.tipoContrato}</Text>
          </View>
        </View>
      )}

      {/* Tempos lectivos — sempre visíveis */}
      <View style={sal.temposBox}>
        <View style={sal.temposRow}>
          <Text style={sal.temposLabel}>Tempos lectivos por semana</Text>
          <Text style={[sal.temposVal, { color: (data.temposSemanais ?? 0) > 0 ? Colors.text : Colors.textMuted }]}>
            {(data.temposSemanais ?? 0) > 0 ? `${data.temposSemanais} tempos` : 'Não definido'}
          </Text>
        </View>
        {(data.temposSemanais ?? 0) > 0 && (
          <View style={sal.temposRow}>
            <Text style={sal.temposLabel}>Total esperado no mês (×4 sem.)</Text>
            <Text style={[sal.temposVal, { color: Colors.info }]}>{data.temposEsperados} tempos</Text>
          </View>
        )}
        {isColaborador && (data.valorPorTempoLectivo ?? 0) > 0 && (
          <View style={sal.temposRow}>
            <Text style={sal.temposLabel}>Valor por tempo lectivo</Text>
            <Text style={[sal.temposVal, { color: Colors.success }]}>{fmt(data.valorPorTempoLectivo ?? 0)}</Text>
          </View>
        )}
        {isColaborador && data.isCurrentMonth && (data.temposSemanais ?? 0) > 0 && (
          <View style={sal.temposRow}>
            <Text style={sal.temposLabel}>Dias úteis decorridos</Text>
            <Text style={sal.temposVal}>{data.diasUteisCorridos} / {data.totalDiasUteisNoMes} dias úteis</Text>
          </View>
        )}
        {(data.temposSemanais ?? 0) > 0 && (
          <View style={sal.temposRow}>
            <Text style={sal.temposLabel}>{isColaborador && data.isCurrentMonth ? 'Tempos ganhos até hoje' : 'Tempos trabalhados'}</Text>
            <Text style={[sal.temposVal, { color: temFalta ? Colors.warning : Colors.success }]}>
              {data.temposTrabalhados}
            </Text>
          </View>
        )}
        <View style={[sal.temposRow, { marginTop: 2 }]}>
          <Text style={[sal.temposLabel, { color: (data.faltasMes ?? 0) > 0 ? Colors.danger : Colors.textMuted }]}>Faltas registadas este mês</Text>
          <Text style={[sal.temposVal, { color: (data.faltasMes ?? 0) > 0 ? Colors.danger : Colors.textMuted }]}>{data.faltasMes ?? 0}</Text>
        </View>
      </View>

      {/* Alerta de falta */}
      {temFalta && (
        <View style={sal.alertBox}>
          <Ionicons name="warning" size={14} color={Colors.warning} />
          <Text style={sal.alertText}>
            {data.faltasMes} falta(s) registada(s) este mês — impacto no salário aplicado abaixo.
          </Text>
        </View>
      )}

      {/* Discriminação */}
      <View style={sal.breakdown}>
        {/* Créditos */}
        {isColaborador && (data.salColaborador ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={sal.bLabel}>
              {`Tempos dados (${data.temposTrabalhados} × ${fmt(data.valorPorTempoLectivo ?? 0)})`}
            </Text>
            <Text style={[sal.bVal, { color: Colors.success }]}>{fmt(data.salColaborador ?? 0)}</Text>
          </View>
        )}
        {!isColaborador && (data.salarioBase ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={sal.bLabel}>Salário Base</Text>
            <Text style={[sal.bVal, { color: Colors.success }]}>{fmt(data.salarioBase ?? 0)}</Text>
          </View>
        )}
        {(data.subsidioAlimentacao ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={sal.bLabel}>Subsídio de Alimentação</Text>
            <Text style={[sal.bVal, { color: Colors.success }]}>{fmt(data.subsidioAlimentacao ?? 0)}</Text>
          </View>
        )}
        {(data.subsidioTransporte ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={sal.bLabel}>Subsídio de Transporte</Text>
            <Text style={[sal.bVal, { color: Colors.success }]}>{fmt(data.subsidioTransporte ?? 0)}</Text>
          </View>
        )}
        {(data.subsidioHabitacao ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={sal.bLabel}>Subsídio de Habitação</Text>
            <Text style={[sal.bVal, { color: Colors.success }]}>{fmt(data.subsidioHabitacao ?? 0)}</Text>
          </View>
        )}

        {/* Separador */}
        <View style={sal.divider} />

        {/* Descontos */}
        {(data.descontoTempos ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={[sal.bLabel, { color: Colors.danger }]}>
              {`Desconto tempos não dados (${data.faltasMes})`}
            </Text>
            <Text style={[sal.bVal, { color: Colors.danger }]}>- {fmt(data.descontoTempos ?? 0)}</Text>
          </View>
        )}
        {(data.descontoFaltas ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={[sal.bLabel, { color: Colors.danger }]}>Desconto por faltas</Text>
            <Text style={[sal.bVal, { color: Colors.danger }]}>- {fmt(data.descontoFaltas ?? 0)}</Text>
          </View>
        )}
        {(data.inssEmpregado ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={[sal.bLabel, { color: '#FF7141' }]}>{`INSS Empregado (${data.inssEmpPerc}%)`}</Text>
            <Text style={[sal.bVal, { color: '#FF7141' }]}>- {fmt(data.inssEmpregado ?? 0)}</Text>
          </View>
        )}
        {(data.irt ?? 0) > 0 && (
          <View style={sal.bRow}>
            <Text style={[sal.bLabel, { color: Colors.danger }]}>IRT</Text>
            <Text style={[sal.bVal, { color: Colors.danger }]}>- {fmt(data.irt ?? 0)}</Text>
          </View>
        )}

        {/* Líquido */}
        <View style={sal.liquidoRow}>
          <Text style={sal.liquidoLabel}>Salário Líquido Estimado</Text>
          <Text style={sal.liquidoVal}>{fmt(data.salarioLiquido ?? 0)}</Text>
        </View>
      </View>

      <Text style={sal.nota}>* Estimativa baseada nos dados registados até ao momento. Sujeita a ajustes finais pela equipa de RH.</Text>
    </View>
  );
}

// ─── Ecrã Principal ───────────────────────────────────────────────────────────
export default function ProfessorHubScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const { professores, turmas, alunos, notas, presencas, isLoading: dataLoading } = useData();
  const { sumarios, pautas, mensagens, solicitacoes, calendarioProvas } = useProfessor();
  const { notificacoes, unreadCount, marcarLida } = useNotificacoes();
  const { anoSelecionado } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [showReaberturaModal, setShowReaberturaModal] = useState(false);
  const [showActaModal, setShowActaModal] = useState(false);
  const { tourVisible, checkAndShow, openTour, closeTour } = useProfessorTour();
  const [profPrazos, setProfPrazos] = useState<any[]>([]);
  const [profPrazosLoading, setProfPrazosLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [actaStep, setActaStep] = useState<1|2|3>(1);
  const [actaTurma, setActaTurma] = useState<any>(null);
  const [actaDisciplinas, setActaDisciplinas] = useState<{id:string;nome:string}[]>([]);
  const [actaLoadingDisc, setActaLoadingDisc] = useState(false);
  const [actaDisciplinaSel, setActaDisciplinaSel] = useState('');
  const TRIMESTRES = ['1º Trimestre', '2º Trimestre', '3º Trimestre'] as const;
  const reaberturaNotifs = useMemo(
    () => notificacoes.filter(n => n.tipo === 'reabertura_aprovada' && !n.lida),
    [notificacoes]
  );

  useEffect(() => {
    if (reaberturaNotifs.length > 0) {
      setShowReaberturaModal(true);
    }
  }, [reaberturaNotifs.length]);

  // Auto-mostrar tour na primeira visita do professor
  useEffect(() => {
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchPrazos() {
      setProfPrazosLoading(true);
      try {
        const res = await api.get('/api/prazos-mini-pauta');
        const data = Array.isArray(res.data) ? res.data : [];
        setProfPrazos(data);
      } catch {
        setProfPrazos([]);
      } finally {
        setProfPrazosLoading(false);
      }
    }
    fetchPrazos();
  }, []);

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);

  const minhasTurmas = useMemo(() =>
    prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [],
    [prof, turmas]
  );

  const isDirector = useMemo(() =>
    prof ? turmas.some(t => t.professorId === prof.id && t.ativo) : false,
    [prof, turmas]
  );

  const isAdmin = ['admin', 'director', 'pedagogico', 'ceo', 'pca'].includes(user?.role || '');

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const meusSumarios = useMemo(() =>
    sumarios.filter(s => s.professorId === prof?.id),
    [sumarios, prof]
  );

  const sumariosMes = useMemo(() =>
    meusSumarios.filter(s => {
      const d = new Date(s.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }),
    [meusSumarios, mesAtual, anoAtual]
  );

  const aulasLecionadas = meusSumarios.filter(s => s.status !== 'rejeitado').length;
  const faltasMes = sumariosMes.filter(s => s.status === 'rejeitado').length;

  const minhasNotas = useMemo(() =>
    notas.filter(n => n.professorId === prof?.id),
    [notas, prof]
  );

  const avaliacoesDadas = minhasNotas.filter(n => n.aval1 > 0 || n.aval2 > 0 || n.aval3 > 0 || n.aval4 > 0).length;
  const provasDadas = minhasNotas.filter(n => n.pp1 > 0 || n.ppt > 0).length;

  const minhasMensagensNaoLidas = useMemo(() =>
    mensagens.filter(m =>
      (m.tipo === 'privada' && m.destinatarioId === prof?.id) ||
      (m.tipo === 'turma' && minhasTurmas.some(t => t.id === m.turmaId))
    ).filter(m => !m.lidaPor.includes(prof?.id || '')).length,
    [mensagens, prof, minhasTurmas]
  );

  const provasPublicadas = useMemo(() =>
    calendarioProvas.filter(p => p.publicado && p.turmasIds.some(tid => minhasTurmas.some(t => t.id === tid))),
    [calendarioProvas, minhasTurmas]
  );

  const solicitacoesPendentes = solicitacoes.filter(s => s.professorId === prof?.id && s.status === 'pendente').length;

  const proximasProvas = provasPublicadas
    .filter(p => new Date(p.data) >= hoje)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    .slice(0, 4);

  const tipoProvaColor: Record<string, string> = {
    teste: Colors.info,
    exame: Colors.danger,
    trabalho: Colors.gold,
    prova_oral: Colors.success,
  };

  function handleAbrirActaProvas(turmaId: string, disciplina: string, trimestre: string) {
    const profNome = prof ? `${prof.nome} ${prof.apelido}`.trim() : '';
    const params = new URLSearchParams({ disciplina, professorNome: profNome, trimestre }).toString();
    const url = `/api/pdf/acta-provas/${turmaId}?${params}`;
    if (Platform.OS === 'web') {
      window.open(`${window.location.origin}${url}`, '_blank');
    } else {
      router.push(`/(main)/webview-pdf?url=${encodeURIComponent(url)}` as any);
    }
    setShowActaModal(false);
    setActaStep(1);
    setActaTurma(null);
    setActaDisciplinas([]);
    setActaDisciplinaSel('');
  }

  function handleSelectActaDisciplina(discNome: string) {
    setActaDisciplinaSel(discNome);
    setActaStep(3);
  }

  async function handleSelectActaTurma(turma: any) {
    setActaTurma(turma);
    setActaLoadingDisc(true);
    setActaDisciplinas([]);
    try {
      const resp = await api.get(`/api/turmas/${turma.id}/disciplinas`);
      const data = Array.isArray(resp.data) ? resp.data : [];
      // Also include professor's own disciplines filtered to this turma
      const profDiscs: {id:string;nome:string}[] = data.length > 0 ? data :
        (prof?.disciplinas || []).map((d: string, i: number) => ({ id: `disc-${i}`, nome: d }));
      setActaDisciplinas(profDiscs);
    } catch {
      // fallback to professor's own disciplines
      const fallback = (prof?.disciplinas || []).map((d: string, i: number) => ({ id: `disc-${i}`, nome: d }));
      setActaDisciplinas(fallback);
    } finally {
      setActaLoadingDisc(false);
    }
    setActaStep(2);
  }

  async function handleIrParaPauta() {
    for (const n of reaberturaNotifs) {
      await marcarLida(n.id);
    }
    setShowReaberturaModal(false);
    const link = reaberturaNotifs[0]?.link;
    router.push((link || '/(main)/professor-pauta') as any);
  }

  async function handleDismissReabertura() {
    for (const n of reaberturaNotifs) {
      await marcarLida(n.id);
    }
    setShowReaberturaModal(false);
  }

  // Vista exclusiva de estimativa salarial — deve ficar depois de todos os hooks
  if (view === 'salario') {
    return (
      <View style={styles.container}>
        <TopBar title="Meu Salário" subtitle="Estimativa de vencimento mensal" />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 24 }}>
          <EstimativaSalarialCard />
        </ScrollView>
      </View>
    );
  }

  if (dataLoading) {
    return (
      <View style={styles.container}>
        <TopBar title="Meu Painel" subtitle="A sincronizar dados..." />
        <ProfessorLoadingSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Modal de notificação de reabertura aprovada */}
      <Modal visible={showReaberturaModal} transparent animationType="fade" onRequestClose={() => setShowReaberturaModal(false)}>
        <View style={rab.overlay}>
          <View style={rab.card}>
            <View style={rab.iconRow}>
              <View style={rab.iconCircle}>
                <Ionicons name="lock-open" size={28} color={Colors.gold} />
              </View>
            </View>
            <Text style={rab.title}>Reabertura Aprovada</Text>
            <Text style={rab.subtitle}>
              {reaberturaNotifs.length === 1
                ? 'Tem um campo de pauta reaberto aguardando o seu lançamento.'
                : `Tem ${reaberturaNotifs.length} campos de pauta reabertos aguardando o seu lançamento.`}
            </Text>
            <ScrollView style={{ maxHeight: 180, width: '100%' }} showsVerticalScrollIndicator={false}>
              {reaberturaNotifs.map(n => (
                <View key={n.id} style={rab.notifRow}>
                  <Ionicons name="ellipse" size={7} color={Colors.gold} style={{ marginTop: 5 }} />
                  <Text style={rab.notifText}>{n.mensagem}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={rab.btnPrimary} onPress={handleIrParaPauta} activeOpacity={0.8}>
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={rab.btnPrimaryText}>Ir para a Pauta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rab.btnSecondary} onPress={handleDismissReabertura} activeOpacity={0.7}>
              <Text style={rab.btnSecondaryText}>Mais tarde</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Acta de Provas */}
      <Modal visible={showActaModal} transparent animationType="fade" onRequestClose={() => { setShowActaModal(false); setActaStep(1); setActaTurma(null); }}>
        <View style={rab.overlay}>
          <View style={[rab.card, { maxHeight: '85%' }]}>
            <View style={rab.iconRow}>
              <View style={[rab.iconCircle, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '55' }]}>
                <Ionicons name="newspaper-outline" size={26} color={Colors.info} />
              </View>
            </View>
            <Text style={rab.title}>Acta de Presença em Provas</Text>

            {/* Step indicator */}
            <View style={acta.steps}>
              <View style={[acta.stepDot, { backgroundColor: Colors.info }]} />
              <View style={[acta.stepLine, { backgroundColor: actaStep >= 2 ? Colors.info : Colors.border }]} />
              <View style={[acta.stepDot, { backgroundColor: actaStep >= 2 ? Colors.info : Colors.border }]} />
              <View style={[acta.stepLine, { backgroundColor: actaStep === 3 ? Colors.info : Colors.border }]} />
              <View style={[acta.stepDot, { backgroundColor: actaStep === 3 ? Colors.info : Colors.border }]} />
            </View>

            {actaStep === 1 ? (
              /* Passo 1: Seleccionar turma */
              <>
                <Text style={rab.subtitle}>Passo 1 — Seleccione a turma</Text>
                {minhasTurmas.length === 0 ? (
                  <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 }}>
                    Não tem turmas associadas.
                  </Text>
                ) : (
                  <ScrollView style={{ width: '100%', maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                    {minhasTurmas.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={acta.turmaRow}
                        onPress={() => handleSelectActaTurma(t)}
                        activeOpacity={0.75}
                      >
                        <View style={acta.turmaIcon}>
                          <Ionicons name="people" size={18} color={Colors.info} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={acta.turmaNome}>{t.nome}</Text>
                          <Text style={acta.turmaSub}>
                            {t.classe || ''}{t.nivel ? ` · ${t.nivel}` : ''}{t.turno ? ` · ${t.turno}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.info} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : actaStep === 2 ? (
              /* Passo 2: Seleccionar disciplina */
              <>
                <Text style={rab.subtitle}>
                  Passo 2 — Seleccione a disciplina{'\n'}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.info }}>
                    {actaTurma?.nome}{actaTurma?.nivel ? ` · ${actaTurma.nivel}` : ''}
                  </Text>
                </Text>
                {actaLoadingDisc ? (
                  <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginVertical: 16 }}>
                    A carregar disciplinas...
                  </Text>
                ) : actaDisciplinas.length === 0 ? (
                  <View style={{ width: '100%' }}>
                    <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 }}>
                      Sem disciplinas configuradas. Gerar acta geral?
                    </Text>
                    <TouchableOpacity
                      style={[rab.btnPrimary, { backgroundColor: Colors.info }]}
                      onPress={() => handleSelectActaDisciplina('')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="print-outline" size={18} color="#fff" />
                      <Text style={rab.btnPrimaryText}>Continuar Sem Disciplina</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView style={{ width: '100%', maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                    {actaDisciplinas.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={acta.turmaRow}
                        onPress={() => handleSelectActaDisciplina(d.nome)}
                        activeOpacity={0.75}
                      >
                        <View style={[acta.turmaIcon, { backgroundColor: Colors.gold + '22' }]}>
                          <Ionicons name="book-outline" size={18} color={Colors.gold} />
                        </View>
                        <Text style={[acta.turmaNome, { flex: 1 }]}>{d.nome}</Text>
                        <Ionicons name="chevron-forward" size={18} color={Colors.gold} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={[rab.btnSecondary, { marginTop: 8 }]}
                  onPress={() => { setActaStep(1); setActaTurma(null); setActaDisciplinas([]); setActaDisciplinaSel(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[rab.btnSecondaryText, { color: Colors.info }]}>← Voltar</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Passo 3: Seleccionar trimestre */
              <>
                <Text style={rab.subtitle}>
                  Passo 3 — Seleccione o trimestre{'\n'}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.gold, fontSize: 12 }}>
                    {actaTurma?.nome}{actaDisciplinaSel ? ` · ${actaDisciplinaSel}` : ''}
                  </Text>
                </Text>
                <View style={{ width: '100%', gap: 8 }}>
                  {TRIMESTRES.map(tri => (
                    <TouchableOpacity
                      key={tri}
                      style={[acta.turmaRow, { borderBottomWidth: 0, borderRadius: 10, backgroundColor: Colors.card, paddingHorizontal: 14 }]}
                      onPress={() => handleAbrirActaProvas(actaTurma.id, actaDisciplinaSel, tri)}
                      activeOpacity={0.75}
                    >
                      <View style={[acta.turmaIcon, { backgroundColor: Colors.success + '22' }]}>
                        <Ionicons name="calendar-outline" size={18} color={Colors.success} />
                      </View>
                      <Text style={[acta.turmaNome, { flex: 1 }]}>{tri}</Text>
                      <Ionicons name="print-outline" size={18} color={Colors.success} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[rab.btnSecondary, { marginTop: 8 }]}
                  onPress={() => { setActaStep(2); setActaDisciplinaSel(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[rab.btnSecondaryText, { color: Colors.gold }]}>← Voltar</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={rab.btnSecondary} onPress={() => { setShowActaModal(false); setActaStep(1); setActaTurma(null); }} activeOpacity={0.7}>
              <Text style={rab.btnSecondaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ProfessorTour visible={tourVisible} onClose={closeTour} />
      <TopBar title="Meu Painel" subtitle={prof ? `Prof. ${prof.nome} ${prof.apelido}` : 'Professor'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 24 }}>

        {/* ── Banner do perfil ── */}
        <View style={styles.banner}>
          <View style={styles.bannerAvatar}>
            <Text style={styles.bannerAvatarText}>{prof ? prof.nome.charAt(0).toUpperCase() : '?'}</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerGreet}>Bem-vindo de volta,</Text>
            <Text style={styles.bannerName}>{prof ? `${prof.nome} ${prof.apelido}` : 'Professor'}</Text>
            <Text style={styles.bannerSub}>
              {prof?.cargo || 'Professor'} · {minhasTurmas.length} turma{minhasTurmas.length !== 1 ? 's' : ''} activa{minhasTurmas.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity onPress={openTour} style={[styles.bannerEdit, styles.tourBtn]} activeOpacity={0.75}>
              <Ionicons name="compass-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(main)/perfil')} style={styles.bannerEdit}>
              <Ionicons name="person-circle-outline" size={28} color={Colors.gold} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Estatísticas do mês ── */}
        <CollapsibleStats storageKey="prof-hub-stats" title="Resumo do Mês" color={Colors.gold} headerStyle={{ paddingHorizontal: 16 }}>
          <View style={styles.statsRow}>
            <StatCard value={aulasLecionadas}  label="Aulas Dadas"  color={Colors.info}    icon="book-outline" />
            <StatCard value={sumariosMes.filter(s => s.status === 'pendente').length} label="Pendentes" color={Colors.warning} icon="time-outline" />
            <StatCard value={avaliacoesDadas}  label="Avaliações"   color={Colors.gold}    icon="star-outline" />
            <StatCard value={provasDadas}      label="Provas"       color={Colors.accent}  icon="school-outline" />
          </View>
        </CollapsibleStats>

        {/* ── Charts: Análise Visual ── */}
        {(meusSumarios.length > 0 || minhasTurmas.length > 0) && (
          <>
            <Text style={styles.sectionTitle}>Análise Visual</Text>

            {/* Fila 1: Sumários (donut) + Gauge assiduidade */}
            <View style={styles.chartRow}>
              {meusSumarios.length > 0 && (() => {
                const aceites   = meusSumarios.filter(s => s.status === 'aceite').length;
                const pendentes = meusSumarios.filter(s => s.status === 'pendente').length;
                const rejeitados= meusSumarios.filter(s => s.status === 'rejeitado').length;
                const donutData = [
                  { label: 'Aceites',   value: aceites,    color: Colors.success },
                  { label: 'Pendentes', value: pendentes,  color: Colors.warning },
                  { label: 'Rejeitados',value: rejeitados, color: Colors.danger },
                ].filter(d => d.value > 0);
                return (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartCardTitle}>Sumários</Text>
                    <DonutChart
                      data={donutData}
                      size={148} thickness={22}
                      centerLabel={String(meusSumarios.length)}
                      centerSub="total"
                    />
                  </View>
                );
              })()}

              {minhasTurmas.length > 0 && (() => {
                const totalAlunos = minhasTurmas.reduce((s, t) => s + alunos.filter(a => a.turmaId === t.id && a.ativo).length, 0);
                const totalCap    = minhasTurmas.reduce((s, t) => s + (t.capacidade || 30), 0);
                const taxaOcup    = totalCap > 0 ? Math.round((totalAlunos / totalCap) * 100) : 0;
                const gaugeColor  = taxaOcup >= 90 ? Colors.danger : taxaOcup >= 70 ? Colors.warning : Colors.success;
                return (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartCardTitle}>Ocupação Turmas</Text>
                    <GaugeChart
                      value={taxaOcup} max={100}
                      color={gaugeColor} size={148} thickness={16}
                      label={`${taxaOcup}%`} sublabel="ocupação"
                    />
                    <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                      {totalAlunos} / {totalCap} alunos
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Fila 2: Alunos por turma (horizontal bar) */}
            {minhasTurmas.length > 0 && (
              <View style={[styles.chartCard, { marginHorizontal: 16, width: 'auto' }]}>
                <Text style={styles.chartCardTitle}>Alunos por Turma</Text>
                <HorizontalBarChart
                  data={minhasTurmas.slice(0, 6).map((t, i) => ({
                    label: t.nome,
                    value: alunos.filter(a => a.turmaId === t.id && a.ativo).length,
                    max: t.capacidade || 30,
                    color: [Colors.info, Colors.gold, Colors.accent, Colors.success, '#8B5CF6', Colors.warning][i % 6],
                  }))}
                  width={CHART_W}
                />
              </View>
            )}

            {/* Fila 3: Médias por disciplina (bar chart) */}
            {minhasNotas.length > 0 && (() => {
              const discMap: Record<string, { sum: number; count: number }> = {};
              minhasNotas.forEach(n => {
                const grade = (n as any).nf > 0 ? (n as any).nf : ((n as any).mac || 0);
                if (!grade || grade <= 0) return;
                const disc = (n as any).disciplina || '—';
                if (!discMap[disc]) discMap[disc] = { sum: 0, count: 0 };
                discMap[disc].sum += grade;
                discMap[disc].count++;
              });
              const barData = Object.entries(discMap).slice(0, 6).map(([disc, d], i) => ({
                label: disc.length > 6 ? disc.substring(0, 6) : disc,
                value: parseFloat((d.sum / d.count).toFixed(1)),
                color: [Colors.gold, Colors.info, Colors.accent, Colors.success, Colors.warning, '#8B5CF6'][i % 6],
              }));
              if (barData.length === 0) return null;
              return (
                <View style={[styles.chartCard, { marginHorizontal: 16, width: 'auto', alignItems: 'center' }]}>
                  <Text style={styles.chartCardTitle}>Médias por Disciplina</Text>
                  <BarChart data={barData} maxValue={20} height={160} width={CHART_W} />
                </View>
              );
            })()}
          </>
        )}

        {/* ── Próximas Provas ── */}
        {proximasProvas.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Próximas Provas</Text>
            <View style={styles.provasCard}>
              {proximasProvas.map((p, idx) => {
                const d = new Date(p.data);
                const cor = tipoProvaColor[(p.tipo || '').toLowerCase()] || Colors.textMuted;
                return (
                  <View key={p.id} style={[styles.provaRow, idx === proximasProvas.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.provaColorBar, { backgroundColor: cor }]} />
                    <View style={styles.provaInfo}>
                      <Text style={styles.provaTitulo}>{p.disciplina || 'Disciplina'}</Text>
                      <Text style={styles.provaSub}>{p.turmasIds?.length ? `${p.turmasIds.length} turma(s)` : '—'} · {p.tipo}</Text>
                    </View>
                    <View style={styles.provaDate}>
                      <Text style={[styles.provaDateNum, { color: cor }]}>{d.getDate().toString().padStart(2,'0')}/{(d.getMonth()+1).toString().padStart(2,'0')}</Text>
                      <Text style={styles.provaDateSub}>{p.hora || ''}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Prazos de Lançamento de Notas ── */}
        {(() => {
          if (profPrazosLoading) return null;
          if (profPrazos.length === 0) return null;
          const agora = now;
          const itens = profPrazos.map(p => {
            const di = p.dataInicio ? new Date(p.dataInicio + 'T00:00:00') : null;
            const dl = p.dataLimite ? new Date(p.dataLimite + 'T23:59:59') : null;
            const periodoNaoIniciado = di ? agora < di : false;
            const expirado = dl ? agora > dl : false;
            const emLancamento = !periodoNaoIniciado && !expirado && dl !== null;

            // Calcular ms até ao prazo de fim
            const msRestantes = dl ? Math.max(0, dl.getTime() - agora.getTime()) : null;
            const diasRestantes = msRestantes !== null ? Math.floor(msRestantes / (1000 * 60 * 60 * 24)) : null;
            const horasRestantes = msRestantes !== null ? Math.floor((msRestantes % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : null;

            // Dias até início
            const msAteInicio = di ? Math.max(0, di.getTime() - agora.getTime()) : null;
            const diasAteInicio = msAteInicio !== null ? Math.ceil(msAteInicio / (1000 * 60 * 60 * 24)) : null;

            const minhasNesteTrim = pautas.filter((pa: any) => Number(pa.trimestre) === Number(p.trimestre) && pa.professorId === prof?.id);
            const totalMinhas = minhasNesteTrim.length;
            const fechadasMinhas = minhasNesteTrim.filter((pa: any) => pa.status === 'fechada').length;
            const todasFechadas = totalMinhas > 0 && fechadasMinhas === totalMinhas;

            const cor = todasFechadas
              ? Colors.success
              : expirado ? Colors.danger
              : periodoNaoIniciado ? Colors.textMuted
              : (diasRestantes !== null && diasRestantes <= 3) ? Colors.warning
              : Colors.info;

            return { ...p, di, dl, periodoNaoIniciado, expirado, emLancamento, diasRestantes, horasRestantes, diasAteInicio, totalMinhas, fechadasMinhas, todasFechadas, cor };
          });
          const comAlerta = itens.filter(i => !i.todasFechadas && (i.expirado || (i.emLancamento && i.diasRestantes !== null && i.diasRestantes <= 5)));
          return (
            <>
              <Text style={styles.sectionTitle}>Prazos de Lançamento de Notas</Text>
              {comAlerta.length > 0 && (
                <View style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.warning + '18', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: Colors.warning, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="alert-circle" size={20} color={Colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.warning }}>
                      {comAlerta.length === 1 ? 'Atenção: prazo a aproximar-se!' : `Atenção: ${comAlerta.length} prazos a aproximar-se!`}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.text, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      {comAlerta.map(i => `${i.trimestre}º Trim.${i.expirado ? ' (expirado)' : i.diasRestantes === 0 ? ' (expira hoje)' : ` (${i.diasRestantes}d ${i.horasRestantes}h)`}`).join(' · ')}
                    </Text>
                  </View>
                </View>
              )}
              <View style={{ marginHorizontal: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 4 }}>
                {itens.map((it, idx) => (
                  <View key={it.trimestre} style={[
                    { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
                    idx < itens.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }
                  ]}>
                    {/* Ícone do trimestre */}
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: it.cor + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: it.cor + '44' }}>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: it.cor }}>{it.trimestre}</Text>
                    </View>

                    {/* Informação central */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{it.trimestre}º Trimestre</Text>
                        {it.todasFechadas && (
                          <View style={{ backgroundColor: Colors.success + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' }}>✓ CONCLUÍDO</Text>
                          </View>
                        )}
                        {!it.todasFechadas && it.expirado && (
                          <View style={{ backgroundColor: Colors.danger + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>EXPIRADO</Text>
                          </View>
                        )}
                        {!it.todasFechadas && it.periodoNaoIniciado && (
                          <View style={{ backgroundColor: Colors.textMuted + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_700Bold' }}>EM BREVE</Text>
                          </View>
                        )}
                        {!it.todasFechadas && it.emLancamento && it.diasRestantes !== null && it.diasRestantes <= 3 && (
                          <View style={{ backgroundColor: Colors.warning + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_700Bold' }}>URGENTE</Text>
                          </View>
                        )}
                        {!it.todasFechadas && it.emLancamento && (it.diasRestantes === null || it.diasRestantes > 3) && (
                          <View style={{ backgroundColor: Colors.info + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.info, fontFamily: 'Inter_700Bold' }}>EM LANÇAMENTO</Text>
                          </View>
                        )}
                      </View>

                      {/* Datas início → fim */}
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                        {it.di ? `${it.di.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' })} → ` : ''}
                        {it.dl ? it.dl.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sem prazo'}
                      </Text>

                      {/* Estado do período com countdown */}
                      {it.periodoNaoIniciado && it.diasAteInicio !== null && (
                        <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' }}>
                          Começa em {it.diasAteInicio} dia{it.diasAteInicio !== 1 ? 's' : ''}
                        </Text>
                      )}
                      {it.emLancamento && it.diasRestantes !== null && it.horasRestantes !== null && (
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: it.cor }}>
                          {it.diasRestantes === 0
                            ? `⏱ Expira hoje — ${it.horasRestantes}h restantes`
                            : `⏱ ${it.diasRestantes}d ${it.horasRestantes}h restantes`}
                        </Text>
                      )}
                      {it.expirado && it.dl && (
                        <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular' }}>
                          Expirou em {it.dl.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long' })}
                        </Text>
                      )}

                      {/* Barra de progresso das pautas */}
                      {it.totalMinhas > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={{ flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' }}>
                            <View style={{ width: `${(it.fechadasMinhas / it.totalMinhas) * 100}%`, height: '100%', backgroundColor: it.cor, borderRadius: 2 }} />
                          </View>
                          <Text style={{ fontSize: 10, color: it.cor, fontFamily: 'Inter_600SemiBold' }}>
                            {it.fechadasMinhas}/{it.totalMinhas} pautas
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Botão lançar */}
                    {!it.todasFechadas && !it.periodoNaoIniciado && (
                      <TouchableOpacity
                        onPress={() => router.push('/(main)/professor-pauta' as any)}
                        style={{ backgroundColor: Colors.gold + '22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.gold + '44', alignItems: 'center', gap: 2 }}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="create-outline" size={16} color={Colors.gold} />
                        <Text style={{ fontSize: 9, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>Lançar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </>
          );
        })()}

        {/* Acesso Rápido */}
        <Text style={styles.sectionTitle}>Acesso Rápido</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="document-text" label="Pautas & Notas" route="/(main)/professor-pauta" color={Colors.gold} />
          <QuickAction icon="pulse" label="Av. Diagnóstica" route="/(main)/diagnostica" color="#0ea5e9" />
          <QuickAction icon="leaf" label="Av. Formativa" route="/(main)/formativa" color="#22c55e" />
          {isAdmin && (
            <QuickAction icon="bar-chart" label="Relatório Diagnóstica" route="/(main)/relatorio-diagnostica" color="#8b5cf6" />
          )}
          <TouchableOpacity style={styles.quickAction} onPress={() => setShowActaModal(true)} activeOpacity={0.7}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.info + '22' }]}>
              <Ionicons name="newspaper-outline" size={24} color={Colors.info} />
            </View>
            <Text style={styles.quickActionLabel} numberOfLines={2}>Acta de Provas</Text>
          </TouchableOpacity>
          <QuickAction icon="people" label="Minhas Turmas" route="/(main)/professor-turmas" color={Colors.info} />
          {isDirector && (
            <QuickAction icon="shield-checkmark" label="Director de Turma" route="/(main)/director-turma" color={Colors.gold} />
          )}
          <QuickAction icon="stats-chart" label="Desempenho" route="/(main)/desempenho" color="#8B5CF6" />
          <QuickAction icon="chatbubbles" label="Mensagens" route="/(main)/professor-mensagens" badge={minhasMensagensNaoLidas} color={Colors.success} />
          <QuickAction icon="folder-open" label="Materiais" route="/(main)/professor-materiais" color={Colors.accent} />
          <QuickAction icon="document-text-outline" label="Plano de Aula" route="/(main)/professor-plano-aula" color={Colors.gold} />
          <QuickAction icon="clipboard" label="Sumário / Presença" route="/(main)/professor-sumario" badge={meusSumarios.filter(s => s.status === 'pendente').length} color={Colors.warning} />
          <QuickAction icon="book" label="Diário de Classe" route="/(main)/diario-classe" color={Colors.info} />
          <QuickAction icon="time" label="Horário" route="/(main)/horario" color={Colors.primaryLight} />
          <QuickAction icon="stats-chart-outline" label="Relatório de Faltas" route="/(main)/relatorio-faltas" color={Colors.danger} />
          <QuickAction icon="notifications" label="Notificações" route="/(main)/notificacoes" badge={unreadCount} color={Colors.accent} />
          <QuickAction icon="person" label="Meu Perfil" route="/(main)/perfil" color={Colors.textSecondary} />
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: 16, padding: 18,
    backgroundColor: Colors.backgroundCard, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
  },
  bannerAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.gold,
  },
  bannerAvatarText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#fff' },
  bannerInfo: { flex: 1 },
  bannerGreet: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  bannerName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  bannerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 2 },
  bannerEdit: { padding: 8 },
  tourBtn: {
    backgroundColor: Colors.accent + '18',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accent + '40',
  },
  sectionTitle: {
    fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginHorizontal: 16, marginTop: 16, marginBottom: 10,
  },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  statCard: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.backgroundCard,
    borderRadius: 14, padding: 14,
    borderLeftWidth: 3, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  chartRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, marginBottom: 4,
  },
  chartCard: {
    flex: 1, minWidth: 148,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: 10,
  },
  chartCardTitle: {
    fontSize: 11, fontFamily: 'Inter_700Bold',
    color: Colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, alignSelf: 'flex-start',
  },
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    marginHorizontal: 16,
  },
  quickAction: {
    width: '22%', minWidth: 72, alignItems: 'center', gap: 8,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  qaBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: Colors.accent, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  qaBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  quickActionLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textAlign: 'center' },
  provasCard: { marginHorizontal: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  provaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  provaColorBar: { width: 4, height: 36, borderRadius: 2 },
  provaInfo: { flex: 1 },
  provaTitulo: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  provaSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  provaDate: { alignItems: 'flex-end' },
  provaDateNum: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  provaDateSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, padding: 14,
    backgroundColor: Colors.warning + '18', borderRadius: 14,
    borderWidth: 1, borderColor: Colors.warning + '44',
  },
  alertText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.warning },
  sumCard: { marginHorizontal: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sumStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  sumStatusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  sumDisciplina: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  sumTurma: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  sumData: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});

const sal = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.gold + '44',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  mesNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mesLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold, minWidth: 64, textAlign: 'center' },
  perfilBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  perfilAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.gold + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  perfilNome: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  perfilCargo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  tipoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent + '22', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  tipoText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
  temposBox: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.background, borderRadius: 12, padding: 12, gap: 6,
  },
  temposRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  temposLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  temposVal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.warning + '18', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.warning + '33',
  },
  alertText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.warning },
  breakdown: {
    marginHorizontal: 16, marginBottom: 14, gap: 6,
  },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 },
  bVal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  liquidoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.success + '14', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 4,
    borderWidth: 1, borderColor: Colors.success + '33',
  },
  liquidoLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  liquidoVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success },
  nota: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    marginHorizontal: 16, marginBottom: 14, fontStyle: 'italic',
  },
});

const acta = StyleSheet.create({
  turmaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    width: '100%',
  },
  turmaIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.info + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  turmaNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  turmaSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  steps: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 0,
    marginBottom: 12, width: '100%',
  },
  stepDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  stepLine: {
    flex: 1, maxWidth: 60, height: 2, marginHorizontal: 4,
  },
});

const rab = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 420, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.gold + '44',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  iconRow: { marginBottom: 12 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.gold + '22', borderWidth: 2, borderColor: Colors.gold + '55',
    justifyContent: 'center', alignItems: 'center',
  },
  title: {
    fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text,
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary,
    textAlign: 'center', marginBottom: 16, lineHeight: 20,
  },
  notifRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border,
    width: '100%',
  },
  notifText: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.text, lineHeight: 18,
  },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 13,
    width: '100%', marginTop: 18,
  },
  btnPrimaryText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  btnSecondary: {
    paddingVertical: 10, alignItems: 'center', width: '100%', marginTop: 6,
  },
  btnSecondaryText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
});
