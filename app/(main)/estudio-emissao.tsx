import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { getPdfUrl } from '@/utils/pdfAuth';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Types ─────────────────────────────────────────────────────────────────

type Scope = 'aluno' | 'turma' | 'escola';
type ParamKey = 'trimestre' | 'finalidade' | 'tipo_declaracao';

interface DocDef {
  id: string;
  label: string;
  desc: string;
  icon: string;
  color: string;
  scope: Scope;
  params: ParamKey[];
  buildUrl: (ids: UrlIds, params: ParamValues) => string;
  categoria: string;
}

interface UrlIds {
  alunoId?: string;
  turmaId?: string;
}

interface ParamValues {
  trimestre: string;
  finalidade: string;
  tipoDeclaracao: string;
}

interface EmissaoLog {
  id: string;
  docLabel: string;
  aluno?: string;
  turma?: string;
  hora: string;
}

interface DocTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  classeAlvo?: string;
  bloqueado?: boolean;
  insigniaBase64?: string;
  marcaAguaBase64?: string;
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ─── Passos da Barra de Progresso ──────────────────────────────────────────

const PROGRESS_STEPS = [
  { label: 'A preparar dados…',    icon: 'server-outline' as const,        pct: 28 },
  { label: 'A construir o PDF…',   icon: 'document-text-outline' as const, pct: 68 },
  { label: 'A finalizar…',         icon: 'checkmark-done-outline' as const, pct: 96 },
  { label: 'Documento pronto!',    icon: 'print-outline' as const,          pct: 100 },
];

const STEP_DURATIONS = [700, 1100, 800, 400]; // ms per step

// ─── Sub-Component: PDF Progress Overlay ───────────────────────────────────

interface PdfProgressProps {
  visible: boolean;
  step: number;
  color: string;
  label: string;
  onComplete: () => void;
}

function PdfProgressOverlay({ visible, step, color, label, onComplete }: PdfProgressProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const prevStep = useRef(-1);
  // Keep a stable ref to onComplete so the animation callback never captures a stale closure
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    if (visible && prevStep.current === -1) {
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: nd }).start();
    }
    if (!visible) {
      Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: nd }).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || step < 0 || step >= PROGRESS_STEPS.length) return;
    if (step === prevStep.current) return;
    prevStep.current = step;

    const target = PROGRESS_STEPS[step].pct;
    const duration = STEP_DURATIONS[step];

    Animated.timing(progressAnim, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start(() => {
      if (step === PROGRESS_STEPS.length - 1) {
        // Use ref to always call the latest onComplete, avoiding stale closure
        setTimeout(() => onCompleteRef.current(), 350);
      }
    });
  }, [step, visible]);

  if (!visible) return null;

  const currentInfo = PROGRESS_STEPS[Math.max(0, Math.min(step, PROGRESS_STEPS.length - 1))];
  const isDone = step >= PROGRESS_STEPS.length - 1;

  return (
    <Animated.View style={[s.progressOverlay, { opacity: opacityAnim }]}>
      <View style={s.progressCard}>
        {/* Icon animado */}
        <View style={[s.progressIconCircle, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Ionicons name={currentInfo.icon} size={32} color={color} />
        </View>

        <Text style={s.progressDocLabel} numberOfLines={1}>{label}</Text>
        <Text style={[s.progressStepLabel, isDone && { color: Colors.success }]}>
          {currentInfo.label}
        </Text>

        {/* Barra principal */}
        <View style={s.progressTrack}>
          <Animated.View
            style={[
              s.progressFill,
              {
                backgroundColor: isDone ? Colors.success : color,
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Percentagem */}
        <Animated.Text style={s.progressPct}>
          {progressAnim.interpolate({
            inputRange: PROGRESS_STEPS.map(p => p.pct),
            outputRange: PROGRESS_STEPS.map(p => `${p.pct}%`),
            extrapolate: 'clamp',
          }) as any}
        </Animated.Text>

        {/* Passos indicadores */}
        <View style={s.stepsRow}>
          {PROGRESS_STEPS.map((ps, i) => {
            const done = step > i || (step === i && isDone);
            const active = step === i;
            return (
              <View key={i} style={s.stepItem}>
                <View style={[
                  s.stepDot,
                  done && { backgroundColor: Colors.success, borderColor: Colors.success },
                  active && !done && { borderColor: color, backgroundColor: color + '22' },
                ]}>
                  {done
                    ? <Ionicons name="checkmark" size={10} color="#fff" />
                    : active
                    ? <AppLoader size="small" color={color} style={{ transform: [{ scale: 0.5 }] }} />
                    : null
                  }
                </View>
                <Text style={[
                  s.stepLabel,
                  done && { color: Colors.success },
                  active && { color: color },
                ]} numberOfLines={1}>
                  {ps.label.replace('…', '').replace('!', '')}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Catálogo de Documentos ─────────────────────────────────────────────────

const DOCS: DocDef[] = [
  // ── Reconfirmação de Matrícula
  {
    id: 'ficha-reconfirmacao',
    label: 'Ficha de Reconfirmação de Matrícula',
    desc: 'Boletim oficial com notas, assiduidade, situação financeira e decisão APROVADO/REPROVADO para o próximo ano lectivo.',
    icon: 'refresh-circle',
    color: '#0369a1',
    scope: 'aluno',
    params: [],
    categoria: 'Matrículas & Reconfirmação',
    buildUrl: ({ alunoId }) =>
      `/api/alunos/${alunoId}/ficha-reconfirmacao?autoprint=false`,
  },
  // ── Declarações
  {
    id: 'decl-matricula',
    label: 'Declaração de Matrícula',
    desc: 'Comprova matrícula activa do aluno no ano lectivo em curso.',
    icon: 'document-text',
    color: Colors.info,
    scope: 'aluno',
    params: ['finalidade'],
    categoria: 'Declarações',
    buildUrl: ({ alunoId }, { finalidade }) =>
      `/api/pdf/declaracao/${alunoId}?tipo=matricula&finalidade=${encodeURIComponent(finalidade)}&autoprint=false`,
  },
  {
    id: 'decl-frequencia',
    label: 'Declaração de Frequência',
    desc: 'Atesta que o aluno frequenta regularmente as aulas.',
    icon: 'clipboard',
    color: '#7c3aed',
    scope: 'aluno',
    params: ['finalidade'],
    categoria: 'Declarações',
    buildUrl: ({ alunoId }, { finalidade }) =>
      `/api/pdf/declaracao/${alunoId}?tipo=frequencia&finalidade=${encodeURIComponent(finalidade)}&autoprint=false`,
  },
  {
    id: 'decl-conclusao',
    label: 'Declaração de Conclusão',
    desc: 'Declara que o aluno concluiu o ano/ciclo com aproveitamento.',
    icon: 'school',
    color: '#14b8a6',
    scope: 'aluno',
    params: ['finalidade'],
    categoria: 'Declarações',
    buildUrl: ({ alunoId }, { finalidade }) =>
      `/api/pdf/declaracao/${alunoId}?tipo=conclusao&finalidade=${encodeURIComponent(finalidade)}&autoprint=false`,
  },
  // ── Académicos
  {
    id: 'boletim',
    label: 'Boletim de Notas',
    desc: 'Notas por trimestre com médias e situação académica do aluno.',
    icon: 'bar-chart',
    color: '#8b5cf6',
    scope: 'aluno',
    params: ['trimestre'],
    categoria: 'Documentos Académicos',
    buildUrl: ({ alunoId }, { trimestre }) =>
      `/api/pdf/boletim/${alunoId}?trimestre=${trimestre}&autoprint=false`,
  },
  {
    id: 'historico',
    label: 'Histórico Académico',
    desc: 'Registo completo de todos os anos lectivos do aluno.',
    icon: 'time',
    color: Colors.warning,
    scope: 'aluno',
    params: [],
    categoria: 'Documentos Académicos',
    buildUrl: ({ alunoId }) =>
      `/api/pdf/historico-academico/${alunoId}?autoprint=false`,
  },
  {
    id: 'certificado',
    label: 'Certificado de Habilitações',
    desc: 'Certificado formal das habilitações académicas obtidas.',
    icon: 'ribbon',
    color: Colors.gold,
    scope: 'aluno',
    params: ['finalidade'],
    categoria: 'Documentos Académicos',
    buildUrl: ({ alunoId }, { finalidade }) =>
      `/api/pdf/declaracao/${alunoId}?tipo=certificado&finalidade=${encodeURIComponent(finalidade)}&autoprint=false`,
  },
  {
    id: 'decl-habilitacoes',
    label: 'Declaração de Habilitações (Ensino Primário)',
    desc: 'Declara habilitações do aluno com a lista completa de disciplinas e notas finais.',
    icon: 'school',
    color: '#0ea5e9',
    scope: 'aluno',
    params: [],
    categoria: 'Documentos Académicos',
    buildUrl: ({ alunoId }) =>
      `/api/pdf/declaracao/${alunoId}?tipo=habilitacoes&autoprint=false`,
  },
  // ── Financeiros
  {
    id: 'recibos-aluno',
    label: 'Recibos do Aluno',
    desc: 'Todos os recibos de pagamento registados para o aluno.',
    icon: 'receipt',
    color: Colors.success,
    scope: 'aluno',
    params: [],
    categoria: 'Financeiros',
    buildUrl: ({ alunoId }) =>
      `/api/pdf/recibos-aluno/${alunoId}?autoprint=false`,
  },
  {
    id: 'extrato',
    label: 'Extrato de Propinas',
    desc: 'Extracto detalhado do histórico de pagamentos de propinas.',
    icon: 'wallet',
    color: '#0ea5e9',
    scope: 'aluno',
    params: [],
    categoria: 'Financeiros',
    buildUrl: ({ alunoId }) =>
      `/api/pdf/extrato-propinas/${alunoId}?autoprint=false`,
  },
  // ── Turma / Escola
  {
    id: 'relatorio-turma',
    label: 'Relatório de Turma',
    desc: 'Aproveitamento geral da turma com taxa de aprovação por trimestre.',
    icon: 'analytics',
    color: '#f59e0b',
    scope: 'turma',
    params: ['trimestre'],
    categoria: 'Turma & Escola',
    buildUrl: ({ turmaId }, { trimestre }) =>
      `/api/pdf/relatorio-turma/${turmaId}?trimestre=${trimestre}&autoprint=false`,
  },
  {
    id: 'recibos-turma',
    label: 'Recibos por Turma',
    desc: 'Todos os recibos emitidos para os alunos de uma turma.',
    icon: 'albums',
    color: '#06b6d4',
    scope: 'turma',
    params: [],
    categoria: 'Turma & Escola',
    buildUrl: ({ turmaId }) =>
      `/api/pdf/recibos-turma/${turmaId}?autoprint=false`,
  },
];

const CATEGORIAS = [...new Set(DOCS.map(d => d.categoria))];

// Mapeamento: tipo de solicitação → id do documento no estúdio
const TIPO_TO_ESTUDIO_DOC: Record<string, string> = {
  'Declaração de Matrícula':          'decl-matricula',
  'Certificado de Notas':             'boletim',
  'Certificado de Frequência':        'decl-frequencia',
  'Declaração de Conclusão de Curso': 'decl-conclusao',
  'Histórico Escolar':                'historico',
  'Diploma':                          'decl-habilitacoes',
  'Outros':                           'decl-matricula',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function horaActual(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EstudioEmissao() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { alunos, turmas } = useData();
  const { config } = useConfig();

  // ── URL params para emissão indirecta (via pedido de aluno) ──────────────
  const params = useLocalSearchParams<{
    alunoId?: string;
    docId?: string;
    customDocNome?: string;
    finalidade?: string;
    solicitacaoId?: string;
  }>();

  const [selectedDoc, setSelectedDoc] = useState<DocDef | null>(null);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [selectedAlunoId, setSelectedAlunoId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [trimestre, setTrimestre] = useState('3');
  const [finalidade, setFinalidade] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [emitting, setEmitting] = useState(false);
  const [log, setLog] = useState<EmissaoLog[]>([]);
  const [viewLog, setViewLog] = useState(false);
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<string>>(new Set([...CATEGORIAS, '__custom__']));
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [customTemplates, setCustomTemplates] = useState<DocTemplate[]>([]);
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<DocTemplate | null>(null);
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null);
  const [solicitacaoMarcada, setSolicitacaoMarcada] = useState(false);

  // ── Estado modal de tarefas pendentes ────────────────────────────────────
  const [pendingTasksModal, setPendingTasksModal] = useState(false);
  const [pendingSols, setPendingSols] = useState<any[]>([]);
  const reminderTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const aluno = useMemo(() => alunos.find(a => a.id === selectedAlunoId), [alunos, selectedAlunoId]);
  const turma = useMemo(() => turmas.find(t => t.id === selectedTurmaId), [turmas, selectedTurmaId]);

  // Track which alunoId was already auto-filled to avoid re-running when alunos array reference refreshes
  const autoFilledAlunoIdRef = useRef<string | null>(null);

  // ── Auto-preenchimento via parâmetros de URL (emissão indirecta) ─────────
  useEffect(() => {
    if (!alunos.length) return;

    const { alunoId, docId, finalidade: fin, solicitacaoId: solId } = params;

    if (solId) setSolicitacaoId(solId);

    if (alunoId) {
      // Guard: don't re-fill when alunos array refreshes (DataContext polling)
      if (autoFilledAlunoIdRef.current !== alunoId) {
        const alunoObj = alunos.find(a => a.id === alunoId);
        if (alunoObj) {
          autoFilledAlunoIdRef.current = alunoId;
          setSelectedAlunoId(alunoId);
          setAlunoSearch(`${alunoObj.nome} ${alunoObj.apelido}`);
        }
      }
    }

    if (docId) {
      const doc = DOCS.find(d => d.id === docId);
      if (doc) {
        setSelectedDoc(doc);
        setSelectedCustomTemplate(null);
      }
    }

    if (fin) {
      setFinalidade(decodeURIComponent(fin));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunos]);

  // ── Auto-selecionar template personalizado (customDocNome) ────────────────
  useEffect(() => {
    if (!params.customDocNome || !customTemplates.length) return;
    const nome = decodeURIComponent(params.customDocNome);
    const tmpl = customTemplates.find(t => t.nome === nome);
    if (tmpl) {
      setSelectedCustomTemplate(tmpl);
      setSelectedDoc(null);
    }
  }, [customTemplates, params.customDocNome]);

  // ── Carregar e monitorar solicitações pendentes ───────────────────────────
  useEffect(() => {
    async function fetchPendentes() {
      try {
        const res = await fetch('/api/solicitacoes-documentos', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const pend = data.filter((s: any) => s.status === 'pendente' || s.status === 'em_processamento');
            setPendingSols(pend);
            if (pend.length > 0 && !params.alunoId) setPendingTasksModal(true);
          }
        }
      } catch {}
    }

    fetchPendentes();

    reminderTimer.current = setInterval(() => {
      fetch('/api/solicitacoes-documentos', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          const pend = Array.isArray(data)
            ? data.filter((s: any) => s.status === 'pendente' || s.status === 'em_processamento')
            : [];
          setPendingSols(pend);
          if (pend.length > 0) setPendingTasksModal(true);
        })
        .catch(() => {});
    }, 5 * 60 * 1000); // cada 5 minutos

    return () => { if (reminderTimer.current) clearInterval(reminderTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEmitirDoPedido(sol: any) {
    setPendingTasksModal(false);
    const docId = TIPO_TO_ESTUDIO_DOC[sol.tipo];
    // Aluno
    const alunoObj = alunos.find((a: any) => a.id === sol.alunoId);
    if (alunoObj) {
      setSelectedAlunoId(sol.alunoId);
      setAlunoSearch(`${alunoObj.nome} ${alunoObj.apelido}`);
    }
    // Documento oficial
    if (docId) {
      const doc = DOCS.find(d => d.id === docId);
      if (doc) { setSelectedDoc(doc); setSelectedCustomTemplate(null); }
    } else if (customTemplates.length > 0) {
      // Modelo personalizado
      const tmpl = customTemplates.find(t => t.nome === sol.tipo);
      if (tmpl) { setSelectedCustomTemplate(tmpl); setSelectedDoc(null); }
    }
    setFinalidade(sol.motivo || '');
    setSolicitacaoId(sol.id);
    setSolicitacaoMarcada(false);
  }

  const alunosFiltrados = useMemo(() => {
    const q = alunoSearch.toLowerCase();
    if (!q) return [];
    return alunos
      .filter(a => a.ativo && (`${a.nome} ${a.apelido}`.toLowerCase().includes(q) || (a.numeroMatricula || '').toLowerCase().includes(q)))
      .slice(0, 20);
  }, [alunos, alunoSearch]);

  const canEmit = useMemo(() => {
    if (selectedCustomTemplate) return !!selectedAlunoId;
    if (!selectedDoc) return false;
    if (selectedDoc.scope === 'aluno' && !selectedAlunoId) return false;
    if (selectedDoc.scope === 'turma' && !selectedTurmaId) return false;
    return true;
  }, [selectedDoc, selectedCustomTemplate, selectedAlunoId, selectedTurmaId]);

  const clearStepTimers = useCallback(() => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
  }, []);

  const startProgress = useCallback((url: string) => {
    clearStepTimers();
    setProgressStep(0);
    setProgressVisible(true);
    setPendingUrl(url);

    let elapsed = STEP_DURATIONS[0];
    for (let i = 1; i < PROGRESS_STEPS.length - 1; i++) {
      const idx = i;
      const t = setTimeout(() => setProgressStep(idx), elapsed);
      stepTimers.current.push(t);
      elapsed += STEP_DURATIONS[idx];
    }
  }, [clearStepTimers]);

  const handleProgressComplete = useCallback(() => {
    setProgressStep(PROGRESS_STEPS.length - 1);
    const t = setTimeout(() => {
      setProgressVisible(false);
      setEmitting(false);
      if (pendingUrl) {
        setPreviewUrl(pendingUrl);
        setPendingUrl(null);
      }
      clearStepTimers();

      // Marcar solicitação como concluída (emissão indirecta)
      if (solicitacaoId && !solicitacaoMarcada) {
        setSolicitacaoMarcada(true);
        fetch(`/api/solicitacoes-documentos/${solicitacaoId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluido', resposta: 'Documento emitido via Estúdio de Emissão.' }),
        }).catch(() => {});
      }
    }, 600);
    stepTimers.current.push(t);
  }, [pendingUrl, clearStepTimers, solicitacaoId, solicitacaoMarcada]);

  const buildCustomHtml = useCallback((template: DocTemplate, alunoObj: typeof aluno, turmaObj: typeof turma): string => {
    const now = new Date();
    const varMap: Record<string, string> = {
      '{{NOME_COMPLETO}}': alunoObj ? `${alunoObj.nome} ${alunoObj.apelido}` : '',
      '{{NOME}}': alunoObj?.nome || '',
      '{{APELIDO}}': alunoObj?.apelido || '',
      '{{NUMERO_MATRICULA}}': alunoObj?.numeroMatricula || '',
      '{{NOME_ENCARREGADO}}': alunoObj?.nomeEncarregado || '',
      '{{TELEFONE_ENCARREGADO}}': (alunoObj as any)?.telefoneEncarregado || '',
      '{{TURMA}}': turmaObj?.nome || '',
      '{{CLASSE}}': turmaObj?.classe || '',
      '{{ANO_LECTIVO}}': turmaObj?.anoLetivo || String(now.getFullYear()),
      '{{TURNO}}': turmaObj?.turno || '',
      '{{NIVEL}}': turmaObj?.nivel || '',
      '{{PROVINCIA}}': alunoObj?.provincia || '',
      '{{MUNICIPIO}}': alunoObj?.municipio || '',
      '{{NOME_ESCOLA}}': config.nomeEscola || '',
      '{{NOME_DIRECTOR}}': (config as any).directorGeral || '____________________________',
      '{{DATA_ACTUAL}}': now.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
      '{{MES_ACTUAL}}': MESES[now.getMonth()],
      '{{ANO_ACTUAL}}': String(now.getFullYear()),
      '{{DATA_NASCIMENTO}}': alunoObj?.dataNascimento
        ? new Date(alunoObj.dataNascimento).toLocaleDateString('pt-PT') : '',
    };
    let html = template.conteudo;
    Object.entries(varMap).forEach(([k, v]) => { html = html.split(k).join(v); });
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: 'Times New Roman', Times, serif; font-size: 14px; color: #111; padding: 32px; line-height: 1.8; }
  @media print { body { padding: 16px; } }
</style>
</head><body>${html}</body></html>`;
  }, [aluno, turma, config]);

  const emitirDocumento = useCallback(() => {
    if (emitting) return;

    // ── Custom template (from Editor de Documentos) ──────────────────────
    if (selectedCustomTemplate) {
      if (!selectedAlunoId) return;
      setEmitting(true);
      setPreviewUrl(null);
      const alunoObj = alunos.find(a => a.id === selectedAlunoId);
      const turmaObj = turmas.find(t => t.id === alunoObj?.turmaId);
      const html = buildCustomHtml(selectedCustomTemplate, alunoObj, turmaObj);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      startProgress(url);
      setLog(prev => [{
        id: Date.now().toString(),
        docLabel: selectedCustomTemplate.nome,
        aluno: alunoObj ? `${alunoObj.nome} ${alunoObj.apelido}` : undefined,
        hora: horaActual(),
      }, ...prev]);
      return;
    }

    // ── Official document ────────────────────────────────────────────────
    if (!selectedDoc || !canEmit) return;
    setEmitting(true);
    setPreviewUrl(null);

    const rawUrl = selectedDoc.buildUrl(
      { alunoId: selectedAlunoId, turmaId: selectedTurmaId },
      { trimestre, finalidade, tipoDeclaracao: '' },
    );

    getPdfUrl(rawUrl).then(url => {
      if (Platform.OS === 'web') {
        startProgress(url);
      } else {
        import('expo-linking').then(({ default: Linking }) => Linking.openURL(url));
        setEmitting(false);
      }
    });

    setLog(prev => [{
      id: Date.now().toString(),
      docLabel: selectedDoc.label,
      aluno: aluno ? `${aluno.nome} ${aluno.apelido}` : undefined,
      turma: turma?.nome,
      hora: horaActual(),
    }, ...prev]);
  }, [selectedDoc, selectedCustomTemplate, canEmit, emitting, selectedAlunoId, selectedTurmaId, trimestre, finalidade, aluno, turma, alunos, turmas, startProgress, buildCustomHtml]);

  useEffect(() => () => clearStepTimers(), [clearStepTimers]);

  const loadCustomTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/doc-templates?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) {
        setCustomTemplates([]);
        return;
      }
      const data = await res.json();
      setCustomTemplates(Array.isArray(data) ? data.filter(t => t.bloqueado !== true) : []);
    } catch {
      setCustomTemplates([]);
    }
  }, []);

  useEffect(() => {
    loadCustomTemplates();
  }, [loadCustomTemplates]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onVisible = () => { if (document.visibilityState === 'visible') loadCustomTemplates(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadCustomTemplates]);

  useFocusEffect(
    useCallback(() => {
      loadCustomTemplates();
    }, [loadCustomTemplates])
  );

  const isDesktop = Platform.OS === 'web';

  // ── Passo actual do wizard ────────────────────────────────────────────────
  const wizardStep = useMemo(() => {
    if (!selectedDoc && !selectedCustomTemplate) return 0;
    const needsAluno = selectedDoc ? selectedDoc.scope === 'aluno' : true;
    const needsTurma = selectedDoc ? selectedDoc.scope === 'turma' : false;
    if (needsAluno && !selectedAlunoId) return 1;
    if (needsTurma && !selectedTurmaId) return 1;
    return 2;
  }, [selectedDoc, selectedCustomTemplate, selectedAlunoId, selectedTurmaId]);

  // ── Cor do avatar por inicial do nome ────────────────────────────────────
  const AVATAR_COLORS = ['#1E6FD9','#7C3AED','#0F9D58','#D62828','#D4920E','#0891B2','#14B8A6'];
  function avatarColor(nome: string): string {
    const idx = (nome.charCodeAt(0) || 0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
  }
  function avatarInitials(nome: string, apelido: string): string {
    return `${(nome[0] || '').toUpperCase()}${(apelido[0] || '').toUpperCase()}`;
  }

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={s.headerIcon}>
          <MaterialCommunityIcons name="printer-check" size={22} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Emitir Documento</Text>
          <Text style={s.headerSub}>Modelos oficiais protegidos · geração automática</Text>
        </View>
        <TouchableOpacity style={s.logBtn} onPress={() => setViewLog(true)}>
          <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
          {log.length > 0 && (
            <View style={s.logBadge}>
              <Text style={s.logBadgeText}>{log.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Wizard de Passos ──────────────────────────────────────────────── */}
      <View style={s.wizardBar}>
        {[
          { icon: 'document-text-outline', label: 'Documento' },
          { icon: 'person-outline', label: 'Aluno / Turma' },
          { icon: 'print-outline', label: 'Imprimir' },
        ].map((step, i) => {
          const done = wizardStep > i;
          const active = wizardStep === i;
          return (
            <React.Fragment key={i}>
              <View style={s.wizardStep}>
                <View style={[
                  s.wizardDot,
                  done && s.wizardDotDone,
                  active && s.wizardDotActive,
                ]}>
                  {done
                    ? <Ionicons name="checkmark" size={13} color="#fff" />
                    : <Ionicons name={step.icon as any} size={13} color={active ? '#fff' : Colors.textMuted} />
                  }
                </View>
                <Text style={[s.wizardLabel, done && s.wizardLabelDone, active && s.wizardLabelActive]}>
                  {step.label}
                </Text>
              </View>
              {i < 2 && (
                <View style={[s.wizardConnector, wizardStep > i && s.wizardConnectorDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <View style={[s.body, isDesktop && s.bodyDesktop]}>

        {/* ── Left Panel ─────────────────────────────────────────────────── */}
        <View style={[s.leftPanel, isDesktop && s.leftPanelDesktop]}>
          <ScrollView
            contentContainerStyle={s.leftScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Banner de Emissão Indirecta (via pedido do aluno) */}
            {solicitacaoId && (
              <View style={s.indirectBanner}>
                <View style={s.indirectBannerIcon}>
                  <Ionicons name="git-pull-request" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.indirectBannerTitle}>Emissão por Pedido</Text>
                  <Text style={s.indirectBannerSub}>
                    {solicitacaoMarcada
                      ? '✓ Pedido marcado como concluído automaticamente.'
                      : 'Aluno e documento pré-seleccionados. Verifique e clique em Emitir.'}
                  </Text>
                </View>
                {solicitacaoMarcada && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                )}
              </View>
            )}

            {/* ── Passo 0: Tipo de Documento ─────────────────────────────── */}
            <View style={s.stepSection}>
              <View style={s.stepSectionHeader}>
                <View style={[s.stepNumBadge, (selectedDoc || selectedCustomTemplate) && s.stepNumBadgeDone]}>
                  {(selectedDoc || selectedCustomTemplate)
                    ? <Ionicons name="checkmark" size={11} color="#fff" />
                    : <Text style={s.stepNumText}>1</Text>
                  }
                </View>
                <Text style={s.stepSectionTitle}>Tipo de Documento</Text>
                {(selectedDoc || selectedCustomTemplate) && (
                  <TouchableOpacity onPress={() => { setSelectedDoc(null); setSelectedCustomTemplate(null); setPreviewUrl(null); }}>
                    <Text style={s.stepChangeLink}>alterar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Se já escolheu um documento, mostra só o seleccionado */}
              {(selectedDoc || selectedCustomTemplate) ? (
                <View style={[s.docSelectedCard, { borderLeftColor: selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary) }]}>
                  <View style={[s.docSelectedIcon, { backgroundColor: (selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary)) + '22' }]}>
                    <Ionicons
                      name={(selectedCustomTemplate ? 'color-wand' : selectedDoc?.icon ?? 'document') as any}
                      size={20}
                      color={selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.docSelectedLabel} numberOfLines={1}>
                      {selectedCustomTemplate?.nome ?? selectedDoc?.label}
                    </Text>
                    <Text style={s.docSelectedDesc} numberOfLines={1}>
                      {selectedCustomTemplate
                        ? `Modelo personalizado · ${selectedCustomTemplate.classeAlvo || 'Todas as classes'}`
                        : selectedDoc?.categoria}
                    </Text>
                  </View>
                  <View style={[s.docSelectedCheck, { backgroundColor: (selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary)) + '20' }]}>
                    <Ionicons name="checkmark-circle" size={18} color={selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary)} />
                  </View>
                </View>
              ) : (
                <>
                  {/* Modelos do Editor */}
                  {customTemplates.length > 0 && (
                    <View style={s.catBlock}>
                      <TouchableOpacity
                        style={s.catHeader}
                        onPress={() => setCategoriasAbertas(prev => {
                          const next = new Set(prev);
                          next.has('__custom__') ? next.delete('__custom__') : next.add('__custom__');
                          return next;
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={s.catDot} />
                          <Text style={s.catLabel}>Modelos do Editor</Text>
                          <View style={s.customBadge}>
                            <Text style={s.customBadgeText}>{customTemplates.length}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={categoriasAbertas.has('__custom__') ? 'chevron-up' : 'chevron-down'}
                          size={15} color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      {categoriasAbertas.has('__custom__') && customTemplates.map(tpl => (
                        <TouchableOpacity
                          key={tpl.id}
                          style={s.docItem}
                          onPress={() => { setSelectedCustomTemplate(tpl); setSelectedDoc(null); setPreviewUrl(null); }}
                          activeOpacity={0.7}
                        >
                          <View style={[s.docItemAccent, { backgroundColor: Colors.warning }]} />
                          <View style={[s.docIconWrap, { backgroundColor: Colors.warning + '20' }]}>
                            <Ionicons name="document-text" size={17} color={Colors.warning} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.docItemLabel} numberOfLines={1}>{tpl.nome}</Text>
                            <Text style={s.docItemDesc} numberOfLines={1}>
                              {tpl.classeAlvo || 'Todas as classes'}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Catálogo de documentos por categoria */}
                  {CATEGORIAS.map(cat => (
                    <View key={cat} style={s.catBlock}>
                      <TouchableOpacity
                        style={s.catHeader}
                        onPress={() => setCategoriasAbertas(prev => {
                          const next = new Set(prev);
                          next.has(cat) ? next.delete(cat) : next.add(cat);
                          return next;
                        })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[s.catDot, { backgroundColor: DOCS.find(d => d.categoria === cat)?.color ?? Colors.primary }]} />
                          <Text style={s.catLabel}>{cat}</Text>
                          <Text style={s.catCount}>{DOCS.filter(d => d.categoria === cat).length}</Text>
                        </View>
                        <Ionicons
                          name={categoriasAbertas.has(cat) ? 'chevron-up' : 'chevron-down'}
                          size={15} color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                      {categoriasAbertas.has(cat) && DOCS.filter(d => d.categoria === cat).map(doc => (
                        <TouchableOpacity
                          key={doc.id}
                          style={s.docItem}
                          onPress={() => { setSelectedDoc(doc); setSelectedCustomTemplate(null); setPreviewUrl(null); }}
                          activeOpacity={0.7}
                        >
                          <View style={[s.docItemAccent, { backgroundColor: doc.color }]} />
                          <View style={[s.docIconWrap, { backgroundColor: doc.color + '20' }]}>
                            <Ionicons name={doc.icon as any} size={17} color={doc.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.docItemLabel}>{doc.label}</Text>
                            <Text style={s.docItemDesc} numberOfLines={1}>{doc.desc}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* ── Passo 1: Aluno / Turma ─────────────────────────────────── */}
            {(selectedDoc || selectedCustomTemplate) && (
              <View style={s.stepSection}>
                <View style={s.stepSectionHeader}>
                  <View style={[s.stepNumBadge, canEmit && s.stepNumBadgeDone]}>
                    {canEmit
                      ? <Ionicons name="checkmark" size={11} color="#fff" />
                      : <Text style={s.stepNumText}>2</Text>
                    }
                  </View>
                  <Text style={s.stepSectionTitle}>
                    {selectedDoc?.scope === 'turma' ? 'Seleccionar Turma' : 'Seleccionar Aluno'}
                  </Text>
                </View>

                {/* Scope: Aluno */}
                {(selectedDoc?.scope === 'aluno' || selectedCustomTemplate) && (
                  <View style={s.fieldGroup}>
                    <View style={s.searchRow}>
                      <Ionicons name="search-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                      <StableSearchInput
                        value={alunoSearch}
                        onChangeText={v => { setAlunoSearch(v); if (selectedAlunoId) { setSelectedAlunoId(''); } }}
                        inputStyle={s.searchInput}
                        placeholder="Nome ou número de matrícula…"
                        iconColor="transparent"
                      />
                      {selectedAlunoId && (
                        <TouchableOpacity onPress={() => { setSelectedAlunoId(''); setAlunoSearch(''); }}>
                          <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Dropdown de resultados */}
                    {alunoSearch.length > 0 && !selectedAlunoId && (
                      <View style={s.dropdown}>
                        {alunosFiltrados.length === 0 ? (
                          <View style={s.emptyDropRow}>
                            <Ionicons name="person-outline" size={20} color={Colors.textMuted} />
                            <Text style={s.emptyDropText}>Nenhum aluno encontrado</Text>
                          </View>
                        ) : alunosFiltrados.map(a => {
                          const turmaA = turmas.find(t => t.id === (a as any).turmaId);
                          const initials = avatarInitials(a.nome, a.apelido);
                          const color = avatarColor(a.nome);
                          return (
                            <TouchableOpacity
                              key={a.id}
                              style={s.dropItem}
                              onPress={() => { setSelectedAlunoId(a.id); setAlunoSearch(`${a.nome} ${a.apelido}`); }}
                            >
                              <View style={[s.dropAvatar, { backgroundColor: color }]}>
                                <Text style={s.dropAvatarText}>{initials}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={s.dropName}>{a.nome} {a.apelido}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <Text style={s.dropMeta}>{a.numeroMatricula}</Text>
                                  {turmaA && (
                                    <>
                                      <View style={s.dropMetaDot} />
                                      <Text style={s.dropMeta}>{turmaA.nome}</Text>
                                      {turmaA.classe && (
                                        <>
                                          <View style={s.dropMetaDot} />
                                          <Text style={s.dropMeta}>{turmaA.classe}ª Cl.</Text>
                                        </>
                                      )}
                                    </>
                                  )}
                                </View>
                              </View>
                              <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {/* Aluno seleccionado — card detalhado */}
                    {aluno && (() => {
                      const turmaA = turmas.find(t => t.id === (aluno as any).turmaId);
                      const color = avatarColor(aluno.nome);
                      const initials = avatarInitials(aluno.nome, aluno.apelido);
                      return (
                        <View style={s.selectedAlunoCard}>
                          <View style={[s.selectedAlunoAvatar, { backgroundColor: color }]}>
                            <Text style={s.selectedAlunoAvatarText}>{initials}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.selectedAlunoName}>{aluno.nome} {aluno.apelido}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              <View style={s.alunoChip}>
                                <Ionicons name="card-outline" size={10} color={Colors.textSecondary} />
                                <Text style={s.alunoChipText}>{aluno.numeroMatricula}</Text>
                              </View>
                              {turmaA && (
                                <View style={[s.alunoChip, { backgroundColor: Colors.primary + '30' }]}>
                                  <Ionicons name="people-outline" size={10} color={Colors.accent} />
                                  <Text style={[s.alunoChipText, { color: Colors.accent }]}>{turmaA.nome}</Text>
                                </View>
                              )}
                              {turmaA?.classe && (
                                <View style={[s.alunoChip, { backgroundColor: Colors.gold + '20' }]}>
                                  <Ionicons name="school-outline" size={10} color={Colors.gold} />
                                  <Text style={[s.alunoChipText, { color: Colors.gold }]}>{turmaA.classe}ª Classe</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <TouchableOpacity style={s.selectedAlunoChangeBtn} onPress={() => { setSelectedAlunoId(''); setAlunoSearch(''); }}>
                            <Ionicons name="close" size={14} color={Colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                  </View>
                )}

                {/* Scope: Turma */}
                {selectedDoc?.scope === 'turma' && (
                  <View style={s.fieldGroup}>
                    {turmas.filter(t => t.ativo).map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[s.turmaRow, selectedTurmaId === t.id && s.turmaRowActive]}
                        onPress={() => setSelectedTurmaId(t.id)}
                      >
                        <View style={[s.turmaRadio, selectedTurmaId === t.id && s.turmaRadioActive]}>
                          {selectedTurmaId === t.id && <View style={s.turmaRadioDot} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.turmaRowLabel, selectedTurmaId === t.id && { color: Colors.gold }]}>
                            {t.nome}
                          </Text>
                          {t.classe ? (
                            <Text style={s.turmaRowSub}>{t.classe}ª Classe{t.turno ? ` · ${t.turno}` : ''}</Text>
                          ) : null}
                        </View>
                        {selectedTurmaId === t.id && (
                          <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Param: Trimestre */}
                {selectedDoc?.params.includes('trimestre') && (
                  <View style={[s.fieldGroup, { marginTop: 10 }]}>
                    <Text style={s.fieldLabel}>Trimestre</Text>
                    <View style={s.triRow}>
                      {['1', '2', '3'].map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[s.triBtn, trimestre === t && s.triBtnActive]}
                          onPress={() => setTrimestre(t)}
                        >
                          <Ionicons name={trimestre === t ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={trimestre === t ? Colors.primary : Colors.textMuted} />
                          <Text style={[s.triBtnText, trimestre === t && s.triBtnTextActive]}>{t}º Trim.</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Param: Finalidade */}
                {selectedDoc?.params.includes('finalidade') && (
                  <View style={[s.fieldGroup, { marginTop: 10 }]}>
                    <Text style={s.fieldLabel}>Finalidade / Destinatário</Text>
                    <TextInput
                      style={s.textarea}
                      value={finalidade}
                      onChangeText={setFinalidade}
                      placeholder="Ex: apresentação em entidade bancária, renovação de BI…"
                      placeholderTextColor={Colors.textSecondary}
                      multiline
                    />
                  </View>
                )}

                {/* Banner modelo personalizado */}
                {selectedCustomTemplate && (
                  <View style={[s.customTemplateBanner, { marginTop: 10 }]}>
                    <Ionicons name="color-wand" size={13} color={Colors.warning} />
                    <Text style={s.customTemplateBannerText}>
                      Modelo do Editor · variáveis substituídas automaticamente
                    </Text>
                  </View>
                )}
              </View>
            )}

          </ScrollView>

          {/* ── Botão Emitir — Fixo no fundo do painel ─────────────────── */}
          <View style={s.emitFooter}>
            {(selectedDoc || selectedCustomTemplate) ? (
              <TouchableOpacity
                style={[
                  s.emitBtn,
                  { backgroundColor: canEmit ? (selectedCustomTemplate ? Colors.warning : (selectedDoc?.color ?? Colors.primary)) : BORDER_COLOR },
                  (!canEmit || emitting) && s.emitBtnDisabled,
                ]}
                onPress={emitirDocumento}
                disabled={!canEmit || emitting}
              >
                {emitting ? (
                  <AppLoader color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="print" size={20} color={canEmit ? '#fff' : Colors.textMuted} />
                    <Text style={[s.emitBtnText, !canEmit && { color: Colors.textMuted }]}>
                      {canEmit ? 'Gerar & Pré-visualizar' : (
                        selectedDoc?.scope === 'turma' ? 'Seleccione uma turma' : 'Seleccione um aluno'
                      )}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={s.emitBtnPlaceholder}>
                <Ionicons name="document-outline" size={17} color={Colors.textMuted} />
                <Text style={s.emitBtnPlaceholderText}>Escolha um documento para continuar</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Right Panel (Preview) ──────────────────────────────────────── */}
        {isDesktop && (
          <View style={s.rightPanel}>

            {/* Progress Overlay — shown during generation */}
            <PdfProgressOverlay
              visible={progressVisible}
              step={progressStep}
              color={selectedDoc?.color ?? Colors.primary}
              label={selectedDoc?.label ?? ''}
              onComplete={handleProgressComplete}
            />

            {previewUrl && !progressVisible ? (
              <>
                <View style={s.previewBar}>
                  <View style={s.previewBarLeft}>
                    <Ionicons name="document" size={15} color={Colors.gold} />
                    <Text style={s.previewBarTitle}>{selectedDoc?.label}</Text>
                    {aluno && <Text style={s.previewBarMeta}>· {aluno.nome} {aluno.apelido}</Text>}
                    {turma && <Text style={s.previewBarMeta}>· {turma.nome}</Text>}
                  </View>
                  <TouchableOpacity
                    style={s.printBtn}
                    onPress={() => {
                      const iframe = document.getElementById('estudio-iframe') as HTMLIFrameElement | null;
                      iframe?.contentWindow?.print();
                    }}
                  >
                    <Ionicons name="print-outline" size={15} color="#fff" />
                    <Text style={s.printBtnText}>Imprimir / PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.closePreviewBtn} onPress={() => setPreviewUrl(null)}>
                    <Ionicons name="close" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <iframe
                  id="estudio-iframe"
                  src={previewUrl}
                  style={{ flex: 1, border: 'none', width: '100%', background: '#f3f4f6' } as any}
                  title="Pré-visualização do Documento"
                />
              </>
            ) : !progressVisible ? (
              <View style={s.previewEmpty}>
                <MaterialCommunityIcons name="printer-eye" size={64} color={Colors.textMuted} />
                <Text style={s.previewEmptyTitle}>Pré-visualização do Documento</Text>
                <Text style={s.previewEmptySub}>
                  {selectedDoc
                    ? canEmit
                      ? 'Clique em "Pré-visualizar & Imprimir" para gerar o documento.'
                      : `Seleccione ${selectedDoc.scope === 'aluno' ? 'um aluno' : 'uma turma'} para continuar.`
                    : 'Seleccione um tipo de documento no painel esquerdo.'}
                </Text>
                <View style={s.previewLockRow}>
                  <Ionicons name="shield-checkmark" size={14} color={Colors.success} />
                  <Text style={s.previewLockText}>Templates protegidos — não editáveis nesta área</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* ── Emission Log Modal ─────────────────────────────────────────────── */}
      {/* On desktop: absolute overlay inside root for precise sizing */}
      {isDesktop && viewLog && (
        <Pressable style={s.overlayBackdrop} onPress={() => setViewLog(false)}>
          <Pressable style={s.overlayCard} onPress={e => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={s.modalTitleIcon}>
                  <Ionicons name="time" size={16} color={Colors.gold} />
                </View>
                <Text style={s.modalTitle}>Histórico de Emissão</Text>
                {log.length > 0 && (
                  <View style={s.modalCountBadge}>
                    <Text style={s.modalCountText}>{log.length}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setViewLog(false)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalScroll} showsVerticalScrollIndicator={false}>
              {log.length === 0 ? (
                <View style={s.emptyLog}>
                  <View style={s.emptyLogIcon}>
                    <Ionicons name="document-outline" size={32} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyLogTitle}>Sem emissões nesta sessão</Text>
                  <Text style={s.emptyLogText}>Os documentos emitidos aparecerão aqui.</Text>
                </View>
              ) : log.map(entry => (
                <View key={entry.id} style={s.logEntry}>
                  <View style={s.logEntryIcon}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.logDocLabel}>{entry.docLabel}</Text>
                    {entry.aluno && (
                      <View style={s.logMetaRow}>
                        <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.logMeta}>{entry.aluno}</Text>
                      </View>
                    )}
                    {entry.turma && (
                      <View style={s.logMetaRow}>
                        <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.logMeta}>{entry.turma}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.logHoraWrap}>
                    <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                    <Text style={s.logHora}>{entry.hora}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
      {/* On mobile: use Modal */}
      <Modal visible={!isDesktop && viewLog} transparent animationType="slide" onRequestClose={() => setViewLog(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setViewLog(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
            style={s.modalCard}
          >
            <View style={s.modalHeader}>
              <View style={s.modalTitleRow}>
                <View style={s.modalTitleIcon}>
                  <Ionicons name="time" size={16} color={Colors.gold} />
                </View>
                <Text style={s.modalTitle}>Histórico de Emissão</Text>
                {log.length > 0 && (
                  <View style={s.modalCountBadge}>
                    <Text style={s.modalCountText}>{log.length}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setViewLog(false)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalScroll} showsVerticalScrollIndicator={false}>
              {log.length === 0 ? (
                <View style={s.emptyLog}>
                  <View style={s.emptyLogIcon}>
                    <Ionicons name="document-outline" size={32} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyLogTitle}>Sem emissões nesta sessão</Text>
                  <Text style={s.emptyLogText}>Os documentos emitidos aparecerão aqui.</Text>
                </View>
              ) : log.map(entry => (
                <View key={entry.id} style={s.logEntry}>
                  <View style={s.logEntryIcon}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.logDocLabel}>{entry.docLabel}</Text>
                    {entry.aluno && (
                      <View style={s.logMetaRow}>
                        <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.logMeta}>{entry.aluno}</Text>
                      </View>
                    )}
                    {entry.turma && (
                      <View style={s.logMetaRow}>
                        <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
                        <Text style={s.logMeta}>{entry.turma}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.logHoraWrap}>
                    <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                    <Text style={s.logHora}>{entry.hora}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal de Tarefas Pendentes ─────────────────────────────────── */}
      <Modal visible={pendingTasksModal} transparent animationType="fade" onRequestClose={() => setPendingTasksModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.pendingOverlay}>
          <View style={s.pendingCard}>
            {/* Header */}
            <View style={s.pendingCardHeader}>
              <View style={s.pendingCardIconWrap}>
                <MaterialCommunityIcons name="bell-ring" size={22} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pendingCardTitle}>Solicitações Pendentes</Text>
                <Text style={s.pendingCardSub}>
                  {pendingSols.length} pedido{pendingSols.length !== 1 ? 's' : ''} aguarda{pendingSols.length === 1 ? '' : 'm'} emissão
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPendingTasksModal(false)} style={s.pendingCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={s.pendingDivider} />

            {/* List */}
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {pendingSols.map((sol, idx) => {
                const alunoObj = alunos.find((a: any) => a.id === sol.alunoId);
                const nomeAluno = alunoObj ? `${alunoObj.nome} ${alunoObj.apelido}` : sol.alunoId || '—';
                const statusColor = sol.status === 'pendente' ? Colors.warning : Colors.primary;
                const statusLabel = sol.status === 'pendente' ? 'Pendente' : 'Em processamento';
                return (
                  <View key={sol.id} style={s.pendingSolRow}>
                    <View style={s.pendingSolNum}>
                      <Text style={s.pendingSolNumText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={s.pendingSolTipo} numberOfLines={1}>{sol.tipo}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="person-outline" size={11} color={Colors.textSecondary} />
                        <Text style={s.pendingSolAluno} numberOfLines={1}>{nomeAluno}</Text>
                      </View>
                      {sol.motivo ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="chatbubble-outline" size={11} color={Colors.textMuted} />
                          <Text style={s.pendingSolMotivo} numberOfLines={1}>{sol.motivo}</Text>
                        </View>
                      ) : null}
                      <View style={[s.pendingSolStatusBadge, { backgroundColor: statusColor + '20' }]}>
                        <View style={[s.pendingSolStatusDot, { backgroundColor: statusColor }]} />
                        <Text style={[s.pendingSolStatusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={s.pendingEmitBtn}
                      onPress={() => handleEmitirDoPedido(sol)}
                    >
                      <MaterialCommunityIcons name="printer-check" size={14} color="#fff" />
                      <Text style={s.pendingEmitBtnText}>Emitir</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            {/* Footer */}
            <View style={s.pendingDivider} />
            <View style={s.pendingFooter}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                <Text style={s.pendingFooterText}>Este alerta repete a cada 5 minutos enquanto houver pedidos pendentes.</Text>
              </View>
              <TouchableOpacity onPress={() => setPendingTasksModal(false)} style={s.pendingDismissBtn}>
                <Text style={s.pendingDismissBtnText}>Fechar por agora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const BG = Colors.background ?? '#0D1F35';
const CARD = Colors.backgroundCard ?? '#122540';
const CARD_ELEVATED = Colors.backgroundElevated ?? '#1A334F';
const BORDER = Colors.border ?? '#FFFFFF14';
const BORDER_COLOR = '#FFFFFF14';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  backBtn: { padding: 6 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '35',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  logBtn: { padding: 8, position: 'relative' },
  logBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  logBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Wizard bar
  wizardBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  wizardStep: { alignItems: 'center', gap: 4 },
  wizardDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CARD_ELEVATED, borderWidth: 1.5, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  wizardDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  wizardDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  wizardLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  wizardLabelActive: { color: Colors.text, fontWeight: '700' },
  wizardLabelDone: { color: Colors.success },
  wizardConnector: {
    flex: 1, height: 2, backgroundColor: BORDER, marginHorizontal: 6, marginBottom: 14,
    borderRadius: 1,
  },
  wizardConnectorDone: { backgroundColor: Colors.success },

  // Body
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },

  // Left Panel
  leftPanel: { flex: 1, backgroundColor: BG, flexDirection: 'column' },
  leftPanelDesktop: { width: 400, flex: 0, borderRightWidth: 1, borderRightColor: BORDER },
  leftScroll: { padding: 14, gap: 12, paddingBottom: 8 },

  // ── Step section blocks
  stepSection: {
    backgroundColor: CARD, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER,
  },
  stepSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  stepNumBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: CARD_ELEVATED, borderWidth: 1.5, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumBadgeDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepNumText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  stepSectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.text },
  stepChangeLink: { fontSize: 11, color: Colors.accent, fontWeight: '600' },

  // ── Doc selected card (after selection)
  docSelectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 12, padding: 12,
    backgroundColor: BG, borderRadius: 10,
    borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER,
  },
  docSelectedIcon: {
    width: 38, height: 38, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  docSelectedLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  docSelectedDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  docSelectedCheck: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  // Lock Banner
  lockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.gold + '10', borderWidth: 1, borderColor: Colors.gold + '30',
    borderRadius: 10, padding: 12,
  },
  lockIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.gold + '20', justifyContent: 'center', alignItems: 'center',
  },
  lockTitle: { fontSize: 13, fontWeight: '700', color: Colors.gold },
  lockSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  // Indirect emission banner
  indirectBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#0ea5e9' + '15', borderWidth: 1.5, borderColor: '#0ea5e9' + '40',
    borderRadius: 10, padding: 12,
  },
  indirectBannerIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center',
  },
  indirectBannerTitle: { fontSize: 13, fontWeight: '700', color: '#0ea5e9' },
  indirectBannerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

  // Category blocks
  catBlock: { borderTopWidth: 1, borderTopColor: BORDER },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11, backgroundColor: CARD,
  },
  catLabel: { fontSize: 12, fontWeight: '600', color: Colors.text },
  catCount: {
    fontSize: 10, color: Colors.textMuted, backgroundColor: CARD_ELEVATED,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
  },
  catDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },

  // Doc items
  docItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingRight: 14,
    borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: BG,
  },
  docItemAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 0 },
  docIconWrap: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  docItemLabel: { fontSize: 12, fontWeight: '600', color: Colors.text },
  docItemDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1, lineHeight: 14 },

  // Field groups inside step sections
  fieldGroup: { gap: 6, padding: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: BG, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13 },
  dropdown: {
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden', marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12,
  },
  emptyDropRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, justifyContent: 'center' },
  emptyDropText: { color: Colors.textSecondary, fontSize: 12 },
  dropItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  dropAvatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  dropAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  dropMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.textMuted },
  dropName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  dropMeta: { fontSize: 10, color: Colors.textSecondary },

  // Selected aluno card
  selectedAlunoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.success + '10', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.success + '35', marginTop: 4,
  },
  selectedAlunoAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  selectedAlunoAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  selectedAlunoName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  selectedAlunoChangeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: CARD_ELEVATED, justifyContent: 'center', alignItems: 'center',
  },
  alunoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: CARD_ELEVATED, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  alunoChipText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },

  // Trimestre
  triRow: { flexDirection: 'row', gap: 7 },
  triBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, flexDirection: 'row',
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  triBtnActive: { backgroundColor: Colors.primary + '25', borderColor: Colors.primary + '60' },
  triBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  triBtnTextActive: { color: Colors.primary },

  // Turma list
  turmaChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
  },
  turmaChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  turmaChipText: { fontSize: 12, color: Colors.textSecondary },
  turmaChipTextActive: { color: Colors.primary, fontWeight: '600' },

  // Textarea
  textarea: {
    backgroundColor: BG, borderRadius: 8, padding: 10, color: Colors.text,
    fontSize: 13, minHeight: 60, borderWidth: 1, borderColor: BORDER, lineHeight: 20,
  },

  // Emit footer (sticky)
  emitFooter: {
    padding: 12, borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: CARD,
  },
  emitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 11,
  },
  emitBtnDisabled: { opacity: 0.6 },
  emitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emitBtnPlaceholder: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 11,
    backgroundColor: CARD_ELEVATED, borderWidth: 1, borderColor: BORDER,
  },
  emitBtnPlaceholderText: { fontSize: 13, color: Colors.textMuted },

  // Custom templates badge and banner
  customBadge: {
    backgroundColor: Colors.warning + '25', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: Colors.warning + '40',
  },
  customBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.warning },
  customTemplateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warning + '10', borderRadius: 8, padding: 9,
    borderWidth: 1, borderColor: Colors.warning + '25',
  },
  customTemplateBannerText: { fontSize: 11, color: Colors.warning, flex: 1, lineHeight: 15 },

  // Empty State
  emptyState: { alignItems: 'center', padding: 40, gap: 12 },
  emptyStateText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' },

  // Right Panel
  rightPanel: {
    flex: 1, backgroundColor: '#080f1c',
    position: 'relative', overflow: 'hidden',
  },

  // Progress Overlay
  progressOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: BG + 'ee',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
    padding: 32,
  },
  progressCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 28, width: '100%', maxWidth: 400,
    alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20,
  },
  progressIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  progressDocLabel: {
    fontSize: 14, fontWeight: '700', color: Colors.text,
    textAlign: 'center', maxWidth: 300,
  },
  progressStepLabel: {
    fontSize: 13, color: Colors.textSecondary, textAlign: 'center',
  },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: BORDER,
    borderRadius: 4, overflow: 'hidden', marginTop: 4,
  },
  progressFill: {
    height: '100%', borderRadius: 4,
  },
  progressPct: {
    fontSize: 12, color: Colors.textSecondary, fontWeight: '600',
  },
  stepsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: '100%', marginTop: 4, gap: 4,
  },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'transparent',
  },
  stepLabel: {
    fontSize: 9, color: Colors.textMuted, textAlign: 'center', fontWeight: '500',
  },

  // Preview Bar
  previewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, paddingHorizontal: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  previewBarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  previewBarTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  previewBarMeta: { fontSize: 12, color: Colors.textSecondary },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  printBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  closePreviewBtn: { padding: 4 },

  // Preview Empty
  previewEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 40 },
  previewEmptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  previewEmptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 20 },
  previewLockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.success + '30', marginTop: 8,
  },
  previewLockText: { fontSize: 11, color: Colors.success },

  // Desktop overlay (absolute within root — avoids full-screen Modal)
  overlayBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000a',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 200,
    padding: 40,
  },
  overlayCard: {
    backgroundColor: CARD, borderRadius: 20,
    width: 480, maxHeight: 520,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5, shadowRadius: 40,
    overflow: 'hidden',
  },

  // Mobile modal (bottom sheet)
  modalBackdrop: {
    flex: 1, backgroundColor: '#000c',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%', borderTopWidth: 1, borderTopColor: BORDER,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitleIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '30',
    justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  modalCountBadge: {
    backgroundColor: Colors.primary + '25', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  modalCountText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  modalCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BORDER + '60', justifyContent: 'center', alignItems: 'center',
  },
  modalScroll: { padding: 16, gap: 10 },

  emptyLog: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyLogIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.textMuted + '15', justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  emptyLogTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  emptyLogText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  logEntry: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  logEntryIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.success + '15', justifyContent: 'center', alignItems: 'center',
    marginTop: 1,
  },
  logDocLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  logMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  logMeta: { fontSize: 11, color: Colors.textSecondary },
  logHoraWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  logHora: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  // Turma — vertical radio list (replaces horizontal chips)
  turmaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: BG, borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  turmaRowActive: {
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary + '50',
  },
  turmaRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  turmaRadioActive: { borderColor: Colors.gold },
  turmaRadioDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold,
  },
  turmaRowLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  turmaRowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  // Pending Tasks Modal
  pendingOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center',
    padding: 20,
  },
  pendingCard: {
    backgroundColor: CARD, borderRadius: 18, width: '100%', maxWidth: 520,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24,
    overflow: 'hidden',
  },
  pendingCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 18, backgroundColor: Colors.gold + '0a',
  },
  pendingCardIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.gold + '20', borderWidth: 1, borderColor: Colors.gold + '40',
    justifyContent: 'center', alignItems: 'center',
  },
  pendingCardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pendingCardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  pendingCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BORDER + '60', justifyContent: 'center', alignItems: 'center',
  },
  pendingDivider: { height: 1, backgroundColor: BORDER },
  pendingSolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: BG, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER, marginHorizontal: 14,
  },
  pendingSolNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary + '20', borderWidth: 1, borderColor: Colors.primary + '40',
    justifyContent: 'center', alignItems: 'center',
  },
  pendingSolNumText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  pendingSolTipo: { fontSize: 13, fontWeight: '700', color: Colors.text },
  pendingSolAluno: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  pendingSolMotivo: { fontSize: 11, color: Colors.textMuted, flex: 1, fontStyle: 'italic' },
  pendingSolStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 2,
  },
  pendingSolStatusDot: { width: 6, height: 6, borderRadius: 3 },
  pendingSolStatusText: { fontSize: 10, fontWeight: '700' },
  pendingEmitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  pendingEmitBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  pendingFooter: {
    padding: 14, gap: 10,
  },
  pendingFooterText: { fontSize: 11, color: Colors.textMuted, flex: 1, lineHeight: 15 },
  pendingDismissBtn: {
    alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: BORDER,
  },
  pendingDismissBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
});
