import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Image, Platform, Dimensions, Modal, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useRouter } from 'expo-router';
import { subscribePendenciasRefresh } from '@/utils/pendenciasRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pendencia {
  id: string;
  alunoId: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  foto: string | null;
  turma: string;
  curso: string;
  tipoPendencia: 'propina' | 'bloqueio' | 'rupe' | 'aviso_financeiro' | 'nota_negativa' | 'faltas_excessivas' | 'livro_em_atraso';
  descricao: string;
  severidade: 'urgente' | 'aviso' | 'info';
  area: string;
  createdAt: string;
  valor?: number;
  desde?: string;
}

function formatAOA(v: number): string {
  try {
    return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(v) + ' Kz';
  } catch {
    return `${Math.round(v)} Kz`;
  }
}

function formatMonthYear(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${meses[d.getMonth()]}/${d.getFullYear()}`;
  } catch { return ''; }
}

function getDiasAtraso(iso?: string): number {
  if (!iso) return 0;
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    return Math.max(0, Math.floor(diff / 86_400_000));
  } catch { return 0; }
}

function getResolveLabel(tipo: Pendencia['tipoPendencia']): string {
  switch (tipo) {
    case 'propina':
    case 'rupe':
      return 'Pagar agora';
    case 'aviso_financeiro':
      return 'Tratar aviso';
    case 'bloqueio':
      return 'Desbloquear';
    case 'nota_negativa':
      return 'Ver notas';
    case 'faltas_excessivas':
      return 'Ver presenças';
    case 'livro_em_atraso':
      return 'Devolver livro';
    default:
      return 'Resolver';
  }
}

const VISIBLE_ROLES = ['admin', 'ceo', 'pca', 'director', 'secretaria', 'chefe_secretaria', 'financeiro', 'pedagogico'];
const REFRESH_INTERVAL = 15000;

// ─── Persistent Storage Helpers ───────────────────────────────────────────────
const DISMISSED_KEY = (uid: string) => `@siga_pendencias_dismissed_v2_${uid}`;
const SNOOZED_KEY = (uid: string) => `@siga_pendencias_snoozed_v2_${uid}`;

async function loadDismissed(uid: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY(uid));
    if (!raw) return new Set();
    const arr: string[] = JSON.parse(raw);
    return new Set(arr);
  } catch { return new Set(); }
}

async function saveDismissed(uid: string, ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY(uid), JSON.stringify([...ids]));
  } catch { /* silent */ }
}

async function loadSnoozed(uid: string): Promise<Map<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZED_KEY(uid));
    if (!raw) return new Map();
    const obj: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const map = new Map<string, number>();
    for (const [id, expiry] of Object.entries(obj)) {
      if (expiry > now) map.set(id, expiry);
    }
    return map;
  } catch { return new Map(); }
}

async function saveSnoozed(uid: string, map: Map<string, number>): Promise<void> {
  try {
    const now = Date.now();
    const obj: Record<string, number> = {};
    map.forEach((expiry, id) => { if (expiry > now) obj[id] = expiry; });
    await AsyncStorage.setItem(SNOOZED_KEY(uid), JSON.stringify(obj));
  } catch { /* silent */ }
}

const MOTIVOS_KEY = (uid: string) => `@siga_pendencias_motivos_v1_${uid}`;

async function loadMotivos(uid: string): Promise<Map<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(MOTIVOS_KEY(uid));
    if (!raw) return new Map();
    const obj: Record<string, string> = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch { return new Map(); }
}

async function saveMotivos(uid: string, map: Map<string, string>): Promise<void> {
  try {
    const obj: Record<string, string> = {};
    map.forEach((m, id) => { if (m) obj[id] = m; });
    await AsyncStorage.setItem(MOTIVOS_KEY(uid), JSON.stringify(obj));
  } catch { /* silent */ }
}
// ─── Auto-cycle constants ─────────────────────────────────────────────────────
const CARD_SHOW_DURATION  = 12_000;   // show card for 12 seconds
const CARD_HIDE_DURATION  = 3 * 60_000; // hide for 3 minutes
const CARD_FADE_DURATION  = 600;        // animation duration

// ─── History storage ──────────────────────────────────────────────────────────
const HISTORY_KEY = (uid: string) => `@siga_pendencias_history_v1_${uid}`;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  action: 'adiado' | 'dispensado';
  nome: string;
  apelido: string;
  tipo: Pendencia['tipoPendencia'];
  turma: string;
  durationMs?: number;
}

async function loadHistory(uid: string): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY(uid));
    if (!raw) return [];
    const arr: HistoryEntry[] = JSON.parse(raw);
    return arr.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
  } catch { return []; }
}

async function appendHistory(uid: string, entry: HistoryEntry): Promise<void> {
  try {
    const existing = await loadHistory(uid);
    const updated = [entry, ...existing].slice(0, 100);
    await AsyncStorage.setItem(HISTORY_KEY(uid), JSON.stringify(updated));
  } catch { /* silent */ }
}

const ROTATE_INTERVAL = 10000;
const CARD_WIDTH_DESKTOP = 368;
const CARD_WIDTH_MOBILE = 326;
const SIDE_PAUSE_LEFT = 2500;
const SIDE_PAUSE_RIGHT = 3500;
const SIDE_SLIDE_DURATION = 900;

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function formatRelTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.round(diff / 60_000)}min`;
  if (diff < 86_400_000) return `há ${Math.round(diff / 3_600_000)}h`;
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSeveridadeColor(s: Pendencia['severidade']) {
  if (s === 'urgente') return Colors.danger;
  if (s === 'aviso') return Colors.warning;
  return Colors.info;
}

function getTipoIcon(tipo: Pendencia['tipoPendencia']): { lib: 'ion' | 'mci'; name: string } {
  switch (tipo) {
    case 'propina': return { lib: 'mci', name: 'cash-remove' };
    case 'bloqueio': return { lib: 'ion', name: 'lock-closed' };
    case 'rupe': return { lib: 'mci', name: 'bank-outline' };
    case 'aviso_financeiro': return { lib: 'ion', name: 'warning' };
    case 'nota_negativa': return { lib: 'mci', name: 'close-circle' };
    case 'faltas_excessivas': return { lib: 'mci', name: 'calendar-remove' };
    case 'livro_em_atraso': return { lib: 'ion', name: 'book' };
    default: return { lib: 'ion', name: 'alert-circle' };
  }
}

function getTipoLabel(tipo: Pendencia['tipoPendencia']) {
  switch (tipo) {
    case 'propina': return 'Propina';
    case 'bloqueio': return 'Bloqueio';
    case 'rupe': return 'RUPE';
    case 'aviso_financeiro': return 'Aviso';
    case 'nota_negativa': return 'Nota Negativa';
    case 'faltas_excessivas': return 'Faltas Excessivas';
    case 'livro_em_atraso': return 'Livro em Atraso';
    default: return 'Pendência';
  }
}

function getInitials(nome: string, apelido: string) {
  return `${nome.charAt(0)}${apelido.charAt(0)}`.toUpperCase();
}

function getResolveRoute(tipo: Pendencia['tipoPendencia']) {
  if (tipo === 'nota_negativa') return '/(main)/notas';
  if (tipo === 'faltas_excessivas') return '/(main)/presencas';
  if (tipo === 'livro_em_atraso') return '/(main)/biblioteca';
  if (tipo === 'rupe') return '/(main)/pagamentos-hub?tab=referencias';
  return '/(main)/pagamentos-hub';
}

function isFinancePendencia(p: Pendencia) {
  return p.area === 'Financeiro' || p.tipoPendencia === 'propina' || p.tipoPendencia === 'rupe' || p.tipoPendencia === 'aviso_financeiro';
}

function getAvatarColor(nome: string) {
  const colors = ['#4A90D9', '#1E3A5F', '#C89A2A', '#2ECC71', '#3498DB', '#8E44AD'];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── Avatar Component ─────────────────────────────────────────────────────────
function StudentAvatar({ foto, nome, apelido, size = 52 }: {
  foto: string | null; nome: string; apelido: string; size?: number;
}) {
  const initials = getInitials(nome, apelido);
  const color = getAvatarColor(nome);
  const radius = size * 0.16;

  if (foto) {
    return (
      <Image
        source={{ uri: foto }}
        style={{ width: size, height: size, borderRadius: radius, borderWidth: 2, borderColor: Colors.gold + '88' }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: color,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: Colors.gold + '55',
    }}>
      <Text style={{ fontSize: size * 0.34, fontFamily: 'Inter_700Bold', color: '#fff' }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Snooze Bottom Sheet ───────────────────────────────────────────────────────
const SNOOZE_OPTS = [
  { label: '1 minuto',   sub: 'Volta em 1 min',   ms: 60_000,       icon: 'time-outline' as const },
  { label: '15 minutos', sub: 'Volta em 15 min',  ms: 15 * 60_000,  icon: 'time-outline' as const },
  { label: '30 minutos', sub: 'Volta em 30 min',  ms: 30 * 60_000,  icon: 'timer-outline' as const },
  { label: '1 hora',     sub: 'Volta em 1 hora',  ms: 60 * 60_000,  icon: 'hourglass-outline' as const },
];

// SnoozeSheetContent — shared between web inline and native Modal
const MOTIVO_PRESETS = [
  'Aguarda pagamento',
  'Aguarda documentos',
  'Em conversação',
  'Acordo de prestações',
  'Outro',
];

function SnoozeSheetContent({ studentName, onSnooze, onDismiss, onClose }: {
  studentName: string;
  onSnooze: (ms: number, motivo?: string) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState<string>('');
  const [motivoLivre, setMotivoLivre] = useState<string>('');
  const motivoFinal = motivo === 'Outro' ? motivoLivre.trim() : motivo;

  return (
    <View style={styles.snoozeSheet}>
      <View style={styles.snoozeHandle} />
      <View style={styles.snoozeSheetHeader}>
        <Ionicons name="time-outline" size={20} color={Colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.snoozeSheetTitle}>Adiar pendência</Text>
          {studentName ? <Text style={styles.snoozeSheetSub} numberOfLines={1}>{studentName}</Text> : null}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.motivoLabel}>MOTIVO (OPCIONAL)</Text>
      <View style={styles.motivoChipsRow}>
        {MOTIVO_PRESETS.map(m => {
          const active = motivo === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.motivoChip, active && styles.motivoChipActive]}
              onPress={() => setMotivo(active ? '' : m)}
              activeOpacity={0.75}
            >
              <Text style={[styles.motivoChipText, active && styles.motivoChipTextActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {motivo === 'Outro' && (
        <TextInput
          style={styles.motivoInput}
          placeholder="Descreva o motivo…"
          placeholderTextColor={Colors.textMuted}
          value={motivoLivre}
          onChangeText={setMotivoLivre}
          maxLength={80}
        />
      )}

      <View style={styles.snoozeOptsGrid}>
        {SNOOZE_OPTS.map(o => (
          <TouchableOpacity
            key={o.ms}
            style={styles.snoozeOptCard}
            onPress={() => onSnooze(o.ms, motivoFinal || undefined)}
            activeOpacity={0.75}
          >
            <Ionicons name={o.icon} size={22} color={Colors.gold} />
            <Text style={styles.snoozeOptCardLabel}>{o.label}</Text>
            <Text style={styles.snoozeOptCardSub}>{o.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.snoozeDivider} />

      <TouchableOpacity style={styles.snoozeDismissBtn} onPress={onDismiss} activeOpacity={0.8}>
        <Ionicons name="eye-off-outline" size={16} color={Colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={styles.snoozeDismissBtnLabel}>Dispensar permanentemente</Text>
          <Text style={styles.snoozeDismissBtnSub}>Não mostrar mais este aluno</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={Colors.danger + '88'} />
      </TouchableOpacity>
    </View>
  );
}

// SnoozeSheet — no Modal portal on web; renders inline with fixed position
function SnoozeSheet({ visible, studentName, onSnooze, onDismiss, onClose }: {
  visible: boolean;
  studentName: string;
  onSnooze: (ms: number, motivo?: string) => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  if (Platform.OS === 'web') {
    // Web: inline fixed overlay — avoids createPortal event issues in iframes
    return (
      <View style={styles.snoozeOverlay as any}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <SnoozeSheetContent studentName={studentName} onSnooze={onSnooze} onDismiss={onDismiss} onClose={onClose} />
      </View>
    );
  }

  // Native: Modal is fine
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.60)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <SnoozeSheetContent studentName={studentName} onSnooze={onSnooze} onDismiss={onDismiss} onClose={onClose} />
      </View>
    </Modal>
  );
}

function StudentCard({ p, onDismiss, onOpenSnooze, onAction }: { p: Pendencia; onDismiss: () => void; onOpenSnooze: () => void; onAction?: () => void }) {
  const router = useRouter();
  const sevColor = getSeveridadeColor(p.severidade);
  const icon = getTipoIcon(p.tipoPendencia);
  const tipoLabel = getTipoLabel(p.tipoPendencia);

  return (
    <View style={[styles.card, { borderLeftColor: sevColor }]}>
      <View style={[styles.cardGlow, { backgroundColor: sevColor + '18' }]} />

      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.severityBadge, { backgroundColor: sevColor + '22', borderColor: sevColor + '55' }]}>
          <View style={[styles.severityDot, { backgroundColor: sevColor }]} />
          <Text style={[styles.severityText, { color: sevColor }]}>{p.severidade.toUpperCase()}</Text>
        </View>
        <View style={styles.areaBadge}>
          <Text style={styles.areaText}>{p.area}</Text>
        </View>
      </View>

      {/* Student identity */}
      <View style={styles.identityRow}>
        <View style={styles.avatarWrapper}>
          <StudentAvatar foto={p.foto} nome={p.nome} apelido={p.apelido} size={52} />
          <View style={styles.avatarCorner} />
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>{p.nome} {p.apelido}</Text>
          <View style={styles.matriculaRow}>
            <Ionicons name="card-outline" size={11} color={Colors.gold} />
            <Text style={styles.matriculaText}>{p.numeroMatricula}</Text>
          </View>
          <View style={styles.turmaRow}>
            <Ionicons name="school-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.turmaText} numberOfLines={1}>{p.turma}</Text>
          </View>
          {p.curso ? (
            <View style={styles.cursoRow}>
              <Ionicons name="book-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.cursoText} numberOfLines={1}>{p.curso}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Pending issue */}
      <View style={[styles.pendenciaBox, { borderColor: sevColor + '44', backgroundColor: sevColor + '0D' }]}>
        <View style={[styles.pendenciaIconWrap, { backgroundColor: sevColor + '22' }]}>
          {icon.lib === 'ion' ? (
            <Ionicons name={icon.name as any} size={16} color={sevColor} />
          ) : (
            <MaterialCommunityIcons name={icon.name as any} size={16} color={sevColor} />
          )}
        </View>
        <View style={styles.pendenciaContent}>
          <Text style={[styles.pendenciaTipo, { color: sevColor }]}>{tipoLabel}</Text>
          <Text style={styles.pendenciaDescricao}>{p.descricao}</Text>
          {(p.valor != null || p.desde) && (
            <View style={styles.financeMetaRow}>
              {p.valor != null && (
                <Text style={[styles.financeValor, { color: sevColor }]}>{formatAOA(p.valor)}</Text>
              )}
              {p.desde && (
                <Text style={styles.financeDesde}>desde {formatMonthYear(p.desde)}</Text>
              )}
            </View>
          )}
          {(() => {
            const dias = getDiasAtraso(p.desde || p.createdAt);
            if (dias < 1) return null;
            const c = dias > 30 ? Colors.danger : dias > 7 ? Colors.warning : Colors.textMuted;
            const lbl = dias > 30 ? 'PRIORIDADE ALTA' : dias > 7 ? 'PRIORIDADE MÉDIA' : 'RECENTE';
            return (
              <View style={[styles.priorityPill, { borderColor: c + '55', backgroundColor: c + '15' }]}>
                <View style={[styles.priorityDot, { backgroundColor: c }]} />
                <Text style={[styles.priorityText, { color: c }]}>{lbl} · {dias}d</Text>
              </View>
            );
          })()}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.resolverBtn, { borderColor: sevColor + '66', backgroundColor: sevColor + '18' }]}
          onPress={() => {
            router.push(getResolveRoute(p.tipoPendencia) as any);
            onAction?.();
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="checkmark-circle-outline" size={13} color={sevColor} />
          <Text style={[styles.resolverText, { color: sevColor }]}>{getResolveLabel(p.tipoPendencia)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.verPerfilBtn}
          onPress={() => { router.push('/(main)/alunos' as any); onAction?.(); }}
          activeOpacity={0.75}
        >
          <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.verPerfilText}>Ver Aluno</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Counter Badge ─────────────────────────────────────────────────────────────
function CounterBadge({ urgente, aviso, info }: { urgente: number; aviso: number; info: number }) {
  const total = urgente + aviso + info;
  if (total === 0) return null;
  return (
    <View style={styles.counterRow}>
      {urgente > 0 && (
        <View style={[styles.counterChip, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '55' }]}>
          <View style={[styles.counterDot, { backgroundColor: Colors.danger }]} />
          <Text style={[styles.counterNum, { color: Colors.danger }]}>{urgente}</Text>
        </View>
      )}
      {aviso > 0 && (
        <View style={[styles.counterChip, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '55' }]}>
          <View style={[styles.counterDot, { backgroundColor: Colors.warning }]} />
          <Text style={[styles.counterNum, { color: Colors.warning }]}>{aviso}</Text>
        </View>
      )}
      {info > 0 && (
        <View style={[styles.counterChip, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '55' }]}>
          <View style={[styles.counterDot, { backgroundColor: Colors.info }]} />
          <Text style={[styles.counterNum, { color: Colors.info }]}>{info}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Snoozed Indicator ────────────────────────────────────────────────────────
function SnoozedIndicator({ count, nextExpiry, onCancelAll }: {
  count: number;
  nextExpiry: number;
  onCancelAll: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const remaining = Math.max(0, nextExpiry - now);
  const totalSecs = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const countdownLabel = mins > 0
    ? `${mins}m ${secs.toString().padStart(2, '0')}s`
    : `${secs}s`;

  return (
    <View style={styles.snoozedPill}>
      <Ionicons name="time-outline" size={13} color={Colors.gold} />
      <Text style={styles.snoozedPillText}>
        {count} adiada{count !== 1 ? 's' : ''} · volta em {countdownLabel}
      </Text>
      <TouchableOpacity onPress={onCancelAll} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} activeOpacity={0.7}>
        <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Snoozed row inside the expanded panel ────────────────────────────────────
function SnoozedPanelRow({ p, expiry, motivo, onCancel }: {
  p: Pendencia;
  expiry: number;
  motivo?: string;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const remaining = Math.max(0, expiry - now);
  const totalSecs = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const countdown = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
  const sevColor = getSeveridadeColor(p.severidade);

  return (
    <View style={styles.snoozedRow}>
      <View style={[styles.snoozedRowAccent, { backgroundColor: sevColor }]} />
      <View style={styles.snoozedRowBody}>
        <Text style={styles.snoozedRowName} numberOfLines={1}>
          {p.nome} {p.apelido}
        </Text>
        <Text style={styles.snoozedRowLabel} numberOfLines={1}>
          {getTipoLabel(p.tipoPendencia)} · {p.turma}
        </Text>
        <View style={styles.snoozedRowCountdown}>
          <Ionicons name="time-outline" size={11} color={Colors.gold} />
          <Text style={styles.snoozedRowCountdownText}>volta em {countdown}</Text>
        </View>
        {motivo ? (
          <View style={styles.snoozedMotivoRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={10} color={Colors.textMuted} />
            <Text style={styles.snoozedMotivoText} numberOfLines={1}>{motivo}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.snoozedRowCancel}
        onPress={onCancel}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        activeOpacity={0.7}
      >
        <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Trigger Card (collapsed state) ───────────────────────────────────────────
function TriggerCard({
  p, total, currentIndex, pulseAnim, onExpand, isDesktop, onOpenSnooze, onDismiss, onAction,
}: {
  p: Pendencia;
  total: number;
  currentIndex: number;
  pulseAnim: Animated.Value;
  onExpand: () => void;
  isDesktop: boolean;
  onOpenSnooze: () => void;
  onDismiss: () => void;
  onAction?: () => void;
}) {
  const router = useRouter();
  const sevColor = getSeveridadeColor(p.severidade);
  const icon = getTipoIcon(p.tipoPendencia);
  const tipoLabel = getTipoLabel(p.tipoPendencia);

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <View style={[styles.triggerCard, { borderLeftColor: sevColor, width: isDesktop ? CARD_WIDTH_DESKTOP : CARD_WIDTH_MOBILE }]}>
        <View style={[styles.triggerGlow, { backgroundColor: sevColor + '10' }]} />
        <View style={[styles.triggerTopAccent, { backgroundColor: sevColor }]} />

        <View style={styles.triggerCardHeader}>
          <View>
            <Text style={styles.triggerIdLabel}>CARTÃO DE PENDÊNCIA</Text>
            <Text style={styles.triggerIdSub}>Aluno com tarefa por resolver</Text>
          </View>
          <View style={[styles.triggerSeverityChip, { borderColor: sevColor + '66', backgroundColor: sevColor + '18' }]}>
            <View style={[styles.triggerSeverityDot, { backgroundColor: sevColor }]} />
            <Text style={[styles.triggerSeverityText, { color: sevColor }]}>{p.severidade}</Text>
          </View>
        </View>

        <View style={styles.triggerDivider} />

        <View style={styles.triggerInner}>
          <View style={styles.triggerAvatarWrap}>
            <StudentAvatar foto={p.foto} nome={p.nome} apelido={p.apelido} size={64} />
            <View style={[styles.triggerSevDot, { backgroundColor: sevColor }]} />
          </View>

          <View style={styles.triggerContent}>
            <View style={styles.triggerTopRow}>
              <Text style={styles.triggerName} numberOfLines={1}>{p.nome} {p.apelido}</Text>
              {total > 1 && (
                <View style={[styles.triggerCount, { backgroundColor: sevColor }]}>
                  <Text style={styles.triggerCountText}>{total > 99 ? '99+' : total}</Text>
                </View>
              )}
            </View>

            <View style={styles.triggerInfoGrid}>
              <View style={styles.triggerMetaChip}>
                <Ionicons name="card-outline" size={11} color={Colors.gold} />
                <Text style={styles.triggerMatricula} numberOfLines={1}>{p.numeroMatricula}</Text>
              </View>
              <View style={styles.triggerMetaChip}>
                <Ionicons name="school-outline" size={11} color={Colors.textMuted} />
                <Text style={styles.triggerTurma} numberOfLines={1}>{p.turma}</Text>
              </View>
            </View>

            <View style={[styles.triggerIssuePill, { backgroundColor: sevColor + '1A', borderColor: sevColor + '44' }]}>
              {icon.lib === 'ion' ? (
                <Ionicons name={icon.name as any} size={13} color={sevColor} />
              ) : (
                <MaterialCommunityIcons name={icon.name as any} size={13} color={sevColor} />
              )}
              <View style={styles.triggerIssueTextWrap}>
                <Text style={[styles.triggerIssueLabel, { color: sevColor }]}>{tipoLabel}</Text>
                <Text style={styles.triggerIssueDesc} numberOfLines={2}>{p.descricao}</Text>
                {(p.valor != null || p.desde) && (
                  <View style={styles.financeMetaRow}>
                    {p.valor != null && (
                      <Text style={[styles.financeValor, { color: sevColor }]}>{formatAOA(p.valor)}</Text>
                    )}
                    {p.desde && (
                      <Text style={styles.financeDesde}>desde {formatMonthYear(p.desde)}</Text>
                    )}
                  </View>
                )}
                {(() => {
                  const dias = getDiasAtraso(p.desde || p.createdAt);
                  if (dias < 1) return null;
                  const c = dias > 30 ? Colors.danger : dias > 7 ? Colors.warning : Colors.textMuted;
                  const lbl = dias > 30 ? 'PRIORIDADE ALTA' : dias > 7 ? 'PRIORIDADE MÉDIA' : 'RECENTE';
                  return (
                    <View style={[styles.priorityPill, { borderColor: c + '55', backgroundColor: c + '15', alignSelf: 'flex-start' }]}>
                      <View style={[styles.priorityDot, { backgroundColor: c }]} />
                      <Text style={[styles.priorityText, { color: c }]}>{lbl} · {dias}d</Text>
                    </View>
                  );
                })()}
              </View>
            </View>

            <View style={styles.triggerAreaRow}>
              <MaterialCommunityIcons name="office-building-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.triggerAreaText} numberOfLines={1}>{p.area}</Text>
              {p.curso ? <Text style={styles.triggerAreaText} numberOfLines={1}> · {p.curso}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.triggerActions}>
          <TouchableOpacity
            style={[styles.triggerResolverBtn, { borderColor: sevColor + '55', backgroundColor: sevColor + '18' }]}
            onPress={() => {
              router.push(getResolveRoute(p.tipoPendencia) as any);
              onAction?.();
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="checkmark-circle-outline" size={14} color={sevColor} />
            <Text style={[styles.triggerResolverText, { color: sevColor }]}>{getResolveLabel(p.tipoPendencia)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.triggerExpandBtn}
            onPress={onExpand}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="alert-decagram" size={13} color={Colors.textMuted} />
            <Text style={styles.triggerExpandText}>Ver todos</Text>
            <Ionicons name="chevron-back" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {total > 1 && (
          <View style={styles.triggerDots}>
            {Array.from({ length: Math.min(total, 6) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.triggerDot,
                  i === (currentIndex % Math.min(total, 6)) && [styles.triggerDotActive, { backgroundColor: sevColor }],
                ]}
              />
            ))}
          </View>
        )}

      </View>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PendenciasStream() {
  const { user } = useAuth();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();

  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [snoozedUntil, setSnoozedUntil] = useState<Map<string, number>>(new Map());
  const [motivos, setMotivos] = useState<Map<string, string>>(new Map());
  const snoozeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [expanded, setExpanded] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [snoozeTargetId, setSnoozeTargetId] = useState<string | null>(null);
  const snoozeTargetIdRef = useRef<string | null>(null);
  const persistenceLoadedRef = useRef(false);
  const [historyLog, setHistoryLog] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Keep ref in sync with state so callbacks never read stale closures
  const setSnoozeTarget = useCallback((id: string | null) => {
    snoozeTargetIdRef.current = id;
    setSnoozeTargetId(id);
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Auto-cycle animations
  const cardFadeAnim  = useRef(new Animated.Value(1)).current;
  const cardSlideAnim = useRef(new Animated.Value(0)).current;
  const autoCycleRef  = useRef<{ show: ReturnType<typeof setTimeout> | null; hide: ReturnType<typeof setTimeout> | null }>({ show: null, hide: null });
  const cardVisibleRef = useRef(true);
  const [cardInteractive, setCardInteractive] = useState(true);

  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sideAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const autoTaskModalShownRef = useRef(false);
  const leftOffset = isDesktop ? 16 : 12;
  const slideXAnim = useRef(new Animated.Value(leftOffset)).current;

  const shouldRender = !!(user && VISIBLE_ROLES.includes(user.role));

  const now = Date.now();
  const role = user?.role;
  const FINANCE_TIPOS: Pendencia['tipoPendencia'][] = ['propina', 'rupe', 'aviso_financeiro'];
  const SECRETARIA_TIPOS: Pendencia['tipoPendencia'][] = ['bloqueio'];
  const PEDAGOGICO_TIPOS: Pendencia['tipoPendencia'][] = ['nota_negativa', 'faltas_excessivas'];
  const visible = pendencias.filter(p => {
    if (dismissed.has(p.id)) return false;
    const snoozeExpiry = snoozedUntil.get(p.id);
    if (snoozeExpiry && snoozeExpiry > now) return false;
    // Role-based filtering: each role only sees tasks in their area
    if (role === 'financeiro') return FINANCE_TIPOS.includes(p.tipoPendencia);
    if (role === 'secretaria') return SECRETARIA_TIPOS.includes(p.tipoPendencia) || PEDAGOGICO_TIPOS.includes(p.tipoPendencia);
    if (role === 'chefe_secretaria') return SECRETARIA_TIPOS.includes(p.tipoPendencia) || PEDAGOGICO_TIPOS.includes(p.tipoPendencia);
    if (role === 'pedagogico') return PEDAGOGICO_TIPOS.includes(p.tipoPendencia);
    // admin, ceo, pca, director see all
    return true;
  });
  const financeVisible = visible.filter(isFinancePendencia);
  const urgente = visible.filter(p => p.severidade === 'urgente').length;
  const aviso = visible.filter(p => p.severidade === 'aviso').length;
  const info = visible.filter(p => p.severidade === 'info').length;
  const total = visible.length;
  const isFinanceUser = user?.role === 'financeiro' || user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'pca';

  // ─── Load persisted dismissed + snoozed from storage on mount ───────────────
  useEffect(() => {
    if (!shouldRender || !user?.id || persistenceLoadedRef.current) return;
    persistenceLoadedRef.current = true;
    (async () => {
      const [storedDismissed, storedSnoozed, storedMotivos] = await Promise.all([
        loadDismissed(user.id),
        loadSnoozed(user.id),
        loadMotivos(user.id),
      ]);
      if (storedDismissed.size > 0) setDismissed(storedDismissed);
      if (storedMotivos.size > 0) setMotivos(storedMotivos);
      if (storedSnoozed.size > 0) {
        setSnoozedUntil(storedSnoozed);
        // Restore snooze timers for entries that haven't expired
        storedSnoozed.forEach((expiry, id) => {
          const remaining = expiry - Date.now();
          if (remaining > 0) {
            const timer = setTimeout(() => {
              setSnoozedUntil(prev => {
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
              snoozeTimersRef.current.delete(id);
            }, remaining);
            snoozeTimersRef.current.set(id, timer);
          }
        });
      }
    })();
  }, [shouldRender, user?.id]);

  // ─── Load history on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldRender || !user?.id) return;
    loadHistory(user.id).then(h => setHistoryLog(h));
  }, [shouldRender, user?.id]);

  // ─── Auto-cycle: show card for CARD_SHOW_DURATION, then hide for CARD_HIDE_DURATION ──
  useEffect(() => {
    if (!shouldRender) return;

    const clearCycle = () => {
      if (autoCycleRef.current.show) clearTimeout(autoCycleRef.current.show);
      if (autoCycleRef.current.hide) clearTimeout(autoCycleRef.current.hide);
      autoCycleRef.current = { show: null, hide: null };
    };

    const animIn = () => {
      cardVisibleRef.current = true;
      setCardInteractive(true);
      Animated.parallel([
        Animated.timing(cardFadeAnim,  { toValue: 1, duration: CARD_FADE_DURATION, useNativeDriver: false }),
        Animated.timing(cardSlideAnim, { toValue: 0, duration: CARD_FADE_DURATION, useNativeDriver: false }),
      ]).start();
    };

    const animOut = () => {
      cardVisibleRef.current = false;
      Animated.parallel([
        Animated.timing(cardFadeAnim,  { toValue: 0, duration: CARD_FADE_DURATION, useNativeDriver: false }),
        Animated.timing(cardSlideAnim, { toValue: 50, duration: CARD_FADE_DURATION, useNativeDriver: false }),
      ]).start(() => setCardInteractive(false));
    };

    const scheduleCycle = () => {
      clearCycle();
      animIn();
      autoCycleRef.current.hide = setTimeout(() => {
        animOut();
        autoCycleRef.current.show = setTimeout(scheduleCycle, CARD_HIDE_DURATION);
      }, CARD_SHOW_DURATION);
    };

    scheduleCycle();
    return clearCycle;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]);

  // Pause cycle when expanded, resume when collapsed
  useEffect(() => {
    if (expanded) {
      // Snap card fully visible while panel open
      cardFadeAnim.setValue(1);
      cardSlideAnim.setValue(0);
    }
  }, [expanded]);

  const load = useCallback(async () => {
    if (!shouldRender || !user?.id) return;
    try {
      setIsLoading(true);
      const data = await api.get<Pendencia[]>('/api/pendencias-alunos');
      const returnedIds = new Set(data.map((p: Pendencia) => p.id));

      // Clean up dismissed IDs that the server no longer returns
      // (means the task was truly resolved — remove from persistent storage)
      setDismissed(prev => {
        const cleaned = new Set([...prev].filter(id => returnedIds.has(id)));
        if (cleaned.size !== prev.size) saveDismissed(user.id, cleaned);
        return cleaned;
      });

      setPendencias(data);
      setCurrentIndex(0);
    } catch (_e) {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, [shouldRender, user?.id]);

  useEffect(() => {
    if (!shouldRender) return;
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    const unsubscribe = subscribePendenciasRefresh(load);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [load, shouldRender]);

  useEffect(() => {
    if (!shouldRender || !isFinanceUser || autoTaskModalShownRef.current) return;
    if (financeVisible.length === 0) return;
    autoTaskModalShownRef.current = true;
    setTaskModalOpen(true);
  }, [financeVisible.length, isFinanceUser, shouldRender]);

  // Pulse when urgent and collapsed
  useEffect(() => {
    if (!shouldRender) return;
    if (urgente > 0 && !expanded) {
      const nd = Platform.OS !== 'web';
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: nd }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: nd }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [urgente, expanded, shouldRender]);

  // Auto-rotate cards
  useEffect(() => {
    if (!shouldRender || expanded || total === 0) {
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
      return;
    }
    rotateTimerRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % total);
    }, ROTATE_INTERVAL);
    return () => {
      if (rotateTimerRef.current) clearInterval(rotateTimerRef.current);
    };
  }, [expanded, total, shouldRender]);

  // Animate panel
  useEffect(() => {
    if (!shouldRender) return;
    Animated.spring(slideAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
  }, [expanded, shouldRender]);

  // Side-to-side sliding animation (only when collapsed and has items)
  useEffect(() => {
    if (!shouldRender) return;

    if (sideAnimRef.current) {
      sideAnimRef.current.stop();
      sideAnimRef.current = null;
    }

    if (expanded || total === 0) {
      // Snap back to left side when expanded or no items
      Animated.spring(slideXAnim, {
        toValue: leftOffset,
        useNativeDriver: false,
        tension: 60,
        friction: 12,
      }).start();
      return;
    }

    const screenW = Dimensions.get('window').width;
    const cardW = isDesktop ? CARD_WIDTH_DESKTOP : CARD_WIDTH_MOBILE;
    const rightX = Math.max(screenW - cardW - leftOffset, leftOffset);

    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(SIDE_PAUSE_LEFT),
        Animated.timing(slideXAnim, {
          toValue: rightX,
          duration: SIDE_SLIDE_DURATION,
          useNativeDriver: false,
        }),
        Animated.delay(SIDE_PAUSE_RIGHT),
        Animated.timing(slideXAnim, {
          toValue: leftOffset,
          duration: SIDE_SLIDE_DURATION,
          useNativeDriver: false,
        }),
      ])
    );

    sideAnimRef.current = anim;
    anim.start();

    return () => {
      anim.stop();
      sideAnimRef.current = null;
    };
  }, [expanded, total, shouldRender, isDesktop, leftOffset]);

  // Snoozed items that are NOT dismissed — used for the indicator
  const snoozedPending = pendencias.filter(p => {
    if (dismissed.has(p.id)) return false;
    const expiry = snoozedUntil.get(p.id);
    return !!(expiry && expiry > Date.now());
  });
  const nextExpiry = snoozedPending.length > 0
    ? Math.min(...snoozedPending.map(p => snoozedUntil.get(p.id)!))
    : null;

  const handleCancelAllSnoozes = useCallback(() => {
    snoozeTimersRef.current.forEach(t => clearTimeout(t));
    snoozeTimersRef.current.clear();
    setSnoozedUntil(new Map());
  }, []);

  // Reset auto-cycle when user actively interacts with card
  const resetCycle = useCallback(() => {
    if (autoCycleRef.current.show) clearTimeout(autoCycleRef.current.show);
    if (autoCycleRef.current.hide) clearTimeout(autoCycleRef.current.hide);
    cardFadeAnim.setValue(1);
    cardSlideAnim.setValue(0);
    cardVisibleRef.current = true;
    setCardInteractive(true);
    autoCycleRef.current.hide = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardFadeAnim,  { toValue: 0, duration: CARD_FADE_DURATION, useNativeDriver: false }),
        Animated.timing(cardSlideAnim, { toValue: 50, duration: CARD_FADE_DURATION, useNativeDriver: false }),
      ]).start(() => setCardInteractive(false));
      autoCycleRef.current.show = setTimeout(() => {
        setCardInteractive(true);
        Animated.parallel([
          Animated.timing(cardFadeAnim,  { toValue: 1, duration: CARD_FADE_DURATION, useNativeDriver: false }),
          Animated.timing(cardSlideAnim, { toValue: 0, duration: CARD_FADE_DURATION, useNativeDriver: false }),
        ]).start();
      }, CARD_HIDE_DURATION);
    }, CARD_SHOW_DURATION);
  }, [cardFadeAnim, cardSlideAnim]);

  const handleDismiss = useCallback((id: string) => {
    const p = pendencias.find(x => x.id === id);
    setDismissed(prev => {
      const next = new Set([...prev, id]);
      if (user?.id) saveDismissed(user.id, next);
      return next;
    });
    if (user?.id && p) {
      const entry: HistoryEntry = {
        id: `h-${Date.now()}-${id}`,
        timestamp: Date.now(),
        action: 'dispensado',
        nome: p.nome,
        apelido: p.apelido,
        tipo: p.tipoPendencia,
        turma: p.turma,
      };
      appendHistory(user.id, entry);
      setHistoryLog(prev => [entry, ...prev].slice(0, 100));
    }
  }, [user?.id, pendencias]);

  const handleSnooze = useCallback((id: string, ms: number, motivo?: string) => {
    const p = pendencias.find(x => x.id === id);
    const expiry = Date.now() + ms;
    setSnoozedUntil(prev => {
      const next = new Map(prev);
      next.set(id, expiry);
      if (user?.id) saveSnoozed(user.id, next);
      return next;
    });
    setMotivos(prev => {
      const next = new Map(prev);
      if (motivo && motivo.trim()) next.set(id, motivo.trim());
      else next.delete(id);
      if (user?.id) saveMotivos(user.id, next);
      return next;
    });
    // Clear existing timer for this id
    const existing = snoozeTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    // Re-render after snooze expires so card reappears
    const timer = setTimeout(() => {
      setSnoozedUntil(prev => {
        const next = new Map(prev);
        next.delete(id);
        if (user?.id) saveSnoozed(user.id, next);
        return next;
      });
      snoozeTimersRef.current.delete(id);
    }, ms);
    snoozeTimersRef.current.set(id, timer);
    if (user?.id && p) {
      const entry: HistoryEntry = {
        id: `h-${Date.now()}-${id}`,
        timestamp: Date.now(),
        action: 'adiado',
        nome: p.nome,
        apelido: p.apelido,
        tipo: p.tipoPendencia,
        turma: p.turma,
        durationMs: ms,
      };
      appendHistory(user.id, entry);
      setHistoryLog(prev => [entry, ...prev].slice(0, 100));
    }
  }, [user?.id, pendencias]);

  const openSnooze = useCallback((id: string) => setSnoozeTarget(id), [setSnoozeTarget]);
  const closeSnooze = useCallback(() => setSnoozeTarget(null), [setSnoozeTarget]);
  const confirmSnooze = useCallback((ms: number, motivo?: string) => {
    const id = snoozeTargetIdRef.current;   // always fresh — no stale closure
    if (id) handleSnooze(id, ms, motivo);
    setSnoozeTarget(null);
  }, [handleSnooze, setSnoozeTarget]);
  const dismissFromSnooze = useCallback(() => {
    const id = snoozeTargetIdRef.current;
    if (id) handleDismiss(id);
    setSnoozeTarget(null);
  }, [handleDismiss, setSnoozeTarget]);

  const panelWidth = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, isDesktop ? 340 : 310] });
  const panelOpacity = slideAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 1] });

  if (!shouldRender) return null;
  if (total === 0 && !isLoading && snoozedPending.length === 0) return null;

  const currentCard = visible[currentIndex % Math.max(total, 1)];

  return (
    <>
    <Animated.View style={[styles.container, isDesktop ? styles.containerDesktop : styles.containerMobile, { left: slideXAnim, pointerEvents: 'box-none' } as any]}>
      {/* Expanded panel */}
      <Animated.View style={[styles.panel, { width: panelWidth, opacity: panelOpacity }]}>
        {expanded && (
          <View style={styles.panelInner}>
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleRow}>
                <MaterialCommunityIcons name="alert-decagram" size={18} color={Colors.warning} />
                <Text style={styles.panelTitle}>Pendências de Alunos</Text>
              </View>
              <CounterBadge urgente={urgente} aviso={aviso} info={info} />
              <TouchableOpacity
                style={[styles.historyToggleBtn, showHistory && styles.historyToggleBtnActive]}
                onPress={() => setShowHistory(h => !h)}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
              >
                <Ionicons name="time-outline" size={13} color={showHistory ? Colors.gold : Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setExpanded(false)} style={styles.collapseBtn}>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.refreshRow} onPress={load} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.refreshText}>{isLoading ? 'A actualizar...' : 'Actualizar agora'}</Text>
            </TouchableOpacity>

            <ScrollView
              style={styles.cardList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardListContent}
            >
              {visible.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={Colors.success} />
                  <Text style={styles.emptyText}>Sem pendências activas</Text>
                </View>
              ) : (
                visible.map(p => (
                  <StudentCard
                    key={p.id}
                    p={p}
                    onDismiss={() => handleDismiss(p.id)}
                    onOpenSnooze={() => openSnooze(p.id)}
                    onAction={() => setExpanded(false)}
                  />
                ))
              )}

              {/* ── Snoozed section inside panel ── */}
              {snoozedPending.length > 0 && (
                <View style={styles.snoozedPanelSection}>
                  <View style={styles.snoozedPanelHeader}>
                    <Ionicons name="time-outline" size={13} color={Colors.gold} />
                    <Text style={styles.snoozedPanelHeaderText}>
                      Adiadas ({snoozedPending.length})
                    </Text>
                    <TouchableOpacity onPress={handleCancelAllSnoozes} activeOpacity={0.7}>
                      <Text style={styles.snoozedPanelCancelAll}>cancelar todas</Text>
                    </TouchableOpacity>
                  </View>
                  {snoozedPending.map(p => (
                    <SnoozedPanelRow
                      key={p.id}
                      p={p}
                      expiry={snoozedUntil.get(p.id)!}
                      motivo={motivos.get(p.id)}
                      onCancel={() => {
                        const timer = snoozeTimersRef.current.get(p.id);
                        if (timer) clearTimeout(timer);
                        snoozeTimersRef.current.delete(p.id);
                        setSnoozedUntil(prev => {
                          const next = new Map(prev);
                          next.delete(p.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </View>
              )}

              {/* ── Histórico de acções ── */}
              {showHistory && (
                <View style={styles.historySection}>
                  <View style={styles.historySectionHeader}>
                    <Ionicons name="time-outline" size={13} color={Colors.gold} />
                    <Text style={styles.historySectionTitle}>Histórico de Acções</Text>
                    {historyLog.length > 0 && (
                      <TouchableOpacity
                        onPress={async () => {
                          if (user?.id) await AsyncStorage.removeItem(HISTORY_KEY(user.id));
                          setHistoryLog([]);
                        }}
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      >
                        <Text style={styles.historyClearBtn}>limpar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {historyLog.length === 0 ? (
                    <View style={styles.historyEmpty}>
                      <Text style={styles.historyEmptyText}>Sem acções registadas ainda.</Text>
                    </View>
                  ) : (
                    historyLog.map(h => (
                      <View key={h.id} style={styles.historyItem}>
                        <View style={[styles.historyDot, { backgroundColor: h.action === 'adiado' ? Colors.gold : Colors.danger }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyItemName} numberOfLines={1}>{h.nome} {h.apelido}</Text>
                          <Text style={styles.historyItemMeta} numberOfLines={1}>
                            {getTipoLabel(h.tipo)} · {h.turma}
                          </Text>
                          <Text style={styles.historyItemAction}>
                            {h.action === 'adiado' ? `⏱ Adiado${h.durationMs ? ` por ${formatDuration(h.durationMs)}` : ''}` : '✖ Dispensado'}
                          </Text>
                        </View>
                        <Text style={styles.historyItemTime}>{formatRelTime(h.timestamp)}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Animated.View>

      {/* Collapsed trigger card — with auto-cycle fade/slide animation */}
      {!expanded && currentCard && (
        <Animated.View
          style={{ opacity: cardFadeAnim, transform: [{ translateY: cardSlideAnim }], pointerEvents: cardInteractive ? 'auto' : 'none' } as any}
        >
          <TriggerCard
            p={currentCard}
            total={total}
            currentIndex={currentIndex}
            pulseAnim={pulseAnim}
            isDesktop={isDesktop}
            onExpand={() => {
              resetCycle();
              slideXAnim.setValue(leftOffset);
              setExpanded(true);
            }}
            onOpenSnooze={() => { resetCycle(); openSnooze(currentCard.id); }}
            onDismiss={() => { resetCycle(); handleDismiss(currentCard.id); }}
            onAction={() => { resetCycle(); handleDismiss(currentCard.id); }}
          />
        </Animated.View>
      )}

      {/* Collapse button when panel is open */}
      {expanded && (
        <TouchableOpacity
          style={styles.collapseFloatBtn}
          onPress={() => setExpanded(false)}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </Animated.View>

    {/* Snoozed indicator — shown when all cards are snoozed */}
    {total === 0 && snoozedPending.length > 0 && nextExpiry !== null && (
      <View style={[styles.snoozedPillContainer, { left: leftOffset }]}>
        <SnoozedIndicator
          count={snoozedPending.length}
          nextExpiry={nextExpiry}
          onCancelAll={handleCancelAllSnoozes}
        />
      </View>
    )}

    <Modal visible={taskModalOpen && financeVisible.length > 0} transparent animationType="fade" onRequestClose={() => setTaskModalOpen(false)}>
      <View style={styles.taskModalOverlay}>
        <View style={styles.taskModalBox}>
          <View style={styles.taskModalHeader}>
            <View style={styles.taskModalTitleRow}>
              <MaterialCommunityIcons name="clipboard-alert-outline" size={22} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.taskModalTitle}>Tarefas Financeiras Pendentes</Text>
                <Text style={styles.taskModalSubtitle}>
                  {financeVisible.length} tarefa{financeVisible.length === 1 ? '' : 's'} requerem aprovação ou confirmação manual.
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setTaskModalOpen(false)} style={styles.taskModalClose}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.taskModalList} contentContainerStyle={styles.taskModalListContent}>
            {financeVisible.slice(0, 6).map(p => {
              const sevColor = getSeveridadeColor(p.severidade);
              const icon = getTipoIcon(p.tipoPendencia);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.taskModalItem, { borderLeftColor: sevColor }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setTaskModalOpen(false);
                    router.push(getResolveRoute(p.tipoPendencia) as any);
                  }}
                >
                  <View style={[styles.taskModalIcon, { backgroundColor: sevColor + '22' }]}>
                    {icon.lib === 'ion'
                      ? <Ionicons name={icon.name as any} size={16} color={sevColor} />
                      : <MaterialCommunityIcons name={icon.name as any} size={16} color={sevColor} />
                    }
                  </View>
                  <View style={styles.taskModalItemBody}>
                    <Text style={styles.taskModalStudent} numberOfLines={1}>{p.nome} {p.apelido}</Text>
                    <Text style={styles.taskModalDesc} numberOfLines={2}>{p.descricao}</Text>
                    <Text style={styles.taskModalMeta}>{p.numeroMatricula} · {p.turma}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.taskModalActions}>
            <TouchableOpacity style={styles.taskModalLaterBtn} onPress={() => setTaskModalOpen(false)}>
              <Text style={styles.taskModalLaterTxt}>Ver depois</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.taskModalResolveBtn}
              onPress={() => {
                setTaskModalOpen(false);
                router.push('/(main)/pagamentos-hub' as any);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="white" />
              <Text style={styles.taskModalResolveTxt}>Abrir Hub de Pagamentos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Snooze bottom sheet */}
    <SnoozeSheet
      visible={snoozeTargetId !== null}
      studentName={(() => {
        const p = pendencias.find(x => x.id === snoozeTargetId);
        return p ? `${p.nome} ${p.apelido}` : '';
      })()}
      onSnooze={confirmSnooze}
      onDismiss={dismissFromSnooze}
      onClose={closeSnooze}
    />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'flex-end',
  } as any,
  containerDesktop: {
    bottom: 90,
    flexDirection: 'row-reverse',
  } as any,
  containerMobile: {
    bottom: 80,
    flexDirection: 'row-reverse',
  } as any,

  // ── Panel ──
  panel: {
    overflow: 'hidden',
    marginLeft: 8,
  },
  panelInner: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    maxHeight: 520,
    width: '100%',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  panelTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  collapseBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  refreshText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  cardList: {
    flex: 1,
  },
  cardListContent: {
    padding: 10,
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },

  // ── Counter badges ──
  counterRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  counterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  counterDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  counterNum: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },

  // ── Full student card (inside expanded panel) ──
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  cardGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  severityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  severityText: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  areaBadge: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  areaText: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  dismissBtn: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1,
    borderColor: Colors.gold + '44',
  },
  snoozeInlineTxt: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 10,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarCorner: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },
  studentInfo: {
    flex: 1,
    gap: 3,
  },
  studentName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 16,
  },
  matriculaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  matriculaText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  turmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  turmaText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  cursoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cursoText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  pendenciaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  },
  pendenciaIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendenciaContent: {
    flex: 1,
    gap: 2,
  },
  pendenciaTipo: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  pendenciaDescricao: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
  },
  resolverBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 7,
    gap: 5,
  },
  resolverText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  verPerfilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 5,
    backgroundColor: Colors.surface,
  },
  verPerfilText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },

  // ── Trigger card (collapsed state) ──
  triggerCard: {
    minHeight: 176,
    backgroundColor: '#0F2742',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.gold + '38',
    borderLeftWidth: 5,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 22,
  },
  triggerGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  triggerTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  triggerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 9,
    gap: 10,
  },
  triggerIdLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
    letterSpacing: 1.1,
  },
  triggerIdSub: {
    marginTop: 2,
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  triggerSeverityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  triggerSeverityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  triggerSeverityText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  triggerDivider: {
    height: 1,
    marginHorizontal: 14,
    backgroundColor: Colors.gold + '20',
  },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  triggerAvatarWrap: {
    position: 'relative',
  },
  triggerSevDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#0F2742',
  },
  triggerContent: {
    flex: 1,
    gap: 7,
  },
  triggerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 19,
  },
  triggerCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  triggerCountText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  triggerInfoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  triggerMetaChip: {
    flex: 1,
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 7,
    gap: 4,
  },
  triggerMatricula: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    letterSpacing: 0.4,
  },
  triggerTurma: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  triggerIssuePill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 7,
  },
  triggerIssueTextWrap: {
    flex: 1,
    gap: 1,
  },
  triggerIssueLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  triggerIssueDesc: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 15,
  },
  triggerAreaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  triggerAreaText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  triggerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 11,
    gap: 8,
  },
  triggerResolverBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  triggerResolverText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  triggerExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 5,
  },
  triggerExpandText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  triggerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 9,
  },
  triggerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  triggerDotActive: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },

  // ── Collapse float button (when expanded) ──
  collapseFloatBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  taskModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  taskModalBox: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    backgroundColor: Colors.primaryDark,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 30,
  },
  taskModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  taskModalTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskModalTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  taskModalSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 17,
  },
  taskModalClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  taskModalList: {
    maxHeight: 380,
  },
  taskModalListContent: {
    padding: 12,
    gap: 10,
  },
  taskModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    padding: 12,
  },
  taskModalIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskModalItemBody: {
    flex: 1,
    gap: 2,
  },
  taskModalStudent: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  taskModalDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  taskModalMeta: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  taskModalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  taskModalLaterBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  taskModalLaterTxt: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
  },
  taskModalResolveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.success,
  },
  taskModalResolveTxt: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  // ── Snooze Bottom Sheet ──
  snoozeOverlay: {
    // On web: position fixed covers full viewport without portal / iframe issues
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  } as any,
  snoozeSheet: {
    backgroundColor: Colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },
  snoozeHandle: {
    width: 40, height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  snoozeSheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  snoozeSheetTitle: {
    fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text,
  },
  snoozeSheetSub: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1,
  },
  snoozeOptsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 14, gap: 10,
  },
  financeMetaRow: {
    flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap',
    gap: 8, marginTop: 4,
  },
  financeValor: {
    fontSize: 13, fontFamily: 'Inter_700Bold',
  },
  financeDesde: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
  },
  priorityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: 999, borderWidth: 1,
    marginTop: 6, alignSelf: 'flex-start',
  },
  priorityDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  priorityText: {
    fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5,
  },
  motivoLabel: {
    fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary,
    marginTop: 4, marginBottom: 6, marginHorizontal: 14, letterSpacing: 0.4,
  },
  motivoChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginHorizontal: 14, marginBottom: 8,
  },
  motivoChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  motivoChipActive: {
    borderColor: Colors.gold + 'AA', backgroundColor: Colors.gold + '22',
  },
  motivoChipText: {
    fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary,
  },
  motivoChipTextActive: {
    color: Colors.gold,
  },
  motivoInput: {
    marginHorizontal: 14, marginBottom: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  snoozeOptCard: {
    width: '47%', minWidth: 120,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    alignItems: 'flex-start',
    gap: 6,
  },
  snoozeOptCardLabel: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text,
  },
  snoozeOptCardSub: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
  },
  snoozeDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  snoozeDismissBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 14, marginTop: 10,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: Colors.danger + '12',
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.danger + '33',
  },
  snoozeDismissBtnLabel: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger,
  },
  snoozeDismissBtnSub: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger + 'AA',
    marginTop: 1,
  },

  // ── History toggle button ──
  historyToggleBtn: {
    width: 28, height: 28,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  historyToggleBtnActive: {
    backgroundColor: Colors.gold + '22',
    borderColor: Colors.gold + '66',
  },

  // ── History section ──
  historySection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  historySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: 8, paddingHorizontal: 2,
  },
  historySectionTitle: {
    flex: 1,
    fontSize: 11, fontFamily: 'Inter_700Bold',
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  historyClearBtn: {
    fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger,
  },
  historyEmpty: {
    paddingVertical: 14, alignItems: 'center',
  },
  historyEmptyText: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
  },
  historyItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '66',
  },
  historyDot: {
    width: 8, height: 8, borderRadius: 4,
    marginTop: 4, flexShrink: 0,
  },
  historyItemName: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text,
  },
  historyItemMeta: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1,
  },
  historyItemAction: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2,
  },
  historyItemTime: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    marginTop: 2, flexShrink: 0,
  },

  // ── Snoozed section inside expanded panel ──
  snoozedPanelSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  snoozedPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  snoozedPanelHeaderText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  snoozedPanelCancelAll: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  snoozedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 5,
    overflow: 'hidden',
  },
  snoozedRowAccent: {
    width: 3,
    alignSelf: 'stretch',
    opacity: 0.5,
  },
  snoozedRowBody: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 2,
  },
  snoozedRowName: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  snoozedRowLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  snoozedRowCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  snoozedRowCountdownText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.gold,
  },
  snoozedMotivoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 2,
  },
  snoozedMotivoText: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    fontStyle: 'italic', flex: 1,
  },
  snoozedRowCancel: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  // ── Snoozed indicator pill ──
  snoozedPillContainer: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    bottom: 90,
    zIndex: 998,
  } as any,
  snoozedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryDark,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  snoozedPillText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
});
