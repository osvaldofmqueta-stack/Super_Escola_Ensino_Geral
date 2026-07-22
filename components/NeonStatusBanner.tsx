import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface NeonStatus {
  modo: string;
  neonLigado: boolean;
  localLigado: boolean;
  neonHost: string;
  ultimaVerificacao: string | null;
  verificacoes: number;
  sincPendente: boolean;
}

export default function NeonStatusBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<NeonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isCeo = user?.role === 'ceo';

  const fetchStatus = useCallback(async () => {
    if (!isCeo) return;
    try {
      const d = await api.get<NeonStatus>('/api/ceo/db-status');
      setStatus(d);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [isCeo]);

  useEffect(() => {
    if (!isCeo) return;
    fetchStatus();
    const iv = setInterval(fetchStatus, 30_000);
    return () => clearInterval(iv);
  }, [fetchStatus, isCeo]);

  useEffect(() => {
    if (!status?.neonLigado) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 900, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      ])
    ).start();
  }, [status?.neonLigado, pulseAnim]);

  if (!isCeo) return null;

  const isNeon = status?.neonLigado && (status?.modo === 'neon' || status?.modo === 'neon_only');
  const isFailover = status?.localLigado && !status?.neonLigado;

  const bannerColor = loading ? Colors.textMuted
    : isNeon ? Colors.success
    : isFailover ? Colors.warning
    : Colors.danger;

  const bannerBg = loading ? Colors.card
    : isNeon ? Colors.success + '18'
    : isFailover ? Colors.warning + '18'
    : Colors.danger + '18';

  const statusLabel = loading ? 'A verificar ligação...'
    : isNeon ? 'Neon — Ligado'
    : isFailover ? 'Failover — Banco Local'
    : 'Base de Dados — Erro';

  const statusIcon = loading ? 'cloud-outline'
    : isNeon ? 'cloud-done-outline'
    : isFailover ? 'warning-outline'
    : 'cloud-offline-outline';

  function formatTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <TouchableOpacity
      style={[nbS.banner, { backgroundColor: bannerBg, borderColor: bannerColor + '40' }]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      <View style={nbS.row}>
        {isNeon ? (
          <Animated.View style={[nbS.dot, { backgroundColor: bannerColor, opacity: pulseAnim }]} />
        ) : (
          <View style={[nbS.dot, { backgroundColor: bannerColor }]} />
        )}
        <Ionicons name={statusIcon as any} size={14} color={bannerColor} />
        <Text style={[nbS.label, { color: bannerColor }]}>{statusLabel}</Text>
        {status?.neonHost ? (
          <Text style={nbS.host} numberOfLines={1}>{status.neonHost.replace('-pooler', '')}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={fetchStatus} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="refresh-outline" size={14} color={bannerColor} />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />
      </View>

      {expanded && status && (
        <View style={nbS.details}>
          <View style={nbS.detailRow}>
            <Text style={nbS.detailKey}>Modo activo</Text>
            <Text style={[nbS.detailVal, { color: bannerColor }]}>{status.modo.replace('_', ' ').toUpperCase()}</Text>
          </View>
          <View style={nbS.detailRow}>
            <Text style={nbS.detailKey}>Neon (primário)</Text>
            <Text style={[nbS.detailVal, { color: status.neonLigado ? Colors.success : Colors.danger }]}>
              {status.neonLigado ? '✅ Conectado' : '❌ Desligado'}
            </Text>
          </View>
          <View style={nbS.detailRow}>
            <Text style={nbS.detailKey}>Local (backup)</Text>
            <Text style={[nbS.detailVal, { color: status.localLigado ? Colors.success : Colors.textMuted }]}>
              {status.localLigado ? '✅ Disponível' : '—'}
            </Text>
          </View>
          <View style={nbS.detailRow}>
            <Text style={nbS.detailKey}>Última verificação</Text>
            <Text style={nbS.detailVal}>{formatTime(status.ultimaVerificacao)}</Text>
          </View>
          <View style={nbS.detailRow}>
            <Text style={nbS.detailKey}>Verificações totais</Text>
            <Text style={nbS.detailVal}>{status.verificacoes}</Text>
          </View>
          {status.sincPendente && (
            <View style={[nbS.detailRow, { backgroundColor: Colors.warning + '18', borderRadius: 6, paddingHorizontal: 8 }]}>
              <Ionicons name="sync-outline" size={12} color={Colors.warning} />
              <Text style={[nbS.detailKey, { color: Colors.warning, marginLeft: 4 }]}>Sincronização pendente</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const nbS = StyleSheet.create({
  banner: {
    marginHorizontal: 12, marginBottom: 6, borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  host: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flexShrink: 1 },
  details: { marginTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKey: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  detailVal: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
});
