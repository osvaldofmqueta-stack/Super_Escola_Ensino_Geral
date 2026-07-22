import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { anoLetivoDe } from '@/lib/anoLetivo';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useQuery } from '@tanstack/react-query';

const { width } = Dimensions.get('window');

interface ProfDesempenho {
  professorId: string;
  nomeCompleto: string;
  numeroProfessor: string;
  disciplinas: string[];
  totalPautas: number;
  totalLancadas: number;
  noPrazo: number;
  comAtraso: number;
  pendentes: number;
  taxaCumprimento: number;
  nIncidentes: number;
  score: number;
  classificacao: string;
}

interface Prazo {
  id: string;
  trimestre: number;
  anoLetivo: string;
  dataLimite: string;
}

interface ApiResponse {
  professores: ProfDesempenho[];
  prazos: Prazo[];
  anoLetivo: string | null;
  trimestre: number | null;
}

const COR_CLASSIFICACAO: Record<string, string> = {
  'Excelente': '#16A34A',
  'Muito Bom': '#2563EB',
  'Satisfatório': '#D97706',
  'Insuficiente': '#EA580C',
  'Crítico': '#DC2626',
};

const ANO_ATUAL = anoLetivoDe(new Date());

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const cor = score >= 90 ? '#16A34A' : score >= 75 ? '#2563EB' : score >= 60 ? '#D97706' : score >= 40 ? '#EA580C' : '#DC2626';
  return (
    <View style={[styles.scoreRing, { width: size, height: size, borderColor: cor + '44', backgroundColor: cor + '18' }]}>
      <Text style={[styles.scoreNum, { color: cor, fontSize: size * 0.28 }]}>{score}</Text>
      <Text style={[styles.scorePct, { color: cor + 'AA', fontSize: size * 0.17 }]}>pts</Text>
    </View>
  );
}

function BarraProgresso({ valor, cor, total = 100 }: { valor: number; cor: string; total?: number }) {
  const pct = Math.min(100, Math.round((valor / Math.max(total, 1)) * 100));
  return (
    <View style={styles.barraContainer}>
      <View style={[styles.barraFill, { width: `${pct}%` as any, backgroundColor: cor }]} />
    </View>
  );
}

function AvatarLetras({ nome, score }: { nome: string; score: number }) {
  const iniciais = nome.trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const cor = score >= 90 ? '#16A34A' : score >= 75 ? '#2563EB' : score >= 60 ? '#D97706' : '#DC2626';
  return (
    <View style={[styles.avatar, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
      <Text style={[styles.avatarText, { color: cor }]}>{iniciais}</Text>
    </View>
  );
}

function CardProfessor({ prof, rank }: { prof: ProfDesempenho; rank: number }) {
  const corClass = COR_CLASSIFICACAO[prof.classificacao] || Colors.text;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankNum}>#{rank}</Text>
        </View>
        <AvatarLetras nome={prof.nomeCompleto} score={prof.score} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.profNome} numberOfLines={1}>{prof.nomeCompleto}</Text>
          <Text style={styles.profNum}>{prof.numeroProfessor || '—'}</Text>
          {prof.disciplinas.length > 0 && (
            <Text style={styles.profDisc} numberOfLines={1}>{prof.disciplinas.slice(0, 2).join(' · ')}{prof.disciplinas.length > 2 ? ` +${prof.disciplinas.length - 2}` : ''}</Text>
          )}
        </View>
        <ScoreRing score={prof.score} size={54} />
      </View>

      <View style={styles.classRow}>
        <View style={[styles.classBadge, { backgroundColor: corClass + '18', borderColor: corClass + '55' }]}>
          <Text style={[styles.classLabel, { color: corClass }]}>{prof.classificacao}</Text>
        </View>
        {prof.nIncidentes > 0 && (
          <View style={styles.incidentBadge}>
            <Ionicons name="warning-outline" size={11} color="#DC2626" />
            <Text style={styles.incidentText}>{prof.nIncidentes} incidente{prof.nIncidentes !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statVal}>{prof.totalPautas}</Text>
          <Text style={styles.statLbl}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={[styles.statVal, { color: '#16A34A' }]}>{prof.noPrazo}</Text>
          <Text style={styles.statLbl}>No prazo</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={[styles.statVal, { color: prof.comAtraso > 0 ? '#DC2626' : Colors.textSecondary }]}>{prof.comAtraso}</Text>
          <Text style={styles.statLbl}>Com atraso</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={[styles.statVal, { color: prof.pendentes > 0 ? '#D97706' : Colors.textSecondary }]}>{prof.pendentes}</Text>
          <Text style={styles.statLbl}>Pendentes</Text>
        </View>
      </View>

      <View style={styles.txRow}>
        <Text style={styles.txLabel}>Taxa de cumprimento</Text>
        <Text style={[styles.txVal, { color: prof.taxaCumprimento >= 80 ? '#16A34A' : prof.taxaCumprimento >= 50 ? '#D97706' : '#DC2626' }]}>{prof.taxaCumprimento}%</Text>
      </View>
      <BarraProgresso valor={prof.taxaCumprimento} cor={prof.taxaCumprimento >= 80 ? '#16A34A' : prof.taxaCumprimento >= 50 ? '#D97706' : '#DC2626'} />
    </View>
  );
}

function SummaryCard({ label, valor, icone, cor }: { label: string; valor: string | number; icone: string; cor: string }) {
  return (
    <View style={[styles.summaryCard, { borderColor: cor + '33' }]}>
      <Ionicons name={icone as any} size={20} color={cor} />
      <Text style={[styles.summaryVal, { color: cor }]}>{valor}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}

export default function DesempenhoProfessoresScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [anoLetivo, setAnoLetivo] = useState(ANO_ATUAL);
  const [trimestre, setTrimestre] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<'score' | 'nome' | 'taxa'>('score');

  const { data, isLoading, refetch, isRefetching } = useQuery<ApiResponse>({
    queryKey: ['desempenho-professores', anoLetivo, trimestre],
    queryFn: async () => {
      const params = new URLSearchParams({ anoLetivo });
      if (trimestre) params.set('trimestre', String(trimestre));
      return api.get<ApiResponse>(`/api/professores/desempenho-prazos?${params}`);
    },
    staleTime: 2 * 60 * 1000,
  });

  const professoresFiltrados = useMemo(() => {
    let lista = data?.professores || [];
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(p =>
        p.nomeCompleto.toLowerCase().includes(q) ||
        (p.numeroProfessor || '').toLowerCase().includes(q) ||
        p.disciplinas.some(d => d.toLowerCase().includes(q))
      );
    }
    if (ordenacao === 'nome') lista = [...lista].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
    else if (ordenacao === 'taxa') lista = [...lista].sort((a, b) => b.taxaCumprimento - a.taxaCumprimento);
    else lista = [...lista].sort((a, b) => b.score - a.score);
    return lista;
  }, [data?.professores, busca, ordenacao]);

  const stats = useMemo(() => {
    const lista = data?.professores || [];
    if (!lista.length) return null;
    const mediaScore = Math.round(lista.reduce((s, p) => s + p.score, 0) / lista.length);
    const mediaTaxa = Math.round(lista.reduce((s, p) => s + p.taxaCumprimento, 0) / lista.length);
    const totalIncidentes = lista.reduce((s, p) => s + p.nIncidentes, 0);
    const excelentes = lista.filter(p => p.score >= 90).length;
    return { mediaScore, mediaTaxa, totalIncidentes, excelentes, total: lista.length };
  }, [data?.professores]);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const ANOS = [ANO_ATUAL, `${parseInt(ANO_ATUAL) - 1}/${parseInt(ANO_ATUAL.split('/')[1] || ANO_ATUAL) - 1}`].filter(Boolean);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title="Desempenho dos Professores" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho */}
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="chart-bar" size={22} color={Colors.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.headerTitle}>Cumprimento de Prazos de Pautas</Text>
            <Text style={styles.headerSub}>Indicadores para avaliação de desempenho docente</Text>
          </View>
        </View>

        {/* Filtros — Ano Lectivo */}
        <View style={styles.filtrosRow}>
          {ANOS.map(ano => (
            <TouchableOpacity
              key={ano}
              onPress={() => setAnoLetivo(ano)}
              style={[styles.filtroBtn, anoLetivo === ano && styles.filtroBtnActivo]}
            >
              <Text style={[styles.filtroBtnTxt, anoLetivo === ano && styles.filtroBtnTxtActivo]}>{ano}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filtros — Trimestre */}
        <View style={styles.filtrosRow}>
          {[null, 1, 2, 3].map(t => (
            <TouchableOpacity
              key={String(t)}
              onPress={() => setTrimestre(t)}
              style={[styles.filtroBtn, trimestre === t && styles.filtroBtnActivo]}
            >
              <Text style={[styles.filtroBtnTxt, trimestre === t && styles.filtroBtnTxtActivo]}>{t === null ? 'Todos' : `${t}º Trim.`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary cards */}
        {stats && (
          <View style={styles.summaryRow}>
            <SummaryCard label="Score médio" valor={stats.mediaScore} icone="star" cor="#2563EB" />
            <SummaryCard label="Taxa média" valor={`${stats.mediaTaxa}%`} icone="checkmark-circle" cor="#16A34A" />
            <SummaryCard label="Incidentes" valor={stats.totalIncidentes} icone="warning" cor={stats.totalIncidentes > 0 ? '#DC2626' : '#6B7280'} />
            <SummaryCard label="Excelentes" valor={stats.excelentes} icone="trophy" cor="#D97706" />
          </View>
        )}

        {/* Busca e ordenação */}
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <StableSearchInput
              value={busca}
              onChangeText={setBusca}
              placeholder="Pesquisar professor ou disciplina..."
            />
          </View>
        </View>

        <View style={styles.ordenacaoRow}>
          <Text style={styles.ordenacaoLabel}>Ordenar:</Text>
          {(['score', 'taxa', 'nome'] as const).map(o => (
            <TouchableOpacity
              key={o}
              onPress={() => setOrdenacao(o)}
              style={[styles.ordBtn, ordenacao === o && styles.ordBtnActivo]}
            >
              <Text style={[styles.ordBtnTxt, ordenacao === o && styles.ordBtnTxtActivo]}>
                {o === 'score' ? 'Pontuação' : o === 'taxa' ? 'Taxa' : 'Nome'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lista */}
        {isLoading ? null : professoresFiltrados.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="chart-bar-stacked" size={48} color={Colors.textSecondary} style={{ opacity: 0.4 }} />
            <Text style={styles.emptyTxt}>Nenhum dado disponível para os filtros seleccionados</Text>
            <Text style={styles.emptyHint}>Configure prazos de mini-pauta para activar os indicadores</Text>
          </View>
        ) : (
          professoresFiltrados.map((prof, idx) => (
            <CardProfessor key={prof.professorId} prof={prof} rank={idx + 1} />
          ))
        )}

        {/* Legenda */}
        {!isLoading && (
          <View style={styles.legendaBox}>
            <Text style={styles.legendaTitulo}>Como é calculado o score?</Text>
            <Text style={styles.legendaTxt}>• Score base: 100 pontos</Text>
            <Text style={styles.legendaTxt}>• Cada incidente registado: −10 pontos</Text>
            <Text style={styles.legendaTxt}>• Penalidade proporcional por atrasos: até −40 pontos</Text>
            <Text style={styles.legendaTxt}>• <Text style={{ color: '#16A34A' }}>≥90</Text> Excelente · <Text style={{ color: '#2563EB' }}>≥75</Text> Muito Bom · <Text style={{ color: '#D97706' }}>≥60</Text> Satisfatório · <Text style={{ color: '#EA580C' }}>≥40</Text> Insuficiente · <Text style={{ color: '#DC2626' }}>&lt;40</Text> Crítico</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  filtroBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  filtroBtnActivo: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filtroBtnTxt: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  filtroBtnTxtActivo: { color: '#fff', fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  summaryCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, gap: 2 },
  summaryVal: { fontSize: 18, fontWeight: '800' },
  summaryLbl: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center', fontWeight: '500' },

  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },

  ordenacaoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  ordenacaoLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  ordBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  ordBtnActivo: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  ordBtnTxt: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  ordBtnTxtActivo: { color: Colors.primary, fontWeight: '700' },

  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },

  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  rankNum: { fontSize: 10, fontWeight: '800', color: Colors.primary },

  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText: { fontSize: 14, fontWeight: '800' },

  profNome: { fontSize: 14, fontWeight: '700', color: Colors.text },
  profNum: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  profDisc: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },

  scoreRing: { borderRadius: 100, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontWeight: '800', lineHeight: 20 },
  scorePct: { fontWeight: '600', lineHeight: 12 },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  classBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  classLabel: { fontSize: 11, fontWeight: '700' },
  incidentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DC262618', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#DC262633' },
  incidentText: { fontSize: 10, color: '#DC2626', fontWeight: '600' },

  statsRow: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 10, padding: 10, marginBottom: 10 },
  statBlock: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statVal: { fontSize: 18, fontWeight: '800', color: Colors.text },
  statLbl: { fontSize: 9, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },

  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  txLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  txVal: { fontSize: 13, fontWeight: '800' },
  barraContainer: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  barraFill: { height: '100%', borderRadius: 3 },

  loadingBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingTxt: { color: Colors.textSecondary, fontSize: 13 },

  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTxt: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', fontWeight: '600' },
  emptyHint: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', opacity: 0.7 },

  legendaBox: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  legendaTitulo: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  legendaTxt: { fontSize: 11, color: Colors.textSecondary, lineHeight: 18 },
});
