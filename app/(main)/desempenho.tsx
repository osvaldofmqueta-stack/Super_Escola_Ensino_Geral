import React, { useState, useMemo } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';

const { width } = Dimensions.get('window');

function classifyNota(media: number) {
  if (media >= 14) return { label: 'Excelente', color: '#2ECC71' };
  if (media >= 10) return { label: 'Aprovado', color: Colors.info };
  if (media >= 8)  return { label: 'Em Risco', color: Colors.warning };
  return { label: 'Reprovado', color: Colors.danger };
}

function AvatarCircle({ nome, cor }: { nome: string; cor: string }) {
  const initials = nome.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: cor + '33', borderColor: cor + '88' }]}>
      <Text style={[styles.avatarText, { color: cor }]}>{initials}</Text>
    </View>
  );
}

export default function DesempenhoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { alunos, turmas, notas, presencas } = useData();

  const [filtroTurma, setFiltroTurma] = useState<string>('all');
  const [filtroTrimestre, setFiltroTrimestre] = useState<string>('all');
  const [filtroDisciplina, setFiltroDisciplina] = useState<string>('all');
  const [filtroStatus, setFiltroStatus] = useState<'all' | 'aprovado' | 'risco' | 'reprovado'>('all');
  const [busca, setBusca] = useState('');
  const [tabActiva, setTabActiva] = useTabMemory<'alunos' | 'turmas'>('desempenho', 'alunos');

  const turmasAtivas = useMemo(() => turmas.filter(t => t.ativo), [turmas]);
  const alunosAtivos = useMemo(() => alunos.filter(a => a.ativo), [alunos]);

  const disciplinas = useMemo(() => {
    const notasFiltradas = filtroTurma === 'all' ? notas : notas.filter(n => n.turmaId === filtroTurma);
    return ['all', ...Array.from(new Set(notasFiltradas.map(n => n.disciplina)))];
  }, [notas, filtroTurma]);

  const mediaAluno = useMemo(() => {
    return alunosAtivos.map(aluno => {
      const notasAluno = notas.filter(n => {
        if (n.alunoId !== aluno.id) return false;
        if (filtroTurma !== 'all' && n.turmaId !== filtroTurma) return false;
        if (filtroTrimestre !== 'all' && String(n.trimestre) !== filtroTrimestre) return false;
        if (filtroDisciplina !== 'all' && n.disciplina !== filtroDisciplina) return false;
        return true;
      });
      const turma = turmasAtivas.find(t => t.id === aluno.turmaId);
      if (!notasAluno.length) {
        return { aluno, turma, media: -1, totalDisciplinas: 0, notasAluno };
      }
      const total = notasAluno.reduce((s, n) => s + (n.nf > 0 ? n.nf : n.mac > 0 ? n.mac : n.mt1), 0);
      const media = total / notasAluno.length;
      return { aluno, turma, media, totalDisciplinas: notasAluno.length, notasAluno };
    });
  }, [alunosAtivos, notas, turmasAtivas, filtroTurma, filtroTrimestre, filtroDisciplina]);

  const alunosFiltrados = useMemo(() => {
    return mediaAluno
      .filter(({ aluno, turma, media }) => {
        if (filtroTurma !== 'all' && aluno.turmaId !== filtroTurma) return false;
        if (busca.trim()) {
          const q = busca.toLowerCase();
          const nome = `${aluno.nome} ${aluno.apelido}`.toLowerCase();
          if (!nome.includes(q) && !aluno.numeroMatricula.toLowerCase().includes(q)) return false;
        }
        if (filtroStatus !== 'all' && media >= 0) {
          const cl = classifyNota(media);
          if (filtroStatus === 'aprovado' && cl.label !== 'Aprovado' && cl.label !== 'Excelente') return false;
          if (filtroStatus === 'risco' && cl.label !== 'Em Risco') return false;
          if (filtroStatus === 'reprovado' && cl.label !== 'Reprovado') return false;
        }
        return true;
      })
      .sort((a, b) => b.media - a.media);
  }, [mediaAluno, filtroTurma, filtroStatus, busca]);

  const stats = useMemo(() => {
    const comNotas = alunosFiltrados.filter(a => a.media >= 0);
    if (!comNotas.length) return { mediaGeral: 0, taxaAprovacao: 0, emRisco: 0, reprovados: 0, excelentes: 0, total: alunosFiltrados.length };
    const soma = comNotas.reduce((s, a) => s + a.media, 0);
    const mediaGeral = soma / comNotas.length;
    const aprovados = comNotas.filter(a => a.media >= 10).length;
    const emRisco = comNotas.filter(a => a.media >= 8 && a.media < 10).length;
    const reprovados = comNotas.filter(a => a.media < 8).length;
    const excelentes = comNotas.filter(a => a.media >= 14).length;
    return {
      mediaGeral,
      taxaAprovacao: Math.round((aprovados / comNotas.length) * 100),
      emRisco,
      reprovados,
      excelentes,
      total: alunosFiltrados.length,
    };
  }, [alunosFiltrados]);

  const statsTurma = useMemo(() => {
    return turmasAtivas.map(turma => {
      const alunosTurma = alunosAtivos.filter(a => a.turmaId === turma.id);
      const notasTurma = notas.filter(n => {
        if (n.turmaId !== turma.id) return false;
        if (filtroTrimestre !== 'all' && String(n.trimestre) !== filtroTrimestre) return false;
        if (filtroDisciplina !== 'all' && n.disciplina !== filtroDisciplina) return false;
        return true;
      });
      const porAluno = alunosTurma.map(a => {
        const aN = notasTurma.filter(n => n.alunoId === a.id);
        if (!aN.length) return { aluno: a, media: -1 };
        const total = aN.reduce((s, n) => s + (n.nf > 0 ? n.nf : n.mac > 0 ? n.mac : n.mt1), 0);
        return { aluno: a, media: total / aN.length };
      }).filter(x => x.media >= 0);

      const mediaMedia = porAluno.length ? porAluno.reduce((s, x) => s + x.media, 0) / porAluno.length : 0;
      const aprovados = porAluno.filter(x => x.media >= 10).length;
      return {
        turma,
        totalAlunos: alunosTurma.length,
        comNotas: porAluno.length,
        media: mediaMedia,
        taxaAprovacao: porAluno.length ? Math.round((aprovados / porAluno.length) * 100) : 0,
        melhorAluno: porAluno.sort((a, b) => b.media - a.media)[0] ?? null,
      };
    }).sort((a, b) => b.media - a.media);
  }, [turmasAtivas, alunosAtivos, notas, filtroTrimestre, filtroDisciplina]);

  const NIVEL_COLORS: Record<string, string> = {
    'Primário': Colors.success,
    'I Ciclo': Colors.info,
    'II Ciclo': '#8B5CF6',
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title="Desempenho dos Alunos" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Filtros ─────────────────────────────────────────── */}
        <View style={styles.filtrosCard}>
          <View style={styles.buscaRow}>
            <StableSearchInput
              value={busca}
              onChangeText={setBusca}
              inputStyle={styles.buscaInput}
              placeholder="Pesquisar aluno ou matrícula..."
              iconColor={Colors.textMuted}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
            <Text style={styles.filtroLabel}>Turma:</Text>
            {[{ id: 'all', nome: 'Todas' }, ...turmasAtivas].map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.filtroChip, filtroTurma === t.id && styles.filtroChipActive]}
                onPress={() => setFiltroTurma(t.id)}
              >
                <Text style={[styles.filtroChipText, filtroTurma === t.id && styles.filtroChipTextActive]}>
                  {'nome' in t ? t.nome : 'Todas'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
            <Text style={styles.filtroLabel}>Trimestre:</Text>
            {[{ id: 'all', label: 'Todos' }, { id: '1', label: '1º Trim.' }, { id: '2', label: '2º Trim.' }, { id: '3', label: '3º Trim.' }].map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.filtroChip, filtroTrimestre === f.id && styles.filtroChipActive]}
                onPress={() => setFiltroTrimestre(f.id)}
              >
                <Text style={[styles.filtroChipText, filtroTrimestre === f.id && styles.filtroChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {disciplinas.length > 2 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
              <Text style={styles.filtroLabel}>Disciplina:</Text>
              {disciplinas.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.filtroChip, filtroDisciplina === d && styles.filtroChipActive]}
                  onPress={() => setFiltroDisciplina(d)}
                >
                  <Text style={[styles.filtroChipText, filtroDisciplina === d && styles.filtroChipTextActive]}>
                    {d === 'all' ? 'Todas' : d}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Stats Resumo ─────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { borderColor: Colors.gold + '55' }]}>
            <Text style={[styles.statVal, { color: Colors.gold }]}>{stats.mediaGeral.toFixed(1)}</Text>
            <Text style={styles.statLbl}>Média Geral</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.success + '55' }]}>
            <Text style={[styles.statVal, { color: Colors.success }]}>{stats.taxaAprovacao}%</Text>
            <Text style={styles.statLbl}>Aprovação</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.info + '55' }]}>
            <Text style={[styles.statVal, { color: Colors.info }]}>{stats.excelentes}</Text>
            <Text style={styles.statLbl}>Excelentes</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.warning + '55' }]}>
            <Text style={[styles.statVal, { color: Colors.warning }]}>{stats.emRisco}</Text>
            <Text style={styles.statLbl}>Em Risco</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.danger + '55' }]}>
            <Text style={[styles.statVal, { color: Colors.danger }]}>{stats.reprovados}</Text>
            <Text style={styles.statLbl}>Reprovados</Text>
          </View>
          <View style={[styles.statBox, { borderColor: Colors.border }]}>
            <Text style={[styles.statVal, { color: Colors.text }]}>{stats.total}</Text>
            <Text style={styles.statLbl}>Alunos</Text>
          </View>
        </View>

        {/* ── Barra de classificação visual ───────────────────── */}
        {stats.total > 0 && (
          <View style={styles.barraCard}>
            <Text style={styles.barraTitle}>Distribuição por Resultado</Text>
            <View style={styles.barraRow}>
              {stats.excelentes > 0 && (
                <View style={[styles.barraSeg, { flex: stats.excelentes, backgroundColor: '#2ECC71' }]} />
              )}
              {(stats.taxaAprovacao > 0 && stats.excelentes < alunosFiltrados.filter(a => a.media >= 0).length) && (
                <View style={[styles.barraSeg, { flex: Math.max(alunosFiltrados.filter(a => a.media >= 10).length - stats.excelentes, 0), backgroundColor: Colors.info }]} />
              )}
              {stats.emRisco > 0 && (
                <View style={[styles.barraSeg, { flex: stats.emRisco, backgroundColor: Colors.warning }]} />
              )}
              {stats.reprovados > 0 && (
                <View style={[styles.barraSeg, { flex: stats.reprovados, backgroundColor: Colors.danger }]} />
              )}
            </View>
            <View style={styles.barraLegenda}>
              <View style={styles.legendaItem}><View style={[styles.legendaDot, { backgroundColor: '#2ECC71' }]} /><Text style={styles.legendaTxt}>Excelente (≥14)</Text></View>
              <View style={styles.legendaItem}><View style={[styles.legendaDot, { backgroundColor: Colors.info }]} /><Text style={styles.legendaTxt}>Aprovado (10–13)</Text></View>
              <View style={styles.legendaItem}><View style={[styles.legendaDot, { backgroundColor: Colors.warning }]} /><Text style={styles.legendaTxt}>Em Risco (8–9)</Text></View>
              <View style={styles.legendaItem}><View style={[styles.legendaDot, { backgroundColor: Colors.danger }]} /><Text style={styles.legendaTxt}>Reprovado (&lt;8)</Text></View>
            </View>
          </View>
        )}

        {/* ── Tabs ───────────────────────────────────────────── */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tabActiva === 'alunos' && styles.tabBtnActive]}
            onPress={() => setTabActiva('alunos')}
          >
            <Ionicons name="person" size={14} color={tabActiva === 'alunos' ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabBtnText, tabActiva === 'alunos' && { color: Colors.gold }]}>
              Por Aluno ({alunosFiltrados.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tabActiva === 'turmas' && styles.tabBtnActive]}
            onPress={() => setTabActiva('turmas')}
          >
            <Ionicons name="school" size={14} color={tabActiva === 'turmas' ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabBtnText, tabActiva === 'turmas' && { color: Colors.gold }]}>
              Por Turma ({statsTurma.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Filtro de status (só no tab alunos) ─────────────── */}
        {tabActiva === 'alunos' && (
          <View style={styles.statusFiltroRow}>
            {(['all', 'aprovado', 'risco', 'reprovado'] as const).map(s => {
              const labels = { all: 'Todos', aprovado: 'Aprovados', risco: 'Em Risco', reprovado: 'Reprovados' };
              const colors = { all: Colors.textSecondary, aprovado: Colors.success, risco: Colors.warning, reprovado: Colors.danger };
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusChip, filtroStatus === s && { backgroundColor: colors[s] + '22', borderColor: colors[s] + '66' }]}
                  onPress={() => setFiltroStatus(s)}
                >
                  <Text style={[styles.statusChipText, filtroStatus === s && { color: colors[s] }]}>{labels[s]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Lista de Alunos ─────────────────────────────────── */}
        {tabActiva === 'alunos' && (
          <View style={styles.listaCard}>
            {alunosFiltrados.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum aluno encontrado</Text>
                <Text style={styles.emptySubtext}>Ajuste os filtros ou registe notas primeiro</Text>
              </View>
            ) : (
              alunosFiltrados.map(({ aluno, turma, media, totalDisciplinas }, idx) => {
                const cl = media >= 0 ? classifyNota(media) : { label: 'Sem Notas', color: Colors.textMuted };
                const nomeCompleto = `${aluno.nome} ${aluno.apelido}`;
                const nivelCor = turma ? (NIVEL_COLORS[turma.nivel] ?? Colors.textMuted) : Colors.textMuted;
                const showMedal = idx < 3 && media >= 10;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <View key={aluno.id} style={[styles.alunoRow, idx > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '66' }]}>
                    <View style={styles.alunoRank}>
                      {showMedal
                        ? <Text style={styles.medalText}>{medals[idx]}</Text>
                        : <Text style={styles.rankNum}>#{idx + 1}</Text>
                      }
                    </View>
                    <AvatarCircle nome={nomeCompleto} cor={nivelCor} />
                    <View style={styles.alunoInfo}>
                      <Text style={styles.alunoNome} numberOfLines={1}>{nomeCompleto}</Text>
                      <Text style={styles.alunoMeta}>
                        {turma?.nome ?? '—'} · {totalDisciplinas} disciplina{totalDisciplinas !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.alunoRight}>
                      {media >= 0 ? (
                        <>
                          <Text style={[styles.alunoMedia, { color: cl.color }]}>{media.toFixed(1)}</Text>
                          <View style={[styles.alunoStatusBadge, { backgroundColor: cl.color + '22' }]}>
                            <Text style={[styles.alunoStatusText, { color: cl.color }]}>{cl.label}</Text>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.semNotas}>Sem notas</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Ranking de Turmas ───────────────────────────────── */}
        {tabActiva === 'turmas' && (
          <View style={styles.listaCard}>
            {statsTurma.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="school-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Sem turmas activas</Text>
              </View>
            ) : (
              statsTurma.map((item, idx) => {
                const nCor = NIVEL_COLORS[item.turma.nivel] ?? Colors.textMuted;
                const cl = item.media > 0 ? classifyNota(item.media) : { label: 'Sem Notas', color: Colors.textMuted };
                const barWidth = item.taxaAprovacao / 100;
                return (
                  <View key={item.turma.id} style={[styles.turmaRow, idx > 0 && { borderTopWidth: 1, borderTopColor: Colors.border + '66' }]}>
                    <View style={styles.turmaRowTop}>
                      <View style={[styles.turmaNivelDot, { backgroundColor: nCor }]} />
                      <View style={styles.turmaInfo}>
                        <Text style={styles.turmaNome}>{item.turma.nome}</Text>
                        <Text style={styles.turmaMeta}>
                          {item.turma.nivel} · {item.turma.turno} · {item.totalAlunos} aluno{item.totalAlunos !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={styles.turmaRight}>
                        {item.media > 0 ? (
                          <>
                            <Text style={[styles.turmaMedia, { color: cl.color }]}>{item.media.toFixed(1)}</Text>
                            <Text style={styles.turmaAprovTxt}>{item.taxaAprovacao}% aprv.</Text>
                          </>
                        ) : (
                          <Text style={styles.semNotas}>Sem notas</Text>
                        )}
                      </View>
                    </View>
                    {item.media > 0 && (
                      <View style={styles.turmaBarra}>
                        <View style={[styles.turmaBarraFill, { flex: barWidth, backgroundColor: cl.color }]} />
                        <View style={{ flex: 1 - barWidth }} />
                      </View>
                    )}
                    {item.melhorAluno && (
                      <Text style={styles.melhorAluno}>
                        🏆 Melhor: {item.melhorAluno.aluno.nome} {item.melhorAluno.aluno.apelido} — {item.melhorAluno.media.toFixed(1)}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },

  filtrosCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border },
  buscaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  buscaInput: { flex: 1, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 },
  filtrosScroll: { flexGrow: 0 },
  filtroLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, alignSelf: 'center', marginRight: 6 },
  filtroChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  filtroChipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '88' },
  filtroChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filtroChipTextActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: { flex: 1, minWidth: (width - 64) / 3, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  barraCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  barraTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 10 },
  barraRow: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  barraSeg: { borderRadius: 4 },
  barraLegenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendaDot: { width: 8, height: 8, borderRadius: 4 },
  legendaTxt: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  tabsRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive: { borderColor: Colors.gold + '88', backgroundColor: Colors.gold + '11' },
  tabBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },

  statusFiltroRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  statusChipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  listaCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },

  alunoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  alunoRank: { width: 28, alignItems: 'center' },
  rankNum: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  medalText: { fontSize: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  alunoInfo: { flex: 1 },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  alunoRight: { alignItems: 'flex-end', gap: 4 },
  alunoMedia: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  alunoStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  alunoStatusText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  semNotas: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },

  turmaRow: { padding: 14, gap: 8 },
  turmaRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  turmaNivelDot: { width: 10, height: 10, borderRadius: 5 },
  turmaInfo: { flex: 1 },
  turmaNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  turmaRight: { alignItems: 'flex-end' },
  turmaMedia: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  turmaAprovTxt: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  turmaBarra: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: Colors.border, marginTop: 2 },
  turmaBarraFill: { borderRadius: 3 },
  melhorAluno: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  emptyState: { padding: 40, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptySubtext: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
});
