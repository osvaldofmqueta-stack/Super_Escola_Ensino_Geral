import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Linking, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppLoader from '@/components/AppLoader';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { api } from '@/lib/api';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useFinanceiro, formatAOA } from '@/context/FinanceiroContext';
import { useConfig } from '@/context/ConfigContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useUsers } from '@/context/UsersContext';
import { useNotificacoes, timeAgo } from '@/context/NotificacoesContext';
import TopBar from '@/components/TopBar';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useTabMemory } from '@/hooks/useTabMemory';
import { webAlert } from '@/utils/webAlert';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { ENCARREGADO_TOUR_STEPS, ENCARREGADO_TOUR_KEY } from '@/constants/tourSteps';

const { width } = Dimensions.get('window');

const TABS = [
  { key: 'painel', label: 'Painel', icon: 'grid' },
  { key: 'notas', label: 'Notas', icon: 'document-text' },
  { key: 'presencas', label: 'Presenças', icon: 'checkmark-circle' },
  { key: 'faltas', label: 'Faltas', icon: 'close-circle' },
  { key: 'diario', label: 'Diário', icon: 'book' },
  { key: 'financeiro', label: 'Financeiro', icon: 'cash' },
  { key: 'mensagens', label: 'Mensagens', icon: 'chatbubbles' },
  { key: 'horario', label: 'Horário', icon: 'time' },
  { key: 'materiais', label: 'Materiais', icon: 'library' },
  { key: 'calendario', label: 'Calendário', icon: 'calendar' },
] as const;

type TabKey = typeof TABS[number]['key'];

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

function SectionTitle({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as any} size={16} color={Colors.gold} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NotaCell({ value }: { value: number }) {
  const ok = value >= 10;
  const color = value === 0 ? Colors.textMuted : ok ? Colors.success : Colors.danger;
  return (
    <View style={[styles.notaCell, { borderColor: color + '44' }]}>
      <Text style={[styles.notaValue, { color }]}>{value === 0 ? '—' : value.toFixed(0)}</Text>
    </View>
  );
}

export default function PortalEncarregadoScreen() {
  const { user } = useAuth();
  const { users } = useUsers();
  const { alunos, turmas, notas, presencas, eventos } = useData();
  const { taxas, pagamentos, getPagamentosAluno, getTaxasByNivel, getMesesEmAtraso, calcularMulta, gerarRUPE, getRUPEsAluno, addPagamento, getSaldoAluno } = useFinanceiro();
  const { config } = useConfig();
  const { mensagens, sumarios, materiais, calendarioProvas } = useProfessor();
  const { anoSelecionado } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const { pushState, subscribe, unsubscribe, isSupported } = usePushNotifications();
  const { notificacoes: alertas, unreadCount, marcarLida, load: reloadAlertas } = useNotificacoes();
  const [pushLoading, setPushLoading] = useState(false);
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(ENCARREGADO_TOUR_KEY);

  const routeParams = useLocalSearchParams<{ tab?: string }>();
  const initialTab = ((TABS.find(t => t.key === String(routeParams?.tab || ''))?.key) || 'painel') as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  useEffect(() => {
    const t = String(routeParams?.tab || '');
    if (t && TABS.some(x => x.key === t)) setActiveTab(t as TabKey);
  }, [routeParams?.tab]);

  // Auto-refresh notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof reloadAlertas === 'function') reloadAlertas();
    }, 60000);
    return () => clearInterval(interval);
  }, [reloadAlertas]);

  // Auto-mostrar tour na primeira visita do encarregado
  useEffect(() => {
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  const [trimestreNotas, setTrimestreNotas] = useState<1 | 2 | 3>(1);
  const [diaHorario, setDiaHorario] = useState(0);
  const [faltaFiltroDisc, setFaltaFiltroDisc] = useState<string>('todas');
  const [filtroDiarioDisc, setFiltroDiarioDisc] = useState<string>('todas');
  const [horarios, setHorarios] = useState<any[]>([]);
  const [paymentMonth, setPaymentMonth] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'multicaixa' | 'referencia' | null>(null);
  const [generatingRupe, setGeneratingRupe] = useState(false);
  const [showRecarga, setShowRecarga] = useState(false);
  const [recargaValor, setRecargaValor] = useState('');
  const [recargaRupeRef, setRecargaRupeRef] = useState<string | null>(null);
  const [gerandoRecarga, setGerandoRecarga] = useState(false);
  const [activeRupe, setActiveRupe] = useState<any | null>(null);

  const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();

  const currentUser = users.find(u => u.id === user?.id);
  const alunoId = currentUser?.alunoId;
  const aluno = alunos.find(a => a.id === alunoId)
    ?? alunos.find(a => user?.email && a.emailEncarregado === user.email);
  const turmaAluno = aluno ? turmas.find(t => t.id === aluno.turmaId) : null;

  const notasAluno = aluno ? notas.filter(n => n.alunoId === aluno.id && n.anoLetivo === anoLetivo) : [];
  const presAluno = aluno ? presencas.filter(p => p.alunoId === aluno.id) : [];
  const pagamentosAluno = aluno ? getPagamentosAluno(aluno.id) : [];
  const mesesAtraso = aluno ? getMesesEmAtraso(aluno.id, anoLetivo) : 0;
  const taxaPropina = taxas.find(t => t.tipo === 'propina' && t.ativo);
  const multaEstimada = calcularMulta(taxaPropina?.valor || 0, mesesAtraso);
  const taxasNivel = turmaAluno ? getTaxasByNivel(turmaAluno.nivel, anoLetivo) : [];

  const mensagensAluno = turmaAluno
    ? mensagens.filter(m => m.tipo === 'turma' && m.turmaId === turmaAluno.id)
    : [];

  const notasTrimestre = notasAluno.filter(n => n.trimestre === trimestreNotas);
  const mediaGeral = notasAluno.length > 0
    ? (notasAluno.reduce((s, n) => s + (n.nf || n.mac || 0), 0) / notasAluno.length).toFixed(1)
    : '—';
  const pctPresenca = presAluno.length > 0
    ? Math.round((presAluno.filter(p => p.status === 'P').length / presAluno.length) * 100)
    : 100;
  const aprovadas = notasAluno.filter(n => n.nf >= 10).length;
  const reprovadas = notasAluno.filter(n => n.nf > 0 && n.nf < 10).length;

  const totalPago = pagamentosAluno.reduce((s, p) => s + (p.valor || 0), 0);
  const horariosAluno = turmaAluno ? horarios.filter(h => h.turmaId === turmaAluno.id) : [];
  const horariosHoje = horariosAluno.filter(h => h.dia === diaHorario);

  const eventosAluno = turmaAluno
    ? eventos.filter(e => e.turmasIds.includes(turmaAluno.id) || e.turmasIds.length === 0)
        .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    : [];

  const materiaisAluno = turmaAluno
    ? materiais.filter(m => m.turmaId === turmaAluno.id)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    : [];

  const faltasAluno = presAluno
    .filter(p => p.status === 'F' || p.status === 'J')
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  const disciplinasFaltas = ['todas', ...Array.from(new Set(faltasAluno.map(f => f.disciplina).filter(Boolean)))];

  const faltasFiltradas = faltaFiltroDisc === 'todas'
    ? faltasAluno
    : faltasAluno.filter(f => f.disciplina === faltaFiltroDisc);

  const sumariosTurma = turmaAluno
    ? sumarios
        .filter(s => s.turmaId === turmaAluno.id && s.status === 'aceite')
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    : [];

  const calendarioAluno = turmaAluno
    ? calendarioProvas
        .filter(c => c.publicado && (Array.isArray(c.turmasIds) ? c.turmasIds.includes(turmaAluno.id) || c.turmasIds.length === 0 : true))
        .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    : [];

  if (!aluno) {
    return (
      <View style={styles.screen}>
        <TopBar title="Portal do Encarregado" />
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="account-child" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyStateTitle}>Nenhum educando associado</Text>
          <Text style={styles.emptyStateText}>
            A sua conta ainda não foi vinculada a nenhum aluno. Contacte a secretaria da escola.
          </Text>
        </View>
      </View>
    );
  }

  const calcIdade = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365));

  function renderPainel() {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.alunoHero}>
          <View style={styles.alunoAvatar}>
            <Text style={styles.alunoAvatarText}>{aluno.nome.charAt(0)}{aluno.apelido.charAt(0)}</Text>
          </View>
          <View style={styles.alunoHeroInfo}>
            <Text style={styles.alunoNome}>{aluno.nome} {aluno.apelido}</Text>
            <Text style={styles.alunoMeta}>{aluno.numeroMatricula} · {turmaAluno?.nome || '—'}</Text>
            <View style={[styles.badge, { backgroundColor: aluno.ativo ? `${Colors.success}22` : `${Colors.danger}22` }]}>
              <Text style={[styles.badgeText, { color: aluno.ativo ? Colors.success : Colors.danger }]}>
                {aluno.ativo ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard value={mediaGeral} label="Média Geral" color={Colors.gold} />
          <StatCard value={`${pctPresenca}%`} label="Presenças" color={Colors.success} />
          <StatCard value={aprovadas} label="Aprovadas" color={Colors.info} />
          <StatCard value={reprovadas} label="Reprovadas" color={Colors.danger} />
        </View>

        {mesesAtraso > 0 && (
          <View style={styles.alertBox}>
            <Ionicons name="alert-circle" size={18} color={Colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{mesesAtraso} {mesesAtraso === 1 ? 'mês em atraso' : 'meses em atraso'}</Text>
              <Text style={styles.alertText}>Multa estimada: {formatAOA(multaEstimada)} · Por favor regularize o pagamento.</Text>
            </View>
          </View>
        )}

        <SectionTitle title="Informações do Aluno" icon="person" />
        <View style={styles.infoCard}>
          {[
            { label: 'Turma', value: turmaAluno?.nome || '—' },
            { label: 'Nível', value: turmaAluno?.nivel || '—' },
            { label: 'Turno', value: turmaAluno?.turno || '—' },
            { label: 'Data de Nascimento', value: aluno.dataNascimento },
            { label: 'Idade', value: `${calcIdade(aluno.dataNascimento)} anos` },
            { label: 'Género', value: aluno.genero === 'M' ? 'Masculino' : 'Feminino' },
            { label: 'Província', value: aluno.provincia },
          ].map(r => (
            <View key={r.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{r.label}</Text>
              <Text style={styles.infoValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        {eventosAluno.length > 0 && (
          <>
            <SectionTitle title="Próximos Eventos" icon="calendar" />
            {eventosAluno.slice(0, 3).map(e => (
              <View key={e.id} style={styles.eventoCard}>
                <View style={styles.eventoData}>
                  <Text style={styles.eventoDia}>{new Date(e.data).getDate()}</Text>
                  <Text style={styles.eventoMes}>{new Date(e.data).toLocaleString('pt-PT', { month: 'short' })}</Text>
                </View>
                <View style={styles.eventoInfo}>
                  <Text style={styles.eventoNome}>{e.titulo}</Text>
                  {e.local && <Text style={styles.eventoLocal}>{e.local}</Text>}
                </View>
              </View>
            ))}
          </>
        )}

        {alertas.length > 0 && (
          <>
            <View style={styles.alertasSectionHeader}>
              <SectionTitle title="Alertas Recentes" icon="notifications" />
              {unreadCount > 0 && (
                <TouchableOpacity onPress={() => alertas.filter((a: any) => !a.lida).forEach((a: any) => marcarLida(a.id))}>
                  <Text style={styles.marcarLidasBtn}>Marcar todas como lidas</Text>
                </TouchableOpacity>
              )}
            </View>
            {alertas.slice(0, 5).map((a: any) => {
              const corMap: Record<string, string> = { urgente: Colors.danger, aviso: Colors.warning, sucesso: Colors.success, info: Colors.info };
              const iconMap: Record<string, string> = { urgente: 'alert-circle', aviso: 'warning', sucesso: 'checkmark-circle', info: 'information-circle' };
              const cor = corMap[a.tipo] ?? Colors.info;
              const icon = iconMap[a.tipo] ?? 'notifications';
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.alertaCard, !a.lida && { borderLeftColor: cor, borderLeftWidth: 3 }]}
                  onPress={() => { if (!a.lida) marcarLida(a.id); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.alertaIconBox, { backgroundColor: `${cor}18` }]}>
                    <Ionicons name={icon as any} size={20} color={cor} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.alertaTitulo, !a.lida && { color: Colors.text }]} numberOfLines={1}>{a.titulo}</Text>
                    <Text style={styles.alertaMensagem} numberOfLines={2}>{a.mensagem}</Text>
                    <Text style={styles.alertaTempo}>{timeAgo(a.createdAt)}</Text>
                  </View>
                  {!a.lida && <View style={[styles.alertaDot, { backgroundColor: cor }]} />}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {isSupported && (
          <>
            <SectionTitle title="Notificações Push" icon="notifications" />
            <View style={styles.pushCard}>
              <View style={styles.pushCardRow}>
                <View style={styles.pushIconWrap}>
                  <Ionicons
                    name={pushState === 'granted' ? 'notifications' : 'notifications-off-outline'}
                    size={24}
                    color={pushState === 'granted' ? Colors.success : Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pushTitle}>
                    {pushState === 'granted' ? 'Notificações ativas' : 'Ativar notificações push'}
                  </Text>
                  <Text style={styles.pushSubtitle}>
                    {pushState === 'granted'
                      ? 'Recebes alertas de notas, faltas e propinas diretamente no browser.'
                      : pushState === 'denied'
                      ? 'Notificações bloqueadas. Ativa nas definições do browser.'
                      : 'Recebe alertas de notas, faltas e propinas no teu dispositivo.'}
                  </Text>
                </View>
              </View>
              {pushState !== 'denied' && (
                <TouchableOpacity
                  style={[
                    styles.pushBtn,
                    pushState === 'granted' ? styles.pushBtnOff : styles.pushBtnOn,
                    (pushState === 'loading' || pushLoading) && { opacity: 0.6 },
                  ]}
                  disabled={pushState === 'loading' || pushLoading}
                  onPress={async () => {
                    setPushLoading(true);
                    const result = pushState === 'granted'
                      ? await unsubscribe()
                      : await subscribe();
                    setPushLoading(false);
                    webAlert(
                      result.success ? 'Sucesso' : 'Erro',
                      result.message
                    );
                  }}
                >
                  {(pushState === 'loading' || pushLoading)
                    ? <AppLoader size="small" color="#fff" />
                    : <Text style={styles.pushBtnText}>
                        {pushState === 'granted' ? 'Desativar' : 'Ativar notificações'}
                      </Text>
                  }
                </TouchableOpacity>
              )}
              {pushState === 'denied' && (
                <View style={styles.pushDenied}>
                  <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                  <Text style={styles.pushDeniedText}>
                    Acede às definições do browser e permite notificações para este site.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderNotas() {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.trimestreSelector}>
          {([1, 2, 3] as const).map(t => (
            <TouchableOpacity key={t} style={[styles.trimestreBtn, trimestreNotas === t && styles.trimestreBtnActive]} onPress={() => setTrimestreNotas(t)}>
              <Text style={[styles.trimestreText, trimestreNotas === t && styles.trimestreTextActive]}>{t}º Trimestre</Text>
            </TouchableOpacity>
          ))}
        </View>

        {notasTrimestre.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem notas lançadas neste trimestre</Text>
          </View>
        ) : (
          notasTrimestre.map(n => {
            const ok = n.nf >= 10;
            const border = n.nf === 0 ? Colors.border : ok ? Colors.success : Colors.danger;
            return (
              <View key={n.id} style={[styles.notaCard, { borderLeftColor: border, borderLeftWidth: 3 }]}>
                <View style={styles.notaCardHeader}>
                  <Text style={styles.notaDisciplina}>{n.disciplina}</Text>
                  <NotaCell value={n.nf || 0} />
                </View>
                <View style={styles.notaCardDetails}>
                  <Text style={styles.notaDetail}>T1: {n.aval1 || 0}</Text>
                  <Text style={styles.notaDetail}>T2: {n.aval2 || 0}</Text>
                  <Text style={styles.notaDetail}>T3: {n.aval3 || 0}</Text>
                  {n.mac > 0 && <Text style={styles.notaDetail}>MAC: {n.mac}</Text>}
                </View>
                <View style={[styles.badge, { backgroundColor: n.nf >= 10 ? `${Colors.success}20` : n.nf > 0 ? `${Colors.danger}20` : 'rgba(232,238,246,0.12)', alignSelf: 'flex-start' }]}>
                  <Text style={[styles.badgeText, { color: n.nf >= 10 ? Colors.success : n.nf > 0 ? Colors.danger : Colors.textMuted }]}>
                    {n.nf >= 10 ? 'Aprovado' : n.nf > 0 ? 'Reprovado' : 'Sem nota'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderPresencas() {
    const total = presAluno.length;
    const presentes = presAluno.filter(p => p.status === 'P').length;
    const faltas = presAluno.filter(p => p.status === 'F').length;
    const justificadas = presAluno.filter(p => p.status === 'J').length;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <StatCard value={`${pctPresenca}%`} label="Assiduidade" color={Colors.success} />
          <StatCard value={presentes} label="Presenças" color={Colors.info} />
          <StatCard value={faltas} label="Faltas" color={Colors.danger} />
          <StatCard value={justificadas} label="Justificadas" color={Colors.warning} />
        </View>

        {presAluno.slice(0, 30).map(p => (
          <View key={p.id} style={styles.presencaRow}>
            <View style={[styles.presencaBadge, {
              backgroundColor: p.status === 'P' ? `${Colors.success}20` : p.status === 'J' ? `${Colors.warning}20` : `${Colors.danger}20`,
            }]}>
              <Text style={[styles.presencaStatus, {
                color: p.status === 'P' ? Colors.success : p.status === 'J' ? Colors.warning : Colors.danger,
              }]}>{p.status === 'P' ? 'P' : p.status === 'J' ? 'J' : 'F'}</Text>
            </View>
            <View style={styles.presencaInfo}>
              <Text style={styles.presencaDisciplina}>{p.disciplina}</Text>
              <Text style={styles.presencaData}>{p.data}</Text>
            </View>
            {p.observacao && <Text style={styles.presencaObs}>{p.observacao}</Text>}
          </View>
        ))}
        {presAluno.length === 0 && (
          <View style={styles.emptyTab}>
            <Ionicons name="checkmark-circle-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem registos de presenças</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderFaltas() {
    const totalF = faltasAluno.filter(f => f.status === 'F').length;
    const totalJ = faltasAluno.filter(f => f.status === 'J').length;
    const abaixoLimite = pctPresenca < 75;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Resumo */}
        <View style={styles.statsRow}>
          <StatCard value={`${pctPresenca}%`} label="Assiduidade" color={abaixoLimite ? Colors.danger : Colors.success} />
          <StatCard value={faltasAluno.length} label="Total Faltas" color={Colors.danger} />
          <StatCard value={totalF} label="Injustificadas" color={Colors.danger} />
          <StatCard value={totalJ} label="Justificadas" color={Colors.warning} />
        </View>

        {abaixoLimite && (
          <View style={styles.alertBox}>
            <Ionicons name="alert-circle" size={18} color={Colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Assiduidade abaixo de 75%</Text>
              <Text style={styles.alertText}>
                O seu educando tem {pctPresenca}% de presenças. O mínimo exigido é 75%.{'\n'}
                Contacte a escola para regularizar.
              </Text>
            </View>
          </View>
        )}

        {/* Filtros por disciplina */}
        {disciplinasFaltas.length > 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {disciplinasFaltas.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.filterChip, faltaFiltroDisc === d && styles.filterChipActive]}
                onPress={() => setFaltaFiltroDisc(d)}
              >
                <Text style={[styles.filterChipText, faltaFiltroDisc === d && styles.filterChipTextActive]}>
                  {d === 'todas' ? 'Todas' : d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {faltasFiltradas.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
            <Text style={styles.emptyTabText}>Sem faltas registadas</Text>
          </View>
        ) : (
          faltasFiltradas.map(f => {
            const isJ = f.status === 'J';
            const cor = isJ ? Colors.warning : Colors.danger;
            return (
              <View key={f.id} style={[styles.faltaRow, { borderLeftColor: cor }]}>
                <View style={[styles.faltaIconBox, { backgroundColor: `${cor}18` }]}>
                  <Text style={[styles.faltaLetra, { color: cor }]}>{f.status}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.faltaDisc}>{f.disciplina || '—'}</Text>
                  <Text style={styles.faltaData}>{f.data}</Text>
                </View>
                {f.observacao ? (
                  <Text style={styles.faltaObs} numberOfLines={2}>{f.observacao}</Text>
                ) : null}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderDiario() {
    const disciplinasDiario = Array.from(new Set(sumariosTurma.map(s => s.disciplina)));
    const sumariosFiltrados = filtroDiarioDisc === 'todas'
      ? sumariosTurma
      : sumariosTurma.filter(s => s.disciplina === filtroDiarioDisc);

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Diário de Classe" icon="book" />
        <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 14, lineHeight: 18 }}>
          Registo dos conteúdos leccionados pelo professor em cada aula da turma do seu educando.
        </Text>

        {/* Filtro por disciplina */}
        {disciplinasDiario.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity
              style={[styles.filterChip, filtroDiarioDisc === 'todas' && styles.filterChipActive]}
              onPress={() => setFiltroDiarioDisc('todas')}
            >
              <Text style={[styles.filterChipText, filtroDiarioDisc === 'todas' && styles.filterChipTextActive]}>Todas</Text>
            </TouchableOpacity>
            {disciplinasDiario.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.filterChip, filtroDiarioDisc === d && styles.filterChipActive]}
                onPress={() => setFiltroDiarioDisc(d)}
              >
                <Text style={[styles.filterChipText, filtroDiarioDisc === d && styles.filterChipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {sumariosFiltrados.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="book-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem registos de aulas disponíveis</Text>
          </View>
        ) : (
          sumariosFiltrados.map(s => (
            <View key={s.id} style={styles.diarioCard}>
              <View style={styles.diarioHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.diarioDisc}>{s.disciplina}</Text>
                  <Text style={styles.diarioMeta}>
                    {s.data} · {s.horaInicio}–{s.horaFim} · Aula {s.numeroAula}
                  </Text>
                </View>
                <Text style={styles.diarioProf}>{s.professorNome?.split(' ').slice(0, 2).join(' ')}</Text>
              </View>
              <Text style={styles.diarioConteudo}>{s.conteudo}</Text>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderFinanceiro() {
    const MESES: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
      7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
    };
    const mesesLetivosAll = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const mesAtual = new Date().getMonth() + 1;
    const mesesPassados = mesesLetivosAll.filter(m => m <= mesAtual);
    const mesesPagosSet = new Set(pagamentosAluno.filter(p => p.status === 'pago').map(p => p.mes));
    const mesesPendentesSet = new Set(pagamentosAluno.filter(p => p.status === 'pendente').map(p => p.mes));
    const mesesEmAtraso = mesesPassados.filter(m => !mesesPagosSet.has(m) && !mesesPendentesSet.has(m));
    const rupesAluno = aluno ? getRUPEsAluno(aluno.id) : [];
    const valorPropina = taxaPropina?.valor || 0;
    const temMulticaixa = !!config.telefoneMulticaixaExpress;
    const temReferencia = !!(config.numeroEntidade || config.iban);
    const temPagamentoOnline = temMulticaixa || temReferencia;

    async function handleGerarRUPE(mes: number) {
      if (!aluno || !taxaPropina || generatingRupe) return;
      setGeneratingRupe(true);
      try {
        const rupe = await gerarRUPE(aluno.id, taxaPropina.id, valorPropina);
        await addPagamento({
          alunoId: aluno.id,
          taxaId: taxaPropina.id,
          valor: valorPropina,
          data: new Date().toISOString().slice(0, 10),
          mes,
          ano: anoLetivo,
          status: 'pendente',
          metodoPagamento: 'transferencia',
          referencia: rupe.referencia,
          observacao: `Referência bancária — Propina de ${MESES[mes]}`,
        });
        setActiveRupe(rupe);
        setPaymentMethod('referencia');
        setPaymentMonth(mes);
      } finally {
        setGeneratingRupe(false);
      }
    }

    async function handleSolicitarMulticaixa(mes: number) {
      if (!aluno || !taxaPropina) return;
      await addPagamento({
        alunoId: aluno.id,
        taxaId: taxaPropina.id,
        valor: valorPropina,
        data: new Date().toISOString().slice(0, 10),
        mes,
        ano: anoLetivo,
        status: 'pendente',
        metodoPagamento: 'multicaixa',
        observacao: `Multicaixa Express — Propina de ${MESES[mes]}`,
      });
      setPaymentMethod('multicaixa');
      setPaymentMonth(mes);
    }

    // Estado do mês corrente
    const pagamentoMesAtual = pagamentosAluno.find(p => p.mes === mesAtual && Number(p.ano) === Number(anoLetivo));
    const statusMesAtual: 'pago' | 'pendente' | 'atraso' | 'sem' = pagamentoMesAtual
      ? (pagamentoMesAtual.status === 'pago' ? 'pago' : (mesesEmAtraso.includes(mesAtual) ? 'atraso' : 'pendente'))
      : (mesesEmAtraso.includes(mesAtual) ? 'atraso' : 'sem');
    const badgeStyleMes = {
      pago:     { cor: Colors.success, texto: 'Mês corrente regularizado',   icon: 'checkmark-circle' as const },
      pendente: { cor: Colors.gold,    texto: 'Propina do mês em cobrança',   icon: 'time' as const },
      atraso:   { cor: Colors.danger,  texto: 'Propina do mês em atraso',     icon: 'alert-circle' as const },
      sem:      { cor: Colors.info,    texto: 'Propina do mês ainda não emitida', icon: 'information-circle' as const },
    }[statusMesAtual];

    // Multa hoje vs amanhã
    const multaCfg = (config as any).multaConfig || {};
    const diaInicioMulta = Number(multaCfg.diaInicioMulta || multaCfg.dataLimitePagamento || 10);
    function multaProjeccao(diasExtra: number): number {
      if (!multaCfg.ativo || mesesAtraso === 0) return 0;
      const hoje = new Date();
      if (Number(multaCfg.valorPorDia || 0) > 0) {
        const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicioMulta + diasExtra);
        return Math.round(Number(multaCfg.valorPorDia) * (diasDesdeInicio + mesesAtraso * 30));
      }
      if (Number(multaCfg.percentagemPorDia || 0) > 0) {
        const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicioMulta + diasExtra);
        const totalDias = diasDesdeInicio + mesesAtraso * 30;
        return Math.round((taxaPropina?.valor || 0) * (Number(multaCfg.percentagemPorDia) / 100) * totalDias);
      }
      return Math.round((taxaPropina?.valor || 0) * (Number(multaCfg.percentagem || 0) / 100) * mesesAtraso);
    }
    const multaHoje = multaProjeccao(0);
    const multaAmanha = multaProjeccao(1);
    const acrescimo = Math.max(0, multaAmanha - multaHoje);

    // Saldo do aluno
    const saldoAlunoRow = aluno ? getSaldoAluno(aluno.id) : null;
    const saldoAtual = Number(saldoAlunoRow?.saldo || 0);

    async function handleGerarRecarga() {
      const valor = Number(String(recargaValor).replace(',', '.'));
      if (!aluno || !valor || valor <= 0) {
        webAlert('Valor inválido', 'Indique um valor positivo para carregar.');
        return;
      }
      setGerandoRecarga(true);
      try {
        const r = await api.post<{ rupe: { referencia: string } }>(`/api/saldo-alunos/${aluno.id}/recarga-rupe`, { valor });
        setRecargaRupeRef(r?.rupe?.referencia || null);
        setRecargaValor('');
      } catch (e) {
        webAlert('Erro', (e as Error).message || 'Não foi possível gerar a referência.');
      } finally {
        setGerandoRecarga(false);
      }
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <StatCard value={formatAOA(totalPago)} label="Total Pago" color={Colors.success} />
          <StatCard value={mesesAtraso} label="Meses em Atraso" color={mesesAtraso > 0 ? Colors.danger : Colors.success} />
        </View>

        {/* ── Painel financeiro: estado do mês corrente + multa + saldo ── */}
        <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${badgeStyleMes.cor}20`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={badgeStyleMes.icon} size={20} color={badgeStyleMes.cor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: badgeStyleMes.cor, fontFamily: 'Inter_700Bold' }}>{badgeStyleMes.texto}</Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                {MESES[mesAtual]} {anoLetivo} · Limite de pagamento sem multa: dia {diaInicioMulta}
              </Text>
            </View>
          </View>

          {mesesAtraso > 0 && (multaHoje > 0 || multaAmanha > 0) && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: `${Colors.danger}10`, borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Multa hoje</Text>
                <Text style={{ fontSize: 15, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{formatAOA(multaHoje)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: `${Colors.gold}10`, borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Amanhã</Text>
                <Text style={{ fontSize: 15, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{formatAOA(multaAmanha)}</Text>
                {acrescimo > 0 && (
                  <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>+{formatAOA(acrescimo)}</Text>
                )}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
            <View>
              <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Saldo do educando</Text>
              <Text style={{ fontSize: 18, color: saldoAtual > 0 ? Colors.success : Colors.text, fontFamily: 'Inter_700Bold' }}>{formatAOA(saldoAtual)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setShowRecarga(s => !s); setRecargaRupeRef(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}
            >
              <MaterialCommunityIcons name="wallet-plus-outline" size={16} color="#000" />
              <Text style={{ color: '#000', fontFamily: 'Inter_700Bold', fontSize: 12 }}>{showRecarga ? 'Fechar' : 'Carregar Saldo'}</Text>
            </TouchableOpacity>
          </View>

          {showRecarga && (
            <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 8 }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' }}>
                Indique o valor a carregar. Será gerada uma referência bancária; após o pagamento ser confirmado pela tesouraria, o saldo é creditado automaticamente.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={recargaValor}
                  onChangeText={setRecargaValor}
                  keyboardType="numeric"
                  placeholder="Valor (AOA)"
                  placeholderTextColor={Colors.textMuted}
                  style={{ flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text }}
                />
                <TouchableOpacity
                  onPress={handleGerarRecarga}
                  disabled={gerandoRecarga}
                  style={{ backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, opacity: gerandoRecarga ? 0.6 : 1 }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }}>{gerandoRecarga ? 'A gerar…' : 'Gerar Ref. Bancária'}</Text>
                </TouchableOpacity>
              </View>
              {recargaRupeRef && (
                <View style={{ backgroundColor: `${Colors.success}10`, borderRadius: 10, padding: 10 }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Referência gerada</Text>
                  <Text selectable style={{ fontSize: 16, color: Colors.success, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>{recargaRupeRef}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                    Pague no banco/Multicaixa com esta referência. O saldo é creditado quando o pagamento for confirmado.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {mesesAtraso > 0 && (
          <View style={styles.alertBox}>
            <Ionicons name="alert-circle" size={18} color={Colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{mesesAtraso} {mesesAtraso === 1 ? 'mês em atraso' : 'meses em atraso'}</Text>
              <Text style={styles.alertText}>Multa estimada: {formatAOA(multaEstimada)} · Regularize para evitar penalizações.</Text>
            </View>
          </View>
        )}

        {/* ── PAGAMENTOS ONLINE ── */}
        {temPagamentoOnline && mesesEmAtraso.length > 0 && (
          <>
            <SectionTitle title="Pagar Online" icon="card" />
            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginBottom: 12, lineHeight: 18 }}>
              Pague as propinas em atraso sem sair de casa. Escolha um mês e o método de pagamento.
            </Text>

            {mesesEmAtraso.map(mes => {
              const isSelected = paymentMonth === mes;
              return (
                <View key={mes} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: isSelected ? Colors.gold : Colors.border, marginBottom: 10, overflow: 'hidden' }}>
                  {/* Cabeçalho do mês */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${Colors.danger}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="calendar" size={20} color={Colors.danger} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{MESES[mes]}</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{formatAOA(valorPropina)} · Propina</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        if (isSelected) { setPaymentMonth(null); setPaymentMethod(null); setActiveRupe(null); }
                        else { setPaymentMonth(mes); setPaymentMethod(null); setActiveRupe(null); }
                      }}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: isSelected ? `${Colors.gold}20` : `${Colors.danger}15`, borderWidth: 1, borderColor: isSelected ? Colors.gold : `${Colors.danger}40` }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: isSelected ? Colors.gold : Colors.danger }}>
                        {isSelected ? 'Fechar' : 'Pagar'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Seleção de método */}
                  {isSelected && paymentMethod === null && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginBottom: 4 }}>Escolha o método de pagamento:</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {temMulticaixa && (
                          <TouchableOpacity
                            onPress={() => handleSolicitarMulticaixa(mes)}
                            style={{ flex: 1, backgroundColor: `${Colors.success}12`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.success}40`, padding: 14, alignItems: 'center', gap: 8 }}
                          >
                            <MaterialCommunityIcons name="cellphone" size={28} color={Colors.success} />
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, textAlign: 'center' }}>Multicaixa{'\n'}Express</Text>
                          </TouchableOpacity>
                        )}
                        {temReferencia && (
                          <TouchableOpacity
                            onPress={() => handleGerarRUPE(mes)}
                            disabled={generatingRupe}
                            style={{ flex: 1, backgroundColor: `${Colors.info}12`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.info}40`, padding: 14, alignItems: 'center', gap: 8, opacity: generatingRupe ? 0.6 : 1 }}
                          >
                            <Ionicons name="document-text" size={28} color={Colors.info} />
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.info, textAlign: 'center' }}>Referência{'\n'}Bancária</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Instruções Multicaixa Express */}
                  {isSelected && paymentMethod === 'multicaixa' && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                      <View style={{ backgroundColor: `${Colors.success}10`, borderRadius: 14, borderWidth: 1, borderColor: `${Colors.success}30`, padding: 14, gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MaterialCommunityIcons name="cellphone" size={20} color={Colors.success} />
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.success }}>Multicaixa Express</Text>
                        </View>

                        <View style={{ backgroundColor: Colors.background, borderRadius: 12, padding: 14, gap: 8 }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Número do Beneficiário</Text>
                          <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.success, letterSpacing: 3 }}>{config.telefoneMulticaixaExpress}</Text>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>{config.nomeBeneficiario || config.nomeEscola}</Text>
                          <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Valor a pagar</Text>
                            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{formatAOA(valorPropina)}</Text>
                          </View>
                        </View>

                        <View style={{ backgroundColor: Colors.background, borderRadius: 12, padding: 12, gap: 5 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 }}>Como pagar (passo a passo):</Text>
                          {[
                            '1. Abra a app Multicaixa Express ou marque *840#',
                            '2. Seleccione "Pagamento" → "Pagamento de Serviços"',
                            `3. Introduza o número: ${config.telefoneMulticaixaExpress}`,
                            `4. Introduza o valor: ${formatAOA(valorPropina)}`,
                            `5. Descrição: Propina ${MESES[mes]} — ${aluno.nome} ${aluno.apelido}`,
                            '6. Confirme com o seu PIN Multicaixa',
                            '7. Guarde o comprovativo e envie à secretaria',
                          ].map((step, i) => (
                            <Text key={i} style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 }}>{step}</Text>
                          ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: `${Colors.warning}15`, borderRadius: 10, padding: 10, alignItems: 'flex-start' }}>
                          <Ionicons name="information-circle" size={16} color={Colors.warning} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 16 }}>
                            Após o pagamento, a secretaria irá confirmar e actualizar o seu estado em até 1 dia útil.
                          </Text>
                        </View>

                        <TouchableOpacity onPress={() => { setPaymentMethod(null); setPaymentMonth(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                          <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Voltar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Referência Bancária gerada */}
                  {isSelected && paymentMethod === 'referencia' && activeRupe && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                      <View style={{ backgroundColor: `${Colors.info}10`, borderRadius: 14, borderWidth: 1, borderColor: `${Colors.info}30`, padding: 14, gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="document-text" size={20} color={Colors.info} />
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.info }}>Referência Bancária Gerada</Text>
                        </View>

                        <View style={{ backgroundColor: Colors.background, borderRadius: 12, padding: 14, gap: 10 }}>
                          {config.numeroEntidade && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Entidade</Text>
                              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: 1 }}>{config.numeroEntidade}</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Referência</Text>
                            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.info, letterSpacing: 1 }}>{activeRupe.referencia}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Valor</Text>
                            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success }}>{formatAOA(activeRupe.valor)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Válida até</Text>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{new Date(activeRupe.dataValidade).toLocaleDateString('pt-PT')}</Text>
                          </View>
                          {config.iban && (
                            <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 3 }}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>IBAN / NIB</Text>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text, letterSpacing: 0.5 }}>{config.iban}</Text>
                            </View>
                          )}
                          {config.bancoTransferencia && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Banco</Text>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{config.bancoTransferencia}</Text>
                            </View>
                          )}
                          {config.nomeBeneficiario && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Beneficiário</Text>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{config.nomeBeneficiario}</Text>
                            </View>
                          )}
                        </View>

                        <View style={{ backgroundColor: Colors.background, borderRadius: 12, padding: 12, gap: 5 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 }}>Como pagar (passo a passo):</Text>
                          {[
                            '1. Dirija-se a qualquer caixa Multicaixa (ATM) ou balcão bancário',
                            '2. Seleccione "Pagamento de Serviços" ou "Referências"',
                            `3. Entidade: ${config.numeroEntidade || '(ver acima)'}`,
                            '4. Introduza a Referência acima exactamente como indicado',
                            `5. Confirme o valor: ${formatAOA(activeRupe.valor)}`,
                            '6. Guarde o talão/comprovativo do pagamento',
                            '7. Envie foto do comprovativo à secretaria',
                          ].map((step, i) => (
                            <Text key={i} style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 }}>{step}</Text>
                          ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: `${Colors.warning}15`, borderRadius: 10, padding: 10, alignItems: 'flex-start' }}>
                          <Ionicons name="time" size={16} color={Colors.warning} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 16 }}>
                            Esta referência é válida por 15 dias. Após o prazo, será necessário gerar uma nova referência.
                          </Text>
                        </View>

                        <TouchableOpacity onPress={() => { setPaymentMethod(null); setActiveRupe(null); setPaymentMonth(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                          <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Voltar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Pagamentos em processamento */}
        {mesesPendentesSet.size > 0 && (
          <>
            <SectionTitle title="Em Processamento" icon="hourglass" />
            {Array.from(mesesPendentesSet).map(mes => (
              <View key={mes} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.warning}40`, padding: 12, marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="hourglass-outline" size={18} color={Colors.warning} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{MESES[mes] || `Mês ${mes}`}</Text>
                </View>
                <View style={{ backgroundColor: `${Colors.warning}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.warning }}>A aguardar confirmação</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Referências Geradas */}
        {rupesAluno.length > 0 && (
          <>
            <SectionTitle title="Referências Bancárias Multicaixa" icon="receipt" />

            {/* Instruções de pagamento ATM */}
            <View style={{ backgroundColor: `${Colors.info}0F`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.info}30`, padding: 12, marginBottom: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.info} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.info }}>Como pagar</Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16 }}>
                1. Vá a qualquer caixa <Text style={{ fontFamily: 'Inter_600SemiBold' }}>ATM Multicaixa</Text> ou abra a app <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Multicaixa Express</Text>.{'\n'}
                2. Escolha <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Pagamentos &gt; Por Referência</Text>.{'\n'}
                3. Introduza a <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Entidade</Text> e a <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Referência</Text> indicadas abaixo.
              </Text>
            </View>

            {rupesAluno.slice(0, 5).map(r => {
              const isAtivo = r.status === 'ativo';
              const isPago = r.status === 'pago';
              const borderColor = isPago ? Colors.success : isAtivo ? Colors.info : Colors.danger;
              const bgColor = isPago ? `${Colors.success}08` : isAtivo ? `${Colors.info}08` : `${Colors.danger}08`;
              return (
                <View key={r.id} style={{ backgroundColor: bgColor, borderRadius: 12, borderWidth: 1.5, borderColor, padding: 14, marginBottom: 8, gap: 8 }}>
                  {/* Status badge */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {r.categoria === 'deposito_saldo' ? 'Recarga de Saldo' : 'Propina Escolar'}
                    </Text>
                    <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${borderColor}20` }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: borderColor }}>
                        {isPago ? '✓ Pago' : isAtivo ? '● Activo' : '✕ Expirado'}
                      </Text>
                    </View>
                  </View>

                  {/* Referência */}
                  {isAtivo && (
                    <View style={{ backgroundColor: `${Colors.info}15`, borderRadius: 8, padding: 10, gap: 4 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Referência Bancária</Text>
                      <Text selectable style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.info, letterSpacing: 2 }}>{r.referencia}</Text>
                    </View>
                  )}
                  {!isAtivo && (
                    <Text selectable style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1 }}>{r.referencia}</Text>
                  )}

                  {/* Valor + validade */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{formatAOA(r.valor)}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: isAtivo ? Colors.warning : Colors.textMuted }}>
                      {isAtivo ? `Válido até ${new Date(r.dataValidade).toLocaleDateString('pt-PT')}` :
                       isPago ? `Pago em ${new Date(r.dataValidade).toLocaleDateString('pt-PT')}` : 'Referência expirada'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {!temPagamentoOnline && mesesEmAtraso.length > 0 && (
          <View style={{ backgroundColor: `${Colors.info}10`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.info}30`, padding: 14, marginBottom: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Ionicons name="information-circle" size={16} color={Colors.info} />
              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>Pagamento Presencial</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 }}>
              Dirija-se ao balcão financeiro da escola para regularizar as propinas em atraso. Traga o cartão do aluno e o comprovativo do último pagamento.
            </Text>
          </View>
        )}

        <SectionTitle title="Taxas Aplicáveis" icon="pricetag" />
        {taxasNivel.length === 0 ? (
          <View style={[styles.emptyTab, { paddingTop: 20 }]}>
            <Text style={styles.emptyTabText}>Sem taxas configuradas para este nível</Text>
          </View>
        ) : (
          taxasNivel.map(t => (
            <View key={t.id} style={styles.taxaCard}>
              <View style={styles.taxaInfo}>
                <Text style={styles.taxaNome}>{t.descricao || t.tipo}</Text>
                <Text style={styles.taxaTipo}>{t.tipo} · {t.frequencia}</Text>
              </View>
              <Text style={styles.taxaValor}>{formatAOA(t.valor)}</Text>
            </View>
          ))
        )}

        <SectionTitle title="Histórico de Pagamentos" icon="receipt" />
        {pagamentosAluno.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="receipt-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem pagamentos registados</Text>
          </View>
        ) : (
          pagamentosAluno.slice(0, 20).map(p => (
            <View key={p.id} style={styles.pagCard}>
              <View style={styles.pagInfo}>
                <Text style={styles.pagDesc}>{p.observacao || (p.mes ? `Propina de ${MESES[p.mes]}` : 'Pagamento')}</Text>
                <Text style={styles.pagData}>{p.data || (p as any).createdAt?.slice(0, 10)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.pagValor}>{formatAOA(p.valor)}</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: p.status === 'pago' ? Colors.success : p.status === 'pendente' ? Colors.warning : Colors.textMuted }}>
                  {p.status === 'pago' ? 'Pago' : p.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                </Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderMensagens() {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {mensagensAluno.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem mensagens da escola</Text>
          </View>
        ) : (
          mensagensAluno.slice(0, 20).map(m => (
            <View key={m.id} style={styles.msgCard}>
              <View style={styles.msgHeader}>
                <Text style={styles.msgTitle}>{m.titulo || m.assunto || 'Mensagem'}</Text>
                <Text style={styles.msgData}>{m.data || m.createdAt?.slice(0, 10)}</Text>
              </View>
              <Text style={styles.msgBody}>{m.corpo || m.mensagem || ''}</Text>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderHorario() {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.diaSelector}>
          {DIAS.map((d, i) => (
            <TouchableOpacity key={d} style={[styles.diaBtn, diaHorario === i && styles.diaBtnActive]} onPress={() => setDiaHorario(i)}>
              <Text style={[styles.diaText, diaHorario === i && styles.diaTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {horariosHoje.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="time-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem aulas neste dia</Text>
          </View>
        ) : (
          horariosHoje.map((h: any) => (
            <View key={h.id} style={styles.horarioCard}>
              <View style={styles.horarioTime}>
                <Text style={styles.horarioHora}>{h.horaInicio}</Text>
                <Text style={styles.horarioFim}>{h.horaFim}</Text>
              </View>
              <View style={styles.horarioInfo}>
                <Text style={styles.horarioDisc}>{h.disciplina}</Text>
                {h.sala && <Text style={styles.horarioSala}>{h.sala}</Text>}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderMateriais() {
    const TIPO_ICON: Record<string, string> = {
      texto: 'document-text', link: 'link', resumo: 'book',
      pdf: 'document', docx: 'document', ppt: 'easel',
    };
    const TIPO_COLOR: Record<string, string> = {
      texto: Colors.info, link: Colors.success, resumo: Colors.gold,
      pdf: Colors.danger, docx: Colors.info, ppt: Colors.warning,
    };
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {materiaisAluno.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="library-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem materiais didácticos disponíveis</Text>
          </View>
        ) : (
          materiaisAluno.map(m => (
            <View key={m.id} style={styles.materialCard}>
              <View style={[styles.materialIconBox, { backgroundColor: `${TIPO_COLOR[m.tipo] || Colors.info}15` }]}>
                <Ionicons name={(TIPO_ICON[m.tipo] || 'document') as any} size={22} color={TIPO_COLOR[m.tipo] || Colors.info} />
              </View>
              <View style={styles.materialInfo}>
                <Text style={styles.materialTitulo}>{m.titulo}</Text>
                <Text style={styles.materialDisc}>{m.disciplina} · {m.turmaNome}</Text>
                {m.descricao ? <Text style={styles.materialDesc} numberOfLines={2}>{m.descricao}</Text> : null}
              </View>
              {m.tipo === 'link' && m.conteudo ? (
                <TouchableOpacity onPress={() => Linking.openURL(m.conteudo).catch(() => {})}>
                  <Ionicons name="open-outline" size={20} color={Colors.info} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderCalendario() {
    const TIPO_BADGE: Record<string, { label: string; color: string }> = {
      teste: { label: 'Teste', color: Colors.warning },
      exame: { label: 'Exame', color: Colors.danger },
      trabalho: { label: 'Trabalho', color: Colors.info },
      prova_oral: { label: 'Prova Oral', color: Colors.accent },
    };
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {calendarioAluno.length === 0 ? (
          <View style={styles.emptyTab}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTabText}>Sem provas agendadas</Text>
          </View>
        ) : (
          calendarioAluno.map(c => {
            const badge = TIPO_BADGE[c.tipo] || { label: c.tipo, color: Colors.gold };
            const dataProva = new Date(c.data);
            const passado = dataProva < new Date();
            return (
              <View key={c.id} style={[styles.provaCard, passado && { opacity: 0.55 }]}>
                <View style={styles.provaData}>
                  <Text style={styles.provaDia}>{dataProva.getDate()}</Text>
                  <Text style={styles.provaMes}>{dataProva.toLocaleString('pt-PT', { month: 'short' })}</Text>
                </View>
                <View style={styles.provaInfo}>
                  <Text style={styles.provaTitulo}>{c.titulo}</Text>
                  <Text style={styles.provaDisc}>{c.disciplina} · {c.hora}</Text>
                  <View style={[styles.badge, { backgroundColor: `${badge.color}20`, marginTop: 4 }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>
                {passado && <Ionicons name="checkmark-circle" size={18} color={Colors.textMuted} />}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  const tabContent = {
    painel: renderPainel(),
    notas: renderNotas(),
    presencas: renderPresencas(),
    faltas: renderFaltas(),
    diario: renderDiario(),
    financeiro: renderFinanceiro(),
    mensagens: renderMensagens(),
    horario: renderHorario(),
    materiais: renderMateriais(),
    calendario: renderCalendario(),
  };

  return (
    <View style={styles.screen}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={ENCARREGADO_TOUR_STEPS} storageKey={ENCARREGADO_TOUR_KEY} />
      <TopBar title="Portal do Encarregado" subtitle={`${aluno.nome} ${aluno.apelido}`} rightAction={{ icon: 'compass-outline', onPress: openTour }} />

      <HScrollTabBar style={[styles.tabScrollWrap, styles.tabBar]} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]} onPress={() => setActiveTab(tab.key)}>
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {tabContent[activeTab]}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyStateTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  emptyStateText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  tabScrollWrap: { position: 'relative', overflow: 'hidden' },
  tabScrollFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, pointerEvents: 'none' } as any,
  tabBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: 12, gap: 4, alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.gold },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabLabelActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  tabContent: { flex: 1, padding: 16 },

  alunoHero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
  alunoAvatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: `${Colors.gold}25`, alignItems: 'center', justifyContent: 'center' },
  alunoAvatarText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold },
  alunoHeroInfo: { flex: 1, gap: 4 },
  alunoNome: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  alertBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${Colors.danger}12`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.danger}30`, padding: 14, marginBottom: 16 },
  alertTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger, marginBottom: 2 },
  alertText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 },
  sectionTitleText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },

  infoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  infoValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  eventoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  eventoData: { width: 44, alignItems: 'center', backgroundColor: `${Colors.gold}15`, borderRadius: 10, paddingVertical: 6 },
  eventoDia: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold },
  eventoMes: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  eventoInfo: { flex: 1, gap: 2 },
  eventoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  eventoLocal: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  trimestreSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  trimestreBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  trimestreBtnActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  trimestreText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  trimestreTextActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },

  notaCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8, gap: 8 },
  notaCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notaDisciplina: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  notaCell: { borderWidth: 1.5, borderRadius: 10, width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  notaValue: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  notaCardDetails: { flexDirection: 'row', gap: 12 },
  notaDetail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  presencaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 6 },
  presencaBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  presencaStatus: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  presencaInfo: { flex: 1 },
  presencaDisciplina: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  presencaData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  presencaObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, maxWidth: 120 },

  taxaCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 6 },
  taxaInfo: { flex: 1, gap: 2 },
  taxaNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  taxaTipo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  taxaValor: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.gold },

  pagCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 6 },
  pagInfo: { flex: 1, gap: 2 },
  pagDesc: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  pagData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  pagValor: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.success },

  msgCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8, gap: 8 },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  msgTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  msgData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  msgBody: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },

  diaSelector: { maxHeight: 48, marginBottom: 12 },
  diaBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  diaBtnActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  diaText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  diaTextActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },

  horarioCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 },
  horarioTime: { alignItems: 'center', minWidth: 50 },
  horarioHora: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.gold },
  horarioFim: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  horarioInfo: { flex: 1, gap: 2 },
  horarioDisc: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  horarioSala: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  emptyTab: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTabText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  filterChipText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  faltaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border },
  faltaIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  faltaLetra: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  faltaDisc: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  faltaData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  faltaObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, maxWidth: 120 },

  diarioCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  diarioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  diarioDisc: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  diarioMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  diarioProf: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.gold },
  diarioConteudo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },

  materialCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 },
  materialIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  materialInfo: { flex: 1, gap: 3 },
  materialTitulo: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  materialDisc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  materialDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },

  provaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  provaData: { width: 48, alignItems: 'center', backgroundColor: `${Colors.accent}15`, borderRadius: 10, paddingVertical: 8 },
  provaDia: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.accent },
  provaMes: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textTransform: 'uppercase' },
  provaInfo: { flex: 1, gap: 2 },
  provaTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  provaDisc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  pushCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 8, gap: 14 },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pushIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  pushTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  pushSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  pushBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  pushBtnOn: { backgroundColor: Colors.success },
  pushBtnOff: { backgroundColor: `${Colors.danger}22`, borderWidth: 1, borderColor: Colors.danger },
  pushBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  pushDenied: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${Colors.warning}15`, borderRadius: 8, padding: 10 },
  pushDeniedText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 15 },

  alertasSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -4 },
  marcarLidasBtn: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.gold, paddingRight: 2 },
  alertaCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  alertaIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertaTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  alertaMensagem: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  alertaTempo: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  alertaDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
});
