import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { BarChart, LineChart } from '@/components/Charts';
import { webAlert } from '@/utils/webAlert';
import CollapsibleStats from '@/components/CollapsibleStats';

const { width } = Dimensions.get('window');
const CHART_WIDTH = Math.min(width - 64, 380);

function fmtAno(ano: string) {
  return ano.length > 7 ? ano.slice(0, 7) : ano;
}

function AprovacaoBadge({ taxa }: { taxa: number }) {
  const color = taxa >= 70 ? Colors.success : taxa >= 50 ? Colors.warning : Colors.danger;
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[styles.badgeText, { color }]}>{taxa}%</Text>
    </View>
  );
}

export default function VisaoGeralScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { alunos, turmas, notas, professores } = useData();
  const { anos, anoAtivo, setAnoSelecionado, anoSelecionado } = useAnoAcademico();
  const [transitioning, setTransitioning] = useState(false);
  const [transicaoModal, setTransicaoModal] = useState(false);
  const [fromAnoId, setFromAnoId] = useState<string | null>(null);
  const [toAnoId, setToAnoId] = useState<string | null>(null);

  const anosOrdenados = useMemo(() =>
    [...anos].sort((a, b) => a.ano.localeCompare(b.ano)),
    [anos]
  );

  const statsPerAno = useMemo(() =>
    anosOrdenados.map(ano => {
      const turmasAno = turmas.filter(t => t.anoLetivo === ano.ano);
      const turmaIds = new Set(turmasAno.map(t => t.id));
      const alunosAno = alunos.filter(a => turmaIds.has(a.turmaId));
      const notasAno = notas.filter(n => n.anoLetivo === ano.ano);
      const aprovados = notasAno.filter(n => n.mac >= 10).length;
      const taxaAprovacao = notasAno.length > 0 ? Math.round((aprovados / notasAno.length) * 100) : 0;
      const mediaGeral = notasAno.length > 0
        ? parseFloat((notasAno.reduce((s, n) => s + n.mac, 0) / notasAno.length).toFixed(1))
        : 0;
      const totalFaltas = 0;
      return {
        ano,
        totalAlunos: alunosAno.length,
        totalTurmas: turmasAno.length,
        taxaAprovacao,
        mediaGeral,
        totalNotas: notasAno.length,
        isAtivo: ano.ativo,
      };
    }),
    [anosOrdenados, turmas, alunos, notas]
  );

  const aprovacaoChart = useMemo(() =>
    statsPerAno
      .filter(s => s.taxaAprovacao > 0)
      .map(s => ({ label: fmtAno(s.ano.ano), value: s.taxaAprovacao })),
    [statsPerAno]
  );

  const mediaChart = useMemo(() =>
    statsPerAno
      .filter(s => s.mediaGeral > 0)
      .map(s => ({ label: fmtAno(s.ano.ano), value: s.mediaGeral })),
    [statsPerAno]
  );

  const canTransicao = (user?.role === 'admin' || user?.role === 'director' || user?.role === 'ceo' || user?.role === 'pca');

  async function executarTransicao() {
    if (!fromAnoId || !toAnoId) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/anos-academicos/${toAnoId}/transicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAnoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na transição');
      setTransicaoModal(false);
      webAlert(
        'Transição Concluída',
        `${data.turmasCriadas} turma(s) criada(s) para ${data.anoDestino}.\nOs alunos podem agora ser matriculados nas novas turmas.`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      webAlert('Erro', e.message || 'Não foi possível realizar a transição.');
    } finally {
      setTransitioning(false);
    }
  }

  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  return (
    <View style={styles.screen}>
      <TopBar title="Visão Geral" subtitle="Comparação multi-ano" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {anos.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-blank" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum ano académico registado</Text>
            <Text style={styles.emptySub}>Cria um ano académico em Gestão Académica para começar.</Text>
          </View>
        )}

        {anos.length > 0 && (
          <>
            <CollapsibleStats storageKey="vg-resumo" title="Resumo por Ano Lectivo" color={Colors.gold}>
              {statsPerAno.map(s => (
                <TouchableOpacity
                  key={s.ano.id}
                  style={[styles.anoCard, s.isAtivo && styles.anoCardAtivo]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setAnoSelecionado(s.ano);
                    router.push('/(main)/dashboard');
                  }}
                >
                  <View style={styles.anoCardTop}>
                    <View style={styles.anoCardLeft}>
                      <View style={styles.anoCardTitleRow}>
                        <Text style={styles.anoCardAno}>{s.ano.ano}</Text>
                        {s.isAtivo && (
                          <View style={styles.ativoBadge}>
                            <Text style={styles.ativoText}>Activo</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.anoCardSub}>
                        {s.totalAlunos} aluno{s.totalAlunos !== 1 ? 's' : ''} · {s.totalTurmas} turma{s.totalTurmas !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.anoCardRight}>
                      <AprovacaoBadge taxa={s.taxaAprovacao} />
                      <Text style={styles.anoCardAprovLabel}>aprovação</Text>
                    </View>
                  </View>

                  <View style={styles.anoCardStats}>
                    <View style={styles.anoStatItem}>
                      <Ionicons name="people" size={14} color={Colors.info} />
                      <Text style={styles.anoStatVal}>{s.totalAlunos}</Text>
                      <Text style={styles.anoStatLabel}>Alunos</Text>
                    </View>
                    <View style={styles.anoStatDivider} />
                    <View style={styles.anoStatItem}>
                      <MaterialIcons name="class" size={14} color={Colors.success} />
                      <Text style={styles.anoStatVal}>{s.totalTurmas}</Text>
                      <Text style={styles.anoStatLabel}>Turmas</Text>
                    </View>
                    <View style={styles.anoStatDivider} />
                    <View style={styles.anoStatItem}>
                      <Ionicons name="document-text" size={14} color={Colors.gold} />
                      <Text style={styles.anoStatVal}>{s.totalNotas}</Text>
                      <Text style={styles.anoStatLabel}>Notas</Text>
                    </View>
                    <View style={styles.anoStatDivider} />
                    <View style={styles.anoStatItem}>
                      <Ionicons name="trending-up" size={14} color={Colors.accent} />
                      <Text style={styles.anoStatVal}>{s.mediaGeral > 0 ? s.mediaGeral.toFixed(1) : '—'}</Text>
                      <Text style={styles.anoStatLabel}>Média</Text>
                    </View>
                  </View>

                  <View style={styles.anoCardFooter}>
                    <Text style={styles.anoCardVerBtn}>Ver dados deste ano →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </CollapsibleStats>

            {aprovacaoChart.length > 1 && (
              <CollapsibleStats storageKey="vg-aprovacao" title="Evolução da Aprovação" color={Colors.success}>
                <View style={styles.chartCard}>
                  <Text style={styles.chartLabel}>Taxa de aprovação por ano (%)</Text>
                  <LineChart
                    data={aprovacaoChart}
                    height={180}
                    width={CHART_WIDTH}
                    maxValue={100}
                  />
                </View>
              </CollapsibleStats>
            )}

            {mediaChart.length > 1 && (
              <CollapsibleStats storageKey="vg-media" title="Evolução da Média Global" color={Colors.gold}>
                <View style={styles.chartCard}>
                  <Text style={styles.chartLabel}>Média geral das notas (0–20)</Text>
                  <BarChart
                    data={mediaChart.map((d, i) => ({ ...d, color: Colors.gold }))}
                    maxValue={20}
                    height={180}
                    width={CHART_WIDTH}
                  />
                </View>
              </CollapsibleStats>
            )}

            {canTransicao && anos.length >= 2 && (
              <CollapsibleStats storageKey="vg-transicao" title="Transição de Ano" color={Colors.accent}>
                <View style={styles.transicaoCard}>
                  <MaterialCommunityIcons name="transfer" size={32} color={Colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.transicaoTitle}>Criar turmas para novo ano</Text>
                    <Text style={styles.transicaoSub}>
                      Copia a estrutura de turmas de um ano anterior para um novo ano, prontas para receber matrículas.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.transicaoBtn}
                    onPress={() => {
                      const sorted = [...anosOrdenados];
                      setFromAnoId(sorted[sorted.length - 2]?.id || null);
                      setToAnoId(sorted[sorted.length - 1]?.id || null);
                      setTransicaoModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.transicaoBtnText}>Iniciar</Text>
                  </TouchableOpacity>
                </View>
              </CollapsibleStats>
            )}
          </>
        )}
      </ScrollView>

      {transicaoModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="transfer" size={24} color={Colors.accent} />
              <Text style={styles.modalTitle}>Transição de Turmas</Text>
            </View>
            <Text style={styles.modalDesc}>
              Selecciona o ano de origem (turmas a copiar) e o ano de destino (onde serão criadas).
            </Text>

            <Text style={styles.modalLabel}>Ano de Origem:</Text>
            <View style={styles.anoSelector}>
              {anosOrdenados.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.anoOption, fromAnoId === a.id && styles.anoOptionSelected]}
                  onPress={() => setFromAnoId(a.id)}
                >
                  <Text style={[styles.anoOptionText, fromAnoId === a.id && styles.anoOptionTextSelected]}>{a.ano}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Ano de Destino:</Text>
            <View style={styles.anoSelector}>
              {anosOrdenados.filter(a => a.id !== fromAnoId).map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.anoOption, toAnoId === a.id && styles.anoOptionSelected]}
                  onPress={() => setToAnoId(a.id)}
                >
                  <Text style={[styles.anoOptionText, toAnoId === a.id && styles.anoOptionTextSelected]}>{a.ano}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {fromAnoId && toAnoId && (
              <View style={styles.transicaoInfo}>
                <Ionicons name="information-circle" size={16} color={Colors.info} />
                <Text style={styles.transicaoInfoText}>
                  As turmas de {anosOrdenados.find(a => a.id === fromAnoId)?.ano} serão copiadas para {anosOrdenados.find(a => a.id === toAnoId)?.ano} (sem alunos).
                  Os alunos poderão ser matriculados manualmente.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setTransicaoModal(false)}
                disabled={transitioning}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!fromAnoId || !toAnoId || fromAnoId === toAnoId) && styles.modalBtnDisabled]}
                onPress={executarTransicao}
                disabled={!fromAnoId || !toAnoId || fromAnoId === toAnoId || transitioning}
              >
                {transitioning
                  ? <AppLoader size="small" color="#fff" />
                  : <Text style={styles.modalConfirmText}>Confirmar Transição</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  anoCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  anoCardAtivo: {
    borderColor: `${Colors.gold}60`,
    shadowColor: Colors.gold,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  anoCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  anoCardLeft: { flex: 1, gap: 4 },
  anoCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  anoCardAno: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  ativoBadge: {
    backgroundColor: `${Colors.gold}25`,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${Colors.gold}50`,
  },
  ativoText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  anoCardSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  anoCardRight: { alignItems: 'flex-end', gap: 4 },
  anoCardAprovLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  badge: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  anoCardStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  anoStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  anoStatDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  anoStatVal: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  anoStatLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  anoCardFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  anoCardVerBtn: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  chartCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  chartLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  transicaoCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  transicaoTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  transicaoSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17 },
  transicaoBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  transicaoBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  modalLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  anoSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  anoOption: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  anoOptionSelected: {
    borderColor: Colors.gold,
    backgroundColor: `${Colors.gold}15`,
  },
  anoOptionText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  anoOptionTextSelected: { color: Colors.gold, fontFamily: 'Inter_700Bold' },
  transicaoInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${Colors.info}10`,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: `${Colors.info}30`,
  },
  transicaoInfoText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  modalConfirmBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.accent, alignItems: 'center',
  },
  modalBtnDisabled: { opacity: 0.45 },
  modalConfirmText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
