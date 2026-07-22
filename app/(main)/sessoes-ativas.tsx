import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Platform, TextInput, Modal,
  ActivityIndicator, KeyboardAvoidingView, Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { useRealtimeSocket } from '@/hooks/useRealtimeSocket';
import { SkeletonPage } from '@/components/Skeleton';
import { webAlert } from '@/utils/webAlert';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionEntry {
  userId:   string;
  role:     string;
  email:    string;
  nome:     string;
  ip:       string;
  device:   string;
  loginAt:  number;
  lastSeen: number;
  online:   boolean;
}

interface BannedUser {
  id:               string;
  nome:             string;
  email:            string;
  role:             string;
  motivoBanimento:  string | null;
  banidoEm:         string | null;
  banidoPor:        string | null;
}

interface ActivityLogEntry {
  id:       string;
  type:     'login' | 'logout' | 'ban' | 'unban';
  userId:   string;
  nome:     string;
  email:    string;
  role:     string;
  avatar:   string;
  ip:       string;
  device:   string;
  ts:       number;
  byEmail?: string;
  motivo?:  string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO', pca: 'PCA', admin: 'Administrador', director: 'Director',
  chefe_secretaria: 'Chefe Secretaria', secretaria: 'Secretaria',
  professor: 'Professor', financeiro: 'Financeiro', rh: 'Recursos Humanos',
  pedagogico: 'Pedagógico', aluno: 'Aluno', encarregado: 'Encarregado',
};

const ROLE_COLORS: Record<string, string> = {
  ceo: '#DC2626', pca: '#7C3AED', admin: '#2563EB', director: '#0891B2',
  chefe_secretaria: '#D97706', secretaria: '#059669', professor: '#0EA5E9',
  financeiro: '#16A34A', rh: '#9333EA', pedagogico: '#F59E0B',
  aluno: '#6B7280', encarregado: '#64748B',
};

const EVENT_CONFIG: Record<ActivityLogEntry['type'], { label: string; icon: string; color: string }> = {
  login:  { label: 'Entrou',    icon: 'log-in-outline',       color: Colors.success },
  logout: { label: 'Saiu',      icon: 'log-out-outline',      color: Colors.warning },
  ban:    { label: 'Suspenso',  icon: 'ban-outline',          color: Colors.danger },
  unban:  { label: 'Reactivado',icon: 'checkmark-circle-outline', color: '#06B6D4' },
};

type CategoryKey = 'todos' | 'gestao' | 'professores' | 'alunos' | 'encarregados' | 'banidos' | 'actividade';

const CATEGORIES: { key: CategoryKey; label: string; icon: string; roles?: string[] }[] = [
  { key: 'todos',        label: 'Todos',        icon: 'people-outline' },
  { key: 'gestao',       label: 'Gestão',       icon: 'shield-checkmark-outline',
    roles: ['ceo','pca','admin','director','chefe_secretaria','secretaria','financeiro','rh','pedagogico'] },
  { key: 'professores',  label: 'Professores',  icon: 'school-outline',       roles: ['professor'] },
  { key: 'alunos',       label: 'Alunos',       icon: 'person-outline',       roles: ['aluno'] },
  { key: 'encarregados', label: 'Encarregados', icon: 'people-circle-outline', roles: ['encarregado'] },
  { key: 'banidos',      label: 'Banidos',      icon: 'ban-outline' },
  { key: 'actividade',   label: 'Actividade',   icon: 'pulse-outline' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 5)  return 'Agora';
  if (diff < 60) return `${diff}s atrás`;
  const min = Math.floor(diff / 60);
  if (min < 60)  return `${min} min`;
  return `${Math.floor(min / 60)}h`;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(str: string | null): string {
  if (!str) return '—';
  return new Date(str).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getInitials(nome: string): string {
  const p = nome.trim().split(' ').filter(Boolean);
  if (!p.length) return '?';
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ─── Activity Avatar ──────────────────────────────────────────────────────────

function ActivityAvatar({ entry }: { entry: ActivityLogEntry }) {
  const [imgErr, setImgErr] = useState(false);
  const rc = ROLE_COLORS[entry.role] ?? Colors.textMuted;
  const cfg = EVENT_CONFIG[entry.type];

  return (
    <View style={actv.avatarWrap}>
      {entry.avatar && !imgErr ? (
        <Image
          source={{ uri: entry.avatar }}
          style={[actv.avatarImg, { borderColor: rc + '55' }]}
          onError={() => setImgErr(true)}
        />
      ) : (
        <View style={[actv.avatarFallback, { backgroundColor: rc + '22', borderColor: rc + '44' }]}>
          <Text style={[actv.avatarInitials, { color: rc }]}>{getInitials(entry.nome || entry.email)}</Text>
        </View>
      )}
      <View style={[actv.eventDot, { backgroundColor: cfg.color }]}>
        <Ionicons name={cfg.icon as any} size={8} color="#fff" />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SessoesAtivasScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = user?.role ?? '';

  const [sessions,    setSessions]    = useState<SessionEntry[]>([]);
  const [banidos,     setBanidos]     = useState<BannedUser[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityLogEntry[]>([]);
  const [total,       setTotal]       = useState(0);
  const [online,      setOnline]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<CategoryKey>('todos');

  // action states
  const [removing,  setRemoving]  = useState<string | null>(null);
  const [banning,   setBanning]   = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<string | null>(null);

  // ban modal
  const [banModal,  setBanModal]  = useState<SessionEntry | null>(null);
  const [banMotivo, setBanMotivo] = useState('');

  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsConnectedRef      = useRef(false);

  const canAction = ['ceo', 'pca', 'admin'].includes(role);
  const canView   = ['ceo', 'pca', 'admin', 'director'].includes(role);

  const loadActivity = useCallback(async () => {
    try {
      const res = await api.get<{ events: ActivityLogEntry[] }>('/api/sessoes/actividade');
      setActivityEvents(res?.events ?? []);
    } catch { /* silencioso */ }
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [sesRes, banRes] = await Promise.all([
        api.get<{ sessions: SessionEntry[]; total: number; online: number }>('/api/sessoes/ativas'),
        canView ? api.get<{ banidos: BannedUser[] }>('/api/sessoes/banidos').catch(() => ({ banidos: [] })) : Promise.resolve({ banidos: [] }),
      ]);
      setSessions(sesRes?.sessions ?? []);
      setTotal(sesRes?.total ?? 0);
      setOnline(sesRes?.online ?? 0);
      setBanidos(banRes?.banidos ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView]);

  // ── WebSocket real-time updates ───────────────────────────────────────────
  useRealtimeSocket(user?.role, useCallback((event) => {
    if (event.type === 'connected') {
      wsConnectedRef.current = true;
    } else if (event.type === 'sessions_updated') {
      load(true);
    } else if (event.type === 'activity_event') {
      const entry = event.event as ActivityLogEntry | undefined;
      if (entry) {
        setActivityEvents(prev => {
          const exists = prev.some(e => e.id === entry.id || (e.ts === entry.ts && e.userId === entry.userId));
          if (exists) return prev;
          return [entry, ...prev].slice(0, 20);
        });
      }
    }
  }, [load]));

  useEffect(() => {
    load();
    loadActivity();
    // Fallback polling — 60s (WS handles real-time updates when connected)
    intervalRef.current         = setInterval(() => load(true), 60_000);
    activityIntervalRef.current = setInterval(() => loadActivity(), 30_000);
    return () => {
      if (intervalRef.current)         clearInterval(intervalRef.current);
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, [load, loadActivity]);

  // ── Counts per category ────────────────────────────────────────────────────

  function getFilteredSessions(cat: CategoryKey): SessionEntry[] {
    if (cat === 'todos' || cat === 'actividade') return sessions;
    if (cat === 'banidos')      return [];
    const catDef = CATEGORIES.find(c => c.key === cat);
    if (!catDef?.roles)        return sessions;
    return sessions.filter(s => catDef.roles!.includes(s.role));
  }

  function getCategoryCount(cat: CategoryKey): number {
    if (cat === 'banidos')    return banidos.length;
    if (cat === 'actividade') return activityEvents.length;
    return getFilteredSessions(cat).length;
  }

  function getCategoryOnline(cat: CategoryKey): number {
    if (cat === 'banidos' || cat === 'actividade') return 0;
    return getFilteredSessions(cat).filter(s => s.online).length;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function confirmForceLogout(s: SessionEntry) {
    const msg = `Tem a certeza que deseja encerrar a sessão de "${s.nome || s.email}" (${ROLE_LABELS[s.role] ?? s.role})?`;
    webAlert('Encerrar Sessão', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: () => doForceLogout(s.userId) },
    ]);
  }

  async function doForceLogout(userId: string) {
    setRemoving(userId);
    try {
      await api.delete(`/api/sessoes/ativas/${userId}`);
      setSessions(prev => {
        const next = prev.filter(s => s.userId !== userId);
        setTotal(next.length);
        setOnline(next.filter(s => s.online).length);
        return next;
      });
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Não foi possível encerrar a sessão.');
    } finally { setRemoving(null); }
  }

  function openBanModal(s: SessionEntry) {
    setBanMotivo('');
    setBanModal(s);
  }

  async function doBan() {
    if (!banModal) return;
    setBanning(banModal.userId);
    try {
      await api.put(`/api/sessoes/banir/${banModal.userId}`, { motivo: banMotivo });
      setSessions(prev => {
        const next = prev.filter(s => s.userId !== banModal.userId);
        setTotal(next.length);
        setOnline(next.filter(s => s.online).length);
        return next;
      });
      setBanidos(prev => [{
        id: banModal.userId, nome: banModal.nome, email: banModal.email,
        role: banModal.role, motivoBanimento: banMotivo || null,
        banidoEm: new Date().toISOString(), banidoPor: user?.email ?? null,
      }, ...prev]);
      setBanModal(null);
      if (activeTab !== 'banidos') setActiveTab('banidos');
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Não foi possível suspender a conta.');
    } finally { setBanning(null); }
  }

  async function doUnban(bu: BannedUser) {
    const msg = `Tem a certeza que deseja reactivar a conta de "${bu.nome || bu.email}"?`;
    const proceed = await new Promise<boolean>(res =>
      webAlert('Reactivar Conta', msg, [
        { text: 'Cancelar', style: 'cancel', onPress: () => res(false) },
        { text: 'Reactivar', onPress: () => res(true) },
      ])
    );
    if (!proceed) return;
    setUnbanning(bu.id);
    try {
      await api.put(`/api/sessoes/desbanir/${bu.id}`, {});
      setBanidos(prev => prev.filter(b => b.id !== bu.id));
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Não foi possível reactivar a conta.');
    } finally { setUnbanning(null); }
  }

  // ─── Access guard ──────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <TopBar title="Controlo Online" />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Acesso Restrito</Text>
          <Text style={styles.emptyText}>Apenas CEO, PCA, Administrador e Director podem ver esta área.</Text>
        </View>
      </View>
    );
  }

  const displayedSessions = getFilteredSessions(activeTab);

  if (loading) return <SkeletonPage variant="list" tabs={3} />;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom }]}>
      <TopBar title="Controlo Online" />

      {/* ── Summary bar ── */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: Colors.success }]} />
          <Text style={[styles.summaryNum, { color: Colors.success }]}>{online}</Text>
          <Text style={styles.summaryLbl}>online</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: Colors.warning }]} />
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>{total - online}</Text>
          <Text style={styles.summaryLbl}>inactivos</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: Colors.danger }]} />
          <Text style={[styles.summaryNum, { color: Colors.danger }]}>{banidos.length}</Text>
          <Text style={styles.summaryLbl}>banidos</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => load(true)} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Category tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {CATEGORIES.map(cat => {
          const count   = getCategoryCount(cat.key);
          const onlineC = getCategoryOnline(cat.key);
          const active  = activeTab === cat.key;
          const isBan   = cat.key === 'banidos';
          const tabColor = isBan ? Colors.danger : Colors.accent;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.tab, active && { borderBottomColor: tabColor, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(cat.key)}
            >
              <Ionicons
                name={cat.icon as any}
                size={15}
                color={active ? tabColor : Colors.textMuted}
              />
              <Text style={[styles.tabLabel, active && { color: tabColor }]}>{cat.label}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: active ? tabColor : Colors.textMuted }]}>
                  <Text style={styles.tabBadgeText}>{count}</Text>
                </View>
              )}
              {onlineC > 0 && (
                <View style={[styles.tabOnlineDot, { backgroundColor: Colors.success }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.accent} />}
      >
        {loading && !refreshing && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={22} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Banidos tab ── */}
        {activeTab === 'banidos' && !loading && (
          <>
            {banidos.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="checkmark-circle-outline" size={52} color={Colors.success} />
                <Text style={styles.emptyTitle}>Nenhuma conta suspensa</Text>
                <Text style={styles.emptyText}>Não há utilizadores banidos neste momento.</Text>
              </View>
            ) : (
              banidos.map(bu => {
                const rc = ROLE_COLORS[bu.role] ?? Colors.textMuted;
                return (
                  <View key={bu.id} style={[styles.sessionCard, { borderLeftColor: Colors.danger, borderLeftWidth: 3 }]}>
                    <View style={[styles.onlineStrip, { backgroundColor: Colors.danger }]} />
                    <View style={styles.cardBody}>
                      <View style={[styles.avatar, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '55' }]}>
                        <Ionicons name="ban-outline" size={20} color={Colors.danger} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.sessionName}>{bu.nome || '(sem nome)'}</Text>
                        <Text style={styles.sessionEmail}>{bu.email}</Text>
                        <View style={[styles.roleBadge, { backgroundColor: rc + '18', borderColor: rc + '44' }]}>
                          <Text style={[styles.roleText, { color: rc }]}>{ROLE_LABELS[bu.role] ?? bu.role}</Text>
                        </View>
                        {bu.motivoBanimento && (
                          <View style={styles.motivoBox}>
                            <Ionicons name="warning-outline" size={12} color={Colors.warning} />
                            <Text style={styles.motivoText}>{bu.motivoBanimento}</Text>
                          </View>
                        )}
                        <Text style={styles.detailText}>
                          Suspenso em {formatDate(bu.banidoEm)}
                          {bu.banidoPor ? ` por ${bu.banidoPor}` : ''}
                        </Text>
                      </View>
                      {canAction && (
                        <TouchableOpacity
                          style={[styles.unbanBtn, unbanning === bu.id && { opacity: 0.5 }]}
                          onPress={() => doUnban(bu)}
                          disabled={unbanning === bu.id}
                        >
                          {unbanning === bu.id
                            ? <ActivityIndicator size="small" color={Colors.success} />
                            : <>
                                <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                                <Text style={styles.unbanBtnText}>Reactivar</Text>
                              </>
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── Activity log panel ── */}
        {activeTab === 'actividade' && !loading && (
          <>
            <View style={actv.header}>
              <Ionicons name="pulse-outline" size={16} color={Colors.accent} />
              <Text style={actv.headerTitle}>Actividade recente</Text>
              <View style={actv.liveChip}>
                <View style={actv.liveDot} />
                <Text style={actv.liveText}>AO VIVO</Text>
              </View>
            </View>

            {activityEvents.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="pulse-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Sem actividade</Text>
                <Text style={styles.emptyText}>Os eventos de login, logout, suspensão e reactivação aparecerão aqui.</Text>
              </View>
            ) : (
              activityEvents.map((ev, idx) => {
                const cfg = EVENT_CONFIG[ev.type];
                const rc  = ROLE_COLORS[ev.role] ?? Colors.textMuted;
                return (
                  <View key={ev.id} style={actv.card}>
                    {/* Left accent strip */}
                    <View style={[actv.strip, { backgroundColor: cfg.color }]} />

                    <View style={actv.inner}>
                      <ActivityAvatar entry={ev} />

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        {/* Name + event badge */}
                        <View style={actv.topRow}>
                          <Text style={actv.name} numberOfLines={1}>{ev.nome || ev.email}</Text>
                          <View style={[actv.eventBadge, { backgroundColor: cfg.color + '22', borderColor: cfg.color + '55' }]}>
                            <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                            <Text style={[actv.eventBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                        </View>

                        <Text style={actv.email} numberOfLines={1}>{ev.email}</Text>

                        {/* Role + time */}
                        <View style={actv.metaRow}>
                          <View style={[actv.roleBadge, { backgroundColor: rc + '18', borderColor: rc + '44' }]}>
                            <Text style={[actv.roleText, { color: rc }]}>{ROLE_LABELS[ev.role] ?? ev.role}</Text>
                          </View>
                          <Text style={actv.timeAgo}>{formatTime(ev.ts)}</Text>
                        </View>

                        {/* Device + IP */}
                        {(ev.device || ev.ip) ? (
                          <View style={actv.detailRow}>
                            {ev.device ? (
                              <View style={actv.detailItem}>
                                <Ionicons name="phone-portrait-outline" size={10} color={Colors.textMuted} />
                                <Text style={actv.detailText}>{ev.device}</Text>
                              </View>
                            ) : null}
                            {ev.ip ? (
                              <View style={actv.detailItem}>
                                <Ionicons name="globe-outline" size={10} color={Colors.textMuted} />
                                <Text style={actv.detailText}>{ev.ip}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        {/* byEmail */}
                        {ev.byEmail ? (
                          <View style={actv.byRow}>
                            <Ionicons name="person-outline" size={10} color={Colors.textMuted} />
                            <Text style={actv.byText}>por {ev.byEmail}</Text>
                          </View>
                        ) : null}

                        {/* motivo */}
                        {ev.motivo ? (
                          <View style={actv.motivoBox}>
                            <Ionicons name="alert-circle-outline" size={12} color={Colors.warning} />
                            <Text style={actv.motivoText}>{ev.motivo}</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Time badge */}
                      <Text style={actv.timeBadge}>{formatDateTime(ev.ts)}</Text>
                    </View>
                  </View>
                );
              })
            )}

            <View style={styles.refreshNote}>
              <Ionicons name="refresh-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.refreshNoteText}>Actualizado automaticamente cada 10 s</Text>
            </View>
          </>
        )}

        {/* ── Sessions list ── */}
        {activeTab !== 'banidos' && activeTab !== 'actividade' && !loading && (
          <>
            {displayedSessions.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="people-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhuma sessão</Text>
                <Text style={styles.emptyText}>Nenhum utilizador desta categoria está registado.</Text>
              </View>
            ) : (
              displayedSessions.map(session => {
                const rc     = ROLE_COLORS[session.role] ?? Colors.accent;
                const isMe   = session.userId === user?.id;
                const initials = getInitials(session.nome || session.email);
                return (
                  <View key={session.userId} style={[styles.sessionCard, session.online && styles.sessionCardOnline]}>
                    <View style={[styles.onlineStrip, { backgroundColor: session.online ? Colors.success : Colors.warning }]} />

                    <View style={styles.cardBody}>
                      {/* Avatar */}
                      <View style={[styles.avatar, { backgroundColor: rc + '22', borderColor: rc + '55' }]}>
                        <Text style={[styles.avatarText, { color: rc }]}>{initials}</Text>
                        <View style={[styles.onlineDot, { backgroundColor: session.online ? Colors.success : Colors.warning }]} />
                      </View>

                      {/* Info */}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.nameRow}>
                          <Text style={styles.sessionName} numberOfLines={1}>{session.nome || '(sem nome)'}</Text>
                          {isMe && <View style={styles.meBadge}><Text style={styles.meBadgeText}>EU</Text></View>}
                          <View style={[styles.onlinePill, { backgroundColor: session.online ? Colors.success + '22' : Colors.warning + '22' }]}>
                            <View style={[styles.onlinePillDot, { backgroundColor: session.online ? Colors.success : Colors.warning }]} />
                            <Text style={[styles.onlinePillText, { color: session.online ? Colors.success : Colors.warning }]}>
                              {session.online ? 'Online' : formatTime(session.lastSeen)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.sessionEmail} numberOfLines={1}>{session.email}</Text>
                        <View style={styles.metaRow}>
                          <View style={[styles.roleBadge, { backgroundColor: rc + '18', borderColor: rc + '44' }]}>
                            <Text style={[styles.roleText, { color: rc }]}>{ROLE_LABELS[session.role] ?? session.role}</Text>
                          </View>
                          <View style={styles.detailItem}>
                            <Ionicons name="phone-portrait-outline" size={10} color={Colors.textMuted} />
                            <Text style={styles.detailText}>{session.device}</Text>
                          </View>
                          {session.ip ? (
                            <View style={styles.detailItem}>
                              <Ionicons name="globe-outline" size={10} color={Colors.textMuted} />
                              <Text style={styles.detailText}>{session.ip}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.detailItem}>
                          <Ionicons name="time-outline" size={10} color={Colors.textMuted} />
                          <Text style={styles.detailText}>Login: {formatDateTime(session.loginAt)}</Text>
                        </View>
                      </View>

                      {/* Actions */}
                      {canAction && !isMe && (
                        <View style={styles.actionsCol}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnLogout, removing === session.userId && { opacity: 0.5 }]}
                            onPress={() => confirmForceLogout(session)}
                            disabled={removing === session.userId}
                          >
                            {removing === session.userId
                              ? <ActivityIndicator size="small" color={Colors.warning} />
                              : <Ionicons name="log-out-outline" size={16} color={Colors.warning} />
                            }
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnBan]}
                            onPress={() => openBanModal(session)}
                          >
                            <Ionicons name="ban-outline" size={16} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.legendText}>Online (activo nos últimos 5 min)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
                <Text style={styles.legendText}>Inactivo (até 30 min)</Text>
              </View>
            </View>
            <View style={styles.refreshNote}>
              <Ionicons name="refresh-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.refreshNoteText}>Actualizado automaticamente cada 30 s</Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Ban modal ── */}
      <Modal visible={!!banModal} transparent animationType="fade" onRequestClose={() => setBanModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalIconRow}>
                  <Ionicons name="ban-outline" size={22} color={Colors.danger} />
                  <Text style={styles.modalTitle}>Suspender Conta</Text>
                </View>
                <TouchableOpacity onPress={() => setBanModal(null)}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {banModal && (
                <View style={styles.modalTarget}>
                  <View style={[styles.avatar, { backgroundColor: ROLE_COLORS[banModal.role] + '22', borderColor: ROLE_COLORS[banModal.role] + '55' }]}>
                    <Text style={[styles.avatarText, { color: ROLE_COLORS[banModal.role] }]}>
                      {getInitials(banModal.nome || banModal.email)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.modalTargetName}>{banModal.nome || '(sem nome)'}</Text>
                    <Text style={styles.sessionEmail}>{banModal.email}</Text>
                    <Text style={[styles.roleText, { color: ROLE_COLORS[banModal.role] }]}>
                      {ROLE_LABELS[banModal.role] ?? banModal.role}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.modalWarning}>
                <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                <Text style={styles.modalWarningText}>
                  A conta será imediatamente suspensa. O utilizador não conseguirá fazer login enquanto não for reactivado.
                </Text>
              </View>

              <Text style={styles.modalFieldLabel}>Motivo da suspensão (opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={banMotivo}
                onChangeText={setBanMotivo}
                placeholder="Ex: Actividade suspeita, acesso indevido..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBanModal(null)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBanBtn, banning && { opacity: 0.6 }]}
                  onPress={doBan}
                  disabled={!!banning}
                >
                  {banning
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="ban-outline" size={15} color="#fff" />
                        <Text style={styles.modalBanText}>Suspender Conta</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  scroll:      { flex: 1 },
  scrollContent: { padding: 14, gap: 10, paddingBottom: 32 },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 10,
  },
  summaryItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryDot:     { width: 8, height: 8, borderRadius: 4 },
  summaryNum:     { fontSize: 16, fontFamily: 'Inter_700Bold' },
  summaryLbl:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  summaryDivider: { width: 1, height: 18, backgroundColor: Colors.border },
  refreshBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Tabs
  tabsScroll:   { backgroundColor: Colors.surface, maxHeight: 48 },
  tabsContent:  { paddingHorizontal: 12, gap: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 13,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabLabel:     { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  tabBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  tabOnlineDot: { width: 7, height: 7, borderRadius: 4 },

  // Cards
  sessionCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  sessionCardOnline: {
    borderColor: Colors.success + '44',
    shadowColor: Colors.success, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  onlineStrip: { height: 3, width: '100%' },
  cardBody:   { flexDirection: 'row', alignItems: 'flex-start', padding: 13 },

  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, position: 'relative', flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.surface,
  },

  nameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  sessionName: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  sessionEmail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  onlinePillDot: { width: 6, height: 6, borderRadius: 3 },
  onlinePillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 },
  roleBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  roleText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  meBadge: {
    backgroundColor: Colors.accent + '22', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  meBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.accent },

  actionsCol: { flexDirection: 'column', gap: 6, alignItems: 'flex-end', paddingLeft: 8 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  actionBtnLogout: { backgroundColor: Colors.warning + '11', borderColor: Colors.warning + '44' },
  actionBtnBan:    { backgroundColor: Colors.danger  + '11', borderColor: Colors.danger  + '44' },

  // Unban
  unbanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '44',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  unbanBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success },

  // Motivo box
  motivoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: Colors.warning + '11', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.warning + '33', marginTop: 5,
  },
  motivoText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1 },

  // Legend / refresh note
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  refreshNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border, alignSelf: 'flex-start',
  },
  refreshNoteText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // States
  centered:  { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyText:  { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 280, lineHeight: 20 },
  errorCard: {
    backgroundColor: Colors.danger + '11', borderWidth: 1, borderColor: Colors.danger + '33',
    borderRadius: 12, padding: 16, alignItems: 'center', gap: 8,
  },
  errorText:    { color: Colors.danger, fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' },
  retryBtn:     { backgroundColor: Colors.danger, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  retryBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  // Ban modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.backgroundCard, borderRadius: 20,
    width: '100%', maxWidth: 420,
    borderWidth: 1, borderColor: Colors.border, padding: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  modalIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle:  { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalTarget: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTargetName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warning + '11', borderRadius: 10,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.warning + '33',
  },
  modalWarningText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, lineHeight: 18 },
  modalFieldLabel:  { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  modalInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12, color: Colors.text,
    fontFamily: 'Inter_400Regular', fontSize: 13, minHeight: 80,
    textAlignVertical: 'top', marginBottom: 16,
  },
  modalBtns:       { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  modalBanBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.danger,
  },
  modalBanText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});

// ─── Activity panel styles ────────────────────────────────────────────────────

const actv = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.danger + '18', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.danger + '44',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.danger,
  },
  liveText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.danger, letterSpacing: 0.5 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    flexDirection: 'row',
  },
  strip: { width: 4 },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', padding: 12 },

  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatarImg: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2,
  },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  avatarInitials: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  eventDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surface,
  },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  email: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  eventBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1,
  },
  eventBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 },
  roleBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  roleText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  timeAgo:  { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  byRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  byText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  motivoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: Colors.warning + '11', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.warning + '33', marginTop: 5,
  },
  motivoText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1 },

  timeBadge: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingLeft: 8, alignSelf: 'flex-start' },
});
