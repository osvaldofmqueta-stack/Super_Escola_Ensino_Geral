import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnoEntry {
  anoLetivo: string;
  classe: string;
  mediaAnual: number;
  numTrimestres: number;
}

interface DiscResult {
  disciplina: string;
  anos: AnoEntry[];
  situacao: 'normal' | 'reprova_sem_exame' | 'exame_fechamento' | 'fechada_12';
  motivo: string;
  examesPendentes: string[];
  mediaAcumulada: number;
}

interface SituacaoContinuidade {
  alunoId: string;
  notaMin: number;
  resultado: DiscResult[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  alunoId: string;
  alunoNome: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSituacaoConfig(situacao: DiscResult['situacao']) {
  switch (situacao) {
    case 'reprova_sem_exame':
      return {
        label: 'Reprova — Sem Direito a Exame',
        color: Colors.danger,
        bg: Colors.danger + '18',
        border: Colors.danger + '60',
        icon: 'close-circle' as const,
      };
    case 'exame_fechamento':
      return {
        label: 'Exame de Época Normal (Pendente — 12ª Classe)',
        color: Colors.warning,
        bg: Colors.warning + '18',
        border: Colors.warning + '60',
        icon: 'alert-circle' as const,
      };
    case 'fechada_12':
      return {
        label: 'Exame de Época Normal — Final da 12ª Classe',
        color: Colors.info,
        bg: Colors.info + '18',
        border: Colors.info + '60',
        icon: 'school' as const,
      };
    default:
      return {
        label: 'Situação Normal',
        color: Colors.success,
        bg: Colors.success + '14',
        border: Colors.success + '50',
        icon: 'checkmark-circle' as const,
      };
  }
}

function gradeColor(v: number, notaMin: number) {
  if (v >= notaMin + 4) return Colors.success;
  if (v >= notaMin) return Colors.warning;
  return Colors.danger;
}

// ─── Regras Resumo ────────────────────────────────────────────────────────────

function RegrasCard() {
  return (
    <View style={styles.regrasCard}>
      <View style={styles.regrasHeader}>
        <Ionicons name="information-circle" size={16} color={Colors.info} />
        <Text style={styles.regrasTitle}>Regras — Disciplinas de Continuidade</Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.danger + '20' }]}>
          <Text style={[styles.regraNumText, { color: Colors.danger }]}>R1</Text>
        </View>
        <Text style={styles.regraText}>
          <Text style={styles.regraBold}>Duas negativas consecutivas</Text> em dois anos seguidos
          {' '}→ Reprova sem direito a qualquer exame, mesmo que seja apenas uma disciplina.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.warning + '20' }]}>
          <Text style={[styles.regraNumText, { color: Colors.warning }]}>R2</Text>
        </View>
        <Text style={styles.regraText}>
          <Text style={styles.regraBold}>Negativa num ano + positiva no ano seguinte</Text>
          {' '}→ Pode avançar para o ano seguinte. Ao longo dos trimestres aplicam-se apenas médias normais.{' '}
          No <Text style={styles.regraBold}>final da 12ª classe</Text> (ano de fecho) é aplicado o{' '}
          <Text style={styles.regraBold}>Exame de Época Normal</Text> para fechar a negativa anterior.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.info + '20' }]}>
          <Text style={[styles.regraNumText, { color: Colors.info }]}>R3</Text>
        </View>
        <Text style={styles.regraText}>
          A disciplina de continuidade <Text style={styles.regraBold}>fecha na 12ª classe</Text>,
          {' '}onde se contabiliza o somatório do plano curricular. O{' '}
          <Text style={styles.regraBold}>Exame de Época Normal</Text> é aplicado apenas no final desse ano,
          {' '}nunca durante os trimestres.
        </Text>
      </View>
    </View>
  );
}

// ─── Linha de Ano ─────────────────────────────────────────────────────────────

function AnoRow({ ano, notaMin, isLast }: { ano: AnoEntry; notaMin: number; isLast: boolean }) {
  const color = gradeColor(ano.mediaAnual, notaMin);
  const isNeg = ano.mediaAnual < notaMin;

  return (
    <View style={[styles.anoRow, !isLast && styles.anoRowBorder]}>
      <View style={styles.anoLeft}>
        <Text style={styles.anoLetivo}>{ano.anoLetivo}</Text>
        <Text style={styles.anoClasse}>{ano.classe}ª Classe · {ano.numTrimestres} trim.</Text>
      </View>
      <View style={[styles.anoNota, { backgroundColor: color + '18', borderColor: color + '60' }]}>
        <Text style={[styles.anoNotaVal, { color }]}>{ano.mediaAnual.toFixed(1)}</Text>
        <Text style={[styles.anoNotaLabel, { color }]}>{isNeg ? 'Negativa' : 'Positiva'}</Text>
      </View>
    </View>
  );
}

// ─── Card de Disciplina ───────────────────────────────────────────────────────

function DiscCard({ disc, notaMin }: { disc: DiscResult; notaMin: number }) {
  const cfg = getSituacaoConfig(disc.situacao);
  const [expanded, setExpanded] = useState(disc.situacao !== 'normal');

  return (
    <View style={[styles.discCard, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
      <TouchableOpacity style={styles.discHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.75}>
        <View style={styles.discHeaderLeft}>
          <Ionicons name={cfg.icon} size={18} color={cfg.color} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.discNome}>{disc.disciplina}</Text>
            <View style={[styles.situacaoBadge, { backgroundColor: cfg.color + '22' }]}>
              <Text style={[styles.situacaoBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
        </View>
        <View style={styles.discHeaderRight}>
          {disc.mediaAcumulada > 0 && (
            <View style={[styles.mediaAcumBadge, { borderColor: gradeColor(disc.mediaAcumulada, notaMin) + '60' }]}>
              <Text style={[styles.mediaAcumVal, { color: gradeColor(disc.mediaAcumulada, notaMin) }]}>
                {disc.mediaAcumulada.toFixed(1)}
              </Text>
              <Text style={styles.mediaAcumLabel}>Méd. Acum.</Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.textMuted}
            style={{ marginLeft: 8 }}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.discBody}>
          {disc.motivo ? (
            <View style={[styles.motivoBox, { borderLeftColor: cfg.color }]}>
              <Text style={[styles.motivoText, { color: cfg.color }]}>{disc.motivo}</Text>
            </View>
          ) : null}

          {disc.examesPendentes.length > 0 && (
            <View style={styles.examesPendBox}>
              <Ionicons name="document-text-outline" size={14} color={Colors.warning} />
              <Text style={styles.examesPendText}>
                Exame de Época Normal pendente — negativa de:{' '}
                <Text style={{ fontWeight: '700' }}>{disc.examesPendentes.join(', ')}</Text>
                {'. '}O exame é aplicado no final da 12ª classe.
              </Text>
            </View>
          )}

          <View style={styles.anosContainer}>
            {disc.anos.map((ano, i) => (
              <AnoRow
                key={`${ano.anoLetivo}-${ano.classe}`}
                ano={ano}
                notaMin={notaMin}
                isLast={i === disc.anos.length - 1}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContinuidadeStatusModal({ visible, onClose, alunoId, alunoNome }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SituacaoContinuidade | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!alunoId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/continuidade/situacao/${alunoId}`);
      setData(res as SituacaoContinuidade);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar situação de continuidade.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => {
    if (visible && alunoId) load();
  }, [visible, alunoId]);

  // Sumário de alertas
  const numReprova   = data?.resultado.filter(d => d.situacao === 'reprova_sem_exame').length  ?? 0;
  const numExame     = data?.resultado.filter(d => d.situacao === 'exame_fechamento' || d.situacao === 'fechada_12').length ?? 0;
  const numNormal    = data?.resultado.filter(d => d.situacao === 'normal').length ?? 0;
  const temAlertas   = numReprova > 0 || numExame > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Continuidade Curricular</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{alunoNome}</Text>
          </View>
          <TouchableOpacity onPress={load} style={styles.refreshBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {loading && (
            <View style={styles.center}>
              <AppLoader size="large" color={Colors.accent} />
              <Text style={styles.loadingText}>A calcular situação…</Text>
            </View>
          )}

          {!loading && error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={32} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && !error && data && (
            <>
              {/* Sumário */}
              {temAlertas ? (
                <View style={[styles.alertBanner, { backgroundColor: numReprova > 0 ? Colors.danger + '18' : Colors.warning + '18', borderColor: numReprova > 0 ? Colors.danger + '50' : Colors.warning + '50' }]}>
                  <Ionicons name={numReprova > 0 ? 'close-circle' : 'alert-circle'} size={20} color={numReprova > 0 ? Colors.danger : Colors.warning} />
                  <Text style={[styles.alertBannerText, { color: numReprova > 0 ? Colors.danger : Colors.warning }]}>
                    {numReprova > 0
                      ? `${numReprova} disciplina${numReprova > 1 ? 's' : ''} com REPROVA sem direito a exame`
                      : `${numExame} disciplina${numExame > 1 ? 's' : ''} com Exame de Época Normal obrigatório`}
                  </Text>
                </View>
              ) : (
                <View style={[styles.alertBanner, { backgroundColor: Colors.success + '14', borderColor: Colors.success + '40' }]}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={[styles.alertBannerText, { color: Colors.success }]}>
                    Sem alertas de continuidade
                  </Text>
                </View>
              )}

              {/* Estatísticas rápidas */}
              <View style={styles.statsRow}>
                {[
                  { label: 'Reprova s/ Exame', val: numReprova, color: Colors.danger },
                  { label: 'Época Normal', val: numExame, color: Colors.warning },
                  { label: 'Em Conformidade', val: numNormal, color: Colors.success },
                ].map(s => (
                  <View key={s.label} style={styles.statBox}>
                    <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Regras */}
              <RegrasCard />

              {/* Disciplinas */}
              {data.resultado.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="school-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>
                    Sem disciplinas de continuidade registadas para este aluno.
                  </Text>
                  <Text style={styles.emptyHint}>
                    Configure as disciplinas como "Continuidade" no catálogo de disciplinas para que o sistema possa calcular a situação.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Disciplinas de Continuidade</Text>
                  {/* Alertas primeiro */}
                  {data.resultado
                    .filter(d => d.situacao !== 'normal')
                    .map(disc => (
                      <DiscCard key={disc.disciplina} disc={disc} notaMin={data.notaMin} />
                    ))}
                  {/* Normal depois */}
                  {data.resultado
                    .filter(d => d.situacao === 'normal')
                    .map(disc => (
                      <DiscCard key={disc.disciplina} disc={disc} notaMin={data.notaMin} />
                    ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  closeBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.text,
  },
  headerSub: {
    fontSize: 12, color: Colors.textMuted, marginTop: 1,
  },
  scroll: {
    padding: 16, paddingBottom: 48,
  },
  center: {
    alignItems: 'center', paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12, color: Colors.textMuted, fontSize: 14,
  },
  errorBox: {
    alignItems: 'center', paddingVertical: 40,
  },
  errorText: {
    color: Colors.danger, fontSize: 14, textAlign: 'center', marginTop: 10,
  },
  retryBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 9,
    backgroundColor: Colors.accent + '20', borderRadius: 8,
  },
  retryText: {
    color: Colors.accent, fontWeight: '600', fontSize: 13,
  },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12,
  },
  alertBannerText: {
    fontSize: 13, fontWeight: '600', flex: 1,
  },
  statsRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
  },
  statBox: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 10,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statVal: {
    fontSize: 22, fontWeight: '800',
  },
  statLabel: {
    fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center',
  },
  regrasCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  regrasHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  regrasTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.text,
  },
  regraItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10,
  },
  regraNum: {
    width: 26, height: 26, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  regraNumText: {
    fontSize: 11, fontWeight: '800',
  },
  regraText: {
    flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 18,
  },
  regraBold: {
    fontWeight: '700', color: Colors.text,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },
  discCard: {
    borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden',
  },
  discHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 4,
  },
  discHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
  },
  discHeaderRight: {
    flexDirection: 'row', alignItems: 'center',
  },
  discNome: {
    fontSize: 14, fontWeight: '700', color: Colors.text,
  },
  situacaoBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 5, marginTop: 3,
  },
  situacaoBadgeText: {
    fontSize: 10, fontWeight: '700',
  },
  mediaAcumBadge: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignItems: 'center',
  },
  mediaAcumVal: {
    fontSize: 14, fontWeight: '800',
  },
  mediaAcumLabel: {
    fontSize: 9, color: Colors.textMuted,
  },
  discBody: {
    borderTopWidth: 1, borderTopColor: Colors.border + '40',
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10,
  },
  motivoBox: {
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10,
  },
  motivoText: {
    fontSize: 12, lineHeight: 18,
  },
  examesPendBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warning + '12', padding: 10, borderRadius: 8, marginBottom: 10,
  },
  examesPendText: {
    flex: 1, fontSize: 12, color: Colors.warning, lineHeight: 18,
  },
  anosContainer: {
    borderRadius: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  anoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.background,
  },
  anoRowBorder: {
    borderBottomWidth: 1, borderBottomColor: Colors.border + '40',
  },
  anoLeft: {},
  anoLetivo: {
    fontSize: 13, fontWeight: '700', color: Colors.text,
  },
  anoClasse: {
    fontSize: 11, color: Colors.textMuted, marginTop: 1,
  },
  anoNota: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center',
  },
  anoNotaVal: {
    fontSize: 15, fontWeight: '800',
  },
  anoNotaLabel: {
    fontSize: 10, fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 12,
  },
  emptyHint: {
    fontSize: 12, color: Colors.textMuted + '90', textAlign: 'center', marginTop: 8, lineHeight: 18,
  },
});
