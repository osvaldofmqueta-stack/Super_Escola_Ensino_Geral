import React, { useState, useEffect, useMemo, useRef } from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import PdfProgressModal from '@/components/PdfProgressModal';
import { usePdfProgress } from '@/hooks/usePdfProgress';
import { subscribeDataChange } from '@/lib/realtimeSync';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { SkeletonTable } from '@/components/Skeleton';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useProfessor } from '@/context/ProfessorContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { useNotificacoes } from '@/context/NotificacoesContext';
import { apiRequest } from '@/lib/query-client';
import { useLookup } from '@/hooks/useLookup';
import { webAlert } from '@/utils/webAlert';
import { useConfig } from '@/context/ConfigContext';
import RequiredMark from '@/components/RequiredMark';

interface AulaHorario {
  id: string;
  turmaId: string;
  disciplina: string;
  professorId: string;
  professorNome: string;
  diaSemana: number;
  periodo: number;
  horaInicio: string;
  horaFim: string;
  sala: string;
  anoAcademico: string;
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const DIAS_FULL = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

const PERIODOS_DEFAULT = [
  { numero: 1, inicio: '07:30', fim: '08:15' },
  { numero: 2, inicio: '08:20', fim: '09:15' },
  { numero: 3, inicio: '09:15', fim: '10:00' },
  { numero: 4, inicio: '10:05', fim: '10:50' },
  { numero: 5, inicio: '10:55', fim: '11:40' },
  { numero: 6, inicio: '11:45', fim: '12:35' },
];

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

const DISC_COLORS = [
  '#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA',
  '#F472B6', '#22D3EE', '#A3E635', '#FB923C', '#818CF8',
  '#4ADE80', '#E879F9', '#38BDF8', '#FCD34D', '#F9A8D4',
];
function getDisciplinaColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return DISC_COLORS[Math.abs(hash) % DISC_COLORS.length];
}


type ModalMode = 'add' | 'edit' | null;
type ScreenMode = 'landing' | 'visualizar' | 'criar';

export default function HorarioScreen() {
  const { width: windowWidth } = useWindowDimensions();
  // gridWidth é medido via onLayout para excluir a sidebar e qualquer padding
  const [gridWidth, setGridWidth] = useState(windowWidth);
  // PERIODO_LABEL=46, GRID_PADDING=12 (6px × 2 sides), CELL_MARGINS=30 (3px each side × 5 days)
  const CELL_W = Math.max(58, (gridWidth - 46 - 12 - 30) / 5);

  const { user } = useAuth();
  const { turmas, professores, alunos } = useData();
  const { anoSelecionado } = useAnoAcademico();
  const { addSumario } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const { config, updateConfig } = useConfig();
  const { values: disciplinasFallback } = useLookup('disciplinas_fallback', [
    'Língua Portuguesa', 'Matemática', 'Física', 'Química', 'Biologia',
    'História', 'Geografia', 'Língua Estrangeira I', 'Educação Física', 'Filosofia',
  ]);

  const isProf = user?.role === 'professor';
  const isAluno = user?.role === 'aluno';
  const isAdmin = !isProf && !isAluno;
  const profData = professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email);
  const alunoData = alunos.find(a => a.email === user?.email || a.numeroBi === user?.numeroBi);

  function toArray(val: unknown): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') {
      try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  }

  const [screenMode, setScreenMode] = useState<ScreenMode>('landing');
  const [criandoTurmaId, setCriandoTurmaId] = useState<string | null>(null);
  const [showCriarTurmaModal, setShowCriarTurmaModal] = useState(false);

  const [showSumarioModal, setShowSumarioModal] = useState(false);
  const [sumarioAula, setSumarioAula] = useState<AulaHorario | null>(null);
  const [sumarioConteudo, setSumarioConteudo] = useState('');
  const [sumarioNumero, setSumarioNumero] = useState('');
  const [horarios, setHorarios] = useState<AulaHorario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [turmaIdx, setTurmaIdx] = useState(0);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedCell, setSelectedCell] = useState<{ dia: number; periodo: number } | null>(null);
  const [editingHorario, setEditingHorario] = useState<AulaHorario | null>(null);
  const [form, setForm] = useState({ disciplina: '', professorId: '', sala: '' });
  const [showDisciplinaList, setShowDisciplinaList] = useState(false);
  const [showProfList, setShowProfList] = useState(false);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [periodos, setPeriodos] = useState(PERIODOS_DEFAULT);
  const [showPeriodosModal, setShowPeriodosModal] = useState(false);
  const [editPeriodos, setEditPeriodos] = useState(PERIODOS_DEFAULT);
  // Professor view: 'meu' = consolidated (my classes only), 'turma' = per-class tab view
  const [profView, setProfView] = useState<'meu' | 'turma'>('meu');
  const [showTurmaDropdown, setShowTurmaDropdown] = useState(false);
  const [showConflictPanel, setShowConflictPanel] = useState(true);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [exportandoPdfProf, setExportandoPdfProf] = useState(false);
  const pdfProgressTurma = usePdfProgress();
  const pdfProgressProf = usePdfProgress();

  interface Sugestao { diaSemana: number; diaNome: string; periodo: number; horaInicio: string; horaFim: string; score: number; melhor: boolean; }
  interface SugestoesData { professorNome: string; sugestoes: Sugestao[]; professorId: string; disciplina: string; sala: string; }
  const [sugestoesData, setSugestoesData] = useState<SugestoesData | null>(null);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);

  interface ResolucaoItem { professorNome: string; disciplina: string; turmaNome: string; de: string; para?: string; motivo?: string; }
  interface ResolucaoResultado { resolved: ResolucaoItem[]; failed: ResolucaoItem[]; totalResolvidos: number; totalFalhados: number; }
  const [autoResolvendo, setAutoResolvendo] = useState(false);
  const [resolucaoResultado, setResolucaoResultado] = useState<ResolucaoResultado | null>(null);

  interface GeracaoItem { turmaNome: string; disciplina?: string; professorNome?: string; slot?: string; motivo?: string; }
  interface GeracaoResultado { inseridos: GeracaoItem[]; falhados: GeracaoItem[]; totalInseridos: number; totalFalhados: number; }
  const [gerandoHorario, setGerandoHorario] = useState(false);
  const [geracaoResultado, setGeracaoResultado] = useState<GeracaoResultado | null>(null);
  const [showConfirmGerar, setShowConfirmGerar] = useState(false);

  // ── Disponibilidade dos professores ──
  interface ProfDisp { id: string; nome: string; apelido: string; diasDisponiveis: number[]; turno: string; turmasIds: string[]; }
  const [showDispModal, setShowDispModal] = useState(false);
  const [profDispList, setProfDispList] = useState<ProfDisp[]>([]);
  const [salvandoDisp, setSalvandoDisp] = useState<string | null>(null);
  const [turmaDispFilter, setTurmaDispFilter] = useState<string>('todos');

  // ── Limpar horário da turma ──
  const [showLimparModal, setShowLimparModal] = useState(false);
  const [limpandoHorario, setLimpandoHorario] = useState(false);

  // ── Disponibilidade do professor (auto-gestão) ──
  const [showMyDispModal, setShowMyDispModal] = useState(false);
  const [myDisp, setMyDisp] = useState<{ diasDisponiveis: number[]; turno: string }>({ diasDisponiveis: [1,2,3,4,5], turno: 'Ambos' });
  const [myProfId, setMyProfId] = useState<string | null>(null);
  const [salvandoMyDisp, setSalvandoMyDisp] = useState(false);

  // ── Helper: extrai mensagem de erro do servidor a partir da excepção lançada por apiRequest ──
  // apiRequest lança Error com mensagem "STATUS: {json}" quando o servidor retorna 4xx/5xx
  function extractServerError(err: unknown, fallback: string): string {
    if (err instanceof Error) {
      try {
        const match = err.message.match(/^\d+: ([\s\S]*)/);
        if (match) {
          const body = JSON.parse(match[1]);
          let msg = body?.error ?? fallback;
          if (body?.detail) msg += '\n' + body.detail;
          return msg;
        }
      } catch { /* usar fallback */ }
    }
    return fallback;
  }

  // Load periods from database config when config is ready
  useEffect(() => {
    if (config?.periodosHorario && Array.isArray(config.periodosHorario) && config.periodosHorario.length > 0) {
      setPeriodos(config.periodosHorario as typeof PERIODOS_DEFAULT);
    }
  }, [config?.periodosHorario]);

  async function salvarPeriodos() {
    try {
      await updateConfig({ periodosHorario: editPeriodos } as never);
      setPeriodos(editPeriodos);
      setShowPeriodosModal(false);
      alertSucesso('Horários actualizados', 'Os horários dos períodos foram guardados na base de dados.');
    } catch {
      alertErro('Erro', 'Não foi possível guardar os horários.');
    }
  }

  async function resetPeriodos() {
    try {
      await updateConfig({ periodosHorario: PERIODOS_DEFAULT } as never);
      setPeriodos(PERIODOS_DEFAULT);
      setEditPeriodos(PERIODOS_DEFAULT);
      setShowPeriodosModal(false);
      alertSucesso('Horários repostos', 'Os horários foram repostos para os valores predefinidos.');
    } catch {
      alertErro('Erro', 'Não foi possível repor os horários.');
    }
  }

  // Compute turmasAtivas: for professors use BOTH turmasIds AND actual horário assignments
  const turmasAtivas = turmas.filter(t => {
    const anoOk = !anoSelecionado || t.anoLetivo === anoSelecionado.ano;
    if (isProf && profData) {
      const minhasTurmasDoHorario = horarios.filter(h => h.professorId === profData.id).map(h => h.turmaId);
      return t.ativo && anoOk && (
        toArray(profData.turmasIds).includes(t.id) || minhasTurmasDoHorario.includes(t.id)
      );
    }
    if (isAluno && alunoData) {
      return t.ativo && anoOk && t.id === alunoData.turmaId;
    }
    return t.ativo && anoOk;
  });

  // turmaAtual: always prefer ID-based lookup (criandoTurmaId) to avoid index mismatches
  // when turmasAtivas is year-filtered but the modal iterates ALL active turmas.
  const turmaAtual = criandoTurmaId
    ? (turmas.find(t => t.id === criandoTurmaId) ?? turmasAtivas[turmaIdx] ?? turmasAtivas[0] ?? null)
    : (turmasAtivas[turmaIdx] ?? turmasAtivas[0] ?? null);

  // Professor: classes across ALL turmas (for the "Meu Horário" consolidated view)
  const minhasAulas = isProf && profData
    ? horarios.filter(h => h.professorId === profData.id && (!anoSelecionado || h.anoAcademico === anoSelecionado.ano))
    : [];

  // Dias da semana onde o professor tem pelo menos uma aula (para filtrar colunas)
  const diasComAulasProf = new Set(minhasAulas.map(h => h.diaSemana));
  // Períodos onde o professor tem pelo menos uma aula (para filtrar linhas)
  const periodosComAulasProf = new Set(minhasAulas.map(h => h.periodo));

  function getMinhaAula(dia: number, periodo: number): AulaHorario[] {
    return minhasAulas.filter(h => h.diaSemana === dia && h.periodo === periodo);
  }

  useEffect(() => {
    loadHorarios();
    // WebSocket real-time: actualiza instantaneamente quando o horário muda
    const unsubWs = subscribeDataChange((entity) => {
      if (entity === 'horarios') loadHorarios();
    });
    // Polling de 30s como fallback
    const interval = setInterval(loadHorarios, 30000);
    return () => { unsubWs(); clearInterval(interval); };
  }, []);

  // Re-carrega horários imediatamente quando a turma do aluno muda (ex: admin transferiu o aluno)
  const prevTurmaIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const turmaId = turmaAtual?.id;
    if (turmaId && turmaId !== prevTurmaIdRef.current) {
      prevTurmaIdRef.current = turmaId;
      loadHorarios();
    }
  }, [turmaAtual?.id]);

  useEffect(() => {
    if (!turmaAtual) { setDisciplinas([]); return; }
    fetch(`/api/turmas/${turmaAtual.id}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        if (list && list.length > 0) {
          setDisciplinas(list.map(d => d.nome));
        } else {
          setDisciplinas(disciplinasFallback);
        }
      })
      .catch(() => setDisciplinas(disciplinasFallback));
  }, [turmaAtual?.id]);

  async function loadHorarios() {
    try {
      const res = await apiRequest('GET', '/api/horarios');
      const data = await res.json();
      setHorarios(Array.isArray(data) ? data : []);
    } catch {
      setHorarios([]);
    } finally {
      setIsLoading(false);
    }
  }

  const horariosTurma = horarios.filter(h =>
    h.turmaId === turmaAtual?.id &&
    (!anoSelecionado || h.anoAcademico === anoSelecionado.ano)
  );

  // Dias da semana onde a turma actual tem aulas (para filtrar colunas vazias)
  const diasComAulasTurma = new Set(horariosTurma.map(h => h.diaSemana));

  async function exportarHorarioPDF() {
    if (!turmaAtual) return;
    setExportandoPdf(true);
    pdfProgressTurma.start();
    try {
      const ano = anoSelecionado?.ano || turmaAtual.anoLetivo || '';
      const url = `/api/horarios/pdf/${turmaAtual.id}${ano ? `?anoAcademico=${encodeURIComponent(ano)}` : ''}`;
      const tok = await getAuthToken();
      const res = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        pdfProgressTurma.cancel();
        alertErro('Erro ao exportar', err.error || 'Não foi possível gerar o PDF.');
        return;
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Horario_${turmaAtual.nome.replace(/\s+/g, '_')}_${ano}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      pdfProgressTurma.complete();
    } catch {
      pdfProgressTurma.cancel();
      alertErro('Erro', 'Não foi possível gerar o PDF do horário.');
    } finally {
      setExportandoPdf(false);
    }
  }

  // ── Detecção de conflitos (professor + sala) em todos os horários ──────────
  interface Conflict {
    type: 'professor' | 'sala';
    aulaIds: string[];
    dia: number;
    periodo: number;
    descricao: string;
  }

  const conflitos = useMemo<Conflict[]>(() => {
    const result: Conflict[] = [];
    const filtered = horarios.filter(h => !anoSelecionado || h.anoAcademico === anoSelecionado.ano);

    for (let dia = 1; dia <= 5; dia++) {
      for (const p of periodos) {
        const slot = filtered.filter(h => h.diaSemana === dia && h.periodo === p.numero);
        if (slot.length < 2) continue;

        // Conflito de professor: mesmo professorId em turmas diferentes no mesmo slot
        const byProf = new Map<string, AulaHorario[]>();
        for (const h of slot) {
          if (!h.professorId) continue;
          const arr = byProf.get(h.professorId) ?? [];
          arr.push(h);
          byProf.set(h.professorId, arr);
        }
        for (const [profId, aulas] of byProf) {
          const turmaIds = [...new Set(aulas.map(a => a.turmaId))];
          if (aulas.length > 1 && turmaIds.length > 1) {
            const prof = professores.find(pr => pr.id === profId);
            const nome = prof ? `${prof.nome} ${prof.apelido}` : profId;
            const turmaNames = turmaIds.map(tid => turmas.find(t => t.id === tid)?.nome ?? tid);
            result.push({
              type: 'professor',
              aulaIds: aulas.map(a => a.id),
              dia, periodo: p.numero,
              descricao: `${nome} atribuído/a em simultâneo a: ${turmaNames.join(', ')}`,
            });
          }
        }

        // Conflito de sala: mesma sala em turmas diferentes no mesmo slot
        const bySala = new Map<string, AulaHorario[]>();
        for (const h of slot) {
          const sala = h.sala?.trim();
          if (!sala) continue;
          const arr = bySala.get(sala) ?? [];
          arr.push(h);
          bySala.set(sala, arr);
        }
        for (const [sala, aulas] of bySala) {
          const turmaIds = [...new Set(aulas.map(a => a.turmaId))];
          if (turmaIds.length > 1) {
            const turmaNames = turmaIds.map(tid => turmas.find(t => t.id === tid)?.nome ?? tid);
            result.push({
              type: 'sala',
              aulaIds: aulas.map(a => a.id),
              dia, periodo: p.numero,
              descricao: `Sala "${sala}" usada em simultâneo por: ${turmaNames.join(', ')}`,
            });
          }
        }
      }
    }
    return result;
  }, [horarios, periodos, anoSelecionado, professores, turmas]);

  const conflictAulaIds = useMemo(() => new Set(conflitos.flatMap(c => c.aulaIds)), [conflitos]);

  function getAula(dia: number, periodo: number): AulaHorario | undefined {
    return horariosTurma.find(h => h.diaSemana === dia && h.periodo === periodo);
  }

  function openAdd(dia: number, periodo: number) {
    setSelectedCell({ dia, periodo });
    setForm({ disciplina: '', professorId: '', sala: turmaAtual?.sala || '' });
    setEditingHorario(null);
    setModalMode('add');
  }

  function openEdit(aula: AulaHorario) {
    setEditingHorario(aula);
    setForm({ disciplina: aula.disciplina, professorId: aula.professorId, sala: aula.sala });
    setSelectedCell({ dia: aula.diaSemana, periodo: aula.periodo });
    setModalMode('edit');
  }

  function openOptions(aula: AulaHorario) {
    webAlert(aula.disciplina, `${DIAS_FULL[aula.diaSemana - 1]} — ${aula.horaInicio}`, [
      { text: 'Editar', onPress: () => openEdit(aula) },
      { text: 'Remover', style: 'destructive', onPress: () => removeAula(aula.id) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function exportarHorarioProfPDF() {
    if (!profData) return;
    setExportandoPdfProf(true);
    pdfProgressProf.start();
    try {
      const ano = anoSelecionado?.ano || '2025';
      const url = `/api/horarios/pdf-professor/${profData.id}?anoAcademico=${ano}`;
      const res = await apiRequest('GET', url);
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Horario_Professor_${profData.nome}_${profData.apelido}_${ano}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      pdfProgressProf.complete();
    } catch (err: unknown) {
      pdfProgressProf.cancel();
      alertErro('Erro PDF', extractServerError(err, 'Não foi possível gerar o PDF do horário.'));
    } finally {
      setExportandoPdfProf(false);
    }
  }

  async function autoResolverConflitos() {
    const ano = anoSelecionado?.ano;
    if (!ano) { alertErro('Ano académico', 'Seleccione um ano académico primeiro.'); return; }
    setAutoResolvendo(true);
    try {
      const res = await apiRequest('POST', '/api/horarios/auto-resolver-conflitos', { anoAcademico: ano });
      const data = await res.json();
      setResolucaoResultado(data);
      const res2 = await apiRequest('GET', `/api/horarios?anoAcademico=${ano}`);
      const h = await res2.json();
      setHorarios(Array.isArray(h) ? h : []);
    } catch (err: unknown) {
      alertErro('Erro ao Resolver Conflitos', extractServerError(err, 'Não foi possível resolver os conflitos automaticamente.'));
    } finally {
      setAutoResolvendo(false);
    }
  }

  async function carregarDisponibilidades() {
    try {
      const res = await apiRequest('GET', '/api/professores/disponibilidades');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setProfDispList(data.map((p: any) => {
          const disp = typeof p.disponibilidade === 'string' ? JSON.parse(p.disponibilidade || '{}') : (p.disponibilidade || {});
          const tIds = typeof p.turmasIds === 'string' ? JSON.parse(p.turmasIds || '[]') : (Array.isArray(p.turmasIds) ? p.turmasIds : []);
          return {
            id: p.id, nome: p.nome, apelido: p.apelido,
            diasDisponiveis: Array.isArray(disp.diasDisponiveis) ? disp.diasDisponiveis : [1,2,3,4,5],
            turno: disp.turno ?? 'Ambos',
            turmasIds: tIds,
          };
        }));
      }
    } catch { /* silent */ }
  }

  async function carregarMinhaDisponibilidade() {
    try {
      const res = await apiRequest('GET', '/api/professores/minha-disponibilidade');
      if (!res.ok) return;
      const p = await res.json();
      const disp = typeof p.disponibilidade === 'string' ? JSON.parse(p.disponibilidade || '{}') : (p.disponibilidade || {});
      setMyProfId(p.id);
      setMyDisp({
        diasDisponiveis: Array.isArray(disp.diasDisponiveis) ? disp.diasDisponiveis : [1,2,3,4,5],
        turno: disp.turno ?? 'Ambos',
      });
    } catch { /* silent */ }
  }

  async function guardarMinhaDisponibilidade() {
    if (!myProfId) return;
    setSalvandoMyDisp(true);
    try {
      await apiRequest('PATCH', `/api/professores/${myProfId}/disponibilidade`, myDisp);
      alertSucesso('Guardado', 'A sua disponibilidade foi guardada com sucesso.');
      setShowMyDispModal(false);
    } catch (err: unknown) {
      alertErro('Erro', extractServerError(err, 'Não foi possível guardar a disponibilidade.'));
    } finally { setSalvandoMyDisp(false); }
  }

  // Professores filtrados pelo filtro de turma seleccionado no modal de disponibilidade
  const filteredProfDisp = useMemo(() => {
    if (turmaDispFilter === 'todos') return profDispList;
    return profDispList.filter(p => p.turmasIds.includes(turmaDispFilter));
  }, [profDispList, turmaDispFilter]);

  async function guardarDisponibilidade(profId: string, diasDisponiveis: number[], turno: string) {
    setSalvandoDisp(profId);
    try {
      await apiRequest('PATCH', `/api/professores/${profId}/disponibilidade`, { diasDisponiveis, turno });
      alertSucesso('Guardado', 'Disponibilidade actualizada com sucesso.');
    } catch (err: unknown) {
      alertErro('Erro', extractServerError(err, 'Não foi possível guardar a disponibilidade.'));
    } finally { setSalvandoDisp(null); }
  }

  function toggleDiasDisp(profId: string, dia: number) {
    setProfDispList(prev => prev.map(p => {
      if (p.id !== profId) return p;
      const dias = p.diasDisponiveis.includes(dia)
        ? p.diasDisponiveis.filter(d => d !== dia)
        : [...p.diasDisponiveis, dia].sort();
      return { ...p, diasDisponiveis: dias };
    }));
  }

  function setTurnoDisp(profId: string, turno: string) {
    setProfDispList(prev => prev.map(p => p.id !== profId ? p : { ...p, turno }));
  }

  async function gerarHorarioAutomatico(limpar: boolean) {
    const ano = anoSelecionado?.ano;
    if (!ano) { alertErro('Ano académico', 'Seleccione um ano académico primeiro.'); return; }
    setShowConfirmGerar(false);
    setGerandoHorario(true);
    try {
      const res = await apiRequest('POST', '/api/horarios/gerar-automatico', { anoAcademico: ano, limpar });
      const data = await res.json();
      setGeracaoResultado(data);
      const res2 = await apiRequest('GET', `/api/horarios?anoAcademico=${ano}`);
      if (res2.ok) { const h = await res2.json(); setHorarios(Array.isArray(h) ? h : []); }
    } catch (err: unknown) {
      alertErro('Erro ao Gerar Horário', extractServerError(err, 'Não foi possível gerar o horário automaticamente.'));
    } finally {
      setGerandoHorario(false);
    }
  }

  async function buscarSugestoes(professorId: string, disciplina: string, sala: string, dia: number, periodo: number) {
    setLoadingSugestoes(true);
    setSugestoesData(null);
    try {
      const ano = anoSelecionado?.ano || '2025';
      const res = await apiRequest(
        'GET',
        `/api/horarios/sugestoes-professor/${professorId}?anoAcademico=${ano}&diaSemanaConflito=${dia}&periodoConflito=${periodo}`
      );
      const data = await res.json();
      setSugestoesData({ ...data, professorId, disciplina, sala });
    } catch {
      alertErro('Sugestões indisponíveis', 'Não foi possível obter sugestões de horário.');
    } finally {
      setLoadingSugestoes(false);
    }
  }

  function aplicarSugestao(s: Sugestao) {
    if (!sugestoesData) return;
    const slotLivreDessaTurma = horariosTurma.find(
      h => h.diaSemana === s.diaSemana && h.periodo === s.periodo
    );
    if (slotLivreDessaTurma) {
      alertErro('Bloco já ocupado', `Este bloco (${s.diaNome}, ${s.horaInicio}) já tem "${slotLivreDessaTurma.disciplina}" nesta turma.`);
      return;
    }
    setSelectedCell({ dia: s.diaSemana, periodo: s.periodo });
    setForm({ disciplina: sugestoesData.disciplina, professorId: sugestoesData.professorId, sala: sugestoesData.sala });
    setModalMode('add');
    setSugestoesData(null);
  }

  async function removeAula(id: string) {
    try {
      await apiRequest('DELETE', `/api/horarios/${id}`);
      setHorarios(prev => prev.filter(h => h.id !== id));
      alertSucesso('Aula removida', 'A aula foi removida do horário.');
    } catch {
      alertErro('Erro', 'Não foi possível remover a aula.');
    }
  }

  async function limparHorarioTurma() {
    if (!turmaAtual) return;
    const ano = anoSelecionado?.ano || turmaAtual.anoLetivo || '';
    if (!ano) { alertErro('Erro', 'Não foi possível determinar o ano académico.'); return; }
    setLimpandoHorario(true);
    try {
      const res = await apiRequest('DELETE', `/api/horarios/turma/${turmaAtual.id}?anoAcademico=${encodeURIComponent(ano)}`);
      const data = await res.json().catch(() => ({}));
      setHorarios(prev => prev.filter(h => !(h.turmaId === turmaAtual.id && h.anoAcademico === ano)));
      setShowLimparModal(false);
      alertSucesso('Horário limpo', `${(data as any).deleted || 0} blocos eliminados da turma ${turmaAtual.nome} (${ano}).`);
    } catch {
      alertErro('Erro', 'Não foi possível limpar o horário. Tente novamente.');
    } finally {
      setLimpandoHorario(false);
    }
  }

  async function salvar() {
    if (!form.disciplina || !selectedCell || !turmaAtual) return;
    const prof = professores.find(p => p.id === form.professorId);
    const periodo = periodos[selectedCell.periodo - 1];

    if (modalMode === 'add') {
      // Check: slot already occupied for this turma
      const slotOcupado = horariosTurma.find(
        h => h.diaSemana === selectedCell.dia && h.periodo === selectedCell.periodo
      );
      if (slotOcupado) {
        alertErro(
          'Bloco já ocupado',
          `Este bloco (${DIAS_FULL[selectedCell.dia - 1]}, ${periodo.inicio}) já tem "${slotOcupado.disciplina}" atribuída a esta turma.\n\nClique na aula existente para a editar ou remover.`
        );
        return;
      }
      // Check: disciplina already in this turma's schedule on another slot
      const discDuplicada = horariosTurma.find(h => h.disciplina === form.disciplina);
      if (discDuplicada) {
        alertErro('Disciplina duplicada', `"${form.disciplina}" já está no horário desta turma (${DIAS_FULL[discDuplicada.diaSemana - 1]}, período ${discDuplicada.periodo}).`);
        return;
      }
      // Check: professor double-booked at same time across all turmas
      if (form.professorId) {
        const anoAtual = anoSelecionado?.ano || '2025';
        const profOcupado = horarios.find(
          h => h.professorId === form.professorId &&
               h.diaSemana === selectedCell.dia &&
               h.periodo === selectedCell.periodo &&
               h.anoAcademico === anoAtual
        );
        if (profOcupado) {
          const outraTurma = turmas.find(t => t.id === profOcupado.turmaId);
          setModalMode(null);
          // Mostrar modal de sugestões em vez de apenas alertar
          buscarSugestoes(
            form.professorId,
            form.disciplina,
            form.sala || turmaAtual.sala,
            selectedCell.dia,
            selectedCell.periodo
          );
          // Guardar contexto do conflito para mostrar no modal
          setSugestoesData({
            professorNome: `${prof?.nome ?? ''} ${prof?.apelido ?? ''}`.trim(),
            sugestoes: [],
            professorId: form.professorId,
            disciplina: form.disciplina,
            sala: form.sala || turmaAtual.sala,
            _conflito: {
              turmaNome: outraTurma?.nome ?? profOcupado.turmaId,
              disciplinaConflito: profOcupado.disciplina,
              dia: selectedCell.dia,
              periodo: selectedCell.periodo,
            },
          } as any);
          return;
        }
      }
      const nova: AulaHorario = {
        id: genId(),
        turmaId: turmaAtual.id,
        disciplina: form.disciplina,
        professorId: form.professorId,
        professorNome: prof ? `${prof.nome} ${prof.apelido}` : '—',
        diaSemana: selectedCell.dia,
        periodo: selectedCell.periodo,
        horaInicio: periodo?.inicio || '',
        horaFim: periodo?.fim || '',
        sala: form.sala || turmaAtual?.sala || '',
        anoAcademico: anoSelecionado?.ano || '2025',
      };
      try {
        const res = await apiRequest('POST', '/api/horarios', nova);
        const created = await res.json();
        setHorarios(prev => [...prev, created]);
        alertSucesso('Aula adicionada', `${form.disciplina} foi adicionada ao horário.`);
      } catch (err: unknown) {
        alertErro('Conflito no horário', extractServerError(err, 'Não foi possível guardar a aula.'));
      }
    } else if (modalMode === 'edit' && editingHorario) {
      const updates = {
        disciplina: form.disciplina,
        professorId: form.professorId || null,
        professorNome: prof ? `${prof.nome} ${prof.apelido}` : '—',
        sala: form.sala || editingHorario.sala || '',
      };
      try {
        const res = await apiRequest('PUT', `/api/horarios/${editingHorario.id}`, updates);
        const updated = await res.json();
        setHorarios(prev => prev.map(h => h.id === editingHorario.id ? updated : h));
        alertSucesso('Aula actualizada', `${form.disciplina} foi actualizada com sucesso.`);
      } catch {
        alertErro('Erro', 'Não foi possível actualizar a aula.');
      }
    }
    setModalMode(null);
  }

  async function submeterSumarioFromHorario() {
    if (!sumarioAula || !profData || !sumarioConteudo.trim() || !sumarioNumero) return;
    const turma = turmasAtivas.find(t => t.id === sumarioAula.turmaId);
    await addSumario({
      professorId: profData.id,
      professorNome: `${profData.nome} ${profData.apelido}`,
      turmaId: sumarioAula.turmaId,
      turmaNome: turma?.nome || '',
      disciplina: sumarioAula.disciplina,
      data: new Date().toISOString().split('T')[0],
      horaInicio: sumarioAula.horaInicio,
      horaFim: sumarioAula.horaFim,
      numeroAula: parseInt(sumarioNumero) || 1,
      conteudo: sumarioConteudo,
      status: 'pendente',
    });
    await addNotificacao({
      titulo: 'Sumário Submetido',
      mensagem: `Sumário da aula ${sumarioNumero} de ${sumarioAula.disciplina} enviado para aprovação.`,
      tipo: 'info',
      data: new Date().toISOString(),
    });
    setSumarioConteudo('');
    setSumarioNumero('');
    setSumarioAula(null);
    setShowSumarioModal(false);
    alertSucesso('Sumário enviado', 'O sumário foi enviado ao RH para validação.');
  }

  function openProfCell(aula: AulaHorario) {
    if (aula.professorId !== profData?.id) {
      webAlert(aula.disciplina, `Prof. ${aula.professorNome} · ${aula.sala}\n${DIAS_FULL[aula.diaSemana - 1]} — ${aula.horaInicio}`);
      return;
    }
    setSumarioAula(aula);
    setSumarioConteudo('');
    setSumarioNumero('');
    setShowSumarioModal(true);
  }

  const profOptions = professores.filter(p => p.ativo);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <TopBar title="Horário" subtitle="A carregar…" />
        <View style={{ padding: 16 }}>
          <SkeletonTable rows={7} cols={6} />
        </View>
      </View>
    );
  }

  if (turmasAtivas.length === 0 && !isAdmin) {
    return (
      <View style={styles.container}>
        <TopBar title="Horário" subtitle="Sem turmas disponíveis" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="calendar-outline" size={56} color={Colors.textMuted} />
          <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 16, textAlign: 'center' }}>
            Sem turmas atribuídas
          </Text>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            {isProf
              ? 'Ainda não tem turmas atribuídas. Contacte a direcção para que lhe sejam atribuídas turmas.'
              : 'Não existem turmas activas no sistema. Crie turmas na secção de Gestão Académica.'}
          </Text>
        </View>
      </View>
    );
  }

  // ── LANDING SCREEN: only shown to admins/directors (not professor/aluno) ──
  const profConfigurados = profDispList.filter(p => !arraysEqual(p.diasDisponiveis, [1,2,3,4,5]) || p.turno !== 'Ambos').length;
  const totalProfs = professores.filter(p => p.ativo).length;
  const dispProgress = totalProfs > 0 ? profConfigurados / totalProfs : 0;
  const aulasPorTurma = turmasAtivas.length > 0 ? Math.round(horarios.length / turmasAtivas.length) : 0;

  if (isAdmin && screenMode === 'landing') {
    return (
      <View style={styles.container}>
        <TopBar title="Horário" subtitle="Gestão de Horários" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.landingContainer} showsVerticalScrollIndicator={false}>

          {/* ── Hero ── */}
          <View style={styles.landingHero}>
            <View style={styles.landingHeroIconWrap}>
              <View style={styles.landingHeroIconOuter}>
                <View style={styles.landingHeroIconInner}>
                  <Ionicons name="calendar" size={30} color={Colors.gold} />
                </View>
              </View>
            </View>
            <Text style={styles.landingTitle}>Gestão de Horários</Text>
            <Text style={styles.landingSubtitle}>
              Planeie, visualize e gere horários semanais para todas as turmas da escola.
            </Text>
            {conflitos.length > 0 && (
              <TouchableOpacity
                style={styles.landingConflictAlert}
                onPress={() => { setCriandoTurmaId(turmasAtivas[0]?.id ?? null); setScreenMode('visualizar'); }}
                activeOpacity={0.82}
              >
                <Ionicons name="warning" size={14} color={Colors.danger} />
                <Text style={styles.landingConflictAlertText}>
                  {conflitos.length} {conflitos.length === 1 ? 'conflito detectado' : 'conflitos detectados'} — Toque para resolver
                </Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.danger} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Stats Row ── */}
          <View style={styles.landingStatsRow}>
            <View style={styles.landingStatCard}>
              <Text style={styles.landingStatCardNum}>{turmas.filter(t => t.ativo).length}</Text>
              <View style={styles.landingStatCardDot} />
              <Text style={styles.landingStatCardLabel}>Turmas{'\n'}activas</Text>
            </View>
            <View style={styles.landingStatSep} />
            <View style={styles.landingStatCard}>
              <Text style={[styles.landingStatCardNum, { color: Colors.info }]}>{horarios.length}</Text>
              <View style={[styles.landingStatCardDot, { backgroundColor: Colors.info }]} />
              <Text style={styles.landingStatCardLabel}>Aulas{'\n'}registadas</Text>
            </View>
            <View style={styles.landingStatSep} />
            <View style={styles.landingStatCard}>
              <Text style={[styles.landingStatCardNum, { color: '#8B5CF6' }]}>{totalProfs}</Text>
              <View style={[styles.landingStatCardDot, { backgroundColor: '#8B5CF6' }]} />
              <Text style={styles.landingStatCardLabel}>Professores{'\n'}activos</Text>
            </View>
            <View style={styles.landingStatSep} />
            <View style={styles.landingStatCard}>
              <Text style={[styles.landingStatCardNum, { color: Colors.success }]}>{aulasPorTurma}</Text>
              <View style={[styles.landingStatCardDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.landingStatCardLabel}>Aulas/turma{'\n'}(média)</Text>
            </View>
          </View>

          {/* ── Secção: Acções principais ── */}
          <Text style={styles.landingSectionLabel}>Acções Rápidas</Text>
          <View style={styles.landingActionsRow}>
            <TouchableOpacity
              style={styles.landingActionCard}
              onPress={() => { setCriandoTurmaId(turmasAtivas[0]?.id ?? null); setScreenMode('visualizar'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.landingActionIcon, { backgroundColor: Colors.info + '20' }]}>
                <Ionicons name="eye-outline" size={26} color={Colors.info} />
              </View>
              <Text style={styles.landingActionTitle}>Visualizar</Text>
              <Text style={styles.landingActionDesc}>Horários por turma</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.landingActionCard}
              onPress={() => setShowCriarTurmaModal(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.landingActionIcon, { backgroundColor: Colors.gold + '20' }]}>
                <Ionicons name="add-circle-outline" size={26} color={Colors.gold} />
              </View>
              <Text style={styles.landingActionTitle}>Criar</Text>
              <Text style={styles.landingActionDesc}>Novo horário manual</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.landingActionCard}
              onPress={() => { setTurmaDispFilter('todos'); carregarDisponibilidades(); setShowDispModal(true); }}
              activeOpacity={0.8}
            >
              <View style={[styles.landingActionIcon, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="people-outline" size={26} color="#8B5CF6" />
              </View>
              <Text style={styles.landingActionTitle}>Disponib.</Text>
              <Text style={styles.landingActionDesc}>Config. professores</Text>
            </TouchableOpacity>
          </View>

          {/* ── Workflow Automatizado ── */}
          <Text style={styles.landingSectionLabel}>Geração Automática</Text>
          <View style={styles.landingWorkflow}>

            {/* Passo 1 */}
            <TouchableOpacity
              style={styles.landingWorkflowStep}
              onPress={() => { setTurmaDispFilter('todos'); carregarDisponibilidades(); setShowDispModal(true); }}
              activeOpacity={0.82}
            >
              <View style={styles.landingWorkflowLeft}>
                <View style={[styles.landingStepBadge, { backgroundColor: '#8B5CF6' }]}>
                  <Text style={styles.landingStepBadgeText}>1</Text>
                </View>
                <View style={styles.landingWorkflowConnector} />
              </View>
              <View style={styles.landingWorkflowContent}>
                <View style={styles.landingWorkflowHeader}>
                  <Text style={styles.landingWorkflowTitle}>Disponibilidade dos Professores</Text>
                  <View style={[styles.landingWorkflowBadge, { backgroundColor: profConfigurados > 0 ? '#8B5CF620' : Colors.surface, borderColor: profConfigurados > 0 ? '#8B5CF660' : Colors.border }]}>
                    <Text style={[styles.landingWorkflowBadgeText, { color: profConfigurados > 0 ? '#8B5CF6' : Colors.textMuted }]}>{profConfigurados}/{totalProfs}</Text>
                  </View>
                </View>
                <Text style={styles.landingWorkflowDesc}>Configure os dias e turnos disponíveis de cada professor antes de gerar o horário automaticamente.</Text>
                {totalProfs > 0 && (
                  <View style={styles.landingProgressBar}>
                    <View style={[styles.landingProgressFill, { width: `${Math.round(dispProgress * 100)}%` as any, backgroundColor: '#8B5CF6' }]} />
                  </View>
                )}
                <View style={styles.landingWorkflowFooter}>
                  <Ionicons name="people-circle-outline" size={13} color="#8B5CF6" />
                  <Text style={[styles.landingWorkflowFooterText, { color: '#8B5CF6' }]}>
                    {profConfigurados === 0 ? 'Nenhum professor configurado' : `${profConfigurados} professor${profConfigurados !== 1 ? 'es' : ''} configurado${profConfigurados !== 1 ? 's' : ''}`}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={14} color="#8B5CF6" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Passo 2 */}
            <TouchableOpacity
              style={[styles.landingWorkflowStep, { marginBottom: 0 }]}
              onPress={() => setShowConfirmGerar(true)}
              activeOpacity={0.82}
              disabled={gerandoHorario}
            >
              <View style={styles.landingWorkflowLeft}>
                <View style={[styles.landingStepBadge, { backgroundColor: Colors.accent }]}>
                  {gerandoHorario
                    ? <ActivityIndicator size={10} color="#fff" />
                    : <Text style={styles.landingStepBadgeText}>2</Text>}
                </View>
              </View>
              <View style={styles.landingWorkflowContent}>
                <View style={styles.landingWorkflowHeader}>
                  <Text style={styles.landingWorkflowTitle}>
                    {gerandoHorario ? 'A gerar...' : 'Gerar Horário Automático'}
                  </Text>
                  <View style={[styles.landingWorkflowBadge, { backgroundColor: Colors.accent + '20', borderColor: Colors.accent + '60' }]}>
                    <Ionicons name="flash" size={10} color={Colors.accent} />
                    <Text style={[styles.landingWorkflowBadgeText, { color: Colors.accent }]}>IA</Text>
                  </View>
                </View>
                <Text style={styles.landingWorkflowDesc}>Cria o horário completo para todas as turmas activas com base na disponibilidade dos professores.</Text>
                <View style={styles.landingWorkflowFooter}>
                  <Ionicons name="sparkles-outline" size={13} color={Colors.accent} />
                  <Text style={[styles.landingWorkflowFooterText, { color: Colors.accent }]}>Geração inteligente sem conflitos</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Conflitos (expanded se existirem) ── */}
          {conflitos.length > 0 && (
            <TouchableOpacity
              style={styles.landingConflictCard}
              onPress={() => { setCriandoTurmaId(turmasAtivas[0]?.id ?? null); setScreenMode('visualizar'); }}
              activeOpacity={0.82}
            >
              <View style={styles.landingConflictCardHeader}>
                <View style={[styles.landingActionIcon, { backgroundColor: Colors.danger + '20', width: 40, height: 40, borderRadius: 12 }]}>
                  <Ionicons name="warning" size={20} color={Colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.landingConflictCardTitle}>
                    {conflitos.length} {conflitos.length === 1 ? 'Conflito' : 'Conflitos'} Detectados
                  </Text>
                  <Text style={styles.landingConflictCardSub}>
                    {conflitos.filter(c => c.type === 'professor').length} de professor · {conflitos.filter(c => c.type === 'sala').length} de sala
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.danger} />
              </View>
              <View style={styles.landingConflictCardPreview}>
                {conflitos.slice(0, 2).map((c, i) => (
                  <View key={i} style={styles.landingConflictRow}>
                    <View style={[styles.landingConflictDot, { backgroundColor: c.type === 'professor' ? '#F59E0B' : '#818CF8' }]} />
                    <Text style={styles.landingConflictRowText} numberOfLines={1}>{c.descricao}</Text>
                  </View>
                ))}
                {conflitos.length > 2 && (
                  <Text style={styles.landingConflictMore}>+{conflitos.length - 2} mais — toque para ver todos</Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Modal: Confirmar Geração Automática ── */}
        <Modal visible={showConfirmGerar} transparent animationType="fade" onRequestClose={() => setShowConfirmGerar(false)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24 }}>
            <View style={{ backgroundColor: Colors.card, borderRadius: 18, padding: 24, width: '100%', maxWidth: 380, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="flash" size={22} color={Colors.accent} />
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Gerar Horário Automático</Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 19 }}>
                O sistema vai criar o horário para todas as turmas activas do ano {anoSelecionado?.ano}, respeitando a disponibilidade dos professores.
              </Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 }}>O que fazer com horários existentes?</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.success + '40' }}
                onPress={() => gerarHorarioAutomatico(false)}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>Adicionar</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Mantém os horários existentes e adiciona novos</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.danger + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.danger + '40' }}
                onPress={() => gerarHorarioAutomatico(true)}
              >
                <Ionicons name="refresh-circle-outline" size={20} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>Substituir</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Apaga todos os horários do ano e cria de novo</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowConfirmGerar(false)} style={{ alignSelf: 'flex-end', marginTop: 2 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Modal: Resultado da Geração ── */}
        <Modal visible={!!geracaoResultado} transparent animationType="fade" onRequestClose={() => setGeracaoResultado(null)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 20 }}>
            <View style={{ backgroundColor: Colors.card, borderRadius: 18, padding: 20, width: '100%', maxWidth: 400, maxHeight: '85%', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="flash" size={20} color={Colors.accent} />
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 }}>Resultado da Geração</Text>
                <TouchableOpacity onPress={() => setGeracaoResultado(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: Colors.success + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.success + '30' }}>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.success }}>{geracaoResultado?.totalInseridos ?? 0}</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' }}>Aulas criadas</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: Colors.danger + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.danger + '30' }}>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{geracaoResultado?.totalFalhados ?? 0}</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' }}>Falhadas</Text>
                </View>
              </View>
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {(geracaoResultado?.falhados ?? []).length > 0 && (
                  <View style={{ gap: 6, marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, marginBottom: 2 }}>Falhas:</Text>
                    {geracaoResultado!.falhados.map((f, i) => (
                      <View key={i} style={{ backgroundColor: Colors.danger + '10', borderRadius: 8, padding: 8, gap: 2 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{f.turmaNome} — {f.disciplina}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{f.motivo}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {(geracaoResultado?.inseridos ?? []).length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, marginBottom: 2 }}>Criadas:</Text>
                    {geracaoResultado!.inseridos.map((f, i) => (
                      <View key={i} style={{ backgroundColor: Colors.success + '10', borderRadius: 8, padding: 8, gap: 2 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{f.turmaNome} — {f.disciplina}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{f.professorNome} · {f.slot}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
              <TouchableOpacity
                style={{ backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                onPress={() => { setGeracaoResultado(null); loadHorarios(); }}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Fechar e Actualizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── Modal: Disponibilidade dos Professores (Compacto & Centrado) ── */}
        <Modal visible={showDispModal} transparent animationType="fade" onRequestClose={() => setShowDispModal(false)}>
          <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 12 }} onPress={() => setShowDispModal(false)}>
            <Pressable style={{ backgroundColor: Colors.card, borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '88%', overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }} onPress={(e) => e.stopPropagation()}>
              {/* Cabeçalho */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8B5CF622', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="people-outline" size={18} color="#8B5CF6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Disponibilidade dos Professores</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                    {filteredProfDisp.length} professor{filteredProfDisp.length !== 1 ? 'es' : ''} · Clique nos dias para activar/desactivar
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowDispModal(false)} style={{ padding: 6, borderRadius: 8, backgroundColor: Colors.background }}>
                  <Ionicons name="close" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Filtro por turma */}
              {turmas.filter(t => t.ativo).length > 0 && (
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {(['todos', ...turmas.filter(t => t.ativo).map(t => t.id)] as string[]).map(tid => {
                      const isAll = tid === 'todos';
                      const turma = isAll ? null : turmas.find(t => t.id === tid);
                      const label = isAll ? 'Todos' : (turma?.nome ?? tid);
                      const active = turmaDispFilter === tid;
                      return (
                        <TouchableOpacity
                          key={tid}
                          onPress={() => setTurmaDispFilter(tid)}
                          style={{ paddingHorizontal: 13, paddingVertical: 5, borderRadius: 20, backgroundColor: active ? '#8B5CF6' : Colors.background, borderWidth: 1, borderColor: active ? '#8B5CF6' : Colors.border }}
                        >
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? '#fff' : Colors.textMuted }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Lista compacta de professores */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {filteredProfDisp.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                    <Ionicons name="person-outline" size={36} color={Colors.textMuted} />
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>
                      {turmaDispFilter === 'todos' ? 'Sem professores activos' : 'Sem professores atribuídos a esta turma'}
                    </Text>
                  </View>
                )}
                {filteredProfDisp.map((prof, idx) => {
                  const diasLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
                  const turnos = ['Manhã', 'Tarde', 'Noite', 'Ambos'];
                  const customized = !arraysEqual(prof.diasDisponiveis, [1,2,3,4,5]) || prof.turno !== 'Ambos';
                  return (
                    <View key={prof.id} style={{ paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border + '80', gap: 8 }}>
                      {/* Linha 1: Avatar + Nome + Guardar */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: customized ? '#8B5CF622' : Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: customized ? '#8B5CF640' : Colors.border }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: customized ? '#8B5CF6' : Colors.textMuted }}>
                            {prof.nome.charAt(0)}{prof.apelido.charAt(0)}
                          </Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>
                          {prof.nome} {prof.apelido}
                        </Text>
                        {customized && (
                          <View style={{ backgroundColor: '#8B5CF618', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: '#8B5CF6' }}>✓ Config.</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => guardarDisponibilidade(prof.id, prof.diasDisponiveis, prof.turno)}
                          disabled={salvandoDisp === prof.id}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: '#8B5CF6', borderRadius: 8, opacity: salvandoDisp === prof.id ? 0.6 : 1 }}
                        >
                          {salvandoDisp === prof.id
                            ? <ActivityIndicator size={11} color="#fff" />
                            : <Ionicons name="save-outline" size={11} color="#fff" />}
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Guardar</Text>
                        </TouchableOpacity>
                      </View>
                      {/* Linha 2: Dias + Turno */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {diasLabels.map((d, i) => {
                          const dNum = i + 1;
                          const active = prof.diasDisponiveis.includes(dNum);
                          return (
                            <TouchableOpacity
                              key={d}
                              onPress={() => toggleDiasDisp(prof.id, dNum)}
                              style={{ width: 36, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, backgroundColor: active ? '#8B5CF6' : Colors.background, borderColor: active ? '#8B5CF6' : Colors.border }}
                            >
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: active ? '#fff' : Colors.textMuted }}>{d}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <View style={{ flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {turnos.map(t => {
                            const active = prof.turno === t;
                            return (
                              <TouchableOpacity
                                key={t}
                                onPress={() => setTurnoDisp(prof.id, t)}
                                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: active ? '#8B5CF622' : 'transparent', borderColor: active ? '#8B5CF6' : Colors.border }}
                              >
                                <Text style={{ fontSize: 10, fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular', color: active ? '#8B5CF6' : Colors.textMuted }}>{t}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* Linha 3: Preview semanal de disponibilidade */}
                      {(() => {
                        const blocos = [
                          { label: 'Manhã', turnos: ['Manhã', 'Ambos'], cor: '#22C55E' },
                          { label: 'Tarde', turnos: ['Tarde', 'Ambos'], cor: '#F59E0B' },
                          { label: 'Noite', turnos: ['Noite', 'Ambos'], cor: '#6366F1' },
                        ];
                        const turnoActivo = (blocoTurnos: string[]) => blocoTurnos.includes(prof.turno);
                        return (
                          <View style={{ gap: 3, marginTop: 2 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 }}>
                              Preview de disponibilidade
                            </Text>
                            {/* Cabeçalho dos dias */}
                            <View style={{ flexDirection: 'row', gap: 3 }}>
                              <View style={{ width: 38 }} />
                              {diasLabels.map((d, i) => (
                                <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: prof.diasDisponiveis.includes(i + 1) ? Colors.text : Colors.textMuted }}>
                                    {d}
                                  </Text>
                                </View>
                              ))}
                            </View>
                            {/* Linhas por bloco horário */}
                            {blocos.map(bloco => {
                              const blocoDisp = turnoActivo(bloco.turnos);
                              return (
                                <View key={bloco.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                  <View style={{ width: 38 }}>
                                    <Text style={{ fontSize: 8, fontFamily: 'Inter_500Medium', color: blocoDisp ? bloco.cor : Colors.textMuted, textAlign: 'right', paddingRight: 4 }}>
                                      {bloco.label}
                                    </Text>
                                  </View>
                                  {diasLabels.map((d, i) => {
                                    const diaDisp = prof.diasDisponiveis.includes(i + 1);
                                    const disponivel = diaDisp && blocoDisp;
                                    return (
                                      <View
                                        key={d}
                                        style={{
                                          flex: 1,
                                          height: 14,
                                          borderRadius: 3,
                                          backgroundColor: disponivel ? bloco.cor + '33' : Colors.border + '60',
                                          borderWidth: 1,
                                          borderColor: disponivel ? bloco.cor + '66' : 'transparent',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {disponivel && (
                                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: bloco.cor }} />
                                        )}
                                      </View>
                                    );
                                  })}
                                </View>
                              );
                            })}
                            {/* Legenda rápida */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#22C55E33', borderWidth: 1, borderColor: '#22C55E66' }} />
                                <Text style={{ fontSize: 8, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Disponível</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: Colors.border + '60' }} />
                                <Text style={{ fontSize: 8, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Indisponível</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  );
                })}
                <View style={{ height: 8 }} />
              </ScrollView>

              {/* Rodapé — Guardar Todos */}
              {filteredProfDisp.length > 0 && (
                <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 11 }}
                    onPress={async () => {
                      for (const p of filteredProfDisp) {
                        await guardarDisponibilidade(p.id, p.diasDisponiveis, p.turno);
                      }
                    }}
                  >
                    <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                      Guardar Todos ({filteredProfDisp.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modal: seleccionar turma para criar horário */}
        <Modal visible={showCriarTurmaModal} transparent animationType="fade" onRequestClose={() => setShowCriarTurmaModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.turmaDropdownOverlay} activeOpacity={1} onPress={() => setShowCriarTurmaModal(false)}>
              <View style={[styles.turmaDropdownModal, { width: 320, maxHeight: 500 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 }}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.gold} />
                  <Text style={[styles.turmaDropdownTitle, { flex: 1, padding: 0, border: 0 }]}>Criar Horário — Qual turma?</Text>
                  <TouchableOpacity onPress={() => setShowCriarTurmaModal(false)}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {turmas.filter(t => t.ativo).length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 10 }}>
                      <Ionicons name="school-outline" size={36} color={Colors.textMuted} />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center' }}>Sem turmas activas</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
                        Não existem turmas activas registadas. Crie turmas primeiro em Gestão → Turmas.
                      </Text>
                    </View>
                  )}
                  {turmas.filter(t => t.ativo).map((t) => {
                    const aulasDaTurma = horarios.filter(h => h.turmaId === t.id).length;
                    const idxTurma = turmasAtivas.findIndex(x => x.id === t.id);
                    return (
                      <View
                        key={t.id}
                        style={[styles.turmaDropdownItem, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={styles.turmaDropdownItemText}>{t.nome}</Text>
                          {aulasDaTurma > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Ionicons name="checkmark-circle" size={10} color={Colors.gold} />
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>{aulasDaTurma} aulas</Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: Colors.textMuted + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Sem horário</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                          {t.nivel} · {t.turno} · {t.sala}
                        </Text>
                        {aulasDaTurma > 0 ? (
                          <View style={{ flexDirection: 'row', gap: 6, width: '100%' }}>
                            <TouchableOpacity
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.info + '18', borderRadius: 8, paddingVertical: 6, borderWidth: 1, borderColor: Colors.info + '40' }}
                              onPress={() => {
                                setCriandoTurmaId(t.id);
                                setTurmaIdx(idxTurma >= 0 ? idxTurma : 0);
                                setShowCriarTurmaModal(false);
                                setScreenMode('visualizar');
                              }}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="eye-outline" size={12} color={Colors.info} />
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>Ver Horário</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.gold + '18', borderRadius: 8, paddingVertical: 6, borderWidth: 1, borderColor: Colors.gold + '40' }}
                              onPress={() => {
                                setCriandoTurmaId(t.id);
                                setTurmaIdx(idxTurma);
                                setShowCriarTurmaModal(false);
                                setScreenMode('criar');
                              }}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="create-outline" size={12} color={Colors.gold} />
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>Modificar</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.accent + '18', borderRadius: 8, paddingVertical: 6, borderWidth: 1, borderColor: Colors.accent + '40' }}
                            onPress={() => {
                              setCriandoTurmaId(t.id);
                              setTurmaIdx(idxTurma);
                              setShowCriarTurmaModal(false);
                              setScreenMode('criar');
                            }}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="add-circle-outline" size={12} color={Colors.accent} />
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.accent }}>Criar Horário</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  const topBarSubtitle = isProf
    ? (profView === 'meu' ? 'Meu Horário' : (turmaAtual ? `${turmaAtual.nome} — ${turmaAtual.turno}` : ''))
    : isAluno
      ? (turmaAtual ? `${turmaAtual.nome} — ${turmaAtual.turno}` : '')
      : screenMode === 'criar'
        ? `A criar: ${turmaAtual?.nome ?? '—'}`
        : screenMode === 'visualizar'
          ? (turmaAtual ? `${turmaAtual.nome} — ${turmaAtual.turno}` : 'Selecione uma turma')
          : 'O que deseja fazer?';

  return (
    <View style={styles.container}>
      <TopBar
        title="Horário"
        subtitle={topBarSubtitle}
        leftAction={isAdmin && screenMode !== 'landing' ? { icon: 'arrow-back', onPress: () => { setCriandoTurmaId(null); setScreenMode('landing'); } } : undefined}
        rightAction={isAdmin && screenMode !== 'landing' ? { icon: 'settings-outline', onPress: () => { setEditPeriodos(periodos); setShowPeriodosModal(true); } } : undefined}
      />

      {/* Professor: always in "Meu Horário" mode — locked view */}
      {isProf && (
        <View style={styles.profViewToggle}>
          <View style={[styles.profViewBtn, styles.profViewBtnActive]}>
            <Ionicons name="person-circle-outline" size={14} color={Colors.gold} />
            <Text style={[styles.profViewBtnText, styles.profViewBtnTextActive]}>Meu Horário</Text>
          </View>
        </View>
      )}

      {/* Admin: criar mode banner — shows selected turma, no dropdown */}
      {isAdmin && screenMode === 'criar' && turmaAtual && (
        <View style={styles.criarBanner}>
          <View style={styles.criarBannerLeft}>
            <Ionicons name="create-outline" size={15} color={Colors.gold} />
            <Text style={styles.criarBannerText}>A editar horário de:</Text>
            <View style={styles.criarBannerBadge}>
              <Text style={styles.criarBannerBadgeText}>{turmaAtual.nome}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.criarBannerChange}
            onPress={() => setShowCriarTurmaModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.criarBannerChangeText}>Mudar turma</Text>
            <Ionicons name="swap-horizontal" size={13} color={Colors.info} />
          </TouchableOpacity>
        </View>
      )}

      {/* Admin/Student: turma dropdown — only in visualizar mode */}
      {!isProf && (screenMode === 'visualizar' || isAluno) && turmasAtivas.length > 1 && (
        <>
          <TouchableOpacity style={styles.turmaDropdownBtn} onPress={() => setShowTurmaDropdown(true)} activeOpacity={0.8}>
            <Ionicons name="school-outline" size={15} color={Colors.gold} />
            <Text style={styles.turmaDropdownBtnText}>{turmaAtual?.nome ?? '—'}</Text>
            <Ionicons name="chevron-down" size={15} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Modal visible={showTurmaDropdown} transparent animationType="fade" onRequestClose={() => setShowTurmaDropdown(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.turmaDropdownOverlay} activeOpacity={1} onPress={() => setShowTurmaDropdown(false)}>
              <View style={styles.turmaDropdownModal}>
                <Text style={styles.turmaDropdownTitle}>Seleccionar Turma</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {turmasAtivas.map((t, i) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.turmaDropdownItem, t.id === turmaAtual?.id && styles.turmaDropdownItemActive]}
                      onPress={() => { setCriandoTurmaId(t.id); setTurmaIdx(i); setShowTurmaDropdown(false); }}
                    >
                      <Text style={[styles.turmaDropdownItemText, t.id === turmaAtual?.id && styles.turmaDropdownItemTextActive]}>{t.nome}</Text>
                      {t.id === turmaAtual?.id && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
                      </KeyboardAvoidingView>
</Modal>
        </>
      )}

      {/* Modal: mudar turma no modo criar */}
      {isAdmin && screenMode === 'criar' && (
        <Modal visible={showCriarTurmaModal} transparent animationType="fade" onRequestClose={() => setShowCriarTurmaModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.turmaDropdownOverlay} activeOpacity={1} onPress={() => setShowCriarTurmaModal(false)}>
              <View style={[styles.turmaDropdownModal, { width: 320, maxHeight: 500 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 }}>
                  <Ionicons name="swap-horizontal" size={16} color={Colors.info} />
                  <Text style={[styles.turmaDropdownTitle, { flex: 1, padding: 0 }]}>Mudar de turma</Text>
                  <TouchableOpacity onPress={() => setShowCriarTurmaModal(false)}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {turmasAtivas.map((t) => {
                    const aulasDaTurma = horarios.filter(h => h.turmaId === t.id).length;
                    const isSelected = t.id === criandoTurmaId;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.turmaDropdownItem, isSelected && styles.turmaDropdownItemActive, { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}
                        onPress={() => {
                          setCriandoTurmaId(t.id);
                          setTurmaIdx(turmasAtivas.findIndex(x => x.id === t.id));
                          setShowCriarTurmaModal(false);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={[styles.turmaDropdownItemText, isSelected && styles.turmaDropdownItemTextActive]}>{t.nome}</Text>
                          {isSelected && <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />}
                          {!isSelected && aulasDaTurma > 0 && (
                            <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>{aulasDaTurma} aulas</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                          {t.nivel} · {t.turno} · {t.sala}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Professor: per-turma dropdown (only in "Por Turma" mode) */}
      {isProf && profView === 'turma' && turmasAtivas.length > 1 && (
        <>
          <TouchableOpacity style={styles.turmaDropdownBtn} onPress={() => setShowTurmaDropdown(true)} activeOpacity={0.8}>
            <Ionicons name="school-outline" size={15} color={Colors.gold} />
            <Text style={styles.turmaDropdownBtnText}>{turmasAtivas[turmaIdx]?.nome ?? '—'}</Text>
            <Ionicons name="chevron-down" size={15} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Modal visible={showTurmaDropdown} transparent animationType="fade" onRequestClose={() => setShowTurmaDropdown(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity style={styles.turmaDropdownOverlay} activeOpacity={1} onPress={() => setShowTurmaDropdown(false)}>
              <View style={styles.turmaDropdownModal}>
                <Text style={styles.turmaDropdownTitle}>Seleccionar Turma</Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {turmasAtivas.map((t, i) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.turmaDropdownItem, turmaIdx === i && styles.turmaDropdownItemActive]}
                      onPress={() => { setTurmaIdx(i); setShowTurmaDropdown(false); }}
                    >
                      <Text style={[styles.turmaDropdownItemText, turmaIdx === i && styles.turmaDropdownItemTextActive]}>{t.nome}</Text>
                      {turmaIdx === i && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
                      </KeyboardAvoidingView>
</Modal>
        </>
      )}

      {/* Info bar for current turma */}
      {turmaAtual && (!isProf || profView === 'turma') && (
        <View style={styles.infoBar}>
          <View style={styles.infoBadge}>
            <MaterialIcons name="class" size={13} color={Colors.gold} />
            <Text style={styles.infoText}>{turmaAtual.nivel}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Ionicons name="time" size={13} color={Colors.info} />
            <Text style={styles.infoText}>{turmaAtual.turno}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Ionicons name="location" size={13} color={Colors.textMuted} />
            <Text style={styles.infoText}>{turmaAtual.sala}</Text>
          </View>
        </View>
      )}

      {/* Professor: "Meu Horário" info bar */}
      {isProf && profView === 'meu' && profData && (
        <View style={[styles.infoBar, { flexWrap: 'wrap', gap: 6 }]}>
          <View style={{ flexDirection: 'row', flex: 1, gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <View style={styles.infoBadge}>
              <Ionicons name="person" size={13} color={Colors.gold} />
              <Text style={styles.infoText}>{profData.nome} {profData.apelido}</Text>
            </View>
            <View style={styles.infoBadge}>
              <Ionicons name="book" size={13} color={Colors.info} />
              <Text style={styles.infoText}>{minhasAulas.length} aulas</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#8B5CF620', borderRadius: 8, borderWidth: 1, borderColor: '#8B5CF640' }}
              onPress={() => { carregarMinhaDisponibilidade(); setShowMyDispModal(true); }}
              activeOpacity={0.78}
            >
              <Ionicons name="calendar-outline" size={12} color="#8B5CF6" />
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#8B5CF6' }}>Disponibilidade</Text>
            </TouchableOpacity>
            {minhasAulas.length > 0 && (
              <TouchableOpacity
                style={[styles.pdfExportBtn, exportandoPdfProf && { opacity: 0.65 }]}
                onPress={exportarHorarioProfPDF}
                disabled={exportandoPdfProf}
                activeOpacity={0.78}
              >
                <Ionicons name={exportandoPdfProf ? 'hourglass-outline' : 'document-text-outline'} size={13} color="#fff" />
                <Text style={styles.pdfExportBtnText}>
                  {exportandoPdfProf ? 'A gerar...' : 'PDF'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <PdfProgressModal
        visible={pdfProgressTurma.visible}
        step={pdfProgressTurma.step}
        label="Horário de Turma"
        color={Colors.primary}
      />
      <PdfProgressModal
        visible={pdfProgressProf.visible}
        step={pdfProgressProf.step}
        label="Horário do Professor"
        color="#8B5CF6"
      />

      {/* Modal: Professor define a sua própria disponibilidade */}
      <Modal visible={showMyDispModal} transparent animationType="fade" onRequestClose={() => setShowMyDispModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 }}>
          <View style={{ backgroundColor: Colors.card, borderRadius: 20, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8B5CF622', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar-outline" size={18} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Minha Disponibilidade</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Defina os dias e turno em que pode leccionar</Text>
              </View>
              <TouchableOpacity onPress={() => setShowMyDispModal(false)} style={{ padding: 6, borderRadius: 8, backgroundColor: Colors.background }}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 18, gap: 16 }}>
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Dias Disponíveis</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((d, i) => {
                    const dNum = i + 1;
                    const active = myDisp.diasDisponiveis.includes(dNum);
                    return (
                      <TouchableOpacity
                        key={d}
                        onPress={() => setMyDisp(prev => ({
                          ...prev,
                          diasDisponiveis: active
                            ? prev.diasDisponiveis.filter(x => x !== dNum)
                            : [...prev.diasDisponiveis, dNum].sort(),
                        }))}
                        style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5, backgroundColor: active ? '#8B5CF6' : Colors.background, borderColor: active ? '#8B5CF6' : Colors.border }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: active ? '#fff' : Colors.textMuted }}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Turno Preferencial</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['Manhã', 'Tarde', 'Noite', 'Ambos'].map(t => {
                    const active = myDisp.turno === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setMyDisp(prev => ({ ...prev, turno: t }))}
                        style={{ flex: 1, minWidth: 80, paddingVertical: 9, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, backgroundColor: active ? '#8B5CF6' : Colors.background, borderColor: active ? '#8B5CF6' : Colors.border }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular', color: active ? '#fff' : Colors.textMuted }}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: salvandoMyDisp ? 0.7 : 1 }}
                onPress={guardarMinhaDisponibilidade}
                disabled={salvandoMyDisp}
              >
                {salvandoMyDisp
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="save-outline" size={16} color="#fff" />}
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                  {salvandoMyDisp ? 'A guardar...' : 'Guardar Disponibilidade'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Banner de conflitos — visível em criar e visualizar */}
      {isAdmin && screenMode !== 'landing' && conflitos.length > 0 && (
        <View style={styles.conflictBanner}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }} onPress={() => setShowConflictPanel(v => !v)} activeOpacity={0.85}>
            <Ionicons name="warning" size={14} color={Colors.danger} />
            <Text style={styles.conflictBannerText}>
              {conflitos.length} {conflitos.length === 1 ? 'conflito detectado' : 'conflitos detectados'} no horário global
            </Text>
            <Ionicons name={showConflictPanel ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.autoResolveBtn, autoResolvendo && { opacity: 0.6 }]}
            onPress={autoResolverConflitos}
            disabled={autoResolvendo}
            activeOpacity={0.78}
          >
            {autoResolvendo
              ? <ActivityIndicator size={11} color="#fff" />
              : <Ionicons name="flash" size={11} color="#fff" />
            }
            <Text style={styles.autoResolveBtnText}>
              {autoResolvendo ? 'A resolver...' : 'Resolver Automaticamente'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {isAdmin && screenMode !== 'landing' && conflitos.length > 0 && showConflictPanel && (
        <View style={styles.conflictPanel}>
          {conflitos.map((c, i) => (
            <View key={i} style={styles.conflictItem}>
              <View style={[styles.conflictTag, c.type === 'professor' ? styles.conflictTagProf : styles.conflictTagSala]}>
                <Ionicons
                  name={c.type === 'professor' ? 'person-outline' : 'location-outline'}
                  size={10}
                  color={c.type === 'professor' ? '#F59E0B' : '#818CF8'}
                />
                <Text style={[styles.conflictTagText, c.type === 'professor' ? { color: '#F59E0B' } : { color: '#818CF8' }]}>
                  {c.type === 'professor' ? 'Prof.' : 'Sala'}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.conflictSlot}>
                  {DIAS_FULL[c.dia - 1]} · {periodos[c.periodo - 1]?.inicio ?? `Período ${c.periodo}`}
                </Text>
                <Text style={styles.conflictDesc}>{c.descricao}</Text>
              </View>
              <TouchableOpacity
                style={styles.conflictResolveBtn}
                onPress={() => {
                  const aulaConflito = horarios.find(h => h.id === c.aulaIds[0]);
                  if (aulaConflito) {
                    const idx = turmasAtivas.findIndex(t => t.id === aulaConflito.turmaId);
                    setCriandoTurmaId(aulaConflito.turmaId);
                    if (idx >= 0) setTurmaIdx(idx);
                    setScreenMode('criar');
                    setShowConflictPanel(false);
                  }
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="create-outline" size={11} color={Colors.danger} />
                <Text style={styles.conflictResolveBtnText}>Manual</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {isAdmin && screenMode !== 'landing' && conflitos.length === 0 && horarios.length > 0 && (
        <View style={styles.conflictOk}>
          <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
          <Text style={styles.conflictOkText}>Sem conflitos detectados</Text>
        </View>
      )}

      {/* Botões de acção — visíveis em visualizar/criar quando há turma seleccionada */}
      {screenMode !== 'landing' && turmaAtual && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 4 }}>
          {horariosTurma.length > 0 && (
            <TouchableOpacity
              style={[styles.pdfExportBtn, exportandoPdf && { opacity: 0.65 }, { flex: 1 }]}
              onPress={exportarHorarioPDF}
              disabled={exportandoPdf}
              activeOpacity={0.78}
            >
              <Ionicons name={exportandoPdf ? 'hourglass-outline' : 'document-text-outline'} size={14} color="#fff" />
              <Text style={styles.pdfExportBtnText}>
                {exportandoPdf ? 'A gerar...' : 'Exportar PDF'}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && horariosTurma.length > 0 && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF444415', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#EF444440' }}
              onPress={() => setShowLimparModal(true)}
              activeOpacity={0.78}
            >
              <Ionicons name="trash-outline" size={14} color="#EF4444" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#EF4444' }}>Limpar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        style={styles.gridContainer}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
      >
          <View>
            {/* ── Day Headers ── */}
            <View style={styles.gridHeader}>
              <View style={styles.periodoLabel} />
              {DIAS.map((diaNome, diaIdx) => {
                const diaNum = diaIdx + 1;
                // Professor "Meu Horário": só mostra colunas onde ele tem aulas
                if (isProf && profView === 'meu' && diasComAulasProf.size > 0 && !diasComAulasProf.has(diaNum)) return null;
                // Aluno: mostra TODOS os 5 dias (incluindo os sem aulas = Borla)
                return (
                  <View key={diaNome} style={[styles.diaHeader, { width: CELL_W }]}>
                    <View style={styles.diaHeaderPill}>
                      <Text style={styles.diaHeaderText}>{diaNome}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {periodos.map((periodo) => {
              // Professor "Meu Horário": oculta linhas (períodos) sem qualquer aula sua
              if (isProf && profView === 'meu' && periodosComAulasProf.size > 0 && !periodosComAulasProf.has(periodo.numero)) return null;

              return (
              <View key={periodo.numero} style={styles.gridRow}>
                {/* ── Period Label ── */}
                <View style={styles.periodoLabel}>
                  <View style={styles.periodoNumBox}>
                    <Text style={styles.periodoNum}>{periodo.numero}</Text>
                  </View>
                  <Text style={styles.periodoTime}>{periodo.inicio}</Text>
                </View>

                {DIAS.map((_, diaIdx) => {
                  const dia = diaIdx + 1;

                  // Ocultar coluna se professor não tiver aulas neste dia (modo "Meu Horário")
                  if (isProf && profView === 'meu' && diasComAulasProf.size > 0 && !diasComAulasProf.has(dia)) return null;
                  // Aluno: mostra todos os dias (sem filtro)

                  // PROFESSOR "MEU HORÁRIO" MODE
                  if (isProf && profView === 'meu') {
                    const minhasAulasCelula = getMinhaAula(dia, periodo.numero);
                    if (minhasAulasCelula.length > 0) {
                      return (
                        <View key={dia} style={[styles.cell, { width: CELL_W }]}>
                          {minhasAulasCelula.map((aula, ai) => {
                            const t = turmas.find(x => x.id === aula.turmaId);
                            const cor = getDisciplinaColor(aula.disciplina);
                            return (
                              <TouchableOpacity
                                key={ai}
                                style={[styles.cellFilledInner, { borderLeftColor: cor, backgroundColor: cor + '28' }]}
                                onPress={() => openProfCell(aula)}
                                activeOpacity={0.75}
                              >
                                <View style={styles.turmaBadge}>
                                  <Text style={[styles.turmaBadgeText, { color: cor }]}>{t?.nome ?? '—'}</Text>
                                </View>
                                <Text style={[styles.cellDisciplina, { color: cor }]} numberOfLines={2}>{aula.disciplina}</Text>
                                <Text style={styles.cellSala} numberOfLines={1}>{aula.sala}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    }
                    // Professor: célula vazia neste dia/período (mas o período tem aulas noutro dia)
                    return <View key={dia} style={[styles.cell, styles.cellEmpty, { width: CELL_W }]} />;
                  }

                  // NORMAL VIEW
                  const aula = getAula(dia, periodo.numero);
                  const isMyClass = isProf && aula && aula.professorId === profData?.id;
                  const canEdit = isAdmin && screenMode === 'criar';
                  const isReadOnly = isAluno || (isAdmin && screenMode === 'visualizar');
                  const isConflito = isAdmin && aula != null && conflictAulaIds.has(aula.id);

                  if (aula) {
                    const cor = getDisciplinaColor(aula.disciplina);
                    return (
                      <View key={dia} style={[styles.cell, { width: CELL_W }]}>
                        <TouchableOpacity
                          style={[
                            styles.cellFilledInner,
                            { borderLeftColor: cor, backgroundColor: cor + '28' },
                            isConflito && styles.cellConflito,
                          ]}
                          onLongPress={() => canEdit && openOptions(aula)}
                          onPress={() => isProf ? openProfCell(aula) : (isReadOnly ? undefined : openOptions(aula))}
                          activeOpacity={isReadOnly ? 1 : 0.72}
                        >
                          <View style={[styles.cellColorDot, { backgroundColor: cor }]} />
                          {isConflito && (
                            <View style={styles.conflitoCellBadge}>
                              <Ionicons name="warning" size={9} color={Colors.danger} />
                            </View>
                          )}
                          <Text style={[styles.cellDisciplina, { color: cor }]} numberOfLines={2}>{aula.disciplina}</Text>
                          <Text style={styles.cellProf} numberOfLines={1}>{aula.professorNome !== '—' ? aula.professorNome : ''}</Text>
                          {aula.sala ? <Text style={styles.cellSala} numberOfLines={1}>{aula.sala}</Text> : null}
                          {isMyClass && (
                            <View style={styles.sumarioBadge}>
                              <Ionicons name="add-circle" size={12} color={cor} />
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  // Célula vazia — aluno vê "Borla", admin pode adicionar, outros vêem vazio
                  if (isAluno) {
                    return (
                      <View key={dia} style={[styles.cell, styles.cellBorla, { width: CELL_W }]}>
                        <Text style={styles.cellBorlaText}>Borla</Text>
                      </View>
                    );
                  }

                  return (isProf || isReadOnly) ? (
                    <View key={dia} style={[styles.cell, styles.cellEmpty, { width: CELL_W }]} />
                  ) : (
                    <TouchableOpacity
                      key={dia}
                      style={[styles.cell, styles.cellEmpty, { width: CELL_W }]}
                      onPress={() => openAdd(dia, periodo.numero)}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="add-outline" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              );
            })}
          </View>

        {/* Resumo de Borlas por dia — só para aluno */}
        {isAluno && periodos.length > 0 && (
          <View style={styles.borlaResumoContainer}>
            <View style={styles.borlaResumoHeader}>
              <Ionicons name="sunny-outline" size={14} color={Colors.gold} />
              <Text style={styles.borlaResumoTitle}>Dias livres (Borla)</Text>
            </View>
            <View style={styles.borlaResumoRow}>
              {DIAS.map((diaNome, diaIdx) => {
                const dia = diaIdx + 1;
                const aulasNoDia = horariosTurma.filter(h => h.diaSemana === dia);
                const periodosComAula = new Set(aulasNoDia.map(h => h.periodo));
                const borlas = periodos.filter(p => !periodosComAula.has(p.numero)).length;
                const total = periodos.length;
                const pct = total > 0 ? borlas / total : 0;
                // cor conforme a proporção de borlas
                const barColor = pct >= 0.6 ? Colors.success : pct >= 0.3 ? Colors.gold : Colors.info;
                return (
                  <View key={dia} style={styles.borlaDiaCard}>
                    <Text style={styles.borlaDiaNome}>{diaNome}</Text>
                    <View style={styles.borlaBarBg}>
                      <View style={[styles.borlaBarFill, { height: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
                    </View>
                    <Text style={[styles.borlaCount, { color: borlas > 0 ? barColor : Colors.textMuted }]}>
                      {borlas > 0 ? `${borlas}` : '—'}
                    </Text>
                    <Text style={styles.borlaSub}>{borlas > 0 ? 'borla' + (borlas > 1 ? 's' : '') : 'cheio'}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.borlaResumoHint}>
              {(() => {
                const contagens = DIAS.map((_, i) => {
                  const dia = i + 1;
                  const periodosComAula = new Set(horariosTurma.filter(h => h.diaSemana === dia).map(h => h.periodo));
                  return { dia, borlas: periodos.filter(p => !periodosComAula.has(p.numero)).length, nome: DIAS_FULL[i] };
                });
                const melhor = contagens.reduce((a, b) => b.borlas > a.borlas ? b : a, contagens[0]);
                return melhor && melhor.borlas > 0
                  ? `${melhor.nome} é o teu dia com mais borlas (${melhor.borlas})`
                  : 'Todos os dias têm aulas em todos os períodos';
              })()}
            </Text>
          </View>
        )}

        {/* Legend: only in turma/student/admin view */}
        {(!isProf || profView === 'turma') && (
        <View style={styles.legendaContainer}>
          <Text style={styles.legendaTitle}>Legenda de Períodos</Text>
          {periodos.map(p => {
            const aulasNoPeriodo = horariosTurma.filter(h => h.periodo === p.numero);
            const seen = new Set<string>();
            const aulasUnicas = aulasNoPeriodo.filter(h => {
              const key = `${h.disciplina}-${h.professorId}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return (
              <View key={p.numero} style={styles.legendaRow}>
                <View style={styles.legendaPeriodoHeader}>
                  <Text style={styles.legendaNum}>{p.numero}º Período</Text>
                  <Text style={styles.legendaTime}>{p.inicio} — {p.fim}</Text>
                </View>
                {aulasUnicas.length > 0 ? (
                  aulasUnicas.map((aula, i) => {
                    const prof = professores.find(pr => pr.id === aula.professorId);
                    return (
                      <View key={i} style={styles.legendaAulaCard}>
                        <View style={styles.legendaAulaRow}>
                          <Ionicons name="book-outline" size={11} color={Colors.gold} />
                          <Text style={styles.legendaAulaDisciplina}>{aula.disciplina}</Text>
                        </View>
                        {prof && (
                          <>
                            <View style={styles.legendaAulaRow}>
                              <Ionicons name="person-outline" size={11} color={Colors.info} />
                              <Text style={styles.legendaAulaProf}>{prof.nome} {prof.apelido}</Text>
                            </View>
                            {prof.habilitacoes ? (
                              <View style={styles.legendaAulaRow}>
                                <Ionicons name="school-outline" size={11} color={Colors.textMuted} />
                                <Text style={styles.legendaAulaHab}>{prof.habilitacoes}</Text>
                              </View>
                            ) : null}
                          </>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.legendaVazio}>— Sem aulas registadas —</Text>
                )}
              </View>
            );
          })}
        </View>
        )}

        {/* Professor "Meu Horário" summary list */}
        {isProf && profView === 'meu' && (
          <View style={styles.legendaContainer}>
            <Text style={styles.legendaTitle}>Resumo das Minhas Aulas</Text>
            {minhasAulas.length === 0 ? (
              <Text style={styles.legendaVazio}>Ainda não tens aulas atribuídas no horário.</Text>
            ) : (
              DIAS_FULL.map((diaFull, diaIdx) => {
                const dia = diaIdx + 1;
                const aulasDia = minhasAulas.filter(h => h.diaSemana === dia);
                if (aulasDia.length === 0) return null;
                return (
                  <View key={dia} style={styles.legendaRow}>
                    <Text style={[styles.legendaNum, { marginBottom: 6 }]}>{diaFull}</Text>
                    {aulasDia.sort((a, b) => a.periodo - b.periodo).map((aula, i) => {
                      const t = turmas.find(x => x.id === aula.turmaId);
                      const per = periodos[aula.periodo - 1];
                      return (
                        <View key={i} style={styles.legendaAulaCard}>
                          <View style={styles.legendaAulaRow}>
                            <Ionicons name="book-outline" size={11} color={Colors.gold} />
                            <Text style={styles.legendaAulaDisciplina}>{aula.disciplina}</Text>
                            <View style={[styles.turmaBadge, { marginLeft: 4 }]}>
                              <Text style={styles.turmaBadgeText}>{t?.nome ?? '—'}</Text>
                            </View>
                          </View>
                          <View style={styles.legendaAulaRow}>
                            <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.legendaAulaHab}>{per?.inicio} — {per?.fim} · {aula.sala}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalMode !== null} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === 'add' ? 'Adicionar Aula' : 'Editar Aula'}
              </Text>
              {selectedCell && (
                <Text style={styles.modalSubtitle}>
                  {DIAS_FULL[selectedCell.dia - 1]} — {periodos[selectedCell.periodo - 1]?.inicio}
                </Text>
              )}
              <TouchableOpacity onPress={() => setModalMode(null)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Disciplina<RequiredMark /></Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => { setShowDisciplinaList(v => !v); setShowProfList(false); }}
              >
                <Text style={form.disciplina ? styles.selectorValue : styles.selectorPlaceholder}>
                  {form.disciplina || 'Selecionar disciplina...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showDisciplinaList && (
                <View style={styles.dropdownList}>
                  {disciplinas.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dropdownItem, form.disciplina === d && styles.dropdownItemActive]}
                      onPress={() => { setForm(f => ({ ...f, disciplina: d })); setShowDisciplinaList(false); }}
                    >
                      <Text style={[styles.dropdownText, form.disciplina === d && styles.dropdownTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Professor</Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => { setShowProfList(v => !v); setShowDisciplinaList(false); }}
              >
                <Text style={form.professorId ? styles.selectorValue : styles.selectorPlaceholder}>
                  {form.professorId ? (profOptions.find(p => p.id === form.professorId)?.nome + ' ' + profOptions.find(p => p.id === form.professorId)?.apelido) : 'Selecionar professor...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showProfList && (
                <View style={styles.dropdownList}>
                  {profOptions.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.dropdownItem, form.professorId === p.id && styles.dropdownItemActive]}
                      onPress={() => { setForm(f => ({ ...f, professorId: p.id })); setShowProfList(false); }}
                    >
                      <Text style={[styles.dropdownText, form.professorId === p.id && styles.dropdownTextActive]}>
                        {p.nome} {p.apelido}
                      </Text>
                      <Text style={styles.dropdownSub}>{toArray(p.disciplinas).join(', ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Sala</Text>
              <TextInput
                style={styles.input}
                placeholder={turmaAtual?.sala || 'Ex: Sala 01'}
                placeholderTextColor={Colors.textMuted}
                value={form.sala}
                onChangeText={v => setForm(f => ({ ...f, sala: v }))}
                returnKeyType="done"
                onSubmitEditing={salvar}
              />

              <TouchableOpacity
                style={[styles.saveBtn, !form.disciplina && styles.saveBtnDisabled]}
                onPress={salvar}
                disabled={!form.disciplina}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Configurar Períodos Modal */}
      <Modal visible={showPeriodosModal} transparent animationType="slide" onRequestClose={() => setShowPeriodosModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Configurar Períodos</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  Define os horários de início e fim de cada período lectivo
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPeriodosModal(false)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {editPeriodos.map((p, idx) => (
                <View key={p.numero} style={{ marginBottom: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold, marginBottom: 8 }}>
                    {p.numero}º Período
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Início</Text>
                      <TextInput
                        style={styles.input}
                        value={editPeriodos[idx].inicio}
                        onChangeText={v => setEditPeriodos(prev => prev.map((x, i) => i === idx ? { ...x, inicio: v } : x))}
                        placeholder="HH:MM"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        onSubmitEditing={salvarPeriodos}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Fim</Text>
                      <TextInput
                        style={styles.input}
                        value={editPeriodos[idx].fim}
                        onChangeText={v => setEditPeriodos(prev => prev.map((x, i) => i === idx ? { ...x, fim: v } : x))}
                        placeholder="HH:MM"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        onSubmitEditing={salvarPeriodos}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.saveBtn} onPress={salvarPeriodos}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Guardar Horários</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.surface, marginTop: 8 }]} onPress={resetPeriodos}>
                <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
                <Text style={[styles.saveBtnText, { color: Colors.textSecondary }]}>Repor Valores Predefinidos</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Professor Sumário Modal */}
      <Modal visible={showSumarioModal} transparent animationType="slide" onRequestClose={() => setShowSumarioModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Registar Sumário</Text>
                {sumarioAula && (
                  <Text style={styles.modalSubtitle}>
                    {sumarioAula.disciplina} · {DIAS_FULL[sumarioAula.diaSemana - 1]} {sumarioAula.horaInicio}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowSumarioModal(false)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Número da Aula</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 1, 2, 3..."
                placeholderTextColor={Colors.textMuted}
                value={sumarioNumero}
                onChangeText={setSumarioNumero}
                keyboardType="numeric"
              />
              <Text style={styles.fieldLabel}>Conteúdo da Aula</Text>
              <TextInput
                style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
                placeholder="Descreva o conteúdo lecionado nesta aula..."
                placeholderTextColor={Colors.textMuted}
                value={sumarioConteudo}
                onChangeText={setSumarioConteudo}
                multiline
              />
              <View style={{ backgroundColor: Colors.info + '11', borderRadius: 10, padding: 12, marginTop: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 }}>
                  O sumário ficará pendente até ser aceite pelo RH. As suas faltas são controladas conforme o estado do sumário.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, (!sumarioConteudo || !sumarioNumero) && styles.saveBtnDisabled]}
                onPress={submeterSumarioFromHorario}
                disabled={!sumarioConteudo || !sumarioNumero}
              >
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Submeter Sumário</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal de Resultado da Auto-Resolução ───────────────────────── */}
      <Modal visible={resolucaoResultado !== null} transparent animationType="fade" onRequestClose={() => setResolucaoResultado(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Resolução Automática</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  {resolucaoResultado?.totalResolvidos ?? 0} resolvido(s) · {resolucaoResultado?.totalFalhados ?? 0} não resolvido(s)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setResolucaoResultado(null)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 2 }}>
              {(resolucaoResultado?.resolved ?? []).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Conflitos Resolvidos
                    </Text>
                  </View>
                  {resolucaoResultado!.resolved.map((r, i) => (
                    <View key={i} style={styles.resolucaoItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={styles.resolucaoProfNome}>{r.professorNome}</Text>
                        <View style={styles.resolucaoDiscBadge}>
                          <Text style={styles.resolucaoDiscText}>{r.disciplina}</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: Colors.textMuted }}>— {r.turmaNome}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <View style={styles.resolucaoSlotBefore}>
                          <Text style={styles.resolucaoSlotText}>{r.de}</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={11} color={Colors.success} />
                        <View style={styles.resolucaoSlotAfter}>
                          <Text style={[styles.resolucaoSlotText, { color: Colors.success }]}>{r.para}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {(resolucaoResultado?.failed ?? []).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Não Foi Possível Resolver
                    </Text>
                  </View>
                  {resolucaoResultado!.failed.map((f, i) => (
                    <View key={i} style={[styles.resolucaoItem, { borderColor: `${Colors.danger}30`, backgroundColor: `${Colors.danger}06` }]}>
                      <Text style={styles.resolucaoProfNome}>{f.professorNome} — {f.disciplina} ({f.turmaNome})</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 3 }}>{f.motivo}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(resolucaoResultado?.totalResolvidos ?? 0) === 0 && (resolucaoResultado?.totalFalhados ?? 0) === 0 && (
                <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>Nenhum conflito detectado</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>O horário não tem conflitos de professor para resolver.</Text>
                </View>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
            <View style={styles.sgFooter}>
              <TouchableOpacity style={[styles.saveBtn, { marginTop: 0, marginBottom: 0 }]} onPress={() => setResolucaoResultado(null)}>
                <Text style={styles.saveBtnText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal de Confirmação — Gerar Horário Automático ───────────── */}
      <Modal visible={showConfirmGerar} transparent animationType="fade" onRequestClose={() => setShowConfirmGerar(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: 340 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="flash" size={22} color={Colors.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.modalTitle, { flex: 1 }]}>Gerar Horário Automaticamente</Text>
              <TouchableOpacity onPress={() => setShowConfirmGerar(false)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 20 }}>
                O sistema irá criar automaticamente o horário para todas as turmas activas, com base nas disciplinas configuradas e na disponibilidade dos professores.
              </Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, lineHeight: 18 }}>
                Escolha como pretende proceder:
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 20 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: Colors.cardBg, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 4 }}
                onPress={() => gerarHorarioAutomatico(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.accent, textAlign: 'center' }}>Adicionar ao existente</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>Mantém as aulas já criadas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: Colors.danger + '10', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger + '40', gap: 4 }}
                onPress={() => gerarHorarioAutomatico(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={20} color={Colors.danger} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger, textAlign: 'center' }}>Substituir tudo</Text>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>Apaga e recria o horário</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal de Confirmação — Limpar Horário da Turma ───────────── */}
      <Modal visible={showLimparModal} transparent animationType="fade" onRequestClose={() => setShowLimparModal(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24 }} onPress={() => setShowLimparModal(false)}>
          <Pressable style={{ backgroundColor: Colors.card, borderRadius: 18, width: '100%', maxWidth: 380, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Limpar Horário</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                  {turmaAtual?.nome} · {anoSelecionado?.ano || turmaAtual?.anoLetivo}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowLimparModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 20 }}>
                Esta acção vai eliminar <Text style={{ fontFamily: 'Inter_700Bold', color: '#EF4444' }}>todos os {horariosTurma.length} blocos</Text> do horário desta turma no ano académico <Text style={{ fontFamily: 'Inter_600SemiBold' }}>{anoSelecionado?.ano || turmaAtual?.anoLetivo}</Text>.
              </Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, lineHeight: 18, backgroundColor: '#EF444410', padding: 10, borderRadius: 8 }}>
                ⚠️ Os horários de outros anos académicos não serão afectados. Esta acção não pode ser desfeita.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: Colors.cardBg, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
                  onPress={() => setShowLimparModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: limpandoHorario ? 0.65 : 1 }}
                  onPress={limparHorarioTurma}
                  disabled={limpandoHorario}
                  activeOpacity={0.8}
                >
                  {limpandoHorario
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="trash" size={15} color="#fff" />}
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                    {limpandoHorario ? 'A limpar...' : 'Limpar Tudo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal de Resultado da Geração Automática ──────────────────── */}
      <Modal visible={geracaoResultado !== null} transparent animationType="fade" onRequestClose={() => setGeracaoResultado(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Geração Automática</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  {geracaoResultado?.totalInseridos ?? 0} aulas criadas · {geracaoResultado?.totalFalhados ?? 0} não atribuídas
                </Text>
              </View>
              <TouchableOpacity onPress={() => setGeracaoResultado(null)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 2 }}>
              {(geracaoResultado?.inseridos ?? []).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Aulas Criadas ({geracaoResultado!.totalInseridos})
                    </Text>
                  </View>
                  {geracaoResultado!.inseridos.slice(0, 30).map((r, i) => (
                    <View key={i} style={styles.resolucaoItem}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <View style={styles.resolucaoDiscBadge}>
                          <Text style={styles.resolucaoDiscText}>{r.disciplina}</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.text }}>{r.turmaNome}</Text>
                        <Text style={{ fontSize: 10, color: Colors.textMuted }}>— {r.professorNome}</Text>
                      </View>
                      {r.slot && (
                        <View style={[styles.resolucaoSlotAfter, { marginTop: 4 }]}>
                          <Text style={[styles.resolucaoSlotText, { color: Colors.success }]}>{r.slot}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                  {geracaoResultado!.inseridos.length > 30 && (
                    <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                      … e mais {geracaoResultado!.inseridos.length - 30} aulas criadas.
                    </Text>
                  )}
                </View>
              )}
              {(geracaoResultado?.falhados ?? []).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Não Atribuídas ({geracaoResultado!.totalFalhados})
                    </Text>
                  </View>
                  {geracaoResultado!.falhados.map((f, i) => (
                    <View key={i} style={[styles.resolucaoItem, { borderColor: `${Colors.danger}30`, backgroundColor: `${Colors.danger}06` }]}>
                      <Text style={styles.resolucaoProfNome}>{f.turmaNome}{f.disciplina ? ` — ${f.disciplina}` : ''}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 3 }}>{f.motivo}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(geracaoResultado?.totalInseridos ?? 0) === 0 && (geracaoResultado?.totalFalhados ?? 0) === 0 && (
                <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
                  <Ionicons name="information-circle" size={40} color={Colors.textMuted} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Nada gerado</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>Verifique se as turmas têm disciplinas configuradas em Grelha Curricular → Turma Disciplinas.</Text>
                </View>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
            <View style={styles.sgFooter}>
              <TouchableOpacity style={[styles.saveBtn, { marginTop: 0, marginBottom: 0 }]} onPress={() => { setGeracaoResultado(null); if ((geracaoResultado?.totalInseridos ?? 0) > 0) setScreenMode('visualizar'); }}>
                <Text style={styles.saveBtnText}>{(geracaoResultado?.totalInseridos ?? 0) > 0 ? 'Ver Horário' : 'Fechar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal de Sugestões de Conflito ────────────────────────────── */}
      <Modal visible={sugestoesData !== null} transparent animationType="fade" onRequestClose={() => setSugestoesData(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            {/* Cabeçalho */}
            <View style={styles.sgHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sgTitle}>Conflito de Professor</Text>
                <Text style={styles.sgSubtitle} numberOfLines={2}>
                  {sugestoesData?.professorNome} já está ocupado/a neste bloco.
                  {(sugestoesData as any)?._conflito
                    ? ` Tem "${(sugestoesData as any)._conflito.disciplinaConflito}" na turma ${(sugestoesData as any)._conflito.turmaNome}.`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSugestoesData(null)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Conteúdo: a carregar / sem slots / lista */}
            {loadingSugestoes ? (
              <View style={styles.sgLoading}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.sgLoadingText}>A procurar tempos livres...</Text>
              </View>
            ) : (sugestoesData?.sugestoes ?? []).length === 0 ? (
              <View style={styles.sgEmpty}>
                <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.sgEmptyText}>Sem tempos livres disponíveis para este professor na semana.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 14, paddingTop: 6 }}>
                {/* Destaque da melhor opção */}
                {sugestoesData!.sugestoes.filter(s => s.melhor).map(s => (
                  <TouchableOpacity key={`${s.diaSemana}-${s.periodo}`} style={styles.sgBest} onPress={() => aplicarSugestao(s)} activeOpacity={0.78}>
                    <View style={styles.sgBestBadge}>
                      <Ionicons name="star" size={9} color="#fff" />
                      <Text style={styles.sgBestBadgeText}>MELHOR OPÇÃO</Text>
                    </View>
                    <View style={styles.sgItemRow}>
                      <View style={styles.sgDayCircle}>
                        <Text style={styles.sgDayCircleText}>{s.diaNome.slice(0, 3).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sgDiaNome}>{s.diaNome}</Text>
                        <Text style={styles.sgHora}>{s.periodo}º Tempo · {s.horaInicio} — {s.horaFim}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Separador */}
                {sugestoesData!.sugestoes.length > 1 && (
                  <Text style={styles.sgSeparator}>Outros tempos disponíveis</Text>
                )}

                {/* Restantes slots agrupados por dia */}
                {sugestoesData!.sugestoes.filter(s => !s.melhor).map(s => (
                  <TouchableOpacity key={`${s.diaSemana}-${s.periodo}`} style={styles.sgItem} onPress={() => aplicarSugestao(s)} activeOpacity={0.75}>
                    <View style={[styles.sgDayCircle, styles.sgDayCircleSmall]}>
                      <Text style={[styles.sgDayCircleText, { fontSize: 8 }]}>{s.diaNome.slice(0, 3).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sgItemDia}>{s.diaNome}</Text>
                      <Text style={styles.sgItemHora}>{s.periodo}º Tempo · {s.horaInicio} — {s.horaFim}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
                <View style={{ height: 16 }} />
              </ScrollView>
            )}

            {/* Rodapé */}
            <View style={styles.sgFooter}>
              <TouchableOpacity style={styles.sgCancelBtn} onPress={() => setSugestoesData(null)}>
                <Text style={styles.sgCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  turmaDropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  turmaDropdownBtnText: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  turmaDropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  turmaDropdownModal: { backgroundColor: Colors.backgroundCard, borderRadius: 14, width: 280, maxHeight: 420, overflow: 'hidden', paddingBottom: 8 },
  turmaDropdownTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, textTransform: 'uppercase', letterSpacing: 0.5 },
  turmaDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  turmaDropdownItemActive: { backgroundColor: Colors.surface },
  turmaDropdownItemText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  turmaDropdownItemTextActive: { fontFamily: 'Inter_700Bold', color: Colors.accent },
  infoBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.backgroundCard },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  infoText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  gridContainer: { flex: 1, paddingTop: 4 },
  gridHeader: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8 },
  periodoLabel: { width: 46, alignItems: 'center', justifyContent: 'center', gap: 2 },
  periodoNumBox: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  diaHeader: { alignItems: 'center', paddingVertical: 2 },
  diaHeaderPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', minWidth: 36 },
  diaHeaderText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.5 },
  gridRow: { flexDirection: 'row', paddingHorizontal: 6, marginBottom: 5 },
  periodoNum: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  periodoTime: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  cell: { marginHorizontal: 2, borderRadius: 10, minHeight: 82, overflow: 'hidden' },
  cellFilledInner: { flex: 1, minHeight: 82, borderRadius: 10, borderLeftWidth: 3, padding: 7, gap: 2, position: 'relative' },
  cellColorDot: { width: 6, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: 2 },
  cellEmpty: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cellBorla: { backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  cellBorlaText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', letterSpacing: 0.8 },
  cellFilled: { backgroundColor: Colors.primaryLight },
  cellDisciplina: { fontSize: 10, fontFamily: 'Inter_700Bold', textAlign: 'center', lineHeight: 13 },
  cellProf: { fontSize: 9, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.65)', textAlign: 'center' },
  cellSala: { fontSize: 8, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  borlaResumoContainer: { margin: 16, marginBottom: 4, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  borlaResumoHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  borlaResumoTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.8 },
  borlaResumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 },
  borlaDiaCard: { flex: 1, alignItems: 'center', gap: 4 },
  borlaDiaNome: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  borlaBarBg: { width: 28, height: 60, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  borlaBarFill: { width: '100%', borderRadius: 6, minHeight: 2 },
  borlaCount: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  borlaSub: { fontSize: 8, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'lowercase' },
  borlaResumoHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  legendaContainer: { margin: 16, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14 },
  legendaTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  legendaRow: { flexDirection: 'column', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  legendaPeriodoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  legendaNum: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  legendaTime: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  legendaAulaCard: { backgroundColor: Colors.surface, borderRadius: 8, padding: 8, marginTop: 4, gap: 3 },
  legendaAulaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaAulaDisciplina: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold, flex: 1 },
  legendaAulaProf: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1 },
  legendaAulaHab: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },
  legendaVazio: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 24, padding: 20, maxHeight: '90%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalSubtitle: { position: 'absolute', top: 22, left: 0, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  modalClose: { padding: 4 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  selector: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  selectorValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  selectorPlaceholder: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownList: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border, maxHeight: 200, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemActive: { backgroundColor: 'rgba(240,165,0,0.1)' },
  dropdownText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  dropdownTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  dropdownSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  cellMinha: { borderWidth: 1, borderColor: Colors.gold + '40' },
  profViewToggle: { flexDirection: 'row', backgroundColor: Colors.primaryDark, paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  profViewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  profViewBtnActive: { backgroundColor: `${Colors.gold}18`, borderColor: Colors.gold },
  profViewBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  profViewBtnTextActive: { color: Colors.gold },
  turmaBadge: { backgroundColor: `${Colors.info}22`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  turmaBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.info },
  sumarioBadge: { position: 'absolute', top: 4, right: 4 },
  landingContainer: { padding: 16, gap: 12, paddingBottom: 32 },

  landingHero: { alignItems: 'center', paddingVertical: 28, gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginBottom: 2, paddingHorizontal: 20 },
  landingHeroIconWrap: { marginBottom: 4 },
  landingHeroIconOuter: { width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.gold + '14', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.gold + '30' },
  landingHeroIconInner: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  landingTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center', letterSpacing: -0.3 },
  landingSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  landingConflictAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.danger + '14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.danger + '35', marginTop: 4 },
  landingConflictAlertText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger, flex: 1 },

  landingStatsRow: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  landingStatCard: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 4 },
  landingStatCardNum: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: -0.5 },
  landingStatCardDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gold },
  landingStatCardLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },
  landingStatSep: { width: 1, backgroundColor: Colors.border, marginVertical: 12 },

  landingSectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, marginBottom: 2, paddingLeft: 2 },

  landingActionsRow: { flexDirection: 'row', gap: 10 },
  landingActionCard: { flex: 1, alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.border },
  landingActionIcon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  landingActionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  landingActionDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 14 },

  landingWorkflow: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', padding: 16, gap: 0 },
  landingWorkflowStep: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  landingWorkflowLeft: { alignItems: 'center', gap: 0 },
  landingStepBadge: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  landingStepBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  landingWorkflowConnector: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 6, marginBottom: -14, borderRadius: 1 },
  landingWorkflowContent: { flex: 1, gap: 5, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  landingWorkflowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  landingWorkflowTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  landingWorkflowBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  landingWorkflowBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  landingWorkflowDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17 },
  landingProgressBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  landingProgressFill: { height: 4, borderRadius: 2 },
  landingWorkflowFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  landingWorkflowFooterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  landingConflictCard: { backgroundColor: Colors.danger + '08', borderRadius: 16, borderWidth: 1, borderColor: Colors.danger + '40', overflow: 'hidden' },
  landingConflictCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.danger + '25' },
  landingConflictCardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.danger },
  landingConflictCardSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  landingConflictCardPreview: { padding: 12, gap: 7 },
  landingConflictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  landingConflictDot: { width: 6, height: 6, borderRadius: 3 },
  landingConflictRowText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 },
  landingConflictMore: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger, textAlign: 'center', marginTop: 2 },

  landingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 18, padding: 18, gap: 16, borderWidth: 1, borderColor: Colors.border },
  landingCardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  landingCardBody: { flex: 1, gap: 4 },
  landingCardTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  landingCardDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 },
  landingStats: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, marginTop: 6, borderWidth: 1, borderColor: Colors.border },
  landingStat: { flex: 1, alignItems: 'center', gap: 4 },
  landingStatNum: { fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.gold },
  landingStatLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  landingStatDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  criarBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9, backgroundColor: `${Colors.gold}12`, borderBottomWidth: 1, borderBottomColor: `${Colors.gold}30` },
  criarBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  criarBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  criarBannerBadge: { backgroundColor: `${Colors.gold}25`, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  criarBannerBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold },
  criarBannerChange: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: `${Colors.info}15`, borderRadius: 8, borderWidth: 1, borderColor: `${Colors.info}30` },
  criarBannerChangeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info },

  // ── Conflitos ──────────────────────────────────────────────────────────────
  conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 8, paddingRight: 10, backgroundColor: `${Colors.danger}15`, borderBottomWidth: 1, borderBottomColor: `${Colors.danger}30` },
  conflictBannerText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger, flex: 1 },
  autoResolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.accent, borderRadius: 8, flexShrink: 0 },
  autoResolveBtnText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  resolucaoItem: { backgroundColor: `${Colors.success}08`, borderRadius: 10, borderWidth: 1, borderColor: `${Colors.success}25`, padding: 10, marginBottom: 8 },
  resolucaoProfNome: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  resolucaoDiscBadge: { backgroundColor: `${Colors.gold}20`, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  resolucaoDiscText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  resolucaoSlotBefore: { backgroundColor: `${Colors.danger}15`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  resolucaoSlotAfter: { backgroundColor: `${Colors.success}15`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  resolucaoSlotText: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  conflictPanel: { backgroundColor: `${Colors.danger}08`, borderBottomWidth: 1, borderBottomColor: `${Colors.danger}25`, paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  conflictItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  conflictTag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginTop: 1 },
  conflictTagProf: { backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B30' },
  conflictTagSala: { backgroundColor: '#818CF818', borderWidth: 1, borderColor: '#818CF830' },
  conflictTagText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  conflictSlot: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  conflictDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 15 },
  conflictOk: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: `${Colors.success}10`, borderBottomWidth: 1, borderBottomColor: `${Colors.success}25` },
  conflictOkText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success },
  conflictResolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: `${Colors.danger}12`, borderRadius: 7, borderWidth: 1, borderColor: `${Colors.danger}35`, marginTop: 1 },
  conflictResolveBtnText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.danger },
  cellConflito: { borderWidth: 1.5, borderColor: Colors.danger, backgroundColor: `${Colors.danger}12` },
  conflitoCellBadge: { position: 'absolute', top: 3, right: 3, zIndex: 2 },
  pdfExportBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-end', marginHorizontal: 14, marginTop: 6, marginBottom: 2, backgroundColor: '#1a3a6b', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  pdfExportBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // ── Sugestões de conflito ────────────────────────────────────────────
  sgHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  sgTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.danger },
  sgSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  sgLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 32 },
  sgLoadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  sgEmpty: { alignItems: 'center', paddingVertical: 32, gap: 10, paddingHorizontal: 20 },
  sgEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  sgSeparator: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  sgBest: { backgroundColor: `${Colors.success}12`, borderWidth: 1.5, borderColor: `${Colors.success}40`, borderRadius: 10, padding: 12, marginBottom: 6 },
  sgBestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  sgBestBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.4 },
  sgItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sgDayCircle: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sgDayCircleSmall: { width: 32, height: 32, borderRadius: 8, backgroundColor: `${Colors.primary}20` },
  sgDayCircleText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  sgDiaNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  sgHora: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 1 },
  sgItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.card, marginBottom: 5, borderWidth: 1, borderColor: Colors.border },
  sgItemDia: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  sgItemHora: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  sgFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  sgCancelBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  sgCancelBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});
