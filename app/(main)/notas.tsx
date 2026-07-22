import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, Nota, NotaLancamentos, PedidoReabertura } from '@/context/DataContext';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import TopBar from '@/components/TopBar';
import ContinuidadeStatusModal from '@/components/ContinuidadeStatusModal';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useLookup } from '@/hooks/useLookup';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { webAlert } from '@/utils/webAlert';
import { useRouter } from 'expo-router';

const ALL_AVAL_KEYS = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8'] as const;
type AvalKey = typeof ALL_AVAL_KEYS[number];

function calcMac(vals: number[], count: number): number {
  if (count === 0) return 0;
  return parseFloat((vals.reduce((s, v) => s + v, 0) / count).toFixed(2));
}

function calcMt1(mac1: number, pp1: number, pp1On: boolean, percMac: number, percPp: number): number {
  if (!pp1On || pp1 === 0) return Math.round(mac1 * 10) / 10;
  return Math.round((mac1 * (percMac / 100) + pp1 * (percPp / 100)) * 10) / 10;
}

function calcNfMiniPauta(mt1: number, ppt: number, pptOn: boolean, percNt: number, percPt: number): number {
  if (!pptOn || ppt === 0) return mt1;
  return Math.round((mt1 * (percNt / 100) + ppt * (percPt / 100)) * 10) / 10;
}

function gradeColor(val: number) {
  if (val >= 14) return Colors.success;
  if (val >= 10) return Colors.warning;
  return Colors.danger;
}

function gradeLabel(val: number) {
  if (val >= 17) return 'Excelente';
  if (val >= 14) return 'Bom';
  if (val >= 10) return 'Suficiente';
  if (val >= 6) return 'Insuficiente';
  return 'Mau';
}

function avalColor(v: number) {
  if (v >= 4) return Colors.success;
  if (v === 3) return '#D4920E';
  if (v >= 1) return Colors.danger;
  return Colors.textMuted;
}

// ─── Modern AVAL pill selector ───────────────────────────────────────────────
function AvalPills({
  label, idx, value, onChange, registered = false,
  locked = false, onPressLocked, pending = false, disabled = false,
}: {
  label: string; idx: number; value: number; onChange?: (v: number) => void;
  registered?: boolean; locked?: boolean; onPressLocked?: () => void;
  pending?: boolean; disabled?: boolean;
}) {
  const OPTIONS = [1, 2, 3, 4, 5];

  if (locked && onPressLocked) {
    return (
      <View style={ap.row}>
        <Text style={ap.rowLabel}>{label}</Text>
        <View style={ap.pills}>
          {OPTIONS.map(n => (
            <View key={n} style={[ap.pill, { opacity: 0.18 }]}>
              <Text style={ap.pillTxt}>{n}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[ap.lockTag, pending && ap.lockTagPending]} onPress={onPressLocked} activeOpacity={0.7}>
          <Ionicons name={pending ? 'time' : 'lock-closed'} size={11} color={pending ? Colors.warning : Colors.textMuted} />
          <Text style={[ap.lockTxt, pending && { color: Colors.warning }]}>{pending ? 'Pendente' : 'Solicitar'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[ap.row, disabled && { opacity: 0.3 }]} pointerEvents={disabled ? 'none' : 'auto'}>
      <Text style={ap.rowLabel}>{label}</Text>
      <View style={ap.pills}>
        {OPTIONS.map(n => {
          const sel = value === n;
          const col = avalColor(n);
          return (
            <TouchableOpacity
              key={n}
              disabled={!onChange}
              onPress={() => { onChange?.(sel ? 0 : n); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
              style={[ap.pill, sel && { backgroundColor: col + '28', borderColor: col, borderWidth: 2 }]}
              activeOpacity={0.6}
            >
              <Text style={[ap.pillTxt, sel && { color: col, fontFamily: 'Inter_700Bold' }]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={ap.statusSlot}>
        {registered && value > 0
          ? <Ionicons name="checkmark-circle" size={18} color={avalColor(value)} />
          : registered
          ? <Ionicons name="ellipse-outline" size={16} color={Colors.textMuted} />
          : null}
      </View>
    </View>
  );
}

// ─── Modern numeric grade input ──────────────────────────────────────────────
function GradeInput({
  label, value, onChange, registered = false, readonly = false,
  locked = false, onPressLocked, pending = false, min = 0, max = 20,
}: {
  label: string; value: number; onChange?: (v: number) => void;
  registered?: boolean; readonly?: boolean;
  locked?: boolean; onPressLocked?: () => void; pending?: boolean;
  min?: number; max?: number;
}) {
  const col = registered && value > 0 ? gradeColor(value) : Colors.textMuted;
  const isOver = !readonly && value > max && value > 0;
  const borderCol = isOver ? Colors.danger : registered ? Colors.success + '80' : Colors.border;
  const bg = isOver ? Colors.danger + '12' : registered ? Colors.success + '0A' : Colors.surface;

  if (locked && onPressLocked) {
    return (
      <TouchableOpacity style={gi.wrap} onPress={onPressLocked} activeOpacity={0.7}>
        <Text style={gi.label}>{label}</Text>
        <View style={[gi.box, { borderColor: pending ? Colors.warning + '80' : Colors.border, backgroundColor: pending ? Colors.warning + '0A' : Colors.surface }]}>
          {pending
            ? <><Ionicons name="time" size={13} color={Colors.warning} /><Text style={gi.lockTxt}>Pend.</Text></>
            : <><Ionicons name="lock-closed" size={13} color={Colors.textMuted} /><Text style={gi.lockTxt}>Editar</Text></>}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={gi.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Text style={gi.label}>{label}</Text>
        {registered && !isOver && <Ionicons name="checkmark-circle" size={12} color={Colors.success} />}
        {isOver && <Ionicons name="alert-circle" size={12} color={Colors.danger} />}
      </View>
      {readonly ? (
        <View style={[gi.box, { borderColor: borderCol, backgroundColor: bg }]}>
          <Text style={[gi.val, { color: registered && value > 0 ? col : Colors.textMuted }]}>{value > 0 ? value.toFixed(1) : '—'}</Text>
        </View>
      ) : (
        <TextInput
          style={[gi.input, { borderColor: borderCol, backgroundColor: bg, color: registered && value > 0 ? col : Colors.text }]}
          value={value === 0 ? '' : String(value)}
          onChangeText={t => {
            const cleaned = t.replace(/[^0-9.]/g, '');
            if (cleaned === '' || cleaned === '0') { onChange?.(0); return; }
            const n = parseFloat(cleaned);
            if (!isNaN(n)) onChange?.(Math.min(max, Math.max(min, n)));
          }}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={Colors.textMuted}
          maxLength={max <= 5 ? 1 : 5}
          selectTextOnFocus
        />
      )}
    </View>
  );
}

// ─── Live NF result banner ───────────────────────────────────────────────────
function NfResultBanner({ mac, mt1, nf, pp1On, pptOn, avaisCompletas }: {
  mac: number; mt1: number; nf: number; pp1On: boolean; pptOn: boolean; avaisCompletas: boolean;
}) {
  const nfAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(nfAnim, { toValue: nf > 0 ? 1 : 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }, [nf]);

  if (mac === 0) return null;
  const nfColor = nf > 0 ? gradeColor(nf) : Colors.textMuted;

  return (
    <Animated.View style={[rb.wrap, { opacity: nfAnim, transform: [{ scale: nfAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
      <View style={rb.inner}>
        {/* MAC */}
        <View style={rb.col}>
          <Text style={rb.lbl}>MAC</Text>
          <Text style={[rb.val, { color: avalColor(mac > 5 ? 5 : mac) }]}>{mac.toFixed(2)}</Text>
          <Text style={rb.sub}>Avaliações</Text>
        </View>
        {(pp1On || pptOn) && <><View style={rb.arrow}><Ionicons name="arrow-forward" size={14} color={Colors.textMuted} /></View>
        <View style={rb.col}>
          <Text style={rb.lbl}>MT1</Text>
          <Text style={[rb.val, { color: mt1 > 0 ? gradeColor(mt1) : Colors.textMuted }]}>{mt1 > 0 ? mt1.toFixed(1) : '—'}</Text>
          <Text style={rb.sub}>Méd. Total</Text>
        </View></>}
        <View style={rb.arrow}><Ionicons name="arrow-forward" size={14} color={Colors.textMuted} /></View>
        {/* NF — principal */}
        <View style={[rb.nfCol, { borderColor: nfColor + '50' }]}>
          <Text style={[rb.nfVal, { color: nfColor }]}>{nf > 0 ? nf.toFixed(1) : '—'}</Text>
          <Text style={rb.nfLbl}>NF</Text>
          {nf > 0 && <View style={[rb.nfBadge, { backgroundColor: nfColor + '20' }]}>
            <Text style={[rb.nfBadgeTxt, { color: nfColor }]}>{gradeLabel(nf)}</Text>
          </View>}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Student row in modal list ───────────────────────────────────────────────
function StudentRow({ aluno, isSel, jaLancado, pct, onPress }: {
  aluno: any; isSel: boolean; jaLancado: boolean; pct: number; onPress: () => void;
}) {
  const initials = ((aluno.nome || '').charAt(0) + (aluno.apelido || '').charAt(0)).toUpperCase();
  const avatarBg = isSel ? Colors.gold + '30' : jaLancado ? Colors.success + '18' : Colors.surface;
  const avatarTxt = isSel ? Colors.goldLight : jaLancado ? Colors.success : Colors.textSecondary;

  return (
    <TouchableOpacity style={[sr.row, isSel && sr.rowActive]} onPress={onPress} activeOpacity={0.7}>
      <View style={[sr.avatar, { backgroundColor: avatarBg }]}>
        <Text style={[sr.initials, { color: avatarTxt }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[sr.name, isSel && { color: Colors.goldLight }]} numberOfLines={1}>{aluno.nome} {aluno.apelido}</Text>
        {aluno.numeroMatricula ? <Text style={sr.num}>Nº {aluno.numeroMatricula}</Text> : null}
      </View>
      {jaLancado && pct === 100
        ? <Ionicons name="checkmark-circle" size={16} color={isSel ? Colors.goldLight : Colors.success} />
        : jaLancado
        ? <View style={sr.partialDot}><Text style={sr.partialTxt}>{pct}%</Text></View>
        : isSel
        ? <Ionicons name="radio-button-on" size={16} color={Colors.gold} />
        : null}
    </TouchableOpacity>
  );
}

const LANC_KEYS: (keyof NotaLancamentos)[] = ['aval1','aval2','aval3','aval4','aval5','aval6','aval7','aval8','pp1','ppt'];

function buildEmptyLanc(): NotaLancamentos {
  return { aval1: false, aval2: false, aval3: false, aval4: false, aval5: false, aval6: false, aval7: false, aval8: false, pp1: false, ppt: false };
}

// ─── Main Modal ──────────────────────────────────────────────────────────────
function NotaFormModal({
  visible, onClose, onSave, alunos, turmas, nota, trimestre, disciplinas, professorId,
  pp1Habilitado, pptHabilitado, numAvaliacoes, allNotas,
}: {
  visible: boolean; onClose: () => void;
  onSave: (n: Partial<Nota>, parcial: boolean) => void;
  alunos: any[]; turmas: any[]; nota: Nota | null; trimestre: 1 | 2 | 3;
  disciplinas: string[]; professorId: string;
  pp1Habilitado: boolean; pptHabilitado: boolean; numAvaliacoes: number; allNotas: Nota[];
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  useEnterToSave(() => handleSave(false), visible);

  const [autoNota, setAutoNota] = useState<Nota | null>(null);
  const autoKeyRef = useRef<string>('');
  const effectiveNota = nota ?? autoNota;
  const isEditingExisting = effectiveNota !== null;
  const activeAvalKeys = ALL_AVAL_KEYS.slice(0, numAvaliacoes);

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>(nota?.turmaId || turmas[0]?.id || '');
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunosDaAPI, setAlunosDaAPI] = useState<any[]>([]);
  const [alunosLoading, setAlunosLoading] = useState(false);
  const [discDispTurma, setDiscDispTurma] = useState<string[]>(disciplinas);
  const [saving, setSaving] = useState(false);

  const { config: innerConfig } = useConfig();
  const { user } = useAuth();
  const isProfessorRole = user?.role === 'professor';
  const isPrivilegedRole = !!user?.role && ['ceo','pca','admin','director','chefe_secretaria','pedagogico'].includes(user.role);

  const [reaberturaModal, setReaberturaModal] = useState<{ campo: string; label: string } | null>(null);
  const [reaberturaMotivo, setReaberturaMotivo] = useState('');
  const [isSubmittingRea, setIsSubmittingRea] = useState(false);
  const [pedidosAbertura, setPedidosAbertura] = useState<any[]>([]);
  const [solicitarAberturaModal, setSolicitarAberturaModal] = useState<{ avaliacao: string; label: string } | null>(null);
  const [solicitarMotivo, setSolicitarMotivo] = useState('');
  const [isSubmittingAbertura, setIsSubmittingAbertura] = useState(false);

  // ─── Draft auto-save ────────────────────────────────────────────────────────
  const [draftBanner, setDraftBanner] = useState<{ savedAt: number; key: string } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getDraftKey(pid: string, tid: string, trim: number) {
    return `nota_draft_${pid}_${tid}_${trim}`;
  }
  function clearDraft(key?: string) {
    const k = key ?? (professorId && selectedTurmaId ? getDraftKey(professorId, selectedTurmaId, trimestre) : null);
    if (!k) return;
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(k); } catch {}
    setDraftBanner(null);
  }
  function saveDraftNow(f: Partial<Nota>, tid: string) {
    if (!professorId || !tid) return;
    const k = getDraftKey(professorId, tid, trimestre);
    try { if (typeof window !== 'undefined') window.localStorage.setItem(k, JSON.stringify({ form: f, savedAt: Date.now() })); } catch {}
  }

  const makeEmpty = (): Partial<Nota> => ({
    alunoId: '', turmaId: '', disciplina: disciplinas[0] || '', trimestre,
    aval1: 0, aval2: 0, aval3: 0, aval4: 0, aval5: 0, aval6: 0, aval7: 0, aval8: 0,
    mac1: 0, pp1: 0, ppt: 0, mt1: 0, nf: 0, mac: 0,
    anoLetivo: new Date().getFullYear().toString(),
    professorId, data: new Date().toISOString().split('T')[0],
    lancamentos: buildEmptyLanc(),
  });

  const [form, setForm] = useState<Partial<Nota>>(nota ? { ...nota, lancamentos: nota.lancamentos || buildEmptyLanc() } : makeEmpty());

  const camposAbertos: string[] = (form.camposAbertos as string[]) ?? [];
  const pedidosReabertura: PedidoReabertura[] = (form.pedidosReabertura as PedidoReabertura[]) ?? [];

  useEffect(() => {
    if (!isProfessorRole || !professorId || !visible) { setPedidosAbertura([]); return; }
    api.get<any[]>('/api/pedidos-abertura-avaliacao')
      .then((data: any[]) => { if (Array.isArray(data)) setPedidosAbertura(data); else setPedidosAbertura([]); })
      .catch(() => setPedidosAbertura([]));
  }, [isProfessorRole, professorId, visible]);

  function getAberturaStatus(avaliacao: string): 'approved' | 'pending' | 'rejected' | 'none' {
    if (!isProfessorRole || isPrivilegedRole) return 'approved';
    const ped = pedidosAbertura.filter(p =>
      p.professorId === professorId && p.disciplina === form.disciplina &&
      Number(p.trimestre) === Number(trimestre) && p.avaliacao === avaliacao &&
      (!selectedTurmaId || p.turmaId === selectedTurmaId || !p.turmaId)
    ).sort((a: any, b: any) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    const last = ped[0];
    if (!last) return 'none';
    if (last.status === 'aprovada') return 'approved';
    if (last.status === 'pendente') return 'pending';
    return 'rejected';
  }

  async function reloadPedidosAbertura() {
    if (!isProfessorRole || !professorId) return;
    try { const data = await api.get<any[]>('/api/pedidos-abertura-avaliacao'); if (Array.isArray(data)) setPedidosAbertura(data); } catch {}
  }

  async function submitSolicitarAbertura() {
    if (!solicitarMotivo.trim()) { webAlert('Motivo necessário', 'Indique o motivo pelo qual precisa lançar esta avaliação.'); return; }
    setIsSubmittingAbertura(true);
    try {
      const turmaObj = turmas.find((t: any) => t.id === selectedTurmaId);
      await api.post('/api/pedidos-abertura-avaliacao', {
        professorId, turmaId: selectedTurmaId || null, turmaNome: turmaObj?.nome || null,
        disciplina: form.disciplina, trimestre, avaliacao: solicitarAberturaModal!.avaliacao, motivo: solicitarMotivo.trim(),
      });
      alertSucesso('Pedido enviado', 'O pedido foi enviado à direcção para análise.');
      setSolicitarAberturaModal(null); setSolicitarMotivo('');
      await reloadPedidosAbertura();
    } catch (e: any) {
      webAlert('Erro', e?.message?.includes('pendente') ? 'Já existe um pedido pendente.' : 'Não foi possível enviar o pedido.');
    } finally { setIsSubmittingAbertura(false); }
  }

  function hasPendingRequest(campo: string) { return pedidosReabertura.some(p => p.campo === campo && p.status === 'pendente'); }

  async function openLockedField(campo: string, label: string) {
    if (hasPendingRequest(campo)) { webAlert('Pedido em Análise', 'Já existe um pedido de reabertura pendente. Aguarde a resposta.'); return; }
    setReaberturaMotivo(''); setReaberturaModal({ campo, label });
  }

  async function submitReabertura() {
    if (!reaberturaMotivo.trim()) { webAlert('Motivo necessário', 'Indique o motivo da correcção.'); return; }
    const notaId = effectiveNota?.id ?? (form as any).id;
    if (!notaId) { webAlert('Erro', 'Guarde a nota antes de solicitar a reabertura.'); return; }
    setIsSubmittingRea(true);
    try {
      const updated = await api.post<Nota>(`/api/notas/${notaId}/solicitar-reabertura`, { campo: reaberturaModal!.campo, motivo: reaberturaMotivo.trim(), professorId });
      setForm(f => ({ ...f, pedidosReabertura: updated.pedidosReabertura }));
      setReaberturaModal(null); setReaberturaMotivo('');
      alertSucesso('Pedido enviado', 'O pedido de reabertura foi enviado à direcção.');
    } catch (e: any) {
      webAlert('Erro', e?.message?.includes('pendente') ? 'Já existe um pedido pendente.' : 'Não foi possível enviar o pedido.');
    } finally { setIsSubmittingRea(false); }
  }

  const set = (k: keyof Nota, v: any) => setForm(f => {
    const next = { ...f, [k]: v };
    if (LANC_KEYS.includes(k as keyof NotaLancamentos)) {
      next.lancamentos = { ...(f.lancamentos || buildEmptyLanc()), [k]: true } as NotaLancamentos;
    }
    const lanc = next.lancamentos || buildEmptyLanc();
    const regAvals = activeAvalKeys.map(key => ({ key, val: (next[key as keyof Nota] as number) || 0, reg: !!(lanc[key as keyof NotaLancamentos]) })).filter(a => a.reg).map(a => a.val);
    const allAvalVals = activeAvalKeys.map(key => (next[key as keyof Nota] as number) || 0);
    const mac1 = regAvals.length === numAvaliacoes ? calcMac(allAvalVals, numAvaliacoes) : regAvals.length > 0 ? calcMac(regAvals, regAvals.length) : 0;
    const pp1 = next.pp1 || 0; const ppt = next.ppt || 0;
    const pMac = innerConfig.percMac ?? 30;
    const pPp  = innerConfig.percPp  ?? 70;
    const pNt  = innerConfig.percNt  ?? 60;
    const pPt  = innerConfig.percPt  ?? 40;
    const mt1 = mac1 > 0 ? calcMt1(mac1, pp1, pp1Habilitado, pMac, pPp) : 0;
    const nf  = mt1 > 0  ? calcNfMiniPauta(mt1, ppt, pptHabilitado, pNt, pPt) : 0;
    return { ...next, mac1, mt1, nf, mac: mac1 };
  });

  React.useEffect(() => {
    autoKeyRef.current = ''; setAutoNota(null); setAlunoSearch(''); setAlunosDaAPI([]);
    setDraftBanner(null);
    if (nota) {
      setSelectedTurmaId(nota.turmaId || turmas[0]?.id || '');
      setForm({ ...nota, lancamentos: nota.lancamentos || buildEmptyLanc() });
    } else {
      const d = turmas[0]?.id || '';
      setSelectedTurmaId(d);
      setForm({ ...makeEmpty(), trimestre, alunoId: '' });
      // Tenta restaurar rascunho guardado
      if (visible && professorId && d) {
        try {
          if (typeof window !== 'undefined') {
            const k = getDraftKey(professorId, d, trimestre);
            const raw = window.localStorage.getItem(k);
            if (raw) {
              const { form: saved, savedAt } = JSON.parse(raw);
              const ageMs = Date.now() - (savedAt || 0);
              const hasData = saved?.lancamentos && Object.values(saved.lancamentos as Record<string, unknown>).some(Boolean);
              if (ageMs < 86400000 && hasData) {
                setForm(saved);
                if (saved.turmaId) setSelectedTurmaId(saved.turmaId);
                setDraftBanner({ savedAt, key: k });
              } else {
                window.localStorage.removeItem(k);
              }
            }
          }
        } catch {}
      }
    }
  }, [nota, visible, trimestre]);

  // Auto-save form para localStorage enquanto o professor digita
  useEffect(() => {
    if (!visible || !!nota) return; // não gravar rascunho ao editar nota existente passada
    const currentLanc = form.lancamentos || buildEmptyLanc();
    const hasData = Object.values(currentLanc).some(Boolean);
    if (!hasData) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraftNow(form, selectedTurmaId), 700);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [form, visible, nota, selectedTurmaId]);

  useEffect(() => {
    if (!selectedTurmaId) { setAlunosDaAPI([]); return; }
    setAlunosLoading(true);
    fetch(`/api/turmas/${selectedTurmaId}/alunos`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const lista = Array.isArray(data) ? data : [];
        const resultado = lista.length > 0 ? lista : alunos.filter((a: any) => a.ativo && !a.bloqueado && !a.falecido);
        setAlunosDaAPI(resultado);
        if (resultado.length > 0 && !resultado.find((a: any) => a.id === form.alunoId)) { autoKeyRef.current = ''; set('alunoId', resultado[0].id); }
      })
      .catch(() => {
        const fb = alunos.filter((a: any) => a.ativo && !a.bloqueado && !a.falecido);
        setAlunosDaAPI(fb);
        if (fb.length > 0) { autoKeyRef.current = ''; set('alunoId', fb[0].id); }
      })
      .finally(() => setAlunosLoading(false));
  }, [selectedTurmaId]);

  useEffect(() => {
    if (!selectedTurmaId) { setDiscDispTurma(disciplinas); return; }
    fetch(`/api/turmas/${selectedTurmaId}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        let names = list && list.length > 0 ? list.map(d => d.nome) : disciplinas;
        if (isProfessorRole && disciplinas.length > 0) {
          const filtered = names.filter(n => disciplinas.includes(n));
          names = filtered.length > 0 ? filtered : disciplinas;
        }
        setDiscDispTurma(names);
        if (!names.includes(form.disciplina || '')) set('disciplina', names[0] || '');
      })
      .catch(() => setDiscDispTurma(disciplinas));
  }, [selectedTurmaId, disciplinas.join('|')]);

  useEffect(() => {
    if (nota) return;
    const key = `${form.alunoId}|${form.disciplina}|${trimestre}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    if (!form.alunoId || !form.disciplina) { setAutoNota(null); return; }
    const found = allNotas.find(n => n.alunoId === form.alunoId && n.disciplina === form.disciplina && n.trimestre === trimestre) ?? null;
    setAutoNota(found);
    if (found) setForm({ ...found, lancamentos: found.lancamentos || buildEmptyLanc() });
  }, [form.alunoId, form.disciplina, trimestre, nota, allNotas]);

  const alunosComNota = useMemo(() => {
    const m = new Map<string, number>();
    allNotas.forEach(n => {
      if (n.disciplina === form.disciplina && n.trimestre === trimestre) {
        const lanc = n.lancamentos || buildEmptyLanc();
        const done = activeAvalKeys.filter(k => !!(lanc[k as keyof NotaLancamentos])).length;
        m.set(n.alunoId, Math.round((done / numAvaliacoes) * 100));
      }
    });
    return m;
  }, [allNotas, form.disciplina, trimestre, numAvaliacoes]);

  const alunosDaTurma = alunosDaAPI.length > 0
    ? alunosDaAPI
    : alunos.filter((a: any) => (!selectedTurmaId || a.turmaId === selectedTurmaId) && !a.bloqueado && !a.falecido);

  const alunosDaTurmaFiltered = alunoSearch.trim()
    ? alunosDaTurma.filter((a: any) => `${a.nome} ${a.apelido}`.toLowerCase().includes(alunoSearch.toLowerCase()) || (a.numeroMatricula || '').toLowerCase().includes(alunoSearch.toLowerCase()))
    : alunosDaTurma;

  const lanc = form.lancamentos || buildEmptyLanc();
  const mac1 = form.mac1 || 0; const mt1 = form.mt1 || 0; const nf = form.nf || 0;
  const avaisRegistadas = activeAvalKeys.filter(k => !!(lanc[k as keyof NotaLancamentos])).length;
  const avaisCompletas = avaisRegistadas === numAvaliacoes;
  const completo = avaisCompletas && (!pp1Habilitado || lanc.pp1) && (!pptHabilitado || lanc.ppt);
  const temAlgumDado = Object.values(lanc).some(Boolean);
  const selectedAluno = alunosDaTurma.find((a: any) => a.id === form.alunoId);

  // Auto-advance to next student
  function advanceToNext() {
    if (!form.alunoId) return;
    const idx = alunosDaTurma.findIndex((a: any) => a.id === form.alunoId);
    const next = alunosDaTurma[idx + 1];
    if (next) { autoKeyRef.current = ''; set('alunoId', next.id); }
  }

  async function handleSave(asFinal: boolean, andAdvance = false) {
    if (!form.alunoId || !form.disciplina) { webAlert('Campos obrigatórios', 'Seleccione aluno e disciplina.'); return; }
    const avalVals = activeAvalKeys.map(k => (form[k as keyof Nota] as number) || 0);
    if (avalVals.some(v => v > 5)) { webAlert('Nota inválida', 'As avaliações contínuas (AVAL) têm escala de 1–5.'); return; }
    if ([form.pp1 || 0, form.ppt || 0].some(v => v > 20)) { webAlert('Nota inválida', 'PP / PT têm escala de 0–20.'); return; }
    if (!Object.values(lanc).some(Boolean) && asFinal) { webAlert('Sem dados', 'Introduza pelo menos uma avaliação antes de guardar.'); return; }
    const parcial = !completo;
    setSaving(true);
    try {
      await new Promise<void>((resolve) => {
        onSave({ ...form, turmaId: alunosDaTurma.find((a: any) => a.id === form.alunoId)?.turmaId || selectedTurmaId || '', trimestre }, parcial && !asFinal ? true : parcial);
        resolve();
      });
      clearDraft(); // apaga rascunho após gravação bem-sucedida
      if (andAdvance) advanceToNext();
    } finally {
      setSaving(false);
    }
  }

  // ─── Progress bar ────────────────────────────────────────────────────────
  const totalAlunos = alunosDaTurma.length;
  const alunosComNotaCount = alunosDaTurma.filter((a: any) => alunosComNota.has(a.id)).length;
  const globalPct = totalAlunos > 0 ? Math.round((alunosComNotaCount / totalAlunos) * 100) : 0;

  // ─── Render ──────────────────────────────────────────────────────────────
  const gradePanel = (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: isWeb ? 24 : 16, paddingBottom: 32 }}>

      {/* Selected student header */}
      {selectedAluno && (
        <View style={gp.studentHeader}>
          <View style={[gp.studentAvatar, { backgroundColor: Colors.gold + '25' }]}>
            <Text style={gp.studentAvatarTxt}>{((selectedAluno.nome || '').charAt(0) + (selectedAluno.apelido || '').charAt(0)).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={gp.studentName}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
            <Text style={gp.studentMeta}>{form.disciplina} · {trimestre}º Trimestre{selectedAluno.numeroMatricula ? ` · Nº ${selectedAluno.numeroMatricula}` : ''}</Text>
          </View>
          {completo && <View style={gp.completeBadge}><Ionicons name="checkmark-circle" size={13} color={Colors.success} /><Text style={gp.completeBadgeTxt}>Completo</Text></View>}
          {isEditingExisting && !completo && <View style={gp.progressBadge}><Ionicons name="time-outline" size={12} color={Colors.warning} /><Text style={gp.progressBadgeTxt}>Em curso</Text></View>}
        </View>
      )}
      {!selectedAluno && (
        <View style={gp.emptyStudent}>
          <Ionicons name="person-add-outline" size={28} color={Colors.textMuted} />
          <Text style={gp.emptyStudentTxt}>Seleccione um aluno na lista</Text>
        </View>
      )}

      {/* Banners */}
      {autoNota && !nota && (
        <View style={[gp.banner, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '35' }]}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.info} />
          <Text style={[gp.bannerTxt, { color: Colors.info }]}>Nota existente carregada automaticamente.</Text>
        </View>
      )}
      {isEditingExisting && Object.values(lanc).some(Boolean) && (
        <View style={[gp.banner, { backgroundColor: Colors.warning + '12', borderColor: Colors.warning + '30' }]}>
          <Ionicons name="lock-closed-outline" size={13} color={Colors.warning} />
          <Text style={[gp.bannerTxt, { color: Colors.warning }]}>Campos lançados estão bloqueados. Toque para solicitar edição.</Text>
        </View>
      )}

      {/* Rascunho restaurado */}
      {draftBanner && (
        <View style={[gp.banner, { backgroundColor: Colors.info + '14', borderColor: Colors.info + '35', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="document-text-outline" size={14} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={[gp.bannerTxt, { color: Colors.info, fontFamily: 'Inter_700Bold' }]}>Rascunho restaurado</Text>
            <Text style={[gp.bannerTxt, { color: Colors.info, fontSize: 10, opacity: 0.8 }]}>
              Dados não gravados de {new Date(draftBanner.savedAt).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })} foram recuperados automaticamente.
            </Text>
          </View>
          <TouchableOpacity onPress={() => { clearDraft(draftBanner.key); setForm(makeEmpty()); }}
            style={{ padding: 4 }}>
            <Ionicons name="close-circle-outline" size={16} color={Colors.info} />
          </TouchableOpacity>
        </View>
      )}

      {/* Progress strip */}
      <View style={gp.progressStrip}>
        <View style={{ flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${avaisCompletas ? 100 : Math.round((avaisRegistadas / numAvaliacoes) * 100)}%` as any, height: '100%', backgroundColor: avaisCompletas ? Colors.success : Colors.gold, borderRadius: 3 }} />
        </View>
        <Text style={gp.progressTxt}>{avaisRegistadas}/{numAvaliacoes} AVAL{pp1Habilitado ? (lanc.pp1 ? ' · PP✓' : ' · PP—') : ''}{pptHabilitado ? (lanc.ppt ? ' · PT✓' : ' · PT—') : ''}</Text>
      </View>

      {/* ── AVAL block ── */}
      <View style={gp.section}>
        <View style={gp.sectionHeader}>
          <View style={[gp.sectionDot, { backgroundColor: Colors.gold }]} />
          <Text style={gp.sectionTitle}>Avaliações Contínuas</Text>
          <View style={gp.scalePill}><Text style={gp.scalePillTxt}>Escala 1 – 5</Text></View>
          <Text style={gp.sectionCount}>{avaisRegistadas}/{numAvaliacoes}</Text>
        </View>

        {isProfessorRole && !isPrivilegedRole && form.disciplina && (
          <View style={[gp.banner, { backgroundColor: Colors.info + '10', borderColor: Colors.info + '25', marginBottom: 10 }]}>
            <Ionicons name="lock-closed-outline" size={12} color={Colors.info} />
            <Text style={[gp.bannerTxt, { color: Colors.info }]}>Avaliações requerem autorização. Toque no cadeado para solicitar.</Text>
          </View>
        )}

        <View style={{ gap: 6 }}>
          {activeAvalKeys.map((key, i) => {
            const wasLanc = !!(lanc[key as keyof NotaLancamentos]);
            const prevLanc = i === 0 ? true : !!(lanc[activeAvalKeys[i - 1] as keyof NotaLancamentos]);
            const isLancLocked = isEditingExisting && wasLanc && !camposAbertos.includes(key);
            const isSequentialLocked = !wasLanc && !prevLanc;
            const isPendingReab = isEditingExisting && wasLanc && isLancLocked && hasPendingRequest(key);
            const aberturaStatus = getAberturaStatus(key);
            const isAberturaLocked = isProfessorRole && !isPrivilegedRole && !wasLanc && aberturaStatus !== 'approved';
            const isEffectiveLocked = isLancLocked || (isAberturaLocked && !isSequentialLocked);
            const handlePressLocked = isLancLocked
              ? () => openLockedField(key, `AVAL ${i + 1}`)
              : (isAberturaLocked && !isSequentialLocked)
                ? () => {
                    if (aberturaStatus === 'pending') webAlert('Pedido em Análise', 'Já existe um pedido pendente. Aguarde.');
                    else { if (!form.disciplina) { webAlert('Atenção', 'Seleccione a disciplina primeiro.'); return; } setSolicitarMotivo(''); setSolicitarAberturaModal({ avaliacao: key, label: `AVAL ${i + 1}` }); }
                  }
                : undefined;
            return (
              <AvalPills
                key={key}
                label={`A${i + 1}`}
                idx={i}
                value={(form[key as keyof Nota] as number) || 0}
                onChange={(!isEffectiveLocked && !isSequentialLocked) ? v => set(key as keyof Nota, v) : undefined}
                registered={wasLanc}
                locked={isEffectiveLocked}
                onPressLocked={handlePressLocked}
                pending={isPendingReab || aberturaStatus === 'pending'}
                disabled={isSequentialLocked && !isEffectiveLocked}
              />
            );
          })}
        </View>

        {/* MAC */}
        <View style={[gp.macBar, avaisCompletas && { borderColor: Colors.gold + '60', backgroundColor: Colors.gold + '0C' }]}>
          <View>
            <Text style={gp.macLabel}>MAC</Text>
            <Text style={gp.macDesc}>{avaisCompletas ? `Média de ${numAvaliacoes} avaliações` : avaisRegistadas > 0 ? `Parcial (${avaisRegistadas} AVAL)` : 'Aguarda avaliações'}</Text>
          </View>
          <Text style={[gp.macVal, { color: mac1 > 0 ? gradeColor(mac1) : Colors.textMuted }]}>{mac1 > 0 ? mac1.toFixed(2) : '—'}</Text>
        </View>
      </View>

      {/* ── Provas block ── */}
      {(pp1Habilitado || pptHabilitado) && (
        <View style={[gp.section, !avaisCompletas && { opacity: 0.5 }]}>
          <View style={gp.sectionHeader}>
            <View style={[gp.sectionDot, { backgroundColor: Colors.info }]} />
            <Text style={gp.sectionTitle}>Provas do Trimestre</Text>
            {!avaisCompletas && <View style={[gp.scalePill, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '40' }]}><Ionicons name="lock-closed-outline" size={9} color={Colors.warning} /><Text style={[gp.scalePillTxt, { color: Colors.warning }]}>Aguarda AVALs</Text></View>}
            <Text style={gp.sectionCount}>Escala 0–20</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {pp1Habilitado && (() => {
              const wasLanc = lanc.pp1;
              const isLancLocked = isEditingExisting && wasLanc && !camposAbertos.includes('pp1');
              const isDisabled = !avaisCompletas && !wasLanc;
              const isPendingReab = isEditingExisting && wasLanc && isLancLocked && hasPendingRequest('pp1');
              const aberturaStatusPp = getAberturaStatus('pp1');
              const isAberturaLockedPp = isProfessorRole && !isPrivilegedRole && !wasLanc && aberturaStatusPp !== 'approved';
              const isEffectiveLockedPp = isLancLocked || (isAberturaLockedPp && !isDisabled);
              const handlePressLockedPp = isLancLocked
                ? () => openLockedField('pp1', 'PP (Prova do Professor)')
                : (isAberturaLockedPp && !isDisabled)
                  ? () => {
                      if (aberturaStatusPp === 'pending') webAlert('Pedido em Análise', 'Já existe um pedido pendente. Aguarde.');
                      else { if (!form.disciplina) { webAlert('Atenção', 'Seleccione a disciplina primeiro.'); return; } setSolicitarMotivo(''); setSolicitarAberturaModal({ avaliacao: 'pp1', label: 'PP (Prova do Professor)' }); }
                    }
                  : undefined;
              return (
                <View style={{ flex: 1 }}>
                  <GradeInput label="PP — Prova do Prof." value={form.pp1 || 0}
                    onChange={(isEffectiveLockedPp || isDisabled) ? undefined : v => set('pp1', v)}
                    registered={wasLanc} readonly={!isEffectiveLockedPp && isDisabled}
                    locked={isEffectiveLockedPp} onPressLocked={handlePressLockedPp}
                    pending={isPendingReab || aberturaStatusPp === 'pending'}
                  />
                </View>
              );
            })()}
            {pptHabilitado && (() => {
              const wasLanc = lanc.ppt;
              const isLancLocked = isEditingExisting && wasLanc && !camposAbertos.includes('ppt');
              const isDisabled = !avaisCompletas && !wasLanc;
              const isPendingReab = isEditingExisting && wasLanc && isLancLocked && hasPendingRequest('ppt');
              const aberturaStatusPt = getAberturaStatus('ppt');
              const isAberturaLockedPt = isProfessorRole && !isPrivilegedRole && !wasLanc && aberturaStatusPt !== 'approved';
              const isEffectiveLockedPt = isLancLocked || (isAberturaLockedPt && !isDisabled);
              const handlePressLockedPt = isLancLocked
                ? () => openLockedField('ppt', 'PT (Prova de Trimestre)')
                : (isAberturaLockedPt && !isDisabled)
                  ? () => {
                      if (aberturaStatusPt === 'pending') webAlert('Pedido em Análise', 'Já existe um pedido pendente. Aguarde.');
                      else { if (!form.disciplina) { webAlert('Atenção', 'Seleccione a disciplina primeiro.'); return; } setSolicitarMotivo(''); setSolicitarAberturaModal({ avaliacao: 'ppt', label: 'PT (Prova de Trimestre)' }); }
                    }
                  : undefined;
              return (
                <View style={{ flex: 1 }}>
                  <GradeInput label="PT — Prova de Trimestre" value={form.ppt || 0}
                    onChange={(isEffectiveLockedPt || isDisabled) ? undefined : v => set('ppt', v)}
                    registered={wasLanc} readonly={!isEffectiveLockedPt && isDisabled}
                    locked={isEffectiveLockedPt} onPressLocked={handlePressLockedPt}
                    pending={isPendingReab || aberturaStatusPt === 'pending'}
                  />
                </View>
              );
            })()}
          </View>
        </View>
      )}

      {/* ── Live NF result ── */}
      <NfResultBanner mac={mac1} mt1={mt1} nf={nf} pp1On={pp1Habilitado} pptOn={pptHabilitado} avaisCompletas={avaisCompletas} />

      {/* ── Action buttons ── */}
      <View style={gp.btnRow}>
        {!completo && temAlgumDado && (
          <TouchableOpacity style={gp.btnSecondary} onPress={() => handleSave(false)} disabled={saving}>
            <Ionicons name="save-outline" size={16} color={Colors.gold} />
            <Text style={gp.btnSecondaryTxt}>Guardar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[gp.btnPrimary, { flex: completo || !temAlgumDado ? 1 : 0.65 }, saving && { opacity: 0.7 }]}
          onPress={() => handleSave(true)}
          disabled={saving}
        >
          {saving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text style={gp.btnPrimaryTxt}>{effectiveNota ? 'Actualizar' : (completo ? 'Lançar Nota' : 'Guardar')}</Text>
        </TouchableOpacity>
        {/* Auto-advance button */}
        {temAlgumDado && (
          <TouchableOpacity
            style={gp.btnAdvance}
            onPress={() => handleSave(true, true)}
            disabled={saving}
          >
            <Ionicons name="arrow-forward-circle" size={22} color={Colors.info} />
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );

  const ContextSelectors = ({ compact = false }: { compact?: boolean }) => (
    <View style={[sp.context, compact && { paddingVertical: 8 }]}>
      {/* Turma — select no web, chips no mobile */}
      {turmas.length > 0 && (
        <View style={sp.selectRow}>
          <Ionicons name="school-outline" size={13} color={Colors.textMuted} style={{ flexShrink: 0 }} />
          {isWeb ? (
            <View style={sp.selectWrap}>
              {/* @ts-ignore */}
              <select
                value={selectedTurmaId}
                onChange={(e: any) => { setAlunosDaAPI([]); setAlunoSearch(''); set('alunoId', ''); setSelectedTurmaId(e.target.value); }}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: selectedTurmaId ? '#E8C060' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_600SemiBold', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
              >
                {turmas.map((t: any) => (
                  <option key={t.id} value={t.id} style={{ background: '#0D1F35', color: '#E8EEF6' }}>{t.nome}</option>
                ))}
              </select>
              <Ionicons name="chevron-down" size={12} color={Colors.textMuted} style={{ flexShrink: 0 }} />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {turmas.map((t: any) => (
                  <TouchableOpacity key={t.id} style={[sp.chip, selectedTurmaId === t.id && sp.chipActive]}
                    onPress={() => { setAlunosDaAPI([]); setAlunoSearch(''); set('alunoId', ''); setSelectedTurmaId(t.id); }}>
                    <Text style={[sp.chipTxt, selectedTurmaId === t.id && sp.chipTxtActive]}>{t.nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}
      {/* Disciplina — select no web, chips no mobile */}
      <View style={[sp.selectRow, { marginTop: 6 }]}>
        <Ionicons name="book-outline" size={13} color={Colors.textMuted} style={{ flexShrink: 0 }} />
        {isWeb ? (
          <View style={sp.selectWrap}>
            {/* @ts-ignore */}
            <select
              value={form.disciplina || ''}
              onChange={(e: any) => set('disciplina', e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: form.disciplina ? '#E8EEF6' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
            >
              {discDispTurma.map(d => (
                <option key={d} value={d} style={{ background: '#0D1F35', color: '#E8EEF6' }}>{d}</option>
              ))}
            </select>
            <Ionicons name="chevron-down" size={12} color={Colors.textMuted} style={{ flexShrink: 0 }} />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {discDispTurma.map(d => (
                <TouchableOpacity key={d} style={[sp.discChip, form.disciplina === d && sp.discChipActive]}
                  onPress={() => set('disciplina', d)}>
                  <Text style={[sp.discChipTxt, form.disciplina === d && sp.discChipTxtActive]} numberOfLines={1}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );

  const studentPanel = (
    <View style={sp.panel}>
      <ContextSelectors />

      {/* Progress bar for class */}
      {totalAlunos > 0 && (
        <View style={sp.classProgress}>
          <View style={{ flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${globalPct}%` as any, height: '100%', backgroundColor: globalPct === 100 ? Colors.success : Colors.gold, borderRadius: 2 }} />
          </View>
          <Text style={sp.classProgressTxt}>{alunosComNotaCount}/{totalAlunos}</Text>
        </View>
      )}

      {/* Search */}
      <View style={sp.searchWrap}>
        <Ionicons name="search-outline" size={14} color={Colors.textMuted} />
        <StableSearchInput
          value={alunoSearch}
          onChangeText={setAlunoSearch}
          inputStyle={sp.searchInput}
          placeholder="Pesquisar aluno..."
          iconColor={Colors.textMuted}
        />
      </View>

      {/* Student list */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {alunosLoading && (
          <View style={{ alignItems: 'center', paddingTop: 32 }}>
            <AppLoader size="small" color={Colors.gold} />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 10 }}>A carregar...</Text>
          </View>
        )}
        {!alunosLoading && alunosDaTurmaFiltered.slice(0, 60).map((a: any) => {
          const pct = alunosComNota.get(a.id) ?? -1;
          return (
            <StudentRow
              key={a.id}
              aluno={a}
              isSel={form.alunoId === a.id}
              jaLancado={pct >= 0}
              pct={pct}
              onPress={() => { autoKeyRef.current = ''; set('alunoId', a.id); }}
            />
          );
        })}
        {!alunosLoading && alunosDaTurmaFiltered.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="person-outline" size={24} color={Colors.textMuted} />
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8 }}>
              {alunoSearch ? 'Nenhum aluno encontrado' : 'Nenhum aluno nesta turma'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} animationType={isWeb ? 'fade' : 'slide'} transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[mo.overlay, isWeb && mo.overlayWeb]}>
          <View style={[mo.sheet, isWeb && mo.sheetWeb]}>

            {/* ── Header ── */}
            <View style={mo.header}>
              <View style={mo.headerLeft}>
                <View style={mo.headerIcon}>
                  <Ionicons name={effectiveNota ? 'create' : 'add-circle'} size={18} color={Colors.gold} />
                </View>
                <View>
                  <Text style={mo.headerTitle}>{effectiveNota ? 'Editar Nota' : 'Lançar Nota'}</Text>
                  <Text style={mo.headerSub}>{trimestre}º Trimestre · {form.disciplina || '—'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={mo.closeBtn}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Body ── */}
            {isWeb ? (
              <View style={{ flex: 1, flexDirection: 'row', overflow: 'hidden' }}>
                {studentPanel}
                <View style={{ width: 1, backgroundColor: Colors.border }} />
                {gradePanel}
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {/* Mobile: context strip at top, student picker collapsible, grades below */}
                <ContextSelectors compact />
                {/* Aluno picker (collapsible on mobile) */}
                <View style={{ maxHeight: 160, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={sp.searchWrap}>
                    <Ionicons name="search-outline" size={13} color={Colors.textMuted} />
                    <StableSearchInput value={alunoSearch} onChangeText={setAlunoSearch} inputStyle={sp.searchInput} placeholder="Pesquisar aluno..." iconColor={Colors.textMuted} />
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {alunosDaTurmaFiltered.slice(0, 40).map((a: any) => {
                      const pct = alunosComNota.get(a.id) ?? -1;
                      return <StudentRow key={a.id} aluno={a} isSel={form.alunoId === a.id} jaLancado={pct >= 0} pct={pct} onPress={() => { autoKeyRef.current = ''; set('alunoId', a.id); }} />;
                    })}
                  </ScrollView>
                </View>
                {gradePanel}
              </View>
            )}
          </View>
        </View>

        {/* Sub-modal Reabertura */}
        <Modal visible={!!reaberturaModal} transparent animationType="fade" onRequestClose={() => setReaberturaModal(null)}>
          <View style={sm.overlay}>
            <View style={sm.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={sm.iconBox}><Ionicons name="lock-closed" size={18} color={Colors.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={sm.title}>Solicitar Reabertura</Text>
                  <Text style={sm.sub}>Campo: {reaberturaModal?.label}</Text>
                </View>
                <TouchableOpacity onPress={() => setReaberturaModal(null)} style={mo.closeBtn}><Ionicons name="close" size={16} color={Colors.textSecondary} /></TouchableOpacity>
              </View>
              <Text style={sm.desc}>Este campo está bloqueado. Indique o motivo da correcção — o pedido será enviado à direcção.</Text>
              <TextInput style={sm.input} placeholder="Motivo da reabertura..." placeholderTextColor={Colors.textMuted} value={reaberturaMotivo} onChangeText={setReaberturaMotivo} multiline numberOfLines={3} maxLength={300} />
              <Text style={sm.count}>{reaberturaMotivo.length}/300</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={sm.cancelBtn} onPress={() => setReaberturaModal(null)}><Text style={sm.cancelTxt}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[sm.submitBtn, isSubmittingRea && { opacity: 0.6 }]} onPress={submitReabertura} disabled={isSubmittingRea}>
                  <Ionicons name="send" size={14} color="#fff" />
                  <Text style={sm.submitTxt}>{isSubmittingRea ? 'A enviar...' : 'Enviar Pedido'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Sub-modal Abertura */}
        <Modal visible={!!solicitarAberturaModal} transparent animationType="fade" onRequestClose={() => setSolicitarAberturaModal(null)}>
          <View style={sm.overlay}>
            <View style={sm.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={[sm.iconBox, { backgroundColor: Colors.accent + '20' }]}><Ionicons name="key-outline" size={18} color={Colors.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[sm.title, { color: Colors.accent }]}>Solicitar Lançamento</Text>
                  <Text style={sm.sub}>{solicitarAberturaModal?.label} · {form.disciplina} · {trimestre}º Trim.</Text>
                </View>
                <TouchableOpacity onPress={() => setSolicitarAberturaModal(null)} style={mo.closeBtn}><Ionicons name="close" size={16} color={Colors.textSecondary} /></TouchableOpacity>
              </View>
              <Text style={sm.desc}>Para lançar esta avaliação é necessária autorização. Indique o motivo abaixo.</Text>
              <TextInput style={sm.input} placeholder="Ex: Início do 1º período de avaliações..." placeholderTextColor={Colors.textMuted} value={solicitarMotivo} onChangeText={setSolicitarMotivo} multiline numberOfLines={3} maxLength={300} />
              <Text style={sm.count}>{solicitarMotivo.length}/300</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={sm.cancelBtn} onPress={() => setSolicitarAberturaModal(null)}><Text style={sm.cancelTxt}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[sm.submitBtn, { backgroundColor: Colors.accent }, isSubmittingAbertura && { opacity: 0.6 }]} onPress={submitSolicitarAbertura} disabled={isSubmittingAbertura}>
                  <Ionicons name="send" size={14} color="#fff" />
                  <Text style={sm.submitTxt}>{isSubmittingAbertura ? 'A enviar...' : 'Solicitar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function NotasScreen() {
  const { notas, alunos, turmas, professores, addNota, updateNota, isLoading: dataLoading } = useData();
  const { user } = useAuth();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const [trimestreActivo, setTrimestreActivo] = useState<1 | 2 | 3>(1);
  const [filterTurma, setFilterTurma] = useState('');
  const [turmaModalOpen, setTurmaModalOpen] = useState(false);
  const [turmaSearch, setTurmaSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editNota, setEditNota] = useState<Nota | null>(null);
  const [continuidade, setContinuidade] = useState<{ alunoId: string; alunoNome: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const router = useRouter();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isProfessor = user?.role === 'professor';
  const isPrivilegedRole = !!user?.role && ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria'].includes(user.role);
  const canAccessFutureTrimesters = !!user?.role && ['ceo', 'pca', 'admin', 'director'].includes(user.role);

  const prazoKey = `t${trimestreActivo}` as 't1' | 't2' | 't3';
  const prazoData: string | undefined = (config.prazosLancamento as any)?.[prazoKey];
  const prazoEncerrado = prazoData ? new Date() > new Date(prazoData + 'T23:59:59') : false;
  const podeEditar = isPrivilegedRole || !prazoEncerrado;

  const prazos = (config.prazosLancamento as any) || {};
  const agora = new Date();
  const t1Passou = prazos.t1 ? agora > new Date(prazos.t1 + 'T23:59:59') : false;
  const t2Passou = prazos.t2 ? agora > new Date(prazos.t2 + 'T23:59:59') : false;
  const trimestreMaxNormal: 1 | 2 | 3 = t2Passou ? 3 : t1Passou ? 2 : 1;

  const professorActual = useMemo(() => {
    if (!isProfessor || !user) return null;
    return (professores ?? []).find(p => p.utilizadorId === user.id || p.id === user.id || p.email === user.email) || null;
  }, [isProfessor, user, professores]);

  const turmasDoProf = useMemo(() => {
    const ts = turmas ?? [];
    if (isPrivilegedRole) return ts.filter(t => t.ativo !== false);
    if (!isProfessor || !professorActual) return ts.filter(t => t.ativo !== false);
    return ts.filter(t => professorActual.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(professorActual.id));
  }, [isProfessor, professorActual, turmas, isPrivilegedRole]);

  const { items: disciplinasLookupItems } = useLookup('disciplinas_fallback', [
    'Matemática', 'Português', 'Física', 'Química', 'Biologia', 'História', 'Geografia', 'Inglês', 'Educação Física', 'Filosofia',
  ]);
  const disciplinasFallback = useMemo(() => (disciplinasLookupItems ?? []).map(i => i.valor), [disciplinasLookupItems]);

  const [disciplinasDisponiveis, setDisciplinasDisponiveis] = useState<string[]>(['Matemática','Português','Física','Química','Biologia','História','Geografia','Inglês','Educação Física','Filosofia']);

  useEffect(() => {
    const turmaParaFetch = filterTurma || (turmasDoProf.length === 1 ? turmasDoProf[0].id : '');
    if (!turmaParaFetch) {
      if (isProfessor && professorActual && professorActual.disciplinas.length > 0) setDisciplinasDisponiveis(professorActual.disciplinas);
      else setDisciplinasDisponiveis(disciplinasFallback);
      return;
    }
    fetch(`/api/turmas/${turmaParaFetch}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        if (list && list.length > 0) {
          let names = list.map(d => d.nome);
          if (isProfessor && professorActual && professorActual.disciplinas.length > 0) {
            const intersection = names.filter(n => professorActual.disciplinas.includes(n));
            names = intersection.length > 0 ? intersection : professorActual.disciplinas;
          }
          setDisciplinasDisponiveis(names);
        } else if (isProfessor && professorActual && professorActual.disciplinas.length > 0) {
          setDisciplinasDisponiveis(professorActual.disciplinas);
        } else { setDisciplinasDisponiveis(disciplinasFallback); }
      })
      .catch(() => {
        if (isProfessor && professorActual && professorActual.disciplinas.length > 0) setDisciplinasDisponiveis(professorActual.disciplinas);
        else setDisciplinasDisponiveis(disciplinasFallback);
      });
  }, [filterTurma, turmasDoProf, isProfessor, professorActual, disciplinasFallback]);

  const alunosDisponiveis = useMemo(() => {
    const als = alunos ?? [];
    const base = (a: any) => a.ativo && !a.bloqueado && !a.falecido;
    if (isPrivilegedRole) return als.filter(base);
    if (!isProfessor || !professorActual) return als.filter(base);
    const turmaIds = new Set(turmasDoProf.map(t => t.id));
    return als.filter(a => base(a) && turmaIds.has(a.turmaId));
  }, [isProfessor, professorActual, alunos, isPrivilegedRole, turmasDoProf]);

  const filtered = useMemo(() => {
    return (notas ?? []).filter(n => {
      const aluno = alunos.find(a => a.id === n.alunoId);
      const turmaMatch = !filterTurma || aluno?.turmaId === filterTurma || n.turmaId === filterTurma;
      const trimestreMatch = n.trimestre === trimestreActivo;
      if (isProfessor && professorActual) {
        const profTurmaIds = new Set(turmasDoProf.map(t => t.id));
        const profTurmaMatch = aluno ? profTurmaIds.has(aluno.turmaId) || profTurmaIds.has(n.turmaId) : profTurmaIds.has(n.turmaId);
        const discMatch = professorActual.disciplinas.length === 0 || professorActual.disciplinas.includes(n.disciplina);
        return trimestreMatch && turmaMatch && profTurmaMatch && discMatch;
      }
      return trimestreMatch && turmaMatch;
    });
  }, [notas, trimestreActivo, filterTurma, alunos, isProfessor, professorActual, turmasDoProf]);

  async function handleSave(form: Partial<Nota>, parcial: boolean) {
    const notaId = editNota?.id ?? form.id;
    if (notaId) await updateNota(notaId, form);
    else await addNota(form as any);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (parcial) alertSucesso('Progresso guardado', 'Continue as restantes avaliações mais tarde.');
    else alertSucesso(editNota ? 'Nota actualizada' : 'Nota lançada', 'Avaliações guardadas com sucesso.');
    setShowForm(false); setEditNota(null);
  }

  const notaCountPerTrim = useCallback((t: 1 | 2 | 3) => {
    return notas.filter(n => {
      if (n.trimestre !== t) return false;
      if (!isProfessor || !professorActual) return true;
      const aluno = alunos.find(a => a.id === n.alunoId);
      const profTurmaIds = new Set(turmasDoProf.map(tt => tt.id));
      return aluno && profTurmaIds.has(aluno.turmaId) && (professorActual.disciplinas.length === 0 || professorActual.disciplinas.includes(n.disciplina));
    }).length;
  }, [notas, isProfessor, professorActual, alunos, turmasDoProf]);

  const avgNf = filtered.length > 0 ? filtered.reduce((s, n) => s + (n.nf ?? n.mac ?? 0), 0) / filtered.length : 0;
  const aprovados = filtered.filter(n => (n.nf ?? n.mac ?? 0) >= 10).length;
  const reprovados = filtered.filter(n => (n.nf ?? n.mac ?? 0) < 10 && (n.nf ?? n.mac ?? 0) > 0).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Resetar para página 1 sempre que os filtros mudam
  React.useEffect(() => { setCurrentPage(1); }, [trimestreActivo, filterTurma]);

  const renderNota = ({ item }: { item: Nota }) => {
    const aluno = alunos.find(a => a.id === item.alunoId);
    const turma = turmas.find(t => t.id === item.turmaId);
    const nf = item.nf ?? item.mac ?? 0;
    const color = gradeColor(nf);
    const aprovado = nf >= 10;
    const lanc = item.lancamentos || buildEmptyLanc();
    const numAval = config.numAvaliacoes ?? 4;
    const activeKeys = ALL_AVAL_KEYS.slice(0, numAval);
    const avaisReg = activeKeys.filter(k => !!(lanc[k as keyof NotaLancamentos])).length;
    const isParcial = avaisReg < numAval || (!config.pp1Habilitado ? false : !lanc.pp1) || (!config.pptHabilitado ? false : !lanc.ppt);
    const pct = Math.round((avaisReg / numAval) * 100);
    const initials = ((aluno?.nome || '').charAt(0) + (aluno?.apelido || '').charAt(0)).toUpperCase();
    const statusColor = isParcial ? Colors.warning : aprovado ? Colors.success : Colors.danger;

    return (
      <TouchableOpacity
        style={[lc.card, { borderLeftColor: statusColor, borderLeftWidth: 3 }]}
        onPress={() => { if (!podeEditar) return; setEditNota(item); setShowForm(true); }}
        activeOpacity={0.75}
      >
        <View style={lc.row}>
          {/* Avatar */}
          <View style={[lc.avatar, { backgroundColor: statusColor + '20' }]}>
            <Text style={[lc.avatarTxt, { color: statusColor }]}>{initials}</Text>
          </View>

          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={lc.name} numberOfLines={1}>{aluno?.nome} {aluno?.apelido}</Text>
            <Text style={lc.meta}>{item.disciplina} · {turma?.nome || '—'}</Text>

            {/* AVAL chips */}
            <View style={lc.chips}>
              {activeKeys.map((k, i) => {
                const done = !!(lanc[k as keyof NotaLancamentos]);
                const v = done ? ((item[k as keyof Nota] as number) ?? 0) : 0;
                return (
                  <View key={k} style={[lc.chip, done && { borderColor: avalColor(v) + '60', backgroundColor: avalColor(v) + '10' }]}>
                    <Text style={lc.chipKey}>A{i + 1}</Text>
                    <Text style={[lc.chipVal, done && { color: avalColor(v) }]}>{done ? v : '—'}</Text>
                  </View>
                );
              })}
              {(item.mac1 ?? 0) > 0 && (
                <View style={[lc.chip, { borderColor: Colors.gold + '55' }]}>
                  <Text style={lc.chipKey}>MAC</Text>
                  <Text style={[lc.chipVal, { color: Colors.gold }]}>{(item.mac1 ?? 0).toFixed(2)}</Text>
                </View>
              )}
              {config.pp1Habilitado && (
                <View style={[lc.chip, lanc.pp1 && { borderColor: Colors.info + '55', backgroundColor: Colors.info + '0A' }]}>
                  <Text style={lc.chipKey}>PP</Text>
                  <Text style={[lc.chipVal, !lanc.pp1 && { color: Colors.textMuted }]}>{lanc.pp1 ? (item.pp1 ?? 0) : '—'}</Text>
                </View>
              )}
              {config.pptHabilitado && (
                <View style={[lc.chip, lanc.ppt && { borderColor: Colors.info + '55', backgroundColor: Colors.info + '0A' }]}>
                  <Text style={lc.chipKey}>PT</Text>
                  <Text style={[lc.chipVal, !lanc.ppt && { color: Colors.textMuted }]}>{lanc.ppt ? (item.ppt ?? 0) : '—'}</Text>
                </View>
              )}
            </View>

            {/* Status */}
            <View style={[lc.status, { backgroundColor: statusColor + '12', borderColor: statusColor + '35' }]}>
              <Ionicons name={isParcial ? 'time-outline' : aprovado ? 'checkmark-circle' : 'close-circle'} size={11} color={statusColor} />
              <Text style={[lc.statusTxt, { color: statusColor }]}>
                {isParcial ? `Em curso — ${avaisReg}/${numAval} AVAL` : aprovado ? `Aprovado — NF ${nf.toFixed(1)}` : `Reprovado — NF ${nf.toFixed(1)}`}
              </Text>
              {isParcial && (
                <View style={{ marginLeft: 'auto' as any, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%` as any, height: '100%', backgroundColor: Colors.warning, borderRadius: 2 }} />
                  </View>
                  <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_600SemiBold' }}>{pct}%</Text>
                </View>
              )}
            </View>
          </View>

          {/* NF score */}
          <View style={[lc.nfBox, { borderColor: statusColor + '50', backgroundColor: statusColor + '0C' }]}>
            <Text style={[lc.nfVal, { color: isParcial ? Colors.warning : color }]}>{isParcial ? `${avaisReg}/${numAval}` : nf > 0 ? nf.toFixed(1) : '—'}</Text>
            <Text style={[lc.nfKey, { color: statusColor }]}>{isParcial ? 'AVAL' : 'NF'}</Text>
          </View>
        </View>

        {!podeEditar && (
          <View style={{ position: 'absolute', top: 8, right: 8 }}>
            <Ionicons name="lock-closed" size={11} color={Colors.danger} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (dataLoading) {
    return (
      <View style={sc.screen}>
        <TopBar title="Notas" subtitle="A sincronizar dados..." />
        <ProfessorLoadingSkeleton />
      </View>
    );
  }

  return (
    <View style={sc.screen}>
      <TopBar
        title="Notas"
        subtitle="Sistema AVAL → NF"
        rightAction={podeEditar ? { icon: 'add', onPress: () => { setEditNota(null); setShowForm(true); } } : undefined}
      />

      {isProfessor && professorActual && (
        <View style={sc.profBar}>
          <View style={sc.profAvatar}><Ionicons name="person" size={14} color={Colors.info} /></View>
          <View style={{ flex: 1 }}>
            <Text style={sc.profName}>{professorActual.nome} {professorActual.apelido}</Text>
            <Text style={sc.profInfo} numberOfLines={1}>{professorActual.disciplinas.join(' · ')} · {turmasDoProf.map(t => t.nome).join(', ')}</Text>
          </View>
        </View>
      )}
      {isProfessor && !professorActual && (
        <View style={[sc.profBar, { backgroundColor: Colors.warning + '18', borderBottomColor: Colors.warning + '40' }]}>
          <Ionicons name="warning-outline" size={16} color={Colors.warning} />
          <Text style={[sc.profName, { color: Colors.warning }]}>Sem turmas atribuídas — contacte a direcção.</Text>
        </View>
      )}

      {prazoEncerrado && prazoData && (
        <View style={[sc.banner, { backgroundColor: Colors.danger + '12', borderColor: Colors.danger + '35' }]}>
          <Ionicons name="lock-closed" size={13} color={Colors.danger} />
          <Text style={[sc.bannerText, { color: Colors.danger }]}>
            {podeEditar ? `Prazo do ${trimestreActivo}º Trim. encerrado — acesso privilegiado activo.` : `Prazo encerrado em ${prazoData.split('-').reverse().join('/')}. Lançamento bloqueado.`}
          </Text>
          {podeEditar && <Ionicons name="shield-checkmark" size={12} color={Colors.success} />}
        </View>
      )}

      {/* Trimestre tabs + Pauta Rápida */}
      <View style={sc.trimBar}>
        {([1, 2, 3] as const).map(t => {
          const tabLocked = !canAccessFutureTrimesters && t > trimestreMaxNormal;
          const count = notaCountPerTrim(t);
          const isActive = trimestreActivo === t;
          return (
            <TouchableOpacity
              key={t}
              style={[sc.trimTab, isActive && sc.trimTabActive, tabLocked && { opacity: 0.4 }]}
              onPress={() => { if (tabLocked) { webAlert('Acesso Restrito', `O ${t}º Trimestre ainda não está disponível.`); return; } setTrimestreActivo(t); setFilterTurma(''); }}
              activeOpacity={tabLocked ? 1 : 0.75}
            >
              <Text style={[sc.trimTabText, isActive && sc.trimTabTextActive, tabLocked && { color: Colors.textMuted }]}>{t}º Trimestre</Text>
              {tabLocked ? <Ionicons name="lock-closed" size={10} color={Colors.textMuted} style={{ marginTop: 2 }} /> : <Text style={[sc.trimCount, isActive && { color: Colors.gold }]}>{count}</Text>}
              {isActive && <View style={sc.trimIndicator} />}
            </TouchableOpacity>
          );
        })}
        {podeEditar && (
          <TouchableOpacity
            style={sc.pautaRapidaBtn}
            onPress={() => router.push({
              pathname: '/(main)/pauta-rapida',
              params: { turmaId: filterTurma || '', trimestre: String(trimestreActivo) },
            })}
            activeOpacity={0.75}
          >
            <Ionicons name="flash" size={12} color="#0D1F35" />
            <Text style={sc.pautaRapidaTxt}>Pauta Rápida</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Turma filter */}
      {turmasDoProf.length > 0 && (
        <View style={sc.filterBarWrap}>
          {Platform.OS === 'web' ? (
            <View style={sc.ftSelectWrap}>
              <Ionicons name="layers-outline" size={14} color={filterTurma ? Colors.goldLight : Colors.textMuted} style={sc.ftSelectIcon} />
              {/* @ts-ignore */}
              <select value={filterTurma} onChange={(e: any) => setFilterTurma(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: filterTurma ? '#F5C842' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}>
                <option value="">Todas as turmas</option>
                {turmasDoProf.map(t => (<option key={t.id} value={t.id} style={{ background: '#1A2035', color: '#E2E8F0' }}>{t.nome}</option>))}
              </select>
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={sc.ftSelectChevron} />
            </View>
          ) : (
            <>
              <TouchableOpacity style={sc.ftSelectWrap} onPress={() => { setTurmaSearch(''); setTurmaModalOpen(true); }}>
                <Ionicons name="layers-outline" size={14} color={filterTurma ? Colors.goldLight : Colors.textMuted} style={sc.ftSelectIcon} />
                <Text style={[sc.ftSelectTxt, filterTurma && { color: Colors.goldLight }]} numberOfLines={1}>
                  {filterTurma ? (turmasDoProf.find(t => t.id === filterTurma)?.nome ?? 'Turma') : 'Todas as turmas'}
                </Text>
                {filterTurma ? (
                  <TouchableOpacity onPress={() => setFilterTurma('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={sc.ftSelectChevron} />}
              </TouchableOpacity>
              <Modal visible={turmaModalOpen} transparent animationType="slide" onRequestClose={() => setTurmaModalOpen(false)}>
                <Pressable style={sc.ftModalOverlay} onPress={() => setTurmaModalOpen(false)} />
                <View style={sc.ftModalSheet}>
                  <View style={sc.ftModalHandle} />
                  <View style={sc.ftModalHeader}>
                    <Text style={sc.ftModalTitle}>Seleccionar Turma</Text>
                    <TouchableOpacity onPress={() => setTurmaModalOpen(false)}><Ionicons name="close" size={20} color={Colors.textSecondary} /></TouchableOpacity>
                  </View>
                  <TextInput style={sc.ftModalSearch} placeholder="Pesquisar turma…" placeholderTextColor={Colors.textMuted} value={turmaSearch} onChangeText={setTurmaSearch} autoFocus />
                  <ScrollView>
                    <TouchableOpacity style={sc.ftModalOption} onPress={() => { setFilterTurma(''); setTurmaModalOpen(false); }}>
                      <Ionicons name="layers-outline" size={15} color={Colors.textMuted} />
                      <Text style={[sc.ftModalOptTxt, !filterTurma && { color: Colors.goldLight, fontFamily: 'Inter_700Bold' }]}>Todas as turmas</Text>
                      {!filterTurma && <Ionicons name="checkmark" size={16} color={Colors.gold} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                    {turmasDoProf.filter(t => t.nome.toLowerCase().includes(turmaSearch.toLowerCase())).map(t => (
                      <TouchableOpacity key={t.id} style={sc.ftModalOption} onPress={() => { setFilterTurma(t.id); setTurmaModalOpen(false); }}>
                        <Ionicons name="school-outline" size={15} color={Colors.textMuted} />
                        <Text style={[sc.ftModalOptTxt, filterTurma === t.id && { color: Colors.goldLight, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{t.nome}</Text>
                        {filterTurma === t.id && <Ionicons name="checkmark" size={16} color={Colors.gold} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </Modal>
            </>
          )}
        </View>
      )}

      {/* Stats */}
      <View style={sc.statsRow}>
        <View style={sc.statItem}>
          <Text style={[sc.statVal, { color: Colors.success }]}>{aprovados}</Text>
          <Text style={sc.statLbl}>Aprovados</Text>
        </View>
        <View style={sc.statSep} />
        <View style={sc.statItem}>
          <Text style={[sc.statVal, { color: Colors.danger }]}>{reprovados}</Text>
          <Text style={sc.statLbl}>Reprovados</Text>
        </View>
        <View style={sc.statSep} />
        <View style={sc.statItem}>
          <Text style={[sc.statVal, { color: Colors.gold }]}>{avgNf > 0 ? avgNf.toFixed(1) : '—'}</Text>
          <Text style={sc.statLbl}>Média NF</Text>
        </View>
        <View style={sc.statSep} />
        <View style={sc.statItem}>
          <Text style={[sc.statVal, { color: Colors.info }]}>{filtered.length}</Text>
          <Text style={sc.statLbl}>Total</Text>
        </View>
      </View>

      <FlatList
        data={pagedData}
        keyExtractor={i => i.id}
        renderItem={renderNota}
        contentContainerStyle={[sc.list, { paddingBottom: totalPages > 1 ? 8 : bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={sc.empty}>
            <View style={sc.emptyIcon}><Ionicons name="document-text-outline" size={32} color={Colors.textMuted} /></View>
            <Text style={sc.emptyTitle}>Sem notas no {trimestreActivo}º Trimestre</Text>
            <Text style={sc.emptyMsg}>{podeEditar ? 'Use o botão + no canto superior direito para lançar a primeira nota.' : 'O prazo de lançamento está encerrado para este trimestre.'}</Text>
          </View>
        }
      />

      {/* ── Barra de Paginação ── */}
      {totalPages > 1 && (
        <View style={[sc.paginationBar, { paddingBottom: bottomPad + 8 }]}>
          {/* Botão anterior */}
          <TouchableOpacity
            style={[sc.pgBtn, safePage === 1 && sc.pgBtnDisabled]}
            onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            <Ionicons name="chevron-back" size={15} color={safePage === 1 ? Colors.textMuted : Colors.gold} />
          </TouchableOpacity>

          {/* Botões de número de página */}
          <View style={sc.pgNumbers}>
            {(() => {
              const pages: (number | '…')[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (safePage > 3) pages.push('…');
                for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
                if (safePage < totalPages - 2) pages.push('…');
                pages.push(totalPages);
              }
              return pages.map((p, idx) =>
                p === '…'
                  ? <Text key={`ellipsis-${idx}`} style={sc.pgEllipsis}>…</Text>
                  : <TouchableOpacity
                      key={p}
                      style={[sc.pgNumBtn, p === safePage && sc.pgNumBtnActive]}
                      onPress={() => setCurrentPage(p as number)}
                    >
                      <Text style={[sc.pgNumTxt, p === safePage && sc.pgNumTxtActive]}>{p}</Text>
                    </TouchableOpacity>
              );
            })()}
          </View>

          {/* Indicador "X de Y" */}
          <Text style={sc.pgLabel}>Pág. <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{safePage}</Text> / {totalPages}</Text>

          {/* Botão próximo */}
          <TouchableOpacity
            style={[sc.pgBtn, safePage === totalPages && sc.pgBtnDisabled]}
            onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            <Ionicons name="chevron-forward" size={15} color={safePage === totalPages ? Colors.textMuted : Colors.gold} />
          </TouchableOpacity>
        </View>
      )}

      {showForm && (
        <NotaFormModal
          visible={showForm}
          onClose={() => { setShowForm(false); setEditNota(null); }}
          onSave={handleSave}
          alunos={alunosDisponiveis}
          turmas={turmasDoProf}
          nota={editNota}
          trimestre={trimestreActivo}
          disciplinas={disciplinasDisponiveis}
          professorId={isProfessor && professorActual ? professorActual.id : ''}
          pp1Habilitado={config.pp1Habilitado}
          pptHabilitado={config.pptHabilitado}
          numAvaliacoes={config.numAvaliacoes ?? 4}
          allNotas={notas}
        />
      )}

      {continuidade && (
        <ContinuidadeStatusModal
          visible={!!continuidade}
          onClose={() => setContinuidade(null)}
          alunoId={continuidade.alunoId}
          alunoNome={continuidade.alunoNome}
        />
      )}
    </View>
  );
}

// ─── StyleSheets ─────────────────────────────────────────────────────────────

// AVAL pills
const ap = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  rowLabel: { width: 24, fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase' },
  pills: { flexDirection: 'row', gap: 6, flex: 1 },
  pill: {
    flex: 1, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  pillTxt: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  statusSlot: { width: 22, alignItems: 'center' },
  lockTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 5 },
  lockTagPending: { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '50' },
  lockTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
});

// Grade input
const gi = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  box: { borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingVertical: 13, paddingHorizontal: 12, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  val: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  input: {
    borderRadius: 12, borderWidth: 1.5, paddingVertical: 13, paddingHorizontal: 12,
    fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center',
  },
  lockTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
});

// NF result banner
const rb = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1.5, borderColor: Colors.gold + '40', backgroundColor: Colors.gold + '08', padding: 16, marginVertical: 12 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  col: { alignItems: 'center', flex: 1 },
  lbl: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  val: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  sub: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  arrow: { alignItems: 'center', justifyContent: 'center', width: 24 },
  nfCol: { alignItems: 'center', flex: 1.4, borderRadius: 14, borderWidth: 1.5, padding: 12, backgroundColor: Colors.backgroundCard },
  nfVal: { fontSize: 34, fontFamily: 'Inter_700Bold' },
  nfLbl: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  nfBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  nfBadgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});

// Student row
const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.background },
  rowActive: { backgroundColor: Colors.gold + '12', borderLeftWidth: 3, borderLeftColor: Colors.gold },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  num: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  partialDot: { backgroundColor: Colors.warning + '25', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  partialTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.warning },
});

// Modal overlay/sheet
const mo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end', alignItems: 'center' },
  overlayWeb: { justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: Colors.border, width: '100%', maxWidth: 520, maxHeight: '96%' },
  sheetWeb: { borderRadius: 20, borderWidth: 1, width: '92%', maxWidth: 1100, height: '88%', maxHeight: 760 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.gold + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.gold + '40' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
});

// Student panel (left column)
const sp = StyleSheet.create({
  panel: { width: 280, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.background, flexDirection: 'column' },
  context: { borderBottomWidth: 1, borderBottomColor: Colors.border, padding: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  chipTxt: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTxtActive: { color: Colors.goldLight, fontFamily: 'Inter_700Bold' },
  discChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  discChipActive: { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  discChipTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  discChipTxtActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  classProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  classProgressTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, minWidth: 32, textAlign: 'right' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 7 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text, outlineStyle: 'none' as any },
});

// Grade panel (right column)
const gp = StyleSheet.create({
  studentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  studentAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  studentAvatarTxt: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.goldLight },
  studentName: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  studentMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '45' },
  completeBadgeTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.success },
  progressBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '45' },
  progressBadgeTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.warning },
  emptyStudent: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyStudentTxt: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  bannerTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, flex: 1 },
  progressStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  progressTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, minWidth: 100, textAlign: 'right' },
  section: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  sectionCount: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  scalePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold + '18', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.gold + '40' },
  scalePillTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.goldLight },
  macBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border, marginTop: 10 },
  macLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  macDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  macVal: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnSecondary: { flex: 0.4, backgroundColor: Colors.gold + '15', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderWidth: 1, borderColor: Colors.gold + '45' },
  btnSecondaryTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  btnPrimary: { flex: 1, backgroundColor: Colors.gold, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  btnPrimaryTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  btnAdvance: { width: 52, backgroundColor: Colors.info + '15', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.info + '40' },
});

// Sub-modals
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 18, padding: 20, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: Colors.border },
  iconBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.warning + '20', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  sub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  desc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, color: Colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 80, textAlignVertical: 'top' },
  count: { fontSize: 10, color: Colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  cancelTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  submitBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.warning },
  submitTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
});

// List cards
const lc = StyleSheet.create({
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  meta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  chip: { backgroundColor: Colors.surface, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', gap: 3, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  chipKey: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  chipVal: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  nfBox: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, minWidth: 58, flexShrink: 0 },
  nfVal: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  nfKey: { fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// Main screen
const sc = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  profBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.info + '12', borderBottomWidth: 1, borderBottomColor: Colors.info + '28' },
  profAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' },
  profName: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.info },
  profInfo: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  bannerText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 },
  trimBar: { flexDirection: 'row', backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  trimTab: { flex: 1, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 4, position: 'relative' },
  trimTabActive: { backgroundColor: Colors.gold + '10' },
  trimTabText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  trimTabTextActive: { color: Colors.gold },
  trimCount: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  trimIndicator: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 3, backgroundColor: Colors.gold, borderRadius: 2 },
  pautaRapidaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginRight: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.gold },
  pautaRapidaTxt: { fontSize: 11, color: '#0D1F35', fontFamily: 'Inter_700Bold' },
  filterBarWrap: { backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border, flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8 },
  ftSelectWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, minWidth: 160 },
  ftSelectIcon: { flexShrink: 0 },
  ftSelectChevron: { flexShrink: 0, marginLeft: 'auto' as any },
  ftSelectTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  ftModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  ftModalSheet: { backgroundColor: Colors.primaryDark, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '75%' },
  ftModalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  ftModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  ftModalTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  ftModalSearch: { margin: 12, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, color: Colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: Colors.border },
  ftModalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  ftModalOptTxt: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  statSep: { width: 1, height: 28, backgroundColor: Colors.border },
  list: { padding: 14 },
  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.backgroundCard, borderTopWidth: 1, borderTopColor: Colors.border },
  pgBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold + '14', borderWidth: 1, borderColor: Colors.gold + '30' },
  pgBtnDisabled: { backgroundColor: Colors.surface, borderColor: Colors.border, opacity: 0.5 },
  pgNumbers: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 4 },
  pgNumBtn: { minWidth: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pgNumBtnActive: { backgroundColor: Colors.gold },
  pgNumTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  pgNumTxtActive: { color: '#0D1F35', fontFamily: 'Inter_700Bold' },
  pgEllipsis: { fontSize: 12, color: Colors.textMuted, marginHorizontal: 2 },
  pgLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginLeft: 6 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 6, textAlign: 'center' },
  emptyMsg: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
