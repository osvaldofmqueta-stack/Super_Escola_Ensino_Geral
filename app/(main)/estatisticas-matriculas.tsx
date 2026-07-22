import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import { Colors } from '@/constants/colors';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { api } from '@/lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface GlobalStats { total: number; masc: number; fem: number; turmas: number; classes: number; }
interface PorClasse  { classe: string; turno: string; total: number; masc: number; fem: number; }
interface PorCurso   { curso: string; classe: string; total: number; masc: number; fem: number; }
interface ApiData {
  global: GlobalStats;
  porClasse: PorClasse[];
  porCurso: PorCurso[];
  novasAdmissoes: number;
  anoLetivo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

function StatCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color?: string; icon: string }) {
  return (
    <View style={[s.statCard, { borderTopColor: color || Colors.primary }]}>
      <MaterialCommunityIcons name={icon as any} size={22} color={color || Colors.primary} style={{ marginBottom: 6 }} />
      <Text style={[s.statValue, { color: color || Colors.primary }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total);
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${p}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={s.barCount}>{value}</Text>
      <Text style={s.barPct}>{p}%</Text>
    </View>
  );
}

// ─── Ecrã principal ───────────────────────────────────────────────────────────
export default function EstatisticasMatriculasScreen() {
  const { anoSelecionado } = useAnoAcademico();
  const [data, setData]     = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]     = useState('');
  const [abaActiva, setAbaActiva] = useState<'classe' | 'curso' | 'turno'>('classe');

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const anoLetivo = anoSelecionado?.ano || '';
      const qs = anoLetivo ? `?anoLetivo=${encodeURIComponent(anoLetivo)}` : '';
      const result = await api.get<ApiData>(`/api/estatisticas/matriculas${qs}`);
      setData(result);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar estatísticas.');
    } finally { setLoading(false); }
  }, [anoSelecionado?.ano]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Agrupamentos derivados ──
  const classesSorted = [...(data?.porClasse || [])].sort((a, b) => {
    const na = parseInt(a.classe) || 0;
    const nb = parseInt(b.classe) || 0;
    return na !== nb ? na - nb : a.turno.localeCompare(b.turno);
  });

  // Por classe (agrupado — soma turnos)
  const porClasseAgrupado = classesSorted.reduce<Record<string, { masc: number; fem: number; total: number }>>((acc, r) => {
    if (!acc[r.classe]) acc[r.classe] = { masc: 0, fem: 0, total: 0 };
    acc[r.classe].masc  += Number(r.masc);
    acc[r.classe].fem   += Number(r.fem);
    acc[r.classe].total += Number(r.total);
    return acc;
  }, {});

  // Por turno
  const porTurnoAgrupado = classesSorted.reduce<Record<string, { masc: number; fem: number; total: number }>>((acc, r) => {
    const t = r.turno || 'Desconhecido';
    if (!acc[t]) acc[t] = { masc: 0, fem: 0, total: 0 };
    acc[t].masc  += Number(r.masc);
    acc[t].fem   += Number(r.fem);
    acc[t].total += Number(r.total);
    return acc;
  }, {});

  const g = data?.global;
  const totalGlobal = Number(g?.total ?? 0);

  const TURNOS_COLORS: Record<string, string> = {
    Manhã: '#0ea5e9', Tarde: '#f59e0b', Noite: '#8b5cf6', Desconhecido: '#94a3b8',
  };

  return (
    <View style={s.root}>
      <TopBar
        title="Estatísticas de Matrículas"
        subtitle={anoSelecionado?.ano || 'Ano activo'}
        rightAction={
          <TouchableOpacity onPress={carregar} disabled={loading} style={s.refreshBtn}>
            {loading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="refresh" size={18} color={Colors.primary} />}
          </TouchableOpacity>
        }
      />

      {loading && !data && (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /><Text style={s.loadingText}>A carregar…</Text></View>
      )}

      {!!erro && !loading && (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={[s.loadingText, { color: Colors.danger }]}>{erro}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={carregar}><Text style={{ color: '#fff', fontWeight: '700' }}>Tentar novamente</Text></TouchableOpacity>
        </View>
      )}

      {data && !loading && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>

          {/* ── Cards de resumo ── */}
          <View style={s.statsGrid}>
            <StatCard icon="account-group" label="Total de Alunos"   value={totalGlobal}         color="#0ea5e9" />
            <StatCard icon="gender-male"   label="Masculino"         value={Number(g?.masc ?? 0)} sub={`${pct(Number(g?.masc ?? 0), totalGlobal)}%`} color="#3b82f6" />
            <StatCard icon="gender-female" label="Feminino"          value={Number(g?.fem ?? 0)}  sub={`${pct(Number(g?.fem ?? 0), totalGlobal)}%`} color="#ec4899" />
            <StatCard icon="school"        label="Turmas"            value={Number(g?.turmas ?? 0)} color="#8b5cf6" />
            <StatCard icon="format-list-numbered" label="Classes"   value={Number(g?.classes ?? 0)} color="#0d9488" />
            <StatCard icon="account-plus"  label="Novas Admissões"   value={data.novasAdmissoes}  color="#22c55e" sub="este ano" />
          </View>

          {/* ── Género global ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Distribuição por Género</Text>
            <BarRow label="Masculino" value={Number(g?.masc ?? 0)} total={totalGlobal} color="#3b82f6" />
            <BarRow label="Feminino"  value={Number(g?.fem ?? 0)}  total={totalGlobal} color="#ec4899" />
          </View>

          {/* ── Abas ── */}
          <View style={s.tabRow}>
            {(['classe', 'curso', 'turno'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.tabBtn, abaActiva === t && s.tabBtnActive]}
                onPress={() => setAbaActiva(t)}
              >
                <Text style={[s.tabBtnText, abaActiva === t && s.tabBtnTextActive]}>
                  {t === 'classe' ? 'Por Classe' : t === 'curso' ? 'Por Curso (II Ciclo)' : 'Por Turno'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Por Classe ── */}
          {abaActiva === 'classe' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Alunos por Classe</Text>
              {Object.entries(porClasseAgrupado).map(([cls, v]) => (
                <View key={cls} style={s.tableRow}>
                  <View style={s.classBadge}><Text style={s.classBadgeText}>{cls}ª</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.genderMiniRow}>
                      <View style={[s.genderMiniBar, { flex: v.masc, backgroundColor: '#3b82f644' }]} />
                      <View style={[s.genderMiniBar, { flex: v.fem,  backgroundColor: '#ec489944' }]} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                      <Text style={s.genderMiniLabel}><Text style={{ color: '#3b82f6' }}>♂ {v.masc}</Text>  <Text style={{ color: '#ec4899' }}>♀ {v.fem}</Text></Text>
                      <Text style={s.genderMiniLabel}>{pct(v.total, totalGlobal)}% do total</Text>
                    </View>
                  </View>
                  <Text style={s.tableTotal}>{v.total}</Text>
                </View>
              ))}
              {Object.keys(porClasseAgrupado).length === 0 && (
                <Text style={s.emptyText}>Sem dados disponíveis</Text>
              )}
            </View>
          )}

          {/* ── Por Curso ── */}
          {abaActiva === 'curso' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Alunos por Curso — II Ciclo</Text>
              {(data.porCurso || []).length === 0
                ? <Text style={s.emptyText}>Sem alunos do II Ciclo com curso definido</Text>
                : (data.porCurso || []).map((r, i) => (
                  <View key={i} style={s.tableRow}>
                    <View style={[s.classBadge, { backgroundColor: '#8b5cf622', borderColor: '#8b5cf6' }]}>
                      <Text style={[s.classBadgeText, { color: '#8b5cf6' }]}>{r.classe}ª</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cursoNome} numberOfLines={1}>{r.curso || 'Sem curso'}</Text>
                      <Text style={s.genderMiniLabel}><Text style={{ color: '#3b82f6' }}>♂ {Number(r.masc)}</Text>  <Text style={{ color: '#ec4899' }}>♀ {Number(r.fem)}</Text></Text>
                    </View>
                    <Text style={s.tableTotal}>{Number(r.total)}</Text>
                  </View>
                ))
              }
            </View>
          )}

          {/* ── Por Turno ── */}
          {abaActiva === 'turno' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Alunos por Turno</Text>
              {Object.entries(porTurnoAgrupado).map(([turno, v]) => {
                const cor = TURNOS_COLORS[turno] || '#94a3b8';
                return (
                  <View key={turno} style={s.tableRow}>
                    <View style={[s.classBadge, { backgroundColor: cor + '22', borderColor: cor, minWidth: 60 }]}>
                      <Text style={[s.classBadgeText, { color: cor, fontSize: 10 }]}>{turno}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <BarRow label="" value={v.total} total={totalGlobal} color={cor} />
                      <Text style={s.genderMiniLabel}><Text style={{ color: '#3b82f6' }}>♂ {v.masc}</Text>  <Text style={{ color: '#ec4899' }}>♀ {v.fem}</Text></Text>
                    </View>
                    <Text style={s.tableTotal}>{v.total}</Text>
                  </View>
                );
              })}
              {Object.keys(porTurnoAgrupado).length === 0 && (
                <Text style={s.emptyText}>Sem dados disponíveis</Text>
              )}
            </View>
          )}

          {/* ── Tabela detalhada (todos os dados brutos) ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Detalhe por Classe e Turno</Text>
            {/* Cabeçalho */}
            <View style={[s.tableRow, { backgroundColor: '#1e293b', borderRadius: 6, paddingVertical: 6 }]}>
              <Text style={[s.thText, { flex: 1 }]}>Classe</Text>
              <Text style={[s.thText, { width: 70 }]}>Turno</Text>
              <Text style={[s.thText, { width: 50, textAlign: 'right' }]}>♂</Text>
              <Text style={[s.thText, { width: 50, textAlign: 'right' }]}>♀</Text>
              <Text style={[s.thText, { width: 60, textAlign: 'right' }]}>Total</Text>
            </View>
            {classesSorted.map((r, i) => (
              <View key={i} style={[s.tableRow, { backgroundColor: i % 2 === 0 ? Colors.card : Colors.background }]}>
                <Text style={[s.tdText, { flex: 1 }]}>{r.classe}ª Classe</Text>
                <Text style={[s.tdText, { width: 70 }]}>{r.turno}</Text>
                <Text style={[s.tdText, { width: 50, textAlign: 'right', color: '#3b82f6' }]}>{Number(r.masc)}</Text>
                <Text style={[s.tdText, { width: 50, textAlign: 'right', color: '#ec4899' }]}>{Number(r.fem)}</Text>
                <Text style={[s.tdText, { width: 60, textAlign: 'right', fontWeight: '700', color: Colors.text }]}>{Number(r.total)}</Text>
              </View>
            ))}
            {classesSorted.length === 0 && <Text style={s.emptyText}>Sem dados</Text>}
            {/* Totais */}
            {classesSorted.length > 0 && (
              <View style={[s.tableRow, { backgroundColor: Colors.primary + '18', borderTopWidth: 1, borderTopColor: Colors.primary + '44' }]}>
                <Text style={[s.tdText, { flex: 1, fontWeight: '800', color: Colors.text }]}>TOTAL</Text>
                <Text style={{ width: 70 }} />
                <Text style={[s.tdText, { width: 50, textAlign: 'right', fontWeight: '800', color: '#3b82f6' }]}>{Number(g?.masc ?? 0)}</Text>
                <Text style={[s.tdText, { width: 50, textAlign: 'right', fontWeight: '800', color: '#ec4899' }]}>{Number(g?.fem ?? 0)}</Text>
                <Text style={[s.tdText, { width: 60, textAlign: 'right', fontWeight: '900', color: Colors.primary }]}>{totalGlobal}</Text>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 14, color: Colors.textMuted, marginTop: 8 },
  retryBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  refreshBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: 110, backgroundColor: Colors.card,
    borderRadius: 12, padding: 14, alignItems: 'center',
    borderTopWidth: 3, borderColor: Colors.border, borderWidth: 1,
  },
  statValue: { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  statLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', fontWeight: '600' },
  statSub:   { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 6 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { width: 80, fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  barTrack: { flex: 1, height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  barFill:  { height: 10, borderRadius: 5 },
  barCount: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700', color: Colors.text },
  barPct:   { width: 34, textAlign: 'right', fontSize: 11, color: Colors.textMuted },

  tabRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabBtnTextActive: { color: '#fff' },

  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 6 },
  classBadge: {
    width: 44, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary + '22', borderWidth: 1, borderColor: Colors.primary,
  },
  classBadgeText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  genderMiniRow: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 2 },
  genderMiniBar: { height: 8 },
  genderMiniLabel: { fontSize: 11, color: Colors.textMuted },
  tableTotal: { width: 44, textAlign: 'right', fontSize: 15, fontWeight: '900', color: Colors.text },
  cursoNome: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 2 },

  thText: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', paddingHorizontal: 4 },
  tdText: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 4, paddingVertical: 1 },
  emptyText: { textAlign: 'center', color: Colors.textMuted, fontSize: 13, padding: 16 },
});
