import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, ScrollView, Animated, Platform, Dimensions, PanResponder } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useNotificacoes, TipoNotificacao, Notificacao } from '@/context/NotificacoesContext';
import { tempoRelativo, grupoData, dataLegivel } from '@/lib/tempoRelativo';
import { webAlert } from '@/utils/webAlert';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { api } from '@/lib/api';
import PaginationBar from '@/components/PaginationBar';
import { useBreakpoint } from '@/hooks/useBreakpoint';

// ── Tipo config ────────────────────────────────────────────────────────────────
const TIPO_CONFIG_MAP: Record<string, {
  icon: string; iconLib: 'ion' | 'mci';
  color: string; bg: string; label: string; badgeColor: string;
}> = {
  urgente:              { icon: 'alert-circle',          iconLib: 'ion', color: '#FF4757', bg: '#FF475718', label: 'Urgente',    badgeColor: '#FF4757' },
  aviso:                { icon: 'alert-decagram-outline', iconLib: 'mci', color: '#F39C12', bg: '#F39C1218', label: 'Aviso',      badgeColor: '#F39C12' },
  info:                 { icon: 'information-circle',     iconLib: 'ion', color: '#4A90D9', bg: '#4A90D918', label: 'Info',       badgeColor: '#4A90D9' },
  sucesso:              { icon: 'checkmark-circle',       iconLib: 'ion', color: '#22C47A', bg: '#22C47A18', label: 'Sucesso',    badgeColor: '#22C47A' },
  reabertura_aprovada:  { icon: 'lock-open',              iconLib: 'ion', color: '#C89A2A', bg: '#C89A2A18', label: 'Reabertura', badgeColor: '#C89A2A' },
};
const TIPO_CONFIG_DEFAULT = { icon: 'notifications', iconLib: 'ion' as const, color: '#4A90D9', bg: '#4A90D918', label: 'Info', badgeColor: '#4A90D9' };
function getTipoConfig(tipo: string) { return TIPO_CONFIG_MAP[tipo] ?? TIPO_CONFIG_DEFAULT; }

const FILTROS: { key: string; label: string; icon: string }[] = [
  { key: 'todas',               label: 'Todas',      icon: 'layers-outline' },
  { key: 'nao_lidas',           label: 'Não lidas',  icon: 'ellipse' },
  { key: 'urgente',             label: 'Urgente',    icon: 'alert-circle-outline' },
  { key: 'aviso',               label: 'Aviso',      icon: 'warning-outline' },
  { key: 'info',                label: 'Info',       icon: 'information-circle-outline' },
  { key: 'sucesso',             label: 'Sucesso',    icon: 'checkmark-circle-outline' },
  { key: 'reabertura_aprovada', label: 'Reabertura', icon: 'lock-open-outline' },
];

export type NotificacaoView = Notificacao & { _repetidas?: number };

const SOM_KEY = '@siga_notif_som';
function getSomPref(): boolean {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem(SOM_KEY) !== '0'; } catch {}
  return true;
}
function setSomPref(v: boolean) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SOM_KEY, v ? '1' : '0'); } catch {}
}

function groupByDate(items: Notificacao[]): { title: string; data: NotificacaoView[] }[] {
  const groups: Record<string, Notificacao[]> = {};
  items.forEach(n => {
    const key = grupoData(n.createdAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  return Object.entries(groups).map(([title, data]) => {
    const seen = new Map<string, NotificacaoView>();
    for (const n of data) {
      const k = `${n.tipo}::${n.titulo}`;
      if (seen.has(k)) { seen.get(k)!._repetidas = (seen.get(k)!._repetidas || 0) + 1; }
      else { seen.set(k, { ...n }); }
    }
    return { title, data: Array.from(seen.values()) };
  });
}

// ── Swipeable Row ──────────────────────────────────────────────────────────────
const SWIPE_REVEAL = 80;
const SWIPE_THRESHOLD = 36;

function SwipeableRow({ children, onDelete, onMarkRead, isRead, openRowRef }: {
  children: React.ReactNode; onDelete: () => void;
  onMarkRead?: () => void; isRead?: boolean;
  openRowRef: React.MutableRefObject<(() => void) | null>;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const nd = Platform.OS !== 'web';
  const onDeleteRef = useRef(onDelete);
  const onMarkReadRef = useRef(onMarkRead);
  const isReadRef = useRef(isRead);
  useEffect(() => { onDeleteRef.current = onDelete; onMarkReadRef.current = onMarkRead; isReadRef.current = isRead; });

  function snapClose(cb?: () => void) {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: nd, tension: 90, friction: 12 })
      .start(cb ? ({ finished }) => { if (finished) cb(); } : undefined);
  }
  function snapOpen() {
    if (openRowRef.current && openRowRef.current !== snapClose) openRowRef.current();
    isOpen.current = true;
    openRowRef.current = snapClose;
    Animated.spring(translateX, { toValue: -SWIPE_REVEAL, useNativeDriver: nd, tension: 90, friction: 12 }).start();
  }
  function triggerMarkRead() {
    Animated.spring(translateX, { toValue: SWIPE_REVEAL, useNativeDriver: nd, tension: 120, friction: 10 })
      .start(() => { snapClose(() => onMarkReadRef.current?.()); });
  }
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 6,
    onPanResponderGrant: () => { (translateX as any).stopAnimation(); },
    onPanResponderMove: (_, g) => {
      const base = isOpen.current ? -SWIPE_REVEAL : 0;
      const rawNext = base + g.dx;
      const next = isReadRef.current
        ? Math.max(-SWIPE_REVEAL, Math.min(0, rawNext))
        : Math.max(-SWIPE_REVEAL, Math.min(SWIPE_REVEAL, rawNext));
      translateX.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const base = isOpen.current ? -SWIPE_REVEAL : 0;
      const next = base + g.dx;
      if (!isReadRef.current && next > SWIPE_THRESHOLD) triggerMarkRead();
      else if (next < -SWIPE_THRESHOLD) snapOpen();
      else snapClose();
    },
    onPanResponderTerminate: () => snapClose(),
  })).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      {!isRead && (
        <View style={swipeStyles.readBack}>
          <View style={swipeStyles.readBtn}>
            <Ionicons name="checkmark-done" size={20} color="#fff" />
            <Text style={swipeStyles.readBtnText}>Lida</Text>
          </View>
        </View>
      )}
      <View style={swipeStyles.deleteBack}>
        <TouchableOpacity style={swipeStyles.deleteBtn} onPress={() => { snapClose(); onDeleteRef.current(); }} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={swipeStyles.deleteBtnText}>Apagar</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  readBack: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SWIPE_REVEAL, backgroundColor: '#22C47A', justifyContent: 'center', alignItems: 'center' },
  readBtn: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', gap: 3 },
  readBtnText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#fff', letterSpacing: 0.3 },
  deleteBack: { position: 'absolute', right: 0, top: 0, bottom: 0, width: SWIPE_REVEAL, backgroundColor: '#D94F4F', justifyContent: 'center', alignItems: 'center' },
  deleteBtn: { flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', gap: 3 },
  deleteBtnText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#fff', letterSpacing: 0.3 },
});

// ── Notification Item ──────────────────────────────────────────────────────────
function NotifItem({ item, onPress, onDelete }: {
  item: NotificacaoView; onPress: (n: Notificacao) => void; onDelete: (id: string) => void;
}) {
  const cfg = getTipoConfig(item.tipo);
  const isUnread = !item.lida;

  return (
    <TouchableOpacity
      style={[styles.item, isUnread && styles.itemUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.72}
    >
      {/* Accent bar esquerda */}
      {isUnread && <View style={[styles.unreadBar, { backgroundColor: cfg.color }]} />}

      {/* Ícone */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        {cfg.iconLib === 'ion'
          ? <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
          : <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />}
        {isUnread && <View style={[styles.iconUnreadDot, { backgroundColor: cfg.color }]} />}
      </View>

      {/* Conteúdo */}
      <View style={styles.itemBody}>
        {/* Linha superior: badge + tempo */}
        <View style={styles.itemTopRow}>
          <View style={[styles.badge, { backgroundColor: cfg.color + '20' }]}>
            <View style={[styles.badgeDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.itemTime}>{tempoRelativo(item.createdAt)}</Text>
        </View>

        {/* Título */}
        <Text style={[styles.itemTitle, isUnread && styles.itemTitleUnread]} numberOfLines={1}>
          {item.titulo}
        </Text>

        {/* Mensagem */}
        <Text style={styles.itemMsg} numberOfLines={2}>{item.mensagem}</Text>

        {/* Repetidas */}
        {item._repetidas && item._repetidas > 0 ? (
          <View style={styles.repetidasRow}>
            <View style={styles.repetidasBadge}>
              <Ionicons name="refresh-outline" size={9} color={Colors.textMuted} />
              <Text style={styles.repetidasText}>+{item._repetidas} repetida{item._repetidas === 1 ? '' : 's'} hoje</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Ações */}
      <View style={styles.itemActions}>
        {isUnread && <View style={[styles.unreadPing, { backgroundColor: cfg.color }]} />}
        <TouchableOpacity style={styles.delBtn} onPress={() => onDelete(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Mapa de rótulos ─────────────────────────────────────────────────────────────
const LINK_LABELS: Record<string, { label: string; icon: string }> = {
  'portal-estudante':   { label: 'Abrir Portal do Aluno',  icon: 'person-circle'       },
  'historico':          { label: 'Ver Histórico de Notas', icon: 'bar-chart'            },
  'horario':            { label: 'Ver Horário',             icon: 'calendar'             },
  'eventos':            { label: 'Ver Calendário',          icon: 'calendar-outline'     },
  'pagamentos':         { label: 'Ver Pagamentos',          icon: 'card'                 },
  'presencas':          { label: 'Ver Presenças',           icon: 'checkmark-circle'     },
  'portal-encarregado': { label: 'Abrir Portal do Enc.',   icon: 'people'               },
  'professor-hub':      { label: 'Ir para Professor Hub',  icon: 'school'               },
  'professor-pauta':    { label: 'Abrir Pauta',             icon: 'document-text'        },
};
function getLinkAction(link: string | null | undefined) {
  if (!link) return null;
  const key = Object.keys(LINK_LABELS).find(k => link.includes(k));
  return key ? LINK_LABELS[key] : { label: 'Ver detalhes', icon: 'arrow-forward-circle' };
}

// ── Modal de Detalhe ───────────────────────────────────────────────────────────
function DetalheModal({ notif, onClose, onDelete, onReload, router }: {
  notif: Notificacao | null; onClose: () => void;
  onDelete: (id: string) => void; onReload?: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [criandoAno, setCriandoAno] = useState(false);
  const screenW = Dimensions.get('window').width;
  const isWide  = screenW >= 768;

  useEffect(() => {
    if (notif) {
      const nd = Platform.OS !== 'web';
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: nd }),
        Animated.spring(slideAnim, { toValue: 0, tension: 68, friction: 11, useNativeDriver: nd }),
      ]).start();
    } else {
      slideAnim.setValue(400);
      fadeAnim.setValue(0);
    }
  }, [notif]);

  function handleClose() {
    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 160, useNativeDriver: nd }),
      Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: nd }),
    ]).start(() => onClose());
  }

  if (!notif) return null;
  const cfg = getTipoConfig(notif.tipo);
  const linkAction = getLinkAction(notif.link);
  const isAvisoProximoAno = /^Faltam\s+\d+\s+dias?\s+para o início do próximo ano lectivo/i.test(notif.titulo || '');

  async function criarProximoAno() {
    if (criandoAno) return;
    setCriandoAno(true);
    try {
      const r = await api.post<{ ano: { ano: string }; jaExistia: boolean; turmasCriadas: number }>(
        '/api/anos-academicos/criar-proximo', { copiarTurmas: true }
      );
      const msg = r.jaExistia
        ? `O ano lectivo ${r.ano.ano} já existia. ${r.turmasCriadas} turma(s) copiada(s).`
        : `Ano lectivo ${r.ano.ano} criado com sucesso. ${r.turmasCriadas} turma(s) copiada(s) do ano actual.`;
      webAlert('Ano lectivo criado', msg, [{ text: 'OK' }]);
      handleClose(); onReload?.();
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível criar o ano lectivo.'), [{ text: 'OK' }]);
    } finally { setCriandoAno(false); }
  }

  const horaFmt = new Date(notif.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const tempoFmt = tempoRelativo(notif.createdAt);

  function navigateLink() {
    handleClose();
    setTimeout(() => {
      try {
        const raw = String(notif!.link || '');
        const qIdx = raw.indexOf('?');
        if (qIdx >= 0) {
          const pathname = raw.slice(0, qIdx);
          const sp = new URLSearchParams(raw.slice(qIdx + 1));
          const params: Record<string, string> = {};
          sp.forEach((v, k) => { params[k] = v; });
          router.push({ pathname: pathname as any, params });
        } else { router.push(raw as any); }
      } catch {}
    }, 220);
  }

  const panelStyle = isWide
    ? [styles.detalheBox, styles.detalheBoxDesktop, { transform: [{ translateY: slideAnim }] }]
    : [styles.detalheBox, styles.detalheBoxMobile, { transform: [{ translateY: slideAnim }] }];

  return (
    <Modal visible={!!notif} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, isWide ? styles.overlayCenter : styles.overlayBottom, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={panelStyle as any}>

          {!isWide && (
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandlePill} />
            </View>
          )}

          {/* Faixa colorida + gradiente */}
          <View style={[styles.detalheAccent, { backgroundColor: cfg.color }]} />

          {/* Header */}
          <View style={styles.detalheHeader}>
            <View style={[styles.detalheIconWrap, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
              {cfg.iconLib === 'ion'
                ? <Ionicons name={cfg.icon as any} size={28} color={cfg.color} />
                : <MaterialCommunityIcons name={cfg.icon as any} size={28} color={cfg.color} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[styles.badge, { backgroundColor: cfg.color + '20', alignSelf: 'flex-start', marginBottom: 6 }]}>
                <View style={[styles.badgeDot, { backgroundColor: cfg.color }]} />
                <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <Text style={styles.detalheTitulo} numberOfLines={3}>{notif.titulo}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.detalheClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Meta */}
          <View style={styles.detalheMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.metaText}>{tempoFmt}</Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.metaChip}>
              <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.metaText}>{horaFmt}</Text>
            </View>
            {notif.enviadoPor ? (
              <>
                <View style={styles.metaDot} />
                <View style={[styles.metaChip, { flex: 1 }]}>
                  <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                  <Text style={[styles.metaText, { flex: 1 }]} numberOfLines={1}>{notif.enviadoPor}</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Mensagem */}
          <ScrollView style={styles.detalheMsgScroll} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.detalheMsgBox, { borderLeftColor: cfg.color }]}>
              <Text style={styles.detalheMsg}>{notif.mensagem}</Text>
            </View>
          </ScrollView>

          {/* Rodapé com acções */}
          <View style={styles.detalheFooter}>
            {isAvisoProximoAno && (
              <TouchableOpacity
                style={[styles.detalheBtnPrimary, { backgroundColor: Colors.success, opacity: criandoAno ? 0.7 : 1 }]}
                onPress={criarProximoAno} activeOpacity={0.85} disabled={criandoAno}
              >
                {criandoAno ? <AppLoader size={14} color="#fff" /> : <Ionicons name="add-circle" size={18} color="#fff" />}
                <Text style={styles.detalheBtnText}>{criandoAno ? 'A criar…' : 'Criar próximo ano agora'}</Text>
              </TouchableOpacity>
            )}
            {linkAction && !isAvisoProximoAno && (
              <TouchableOpacity
                style={[styles.detalheBtnPrimary, { backgroundColor: cfg.color }]}
                onPress={navigateLink} activeOpacity={0.82}
              >
                <Ionicons name={linkAction.icon as any} size={18} color="#fff" />
                <Text style={styles.detalheBtnText}>{linkAction.label}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.detalheSecondary}>
              <TouchableOpacity
                style={styles.detalheBtnSecondary}
                onPress={() => { onDelete(notif.id); handleClose(); }} activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                <Text style={[styles.detalheBtnSecText, { color: Colors.danger }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Push Banner ────────────────────────────────────────────────────────────────
function PushBanner() {
  const { pushState, isSupported, subscribe, unsubscribe } = usePushNotifications();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);

  if (!isSupported || Platform.OS !== 'web' || dismissed) return null;

  if (pushState === 'granted') {
    return (
      <View style={styles.pushCard}>
        <View style={[styles.pushCardIcon, { backgroundColor: Colors.success + '20' }]}>
          <Ionicons name="notifications" size={16} color={Colors.success} />
        </View>
        <View style={styles.pushCardBody}>
          <Text style={styles.pushCardTitle}>Push <Text style={{ color: Colors.success }}>activas</Text></Text>
          <Text style={styles.pushCardSub}>Receberá alertas mesmo com o browser fechado.</Text>
        </View>
        <TouchableOpacity
          style={[styles.pushCardBtn, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '40' }]}
          onPress={async () => { setBusy(true); const r = await unsubscribe(); setMsg(r.message); setBusy(false); setTimeout(() => setMsg(''), 3000); }}
          disabled={busy}
        >
          {busy ? <AppLoader size={12} color={Colors.danger} /> : <Ionicons name="notifications-off-outline" size={13} color={Colors.danger} />}
          <Text style={[styles.pushCardBtnText, { color: Colors.danger }]}>Desativar</Text>
        </TouchableOpacity>
        {msg ? <Text style={styles.pushMsg}>{msg}</Text> : null}
      </View>
    );
  }

  if (pushState === 'denied') {
    return (
      <View style={[styles.pushCard, { borderColor: Colors.danger + '30' }]}>
        <View style={[styles.pushCardIcon, { backgroundColor: Colors.danger + '15' }]}>
          <Ionicons name="notifications-off" size={16} color={Colors.danger} />
        </View>
        <Text style={[styles.pushCardSub, { flex: 1, color: Colors.textMuted }]}>
          Notificações bloqueadas. Active nas definições do browser.
        </Text>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  if (pushState === 'default') {
    return (
      <View style={[styles.pushCard, { borderColor: Colors.gold + '40', backgroundColor: Colors.gold + '08' }]}>
        <View style={[styles.pushCardIcon, { backgroundColor: Colors.gold + '20' }]}>
          <Ionicons name="notifications-outline" size={16} color={Colors.gold} />
        </View>
        <View style={styles.pushCardBody}>
          <Text style={styles.pushCardTitle}>Alertas em tempo real</Text>
          <Text style={styles.pushCardSub}>Receba notificações mesmo com o browser fechado.</Text>
        </View>
        <TouchableOpacity
          style={[styles.pushCardBtn, { backgroundColor: Colors.accent, borderColor: Colors.accent }]}
          onPress={async () => { setBusy(true); const r = await subscribe(); setMsg(r.message); setBusy(false); setTimeout(() => setMsg(''), 4000); }}
          disabled={busy}
        >
          {busy ? <AppLoader size={12} color="#fff" /> : <Ionicons name="notifications-outline" size={13} color="#fff" />}
          <Text style={[styles.pushCardBtnText, { color: '#fff' }]}>Ativar</Text>
        </TouchableOpacity>
        {msg ? <Text style={styles.pushMsg}>{msg}</Text> : null}
      </View>
    );
  }

  return null;
}

// ── Ecrã Principal ─────────────────────────────────────────────────────────────
export default function NotificacoesScreen() {
  const { notificacoes, unreadCount, marcarLida, marcarTodasLidas, deletarNotificacao, load } = useNotificacoes();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const [filtro, setFiltro] = useState('todas');
  const [selected, setSelected] = useState<Notificacao | null>(null);
  const [somAtivo, setSomAtivo] = useState<boolean>(getSomPref());
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const openRowRef = useRef<(() => void) | null>(null);

  const lastUnreadRef = React.useRef(unreadCount);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (somAtivo && unreadCount > lastUnreadRef.current) {
      try {
        const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; gain.gain.value = 0.05; osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 180);
      } catch {}
    }
    lastUnreadRef.current = unreadCount;
  }, [unreadCount, somAtivo]);

  const filtered = useMemo(() => notificacoes.filter(n => {
    if (filtro === 'todas') return true;
    if (filtro === 'nao_lidas') return !n.lida;
    return n.tipo === filtro;
  }), [notificacoes, filtro]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedFiltered = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);
  useEffect(() => { setCurrentPage(1); }, [filtro]);

  const grouped = useMemo(() => groupByDate(pagedFiltered), [pagedFiltered]);

  const flatData = useMemo(() => {
    const rows: ({ type: 'header'; title: string } | { type: 'item'; item: Notificacao })[] = [];
    grouped.forEach(g => {
      rows.push({ type: 'header', title: g.title });
      g.data.forEach(item => rows.push({ type: 'item', item }));
    });
    return rows;
  }, [grouped]);

  async function handlePress(n: Notificacao) { await marcarLida(n.id); setSelected(n); }
  function handleDelete(id: string) {
    webAlert('Remover notificação', 'Tem a certeza que pretende remover esta notificação?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deletarNotificacao(id) },
    ]);
  }
  function handleDeleteDirect(id: string) { deletarNotificacao(id); }

  // Filtra apenas os filtros com itens para mostrar
  const filtrosVisiveis = FILTROS.filter(f => {
    const cnt = f.key === 'nao_lidas' ? unreadCount
      : f.key === 'todas' ? notificacoes.length
      : notificacoes.filter(n => n.tipo === f.key).length;
    return f.key === 'todas' || filtro === f.key || cnt > 0;
  });

  function getCnt(key: string) {
    if (key === 'nao_lidas') return unreadCount;
    if (key === 'todas') return notificacoes.length;
    return notificacoes.filter(n => n.tipo === key).length;
  }

  return (
    <View style={styles.container}>
      <TopBar
        title="Notificações"
        subtitle={unreadCount > 0 ? `${unreadCount} por ler` : 'Tudo em dia'}
        rightAction={unreadCount > 0 ? { icon: 'checkmark-done-outline', onPress: marcarTodasLidas } : undefined}
      />

      <PushBanner />

      {/* ── Filtros ── */}
      <View style={styles.filtrosContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtrosRow}>
          {filtrosVisiveis.map(f => {
            const isActive = filtro === f.key;
            const cnt = getCnt(f.key);
            const tipoCfg = TIPO_CONFIG_MAP[f.key];
            const activeColor = f.key === 'nao_lidas' ? Colors.info : (tipoCfg?.color ?? Colors.accent);
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filtroBtn, isActive && [styles.filtroBtnActive, { borderColor: activeColor + '60', backgroundColor: activeColor + '18' }]]}
                onPress={() => setFiltro(f.key)}
                activeOpacity={0.72}
              >
                <Ionicons name={f.icon as any} size={13} color={isActive ? activeColor : Colors.textMuted} />
                <Text style={[styles.filtroText, isActive && [styles.filtroTextActive, { color: activeColor }]]}>
                  {f.label}
                </Text>
                {cnt > 0 && (
                  <View style={[styles.filtroCnt, isActive && { backgroundColor: activeColor + '30' }]}>
                    <Text style={[styles.filtroCntText, isActive && { color: activeColor }]}>{cnt > 99 ? '99+' : cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Barra de acções ── */}
      {filtered.length > 0 && (
        <View style={styles.actionsBar}>
          <Text style={styles.actionsCount}>
            {filtered.length === 1 ? '1 notificação' : `${filtered.length} notificações`}
          </Text>
          <View style={styles.actionsRight}>
            {unreadCount > 0 && filtro !== 'nao_lidas' && (
              <TouchableOpacity style={styles.actionChip} onPress={marcarTodasLidas} activeOpacity={0.7}>
                <Ionicons name="checkmark-done" size={12} color={Colors.info} />
                <Text style={[styles.actionChipText, { color: Colors.info }]}>Marcar todas</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionChip}
              onPress={() => { const novo = !somAtivo; setSomAtivo(novo); setSomPref(novo); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={somAtivo ? 'volume-medium-outline' : 'volume-mute-outline'}
                size={12}
                color={somAtivo ? Colors.textSecondary : Colors.textMuted}
              />
              <Text style={[styles.actionChipText, !somAtivo && { color: Colors.textMuted }]}>
                Som
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Lista ── */}
      {flatData.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIconWrap, filtro === 'nao_lidas' && { backgroundColor: Colors.success + '18' }]}>
            <Ionicons
              name={filtro === 'nao_lidas' ? 'checkmark-done-circle-outline' : 'notifications-off-outline'}
              size={44}
              color={filtro === 'nao_lidas' ? Colors.success : Colors.textMuted}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {filtro === 'nao_lidas' ? 'Tudo lido!' : 'Sem notificações'}
          </Text>
          <Text style={styles.emptyMsg}>
            {filtro === 'nao_lidas'
              ? 'Está em dia com todas as notificações.'
              : filtro === 'todas'
              ? 'Quando houver actividade, as notificações aparecerão aqui.'
              : `Não tem notificações do tipo "${FILTROS.find(f => f.key === filtro)?.label}".`}
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={flatData}
            keyExtractor={(row, i) => row.type === 'header' ? `h-${row.title}-${i}` : row.item.id}
            renderItem={({ item: row }) => {
              if (row.type === 'header') {
                return (
                  <View style={styles.groupHeader}>
                    <View style={styles.groupHeaderLine} />
                    <Text style={styles.groupHeaderText}>{row.title.toUpperCase()}</Text>
                    <View style={styles.groupHeaderLine} />
                  </View>
                );
              }
              return (
                <SwipeableRow
                  onDelete={() => handleDeleteDirect(row.item.id)}
                  onMarkRead={!row.item.lida ? () => marcarLida(row.item.id) : undefined}
                  isRead={!!row.item.lida}
                  openRowRef={openRowRef}
                >
                  <NotifItem item={row.item} onPress={handlePress} onDelete={handleDelete} />
                </SwipeableRow>
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
          <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </>
      )}

      <DetalheModal
        notif={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
        onReload={load}
        router={router}
      />
    </View>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Push Card ──────────────────────────────────────────────────────────────
  pushCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 12, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    flexWrap: 'wrap',
    ...Platform.select({
      web: { boxShadow: '0 2px 12px rgba(0,0,0,0.25)' as any },
      default: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    }),
  },
  pushCardIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pushCardBody: { flex: 1, minWidth: 0, gap: 1 },
  pushCardTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  pushCardSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  pushCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    flexShrink: 0,
  },
  pushCardBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pushMsg: { width: '100%', fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 4 },

  // ── Filtros ────────────────────────────────────────────────────────────────
  filtrosContainer: {
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  filtrosRow: { paddingHorizontal: 12, gap: 6, flexDirection: 'row', alignItems: 'center' },
  filtroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border,
  },
  filtroBtnActive: {},
  filtroText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  filtroTextActive: { fontFamily: 'Inter_600SemiBold' },
  filtroCnt: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filtroCntText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted },

  // ── Barra de acções ────────────────────────────────────────────────────────
  actionsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actionsCount: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionChipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  // ── Lista ──────────────────────────────────────────────────────────────────
  listContent: { paddingBottom: 40, paddingTop: 6 },

  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    marginTop: 2,
  },
  groupHeaderLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  groupHeaderText: {
    fontSize: 10, fontFamily: 'Inter_700Bold',
    color: Colors.textMuted, letterSpacing: 1.2,
  },

  // ── Item ───────────────────────────────────────────────────────────────────
  item: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 12, marginVertical: 3,
    borderRadius: 14,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  itemUnread: {
    backgroundColor: '#0F2A45',
    borderColor: 'rgba(74,144,217,0.22)',
  },
  unreadBar: { width: 3, alignSelf: 'stretch', flexShrink: 0 },
  iconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    margin: 12, flexShrink: 0,
    position: 'relative',
  },
  iconUnreadDot: {
    position: 'absolute', top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#0F2A45',
  },
  itemBody: { flex: 1, paddingVertical: 11, paddingRight: 6 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  badgeDot: { width: 5, height: 5, borderRadius: 3, marginRight: 4 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  itemTime: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginLeft: 'auto' as any },
  itemTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginBottom: 3, lineHeight: 18 },
  itemTitleUnread: { fontFamily: 'Inter_700Bold', color: Colors.text },
  itemMsg: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17 },

  repetidasRow: { flexDirection: 'row', marginTop: 6 },
  repetidasBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  repetidasText: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  itemActions: { alignItems: 'center', justifyContent: 'flex-start', paddingRight: 10, paddingTop: 12, gap: 10 },
  unreadPing: { width: 7, height: 7, borderRadius: 4 },
  delBtn: {
    padding: 4, borderRadius: 6,
    backgroundColor: Colors.backgroundElevated,
  },

  // ── Estado vazio ───────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, gap: 12 },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: Colors.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  emptyMsg: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },

  // ── Modal Detalhe ──────────────────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayCenter: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayBottom: { justifyContent: 'flex-end' },
  detalheBox: {
    backgroundColor: Colors.backgroundCard,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    ...Platform.select({
      web: { boxShadow: '0 -8px 48px rgba(0,0,0,0.5)' as any },
      default: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 28, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
    }),
  },
  detalheBoxMobile: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    width: '100%', maxHeight: '82%', minHeight: 260,
  },
  detalheBoxDesktop: {
    borderRadius: 20, width: '100%',
    maxWidth: 500, maxHeight: '85%', minHeight: 240, alignSelf: 'center',
  },
  sheetHandle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  sheetHandlePill: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  detalheAccent: { height: 3, width: '100%', opacity: 0.85 },
  detalheHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
  },
  detalheIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, borderWidth: 1.5,
  },
  detalheTitulo: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, lineHeight: 22 },
  detalheClose: {
    padding: 7, borderRadius: 20,
    backgroundColor: Colors.backgroundElevated,
    alignSelf: 'flex-start',
  },
  detalheMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  detalheMsgScroll: { paddingHorizontal: 20, paddingTop: 16, maxHeight: 260 },
  detalheMsgBox: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 12, borderLeftWidth: 3,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  detalheMsg: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 23 },
  detalheFooter: {
    flexDirection: 'column', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  detalheBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 13, minHeight: 50,
  },
  detalheBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.2 },
  detalheSecondary: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  detalheBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  detalheBtnSecText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
