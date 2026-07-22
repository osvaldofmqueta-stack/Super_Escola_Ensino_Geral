import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Pauta {
  id: string;
  disciplina: string;
  trimestre: number;
  anoLetivo: string;
  status: string;
  dataFecho: string | null;
  numero: number | null;
  lancamentoAdmin: boolean;
  lancadoPorAdminNome: string | null;
  lancadoPorAdminMotivo: string | null;
  turmaNome: string | null;
  classe: string | null;
  turmaId: string;
  professorNome: string | null;
  professorId: string | null;
}

// ─── Configurações de status ──────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  fechada:      { label: 'Fechada',      color: Colors.success,  bg: '#0d2d1a', icon: 'lock-check' },
  em_lancamento:{ label: 'Em Lançamento',color: Colors.warning,  bg: '#2d2200', icon: 'pencil-outline' },
  aberta:       { label: 'Aberta',       color: Colors.info,     bg: '#0a1e2d', icon: 'lock-open-outline' },
  pendente:     { label: 'Pendente',     color: Colors.textMuted,bg: '#1a1a1a', icon: 'clock-outline' },
};
function getStatusCfg(s: string) {
  return STATUS_CFG[s] ?? { label: s, color: Colors.textMuted, bg: '#1a1a1a', icon: 'help-circle-outline' };
}

const TRIMESTRES = [
  { value: '', label: 'Todos os Trimestres' },
  { value: '1', label: '1.º Trimestre' },
  { value: '2', label: '2.º Trimestre' },
  { value: '3', label: '3.º Trimestre' },
];

const STATUS_OPTS = [
  { value: '', label: 'Todos os Estados' },
  { value: 'fechada', label: 'Fechada' },
  { value: 'em_lancamento', label: 'Em Lançamento' },
  { value: 'aberta', label: 'Aberta' },
  { value: 'pendente', label: 'Pendente' },
];

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ArquivoPautasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'web' ? 24 : insets.bottom;

  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [anos, setAnos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [anoLetivo, setAnoLetivo] = useState('');
  const [trimestre, setTrimestre] = useState('');
  const [status, setStatus] = useState('');

  const [showAnoModal, setShowAnoModal] = useState(false);
  const [showTriModal, setShowTriModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const loadAnos = useCallback(async () => {
    try {
      const data = await api.get<string[]>('/api/arquivo-pautas/anos');
      setAnos(data || []);
    } catch {}
  }, []);

  const loadPautas = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (anoLetivo) params.set('anoLetivo', anoLetivo);
      if (trimestre) params.set('trimestre', trimestre);
      if (status) params.set('status', status);
      const data = await api.get<Pauta[]>(`/api/arquivo-pautas?${params.toString()}`);
      setPautas(data || []);
    } catch (e) {
      console.error('Arquivo pautas error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, anoLetivo, trimestre, status]);

  useEffect(() => { loadAnos(); }, []);
  useEffect(() => { const t = setTimeout(() => loadPautas(), 350); return () => clearTimeout(t); }, [search, anoLetivo, trimestre, status]);

  const stats = useMemo(() => {
    const total = pautas.length;
    const fechadas = pautas.filter(p => p.status === 'fechada').length;
    const emLancamento = pautas.filter(p => p.status === 'em_lancamento').length;
    const admin = pautas.filter(p => p.lancamentoAdmin).length;
    return { total, fechadas, emLancamento, admin };
  }, [pautas]);

  const anosOpts = useMemo(() => [
    { value: '', label: 'Todos os Anos' },
    ...anos.map(a => ({ value: a, label: a })),
  ], [anos]);

  function PickerModal({ visible, title, options, selected, onSelect, onClose }: {
    visible: boolean; title: string;
    options: { value: string; label: string }[];
    selected: string; onSelect: (v: string) => void; onClose: () => void;
  }) {
    if (!visible) return null;
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          {options.map(o => (
            <TouchableOpacity
              key={o.value}
              style={[styles.modalOption, o.value === selected && styles.modalOptionSelected]}
              onPress={() => { onSelect(o.value); onClose(); }}
            >
              <Text style={[styles.modalOptionText, o.value === selected && { color: Colors.primary }]}>{o.label}</Text>
              {o.value === selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Arquivo de Pautas" onBack={() => router.back()} />

      {/* Filtros */}
      <View style={styles.filtersWrap}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          placeholder="Pesquisar por disciplina ou professor..."
          style={styles.searchInput}
        />
        <View style={styles.filtersRow}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowAnoModal(true)}>
            <MaterialCommunityIcons name="calendar" size={15} color={anoLetivo ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.filterBtnText, anoLetivo && { color: Colors.primary }]} numberOfLines={1}>
              {anoLetivo || 'Ano'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowTriModal(true)}>
            <MaterialCommunityIcons name="format-list-numbered" size={15} color={trimestre ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.filterBtnText, trimestre && { color: Colors.primary }]} numberOfLines={1}>
              {trimestre ? `${trimestre}.º Tri` : 'Trimestre'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowStatusModal(true)}>
            <MaterialCommunityIcons name="filter-outline" size={15} color={status ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.filterBtnText, status && { color: Colors.primary }]} numberOfLines={1}>
              {status ? getStatusCfg(status).label : 'Estado'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={Colors.textMuted} />
          </TouchableOpacity>

          {(search || anoLetivo || trimestre || status) && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => { setSearch(''); setAnoLetivo(''); setTrimestre(''); setStatus(''); }}>
              <Ionicons name="close-circle" size={16} color={Colors.danger} />
              <Text style={styles.clearBtnText}>Limpar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Estatísticas resumo */}
      {!loading && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: Colors.success }]}>{stats.fechadas}</Text>
            <Text style={styles.statLabel}>Fechadas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: Colors.warning }]}>{stats.emLancamento}</Text>
            <Text style={styles.statLabel}>Em Lançamento</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: Colors.info }]}>{stats.admin}</Text>
            <Text style={styles.statLabel}>Lançado Admin</Text>
          </View>
        </View>
      )}

      {/* Lista */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>A carregar pautas...</Text>
        </View>
      ) : pautas.length === 0 ? (
        <View style={styles.centerBox}>
          <MaterialCommunityIcons name="archive-off-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhuma pauta encontrada</Text>
          <Text style={styles.emptyText}>Ajuste os filtros ou pesquise por outro termo.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPautas(true)} tintColor={Colors.primary} />}
        >
          {pautas.map(pauta => {
            const cfg = getStatusCfg(pauta.status);
            return (
              <View key={pauta.id} style={styles.card}>
                {/* Cabeçalho do cartão */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.disciplina}>{pauta.disciplina}</Text>
                    <View style={styles.metaRow}>
                      {pauta.turmaNome && (
                        <View style={styles.metaTag}>
                          <MaterialCommunityIcons name="google-classroom" size={12} color={Colors.textMuted} />
                          <Text style={styles.metaTagText}>{pauta.classe} · {pauta.turmaNome}</Text>
                        </View>
                      )}
                      <View style={styles.metaTag}>
                        <MaterialCommunityIcons name="calendar-range" size={12} color={Colors.textMuted} />
                        <Text style={styles.metaTagText}>{pauta.anoLetivo} · {pauta.trimestre}.º Tri</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
                    <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Corpo do cartão */}
                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="account-tie" size={14} color={Colors.textMuted} />
                    <Text style={styles.infoText} numberOfLines={1}>
                      {pauta.professorNome || <Text style={{ color: Colors.textMuted, fontStyle: 'italic' }}>Sem professor</Text>}
                    </Text>
                  </View>
                  {pauta.dataFecho && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="calendar-check" size={14} color={Colors.success} />
                      <Text style={[styles.infoText, { color: Colors.success }]}>
                        Fechada em {new Date(pauta.dataFecho).toLocaleDateString('pt-PT')}
                      </Text>
                    </View>
                  )}
                  {pauta.numero && (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="numeric" size={14} color={Colors.textMuted} />
                      <Text style={styles.infoText}>Pauta n.º {pauta.numero}</Text>
                    </View>
                  )}
                  {pauta.lancamentoAdmin && (
                    <View style={styles.adminBadge}>
                      <MaterialCommunityIcons name="shield-account" size={13} color={Colors.info} />
                      <Text style={styles.adminText}>
                        Lançado pela Administração{pauta.lancadoPorAdminNome ? ` (${pauta.lancadoPorAdminNome})` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modais de filtro */}
      <PickerModal visible={showAnoModal} title="Filtrar por Ano" options={anosOpts} selected={anoLetivo} onSelect={setAnoLetivo} onClose={() => setShowAnoModal(false)} />
      <PickerModal visible={showTriModal} title="Filtrar por Trimestre" options={TRIMESTRES} selected={trimestre} onSelect={setTrimestre} onClose={() => setShowTriModal(false)} />
      <PickerModal visible={showStatusModal} title="Filtrar por Estado" options={STATUS_OPTS} selected={status} onSelect={setStatus} onClose={() => setShowStatusModal(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filtersWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  searchInput: { marginBottom: 0 },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.card, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnText: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7 },
  clearBtnText: { fontSize: 13, color: Colors.danger, fontFamily: 'Inter_500Medium' },
  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8,
  },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  statNum: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 },
  list: { flex: 1 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: Colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular' },
  emptyTitle: { color: Colors.text, fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 14, paddingBottom: 8,
  },
  cardHeaderLeft: { flex: 1, marginRight: 10 },
  disciplina: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 6 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.background, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  metaTagText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', flex: 1 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0a1e2d', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5, marginTop: 4,
  },
  adminText: { fontSize: 12, color: Colors.info, fontFamily: 'Inter_500Medium', flex: 1 },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center',
    alignItems: 'center', zIndex: 100,
  },
  modalBox: {
    backgroundColor: Colors.card, borderRadius: 14, width: '85%',
    maxWidth: 360, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '60',
  },
  modalOptionSelected: { backgroundColor: Colors.primary + '15' },
  modalOptionText: { fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular' },
});
