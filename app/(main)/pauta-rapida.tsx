import React, {
  useState, useEffect, useRef, useMemo, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useData, Nota, NotaLancamentos } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import TopBar from '@/components/TopBar';
import { useLookup } from '@/hooks/useLookup';
import { api } from '@/lib/api';
import { calcMFD_auto, calcNEN } from '@/lib/formulasDecreto';

// ─── Constants ───────────────────────────────────────────────────────────────
const COMPORTAMENTO_NIVELS = ['MB', 'B', 'S', 'M'] as const;
type ComportamentoNivel = typeof COMPORTAMENTO_NIVELS[number];

const COMP_COLORS: Record<string, { bg: string; text: string }> = {
  MB: { bg: '#16a34a22', text: '#16a34a' },
  B:  { bg: '#1d4ed822', text: '#1d4ed8' },
  S:  { bg: Colors.warning + '22', text: Colors.warning },
  M:  { bg: Colors.danger  + '22', text: Colors.danger  },
};

const ALL_AVAL_KEYS = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8'] as const;
type AvalKey = typeof ALL_AVAL_KEYS[number];

// ─── Calc helpers ─────────────────────────────────────────────────────────────
function calcMac(vals: number[], count: number): number {
  if (count === 0) return 0;
  return parseFloat((vals.reduce((s, v) => s + v, 0) / count).toFixed(2));
}
function calcMt(mac: number, pp: number, ppOn: boolean, pMac: number, pPp: number): number {
  if (!ppOn || pp === 0) return Math.round(mac * 10) / 10;
  return Math.round((mac * (pMac / 100) + pp * (pPp / 100)) * 10) / 10;
}
function calcNfBase(mt: number, pt: number, ptOn: boolean, pNt: number, pPt: number): number {
  if (!ptOn || pt === 0) return mt;
  return Math.round((mt * (pNt / 100) + pt * (pPt / 100)) * 10) / 10;
}
function calcNfT3Transicao(nt: number, pg1: number, pg2: number, percPg: number): number {
  const p = percPg / 100;
  return Math.round((nt * (1 - 2 * p) + pg1 * p + pg2 * p) * 10) / 10;
}
function calcNfT3Exame(nt: number, ex1: number, ex2: number, percEx: number): number {
  const p = percEx / 100;
  return Math.round((nt * (1 - 2 * p) + ex1 * p + ex2 * p) * 10) / 10;
}
function nfColor(v: number) {
  if (v >= 14) return Colors.success;
  if (v >= 10) return Colors.warning;
  return Colors.danger;
}

// ─── Transição (Decreto 04/2026) ─────────────────────────────────────────────
const NOTA_MIN_ABSOLUTA = 7;

type SituacaoTransicao = 'transita' | 'condicional' | 'nao_transita' | null;

interface SituacaoResult {
  situacao: SituacaoTransicao;
  label: string;
  motivo: string;
  cor: string;
  negativas: string[];
}

function calcSituacaoTransicao(
  nfsPorDisc: Record<string, number>,
  notaMin: number,
  maxNeg: number,
): SituacaoResult {
  const entries = Object.entries(nfsPorDisc).filter(([, v]) => v > 0);
  if (entries.length === 0) return { situacao: null, label: '—', motivo: 'Sem notas', cor: Colors.textMuted, negativas: [] };

  const abaixo7   = entries.filter(([, v]) => v < NOTA_MIN_ABSOLUTA);
  const negativas = entries.filter(([, v]) => v < notaMin);
  const negNomes  = negativas.map(([d]) => d);

  if (abaixo7.length > 0) {
    return {
      situacao: 'nao_transita',
      label: 'Não Transita',
      motivo: `NF < ${NOTA_MIN_ABSOLUTA} em: ${abaixo7.map(([d]) => d).join(', ')}`,
      cor: Colors.danger,
      negativas: negNomes,
    };
  }
  if (negativas.length > maxNeg) {
    return {
      situacao: 'nao_transita',
      label: 'Não Transita',
      motivo: `${negativas.length} negativas — máx. permitido: ${maxNeg} (Art. 23)`,
      cor: Colors.danger,
      negativas: negNomes,
    };
  }
  if (negativas.length > 0) {
    return {
      situacao: 'condicional',
      label: 'T. Condicionada',
      motivo: `${negativas.length} negativa${negativas.length > 1 ? 's' : ''}: ${negNomes.join(', ')}`,
      cor: Colors.warning,
      negativas: negNomes,
    };
  }
  return {
    situacao: 'transita',
    label: 'Transita',
    motivo: 'Sem negativas — Aprovado',
    cor: Colors.success,
    negativas: [],
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RowState {
  alunoId: string;
  notaId?: string;
  aval1: string; aval2: string; aval3: string; aval4: string;
  aval5: string; aval6: string; aval7: string; aval8: string;
  pp1: string; ppt: string;
  pg1: string; pg2: string;
  ex1: string; ex2: string;
  provaRecuperacao: string;
  comportamento: string;
  apreciacaoDescritiva: string;
  mac1: number; mt1: number; nf: number;
  dirty: boolean;
  obsSaving: boolean;
  obsSaved: boolean;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PautaRapidaScreen() {
  const router   = useRouter();
  const params   = useLocalSearchParams<{ turmaId?: string; disciplina?: string; trimestre?: string }>();
  const insets   = useSafeAreaInsets();
  const { notas, turmas, professores, alunos: alunosCtx, addNota, updateNota, isLoading: dataLoading } = useData();
  const { user } = useAuth();
  const { config } = useConfig();
  const { pautas, addPauta, updatePauta, getPautaByKey } = useProfessor();
  const { anoSelecionado } = useAnoAcademico();

  // ── Config weights ────────────────────────────────────────────────────────
  const pMac   = config.percMac       ?? 30;
  const pPp    = config.percPp        ?? 70;
  const pNt    = config.percNt        ?? 60;
  const pPt    = config.percPt        ?? 40;
  const pPg    = config.percPg        ?? 40;
  const pEx    = config.percExame     ?? 40;
  const pp1On  = config.pp1Habilitado ?? true;
  const pptOn  = config.pptHabilitado ?? true;
  const numAval = config.numAvaliacoes ?? 4;
  const provaRecHab  = config.provaRecuperacaoHabilitada ?? false;
  const compHab      = !!(config as any).comportamentoMiniPautaHabilitado;
  const aprecHab     = !!(config as any).apreciacaoDescritivaObrigatoria;

  // ── State ─────────────────────────────────────────────────────────────────
  const [turmaId,    setTurmaId]    = useState(params.turmaId    ?? '');
  const [disciplina, setDisciplina] = useState(params.disciplina ?? '');
  const [trimestre,  setTrimestre]  = useState<1|2|3>(parseInt(params.trimestre ?? '1') as 1|2|3);
  const [alunos,      setAlunos]      = useState<any[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [nuclearDisc, setNuclearDisc] = useState<Record<string, boolean>>({});
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [rows,        setRows]        = useState<Record<string, RowState>>({});
  const [expandedObs, setExpandedObs] = useState<string | null>(null);

  // Tab nav refs
  const inputRefs = useRef<(TextInput | null)[][]>([]);
  // Debounce timers for obs auto-save (keyed by alunoId)
  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Mobile modals
  const [turmaModal, setTurmaModal] = useState(false);
  const [discModal,  setDiscModal]  = useState(false);

  // ── Mini-pauta submission ──────────────────────────────────────────────────
  const [prazoMiniPauta, setPrazoMiniPauta] = useState<{ dataLimite: string; descricao?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isProfessor  = user?.role === 'professor';
  const isPrivileged = !!user?.role && ['ceo','pca','admin','director','chefe_secretaria','pedagogico'].includes(user.role);

  // ── Pedidos de abertura ────────────────────────────────────────────────────
  const [pedidosAbertura, setPedidosAbertura] = useState<any[]>([]);
  const [solicitarModal, setSolicitarModal]   = useState<{ field: string; label: string } | null>(null);
  const [solicitarMotivo, setSolicitarMotivo] = useState('');
  const [submittingAbertura, setSubmittingAbertura] = useState(false);

  async function reloadPedidosAbertura() {
    if (!isProfessor || isPrivileged) return;
    try {
      const data = await api.get<any[]>('/api/pedidos-abertura-avaliacao');
      if (Array.isArray(data)) setPedidosAbertura(data);
    } catch {}
  }
  useEffect(() => { reloadPedidosAbertura(); }, [isProfessor, isPrivileged, turmaId, disciplina, trimestre]);

  function getAberturaStatus(field: string): 'approved' | 'pending' | 'none' {
    if (!isProfessor || isPrivileged) return 'approved';
    const profId = professorActual?.id;
    const ped = pedidosAbertura
      .filter(p =>
        (p.professorId === profId || p.professorId === user?.id) &&
        p.disciplina === disciplina &&
        Number(p.trimestre) === Number(trimestre) &&
        p.avaliacao === field &&
        (!turmaId || p.turmaId === turmaId || !p.turmaId)
      )
      .sort((a: any, b: any) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    const last = ped[0];
    if (!last) return 'none';
    if (last.status === 'aprovada') return 'approved';
    if (last.status === 'pendente') return 'pending';
    return 'none';
  }

  async function submitSolicitarAbertura() {
    if (!solicitarModal) return;
    if (!solicitarMotivo.trim()) {
      webAlert('Motivo necessário', 'Indique o motivo pelo qual precisa lançar esta avaliação.');
      return;
    }
    setSubmittingAbertura(true);
    try {
      const turmaObj = turmasDisponiveis.find(t => t.id === turmaId);
      await api.post('/api/pedidos-abertura-avaliacao', {
        professorId: professorActual?.id ?? user?.id,
        professorNome: user?.nome ?? null,
        turmaId: turmaId || null,
        turmaNome: turmaObj?.nome || null,
        disciplina, trimestre, avaliacao: solicitarModal.field,
        motivo: solicitarMotivo.trim(),
      });
      alertSucesso('Pedido enviado', 'A direcção irá analisar o seu pedido.');
      setSolicitarModal(null); setSolicitarMotivo('');
      await reloadPedidosAbertura();
    } catch (e: any) {
      webAlert('Erro', e?.message?.includes('pendente')
        ? 'Já existe um pedido pendente para esta avaliação.'
        : 'Não foi possível enviar o pedido.');
    } finally { setSubmittingAbertura(false); }
  }

  // ── Trimestre activo ───────────────────────────────────────────────────────
  const trimestreAtivo: 1|2|3 = useMemo(() => {
    const agora  = new Date();
    const prazos = (config.prazosLancamento as any) || {};
    const t1Passou = prazos.t1 ? agora > new Date(prazos.t1 + 'T23:59:59') : false;
    const t2Passou = prazos.t2 ? agora > new Date(prazos.t2 + 'T23:59:59') : false;
    return t2Passou ? 3 : t1Passou ? 2 : 1;
  }, [config.prazosLancamento]);

  const professorActual = useMemo(() => {
    if (!isProfessor || !user) return null;
    return (professores ?? []).find(p =>
      p.utilizadorId === user.id || p.id === user.id || p.email === user.email
    ) ?? null;
  }, [isProfessor, user, professores]);

  const turmasDisponiveis = useMemo(() => {
    const ts = turmas ?? [];
    if (isPrivileged) return ts.filter(t => t.ativo !== false);
    if (!isProfessor || !professorActual) return ts.filter(t => t.ativo !== false);
    return ts.filter(t =>
      professorActual.turmasIds?.includes(t.id) ||
      (t.professoresIds ?? []).includes(professorActual.id)
    );
  }, [isProfessor, professorActual, turmas, isPrivileged]);

  // ── Detecção de classe para T3 ────────────────────────────────────────────
  const turmaActual = useMemo(
    () => turmasDisponiveis.find(t => t.id === turmaId),
    [turmasDisponiveis, turmaId]
  );
  const classeNum = useMemo(() => {
    const classeStr = turmaActual?.classe ?? turmaActual?.nome ?? '';
    return parseInt(String(classeStr).replace(/\D/g, ''), 10) || 0;
  }, [turmaActual]);
  const isT3 = trimestre === 3;
  const isT3Transicao = isT3 && (classeNum === 10 || classeNum === 11);
  const isT3Exame     = isT3 && classeNum === 12;

  const { items: discFallbackItems } = useLookup('disciplinas_fallback', [
    'Matemática','Português','Física','Química','Biologia',
    'História','Geografia','Inglês','Educação Física','Filosofia',
  ]);
  const discFallback = useMemo(() => (discFallbackItems ?? []).map(i => i.valor), [discFallbackItems]);

  const activeAvalKeys = useMemo(() => ALL_AVAL_KEYS.slice(0, numAval), [numAval]);
  const editableGradeFields = useMemo(() => {
    const f: string[] = [...activeAvalKeys];
    if (pp1On) f.push('pp1');
    if (pptOn) f.push('ppt');
    if (isT3Transicao) { f.push('pg1'); f.push('pg2'); }
    if (isT3Exame)     { f.push('ex1'); f.push('ex2'); }
    if (provaRecHab && isT3) f.push('provaRecuperacao');
    return f;
  }, [activeAvalKeys, pp1On, pptOn, isT3Transicao, isT3Exame, provaRecHab, isT3]);

  // ── Default turma ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!turmaId && turmasDisponiveis.length > 0) setTurmaId(turmasDisponiveis[0].id);
  }, [turmasDisponiveis]);

  useEffect(() => {
    if (!isPrivileged) setTrimestre(trimestreAtivo);
  }, [trimestreAtivo, isPrivileged]);

  // ── Load disciplines ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!turmaId) return;
    fetch(`/api/turmas/${turmaId}/disciplinas`)
      .then(r => r.ok ? r.json() : [])
      .then((list: { nome: string; nuclear?: boolean }[]) => {
        let names = list?.length > 0 ? list.map(d => d.nome) : discFallback;
        if (isProfessor && professorActual?.disciplinas?.length) {
          const filtered = names.filter(n => professorActual.disciplinas.includes(n));
          names = filtered.length > 0 ? filtered : professorActual.disciplinas;
        }
        setDisciplines(names);
        setDisciplina(prev => names.includes(prev) ? prev : (names[0] ?? ''));
        const nucMap: Record<string, boolean> = {};
        (list ?? []).forEach(d => { nucMap[d.nome] = !!d.nuclear; });
        setNuclearDisc(nucMap);
      })
      .catch(() => {
        const fb = (isProfessor && professorActual?.disciplinas?.length)
          ? professorActual.disciplinas : discFallback;
        setDisciplines(fb);
        setDisciplina(prev => fb.includes(prev) ? prev : (fb[0] ?? ''));
      });
  }, [turmaId]);

  // ── Load students ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!turmaId) return;
    setLoading(true);
    fetch(`/api/turmas/${turmaId}/alunos`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const lista = Array.isArray(data) && data.length > 0
          ? data
          : (alunosCtx ?? []).filter((a: any) =>
              a.turmaId === turmaId && a.ativo && !a.bloqueado && !a.falecido
            );
        setAlunos(lista);
      })
      .catch(() => setAlunos(
        (alunosCtx ?? []).filter((a: any) =>
          a.turmaId === turmaId && a.ativo && !a.bloqueado && !a.falecido
        )
      ))
      .finally(() => setLoading(false));
  }, [turmaId]);

  // ── Build rows from notas context ─────────────────────────────────────────
  useEffect(() => {
    if (!alunos.length || !disciplina) return;
    setRows(prev => {
      const next: Record<string, RowState> = {};
      for (const aluno of alunos) {
        if (prev[aluno.id]?.dirty || prev[aluno.id]?.obsSaving) {
          next[aluno.id] = prev[aluno.id]; continue;
        }
        const nota = notas.find(n =>
          n.alunoId === aluno.id && n.turmaId === turmaId &&
          n.disciplina === disciplina && n.trimestre === trimestre
        );
        next[aluno.id] = {
          alunoId: aluno.id,
          notaId:  nota?.id,
          aval1: nota?.aval1 != null ? String(nota.aval1) : '',
          aval2: nota?.aval2 != null ? String(nota.aval2) : '',
          aval3: nota?.aval3 != null ? String(nota.aval3) : '',
          aval4: nota?.aval4 != null ? String(nota.aval4) : '',
          aval5: nota?.aval5 != null ? String(nota.aval5) : '',
          aval6: nota?.aval6 != null ? String(nota.aval6) : '',
          aval7: nota?.aval7 != null ? String(nota.aval7) : '',
          aval8: nota?.aval8 != null ? String(nota.aval8) : '',
          pp1:   nota?.pp1  != null ? String(nota.pp1)  : '',
          ppt:   nota?.ppt  != null ? String(nota.ppt)  : '',
          pg1:   (nota as any)?.pg1  != null ? String((nota as any).pg1)  : '',
          pg2:   (nota as any)?.pg2  != null ? String((nota as any).pg2)  : '',
          ex1:   (nota as any)?.ex1  != null ? String((nota as any).ex1)  : '',
          ex2:   (nota as any)?.ex2  != null ? String((nota as any).ex2)  : '',
          provaRecuperacao: (nota as any)?.provaRecuperacao != null
            ? String((nota as any).provaRecuperacao) : '',
          comportamento:       (nota as any)?.comportamento ?? '',
          apreciacaoDescritiva:(nota as any)?.apreciacaoDescritiva ?? '',
          mac1: nota?.mac1 ?? 0,
          mt1:  nota?.mt1  ?? 0,
          nf:   nota?.nf   ?? 0,
          dirty: false,
          obsSaving: false,
          obsSaved: false,
        };
      }
      return next;
    });
  }, [alunos, notas, disciplina, trimestre, turmaId]);

  // ── Recalc with T3 support ─────────────────────────────────────────────────
  const recalc = useCallback((row: RowState): RowState => {
    const avalData = (activeAvalKeys as readonly string[]).map(k => ({
      val: parseFloat((row as any)[k]) || 0,
      reg: (row as any)[k] !== '',
    }));
    const allVals         = avalData.map(a => a.val);
    const registeredCount = avalData.filter(a => a.reg).length;
    const registeredVals  = avalData.filter(a => a.reg).map(a => a.val);

    let mac1 = 0;
    if (registeredCount === numAval) mac1 = calcMac(allVals, numAval);
    else if (registeredCount > 0)   mac1 = calcMac(registeredVals, registeredCount);

    const pp1v = parseFloat(row.pp1) || 0;
    const pptv = parseFloat(row.ppt) || 0;
    const mt1  = mac1 > 0 ? calcMt(mac1, pp1v, pp1On, pMac, pPp) : 0;

    let nf = 0;
    if (mt1 > 0) {
      if (isT3Transicao) {
        const pg1v = parseFloat(row.pg1) || 0;
        const pg2v = parseFloat(row.pg2) || 0;
        nf = (pg1v > 0 || pg2v > 0) ? calcNfT3Transicao(mt1, pg1v, pg2v, pPg) : mt1;
      } else if (isT3Exame) {
        const ex1v = parseFloat(row.ex1) || 0;
        const ex2v = parseFloat(row.ex2) || 0;
        nf = (ex1v > 0 || ex2v > 0) ? calcNfT3Exame(mt1, ex1v, ex2v, pEx) : mt1;
      } else {
        nf = calcNfBase(mt1, pptv, pptOn, pNt, pPt);
      }
    }
    if (provaRecHab && row.provaRecuperacao !== '') {
      const rv = parseFloat(row.provaRecuperacao) || 0;
      if (rv > nf) nf = rv;
    }
    return { ...row, mac1, mt1, nf };
  }, [activeAvalKeys, numAval, pp1On, pptOn, pMac, pPp, pNt, pPt,
      isT3Transicao, isT3Exame, pPg, pEx, provaRecHab]);

  // ── Cell update (grades) ───────────────────────────────────────────────────
  const updateCell = useCallback((alunoId: string, field: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setRows(prev => {
      const row = prev[alunoId];
      if (!row) return prev;
      return { ...prev, [alunoId]: recalc({ ...row, [field]: cleaned, dirty: true }) };
    });
  }, [recalc]);

  // ── Comportamento update ───────────────────────────────────────────────────
  const updateComportamento = useCallback((alunoId: string, nivel: string) => {
    setRows(prev => {
      const row = prev[alunoId];
      if (!row) return prev;
      const newNivel = row.comportamento === nivel ? '' : nivel;
      return { ...prev, [alunoId]: { ...row, comportamento: newNivel, dirty: true } };
    });
  }, []);

  // ── Obs update with debounced auto-save ────────────────────────────────────
  const saveObsForAluno = useCallback(async (alunoId: string, rowSnapshot: RowState) => {
    setRows(prev => ({
      ...prev,
      [alunoId]: { ...prev[alunoId], obsSaving: true, obsSaved: false },
    }));
    try {
      const payload: any = {
        alunoId, turmaId, disciplina, trimestre,
        anoLetivo: new Date().getFullYear().toString(),
        data: new Date().toISOString(),
        professorId: user?.id ?? '',
        apreciacaoDescritiva: rowSnapshot.apreciacaoDescritiva || null,
        comportamento: rowSnapshot.comportamento || null,
      };
      if (rowSnapshot.notaId) {
        await updateNota(rowSnapshot.notaId, payload);
      } else {
        const created = await addNota(payload as any);
        setRows(prev => ({
          ...prev,
          [alunoId]: { ...prev[alunoId], notaId: (created as any)?.id },
        }));
      }
      setRows(prev => ({
        ...prev,
        [alunoId]: { ...prev[alunoId], obsSaving: false, obsSaved: true },
      }));
      setTimeout(() => {
        setRows(prev => ({
          ...prev,
          [alunoId]: { ...prev[alunoId], obsSaved: false },
        }));
      }, 2000);
    } catch {
      setRows(prev => ({
        ...prev,
        [alunoId]: { ...prev[alunoId], obsSaving: false, obsSaved: false },
      }));
    }
  }, [turmaId, disciplina, trimestre, user?.id, addNota, updateNota]);

  const updateObs = useCallback((alunoId: string, value: string) => {
    setRows(prev => {
      const row = prev[alunoId];
      if (!row) return prev;
      const updated = { ...row, apreciacaoDescritiva: value };

      if (obsTimers.current[alunoId]) clearTimeout(obsTimers.current[alunoId]);
      obsTimers.current[alunoId] = setTimeout(() => {
        setRows(current => {
          const latest = current[alunoId];
          if (latest) saveObsForAluno(alunoId, latest);
          return current;
        });
      }, 1500);

      return { ...prev, [alunoId]: updated };
    });
  }, [saveObsForAluno]);

  // ── Tab / Enter navigation ────────────────────────────────────────────────
  const focusNext = useCallback((ri: number, ci: number) => {
    const nCols = editableGradeFields.length;
    let nr = ri, nc = ci + 1;
    if (nc >= nCols) { nc = 0; nr++; }
    if (nr < alunos.length) inputRefs.current[nr]?.[nc]?.focus();
  }, [editableGradeFields, alunos.length]);

  const focusPrev = useCallback((ri: number, ci: number) => {
    const nCols = editableGradeFields.length;
    let nr = ri, nc = ci - 1;
    if (nc < 0) { nc = nCols - 1; nr--; }
    if (nr >= 0) inputRefs.current[nr]?.[nc]?.focus();
  }, [editableGradeFields]);

  // ── Bulk save (grades) ─────────────────────────────────────────────────────
  async function saveAll() {
    const dirty = alunos.filter(a => rows[a.id]?.dirty);
    if (!dirty.length) { alertErro('Sem alterações de notas para guardar.'); return; }
    setSaving(true);
    let ok = 0, fail = 0;

    for (const aluno of dirty) {
      const row = rows[aluno.id];
      if (!row) continue;
      const lanc: Partial<NotaLancamentos> = {};
      const payload: any = {
        alunoId:     aluno.id,
        turmaId,     disciplina, trimestre,
        anoLetivo:   new Date().getFullYear().toString(),
        data:        new Date().toISOString(),
        professorId: user?.id ?? '',
        mac1: row.mac1, mac: row.mac1, mt1: row.mt1, nf: row.nf,
        comportamento:        row.comportamento       || null,
        apreciacaoDescritiva: row.apreciacaoDescritiva || null,
        lancamentos: lanc as NotaLancamentos,
      };

      (activeAvalKeys as readonly string[]).forEach(k => {
        if ((row as any)[k] !== '') {
          const v = parseFloat((row as any)[k]);
          payload[k] = isNaN(v) ? 0 : v;
          (lanc as any)[k] = true;
        }
      });
      const extraFields = ['pp1','ppt','pg1','pg2','ex1','ex2','provaRecuperacao'];
      extraFields.forEach(f => {
        if ((row as any)[f] !== '') {
          const v = parseFloat((row as any)[f]);
          payload[f] = isNaN(v) ? 0 : v;
          (lanc as any)[f] = true;
        }
      });

      try {
        if (row.notaId) await updateNota(row.notaId, payload);
        else            await addNota(payload as Omit<Nota, 'id'>);
        setRows(prev => ({ ...prev, [aluno.id]: { ...prev[aluno.id], dirty: false } }));
        ok++;
      } catch { fail++; }
    }

    setSaving(false);
    if (fail === 0) alertSucesso(`${ok} nota${ok !== 1 ? 's' : ''} guardada${ok !== 1 ? 's' : ''} com sucesso.`);
    else alertErro(`${ok} guardadas, ${fail} com erro.`);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const dirtyCount = useMemo(
    () => Object.values(rows).filter(r => r.dirty).length, [rows]
  );

  // ── Situação de transição (Decreto 04/2026) ───────────────────────────────
  // Classes de transição simples: 7ª, 8ª, 10ª, 11ª (MFD = média dos 3 trimestres)
  // Classes de Exame Nacional: 6ª, 9ª, 12ª (MFD incorpora NEN nas disciplinas nucleares)
  const classesExame = [6, 9, 12];
  const classesComTransicao = [6, 7, 8, 9, 10, 11, 12];
  const situacoesAlunos = useMemo<Record<string, SituacaoResult>>(() => {
    if (!classesComTransicao.includes(classeNum)) return {};

    const notaMin   = (config as any).notaMinimaAprovacao ?? 10;
    const maxNegI   = (config as any).maxNegativosICiclo  ?? 2;
    const maxNegII  = (config as any).maxNegativosIICiclo ?? 3;
    const maxNeg    = (classeNum >= 10) ? maxNegII : maxNegI;
    const isExame   = classesExame.includes(classeNum);
    const weights   = {
      percMT3Exame9a:  (config as any).percMT3Exame9aDecreto  ?? 60,
      percMT3Exame12a: (config as any).percMT3Exame12aDecreto ?? 50,
    };

    const result: Record<string, SituacaoResult> = {};

    for (const aluno of alunos) {
      const row = rows[aluno.id];
      const nfsPorDisc: Record<string, number> = {};

      if (isExame) {
        // 1. Recolhe MT1/MT2/MACT3/EX1/EX2 da BD por disciplina
        const rawByDisc: Record<string, { mt1?: number; mt2?: number; mact3?: number; ex1?: number; ex2?: number }> = {};
        for (const n of notas) {
          if (n.alunoId !== aluno.id || n.turmaId !== turmaId) continue;
          if (!rawByDisc[n.disciplina]) rawByDisc[n.disciplina] = {};
          const d = rawByDisc[n.disciplina];
          if (n.trimestre === 1 && n.mt1 > 0) d.mt1 = n.mt1;
          if (n.trimestre === 2 && n.mt1 > 0) d.mt2 = n.mt1;
          if (n.trimestre === 3) {
            const mact3 = (n as any).mac || (n as any).mac1 || 0;
            if (mact3 > 0) d.mact3 = mact3;
            if (n.ex1 > 0) d.ex1 = n.ex1;
            if (n.ex2 > 0) d.ex2 = n.ex2;
          }
        }

        // 2. Sobrepõe o trimestre/disciplina em edição com o valor em tempo real
        if (row && disciplina) {
          if (!rawByDisc[disciplina]) rawByDisc[disciplina] = {};
          const d = rawByDisc[disciplina];
          if (trimestre === 1 && row.mt1 > 0) d.mt1 = row.mt1;
          if (trimestre === 2 && row.mt1 > 0) d.mt2 = row.mt1;
          if (trimestre === 3) {
            if (row.mac1 > 0) d.mact3 = row.mac1;
            const rex1 = parseFloat(row.ex1); if (rex1 > 0) d.ex1 = rex1;
            const rex2 = parseFloat(row.ex2); if (rex2 > 0) d.ex2 = rex2;
          }
        }

        // 3. Aplica a fórmula do Decreto (com NEN para nucleares) por disciplina
        for (const [disc, d] of Object.entries(rawByDisc)) {
          const mt1 = d.mt1 ?? 0, mt2 = d.mt2 ?? 0, mact3 = d.mact3 ?? 0;
          if (mt1 <= 0 && mt2 <= 0 && mact3 <= 0) continue;
          const nen = calcNEN(d.ex1 ?? 0, d.ex2 ?? 0, classeNum);
          const nuclear = !!nuclearDisc[disc];
          const mfd = calcMFD_auto(mt1, mt2, mact3, nen, nuclear, classeNum, weights);
          if (mfd > 0) nfsPorDisc[disc] = mfd;
        }
      } else {
        // 1. Recolhe NFs da BD por disciplina+trimestre
        const nfPorDiscTrim: Record<string, Record<number, number>> = {};
        for (const n of notas) {
          if (n.alunoId !== aluno.id || n.turmaId !== turmaId) continue;
          if (!nfPorDiscTrim[n.disciplina]) nfPorDiscTrim[n.disciplina] = {};
          if (n.nf && n.nf > 0) nfPorDiscTrim[n.disciplina][n.trimestre] = n.nf;
        }

        // 2. Sobrepõe o trimestre actual com o valor calculado em tempo real
        if (row && disciplina) {
          if (!nfPorDiscTrim[disciplina]) nfPorDiscTrim[disciplina] = {};
          nfPorDiscTrim[disciplina][trimestre] = row.nf > 0 ? row.nf : (nfPorDiscTrim[disciplina][trimestre] ?? 0);
        }

        // 3. Calcula média anual por disciplina (avg dos trimestres disponíveis)
        for (const [disc, trimMap] of Object.entries(nfPorDiscTrim)) {
          const vals = Object.values(trimMap).filter(v => v > 0);
          if (vals.length > 0) nfsPorDisc[disc] = vals.reduce((s, v) => s + v, 0) / vals.length;
        }
      }

      result[aluno.id] = calcSituacaoTransicao(nfsPorDisc, notaMin, maxNeg);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunos, notas, turmaId, disciplina, trimestre, classeNum, rows, config, nuclearDisc]);
  const turmaNome = useMemo(
    () => turmasDisponiveis.find(t => t.id === turmaId)?.nome ?? '', [turmasDisponiveis, turmaId]
  );

  // ── Column header helper ───────────────────────────────────────────────────
  function LockedHeader({ field, label, sub }: { field: string; label: string; sub: string }) {
    const st = getAberturaStatus(field);
    const locked = isProfessor && !isPrivileged && st !== 'approved';
    return (
      <TouchableOpacity activeOpacity={locked ? 0.7 : 1}
        onPress={locked ? () => {
          if (st === 'pending') webAlert('Pedido em Análise', 'Aguarde a resposta da direcção.');
          else { if (!disciplina) return; setSolicitarMotivo(''); setSolicitarModal({ field, label }); }
        } : undefined}>
        <Text style={[s.hTxt, locked && { color: Colors.textMuted }]}>{label}</Text>
        {locked
          ? <Ionicons name={st === 'pending' ? 'time-outline' : 'lock-closed'} size={9}
              color={st === 'pending' ? Colors.warning : Colors.textMuted} />
          : <Text style={s.hSub}>{sub}</Text>}
      </TouchableOpacity>
    );
  }

  if (dataLoading) {
    return (
      <View style={s.screen}>
        <TopBar title="⚡ Pauta Rápida" subtitle="A carregar..."
          leftAction={{ icon: 'arrow-back', onPress: () => router.back() }} />
        <View style={s.center}><ActivityIndicator color={Colors.gold} size="large" /></View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <TopBar
        title="⚡ Pauta Rápida"
        subtitle={turmaId
          ? `${turmaNome} · ${disciplina || '—'} · ${trimestre}º Trim.`
          : 'Seleccione turma e disciplina'}
        leftAction={{ icon: 'arrow-back', onPress: () => router.back() }}
      />

      {/* ── Selectors: Turma + Disciplina ──────────────────────────────────── */}
      <View style={s.selectorsBar}>
        <View style={[s.selectorWrap, { flex: 1 }]}>
          <Ionicons name="layers-outline" size={11} color={Colors.gold} style={{ marginRight: 4 }} />
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <select value={turmaId} onChange={(e: any) => setTurmaId(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: Colors.text, fontSize: 12, fontFamily: 'Inter_500Medium',
                cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
              {turmasDisponiveis.map(t => (
                <option key={t.id} value={t.id} style={{ background: '#122540', color: Colors.text }}>{t.nome}</option>
              ))}
            </select>
          ) : (
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              onPress={() => setTurmaModal(true)}>
              <Text style={[s.selTxt, { flex: 1 }]} numberOfLines={1}>{turmaNome || 'Turma'}</Text>
              <Ionicons name="chevron-down" size={11} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.selDiv} />

        <View style={[s.selectorWrap, { flex: 1 }]}>
          <Ionicons name="book-outline" size={11} color={Colors.gold} style={{ marginRight: 4 }} />
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <select value={disciplina} onChange={(e: any) => setDisciplina(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: Colors.text, fontSize: 12, fontFamily: 'Inter_500Medium',
                cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
              {disciplines.map(d => (
                <option key={d} value={d} style={{ background: '#122540', color: Colors.text }}>{d}</option>
              ))}
            </select>
          ) : (
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              onPress={() => setDiscModal(true)}>
              <Text style={[s.selTxt, { flex: 1 }]} numberOfLines={1}>{disciplina || 'Disciplina'}</Text>
              <Ionicons name="chevron-down" size={11} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Trimestre ──────────────────────────────────────────────────────── */}
      <View style={s.trimBar}>
        <Text style={s.trimLabel}>Trimestre:</Text>
        {([1, 2, 3] as const).map(t => {
          const isLocked = !isPrivileged && t !== trimestreAtivo;
          const isActive = trimestre === t;
          return (
            <TouchableOpacity key={t}
              onPress={() => { if (!isLocked) setTrimestre(t); }}
              activeOpacity={isLocked ? 1 : 0.75}
              style={[s.tChip, isActive && s.tChipActive, isLocked && s.tChipLocked]}>
              <Text style={[s.tChipTxt, isActive && s.tChipTxtActive, isLocked && s.tChipTxtLocked]}>
                {t}º Trimestre
              </Text>
              {isLocked && <Ionicons name="lock-closed" size={9} color={Colors.textMuted} style={{ marginLeft: 4 }} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── T3 info badge ──────────────────────────────────────────────────── */}
      {isT3 && (isT3Transicao || isT3Exame) && (
        <View style={s.t3Badge}>
          <Ionicons name="school-outline" size={12} color={Colors.info} />
          <Text style={s.t3BadgeTxt}>
            {isT3Transicao
              ? `3º Trim. · Classe ${classeNum}ª — Provas Globais (PG) activas · peso ${pPg}% cada`
              : `3º Trim. · Classe ${classeNum}ª — Exames Nacionais (EX) activos · peso ${pEx}% cada`}
          </Text>
        </View>
      )}

      {/* ── Auth banner para professores ───────────────────────────────────── */}
      {isProfessor && !isPrivileged && disciplina && turmaId && (
        <View style={s.authBanner}>
          <Ionicons name="shield-checkmark-outline" size={13} color={Colors.info} />
          <Text style={s.authBannerTxt}>
            Cada coluna requer autorização. Toque no 🔒 para solicitar acesso.
          </Text>
        </View>
      )}

      {/* ── Hint bar ───────────────────────────────────────────────────────── */}
      <View style={s.hintBar}>
        <Ionicons name="return-down-forward-outline" size={11} color={Colors.textMuted} />
        <Text style={s.hintTxt}>
          {Platform.OS === 'web'
            ? 'Tab / Enter · Shift+Tab para recuar · OBS guarda automaticamente em 1.5s'
            : 'Enter para avançar · OBS guarda automaticamente'}
        </Text>
      </View>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.gold} /></View>
      ) : alunos.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="people-outline" size={42} color={Colors.textMuted} />
          <Text style={s.emptyTxt}>{turmaId ? 'Nenhum aluno nesta turma' : 'Seleccione uma turma'}</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <ScrollView horizontal showsHorizontalScrollIndicator
            contentContainerStyle={{ minWidth: '100%' as any }}>
            <View>
              {/* ── Table Header ─────────────────────────────────────────── */}
              <View style={s.headerRow}>
                <View style={s.colN}><Text style={s.hTxt}>#</Text></View>
                <View style={s.colNome}><Text style={s.hTxt}>Nome</Text></View>

                {/* Avaliações */}
                {activeAvalKeys.map((k, i) => (
                  <View key={k} style={s.colAval}>
                    <LockedHeader field={k} label={`A${i + 1}`} sub="1–5" />
                  </View>
                ))}

                {/* PP */}
                {pp1On && <View style={s.colGrade}><LockedHeader field="pp1" label="PP" sub="0–20" /></View>}

                {/* PT */}
                {pptOn && !isT3 && <View style={s.colGrade}><LockedHeader field="ppt" label="PT" sub="0–20" /></View>}

                {/* PG1 / PG2 — T3 10ª/11ª */}
                {isT3Transicao && <>
                  <View style={s.colGrade}><LockedHeader field="pg1" label="PG1" sub="0–20" /></View>
                  <View style={s.colGrade}><LockedHeader field="pg2" label="PG2" sub="0–20" /></View>
                </>}

                {/* EX1 / EX2 — T3 12ª */}
                {isT3Exame && <>
                  <View style={s.colGrade}><LockedHeader field="ex1" label="EX1" sub="0–20" /></View>
                  <View style={s.colGrade}><LockedHeader field="ex2" label="EX2" sub="0–20" /></View>
                </>}

                {/* Prova de Recuperação */}
                {provaRecHab && isT3 && (
                  <View style={s.colGrade}><LockedHeader field="provaRecuperacao" label="REC" sub="0–20" /></View>
                )}

                {/* Colunas calculadas */}
                <View style={s.colCalc}>
                  <Text style={[s.hTxt, { color: Colors.gold }]}>MAC</Text>
                </View>
                <View style={s.colCalc}><Text style={s.hTxt}>MT</Text></View>
                <View style={s.colNf}>
                  <Text style={[s.hTxt, { color: Colors.gold, fontSize: 11 }]}>NF</Text>
                </View>

                {/* Comportamento */}
                {compHab && (
                  <View style={s.colComp}>
                    <Text style={s.hTxt}>COMP.</Text>
                    <Text style={s.hSub}>MB/B/S/M</Text>
                  </View>
                )}

                {/* OBS / Situação */}
                <View style={s.colObs}>
                  <Text style={s.hTxt}>SITUAÇÃO</Text>
                  <Text style={s.hSub}>decreto</Text>
                </View>
              </View>

              {/* ── Student Rows ─────────────────────────────────────────── */}
              {alunos.map((aluno, ri) => {
                const row     = rows[aluno.id];
                if (!row) return null;
                if (!inputRefs.current[ri]) inputRefs.current[ri] = [];
                const nfVal   = row.nf;
                const nfCol   = nfVal > 0 ? nfColor(nfVal) : Colors.textMuted;
                const isEven  = ri % 2 === 0;
                const obsOpen = expandedObs === aluno.id;

                const gradeCell = (field: string, ci: number) => {
                  const val    = (row as any)[field] as string;
                  const colSt  = getAberturaStatus(field);
                  const locked = isProfessor && !isPrivileged && colSt !== 'approved';
                  return (
                    <View key={field} style={
                      field.startsWith('aval') ? s.colAval : s.colGrade
                    }>
                      {locked ? (
                        <TouchableOpacity style={[s.cellInput, s.cellLocked]}
                          onPress={() => {
                            if (colSt === 'pending') webAlert('Pedido em Análise', 'Aguarde a aprovação.');
                            else {
                              const idx = (activeAvalKeys as readonly string[]).indexOf(field as AvalKey);
                              const lbl = idx >= 0 ? `A${idx + 1}` : field === 'pp1' ? 'PP' : field === 'ppt' ? 'PT' : field.toUpperCase();
                              setSolicitarMotivo(''); setSolicitarModal({ field, label: lbl });
                            }
                          }} activeOpacity={0.7}>
                          <Ionicons
                            name={colSt === 'pending' ? 'time-outline' : 'lock-closed'}
                            size={11}
                            color={colSt === 'pending' ? Colors.warning : Colors.textMuted}
                          />
                        </TouchableOpacity>
                      ) : (
                        <TextInput
                          ref={el => { inputRefs.current[ri][ci] = el; }}
                          style={[s.cellInput, val !== '' && s.cellInputFilled]}
                          value={val}
                          onChangeText={v => updateCell(aluno.id, field, v)}
                          keyboardType="numeric"
                          maxLength={5}
                          placeholder="—"
                          placeholderTextColor={Colors.textMuted + '80'}
                          selectTextOnFocus
                          returnKeyType="next"
                          blurOnSubmit={false}
                          onSubmitEditing={() => focusNext(ri, ci)}
                          onKeyPress={({ nativeEvent }) => {
                            if (nativeEvent.key === 'Enter') focusNext(ri, ci);
                          }}
                          {...(Platform.OS === 'web' ? {
                            // @ts-ignore
                            onKeyDown: (e: any) => {
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                e.shiftKey ? focusPrev(ri, ci) : focusNext(ri, ci);
                              }
                              if (e.key === 'Enter') { e.preventDefault(); focusNext(ri, ci); }
                            },
                          } : {})}
                        />
                      )}
                    </View>
                  );
                };

                return (
                  <React.Fragment key={aluno.id}>
                    <View style={[s.dataRow, isEven && s.dataRowEven, row.dirty && s.dataRowDirty]}>
                      {/* # */}
                      <View style={s.colN}><Text style={s.nTxt}>{ri + 1}</Text></View>

                      {/* Nome */}
                      <View style={s.colNome}>
                        <Text style={s.nomeTxt} numberOfLines={1}>
                          {aluno.nome}{aluno.apelido ? ` ${aluno.apelido}` : ''}
                        </Text>
                        {row.dirty && <View style={s.dirtyDot} />}
                      </View>

                      {/* Avaliações */}
                      {editableGradeFields.map((field, ci) => gradeCell(field, ci))}

                      {/* MAC */}
                      <View style={s.colCalc}>
                        <Text style={[s.calcTxt, row.mac1 > 0 && { color: Colors.gold }]}>
                          {row.mac1 > 0 ? row.mac1.toFixed(1) : '—'}
                        </Text>
                      </View>

                      {/* MT */}
                      <View style={s.colCalc}>
                        <Text style={[s.calcTxt, row.mt1 > 0 && { color: Colors.textSecondary }]}>
                          {row.mt1 > 0 ? row.mt1.toFixed(1) : '—'}
                        </Text>
                      </View>

                      {/* NF */}
                      <View style={s.colNf}>
                        <Text style={[s.nfTxt, { color: nfCol }]}>
                          {nfVal > 0 ? nfVal.toFixed(1) : '—'}
                        </Text>
                      </View>

                      {/* Comportamento */}
                      {compHab && (
                        <View style={s.colComp}>
                          {Platform.OS === 'web' ? (
                            // @ts-ignore
                            <select
                              value={row.comportamento}
                              onChange={(e: any) => updateComportamento(aluno.id, e.target.value === row.comportamento ? '' : e.target.value)}
                              style={{
                                background: row.comportamento ? COMP_COLORS[row.comportamento]?.bg ?? 'transparent' : 'transparent',
                                border: `1px solid ${row.comportamento ? COMP_COLORS[row.comportamento]?.text ?? Colors.border : Colors.border}`,
                                borderRadius: 5, color: row.comportamento ? COMP_COLORS[row.comportamento]?.text ?? Colors.text : Colors.textMuted,
                                fontSize: 11, fontFamily: 'Inter_700Bold', cursor: 'pointer',
                                padding: '3px 4px', width: '90%', outline: 'none',
                              }}>
                              <option value="" style={{ background: '#122540', color: Colors.textMuted }}>—</option>
                              {COMPORTAMENTO_NIVELS.map(n => (
                                <option key={n} value={n} style={{ background: '#122540', color: Colors.text }}>{n}</option>
                              ))}
                            </select>
                          ) : (
                            <View style={{ flexDirection: 'row', gap: 2 }}>
                              {COMPORTAMENTO_NIVELS.map(n => {
                                const active = row.comportamento === n;
                                const cc = COMP_COLORS[n];
                                return (
                                  <TouchableOpacity key={n}
                                    onPress={() => updateComportamento(aluno.id, n)}
                                    style={[s.compChip, active && { backgroundColor: cc.bg, borderColor: cc.text }]}>
                                    <Text style={[s.compChipTxt, active && { color: cc.text }]}>{n}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      )}

                      {/* OBS / Situação */}
                      <View style={s.colObs}>
                        {(() => {
                          const sit = situacoesAlunos[aluno.id];
                          return (
                            <TouchableOpacity
                              onPress={() => setExpandedObs(obsOpen ? null : aluno.id)}
                              style={[s.situacaoBtn, obsOpen && s.situacaoBtnOpen]}
                              activeOpacity={0.75}>
                              {sit?.situacao ? (
                                <>
                                  <Ionicons
                                    name={
                                      sit.situacao === 'transita' ? 'checkmark-circle' :
                                      sit.situacao === 'condicional' ? 'alert-circle' :
                                      'close-circle'
                                    }
                                    size={12}
                                    color={sit.cor}
                                  />
                                  <Text style={[s.situacaoTxt, { color: sit.cor }]} numberOfLines={1}>
                                    {sit.situacao === 'transita' ? 'Transita' :
                                     sit.situacao === 'condicional' ? 'T.Cond.' : 'Não T.'}
                                  </Text>
                                </>
                              ) : (
                                <>
                                  {row.obsSaving ? (
                                    <ActivityIndicator size={10} color={Colors.gold} />
                                  ) : (
                                    <Ionicons
                                      name={row.apreciacaoDescritiva ? 'chatbubble-ellipses' : 'chatbubble-outline'}
                                      size={12}
                                      color={row.apreciacaoDescritiva ? Colors.gold : Colors.textMuted}
                                    />
                                  )}
                                  <Text style={s.situacaoTxt}>OBS</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    </View>

                    {/* ── Expanded OBS row ─────────────────────────────── */}
                    {obsOpen && (
                      <View style={[s.obsRow, isEven && s.dataRowEven]}>
                        <View style={s.obsRowInner}>
                          <View style={{ flex: 1, gap: 8 }}>
                            {/* Bloco: Situação de transição */}
                            {(() => {
                              const sit = situacoesAlunos[aluno.id];
                              if (!sit) return null;
                              return (
                                <View style={[s.sitDetailBox, { borderColor: sit.cor + '40', backgroundColor: sit.cor + '0C' }]}>
                                  <View style={s.sitDetailHeader}>
                                    <Ionicons
                                      name={
                                        sit.situacao === 'transita' ? 'checkmark-circle' :
                                        sit.situacao === 'condicional' ? 'alert-circle' : 'close-circle'
                                      }
                                      size={15}
                                      color={sit.cor}
                                    />
                                    <Text style={[s.sitDetailLabel, { color: sit.cor }]}>{sit.label}</Text>
                                    <Text style={s.sitDetailSub}>· Decreto 04/2026 (Art. 23)</Text>
                                  </View>
                                  <Text style={s.sitDetailMotivo}>{sit.motivo}</Text>
                                </View>
                              );
                            })()}

                            {/* Bloco: Apreciação descritiva */}
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                              <Ionicons name="create-outline" size={13} color={Colors.gold} style={{ marginTop: 3 }} />
                              <View style={{ flex: 1, position: 'relative' as any }}>
                                <TextInput
                                  style={s.obsTextarea}
                                  value={row.apreciacaoDescritiva}
                                  onChangeText={v => updateObs(aluno.id, v)}
                                  placeholder="Apreciação descritiva... (guarda automaticamente em 1.5s)"
                                  placeholderTextColor={Colors.textMuted + '80'}
                                  multiline
                                  numberOfLines={3}
                                  textAlignVertical="top"
                                  autoFocus
                                  {...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {})}
                                />
                                <View style={s.obsStatusBar}>
                                  {row.obsSaving && (
                                    <View style={s.obsStatusItem}>
                                      <ActivityIndicator size={10} color={Colors.textMuted} />
                                      <Text style={s.obsStatusTxt}>A guardar...</Text>
                                    </View>
                                  )}
                                  {row.obsSaved && (
                                    <View style={s.obsStatusItem}>
                                      <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                                      <Text style={[s.obsStatusTxt, { color: Colors.success }]}>Guardado</Text>
                                    </View>
                                  )}
                                  {!row.obsSaving && !row.obsSaved && row.apreciacaoDescritiva !== '' && (
                                    <Text style={s.obsStatusTxt}>Guarda em 1.5s</Text>
                                  )}
                                  <Text style={s.obsCharCount}>{(row.apreciacaoDescritiva || '').length} car.</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <TouchableOpacity onPress={() => setExpandedObs(null)} style={{ padding: 4, marginTop: 2 }}>
                            <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* ── Bottom bar ─────────────────────────────────────────────────────── */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={s.bottomLeft}>
          <Text style={s.bottomCount}>{alunos.length} aluno{alunos.length !== 1 ? 's' : ''}</Text>
          {dirtyCount > 0 && (
            <View style={s.dirtyBadge}>
              <Ionicons name="ellipse" size={6} color={Colors.warning} />
              <Text style={s.dirtyBadgeTxt}>
                {dirtyCount} alteraç{dirtyCount === 1 ? 'ão' : 'ões'} por guardar
              </Text>
            </View>
          )}
          {(isT3Transicao || isT3Exame) && (
            <Text style={s.t3Hint}>
              {isT3Transicao ? 'NF = MT×(1-2×PG%) + PG1×PG% + PG2×PG%' : 'NF = MT×(1-2×EX%) + EX1×EX% + EX2×EX%'}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.saveBtn, (dirtyCount === 0 || saving) && s.saveBtnOff]}
          onPress={saveAll}
          disabled={dirtyCount === 0 || saving}
          activeOpacity={0.8}>
          {saving ? (
            <ActivityIndicator size="small" color="#0D1F35" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={16}
                color={dirtyCount > 0 ? '#0D1F35' : Colors.textMuted} />
              <Text style={[s.saveBtnTxt, dirtyCount === 0 && { color: Colors.textMuted }]}>
                Guardar{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Modal: Solicitar Autorização ───────────────────────────────────── */}
      <Modal visible={!!solicitarModal} transparent animationType="fade"
        onRequestClose={() => setSolicitarModal(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSolicitarModal(null)} />
        <View style={s.authModal}>
          <View style={s.authModalHeader}>
            <Ionicons name="lock-open-outline" size={20} color={Colors.gold} />
            <Text style={s.authModalTitle}>Solicitar Autorização</Text>
          </View>
          <Text style={s.authModalSub}>
            {solicitarModal?.label} · {disciplina} · {trimestre}º Trim.
          </Text>
          <Text style={s.authModalDesc}>
            Indique o motivo pelo qual precisa de lançar esta avaliação. A direcção será notificada.
          </Text>
          <TextInput
            style={s.authModalInput}
            placeholder="Ex: Primeira avaliação do trimestre..."
            placeholderTextColor={Colors.textMuted}
            value={solicitarMotivo}
            onChangeText={setSolicitarMotivo}
            multiline numberOfLines={3} textAlignVertical="top"
            {...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {})}
          />
          <View style={s.authModalBtns}>
            <TouchableOpacity style={s.authModalBtnCancel} onPress={() => setSolicitarModal(null)}>
              <Text style={s.authModalBtnCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.authModalBtnSend, submittingAbertura && { opacity: 0.6 }]}
              onPress={submitSolicitarAbertura} disabled={submittingAbertura}>
              {submittingAbertura
                ? <ActivityIndicator size="small" color="#0D1F35" />
                : <><Ionicons name="send" size={13} color="#0D1F35" /><Text style={s.authModalBtnSendTxt}>Enviar Pedido</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Mobile: Turma picker ───────────────────────────────────────────── */}
      <Modal visible={turmaModal} transparent animationType="slide"
        onRequestClose={() => setTurmaModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setTurmaModal(false)} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Seleccionar Turma</Text>
          <ScrollView>
            {turmasDisponiveis.map(t => (
              <TouchableOpacity key={t.id} style={s.modalOption}
                onPress={() => { setTurmaId(t.id); setTurmaModal(false); }}>
                <Ionicons name="school-outline" size={15} color={Colors.textMuted} />
                <Text style={[s.modalOptTxt, turmaId === t.id && s.modalOptTxtActive]} numberOfLines={1}>{t.nome}</Text>
                {turmaId === t.id && <Ionicons name="checkmark" size={16} color={Colors.gold} style={{ marginLeft: 'auto' as any }} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Mobile: Disciplina picker ──────────────────────────────────────── */}
      <Modal visible={discModal} transparent animationType="slide"
        onRequestClose={() => setDiscModal(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setDiscModal(false)} />
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Seleccionar Disciplina</Text>
          <ScrollView>
            {disciplines.map(d => (
              <TouchableOpacity key={d} style={s.modalOption}
                onPress={() => { setDisciplina(d); setDiscModal(false); }}>
                <Ionicons name="book-outline" size={15} color={Colors.textMuted} />
                <Text style={[s.modalOptTxt, disciplina === d && s.modalOptTxtActive]}>{d}</Text>
                {disciplina === d && <Ionicons name="checkmark" size={16} color={Colors.gold} style={{ marginLeft: 'auto' as any }} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const COL_N    = 28;
const COL_NOME = 162;
const COL_AVAL = 46;
const COL_GRADE = 54;
const COL_CALC  = 50;
const COL_NF    = 54;
const COL_COMP  = 90;
const COL_OBS   = 82;

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: Colors.background },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 8 },

  // Selectors
  selectorsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  selectorWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  selTxt: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_500Medium' },
  selDiv: { width: 1, height: 20, backgroundColor: Colors.border, marginHorizontal: 4 },

  // Trimestre
  trimBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.backgroundElevated,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 6, flexWrap: 'wrap',
  },
  trimLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginRight: 2 },
  tChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  tChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tChipTxt:    { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  tChipTxtActive: { color: '#0D1F35' },
  tChipLocked:    { opacity: 0.38, borderStyle: 'dashed' },
  tChipTxtLocked: { color: Colors.textMuted },

  // T3 badge
  t3Badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: Colors.info + '12',
    borderBottomWidth: 1, borderBottomColor: Colors.info + '30',
  },
  t3BadgeTxt: { flex: 1, fontSize: 10, color: Colors.info, fontFamily: 'Inter_500Medium' },

  // Auth banner
  authBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: Colors.info + '12',
    borderBottomWidth: 1, borderBottomColor: Colors.info + '30',
  },
  authBannerTxt: { flex: 1, fontSize: 10, color: Colors.info, fontFamily: 'Inter_400Regular' },

  // Hint
  hintBar: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: Colors.backgroundElevated + 'AA',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  hintTxt: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', flex: 1 },

  // Table header
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderBottomWidth: 2, borderBottomColor: Colors.gold + '40',
    height: 40,
  },
  hTxt: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  hSub: { fontSize: 8,  color: Colors.textMuted,     fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Data rows
  dataRow:      { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dataRowEven:  { backgroundColor: Colors.backgroundCard + '66' },
  dataRowDirty: { backgroundColor: Colors.warning + '08' },

  // Columns
  colN:    { width: COL_N,    alignItems: 'center', justifyContent: 'center' },
  colNome: { width: COL_NOME, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  colAval: { width: COL_AVAL, alignItems: 'center', justifyContent: 'center' },
  colGrade:{ width: COL_GRADE,alignItems: 'center', justifyContent: 'center' },
  colCalc: { width: COL_CALC, alignItems: 'center', justifyContent: 'center' },
  colNf:   { width: COL_NF,   alignItems: 'center', justifyContent: 'center' },
  colComp: { width: COL_COMP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  colObs:  { width: COL_OBS,  alignItems: 'center', justifyContent: 'center' },

  nTxt:    { fontSize: 11, color: Colors.textMuted,     fontFamily: 'Inter_400Regular', textAlign: 'center' },
  nomeTxt: { flex: 1, fontSize: 12, color: Colors.text, fontFamily: 'Inter_500Medium' },
  calcTxt: { fontSize: 12, color: Colors.textMuted,     fontFamily: 'Inter_500Medium' },
  nfTxt:   { fontSize: 13, fontFamily: 'Inter_700Bold' },
  dirtyDot:{ width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.warning },

  cellInput: {
    width: '88%', height: 28, borderRadius: 5, textAlign: 'center',
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}),
  },
  cellInputFilled: {
    color: Colors.text,
    borderColor: Colors.gold + '55',
    backgroundColor: Colors.gold + '0D',
  },
  cellLocked: {
    width: '88%', height: 28, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', opacity: 0.7,
  },

  // Comportamento chip
  compChip:    { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: Colors.border + '80' },
  compChipTxt: { fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_700Bold' },

  // OBS expanded row
  obsRow:     { borderBottomWidth: 1, borderBottomColor: Colors.border },
  obsRowInner:{
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.gold + '06',
    borderLeftWidth: 3, borderLeftColor: Colors.gold + '60',
  },
  obsTextarea: {
    flex: 1,
    minHeight: 64, maxHeight: 120,
    borderRadius: 8, padding: 10,
    fontSize: 12, color: Colors.text, fontFamily: 'Inter_400Regular',
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.gold + '33',
    textAlignVertical: 'top', lineHeight: 18,
    ...(Platform.OS === 'web' ? { outlineWidth: 0, resize: 'vertical' } as any : {}),
  },
  obsStatusBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  obsStatusItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  obsStatusTxt:  { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  obsCharCount:  { fontSize: 10, color: Colors.textMuted + '80', fontFamily: 'Inter_400Regular' },

  // Situação badge (OBS column)
  situacaoBtn: {
    width: '92%', height: 30, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', gap: 3, paddingHorizontal: 4,
  },
  situacaoBtnOpen: { borderColor: Colors.gold + '80', backgroundColor: Colors.gold + '10' },
  situacaoTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, flexShrink: 1 },

  // Situação detail (inside expanded panel)
  sitDetailBox: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 7, gap: 3,
  },
  sitDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sitDetailLabel:  { fontSize: 12, fontFamily: 'Inter_700Bold' },
  sitDetailSub:    { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  sitDetailMotivo: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  obsSavedTxt: { fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' },

  // Bottom
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: Colors.backgroundCard,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  bottomLeft:    { flexDirection: 'column', gap: 2 },
  bottomCount:   { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  dirtyBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dirtyBadgeTxt: { fontSize: 11, color: Colors.warning, fontFamily: 'Inter_500Medium' },
  t3Hint:        { fontSize: 9, color: Colors.textMuted + 'AA', fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  saveBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.gold },
  saveBtnOff: { backgroundColor: Colors.backgroundElevated },
  saveBtnTxt: { fontSize: 13, color: '#0D1F35', fontFamily: 'Inter_700Bold' },

  // Auth modal
  authModal: {
    position: 'absolute', top: '20%', left: 16, right: 16,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, padding: 20, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  authModalHeader:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  authModalTitle:        { fontSize: 16, color: Colors.text, fontFamily: 'Inter_700Bold' },
  authModalSub:          { fontSize: 12, color: Colors.gold, fontFamily: 'Inter_600SemiBold', marginBottom: 10 },
  authModalDesc:         { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },
  authModalInput: {
    backgroundColor: Colors.backgroundElevated, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular',
    minHeight: 72, textAlignVertical: 'top', marginBottom: 14,
  },
  authModalBtns:          { flexDirection: 'row', gap: 10 },
  authModalBtnCancel:     { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border },
  authModalBtnCancelTxt:  { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  authModalBtnSend:       { flex: 2, flexDirection: 'row', gap: 6, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold },
  authModalBtnSendTxt:    { fontSize: 13, color: '#0D1F35', fontFamily: 'Inter_700Bold' },

  // Mobile modals
  modalOverlay: { flex: 1, backgroundColor: '#00000066' },
  modalSheet:   { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 12, maxHeight: '60%' },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 15, color: Colors.text, fontFamily: 'Inter_700Bold', paddingHorizontal: 16, marginBottom: 10 },
  modalOption:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  modalOptTxt:  { flex: 1, fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  modalOptTxtActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
});
