import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Line, Text as SvgText, G, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

interface HealthPoint {
  ts: number;
  neonOk: boolean;
  localOk: boolean;
  latencyMs: number | null;
}

const CHART_H = 120;
const CHART_W = 320;
const PAD_L = 36;
const PAD_B = 24;

export default function NeonStatusChart() {
  const [history, setHistory] = useState<HealthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartVisible, setChartVisible] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const d = await api.get<{ history: HealthPoint[] }>('/api/ceo/db-health-history');
      setHistory(d.history ?? []);
      setError(null);
    } catch (e: any) {
      setError('Erro ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const iv = setInterval(fetch, 30_000);
    return () => clearInterval(iv);
  }, [fetch]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  }

  if (error || history.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="pulse-outline" size={15} color={Colors.textMuted} />
          <Text style={styles.title}>Latência Neon</Text>
        </View>
        <Text style={styles.emptyText}>
          {error ?? 'Aguardando dados de monitorização... (30s entre verificações)'}
        </Text>
      </View>
    );
  }

  const latencies = history.map(h => h.latencyMs ?? 0);
  const maxLat = Math.max(...latencies, 50);
  const innerW = CHART_W - PAD_L - 8;
  const innerH = CHART_H - PAD_B - 8;

  const points = history.map((h, i) => ({
    x: PAD_L + (i / Math.max(history.length - 1, 1)) * innerW,
    y: 8 + innerH - ((h.latencyMs ?? 0) / maxLat) * innerH,
    ok: h.neonOk,
    lat: h.latencyMs,
    ts: h.ts,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = points.length > 1
    ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(8 + innerH)} L${points[0].x.toFixed(1)},${(8 + innerH)} Z`
    : '';

  const okCount = history.filter(h => h.neonOk).length;
  const uptime = Math.round((okCount / history.length) * 100);
  const avgLat = latencies.filter(l => l > 0).length
    ? Math.round(latencies.filter(l => l > 0).reduce((a, b) => a + b, 0) / latencies.filter(l => l > 0).length)
    : null;
  const lastPoint = points[points.length - 1];

  const statusColor = lastPoint?.ok ? Colors.success : Colors.danger;
  const lineColor = avgLat !== null && avgLat < 100 ? Colors.success : avgLat !== null && avgLat < 300 ? Colors.gold : Colors.danger;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="pulse-outline" size={15} color={Colors.accent} />
        <Text style={styles.title}>Monitorização Neon — Latência (ms)</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={fetch} style={styles.iconBtn}>
            <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setChartVisible(v => !v)}
            style={[styles.iconBtn, styles.toggleBtn, chartVisible && styles.toggleBtnActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={chartVisible ? 'eye-off-outline' : 'eye-outline'}
              size={14}
              color={chartVisible ? Colors.accent : Colors.textMuted}
            />
            <Text style={[styles.toggleText, chartVisible && styles.toggleTextActive]}>
              {chartVisible ? 'Ocultar' : 'Ver gráfico'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.statLabel}>Estado actual</Text>
          <Text style={[styles.statValue, { color: statusColor }]}>{lastPoint?.ok ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Uptime</Text>
          <Text style={[styles.statValue, { color: uptime >= 90 ? Colors.success : Colors.warning }]}>{uptime}%</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Latência média</Text>
          <Text style={[styles.statValue, { color: lineColor }]}>{avgLat !== null ? `${avgLat}ms` : '—'}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Verificações</Text>
          <Text style={styles.statValue}>{history.length}</Text>
        </View>
      </View>

      {chartVisible && (
        <>
          <Svg width={CHART_W} height={CHART_H}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const y = 8 + innerH - frac * innerH;
              const label = Math.round(frac * maxLat);
              return (
                <G key={i}>
                  <Line x1={PAD_L} y1={y} x2={CHART_W - 4} y2={y} stroke={Colors.border} strokeWidth={0.5} />
                  <SvgText x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize={8} fill={Colors.textMuted}>
                    {label}
                  </SvgText>
                </G>
              );
            })}

            {/* Baseline */}
            <Line x1={PAD_L} y1={8 + innerH} x2={CHART_W - 4} y2={8 + innerH} stroke={Colors.border} strokeWidth={1} />

            {/* Area fill */}
            {areaPath ? <Path d={areaPath} fill={lineColor} opacity={0.08} /> : null}

            {/* Line */}
            {linePath ? <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}

            {/* Offline markers */}
            {points.map((p, i) => !p.ok ? (
              <Rect key={i} x={p.x - 2} y={8} width={4} height={innerH} fill={Colors.danger} opacity={0.15} />
            ) : null)}

            {/* Last point dot */}
            {lastPoint && (
              <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={lastPoint.ok ? Colors.success : Colors.danger} />
            )}

            {/* X-axis labels — first, middle, last */}
            {history.length > 0 && (() => {
              const indices = [0, Math.floor(history.length / 2), history.length - 1];
              return indices.map(idx => {
                const p = points[idx];
                if (!p) return null;
                const d = new Date(history[idx].ts);
                const label = d.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
                return (
                  <SvgText key={idx} x={p.x} y={CHART_H - 4} textAnchor="middle" fontSize={8} fill={Colors.textMuted}>
                    {label}
                  </SvgText>
                );
              });
            })()}
          </Svg>

          <Text style={styles.footnote}>Actualização automática a cada 30 segundos · {history.length} pontos</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  iconBtn: {
    padding: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  toggleBtnActive: {
    borderColor: Colors.accent + '60',
    backgroundColor: Colors.accent + '12',
  },
  toggleText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.accent,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statBox: {
    flex: 1,
    minWidth: 70,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 8,
    gap: 2,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  footnote: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});
