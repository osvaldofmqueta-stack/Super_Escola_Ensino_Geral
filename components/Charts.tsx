import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Rect, Circle, Path, Line, Text as SvgText, G,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';
import { Colors } from '@/constants/colors';

// ─── BarChart ─────────────────────────────────────────────────────────────────
interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  maxValue?: number;
  height?: number;
  width?: number;
  showGrid?: boolean;
}

export function BarChart({ data, maxValue, height = 180, width = 300, showGrid = true }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontSize: 28, opacity: 0.3 }}>📊</Text>
        <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center' }}>Sem dados disponíveis</Text>
      </View>
    );
  }
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  const padLeft = 28;
  const padBottom = 28;
  const padTop = 20;
  const barAreaW = width - padLeft - 8;
  const barW = Math.floor(barAreaW / data.length) - 6;
  const chartH = height - padBottom - padTop;
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        {data.map((d, i) => {
          const color = d.color || Colors.accent;
          return (
            <LinearGradient key={`grad-${i}`} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.95" />
              <Stop offset="1" stopColor={color} stopOpacity="0.55" />
            </LinearGradient>
          );
        })}
      </Defs>

      {/* Grid lines */}
      {showGrid && gridLines.map((g, i) => {
        const y = padTop + chartH - g * chartH;
        return (
          <G key={i}>
            <Line x1={padLeft} y1={y} x2={width - 4} y2={y} stroke={Colors.border} strokeWidth={0.8} opacity={0.6} />
            <SvgText x={padLeft - 4} y={y + 3} textAnchor="end" fontSize={8} fill={Colors.textMuted}>
              {Math.round(g * max)}
            </SvgText>
          </G>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = Math.max(4, (d.value / max) * chartH);
        const x = padLeft + i * (barW + 6) + 3;
        const y = padTop + chartH - barH;
        return (
          <G key={i}>
            {/* Shadow/glow */}
            <Rect x={x + 2} y={y + 2} width={barW} height={barH} fill={d.color || Colors.accent} rx={5} opacity={0.12} />
            {/* Bar */}
            <Rect x={x} y={y} width={barW} height={barH} fill={`url(#barGrad${i})`} rx={5} />
            {/* Value label */}
            <SvgText
              x={x + barW / 2} y={y - 4}
              textAnchor="middle" fontSize={9.5}
              fill={d.color || Colors.accent}
              fontFamily="Inter_700Bold"
            >
              {d.value}
            </SvgText>
            {/* X label */}
            <SvgText
              x={x + barW / 2} y={height - 6}
              textAnchor="middle" fontSize={9}
              fill={Colors.textMuted}
            >
              {d.label}
            </SvgText>
          </G>
        );
      })}

      {/* Baseline */}
      <Line x1={padLeft} y1={padTop + chartH} x2={width - 4} y2={padTop + chartH} stroke={Colors.border} strokeWidth={1} />
    </Svg>
  );
}

// ─── LineChart ────────────────────────────────────────────────────────────────
interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  width?: number;
  showDots?: boolean;
  showArea?: boolean;
}

export function LineChart({ data, color = Colors.gold, height = 150, width = 300, showDots = true, showArea = true }: LineChartProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;
  const padLeft = 32;
  const padBottom = 28;
  const padTop = 14;
  const chartW = width - padLeft - 8;
  const chartH = height - padBottom - padTop;
  const stepX = chartW / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padLeft + i * stepX,
    y: padTop + chartH - ((d.value - min) / range) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${padTop + chartH} L${padLeft},${padTop + chartH} Z`;

  const gradId = `lineArea_${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Y-axis labels */}
      {[min, (min + max) / 2, max].map((v, i) => {
        const y = padTop + chartH - ((v - min) / range) * chartH;
        return (
          <G key={i}>
            <Line x1={padLeft - 2} y1={y} x2={width - 4} y2={y} stroke={Colors.border} strokeWidth={0.7} opacity={0.5} strokeDasharray="3,3" />
            <SvgText x={padLeft - 4} y={y + 3} textAnchor="end" fontSize={8} fill={Colors.textMuted}>{Math.round(v)}</SvgText>
          </G>
        );
      })}

      {/* Area fill */}
      {showArea && <Path d={areaD} fill={`url(#${gradId})`} />}

      {/* Line */}
      <Path d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots + labels */}
      {points.map((p, i) => (
        <G key={i}>
          {showDots && (
            <>
              <Circle cx={p.x} cy={p.y} r={4.5} fill={Colors.background} stroke={color} strokeWidth={2} />
              <SvgText x={p.x} y={p.y - 8} textAnchor="middle" fontSize={8.5} fill={color} fontFamily="Inter_600SemiBold">{data[i].value}</SvgText>
            </>
          )}
          <SvgText x={p.x} y={height - 6} textAnchor="middle" fontSize={9} fill={Colors.textMuted}>{data[i].label}</SvgText>
        </G>
      ))}

      {/* Baseline */}
      <Line x1={padLeft} y1={padTop + chartH} x2={width - 4} y2={padTop + chartH} stroke={Colors.border} strokeWidth={1} />
    </Svg>
  );
}

// ─── PieChart ─────────────────────────────────────────────────────────────────
interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function PieChart({ data, size = 160 }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Text style={{ fontSize: 28, opacity: 0.3 }}>🟡</Text>
        <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center' }}>Sem dados</Text>
      </View>
    );
  }
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;

  let cumAngle = -Math.PI / 2;
  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const start = cumAngle;
    cumAngle += angle;
    const end = cumAngle;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    return { path, color: d.color, label: d.label, value: d.value, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Svg width={size} height={size}>
        {slices.map((s, i) => (
          <Path key={i} d={s.path} fill={s.color} opacity={0.9} />
        ))}
      </Svg>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label} ({s.pct}%)</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────
interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}

export function DonutChart({ data, size = 160, thickness = 28, centerLabel, centerSub }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Text style={{ fontSize: 28, opacity: 0.3 }}>🔵</Text>
        <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center' }}>Sem dados</Text>
      </View>
    );
  }
  const r = size / 2 - thickness / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const GAP = 0.03;

  let cumAngle = -Math.PI / 2;
  const slices = data.map(d => {
    const fraction = d.value / total;
    const angle = fraction * 2 * Math.PI - GAP;
    const start = cumAngle + GAP / 2;
    cumAngle += fraction * 2 * Math.PI;
    const end = start + angle;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
    return { path, color: d.color, label: d.label, value: d.value, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background track */}
          <Circle cx={cx} cy={cy} r={r} stroke={Colors.border} strokeWidth={thickness} fill="none" opacity={0.3} />
          {slices.map((s, i) => (
            <Path
              key={i}
              d={s.path}
              stroke={s.color}
              strokeWidth={thickness}
              fill="none"
              strokeLinecap="round"
              opacity={0.92}
            />
          ))}
          {centerLabel ? (
            <G>
              <SvgText x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontFamily="Inter_700Bold" fill={Colors.text}>
                {centerLabel}
              </SvgText>
              {centerSub ? (
                <SvgText x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fontFamily="Inter_400Regular" fill={Colors.textMuted}>
                  {centerSub}
                </SvgText>
              ) : null}
            </G>
          ) : null}
        </Svg>
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label} · {s.value} ({s.pct}%)</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── HorizontalBarChart ───────────────────────────────────────────────────────
interface HorizontalBarChartProps {
  data: { label: string; value: number; max?: number; color?: string }[];
  width?: number;
  barHeight?: number;
}

export function HorizontalBarChart({ data, width = 300, barHeight = 14 }: HorizontalBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={{ width, height: 60, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, color: Colors.textMuted }}>Sem dados</Text>
      </View>
    );
  }
  const globalMax = Math.max(...data.map(d => d.max ?? d.value), 1);
  const labelW = 78;
  const valW = 30;
  const barAreaW = width - labelW - valW - 8;

  return (
    <View style={{ width, gap: 10 }}>
      {data.map((d, i) => {
        const effectiveMax = d.max ?? globalMax;
        const fillW = Math.max(6, (d.value / effectiveMax) * barAreaW);
        const color = d.color || Colors.accent;
        const pct = Math.round((d.value / effectiveMax) * 100);
        return (
          <View key={i} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', width: labelW }} numberOfLines={1}>{d.label}</Text>
              <Text style={{ fontSize: 11, color, fontFamily: 'Inter_700Bold', width: valW, textAlign: 'right' }}>{d.value}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, height: barHeight, backgroundColor: color + '20', borderRadius: barHeight / 2, overflow: 'hidden' }}>
                <View style={{ width: fillW, height: barHeight, backgroundColor: color, borderRadius: barHeight / 2, opacity: 0.88 }} />
              </View>
              <Text style={{ fontSize: 9, color: Colors.textMuted, width: 26, textAlign: 'right' }}>{pct}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── GaugeChart ───────────────────────────────────────────────────────────────
interface GaugeChartProps {
  value: number;
  max?: number;
  color?: string;
  size?: number;
  thickness?: number;
  label?: string;
  sublabel?: string;
}

export function GaugeChart({ value, max = 100, color = Colors.success, size = 160, thickness = 18, label, sublabel }: GaugeChartProps) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = (size / 2) - (thickness / 2) - 4;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const startAngle = Math.PI * (5 / 6);
  const fullSweep = Math.PI * (4 / 3);
  const endAngle = startAngle + pct * fullSweep;
  const totalEnd = startAngle + fullSweep;

  function arcPath(from: number, to: number) {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = (to - from) > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const svgH = Math.round(size * 0.72);

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={svgH}>
        <Defs>
          <LinearGradient id={`gaugeGrad_${color.replace('#','')}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0.5" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Path d={arcPath(startAngle, totalEnd)} stroke={color + '22'} strokeWidth={thickness} fill="none" strokeLinecap="round" />
        {/* Fill */}
        {pct > 0 && (
          <Path d={arcPath(startAngle, endAngle)} stroke={`url(#gaugeGrad_${color.replace('#','')})`} strokeWidth={thickness} fill="none" strokeLinecap="round" />
        )}
        {label && (
          <G>
            <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize={24} fontFamily="Inter_700Bold" fill={Colors.text}>{label}</SvgText>
            {sublabel && (
              <SvgText x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fontFamily="Inter_400Regular" fill={Colors.textMuted}>{sublabel}</SvgText>
            )}
          </G>
        )}
      </Svg>
    </View>
  );
}

// ─── SparkLine ────────────────────────────────────────────────────────────────
interface SparkLineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function SparkLine({ data, color = Colors.gold, width = 60, height = 28 }: SparkLineProps) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = (width - 4) / (data.length - 1);

  const points = data.map((v, i) => ({
    x: 2 + i * stepX,
    y: 3 + (height - 6) - ((v - min) / range) * (height - 6),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${height} L2,${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`spark_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaD} fill={`url(#spark_${color.replace('#','')})`} />
      <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={color} />
    </Svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  legend: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
});
