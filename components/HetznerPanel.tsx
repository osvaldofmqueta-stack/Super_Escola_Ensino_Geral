import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

interface HetznerStatus {
  host: string | null;
  serverOnline: boolean;
  nextPaymentDate: string;
  nextPaymentRaw: string;
  daysRemaining: number;
  alertLevel: 'ok' | 'warning' | 'critical';
  paymentDay: number;
}

export default function HetznerPanel() {
  const [data, setData] = useState<HetznerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<HetznerStatus>('/api/hetzner/status');
      setData(res as HetznerStatus);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar estado Hetzner');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const alertColor = data
    ? data.alertLevel === 'critical'
      ? Colors.danger
      : data.alertLevel === 'warning'
      ? Colors.warning
      : Colors.success
    : Colors.textMuted;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <MaterialCommunityIcons name="server" size={18} color={Colors.gold} />
          <Text style={s.headerTitle}>Servidor Hetzner</Text>
        </View>
        <TouchableOpacity onPress={fetch} style={s.refreshBtn} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="small" color={Colors.gold} />
          <Text style={s.loadingText}>A verificar servidor...</Text>
        </View>
      ) : error ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : data ? (
        <View style={s.body}>
          {/* Linha 1: Estado do servidor */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.statusDot, { backgroundColor: data.serverOnline ? Colors.success : Colors.danger }]} />
              <Text style={s.rowLabel}>Estado do servidor</Text>
            </View>
            <View style={[s.pill, { backgroundColor: (data.serverOnline ? Colors.success : Colors.danger) + '22', borderColor: (data.serverOnline ? Colors.success : Colors.danger) + '55' }]}>
              <Text style={[s.pillText, { color: data.serverOnline ? Colors.success : Colors.danger }]}>
                {data.serverOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          {/* Linha 2: Host */}
          {data.host && (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <Ionicons name="globe-outline" size={14} color={Colors.textMuted} />
                <Text style={s.rowLabel}>Endereço IP</Text>
              </View>
              <Text style={s.rowValue}>{data.host}</Text>
            </View>
          )}

          {/* Divider */}
          <View style={s.divider} />

          {/* Linha 3: Próximo pagamento */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
              <Text style={s.rowLabel}>Próximo pagamento</Text>
            </View>
            <Text style={[s.rowValue, { color: alertColor }]}>{data.nextPaymentDate}</Text>
          </View>

          {/* Countdown */}
          <View style={[s.countdownBox, { borderColor: alertColor + '44', backgroundColor: alertColor + '0E' }]}>
            {data.alertLevel !== 'ok' && (
              <Ionicons
                name={data.alertLevel === 'critical' ? 'alert-circle' : 'warning'}
                size={16}
                color={alertColor}
              />
            )}
            {data.alertLevel === 'ok' && (
              <Ionicons name="checkmark-circle" size={16} color={alertColor} />
            )}
            <View style={s.countdownTexts}>
              <Text style={[s.countdownDays, { color: alertColor }]}>
                {data.daysRemaining} {data.daysRemaining === 1 ? 'dia' : 'dias'}
              </Text>
              <Text style={s.countdownSub}>
                {data.alertLevel === 'critical'
                  ? 'URGENTE — pagamento iminente!'
                  : data.alertLevel === 'warning'
                  ? 'Pagamento em breve — prepare o valor'
                  : 'para o próximo pagamento Hetzner'}
              </Text>
            </View>
          </View>

          {/* Info pagamento */}
          <View style={s.infoRow}>
            <Ionicons name="information-circle-outline" size={12} color={Colors.textMuted} />
            <Text style={s.infoText}>Fatura gerada automaticamente no dia 4 de cada mês · accounts.hetzner.com</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryDark,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    flex: 1,
  },
  body: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowLabel: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  rowValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  countdownTexts: {
    flex: 1,
  },
  countdownDays: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  countdownSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 2,
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
});
