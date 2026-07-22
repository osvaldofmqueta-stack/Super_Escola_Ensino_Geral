import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import DateInput from '@/components/DateInput';
import TopBar from '@/components/TopBar';
import { useData } from '@/context/DataContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useProfessor } from '@/context/ProfessorContext';
import type { CalendarioProva } from '@/context/ProfessorContext';
import { api, refreshAccessToken } from '@/lib/api';
import { getApiUrl } from '@/lib/query-client';
import { webAlert } from '@/utils/webAlert';
import { alertSucesso, alertErro } from '@/utils/toast';
import AppLoader from '@/components/AppLoader';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';
import CollapsibleStats from '@/components/CollapsibleStats';
import ExameNacionalTab from '@/components/ExameNacionalTab';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { PEDAGOGICO_TOUR_STEPS, PEDAGOGICO_TOUR_KEY } from '@/constants/tourSteps';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Planificacao {
  id: string;
  professorId: string;
  turmaId: string;
  disciplina: string;
  trimestre: number;
  semana: number;
  anoLetivo: string;
  tema: string;
  objectivos: string;
  conteudos: string;
  metodologia: string;
  recursos: string;
  avaliacao: string;
  observacoes: string;
  numAulas: number;
  cumprida: boolean;
  createdAt: string;
}

interface ConteudoProgramatico {
  id: string;
  disciplina: string;
  classe: string;
  trimestre: number;
  anoLetivo: string;
  titulo: string;
  descricao: string;
  ordem: number;
  cumprido: boolean;
  percentagem: number;
  createdAt: string;
}

interface Ocorrencia {
  id: string;
  alunoId: string;
  turmaId: string;
  professorId?: string;
  registadoPor: string;
  tipo: string;
  gravidade: string;
  descricao: string;
  medidaTomada: string;
  data: string;
  resolvida: boolean;
  observacoes: string;
  createdAt: string;
}

// ─── Plano de Aula types & HTML builder (shared with professor-plano-aula) ────
export interface FaseAula {
  tempo: string; fase: string; conteudo: string; metodos: string;
  actividades: string; estrategiaEnsino: string; meiosEnsino: string;
  avaliacao: string; obs: string;
}
export interface PlanoAula {
  id: string; professorId: string; professorNome: string;
  turmaId?: string; turmaNome: string; disciplina: string; unidade: string;
  sumario: string; classe: string; escola: string; perfilEntrada: string;
  perfilSaida: string; data: string; periodo: string; tempo: string;
  duracao: string; anoLetivo: string; objectivoGeral: string;
  objectivosEspecificos: string; fases: FaseAula[];
  status: 'rascunho' | 'submetido' | 'aprovado' | 'rejeitado';
  observacaoDirector?: string; aprovadoPor?: string; aprovadoEm?: string;
  createdAt: string; updatedAt: string;
}
const PLANO_STATUS_CFG = {
  rascunho:  { label: 'Rascunho',  color: '#888',              icon: 'file-document-outline' },
  submetido: { label: 'Submetido', color: '#f59e0b',           icon: 'clock-outline' },
  aprovado:  { label: 'Aprovado',  color: Colors.success,      icon: 'check-circle' },
  rejeitado: { label: 'Rejeitado', color: Colors.danger,       icon: 'close-circle' },
};
function buildPlanoHTML(plano: PlanoAula): string {
  const rows = (plano.fases || []).map(f => `
    <tr>
      <td style="font-size:10pt;text-align:center;font-weight:bold;">${f.tempo}</td>
      <td style="font-size:10pt;font-weight:bold;">${f.fase}</td>
      <td style="font-size:9pt;">${(f.conteudo||'').replace(/\n/g,'<br>')}</td>
      <td style="font-size:9pt;">${(f.metodos||'').replace(/\n/g,'<br>')}</td>
      <td style="font-size:9pt;">${(f.actividades||'').replace(/\n/g,'<br>')}</td>
      <td style="font-size:9pt;">${(f.estrategiaEnsino||'').replace(/\n/g,'<br>')}</td>
      <td style="font-size:9pt;">${(f.meiosEnsino||'').replace(/\n/g,'<br>')}</td>
      <td style="font-size:9pt;text-align:center;">${f.avaliacao||''}</td>
      <td style="font-size:9pt;">${f.obs||''}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',serif;font-size:11pt;color:#111;background:#fff}
  .page{width:297mm;min-height:210mm;margin:0 auto;padding:15mm 18mm}
  h1{text-align:center;font-size:14pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;text-decoration:underline}
  .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #111;border-collapse:collapse;margin-bottom:10px}
  .info-cell{padding:4px 7px;border:1px solid #111;font-size:10pt;line-height:1.5}
  .info-cell .lbl{font-weight:bold}
  .obj-box{border:1px solid #111;padding:5px 8px;margin-bottom:10px;font-size:10pt;line-height:1.7}
  .obj-box .lbl{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th{background:#ddd;font-size:10pt;padding:5px 4px;border:1px solid #111;text-align:center;font-weight:bold}
  td{border:1px solid #111;padding:4px;vertical-align:top}
  .print-btn{display:block;margin:16px auto;padding:10px 32px;background:#1a2540;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold}
  @media print{.print-btn{display:none}}</style></head>
  <body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
  <div style="text-align:center;margin-bottom:10px;"><img src="/angola-brasao.png" style="width:55px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia" onerror="this.style.display='none'" /><p style="font-size:8pt;margin:0;line-height:1.5;">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO · ENSINO GERAL</p></div>
  <h1>Plano de Aula</h1>
  <div class="info-grid">
    <div class="info-cell"><span class="lbl">Nome:</span> ${plano.professorNome}</div>
    <div class="info-cell" style="grid-row:span 2;"><span class="lbl">Geral:</span> ${plano.objectivoGeral||''}</div>
    <div class="info-cell" style="grid-row:span 6;"><span class="lbl">Objectivos:</span><br><br><span class="lbl">Específicos:</span><br>${(plano.objectivosEspecificos||'').replace(/\n/g,'<br>')}</div>
    <div class="info-cell"><span class="lbl">Escola:</span> ${plano.escola}</div>
    <div class="info-cell"><span class="lbl">Data:</span> ${plano.data}</div>
    <div class="info-cell"></div>
    <div class="info-cell"><span class="lbl">Classe:</span> ${plano.classe} &nbsp;&nbsp; <span class="lbl">Turma:</span> ${plano.turmaNome}</div>
    <div class="info-cell"><span class="lbl">Período:</span> ${plano.periodo}</div>
    <div class="info-cell"><span class="lbl">Disciplina:</span> ${plano.disciplina}</div>
    <div class="info-cell"><span class="lbl">Tempo:</span> ${plano.tempo}</div>
    <div class="info-cell"><span class="lbl">Unidade:</span> ${plano.unidade}</div>
    <div class="info-cell"><span class="lbl">Duração:</span> ${plano.duracao}</div>
    <div class="info-cell"><span class="lbl">Sumário:</span> ${plano.sumario}</div>
    <div class="info-cell"><span class="lbl">Ano lectivo:</span> ${plano.anoLetivo}</div>
  </div>
  <div class="obj-box"><span class="lbl">Perfil de entrada:</span> ${plano.perfilEntrada||''}</div>
  <div class="obj-box"><span class="lbl">Perfil de saída:</span> ${plano.perfilSaida||''}</div>
  <table><thead><tr>
    <th style="width:55px">Tempo</th><th style="width:80px">Fases<br>didácticas</th>
    <th>Conteúdo</th><th style="width:80px">Métodos</th><th>Actividades</th>
    <th style="width:90px">Estratégia de<br>Ensino</th><th style="width:90px">Meios de<br>Ensino</th>
    <th style="width:70px">Avaliação</th><th style="width:50px">Obs</th>
  </tr></thead><tbody>${rows}</tbody></table></div></body></html>`;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TABS = ['planificacoes', 'programa', 'resultados', 'exames', 'ocorrencias', 'planos_aula', 'provas', 'exame_nacional'] as const;
type TabKey = typeof TABS[number];

const TAB_LABELS: Record<TabKey, string> = {
  planificacoes: 'Planificações',
  programa: 'Programa',
  resultados: 'Resultados',
  exames: 'Alunos a Exame',
  ocorrencias: 'Ocorrências',
  planos_aula: 'Planos de Aula',
  provas: 'Calendário de Provas',
  exame_nacional: 'Exame Nacional',
};
const TAB_ICONS: Record<TabKey, string> = {
  planificacoes: 'clipboard-list',
  programa: 'book-open-variant',
  resultados: 'chart-bar',
  exames: 'clipboard-alert',
  ocorrencias: 'alert-circle',
  planos_aula: 'book-education',
  provas: 'calendar-check',
  exame_nacional: 'certificate-outline',
};

const TIPO_PROVA_CFG: Record<string, { label: string; color: string; icon: string }> = {
  teste:      { label: 'Teste',       color: Colors.info,    icon: 'pencil-box-outline' },
  exame:      { label: 'Exame',       color: Colors.danger,  icon: 'file-document-edit-outline' },
  trabalho:   { label: 'Trabalho',    color: Colors.gold,    icon: 'briefcase-outline' },
  prova_oral: { label: 'Prova Oral',  color: Colors.success, icon: 'microphone-outline' },
};

const TIPOS_OCO = ['comportamento', 'falta_injustificada', 'violencia', 'fraude', 'outro'] as const;
const TIPO_OCO_LABEL: Record<string, string> = {
  comportamento: 'Comportamento', falta_injustificada: 'Falta Injustificada',
  violencia: 'Violência', fraude: 'Fraude/Desonestidade', outro: 'Outro',
};
const GRAVIDADE_CFG: Record<string, { color: string; label: string }> = {
  leve:     { color: Colors.warning,  label: 'Leve' },
  moderada: { color: Colors.gold,     label: 'Moderada' },
  grave:    { color: Colors.danger,   label: 'Grave' },
};

const TRIMESTRES = [1, 2, 3];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcNF(nota: any): number {
  const mac = nota.mac || 0;
  const pp  = nota.pp1 || 0;
  const pt  = nota.ppt || 0;
  if (mac > 0 && pt > 0) return Math.round((mac * 0.3 + pp * 0.3 + pt * 0.4));
  return nota.nf || 0;
}

function getResultado(nf: number): { label: string; color: string } {
  if (nf >= 10) return { label: 'Aprovado', color: Colors.success };
  if (nf >= 8)  return { label: 'Exame', color: Colors.warning };
  return { label: 'Reprovado', color: Colors.danger };
}

/**
 * Resultado para disciplinas terminais (10ª → 11ª classe).
 * Regras do sistema educativo angolano:
 *  - MFG = (NF_10 + NF_11) / 2
 *  - MFG >= 10 → Aprovado (a negativa anterior fica "fechada")
 *  - NF_10 < 10 E NF_11 < 10 → Reprovado directo (2 negativas consecutivas, sem direito a exame)
 *  - NF_10 < 10 E NF_11 >= 10 E MFG < 10 → Exame de Época Normal (para fechar a média)
 *  - Um ano negativo + MFG < 10 → Exame de Época Normal
 */
function getResultadoTerminal(
  nfAtual: number,
  nfAnterior?: number,
): { label: string; color: string; mfg?: number } {
  if (nfAnterior !== undefined && nfAnterior > 0) {
    const mfg = (nfAtual + nfAnterior) / 2;
    if (mfg >= 10) return { label: 'Aprovado', color: Colors.success, mfg };
    if (nfAnterior < 10 && nfAtual < 10)
      return { label: 'Reprovado', color: Colors.danger, mfg };
    return { label: 'Exame', color: Colors.warning, mfg };
  }
  return getResultado(nfAtual);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PedagogicoScreen() {
  const { alunos, turmas, professores, notas } = useData();
  const { user } = useAuth();
  const { anoSelecionado } = useAnoAcademico();
  const { calendarioProvas, addCalendarioProva, updateCalendarioProva, deleteCalendarioProva } = useProfessor();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'web' ? 24 : insets.bottom;

  const anoAtual = anoSelecionado?.ano || new Date().getFullYear().toString();
  const isProf = user?.role === 'professor';

  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(PEDAGOGICO_TOUR_KEY);

  // Auto-mostrar tour na primeira visita (apenas para o perfil pedagógico)
  useEffect(() => {
    const t = setTimeout(() => {
      if (user?.role === 'pedagogico') checkAndShow();
    }, 800);
    return () => clearTimeout(t);
  }, []);

  const routeParams = useLocalSearchParams<{ tab?: string }>();
  const initialPedTab = ((TABS.find(t => t === String(routeParams?.tab || ''))) || 'planificacoes') as TabKey;
  const [tab, setTab] = useTabMemory<TabKey>('pedagogico', initialPedTab, routeParams?.tab as TabKey | undefined);
  useEffect(() => {
    const t = String(routeParams?.tab || '');
    if (t && (TABS as readonly string[]).includes(t)) setTab(t as TabKey);
  }, [routeParams?.tab]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Data
  const [planificacoes, setPlanificacoes] = useState<Planificacao[]>([]);
  const [conteudos, setConteudos] = useState<ConteudoProgramatico[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);

  // Filters
  const [selTurma, setSelTurma] = useState<string>('todas');
  const [selDisciplina, setSelDisciplina] = useState<string>('todas');
  const [selTrimestre, setSelTrimestre] = useState<number | 'todos'>('todos');
  const [selClasse, setSelClasse] = useState<string>('todas');
  const [selGravidade, setSelGravidade] = useState<string>('todas');
  const [searchAluno, setSearchAluno] = useState('');
  const [showResolvidas, setShowResolvidas] = useState(false);

  // Planos de Aula
  const [planosAula, setPlanosAula] = useState<PlanoAula[]>([]);
  const [filtroPlanoStatus, setFiltroPlanoStatus] = useState<'todos' | 'submetido' | 'aprovado' | 'rejeitado'>('todos');
  const [previewPlano, setPreviewPlano] = useState<PlanoAula | null>(null);
  const [obsModalPlano, setObsModalPlano] = useState<{ plano: PlanoAula; acao: 'aprovar' | 'rejeitar' } | null>(null);
  const [obsText, setObsText] = useState('');
  const [planosLoading, setPlanosLoading] = useState(false);
  const [savingPlano, setSavingPlano] = useState(false);
  const [searchPlano, setSearchPlano] = useState('');
  // Inline review panel state (replaces modal for card-level approve/reject)
  const [inlineReview, setInlineReview] = useState<{ planoId: string; acao: 'aprovar' | 'rejeitar' } | null>(null);
  const [inlineObs, setInlineObs] = useState('');

  // Discipline picker modal
  const [showDisciplinaModal, setShowDisciplinaModal] = useState(false);
  const [searchDisc, setSearchDisc] = useState('');

  // Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showProgModal, setShowProgModal] = useState(false);
  const [showOcoModal, setShowOcoModal]   = useState(false);
  const [editPlan, setEditPlan]   = useState<Planificacao | null>(null);
  const [editProg, setEditProg]   = useState<ConteudoProgramatico | null>(null);
  const [editOco,  setEditOco]    = useState<Ocorrencia | null>(null);

  // Alunos a Exame (tab pedagógica)
  const [exameData, setExameData] = useState<{ total: number; notaMin: number; alunos: any[] } | null>(null);
  const [exameLoading, setExameLoading] = useState(false);
  const [exameSearch, setExameSearch] = useState('');
  const [exameNotificando, setExameNotificando] = useState(false);
  const [exameFiltroTurma, setExameFiltroTurma] = useState('todas');

  async function loadExameData() {
    setExameLoading(true);
    try {
      const res = await api.get('/api/disciplinas/alunos-prova');
      setExameData(res);
    } catch {
      setExameData(null);
    } finally {
      setExameLoading(false);
    }
  }

  async function notificarExames() {
    setExameNotificando(true);
    try {
      await api.post('/api/disciplinas/alunos-prova/notificar', {});
      alertSucesso('Notificações enviadas aos encarregados.');
    } catch {
      alertErro('Erro ao enviar notificações.');
    } finally {
      setExameNotificando(false);
    }
  }

  // Provas
  const [showProvaModal, setShowProvaModal] = useState(false);
  const [editProva, setEditProva] = useState<CalendarioProva | null>(null);
  const defaultProva = { titulo: '', descricao: '', turmasIds: [] as string[], disciplina: '', data: new Date().toISOString().split('T')[0], hora: '08:00', tipo: 'teste' as CalendarioProva['tipo'], publicado: false };
  const [formProva, setFormProva] = useState(defaultProva);
  const [provaFilterTipo, setProvaFilterTipo] = useState<string>('todos');
  const [provaFilterTurma, setProvaFilterTurma] = useState<string>('todas');
  const [provaShowPast, setProvaShowPast] = useState(false);

  // Forms
  const defaultPlan = { turmaId: '', disciplina: '', trimestre: 1, semana: 1, tema: '', objectivos: '', conteudos: '', metodologia: '', recursos: '', avaliacao: '', observacoes: '', numAulas: '1', cumprida: false };
  const defaultProg = { disciplina: '', classe: '', trimestre: 1, titulo: '', descricao: '', ordem: '0', cumprido: false, percentagem: '0' };
  const defaultOco  = { alunoId: '', turmaId: '', tipo: 'comportamento', gravidade: 'leve', descricao: '', medidaTomada: '', data: new Date().toISOString().split('T')[0], resolvida: false, observacoes: '' };

  const [formPlan, setFormPlan] = useState(defaultPlan);
  const [formProg, setFormProg] = useState(defaultProg);
  const [formOco,  setFormOco]  = useState(defaultOco);

  // My professor ID (if role is professor)
  const meuProfessor = useMemo(() => {
    if (!isProf) return null;
    return professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email) || null;
  }, [professores, user, isProf]);

  const turmasVisiveis = useMemo(() => {
    if (!isProf || !meuProfessor) return turmas;
    const ids = (meuProfessor.turmasIds as string[]) || [];
    return turmas.filter(t => ids.includes(t.id));
  }, [turmas, meuProfessor, isProf]);

  const disciplinasVisiveis = useMemo(() => {
    const set = new Set<string>();
    if (isProf && meuProfessor) {
      ((meuProfessor.disciplinas as string[]) || []).forEach(d => set.add(d));
    } else {
      turmas.forEach(t => {
        // Extract disciplines from notes
        notas.filter(n => n.turmaId === t.id).forEach(n => set.add(n.disciplina as string));
      });
    }
    return Array.from(set).sort();
  }, [notas, turmas, meuProfessor, isProf]);

  const classes = useMemo(() => [...new Set(turmas.map(t => t.classe))].sort(), [turmas]);

  useEffect(() => { loadAll(); }, [anoAtual]);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [p, c, o] = await Promise.all([
        api.get<Planificacao[]>(`/api/planificacoes?anoLetivo=${encodeURIComponent(anoAtual)}`),
        api.get<ConteudoProgramatico[]>(`/api/conteudos-programaticos?anoLetivo=${encodeURIComponent(anoAtual)}`),
        api.get<Ocorrencia[]>('/api/ocorrencias'),
      ]);
      setPlanificacoes(p);
      setConteudos(c);
      setOcorrencias(o);
    } catch (e) {
      console.error('Pedagógico load error', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlanosAula() {
    setPlanosLoading(true);
    try {
      let url = '/api/planos-aula';
      if (isProf && meuProfessor) url = `/api/planos-aula/professor/${meuProfessor.id}`;
      const data = await api.get<PlanoAula[]>(url);
      setPlanosAula(data || []);
    } catch (e) {
      console.error('Planos de aula load error', e);
    } finally {
      setPlanosLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'planos_aula') loadPlanosAula();
    if (tab === 'exames') loadExameData();
  }, [tab]);

  function closeAllReviewState() {
    setObsModalPlano(null); setObsText('');
    setInlineReview(null); setInlineObs('');
  }

  async function aprovarPlano(plano: PlanoAula, obs?: string) {
    setSavingPlano(true);
    try {
      const updated = await api.patch<PlanoAula>(`/api/planos-aula/${plano.id}/status`, {
        status: 'aprovado',
        observacaoDirector: obs?.trim() || null,
        aprovadoPor: user?.nome || user?.email || 'Direcção',
      });
      setPlanosAula(prev => prev.map(p => p.id === plano.id ? { ...p, ...updated } : p));
      closeAllReviewState();
    } catch { webAlert('Erro', 'Não foi possível aprovar o plano.'); }
    finally { setSavingPlano(false); }
  }

  async function rejeitarPlano(plano: PlanoAula, obs: string) {
    if (!obs.trim()) { webAlert('Aviso', 'Por favor, indique o motivo da rejeição.'); return; }
    setSavingPlano(true);
    try {
      const updated = await api.patch<PlanoAula>(`/api/planos-aula/${plano.id}/status`, {
        status: 'rejeitado',
        observacaoDirector: obs.trim(),
        aprovadoPor: user?.nome || user?.email || 'Direcção',
      });
      setPlanosAula(prev => prev.map(p => p.id === plano.id ? { ...p, ...updated } : p));
      closeAllReviewState();
    } catch { webAlert('Erro', 'Não foi possível rejeitar o plano.'); }
    finally { setSavingPlano(false); }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  }

  // ── Planificações ────────────────────────────────────────────────────────
  const plansFiltradas = useMemo(() => {
    let list = planificacoes;
    if (selTurma !== 'todas') list = list.filter(p => p.turmaId === selTurma);
    if (selDisciplina !== 'todas') list = list.filter(p => p.disciplina === selDisciplina);
    if (selTrimestre !== 'todos') list = list.filter(p => p.trimestre === selTrimestre);
    if (isProf && meuProfessor) list = list.filter(p => p.professorId === meuProfessor.id);
    return list;
  }, [planificacoes, selTurma, selDisciplina, selTrimestre, isProf, meuProfessor]);

  async function savePlan() {
    if (!formPlan.turmaId || !formPlan.disciplina || !formPlan.tema.trim()) {
      webAlert('Erro', 'Preencha turma, disciplina e tema.'); return;
    }
    const professorId = meuProfessor?.id || (isProf ? '' : (professores[0]?.id || ''));
    const payload = { ...formPlan, numAulas: parseInt(formPlan.numAulas)||1, anoLetivo: anoAtual, professorId };
    if (editPlan) {
      const updated = await api.put<Planificacao>(`/api/planificacoes/${editPlan.id}`, payload);
      setPlanificacoes(prev => prev.map(x => x.id === editPlan.id ? updated : x));
      webAlert('Actualizado', 'Planificação actualizada.');
    } else {
      const novo = await api.post<Planificacao>('/api/planificacoes', payload);
      setPlanificacoes(prev => [novo, ...prev]);
      webAlert('Criada', 'Planificação de aula criada.');
    }
    setShowPlanModal(false); setEditPlan(null); setFormPlan(defaultPlan);
  }

  async function toggleCumprida(plan: Planificacao) {
    const updated = await api.put<Planificacao>(`/api/planificacoes/${plan.id}`, { ...plan, cumprida: !plan.cumprida });
    setPlanificacoes(prev => prev.map(x => x.id === plan.id ? updated : x));
  }

  async function deletePlan(id: string) {
    webAlert('Remover', 'Tem a certeza que quer remover esta planificação?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await api.delete(`/api/planificacoes/${id}`);
        setPlanificacoes(prev => prev.filter(x => x.id !== id));
      }},
    ]);
  }

  // ── Conteúdos ────────────────────────────────────────────────────────────
  const contFiltrados = useMemo(() => {
    let list = conteudos;
    if (selDisciplina !== 'todas') list = list.filter(c => c.disciplina === selDisciplina);
    if (selClasse !== 'todas') list = list.filter(c => c.classe === selClasse);
    if (selTrimestre !== 'todos') list = list.filter(c => c.trimestre === selTrimestre);
    return list.sort((a, b) => a.trimestre - b.trimestre || a.ordem - b.ordem);
  }, [conteudos, selDisciplina, selClasse, selTrimestre]);

  const progPercent = useMemo(() => {
    if (!contFiltrados.length) return 0;
    const total = contFiltrados.reduce((s, c) => s + c.percentagem, 0);
    return Math.round(total / contFiltrados.length);
  }, [contFiltrados]);

  async function saveProg() {
    if (!formProg.disciplina || !formProg.classe || !formProg.titulo.trim()) {
      webAlert('Erro', 'Preencha disciplina, classe e título.'); return;
    }
    const payload = { ...formProg, ordem: parseInt(formProg.ordem)||0, percentagem: parseInt(formProg.percentagem)||0, anoLetivo: anoAtual };
    if (editProg) {
      const updated = await api.put<ConteudoProgramatico>(`/api/conteudos-programaticos/${editProg.id}`, payload);
      setConteudos(prev => prev.map(x => x.id === editProg.id ? updated : x));
    } else {
      const novo = await api.post<ConteudoProgramatico>('/api/conteudos-programaticos', payload);
      setConteudos(prev => [novo, ...prev]);
    }
    setShowProgModal(false); setEditProg(null); setFormProg(defaultProg);
  }

  async function toggleCumprido(c: ConteudoProgramatico) {
    const pct = c.cumprido ? 0 : 100;
    const updated = await api.put<ConteudoProgramatico>(`/api/conteudos-programaticos/${c.id}`, { ...c, cumprido: !c.cumprido, percentagem: pct });
    setConteudos(prev => prev.map(x => x.id === c.id ? updated : x));
  }

  async function deleteProg(id: string) {
    webAlert('Remover', 'Remover este conteúdo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await api.delete(`/api/conteudos-programaticos/${id}`);
        setConteudos(prev => prev.filter(x => x.id !== id));
      }},
    ]);
  }

  // ── Resultados ────────────────────────────────────────────────────────────
  const resultadosPorTurma = useMemo(() => {
    const notasAno = notas.filter((n: any) => n.anoLetivo === anoAtual);
    // Notes from the previous year – used for terminal subject (10ª → 11ª) cross-year MFG
    const anoAnteriorStr = String(parseInt(anoAtual) - 1);
    const notasAnoAnterior = notas.filter((n: any) => n.anoLetivo === anoAnteriorStr);

    return turmas.map(turma => {
      const alunosTurma = alunos.filter(a => a.turmaId === turma.id && a.ativo);
      // 11ª classe is the closing year of terminal subjects (10ª → 11ª)
      const isClasse11 = turma.classe === '11';

      const resultados = alunosTurma.map(aluno => {
        const notasAluno = notasAno.filter((n: any) => n.alunoId === aluno.id && n.turmaId === turma.id);

        // Group current-year notes by discipline to compute per-discipline NF
        const discMap: Record<string, any[]> = {};
        for (const n of notasAluno) {
          const d = n.disciplina as string;
          if (!discMap[d]) discMap[d] = [];
          discMap[d].push(n);
        }

        // Compute per-discipline results applying terminal rules when in 11ª
        const resultadosPorDisc = Object.entries(discMap).map(([disc, discNotas]) => {
          const nfsAtual = discNotas.map((n: any) => calcNF(n));
          const nfAtual = nfsAtual.length
            ? nfsAtual.reduce((s: number, v: number) => s + v, 0) / nfsAtual.length
            : 0;

          if (isClasse11 && notasAnoAnterior.length > 0) {
            // Look up same student + same discipline in the previous year (any turma)
            const notasDiscAnt = notasAnoAnterior.filter(
              (n: any) => n.alunoId === aluno.id && n.disciplina === disc,
            );
            if (notasDiscAnt.length > 0) {
              const nfsAnt = notasDiscAnt.map((n: any) => calcNF(n));
              const nfAnterior =
                nfsAnt.reduce((s: number, v: number) => s + v, 0) / nfsAnt.length;
              return { disc, ...getResultadoTerminal(nfAtual, nfAnterior) };
            }
          }
          return { disc, ...getResultadoTerminal(nfAtual) };
        });

        // Overall student result: most severe per-discipline result wins
        // Reprovado > Exame > Aprovado
        let resultado: { label: string; color: string };
        if (resultadosPorDisc.some(r => r.label === 'Reprovado')) {
          resultado = { label: 'Reprovado', color: Colors.danger };
        } else if (resultadosPorDisc.some(r => r.label === 'Exame')) {
          resultado = { label: 'Exame', color: Colors.warning };
        } else if (resultadosPorDisc.length > 0) {
          resultado = { label: 'Aprovado', color: Colors.success };
        } else {
          resultado = getResultado(0);
        }

        const nfs = notasAluno.map((n: any) => calcNF(n));
        const mediaFinal = nfs.length
          ? Math.round(nfs.reduce((s: number, v: number) => s + v, 0) / nfs.length)
          : 0;

        return { aluno, mediaFinal, resultado, disciplinas: notasAluno.length };
      });

      const aprovados  = resultados.filter(r => r.resultado.label === 'Aprovado').length;
      const exame      = resultados.filter(r => r.resultado.label === 'Exame').length;
      const reprovados = resultados.filter(r => r.resultado.label === 'Reprovado').length;
      return { turma, resultados, aprovados, exame, reprovados, total: resultados.length };
    }).filter(t => t.total > 0);
  }, [notas, alunos, turmas, anoAtual]);

  const turmaResultadoFiltrada = resultadosPorTurma.find(r => r.turma.id === selTurma);

  // ── Ocorrências ──────────────────────────────────────────────────────────
  const ocoFiltradas = useMemo(() => {
    let list = ocorrencias;
    if (selTurma !== 'todas') list = list.filter(o => o.turmaId === selTurma);
    if (selGravidade !== 'todas') list = list.filter(o => o.gravidade === selGravidade);
    if (!showResolvidas) list = list.filter(o => !o.resolvida);
    if (searchAluno.trim()) {
      const q = searchAluno.toLowerCase();
      list = list.filter(o => {
        const a = alunos.find(x => x.id === o.alunoId);
        return a ? `${a.nome} ${a.apelido}`.toLowerCase().includes(q) : false;
      });
    }
    return list;
  }, [ocorrencias, selTurma, selGravidade, showResolvidas, searchAluno, alunos]);

  async function saveOco() {
    if (!formOco.alunoId || !formOco.turmaId || !formOco.descricao.trim()) {
      webAlert('Erro', 'Preencha aluno, turma e descrição.'); return;
    }
    const payload = { ...formOco, registadoPor: user?.nome || 'Sistema', professorId: meuProfessor?.id || null };
    if (editOco) {
      const updated = await api.put<Ocorrencia>(`/api/ocorrencias/${editOco.id}`, payload);
      setOcorrencias(prev => prev.map(x => x.id === editOco.id ? updated : x));
    } else {
      const nova = await api.post<Ocorrencia>('/api/ocorrencias', payload);
      setOcorrencias(prev => [nova, ...prev]);
    }
    setShowOcoModal(false); setEditOco(null); setFormOco(defaultOco);
  }

  async function resolverOco(oco: Ocorrencia) {
    const updated = await api.put<Ocorrencia>(`/api/ocorrencias/${oco.id}`, { ...oco, resolvida: true });
    setOcorrencias(prev => prev.map(x => x.id === oco.id ? updated : x));
  }

  async function deleteOco(id: string) {
    webAlert('Remover', 'Remover esta ocorrência?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await api.delete(`/api/ocorrencias/${id}`);
        setOcorrencias(prev => prev.filter(x => x.id !== id));
      }},
    ]);
  }

  // ── Provas CRUD ───────────────────────────────────────────────────────────
  async function saveProva() {
    if (!formProva.titulo.trim() || !formProva.data) {
      webAlert('Erro', 'Preencha pelo menos o título e a data da prova.'); return;
    }
    try {
      if (editProva) {
        await updateCalendarioProva(editProva.id, formProva);
        webAlert('Actualizado', 'Prova actualizada com sucesso.');
      } else {
        await addCalendarioProva(formProva);
        webAlert('Criado', 'Prova adicionada ao calendário.');
      }
      setShowProvaModal(false); setEditProva(null); setFormProva(defaultProva);
    } catch { webAlert('Erro', 'Não foi possível guardar a prova.'); }
  }

  async function deleteProvaItem(id: string) {
    webAlert('Remover', 'Remover esta prova do calendário?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await deleteCalendarioProva(id);
      }},
    ]);
  }

  async function togglePublicarProva(p: CalendarioProva) {
    await updateCalendarioProva(p.id, { publicado: !p.publicado });
  }

  function getNomeAluno(id: string) {
    const a = alunos.find(x => x.id === id);
    return a ? `${a.nome} ${a.apelido}` : '—';
  }
  function getNomeTurma(id: string) { return turmas.find(x => x.id === id)?.nome || '—'; }

  // ── Render Tab Bar ────────────────────────────────────────────────────────
  function renderTabBar() {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border }}
        contentContainerStyle={{ paddingHorizontal: 8, minWidth: '100%' }}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={{ paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2,
              borderBottomColor: tab === t ? Colors.gold : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6,
              minWidth: 118, justifyContent: 'center' }}>
            <MaterialCommunityIcons name={TAB_ICONS[t] as any} size={16}
              color={tab === t ? Colors.gold : Colors.textMuted} />
            <Text style={{ fontSize: 13, fontFamily: tab === t ? 'Inter_600SemiBold' : 'Inter_400Regular',
              color: tab === t ? Colors.gold : Colors.textMuted }}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── Professional Filter Components ───────────────────────────────────────

  /** Horizontal scrollable chip row — ideal for Turmas & classes (few items) */
  function HScrollChips({ label, icon, iconColor, value, options, onChange }: {
    label: string; icon?: string; iconColor?: string;
    value: string | number;
    options: { value: string | number; label: string }[];
    onChange: (v: any) => void;
  }) {
    return (
      <View style={st.fRow}>
        <View style={st.fRowHead}>
          {icon && <MaterialCommunityIcons name={icon as any} size={12} color={iconColor || Colors.textMuted} />}
          <Text style={st.fRowLabel}>{label}</Text>
        </View>
        <View style={st.hChipWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.hChipScroll}>
            {options.map(o => {
              const active = value === o.value;
              return (
                <TouchableOpacity key={String(o.value)} onPress={() => onChange(o.value)}
                  style={[st.hChip, active && st.hChipActive]}>
                  <Text style={[st.hChipTxt, active && st.hChipTxtActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }

  /** Segmented control — ideal for Trimestre (3–4 options) */
  function SegmentedControl({ label, icon, value, options, onChange }: {
    label: string; icon?: string;
    value: string | number;
    options: { value: string | number; label: string }[];
    onChange: (v: any) => void;
  }) {
    return (
      <View style={st.fRow}>
        <View style={st.fRowHead}>
          {icon && <MaterialCommunityIcons name={icon as any} size={12} color={Colors.textMuted} />}
          <Text style={st.fRowLabel}>{label}</Text>
        </View>
        <View style={st.segCtrl}>
          {options.map((o, i) => {
            const active = value === o.value;
            const isFirst = i === 0;
            const isLast = i === options.length - 1;
            return (
              <TouchableOpacity key={String(o.value)} onPress={() => onChange(o.value)}
                style={[st.segBtn,
                  isFirst && { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
                  isLast  && { borderTopRightRadius: 8, borderBottomRightRadius: 8 },
                  active  && st.segBtnActive]}>
                <Text style={[st.segBtnTxt, active && st.segBtnTxtActive]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  /** Dropdown trigger button — opens a modal picker for long lists (Disciplinas) */
  function DropdownFilter({ label, icon, iconColor, value, allLabel, options, onOpen }: {
    label: string; icon?: string; iconColor?: string; allLabel?: string;
    value: string | number;
    options: { value: string | number; label: string }[];
    onOpen: () => void;
  }) {
    const isAll = value === 'todas' || value === 'todos';
    const found = options.find(o => o.value === value);
    const display = isAll ? (allLabel || 'Todas') : (found?.label || String(value));
    return (
      <View style={st.fRow}>
        <View style={st.fRowHead}>
          {icon && <MaterialCommunityIcons name={icon as any} size={12} color={iconColor || Colors.textMuted} />}
          <Text style={st.fRowLabel}>{label}</Text>
        </View>
        <TouchableOpacity onPress={onOpen} style={[st.dropBtn, !isAll && st.dropBtnActive]}>
          <Text style={[st.dropBtnTxt, !isAll && st.dropBtnTxtActive]} numberOfLines={1}>{display}</Text>
          <Ionicons name="chevron-down" size={13} color={isAll ? Colors.textMuted : Colors.gold} />
        </TouchableOpacity>
      </View>
    );
  }

  /** Searchable compact bottom-sheet modal for picking a discipline */
  function DisciplinaPickerModal({ visible, disciplines, value, onChange, onClose }: {
    visible: boolean; disciplines: string[]; value: string;
    onChange: (v: string) => void; onClose: () => void;
  }) {
    const filtered = searchDisc
      ? disciplines.filter(d => d.toLowerCase().includes(searchDisc.toLowerCase()))
      : disciplines;
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: Colors.backgroundElevated, borderTopLeftRadius: 20,
              borderTopRightRadius: 20, maxHeight: '55%', paddingBottom: bottom + 8,
              borderTopWidth: 1, borderColor: Colors.border }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: Colors.border }} />
            </View>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 8,
              borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <MaterialCommunityIcons name="book-open-variant" size={15} color={Colors.info} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text }}>
                Seleccionar Disciplina
              </Text>
              <TouchableOpacity onPress={onClose}
                style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.backgroundCard,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {/* Search */}
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              <StableSearchInput
                value={searchDisc}
                onChangeText={setSearchDisc}
                placeholder="Pesquisar disciplina..."
                iconColor={Colors.textMuted}
                inputStyle={{ backgroundColor: Colors.backgroundCard, borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 7, color: Colors.text, fontFamily: 'Inter_400Regular',
                  fontSize: 12, borderWidth: 1, borderColor: Colors.border }}
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* All option */}
              <TouchableOpacity onPress={() => { onChange('todas'); setSearchDisc(''); onClose(); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9,
                  gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '30',
                  backgroundColor: value === 'todas' ? Colors.gold + '12' : 'transparent' }}>
                <View style={{ width: 24, height: 24, borderRadius: 6,
                  backgroundColor: value === 'todas' ? Colors.gold + '22' : Colors.backgroundCard,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="view-grid-outline" size={13}
                    color={value === 'todas' ? Colors.gold : Colors.textMuted} />
                </View>
                <Text style={{ flex: 1, fontFamily: value === 'todas' ? 'Inter_600SemiBold' : 'Inter_400Regular',
                  fontSize: 13, color: value === 'todas' ? Colors.gold : Colors.text }}>
                  Todas as Disciplinas
                </Text>
                {value === 'todas' && <Ionicons name="checkmark-circle" size={15} color={Colors.gold} />}
              </TouchableOpacity>
              {/* Discipline items */}
              {filtered.map(d => (
                <TouchableOpacity key={d} onPress={() => { onChange(d); setSearchDisc(''); onClose(); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9,
                    gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '30',
                    backgroundColor: value === d ? Colors.gold + '12' : 'transparent' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6,
                    backgroundColor: value === d ? Colors.gold + '22' : Colors.backgroundCard,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="book-open-variant" size={13}
                      color={value === d ? Colors.gold : Colors.textMuted} />
                  </View>
                  <Text style={{ flex: 1, fontFamily: value === d ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    fontSize: 13, color: value === d ? Colors.gold : Colors.text }}>
                    {d}
                  </Text>
                  {value === d && <Ionicons name="checkmark-circle" size={15} color={Colors.gold} />}
                </TouchableOpacity>
              ))}
              {filtered.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                    Nenhuma disciplina encontrada.
                  </Text>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>
    );
  }

  /** Legacy wrapper kept for simple use-cases (Gravidade etc.) */
  function FilterChips({ label, value, options, onChange }: {
    label: string; value: string | number;
    options: { value: string | number; label: string }[];
    onChange: (v: any) => void;
  }) {
    return <HScrollChips label={label} value={value} options={options} onChange={onChange} />;
  }

  // ── Render Planificações ──────────────────────────────────────────────────
  function renderPlanificacoes() {
    const plansT1 = plansFiltradas.filter(p => p.trimestre === 1);
    const plansT2 = plansFiltradas.filter(p => p.trimestre === 2);
    const plansT3 = plansFiltradas.filter(p => p.trimestre === 3);
    const cumpridas = plansFiltradas.filter(p => p.cumprida).length;
    const total = plansFiltradas.length;

    return (
      <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 14, paddingBottom: bottom + 80 }}>

        <CollapsibleStats storageKey="ped-plan-kpi" title="Resumo de Planificações" color={Colors.info}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <View style={[st.kpi, { flex: 1 }]}>
              <Text style={[st.kpiVal, { color: Colors.info }]}>{total}</Text>
              <Text style={st.kpiLbl}>Total</Text>
            </View>
            <View style={[st.kpi, { flex: 1 }]}>
              <Text style={[st.kpiVal, { color: Colors.success }]}>{cumpridas}</Text>
              <Text style={st.kpiLbl}>Cumpridas</Text>
            </View>
            <View style={[st.kpi, { flex: 1 }]}>
              <Text style={[st.kpiVal, { color: Colors.warning }]}>{total - cumpridas}</Text>
              <Text style={st.kpiLbl}>Por Cumprir</Text>
            </View>
          </View>
        </CollapsibleStats>

        <View style={st.filterPanel}>
          <HScrollChips label="Turma" icon="google-classroom" iconColor={Colors.gold}
            value={selTurma}
            options={[{ value: 'todas', label: 'Todas' }, ...turmasVisiveis.map(t => ({ value: t.id, label: t.nome }))]}
            onChange={setSelTurma} />
          <View style={st.fDivider} />
          <DropdownFilter label="Disciplina" icon="book-open-variant" iconColor={Colors.info}
            value={selDisciplina} allLabel="Todas as disciplinas"
            options={[{ value: 'todas', label: 'Todas as disciplinas' }, ...disciplinasVisiveis.map(d => ({ value: d, label: d }))]}
            onOpen={() => setShowDisciplinaModal(true)} />
          <View style={st.fDivider} />
          <SegmentedControl label="Trimestre" icon="calendar-range"
            value={selTrimestre}
            options={[{ value: 'todos', label: 'Todos' }, ...TRIMESTRES.map(t => ({ value: t, label: `${t}º` }))]}
            onChange={setSelTrimestre} />
        </View>

        {[1, 2, 3].map(tri => {
          const lista = plansFiltradas.filter(p => p.trimestre === tri);
          if (lista.length === 0 && selTrimestre !== 'todos' && selTrimestre !== tri) return null;
          if (lista.length === 0) return null;
          return (
            <CollapsibleStats key={tri} storageKey={`ped-plan-tri-${tri}`} title={`${tri}º Trimestre — ${lista.length} planificaç${lista.length === 1 ? 'ão' : 'ões'}`} color={Colors.info}>
              {lista.map(plan => (
                <View key={plan.id} style={[st.card, plan.cumprida && { borderLeftWidth: 3, borderLeftColor: Colors.success }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.cardTitle}>{plan.tema}</Text>
                      <Text style={st.cardSub}>{plan.disciplina} · Semana {plan.semana} · {plan.numAulas} aula{plan.numAulas > 1 ? 's' : ''}</Text>
                      <Text style={st.cardSub}>{getNomeTurma(plan.turmaId)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleCumprida(plan)}
                      style={[st.badge, { backgroundColor: plan.cumprida ? Colors.success + '22' : Colors.border }]}>
                      <Ionicons name={plan.cumprida ? 'checkmark-circle' : 'ellipse-outline'} size={14}
                        color={plan.cumprida ? Colors.success : Colors.textMuted} />
                      <Text style={{ fontSize: 10, color: plan.cumprida ? Colors.success : Colors.textMuted, fontFamily: 'Inter_600SemiBold' }}>
                        {plan.cumprida ? 'Cumprida' : 'Por cumprir'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {!!plan.objectivos && <Text style={st.detRow}><Text style={st.detLbl}>Objectivos: </Text>{plan.objectivos}</Text>}
                  {!!plan.conteudos && <Text style={st.detRow}><Text style={st.detLbl}>Conteúdos: </Text>{plan.conteudos}</Text>}
                  {!!plan.metodologia && <Text style={st.detRow}><Text style={st.detLbl}>Metodologia: </Text>{plan.metodologia}</Text>}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity onPress={() => { setEditPlan(plan); setFormPlan({ turmaId: plan.turmaId, disciplina: plan.disciplina, trimestre: plan.trimestre, semana: plan.semana, tema: plan.tema, objectivos: plan.objectivos, conteudos: plan.conteudos, metodologia: plan.metodologia, recursos: plan.recursos, avaliacao: plan.avaliacao, observacoes: plan.observacoes, numAulas: String(plan.numAulas), cumprida: plan.cumprida }); setShowPlanModal(true); }}
                      style={st.btnSec}>
                      <Ionicons name="pencil" size={13} color={Colors.info} />
                      <Text style={[st.btnSecTxt, { color: Colors.info }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deletePlan(plan.id)} style={st.btnSec}>
                      <Ionicons name="trash" size={13} color={Colors.danger} />
                      <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </CollapsibleStats>
          );
        })}
        {plansFiltradas.length === 0 && (
          <View style={st.empty}>
            <MaterialCommunityIcons name="clipboard-list" size={40} color={Colors.textMuted} />
            <Text style={st.emptyTxt}>Nenhuma planificação encontrada.</Text>
            <Text style={st.emptySub}>Cria a primeira planificação de aula.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Render Programa ───────────────────────────────────────────────────────
  function renderPrograma() {
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 14, paddingBottom: bottom + 80 }}>

        <View style={st.filterPanel}>
          <DropdownFilter label="Disciplina" icon="book-open-variant" iconColor={Colors.info}
            value={selDisciplina} allLabel="Todas as disciplinas"
            options={[{ value: 'todas', label: 'Todas as disciplinas' }, ...disciplinasVisiveis.map(d => ({ value: d, label: d }))]}
            onOpen={() => setShowDisciplinaModal(true)} />
          <View style={st.fDivider} />
          <HScrollChips label="Classe" icon="school-outline" iconColor={Colors.textMuted}
            value={selClasse}
            options={[{ value: 'todas', label: 'Todas' }, ...classes.map(c => ({ value: c, label: `${c}ª` }))]}
            onChange={setSelClasse} />
          <View style={st.fDivider} />
          <SegmentedControl label="Trimestre" icon="calendar-range"
            value={selTrimestre}
            options={[{ value: 'todos', label: 'Todos' }, ...TRIMESTRES.map(t => ({ value: t, label: `${t}º` }))]}
            onChange={setSelTrimestre} />
        </View>

        {contFiltrados.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={st.kpiLbl}>Cumprimento do Programa</Text>
              <Text style={[st.kpiLbl, { color: progPercent >= 80 ? Colors.success : progPercent >= 50 ? Colors.warning : Colors.danger, fontFamily: 'Inter_700Bold' }]}>{progPercent}%</Text>
            </View>
            <View style={{ height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 8, borderRadius: 4, width: `${Math.min(progPercent, 100)}%` as any,
                backgroundColor: progPercent >= 80 ? Colors.success : progPercent >= 50 ? Colors.warning : Colors.danger }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={[st.kpi, { flex: 1 }]}>
                <Text style={[st.kpiVal, { color: Colors.success }]}>{contFiltrados.filter(c => c.cumprido).length}</Text>
                <Text style={st.kpiLbl}>Cumpridos</Text>
              </View>
              <View style={[st.kpi, { flex: 1 }]}>
                <Text style={[st.kpiVal, { color: Colors.warning }]}>{contFiltrados.filter(c => !c.cumprido).length}</Text>
                <Text style={st.kpiLbl}>Por Cumprir</Text>
              </View>
              <View style={[st.kpi, { flex: 1 }]}>
                <Text style={[st.kpiVal, { color: Colors.info }]}>{contFiltrados.length}</Text>
                <Text style={st.kpiLbl}>Total</Text>
              </View>
            </View>
          </View>
        )}

        {[1, 2, 3].map(tri => {
          const lista = contFiltrados.filter(c => c.trimestre === tri);
          if (!lista.length) return null;
          const cumpridos = lista.filter(c => c.cumprido).length;
          return (
            <CollapsibleStats key={tri} storageKey={`ped-prog-tri-${tri}`} title={`${tri}º Trimestre — ${cumpridos}/${lista.length} cumpridos`} color={Colors.gold}>
              <View style={{ marginBottom: 4 }}>
              {lista.map(c => (
                <View key={c.id} style={[st.card, c.cumprido && { borderLeftWidth: 3, borderLeftColor: Colors.success }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.cardTitle}>{c.titulo}</Text>
                      <Text style={st.cardSub}>{c.disciplina} · {c.classe}ª Classe</Text>
                      {!!c.descricao && <Text style={[st.cardSub, { marginTop: 4 }]}>{c.descricao}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <TouchableOpacity onPress={() => toggleCumprido(c)}
                        style={[st.badge, { backgroundColor: c.cumprido ? Colors.success + '22' : Colors.border }]}>
                        <Ionicons name={c.cumprido ? 'checkmark-circle' : 'ellipse-outline'} size={14}
                          color={c.cumprido ? Colors.success : Colors.textMuted} />
                        <Text style={{ fontSize: 10, color: c.cumprido ? Colors.success : Colors.textMuted, fontFamily: 'Inter_600SemiBold' }}>
                          {c.cumprido ? 'Cumprido' : 'Pendente'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 12, color: c.percentagem >= 80 ? Colors.success : c.percentagem >= 50 ? Colors.warning : Colors.danger, fontFamily: 'Inter_700Bold' }}>{c.percentagem}%</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity onPress={() => { setEditProg(c); setFormProg({ disciplina: c.disciplina, classe: c.classe, trimestre: c.trimestre, titulo: c.titulo, descricao: c.descricao, ordem: String(c.ordem), cumprido: c.cumprido, percentagem: String(c.percentagem) }); setShowProgModal(true); }}
                      style={st.btnSec}>
                      <Ionicons name="pencil" size={13} color={Colors.info} />
                      <Text style={[st.btnSecTxt, { color: Colors.info }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteProg(c.id)} style={st.btnSec}>
                      <Ionicons name="trash" size={13} color={Colors.danger} />
                      <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              </View>
            </CollapsibleStats>
          );
        })}
        {contFiltrados.length === 0 && (
          <View style={st.empty}>
            <MaterialCommunityIcons name="book-open-variant" size={40} color={Colors.textMuted} />
            <Text style={st.emptyTxt}>Nenhum conteúdo programático definido.</Text>
            <Text style={st.emptySub}>Adiciona os conteúdos do programa para acompanhar o cumprimento.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Render Resultados ─────────────────────────────────────────────────────
  function renderResultados() {
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 12, paddingBottom: bottom + 80 }}>

        <View style={[st.filterPanel, st.filterPanelMobile]}>
          <HScrollChips label="Turma" icon="google-classroom" iconColor={Colors.gold}
            value={selTurma}
            options={[{ value: 'todas', label: 'Todas' }, ...turmas.map(t => ({ value: t.id, label: t.nome }))]}
            onChange={setSelTurma} />
        </View>

        {selTurma === 'todas' ? (
          <>
            {resultadosPorTurma.length === 0 && (
              <View style={st.empty}>
                <MaterialCommunityIcons name="chart-bar" size={40} color={Colors.textMuted} />
                <Text style={st.emptyTxt}>Sem dados de resultados para {anoAtual}.</Text>
                <Text style={st.emptySub}>Os resultados aparecem quando as notas forem lançadas.</Text>
              </View>
            )}
            {resultadosPorTurma.map(({ turma, aprovados, exame, reprovados, total }) => {
              const taxaAprov = total > 0 ? Math.round((aprovados / total) * 100) : 0;
              return (
                <TouchableOpacity key={turma.id} onPress={() => setSelTurma(turma.id)} style={[st.card, st.cardMobile]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View>
                      <Text style={[st.cardTitle, st.cardTitleMobile]}>{turma.nome}</Text>
                      <Text style={[st.cardSub, st.cardSubMobile]}>{turma.classe}ª Classe · {turma.turno} · {total} alunos</Text>
                    </View>
                    <View style={[st.badge, st.badgeMobile, { backgroundColor: taxaAprov >= 70 ? Colors.success + '22' : Colors.warning + '22', borderColor: taxaAprov >= 70 ? Colors.success + '44' : Colors.warning + '44' }]}>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: taxaAprov >= 70 ? Colors.success : Colors.warning }}>{taxaAprov}%</Text>
                      <Text style={{ fontSize: 9, color: Colors.textSecondary }}>Aprovação</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ flex: 1, backgroundColor: Colors.success + '18', borderRadius: 8, padding: 7, alignItems: 'center' }}>
                      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.success }}>{aprovados}</Text>
                      <Text style={{ fontSize: 9, color: Colors.textSecondary }}>Aprovados</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: Colors.warning + '18', borderRadius: 8, padding: 7, alignItems: 'center' }}>
                      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{exame}</Text>
                      <Text style={{ fontSize: 9, color: Colors.textSecondary }}>Exame</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: Colors.danger + '18', borderRadius: 8, padding: 7, alignItems: 'center' }}>
                      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{reprovados}</Text>
                      <Text style={{ fontSize: 9, color: Colors.textSecondary }}>Reprovados</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : turmaResultadoFiltrada ? (
          <>
            <TouchableOpacity onPress={() => setSelTurma('todas')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name="arrow-back" size={16} color={Colors.gold} />
              <Text style={{ color: Colors.gold, fontFamily: 'Inter_500Medium', fontSize: 13 }}>Voltar a todas as turmas</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Aprovados', val: turmaResultadoFiltrada.aprovados, color: Colors.success },
                { label: 'Exame',     val: turmaResultadoFiltrada.exame,     color: Colors.warning },
                { label: 'Reprovados',val: turmaResultadoFiltrada.reprovados, color: Colors.danger },
              ].map(item => (
                <View key={item.label} style={[st.kpi, st.kpiMobile, { flex: 1 }]}>
                  <Text style={[st.kpiVal, st.kpiValMobile, { color: item.color }]}>{item.val}</Text>
                  <Text style={[st.kpiLbl, st.kpiLblMobile]}>{item.label}</Text>
                </View>
              ))}
            </View>
            {turmaResultadoFiltrada.resultados
              .sort((a, b) => b.mediaFinal - a.mediaFinal)
              .map(({ aluno, mediaFinal, resultado }) => (
                <View key={aluno.id} style={[st.card, st.cardMobile]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.cardTitle, st.cardTitleMobile]}>{aluno.nome} {aluno.apelido}</Text>
                      <Text style={[st.cardSub, st.cardSubMobile]}>{aluno.numeroMatricula}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: resultado.color }}>{mediaFinal}</Text>
                      <View style={[st.badge, { backgroundColor: resultado.color + '22', borderColor: resultado.color + '44' }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: resultado.color }}>{resultado.label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
          </>
        ) : null}
      </ScrollView>
    );
  }

  // ── Render Ocorrências ────────────────────────────────────────────────────
  function renderOcorrencias() {
    const totalAberto = ocorrencias.filter(o => !o.resolvida).length;
    const graveAberto = ocorrencias.filter(o => !o.resolvida && o.gravidade === 'grave').length;

    return (
      <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 14, paddingBottom: bottom + 80 }}>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <View style={[st.kpi, { flex: 1, borderTopWidth: 2, borderTopColor: Colors.danger }]}>
            <Text style={[st.kpiVal, { color: Colors.danger }]}>{totalAberto}</Text>
            <Text style={st.kpiLbl}>Em Aberto</Text>
          </View>
          <View style={[st.kpi, { flex: 1, borderTopWidth: 2, borderTopColor: Colors.warning }]}>
            <Text style={[st.kpiVal, { color: Colors.warning }]}>{graveAberto}</Text>
            <Text style={st.kpiLbl}>Graves</Text>
          </View>
          <View style={[st.kpi, { flex: 1, borderTopWidth: 2, borderTopColor: Colors.success }]}>
            <Text style={[st.kpiVal, { color: Colors.success }]}>{ocorrencias.filter(o => o.resolvida).length}</Text>
            <Text style={st.kpiLbl}>Resolvidas</Text>
          </View>
        </View>

        <StableSearchInput
          value={searchAluno}
          onChangeText={setSearchAluno}
          inputStyle={st.searchInput}
          placeholder="Pesquisar aluno..."
          iconColor={Colors.textMuted}
        />

        <View style={st.filterPanel}>
          <HScrollChips label="Turma" icon="google-classroom" iconColor={Colors.gold}
            value={selTurma}
            options={[{ value: 'todas', label: 'Todas' }, ...turmasVisiveis.map(t => ({ value: t.id, label: t.nome }))]}
            onChange={setSelTurma} />
          <View style={st.fDivider} />
          <SegmentedControl label="Gravidade" icon="alert-circle-outline"
            value={selGravidade}
            options={[{ value: 'todas', label: 'Todas' }, { value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'grave', label: 'Grave' }]}
            onChange={setSelGravidade} />
        </View>

        <TouchableOpacity onPress={() => setShowResolvidas(!showResolvidas)}
          style={[st.btnSec, { marginBottom: 12, alignSelf: 'flex-start' }]}>
          <Ionicons name={showResolvidas ? 'eye' : 'eye-off'} size={14} color={Colors.textSecondary} />
          <Text style={[st.btnSecTxt, { color: Colors.textSecondary }]}>{showResolvidas ? 'Ocultar resolvidas' : 'Mostrar resolvidas'}</Text>
        </TouchableOpacity>

        {ocoFiltradas.map(oco => {
          const grav = GRAVIDADE_CFG[oco.gravidade] || GRAVIDADE_CFG.leve;
          return (
            <View key={oco.id} style={[st.card, { borderLeftWidth: 3, borderLeftColor: grav.color }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle}>{getNomeAluno(oco.alunoId)}</Text>
                  <Text style={st.cardSub}>{getNomeTurma(oco.turmaId)} · {oco.data}</Text>
                  <Text style={st.cardSub}>{TIPO_OCO_LABEL[oco.tipo] || oco.tipo} · Registado por {oco.registadoPor}</Text>
                </View>
                <View style={{ gap: 4, alignItems: 'flex-end' }}>
                  <View style={[st.badge, { backgroundColor: grav.color + '22', borderColor: grav.color + '44' }]}>
                    <Text style={{ fontSize: 10, color: grav.color, fontFamily: 'Inter_600SemiBold' }}>{grav.label}</Text>
                  </View>
                  {oco.resolvida && (
                    <View style={[st.badge, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '44' }]}>
                      <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_600SemiBold' }}>Resolvida</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={[st.detRow, { marginBottom: 4 }]}><Text style={st.detLbl}>Descrição: </Text>{oco.descricao}</Text>
              {!!oco.medidaTomada && <Text style={st.detRow}><Text style={st.detLbl}>Medida: </Text>{oco.medidaTomada}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {!oco.resolvida && (
                  <TouchableOpacity onPress={() => resolverOco(oco)} style={st.btnSec}>
                    <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                    <Text style={[st.btnSecTxt, { color: Colors.success }]}>Resolver</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setEditOco(oco); setFormOco({ alunoId: oco.alunoId, turmaId: oco.turmaId, tipo: oco.tipo, gravidade: oco.gravidade, descricao: oco.descricao, medidaTomada: oco.medidaTomada, data: oco.data, resolvida: oco.resolvida, observacoes: oco.observacoes }); setShowOcoModal(true); }} style={st.btnSec}>
                  <Ionicons name="pencil" size={13} color={Colors.info} />
                  <Text style={[st.btnSecTxt, { color: Colors.info }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteOco(oco.id)} style={st.btnSec}>
                  <Ionicons name="trash" size={13} color={Colors.danger} />
                  <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Remover</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        {ocoFiltradas.length === 0 && (
          <View style={st.empty}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={Colors.textMuted} />
            <Text style={st.emptyTxt}>Nenhuma ocorrência encontrada.</Text>
            <Text style={st.emptySub}>{showResolvidas ? 'Sem ocorrências com os filtros seleccionados.' : 'Todas as ocorrências estão resolvidas.'}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Render Planos de Aula ─────────────────────────────────────────────────
  function renderPlanosAula() {
    const q = searchPlano.toLowerCase().trim();
    const planosFiltrados = planosAula
      .filter(p => isProf ? true : p.status !== 'rascunho')
      .filter(p => filtroPlanoStatus === 'todos' ? true : p.status === filtroPlanoStatus)
      .filter(p => !q || p.professorNome?.toLowerCase().includes(q) || p.disciplina?.toLowerCase().includes(q) || p.turmaNome?.toLowerCase().includes(q));

    const totalSubmetidos = planosAula.filter(p => p.status === 'submetido').length;
    const totalAprovados  = planosAula.filter(p => p.status === 'aprovado').length;
    const totalRejeitados = planosAula.filter(p => p.status === 'rejeitado').length;

    const isAprovar = obsModalPlano?.acao === 'aprovar';
    const acaoColor = isAprovar ? Colors.success : Colors.danger;

    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={planosLoading} onRefresh={loadPlanosAula} />}
        contentContainerStyle={{ padding: 14, paddingBottom: bottom + 80 }}
      >
        {/* KPIs */}
        {!isProf && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Submetidos', val: totalSubmetidos, color: '#f59e0b' },
              { label: 'Aprovados',  val: totalAprovados,  color: Colors.success },
              { label: 'Rejeitados', val: totalRejeitados, color: Colors.danger },
            ].map(k => (
              <TouchableOpacity
                key={k.label}
                style={[st.kpi, { flex: 1 }]}
                onPress={() => setFiltroPlanoStatus(k.label === 'Submetidos' ? 'submetido' : k.label === 'Aprovados' ? 'aprovado' : 'rejeitado')}
              >
                <Text style={[st.kpiVal, { color: k.color }]}>{k.val}</Text>
                <Text style={st.kpiLbl}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pesquisa */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, marginBottom: 10, gap: 8 }}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={{ flex: 1, height: 38, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 }}
            placeholder="Pesquisar por professor, disciplina ou turma…"
            placeholderTextColor={Colors.textMuted}
            value={searchPlano}
            onChangeText={setSearchPlano}
          />
          {searchPlano.length > 0 && (
            <TouchableOpacity onPress={() => setSearchPlano('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtros de estado */}
        <FilterChips
          label="Estado"
          value={filtroPlanoStatus}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'submetido', label: 'Submetidos' },
            { value: 'aprovado', label: 'Aprovados' },
            { value: 'rejeitado', label: 'Rejeitados' },
          ]}
          onChange={setFiltroPlanoStatus}
        />

        {planosLoading && (
          <View style={{ padding: 12, marginTop: 8 }}>
            <SkeletonList rows={4} />
          </View>
        )}

        {!planosLoading && planosFiltrados.length === 0 && (
          <View style={st.empty}>
            <MaterialCommunityIcons name="book-education" size={40} color={Colors.textMuted} />
            <Text style={st.emptyTxt}>Nenhum plano encontrado</Text>
            <Text style={st.emptySub}>
              {q ? `Sem resultados para "${searchPlano}".` : filtroPlanoStatus === 'todos'
                ? 'Os professores ainda não submeteram planos de aula.'
                : `Não há planos com estado "${PLANO_STATUS_CFG[filtroPlanoStatus]?.label}".`}
            </Text>
          </View>
        )}

        {planosFiltrados.map(plano => {
          const cfg = PLANO_STATUS_CFG[plano.status] || PLANO_STATUS_CFG.rascunho;
          const podeRever = !isProf && (plano.status === 'aprovado' || plano.status === 'rejeitado');
          const podeDecidir = !isProf && plano.status === 'submetido';
          return (
            <View key={plano.id} style={[st.card, { marginBottom: 10, borderLeftWidth: 3, borderLeftColor: cfg.color }]}>
              {/* Cabeçalho */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={st.cardTitle}>{plano.disciplina}</Text>
                  <Text style={st.cardSub} numberOfLines={1}>{plano.sumario || plano.unidade || '—'}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                    {plano.professorNome} · {plano.turmaNome || '—'} · {plano.data || '—'}
                  </Text>
                </View>
                <View style={[st.badge, { backgroundColor: cfg.color + '22', borderColor: cfg.color + '55' }]}>
                  <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: cfg.color }}>{cfg.label}</Text>
                </View>
              </View>

              {/* Observação do director */}
              {plano.observacaoDirector ? (
                <View style={{ backgroundColor: (plano.status === 'rejeitado' ? Colors.danger : Colors.info) + '10', borderRadius: 8, padding: 8, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: (plano.status === 'rejeitado' ? Colors.danger : Colors.success) + '66' }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', color: plano.status === 'rejeitado' ? Colors.danger : Colors.success }}>
                      {plano.status === 'rejeitado' ? 'Motivo: ' : 'Obs: '}
                    </Text>
                    {plano.observacaoDirector}
                  </Text>
                </View>
              ) : null}

              {/* Auditoria */}
              {plano.aprovadoPor ? (
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 8 }}>
                  {plano.status === 'rejeitado' ? 'Rejeitado' : 'Aprovado'} por {plano.aprovadoPor}
                  {plano.aprovadoEm ? ` · ${plano.aprovadoEm.split('T')[0]}` : ''}
                </Text>
              ) : null}

              {/* Acções */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[st.btnSec, { flex: 1 }]}
                  onPress={() => setPreviewPlano(plano)}
                >
                  <MaterialCommunityIcons name="eye-outline" size={14} color={Colors.info} />
                  <Text style={[st.btnSecTxt, { color: Colors.info }]}>Visualizar</Text>
                </TouchableOpacity>

                {podeDecidir && (
                  <>
                    <TouchableOpacity
                      style={[st.btnSec, { flex: 1, borderColor: Colors.success + '55', backgroundColor: Colors.success + '12' }]}
                      onPress={() => {
                        if (inlineReview?.planoId === plano.id && inlineReview?.acao === 'aprovar') {
                          setInlineReview(null); setInlineObs('');
                        } else {
                          setInlineReview({ planoId: plano.id, acao: 'aprovar' }); setInlineObs('');
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="check-circle-outline" size={14} color={Colors.success} />
                      <Text style={[st.btnSecTxt, { color: Colors.success }]}>Aprovar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.btnSec, { flex: 1, borderColor: Colors.danger + '55', backgroundColor: Colors.danger + '12' }]}
                      onPress={() => {
                        if (inlineReview?.planoId === plano.id && inlineReview?.acao === 'rejeitar') {
                          setInlineReview(null); setInlineObs('');
                        } else {
                          setInlineReview({ planoId: plano.id, acao: 'rejeitar' }); setInlineObs('');
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="close-circle-outline" size={14} color={Colors.danger} />
                      <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Rejeitar</Text>
                    </TouchableOpacity>
                  </>
                )}

                {podeRever && (
                  <TouchableOpacity
                    style={[st.btnSec, { borderColor: '#f59e0b55', backgroundColor: '#f59e0b12' }]}
                    onPress={() => {
                      const novaAcao: 'aprovar' | 'rejeitar' = plano.status === 'aprovado' ? 'rejeitar' : 'aprovar';
                      if (inlineReview?.planoId === plano.id) {
                        setInlineReview(null); setInlineObs('');
                      } else {
                        setInlineReview({ planoId: plano.id, acao: novaAcao }); setInlineObs('');
                      }
                    }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={14} color="#f59e0b" />
                    <Text style={[st.btnSecTxt, { color: '#f59e0b' }]}>Rever Decisão</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Painel de revisão inline ─────────────────────────────── */}
              {inlineReview?.planoId === plano.id && (() => {
                const isAp = inlineReview.acao === 'aprovar';
                const panelColor = isAp ? Colors.success : Colors.danger;
                const isSaving = savingPlano;
                return (
                  <View style={{
                    marginTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: panelColor + '44',
                    paddingTop: 12,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: panelColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons
                          name={isAp ? 'check-circle-outline' : 'close-circle-outline'}
                          size={16} color={panelColor}
                        />
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: panelColor }}>
                        {isAp ? 'Aprovar plano de aula' : 'Devolver ao professor'}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 11, color: isAp ? Colors.textMuted : Colors.danger, fontFamily: 'Inter_500Medium', marginBottom: 4 }}>
                      {isAp ? 'Observação (opcional)' : 'Motivo da devolução *'}
                    </Text>
                    <TextInput
                      style={[st.input, {
                        height: 80,
                        textAlignVertical: 'top',
                        marginBottom: 10,
                        fontSize: 12,
                        borderColor: (!isAp && inlineObs.trim().length === 0) ? Colors.danger + '88' : Colors.border,
                      }]}
                      multiline
                      value={inlineObs}
                      onChangeText={setInlineObs}
                      editable={!isSaving}
                      placeholder={isAp
                        ? 'Notas ou feedback para o professor (opcional)…'
                        : 'Explique o que deve ser corrigido…'
                      }
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                    />

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[st.btnSec, { flex: 1, justifyContent: 'center', opacity: isSaving ? 0.5 : 1 }]}
                        onPress={() => { setInlineReview(null); setInlineObs(''); }}
                        disabled={isSaving}
                      >
                        <Text style={[st.btnSecTxt, { color: Colors.textSecondary }]}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.btnPrimary, { flex: 2, flexDirection: 'row', gap: 6, backgroundColor: panelColor, opacity: isSaving ? 0.7 : 1 }]}
                        onPress={() => isAp ? aprovarPlano(plano, inlineObs) : rejeitarPlano(plano, inlineObs)}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? <MaterialCommunityIcons name="loading" size={14} color="#fff" />
                          : <MaterialCommunityIcons name={isAp ? 'check-circle' : 'close-circle'} size={14} color="#fff" />
                        }
                        <Text style={st.btnPrimaryTxt}>
                          {isSaving ? 'A guardar…' : isAp ? 'Confirmar Aprovação' : 'Confirmar Devolução'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={{ marginTop: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, opacity: isSaving ? 0.4 : 1 }}
                      onPress={() => { setInlineReview({ planoId: plano.id, acao: isAp ? 'rejeitar' : 'aprovar' }); setInlineObs(''); }}
                      disabled={isSaving}
                    >
                      <MaterialCommunityIcons
                        name={isAp ? 'close-circle-outline' : 'check-circle-outline'}
                        size={13} color={Colors.textMuted}
                      />
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                        {isAp ? 'Rejeitar em vez disso' : 'Aprovar em vez disso'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          );
        })}

        {/* Preview modal */}
        {previewPlano && Platform.OS === 'web' && (
          <Modal visible animationType="slide" onRequestClose={() => setPreviewPlano(null)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: Colors.background }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface }}>
                  <TouchableOpacity onPress={() => setPreviewPlano(null)} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={22} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Plano de Aula</Text>
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>{previewPlano.professorNome} · {previewPlano.disciplina}</Text>
                  </View>
                  {!isProf && (previewPlano.status === 'submetido' || previewPlano.status === 'aprovado' || previewPlano.status === 'rejeitado') && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {previewPlano.status !== 'aprovado' && (
                        <TouchableOpacity
                          style={[st.btnSec, { borderColor: Colors.success + '55', backgroundColor: Colors.success + '12' }]}
                          onPress={() => { setPreviewPlano(null); setObsModalPlano({ plano: previewPlano, acao: 'aprovar' }); setObsText(''); }}
                        >
                          <MaterialCommunityIcons name="check" size={14} color={Colors.success} />
                          <Text style={[st.btnSecTxt, { color: Colors.success }]}>Aprovar</Text>
                        </TouchableOpacity>
                      )}
                      {previewPlano.status !== 'rejeitado' && (
                        <TouchableOpacity
                          style={[st.btnSec, { borderColor: Colors.danger + '55', backgroundColor: Colors.danger + '12' }]}
                          onPress={() => { setPreviewPlano(null); setObsModalPlano({ plano: previewPlano, acao: 'rejeitar' }); setObsText(''); }}
                        >
                          <MaterialCommunityIcons name="close" size={14} color={Colors.danger} />
                          <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Rejeitar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                <iframe
                  srcDoc={buildPlanoHTML(previewPlano)}
                  style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600 } as any}
                  title="Plano de Aula"
                />
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* Modal de aprovação / rejeição */}
        {obsModalPlano && (
          <Modal visible animationType="fade" transparent onRequestClose={() => !savingPlano && setObsModalPlano(null)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <View style={{ flex: 1, backgroundColor: '#000000bb', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                <View style={{ backgroundColor: Colors.background, borderRadius: 20, padding: 20, width: '100%', maxWidth: 480, borderTopWidth: 4, borderTopColor: acaoColor }}>

                  {/* Cabeçalho da modal */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: acaoColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons
                        name={isAprovar ? 'check-circle-outline' : 'close-circle-outline'}
                        size={20} color={acaoColor}
                      />
                    </View>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                      {isAprovar ? 'Aprovar Plano de Aula' : 'Rejeitar Plano de Aula'}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 16, marginLeft: 46 }}>
                    {obsModalPlano.plano.disciplina} · {obsModalPlano.plano.professorNome}
                  </Text>

                  {/* Campo de comentário */}
                  <Text style={[st.lbl, { color: isAprovar ? Colors.textSecondary : Colors.danger }]}>
                    {isAprovar ? 'Observação (opcional)' : 'Motivo da rejeição *'}
                  </Text>
                  <TextInput
                    style={[st.input, { height: 110, textAlignVertical: 'top', marginBottom: 16, borderColor: obsText.trim().length === 0 && !isAprovar ? Colors.danger + '66' : Colors.border }]}
                    multiline
                    value={obsText}
                    onChangeText={setObsText}
                    editable={!savingPlano}
                    placeholder={isAprovar ? 'Adicione notas ou feedback para o professor…' : 'Explique o motivo da rejeição para o professor poder corrigir o plano…'}
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />

                  {/* Botões */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[st.btnSec, { flex: 1, justifyContent: 'center', opacity: savingPlano ? 0.5 : 1 }]}
                      onPress={() => setObsModalPlano(null)}
                      disabled={savingPlano}
                    >
                      <Text style={[st.btnSecTxt, { color: Colors.textSecondary }]}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.btnPrimary, { flex: 1.5, flexDirection: 'row', gap: 6, backgroundColor: acaoColor, opacity: savingPlano ? 0.7 : 1 }]}
                      onPress={() => isAprovar
                        ? aprovarPlano(obsModalPlano.plano, obsText)
                        : rejeitarPlano(obsModalPlano.plano, obsText)
                      }
                      disabled={savingPlano}
                    >
                      {savingPlano ? (
                        <MaterialCommunityIcons name="loading" size={16} color="#fff" />
                      ) : (
                        <MaterialCommunityIcons name={isAprovar ? 'check-circle' : 'close-circle'} size={16} color="#fff" />
                      )}
                      <Text style={st.btnPrimaryTxt}>
                        {savingPlano ? 'A guardar…' : isAprovar ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Botão de troca de acção */}
                  <TouchableOpacity
                    style={[st.btnSec, { marginTop: 10, justifyContent: 'center', opacity: savingPlano ? 0.4 : 1 }]}
                    onPress={() => { setObsModalPlano({ plano: obsModalPlano.plano, acao: isAprovar ? 'rejeitar' : 'aprovar' }); setObsText(''); }}
                    disabled={savingPlano}
                  >
                    <MaterialCommunityIcons
                      name={isAprovar ? 'close-circle-outline' : 'check-circle-outline'}
                      size={14} color={Colors.textSecondary}
                    />
                    <Text style={[st.btnSecTxt, { color: Colors.textSecondary }]}>
                      {isAprovar ? 'Rejeitar em vez disso' : 'Aprovar em vez disso'}
                    </Text>
                  </TouchableOpacity>

                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}
      </ScrollView>
    );
  }

  // ── Render Provas ─────────────────────────────────────────────────────────
  function renderProvas() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Filter provas visible to this user (teachers only see their turmas)
    let provasVisiveis = calendarioProvas;
    if (isProf && meuProfessor) {
      const ids = (meuProfessor.turmasIds as string[]) || [];
      provasVisiveis = calendarioProvas.filter(p =>
        p.turmasIds.some(tid => ids.includes(tid))
      );
    }

    // Apply filters
    if (provaFilterTurma !== 'todas') {
      provasVisiveis = provasVisiveis.filter(p => p.turmasIds.includes(provaFilterTurma));
    }
    if (provaFilterTipo !== 'todos') {
      provasVisiveis = provasVisiveis.filter(p => p.tipo === provaFilterTipo);
    }

    const upcoming = provasVisiveis
      .filter(p => new Date(p.data) >= hoje)
      .sort((a,b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    const past = provasVisiveis
      .filter(p => new Date(p.data) < hoje)
      .sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const displayList = provaShowPast ? [...upcoming, ...past] : upcoming;

    function ProvaCard({ p }: { p: CalendarioProva }) {
      const cfg = TIPO_PROVA_CFG[p.tipo] || TIPO_PROVA_CFG.teste;
      const dataObj = new Date(p.data + 'T12:00:00');
      const isPast = dataObj < hoje;
      const diffMs = dataObj.getTime() - hoje.getTime();
      const diffDays = Math.ceil(diffMs / 86400000);
      const diasLabel = isPast
        ? `Há ${Math.abs(diffDays)} dia${Math.abs(diffDays) !== 1 ? 's' : ''}`
        : diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' : `Em ${diffDays} dias`;
      const diasColor = isPast ? Colors.textMuted : diffDays <= 3 ? Colors.danger : diffDays <= 7 ? Colors.warning : Colors.success;
      const turmasNomes = p.turmasIds.map(tid => turmas.find(t => t.id === tid)?.nome || tid).join(', ');

      return (
        <View style={[st.card, isPast && { opacity: 0.65 }, { borderLeftWidth: 3, borderLeftColor: cfg.color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: cfg.color + '1A', borderWidth: 1, borderColor: cfg.color + '40', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={st.cardTitle} numberOfLines={1}>{p.titulo}</Text>
                {!p.publicado && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: Colors.textMuted + '22' }}>
                    <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted }}>Rascunho</Text>
                  </View>
                )}
              </View>
              <Text style={st.cardSub}>{p.disciplina || 'Todas as disciplinas'}</Text>
              {!!turmasNomes && <Text style={st.cardSub}>{turmasNomes}</Text>}
              {!!p.descricao && <Text style={[st.detRow, { marginTop: 4 }]} numberOfLines={2}>{p.descricao}</Text>}
            </View>
          </View>

          {/* Date + time row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border + '40' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>
                {dataObj.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            {!!p.hora && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>{p.hora}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: diasColor + '18' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: diasColor }}>{diasLabel}</Text>
            </View>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: cfg.color + '18', borderWidth: 1, borderColor: cfg.color + '35' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: cfg.color }}>{cfg.label}</Text>
            </View>
          </View>

          {/* Actions (only admin/director) */}
          {!isProf && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={() => togglePublicarProva(p)} style={[st.btnSec, { flex: 1 }]}>
                <Ionicons name={p.publicado ? 'eye-off-outline' : 'eye-outline'} size={13} color={p.publicado ? Colors.warning : Colors.success} />
                <Text style={[st.btnSecTxt, { color: p.publicado ? Colors.warning : Colors.success }]}>
                  {p.publicado ? 'Retirar' : 'Publicar'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setEditProva(p);
                setFormProva({ titulo: p.titulo, descricao: p.descricao, turmasIds: p.turmasIds, disciplina: p.disciplina, data: p.data, hora: p.hora, tipo: p.tipo, publicado: p.publicado });
                setShowProvaModal(true);
              }} style={st.btnSec}>
                <Ionicons name="pencil" size={13} color={Colors.info} />
                <Text style={[st.btnSecTxt, { color: Colors.info }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteProvaItem(p.id)} style={st.btnSec}>
                <Ionicons name="trash" size={13} color={Colors.danger} />
                <Text style={[st.btnSecTxt, { color: Colors.danger }]}>Remover</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    return (
      <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ padding: 14, paddingBottom: bottom + 80 }}>

        <CollapsibleStats storageKey="ped-provas-kpi" title="Resumo do Calendário" color={Colors.gold}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {Object.entries(TIPO_PROVA_CFG).map(([key, cfg]) => {
              const count = provasVisiveis.filter(p => p.tipo === key).length;
              return (
                <View key={key} style={[st.kpi, { flex: 1, borderLeftWidth: 2, borderLeftColor: cfg.color }]}>
                  <Text style={[st.kpiVal, { color: cfg.color }]}>{count}</Text>
                  <Text style={st.kpiLbl}>{cfg.label}{count !== 1 ? 's' : ''}</Text>
                </View>
              );
            })}
          </View>
        </CollapsibleStats>

        {/* Filters */}
        <View style={st.filterPanel}>
          <HScrollChips label="Turma" icon="google-classroom" iconColor={Colors.gold}
            value={provaFilterTurma}
            options={[{ value: 'todas', label: 'Todas' }, ...turmasVisiveis.map(t => ({ value: t.id, label: t.nome }))]}
            onChange={setProvaFilterTurma} />
          <View style={st.fDivider} />
          <HScrollChips label="Tipo" icon="calendar-check" iconColor={Colors.info}
            value={provaFilterTipo}
            options={[{ value: 'todos', label: 'Todos' }, ...Object.entries(TIPO_PROVA_CFG).map(([k, v]) => ({ value: k, label: v.label }))]}
            onChange={setProvaFilterTipo} />
        </View>

        {/* Toggle passadas */}
        <TouchableOpacity
          onPress={() => setProvaShowPast(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 6, marginBottom: 8 }}
        >
          <Ionicons name={provaShowPast ? 'checkbox' : 'square-outline'} size={16} color={provaShowPast ? Colors.gold : Colors.textMuted} />
          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Mostrar provas passadas</Text>
        </TouchableOpacity>

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
              <MaterialCommunityIcons name="calendar-clock" size={15} color={Colors.gold} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Próximas · {upcoming.length}
              </Text>
            </View>
            {upcoming.map(p => <ProvaCard key={p.id} p={p} />)}
          </>
        )}

        {/* Past (when toggled) */}
        {provaShowPast && past.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 16 }}>
              <MaterialCommunityIcons name="history" size={15} color={Colors.textMuted} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Realizadas · {past.length}
              </Text>
            </View>
            {past.map(p => <ProvaCard key={p.id} p={p} />)}
          </>
        )}

        {displayList.length === 0 && (
          <View style={st.empty}>
            <MaterialCommunityIcons name="calendar-check" size={44} color={Colors.textMuted} />
            <Text style={st.emptyTxt}>Nenhuma prova agendada.</Text>
            <Text style={st.emptySub}>
              {isProf ? 'A direcção ainda não agendou provas para as suas turmas.' : 'Usa o botão "Agendar Prova" para criar o primeiro evento.'}
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Modal Prova ───────────────────────────────────────────────────────────
  function renderProvaModal() {
    if (isProf) return null;
    return (
      <Modal visible={showProvaModal} animationType="fade" transparent onRequestClose={() => { setShowProvaModal(false); setEditProva(null); setFormProva(defaultProva); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={st.modalTitle}>{editProva ? 'Editar Prova' : 'Agendar Prova'}</Text>
                <TouchableOpacity onPress={() => { setShowProvaModal(false); setEditProva(null); setFormProva(defaultProva); }}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* Tipo */}
              <Text style={st.lbl}>Tipo de Avaliação<RequiredMark /></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {Object.entries(TIPO_PROVA_CFG).map(([key, cfg]) => (
                  <TouchableOpacity key={key} onPress={() => setFormProva(p => ({ ...p, tipo: key as CalendarioProva['tipo'] }))}
                    style={[st.chip, formProva.tipo === key && { backgroundColor: cfg.color + '22', borderColor: cfg.color }]}>
                    <MaterialCommunityIcons name={cfg.icon as any} size={13} color={formProva.tipo === key ? cfg.color : Colors.textMuted} />
                    <Text style={[st.chipText, formProva.tipo === key && { color: cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Título */}
              <Text style={st.lbl}>Título<RequiredMark /></Text>
              <TextInput style={[st.input, { marginBottom: 14 }]} placeholderTextColor={Colors.textMuted}
                value={formProva.titulo} onChangeText={v => setFormProva(p => ({ ...p, titulo: v }))}
                placeholder="Ex: Teste de Matemática — 1º Trimestre" returnKeyType="next" blurOnSubmit={false} />

              {/* Disciplina */}
              <Text style={st.lbl}>Disciplina</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <TouchableOpacity onPress={() => setFormProva(p => ({ ...p, disciplina: '' }))}
                  style={[st.chip, !formProva.disciplina && st.chipActive]}>
                  <Text style={[st.chipText, !formProva.disciplina && st.chipTextActive]}>Todas</Text>
                </TouchableOpacity>
                {disciplinasVisiveis.map(d => (
                  <TouchableOpacity key={d} onPress={() => setFormProva(p => ({ ...p, disciplina: d }))}
                    style={[st.chip, formProva.disciplina === d && st.chipActive]}>
                    <Text style={[st.chipText, formProva.disciplina === d && st.chipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Turmas */}
              <Text style={st.lbl}>Turmas</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {turmas.filter(t => t.ativo).map(t => {
                  const sel = formProva.turmasIds.includes(t.id);
                  return (
                    <TouchableOpacity key={t.id}
                      onPress={() => setFormProva(p => ({ ...p, turmasIds: sel ? p.turmasIds.filter(id => id !== t.id) : [...p.turmasIds, t.id] }))}
                      style={[st.chip, sel && st.chipActive]}>
                      <Text style={[st.chipText, sel && st.chipTextActive]}>{t.nome}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Data + Hora */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 2 }}>
                  <Text style={st.lbl}>Data<RequiredMark /></Text>
                  <DateInput style={st.input} value={formProva.data} onChangeText={v => setFormProva(p => ({ ...p, data: v }))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.lbl}>Hora</Text>
                  <TextInput style={st.input} placeholderTextColor={Colors.textMuted}
                    value={formProva.hora} onChangeText={v => setFormProva(p => ({ ...p, hora: v }))}
                    placeholder="08:00" keyboardType="numbers-and-punctuation" />
                </View>
              </View>

              {/* Descrição */}
              <Text style={st.lbl}>Observações / Matéria a avaliar</Text>
              <TextInput style={[st.input, { height: 80, textAlignVertical: 'top', marginBottom: 14 }]}
                multiline placeholderTextColor={Colors.textMuted}
                value={formProva.descricao} onChangeText={v => setFormProva(p => ({ ...p, descricao: v }))}
                placeholder="Conteúdos abrangidos, instruções especiais..." />

              {/* Publicar */}
              <TouchableOpacity onPress={() => setFormProva(p => ({ ...p, publicado: !p.publicado }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <Ionicons name={formProva.publicado ? 'checkbox' : 'square-outline'} size={20} color={formProva.publicado ? Colors.success : Colors.textMuted} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text }}>
                  Publicar imediatamente (visível para alunos e professores)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.btnPrimary} onPress={saveProva}>
                <Text style={st.btnPrimaryTxt}>{editProva ? 'Actualizar Prova' : 'Agendar Prova'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ── Alunos a Exame (tab pedagógica) ─────────────────────────────────────
  function renderExames() {
    const turmaNomes = turmas.reduce<Record<string, string>>((acc, t) => { acc[t.id] = t.nome; return acc; }, {});

    const alunosFiltrados = (exameData?.alunos ?? []).filter(al => {
      const nomeMatch = !exameSearch || (al.alunoNome ?? '').toLowerCase().includes(exameSearch.toLowerCase());
      const turmaMatch = exameFiltroTurma === 'todas' || al.turmaId === exameFiltroTurma || (al.turmaNome ?? '').toLowerCase().includes(exameFiltroTurma.toLowerCase());
      return nomeMatch && turmaMatch;
    });

    const turmasComExame = Array.from(new Set((exameData?.alunos ?? []).map((al: any) => al.turmaNome).filter(Boolean)));

    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={exameLoading} onRefresh={loadExameData} />}
        contentContainerStyle={{ padding: 12, paddingBottom: bottom + 80 }}>

        {/* Cabeçalho / KPIs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: Colors.warning + '18', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.warning + '30' }}>
            <MaterialCommunityIcons name="clipboard-alert" size={22} color={Colors.warning} />
            <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.warning, marginTop: 4 }}>
              {exameData?.total ?? '—'}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>Total a Exame</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}>
            <MaterialCommunityIcons name="school-outline" size={22} color={Colors.gold} />
            <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.gold, marginTop: 4 }}>
              {turmasComExame.length}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>Turmas Afectadas</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}>
            <MaterialCommunityIcons name="counter" size={22} color={Colors.info} />
            <Text style={{ fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.info, marginTop: 4 }}>
              {exameData?.notaMin ?? '—'}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>Nota Mínima</Text>
          </View>
        </View>

        {/* Acções */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.border }}
            onPress={async () => {
              if (Platform.OS === 'web') {
                try {
                  let token = await getAuthToken();
                  if (!token) { webAlert('Sessão expirada', 'Faça login novamente.'); return; }
                  const base = getApiUrl();
                  const url = new URL('/api/disciplinas/alunos-prova/html', base).toString();
                  let resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
                  if (resp.status === 401) {
                    const newToken = await refreshAccessToken();
                    if (newToken) {
                      resp = await fetch(url, { headers: { Authorization: `Bearer ${newToken}` }, credentials: 'include' });
                    }
                  }
                  if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(t || `Erro ${resp.status}`); }
                  const html = await resp.text();
                  const blob = new Blob([html], { type: 'text/html' });
                  const blobUrl = URL.createObjectURL(blob);
                  window.open(blobUrl, '_blank');
                } catch (e: any) { webAlert('Erro', e?.message || 'Não foi possível gerar o PDF.'); }
              }
            }}>
            <MaterialCommunityIcons name="printer-outline" size={16} color={Colors.accent} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.accent }}>Imprimir / PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.warning, borderRadius: 10, padding: 10 }, (exameNotificando || !exameData || exameData.total === 0) && { opacity: 0.6 }]}
            onPress={notificarExames}
            disabled={exameNotificando || !exameData || exameData.total === 0}>
            {exameNotificando
              ? <AppLoader color="#fff" />
              : <>
                  <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#fff" />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#fff' }}>Notificar Encarregados</Text>
                </>
            }
          </TouchableOpacity>
        </View>

        {/* Filtros */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <StableSearchInput
              value={exameSearch}
              onChangeText={setExameSearch}
              placeholder="Pesquisar aluno..."
            />
          </View>
        </View>
        <HScrollChips
          label="Turma" icon="google-classroom" iconColor={Colors.gold}
          value={exameFiltroTurma}
          options={[{ value: 'todas', label: 'Todas' }, ...turmas.map(t => ({ value: t.id, label: t.nome }))]}
          onChange={setExameFiltroTurma}
        />

        {/* Conteúdo */}
        <View style={{ marginTop: 8 }}>
          {exameLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
              <AppLoader color={Colors.warning} />
              <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 }}>A carregar...</Text>
            </View>
          ) : !exameData ? (
            <View style={st.empty}>
              <MaterialCommunityIcons name="alert-circle-outline" size={40} color={Colors.textMuted} />
              <Text style={st.emptyTxt}>Erro ao carregar dados.</Text>
              <TouchableOpacity onPress={loadExameData} style={{ marginTop: 8 }}>
                <Text style={{ color: Colors.gold, fontFamily: 'Inter_500Medium' }}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : alunosFiltrados.length === 0 ? (
            <View style={st.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={Colors.success} />
              <Text style={st.emptyTxt}>
                {exameData.total === 0 ? 'Nenhum aluno a exame' : 'Nenhum resultado para o filtro aplicado'}
              </Text>
              <Text style={st.emptySub}>
                {exameData.total === 0
                  ? 'Todos os alunos têm média igual ou superior ao mínimo nas disciplinas de fecho.'
                  : 'Ajuste o filtro de turma ou a pesquisa.'}
              </Text>
            </View>
          ) : (
            alunosFiltrados.map((al: any, i: number) => {
              const isTerm = al.tipoDisciplina === 'terminal';
              const media = parseFloat(al.mediaAnual);
              return (
                <View key={i} style={[st.card, st.cardMobile, { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }]}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isTerm ? Colors.warning + '20' : Colors.info + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons
                      name={isTerm ? 'flag-checkered' : 'arrow-right-bold-circle'}
                      size={18}
                      color={isTerm ? Colors.warning : Colors.info}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.cardTitle, st.cardTitleMobile]}>{al.alunoNome}</Text>
                    <Text style={[st.cardSub, st.cardSubMobile]}>{al.classe} · {al.turmaNome} · {al.anoLetivo}</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{al.disciplina}</Text>
                  </View>
                  <View style={{ alignItems: 'center', backgroundColor: Colors.warning + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.warning + '30' }}>
                    <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{media.toFixed(1)}</Text>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>val.</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  }

  function renderFAB() {
    if (tab === 'resultados' || tab === 'planos_aula' || tab === 'exames') return null;
    if (tab === 'provas' && isProf) return null;
    const labels: Record<TabKey, string> = {
      planificacoes: 'Nova Planificação',
      programa:      'Novo Conteúdo',
      ocorrencias:   'Nova Ocorrência',
      resultados:    '',
      exames:        '',
      planos_aula:   '',
      provas:        'Agendar Prova',
    };
    const handlers: Record<TabKey, () => void> = {
      planificacoes: () => { setEditPlan(null); setFormPlan(defaultPlan); setShowPlanModal(true); },
      programa:      () => { setEditProg(null); setFormProg(defaultProg); setShowProgModal(true); },
      ocorrencias:   () => { setEditOco(null);  setFormOco(defaultOco);  setShowOcoModal(true); },
      resultados:    () => {},
      exames:        () => {},
      planos_aula:   () => {},
      provas:        () => { setEditProva(null); setFormProva(defaultProva); setShowProvaModal(true); },
    };
    return (
      <TouchableOpacity style={[st.fab, { bottom: bottom + 80 }]} onPress={handlers[tab]}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={st.fabLabel}>{labels[tab]}</Text>
      </TouchableOpacity>
    );
  }

  // ── Modal Planificação ────────────────────────────────────────────────────
  function renderPlanModal() {
    return (
      <Modal visible={showPlanModal} animationType="fade" transparent onRequestClose={() => setShowPlanModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={st.modalTitle}>{editPlan ? 'Editar Planificação' : 'Nova Planificação'}</Text>
            <TouchableOpacity onPress={() => setShowPlanModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={st.lbl}>Turma<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {turmasVisiveis.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setFormPlan(p => ({ ...p, turmaId: t.id }))}
                style={[st.chip, formPlan.turmaId === t.id && st.chipActive]}>
                <Text style={[st.chipText, formPlan.turmaId === t.id && st.chipTextActive]}>{t.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Disciplina<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {disciplinasVisiveis.map(d => (
              <TouchableOpacity key={d} onPress={() => setFormPlan(p => ({ ...p, disciplina: d }))}
                style={[st.chip, formPlan.disciplina === d && st.chipActive]}>
                <Text style={[st.chipText, formPlan.disciplina === d && st.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>Trimestre<RequiredMark /></Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {TRIMESTRES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setFormPlan(p => ({ ...p, trimestre: t }))}
                    style={[st.chip, formPlan.trimestre === t && st.chipActive]}>
                    <Text style={[st.chipText, formPlan.trimestre === t && st.chipTextActive]}>{t}º</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>Semana<RequiredMark /></Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={String(formPlan.semana)}
                onChangeText={v => setFormPlan(p => ({ ...p, semana: parseInt(v)||1 }))} returnKeyType="next" blurOnSubmit={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>Nº Aulas</Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={formPlan.numAulas}
                onChangeText={v => setFormPlan(p => ({ ...p, numAulas: v }))} returnKeyType="done" onSubmitEditing={savePlan} />
            </View>
          </View>

          {([['tema','Tema / Título *'],['objectivos','Objectivos'],['conteudos','Conteúdos'],['metodologia','Metodologia'],['recursos','Recursos Necessários'],['avaliacao','Avaliação'],['observacoes','Observações']] as [keyof typeof formPlan, string][]).map(([key, label]) => (
            <View key={key} style={{ marginBottom: 14 }}>
              <Text style={st.lbl}>{label}</Text>
              <TextInput style={[st.input, { height: key === 'tema' ? 44 : 80, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted}
                multiline={key !== 'tema'}
                value={String(formPlan[key])}
                onChangeText={v => setFormPlan(p => ({ ...p, [key]: v }))}
                placeholder={label}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          ))}

          <TouchableOpacity style={st.btnPrimary} onPress={savePlan}>
            <Text style={st.btnPrimaryTxt}>{editPlan ? 'Actualizar' : 'Criar Planificação'}</Text>
          </TouchableOpacity>
        </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    );
  }

  // ── Modal Conteúdo Programático ───────────────────────────────────────────
  function renderProgModal() {
    return (
      <Modal visible={showProgModal} animationType="fade" transparent onRequestClose={() => setShowProgModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={st.modalTitle}>{editProg ? 'Editar Conteúdo' : 'Novo Conteúdo'}</Text>
            <TouchableOpacity onPress={() => setShowProgModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={st.lbl}>Disciplina<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {disciplinasVisiveis.map(d => (
              <TouchableOpacity key={d} onPress={() => setFormProg(p => ({ ...p, disciplina: d }))}
                style={[st.chip, formProg.disciplina === d && st.chipActive]}>
                <Text style={[st.chipText, formProg.disciplina === d && st.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Classe<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {classes.map(c => (
              <TouchableOpacity key={c} onPress={() => setFormProg(p => ({ ...p, classe: c }))}
                style={[st.chip, formProg.classe === c && st.chipActive]}>
                <Text style={[st.chipText, formProg.classe === c && st.chipTextActive]}>{c}ª</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Trimestre<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {TRIMESTRES.map(t => (
              <TouchableOpacity key={t} onPress={() => setFormProg(p => ({ ...p, trimestre: t }))}
                style={[st.chip, formProg.trimestre === t && st.chipActive]}>
                <Text style={[st.chipText, formProg.trimestre === t && st.chipTextActive]}>{t}º Trim.</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Título<RequiredMark /></Text>
          <TextInput style={[st.input, { marginBottom: 14 }]} value={formProg.titulo}
            onChangeText={v => setFormProg(p => ({ ...p, titulo: v }))}
            placeholder="Ex: Funções e Gráficos" placeholderTextColor={Colors.textMuted} returnKeyType="next" blurOnSubmit={false} />

          <Text style={st.lbl}>Descrição</Text>
          <TextInput style={[st.input, { height: 80, textAlignVertical: 'top', marginBottom: 14 }]} placeholderTextColor={Colors.textMuted}
            multiline value={formProg.descricao}
            onChangeText={v => setFormProg(p => ({ ...p, descricao: v }))}
            placeholder="Descrição detalhada..." placeholderTextColor={Colors.textMuted} />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>% Cumprimento</Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={formProg.percentagem}
                onChangeText={v => setFormProg(p => ({ ...p, percentagem: v }))} returnKeyType="next" blurOnSubmit={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>Ordem</Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={formProg.ordem}
                onChangeText={v => setFormProg(p => ({ ...p, ordem: v }))} returnKeyType="done" onSubmitEditing={saveProg} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setFormProg(p => ({ ...p, cumprido: !p.cumprido }))}
              style={[st.badge, { backgroundColor: formProg.cumprido ? Colors.success + '22' : Colors.border }]}>
              <Ionicons name={formProg.cumprido ? 'checkmark-circle' : 'ellipse-outline'} size={20}
                color={formProg.cumprido ? Colors.success : Colors.textMuted} />
              <Text style={{ color: formProg.cumprido ? Colors.success : Colors.textMuted, fontFamily: 'Inter_500Medium' }}>
                {formProg.cumprido ? 'Cumprido' : 'Marcar como cumprido'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={st.btnPrimary} onPress={saveProg}>
            <Text style={st.btnPrimaryTxt}>{editProg ? 'Actualizar' : 'Adicionar Conteúdo'}</Text>
          </TouchableOpacity>
        </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    );
  }

  // ── Modal Ocorrência ──────────────────────────────────────────────────────
  function renderOcoModal() {
    const alunosTurma = formOco.turmaId ? alunos.filter(a => a.turmaId === formOco.turmaId && a.ativo) : [];
    return (
      <Modal visible={showOcoModal} animationType="fade" transparent onRequestClose={() => setShowOcoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={st.modalTitle}>{editOco ? 'Editar Ocorrência' : 'Nova Ocorrência'}</Text>
            <TouchableOpacity onPress={() => setShowOcoModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={st.lbl}>Turma<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {turmasVisiveis.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setFormOco(p => ({ ...p, turmaId: t.id, alunoId: '' }))}
                style={[st.chip, formOco.turmaId === t.id && st.chipActive]}>
                <Text style={[st.chipText, formOco.turmaId === t.id && st.chipTextActive]}>{t.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {formOco.turmaId !== '' && (
            <>
              <Text style={st.lbl}>Aluno<RequiredMark /></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {alunosTurma.map(a => (
                  <TouchableOpacity key={a.id} onPress={() => setFormOco(p => ({ ...p, alunoId: a.id }))}
                    style={[st.chip, formOco.alunoId === a.id && st.chipActive]}>
                    <Text style={[st.chipText, formOco.alunoId === a.id && st.chipTextActive]}>{a.nome} {a.apelido}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={st.lbl}>Tipo de Ocorrência<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {TIPOS_OCO.map(t => (
              <TouchableOpacity key={t} onPress={() => setFormOco(p => ({ ...p, tipo: t }))}
                style={[st.chip, formOco.tipo === t && st.chipActive]}>
                <Text style={[st.chipText, formOco.tipo === t && st.chipTextActive]}>{TIPO_OCO_LABEL[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Gravidade<RequiredMark /></Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {(['leve','moderada','grave'] as const).map(g => (
              <TouchableOpacity key={g} onPress={() => setFormOco(p => ({ ...p, gravidade: g }))}
                style={[st.chip, formOco.gravidade === g && { backgroundColor: GRAVIDADE_CFG[g].color + '33', borderColor: GRAVIDADE_CFG[g].color }]}>
                <Text style={[st.chipText, formOco.gravidade === g && { color: GRAVIDADE_CFG[g].color }]}>{GRAVIDADE_CFG[g].label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.lbl}>Data<RequiredMark /></Text>
          <DateInput style={[st.input, { marginBottom: 14 }]} value={formOco.data} onChangeText={v => setFormOco(p => ({ ...p, data: v }))} />

          <Text style={st.lbl}>Descrição da Ocorrência<RequiredMark /></Text>
          <TextInput style={[st.input, { height: 90, textAlignVertical: 'top', marginBottom: 14 }]} placeholderTextColor={Colors.textMuted}
            multiline value={formOco.descricao}
            onChangeText={v => setFormOco(p => ({ ...p, descricao: v }))}
            placeholder="Descreva o incidente..." placeholderTextColor={Colors.textMuted} />

          <Text style={st.lbl}>Medida Tomada</Text>
          <TextInput style={[st.input, { height: 70, textAlignVertical: 'top', marginBottom: 14 }]} placeholderTextColor={Colors.textMuted}
            multiline value={formOco.medidaTomada}
            onChangeText={v => setFormOco(p => ({ ...p, medidaTomada: v }))}
            placeholder="Acção disciplinar tomada..." placeholderTextColor={Colors.textMuted} />

          <Text style={st.lbl}>Observações</Text>
          <TextInput style={[st.input, { height: 60, textAlignVertical: 'top', marginBottom: 20 }]} placeholderTextColor={Colors.textMuted}
            multiline value={formOco.observacoes}
            onChangeText={v => setFormOco(p => ({ ...p, observacoes: v }))}
            placeholder="Notas adicionais..." placeholderTextColor={Colors.textMuted} />

          <TouchableOpacity style={st.btnPrimary} onPress={saveOco}>
            <Text style={st.btnPrimaryTxt}>{editOco ? 'Actualizar' : 'Registar Ocorrência'}</Text>
          </TouchableOpacity>
        </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    );
  }

  // ── Root ──────────────────────────────────────────────────────────────────
  useEnterToSave(savePlan, showPlanModal);
  useEnterToSave(saveProg, showProgModal);
  useEnterToSave(saveOco, showOcoModal);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={PEDAGOGICO_TOUR_STEPS} storageKey={PEDAGOGICO_TOUR_KEY} />
      <TopBar title="Área Pedagógica" rightAction={{ icon: 'compass-outline', onPress: openTour }} />
      <TouchableOpacity
        onPress={() => router.push('/(main)/acompanhamento-pautas' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 10, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#E11D48' + '55', backgroundColor: '#E11D48' + '14',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E11D48' + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="clipboard" size={18} color="#E11D48" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Acompanhamento de Pautas</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Monitorizar submissões dos professores e prazos</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#E11D48" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/(main)/exame-extraordinario' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: Colors.warning + '55', backgroundColor: Colors.warning + '12',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.warning + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Exame Extraordinário</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Art. 23º §3 §4 — Matrículas condicionais e exames do 1.º trimestre</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/exame-recurso' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#f9741655', backgroundColor: '#f9741612',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f9741622', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="refresh-circle-outline" size={18} color="#f97316" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Exame de Recurso</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Art. 33º — Identificar alunos elegíveis por turma/classe</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#f97316" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/melhoria-nota' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#8b5cf655', backgroundColor: '#8b5cf612',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8b5cf622', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trending-up-outline" size={18} color="#8b5cf6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Exame de Melhoria de Nota</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Art. 36º — Gerir solicitações de melhoria dos alunos</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#8b5cf6" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/pedidos-reapreciacao' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#0284c755', backgroundColor: '#0284c712',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0284c722', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="document-text-outline" size={18} color="#0284c7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Pedido de Reapreciação</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Art. 38º — Reapreciação de notas com comissão (48h)</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#0284c7" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/conselho' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#16a34a55', backgroundColor: '#16a34a12',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#16a34a22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people-outline" size={18} color="#16a34a" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Conselho de Avaliação</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Reuniões, deliberações e validação de pautas</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#16a34a" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/diagnostica' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#0891b255', backgroundColor: '#0891b212',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0891b222', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="analytics-outline" size={18} color="#0891b2" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Avaliação Diagnóstica</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Registo e acompanhamento das avaliações diagnósticas</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#0891b2" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push('/(main)/formativa' as any)}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginHorizontal: 12, marginTop: 4, marginBottom: 4,
          paddingHorizontal: 14, paddingVertical: 12,
          borderRadius: 12, borderWidth: 1,
          borderColor: '#4f46e555', backgroundColor: '#4f46e512',
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#4f46e522', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bar-chart-outline" size={18} color="#4f46e5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Avaliação Formativa</Text>
          <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 }}>Registar e consultar avaliações formativas por turma</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#4f46e5" />
      </TouchableOpacity>

      {renderTabBar()}
      {isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>A carregar dados...</Text>
        </View>
      ) : (
        <>
          {tab === 'planificacoes'  && renderPlanificacoes()}
          {tab === 'programa'       && renderPrograma()}
          {tab === 'resultados'     && renderResultados()}
          {tab === 'exames'         && renderExames()}
          {tab === 'ocorrencias'    && renderOcorrencias()}
          {tab === 'planos_aula'    && renderPlanosAula()}
          {tab === 'provas'         && renderProvas()}
          {tab === 'exame_nacional' && <ExameNacionalTab />}
        </>
      )}
      {renderFAB()}
      {renderPlanModal()}
      {renderProgModal()}
      {renderOcoModal()}
      {renderProvaModal()}
      <DisciplinaPickerModal
        visible={showDisciplinaModal}
        disciplines={disciplinasVisiveis}
        value={selDisciplina}
        onChange={setSelDisciplina}
        onClose={() => setShowDisciplinaModal(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  kpi: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  kpiVal: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text },
  kpiLbl: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2, textAlign: 'center' },
  kpiMobile: { padding: 8 },
  kpiValMobile: { fontSize: 18 },
  kpiLblMobile: { fontSize: 9 },
  secLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    letterSpacing: 1, marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cardMobile: { padding: 12 },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  cardTitleMobile: { fontSize: 13 },
  cardSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  cardSubMobile: { fontSize: 11 },
  detRow: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  detLbl: { fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
  },
  badgeMobile: { paddingHorizontal: 6, paddingVertical: 3 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  chipText:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  chipTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  filterLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 2 },
  // ── New professional filter styles ────────────────────────────────────────
  filterPanel: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  filterPanelMobile: { marginBottom: 10 },
  hChipWrap: {
    flex: 1,
    minWidth: 0,
  },
  hChipScroll: {
    gap: 5,
    paddingVertical: 2,
    alignItems: 'center',
    flexGrow: 1,
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  fRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  fRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 78,
    flexShrink: 0,
  },
  fRowLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  fDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },
  // Horizontal scrollable chips
  hChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  hChipActive: {
    backgroundColor: Colors.gold + '20',
    borderColor: Colors.gold,
  },
  hChipTxt: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  hChipTxtActive: {
    color: Colors.gold,
    fontFamily: 'Inter_600SemiBold',
  },
  // Segmented control
  segCtrl: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: Colors.gold + '28',
  },
  segBtnTxt: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  segBtnTxtActive: {
    color: Colors.gold,
    fontFamily: 'Inter_600SemiBold',
  },
  // Dropdown button
  dropBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropBtnActive: {
    backgroundColor: Colors.gold + '14',
    borderColor: Colors.gold + '60',
  },
  dropBtnTxt: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  dropBtnTxtActive: {
    color: Colors.gold,
    fontFamily: 'Inter_600SemiBold',
  },
  btnSec: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  btnSecTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  btnPrimary: {
    backgroundColor: Colors.gold, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  btnPrimaryTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },
  fab: {
    position: 'absolute', right: 20,
    height: 44, borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: 'row', gap: 6,
    backgroundColor: Colors.gold, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  fabLabel: {
    color: Colors.primaryDark, fontFamily: 'Inter_700Bold', fontSize: 13,
  },
  searchInput: {
    backgroundColor: Colors.backgroundCard, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, color: Colors.text, fontFamily: 'Inter_400Regular',
    fontSize: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  lbl: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.backgroundElevated, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, color: Colors.text, fontFamily: 'Inter_400Regular',
    fontSize: 14, borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
