import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import ExportMenu from '@/components/ExportMenu';
import { useConfig } from '@/context/ConfigContext';

type Aba = 'por_data' | 'por_aluno';
type Periodo = '7d' | '30d' | '90d' | 'tudo';

const PERIODOS: { label: string; value: Periodo }[] = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: '3 meses', value: '90d' },
  { label: 'Tudo', value: 'tudo' },
];

function periodoInicio(p: Periodo): Date | null {
  if (p === 'tudo') return null;
  const d = new Date();
  const dias = p === '7d' ? 7 : p === '30d' ? 30 : 90;
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtData(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDataLonga(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusPill({ status }: { status: 'P' | 'F' | 'J' }) {
  const bg = status === 'P' ? Colors.success : status === 'F' ? Colors.danger : Colors.warning;
  const label = status === 'P' ? 'Presente' : status === 'F' ? 'Falta' : 'Justificado';
  return (
    <View style={[pill.wrap, { backgroundColor: bg + '22', borderColor: bg + '55' }]}>
      <Text style={[pill.text, { color: bg }]}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  text: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

export default function RelatorioFaltasScreen() {
  const { alunos, turmas, presencas, professores } = useData();
  const { user } = useAuth();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [aba, setAba] = useState<Aba>('por_data');
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [turmaId, setTurmaId] = useState<string>('todas');

  const prof = useMemo(
    () => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email),
    [professores, user]
  );

  const minhasTurmas = useMemo(
    () => prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : turmas.filter(t => t.ativo),
    [prof, turmas]
  );

  const inicio = periodoInicio(periodo);

  const presencasFiltradas = useMemo(() => {
    return presencas.filter(p => {
      if (turmaId !== 'todas' && p.turmaId !== turmaId) return false;
      if (!minhasTurmas.some(t => t.id === p.turmaId)) return false;
      if (inicio) {
        const d = new Date(p.data + 'T12:00:00');
        if (d < inicio) return false;
      }
      return true;
    });
  }, [presencas, turmaId, minhasTurmas, inicio]);

  const totalP = presencasFiltradas.filter(p => p.status === 'P').length;
  const totalF = presencasFiltradas.filter(p => p.status === 'F').length;
  const totalJ = presencasFiltradas.filter(p => p.status === 'J').length;

  // ── Agrupado por data ─────────────────────────────────────────────────────
  const groupedByData = useMemo(() => {
    const map: Record<string, typeof presencasFiltradas> = {};
    for (const p of presencasFiltradas) {
      if (!map[p.data]) map[p.data] = [];
      map[p.data].push(p);
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([data, items]) => ({
        data,
        items,
        presentes: items.filter(i => i.status === 'P').length,
        faltas: items.filter(i => i.status === 'F').length,
        justificados: items.filter(i => i.status === 'J').length,
      }));
  }, [presencasFiltradas]);

  // ── Agrupado por aluno ────────────────────────────────────────────────────
  const groupedByAluno = useMemo(() => {
    const map: Record<string, { presentes: number; faltas: number; justificados: number }> = {};
    for (const p of presencasFiltradas) {
      if (!map[p.alunoId]) map[p.alunoId] = { presentes: 0, faltas: 0, justificados: 0 };
      if (p.status === 'P') map[p.alunoId].presentes++;
      else if (p.status === 'F') map[p.alunoId].faltas++;
      else if (p.status === 'J') map[p.alunoId].justificados++;
    }
    return Object.entries(map)
      .map(([alunoId, stats]) => {
        const aluno = alunos.find(a => a.id === alunoId);
        const total = stats.presentes + stats.faltas + stats.justificados;
        const taxaFalta = total > 0 ? Math.round((stats.faltas / total) * 100) : 0;
        return { alunoId, aluno, ...stats, total, taxaFalta };
      })
      .sort((a, b) => b.faltas - a.faltas);
  }, [presencasFiltradas, alunos]);

  // Art. 23º §7 — faltas injustificadas por trimestre por aluno (Decreto 04/2026)
  // Limite mínimo (caso mais restritivo): 3F/trim (1 tempo/sem); máx: 5F/trim (>2 tempos/sem).
  // O enforcement exacto (bloqueio) é feito no backend com base na cargaHoraria da disciplina.
  // Aqui usamos o mínimo legal como limiar de alerta visual conservador.
  const LIMITE_ART23 = 3;
  const faltasPorTrimestre = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    for (const p of presencasFiltradas) {
      if (p.status !== 'F') continue;
      const m = new Date(p.data + 'T12:00:00').getMonth() + 1;
      const t = m >= 2 && m <= 4 ? 1 : m >= 5 && m <= 8 ? 2 : m >= 9 && m <= 11 ? 3 : 0;
      if (t === 0) continue;
      if (!map[p.alunoId]) map[p.alunoId] = {};
      map[p.alunoId][t] = (map[p.alunoId][t] ?? 0) + 1;
    }
    return map;
  }, [presencasFiltradas]);

  // ── Export rows ───────────────────────────────────────────────────────────
  const exportRows = useMemo(() => presencasFiltradas.map(p => {
    const aluno = alunos.find(a => a.id === p.alunoId);
    const turma = turmas.find(t => t.id === p.turmaId);
    return {
      data: fmtData(p.data),
      turma: turma?.nome ?? '-',
      matricula: aluno?.numeroMatricula ?? '-',
      nome: aluno ? `${aluno.nome} ${aluno.apelido}` : '-',
      disciplina: p.disciplina ?? '-',
      estado: p.status === 'P' ? 'Presente' : p.status === 'F' ? 'Falta' : 'Justificado',
    };
  }), [presencasFiltradas, alunos, turmas]);

  const turmaNomeActiva = turmaId === 'todas'
    ? 'Todas as Turmas'
    : turmas.find(t => t.id === turmaId)?.nome ?? '';

  return (
    <View style={s.screen}>
      <TopBar title="Relatório de Faltas" subtitle="Presenças registadas" />

      {/* Filtro de turma */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        <TouchableOpacity
          style={[s.chip, turmaId === 'todas' && s.chipActive]}
          onPress={() => setTurmaId('todas')}
        >
          <Text style={[s.chipText, turmaId === 'todas' && s.chipTextActive]}>Todas</Text>
        </TouchableOpacity>
        {minhasTurmas.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.chip, turmaId === t.id && s.chipActive]}
            onPress={() => setTurmaId(t.id)}
          >
            <Text style={[s.chipText, turmaId === t.id && s.chipTextActive]}>{t.nome}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtro de período */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {PERIODOS.map(p => (
          <TouchableOpacity
            key={p.value}
            style={[s.chip, periodo === p.value && s.chipActive]}
            onPress={() => setPeriodo(p.value)}
          >
            <Text style={[s.chipText, periodo === p.value && s.chipTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Resumo */}
      <View style={s.statsBar}>
        {[
          { label: 'Presentes', value: totalP, color: Colors.success },
          { label: 'Faltas', value: totalF, color: Colors.danger },
          { label: 'Justificados', value: totalJ, color: Colors.warning },
          { label: 'Registos', value: presencasFiltradas.length, color: Colors.info },
        ].map(st => (
          <View key={st.label} style={s.statItem}>
            <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Abas + Exportar */}
      <View style={s.abaRow}>
        <View style={s.abaGroup}>
          <TouchableOpacity
            style={[s.aba, aba === 'por_data' && s.abaActive]}
            onPress={() => setAba('por_data')}
          >
            <Ionicons name="calendar-outline" size={14} color={aba === 'por_data' ? Colors.goldLight : Colors.textMuted} />
            <Text style={[s.abaText, aba === 'por_data' && s.abaTextActive]}>Por Data</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.aba, aba === 'por_aluno' && s.abaActive]}
            onPress={() => setAba('por_aluno')}
          >
            <Ionicons name="people-outline" size={14} color={aba === 'por_aluno' ? Colors.goldLight : Colors.textMuted} />
            <Text style={[s.abaText, aba === 'por_aluno' && s.abaTextActive]}>Por Aluno</Text>
          </TouchableOpacity>
        </View>
        <ExportMenu
          title={`Relatório de Faltas — ${turmaNomeActiva}`}
          columns={[
            { header: 'Data', key: 'data', width: 12 },
            { header: 'Turma', key: 'turma', width: 14 },
            { header: 'Nº Matrícula', key: 'matricula', width: 14 },
            { header: 'Nome', key: 'nome', width: 26 },
            { header: 'Disciplina', key: 'disciplina', width: 16 },
            { header: 'Estado', key: 'estado', width: 12 },
          ]}
          rows={exportRows}
          school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola' }}
          filename={`relatorio_faltas_${turmaId}_${periodo}`}
          subtitle={`Período: ${PERIODOS.find(p => p.value === periodo)?.label}`}
        />
      </View>

      {/* Conteúdo */}
      {aba === 'por_data' ? (
        <FlatList
          data={groupedByData}
          keyExtractor={item => item.data}
          contentContainerStyle={[s.list, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyText}>Nenhum registo encontrado</Text>
              <Text style={s.emptySubText}>Tente ajustar o período ou a turma seleccionada.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardHeaderLeft}>
                  <Ionicons name="calendar" size={14} color={Colors.gold} />
                  <Text style={s.cardDate}>{fmtDataLonga(item.data)}</Text>
                </View>
                <View style={s.cardBadges}>
                  {item.presentes > 0 && (
                    <View style={[s.badge, { backgroundColor: Colors.success + '22' }]}>
                      <Text style={[s.badgeText, { color: Colors.success }]}>P {item.presentes}</Text>
                    </View>
                  )}
                  {item.faltas > 0 && (
                    <View style={[s.badge, { backgroundColor: Colors.danger + '22' }]}>
                      <Text style={[s.badgeText, { color: Colors.danger }]}>F {item.faltas}</Text>
                    </View>
                  )}
                  {item.justificados > 0 && (
                    <View style={[s.badge, { backgroundColor: Colors.warning + '22' }]}>
                      <Text style={[s.badgeText, { color: Colors.warning }]}>J {item.justificados}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={s.divider} />
              {item.items.map(p => {
                const aluno = alunos.find(a => a.id === p.alunoId);
                const turma = turmas.find(t => t.id === p.turmaId);
                return (
                  <View key={p.id} style={s.entryRow}>
                    <View style={s.entryAvatar}>
                      <Text style={s.entryAvatarText}>
                        {aluno ? `${aluno.nome.charAt(0)}${aluno.apelido.charAt(0)}` : '?'}
                      </Text>
                    </View>
                    <View style={s.entryInfo}>
                      <Text style={s.entryNome} numberOfLines={1}>
                        {aluno ? `${aluno.nome} ${aluno.apelido}` : 'Aluno desconhecido'}
                      </Text>
                      <Text style={s.entrySub}>
                        {turma?.nome ?? '-'} · {p.disciplina ?? '-'}
                      </Text>
                    </View>
                    <StatusPill status={p.status as 'P' | 'F' | 'J'} />
                  </View>
                );
              })}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={groupedByAluno}
          keyExtractor={item => item.alunoId}
          contentContainerStyle={[s.list, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
              <Text style={s.emptyText}>Nenhum registo encontrado</Text>
            </View>
          }
          renderItem={({ item }) => {
            // Art. 23º §7 — faltas por trimestre (informativo; limite exacto 3–5 calculado pelo backend)
            const trims = faltasPorTrimestre[item.alunoId] ?? {};
            const faltasT1 = trims[1] ?? 0;
            const faltasT2 = trims[2] ?? 0;
            const faltasT3 = trims[3] ?? 0;
            const maxFaltasTrim = Math.max(faltasT1, faltasT2, faltasT3);
            // Cor baseada em % total (indicador visual; enforcement exacto é no backend)
            const riscoPct = item.taxaFalta >= 25;
            const avisoPct = item.taxaFalta >= 15;
            const barColor = riscoPct ? Colors.danger : avisoPct ? Colors.warning : Colors.success;
            // Alerta quando algum trimestre atinge o limite mínimo do Art.23 §7 (3F)
            const alertaFaltasTrim = maxFaltasTrim >= LIMITE_ART23;
            return (
              <View style={s.alunoCard}>
                <View style={s.alunoRow}>
                  <View style={[s.alunoAvatar, { backgroundColor: barColor + '22' }]}>
                    <Text style={[s.alunoAvatarText, { color: barColor }]}>
                      {item.aluno ? `${item.aluno.nome.charAt(0)}${item.aluno.apelido.charAt(0)}` : '?'}
                    </Text>
                  </View>
                  <View style={s.alunoInfo}>
                    <Text style={s.alunoNome} numberOfLines={1}>
                      {item.aluno ? `${item.aluno.nome} ${item.aluno.apelido}` : 'Desconhecido'}
                    </Text>
                    <Text style={s.alunoMat}>{item.aluno?.numeroMatricula ?? '-'}</Text>
                  </View>
                  {alertaFaltasTrim && (
                    <View style={[s.riscoBadge, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '55' }]}>
                      <Ionicons name="alert-circle" size={11} color={Colors.warning} />
                      <Text style={[s.riscoText, { color: Colors.warning }]}>≥3F/trim.</Text>
                    </View>
                  )}
                  {riscoPct && (
                    <View style={[s.riscoBadge, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '55' }]}>
                      <Ionicons name="warning" size={11} color={Colors.danger} />
                      <Text style={[s.riscoText, { color: Colors.danger }]}>Em Risco</Text>
                    </View>
                  )}
                </View>

                {/* Faltas por trimestre — Art. 23º §7 (informativo; limite exacto depende da carga horária) */}
                {(faltasT1 > 0 || faltasT2 > 0 || faltasT3 > 0) && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                    {[{ t: 1, v: faltasT1 }, { t: 2, v: faltasT2 }, { t: 3, v: faltasT3 }].filter(x => x.v > 0).map(({ t, v }) => {
                      const c = v >= LIMITE_ART23 ? Colors.warning : Colors.textMuted;
                      return (
                        <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c + '18', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, color: c, fontFamily: 'Inter_600SemiBold' }}>{`T${t}: ${v}F`}</Text>
                        </View>
                      );
                    })}
                    <Text style={{ fontSize: 10, color: Colors.textMuted, alignSelf: 'center' }}>Art.23§7: lim. 3–5/trim.</Text>
                  </View>
                )}

                {/* Barra de progresso */}
                <View style={s.progressWrap}>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, {
                      width: `${Math.min(item.taxaFalta, 100)}%` as any,
                      backgroundColor: barColor,
                    }]} />
                  </View>
                  <Text style={[s.progressPct, { color: barColor }]}>{item.taxaFalta}% faltas</Text>
                </View>

                {/* Contagens */}
                <View style={s.alunoStats}>
                  {[
                    { label: 'Presentes', value: item.presentes, color: Colors.success },
                    { label: 'Faltas', value: item.faltas, color: Colors.danger },
                    { label: 'Justific.', value: item.justificados, color: Colors.warning },
                    { label: 'Total', value: item.total, color: Colors.textSecondary },
                  ].map(st => (
                    <View key={st.label} style={s.alunoStat}>
                      <Text style={[s.alunoStatVal, { color: st.color }]}>{st.value}</Text>
                      <Text style={s.alunoStatLabel}>{st.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  filterScroll: { maxHeight: 46 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  statsBar: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, marginHorizontal: 16, marginVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  abaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10, gap: 8 },
  abaGroup: { flex: 1, flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: Colors.border },
  aba: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 10 },
  abaActive: { backgroundColor: Colors.backgroundCard },
  abaText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  abaTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  list: { paddingHorizontal: 16 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDate: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  cardBadges: { flexDirection: 'row', gap: 5 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  entryAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  entryAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  entryInfo: { flex: 1 },
  entryNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  entrySub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  alunoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  alunoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  alunoAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alunoAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  alunoInfo: { flex: 1 },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoMat: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  riscoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  riscoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.surface, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 11, fontFamily: 'Inter_600SemiBold', minWidth: 60, textAlign: 'right' },
  alunoStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  alunoStat: { flex: 1, alignItems: 'center', gap: 2 },
  alunoStatVal: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  alunoStatLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptySubText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
});
