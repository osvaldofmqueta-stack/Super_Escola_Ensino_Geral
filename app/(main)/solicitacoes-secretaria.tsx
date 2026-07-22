import React, { useState, useEffect, useCallback } from 'react';
import {KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import TopBar from '@/components/TopBar';
import { apiRequest } from '@/lib/query-client';
import { alertSucesso, alertErro } from '@/utils/toast';
import { openPdfInTab } from '@/utils/pdfAuth';
import { StableSearchInput } from '@/components/StableSearchInput';
import PaginationBar from '@/components/PaginationBar';
import PdfProgressModal from '@/components/PdfProgressModal';
import { usePdfProgress } from '@/hooks/usePdfProgress';

interface Solicitacao {
  id: string;
  alunoId: string;
  tipo: string;
  motivo: string;
  observacao?: string;
  status: string;
  resposta?: string;
  referenciaPagamento?: string;
  validadoPorFinanceiro?: boolean;
  validadoPorFinanceiroNome?: string;
  validadoPorFinanceiroEm?: string;
  motivoRejeicaoFinanceiro?: string;
  createdAt: string;
  updatedAt?: string;
  nomeAluno?: string;
  apelidoAluno?: string;
  alunoNumMatricula?: string;
  nomeTurma?: string;
  classeAluno?: string;
}

const TIPO_BUILD_URL: Record<string, (alunoId: string, finalidade: string) => string> = {
  'Declaração de Matrícula':          (id, fin) => `/api/pdf/declaracao/${id}?tipo=matricula&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Certificado de Notas':             (id) => `/api/pdf/boletim/${id}?trimestre=1&autoprint=true`,
  'Certificado de Frequência':        (id, fin) => `/api/pdf/declaracao/${id}?tipo=frequencia&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Declaração de Conclusão de Curso': (id, fin) => `/api/pdf/declaracao/${id}?tipo=conclusao&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Histórico Escolar':                (id) => `/api/pdf/historico-academico/${id}?autoprint=true`,
  'Diploma':                          (id) => `/api/pdf/declaracao/${id}?tipo=habilitacoes&autoprint=true`,
  'Outros':                           (id, fin) => `/api/pdf/declaracao/${id}?tipo=matricula&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
};

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pendente:            { label: 'Ag. Validação Financ.', color: '#F59E0B', icon: 'time-outline' },
  validado_financeiro: { label: 'Validado — Pronto p/ Emitir', color: Colors.info, icon: 'checkmark-done-outline' },
  em_processamento:    { label: 'Em Processamento', color: '#8B5CF6', icon: 'cog-outline' },
  concluido:           { label: 'Concluído', color: Colors.success, icon: 'checkmark-circle-outline' },
  cancelado:           { label: 'Cancelado', color: Colors.danger, icon: 'close-circle-outline' },
};

const TIPO_ICONS: Record<string, string> = {
  'Declaração de Matrícula': 'document-text',
  'Certificado de Notas': 'bar-chart',
  'Certificado de Frequência': 'checkmark-circle',
  'Declaração de Conclusão de Curso': 'school',
  'Histórico Escolar': 'time',
  'Diploma': 'ribbon',
  'Outros': 'document',
};

const STATUS_FILTERS = ['todos', 'validado_financeiro', 'em_processamento', 'concluido', 'cancelado'];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch { return iso; }
}

export default function SolicitacoesSecretariaScreen() {
  const insets = useSafeAreaInsets();

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const [detailModal, setDetailModal] = useState<Solicitacao | null>(null);
  const [resposta, setResposta] = useState('');
  const [refPagamento, setRefPagamento] = useState('');
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emittingLabel, setEmittingLabel] = useState('');
  const pdfProgress = usePdfProgress();

  const fetchSolicitacoes = useCallback(async () => {
    try {
      const res = await apiRequest('GET', '/api/solicitacoes-documentos');
      const data = await res.json();
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch {
      setSolicitacoes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSolicitacoes();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSolicitacoes();
  };

  const solicitacoesSecretaria = solicitacoes.filter(s => s.status !== 'pendente');
  const pendentesCount = solicitacoes.filter(s => s.status === 'validado_financeiro').length;

  const filtradas = solicitacoesSecretaria.filter(s => {
    const matchStatus = filtroStatus === 'todos' || s.status === filtroStatus;
    const q = search.toLowerCase().trim();
    if (!matchStatus) return false;
    if (!q) return true;
    const nome = `${s.nomeAluno || ''} ${s.apelidoAluno || ''} ${s.tipo || ''} ${s.alunoNumMatricula || ''}`.toLowerCase();
    return nome.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedFiltradas = filtradas.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentPage(1); }, [search, filtroStatus]);

  async function updateStatus(sol: Solicitacao, status: string, extra?: { resposta?: string; referenciaPagamento?: string }) {
    setSaving(true);
    try {
      const body: any = { status, ...extra };
      const res = await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, body);
      if (res.ok) {
        const updated = await res.json();
        setSolicitacoes(prev => prev.map(s => s.id === sol.id ? { ...s, ...updated } : s));
        alertSucesso('Estado actualizado com sucesso');
        setDetailModal(null);
      } else {
        alertErro('Erro ao actualizar');
      }
    } catch {
      alertErro('Erro de conexão');
    } finally {
      setSaving(false);
    }
  }

  async function gerarDocumento(sol: Solicitacao) {
    setDetailModal(null);
    setEmitting(true);
    setEmittingLabel(sol.tipo);
    pdfProgress.start();
    try {
      await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: 'em_processamento' });
      setSolicitacoes(prev => prev.map(s => s.id === sol.id ? { ...s, status: 'em_processamento' } : s));

      const buildUrl = TIPO_BUILD_URL[sol.tipo] ?? TIPO_BUILD_URL['Outros'];
      const baseUrl = buildUrl(sol.alunoId, sol.motivo || 'Emissão solicitada pelo estudante');
      await openPdfInTab(baseUrl);

      await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, {
        status: 'concluido',
        resposta: 'Documento emitido. O aluno pode levantar na Secretaria Académica.',
      });
      setSolicitacoes(prev => prev.map(s => s.id === sol.id ? { ...s, status: 'concluido' } : s));
      pdfProgress.complete(() => alertSucesso('Documento emitido — aluno notificado para levantamento'));
    } catch {
      pdfProgress.cancel();
      alertErro('Erro ao gerar o documento');
    } finally {
      setEmitting(false);
    }
  }

  function openDetail(sol: Solicitacao) {
    setDetailModal(sol);
    setResposta(sol.resposta || '');
    setRefPagamento(sol.referenciaPagamento || '');
  }

  return (
    <View style={s.screen}>
      <TopBar title="Solicitações de Documentos" subtitle="Pedidos dos alunos" />

      <View style={s.summaryRow}>
        <View style={[s.summaryCard, { borderColor: Colors.info + '44' }]}>
          <Text style={[s.summaryNum, { color: Colors.info }]}>{pendentesCount}</Text>
          <Text style={s.summaryLbl}>Prontos p/ Emitir</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: '#8B5CF6' + '44' }]}>
          <Text style={[s.summaryNum, { color: '#8B5CF6' }]}>{solicitacoesSecretaria.filter(s => s.status === 'em_processamento').length}</Text>
          <Text style={s.summaryLbl}>Em Processo</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: Colors.success + '44' }]}>
          <Text style={[s.summaryNum, { color: Colors.success }]}>{solicitacoesSecretaria.filter(s => s.status === 'concluido').length}</Text>
          <Text style={s.summaryLbl}>Concluídos</Text>
        </View>
        <View style={[s.summaryCard, { borderColor: Colors.textMuted + '44' }]}>
          <Text style={[s.summaryNum, { color: Colors.textMuted }]}>{solicitacoesSecretaria.length}</Text>
          <Text style={s.summaryLbl}>Total</Text>
        </View>
      </View>

      <View style={s.searchWrap}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={s.searchInput}
          placeholder="Pesquisar por aluno, tipo..."
          iconColor={Colors.textMuted}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersRow} contentContainerStyle={s.filtersContent}>
        {STATUS_FILTERS.map(f => {
          const meta = f === 'todos' ? { label: 'Todos', color: Colors.textSecondary } : { label: STATUS_META[f]?.label || f, color: STATUS_META[f]?.color || Colors.textMuted };
          const active = filtroStatus === f;
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, active && { backgroundColor: meta.color, borderColor: meta.color }]}
              onPress={() => setFiltroStatus(f)}
              activeOpacity={0.7}
            >
              <Text style={[s.filterChipText, active && { color: '#fff' }]}>{meta.label}</Text>
              {f !== 'todos' && (
                <Text style={[s.filterBadge, active && { color: '#fff' }]}>
                  {solicitacoes.filter(s => s.status === f).length}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 12, width: '100%' }}>
          <SkeletonList rows={6} />
          <Text style={s.loadingText}>A carregar solicitações...</Text>
        </View>
      ) : (
        <>
        <ScrollView
          style={s.list}
          contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 20 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.gold]} tintColor={Colors.gold} />}
          showsVerticalScrollIndicator={false}
        >
          {filtradas.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="file-document-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>Sem solicitações</Text>
              <Text style={s.emptyText}>
                {filtroStatus === 'todos' ? 'Nenhuma solicitação registada' : `Sem pedidos ${STATUS_META[filtroStatus]?.label?.toLowerCase() || ''}`}
              </Text>
            </View>
          ) : (
            pagedFiltradas.map(sol => {
              const meta = STATUS_META[sol.status] || STATUS_META.pendente;
              const icon = TIPO_ICONS[sol.tipo] || 'document-text';
              const nomeCompleto = [sol.nomeAluno, sol.apelidoAluno].filter(Boolean).join(' ') || '—';
              return (
                <TouchableOpacity key={sol.id} style={[s.card, sol.status === 'validado_financeiro' && s.cardHighlight]} onPress={() => openDetail(sol)} activeOpacity={0.8}>
                  <View style={s.cardTop}>
                    <View style={[s.cardIconWrap, { backgroundColor: Colors.gold + '18' }]}>
                      <Ionicons name={icon as any} size={18} color={Colors.gold} />
                    </View>
                    <View style={s.cardBody}>
                      <Text style={s.cardTipo} numberOfLines={1}>{sol.tipo}</Text>
                      <Text style={s.cardAluno} numberOfLines={1}>
                        {nomeCompleto}
                        {sol.nomeTurma ? ` · ${sol.nomeTurma}` : ''}
                        {sol.alunoNumMatricula ? ` · ${sol.alunoNumMatricula}` : ''}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
                      <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                      <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>

                  {sol.validadoPorFinanceiro && sol.validadoPorFinanceiroNome && (
                    <View style={s.financeTagInline}>
                      <Ionicons name="checkmark-done-circle" size={12} color={Colors.success} />
                      <Text style={s.financeTagText}>
                        Pagamento confirmado por <Text style={{ fontWeight: '700' }}>{sol.validadoPorFinanceiroNome}</Text>
                      </Text>
                    </View>
                  )}

                  {sol.motivo ? (
                    <Text style={s.cardMotivo} numberOfLines={2}>"{sol.motivo}"</Text>
                  ) : null}
                  <View style={s.cardFooter}>
                    <Text style={s.cardDate}>{formatDate(sol.createdAt)}</Text>
                    <View style={s.cardActions}>
                      {(sol.status === 'validado_financeiro' || sol.status === 'em_processamento') && (
                        <TouchableOpacity
                          style={s.btnGerar}
                          onPress={e => { e.stopPropagation?.(); gerarDocumento(sol); }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="print-outline" size={12} color="#fff" />
                          <Text style={s.btnGerarText}>Emitir</Text>
                        </TouchableOpacity>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={insets.bottom} />
        </>
      )}

      <PdfProgressModal
        visible={pdfProgress.visible}
        step={pdfProgress.step}
        label={emittingLabel || 'Documento'}
        color={Colors.gold}
      />

      <Modal visible={!!detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {detailModal && (() => {
              const meta = STATUS_META[detailModal.status] || STATUS_META.pendente;
              const nomeCompleto = [detailModal.nomeAluno, detailModal.apelidoAluno].filter(Boolean).join(' ') || '—';
              const isReadyToEmit = detailModal.status === 'validado_financeiro' || detailModal.status === 'em_processamento';
              const isConcluido = detailModal.status === 'concluido';
              return (
                <>
                  <View style={s.modalHeader}>
                    <View style={[s.modalIconWrap, { backgroundColor: Colors.gold + '18' }]}>
                      <MaterialCommunityIcons name="file-account" size={20} color={Colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle} numberOfLines={1}>{detailModal.tipo}</Text>
                      <Text style={s.modalSub}>{nomeCompleto}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setDetailModal(null)} style={s.modalClose}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Banner: pagamento validado pelo financeiro */}
                  {detailModal.validadoPorFinanceiro && detailModal.validadoPorFinanceiroNome && (
                    <View style={s.financeValidBanner}>
                      <View style={s.financeValidIconWrap}>
                        <Ionicons name="checkmark-done-circle" size={20} color={Colors.success} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.financeValidTitle}>Pagamento Validado pelo Financeiro</Text>
                        <Text style={s.financeValidText}>
                          Confirmado por <Text style={{ fontWeight: '700' }}>{detailModal.validadoPorFinanceiroNome}</Text>
                          {detailModal.validadoPorFinanceiroEm ? ` · ${formatDate(detailModal.validadoPorFinanceiroEm)}` : ''}
                        </Text>
                        {detailModal.referenciaPagamento ? (
                          <Text style={s.financeValidRef}>Ref: {detailModal.referenciaPagamento}</Text>
                        ) : null}
                      </View>
                    </View>
                  )}

                  {/* Banner: concluído — disponível para levantamento */}
                  {isConcluido && (
                    <View style={s.concluidoBanner}>
                      <Ionicons name="bag-check-outline" size={20} color={Colors.success} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.concluidoTitle}>Documento Disponível</Text>
                        <Text style={s.concluidoText}>
                          O aluno pode levantar o documento na Secretaria Académica.
                        </Text>
                      </View>
                    </View>
                  )}

                  <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
                    <View style={s.infoRow}>
                      <Text style={s.infoLabel}>Estado</Text>
                      <View style={[s.statusBadge, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
                        <Ionicons name={meta.icon as any} size={11} color={meta.color} />
                        <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {detailModal.nomeAluno ? (
                      <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Aluno</Text>
                        <Text style={[s.infoVal, { fontWeight: '600' }]}>{nomeCompleto}</Text>
                      </View>
                    ) : null}
                    {detailModal.nomeTurma && (
                      <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Turma</Text>
                        <Text style={s.infoVal}>{detailModal.nomeTurma}{detailModal.classeAluno ? ` · ${detailModal.classeAluno}ª Classe` : ''}</Text>
                      </View>
                    )}
                    {detailModal.alunoNumMatricula && (
                      <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Nº Matrícula</Text>
                        <Text style={s.infoVal}>{detailModal.alunoNumMatricula}</Text>
                      </View>
                    )}
                    <View style={s.infoRow}>
                      <Text style={s.infoLabel}>Data do Pedido</Text>
                      <Text style={s.infoVal}>{formatDate(detailModal.createdAt)}</Text>
                    </View>
                    {detailModal.motivo && (
                      <View style={s.infoBlock}>
                        <Text style={s.infoLabel}>Motivo</Text>
                        <Text style={s.infoBlockText}>{detailModal.motivo}</Text>
                      </View>
                    )}
                    {detailModal.observacao && (
                      <View style={s.infoBlock}>
                        <Text style={s.infoLabel}>Observação do Aluno</Text>
                        <Text style={s.infoBlockText}>{detailModal.observacao}</Text>
                      </View>
                    )}

                    {!isConcluido && (
                      <>
                        <View style={s.divider} />
                        <Text style={s.fieldLabel}>Resposta / Nota Interna</Text>
                        <TextInput
                          style={s.textInput}
                          placeholder="Adicione uma nota de resposta ao aluno..."
                          placeholderTextColor={Colors.textMuted}
                          value={resposta}
                          onChangeText={setResposta}
                          multiline
                          numberOfLines={3}
                        />
                        <Text style={s.fieldLabel}>Referência de Pagamento (opcional)</Text>
                        <TextInput
                          style={s.textInput}
                          placeholder="Ex: ATM/REF/12345"
                          placeholderTextColor={Colors.textMuted}
                          value={refPagamento}
                          onChangeText={setRefPagamento}
                        />
                      </>
                    )}
                  </ScrollView>

                  <View style={s.modalActions}>
                    {isReadyToEmit && (
                      <TouchableOpacity
                        style={s.btnEmitirGrande}
                        onPress={() => gerarDocumento(detailModal)}
                        activeOpacity={0.8}
                        disabled={emitting}
                      >
                        {emitting
                          ? <AppLoader size="small" color="#fff" />
                          : <Ionicons name="print-outline" size={18} color="#fff" />
                        }
                        <Text style={s.btnEmitirGrandeText}>Emitir e Imprimir Documento</Text>
                      </TouchableOpacity>
                    )}

                    <View style={s.actionsRow}>
                      {detailModal.status === 'validado_financeiro' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor: '#8B5CF6' }]}
                          onPress={() => updateStatus(detailModal, 'em_processamento', { resposta, referenciaPagamento: refPagamento || undefined })}
                          disabled={saving}
                          activeOpacity={0.8}
                        >
                          {saving ? <AppLoader size="small" color="#8B5CF6" /> : (
                            <Text style={[s.actionBtnText, { color: '#8B5CF6' }]}>Em Processamento</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {isReadyToEmit && (
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor: Colors.success, backgroundColor: Colors.success + '10' }]}
                          onPress={() => updateStatus(detailModal, 'concluido', { resposta, referenciaPagamento: refPagamento || undefined })}
                          disabled={saving}
                          activeOpacity={0.8}
                        >
                          {saving ? <AppLoader size="small" color={Colors.success} /> : (
                            <Text style={[s.actionBtnText, { color: Colors.success }]}>Marcar Concluído</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {detailModal.status !== 'cancelado' && detailModal.status !== 'concluido' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { borderColor: Colors.danger }]}
                          onPress={() => updateStatus(detailModal, 'cancelado', { resposta })}
                          disabled={saving}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.actionBtnText, { color: Colors.danger }]}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', gap: 2 },
  summaryNum: { fontSize: 22, fontWeight: '700' },
  summaryLbl: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },

  filtersRow: { marginTop: 10 },
  filtersContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surface,
  },
  filterChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  filterBadge: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { color: Colors.textMuted, fontSize: 14 },

  list: { flex: 1, marginTop: 10 },
  listContent: { paddingHorizontal: 16, gap: 8 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6,
  },
  cardHighlight: {
    borderColor: Colors.info + '55', borderWidth: 1.5,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTipo: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cardAluno: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  financeTagInline: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success + '12', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  financeTagText: { fontSize: 11, color: Colors.success, fontWeight: '500' },

  cardMotivo: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardDate: { fontSize: 10, color: Colors.textMuted },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: '600' },

  btnGerar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.info, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  btnGerarText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  emittingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  emittingBox: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 28, alignItems: 'center', gap: 12,
  },
  emittingText: { fontSize: 14, color: Colors.text, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%', paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.gold, fontWeight: '600', marginTop: 1 },
  modalClose: { padding: 4 },

  financeValidBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.success + '15',
    borderLeftWidth: 3, borderLeftColor: Colors.success,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 12, borderRadius: 10,
  },
  financeValidIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.success + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  financeValidTitle: { fontSize: 13, fontWeight: '700', color: Colors.success, marginBottom: 2 },
  financeValidText: { fontSize: 11, color: Colors.success, opacity: 0.85 },
  financeValidRef: { fontSize: 11, color: Colors.success, fontWeight: '600', marginTop: 2 },

  concluidoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.info + '12',
    borderLeftWidth: 3, borderLeftColor: Colors.info,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 12, borderRadius: 10,
  },
  concluidoTitle: { fontSize: 13, fontWeight: '700', color: Colors.info, marginBottom: 2 },
  concluidoText: { fontSize: 11, color: Colors.info, opacity: 0.85 },

  modalBody: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  infoLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  infoVal: { fontSize: 13, color: Colors.text, textAlign: 'right', flex: 1, marginLeft: 12 },
  infoBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  infoBlockText: { fontSize: 13, color: Colors.text, marginTop: 4, lineHeight: 18 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  fieldLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10, fontSize: 13, color: Colors.text,
    marginBottom: 12, minHeight: 44,
  },

  modalActions: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },

  btnEmitirGrande: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.info, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  btnEmitirGrandeText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    minWidth: 90,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
});
