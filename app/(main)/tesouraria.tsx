import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, RefreshControl } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { formatAOA } from '@/context/FinanceiroContext';
import { useRouter } from 'expo-router';
import { webAlert } from '@/utils/webAlert';
import CollapsibleStats from '@/components/CollapsibleStats';
import { SkeletonPage } from '@/components/Skeleton';

type VisaoEntradas = {
  ano: string;
  totais: { ano: number; mes: number; semana: number; hoje: number; transaccoes: number };
  porMetodo: Record<string, number>;
  porTipo: Record<string, number>;
  porFonte: Record<string, number>;
  porDia: Record<string, number>;
  rupes: { activos: number; pagos: number; expirados: number; valorPendente: number };
  pendentes: { quantidade: number; valor: number };
};

const METODO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  multicaixa: 'Multicaixa',
  referencia_bancaria: 'RUPE / Referência',
  cartao: 'Cartão',
  desconhecido: 'Não classificado',
};
const TIPO_LABELS: Record<string, string> = {
  propina: 'Propinas',
  matricula: 'Matrículas',
  inscricao: 'Inscrições',
  material: 'Material',
  exame: 'Exames',
  multa: 'Multas',
  outro: 'Outras Receitas',
};
const FONTE_LABELS: Record<string, string> = {
  pagamentos: 'Pagamentos de Alunos',
  entradas_diversas: 'Inscrições / Outros',
};

function labelMetodo(k: string) { return METODO_LABELS[k] || k; }
function labelTipo(k: string) { return TIPO_LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1); }
function labelFonte(k: string) { return FONTE_LABELS[k] || k; }

function KpiCard({ icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={[styles.kpi, { borderLeftColor: color }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '22' }]}>
        <MaterialCommunityIcons name={icon} size={26} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
        {sub ? <Text style={styles.kpiSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max(2, Math.round((value / total) * 100)) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.barValue}>{formatAOA(value)} <Text style={{ color: Colors.textMuted, fontSize: 11 }}>({total > 0 ? Math.round((value / total) * 100) : 0}%)</Text></Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const PALETA = [Colors.gold, Colors.success, Colors.info, Colors.warning, Colors.danger, '#9C27B0', '#3F51B5', '#009688', '#795548', '#607D8B'];

export default function TesourariaScreen() {
  const router = useRouter();
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));
  const [data, setData] = useState<VisaoEntradas | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Intervalo de datas para exportação (default: ano corrente)
  const anoCorrente = String(new Date().getFullYear());
  const [dataInicio, setDataInicio] = useState<string>(`${anoCorrente}-01-01`);
  const [dataFim, setDataFim] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showExportMenu, setShowExportMenu] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<VisaoEntradas>(`/api/financeiro/visao-entradas?ano=${encodeURIComponent(ano)}`);
      setData(r);
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível carregar a tesouraria.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ano]);

  useEffect(() => { setLoading(true); carregar(); }, [carregar]);

  const onRefresh = () => { setRefreshing(true); carregar(); };

  const anosDisponiveis = useMemo(() => {
    const atual = new Date().getFullYear();
    return [atual + 1, atual, atual - 1, atual - 2].map(String);
  }, []);

  function exportar(formato: 'pdf' | 'xlsx') {
    if (!dataInicio || !dataFim) {
      webAlert('Datas obrigatórias', 'Indique a data de início e a data de fim.');
      return;
    }
    if (dataInicio > dataFim) {
      webAlert('Intervalo inválido', 'A data de início tem de ser anterior ou igual à data de fim.');
      return;
    }
    const url = `/api/financeiro/tesouraria/exportar?dataInicio=${encodeURIComponent(dataInicio)}&dataFim=${encodeURIComponent(dataFim)}&formato=${formato}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }

  function aplicarPredefinido(tipo: 'hoje' | 'semana' | 'mes' | 'ano') {
    const hoje = new Date();
    const isoHoje = hoje.toISOString().slice(0, 10);
    if (tipo === 'hoje') {
      setDataInicio(isoHoje); setDataFim(isoHoje);
    } else if (tipo === 'semana') {
      const ini = new Date(hoje.getTime() - 6 * 86400000).toISOString().slice(0, 10);
      setDataInicio(ini); setDataFim(isoHoje);
    } else if (tipo === 'mes') {
      setDataInicio(`${isoHoje.slice(0, 7)}-01`); setDataFim(isoHoje);
    } else {
      setDataInicio(`${hoje.getFullYear()}-01-01`); setDataFim(isoHoje);
    }
  }

  const totalMetodo = useMemo(() => Object.values(data?.porMetodo || {}).reduce((a, b) => a + b, 0), [data]);
  const totalTipo = useMemo(() => Object.values(data?.porTipo || {}).reduce((a, b) => a + b, 0), [data]);
  const totalFonte = useMemo(() => Object.values(data?.porFonte || {}).reduce((a, b) => a + b, 0), [data]);

  const ultimosDias = useMemo(() => {
    const arr = Object.entries(data?.porDia || {}).sort(([a], [b]) => a.localeCompare(b));
    return arr.slice(-14);
  }, [data]);

  if (loading) return <SkeletonPage variant="stats-list" />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <TopBar title="Tesouraria" subtitle="Visão consolidada de todas as entradas" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={styles.headerTitle}>Painel de Tesouraria</Text>
            <Text style={styles.headerSub}>Reúne pagamentos de propinas, RUPEs pagos, inscrições e matrículas — tudo em tempo real.</Text>
          </View>
          <View style={styles.anoSeletor}>
            {anosDisponiveis.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => setAno(a)}
                style={[styles.anoBtn, ano === a && styles.anoBtnActive]}
              >
                <Text style={[styles.anoBtnText, ano === a && styles.anoBtnTextActive]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bloco de Exportação para Direcção / Auditoria */}
        <View style={styles.exportCard}>
          <TouchableOpacity
            onPress={() => setShowExportMenu(v => !v)}
            activeOpacity={0.75}
            style={styles.cardHeader}
          >
            <MaterialCommunityIcons name="file-export-outline" size={20} color={Colors.gold} />
            <Text style={[styles.cardTitle, { flex: 1 }]}>Relatório para a Direcção / Auditoria</Text>
            <View style={styles.toggleBtn}>
              <Ionicons name={showExportMenu ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text} />
            </View>
          </TouchableOpacity>

          {showExportMenu && (
            <>
              <Text style={styles.cardSub}>
                Defina um intervalo de datas e exporte um relatório consolidado em Excel ou PDF (com resumo por método, rubrica e detalhe de cada transacção).
              </Text>

              {/* Predefinidos */}
              <View style={styles.predefRow}>
                <TouchableOpacity style={styles.predefBtn} onPress={() => aplicarPredefinido('hoje')}>
                  <Text style={styles.predefTxt}>Hoje</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.predefBtn} onPress={() => aplicarPredefinido('semana')}>
                  <Text style={styles.predefTxt}>Últimos 7 dias</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.predefBtn} onPress={() => aplicarPredefinido('mes')}>
                  <Text style={styles.predefTxt}>Este mês</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.predefBtn} onPress={() => aplicarPredefinido('ano')}>
                  <Text style={styles.predefTxt}>Ano corrente</Text>
                </TouchableOpacity>
              </View>

              {/* Inputs de datas — usa <input type="date"> nativo na web */}
              <View style={styles.datasRow}>
                <View style={styles.dataField}>
                  <Text style={styles.dataLabel}>Data de início</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore — input HTML nativo
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e: any) => setDataInicio(e.target.value)}
                      style={{
                        width: '100%', padding: 8, borderRadius: 8,
                        border: `1px solid ${Colors.border}`, background: Colors.background,
                        color: Colors.text, fontFamily: 'inherit', fontSize: 13,
                      } as any}
                    />
                  ) : (
                    <Text style={styles.dataValuePlain}>{dataInicio}</Text>
                  )}
                </View>
                <View style={styles.dataField}>
                  <Text style={styles.dataLabel}>Data de fim</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore — input HTML nativo
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e: any) => setDataFim(e.target.value)}
                      style={{
                        width: '100%', padding: 8, borderRadius: 8,
                        border: `1px solid ${Colors.border}`, background: Colors.background,
                        color: Colors.text, fontFamily: 'inherit', fontSize: 13,
                      } as any}
                    />
                  ) : (
                    <Text style={styles.dataValuePlain}>{dataFim}</Text>
                  )}
                </View>
              </View>

              {/* Botões de exportação */}
              <View style={styles.exportBtnRow}>
                <TouchableOpacity style={[styles.exportBtn, { backgroundColor: Colors.success }]} onPress={() => exportar('xlsx')}>
                  <MaterialCommunityIcons name="microsoft-excel" size={16} color="#fff" />
                  <Text style={styles.exportBtnTxt}>Exportar Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.exportBtn, { backgroundColor: Colors.danger }]} onPress={() => exportar('pdf')}>
                  <MaterialCommunityIcons name="file-pdf-box" size={16} color="#fff" />
                  <Text style={styles.exportBtnTxt}>Exportar PDF</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {!showExportMenu && (
            <Text style={styles.cardSub}>
              Toque para gerar um relatório (Excel ou PDF) com o intervalo de datas que escolher.
            </Text>
          )}
        </View>

        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <AppLoader color={Colors.gold} size="large" />
            <Text style={{ marginTop: 12, color: Colors.textMuted }}>A carregar dados financeiros…</Text>
          </View>
        ) : !data ? (
          <Text style={{ textAlign: 'center', color: Colors.textMuted, padding: 24 }}>Sem dados para apresentar.</Text>
        ) : (
          <>
            <CollapsibleStats storageKey="tes-entradas" title="Entradas Financeiras" color={Colors.success}>
              <View style={styles.kpiGrid}>
                <KpiCard icon="cash-multiple" label={`Hoje`} value={formatAOA(data.totais.hoje)} color={Colors.success} />
                <KpiCard icon="calendar-week" label="Últimos 7 dias" value={formatAOA(data.totais.semana)} color={Colors.info} />
                <KpiCard icon="calendar-month" label="Mês actual" value={formatAOA(data.totais.mes)} color={Colors.gold} />
                <KpiCard icon="finance" label={`Total ${data.ano}`} value={formatAOA(data.totais.ano)} sub={`${data.totais.transaccoes} transacções`} color="#9C27B0" />
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-rupes" title="Estado dos RUPEs" color={Colors.warning}>
              <View style={styles.kpiGrid}>
                <KpiCard
                  icon="receipt"
                  label="RUPEs activos"
                  value={String(data.rupes.activos)}
                  sub={`${formatAOA(data.rupes.valorPendente)} por liquidar`}
                  color={Colors.warning}
                />
                <KpiCard
                  icon="check-decagram"
                  label="RUPEs pagos"
                  value={String(data.rupes.pagos)}
                  color={Colors.success}
                />
                <KpiCard
                  icon="alert-circle-outline"
                  label="RUPEs expirados"
                  value={String(data.rupes.expirados)}
                  color={Colors.danger}
                />
                <KpiCard
                  icon="clock-alert-outline"
                  label="Pendentes em propinas"
                  value={String(data.pendentes.quantidade)}
                  sub={formatAOA(data.pendentes.valor)}
                  color="#FF7043"
                />
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-metodo" title="Por Método de Pagamento" color={Colors.gold}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="credit-card-multiple" size={20} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Por método de pagamento</Text>
                </View>
                {Object.keys(data.porMetodo).length === 0 ? (
                  <Text style={styles.emptyTxt}>Sem entradas para o período.</Text>
                ) : (
                  Object.entries(data.porMetodo)
                    .sort(([, a], [, b]) => b - a)
                    .map(([k, v], i) => (
                      <BarRow key={k} label={labelMetodo(k)} value={v} total={totalMetodo} color={PALETA[i % PALETA.length]} />
                    ))
                )}
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-tipo" title="Por Rubrica / Tipo de Taxa" color={Colors.info}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="tag-multiple" size={20} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Por rubrica / tipo de taxa</Text>
                  <View style={{ flex: 1 }} />
                  <View style={styles.badgeAuto}>
                    <Ionicons name="sync" size={11} color={Colors.success} />
                    <Text style={styles.badgeAutoTxt}>auto-actualiza</Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>Quando adicionar uma nova rubrica em "Módulo Financeiro → Rubricas", ela aparece aqui automaticamente.</Text>
                {Object.keys(data.porTipo).length === 0 ? (
                  <Text style={styles.emptyTxt}>Sem entradas para o período.</Text>
                ) : (
                  Object.entries(data.porTipo)
                    .sort(([, a], [, b]) => b - a)
                    .map(([k, v], i) => (
                      <BarRow key={k} label={labelTipo(k)} value={v} total={totalTipo} color={PALETA[i % PALETA.length]} />
                    ))
                )}
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-fonte" title="Origem das Entradas" color={Colors.accent}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="source-branch" size={20} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Origem das entradas</Text>
                </View>
                {Object.keys(data.porFonte).length === 0 ? (
                  <Text style={styles.emptyTxt}>Sem entradas para o período.</Text>
                ) : (
                  Object.entries(data.porFonte)
                    .sort(([, a], [, b]) => b - a)
                    .map(([k, v], i) => (
                      <BarRow key={k} label={labelFonte(k)} value={v} total={totalFonte} color={PALETA[i % PALETA.length]} />
                    ))
                )}
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-dias" title="Evolução por Dia" color={Colors.gold}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="chart-line" size={20} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Últimos dias com movimento</Text>
                </View>
                {ultimosDias.length === 0 ? (
                  <Text style={styles.emptyTxt}>Sem movimento recente.</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: 8, minHeight: 120 }}>
                    {(() => {
                      const max = Math.max(...ultimosDias.map(([, v]) => v), 1);
                      return ultimosDias.map(([d, v]) => (
                        <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                          <View style={{ width: '90%', height: Math.max(4, Math.round((v / max) * 100)), backgroundColor: Colors.gold, borderRadius: 4 }} />
                          <Text style={{ fontSize: 9, color: Colors.textMuted, marginTop: 4 }}>{d.slice(5)}</Text>
                        </View>
                      ));
                    })()}
                  </View>
                )}
              </View>
            </CollapsibleStats>

            <CollapsibleStats storageKey="tes-atalhos" title="Atalhos Rápidos" color={Colors.textMuted}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="link-variant" size={20} color={Colors.gold} />
                  <Text style={styles.cardTitle}>Atalhos rápidos</Text>
                </View>
                <View style={styles.atalhos}>
                  <TouchableOpacity style={styles.atalho} onPress={() => router.push('/(main)/rupes-historico')}>
                    <Ionicons name="receipt" size={18} color={Colors.gold} />
                    <Text style={styles.atalhoTxt}>Histórico de RUPEs</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.atalho} onPress={() => router.push('/(main)/financeiro')}>
                    <MaterialCommunityIcons name="cash" size={18} color={Colors.gold} />
                    <Text style={styles.atalhoTxt}>Módulo Financeiro</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.atalho} onPress={() => router.push('/(main)/pagamentos-hub')}>
                    <MaterialCommunityIcons name="cash-check" size={18} color={Colors.gold} />
                    <Text style={styles.atalhoTxt}>Hub de Pagamentos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.atalho, { borderColor: '#15803d', borderWidth: 1 }]} onPress={() => router.push('/(main)/saft')}>
                    <MaterialCommunityIcons name="shield-check" size={18} color="#15803d" />
                    <Text style={[styles.atalhoTxt, { color: '#15803d', fontFamily: 'Inter_700Bold' }]}>SAF-T Angola (AGT)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </CollapsibleStats>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginBottom: 16 },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  anoSeletor: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: Colors.border },
  anoBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  anoBtnActive: { backgroundColor: Colors.gold },
  anoBtnText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  anoBtnTextActive: { color: '#000' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpi: {
    flexGrow: 1, flexBasis: Platform.OS === 'web' ? 220 : '47%',
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0,
  },
  kpiIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  kpiValue: { fontSize: 20, color: Colors.text, fontFamily: 'Inter_700Bold', marginTop: 2 },
  kpiSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 14, color: Colors.text, fontFamily: 'Inter_700Bold' },
  cardSub: { fontSize: 11, color: Colors.textMuted, marginBottom: 12, marginTop: -8 },
  emptyTxt: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', paddingVertical: 8 },
  badgeAuto: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeAutoTxt: { fontSize: 10, color: Colors.success, fontFamily: 'Inter_600SemiBold' },
  barLabel: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold', flex: 1 },
  barValue: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  barTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  atalho: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  atalhoTxt: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold' },

  exportCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.gold + '55',
  },
  toggleBtn: {
    width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, flexShrink: 0,
  },
  predefRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  predefBtn: {
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.background,
    borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
  },
  predefTxt: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  datasRow: { flexDirection: 'row', gap: 12, marginBottom: 14, flexWrap: 'wrap' },
  dataField: { flex: 1, minWidth: 160 },
  dataLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', marginBottom: 4, textTransform: 'uppercase' },
  dataValuePlain: {
    padding: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background, color: Colors.text, fontSize: 13,
  },
  exportBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  exportBtnTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
});
