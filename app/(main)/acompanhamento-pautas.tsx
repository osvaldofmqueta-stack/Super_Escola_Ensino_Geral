import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {Alert, Animated, Easing, KeyboardAvoidingView, Linking, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { webAlert } from '@/utils/webAlert';
import { getApiUrl } from '@/lib/query-client';
import { getAuthToken } from '@/context/AuthContext';
import { buildPautaFinalHtml } from '@/lib/pautaFinalGen';
import PautaFinalPreviewModal from '@/components/PautaFinalPreviewModal';
import { StableSearchInput } from '@/components/StableSearchInput';
import DateInput from '@/components/DateInput';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAUTA_FINAL_IMPRESSA_KEY = '@siga_pauta_final_impressa_v1';

type Estado = 'submetida' | 'em_lancamento' | 'nao_iniciada' | 'atrasada' | 'sem_professor';
type Trimestre = 1 | 2 | 3;
type ViewMode = 'por_pauta' | 'por_professor';

interface Item {
  turmaId: string; turmaNome: string; classe?: string;
  cursoId?: string | null; cursoNome?: string | null;
  disciplina: string;
  professorId: string | null; professorNome: string | null;
  pautaId: string | null; status: string | null;
  estado: Estado;
  dataFecho: string | null;
  lancamentoAdmin: boolean;
  lancadoPorAdminNome: string | null;
  lancadoPorAdminEm: string | null;
  lancadoPorAdminMotivo: string | null;
  totalAlunos: number;
  alunosComNota: number;
  progressoPct: number;
}
interface ProfAgg {
  professorId: string | null; professorNome: string;
  total: number; submetidas: number; em_lancamento: number;
  nao_iniciadas: number; atrasadas: number; lancamentos_admin: number;
  cumprimentoPct: number;
  pautas: Item[];
}
interface Resumo {
  total: number; submetidas: number; em_lancamento: number;
  nao_iniciadas: number; atrasadas: number; sem_professor: number;
  lancamentos_admin: number;
}
interface Resp {
  trimestre: number; anoLetivo: string;
  dataLimite: string | null; prazoExpirado: boolean; diasRestantes: number | null;
  resumo: Resumo;
  items: Item[];
  professores?: ProfAgg[];
}

const ESTADO_INFO: Record<Estado, { label: string; color: string; icon: string }> = {
  submetida:      { label: 'Submetida',      color: Colors.success, icon: 'checkmark-circle' },
  em_lancamento:  { label: 'Em lançamento',  color: Colors.info,    icon: 'create' },
  nao_iniciada:   { label: 'Não iniciada',   color: Colors.textMuted, icon: 'ellipse-outline' },
  atrasada:       { label: 'Atrasada',       color: Colors.danger,  icon: 'alert-circle' },
  sem_professor:  { label: 'Sem professor',  color: Colors.warning, icon: 'person-remove' },
};

// Esqueleto animado (pulse) reutilizado nos placeholders de carga
function SkeletonBlock({ width, height, radius = 6, style }: { width: number | string; height: number; radius?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const nd = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nd }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nd }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: Colors.border, opacity },
        style,
      ]}
    />
  );
}

function PautaSkeletonList() {
  return (
    <View style={{ gap: 8 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundCard }}>
          <SkeletonBlock width={18} height={18} radius={4} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width={'70%' as any} height={12} />
            <SkeletonBlock width={'45%' as any} height={10} />
            <SkeletonBlock width={'30%' as any} height={9} />
          </View>
          <SkeletonBlock width={70} height={20} radius={10} />
        </View>
      ))}
    </View>
  );
}

export default function AcompanhamentoPautasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { anoSelecionado } = useAnoAcademico();
  const { turmas, alunos, notas } = useData();
  const { config } = useConfig();

  const [trimestre, setTrimestre] = useState<Trimestre>(1);
  const [view, setView] = useState<ViewMode>('por_pauta');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filtroEstado, setFiltroEstado] = useState<Estado | 'todos'>('todos');
  const [filtroClasse, setFiltroClasse] = useState<string>('');
  const [filtroCurso, setFiltroCurso] = useState<string>('');
  const [filtroProfessor, setFiltroProfessor] = useState<string>('');
  const [pesquisa, setPesquisa] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 20;

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set());

  function highlightItems(keys: string[], durationMs = 2800) {
    if (!keys.length) return;
    setHighlightedKeys(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      return next;
    });
    setTimeout(() => {
      setHighlightedKeys(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
    }, durationMs);
  }

  // Modais
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminTarget, setAdminTarget] = useState<Item | null>(null);
  const [adminMotivo, setAdminMotivo] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  const [showLoteAdmin, setShowLoteAdmin] = useState(false);
  const [loteMotivo, setLoteMotivo] = useState('');
  const [savingLote, setSavingLote] = useState(false);

  const [showLoteNotif, setShowLoteNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  const [showHistModal, setShowHistModal] = useState(false);
  const [histTarget, setHistTarget] = useState<Item | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histData, setHistData] = useState<{ pautas: any[]; incidentes: any[] } | null>(null);

  // Modal "Atribuir Professor"
  const [showAtribModal, setShowAtribModal] = useState(false);
  const [atribTarget, setAtribTarget] = useState<Item | null>(null);
  const [atribProfessores, setAtribProfessores] = useState<any[]>([]);
  const [atribTurmaProfIds, setAtribTurmaProfIds] = useState<string[]>([]);
  const [atribLoading, setAtribLoading] = useState(false);
  const [atribSaving, setAtribSaving] = useState(false);
  const [atribSelected, setAtribSelected] = useState<string>('');
  const [atribMostrarTodos, setAtribMostrarTodos] = useState(false);
  const [atribPesquisa, setAtribPesquisa] = useState('');

  // Modal "Atribuir Professor em Lote"
  const [showAtribLote, setShowAtribLote] = useState(false);
  const [atribLoteProfs, setAtribLoteProfs] = useState<any[]>([]);
  const [atribLoteLoading, setAtribLoteLoading] = useState(false);
  const [atribLoteSaving, setAtribLoteSaving] = useState(false);
  const [atribLoteSelected, setAtribLoteSelected] = useState<string>('');
  const [atribLotePesquisa, setAtribLotePesquisa] = useState('');

  // ── Cronograma & Acções (prazos, prorrogações, exports, pauta final) ──────
  interface PrazoMP { id: string; trimestre: number; anoLetivo: string; dataLimite: string; ativo: boolean }
  interface ProrrogMP { id: string; professorId: string; professorNome?: string; trimestre: number; novaDataLimite: string; motivo?: string; ativo: boolean }
  interface SubmissaoStatusT { total: number; submetidas: number; pendentes: any[]; todasSubmetidas: boolean; pautas: Array<{ turmaId: string; disciplina: string; status?: string; turmaNome?: string; classe?: string; professorId?: string; professorNome?: string; trimestre?: number; anoLetivo?: string }> }
  const [prazos, setPrazos] = useState<PrazoMP[]>([]);
  const [prorrogacoes, setProrrogacoes] = useState<ProrrogMP[]>([]);
  const [submissaoStatus, setSubmissaoStatus] = useState<Record<number, SubmissaoStatusT>>({});
  const [showProrrogModal, setShowProrrogModal] = useState(false);
  const [prorrogTrim, setProrrogTrim] = useState<1|2|3>(1);
  const [prorrogProfId, setProrrogProfId] = useState('');
  const [prorrogNovaData, setProrrogNovaData] = useState('');
  const [prorrogMotivo, setProrrogMotivo] = useState('');
  const [prorrogSearch, setProrrogSearch] = useState('');
  const [savingProrrog, setSavingProrrog] = useState(false);
  const [profsList, setProfsList] = useState<any[]>([]);

  const fetchCronograma = useCallback(async () => {
    const ano = anoSelecionado?.ano; if (!ano) return;
    try {
      const token = await getAuthToken();
      const headers = { Authorization: `Bearer ${token ?? ''}` };
      const [prRes, ppRes, ...statusRes] = await Promise.all([
        fetch(`/api/prazos-mini-pauta?anoLetivo=${encodeURIComponent(ano)}`, { headers }),
        fetch(`/api/prazos-mini-pauta/prorrogacoes?anoLetivo=${encodeURIComponent(ano)}&ativo=1`, { headers }),
        ...[1,2,3].map(t => fetch(`/api/pautas/submissoes-status?trimestre=${t}&anoLetivo=${encodeURIComponent(ano)}`, { headers })),
      ]);
      if (prRes.ok) setPrazos(await prRes.json());
      if (ppRes.ok) setProrrogacoes(await ppRes.json());
      const ss: Record<number, SubmissaoStatusT> = {};
      for (let i = 0; i < 3; i++) {
        const r = statusRes[i]; if (r?.ok) ss[i + 1] = await r.json();
      }
      setSubmissaoStatus(ss);
    } catch {}
  }, [anoSelecionado]);

  useEffect(() => { fetchCronograma(); }, [fetchCronograma]);

  useEffect(() => {
    // carrega lista de professores 1x para o modal de prorrogação
    api.get<any[]>('/api/professores').then(r => Array.isArray(r) && setProfsList(r)).catch(() => {});
  }, []);

  const baixarRelatorioExcel = useCallback(async () => {
    const ano = anoSelecionado?.ano; if (!ano) return;
    if (Platform.OS !== 'web') { webAlert('Indisponível', 'Disponível apenas na versão web.'); return; }
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/relatorio-cumprimento?anoLetivo=${encodeURIComponent(ano)}&formato=xlsx`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!r.ok) { webAlert('Erro', 'Não foi possível gerar o relatório.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Acompanhamento_Pautas_${ano}_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { webAlert('Erro', 'Falha de ligação.'); }
  }, [anoSelecionado]);

  const baixarCalendarioICS = useCallback(async () => {
    const ano = anoSelecionado?.ano; if (!ano) return;
    if (Platform.OS !== 'web') { webAlert('Indisponível', 'Disponível apenas na versão web.'); return; }
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/calendario.ics?anoLetivo=${encodeURIComponent(ano)}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!r.ok) { webAlert('Erro', 'Não foi possível gerar o calendário.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `prazos-mini-pauta-${ano}.ics`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { webAlert('Erro', 'Falha de ligação.'); }
  }, [anoSelecionado]);

  const salvarProrrogacao = useCallback(async () => {
    const ano = anoSelecionado?.ano; if (!ano) return;
    if (!prorrogProfId) { webAlert('Campo obrigatório', 'Seleccione o professor.'); return; }
    if (!prorrogNovaData || !/^\d{4}-\d{2}-\d{2}$/.test(prorrogNovaData)) { webAlert('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
    setSavingProrrog(true);
    try {
      const token = await getAuthToken();
      const prof = profsList.find(p => p.id === prorrogProfId);
      const r = await fetch('/api/prazos-mini-pauta/prorrogar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          professorId: prorrogProfId,
          professorNome: prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : null,
          trimestre: prorrogTrim,
          anoLetivo: ano,
          novaDataLimite: prorrogNovaData,
          motivo: prorrogMotivo.trim() || null,
          concedidoPor: user?.nome || 'Secretaria',
        }),
      });
      if (r.ok) {
        await fetchCronograma();
        setShowProrrogModal(false);
        setProrrogProfId(''); setProrrogNovaData(''); setProrrogMotivo(''); setProrrogSearch('');
        webAlert('Prorrogação concedida', 'A nova data foi registada.');
      } else {
        const j = await r.json().catch(() => ({}));
        webAlert('Erro', j?.error || 'Não foi possível conceder a prorrogação.');
      }
    } catch { webAlert('Erro', 'Falha de ligação.'); } finally { setSavingProrrog(false); }
  }, [anoSelecionado, prorrogProfId, prorrogTrim, prorrogNovaData, prorrogMotivo, profsList, user, fetchCronograma]);

  const removerProrrogacao = useCallback(async (id: string) => {
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/prorrogar/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (r.ok) await fetchCronograma();
    } catch {}
  }, [fetchCronograma]);

  const [pautaPreview, setPautaPreview] = useState<{ html: string; trimestre: number; anoLetivo: string; turmaId?: string } | null>(null);

  // ── Pautas Finais já impressas (persistido em AsyncStorage, partilhado com Secretaria) ──
  // chave = `${anoLetivo}|${trimestre}|${turmaId}`
  const [pautasFinalImpressas, setPautasFinalImpressas] = useState<Record<string, string>>({});
  const [trimestrePautaFinalTurma, setTrimestrePautaFinalTurma] = useState<1|2|3>(1);
  const [filtroTurmaPronta, setFiltroTurmaPronta] = useState<'todas'|'prontas'|'pendentes'|'impressas'>('prontas');

  useEffect(() => {
    AsyncStorage.getItem(PAUTA_FINAL_IMPRESSA_KEY).then(raw => {
      if (!raw) return;
      try { setPautasFinalImpressas(JSON.parse(raw) || {}); } catch {}
    }).catch(() => {});
  }, []);

  const persistImpressas = useCallback(async (next: Record<string, string>) => {
    setPautasFinalImpressas(next);
    try { await AsyncStorage.setItem(PAUTA_FINAL_IMPRESSA_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const impressaKey = useCallback((tt: number, turmaId: string) => {
    const ano = anoSelecionado?.ano || '—';
    return `${ano}|${tt}|${turmaId}`;
  }, [anoSelecionado]);

  const marcarImpressa = useCallback(async (tt: number, turmaId: string) => {
    const k = impressaKey(tt, turmaId);
    await persistImpressas({ ...pautasFinalImpressas, [k]: new Date().toISOString() });
  }, [impressaKey, pautasFinalImpressas, persistImpressas]);

  const desmarcarImpressa = useCallback(async (tt: number, turmaId: string) => {
    const k = impressaKey(tt, turmaId);
    const next = { ...pautasFinalImpressas };
    delete next[k];
    await persistImpressas(next);
  }, [impressaKey, pautasFinalImpressas, persistImpressas]);

  const gerarPautaFinal = useCallback((t: 1|2|3, turmaIdFiltro?: string) => {
    if (Platform.OS !== 'web') { webAlert('Indisponível', 'Disponível apenas na versão web do sistema.'); return; }
    const status = submissaoStatus[t];
    if (!status) {
      webAlert('Sem dados', 'Ainda não há mini-pautas registadas para este trimestre.');
      return;
    }
    const pautasDoEscopo = turmaIdFiltro
      ? status.pautas.filter(p => p.turmaId === turmaIdFiltro)
      : status.pautas;
    const totalEscopo = pautasDoEscopo.length;
    const submetidasEscopo = pautasDoEscopo.filter(p => p.status === 'fechada').length;
    const todasOk = totalEscopo > 0 && submetidasEscopo === totalEscopo;
    if (!todasOk) {
      const faltam = totalEscopo - submetidasEscopo;
      const ondeTxt = turmaIdFiltro
        ? `nesta turma (${faltam} disciplina${faltam !== 1 ? 's' : ''} por submeter)`
        : `no ${t}º Trimestre (${faltam} mini-pauta${faltam !== 1 ? 's' : ''} por submeter)`;
      webAlert('Não é possível gerar a Pauta Final',
        `Ainda faltam mini-pautas por submeter ${ondeTxt}.\n\nTodas as mini-pautas devem ser submetidas pelos professores antes de gerar a Pauta Final.`);
      return;
    }
    const anoLetivo = anoSelecionado?.ano || '—';
    const html = buildPautaFinalHtml({
      trimestre: t,
      anoLetivo,
      pautasSubmetidas: pautasDoEscopo as any,
      turmas: turmas as any,
      alunos: alunos as any,
      notas: notas as any,
      config: config as any,
      utilizadorNome: user?.nome,
    }, { showToolbar: false });
    setPautaPreview({ html, trimestre: t, anoLetivo, turmaId: turmaIdFiltro });
  }, [submissaoStatus, anoSelecionado, turmas, alunos, notas, config, user]);

  const podeMarcarAdmin = !!user?.role && ['ceo','pca','admin','director','pedagogico'].includes(user.role);
  const podeNotificar = !!user?.role && ['ceo','pca','admin','director','chefe_secretaria','secretaria','pedagogico'].includes(user.role);
  const podeAtribuirProfessor = !!user?.role && ['ceo','pca','admin','director','chefe_secretaria','secretaria','pedagogico'].includes(user.role);
  const [aceitandoSugestoes, setAceitandoSugestoes] = useState(false);
  const [confirmSugestoes, setConfirmSugestoes] = useState<{
    grupos: Map<string, { professorNome: string; items: { turmaId: string; disciplina: string }[] }>;
    totalPautas: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!anoSelecionado?.ano) return;
    setLoading(true);
    try {
      const r = await api.get<Resp>(`/api/acompanhamento-pautas?trimestre=${trimestre}&anoLetivo=${encodeURIComponent(anoSelecionado.ano)}&view=${view}`);
      setData(r);
      setSeleccionados(new Set());
    } catch (e) {
      webAlert('Erro', `Não foi possível carregar o acompanhamento: ${(e as Error).message}`);
    } finally { setLoading(false); }
  }, [trimestre, view, anoSelecionado]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Listas únicas para filtros
  const classes = useMemo(() => {
    const set = new Set<string>(); data?.items.forEach(i => i.classe && set.add(i.classe)); return Array.from(set).sort();
  }, [data]);
  const cursos = useMemo(() => {
    const map = new Map<string, string>();
    data?.items.forEach(i => i.cursoId && map.set(i.cursoId, i.cursoNome || i.cursoId));
    return Array.from(map.entries());
  }, [data]);
  const professoresLista = useMemo(() => {
    const map = new Map<string, string>();
    data?.items.forEach(i => { if (i.professorId) map.set(i.professorId, i.professorNome || i.professorId); });
    return Array.from(map.entries());
  }, [data]);

  const countsByEstado = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const counts: Record<string, number> = { todos: data.items.length };
    (['atrasada','sem_professor','nao_iniciada','em_lancamento','submetida'] as Estado[]).forEach(e => {
      counts[e] = data.items.filter(i => i.estado === e).length;
    });
    return counts;
  }, [data]);

  const professoresFiltrados = useMemo(() => {
    const profs: ProfAgg[] = data?.professores || [];
    if (filtroEstado === 'todos') return profs;
    return profs.filter((p: ProfAgg) => {
      if (filtroEstado === 'atrasada')      return p.atrasadas > 0;
      if (filtroEstado === 'sem_professor') return p.professorId === null;
      if (filtroEstado === 'nao_iniciada')  return p.nao_iniciadas > 0;
      if (filtroEstado === 'em_lancamento') return p.em_lancamento > 0;
      if (filtroEstado === 'submetida')     return p.submetidas > 0;
      return true;
    });
  }, [data, filtroEstado]);

  // Sugestões automáticas: para cada disciplina, qual o professor mais frequentemente associado
  // (entre as pautas já com professor) — usado para pré-seleccionar no modal de atribuição.
  const sugestoesPorDisciplina = useMemo(() => {
    const map = new Map<string, { professorId: string; professorNome: string; ocorrencias: number }>();
    if (!data?.items) return map;
    const counts = new Map<string, Map<string, { nome: string; n: number }>>();
    for (const it of data.items) {
      if (!it?.disciplina || !it?.professorId) continue;
      const disc = it.disciplina;
      if (!counts.has(disc)) counts.set(disc, new Map());
      const inner = counts.get(disc)!;
      const key = it.professorId;
      const prev = inner.get(key);
      inner.set(key, { nome: it.professorNome || '', n: (prev?.n ?? 0) + 1 });
    }
    for (const [disc, inner] of counts.entries()) {
      let best: { professorId: string; professorNome: string; ocorrencias: number } | null = null;
      for (const [pid, v] of inner.entries()) {
        if (!best || v.n > best.ocorrencias) {
          best = { professorId: pid, professorNome: v.nome, ocorrencias: v.n };
        }
      }
      if (best) map.set(disc, best);
    }
    return map;
  }, [data]);

  const itemsFiltrados = useMemo(() => {
    if (!data) return [] as Item[];
    const q = pesquisa.trim().toLowerCase();
    return data.items.filter(i => {
      if (filtroEstado !== 'todos' && i.estado !== filtroEstado) return false;
      if (filtroClasse && i.classe !== filtroClasse) return false;
      if (filtroCurso && i.cursoId !== filtroCurso) return false;
      if (filtroProfessor === '__sem__' && i.professorId) return false;
      else if (filtroProfessor && filtroProfessor !== '__sem__' && i.professorId !== filtroProfessor) return false;
      if (q && !`${i.turmaNome} ${i.disciplina} ${i.professorNome ?? ''} ${i.classe ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filtroEstado, filtroClasse, filtroCurso, filtroProfessor, pesquisa]);

  // Repor página 1 sempre que qualquer filtro muda
  useEffect(() => { setPaginaAtual(1); }, [filtroEstado, filtroClasse, filtroCurso, filtroProfessor, pesquisa, trimestre]);

  function abrirPauta(it: Item) {
    if (!it.turmaId || !it.disciplina) return;
    router.push(
      `/(main)/professor-pauta?turmaId=${encodeURIComponent(it.turmaId)}&disciplina=${encodeURIComponent(it.disciplina)}&trimestre=${trimestre}&modo=supervisao` as any
    );
  }

  function emitirMiniPautaDireta(it: Item) {
    if (!it.turmaId || !it.disciplina) return;
    router.push(
      `/(main)/professor-pauta?turmaId=${encodeURIComponent(it.turmaId)}&disciplina=${encodeURIComponent(it.disciplina)}&trimestre=${trimestre}` as any
    );
  }
  async function atribuirProfessor(it: Item) {
    setAtribTarget(it);
    const sugestao = sugestoesPorDisciplina.get(it.disciplina);
    setAtribSelected(sugestao?.professorId || '');
    setAtribMostrarTodos(false);
    setAtribPesquisa('');
    setShowAtribModal(true);
    setAtribLoading(true);
    try {
      const [profsRes, turmasRes] = await Promise.all([
        api.get<any[]>(`/api/professores`).catch(() => [] as any[]),
        api.get<any[]>(`/api/turmas`).catch(() => [] as any[]),
      ]);
      const profs = Array.isArray(profsRes) ? profsRes : [];
      const turmas = Array.isArray(turmasRes) ? turmasRes : [];
      const turma = turmas.find((t: any) => t?.id === it.turmaId) || null;
      const profIds = Array.isArray(turma?.professoresIds) ? (turma.professoresIds as string[]) : [];
      setAtribProfessores(profs);
      setAtribTurmaProfIds(profIds);
      // Se a sugestão não está nos professores da turma, abrir directamente "Todos"
      if (sugestao?.professorId && !profIds.includes(sugestao.professorId)) {
        setAtribMostrarTodos(true);
      }
    } catch (e) {
      webAlert('Erro', `Não foi possível carregar professores: ${(e as Error).message}`);
    } finally { setAtribLoading(false); }
  }

  async function confirmarAtribuirProfessor() {
    if (!atribTarget || !atribSelected || !anoSelecionado?.ano) return;
    setAtribSaving(true);
    const target = atribTarget;
    const selectedId = atribSelected;
    try {
      const resp = await api.post<{ ok: boolean; pauta?: { id?: string; status?: string } }>(
        `/api/acompanhamento-pautas/atribuir-professor`,
        {
          turmaId: target.turmaId,
          disciplina: target.disciplina,
          trimestre,
          anoLetivo: anoSelecionado.ano,
          professorId: selectedId,
        }
      );
      // Optimistic UI update — patch the matching item immediately so the
      // "Atribuir Professor" button disappears even before load() returns.
      const profObj = atribProfessores.find((p: any) => p?.id === selectedId);
      const profNome = profObj?.nome || profObj?.nomeCompleto || profObj?.name || '';
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.turmaId === target.turmaId && i.disciplina === target.disciplina
              ? {
                  ...i,
                  professorId: selectedId,
                  professorNome: profNome || i.professorNome,
                  pautaId: resp?.pauta?.id || i.pautaId,
                  status: (resp?.pauta?.status as any) || i.status || 'aberta',
                  estado: 'em_lancamento',
                }
              : i
          ),
        };
      });
      setShowAtribModal(false);
      setAtribTarget(null);
      setAtribSelected('');
      highlightItems([`${target.turmaId}|${target.disciplina}`]);
      webAlert('Professor atribuído', 'A pauta foi associada ao professor seleccionado.');
      // Reconcile with server state
      load().catch(() => {});
    } catch (e) {
      webAlert('Erro', (e as Error).message);
    } finally { setAtribSaving(false); }
  }

  async function abrirAtribLote() {
    const items = itemsFiltrados.filter(i => seleccionados.has(selToken(i)));
    const elegiveis = items.filter(i => i.status !== 'fechada');
    if (elegiveis.length === 0) {
      webAlert('Nada a atribuir', 'As pautas seleccionadas já estão submetidas ou nenhuma está seleccionada.');
      return;
    }
    setAtribLoteSelected('');
    setAtribLotePesquisa('');
    setShowAtribLote(true);
    setAtribLoteLoading(true);
    try {
      const profs = await api.get<any[]>(`/api/professores`);
      setAtribLoteProfs(Array.isArray(profs) ? profs : []);
    } catch (e) {
      webAlert('Erro', `Não foi possível carregar professores: ${(e as Error).message}`);
    } finally { setAtribLoteLoading(false); }
  }

  async function confirmarAtribLote() {
    if (!atribLoteSelected || !anoSelecionado?.ano) return;
    const items = itemsFiltrados
      .filter(i => seleccionados.has(selToken(i)) && i.status !== 'fechada')
      .map(i => ({ turmaId: i.turmaId, disciplina: i.disciplina }));
    if (items.length === 0) { webAlert('Nada a atribuir', 'Sem pautas elegíveis seleccionadas.'); return; }
    setAtribLoteSaving(true);
    try {
      const r = await api.post<{ atribuidas: number; ignoradasFechadas: number; turmasAfectadas: number }>(
        `/api/acompanhamento-pautas/atribuir-professor-lote`,
        { professorId: atribLoteSelected, trimestre, anoLetivo: anoSelecionado.ano, items }
      );
      const extra = r.ignoradasFechadas > 0 ? ` (${r.ignoradasFechadas} ignorada(s) por já submetidas)` : '';
      webAlert('Concluído', `${r.atribuidas} pauta(s) atribuída(s) em ${r.turmasAfectadas} turma(s)${extra}.`);
      const keys = items.map(i => `${i.turmaId}|${i.disciplina}`);
      highlightItems(keys);
      setShowAtribLote(false);
      setAtribLoteSelected('');
      setSeleccionados(new Set());
      await load();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setAtribLoteSaving(false); }
  }

  async function abrirHistorico(it: Item) {
    if (!it.professorId) {
      webAlert('Sem professor', 'Não há professor associado a esta pauta para mostrar histórico.');
      return;
    }
    setHistTarget(it); setShowHistModal(true); setHistLoading(true); setHistData(null);
    try {
      const r = await api.get<{ pautas: any[]; incidentes: any[] }>(`/api/pautas/professor/${it.professorId}/historico`);
      setHistData(r);
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setHistLoading(false); }
  }

  async function confirmarMarcacaoAdmin() {
    if (!adminTarget?.pautaId) {
      webAlert('Pauta inexistente', 'Esta pauta ainda não foi iniciada — abra-a para lançar como Subdirecção.');
      return;
    }
    setSavingAdmin(true);
    try {
      await api.post(`/api/pautas/${adminTarget.pautaId}/marcar-lancamento-admin`, {
        motivo: adminMotivo || 'Lançamento administrativo por incumprimento de prazo',
      });
      webAlert('Lançamento Administrativo Registado', 'A pauta ficou marcada e o professor foi notificado.');
      setShowAdminModal(false); setAdminMotivo(''); setAdminTarget(null); await load();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSavingAdmin(false); }
  }

  async function confirmarLoteAdmin() {
    const ids = Array.from(seleccionados).filter(id => {
      const it = itemsFiltrados.find(x => x.pautaId === id);
      return it && it.pautaId && !it.lancamentoAdmin;
    });
    if (ids.length === 0) { webAlert('Nada a marcar', 'Seleccione pautas iniciadas e ainda não marcadas.'); return; }
    setSavingLote(true);
    try {
      const r = await api.post<{ marcadas: number }>(`/api/acompanhamento-pautas/marcar-admin-lote`, {
        pautaIds: ids, motivo: loteMotivo || 'Lançamento administrativo por incumprimento de prazo',
      });
      webAlert('Marcadas', `${r.marcadas} pauta(s) marcadas como Lançamento Administrativo.`);
      setShowLoteAdmin(false); setLoteMotivo(''); await load();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSavingLote(false); }
  }

  async function enviarNotifLote() {
    const items = itemsFiltrados.filter(i => seleccionados.has(i.pautaId || `${i.turmaId}|${i.disciplina}`));
    const profIds = Array.from(new Set(items.map(i => i.professorId).filter(Boolean) as string[]));
    if (profIds.length === 0) { webAlert('Sem destinatários', 'As pautas seleccionadas não têm professor associado.'); return; }
    setSendingNotif(true);
    try {
      const pautaIds = items.map(i => i.pautaId).filter(Boolean) as string[];
      const r = await api.post<{ enviados: number }>(`/api/acompanhamento-pautas/notificar`, {
        professorIds: profIds,
        pautaIds,
        titulo: 'Lembrete: lançamento de pauta',
        mensagem: notifMsg || 'A Subdirecção Pedagógica solicita o lançamento da sua pauta dentro do prazo estabelecido.',
      });
      webAlert('Enviado', `${r.enviados} notificação(ões) enviada(s).`);
      setShowLoteNotif(false); setNotifMsg(''); setSeleccionados(new Set());
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSendingNotif(false); }
  }

  // Aceitar todas as sugestões de uma só vez (agrupadas por professor sugerido)
  function aceitarTodasSugestoes() {
    if (!data || !anoSelecionado?.ano) return;
    const candidatos = data.items.filter(i =>
      !i.professorId &&
      i.status !== 'fechada' &&
      sugestoesPorDisciplina.has(i.disciplina)
    );
    if (candidatos.length === 0) {
      webAlert('Nada a atribuir', 'Não há sugestões disponíveis para pautas sem professor.');
      return;
    }
    const grupos = new Map<string, { professorNome: string; items: { turmaId: string; disciplina: string }[] }>();
    for (const it of candidatos) {
      const sug = sugestoesPorDisciplina.get(it.disciplina);
      if (!sug?.professorId) continue;
      if (!grupos.has(sug.professorId)) grupos.set(sug.professorId, { professorNome: sug.professorNome || '', items: [] });
      grupos.get(sug.professorId)!.items.push({ turmaId: it.turmaId, disciplina: it.disciplina });
    }
    if (grupos.size === 0) {
      webAlert('Nada a atribuir', 'Sem sugestões válidas.');
      return;
    }
    setConfirmSugestoes({ grupos, totalPautas: candidatos.length });
  }

  async function executarAceitarTodasSugestoes() {
    const ctx = confirmSugestoes;
    if (!ctx || !anoSelecionado?.ano) return;
    const grupos = ctx.grupos;
    setConfirmSugestoes(null);
    setAceitandoSugestoes(true);
    let totalAtribuidas = 0, totalIgnoradas = 0, totalTurmas = 0, falhas = 0;
    try {
      for (const [professorId, grupo] of grupos.entries()) {
        try {
          const r = await api.post<{ atribuidas: number; ignoradasFechadas: number; turmasAfectadas: number }>(
            `/api/acompanhamento-pautas/atribuir-professor-lote`,
            { professorId, trimestre, anoLetivo: anoSelecionado.ano, items: grupo.items }
          );
          totalAtribuidas += r?.atribuidas || 0;
          totalIgnoradas += r?.ignoradasFechadas || 0;
          totalTurmas += r?.turmasAfectadas || 0;
        } catch {
          falhas += grupo.items.length;
        }
      }
      const extra = totalIgnoradas > 0 ? ` (${totalIgnoradas} ignorada(s) por já submetidas)` : '';
      const erro = falhas > 0 ? ` · ${falhas} falha(s)` : '';
      webAlert('Sugestões aplicadas', `${totalAtribuidas} pauta(s) atribuída(s) a ${grupos.size} professor(es) em ${totalTurmas} turma(s)${extra}${erro}.`);
      const allKeys: string[] = [];
      for (const grupo of grupos.values()) {
        for (const it of grupo.items) allKeys.push(`${it.turmaId}|${it.disciplina}`);
      }
      highlightItems(allKeys);
      await load();
    } finally {
      setAceitandoSugestoes(false);
    }
  }

  async function notificarTodosAtrasados() {
    if (!data) return;
    const atrasadas = data.items.filter(i => i.estado === 'atrasada' && i.professorId);
    const profIds = Array.from(new Set(atrasadas.map(i => i.professorId!)));
    const pautaIds = atrasadas.map(i => i.pautaId).filter(Boolean) as string[];
    if (profIds.length === 0) { webAlert('Sem atrasados', 'Não há pautas atrasadas com professor associado.'); return; }
    try {
      const r = await api.post<{ enviados: number }>(`/api/acompanhamento-pautas/notificar`, {
        professorIds: profIds,
        pautaIds,
        titulo: `Pautas em atraso — ${trimestre}º Trimestre`,
        mensagem: 'A Subdirecção Pedagógica solicita o lançamento URGENTE das suas pautas em atraso.',
      });
      webAlert('Notificados', `${r.enviados} professor(es) notificado(s).`);
    } catch (e) { webAlert('Erro', (e as Error).message); }
  }

  async function exportarPDF() {
    if (!anoSelecionado?.ano) return;
    try {
      const base = getApiUrl();
      const token = await getAuthToken();
      const url = new URL(`/api/acompanhamento-pautas/exportar.pdf?trimestre=${trimestre}&anoLetivo=${encodeURIComponent(anoSelecionado.ano)}`, base).toString();
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          const html = await r.text();
          win.document.open();
          win.document.write(html);
          win.document.close();
        }
      } else {
        Linking.openURL(url + (token ? `&_t=${encodeURIComponent(token)}` : ''));
      }
    } catch (e) { webAlert('Erro', (e as Error).message); }
  }

  function toggleSel(key: string) {
    const s = new Set(seleccionados);
    if (s.has(key)) s.delete(key); else s.add(key);
    setSeleccionados(s);
  }

  function selToken(it: Item) { return it.pautaId || `${it.turmaId}|${it.disciplina}`; }

  function diasRestantesLabel() {
    if (data?.diasRestantes === null || data?.diasRestantes === undefined) return null;
    const d = data.diasRestantes;
    if (d > 1) return `Faltam ${d} dias`;
    if (d === 1) return 'Falta 1 dia';
    if (d === 0) return 'Termina HOJE';
    return `Expirou há ${Math.abs(d)} dia(s)`;
  }

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <TopBar
        title="Acompanhamento de Pautas"
        subtitle="Secretaria + Subdirecção Pedagógica"
        rightAction={{ icon: 'bar-chart-outline', onPress: () => router.push('/(main)/desempenho-professores') }}
      />

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* View toggle */}
        <View style={s.viewRow}>
          {(['por_pauta','por_professor'] as ViewMode[]).map(v => (
            <TouchableOpacity key={v} style={[s.viewChip, view === v && s.viewChipActive]} onPress={() => setView(v)}>
              <Ionicons name={v === 'por_pauta' ? 'grid' : 'people'} size={13} color={view === v ? '#fff' : Colors.textMuted} />
              <Text style={[s.viewChipText, view === v && s.viewChipTextActive]}>
                {v === 'por_pauta' ? 'Por Pauta' : 'Por Professor'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trimestre */}
        <View style={s.trimRow}>
          {[1,2,3].map(t => (
            <TouchableOpacity key={t} style={[s.trimChip, trimestre === t && s.trimChipActive]} onPress={() => setTrimestre(t as Trimestre)}>
              <Text style={[s.trimChipText, trimestre === t && s.trimChipTextActive]}>{t}º Trimestre</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Cronograma & Acções ───────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Cronograma & Acções</Text>
              <Text style={s.cardSub}>Prazos dos 3 trimestres, prorrogações e exportações</Text>
            </View>
          </View>

          {/* Alerta quando não há prazos configurados */}
          {prazos.length === 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning + '55', marginBottom: 10 }}>
              <Ionicons name="warning-outline" size={15} color={Colors.warning} />
              <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.warning, lineHeight: 16 }}>
                Nenhum prazo configurado para este ano lectivo. Defina as datas limite de cada trimestre em "Configurar prazos".
              </Text>
              <TouchableOpacity
                style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.warning, marginLeft: 4 }}
                onPress={() => router.push('/(main)/admin?section=prazos-pauta' as any)}
              >
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#000' }}>Configurar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Timeline dos 3 trimestres */}
          <View style={s.cronoBox}>
            <View style={s.cronoLine} />
            <View style={s.cronoRow}>
              {[1,2,3].map(t => {
                const p = prazos.find(pz => pz.trimestre === t);
                const status = submissaoStatus[t];
                const todas = status?.todasSubmetidas ?? false;
                const dl = p ? new Date(p.dataLimite + 'T23:59:59') : null;
                const expirado = dl ? new Date() > dl : false;
                const cor = todas ? Colors.success : expirado ? Colors.danger : p ? Colors.gold : Colors.textMuted;
                const subm = status?.submetidas ?? 0;
                const tot = status?.total ?? 0;
                const pct = tot > 0 ? Math.round(subm / tot * 100) : 0;
                return (
                  <View key={t} style={s.cronoItem}>
                    <View style={[s.cronoDot, { backgroundColor: cor }]} />
                    <Text style={[s.cronoTrim, { color: cor }]}>{t}º TRIM.</Text>
                    <Text style={s.cronoData}>
                      {p ? new Date(p.dataLimite).toLocaleDateString('pt-PT') : 'Sem prazo'}
                    </Text>
                    <Text style={[s.cronoStat, { color: cor }]}>{tot > 0 ? `${subm}/${tot} (${pct}%)` : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Prorrogações activas */}
          {prorrogacoes.filter(pp => pp.ativo).length > 0 && (
            <View style={s.prorrogBox}>
              <Text style={s.prorrogTitle}>PRORROGAÇÕES ACTIVAS ({prorrogacoes.filter(pp => pp.ativo).length})</Text>
              {prorrogacoes.filter(pp => pp.ativo).slice(0, 5).map(pp => (
                <View key={pp.id} style={s.prorrogRow}>
                  <Ionicons name="hourglass" size={11} color={Colors.info} />
                  <Text style={s.prorrogText} numberOfLines={1}>
                    <Text style={{ fontWeight: '700' }}>{pp.professorNome || 'Prof.'}</Text>
                    {' · '}{pp.trimestre}º Trim. → {new Date(pp.novaDataLimite).toLocaleDateString('pt-PT')}
                    {pp.motivo ? ` · ${pp.motivo}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => removerProrrogacao(pp.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close-circle" size={15} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Botões de acção */}
          <View style={s.actionsRow}>
            <TouchableOpacity style={[s.actChip, { backgroundColor: Colors.warning + '14', borderColor: Colors.warning + '55' }]} onPress={() => router.push('/(main)/admin?section=prazos-pauta' as any)}>
              <Ionicons name="settings-outline" size={13} color={Colors.warning} />
              <Text style={[s.actChipText, { color: Colors.warning }]}>Configurar prazos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actChip, { backgroundColor: Colors.info + '14', borderColor: Colors.info + '55' }]} onPress={() => setShowProrrogModal(true)}>
              <Ionicons name="hourglass-outline" size={13} color={Colors.info} />
              <Text style={[s.actChipText, { color: Colors.info }]}>Prorrogar professor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actChip, { backgroundColor: Colors.success + '14', borderColor: Colors.success + '55' }]} onPress={baixarRelatorioExcel}>
              <Ionicons name="document-text-outline" size={13} color={Colors.success} />
              <Text style={[s.actChipText, { color: Colors.success }]}>Relatório Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actChip, { backgroundColor: Colors.accent + '14', borderColor: Colors.accent + '55' }]} onPress={baixarCalendarioICS}>
              <Ionicons name="calendar-outline" size={13} color={Colors.accent} />
              <Text style={[s.actChipText, { color: Colors.accent }]}>Calendário .ics</Text>
            </TouchableOpacity>
          </View>

          {/* Pauta Final por trimestre — turma toda */}
          <View style={s.pfRow}>
            {[1,2,3].map(t => {
              const status = submissaoStatus[t];
              const todas = status?.todasSubmetidas ?? false;
              const tot = status?.total ?? 0;
              const subm = status?.submetidas ?? 0;
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.pfBtn, todas ? s.pfBtnReady : s.pfBtnLocked]}
                  onPress={() => gerarPautaFinal(t as 1|2|3)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="document-text" size={13} color={todas ? Colors.success : Colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pfBtnTitle, { color: todas ? Colors.success : Colors.textMuted }]}>
                      Gerar Pauta Final {t}º Trim.
                    </Text>
                    <Text style={s.pfBtnSub}>
                      {tot === 0 ? 'Sem pautas registadas' : todas ? 'Pronta a gerar (todas as turmas)' : `Aguarda ${tot - subm}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── PAUTA FINAL POR TURMA — emissão antecipada turma-a-turma ── */}
        {(() => {
          type TurmaResumo = { turmaId: string; turmaNome: string; classe?: string; total: number; submetidas: number; pronta: boolean; impressaEm?: string };
          const trimestres: Array<1|2|3> = [1,2,3];
          const turmasResumoPorTrim: Record<number, TurmaResumo[]> = {};
          let totalProntas = 0;
          trimestres.forEach(tt => {
            const st = submissaoStatus[tt];
            if (!st || !st.pautas || st.pautas.length === 0) { turmasResumoPorTrim[tt] = []; return; }
            const grupos: Record<string, TurmaResumo> = {};
            for (const p of st.pautas) {
              const tid = p.turmaId;
              if (!tid) continue;
              if (!grupos[tid]) {
                const turmaObj = turmas.find(x => x.id === tid);
                grupos[tid] = {
                  turmaId: tid,
                  turmaNome: p.turmaNome || turmaObj?.nome || '—',
                  classe: p.classe || (turmaObj as any)?.classe,
                  total: 0, submetidas: 0, pronta: false,
                };
              }
              grupos[tid].total++;
              if (p.status === 'fechada') grupos[tid].submetidas++;
            }
            const lista = Object.values(grupos).map(g => {
              const pronta = g.total > 0 && g.submetidas === g.total;
              const impressaEm = pautasFinalImpressas[impressaKey(tt, g.turmaId)];
              if (pronta) totalProntas++;
              return { ...g, pronta, impressaEm };
            });
            lista.sort((a, b) => {
              if (a.pronta !== b.pronta) return a.pronta ? -1 : 1;
              return a.turmaNome.localeCompare(b.turmaNome);
            });
            turmasResumoPorTrim[tt] = lista;
          });

          const algumDado = trimestres.some(tt => turmasResumoPorTrim[tt].length > 0);
          if (!algumDado) return null;

          const trimAtivo = trimestrePautaFinalTurma;
          const lista = turmasResumoPorTrim[trimAtivo] || [];
          const listaFiltrada = lista.filter(it => {
            if (filtroTurmaPronta === 'prontas') return it.pronta;
            if (filtroTurmaPronta === 'pendentes') return !it.pronta;
            if (filtroTurmaPronta === 'impressas') return !!it.impressaEm;
            return true;
          });

          return (
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Pauta Final por Turma</Text>
                  <Text style={[s.cardSub, { marginTop: 2 }]}>
                    Quando uma turma já tem todas as disciplinas lançadas, podes emitir já a Pauta Final dessa turma — sem esperar pelas restantes.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.success + '14', borderWidth: 1, borderColor: Colors.success + '44' }}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.success }}>{totalProntas} pronta{totalProntas !== 1 ? 's' : ''}</Text>
                </View>
              </View>

              {/* Selector de trimestre */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 8 }}>
                {trimestres.map(tt => {
                  const ativo = trimAtivo === tt;
                  const nT = turmasResumoPorTrim[tt]?.length || 0;
                  const nProntas = (turmasResumoPorTrim[tt] || []).filter(x => x.pronta).length;
                  return (
                    <TouchableOpacity
                      key={tt}
                      style={[
                        { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, backgroundColor: Colors.cardAlt, borderColor: Colors.borderLight },
                        ativo && { backgroundColor: Colors.info + '22', borderColor: Colors.info },
                      ]}
                      onPress={() => setTrimestrePautaFinalTurma(tt)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: ativo ? Colors.info : Colors.text }}>
                        {tt}º Trim.{nT > 0 ? ` (${nProntas}/${nT})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Filtro estado */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {([
                  ['todas', 'Todas', Colors.text],
                  ['prontas', 'Prontas', Colors.success],
                  ['pendentes', 'Pendentes', Colors.warning],
                  ['impressas', 'Já Impressas', Colors.info],
                ] as const).map(([v, l, cor]) => {
                  const ativo = filtroTurmaPronta === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[
                        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, backgroundColor: Colors.cardAlt, borderColor: Colors.borderLight },
                        ativo && { backgroundColor: cor + '22', borderColor: cor },
                      ]}
                      onPress={() => setFiltroTurmaPronta(v)}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: ativo ? cor : Colors.text }}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Lista */}
              <View style={{ gap: 8 }}>
                {listaFiltrada.length === 0 ? (
                  <View style={{ padding: 18, alignItems: 'center', gap: 6 }}>
                    <Ionicons name="ribbon-outline" size={26} color={Colors.textMuted} />
                    <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>
                      Sem turmas para mostrar com este filtro.
                    </Text>
                  </View>
                ) : listaFiltrada.map(it => {
                  const cor = it.pronta ? Colors.success : Colors.warning;
                  const dataImp = it.impressaEm ? new Date(it.impressaEm).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
                  return (
                    <View key={it.turmaId} style={{ borderRadius: 12, borderWidth: 1, borderColor: it.impressaEm ? Colors.info + '55' : (it.pronta ? Colors.success + '44' : Colors.border), backgroundColor: Colors.cardAlt, padding: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={it.pronta ? 'checkmark-circle' : 'time'} size={18} color={cor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{it.turmaNome}</Text>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginTop: 2 }}>
                            {it.submetidas}/{it.total} disciplina{it.total !== 1 ? 's' : ''} submetida{it.submetidas !== 1 ? 's' : ''}
                            {it.classe ? ` · ${it.classe}` : ''}
                          </Text>
                        </View>
                        {it.impressaEm && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.info + '22', borderColor: Colors.info + '55', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                            <Ionicons name="print" size={11} color={Colors.info} />
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.info }}>Impressa {dataImp}</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                        <View style={{ width: `${it.total > 0 ? (it.submetidas / it.total) * 100 : 0}%`, height: '100%', backgroundColor: cor }} />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          disabled={!it.pronta}
                          style={[
                            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, borderWidth: 1 },
                            it.pronta
                              ? { backgroundColor: Colors.success + '22', borderColor: Colors.success }
                              : { backgroundColor: Colors.cardAlt, borderColor: Colors.border, opacity: 0.55 }
                          ]}
                          onPress={() => gerarPautaFinal(trimAtivo, it.turmaId)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="document-text" size={14} color={it.pronta ? Colors.success : Colors.textMuted} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: it.pronta ? Colors.success : Colors.textMuted }}>
                            {it.pronta ? 'Gerar Pauta Final' : `Aguarda ${it.total - it.submetidas}`}
                          </Text>
                        </TouchableOpacity>

                        {it.impressaEm ? (
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, backgroundColor: Colors.warning + '14', borderColor: Colors.warning + '55' }}
                            onPress={() => desmarcarImpressa(trimAtivo, it.turmaId)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="refresh" size={13} color={Colors.warning} />
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.warning }}>Reabrir</Text>
                          </TouchableOpacity>
                        ) : it.pronta ? (
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, backgroundColor: Colors.info + '14', borderColor: Colors.info + '55' }}
                            onPress={() => marcarImpressa(trimAtivo, it.turmaId)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="checkmark-done" size={13} color={Colors.info} />
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.info }}>Marcar impressa</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* Resumo */}
        {data && (
          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Resumo · {data.anoLetivo}</Text>
                {data.dataLimite ? (
                  <Text style={[s.cardSub, data.prazoExpirado && { color: Colors.danger }]}>
                    Prazo: {new Date(data.dataLimite).toLocaleDateString('pt-PT')} · {diasRestantesLabel()}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={s.iconBtn} onPress={exportarPDF}>
                  <Ionicons name="document-text" size={16} color={Colors.info} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.statsGrid}>
              <Stat label="Total" value={data.resumo.total} color={Colors.text} />
              <Stat label="Submetidas" value={data.resumo.submetidas} color={Colors.success} />
              <Stat label="Em curso" value={data.resumo.em_lancamento} color={Colors.info} />
              <Stat label="Não iniciadas" value={data.resumo.nao_iniciadas} color={Colors.textMuted} />
              <Stat label="Atrasadas" value={data.resumo.atrasadas} color={Colors.danger} />
              <Stat label="Sem docente" value={data.resumo.sem_professor} color={Colors.warning} />
              <Stat label="Lanç. Admin." value={data.resumo.lancamentos_admin} color={Colors.gold} />
            </View>

            {data.resumo.atrasadas > 0 && podeNotificar && (
              <TouchableOpacity style={s.bannerWarn} onPress={notificarTodosAtrasados}>
                <Ionicons name="notifications" size={14} color={Colors.danger} />
                <Text style={s.bannerWarnText}>Notificar todos os {data.resumo.atrasadas} professores em atraso</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.danger} />
              </TouchableOpacity>
            )}

            {podeAtribuirProfessor && (() => {
              const totalSug = data.items.filter(i =>
                !i.professorId && i.status !== 'fechada' && sugestoesPorDisciplina.has(i.disciplina)
              ).length;
              if (totalSug === 0) return null;
              return (
                <TouchableOpacity style={s.bannerInfo} onPress={aceitarTodasSugestoes} disabled={aceitandoSugestoes}>
                  {aceitandoSugestoes
                    ? <AppLoader size="small" color={Colors.info} />
                    : <Ionicons name="sparkles" size={14} color={Colors.info} />}
                  <Text style={s.bannerInfoText}>
                    {aceitandoSugestoes
                      ? 'A aplicar sugestões…'
                      : `Aceitar todas as sugestões (${totalSug} pauta${totalSug !== 1 ? 's' : ''})`}
                  </Text>
                  {!aceitandoSugestoes && <Ionicons name="chevron-forward" size={12} color={Colors.info} />}
                </TouchableOpacity>
              );
            })()}
          </View>
        )}

        {/* Filtros estado */}
        <View style={s.filtersRow}>
          {(['todos','atrasada','sem_professor','nao_iniciada','em_lancamento','submetida'] as const).map(e => {
            const cnt = countsByEstado[e] ?? 0;
            const ativo = filtroEstado === e;
            const cor = e !== 'todos' ? ESTADO_INFO[e].color : Colors.primary;
            return (
              <TouchableOpacity key={e} style={[s.filterChip, ativo && s.filterChipActive, ativo && { borderColor: cor }]} onPress={() => setFiltroEstado(e)}>
                <Text style={[s.filterChipText, ativo && s.filterChipTextActive]}>
                  {e === 'todos' ? 'Todos' : ESTADO_INFO[e].label}
                </Text>
                {cnt > 0 && (
                  <View style={{ marginLeft: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, backgroundColor: ativo ? cor + '33' : Colors.border }}>
                    <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: ativo ? cor : Colors.textMuted }}>{cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filtros adicionais */}
        {(classes.length > 0 || cursos.length > 0 || professoresLista.length > 0) && (
          <View style={s.filtersRow}>
            {classes.length > 0 && (
              <View style={s.selectWrap}>
                <Text style={s.selLabel}>Classe</Text>
                <SelectChip value={filtroClasse} options={[['','Todas'], ...classes.map(c => [c, c] as [string,string])]} onChange={setFiltroClasse} />
              </View>
            )}
            {cursos.length > 0 && (
              <View style={s.selectWrap}>
                <Text style={s.selLabel}>Curso</Text>
                <SelectChip value={filtroCurso} options={[['','Todos'], ...cursos]} onChange={setFiltroCurso} />
              </View>
            )}
            <View style={s.selectWrap}>
              <Text style={s.selLabel}>Professor</Text>
              <SelectChip value={filtroProfessor} options={[['','Todos'], ['__sem__','Sem professor'], ...professoresLista]} onChange={setFiltroProfessor} />
            </View>
          </View>
        )}

        {/* Pesquisa */}
        <View style={s.searchRow}>
          <StableSearchInput
            value={pesquisa}
            onChangeText={setPesquisa}
            inputStyle={s.searchInput}
            placeholder="Pesquisar turma, disciplina ou professor…"
            iconColor={Colors.textMuted}
          />
        </View>

        {/* Acções em lote */}
        {seleccionados.size > 0 && (
          <View style={s.loteBar}>
            <Text style={s.loteText}>{seleccionados.size} seleccionada(s)</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {podeNotificar && (
                <TouchableOpacity style={[s.loteBtn, { backgroundColor: Colors.info }]} onPress={() => setShowLoteNotif(true)}>
                  <Ionicons name="notifications" size={13} color="#fff" />
                  <Text style={s.loteBtnText}>Notificar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.loteBtn, { backgroundColor: Colors.warning }]} onPress={abrirAtribLote}>
                <Ionicons name="person-add" size={13} color="#000" />
                <Text style={[s.loteBtnText, { color: '#000' }]}>Atribuir Prof.</Text>
              </TouchableOpacity>
              {podeMarcarAdmin && (
                <TouchableOpacity style={[s.loteBtn, { backgroundColor: Colors.gold }]} onPress={() => setShowLoteAdmin(true)}>
                  <Ionicons name="shield-checkmark" size={13} color="#000" />
                  <Text style={[s.loteBtnText, { color: '#000' }]}>Lanç. Admin.</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.loteBtn, { backgroundColor: Colors.border }]} onPress={() => setSeleccionados(new Set())}>
                <Ionicons name="close" size={13} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pílula de sincronização (visível durante recarga, com dados já presentes) */}
        {loading && data && (
          <View style={s.syncPill}>
            <AppLoader size="small" color={Colors.info} />
            <Text style={s.syncPillText}>A sincronizar com o servidor…</Text>
          </View>
        )}

        {/* Lista */}
        {loading && !data ? (
          <View style={{ paddingTop: 8 }}>
            <PautaSkeletonList />
          </View>
        ) : view === 'por_professor' ? (
          professoresFiltrados.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
              <Text style={s.emptyText}>
                {filtroEstado !== 'todos'
                  ? `Nenhum professor com pautas "${ESTADO_INFO[filtroEstado as Estado]?.label || filtroEstado}".`
                  : 'Sem dados de professores.'}
              </Text>
            </View>
          ) : (
            professoresFiltrados.map((p, i) => (
              <View key={i} style={s.profCard}>
                <View style={s.profHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.profNome}>{p.professorNome}</Text>
                    <Text style={s.profSub}>{p.total} pauta(s) · {p.cumprimentoPct}% cumprimento</Text>
                  </View>
                  <View style={[s.profBadge, { backgroundColor: p.cumprimentoPct >= 80 ? Colors.success + '22' : p.cumprimentoPct >= 50 ? Colors.warning + '22' : Colors.danger + '22' }]}>
                    <Text style={[s.profBadgeText, { color: p.cumprimentoPct >= 80 ? Colors.success : p.cumprimentoPct >= 50 ? Colors.warning : Colors.danger }]}>{p.cumprimentoPct}%</Text>
                  </View>
                </View>
                <View style={s.profStats}>
                  <Text style={[s.profStat, { color: Colors.success }]}>✓ {p.submetidas}</Text>
                  <Text style={[s.profStat, { color: Colors.info }]}>● {p.em_lancamento}</Text>
                  <Text style={[s.profStat, { color: Colors.textMuted }]}>○ {p.nao_iniciadas}</Text>
                  <Text style={[s.profStat, { color: Colors.danger }]}>! {p.atrasadas}</Text>
                  {p.lancamentos_admin > 0 && <Text style={[s.profStat, { color: Colors.gold }]}>⚖ {p.lancamentos_admin}</Text>}
                </View>
                {(p.atrasadas > 0 || p.nao_iniciadas > 0) && podeNotificar && p.professorId && (
                  <TouchableOpacity
                    style={s.profNotifBtn}
                    onPress={async () => {
                      try {
                        const pautaIdsProf = (data?.items || [])
                          .filter(i => i.professorId === p.professorId && (i.estado === 'atrasada' || i.estado === 'nao_iniciada'))
                          .map(i => i.pautaId)
                          .filter(Boolean) as string[];
                        const r = await api.post<{ enviados: number }>(`/api/acompanhamento-pautas/notificar`, {
                          professorIds: [p.professorId],
                          pautaIds: pautaIdsProf,
                          titulo: `Pautas pendentes — ${trimestre}º Trim.`,
                          mensagem: `Tem ${p.atrasadas + p.nao_iniciadas} pauta(s) pendente(s). Por favor proceda ao lançamento.`,
                        });
                        webAlert('Notificado', `${r.enviados} notificação enviada.`);
                      } catch (e) { webAlert('Erro', (e as Error).message); }
                    }}
                  >
                    <Ionicons name="notifications" size={12} color={Colors.info} />
                    <Text style={s.profNotifBtnText}>Notificar este professor</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )
        ) : itemsFiltrados.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={32} color={Colors.textMuted} />
            <Text style={s.emptyText}>Sem pautas para mostrar com os filtros actuais.</Text>
          </View>
        ) : (
          <>
          {itemsFiltrados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA).map((it, idx) => {
            const info = ESTADO_INFO[it.estado];
            const tok = selToken(it);
            const isSel = seleccionados.has(tok);
            const isHighlighted = highlightedKeys.has(`${it.turmaId}|${it.disciplina}`);
            return (
              <View key={`${it.turmaId}-${it.disciplina}-${idx}`} style={[
                s.itemCard,
                { borderLeftColor: info.color },
                isSel && { backgroundColor: Colors.primary + '12', borderColor: Colors.primary + '55' },
                isHighlighted && s.itemHighlighted,
              ]}>
                <View style={s.itemHeader}>
                  <TouchableOpacity onPress={() => toggleSel(tok)} style={s.checkbox}>
                    <Ionicons name={isSel ? 'checkbox' : 'square-outline'} size={20} color={isSel ? Colors.primary : Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirHistorico(it)} activeOpacity={0.7}>
                    <Text style={s.itemTurma}>
                      {it.classe ? <Text style={{ color: Colors.gold }}>{it.classe} · </Text> : null}
                      {it.turmaNome} · <Text style={s.itemDisc}>{it.disciplina}</Text>
                    </Text>
                    <Text style={s.itemProf}>
                      {it.professorNome || <Text style={{ color: Colors.warning }}>Sem professor associado</Text>}
                      {it.cursoNome ? <Text style={{ color: Colors.textMuted }}> · {it.cursoNome}</Text> : null}
                    </Text>
                    {!it.professorId && sugestoesPorDisciplina.get(it.disciplina) && (
                      <View style={s.itemSugRow}>
                        <Ionicons name="sparkles" size={10} color={Colors.info} />
                        <Text style={s.itemSugText} numberOfLines={1}>
                          Sugerido: {sugestoesPorDisciplina.get(it.disciplina)?.professorNome || '—'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={[s.estadoBadge, { backgroundColor: info.color + '22', borderColor: info.color + '55' }]}>
                    <Ionicons name={info.icon as any} size={11} color={info.color} />
                    <Text style={[s.estadoBadgeText, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>

                {/* Progresso */}
                {it.totalAlunos > 0 && (
                  <View style={s.progressRow}>
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${it.progressoPct}%`, backgroundColor: info.color }]} />
                    </View>
                    <Text style={s.progressText}>{it.alunosComNota}/{it.totalAlunos} ({it.progressoPct}%)</Text>
                  </View>
                )}

                {it.lancamentoAdmin && (
                  <View style={s.adminFlag}>
                    <Ionicons name="shield-checkmark" size={11} color={Colors.gold} />
                    <Text style={s.adminFlagText}>
                      Lançamento Administrativo · {it.lancadoPorAdminNome || '—'}
                      {it.lancadoPorAdminEm ? ` · ${new Date(it.lancadoPorAdminEm).toLocaleDateString('pt-PT')}` : ''}
                    </Text>
                  </View>
                )}

                <View style={s.itemActions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => abrirPauta(it)}>
                    <Ionicons name="open" size={13} color={Colors.info} />
                    <Text style={[s.actionBtnText, { color: Colors.info }]}>Abrir pauta</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.actionBtn, { borderColor: '#1a7a1a55', backgroundColor: '#0d2e0d' }]}
                    onPress={() => emitirMiniPautaDireta(it)}
                  >
                    <Ionicons name="print-outline" size={13} color="#4ade80" />
                    <Text style={[s.actionBtnText, { color: '#4ade80' }]}>Mini-Pauta</Text>
                  </TouchableOpacity>

                  {!it.professorId && (
                    <TouchableOpacity
                      style={[s.actionBtn, { borderColor: Colors.warning + '55', backgroundColor: Colors.warning + '11' }]}
                      onPress={() => atribuirProfessor(it)}
                    >
                      <Ionicons name="person-add" size={13} color={Colors.warning} />
                      <Text style={[s.actionBtnText, { color: Colors.warning }]}>Atribuir Professor</Text>
                    </TouchableOpacity>
                  )}

                  {podeMarcarAdmin && (it.estado === 'atrasada' || it.estado === 'nao_iniciada' || it.estado === 'em_lancamento') && !it.lancamentoAdmin && it.professorId && (
                    <TouchableOpacity
                      style={[s.actionBtn, { borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '11' }]}
                      onPress={() => { setAdminTarget(it); setAdminMotivo(''); setShowAdminModal(true); }}
                    >
                      <Ionicons name="shield-checkmark" size={13} color={Colors.gold} />
                      <Text style={[s.actionBtnText, { color: Colors.gold }]}>Lançamento Admin.</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {/* ── Barra de paginação compacta ─────────────────────────────── */}
          {(() => {
            const total = itemsFiltrados.length;
            const totalPag = Math.ceil(total / ITENS_POR_PAGINA);
            if (totalPag <= 1) return null;
            // Janela de páginas: sempre mostra primeira, última e até 3 ao centro
            const pages: (number | '...')[] = [];
            if (totalPag <= 7) {
              for (let i = 1; i <= totalPag; i++) pages.push(i);
            } else {
              pages.push(1);
              if (paginaAtual > 3) pages.push('...');
              for (let i = Math.max(2, paginaAtual - 1); i <= Math.min(totalPag - 1, paginaAtual + 1); i++) pages.push(i);
              if (paginaAtual < totalPag - 2) pages.push('...');
              pages.push(totalPag);
            }
            const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
            const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, total);
            return (
              <View style={s.paginacaoWrap}>
                <Text style={s.paginacaoInfo}>
                  {inicio}–{fim} de {total} · Página {paginaAtual} de {totalPag}
                </Text>
                <View style={s.paginacaoBtns}>
                  <TouchableOpacity
                    style={[s.pagBtn, paginaAtual === 1 && s.pagBtnDis]}
                    onPress={() => setPaginaAtual(p => Math.max(1, p - 1))}
                    disabled={paginaAtual === 1}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={14} color={paginaAtual === 1 ? Colors.textMuted : Colors.text} />
                  </TouchableOpacity>

                  {pages.map((p, i) => p === '...' ? (
                    <Text key={`el${i}`} style={s.pagEllipsis}>…</Text>
                  ) : (
                    <TouchableOpacity
                      key={p}
                      style={[s.pagBtn, p === paginaAtual && s.pagBtnAtivo]}
                      onPress={() => setPaginaAtual(p as number)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.pagBtnText, p === paginaAtual && s.pagBtnAtivoText]}>{p}</Text>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[s.pagBtn, paginaAtual === totalPag && s.pagBtnDis]}
                    onPress={() => setPaginaAtual(p => Math.min(totalPag, p + 1))}
                    disabled={paginaAtual === totalPag}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-forward" size={14} color={paginaAtual === totalPag ? Colors.textMuted : Colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
          </>
        )}
      </ScrollView>

      {/* Modal admin individual */}
      <Modal visible={showAdminModal} transparent animationType="fade" onRequestClose={() => setShowAdminModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Lançamento Administrativo</Text>
            <Text style={s.modalSub}>
              Vai marcar a pauta de <Text style={{ color: Colors.text, fontWeight: '600' }}>{adminTarget?.disciplina}</Text> ({adminTarget?.turmaNome}). O professor será notificado e fica registado no histórico de incidentes para a Avaliação de Desempenho.
            </Text>
            <Text style={s.modalLabel}>Motivo / Observação</Text>
            <TextInput
              style={s.modalInput} value={adminMotivo} onChangeText={setAdminMotivo}
              placeholder="Ex.: Não lançou as notas dentro do prazo estabelecido."
              placeholderTextColor={Colors.textMuted} multiline numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowAdminModal(false)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.gold }]} onPress={confirmarMarcacaoAdmin} disabled={savingAdmin}>
                {savingAdmin ? <AppLoader color="#000" /> : <Text style={[s.modalBtnText, { color: '#000' }]}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal confirmar aceitar todas as sugestões */}
      <Modal visible={!!confirmSugestoes} transparent animationType="fade" onRequestClose={() => setConfirmSugestoes(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Aceitar sugestões de atribuição</Text>
            <Text style={s.modalSub}>
              Vai atribuir <Text style={{ color: Colors.text, fontWeight: '700' }}>{confirmSugestoes?.totalPautas}</Text> pauta(s) a <Text style={{ color: Colors.text, fontWeight: '700' }}>{confirmSugestoes?.grupos.size}</Text> professor(es) sugerido(s).
            </Text>
            {confirmSugestoes && (
              <View style={{ marginTop: 8, gap: 6, maxHeight: 220 }}>
                <ScrollView>
                  {Array.from(confirmSugestoes.grupos.values()).map((g, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      <Ionicons name="person" size={14} color={Colors.info} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '600' }}>{g.professorNome || '—'}</Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11 }}>{g.items.length} pauta(s)</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setConfirmSugestoes(null)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.info }]} onPress={executarAceitarTodasSugestoes}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Confirmar atribuição</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal admin lote */}
      <Modal visible={showLoteAdmin} transparent animationType="fade" onRequestClose={() => setShowLoteAdmin(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Lançamento Administrativo em Lote</Text>
            <Text style={s.modalSub}>{seleccionados.size} pauta(s) seleccionada(s). Cada professor será notificado e fica registado um incidente para a Avaliação de Desempenho.</Text>
            <Text style={s.modalLabel}>Motivo</Text>
            <TextInput
              style={s.modalInput} value={loteMotivo} onChangeText={setLoteMotivo}
              placeholder="Motivo comum aplicado a todas." placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowLoteAdmin(false)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.gold }]} onPress={confirmarLoteAdmin} disabled={savingLote}>
                {savingLote ? <AppLoader color="#000" /> : <Text style={[s.modalBtnText, { color: '#000' }]}>Marcar todas</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal notificação lote (com pré-visualização) */}
      <Modal visible={showLoteNotif} transparent animationType="fade" onRequestClose={() => setShowLoteNotif(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <Text style={[s.modalTitle, { color: Colors.info }]}>Notificar Professores</Text>
            {(() => {
              const itensSel = itemsFiltrados.filter(i => seleccionados.has(i.pautaId || `${i.turmaId}|${i.disciplina}`));
              const porProf = new Map<string, { nome: string; pautas: { disc: string; turma: string }[] }>();
              for (const it of itensSel) {
                if (!it.professorId) continue;
                const k = it.professorId;
                if (!porProf.has(k)) porProf.set(k, { nome: it.professorNome || '(sem nome)', pautas: [] });
                porProf.get(k)!.pautas.push({ disc: it.disciplina, turma: it.turmaNome });
              }
              const semProf = itensSel.filter(i => !i.professorId).length;
              const profList = Array.from(porProf.values());
              return (
                <View style={{ marginBottom: 8 }}>
                  <Text style={s.modalSub}>
                    Pré-visualização: {itensSel.length} pauta(s) · {profList.length} professor(es) receberão a notificação.
                    {semProf > 0 ? ` ${semProf} pauta(s) sem professor (serão ignoradas).` : ''}
                  </Text>
                  <ScrollView style={{ maxHeight: 160, marginTop: 4, backgroundColor: Colors.surface, borderRadius: 6, padding: 8, borderWidth: 1, borderColor: Colors.border }}>
                    {profList.length === 0 ? (
                      <Text style={{ fontSize: 12, color: Colors.textMuted }}>Nenhum destinatário válido.</Text>
                    ) : profList.map((p, idx) => (
                      <View key={idx} style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                          {p.nome} · {p.pautas.length} pauta(s)
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textSecondary }} numberOfLines={2}>
                          {p.pautas.slice(0, 4).map(x => `${x.disc} (${x.turma})`).join(' · ')}
                          {p.pautas.length > 4 ? ` +${p.pautas.length - 4} mais` : ''}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              );
            })()}
            <Text style={s.modalLabel}>Mensagem</Text>
            <TextInput
              style={s.modalInput} value={notifMsg} onChangeText={setNotifMsg}
              placeholder="A Subdirecção solicita o lançamento da sua pauta…" placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={4}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowLoteNotif(false)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.info }]} onPress={enviarNotifLote} disabled={sendingNotif}>
                {sendingNotif ? <AppLoader color="#fff" /> : <Text style={[s.modalBtnText, { color: '#fff' }]}>Confirmar e Enviar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Atribuir Professor em Lote */}
      <Modal visible={showAtribLote} transparent animationType="fade" onRequestClose={() => setShowAtribLote(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <Text style={[s.modalTitle, { color: Colors.warning }]}>Atribuir Professor em Lote</Text>
            <Text style={s.modalSub}>
              {seleccionados.size} pauta(s) seleccionada(s) · {trimestre}º Trimestre.
              {' '}O professor escolhido será associado a todas e adicionado às respectivas turmas.
            </Text>

            {atribLoteLoading ? (
              <AppLoader color={Colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <View style={[s.searchRow, { marginBottom: 8 }]}>
                  <StableSearchInput
                    value={atribLotePesquisa}
                    onChangeText={setAtribLotePesquisa}
                    inputStyle={s.searchInput}
                    placeholder="Pesquisar professor…"
                    iconColor={Colors.textMuted}
                  />
                </View>

                <ScrollView style={{ maxHeight: 320 }}>
                  {(() => {
                    const q = atribLotePesquisa.trim().toLowerCase();
                    const lista = q
                      ? atribLoteProfs.filter(p =>
                          `${p.nome ?? ''} ${p.apelido ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)
                        )
                      : atribLoteProfs;
                    if (lista.length === 0) {
                      return (
                        <View style={{ padding: 16, alignItems: 'center', gap: 6 }}>
                          <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
                          <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Nenhum professor encontrado.</Text>
                        </View>
                      );
                    }
                    return lista.map(p => {
                      const sel = atribLoteSelected === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[s.atribItem, sel && { borderColor: Colors.warning, backgroundColor: Colors.warning + '14' }]}
                          onPress={() => setAtribLoteSelected(p.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[s.atribItemName, sel && { color: Colors.warning }]}>
                              {p.nome} {p.apelido || ''}
                            </Text>
                            <Text style={s.atribItemSub}>{p.especialidade || p.email || '—'}</Text>
                          </View>
                          {sel && <Ionicons name="checkmark-circle" size={18} color={Colors.warning} />}
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </ScrollView>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowAtribLote(false)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: atribLoteSelected ? Colors.warning : Colors.border }]}
                onPress={confirmarAtribLote}
                disabled={!atribLoteSelected || atribLoteSaving}
              >
                {atribLoteSaving
                  ? <AppLoader color="#000" />
                  : <Text style={[s.modalBtnText, { color: atribLoteSelected ? '#000' : Colors.textMuted }]}>
                      Atribuir a {seleccionados.size}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Atribuir Professor à Pauta */}
      <Modal visible={showAtribModal} transparent animationType="fade" onRequestClose={() => setShowAtribModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <Text style={[s.modalTitle, { color: Colors.warning }]}>Atribuir Professor</Text>
            <Text style={s.modalSub}>
              <Text style={{ color: Colors.text, fontWeight: '600' }}>{atribTarget?.disciplina}</Text>
              {' · '}{atribTarget?.turmaNome}
              {atribTarget?.classe ? ` · ${atribTarget.classe}` : ''}
              {' · '}{trimestre}º Trimestre
            </Text>

            {atribLoading ? (
              <AppLoader color={Colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  <TouchableOpacity
                    style={[s.filterChip, !atribMostrarTodos && s.filterChipActive]}
                    onPress={() => setAtribMostrarTodos(false)}
                  >
                    <Text style={[s.filterChipText, !atribMostrarTodos && s.filterChipTextActive]}>
                      Da turma ({atribTurmaProfIds.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.filterChip, atribMostrarTodos && s.filterChipActive]}
                    onPress={() => setAtribMostrarTodos(true)}
                  >
                    <Text style={[s.filterChipText, atribMostrarTodos && s.filterChipTextActive]}>
                      Todos ({atribProfessores.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {atribMostrarTodos && (
                  <View style={[s.searchRow, { marginBottom: 8 }]}>
                    <StableSearchInput
                      value={atribPesquisa}
                      onChangeText={setAtribPesquisa}
                      inputStyle={s.searchInput}
                      placeholder="Pesquisar professor…"
                      iconColor={Colors.textMuted}
                    />
                  </View>
                )}

                <ScrollView style={{ maxHeight: 320 }}>
                  {(() => {
                    const base = atribMostrarTodos
                      ? atribProfessores
                      : atribProfessores.filter(p => atribTurmaProfIds.includes(p.id));
                    const q = atribPesquisa.trim().toLowerCase();
                    const lista = (q ? base.filter(p =>
                      `${p.nome ?? ''} ${p.apelido ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)
                    ) : base);

                    if (lista.length === 0) {
                      return (
                        <View style={{ padding: 16, alignItems: 'center', gap: 6 }}>
                          <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
                          <Text style={{ color: Colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                            {atribMostrarTodos
                              ? 'Nenhum professor corresponde à pesquisa.'
                              : 'Esta turma ainda não tem professores na lista.\nUse "Todos" para escolher qualquer professor.'}
                          </Text>
                        </View>
                      );
                    }

                    const sugestaoId = atribTarget ? sugestoesPorDisciplina.get(atribTarget.disciplina)?.professorId : undefined;
                    return lista.map(p => {
                      const sel = atribSelected === p.id;
                      const naTurma = atribTurmaProfIds.includes(p.id);
                      const sugerido = sugestaoId && sugestaoId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            s.atribItem,
                            sel && { borderColor: Colors.warning, backgroundColor: Colors.warning + '14' },
                          ]}
                          onPress={() => setAtribSelected(p.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={[s.atribItemName, sel && { color: Colors.warning }]}>
                                {p.nome} {p.apelido || ''}
                              </Text>
                              {sugerido && (
                                <View style={s.sugBadge}>
                                  <Ionicons name="sparkles" size={9} color={Colors.info} />
                                  <Text style={s.sugBadgeText}>Sugerido</Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.atribItemSub}>
                              {p.especialidade || p.email || '—'}
                              {!naTurma && atribMostrarTodos ? ' · será adicionado à turma' : ''}
                            </Text>
                          </View>
                          {sel && <Ionicons name="checkmark-circle" size={18} color={Colors.warning} />}
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </ScrollView>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowAtribModal(false)}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: atribSelected ? Colors.warning : Colors.border }]}
                onPress={confirmarAtribuirProfessor}
                disabled={!atribSelected || atribSaving}
              >
                {atribSaving
                  ? <AppLoader color="#000" />
                  : <Text style={[s.modalBtnText, { color: atribSelected ? '#000' : Colors.textMuted }]}>Atribuir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal histórico do professor */}
      <Modal visible={showHistModal} transparent animationType="fade" onRequestClose={() => setShowHistModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>Histórico — {histTarget?.professorNome || 'Professor'}</Text>
            <Text style={s.modalSub}>{histTarget?.turmaNome} · {histTarget?.disciplina}</Text>
            {histLoading ? (
              <AppLoader color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 400, marginTop: 8 }}>
                <Text style={s.histSection}>Incidentes ({histData?.incidentes.length || 0})</Text>
                {(histData?.incidentes || []).length === 0 ? (
                  <Text style={s.histEmpty}>Sem incidentes registados.</Text>
                ) : (histData?.incidentes || []).map((inc: any, i: number) => (
                  <View key={i} style={s.histRow}>
                    <Ionicons name={inc.tipo === 'lancamento_admin' ? 'shield-checkmark' : 'alert-circle'} size={13} color={inc.tipo === 'lancamento_admin' ? Colors.gold : Colors.danger} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.histRowTitle}>{inc.tipo === 'lancamento_admin' ? 'Lançamento Administrativo' : 'Atraso'} · {inc.disciplina} ({inc.trimestre}º T · {inc.anoLetivo})</Text>
                      <Text style={s.histRowSub}>{inc.descricao || '—'}</Text>
                      <Text style={s.histRowDate}>{new Date(inc.criadoEm).toLocaleString('pt-PT')}</Text>
                    </View>
                  </View>
                ))}
                <Text style={[s.histSection, { marginTop: 14 }]}>Pautas ({histData?.pautas.length || 0})</Text>
                {(histData?.pautas || []).slice(0, 20).map((p: any, i: number) => (
                  <View key={i} style={s.histRow}>
                    <Ionicons name={p.status === 'fechada' ? 'checkmark-circle' : 'create'} size={13} color={p.status === 'fechada' ? Colors.success : Colors.info} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.histRowTitle}>{p.turmaNome} · {p.disciplina} · {p.trimestre}º T · {p.anoLetivo}</Text>
                      <Text style={s.histRowSub}>Estado: {p.status}{p.lancamentoAdmin ? ' · LANÇ. ADMIN.' : ''}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border, marginTop: 12 }]} onPress={() => setShowHistModal(false)}>
              <Text style={[s.modalBtnText, { color: Colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      <PautaFinalPreviewModal
        visible={!!pautaPreview}
        html={pautaPreview?.html || ''}
        trimestre={pautaPreview?.trimestre || 1}
        anoLetivo={pautaPreview?.anoLetivo || ''}
        turmaNome={pautaPreview?.turmaId ? (turmas.find(t => t.id === pautaPreview.turmaId)?.nome || undefined) : undefined}
        onClose={() => setPautaPreview(null)}
        onPrinted={() => {
          if (pautaPreview?.turmaId) {
            marcarImpressa(pautaPreview.trimestre, pautaPreview.turmaId);
          }
        }}
      />

      {/* Modal — Prorrogar Professor */}
      <Modal visible={showProrrogModal} transparent animationType="fade" onRequestClose={() => setShowProrrogModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>Prorrogar prazo (professor)</Text>
            <Text style={s.modalSub}>Concede uma data limite individual a um professor para o trimestre seleccionado.</Text>

            <Text style={s.modalLabel}>Trimestre</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
              {[1,2,3].map(t => (
                <TouchableOpacity key={t} style={[s.trimChip, prorrogTrim === t && s.trimChipActive, { flex: 1 }]} onPress={() => setProrrogTrim(t as 1|2|3)}>
                  <Text style={[s.trimChipText, prorrogTrim === t && s.trimChipTextActive]}>{t}º</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>Professor</Text>
            <StableSearchInput
              value={prorrogSearch}
              onChangeText={setProrrogSearch}
              inputStyle={[s.modalInput, { minHeight: 36, marginBottom: 6 }]}
              placeholder="Pesquisar professor…"
              iconColor={Colors.textMuted}
            />
            <ScrollView style={{ maxHeight: 160, marginBottom: 10 }} keyboardShouldPersistTaps="handled">
              {profsList
                .filter(p => !prorrogSearch.trim() || `${p.nome} ${p.apelido || ''}`.toLowerCase().includes(prorrogSearch.toLowerCase()))
                .slice(0, 30)
                .map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.atribItem, prorrogProfId === p.id && { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' }]}
                    onPress={() => setProrrogProfId(p.id)}
                  >
                    <Ionicons name={prorrogProfId === p.id ? 'radio-button-on' : 'radio-button-off'} size={16} color={prorrogProfId === p.id ? Colors.primary : Colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.atribItemName}>{p.nome} {p.apelido || ''}</Text>
                      {p.especialidade && <Text style={s.atribItemSub}>{p.especialidade}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <Text style={s.modalLabel}>Nova data limite</Text>
            <DateInput
              style={[s.modalInput, { minHeight: 36, marginBottom: 10 }]}
              value={prorrogNovaData}
              onChangeText={setProrrogNovaData}
              placeholder="Seleccionar data"
              label="Nova data limite"
            />

            <Text style={s.modalLabel}>Motivo (opcional)</Text>
            <TextInput
              style={s.modalInput}
              value={prorrogMotivo}
              onChangeText={setProrrogMotivo}
              placeholder="Ex: doença justificada, missão de serviço…"
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.border }]} onPress={() => setShowProrrogModal(false)} disabled={savingProrrog}>
                <Text style={[s.modalBtnText, { color: Colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: Colors.info, opacity: savingProrrog ? 0.6 : 1 }]} onPress={salvarProrrogacao} disabled={savingProrrog}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>{savingProrrog ? 'A guardar…' : 'Conceder'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={s.statBox}><Text style={[s.statValue, { color }]}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

function SelectChip({ value, options, onChange }: { value: string; options: [string,string][]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find(([v]) => v === value)?.[1] || options[0]?.[1] || '—';
  return (
    <View>
      <TouchableOpacity style={s.selBtn} onPress={() => setOpen(true)}>
        <Text style={s.selBtnText} numberOfLines={1}>{current}</Text>
        <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[s.modalCard, { maxHeight: '70%' }]}>
            <ScrollView>
              {options.map(([v, label]) => (
                <TouchableOpacity key={v} style={s.selItem} onPress={() => { onChange(v); setOpen(false); }}>
                  <Text style={[s.selItemText, value === v && { color: Colors.primary, fontWeight: '700' }]}>{label}</Text>
                  {value === v && <Ionicons name="checkmark" size={14} color={Colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  viewRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  viewChip: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundCard },
  viewChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  viewChipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  viewChipTextActive: { color: '#fff' },

  trimRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  trimChip: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundCard },
  trimChipActive: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  trimChipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  trimChipTextActive: { color: Colors.primary },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  cardSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statBox: { flexBasis: '23%', flexGrow: 1, padding: 10, borderRadius: 8, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center' },

  bannerWarn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: Colors.danger + '14', borderWidth: 1, borderColor: Colors.danger + '44', marginTop: 10 },
  bannerWarnText: { flex: 1, color: Colors.danger, fontSize: 12, fontWeight: '600' },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: Colors.info + '14', borderWidth: 1, borderColor: Colors.info + '44', marginTop: 8 },
  bannerInfoText: { flex: 1, color: Colors.info, fontSize: 12, fontWeight: '600' },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.info + '14', borderWidth: 1, borderColor: Colors.info + '44', marginVertical: 8 },
  syncPillText: { color: Colors.info, fontSize: 11, fontWeight: '600' },

  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'flex-end' },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundCard },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  selectWrap: { flex: 1, minWidth: 120 },
  selLabel: { color: Colors.textMuted, fontSize: 10, marginBottom: 3 },
  selBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundCard },
  selBtnText: { color: Colors.text, fontSize: 11, flex: 1 },
  selItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  selItemText: { color: Colors.text, fontSize: 13 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 16, padding: 0, ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) },

  loteBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: Colors.primary + '14', borderRadius: 8, borderWidth: 1, borderColor: Colors.primary + '44', marginBottom: 10 },
  loteText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  loteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  loteBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  emptyBox: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },

  itemCard: { backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3 },
  itemHighlighted: {
    backgroundColor: Colors.gold + '22',
    borderColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 4,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkbox: { paddingTop: 2 },
  itemTurma: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  itemDisc: { color: Colors.primary, fontWeight: '600' },
  itemProf: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  estadoBadgeText: { fontSize: 10, fontWeight: '700' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressBar: { flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { color: Colors.textMuted, fontSize: 10, minWidth: 80, textAlign: 'right' },

  adminFlag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, padding: 6, backgroundColor: Colors.gold + '11', borderRadius: 6, borderWidth: 1, borderColor: Colors.gold + '44' },
  adminFlagText: { color: Colors.gold, fontSize: 10, fontWeight: '600', flex: 1 },

  itemActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: Colors.info + '55', backgroundColor: Colors.info + '11' },
  actionBtnText: { fontSize: 11, fontWeight: '600' },

  profCard: { backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  profHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  profNome: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  profSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  profBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  profBadgeText: { fontSize: 12, fontWeight: '800' },
  profStats: { flexDirection: 'row', gap: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  profStat: { fontSize: 11, fontWeight: '700' },
  profNotifBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: Colors.info + '11', borderWidth: 1, borderColor: Colors.info + '44' },
  profNotifBtnText: { color: Colors.info, fontSize: 11, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, width: '100%', maxWidth: 480, borderWidth: 1, borderColor: Colors.border },
  modalTitle: { color: Colors.gold, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  modalSub: { color: Colors.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 18 },
  modalLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 },
  modalInput: { backgroundColor: Colors.background, color: Colors.text, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, fontSize: 13, minHeight: 60, textAlignVertical: 'top' },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { fontSize: 13, fontWeight: '700' },

  histSection: { color: Colors.gold, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  histEmpty: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', padding: 8 },
  histRow: { flexDirection: 'row', gap: 8, padding: 8, marginBottom: 4, backgroundColor: Colors.background, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  histRowTitle: { color: Colors.text, fontSize: 11, fontWeight: '600' },
  histRowSub: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  histRowDate: { color: Colors.textMuted, fontSize: 9, marginTop: 2, fontStyle: 'italic' },

  atribItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  atribItemName: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  atribItemSub: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },

  sugBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.info + '22', borderWidth: 1, borderColor: Colors.info + '55' },
  sugBadgeText: { color: Colors.info, fontSize: 9, fontWeight: '700' },
  itemSugRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.info + '11', alignSelf: 'flex-start' },
  itemSugText: { color: Colors.info, fontSize: 10, fontWeight: '600' },

  // Cronograma & Acções
  cronoBox: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginTop: 6, marginBottom: 10, position: 'relative' },
  cronoLine: { position: 'absolute', left: 24, right: 24, top: 22, height: 2, backgroundColor: Colors.border },
  cronoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cronoItem: { flex: 1, alignItems: 'center', gap: 3 },
  cronoDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.backgroundCard, marginTop: 2 },
  cronoTrim: { fontSize: 9, fontWeight: '700', marginTop: 4 },
  cronoData: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  cronoStat: { fontSize: 10, fontWeight: '700', marginTop: 2 },

  prorrogBox: { backgroundColor: Colors.info + '0E', borderRadius: 10, borderWidth: 1, borderColor: Colors.info + '33', padding: 10, marginBottom: 10 },
  prorrogTitle: { color: Colors.info, fontSize: 10, fontWeight: '700', marginBottom: 6 },
  prorrogRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  prorrogText: { color: Colors.text, fontSize: 11, flex: 1 },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  actChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actChipText: { fontSize: 11, fontWeight: '700' },

  pfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pfBtn: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  pfBtnReady: { backgroundColor: Colors.success + '14', borderColor: Colors.success + '55' },
  pfBtnLocked: { backgroundColor: Colors.textMuted + '11', borderColor: Colors.border },
  pfBtnTitle: { fontSize: 11, fontWeight: '700' },
  pfBtnSub: { color: Colors.textMuted, fontSize: 9, marginTop: 1 },

  // Paginação
  paginacaoWrap:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 4, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  paginacaoInfo:  { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  paginacaoBtns:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pagBtn:         { minWidth: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  pagBtnAtivo:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pagBtnDis:      { opacity: 0.35 },
  pagBtnText:     { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  pagBtnAtivoText:{ color: '#fff' },
  pagEllipsis:    { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2, lineHeight: 30 },
});
