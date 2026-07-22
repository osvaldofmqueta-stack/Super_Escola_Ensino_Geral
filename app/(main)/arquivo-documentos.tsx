import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { usePermissoes } from '@/context/PermissoesContext';
import { webAlert } from '@/utils/webAlert';
import { StableSearchInput } from '@/components/StableSearchInput';
import PaginationBar from '@/components/PaginationBar';

// ─── Types ───────────────────────────────────────────────────────────────────
interface DocumentoEmitido {
  id: string;
  aluno_id: string | null;
  aluno_nome: string;
  aluno_num: string;
  aluno_turma: string;
  tipo: string;
  finalidade: string;
  ano_academico: string;
  emitido_por: string;
  emitido_em: string;
  dados_snapshot: Record<string, unknown> | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TIPOS_DOCUMENTO = [
  { key: '', label: 'Todos os Tipos' },
  { key: 'certidao_habilitacoes', label: 'Certidão de Habilitações' },
  { key: 'declaracao_matricula', label: 'Declaração de Matrícula' },
  { key: 'declaracao_frequencia', label: 'Declaração de Frequência' },
  { key: 'historico_escolar', label: 'Histórico Escolar' },
  { key: 'boletim_notas', label: 'Boletim de Notas' },
  { key: 'atestado_aproveitamento', label: 'Atestado de Aproveitamento' },
  { key: 'carta_recomendacao', label: 'Carta de Recomendação' },
  { key: 'mini_pauta', label: 'Mini-Pauta' },
  { key: 'pauta_final', label: 'Pauta Final' },
  { key: 'mapa_turma', label: 'Mapa de Turma' },
  { key: 'outro', label: 'Outro' },
];

const TIPO_ICONS: Record<string, string> = {
  certidao_habilitacoes: 'ribbon-outline',
  declaracao_matricula: 'document-text-outline',
  declaracao_frequencia: 'school-outline',
  historico_escolar: 'library-outline',
  boletim_notas: 'bar-chart-outline',
  atestado_aproveitamento: 'checkmark-circle-outline',
  carta_recomendacao: 'mail-outline',
  mini_pauta: 'list-outline',
  pauta_final: 'clipboard-outline',
  mapa_turma: 'people-outline',
  outro: 'document-outline',
};

const TIPO_COLORS: Record<string, string> = {
  certidao_habilitacoes: Colors.gold,
  declaracao_matricula: Colors.info,
  declaracao_frequencia: Colors.accent,
  historico_escolar: '#a78bfa',
  boletim_notas: Colors.success,
  atestado_aproveitamento: Colors.success,
  carta_recomendacao: Colors.warning,
  mini_pauta: Colors.textSecondary,
  pauta_final: Colors.textSecondary,
  mapa_turma: Colors.info,
  outro: Colors.textMuted,
};

function getTipoLabel(key: string): string {
  return TIPOS_DOCUMENTO.find(t => t.key === key)?.label ?? key.replace(/_/g, ' ');
}

function getTipoIcon(key: string): string {
  return TIPO_ICONS[key] ?? 'document-outline';
}

function getTipoColor(key: string): string {
  return TIPO_COLORS[key] ?? Colors.textMuted;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ArquivoDocumentosScreen() {
  const { user } = useAuth();
  const { anoSelecionado } = useAnoAcademico();
  const { hasPermission: podeAcessar } = usePermissoes();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = Platform.OS === 'web' ? 20 : insets.bottom;

  const [docs, setDocs] = useState<DocumentoEmitido[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterAno, setFilterAno] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [selectedDoc, setSelectedDoc] = useState<DocumentoEmitido | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const anoAtual = anoSelecionado?.ano ?? '';

  const canManage = podeAcessar('arquivo_documentos');

  const loadDocs = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTipo) params.set('tipo', filterTipo);
      if (filterAno) params.set('anoAcademico', filterAno);
      const r = await fetch(`/api/documentos-emitidos?${params.toString()}`);
      if (r.ok) {
        const data = await r.json();
        setDocs(Array.isArray(data) ? data : []);
      }
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterTipo, filterAno]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDocs(true);
  }, [loadDocs]);

  const filteredDocs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return docs.filter(d => {
      if (!q) return true;
      return (
        d.aluno_nome.toLowerCase().includes(q) ||
        d.aluno_num.toLowerCase().includes(q) ||
        d.aluno_turma.toLowerCase().includes(q) ||
        d.tipo.toLowerCase().includes(q) ||
        d.finalidade.toLowerCase().includes(q) ||
        d.emitido_por.toLowerCase().includes(q)
      );
    });
  }, [docs, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedDocs = useMemo(() => filteredDocs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredDocs, safePage]);
  useEffect(() => { setCurrentPage(1); }, [search, filterTipo, filterAno]);

  const groupedByTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    docs.forEach(d => { counts[d.tipo] = (counts[d.tipo] ?? 0) + 1; });
    return counts;
  }, [docs]);

  async function handleDelete(id: string) {
    webAlert('Remover Documento', 'Tem a certeza de que deseja remover este registo do arquivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            const r = await fetch(`/api/documentos-emitidos/${id}`, { method: 'DELETE' });
            if (r.ok) {
              setDocs(prev => prev.filter(d => d.id !== id));
              setShowDetailModal(false);
              setSelectedDoc(null);
            } else {
              webAlert('Erro', 'Não foi possível remover o documento.');
            }
          } catch {
            webAlert('Erro', 'Erro de rede ao remover documento.');
          } finally {
            setDeleting(false);
          }
        }
      },
    ]);
  }

  function handleReissue(doc: DocumentoEmitido) {
    setShowDetailModal(false);
    if (doc.tipo === 'mini_pauta' && doc.dados_snapshot && (doc.dados_snapshot as Record<string, unknown>).html) {
      if (Platform.OS === 'web') {
        const html = (doc.dados_snapshot as Record<string, unknown>).html as string;
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); }
      }
      return;
    }
    router.push({
      pathname: '/(main)/gerar-documento',
      params: {
        alunoId: doc.aluno_id ?? '',
        tipo: doc.tipo,
        finalidade: doc.finalidade,
        anoAcademico: doc.ano_academico,
      },
    } as any);
  }

  const activeFiltersCount = [filterTipo, filterAno].filter(Boolean).length;

  function renderDocCard({ item: doc }: { item: DocumentoEmitido }) {
    const color = getTipoColor(doc.tipo);
    const icon = getTipoIcon(doc.tipo) as any;
    return (
      <TouchableOpacity
        style={styles.docCard}
        onPress={() => { setSelectedDoc(doc); setShowDetailModal(true); }}
        activeOpacity={0.82}
      >
        <View style={[styles.docIconBg, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.docCardBody}>
          <View style={styles.docCardRow}>
            <Text style={[styles.docTipoLabel, { color }]} numberOfLines={1}>
              {getTipoLabel(doc.tipo)}
            </Text>
            <Text style={styles.docDate}>{formatDate(doc.emitido_em)}</Text>
          </View>
          <Text style={styles.docAluno} numberOfLines={1}>
            {doc.aluno_nome}{doc.aluno_num ? ` · Nº ${doc.aluno_num}` : ''}
          </Text>
          {(doc.aluno_turma || doc.finalidade) ? (
            <View style={styles.docCardMeta}>
              {!!doc.aluno_turma && (
                <View style={styles.metaChip}>
                  <Ionicons name="people-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.metaChipText}>{doc.aluno_turma}</Text>
                </View>
              )}
              {!!doc.finalidade && (
                <View style={styles.metaChip}>
                  <Ionicons name="flag-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.metaChipText} numberOfLines={1}>{doc.finalidade}</Text>
                </View>
              )}
              {!!doc.ano_academico && (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.metaChipText}>{doc.ano_academico}</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar
        title="Arquivo de Documentos"
        subtitle={`${filteredDocs.length} documento${filteredDocs.length !== 1 ? 's' : ''} registado${filteredDocs.length !== 1 ? 's' : ''}`}
      />

      {/* Search + Filter Bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchText}
            placeholder="Pesquisar aluno, turma, tipo..."
            iconColor={Colors.textMuted}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="options-outline" size={18} color={activeFiltersCount > 0 ? Colors.gold : Colors.textSecondary} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Type Summary Chips */}
      {!loading && docs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
          <TouchableOpacity
            style={[styles.chip, !filterTipo && styles.chipActive]}
            onPress={() => setFilterTipo('')}
          >
            <Text style={[styles.chipText, !filterTipo && styles.chipTextActive]}>Todos ({docs.length})</Text>
          </TouchableOpacity>
          {Object.entries(groupedByTipo).sort((a, b) => b[1] - a[1]).map(([tipo, count]) => (
            <TouchableOpacity
              key={tipo}
              style={[styles.chip, filterTipo === tipo && styles.chipActive, { borderColor: getTipoColor(tipo) + '55' }]}
              onPress={() => setFilterTipo(prev => prev === tipo ? '' : tipo)}
            >
              <Ionicons name={getTipoIcon(tipo) as any} size={11} color={filterTipo === tipo ? Colors.gold : getTipoColor(tipo)} />
              <Text style={[styles.chipText, filterTipo === tipo && styles.chipTextActive]}>
                {getTipoLabel(tipo)} ({count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* List */}
      {loading ? (
        <View style={{ padding: 12 }}>
          <SkeletonList rows={6} />
        </View>
      ) : filteredDocs.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="folder-open-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {search || filterTipo || filterAno ? 'Nenhum documento encontrado' : 'Arquivo vazio'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search || filterTipo || filterAno
              ? 'Tente ajustar os filtros de pesquisa'
              : 'Os documentos emitidos aparecerão aqui automaticamente'}
          </Text>
          {!search && !filterTipo && !filterAno && docs.length === 0 && (
            <Text style={styles.emptyHint}>
              Inclui documentos como certidão de habilitações, declaração de matrícula, declaração de frequência, histórico escolar, boletim de notas, atestado de aproveitamento, carta de recomendação, mini-pauta, pauta final e mapa de turma.
            </Text>
          )}
          {(search || filterTipo || filterAno) && (
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => { setSearch(''); setFilterTipo(''); setFilterAno(''); }}>
              <Text style={styles.clearFiltersText}>Limpar filtros</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <FlatList
            data={pagedDocs}
            keyExtractor={d => d.id}
            renderItem={renderDocCard}
            contentContainerStyle={{ paddingBottom: 8, paddingTop: 4 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
          <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomInset} />
        </>
      )}

      {/* ─── Filter Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar Documentos</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterSectionLabel}>Tipo de Documento</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {TIPOS_DOCUMENTO.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.filterOption, filterTipo === t.key && styles.filterOptionActive]}
                  onPress={() => setFilterTipo(t.key)}
                >
                  {t.key ? (
                    <Ionicons name={getTipoIcon(t.key) as any} size={15} color={filterTipo === t.key ? Colors.gold : getTipoColor(t.key)} />
                  ) : (
                    <Ionicons name="grid-outline" size={15} color={Colors.textMuted} />
                  )}
                  <Text style={[styles.filterOptionText, filterTipo === t.key && styles.filterOptionTextActive]}>
                    {t.label}
                  </Text>
                  {filterTipo === t.key && <Ionicons name="checkmark" size={16} color={Colors.gold} />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterSectionLabel, { marginTop: 16 }]}>Ano Académico</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Ex: 2024/2025"
              placeholderTextColor={Colors.textMuted}
              value={filterAno}
              onChangeText={setFilterAno}
            />

            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.filterClearBtn}
                onPress={() => { setFilterTipo(''); setFilterAno(''); setShowFilterModal(false); }}
              >
                <Text style={styles.filterClearText}>Limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.filterApplyText}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ─── Detail Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={showDetailModal} transparent animationType="slide" onRequestClose={() => setShowDetailModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            {selectedDoc && (() => {
              const color = getTipoColor(selectedDoc.tipo);
              const icon = getTipoIcon(selectedDoc.tipo) as any;
              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={[styles.docIconBg, { backgroundColor: color + '22', marginRight: 10 }]}>
                      <Ionicons name={icon} size={20} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalTitle, { color }]}>{getTipoLabel(selectedDoc.tipo)}</Text>
                      <Text style={styles.modalSub}>{formatDate(selectedDoc.emitido_em)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowDetailModal(false)} style={styles.closeBtn}>
                      <Ionicons name="close" size={22} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailGrid}>
                    <DetailRow icon="person-outline" label="Aluno" value={selectedDoc.aluno_nome} />
                    {!!selectedDoc.aluno_num && <DetailRow icon="key-outline" label="Número" value={selectedDoc.aluno_num} />}
                    {!!selectedDoc.aluno_turma && <DetailRow icon="people-outline" label="Turma" value={selectedDoc.aluno_turma} />}
                    {!!selectedDoc.finalidade && <DetailRow icon="flag-outline" label="Finalidade" value={selectedDoc.finalidade} />}
                    {!!selectedDoc.ano_academico && <DetailRow icon="calendar-outline" label="Ano Académico" value={selectedDoc.ano_academico} />}
                    <DetailRow icon="person-circle-outline" label="Emitido por" value={selectedDoc.emitido_por} />
                    <DetailRow icon="time-outline" label="Data de Emissão" value={formatDate(selectedDoc.emitido_em)} />
                  </View>

                  <View style={styles.detailActions}>
                    {(selectedDoc.aluno_id || selectedDoc.tipo === 'mini_pauta' || selectedDoc.tipo === 'pauta_final' || selectedDoc.tipo === 'mapa_turma') && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.accent }]}
                        onPress={() => handleReissue(selectedDoc)}
                      >
                        <Ionicons name="print-outline" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>
                          {selectedDoc.tipo === 'mini_pauta' ? 'Reimprimir Mini-Pauta' : 'Reemitir Documento'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {canManage && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: Colors.danger + 'CC' }]}
                        onPress={() => handleDelete(selectedDoc.id)}
                        disabled={deleting}
                      >
                        {deleting
                          ? <AppLoader size="small" color="#fff" />
                          : <Ionicons name="trash-outline" size={16} color="#fff" />}
                        <Text style={styles.actionBtnText}>Remover do Arquivo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={14} color={Colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  searchText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, outlineStyle: 'none' } as any,
  filterBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  filterBtnActive: { borderColor: Colors.gold + '88', backgroundColor: Colors.gold + '15' },
  filterBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#000' },
  chipsScroll: { maxHeight: 46, borderBottomWidth: 1, borderBottomColor: Colors.border },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '88' },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  chipTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  clearFiltersBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.accent, borderRadius: 10 },
  clearFiltersText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: 72 },
  docCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  docIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docCardBody: { flex: 1, gap: 2 },
  docCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docTipoLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1, marginRight: 8 },
  docDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  docAluno: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  docCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  metaChipText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  closeBtn: { padding: 4 },
  filterSectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  filterOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  filterOptionActive: { backgroundColor: Colors.gold + '15' },
  filterOptionText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  filterOptionTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  filterInput: { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  filterActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  filterClearBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  filterClearText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  filterApplyBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.gold, alignItems: 'center' },
  filterApplyText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  detailGrid: { gap: 12, marginBottom: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  detailValue: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text, marginTop: 2 },
  detailActions: { gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
