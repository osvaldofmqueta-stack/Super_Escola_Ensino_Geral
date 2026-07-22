import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated, ScrollView, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '@/context/OfflineContext';
import { Colors } from '@/constants/colors';
import { describeOp, removeFailedOp, retryFailedOp, clearFailedOps } from '@/lib/offlineQueue';

function formatRelative(date: Date | null): string {
  if (!date) return 'ainda não sincronizou nesta sessão';
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return 'agora mesmo';
  if (sec < 60) return `há ${sec} segundos`;
  const min = Math.round(sec / 60);
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `há ${hr} ${hr === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(hr / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function formatRelativeTs(ts: number): string {
  return formatRelative(new Date(ts));
}

export default function OfflineStatusBadge({ inline = false, hideWhenHealthy = false }: { inline?: boolean; hideWhenHealthy?: boolean }) {
  const { isOnline, pendingCount, failedCount, pendingOps, failedOps, isSyncing, lastSyncAt, triggerSync } = useOffline();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [, force] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; right: number; panelWidth: number } | null>(null);
  const badgeRef = useRef<View>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const openPanel = () => {
    if (Platform.OS === 'web' && badgeRef.current) {
      // Measure the badge position in the viewport so the modal panel can anchor next to it.
      // @ts-ignore — react-native-web exposes a real DOM node via _node / direct ref
      const node: HTMLElement | null = (badgeRef.current as any)?._nativeTag
        ? null
        : ((badgeRef.current as any) as HTMLElement);
      const el: HTMLElement | null = node || ((badgeRef.current as any)?.getBoundingClientRect ? (badgeRef.current as any) : null);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const r = el.getBoundingClientRect();
        const winW = Dimensions.get('window').width;
        const panelWidth = Math.min(320, winW - 16);
        const rightFromEdge = Math.max(8, winW - r.right);
        // Garante que o painel não ultrapassa o limite esquerdo do ecrã
        const leftEdge = winW - rightFromEdge - panelWidth;
        const clampedRight = leftEdge < 8 ? winW - panelWidth - 8 : rightFromEdge;
        setAnchor({ top: r.bottom + 6, right: clampedRight, panelWidth });
      } else {
        setAnchor(null);
      }
    } else {
      setAnchor(null);
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => force(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (isSyncing) {
      spinAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isSyncing, spinAnim]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  let color: string;
  let icon: keyof typeof Ionicons.glyphMap;
  let shortLabel: string;
  let detailLine: string;

  if (failedCount > 0) {
    color = Colors.danger;
    icon = 'alert-circle';
    shortLabel = 'Falhas';
    detailLine = `${failedCount} ${failedCount === 1 ? 'alteração offline foi rejeitada' : 'alterações offline foram rejeitadas'} pelo servidor`;
  } else if (!isOnline) {
    color = Colors.danger;
    icon = 'cloud-offline';
    shortLabel = 'Offline';
    detailLine = pendingCount > 0
      ? `${pendingCount} ${pendingCount === 1 ? 'pedido' : 'pedidos'} a aguardar sincronização`
      : 'Sem pedidos pendentes — pode continuar a trabalhar';
  } else if (isSyncing) {
    color = Colors.info;
    icon = 'sync';
    shortLabel = 'A sincronizar';
    detailLine = pendingCount > 0
      ? `A enviar ${pendingCount} ${pendingCount === 1 ? 'pedido' : 'pedidos'}...`
      : 'A actualizar dados...';
  } else if (pendingCount > 0) {
    color = Colors.warning;
    icon = 'time';
    shortLabel = 'Pendente';
    detailLine = `${pendingCount} ${pendingCount === 1 ? 'pedido' : 'pedidos'} a aguardar sincronização`;
  } else {
    color = Colors.success;
    icon = 'cloud-done';
    shortLabel = 'Online';
    detailLine = `Última sincronização: ${formatRelative(lastSyncAt)}`;
  }

  const totalBadge = pendingCount + failedCount;
  const tooltip = `${shortLabel} — ${detailLine}`;
  const hasAnyOps = pendingOps.length > 0 || failedOps.length > 0;

  // No modo silencioso (mobile), esconde o badge quando tudo está bem
  const isHealthy = isOnline && !isSyncing && pendingCount === 0 && failedCount === 0;
  if (hideWhenHealthy && isHealthy) return null;

  const panelContent = (
    <View style={[styles.panel, anchor?.panelWidth ? { width: anchor.panelWidth } : undefined]}>
          <View style={styles.panelHeader}>
            <View style={[styles.headerDot, { backgroundColor: color }]} />
            <Text style={styles.panelTitle}>{shortLabel}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={14} color={Colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.panelDetail}>{detailLine}</Text>
          {isOnline && lastSyncAt && failedCount === 0 && (
            <Text style={styles.panelMuted}>Última sincronização {formatRelative(lastSyncAt)}.</Text>
          )}
          {!isOnline && (
            <Text style={styles.panelMuted}>
              As suas alterações continuam a ser guardadas localmente e serão sincronizadas assim que voltar a ligar-se.
            </Text>
          )}
          {hasAnyOps && (
            <Pressable onPress={() => setShowList(s => !s)} style={styles.toggleBtn}>
              <Ionicons name={showList ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.text} />
              <Text style={styles.toggleBtnText}>{showList ? 'Esconder detalhes' : 'Ver detalhes'}</Text>
            </Pressable>
          )}
          {showList && hasAnyOps && (
            <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator>
              {failedOps.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: Colors.danger }]}>Rejeitadas pelo servidor ({failedOps.length})</Text>
                    <Pressable onPress={() => clearFailedOps()} hitSlop={6}>
                      <Text style={styles.linkText}>Descartar todas</Text>
                    </Pressable>
                  </View>
                  {failedOps.map((op) => {
                    const { title, subtitle } = describeOp(op);
                    return (
                      <View key={op.id} style={[styles.item, { borderLeftColor: Colors.danger }]}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
                        <Text style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</Text>
                        <Text style={styles.itemError} numberOfLines={3}>
                          {op.status ? `Erro ${op.status}: ` : 'Erro: '}{op.errorMessage.replace(/^\d{3}:\s*/, '')}
                        </Text>
                        <Text style={styles.itemMeta}>Falhou {formatRelativeTs(op.failedAt)}</Text>
                        <View style={styles.itemActions}>
                          <Pressable
                            onPress={async () => { await retryFailedOp(op.id); triggerSync(); }}
                            style={({ pressed }) => [styles.itemBtn, { backgroundColor: Colors.info, opacity: pressed ? 0.85 : 1 }]}>
                            <Ionicons name="refresh" size={11} color="#fff" />
                            <Text style={styles.itemBtnText}>Tentar de novo</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => removeFailedOp(op.id)}
                            style={({ pressed }) => [styles.itemBtn, { backgroundColor: Colors.border, opacity: pressed ? 0.85 : 1 }]}>
                            <Ionicons name="trash" size={11} color={Colors.text} />
                            <Text style={[styles.itemBtnText, { color: Colors.text }]}>Descartar</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
              {pendingOps.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: Colors.warning }]}>A aguardar sincronização ({pendingOps.length})</Text>
                  </View>
                  {pendingOps.map((op) => {
                    const { title, subtitle } = describeOp(op);
                    return (
                      <View key={op.id} style={[styles.item, { borderLeftColor: Colors.warning }]}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
                        <Text style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</Text>
                        <Text style={styles.itemMeta}>Guardado {formatRelativeTs(op.timestamp)}</Text>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          )}
          <Pressable
            onPress={() => { triggerSync(); }}
            disabled={isSyncing || !isOnline}
            style={({ pressed }) => [
              styles.syncBtn,
              { backgroundColor: (isSyncing || !isOnline) ? Colors.border : color, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons
              name={isSyncing ? 'hourglass' : 'refresh'}
              size={13}
              color={(isSyncing || !isOnline) ? Colors.textMuted : '#fff'} />
            <Text style={[styles.syncBtnText, { color: (isSyncing || !isOnline) ? Colors.textMuted : '#fff' }]}>
              {isSyncing ? 'A sincronizar...' : (isOnline ? 'Sincronizar agora' : 'Sem ligação')}
            </Text>
          </Pressable>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        inline
          ? styles.containerInline
          : (Platform.OS === 'web' ? ({ position: 'fixed' } as any) : { position: 'absolute' }),
        { pointerEvents: 'box-none' },
      ]}>
      <Pressable
        ref={badgeRef as any}
        onPress={() => (open ? setOpen(false) : openPanel())}
        // @ts-ignore
        title={tooltip}
        accessibilityLabel={tooltip}
        style={({ pressed }) => [styles.badge, { borderColor: color, opacity: pressed ? 0.85 : 1 }]}>
        <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : undefined}>
          <Ionicons name={icon} size={14} color={color} />
        </Animated.View>
        <View style={[styles.dot, { backgroundColor: color }]} />
        {totalBadge > 0 && (
          <View style={[styles.pill, { backgroundColor: color }]}>
            <Text style={styles.pillText}>{totalBadge > 99 ? '99+' : String(totalBadge)}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.modalAnchor,
              anchor
                ? { top: anchor.top, right: anchor.right, width: anchor.panelWidth }
                : { top: 60, right: 8 },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {panelContent}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    top: 10,
    right: 12,
    zIndex: 9998,
    alignItems: 'flex-end',
  } as any,
  containerInline: {
    position: 'relative',
    alignItems: 'flex-end',
    zIndex: 9998,
  } as any,
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: Colors.backgroundCard,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pill: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  pillText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold', lineHeight: 12 },
  panel: {
    marginTop: 8,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    width: 320,
    maxHeight: 480,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  panelInline: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
  } as any,
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalAnchor: {
    position: 'absolute',
  } as any,
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  panelTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  closeBtn: { padding: 2 },
  panelDetail: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text, lineHeight: 16, marginBottom: 6 },
  panelMuted: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginBottom: 10 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 6, marginBottom: 6,
  },
  toggleBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.text },
  list: { maxHeight: 240, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4, marginBottom: 4,
  },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.info },
  item: {
    backgroundColor: Colors.background,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
  },
  itemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text, marginBottom: 2 },
  itemSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  itemError: { fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.danger, marginTop: 2, marginBottom: 4 },
  itemMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  itemActions: { flexDirection: 'row', gap: 6, marginTop: 6 },
  itemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  itemBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#fff' },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 8,
  },
  syncBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});
