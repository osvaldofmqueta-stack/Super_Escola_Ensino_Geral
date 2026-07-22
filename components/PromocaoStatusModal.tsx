import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Situacao10 = 'aprovado' | 'negativa_exame_terminal' | 'negativa_continuidade' | 'reprova_abaixo_minimo';
type Situacao11 = 'aprovado' | 'reprova_r1' | 'negativa_exame_terminal' | 'negativa_continuidade' | 'reprova_abaixo_minimo';
type SituacaoGeral = 'aprovado' | 'aprovado_com_condicoes' | 'reprovado';

interface Disciplina10 {
  disciplina: string;
  tipo: string;
  classeFim: string;
  mediaAnual: number;
  numTrimestres: number;
  situacao: Situacao10;
}

interface Disciplina11 {
  disciplina: string;
  tipo: string;
  classeFim: string;
  mediaAnual: number;
  media10: number | null;
  numTrimestres: number;
  situacao: Situacao11;
  motivo: string;
}

interface Resposta10 {
  alunoId: string;
  nomeAluno: string;
  classe: '10';
  anoLetivo: string;
  notaMin: number;
  notaMinAbsoluta: number;
  maxNegativasPermitidas: number;
  situacaoGeral: SituacaoGeral;
  motivoGeral: string;
  disciplinas: Disciplina10[];
}

interface Resposta11 {
  alunoId: string;
  nomeAluno: string;
  classe: '11';
  anoLetivo: string;
  notaMin: number;
  notaMinAbsoluta: number;
  situacaoGeral: SituacaoGeral;
  motivoGeral: string;
  numNegativas: number;
  disciplinas: Disciplina11[];
}

interface RespostaOutros {
  alunoId: string;
  nomeAluno: string;
  classe: string;
  anoLetivo: string;
  notaMin: number;
  numNegativas?: number;
  disciplinas: { disciplina: string; tipo: string; mediaAnual: number; numTrimestres: number; aprovado: boolean }[];
  info?: string;
}

type Resposta = Resposta10 | Resposta11 | RespostaOutros;

interface Props {
  visible: boolean;
  onClose: () => void;
  alunoId: string;
  alunoNome: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function geralConfig(situacao: SituacaoGeral) {
  switch (situacao) {
    case 'reprovado':
      return { color: Colors.danger, bg: Colors.danger + '18', border: Colors.danger + '50', icon: 'close-circle' as const, label: 'REPROVADO' };
    case 'aprovado_com_condicoes':
      return { color: Colors.warning, bg: Colors.warning + '18', border: Colors.warning + '50', icon: 'alert-circle' as const, label: 'Aprovado com Condições' };
    default:
      return { color: Colors.success, bg: Colors.success + '14', border: Colors.success + '40', icon: 'checkmark-circle' as const, label: 'Aprovado' };
  }
}

function disc10Config(situacao: Situacao10) {
  switch (situacao) {
    case 'reprova_abaixo_minimo':
      return { color: Colors.danger, label: 'Abaixo do mínimo (< 7)', icon: 'close-circle' as const };
    case 'negativa_exame_terminal':
      return { color: Colors.warning, label: 'Negativa — Exame Época Normal (10ª)', icon: 'document-text' as const };
    case 'negativa_continuidade':
      return { color: Colors.info, label: 'Negativa — Arrasta para 11ª/12ª', icon: 'git-branch' as const };
    default:
      return { color: Colors.success, label: 'Positiva', icon: 'checkmark-circle' as const };
  }
}

function disc11Config(situacao: Situacao11) {
  switch (situacao) {
    case 'reprova_abaixo_minimo':
      return { color: Colors.danger, label: 'Abaixo do mínimo (< 7)', icon: 'close-circle' as const };
    case 'reprova_r1':
      return { color: Colors.danger, label: 'Negativa consecutiva — Reprova (R1)', icon: 'close-circle' as const };
    case 'negativa_exame_terminal':
      return { color: Colors.warning, label: 'Negativa — Exame Época Normal (11ª)', icon: 'document-text' as const };
    case 'negativa_continuidade':
      return { color: Colors.info, label: 'Negativa — Arrasta para 12ª', icon: 'git-branch' as const };
    default:
      return { color: Colors.success, label: 'Positiva', icon: 'checkmark-circle' as const };
  }
}

function gradeColor(v: number, min: number) {
  if (v < 7) return Colors.danger;
  if (v < min) return Colors.warning;
  if (v >= min + 4) return Colors.success;
  return Colors.success + 'cc';
}

// ─── Regras da 10ª Classe ─────────────────────────────────────────────────────

function RegrasCard10() {
  return (
    <View style={styles.regrasCard}>
      <View style={styles.regrasHeader}>
        <Ionicons name="information-circle" size={16} color={Colors.info} />
        <Text style={styles.regrasTitle}>Regras de Promoção — 10ª Classe</Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.success + '20' }]}>
          <Ionicons name="checkmark" size={13} color={Colors.success} />
        </View>
        <Text style={styles.regraText}>
          Sem histórico anterior. Pode avançar com{' '}
          <Text style={styles.regraBold}>até 2 negativas</Text>, desde que cada negativa
          tenha no mínimo <Text style={styles.regraBold}>7 valores</Text>.
          As negativas podem ser em qualquer disciplina.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.danger + '20' }]}>
          <Ionicons name="close" size={13} color={Colors.danger} />
        </View>
        <Text style={styles.regraText}>
          Qualquer disciplina com média{' '}
          <Text style={styles.regraBold}>abaixo de 7 valores</Text> ou{' '}
          <Text style={styles.regraBold}>mais de 2 negativas</Text> → Reprova directamente.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.warning + '20' }]}>
          <Ionicons name="document-text" size={13} color={Colors.warning} />
        </View>
        <Text style={styles.regraText}>
          Disciplina <Text style={styles.regraBold}>terminal</Text> na 10ª com negativa →{' '}
          Exame de Época Normal já na 10ª classe.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.info + '20' }]}>
          <Ionicons name="git-branch" size={13} color={Colors.info} />
        </View>
        <Text style={styles.regraText}>
          Disciplina de <Text style={styles.regraBold}>continuidade</Text> com negativa →
          arrasta-se para a 11ª/12ª classe (R2 aplica-se).
        </Text>
      </View>
    </View>
  );
}

// ─── Regras da 11ª Classe ─────────────────────────────────────────────────────

function RegrasCard11() {
  return (
    <View style={styles.regrasCard}>
      <View style={styles.regrasHeader}>
        <Ionicons name="information-circle" size={16} color={Colors.info} />
        <Text style={styles.regrasTitle}>Regras de Promoção — 11ª Classe</Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.danger + '20' }]}>
          <Ionicons name="close" size={13} color={Colors.danger} />
        </View>
        <Text style={styles.regraText}>
          <Text style={styles.regraBold}>R1 —</Text> Negativa consecutiva na mesma
          disciplina de continuidade (10ª + 11ª) →{' '}
          <Text style={styles.regraBold}>Reprova sem direito a exame.</Text>
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.danger + '20' }]}>
          <Ionicons name="close" size={13} color={Colors.danger} />
        </View>
        <Text style={styles.regraText}>
          Qualquer disciplina com média{' '}
          <Text style={styles.regraBold}>abaixo de 7 valores</Text> → Reprova directamente.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.warning + '20' }]}>
          <Ionicons name="document-text" size={13} color={Colors.warning} />
        </View>
        <Text style={styles.regraText}>
          Disciplina <Text style={styles.regraBold}>terminal</Text> na 11ª com negativa →{' '}
          Exame de Época Normal já na 11ª classe.
        </Text>
      </View>
      <View style={styles.regraItem}>
        <View style={[styles.regraNum, { backgroundColor: Colors.info + '20' }]}>
          <Ionicons name="git-branch" size={13} color={Colors.info} />
        </View>
        <Text style={styles.regraText}>
          Disciplina de <Text style={styles.regraBold}>continuidade</Text> com negativa
          (sem R1) → arrasta-se para a 12ª classe.{' '}
          <Text style={styles.regraBold}>R2</Text> aplica-se no ano de fecho (12ª).
        </Text>
      </View>
    </View>
  );
}

// ─── Card de Disciplina 10ª ───────────────────────────────────────────────────

function DiscCard10({ disc, notaMin }: { disc: Disciplina10; notaMin: number }) {
  const cfg = disc10Config(disc.situacao);
  return (
    <View style={[styles.discCard, { borderColor: cfg.color + '60', backgroundColor: cfg.color + '0D' }]}>
      <View style={styles.discRow}>
        <View style={styles.discLeft}>
          <Ionicons name={cfg.icon} size={16} color={cfg.color} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.discNome} numberOfLines={1}>{disc.disciplina}</Text>
            <View style={styles.discMeta}>
              <View style={[styles.tipoBadge, { backgroundColor: disc.tipo === 'terminal' ? Colors.warning + '20' : Colors.info + '20' }]}>
                <Text style={[styles.tipoBadgeText, { color: disc.tipo === 'terminal' ? Colors.warning : Colors.info }]}>
                  {disc.tipo === 'terminal' ? 'Terminal' : 'Continuidade'}
                </Text>
              </View>
              <Text style={[styles.situacaoLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.notaBadge, { backgroundColor: gradeColor(disc.mediaAnual, notaMin) + '20', borderColor: gradeColor(disc.mediaAnual, notaMin) + '60' }]}>
          <Text style={[styles.notaVal, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
            {disc.mediaAnual.toFixed(1)}
          </Text>
          <Text style={[styles.notaLabel, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
            {disc.numTrimestres} trim.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Card de Disciplina 11ª (com histórico da 10ª) ───────────────────────────

function DiscCard11({ disc, notaMin }: { disc: Disciplina11; notaMin: number }) {
  const cfg = disc11Config(disc.situacao);
  const isR1 = disc.situacao === 'reprova_r1';
  return (
    <View style={[styles.discCard, { borderColor: cfg.color + '60', backgroundColor: cfg.color + '0D' }]}>
      <View style={styles.discRow}>
        <View style={styles.discLeft}>
          <Ionicons name={cfg.icon} size={16} color={cfg.color} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.discNome} numberOfLines={1}>{disc.disciplina}</Text>
            <View style={styles.discMeta}>
              <View style={[styles.tipoBadge, { backgroundColor: disc.tipo === 'terminal' ? Colors.warning + '20' : Colors.info + '20' }]}>
                <Text style={[styles.tipoBadgeText, { color: disc.tipo === 'terminal' ? Colors.warning : Colors.info }]}>
                  {disc.tipo === 'terminal' ? 'Terminal' : 'Continuidade'}
                </Text>
              </View>
              <Text style={[styles.situacaoLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {disc.motivo ? (
              <Text style={[styles.motivoText, { color: cfg.color }]} numberOfLines={2}>
                {disc.motivo}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.notaBadge, { backgroundColor: gradeColor(disc.mediaAnual, notaMin) + '20', borderColor: gradeColor(disc.mediaAnual, notaMin) + '60' }]}>
            <Text style={[styles.notaVal, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
              {disc.mediaAnual.toFixed(1)}
            </Text>
            <Text style={[styles.notaLabel, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
              11ª
            </Text>
          </View>
          {disc.media10 !== null && (
            <View style={[styles.notaBadge, { backgroundColor: gradeColor(disc.media10, notaMin) + '14', borderColor: gradeColor(disc.media10, notaMin) + '40' }]}>
              <Text style={[styles.notaVal, { color: gradeColor(disc.media10, notaMin), fontSize: 12 }]}>
                {disc.media10.toFixed(1)}
              </Text>
              <Text style={[styles.notaLabel, { color: gradeColor(disc.media10, notaMin) }]}>
                10ª
              </Text>
            </View>
          )}
        </View>
      </View>
      {isR1 && (
        <View style={[styles.r1Banner, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40' }]}>
          <Ionicons name="warning" size={12} color={Colors.danger} />
          <Text style={[styles.r1Text, { color: Colors.danger }]}>
            Regra R1 activada — duas negativas consecutivas nesta disciplina
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Card de Disciplina outros anos ───────────────────────────────────────────

function DiscCardSimples({ disc, notaMin }: { disc: RespostaOutros['disciplinas'][0]; notaMin: number }) {
  const color = disc.aprovado ? Colors.success : Colors.warning;
  return (
    <View style={[styles.discCard, { borderColor: color + '50', backgroundColor: color + '0D' }]}>
      <View style={styles.discRow}>
        <View style={styles.discLeft}>
          <Ionicons name={disc.aprovado ? 'checkmark-circle' : 'alert-circle'} size={16} color={color} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.discNome} numberOfLines={1}>{disc.disciplina}</Text>
            <View style={[styles.tipoBadge, { backgroundColor: disc.tipo === 'terminal' ? Colors.warning + '15' : Colors.info + '15', alignSelf: 'flex-start', marginTop: 3 }]}>
              <Text style={[styles.tipoBadgeText, { color: disc.tipo === 'terminal' ? Colors.warning : Colors.info }]}>
                {disc.tipo === 'terminal' ? 'Terminal' : 'Continuidade'}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.notaBadge, { backgroundColor: gradeColor(disc.mediaAnual, notaMin) + '20', borderColor: gradeColor(disc.mediaAnual, notaMin) + '60' }]}>
          <Text style={[styles.notaVal, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
            {disc.mediaAnual.toFixed(1)}
          </Text>
          <Text style={[styles.notaLabel, { color: gradeColor(disc.mediaAnual, notaMin) }]}>
            {disc.numTrimestres} trim.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PromocaoStatusModal({ visible, onClose, alunoId, alunoNome }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resposta | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!alunoId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/promocao/situacao/${alunoId}`);
      setData(res as Resposta);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar situação de promoção.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => {
    if (visible && alunoId) load();
  }, [visible, alunoId]);

  const is10 = data?.classe === '10';
  const is11 = data?.classe === '11';
  const data10  = is10 ? (data as Resposta10) : null;
  const data11  = is11 ? (data as Resposta11) : null;
  const dataOther = !is10 && !is11 && data ? (data as RespostaOutros) : null;

  const geralCfg10 = data10 ? geralConfig(data10.situacaoGeral) : null;
  const geralCfg11 = data11 ? geralConfig(data11.situacaoGeral) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Situação de Promoção</Text>
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
              <Text style={styles.loadingText}>A calcular situação de promoção…</Text>
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
              {/* Badge de classe */}
              <View style={styles.classeBadgeRow}>
                <View style={styles.classeBadge}>
                  <Ionicons name="school" size={15} color={Colors.gold} />
                  <Text style={styles.classeBadgeText}>{data.classe}ª Classe · {data.anoLetivo}</Text>
                </View>
              </View>

              {/* Situação Geral — 10ª */}
              {data10 && geralCfg10 && (
                <View style={[styles.geralBanner, { backgroundColor: geralCfg10.bg, borderColor: geralCfg10.border }]}>
                  <Ionicons name={geralCfg10.icon} size={22} color={geralCfg10.color} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.geralLabel, { color: geralCfg10.color }]}>{geralCfg10.label}</Text>
                    {data10.motivoGeral ? (
                      <Text style={[styles.geralMotivo, { color: geralCfg10.color }]}>{data10.motivoGeral}</Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Situação Geral — 11ª */}
              {data11 && geralCfg11 && (
                <View style={[styles.geralBanner, { backgroundColor: geralCfg11.bg, borderColor: geralCfg11.border }]}>
                  <Ionicons name={geralCfg11.icon} size={22} color={geralCfg11.color} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.geralLabel, { color: geralCfg11.color }]}>{geralCfg11.label}</Text>
                    {data11.motivoGeral ? (
                      <Text style={[styles.geralMotivo, { color: geralCfg11.color }]}>{data11.motivoGeral}</Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Info banner — 12ª e outros */}
              {dataOther && (
                <>
                  {dataOther.numNegativas !== undefined && (
                    <View style={[styles.geralBanner, {
                      backgroundColor: dataOther.numNegativas === 0 ? Colors.success + '14' : Colors.warning + '18',
                      borderColor: dataOther.numNegativas === 0 ? Colors.success + '40' : Colors.warning + '50',
                    }]}>
                      <Ionicons
                        name={dataOther.numNegativas === 0 ? 'checkmark-circle' : 'alert-circle'}
                        size={20}
                        color={dataOther.numNegativas === 0 ? Colors.success : Colors.warning}
                      />
                      <Text style={[styles.geralLabel, { color: dataOther.numNegativas === 0 ? Colors.success : Colors.warning, marginLeft: 10 }]}>
                        {dataOther.numNegativas === 0
                          ? 'Sem negativas neste ano'
                          : `${dataOther.numNegativas} negativa${dataOther.numNegativas > 1 ? 's' : ''} neste ano`}
                      </Text>
                    </View>
                  )}
                  {dataOther.info && (
                    <View style={styles.infoBanner}>
                      <Ionicons name="information-circle" size={16} color={Colors.info} />
                      <Text style={styles.infoText}>{dataOther.info}</Text>
                    </View>
                  )}
                </>
              )}

              {/* Estatísticas rápidas — 10ª */}
              {data10 && (
                <View style={styles.statsRow}>
                  {[
                    { label: 'Negativas', val: data10.disciplinas.filter(d => d.mediaAnual < data10.notaMin).length, color: Colors.danger },
                    { label: 'Máx. Permitido', val: data10.maxNegativasPermitidas, color: Colors.textMuted },
                    { label: 'Com Exame', val: data10.disciplinas.filter(d => d.situacao === 'negativa_exame_terminal').length, color: Colors.warning },
                  ].map(s => (
                    <View key={s.label} style={styles.statBox}>
                      <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Estatísticas rápidas — 11ª */}
              {data11 && (
                <View style={styles.statsRow}>
                  {[
                    { label: 'Negativas', val: data11.numNegativas, color: Colors.danger },
                    { label: 'Regra R1', val: data11.disciplinas.filter(d => d.situacao === 'reprova_r1').length, color: Colors.danger },
                    { label: 'Com Exame', val: data11.disciplinas.filter(d => d.situacao === 'negativa_exame_terminal').length, color: Colors.warning },
                  ].map(s => (
                    <View key={s.label} style={styles.statBox}>
                      <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Regras */}
              {data10 && <RegrasCard10 />}
              {data11 && <RegrasCard11 />}

              {/* Disciplinas */}
              {data.disciplinas.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>Sem notas registadas neste ano lectivo.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>
                    {data11 ? 'Médias Anuais por Disciplina (11ª vs 10ª)' : 'Médias Anuais por Disciplina'}
                  </Text>
                  {data10
                    ? (data10.disciplinas as Disciplina10[])
                        .sort((a, b) => a.mediaAnual - b.mediaAnual)
                        .map(d => <DiscCard10 key={d.disciplina} disc={d} notaMin={data10.notaMin} />)
                    : data11
                    ? (data11.disciplinas as Disciplina11[])
                        .sort((a, b) => a.mediaAnual - b.mediaAnual)
                        .map(d => <DiscCard11 key={d.disciplina} disc={d} notaMin={data11.notaMin} />)
                    : dataOther?.disciplinas
                        .sort((a, b) => a.mediaAnual - b.mediaAnual)
                        .map(d => <DiscCardSimples key={d.disciplina} disc={d} notaMin={data.notaMin} />)
                  }
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
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.border + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  center: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { marginTop: 12, color: Colors.textMuted, fontSize: 14 },
  errorBox: { alignItems: 'center', paddingVertical: 40 },
  errorText: { color: Colors.danger, fontSize: 14, textAlign: 'center', marginTop: 10 },
  retryBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 9,
    backgroundColor: Colors.accent + '20', borderRadius: 8,
  },
  retryText: { color: Colors.accent, fontWeight: '600', fontSize: 13 },

  classeBadgeRow: { flexDirection: 'row', marginBottom: 12 },
  classeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gold + '18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.gold + '40',
  },
  classeBadgeText: { fontSize: 13, fontWeight: '700', color: Colors.gold },

  geralBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  geralLabel: { fontSize: 15, fontWeight: '800' },
  geralMotivo: { fontSize: 12, lineHeight: 18, marginTop: 4, fontWeight: '500' },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.info + '12', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.info + '30', marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.info, lineHeight: 18 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 10,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  regrasCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  regrasHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  regrasTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  regraItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  regraNum: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  regraText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  regraBold: { fontWeight: '700', color: Colors.text },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },
  discCard: {
    borderRadius: 10, borderWidth: 1, marginBottom: 8, padding: 12,
  },
  discRow: { flexDirection: 'row', alignItems: 'center' },
  discLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  discNome: { fontSize: 13, fontWeight: '700', color: Colors.text },
  discMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  tipoBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start',
  },
  tipoBadgeText: { fontSize: 10, fontWeight: '700' },
  situacaoLabel: { fontSize: 11, fontWeight: '600' },
  motivoText: { fontSize: 10, lineHeight: 14, marginTop: 4, fontWeight: '500', opacity: 0.9 },
  notaBadge: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: 'center', minWidth: 54, marginLeft: 8,
  },
  notaVal: { fontSize: 15, fontWeight: '800' },
  notaLabel: { fontSize: 9, fontWeight: '600' },

  r1Banner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, padding: 7, borderRadius: 6, borderWidth: 1,
  },
  r1Text: { fontSize: 11, fontWeight: '600', flex: 1 },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 12 },
});
