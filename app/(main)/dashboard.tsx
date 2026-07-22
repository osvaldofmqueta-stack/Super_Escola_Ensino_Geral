import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Platform, RefreshControl, Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useFinanceiro, formatAOA } from '@/context/FinanceiroContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useNotificacoes } from '@/context/NotificacoesContext';
import TopBar from '@/components/TopBar';
import { SkeletonDashboard } from '@/components/Skeleton';
import { BarChart, DonutChart } from '@/components/Charts';
import { apiRequest } from '@/lib/query-client';
import { api } from '@/lib/api';
import PendingSolicitacoesModal, { Solicitacao } from '@/components/PendingSolicitacoesModal';
import DevedorQuickActions from '@/components/DevedorQuickActions';
import { buildSmartGreeting } from '@/utils/greetings';
import EmpresaFooter from '@/components/EmpresaFooter';
import NeonStatusBanner from '@/components/NeonStatusBanner';
import CollapsibleStats from '@/components/CollapsibleStats';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import {
  DIRECTOR_TOUR_STEPS, DIRECTOR_TOUR_KEY,
  CONSELHO_PEDAGOGICO_TOUR_STEPS, CONSELHO_PEDAGOGICO_TOUR_KEY,
  CONSELHO_ESCOLA_TOUR_STEPS, CONSELHO_ESCOLA_TOUR_KEY,
} from '@/constants/tourSteps';

const { width } = Dimensions.get('window');
const isCompact = width < 390;
const CHART_W = Math.min(width - (isCompact ? 32 : 64), 360);


// ── Painel de Aniversariantes ──────────────────────────────────────────────
interface Aniversariante { id: string; nome: string; role: string; avatar: string | null; genero: string | null; idade: number | null; }

const ROLE_LABEL: Record<string, string> = {
  aluno: 'Aluno', professor: 'Prof.', funcionario: 'Func.',
  admin: 'Admin', director: 'Director', ceo: 'CEO',
  pca: 'PCA', pedagogico: 'Ped.', rh: 'RH',
  financeiro: 'Fin.', chefe_secretaria: 'Secr.', secretaria: 'Secr.',
  encarregado: 'Enc.',
};

function BirthdayBanner({ pessoas }: { pessoas: Aniversariante[] }) {
  if (pessoas.length === 0) return null;
  const primeiroNome = (nome: string) => nome.split(' ')[0];
  const avatarBg = (genero: string | null, role: string) => {
    if (genero === 'F') return '#d63384';
    if (genero === 'M') return '#0d6efd';
    return role === 'aluno' ? Colors.primary : '#6c757d';
  };
  return (
    <View style={{
      marginHorizontal: 16, marginTop: 14, marginBottom: 4,
      borderRadius: 14, overflow: 'hidden',
      borderWidth: 1.5, borderColor: Colors.gold + '55',
      backgroundColor: Colors.gold + '10',
    }}>
      {/* Cabeçalho */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
        borderBottomWidth: 1, borderBottomColor: Colors.gold + '22',
      }}>
        <Text style={{ fontSize: 18 }}>🎂</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.gold }}>
            Aniversariantes de Hoje
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>
            {pessoas.length} {pessoas.length === 1 ? 'pessoa celebra' : 'pessoas celebram'} hoje
          </Text>
        </View>
        <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.gold }}>{pessoas.length}</Text>
        </View>
      </View>
      {/* Scroll horizontal de avatares */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 16, flexDirection: 'row' }}
      >
        {pessoas.map(p => (
          <View key={p.id} style={{ alignItems: 'center', gap: 5, width: 58 }}>
            {/* Círculo com avatar/foto */}
            <View style={{ position: 'relative' }}>
              <View style={{
                width: 50, height: 50, borderRadius: 25,
                borderWidth: 2.5, borderColor: Colors.gold,
                overflow: 'hidden',
                backgroundColor: avatarBg(p.genero, p.role),
                alignItems: 'center', justifyContent: 'center',
              }}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={{ width: 50, height: 50, resizeMode: 'cover' }} />
                ) : (
                  <Ionicons
                    name={p.genero === 'F' ? 'person' : 'person'}
                    size={26}
                    color="#fff"
                  />
                )}
              </View>
              {/* Badge de idade */}
              {p.idade !== null && p.idade > 0 && (
                <View style={{
                  position: 'absolute', top: -3, right: -5,
                  backgroundColor: Colors.gold, borderRadius: 8,
                  paddingHorizontal: 5, paddingVertical: 1.5,
                  borderWidth: 1.5, borderColor: Colors.surface,
                }}>
                  <Text style={{ fontSize: 8, color: '#000', fontFamily: 'Inter_700Bold' }}>{p.idade}</Text>
                </View>
              )}
            </View>
            {/* Nome */}
            <Text style={{ fontSize: 10, color: Colors.text, fontFamily: 'Inter_600SemiBold', textAlign: 'center', lineHeight: 13 }} numberOfLines={2}>
              {primeiroNome(p.nome)}
            </Text>
            {/* Papel */}
            <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 8, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>
                {ROLE_LABEL[p.role] ?? p.role}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ label, color, action, actionLabel }: { label: string; color: string; action?: () => void; actionLabel?: string }) {
  return (
    <View style={st.sectionHeader}>
      <View style={st.sectionTitleRow}>
        <View style={[st.sectionBar, { backgroundColor: color }]} />
        <Text style={st.sectionLabel}>{label}</Text>
      </View>
      {action && (
        <TouchableOpacity onPress={action}>
          <Text style={[st.seeAll, { color }]}>{actionLabel ?? 'Ver mais'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function KpiCard({ label, value, sub, color, icon, onPress }: {
  label: string; value: string | number; sub?: string; color: string; icon: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[st.kpiCard, { borderTopColor: color }]}
      activeOpacity={onPress ? 0.65 : 1}
      onPress={onPress}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        <View style={[st.kpiIcon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={24} color={color} />
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={12} color={color + '88'} style={{ marginTop: 2 }} />
        )}
      </View>
      <Text style={[st.kpiValue, { color }]}>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
      {sub ? <Text style={st.kpiSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

function BoldKpiCard({ label, value, sub, color, icon, onPress }: {
  label: string; value: string | number; sub?: string; color: string; icon: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[st.boldKpiCard, { borderColor: color + '33', backgroundColor: color + '08' }]}
      activeOpacity={onPress ? 0.65 : 1}
      onPress={onPress}
    >
      <View style={[st.boldKpiAccent, { backgroundColor: color }]} />
      <View style={st.boldKpiInner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Ionicons name={icon as any} size={15} color={color} />
          <Text style={[st.boldKpiLabel, { color: Colors.textMuted }]}>{label}</Text>
          {onPress && <Ionicons name="chevron-forward" size={10} color={color + '88'} style={{ marginLeft: 'auto' as any }} />}
        </View>
        <Text style={[st.boldKpiValue, { color: Colors.text }]}>{value}</Text>
        {sub && <Text style={[st.boldKpiSub, { color }]}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function GenderBar({ masculino, feminino, total }: { masculino: number; feminino: number; total: number }) {
  if (total === 0) return null;
  const mPct = Math.round((masculino / total) * 100);
  const fPct = 100 - mPct;
  return (
    <View style={st.genderWrap}>
      <View style={st.genderBarRow}>
        <View style={[st.genderSegM, { flex: masculino || 0.001 }]} />
        <View style={[st.genderSegF, { flex: feminino || 0.001 }]} />
      </View>
      <View style={st.genderLegRow}>
        <View style={st.genderLegItem}>
          <View style={[st.genderDot, { backgroundColor: Colors.info }]} />
          <Text style={st.genderTxt}>Masculino {mPct}% ({masculino})</Text>
        </View>
        <View style={st.genderLegItem}>
          <View style={[st.genderDot, { backgroundColor: '#EC4899' }]} />
          <Text style={st.genderTxt}>Feminino {fPct}% ({feminino})</Text>
        </View>
      </View>
    </View>
  );
}

function QuickActions({ actions }: { actions: { label: string; icon: string; route: string; color: string; badge?: number }[] }) {
  const router = useRouter();
  return (
    <View style={st.qaGrid}>
      {actions.map(qa => (
        <TouchableOpacity
          key={qa.label}
          style={[st.qaBtn, { borderColor: qa.color + '33' }]}
          onPress={() => router.push(qa.route as any)}
          activeOpacity={0.7}
        >
          <View style={[st.qaIcon, { backgroundColor: qa.color + '1A' }]}>
            <Ionicons name={qa.icon as any} size={22} color={qa.color} />
            {!!qa.badge && qa.badge > 0 && (
              <View style={st.qaBadge}>
                <Text style={st.qaBadgeText}>{qa.badge > 99 ? '99+' : String(qa.badge)}</Text>
              </View>
            )}
          </View>
          <Text style={st.qaLabel}>{qa.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function EventCard({ evento, onPress, eventoTypeColor }: { evento: any; onPress: () => void; eventoTypeColor: (t: string) => string }) {
  return (
    <TouchableOpacity style={st.eventCard} activeOpacity={0.7} onPress={onPress}>
      <View style={[st.eventBar, { backgroundColor: eventoTypeColor(evento.tipo) }]} />
      <View style={st.eventBody}>
        <Text style={st.eventTitle} numberOfLines={1}>{evento.titulo}</Text>
        <Text style={st.eventDate}>{evento.data} · {evento.hora} · {evento.local}</Text>
      </View>
      <View style={[st.eventBadge, { backgroundColor: eventoTypeColor(evento.tipo) + '22' }]}>
        <Text style={[st.eventBadgeText, { color: eventoTypeColor(evento.tipo) }]}>{evento.tipo}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface Registro { id: string; status: string; matriculaCompleta?: boolean; }
interface Funcionario { id: string; nome: string; apelido: string; departamento: string; cargo: string; ativo: boolean; tipoContrato: string; }

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();

  const { user } = useAuth();
  const { alunos, professores, turmas, notas, eventos, presencas, isLoading } = useData();
  const { getPagamentosAluno, getMesesEmAtraso, taxas, isAlunoBloqueado, pagamentos, getTotalRecebido, getTotalPendente, calcularMulta, multaConfig } = useFinanceiro();
  const [alunoSaldo, setAlunoSaldo] = useState<number>(0);
  const { pautas, sumarios, materiais, mensagens } = useProfessor();
  const { anoSelecionado } = useAnoAcademico();
  const { load: reloadNotificacoes } = useNotificacoes();

  // Secção activa do painel do professor: 'painel' = Acesso Rápido, 'resumo' = O Meu Resumo
  // Só actualiza quando o param da URL muda explicitamente (não reseta ao voltar de outra página)
  const [profSection, setProfSection] = useState<'painel' | 'resumo'>(
    sectionParam === 'resumo' ? 'resumo' : 'painel'
  );
  const prevSectionParam = useRef(sectionParam);
  useEffect(() => {
    if (sectionParam !== undefined && sectionParam !== prevSectionParam.current) {
      prevSectionParam.current = sectionParam;
      setProfSection(sectionParam === 'resumo' ? 'resumo' : 'painel');
    }
  }, [sectionParam]);

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loadingReg, setLoadingReg] = useState(false);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<Solicitacao[]>([]);
  const [showSolicitacoesModal, setShowSolicitacoesModal] = useState(false);
  const [devedorSheet, setDevedorSheet] = useState<{ alunoId: string; nome: string; turma: string; meses: number; valor: number } | null>(null);
  const manuallyClosedRef = useRef(false);
  const [aiStatus, setAiStatus] = useState<{ configured: boolean; provider: string | null; model: string | null } | null>(null);
  const [aiFeedback, setAiFeedback] = useState<{ up: number; down: number } | null>(null);
  const [sessoesStats, setSessoesStats] = useState<{ total: number; online: number } | null>(null);
  const [aniversarios, setAniversarios] = useState<Aniversariante[]>([]);
  const [exameBadge, setExameBadge] = useState(0);
  const [reapreciacaoBadge, setReapreciacaoBadge] = useState(0);

  const role = user?.role || '';

  // ── Tour guiado — Director / Conselho Pedagógico / Conselho Escola ──────────
  let TOUR_STEPS = DIRECTOR_TOUR_STEPS;
  let TOUR_KEY = DIRECTOR_TOUR_KEY;
  if (role === 'membro_conselho_pedagogico') { TOUR_STEPS = CONSELHO_PEDAGOGICO_TOUR_STEPS; TOUR_KEY = CONSELHO_PEDAGOGICO_TOUR_KEY; }
  else if (role === 'membro_conselho_escola') { TOUR_STEPS = CONSELHO_ESCOLA_TOUR_STEPS; TOUR_KEY = CONSELHO_ESCOLA_TOUR_KEY; }

  const isTourRole = role === 'director' || role === 'membro_conselho_pedagogico' || role === 'membro_conselho_escola';
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(TOUR_KEY);

  useEffect(() => {
    if (!isTourRole) return;
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  // Gera alertas automáticos no backend ao entrar no dashboard (1x por sessão)
  const alertsGeneratedRef = useRef(false);
  useEffect(() => {
    if (!role || alertsGeneratedRef.current) return;
    const ROLES_COM_ALERTAS = ['financeiro','pedagogico','rh','pca','ceo','admin','director'];
    if (!ROLES_COM_ALERTAS.includes(role)) return;
    alertsGeneratedRef.current = true;
    apiRequest('POST', '/api/notificacoes/gerar-alertas', {}, { skipQueue: true })
      .then(() => reloadNotificacoes())
      .catch(() => {}); // silencia erros — não bloqueia UI
  }, [role]);

  // Badge de matrículas condicionais pendentes — visível no botão Pedagógico
  useEffect(() => {
    const ROLES_BADGE = ['ceo', 'pca', 'admin', 'director', 'pedagogico'];
    if (!role || !ROLES_BADGE.includes(role)) return;
    apiRequest('GET', '/api/exames-extraordinarios/estatisticas')
      .then((data: any) => {
        const n = parseInt(String(data?.alunosCondicionais ?? '0'), 10);
        if (!isNaN(n) && n > 0) setExameBadge(n);
      })
      .catch(() => {});
  }, [role]);

  // Badge de pedidos de reapreciação pendentes (Art. 38º Decreto 04/2026)
  useEffect(() => {
    const ROLES_REAP = ['ceo', 'pca', 'admin', 'director', 'pedagogico'];
    if (!role || !ROLES_REAP.includes(role)) return;
    apiRequest('GET', '/api/pedidos-reapreciacao/stats')
      .then((data: any) => {
        const n = parseInt(String(data?.pendentes ?? '0'), 10);
        if (!isNaN(n) && n > 0) setReapreciacaoBadge(n);
      })
      .catch(() => {});
  }, [role]);

  const isAluno = role === 'aluno';
  const isProfessor = role === 'professor';
  const isEncarregado = role === 'encarregado';
  const isDirector = role === 'director';
  // Perfis especializados — têm painel próprio no dashboard
  const isFinanceiroOnly = role === 'financeiro';
  const isPedagogicoOnly = role === 'pedagogico';
  const isRhOnly = role === 'rh';
  // Admin genérico — não inclui perfis especializados (têm painel próprio)
  const isAdminRole = ['ceo', 'pca', 'admin', 'chefe_secretaria', 'secretaria'].includes(role);
  const isSecretariaRole = ['chefe_secretaria', 'secretaria'].includes(role);
  const isRhViewer = ['ceo', 'pca', 'admin', 'director'].includes(role);
  const isFinanceRole = ['pca', 'ceo', 'admin', 'financeiro'].includes(role);

  const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();

  // Aniversariantes do dia — carrega para todos os perfis com excepção de encarregado
  useEffect(() => {
    if (role === 'encarregado' || !role) return;
    apiRequest('GET', '/api/aniversarios-hoje')
      .then(r => r.json())
      .then((d: any) => setAniversarios(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    if (!isAdminRole && !isPedagogicoOnly) return;
    setLoadingReg(true);
    apiRequest('GET', '/api/registros')
      .then(r => r.json())
      .then((data: Registro[]) => setRegistros(Array.isArray(data) ? data : []))
      .catch(() => setRegistros([]))
      .finally(() => setLoadingReg(false));
  }, [isAdminRole, isPedagogicoOnly]);

  useEffect(() => {
    const isManagerRole = ['admin', 'ceo', 'pca', 'director'].includes(role);
    if (!isManagerRole) return;
    apiRequest('GET', '/api/ai-status').then(r => r.json()).then(setAiStatus).catch(() => {});
    apiRequest('GET', '/api/ai-feedback/stats').then(r => r.json()).then(setAiFeedback).catch(() => {});
    apiRequest('GET', '/api/sessoes/ativas').then(r => r.json()).then((d: any) => {
      if (d && typeof d.total === 'number') setSessoesStats({ total: d.total, online: d.online });
    }).catch(() => {});
  }, [role]);

  useEffect(() => {
    if (!isRhViewer && !isRhOnly) return;
    apiRequest('GET', '/api/funcionarios')
      .then(r => r.json())
      .then((data: Funcionario[]) => setFuncionarios(Array.isArray(data) ? data : []))
      .catch(() => setFuncionarios([]));
  }, [isRhViewer, isRhOnly]);

  // Solicitações pendentes — re-verifica cada vez que o ecrã fica em foco
  useFocusEffect(
    useCallback(() => {
      if (!isSecretariaRole) return;
      manuallyClosedRef.current = false;
      apiRequest('GET', '/api/solicitacoes-documentos?status=pendente,em_processamento')
        .then(r => r.json())
        .then((data: Solicitacao[]) => {
          const list = Array.isArray(data) ? data : [];
          setSolicitacoesPendentes(list);
          if (list.length > 0 && !manuallyClosedRef.current) {
            setTimeout(() => setShowSolicitacoesModal(true), 600);
          }
        })
        .catch(() => {});
    }, [isSecretariaRole])
  );

  const eventoTypeColor = (tipo: string) => ({
    'Académico': Colors.info, 'Cultural': Colors.gold, 'Desportivo': Colors.success,
    'Exame': Colors.danger, 'Feriado': Colors.warning, 'Reunião': Colors.textSecondary,
  }[tipo] || Colors.textMuted);

  // ── Dados específicos do ALUNO ──────────────────────────────────────
  const alunoData = useMemo(() => {
    if (!isAluno && !isEncarregado) return null;
    const aluno = alunos.find(a =>
      (user?.alunoId && a.id === user.alunoId) ||
      (a.utilizadorId && user?.id && a.utilizadorId === user.id)
    ) ?? alunos.find(a =>
      a.nome.toLowerCase().includes(user?.nome?.split(' ')[0]?.toLowerCase() || '')
    );
    if (!aluno) return null;
    const turmaAluno = turmas.find(t => t.id === aluno.turmaId);
    const notasAluno = notas.filter(n => n.alunoId === aluno.id && n.anoLetivo === anoLetivo && n.lancado === true);
    const presAluno = presencas.filter(p => p.alunoId === aluno.id);
    const pagamentosAluno = getPagamentosAluno(aluno.id);
    const mesesAtraso = getMesesEmAtraso(aluno.id, anoLetivo);
    const bloqueado = isAlunoBloqueado(aluno.id);
    const taxaPropina = taxas.find(t => t.tipo === 'propina' && t.ativo);
    const mediaGeral = notasAluno.length > 0
      ? (notasAluno.reduce((s, n) => s + (n.nf || n.mac || 0), 0) / notasAluno.length).toFixed(1)
      : '—';
    const pctPresenca = presAluno.length > 0
      ? Math.round((presAluno.filter(p => p.status === 'P').length / presAluno.length) * 100)
      : 100;
    const aprovadas = notasAluno.filter(n => n.nf >= 10).length;
    const reprovadas = notasAluno.filter(n => n.nf > 0 && n.nf < 10).length;
    const disciplinasComNota = [...new Set(notasAluno.map(n => n.disciplina))];
    const eventosAluno = turmaAluno
      ? eventos.filter(e => e.turmasIds?.includes(turmaAluno.id) || !e.turmasIds?.length)
          .filter(e => e.data >= new Date().toISOString().split('T')[0])
          .sort((a, b) => a.data.localeCompare(b.data))
          .slice(0, 3)
      : [];
    const valorPropina = Number(taxaPropina?.valor || 0);
    const multa = calcularMulta(valorPropina, mesesAtraso);
    const totalDevido = mesesAtraso * valorPropina + multa;
    return {
      aluno, turmaAluno, notasAluno, presAluno, pagamentosAluno,
      mesesAtraso, bloqueado, taxaPropina, valorPropina, multa, totalDevido,
      mediaGeral, pctPresenca, aprovadas, reprovadas,
      disciplinasComNota, eventosAluno,
    };
  }, [isAluno, isEncarregado, alunos, user, turmas, notas, presencas, eventos, anoLetivo, getPagamentosAluno, getMesesEmAtraso, isAlunoBloqueado, taxas, calcularMulta]);

  // Carrega saldo do aluno (não vem no contexto para role=aluno)
  useEffect(() => {
    const alunoId = alunoData?.aluno?.id;
    if (!alunoId) return;
    let cancel = false;
    api.get<{ saldo?: number }>(`/api/saldo-alunos/${alunoId}`)
      .then(r => { if (!cancel) setAlunoSaldo(Number((r as any)?.saldo ?? 0)); })
      .catch(() => { if (!cancel) setAlunoSaldo(0); });
    return () => { cancel = true; };
  }, [alunoData?.aluno?.id, pagamentos.length]);

  // ── Dados específicos do PROFESSOR ─────────────────────────────────
  const professorData = useMemo(() => {
    if (!isProfessor) return null;
    const prof = professores.find(p => p.utilizadorId === user?.id)
      ?? professores.find(p =>
        p.nome.toLowerCase() === (user?.nome || '').split(' ')[0].toLowerCase()
      );
    if (!prof) return null;
    const minhasTurmas = turmas.filter(t =>
      (prof.turmasIds?.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo
    );
    const totalAlunos = minhasTurmas.reduce((s, t) => {
      return s + alunos.filter(a => a.turmaId === t.id && a.ativo).length;
    }, 0);
    const mesAtual = new Date().getMonth() + 1;
    const anoAtual = new Date().getFullYear();
    const sumariosDoMes = sumarios.filter(s => {
      if (s.professorId !== prof.id) return false;
      const d = new Date(s.data);
      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
    });
    const pautasProf = pautas.filter(p => p.professorId === prof.id);
    const pautasAbertas = pautasProf.filter(p => p.status === 'aberta');
    const materiaisProf = materiais.filter(m => m.professorId === prof.id);
    const mensagensNaoLidas = mensagens.filter(m =>
      !m.lidaPor.includes(user?.id || '') &&
      minhasTurmas.some(t => t.id === m.turmaId)
    );
    const proximosEventos = eventos
      .filter(e => {
        const hoje = new Date().toISOString().split('T')[0];
        return e.data >= hoje && minhasTurmas.some(t => e.turmasIds?.includes(t.id));
      })
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 3);
    return {
      prof, minhasTurmas, totalAlunos,
      sumariosDoMes, pautasAbertas, materiaisProf,
      mensagensNaoLidas, proximosEventos,
    };
  }, [isProfessor, professores, user, turmas, alunos, sumarios, pautas, materiais, mensagens, eventos]);

  // ── Dados ADMIN / DIRECTOR / PEDAGÓGICO ─────────────────────────────
  const adminData = useMemo(() => {
    if (!isAdminRole && !isDirector && !isPedagogicoOnly) return null;
    const alunosAtivos = alunos.filter(a => a.ativo);
    const profsAtivos   = professores.filter(p => p.ativo);
    const turmasAtivas  = turmas.filter(t => t.ativo);
    const totalCap = turmasAtivas.reduce((s, t) => s + (t.capacidade || 0), 0);
    const taxaOcupacao = totalCap > 0 ? Math.round((alunosAtivos.length / totalCap) * 100) : 0;
    const taxaAprov = notas.length
      ? Math.round((notas.filter(n => (n.nf > 0 ? n.nf : n.mac) >= 10).length / notas.length) * 100)
      : 0;
    const mediaGeral = notas.length
      ? (notas.reduce((s, n) => s + (n.nf > 0 ? n.nf : n.mac), 0) / notas.length).toFixed(1)
      : '—';
    const masculino = alunosAtivos.filter(a => a.genero === 'M').length;
    const feminino  = alunosAtivos.filter(a => a.genero === 'F').length;
    const matriculasPorNivel: { label: string; value: number; color: string }[] = [];
    const nivelMapa: Record<string, number> = {};
    alunosAtivos.forEach(a => {
      const t = turmasAtivas.find(t => t.id === a.turmaId);
      const nivel = t?.nivel ?? 'Sem Turma';
      nivelMapa[nivel] = (nivelMapa[nivel] || 0) + 1;
    });
    const COLORS: Record<string, string> = {
      'Primário': Colors.success, 'I Ciclo': Colors.info, 'II Ciclo': '#8B5CF6', 'Sem Turma': Colors.textMuted,
    };
    Object.entries(nivelMapa).forEach(([label, value]) =>
      matriculasPorNivel.push({ label, value, color: COLORS[label] ?? Colors.gold })
    );
    const alunosPorTurno: { label: string; value: number; color: string }[] = [];
    const turnoMapa: Record<string, number> = { 'Manhã': 0, 'Tarde': 0, 'Noite': 0 };
    alunosAtivos.forEach(a => {
      const t = turmasAtivas.find(t => t.id === a.turmaId);
      const turno = t?.turno ?? 'Manhã';
      turnoMapa[turno] = (turnoMapa[turno] || 0) + 1;
    });
    const TURNO_COLORS: Record<string, string> = { 'Manhã': Colors.gold, 'Tarde': Colors.info, 'Noite': '#8B5CF6' };
    Object.entries(turnoMapa).filter(([, v]) => v > 0).forEach(([label, value]) =>
      alunosPorTurno.push({ label, value, color: TURNO_COLORS[label] ?? Colors.textMuted })
    );
    const ocupacaoPorTurma = turmasAtivas.map(t => {
      const count = alunosAtivos.filter(a => a.turmaId === t.id).length;
      const cap = t.capacidade || 30;
      return { nome: t.nome, count, cap, pct: Math.min(count / cap, 1) };
    }).sort((a, b) => b.count - a.count).slice(0, 8);
    const hoje = new Date(); const semAgo = new Date(hoje); semAgo.setDate(hoje.getDate() - 7);
    const recentes = presencas.filter(p => { const d = new Date(p.data); return d >= semAgo && d <= hoje; });
    const presentes = recentes.filter(p => p.status === 'P').length;
    const faltas = recentes.filter(p => p.status === 'F').length;
    const justif = recentes.filter(p => p.status === 'J').length;
    const taxaP = recentes.length > 0 ? Math.round((presentes / recentes.length) * 100) : 0;
    const estadosAdmissao: { label: string; value: number; color: string }[] = [];
    const admMapa: Record<string, number> = {};
    registros.forEach(r => { admMapa[r.status] = (admMapa[r.status] || 0) + 1; });
    const ADM_CONFIG: Record<string, { label: string; color: string }> = {
      pendente: { label: 'Pendente', color: Colors.warning },
      aprovado: { label: 'Aprovado', color: Colors.info },
      admitido: { label: 'Admitido', color: Colors.success },
      matriculado: { label: 'Matriculado', color: '#8B5CF6' },
      rejeitado: { label: 'Rejeitado', color: Colors.danger },
      reprovado_admissao: { label: 'Reprovado', color: Colors.textMuted },
    };
    Object.entries(admMapa).filter(([, v]) => v > 0).forEach(([status, value]) =>
      estadosAdmissao.push({ label: ADM_CONFIG[status]?.label ?? status, value, color: ADM_CONFIG[status]?.color ?? Colors.gold })
    );
    const desempenhoPorDisciplina = (() => {
      const discs = [...new Set(notas.map(n => n.disciplina))].slice(0, 6);
      const DISC_COLORS = [Colors.gold, Colors.accent, Colors.info, Colors.success, Colors.warning, '#8B5CF6'];
      return discs.map((d, i) => {
        const dn = notas.filter(n => n.disciplina === d);
        const media = dn.reduce((s, n) => s + (n.nf > 0 ? n.nf : n.mac), 0) / dn.length;
        return { label: d.length > 6 ? d.substring(0, 6) : d, value: parseFloat(media.toFixed(1)), color: DISC_COLORS[i % DISC_COLORS.length] };
      });
    })();
    const proximosEventos = eventos
      .filter(e => e.data >= new Date().toISOString().split('T')[0])
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 3);

    // ── Alunos em risco por assiduidade (<75%) ──────────────────────
    const presencaByAluno: Record<string, { total: number; faltas: number }> = {};
    presencas.forEach(p => {
      const k = String(p.alunoId);
      if (!presencaByAluno[k]) presencaByAluno[k] = { total: 0, faltas: 0 };
      presencaByAluno[k].total++;
      if (p.status === 'F') presencaByAluno[k].faltas++;
    });
    const alunosRiscoAssiduidade = Object.entries(presencaByAluno)
      .filter(([, d]) => d.total >= 5 && d.faltas / d.total > 0.25)
      .map(([alunoId, d]) => {
        const al = alunos.find(a => String(a.id) === alunoId);
        const turma = al ? turmasAtivas.find(t => String(t.id) === String(al.turmaId)) : undefined;
        return {
          id: alunoId,
          nome: al ? `${al.nome} ${al.apelido ?? ''}`.trim() : '—',
          turma: turma?.nome ?? '—',
          taxa: Math.round((1 - d.faltas / d.total) * 100),
          faltas: d.faltas,
          total: d.total,
        };
      })
      .filter(d => d.nome !== '—')
      .sort((a, b) => a.taxa - b.taxa)
      .slice(0, 6);

    // ── Alunos em risco por notas baixas (média <10) ────────────────
    const notasByAluno: Record<string, { sum: number; count: number }> = {};
    notas.forEach(n => {
      const grade = n.nf > 0 ? n.nf : n.mac;
      if (!grade || grade <= 0) return;
      const k = String(n.alunoId);
      if (!notasByAluno[k]) notasByAluno[k] = { sum: 0, count: 0 };
      notasByAluno[k].sum += grade;
      notasByAluno[k].count++;
    });
    const alunosRiscoNotas = Object.entries(notasByAluno)
      .filter(([, d]) => d.count >= 2 && d.sum / d.count < 10)
      .map(([alunoId, d]) => {
        const al = alunos.find(a => String(a.id) === alunoId);
        const turma = al ? turmasAtivas.find(t => String(t.id) === String(al.turmaId)) : undefined;
        return {
          id: alunoId,
          nome: al ? `${al.nome} ${al.apelido ?? ''}`.trim() : '—',
          turma: turma?.nome ?? '—',
          media: parseFloat((d.sum / d.count).toFixed(1)),
        };
      })
      .filter(d => d.nome !== '—')
      .sort((a, b) => a.media - b.media)
      .slice(0, 6);

    return {
      alunosAtivos, profsAtivos, turmasAtivas,
      totalCap, taxaOcupacao, taxaAprov, mediaGeral, masculino, feminino,
      matriculasPorNivel, alunosPorTurno, ocupacaoPorTurma,
      presentes, faltas, justif, taxaP, presencaTotal: recentes.length,
      estadosAdmissao, desempenhoPorDisciplina, proximosEventos,
      alunosRiscoAssiduidade, alunosRiscoNotas,
    };
  }, [isAdminRole, isDirector, isPedagogicoOnly, alunos, professores, turmas, notas, presencas, eventos, registros]);

  const refreshing = isLoading || loadingReg;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={st.screen}>
      {isTourRole && (
        <GuidedTour visible={tourVisible} onClose={closeTour} steps={TOUR_STEPS} storageKey={TOUR_KEY} />
      )}
      <TopBar
        title="Painel Principal"
        hideNameInGreeting
      />
      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.content, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} colors={[Colors.gold]} tintColor={Colors.gold} />}
      >
        {isLoading && alunos.length === 0 && <SkeletonDashboard />}

        {/* ── Aniversariantes do dia ─────────────────────────────── */}
        <BirthdayBanner pessoas={aniversarios} />

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO ALUNO                                            */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isAluno && alunoData && (
          <>
            {/* Cartão de identidade resumido */}
            <View style={st.alunoIdentCard}>
              {(() => {
                const foto = (user as any)?.avatar || alunoData.aluno.foto;
                const initials = `${alunoData.aluno.nome.charAt(0)}${alunoData.aluno.apelido?.charAt(0) || ''}`;
                return foto ? (
                  <Image source={{ uri: foto }} style={st.alunoAvatar} />
                ) : (
                  <View style={[st.alunoAvatar, { backgroundColor: Colors.primary }]}>
                    <Text style={st.alunoAvatarText}>{initials}</Text>
                  </View>
                );
              })()}
              <View style={st.alunoIdentInfo}>
                <Text style={st.alunoIdentNome}>{alunoData.aluno.nome} {alunoData.aluno.apelido}</Text>
                <Text style={st.alunoIdentMat}>{alunoData.aluno.numeroMatricula}</Text>
                {alunoData.turmaAluno && (
                  <View style={st.alunoIdentTurmaRow}>
                    <Ionicons name="school-outline" size={12} color={Colors.gold} />
                    <Text style={st.alunoIdentTurma}>
                      {alunoData.turmaAluno.nome} · {alunoData.turmaAluno.turno} · {alunoData.turmaAluno.anoLetivo}
                    </Text>
                  </View>
                )}
              </View>
              {alunoData.bloqueado && (
                <View style={st.bloqueadoBadge}>
                  <Ionicons name="lock-closed" size={12} color={Colors.danger} />
                  <Text style={st.bloqueadoText}>Bloqueado</Text>
                </View>
              )}
            </View>

            {/* KPIs pessoais */}
            <View style={st.section}>
              <SectionTitle
                label="Resumo Académico"
                color={Colors.gold}
                action={() => router.push('/(main)/portal-estudante')}
                actionLabel="Ver Portal"
              />
              {alunoData.mediaGeral === '—' && alunoData.aprovadas === 0 ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, padding: 14 }}
                  activeOpacity={0.7}
                  onPress={() => router.push('/(main)/portal-estudante')}
                >
                  <Ionicons name="book-outline" size={20} color={Colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>Notas ainda não publicadas</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>Assim que o professor lançar as notas, verás a tua média aqui.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <View style={st.kpiGrid}>
                  <KpiCard
                    label="Média Geral"
                    value={alunoData.mediaGeral}
                    sub="escala 0–20"
                    color={alunoData.mediaGeral === '—' ? Colors.textMuted : Number(alunoData.mediaGeral) >= 10 ? Colors.success : Colors.danger}
                    icon="ribbon"
                    onPress={() => router.push('/(main)/portal-estudante')}
                  />
                  <KpiCard
                    label="Presenças"
                    value={`${alunoData.pctPresenca}%`}
                    sub={alunoData.presAluno.length === 0 ? 'sem registos' : `${alunoData.presAluno.filter((p: any) => p.status === 'P').length} presentes`}
                    color={alunoData.presAluno.length === 0 ? Colors.textMuted : alunoData.pctPresenca >= 75 ? Colors.success : Colors.danger}
                    icon="checkmark-circle"
                    onPress={() => router.push('/(main)/portal-estudante')}
                  />
                  <KpiCard
                    label="Aprovadas"
                    value={alunoData.aprovadas}
                    sub="disciplinas"
                    color={alunoData.aprovadas > 0 ? Colors.success : Colors.textMuted}
                    icon="trophy"
                    onPress={() => router.push('/(main)/portal-estudante')}
                  />
                  <KpiCard
                    label="Reprovadas"
                    value={alunoData.reprovadas}
                    sub="disciplinas"
                    color={alunoData.reprovadas > 0 ? Colors.danger : Colors.textMuted}
                    icon="close-circle"
                    onPress={() => router.push('/(main)/portal-estudante')}
                  />
                </View>
              )}
            </View>

            {/* Estado financeiro — Resumo completo (saldo, multa, total em dívida) */}
            {(() => {
              const finCor = alunoData.mesesAtraso > 0 ? Colors.danger : Colors.success;
              const finIcon = alunoData.mesesAtraso > 0 ? 'alert-circle' : 'checkmark-circle';
              const finTitulo = alunoData.mesesAtraso > 0 ? 'Propinas em atraso' : 'Propinas em dia';
              const finSub = alunoData.mesesAtraso > 0
                ? `${alunoData.mesesAtraso} ${alunoData.mesesAtraso === 1 ? 'mês' : 'meses'} em falta · Acede ao portal para pagar`
                : `Situação regularizada para o ano lectivo ${anoLetivo}`;
              const diaInicioMulta = Number((multaConfig as any)?.diaInicioMulta || 10);
              return (
                <View style={st.section}>
                  <SectionTitle
                    label="Estado Financeiro"
                    color={finCor}
                    action={() => router.push('/(main)/portal-estudante')}
                    actionLabel={alunoData.mesesAtraso > 0 ? 'Ver pagamentos' : 'Ver detalhes'}
                  />
                  <View style={[st.alertCard, { borderColor: finCor + '44', backgroundColor: finCor + '10', flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                    {/* Estado */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name={finIcon as any} size={22} color={finCor} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.alertTitle, { color: finCor }]}>{finTitulo}</Text>
                        <Text style={st.alertSub}>{finSub}</Text>
                      </View>
                    </View>

                    {/* Cards: Saldo + Meses + Multa */}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ flex: 1, minWidth: 110, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 }}>
                        <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Saldo</Text>
                        <Text style={{ fontSize: 16, color: alunoSaldo > 0 ? Colors.success : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{formatAOA(alunoSaldo)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 110, backgroundColor: alunoData.mesesAtraso > 0 ? Colors.danger + '10' : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: alunoData.mesesAtraso > 0 ? Colors.danger + '40' : Colors.border, padding: 10 }}>
                        <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Meses em atraso</Text>
                        <Text style={{ fontSize: 16, color: alunoData.mesesAtraso > 0 ? Colors.danger : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{alunoData.mesesAtraso}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 110, backgroundColor: alunoData.multa > 0 ? Colors.gold + '10' : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: alunoData.multa > 0 ? Colors.gold + '40' : Colors.border, padding: 10 }}>
                        <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Multa estimada</Text>
                        <Text style={{ fontSize: 16, color: alunoData.multa > 0 ? Colors.gold : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{formatAOA(alunoData.multa)}</Text>
                      </View>
                    </View>

                    {/* Total em dívida */}
                    {alunoData.totalDevido > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="warning-outline" size={14} color={Colors.danger} />
                          <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Total em dívida</Text>
                        </View>
                        <Text style={{ fontSize: 15, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{formatAOA(alunoData.totalDevido)}</Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                      Limite sem multa: dia {diaInicioMulta} de cada mês
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Gráfico: Notas por Disciplina */}
            {alunoData.notasAluno.filter((n: any) => n.nf > 0 || n.mac > 0).length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Notas por Disciplina" color={Colors.accent} action={() => router.push('/(main)/portal-estudante')} actionLabel="Ver portal" />
                <View style={[st.card, { alignItems: 'center' }]}>
                  <BarChart
                    data={alunoData.notasAluno
                      .filter((n: any) => n.nf > 0 || n.mac > 0)
                      .map((n: any, i: number) => ({
                        label: (n.disciplina ?? '—').substring(0, 6),
                        value: n.nf > 0 ? n.nf : (n.mac || 0),
                        color: [Colors.gold, Colors.info, Colors.accent, Colors.success, Colors.warning, '#8B5CF6'][i % 6],
                      }))}
                    maxValue={20} height={160} width={CHART_W}
                  />
                </View>
              </View>
            )}

            {/* Gráfico: Assiduidade */}
            {alunoData.presAluno.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Assiduidade" color={Colors.success} />
                <View style={[st.card, { alignItems: 'center' }]}>
                  <DonutChart
                    data={[
                      { label: 'Presentes', value: alunoData.presAluno.filter((p: any) => p.status === 'P').length, color: Colors.success },
                      { label: 'Justif.', value: alunoData.presAluno.filter((p: any) => p.status === 'J').length, color: Colors.warning },
                      { label: 'Faltas', value: alunoData.presAluno.filter((p: any) => p.status === 'F').length, color: Colors.danger },
                    ].filter(d => d.value > 0)}
                    size={160} thickness={26}
                    centerLabel={`${alunoData.pctPresenca}%`} centerSub="presença"
                  />
                </View>
              </View>
            )}

            {/* Próximos eventos da turma */}
            <View style={st.section}>
              <SectionTitle label="Próximos Eventos da Turma" color={Colors.accent} action={() => router.push('/(main)/portal-estudante')} actionLabel="Ver todos" />
              {alunoData.eventosAluno.length === 0 ? (
                <View style={[st.card, st.emptySmall]}>
                  <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
                  <Text style={st.emptySmallText}>Sem eventos programados para a sua turma</Text>
                </View>
              ) : (
                alunoData.eventosAluno.map(ev => (
                  <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/portal-estudante')} eventoTypeColor={eventoTypeColor} />
                ))
              )}
            </View>

            {/* Acções rápidas */}
            <View style={st.section}>
              <SectionTitle label="Acesso Rápido" color={Colors.primaryLight} />
              <QuickActions actions={[
                { label: 'Meu Portal', icon: 'grid', route: '/(main)/portal-estudante', color: Colors.gold },
                { label: 'Horário', icon: 'time', route: '/(main)/horario', color: Colors.info },
                { label: 'Mensagens', icon: 'chatbubbles', route: '/(main)/portal-estudante', color: Colors.accent },
                { label: 'Financeiro', icon: 'cash', route: '/(main)/portal-estudante', color: Colors.warning },
                { label: 'Histórico', icon: 'bar-chart', route: '/(main)/historico', color: Colors.success },
                { label: 'Documentos', icon: 'library', route: '/(main)/portal-estudante', color: '#8B5CF6' },
              ]} />
            </View>
          </>
        )}

        {isAluno && !alunoData && (
          <View style={[st.card, st.emptySmall]}>
            <Ionicons name="person-circle-outline" size={40} color={Colors.textMuted} />
            <Text style={st.emptySmallText}>Perfil de aluno não encontrado.{'\n'}Contacte a secretaria para associar a sua conta.</Text>
            <TouchableOpacity style={st.portalBtn} onPress={() => router.push('/(main)/portal-estudante')}>
              <Text style={st.portalBtnText}>Ir para o Portal do Estudante</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO PROFESSOR                                        */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isProfessor && professorData && (
          <>
            {/* Tabs de navegação interna */}
            <View style={st.profTabRow}>
              <TouchableOpacity
                style={[st.profTab, profSection === 'painel' && st.profTabActive]}
                onPress={() => setProfSection('painel')}
                activeOpacity={0.7}
              >
                <Ionicons name="grid" size={15} color={profSection === 'painel' ? Colors.primaryDark : Colors.textMuted} />
                <Text style={[st.profTabLabel, profSection === 'painel' && st.profTabLabelActive]}>Meu Painel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.profTab, profSection === 'resumo' && st.profTabActive]}
                onPress={() => setProfSection('resumo')}
                activeOpacity={0.7}
              >
                <Ionicons name="bar-chart" size={15} color={profSection === 'resumo' ? Colors.primaryDark : Colors.textMuted} />
                <Text style={[st.profTabLabel, profSection === 'resumo' && st.profTabLabelActive]}>O Meu Resumo</Text>
              </TouchableOpacity>
            </View>

            {/* ── Meu Painel (Acesso Rápido) ── */}
            {profSection === 'painel' && (
              <View style={st.section}>
                <SectionTitle label="Acesso Rápido" color={Colors.primaryLight} />
                <QuickActions actions={[
                  { label: 'Lançar Notas', icon: 'document-text', route: '/(main)/professor-pauta', color: Colors.accent },
                  { label: 'Presenças QR', icon: 'qr-code', route: '/(main)/presencas', color: Colors.success },
                  { label: 'Mensagens', icon: 'chatbubbles', route: '/(main)/professor-mensagens', color: Colors.info },
                  { label: 'Sumários', icon: 'book', route: '/(main)/professor-sumario', color: Colors.warning },
                  { label: 'Materiais', icon: 'folder-open', route: '/(main)/professor-materiais', color: '#8B5CF6' },
                  { label: 'Minhas Turmas', icon: 'layers', route: '/(main)/professor-turmas', color: Colors.success },
                  { label: 'Horário', icon: 'time', route: '/(main)/horario', color: Colors.info },
                  { label: 'Diário de Aula', icon: 'journal', route: '/(main)/diario-classe', color: '#F97316' },
                  { label: 'Planificações', icon: 'clipboard', route: '/(main)/professor-plano-aula', color: Colors.gold },
                  { label: 'Trabalhos', icon: 'school', route: '/(main)/trabalhos-finais', color: Colors.accent },
                  { label: 'Chat Interno', icon: 'chatbubbles-outline', route: '/(main)/chat-interno', color: '#06B6D4' },
                  { label: 'Relatórios', icon: 'bar-chart', route: '/(main)/relatorios', color: Colors.warning },
                ]} />
              </View>
            )}

            {/* ── O Meu Resumo ── */}
            {profSection === 'resumo' && (
            <>
            {/* KPIs do professor */}
            <CollapsibleStats storageKey="dash-prof-kpi" title="O Meu Resumo" color={Colors.gold}>
              <View style={st.kpiGrid}>
                <KpiCard
                  label="Minhas Turmas"
                  value={professorData.minhasTurmas.length}
                  sub="activas"
                  color={Colors.info}
                  icon="layers"
                  onPress={() => router.push('/(main)/professor-turmas')}
                />
                <KpiCard
                  label="Meu Salário"
                  value="Ver"
                  sub="estimativa mensal"
                  color={Colors.success}
                  icon="cash"
                  onPress={() => router.push('/(main)/professor-hub?view=salario' as any)}
                />
                <KpiCard
                  label="Alunos"
                  value={professorData.totalAlunos}
                  sub="nas minhas turmas"
                  color={Colors.gold}
                  icon="people"
                  onPress={() => router.push('/(main)/professor-turmas?view=alunos' as any)}
                />
                <KpiCard
                  label="Pautas Abertas"
                  value={professorData.pautasAbertas.length}
                  sub="para lançar notas"
                  color={professorData.pautasAbertas.length > 0 ? Colors.warning : Colors.success}
                  icon="document-text"
                  onPress={() => router.push('/(main)/professor-pauta')}
                />
                <KpiCard
                  label="Sumários"
                  value={professorData.sumariosDoMes.length}
                  sub="este mês"
                  color={Colors.success}
                  icon="book"
                  onPress={() => router.push('/(main)/professor-sumario')}
                />
                <KpiCard
                  label="Materiais"
                  value={professorData.materiaisProf.length}
                  sub="partilhados"
                  color={Colors.accent}
                  icon="folder-open"
                  onPress={() => router.push('/(main)/professor-materiais')}
                />
              </View>
            </CollapsibleStats>

            {/* Pautas abertas (destaque se houver) */}
            {professorData.pautasAbertas.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Pautas com Notas para Lançar" color={Colors.warning} action={() => router.push('/(main)/professor-pauta')} actionLabel="Abrir pautas" />
                {professorData.pautasAbertas.slice(0, 3).map(p => {
                  const turma = turmas.find(t => t.id === p.turmaId);
                  return (
                    <TouchableOpacity key={p.id} style={[st.alertCard, { borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '10' }]} onPress={() => router.push('/(main)/professor-pauta')}>
                      <Ionicons name="document-text" size={18} color={Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.alertTitle, { color: Colors.warning }]}>{p.disciplina} — {turma?.nome ?? 'Turma'}</Text>
                        <Text style={st.alertSub}>{p.trimestre}º Trimestre · {p.anoLetivo}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Minhas turmas */}
            {professorData.minhasTurmas.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Minhas Turmas" color={Colors.info} action={() => router.push('/(main)/professor-hub')} actionLabel="Ver todas" />
                <View style={st.card}>
                  {professorData.minhasTurmas.map((t, idx) => {
                    const count = alunos.filter(a => a.turmaId === t.id && a.ativo).length;
                    const cap = t.capacidade || 30;
                    const pct = Math.min(count / cap, 1);
                    const cor = pct >= 0.9 ? Colors.danger : pct >= 0.7 ? Colors.warning : Colors.success;
                    return (
                      <View key={t.id} style={[st.turmaRow, idx > 0 && { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border }]}>
                        <View style={st.turmaRowHeader}>
                          <Text style={st.turmaNome}>{t.nome}</Text>
                          <View style={[st.turnoBadge, { backgroundColor: Colors.info + '22' }]}>
                            <Text style={[st.turnoText, { color: Colors.info }]}>{t.turno}</Text>
                          </View>
                        </View>
                        <Text style={st.turmaSub}>{t.nivel} · {t.anoLetivo}</Text>
                        <View style={st.turmaBarWrap}>
                          <View style={[st.turmaBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: cor }]} />
                        </View>
                        <Text style={[st.turmaCount, { color: cor }]}>{count} de {cap} alunos</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Próximos eventos */}
            {professorData.proximosEventos.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Próximos Eventos" color={Colors.accent} action={() => router.push('/(main)/eventos')} actionLabel="Ver todos" />
                {professorData.proximosEventos.map(ev => (
                  <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/eventos')} eventoTypeColor={eventoTypeColor} />
                ))}
              </View>
            )}

            {/* Gráficos: Médias por Disciplina e Assiduidade */}
            {(() => {
              const myTurmaIds = new Set(professorData.minhasTurmas.map((t: any) => t.id));
              const myAlunoIds = new Set(alunos.filter((a: any) => myTurmaIds.has(a.turmaId) && a.ativo).map((a: any) => String(a.id)));
              const myNotas = notas.filter((n: any) => myAlunoIds.has(String(n.alunoId)));
              const discMap: Record<string, { sum: number; count: number }> = {};
              myNotas.forEach((n: any) => {
                const grade = n.nf > 0 ? n.nf : n.mac;
                if (!grade || grade <= 0) return;
                if (!discMap[n.disciplina]) discMap[n.disciplina] = { sum: 0, count: 0 };
                discMap[n.disciplina].sum += grade;
                discMap[n.disciplina].count++;
              });
              const barData = Object.entries(discMap).slice(0, 6).map(([disc, d], i) => ({
                label: disc.substring(0, 6),
                value: parseFloat((d.sum / d.count).toFixed(1)),
                color: [Colors.gold, Colors.info, Colors.accent, Colors.success, Colors.warning, '#8B5CF6'][i % 6],
              }));
              const myPresencas = presencas.filter((p: any) => myAlunoIds.has(String(p.alunoId)));
              const pres = myPresencas.filter((p: any) => p.status === 'P').length;
              const falt = myPresencas.filter((p: any) => p.status === 'F').length;
              const just = myPresencas.filter((p: any) => p.status === 'J').length;
              const taxaPA = myPresencas.length > 0 ? Math.round((pres / myPresencas.length) * 100) : 100;
              return (
                <>
                  {barData.length > 0 && (
                    <View style={st.section}>
                      <SectionTitle label="Médias por Disciplina" color={Colors.accent} action={() => router.push('/(main)/professor-pauta')} actionLabel="Ver pautas" />
                      <View style={[st.card, { alignItems: 'center' }]}>
                        <BarChart data={barData} maxValue={20} height={160} width={CHART_W} />
                      </View>
                    </View>
                  )}
                  {myPresencas.length > 0 && (
                    <View style={st.section}>
                      <SectionTitle label="Assiduidade das Minhas Turmas" color={Colors.success} action={() => router.push('/(main)/presencas')} actionLabel="Ver detalhes" />
                      <View style={[st.card, { alignItems: 'center' }]}>
                        <DonutChart
                          data={[
                            { label: 'Presentes', value: pres, color: Colors.success },
                            { label: 'Justif.', value: just, color: Colors.warning },
                            { label: 'Faltas', value: falt, color: Colors.danger },
                          ].filter(d => d.value > 0)}
                          size={160} thickness={26}
                          centerLabel={`${taxaPA}%`} centerSub="assiduidade"
                        />
                      </View>
                    </View>
                  )}
                </>
              );
            })()}

            </> /* fim profSection === 'resumo' */
            )}
          </>
        )}

        {isProfessor && !professorData && (
          <View style={[st.card, st.emptySmall]}>
            <Ionicons name="school-outline" size={40} color={Colors.textMuted} />
            <Text style={st.emptySmallText}>Perfil de professor não encontrado.{'\n'}Contacte a administração para associar a sua conta.</Text>
            <TouchableOpacity style={st.portalBtn} onPress={() => router.push('/(main)/professor-hub')}>
              <Text style={st.portalBtnText}>Ir para o Hub do Professor</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO ENCARREGADO                                      */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isEncarregado && (
          <>
            {alunoData ? (
              <>
                {/* Cartão de identidade do educando */}
                <View style={st.alunoIdentCard}>
                  {(() => {
                    const foto = alunoData.aluno.foto;
                    const initials = `${alunoData.aluno.nome.charAt(0)}${alunoData.aluno.apelido?.charAt(0) || ''}`;
                    return foto ? (
                      <Image source={{ uri: foto }} style={st.alunoAvatar} />
                    ) : (
                      <View style={[st.alunoAvatar, { backgroundColor: Colors.gold }]}>
                        <Text style={st.alunoAvatarText}>{initials}</Text>
                      </View>
                    );
                  })()}
                  <View style={st.alunoIdentInfo}>
                    <Text style={st.alunoIdentNome}>{alunoData.aluno.nome} {alunoData.aluno.apelido}</Text>
                    <Text style={st.alunoIdentMat}>{alunoData.aluno.numeroMatricula}</Text>
                    {alunoData.turmaAluno && (
                      <View style={st.alunoIdentTurmaRow}>
                        <Ionicons name="school-outline" size={12} color={Colors.gold} />
                        <Text style={st.alunoIdentTurma}>
                          {alunoData.turmaAluno.nome} · {alunoData.turmaAluno.turno}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(main)/portal-encarregado' as any)} style={{ padding: 6 }}>
                    <Ionicons name="open-outline" size={18} color={Colors.gold} />
                  </TouchableOpacity>
                </View>

                {/* KPIs do educando */}
                <CollapsibleStats storageKey="dash-enc-kpi" title="Resumo do Educando" color={Colors.gold} action={() => router.push('/(main)/portal-encarregado' as any)} actionLabel="Ver portal">
                  <View style={st.kpiGrid}>
                    <KpiCard
                      label="Média Geral"
                      value={alunoData.mediaGeral}
                      sub="escala 0–20"
                      color={alunoData.mediaGeral === '—' ? Colors.textMuted : Number(alunoData.mediaGeral) >= 10 ? Colors.success : Colors.danger}
                      icon="ribbon"
                      onPress={() => router.push('/(main)/portal-encarregado' as any)}
                    />
                    <KpiCard
                      label="Assiduidade"
                      value={`${alunoData.pctPresenca}%`}
                      sub="presenças"
                      color={alunoData.presAluno.length === 0 ? Colors.textMuted : alunoData.pctPresenca >= 75 ? Colors.success : Colors.danger}
                      icon="checkmark-circle"
                      onPress={() => router.push('/(main)/portal-encarregado' as any)}
                    />
                    <KpiCard
                      label="Aprovadas"
                      value={alunoData.aprovadas}
                      sub="disciplinas"
                      color={alunoData.aprovadas > 0 ? Colors.success : Colors.textMuted}
                      icon="trophy"
                    />
                    <KpiCard
                      label="Meses Atraso"
                      value={alunoData.mesesAtraso}
                      sub="propinas"
                      color={alunoData.mesesAtraso > 0 ? Colors.danger : Colors.textMuted}
                      icon="wallet"
                      onPress={() => router.push('/(main)/portal-encarregado' as any)}
                    />
                  </View>
                </CollapsibleStats>

                {/* Gráfico notas */}
                {alunoData.notasAluno.filter((n: any) => n.nf > 0 || n.mac > 0).length > 0 && (
                  <View style={st.section}>
                    <SectionTitle label="Notas por Disciplina" color={Colors.accent} />
                    <View style={[st.card, { alignItems: 'center' }]}>
                      <BarChart
                        data={alunoData.notasAluno
                          .filter((n: any) => n.nf > 0 || n.mac > 0)
                          .map((n: any, i: number) => ({
                            label: (n.disciplina ?? '—').substring(0, 6),
                            value: n.nf > 0 ? n.nf : (n.mac || 0),
                            color: [Colors.gold, Colors.info, Colors.accent, Colors.success, Colors.warning, '#8B5CF6'][i % 6],
                          }))}
                        maxValue={20} height={150} width={CHART_W}
                      />
                    </View>
                  </View>
                )}

                {/* Gráfico assiduidade */}
                {alunoData.presAluno.length > 0 && (
                  <View style={st.section}>
                    <SectionTitle label="Assiduidade do Educando" color={Colors.success} />
                    <View style={[st.card, { alignItems: 'center' }]}>
                      <DonutChart
                        data={[
                          { label: 'Presentes', value: alunoData.presAluno.filter((p: any) => p.status === 'P').length, color: Colors.success },
                          { label: 'Justif.', value: alunoData.presAluno.filter((p: any) => p.status === 'J').length, color: Colors.warning },
                          { label: 'Faltas', value: alunoData.presAluno.filter((p: any) => p.status === 'F').length, color: Colors.danger },
                        ].filter(d => d.value > 0)}
                        size={160} thickness={26}
                        centerLabel={`${alunoData.pctPresenca}%`} centerSub="presença"
                      />
                    </View>
                  </View>
                )}

                {/* Estado financeiro — alerta se houver atraso */}
                {alunoData.mesesAtraso > 0 && (
                  <View style={st.section}>
                    <SectionTitle label="Situação Financeira" color={Colors.danger} action={() => router.push('/(main)/portal-encarregado' as any)} actionLabel="Ver pagamentos" />
                    <TouchableOpacity
                      style={[st.alertCard, { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '10' }]}
                      onPress={() => router.push('/(main)/portal-encarregado' as any)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="alert-circle" size={22} color={Colors.danger} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.alertTitle, { color: Colors.danger }]}>Propinas em atraso</Text>
                        <Text style={st.alertSub}>
                          {alunoData.mesesAtraso} {alunoData.mesesAtraso === 1 ? 'mês' : 'meses'} em falta · Total: {formatAOA(alunoData.totalDevido)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Próximos eventos da turma */}
                {alunoData.eventosAluno.length > 0 && (
                  <View style={st.section}>
                    <SectionTitle label="Próximos Eventos da Turma" color={Colors.info} action={() => router.push('/(main)/eventos')} actionLabel="Ver todos" />
                    {alunoData.eventosAluno.map((ev: any) => (
                      <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/portal-encarregado' as any)} eventoTypeColor={eventoTypeColor} />
                    ))}
                  </View>
                )}

                {/* Acesso rápido */}
                <View style={st.section}>
                  <SectionTitle label="Acesso Rápido" color={Colors.primaryLight} />
                  <QuickActions actions={[
                    { label: 'Portal Enc.', icon: 'people', route: '/(main)/portal-encarregado', color: Colors.gold },
                    { label: 'Notas', icon: 'ribbon', route: '/(main)/portal-encarregado', color: Colors.accent },
                    { label: 'Presenças', icon: 'checkmark-circle', route: '/(main)/portal-encarregado', color: Colors.success },
                    { label: 'Financeiro', icon: 'cash', route: '/(main)/portal-encarregado', color: Colors.warning },
                    { label: 'Horário', icon: 'time', route: '/(main)/horario', color: Colors.info },
                    { label: 'Eventos', icon: 'calendar', route: '/(main)/eventos', color: Colors.danger },
                  ]} />
                </View>
              </>
            ) : (
              <View style={st.section}>
                <SectionTitle label="Portal do Encarregado" color={Colors.gold} />
                <TouchableOpacity style={st.portalBtn} onPress={() => router.push('/(main)/portal-encarregado' as any)}>
                  <Ionicons name="people" size={18} color={Colors.background} />
                  <Text style={st.portalBtnText}>Acompanhar o meu educando</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO DIRECTOR                                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isDirector && adminData && (
          <>
            {/* ── Cabeçalho estratégico bold ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Direcção Escolar
                </Text>
                <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 2 }}>
                  Visão Estratégica
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={openTour} style={{ padding: 6, borderRadius: 10, backgroundColor: Colors.accent + '18', borderWidth: 1, borderColor: Colors.accent + '44' }} activeOpacity={0.75}>
                  <Ionicons name="compass-outline" size={22} color={Colors.accent} />
                </TouchableOpacity>
                <View style={{ backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '55', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>● Ao vivo</Text>
                </View>
              </View>
            </View>

            {/* Estado da Base de Dados */}
            <NeonStatusBanner />

            {/* KPIs estratégicos — bold grid */}
            <View style={st.kpiGrid}>
              <BoldKpiCard label="Alunos" value={adminData.alunosAtivos.length} sub="Matriculados" color={Colors.info} icon="people" onPress={() => router.push('/(main)/alunos')} />
              <BoldKpiCard label="Professores" value={adminData.profsAtivos.length} sub="Activos" color={Colors.success} icon="school" onPress={() => router.push('/(main)/professores')} />
              <BoldKpiCard label="Turmas" value={adminData.turmasAtivas.length} sub="Activas" color={Colors.gold} icon="layers" onPress={() => router.push('/(main)/turmas')} />
              <BoldKpiCard label="Ocupação" value={`${adminData.taxaOcupacao}%`} sub={`${adminData.alunosAtivos.length}/${adminData.totalCap} vagas`} color={adminData.taxaOcupacao >= 90 ? Colors.danger : adminData.taxaOcupacao >= 70 ? Colors.warning : Colors.success} icon="business" />
              <BoldKpiCard label="Aprovação" value={`${adminData.taxaAprov}%`} sub="Taxa global" color={adminData.taxaAprov >= 70 ? Colors.success : adminData.taxaAprov >= 50 ? Colors.warning : Colors.danger} icon="checkmark-circle" onPress={() => router.push('/(main)/desempenho')} />
              <BoldKpiCard label="Média Geral" value={adminData.mediaGeral} sub="Escala 0–20" color={Colors.accent} icon="ribbon" onPress={() => router.push('/(main)/desempenho')} />
            </View>

            {/* Assistente IA — estado e feedback (Director) */}
            {aiStatus && (
              <View style={st.section}>
                <SectionTitle label="Assistente IA" color="#8B5CF6" action={() => router.push('/(main)/assistente' as any)} actionLabel="Abrir" />
                <View style={st.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: aiStatus.configured ? '#8B5CF622' : Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="school" size={18} color={aiStatus.configured ? '#8B5CF6' : Colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: aiStatus.configured ? Colors.success : Colors.danger }} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text }}>
                          {aiStatus.configured ? 'Activo' : 'Inactivo'}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 1 }}>
                        {aiStatus.configured ? `${aiStatus.provider} · ${aiStatus.model}` : 'Nenhuma chave de API configurada'}
                      </Text>
                    </View>
                  </View>
                  {aiFeedback && (aiFeedback.up + aiFeedback.down) > 0 ? (
                    <>
                      <View style={st.cardDivider} />
                      <Text style={[st.subCardTitle, { marginBottom: 10 }]}>Feedback dos Utilizadores</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(52,211,153,0.08)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#34D399' }}>{aiFeedback.up}</Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>👍 Positivas</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#F87171' }}>{aiFeedback.down}</Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>👎 Negativas</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#8B5CF6' }}>
                            {Math.round((aiFeedback.up / (aiFeedback.up + aiFeedback.down)) * 100)}%
                          </Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Satisfação</Text>
                        </View>
                      </View>
                      <View style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' }}>
                        <View style={{ height: 6, width: `${Math.round((aiFeedback.up / (aiFeedback.up + aiFeedback.down)) * 100)}%` as any, backgroundColor: '#34D399', borderRadius: 3 }} />
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 4, textAlign: 'center' }}>
                        {aiFeedback.up + aiFeedback.down} avaliações no total
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={st.cardDivider} />
                      <View style={st.emptySmall}>
                        <Ionicons name="chatbubble-outline" size={24} color={Colors.textMuted} />
                        <Text style={st.emptySmallText}>Sem avaliações de respostas ainda</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Sessões Activas — Director */}
            {sessoesStats !== null && (
              <View style={st.section}>
                <SectionTitle label="Sessões Activas" color="#06B6D4" action={() => router.push('/(main)/sessoes-ativas' as any)} actionLabel="Ver detalhes" />
                <TouchableOpacity style={st.card} onPress={() => router.push('/(main)/sessoes-ativas' as any)} activeOpacity={0.85}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#06B6D422', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="wifi" size={22} color="#06B6D4" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sessoesStats.online > 0 ? Colors.success : Colors.textMuted }} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text }}>
                          {sessoesStats.online > 0 ? `${sessoesStats.online} utilizador${sessoesStats.online !== 1 ? 'es' : ''} online` : 'Nenhum utilizador online'}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                        {sessoesStats.total} sessão${sessoesStats.total !== 1 ? 'ões' : ''} registada${sessoesStats.total !== 1 ? 's' : ''} · Toque para ver detalhes
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                  {sessoesStats.online > 0 && (
                    <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: Colors.success + '18', borderRadius: 8, borderWidth: 1, borderColor: Colors.success + '44', paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success }} />
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.success }}>{sessoesStats.online} online agora</Text>
                      </View>
                      <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 8, borderWidth: 1, borderColor: Colors.warning + '44', paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.warning }}>{sessoesStats.total - sessoesStats.online} inactivos</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Distribuição de alunos */}
            {adminData.matriculasPorNivel.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Distribuição Académica" color={Colors.info} action={() => router.push('/(main)/alunos')} actionLabel="Ver alunos" />
                <View style={st.card}>
                  <View style={st.nivelChipsRow}>
                    {adminData.matriculasPorNivel.map(n => (
                      <View key={n.label} style={[st.nivelChip, { borderColor: n.color + '55', backgroundColor: n.color + '11' }]}>
                        <Text style={[st.nivelChipVal, { color: n.color }]}>{n.value}</Text>
                        <Text style={[st.nivelChipLabel, { color: n.color }]}>{n.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={st.cardDivider} />
                  <Text style={st.subCardTitle}>Distribuição por Género</Text>
                  <GenderBar masculino={adminData.masculino} feminino={adminData.feminino} total={adminData.alunosAtivos.length} />
                </View>
              </View>
            )}

            {/* Presenças resumidas */}
            <View style={st.section}>
              <SectionTitle label="Presenças (Últimos 7 dias)" color={Colors.success} action={() => router.push('/(main)/presencas')} actionLabel="Ver detalhes" />
              <View style={st.card}>
                {adminData.presencaTotal === 0 ? (
                  <View style={st.emptySmall}>
                    <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
                    <Text style={st.emptySmallText}>Sem registos de presença neste período</Text>
                  </View>
                ) : (
                  <View style={st.presencaResumo}>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.success }]}>{adminData.presentes}</Text><Text style={st.presencaLbl}>Presentes</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.danger }]}>{adminData.faltas}</Text><Text style={st.presencaLbl}>Faltas</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.warning }]}>{adminData.justif}</Text><Text style={st.presencaLbl}>Justif.</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.gold }]}>{adminData.taxaP}%</Text><Text style={st.presencaLbl}>Assiduidade</Text></View>
                  </View>
                )}
              </View>
            </View>

            {/* Gráfico: Alunos por Turno */}
            {adminData.alunosPorTurno.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Alunos por Turno" color={Colors.gold} />
                <View style={[st.card, { alignItems: 'center' }]}>
                  <DonutChart data={adminData.alunosPorTurno} size={180} thickness={32} centerLabel={String(adminData.alunosAtivos.length)} centerSub="alunos" />
                </View>
              </View>
            )}

            {/* Gráfico: Assiduidade */}
            {adminData.presencaTotal > 0 && (
              <View style={st.section}>
                <SectionTitle label="Assiduidade (Últimos 7 dias)" color={Colors.success} action={() => router.push('/(main)/presencas')} actionLabel="Ver detalhe" />
                <View style={st.card}>
                  <View style={st.presencaResumo}>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.success }]}>{adminData.presentes}</Text><Text style={st.presencaLbl}>Presentes</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.danger }]}>{adminData.faltas}</Text><Text style={st.presencaLbl}>Faltas</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.warning }]}>{adminData.justif}</Text><Text style={st.presencaLbl}>Justif.</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.gold }]}>{adminData.taxaP}%</Text><Text style={st.presencaLbl}>Taxa</Text></View>
                  </View>
                  <View style={st.presencaBarra}>
                    {adminData.presentes > 0 && <View style={[st.presencaBarSeg, { flex: adminData.presentes, backgroundColor: Colors.success }]} />}
                    {adminData.justif > 0 && <View style={[st.presencaBarSeg, { flex: adminData.justif, backgroundColor: Colors.warning }]} />}
                    {adminData.faltas > 0 && <View style={[st.presencaBarSeg, { flex: adminData.faltas, backgroundColor: Colors.danger }]} />}
                  </View>
                  <View style={st.cardDivider} />
                  <DonutChart
                    data={[
                      { label: 'Presentes', value: adminData.presentes, color: Colors.success },
                      { label: 'Justif.', value: adminData.justif, color: Colors.warning },
                      { label: 'Faltas', value: adminData.faltas, color: Colors.danger },
                    ].filter(d => d.value > 0)}
                    size={160} thickness={26} centerLabel={`${adminData.taxaP}%`} centerSub="assiduidade"
                  />
                </View>
              </View>
            )}

            {/* Gráfico: Desempenho por Disciplina */}
            {adminData.desempenhoPorDisciplina.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Média por Disciplina" color={Colors.accent} action={() => router.push('/(main)/desempenho')} actionLabel="Ver detalhe" />
                <View style={st.card}>
                  <BarChart data={adminData.desempenhoPorDisciplina} maxValue={20} height={180} width={CHART_W} />
                </View>
              </View>
            )}

            {/* Gráfico: Taxa de Ocupação por Turma — barras bold */}
            {adminData.ocupacaoPorTurma.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Taxa de Ocupação por Turma" color={Colors.warning} action={() => router.push('/(main)/turmas')} actionLabel="Ver turmas" />
                <View style={st.card}>
                  {adminData.ocupacaoPorTurma.map((t, idx) => {
                    const cor = t.pct >= 0.9 ? Colors.danger : t.pct >= 0.7 ? Colors.warning : Colors.success;
                    const pctLabel = Math.round(t.pct * 100);
                    return (
                      <View key={t.nome} style={[st.ocupRow, idx > 0 && { marginTop: 12 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <Text style={st.ocupNome} numberOfLines={1}>{t.nome}</Text>
                          <Text style={[st.ocupPct, { color: cor }]}>{pctLabel}% · {t.count}/{t.cap}</Text>
                        </View>
                        <View style={[st.ocupBarWrap, { height: 14 }]}>
                          <View style={[st.ocupBarFill, { width: `${pctLabel}%` as any, backgroundColor: cor }]} />
                        </View>
                      </View>
                    );
                  })}
                  {/* Legenda */}
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, justifyContent: 'flex-end' }}>
                    {[{ label: '≥90%', color: Colors.danger }, { label: '70–90%', color: Colors.warning }, { label: '<70%', color: Colors.success }].map(l => (
                      <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* RH resumo */}
            {funcionarios.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Recursos Humanos" color="#8B5CF6" action={() => router.push('/(main)/rh-hub' as any)} actionLabel="Ver RH" />
                <View style={st.card}>
                  <View style={st.matriculaResumo}>
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: '#8B5CF6' }]}>{funcionarios.length}</Text>
                      <Text style={st.matriculaSmall}>Total</Text>
                    </View>
                    <View style={st.matriculaDivider} />
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: Colors.success }]}>{funcionarios.filter(f => f.ativo).length}</Text>
                      <Text style={st.matriculaSmall}>Activos</Text>
                    </View>
                    <View style={st.matriculaDivider} />
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: Colors.textMuted }]}>{funcionarios.filter(f => !f.ativo).length}</Text>
                      <Text style={st.matriculaSmall}>Inactivos</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Próximos Eventos */}
            <View style={st.section}>
              <SectionTitle label="Próximos Eventos" color={Colors.accent} action={() => router.push('/(main)/eventos')} actionLabel="Ver todos" />
              {adminData.proximosEventos.length === 0 ? (
                <View style={[st.card, st.emptySmall]}>
                  <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
                  <Text style={st.emptySmallText}>Sem eventos programados</Text>
                </View>
              ) : (
                adminData.proximosEventos.map(ev => (
                  <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/eventos')} eventoTypeColor={eventoTypeColor} />
                ))
              )}
            </View>

            {/* Acesso a todos os departamentos */}
            <View style={st.section}>
              <SectionTitle label="Acesso Rápido — Todos os Módulos" color={Colors.primaryLight} />
              <QuickActions actions={[
                { label: 'Alunos', icon: 'people', route: '/(main)/alunos', color: Colors.info },
                { label: 'Turmas', icon: 'layers', route: '/(main)/turmas', color: Colors.success },
                { label: 'Professores', icon: 'school', route: '/(main)/professores', color: Colors.gold },
                { label: 'Admissões', icon: 'person-add', route: '/(main)/admissao', color: Colors.accent },
                { label: 'Financeiro', icon: 'cash', route: '/(main)/financeiro', color: '#10B981' },
                { label: 'RH', icon: 'briefcase', route: '/(main)/rh-hub', color: '#8B5CF6' },
                { label: 'Pedagógico', icon: 'book', route: '/(main)/pedagogico', color: Colors.gold, badge: (exameBadge + reapreciacaoBadge) || undefined },
                { label: 'Reapreciações', icon: 'reload-circle', route: '/(main)/pedidos-reapreciacao', color: '#0EA5E9', badge: reapreciacaoBadge || undefined },
                { label: 'Desempenho', icon: 'stats-chart', route: '/(main)/desempenho', color: Colors.accent },
                { label: 'Presenças', icon: 'qr-code', route: '/(main)/presencas', color: Colors.success },
                { label: 'Disciplinas', icon: 'ribbon', route: '/(main)/disciplinas', color: Colors.warning },
                { label: 'Horário', icon: 'time', route: '/(main)/horario', color: Colors.info },
                { label: 'Notas', icon: 'document-text', route: '/(main)/notas', color: Colors.gold },
                { label: 'Biblioteca', icon: 'library', route: '/(main)/biblioteca', color: '#F97316' },
                { label: 'Calendário', icon: 'calendar-outline', route: '/(main)/calendario-academico', color: '#06B6D4' },
                { label: 'Eventos', icon: 'calendar', route: '/(main)/eventos', color: Colors.danger },
                { label: 'Chat Interno', icon: 'chatbubbles', route: '/(main)/chat-interno', color: Colors.accent },
                { label: 'Quadro Honra', icon: 'trophy', route: '/(main)/quadro-honra', color: Colors.gold },
                { label: 'Relatórios', icon: 'bar-chart', route: '/(main)/relatorios', color: Colors.warning },
              ]} />
            </View>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL ADMINISTRATIVO / GESTÃO                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isAdminRole && adminData && (
          <>
            {/* Estado da Base de Dados — visível para admin/pca */}
            {(role === 'admin' || role === 'pca') && <NeonStatusBanner />}

            {/* KPIs principais — bold grid */}
            <View style={st.kpiGrid}>
              <BoldKpiCard label="Alunos" value={adminData.alunosAtivos.length} sub="Matriculados" color={Colors.info} icon="people" onPress={() => router.push('/(main)/alunos')} />
              <BoldKpiCard label="Professores" value={adminData.profsAtivos.length} sub="Activos" color={Colors.gold} icon="school" onPress={() => router.push('/(main)/professores')} />
              <BoldKpiCard label="Turmas" value={adminData.turmasAtivas.length} sub="Activas" color={Colors.success} icon="layers" onPress={() => router.push('/(main)/turmas')} />
              <BoldKpiCard label="Ocupação" value={`${adminData.taxaOcupacao}%`} sub={`${adminData.alunosAtivos.length} / ${adminData.totalCap} vagas`} color={adminData.taxaOcupacao >= 90 ? Colors.danger : adminData.taxaOcupacao >= 70 ? Colors.warning : Colors.success} icon="business" />
              <BoldKpiCard label="Aprovação" value={`${adminData.taxaAprov}%`} sub="Taxa global" color={adminData.taxaAprov >= 70 ? Colors.success : adminData.taxaAprov >= 50 ? Colors.warning : Colors.danger} icon="checkmark-circle" onPress={() => router.push('/(main)/desempenho')} />
              <BoldKpiCard label="Média Geral" value={adminData.mediaGeral} sub="Escala 0–20" color={Colors.accent} icon="ribbon" onPress={() => router.push('/(main)/desempenho')} />
            </View>

            {/* Assistente IA — estado e feedback */}
            {aiStatus && (
              <View style={st.section}>
                <SectionTitle label="Assistente IA" color="#8B5CF6" action={() => router.push('/(main)/assistente' as any)} actionLabel="Abrir" />
                <View style={st.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: aiStatus.configured ? '#8B5CF622' : Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="school" size={18} color={aiStatus.configured ? '#8B5CF6' : Colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: aiStatus.configured ? Colors.success : Colors.danger }} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text }}>
                          {aiStatus.configured ? 'Activo' : 'Inactivo'}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 1 }}>
                        {aiStatus.configured ? `${aiStatus.provider} · ${aiStatus.model}` : 'Nenhuma chave de API configurada'}
                      </Text>
                    </View>
                  </View>
                  {aiFeedback && (aiFeedback.up + aiFeedback.down) > 0 ? (
                    <>
                      <View style={st.cardDivider} />
                      <Text style={[st.subCardTitle, { marginBottom: 10 }]}>Feedback dos Utilizadores</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(52,211,153,0.08)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#34D399' }}>{aiFeedback.up}</Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>👍 Positivas</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)', borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#F87171' }}>{aiFeedback.down}</Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>👎 Negativas</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#8B5CF6' }}>
                            {Math.round((aiFeedback.up / (aiFeedback.up + aiFeedback.down)) * 100)}%
                          </Text>
                          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Satisfação</Text>
                        </View>
                      </View>
                      <View style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' }}>
                        <View style={{ height: 6, width: `${Math.round((aiFeedback.up / (aiFeedback.up + aiFeedback.down)) * 100)}%` as any, backgroundColor: '#34D399', borderRadius: 3 }} />
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 4, textAlign: 'center' }}>
                        {aiFeedback.up + aiFeedback.down} avaliações no total
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={st.cardDivider} />
                      <View style={st.emptySmall}>
                        <Ionicons name="chatbubble-outline" size={24} color={Colors.textMuted} />
                        <Text style={st.emptySmallText}>Sem avaliações de respostas ainda</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Sessões Activas */}
            {sessoesStats !== null && (
              <View style={st.section}>
                <SectionTitle label="Sessões Activas" color="#06B6D4" action={() => router.push('/(main)/sessoes-ativas' as any)} actionLabel="Ver detalhes" />
                <TouchableOpacity style={st.card} onPress={() => router.push('/(main)/sessoes-ativas' as any)} activeOpacity={0.85}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#06B6D422', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="wifi" size={22} color="#06B6D4" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sessoesStats.online > 0 ? Colors.success : Colors.textMuted }} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text }}>
                          {sessoesStats.online > 0 ? `${sessoesStats.online} utilizador${sessoesStats.online !== 1 ? 'es' : ''} online` : 'Nenhum utilizador online'}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                        {sessoesStats.total} sessão${sessoesStats.total !== 1 ? 'ões' : ''} registada${sessoesStats.total !== 1 ? 's' : ''} · Toque para ver detalhes
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                  {sessoesStats.online > 0 && (
                    <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: Colors.success + '18', borderRadius: 8, borderWidth: 1, borderColor: Colors.success + '44', paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success }} />
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.success }}>{sessoesStats.online} online agora</Text>
                      </View>
                      <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 8, borderWidth: 1, borderColor: Colors.warning + '44', paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.warning }}>{sessoesStats.total - sessoesStats.online} inactivos</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Estado de Matrículas */}
            <View style={st.section}>
              <SectionTitle label="Estado de Matrículas" color={Colors.info} action={() => router.push('/(main)/alunos')} actionLabel="Ver alunos" />
              <View style={st.card}>
                <View style={st.matriculaResumo}>
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: Colors.success }]}>{adminData.alunosAtivos.length}</Text>
                    <Text style={st.matriculaSmall}>Matrículas Activas</Text>
                  </View>
                  <View style={st.matriculaDivider} />
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: Colors.textMuted }]}>{Math.max(0, adminData.totalCap - adminData.alunosAtivos.length)}</Text>
                    <Text style={st.matriculaSmall}>Vagas Disponíveis</Text>
                  </View>
                  <View style={st.matriculaDivider} />
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: Colors.gold }]}>{adminData.totalCap}</Text>
                    <Text style={st.matriculaSmall}>Capacidade Total</Text>
                  </View>
                </View>
                <View style={st.ocupacaoBarraWrap}>
                  <View style={[st.ocupacaoBarra, { flex: adminData.alunosAtivos.length || 0.001, backgroundColor: Colors.success }]} />
                  <View style={[st.ocupacaoBarra, { flex: Math.max(adminData.totalCap - adminData.alunosAtivos.length, 0.001), backgroundColor: Colors.border }]} />
                </View>
                <Text style={st.ocupacaoLegenda}>
                  {adminData.taxaOcupacao}% das vagas preenchidas
                </Text>
                <View style={st.cardDivider} />
                <Text style={st.subCardTitle}>Distribuição por Género</Text>
                <GenderBar masculino={adminData.masculino} feminino={adminData.feminino} total={adminData.alunosAtivos.length} />
                {adminData.matriculasPorNivel.length > 0 && (
                  <>
                    <View style={st.cardDivider} />
                    <Text style={st.subCardTitle}>Alunos por Nível de Ensino</Text>
                    <View style={st.nivelChipsRow}>
                      {adminData.matriculasPorNivel.map(n => (
                        <View key={n.label} style={[st.nivelChip, { borderColor: n.color + '55', backgroundColor: n.color + '11' }]}>
                          <Text style={[st.nivelChipVal, { color: n.color }]}>{n.value}</Text>
                          <Text style={[st.nivelChipLabel, { color: n.color }]}>{n.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Alunos por Turno */}
            {adminData.alunosPorTurno.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Alunos por Turno" color={Colors.gold} />
                <View style={[st.card, { alignItems: 'center' }]}>
                  <DonutChart data={adminData.alunosPorTurno} size={180} thickness={32} centerLabel={String(adminData.alunosAtivos.length)} centerSub="alunos" />
                </View>
              </View>
            )}

            {/* Processo de Admissão */}
            {adminData.estadosAdmissao.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Processo de Admissão" color='#8B5CF6' action={() => router.push('/(main)/admissao' as any)} actionLabel="Ver admissões" />
                <View style={st.card}>
                  <View style={st.admissaoSummary}>
                    {adminData.estadosAdmissao.map(e => (
                      <View key={e.label} style={[st.admissaoChip, { backgroundColor: e.color + '18', borderColor: e.color + '44' }]}>
                        <Text style={[st.admissaoVal, { color: e.color }]}>{e.value}</Text>
                        <Text style={[st.admissaoLbl, { color: e.color }]}>{e.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={st.cardDivider} />
                  <DonutChart data={adminData.estadosAdmissao} size={180} thickness={30} centerLabel={String(registros.length)} centerSub="pedidos" />
                </View>
              </View>
            )}

            {/* Taxa de Ocupação por Turma — barras bold */}
            {adminData.ocupacaoPorTurma.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Taxa de Ocupação por Turma" color={Colors.warning} action={() => router.push('/(main)/turmas')} actionLabel="Ver turmas" />
                <View style={st.card}>
                  {adminData.ocupacaoPorTurma.map((t, idx) => {
                    const cor = t.pct >= 0.9 ? Colors.danger : t.pct >= 0.7 ? Colors.warning : Colors.success;
                    const pctLabel = Math.round(t.pct * 100);
                    return (
                      <View key={t.nome} style={[st.ocupRow, idx > 0 && { marginTop: 12 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                          <Text style={st.ocupNome} numberOfLines={1}>{t.nome}</Text>
                          <Text style={[st.ocupPct, { color: cor }]}>{pctLabel}% · {t.count}/{t.cap}</Text>
                        </View>
                        <View style={[st.ocupBarWrap, { height: 14 }]}>
                          <View style={[st.ocupBarFill, { width: `${pctLabel}%` as any, backgroundColor: cor }]} />
                        </View>
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 10, justifyContent: 'flex-end' }}>
                    {[{ label: '≥90%', color: Colors.danger }, { label: '70–90%', color: Colors.warning }, { label: '<70%', color: Colors.success }].map(l => (
                      <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Presenças da Semana */}
            <View style={st.section}>
              <SectionTitle label="Presenças (Últimos 7 dias)" color={Colors.success} action={() => router.push('/(main)/presencas')} actionLabel="Ver detalhes" />
              <View style={st.card}>
                {adminData.presencaTotal === 0 ? (
                  <View style={st.emptySmall}>
                    <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
                    <Text style={st.emptySmallText}>Sem registos de presença neste período</Text>
                  </View>
                ) : (
                  <>
                    <View style={st.presencaResumo}>
                      <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.success }]}>{adminData.presentes}</Text><Text style={st.presencaLbl}>Presentes</Text></View>
                      <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.danger }]}>{adminData.faltas}</Text><Text style={st.presencaLbl}>Faltas</Text></View>
                      <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.warning }]}>{adminData.justif}</Text><Text style={st.presencaLbl}>Justif.</Text></View>
                      <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.gold }]}>{adminData.taxaP}%</Text><Text style={st.presencaLbl}>Assiduidade</Text></View>
                    </View>
                    <View style={st.presencaBarra}>
                      {adminData.presentes > 0 && <View style={[st.presencaBarSeg, { flex: adminData.presentes, backgroundColor: Colors.success }]} />}
                      {adminData.justif > 0 && <View style={[st.presencaBarSeg, { flex: adminData.justif, backgroundColor: Colors.warning }]} />}
                      {adminData.faltas > 0 && <View style={[st.presencaBarSeg, { flex: adminData.faltas, backgroundColor: Colors.danger }]} />}
                    </View>
                    <View style={st.cardDivider} />
                    <DonutChart
                      data={[
                        { label: 'Presentes', value: adminData.presentes, color: Colors.success },
                        { label: 'Justif.', value: adminData.justif, color: Colors.warning },
                        { label: 'Faltas', value: adminData.faltas, color: Colors.danger },
                      ].filter(d => d.value > 0)}
                      size={160} thickness={26} centerLabel={`${adminData.taxaP}%`} centerSub="assiduidade"
                    />
                  </>
                )}
              </View>
            </View>

            {/* Pessoal — só para CEO/PCA/Admin/Director */}
            {isRhViewer && (
              <View style={st.section}>
                <SectionTitle label="Recursos Humanos — Pessoal" color='#8B5CF6' action={() => router.push('/(main)/rh-controle' as any)} actionLabel="Gerir Pessoal" />
                <View style={st.card}>
                  <View style={st.matriculaResumo}>
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: '#8B5CF6' }]}>{funcionarios.length}</Text>
                      <Text style={st.matriculaSmall}>Total de{'\n'}Funcionários</Text>
                    </View>
                    <View style={st.matriculaDivider} />
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: Colors.success }]}>{funcionarios.filter(f => f.ativo).length}</Text>
                      <Text style={st.matriculaSmall}>Activos</Text>
                    </View>
                    <View style={st.matriculaDivider} />
                    <View style={st.matriculaResumoItem}>
                      <Text style={[st.matriculaBig, { color: Colors.textMuted }]}>{funcionarios.filter(f => !f.ativo).length}</Text>
                      <Text style={st.matriculaSmall}>Inactivos</Text>
                    </View>
                  </View>
                  <View style={st.cardDivider} />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[st.rhActionBtn, { borderColor: '#8B5CF644', backgroundColor: '#8B5CF611' }]} onPress={() => router.push('/(main)/rh-controle' as any)}>
                      <Ionicons name="people" size={16} color="#8B5CF6" />
                      <Text style={[st.rhActionLabel, { color: '#8B5CF6' }]}>Gerir Pessoal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.rhActionBtn, { borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '11' }]} onPress={() => router.push('/(main)/rh-payroll' as any)}>
                      <Ionicons name="cash" size={16} color={Colors.gold} />
                      <Text style={[st.rhActionLabel, { color: Colors.gold }]}>Vencimentos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.rhActionBtn, { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11' }]} onPress={() => router.push('/(main)/rh-hub' as any)}>
                      <Ionicons name="briefcase" size={16} color={Colors.info} />
                      <Text style={[st.rhActionLabel, { color: Colors.info }]}>Hub RH</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Desempenho por Disciplina */}
            <View style={st.section}>
              <SectionTitle label="Médias por Disciplina" color={Colors.gold} action={() => router.push('/(main)/desempenho')} actionLabel="Ver desempenho" />
              <View style={[st.card, { alignItems: 'center' }]}>
                {adminData.desempenhoPorDisciplina.length > 0 ? (
                  <BarChart data={adminData.desempenhoPorDisciplina} maxValue={20} height={180} width={CHART_W} />
                ) : (
                  <View style={st.emptySmall}>
                    <Ionicons name="bar-chart-outline" size={32} color={Colors.textMuted} />
                    <Text style={st.emptySmallText}>Sem notas lançadas</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Próximos Eventos */}
            <View style={st.section}>
              <SectionTitle label="Próximos Eventos" color={Colors.accent} action={() => router.push('/(main)/eventos')} actionLabel="Ver todos" />
              {adminData.proximosEventos.length === 0 ? (
                <View style={[st.card, st.emptySmall]}>
                  <Ionicons name="calendar-outline" size={28} color={Colors.textMuted} />
                  <Text style={st.emptySmallText}>Sem eventos programados</Text>
                </View>
              ) : (
                adminData.proximosEventos.map(ev => (
                  <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/eventos')} eventoTypeColor={eventoTypeColor} />
                ))
              )}
            </View>

            {/* Solicitações de Documentos — secretaria */}
            {isSecretariaRole && (
              <View style={st.section}>
                <SectionTitle
                  label="Solicitações de Documentos"
                  color={Colors.gold}
                  action={() => router.push('/(main)/solicitacoes-secretaria' as any)}
                  actionLabel="Ver todas"
                />
                <TouchableOpacity
                  style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}
                  onPress={() => setShowSolicitacoesModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="file-document-multiple" size={22} color={Colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>
                      {solicitacoesPendentes.length > 0
                        ? `${solicitacoesPendentes.length} pedido${solicitacoesPendentes.length !== 1 ? 's' : ''} pendente${solicitacoesPendentes.length !== 1 ? 's' : ''}`
                        : 'Sem pendências'}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                      {solicitacoesPendentes.length > 0
                        ? 'Toque para gerir e emitir documentos'
                        : 'Todas as solicitações foram tratadas'}
                    </Text>
                  </View>
                  {solicitacoesPendentes.length > 0 && (
                    <View style={{ backgroundColor: Colors.danger, borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{solicitacoesPendentes.length}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Acções Rápidas */}
            <View style={st.section}>
              <SectionTitle label={isFinanceRole ? 'Acesso Financeiro Rápido' : 'Acesso Rápido — Todos os Módulos'} color={isFinanceRole ? Colors.success : Colors.primaryLight} />
              <QuickActions actions={isFinanceRole ? [
                { label: 'Financeiro', icon: 'cash', route: '/(main)/financeiro', color: Colors.success },
                { label: 'Propinas', icon: 'wallet', route: '/(main)/financeiro', color: Colors.info },
                { label: 'Pagamentos', icon: 'receipt', route: '/(main)/pagamentos-hub', color: Colors.gold },
                { label: 'Em Atraso', icon: 'alert-circle', route: '/(main)/financeiro', color: Colors.danger },
                { label: 'Rubricas', icon: 'pricetag', route: '/(main)/financeiro', color: '#8B5CF6' },
                { label: 'Tesouraria', icon: 'business', route: '/(main)/tesouraria', color: Colors.accent },
                { label: 'Bolsas', icon: 'ribbon', route: '/(main)/bolsas', color: Colors.warning },
                { label: 'Alunos', icon: 'people', route: '/(main)/alunos', color: Colors.info },
                { label: 'Relatórios', icon: 'bar-chart', route: '/(main)/relatorios', color: Colors.warning },
              ] : [
                { label: 'Alunos', icon: 'people', route: '/(main)/alunos', color: Colors.info },
                { label: 'Turmas', icon: 'layers', route: '/(main)/turmas', color: Colors.success },
                { label: 'Professores', icon: 'school', route: '/(main)/professores', color: Colors.gold },
                { label: 'Admissões', icon: 'person-add', route: '/(main)/admissao', color: Colors.accent },
                { label: 'Financeiro', icon: 'cash', route: '/(main)/financeiro', color: '#10B981' },
                { label: 'RH', icon: 'briefcase', route: '/(main)/rh-hub', color: '#8B5CF6' },
                { label: 'Disciplinas', icon: 'book', route: '/(main)/disciplinas', color: Colors.warning },
                { label: 'Horário', icon: 'time', route: '/(main)/horario', color: Colors.info },
                { label: 'Pedagógico', icon: 'ribbon', route: '/(main)/pedagogico', color: Colors.gold, badge: exameBadge || undefined },
                { label: 'Presenças', icon: 'qr-code', route: '/(main)/presencas', color: Colors.success },
                { label: 'Desempenho', icon: 'stats-chart', route: '/(main)/desempenho', color: '#8B5CF6' },
                { label: 'Secretaria', icon: 'clipboard', route: '/(main)/secretaria-hub', color: Colors.accent },
                { label: 'Biblioteca', icon: 'library', route: '/(main)/biblioteca', color: '#F97316' },
                { label: 'Documentos', icon: 'document-text', route: '/(main)/documentos-hub', color: Colors.info },
                { label: 'Calendário', icon: 'calendar-outline', route: '/(main)/calendario-academico', color: '#06B6D4' },
                { label: 'Eventos', icon: 'calendar', route: '/(main)/eventos', color: Colors.danger },
                { label: 'Chat Interno', icon: 'chatbubbles', route: '/(main)/chat-interno', color: Colors.accent },
                { label: 'Quadro Honra', icon: 'trophy', route: '/(main)/quadro-honra', color: Colors.gold },
                { label: 'Relatórios', icon: 'bar-chart', route: '/(main)/relatorios', color: Colors.warning },
                { label: 'Salas', icon: 'business', route: '/(main)/salas', color: Colors.textMuted },
                { label: 'Notas', icon: 'ribbon', route: '/(main)/notas', color: Colors.accent },
                { label: 'Tesouraria', icon: 'wallet', route: '/(main)/tesouraria', color: '#10B981' },
                { label: 'Configurações', icon: 'settings', route: '/(main)/admin', color: Colors.textMuted },
              ]} />
            </View>
          </>
        )}


        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO RESPONSÁVEL FINANCEIRO                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isFinanceiroOnly && (() => {
          const anoAtual = anoLetivo;
          const pagsAno = pagamentos.filter(p => p.ano === anoAtual);
          const totalRec = getTotalRecebido(anoAtual);
          const totalPend = getTotalPendente(anoAtual);
          const totalCob = totalRec + totalPend;
          const pctPago = totalCob > 0 ? Math.round((totalRec / totalCob) * 100) : 0;
          const nAlunosAtraso = new Set(
            pagsAno.filter(p => p.status === 'pendente').map(p => p.alunoId)
          ).size;
          const MESES_FIN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
          const receitaMensal = MESES_FIN.map((label, i) => ({
            label,
            value: pagsAno.filter(p => p.status === 'pago' && p.mes === i + 1).reduce((s, p) => s + p.valor, 0),
            color: Colors.success,
          })).filter(d => d.value > 0);
          const formatV = (v: number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}K` : String(v);

          const devedorMap: Record<string, { meses: number; valor: number }> = {};
          pagsAno.filter(p => p.status === 'pendente').forEach(p => {
            const k = String(p.alunoId);
            if (!devedorMap[k]) devedorMap[k] = { meses: 0, valor: 0 };
            devedorMap[k].meses++;
            devedorMap[k].valor += p.valor;
          });
          const topDevedores = Object.entries(devedorMap)
            .map(([alunoId, d]) => {
              const al = alunos.find(a => String(a.id) === alunoId);
              const turma = al ? turmas.find(t => String(t.id) === String(al.turmaId)) : undefined;
              return { alunoId, nome: al ? `${al.nome} ${al.apelido ?? ''}`.trim() : '—', turma: turma?.nome ?? '—', ...d };
            })
            .filter(d => d.nome !== '—')
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 6);

          return (
            <>
              <View style={[st.card, { borderColor: Colors.success + '44', backgroundColor: Colors.success + '08', flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
                <View style={[st.kpiIcon, { backgroundColor: Colors.success + '22', width: 48, height: 48, borderRadius: 14 }]}>
                  <Ionicons name="cash" size={24} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success }}>Gestão Financeira</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                    Controlo de receitas e pagamentos · {anoLetivo}
                  </Text>
                </View>
              </View>

              <CollapsibleStats storageKey="dash-fin-kpi" title="Resumo Financeiro" color={Colors.success} action={() => router.push('/(main)/financeiro')} actionLabel="Ver detalhe">
                <View style={st.kpiGrid}>
                  <KpiCard label="Arrecadado" value={`${formatV(totalRec)} Kz`} sub="Pagamentos recebidos" color={Colors.success} icon="trending-up" onPress={() => router.push('/(main)/financeiro')} />
                  <KpiCard label="Pendente" value={`${formatV(totalPend)} Kz`} sub="Por cobrar" color={totalPend > 0 ? Colors.warning : Colors.textMuted} icon="time" onPress={() => router.push('/(main)/financeiro')} />
                  <KpiCard label="Cobrança" value={`${pctPago}%`} sub="Taxa de cobrança" color={pctPago >= 80 ? Colors.success : pctPago >= 50 ? Colors.warning : Colors.danger} icon="stats-chart" />
                  <KpiCard label="Em Atraso" value={nAlunosAtraso} sub="Alunos com dívida" color={nAlunosAtraso > 0 ? Colors.danger : Colors.textMuted} icon="alert-circle" onPress={() => router.push('/(main)/financeiro')} />
                </View>
              </CollapsibleStats>

              {receitaMensal.length > 0 && (
                <View style={st.section}>
                  <SectionTitle label="Receita por Mês" color={Colors.success} />
                  <View style={[st.card, { alignItems: 'center' }]}>
                    <BarChart data={receitaMensal} maxValue={Math.max(...receitaMensal.map(d => d.value))} height={160} width={CHART_W} />
                  </View>
                </View>
              )}

              {topDevedores.length > 0 && (
                <View style={st.section}>
                  <SectionTitle label="Maiores Devedores" color={Colors.danger} action={() => router.push('/(main)/financeiro')} actionLabel="Ver todos" />
                  <View style={st.card}>
                    <View style={[st.alertHeader, { borderBottomColor: Colors.danger + '33' }]}>
                      <Text style={[st.alertHeaderText, { flex: 3 }]}>Aluno</Text>
                      <Text style={[st.alertHeaderText, { flex: 2 }]}>Turma</Text>
                      <Text style={[st.alertHeaderText, { flex: 1, textAlign: 'center' }]}>Meses</Text>
                      <Text style={[st.alertHeaderText, { flex: 2, textAlign: 'right' }]}>Valor</Text>
                    </View>
                    {topDevedores.map((d, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setDevedorSheet({ alunoId: d.alunoId, nome: d.nome, turma: d.turma, meses: d.meses, valor: d.valor })}
                        style={[st.alertRow, i > 0 && { borderTopColor: Colors.cardBorder, borderTopWidth: 1 }]}
                      >
                        <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[st.rankBadge, { backgroundColor: i === 0 ? Colors.danger + '33' : Colors.warning + '22' }]}>
                            <Text style={[st.rankText, { color: i === 0 ? Colors.danger : Colors.warning }]}>{i + 1}</Text>
                          </View>
                          <Text style={st.alertName} numberOfLines={1}>{d.nome}</Text>
                        </View>
                        <Text style={[st.alertSub, { flex: 2 }]} numberOfLines={1}>{d.turma}</Text>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <View style={[st.mesBadge, { backgroundColor: d.meses >= 3 ? Colors.danger + '22' : Colors.warning + '22' }]}>
                            <Text style={[st.mesBadgeText, { color: d.meses >= 3 ? Colors.danger : Colors.warning }]}>{d.meses}m</Text>
                          </View>
                        </View>
                        <Text style={[st.alertValue, { flex: 2, color: Colors.danger, textAlign: 'right' }]}>{formatV(d.valor)} Kz</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={st.section}>
                <SectionTitle label="Acesso Rápido" color={Colors.success} />
                <QuickActions actions={[
                  { label: 'Módulo Financeiro', icon: 'cash', route: '/(main)/financeiro', color: Colors.success },
                  { label: 'Propinas', icon: 'wallet', route: '/(main)/financeiro', color: Colors.info },
                  { label: 'Pagamentos', icon: 'receipt', route: '/(main)/financeiro', color: Colors.gold },
                  { label: 'Em Atraso', icon: 'alert-circle', route: '/(main)/financeiro', color: Colors.danger },
                  { label: 'Rubricas', icon: 'pricetag', route: '/(main)/financeiro', color: '#8B5CF6' },
                  { label: 'Relatórios', icon: 'bar-chart', route: '/(main)/financeiro', color: Colors.warning },
                ]} />
              </View>
            </>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO RESPONSÁVEL PEDAGÓGICO                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isPedagogicoOnly && adminData && (
          <>
            <View style={[st.card, { borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '08', flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
              <View style={[st.kpiIcon, { backgroundColor: Colors.gold + '22', width: 48, height: 48, borderRadius: 14 }]}>
                <Ionicons name="book" size={24} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold }}>Gestão Pedagógica</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  Desempenho académico e acompanhamento · {anoLetivo}
                </Text>
              </View>
            </View>

            <CollapsibleStats storageKey="dash-ped-kpi" title="Indicadores Académicos" color={Colors.gold} action={() => router.push('/(main)/pedagogico')} actionLabel="Ver pedagógico">
              <View style={st.kpiGrid}>
                <KpiCard label="Alunos" value={adminData.alunosAtivos.length} sub="Matriculados" color={Colors.info} icon="people" onPress={() => router.push('/(main)/alunos')} />
                <KpiCard label="Turmas" value={adminData.turmasAtivas.length} sub="Activas" color={Colors.success} icon="layers" onPress={() => router.push('/(main)/turmas')} />
                <KpiCard label="Aprovação" value={`${adminData.taxaAprov}%`} sub="Taxa global" color={adminData.taxaAprov >= 70 ? Colors.success : adminData.taxaAprov >= 50 ? Colors.warning : Colors.danger} icon="checkmark-circle" onPress={() => router.push('/(main)/desempenho')} />
                <KpiCard label="Média Geral" value={adminData.mediaGeral} sub="Escala 0–20" color={Colors.accent} icon="ribbon" onPress={() => router.push('/(main)/desempenho')} />
              </View>
            </CollapsibleStats>

            {adminData.presencaTotal > 0 && (
              <View style={st.section}>
                <SectionTitle label="Presenças (Últimos 7 dias)" color={Colors.success} action={() => router.push('/(main)/presencas')} actionLabel="Ver detalhes" />
                <View style={st.card}>
                  <View style={st.presencaResumo}>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.success }]}>{adminData.presentes}</Text><Text style={st.presencaLbl}>Presentes</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.danger }]}>{adminData.faltas}</Text><Text style={st.presencaLbl}>Faltas</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.warning }]}>{adminData.justif}</Text><Text style={st.presencaLbl}>Justif.</Text></View>
                    <View style={st.presencaItem}><Text style={[st.presencaVal, { color: Colors.gold }]}>{adminData.taxaP}%</Text><Text style={st.presencaLbl}>Assiduidade</Text></View>
                  </View>
                  <View style={st.presencaBarra}>
                    {adminData.presentes > 0 && <View style={[st.presencaBarSeg, { flex: adminData.presentes, backgroundColor: Colors.success }]} />}
                    {adminData.justif > 0 && <View style={[st.presencaBarSeg, { flex: adminData.justif, backgroundColor: Colors.warning }]} />}
                    {adminData.faltas > 0 && <View style={[st.presencaBarSeg, { flex: adminData.faltas, backgroundColor: Colors.danger }]} />}
                  </View>
                </View>
              </View>
            )}

            {adminData.ocupacaoPorTurma.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Taxa de Ocupação por Turma" color={Colors.warning} action={() => router.push('/(main)/turmas')} actionLabel="Ver turmas" />
                <View style={st.card}>
                  {adminData.ocupacaoPorTurma.map((t, idx) => {
                    const cor = t.pct >= 0.9 ? Colors.danger : t.pct >= 0.7 ? Colors.warning : Colors.success;
                    return (
                      <View key={t.nome} style={[st.ocupRow, idx > 0 && { marginTop: 10 }]}>
                        <Text style={st.ocupNome} numberOfLines={1}>{t.nome}</Text>
                        <View style={st.ocupBarWrap}>
                          <View style={[st.ocupBarFill, { width: `${Math.round(t.pct * 100)}%` as any, backgroundColor: cor }]} />
                        </View>
                        <Text style={[st.ocupPct, { color: cor }]}>{t.count}/{t.cap}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={st.section}>
              <SectionTitle label="Médias por Disciplina" color={Colors.accent} action={() => router.push('/(main)/desempenho')} actionLabel="Ver desempenho" />
              <View style={[st.card, { alignItems: 'center' }]}>
                {adminData.desempenhoPorDisciplina.length > 0 ? (
                  <BarChart data={adminData.desempenhoPorDisciplina} maxValue={20} height={180} width={CHART_W} />
                ) : (
                  <View style={st.emptySmall}>
                    <Ionicons name="bar-chart-outline" size={32} color={Colors.textMuted} />
                    <Text style={st.emptySmallText}>Sem notas lançadas</Text>
                  </View>
                )}
              </View>
            </View>

            {adminData.proximosEventos.length > 0 && (
              <View style={st.section}>
                <SectionTitle label="Próximos Eventos" color={Colors.accent} action={() => router.push('/(main)/eventos')} actionLabel="Ver todos" />
                {adminData.proximosEventos.map(ev => (
                  <EventCard key={ev.id} evento={ev} onPress={() => router.push('/(main)/eventos')} eventoTypeColor={eventoTypeColor} />
                ))}
              </View>
            )}

            {(adminData.alunosRiscoAssiduidade.length > 0 || adminData.alunosRiscoNotas.length > 0) && (
              <View style={st.section}>
                <SectionTitle label="Alunos em Risco" color={Colors.danger} action={() => router.push('/(main)/pedagogico')} actionLabel="Ver pedagógico" />

                {adminData.alunosRiscoAssiduidade.length > 0 && (
                  <View style={[st.card, { marginBottom: 10 }]}>
                    <View style={[st.alertSubHeader, { borderBottomColor: Colors.warning + '44' }]}>
                      <Ionicons name="time-outline" size={14} color={Colors.warning} />
                      <Text style={[st.alertSubHeaderText, { color: Colors.warning }]}>Assiduidade crítica (&lt;75%)</Text>
                    </View>
                    <View style={[st.alertHeader, { borderBottomColor: Colors.cardBorder }]}>
                      <Text style={[st.alertHeaderText, { flex: 3 }]}>Aluno</Text>
                      <Text style={[st.alertHeaderText, { flex: 2 }]}>Turma</Text>
                      <Text style={[st.alertHeaderText, { flex: 1, textAlign: 'center' }]}>Faltas</Text>
                      <Text style={[st.alertHeaderText, { flex: 2, textAlign: 'right' }]}>Assiduidade</Text>
                    </View>
                    {adminData.alunosRiscoAssiduidade.map((a, i) => (
                      <TouchableOpacity key={a.id} onPress={() => router.push('/(main)/presencas')} style={[st.alertRow, i > 0 && { borderTopColor: Colors.cardBorder, borderTopWidth: 1 }]}>
                        <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[st.rankBadge, { backgroundColor: a.taxa < 60 ? Colors.danger + '33' : Colors.warning + '22' }]}>
                            <Ionicons name="warning" size={10} color={a.taxa < 60 ? Colors.danger : Colors.warning} />
                          </View>
                          <Text style={st.alertName} numberOfLines={1}>{a.nome}</Text>
                        </View>
                        <Text style={[st.alertSub, { flex: 2 }]} numberOfLines={1}>{a.turma}</Text>
                        <Text style={[st.alertSub, { flex: 1, textAlign: 'center' }]}>{a.faltas}/{a.total}</Text>
                        <View style={{ flex: 2, alignItems: 'flex-end' }}>
                          <View style={[st.mesBadge, { backgroundColor: a.taxa < 60 ? Colors.danger + '22' : Colors.warning + '22' }]}>
                            <Text style={[st.mesBadgeText, { color: a.taxa < 60 ? Colors.danger : Colors.warning }]}>{a.taxa}%</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {adminData.alunosRiscoNotas.length > 0 && (
                  <View style={st.card}>
                    <View style={[st.alertSubHeader, { borderBottomColor: Colors.danger + '44' }]}>
                      <Ionicons name="ribbon-outline" size={14} color={Colors.danger} />
                      <Text style={[st.alertSubHeaderText, { color: Colors.danger }]}>Risco de reprovação (média &lt;10)</Text>
                    </View>
                    <View style={[st.alertHeader, { borderBottomColor: Colors.cardBorder }]}>
                      <Text style={[st.alertHeaderText, { flex: 3 }]}>Aluno</Text>
                      <Text style={[st.alertHeaderText, { flex: 2 }]}>Turma</Text>
                      <Text style={[st.alertHeaderText, { flex: 2, textAlign: 'right' }]}>Média</Text>
                    </View>
                    {adminData.alunosRiscoNotas.map((a, i) => (
                      <TouchableOpacity key={a.id} onPress={() => router.push('/(main)/desempenho')} style={[st.alertRow, i > 0 && { borderTopColor: Colors.cardBorder, borderTopWidth: 1 }]}>
                        <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[st.rankBadge, { backgroundColor: Colors.danger + '33' }]}>
                            <Ionicons name="close-circle" size={10} color={Colors.danger} />
                          </View>
                          <Text style={st.alertName} numberOfLines={1}>{a.nome}</Text>
                        </View>
                        <Text style={[st.alertSub, { flex: 2 }]} numberOfLines={1}>{a.turma}</Text>
                        <View style={{ flex: 2, alignItems: 'flex-end' }}>
                          <View style={[st.mesBadge, { backgroundColor: a.media < 7 ? Colors.danger + '33' : Colors.danger + '22' }]}>
                            <Text style={[st.mesBadgeText, { color: Colors.danger }]}>{a.media} val.</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={st.section}>
              <SectionTitle label="Acesso Rápido" color={Colors.primaryLight} />
              <QuickActions actions={[
                { label: 'Pedagógico', icon: 'book', route: '/(main)/pedagogico', color: Colors.gold, badge: exameBadge || undefined },
                { label: 'Desempenho', icon: 'stats-chart', route: '/(main)/desempenho', color: Colors.accent },
                { label: 'Presenças', icon: 'qr-code', route: '/(main)/presencas', color: Colors.success },
                { label: 'Planificações', icon: 'clipboard', route: '/(main)/pedagogico', color: Colors.info },
                { label: 'Ocorrências', icon: 'warning', route: '/(main)/pedagogico', color: Colors.danger },
                { label: 'Eventos', icon: 'calendar', route: '/(main)/eventos', color: Colors.warning },
              ]} />
            </View>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAINEL DO RESPONSÁVEL DE RH                                */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {isRhOnly && (
          <>
            <View style={[st.card, { borderColor: '#8B5CF644', backgroundColor: '#8B5CF608', flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
              <View style={[st.kpiIcon, { backgroundColor: '#8B5CF622', width: 48, height: 48, borderRadius: 14 }]}>
                <Ionicons name="people" size={24} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#8B5CF6' }}>Recursos Humanos</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  Gestão de pessoal e vencimentos · {anoLetivo}
                </Text>
              </View>
            </View>

            <View style={st.section}>
              <SectionTitle label="Pessoal" color="#8B5CF6" action={() => router.push('/(main)/rh-hub' as any)} actionLabel="Ver RH" />
              <View style={st.card}>
                <View style={st.matriculaResumo}>
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: '#8B5CF6' }]}>{funcionarios.length}</Text>
                    <Text style={st.matriculaSmall}>Total</Text>
                  </View>
                  <View style={st.matriculaDivider} />
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: Colors.success }]}>{funcionarios.filter(f => f.ativo).length}</Text>
                    <Text style={st.matriculaSmall}>Activos</Text>
                  </View>
                  <View style={st.matriculaDivider} />
                  <View style={st.matriculaResumoItem}>
                    <Text style={[st.matriculaBig, { color: Colors.textMuted }]}>{funcionarios.filter(f => !f.ativo).length}</Text>
                    <Text style={st.matriculaSmall}>Inactivos</Text>
                  </View>
                </View>
                <View style={st.cardDivider} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[st.rhActionBtn, { borderColor: '#8B5CF644', backgroundColor: '#8B5CF611' }]} onPress={() => router.push('/(main)/rh-controle' as any)}>
                    <Ionicons name="people" size={16} color="#8B5CF6" />
                    <Text style={[st.rhActionLabel, { color: '#8B5CF6' }]}>Gerir Pessoal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.rhActionBtn, { borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '11' }]} onPress={() => router.push('/(main)/rh-payroll' as any)}>
                    <Ionicons name="cash" size={16} color={Colors.gold} />
                    <Text style={[st.rhActionLabel, { color: Colors.gold }]}>Vencimentos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.rhActionBtn, { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11' }]} onPress={() => router.push('/(main)/rh-hub' as any)}>
                    <Ionicons name="briefcase" size={16} color={Colors.info} />
                    <Text style={[st.rhActionLabel, { color: Colors.info }]}>Hub RH</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Gráficos RH */}
            {funcionarios.length > 0 && (() => {
              const deptMap: Record<string, number> = {};
              funcionarios.filter((f: any) => f.ativo).forEach((f: any) => {
                const dept = f.departamento || 'Outro';
                deptMap[dept] = (deptMap[dept] || 0) + 1;
              });
              const deptData = Object.entries(deptMap).map(([label, value], i) => ({
                label: label.substring(0, 8),
                value,
                color: ['#8B5CF6', Colors.gold, Colors.info, Colors.accent, Colors.success, Colors.warning][i % 6],
              }));
              const contrMap: Record<string, number> = {};
              funcionarios.filter((f: any) => f.ativo).forEach((f: any) => {
                const ct = f.tipoContrato || 'Indefinido';
                contrMap[ct] = (contrMap[ct] || 0) + 1;
              });
              const contrData = Object.entries(contrMap).map(([label, value], i) => ({
                label: label.substring(0, 10),
                value,
                color: ['#8B5CF6', Colors.gold, Colors.info, Colors.success][i % 4],
              }));
              return (
                <>
                  {deptData.length > 0 && (
                    <View style={st.section}>
                      <SectionTitle label="Pessoal por Departamento" color="#8B5CF6" action={() => router.push('/(main)/rh-controle' as any)} actionLabel="Ver pessoal" />
                      <View style={[st.card, { alignItems: 'center' }]}>
                        <DonutChart
                          data={deptData}
                          size={170} thickness={30}
                          centerLabel={String(funcionarios.filter((f: any) => f.ativo).length)}
                          centerSub="activos"
                        />
                      </View>
                    </View>
                  )}
                  {contrData.length > 0 && (
                    <View style={st.section}>
                      <SectionTitle label="Tipo de Contrato (Activos)" color={Colors.gold} />
                      <View style={[st.card, { alignItems: 'center' }]}>
                        <BarChart
                          data={contrData}
                          maxValue={Math.max(...contrData.map(d => d.value), 1)}
                          height={140} width={CHART_W}
                        />
                      </View>
                    </View>
                  )}
                </>
              );
            })()}

            <View style={st.section}>
              <SectionTitle label="Acesso Rápido" color={Colors.primaryLight} />
              <QuickActions actions={[
                { label: 'Hub RH', icon: 'briefcase', route: '/(main)/rh-hub', color: '#8B5CF6' },
                { label: 'Vencimentos', icon: 'cash', route: '/(main)/rh-payroll', color: Colors.gold },
                { label: 'Faltas/Tempos', icon: 'time', route: '/(main)/rh-faltas-tempos', color: Colors.warning },
                { label: 'Pessoal', icon: 'people', route: '/(main)/rh-controle', color: Colors.info },
                { label: 'Professores', icon: 'school', route: '/(main)/professores', color: Colors.gold },
                { label: 'Assiduidade', icon: 'calendar-check', route: '/(main)/rh-controle?tab=assiduidade', color: Colors.accent },
              ]} />
            </View>
          </>
        )}

        {/* Rodapé com a identidade da empresa proprietária do sistema */}
        <EmpresaFooter />

      </ScrollView>

      {/* Modal passo-a-passo — solicitações de documentos */}
      {isSecretariaRole && (
        <PendingSolicitacoesModal
          visible={showSolicitacoesModal}
          solicitacoes={solicitacoesPendentes}
          onClose={() => setShowSolicitacoesModal(false)}
          onAdiar={() => {
            manuallyClosedRef.current = true;
            setShowSolicitacoesModal(false);
          }}
          onUpdate={(updated) => {
            setSolicitacoesPendentes(prev => {
              const next = prev.map(s => s.id === updated.id ? updated : s)
                .filter(s => s.status === 'pendente' || s.status === 'em_processamento');
              if (next.length === 0) setShowSolicitacoesModal(false);
              return next;
            });
          }}
        />
      )}

      <DevedorQuickActions
        visible={devedorSheet !== null}
        devedor={devedorSheet}
        onClose={() => setDevedorSheet(null)}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20 },

  profTabRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  profTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  profTabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  profTabLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  profTabLabelActive: { color: Colors.primaryDark },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0, marginRight: 8 },
  sectionBar: { width: 4, height: 18, borderRadius: 2 },
  sectionLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  seeAll: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12 },
  cardDivider: { height: 1, backgroundColor: Colors.border },
  subCardTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { flex: 1, minWidth: 0, backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderTopWidth: 3, padding: 12, gap: 3, alignItems: 'center' },
  kpiIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  kpiLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  kpiSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  matriculaResumo: { flexDirection: 'row', alignItems: 'center' },
  matriculaResumoItem: { flex: 1, alignItems: 'center', gap: 2 },
  matriculaDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  matriculaBig: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  matriculaSmall: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  ocupacaoBarraWrap: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  ocupacaoBarra: { borderRadius: 4 },
  ocupacaoLegenda: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  genderWrap: { gap: 8 },
  genderBarRow: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  genderSegM: { backgroundColor: Colors.info, borderRadius: 4 },
  genderSegF: { backgroundColor: '#EC4899', borderRadius: 4 },
  genderLegRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  genderLegItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  genderDot: { width: 8, height: 8, borderRadius: 4 },
  genderTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  nivelChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nivelChip: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, padding: 9, alignItems: 'center', gap: 2 },
  nivelChipVal: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  nivelChipLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },

  admissaoSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  admissaoChip: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, padding: 9, alignItems: 'center', gap: 2 },
  admissaoVal: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  admissaoLbl: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },

  ocupRow: { gap: 4 },
  ocupNome: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  ocupBarWrap: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  ocupBarFill: { height: '100%', borderRadius: 4 },
  ocupPct: { fontSize: 11, fontFamily: 'Inter_700Bold', alignSelf: 'flex-end' },

  presencaResumo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presencaItem: { flex: 1, alignItems: 'center', gap: 2 },
  presencaVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  presencaLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  presencaBarra: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  presencaBarSeg: { borderRadius: 4 },

  eventCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  eventBar: { width: 4, alignSelf: 'stretch' },
  eventBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 3 },
  eventTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  eventDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  eventBadge: { marginRight: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  eventBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  qaBtn: { flex: 1, minWidth: '30%', backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, padding: 11, alignItems: 'center', gap: 6 },
  qaIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  qaBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.backgroundCard },
  qaBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },

  emptySmall: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptySmallText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  rhActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8 },
  rhActionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },

  // Aluno specific
  alunoIdentCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  alunoAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  alunoAvatarText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold },
  alunoIdentInfo: { flex: 1, gap: 2 },
  alunoIdentNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoIdentMat: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  alunoIdentTurmaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  alunoIdentTurma: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold },
  bloqueadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.danger + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  bloqueadoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.danger },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  alertTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  alertSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  alertHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1 },
  alertHeaderText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  alertRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 4 },
  alertName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  alertValue: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  rankBadge: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  mesBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  mesBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  alertSubHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1 },
  alertSubHeaderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  portalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  portalBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.background },

  // Bold KPI cards (Director panel)
  boldKpiCard: { flex: 1, minWidth: '46%', borderRadius: 14, borderWidth: 1, overflow: 'hidden', flexDirection: 'row' },
  boldKpiAccent: { width: 4, alignSelf: 'stretch' },
  boldKpiInner: { flex: 1, padding: 12, paddingLeft: 10 },
  boldKpiValue: { fontSize: 24, fontFamily: 'Inter_700Bold', lineHeight: 28 },
  boldKpiLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  boldKpiSub: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 3 },

  // Professor specific
  turmaRow: { gap: 6 },
  turmaRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  turmaNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  turmaBarWrap: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  turmaBarFill: { height: '100%', borderRadius: 4 },
  turmaCount: { fontSize: 11, fontFamily: 'Inter_600SemiBold', alignSelf: 'flex-end' },
  turnoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  turnoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});
