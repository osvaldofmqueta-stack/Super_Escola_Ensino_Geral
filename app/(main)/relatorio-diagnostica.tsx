import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Platform, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { api } from '@/lib/api';

const { width: SW } = Dimensions.get('window');

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RelatorioRow {
  turmaId: string;
  turmaNome: string;
  disciplinaNome: string;
  trimestre: number;
  total: number;
  muitoBom: number;
  bom: number;
  satisfaz: number;
  naoSatisfaz: number;
  mediaNotas: number | null;
}

// ─── Cores dos níveis ─────────────────────────────────────────────────────────
const COR_MUITO_BOM   = '#22c55e';
const COR_BOM         = '#3b82f6';
const COR_SATISFAZ    = '#f59e0b';
const COR_NAO_SATISFAZ = '#ef4444';

// ─── Componente de barra horizontal ──────────────────────────────────────────
function HBar({ label, cor, valor, total, compact }: {
  label: string; cor: string; valor: number; total: number; compact?: boolean;
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <View style={hb.row}>
      <Text style={[hb.label, compact && { width: 92 }]} numberOfLines={1}>{label}</Text>
      <View style={hb.track}>
        <View style={[hb.fill, { width: `${pct}%` as any, backgroundColor: cor }]} />
      </View>
      <Text style={[hb.val, { color: cor }]}>{valor}</Text>
      <Text style={hb.pct}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

const hb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  label: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', width: 76, textAlign: 'right' },
  track: {
    flex: 1, height: 10, backgroundColor: Colors.border + '60',
    borderRadius: 5, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 5 },
  val: { fontSize: 12, fontFamily: 'Inter_700Bold', width: 22, textAlign: 'right' },
  pct: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', width: 30 },
});

// ─── Card de disciplina/trimestre ─────────────────────────────────────────────
function DiscCard({ row }: { row: RelatorioRow }) {
  const [open, setOpen] = useState(true);
  const satisfRate = row.total > 0
    ? (((row.bom + row.muitoBom) / row.total) * 100).toFixed(0)
    : '0';
  const trimColor = row.trimestre === 1 ? '#0ea5e9' : row.trimestre === 2 ? '#8b5cf6' : '#22c55e';

  return (
    <View style={dc.card}>
      <TouchableOpacity style={dc.head} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <View style={[dc.trimBadge, { backgroundColor: trimColor + '22' }]}>
          <Text style={[dc.trimText, { color: trimColor }]}>{row.trimestre}T</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={dc.disc} numberOfLines={1}>{row.disciplinaNome}</Text>
          <Text style={dc.meta}>{row.total} alunos · média {row.mediaNotas ?? '—'} val.</Text>
        </View>
        <View style={dc.rateWrap}>
          <Text style={[dc.rate, { color: parseInt(satisfRate) >= 60 ? '#22c55e' : '#ef4444' }]}>
            {satisfRate}%
          </Text>
          <Text style={dc.rateSub}>Bom+</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={dc.body}>
          <HBar label="Muito Bom"   cor={COR_MUITO_BOM}    valor={row.muitoBom}    total={row.total} />
          <HBar label="Bom"         cor={COR_BOM}          valor={row.bom}         total={row.total} />
          <HBar label="Satisfaz"    cor={COR_SATISFAZ}      valor={row.satisfaz}    total={row.total} />
          <HBar label="Não Satisfaz" cor={COR_NAO_SATISFAZ} valor={row.naoSatisfaz} total={row.total} />

          {/* Mini distribuição visual */}
          <View style={dc.distRow}>
            {[
              { v: row.muitoBom,    c: COR_MUITO_BOM },
              { v: row.bom,         c: COR_BOM },
              { v: row.satisfaz,    c: COR_SATISFAZ },
              { v: row.naoSatisfaz, c: COR_NAO_SATISFAZ },
            ].map((seg, i) => {
              const pct = row.total > 0 ? (seg.v / row.total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <View
                  key={i}
                  style={[dc.distSeg, {
                    flex: seg.v,
                    backgroundColor: seg.c,
                    borderTopLeftRadius: i === 0 ? 4 : 0,
                    borderBottomLeftRadius: i === 0 ? 4 : 0,
                    borderTopRightRadius: i === 3 ? 4 : 0,
                    borderBottomRightRadius: i === 3 ? 4 : 0,
                  }]}
                />
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  trimBadge: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  trimText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  disc: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  meta: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 1 },
  rateWrap: { alignItems: 'center', minWidth: 40 },
  rate: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  rateSub: { fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  body: {
    paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: Colors.border + '60',
  },
  distRow: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  distSeg: { height: 8 },
});

// ─── Painel de totais globais ─────────────────────────────────────────────────
function GlobalStats({ rows }: { rows: RelatorioRow[] }) {
  const total      = rows.reduce((s, r) => s + r.total, 0);
  const muitoBom   = rows.reduce((s, r) => s + r.muitoBom, 0);
  const bom        = rows.reduce((s, r) => s + r.bom, 0);
  const satisfaz   = rows.reduce((s, r) => s + r.satisfaz, 0);
  const naoSatisfaz = rows.reduce((s, r) => s + r.naoSatisfaz, 0);

  if (total === 0) return null;

  const cards = [
    { label: 'Muito Bom', valor: muitoBom, cor: COR_MUITO_BOM },
    { label: 'Bom',       valor: bom,      cor: COR_BOM },
    { label: 'Satisfaz',  valor: satisfaz,  cor: COR_SATISFAZ },
    { label: 'Não Satisfaz', valor: naoSatisfaz, cor: COR_NAO_SATISFAZ },
  ];

  return (
    <View style={gs.wrap}>
      <Text style={gs.title}>TOTAIS GLOBAIS · {total} registos</Text>
      <View style={gs.row}>
        {cards.map(c => (
          <View key={c.label} style={[gs.card, { borderTopColor: c.cor }]}>
            <Text style={[gs.val, { color: c.cor }]}>{c.valor}</Text>
            <Text style={gs.lbl}>{c.label}</Text>
            <Text style={gs.pct}>{total > 0 ? ((c.valor / total) * 100).toFixed(1) : 0}%</Text>
          </View>
        ))}
      </View>
      {/* Barra de distribuição global */}
      <View style={gs.distRow}>
        {cards.map((c, i) => {
          if (c.valor === 0) return null;
          return (
            <View key={i} style={[gs.distSeg, {
              flex: c.valor, backgroundColor: c.cor,
              borderTopLeftRadius: i === 0 ? 6 : 0, borderBottomLeftRadius: i === 0 ? 6 : 0,
              borderTopRightRadius: i === 3 ? 6 : 0, borderBottomRightRadius: i === 3 ? 6 : 0,
            }]} />
          );
        })}
      </View>
    </View>
  );
}

const gs = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface, borderRadius: 14,
    marginHorizontal: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  title: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  card: {
    flex: 1, borderRadius: 10, borderTopWidth: 3,
    backgroundColor: Colors.card, padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  val: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  lbl: { fontSize: 9, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' },
  pct: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 1 },
  distRow: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  distSeg: { height: 12 },
});

// ─── Componente principal ─────────────────────────────────────────────────────
export default function RelatorioDiagnosticaScreen() {
  const { user } = useAuth();
  const { turmas } = useData();
  const { anoLetivoStr } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const [dados, setDados] = useState<RelatorioRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [filtroTurma, setFiltroTurma] = useState<string>('');
  const [filtroTrim,  setFiltroTrim]  = useState<number>(0);

  // Roles com acesso
  const isAdmin = ['admin', 'director', 'pedagogico', 'ceo', 'pca'].includes(user?.role || '');

  const carregar = useCallback(async () => {
    if (!anoLetivoStr) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ anoLetivo: anoLetivoStr });
      if (filtroTurma) params.set('turmaId', filtroTurma);
      if (filtroTrim)  params.set('trimestre', String(filtroTrim));
      const res = await api.get<RelatorioRow[]>(`/api/diagnostica/relatorio?${params}`);
      setDados(res || []);
    } catch {
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [anoLetivoStr, filtroTurma, filtroTrim]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Agrupar por turma
  const porTurma = React.useMemo(() => {
    const map: Record<string, RelatorioRow[]> = {};
    dados.forEach(r => {
      if (!map[r.turmaId]) map[r.turmaId] = [];
      map[r.turmaId].push(r);
    });
    return map;
  }, [dados]);

  const turmasComDados = Object.keys(porTurma);

  // Turmas únicas nos dados para o filtro
  const turmasNoDados = React.useMemo(() => {
    const seen = new Set<string>();
    return dados.filter(r => { const n = !seen.has(r.turmaId); seen.add(r.turmaId); return n; });
  }, [dados]);

  if (!isAdmin) {
    return (
      <View style={s.container}>
        <TopBar title="Relatório Diagnóstica" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, marginTop: 12, fontFamily: 'Inter_400Regular' }}>
            Acesso restrito a directores e administradores.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <TopBar
        title="Relatório Diagnóstica"
        subtitle={`Ano lectivo ${anoLetivoStr || '—'}`}
      />

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <View style={s.filterBar}>
        {/* Trimestre */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {[0, 1, 2, 3].map(t => (
            <TouchableOpacity
              key={t}
              style={[s.filterChip, filtroTrim === t && s.filterChipActive]}
              onPress={() => setFiltroTrim(t)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterChipText, filtroTrim === t && s.filterChipTextActive]}>
                {t === 0 ? 'Todos os Trim.' : `${t}º Trimestre`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Filtro de turma */}
      {turmasNoDados.length > 1 && (
        <View style={s.turmaFilterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
            <TouchableOpacity
              style={[s.turmaChip, !filtroTurma && s.turmaChipActive]}
              onPress={() => setFiltroTurma('')}
              activeOpacity={0.8}
            >
              <Text style={[s.turmaChipText, !filtroTurma && s.turmaChipTextActive]}>Todas</Text>
            </TouchableOpacity>
            {turmasNoDados.map(r => (
              <TouchableOpacity
                key={r.turmaId}
                style={[s.turmaChip, filtroTurma === r.turmaId && s.turmaChipActive]}
                onPress={() => setFiltroTurma(r.turmaId)}
                activeOpacity={0.8}
              >
                <Text style={[s.turmaChipText, filtroTurma === r.turmaId && s.turmaChipTextActive]} numberOfLines={1}>
                  {r.turmaNome}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={s.loadingText}>A carregar dados…</Text>
        </View>
      ) : dados.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <MaterialCommunityIcons name="chart-bar-stacked" size={48} color={Colors.border} />
          <Text style={s.emptyTitle}>Sem registos de diagnóstica</Text>
          <Text style={s.emptySub}>
            Ainda não existem avaliações diagnósticas registadas para {anoLetivoStr || 'este ano lectivo'}.
          </Text>
          <TouchableOpacity style={s.refreshBtn} onPress={carregar}>
            <Ionicons name="refresh" size={14} color={Colors.primary} />
            <Text style={s.refreshBtnText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + 32, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Estatísticas globais */}
          <GlobalStats rows={dados} />

          {/* Legenda */}
          <View style={s.legend}>
            {[
              { cor: COR_MUITO_BOM,    label: 'Muito Bom' },
              { cor: COR_BOM,          label: 'Bom' },
              { cor: COR_SATISFAZ,     label: 'Satisfaz' },
              { cor: COR_NAO_SATISFAZ, label: 'Não Satisfaz' },
            ].map(l => (
              <View key={l.label} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: l.cor }]} />
                <Text style={s.legendText}>{l.label}</Text>
              </View>
            ))}
          </View>

          {/* Por turma */}
          {turmasComDados.map(turmaId => {
            const rows = porTurma[turmaId];
            const turmaNome = rows[0]?.turmaNome || turmaId;
            return (
              <View key={turmaId} style={{ marginBottom: 8 }}>
                <View style={s.turmaHeader}>
                  <View style={s.turmaIconWrap}>
                    <Ionicons name="people" size={16} color="#0ea5e9" />
                  </View>
                  <Text style={s.turmaNome}>{turmaNome}</Text>
                  <View style={s.turmaBadge}>
                    <Text style={s.turmaBadgeText}>{rows.length} disciplina{rows.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={{ paddingHorizontal: 16 }}>
                  {rows.map((r, i) => <DiscCard key={i} row={r} />)}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  filterChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  filterChipText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  filterChipTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },

  turmaFilterRow: {
    paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  turmaChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card, maxWidth: 120,
  },
  turmaChipActive: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  turmaChipText: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  turmaChipTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },

  loadingText: {
    marginTop: 12, color: Colors.textMuted,
    fontFamily: 'Inter_400Regular', fontSize: 13,
  },

  emptyTitle: {
    marginTop: 16, fontSize: 16, fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary, textAlign: 'center',
  },
  emptySub: {
    marginTop: 6, fontSize: 13, color: Colors.textMuted,
    fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19,
  },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 18, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + '60',
  },
  refreshBtnText: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, marginBottom: 14,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },

  turmaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  turmaIconWrap: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: '#0ea5e9' + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  turmaNome: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaBadge: {
    backgroundColor: Colors.border + '80', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  turmaBadgeText: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
});
