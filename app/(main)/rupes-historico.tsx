import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { api } from '@/lib/api';
import { useData } from '@/context/DataContext';
import { useFinanceiro, formatAOA, RUPEGerado } from '@/context/FinanceiroContext';
import { webAlert } from '@/utils/webAlert';
import { openPdfInTab } from '@/utils/pdfAuth';
import { StableSearchInput } from '@/components/StableSearchInput';
import { SkeletonPage } from '@/components/Skeleton';

type FiltroStatus = 'todos' | 'ativo' | 'pago' | 'expirado';

export default function RupesHistoricoScreen() {
  const { alunos } = useData();
  const { taxas } = useFinanceiro();
  const [rupes, setRupes] = useState<RUPEGerado[]>([]);
  const [loading, setLoading] = useState(true);
  const [verificandoId, setVerificandoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroStatus>('todos');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [pagina, setPagina] = useState(1);
  const PAGE_SIZE = 8;
  const [consultaAberta, setConsultaAberta] = useState(false);
  const [consultaRef, setConsultaRef] = useState('');
  const [consultando, setConsultando] = useState(false);
  // `agora` is refreshed once a minute so it doesn't churn on every keystroke
  // (which previously rebuilt the whole list and caused the search input to lose focus).
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const [consultaResultado, setConsultaResultado] = useState<{
    referencia: string;
    pago: boolean;
    estado: string;
    dataPagamento?: string;
    valor?: number;
    fonte: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<RUPEGerado[]>('/api/rupes');
      setRupes(data || []);
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível carregar as referências bancárias.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Reset page when filter or search changes
  useEffect(() => { setPagina(1); }, [filtro, deferredQuery]);
  const topBarRightAction = useMemo(
    () => ({ icon: 'refresh', onPress: load }),
    [load],
  );

  function statusEfetivo(r: RUPEGerado): 'pago' | 'ativo' | 'expirado' {
    if (r.status === 'pago') return 'pago';
    const venc = new Date(r.dataValidade).getTime();
    if (venc < agora) return 'expirado';
    return 'ativo';
  }

  const alunosMap = useMemo(() => {
    const m = new Map<string, { nome: string; matricula: string }>();
    for (const a of alunos) {
      m.set(a.id, {
        nome: `${a.nome} ${a.apelido || ''}`.trim(),
        matricula: a.numeroMatricula || '',
      });
    }
    return m;
  }, [alunos]);

  function alunoNome(id: string) {
    return alunosMap.get(id)?.nome || id;
  }
  function alunoMatricula(id: string) {
    return alunosMap.get(id)?.matricula || '';
  }

  const filtradas = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rupes.filter(r => {
      const eff = statusEfetivo(r);
      if (filtro !== 'todos' && eff !== filtro) return false;
      if (!q) return true;
      const meta = alunosMap.get(r.alunoId);
      const nome = (meta?.nome || '').toLowerCase();
      const ref = (r.referencia || '').toLowerCase();
      const mat = (meta?.matricula || '').toLowerCase();
      return nome.includes(q) || ref.includes(q) || mat.includes(q);
    });
  }, [rupes, filtro, deferredQuery, agora, alunosMap]);

  const total = rupes.length;
  const pagos = rupes.filter(r => statusEfetivo(r) === 'pago').length;
  const ativos = rupes.filter(r => statusEfetivo(r) === 'ativo').length;
  const expirados = rupes.filter(r => statusEfetivo(r) === 'expirado').length;
  const valorTotal = rupes.reduce((s, r) => s + Number(r.valor || 0), 0);
  const valorPendente = rupes.filter(r => statusEfetivo(r) === 'ativo').reduce((s, r) => s + Number(r.valor || 0), 0);

  function fmtData(s: string) {
    try {
      const d = new Date(s);
      return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    } catch { return s; }
  }

  function tempoRestante(r: RUPEGerado) {
    const venc = new Date(r.dataValidade).getTime();
    const ms = venc - agora;
    if (ms <= 0) return 'Expirado';
    const horas = Math.floor(ms / 3600000);
    if (horas >= 48) return `${Math.floor(horas / 24)} dias`;
    if (horas >= 1) return `${horas}h restantes`;
    return `${Math.max(1, Math.floor(ms / 60000))} min restantes`;
  }

  function copiar(ref: string) {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(ref).then(
          () => webAlert('Copiado', 'Referência copiada.'),
          () => {}
        );
      }
    } catch {}
  }

  async function abrirComprovativo(r: RUPEGerado) {
    try {
      await openPdfInTab(`/api/pdf/multicaixa/${encodeURIComponent(r.id)}`);
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível abrir o comprovativo.'));
    }
  }

  async function consultarReferencia() {
    const ref = consultaRef.trim();
    if (!ref) {
      webAlert('Atenção', 'Indique a referência a consultar.');
      return;
    }
    setConsultando(true);
    setConsultaResultado(null);
    try {
      const resp = await api.get<{
        referencia: string;
        pago: boolean;
        estado: string;
        dataPagamento?: string;
        valor?: number;
        fonte: string;
      }>(`/api/emis/verificar/${encodeURIComponent(ref)}`);
      setConsultaResultado(resp);
      const localMatch = rupes.find(x => x.referencia === ref);
      if (localMatch && resp.pago && localMatch.status !== 'pago') {
        await load();
      }
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível consultar a referência.'));
    } finally {
      setConsultando(false);
    }
  }

  async function verificar(r: RUPEGerado) {
    if (verificandoId) return;
    setVerificandoId(r.id);
    try {
      const resp = await api.post<{ rupe: RUPEGerado; mudou: boolean; mensagem: string; consultadoBanco?: boolean }>(
        `/api/rupes/${encodeURIComponent(r.id)}/verificar`,
        {}
      );
      if (resp.mudou) {
        setRupes(prev => prev.map(x => x.id === r.id ? resp.rupe : x));
      }
      const titulo = resp.consultadoBanco ? 'Estado verificado no banco' : 'Estado verificado';
      webAlert(titulo, resp.mensagem || 'Verificação concluída.');
    } catch (e: any) {
      webAlert('Erro', String(e?.message || 'Não foi possível verificar.'));
    } finally {
      setVerificandoId(null);
    }
  }

  function chipColor(s: string) {
    if (s === 'pago') return Colors.success;
    if (s === 'expirado') return Colors.danger;
    return Colors.info;
  }
  function chipIcon(s: string): any {
    if (s === 'pago') return 'checkmark-circle';
    if (s === 'expirado') return 'close-circle';
    return 'time';
  }
  function chipLabel(s: string) {
    if (s === 'pago') return 'Pago';
    if (s === 'expirado') return 'Expirado';
    return 'Activo';
  }

  if (loading) return <SkeletonPage variant="table" />;

  return (
    <View style={s.container}>
      <TopBar
        title="Referências Bancárias Multicaixa"
        subtitle={`${total} referência${total === 1 ? '' : 's'} no sistema`}
        rightAction={topBarRightAction}
      />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* KPIs */}
        <View style={s.kpiRow}>
          {[
            { label: 'Total',     v: String(total),                    color: Colors.textPrimary },
            { label: 'Activos',   v: String(ativos),                   color: Colors.info },
            { label: 'Pagos',     v: String(pagos),                    color: Colors.success },
            { label: 'Expirados', v: String(expirados),                color: Colors.danger },
            { label: 'Valor pendente', v: formatAOA(valorPendente),    color: Colors.warning },
            { label: 'Valor total',    v: formatAOA(valorTotal),       color: Colors.textPrimary },
          ].map(k => (
            <View key={k.label} style={s.kpi}>
              <Text style={[s.kpiV, { color: k.color }]}>{k.v}</Text>
              <Text style={s.kpiL}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Consulta directa por referência (usa GET /api/emis/verificar/:referencia) */}
        <View style={s.consultaCard}>
          <TouchableOpacity
            onPress={() => setConsultaAberta(v => !v)}
            style={s.consultaHeader}
            activeOpacity={0.7}
          >
            <Ionicons name="search-circle" size={18} color={Colors.info} />
            <Text style={s.consultaTitle}>Consultar referência directa</Text>
            <View style={{ flex: 1 }} />
            <Ionicons
              name={consultaAberta ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textMuted}
            />
          </TouchableOpacity>

          {consultaAberta && (
            <View style={s.consultaBody}>
              <Text style={s.consultaHint}>
                Indique o número de referência bancária (do talão ATM ou app Multicaixa Express) para verificar o estado junto do banco/EMIS, mesmo que não conste na lista.
              </Text>
              <View style={s.consultaInputRow}>
                <TextInput
                  value={consultaRef}
                  onChangeText={setConsultaRef}
                  placeholder="Ex: 123456789012345"
                  placeholderTextColor={Colors.textMuted}
                  style={s.consultaInput}
                  editable={!consultando}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  onPress={consultarReferencia}
                  style={[s.consultaBtn, consultando && { opacity: 0.7 }]}
                  disabled={consultando}
                >
                  {consultando
                    ? <AppLoader size={12} color="#fff" />
                    : <Ionicons name="cloud-download-outline" size={13} color="#fff" />}
                  <Text style={s.consultaBtnText}>Verificar</Text>
                </TouchableOpacity>
              </View>

              {consultaResultado && (
                <View style={[
                  s.consultaResult,
                  { borderLeftColor: consultaResultado.pago ? Colors.success : Colors.warning }
                ]}>
                  <View style={s.consultaResultRow}>
                    <Ionicons
                      name={consultaResultado.pago ? 'checkmark-circle' : 'time'}
                      size={18}
                      color={consultaResultado.pago ? Colors.success : Colors.warning}
                    />
                    <Text style={[
                      s.consultaResultTitle,
                      { color: consultaResultado.pago ? Colors.success : Colors.warning }
                    ]}>
                      {consultaResultado.pago ? 'Pago' : (consultaResultado.estado || 'Pendente')}
                    </Text>
                  </View>
                  <Text style={s.consultaResultRef}>Ref: {consultaResultado.referencia}</Text>
                  {consultaResultado.valor != null && (
                    <Text style={s.consultaResultMeta}>
                      Valor: {formatAOA(consultaResultado.valor)}
                    </Text>
                  )}
                  {consultaResultado.dataPagamento && (
                    <Text style={s.consultaResultMeta}>
                      Pago em: {fmtData(consultaResultado.dataPagamento)}
                    </Text>
                  )}
                  <Text style={s.consultaResultFonte}>
                    Fonte: {consultaResultado.fonte === 'emis_api'
                      ? 'API EMIS (banco)'
                      : consultaResultado.fonte === 'local'
                        ? 'Base de dados local'
                        : 'Sandbox'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Filtros */}
        <View style={s.filtersRow}>
          {(['todos','ativo','pago','expirado'] as FiltroStatus[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFiltro(f)}
              style={[s.filterBtn, filtro === f && s.filterBtnActive]}
            >
              <Text style={[s.filterText, filtro === f && s.filterTextActive]}>
                {f === 'todos' ? 'Todos' : chipLabel(f)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.searchBox}>
          <StableSearchInput
            value={query}
            onChangeText={setQuery}
            inputStyle={s.searchInput}
            placeholder="Buscar por aluno, matrícula ou referência…"
            iconColor={Colors.textMuted}
          />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <AppLoader color={Colors.info} />
          </View>
        ) : filtradas.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
            <Text style={{ marginTop: 12, color: Colors.textMuted }}>Sem referências bancárias para mostrar.</Text>
          </View>
        ) : (() => {
          const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
          const paginaActual = Math.min(pagina, totalPaginas);
          const fatia = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);
          function irPagina(p: number) { setPagina(Math.max(1, Math.min(p, totalPaginas))); }
          return (
            <>
              {fatia.map(r => {
                const eff = statusEfetivo(r);
                const taxa = taxas.find(t => t.id === r.taxaId);
                return (
                  <View key={r.id} style={[s.card, { borderLeftColor: chipColor(eff) }]}>
                    <View style={s.cardHeader}>
                      <View style={[s.chip, { backgroundColor: chipColor(eff) + '22' }]}>
                        <Ionicons name={chipIcon(eff)} size={12} color={chipColor(eff)} />
                        <Text style={[s.chipText, { color: chipColor(eff) }]}>{chipLabel(eff)}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      {eff === 'ativo' && (
                        <Text style={s.timeRest}>{tempoRestante(r)}</Text>
                      )}
                    </View>

                    <Text style={s.alunoNome} numberOfLines={1}>{alunoNome(r.alunoId)}</Text>
                    {alunoMatricula(r.alunoId) ? (
                      <Text style={s.alunoMat}>Matrícula: {alunoMatricula(r.alunoId)}</Text>
                    ) : null}
                    <Text style={s.taxaDesc} numberOfLines={1}>{taxa?.descricao || r.taxaId}</Text>

                    <View style={s.refBox}>
                      <Text style={s.refLabel}>REF. BANCÁRIA MULTICAIXA</Text>
                      <Text selectable style={s.refValue}>{r.referencia}</Text>
                    </View>

                    <View style={s.metaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.metaLabel}>Valor</Text>
                        <Text style={s.metaValueBold}>{formatAOA(r.valor)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.metaLabel}>Gerado</Text>
                        <Text style={s.metaValue}>{fmtData(r.dataGeracao)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.metaLabel}>Validade</Text>
                        <Text style={[s.metaValue, eff === 'expirado' && { color: Colors.danger }]}>
                          {fmtData(r.dataValidade)}
                        </Text>
                      </View>
                    </View>

                    <View style={s.actions}>
                      <TouchableOpacity onPress={() => copiar(r.referencia)} style={s.actBtn}>
                        <Ionicons name="copy-outline" size={13} color={Colors.textSecondary} />
                        <Text style={s.actText}>Copiar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => abrirComprovativo(r)} style={s.actBtn}>
                        <Ionicons name="document-text-outline" size={13} color={Colors.textSecondary} />
                        <Text style={s.actText}>Comprovativo</Text>
                      </TouchableOpacity>
                      {eff !== 'pago' && (
                        <TouchableOpacity
                          onPress={() => verificar(r)}
                          style={[s.actBtnPrimary, verificandoId === r.id && { opacity: 0.7 }]}
                          disabled={verificandoId === r.id}
                        >
                          {verificandoId === r.id
                            ? <AppLoader size={12} color="#fff" />
                            : <Ionicons name="cloud-download-outline" size={13} color="#fff" />}
                          <Text style={s.actTextPrimary}>Verificar no banco</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {totalPaginas > 1 && (
                <View style={s.paginacao}>
                  <TouchableOpacity
                    style={[s.pgBtn, paginaActual === 1 && s.pgBtnDisabled]}
                    onPress={() => irPagina(paginaActual - 1)}
                    disabled={paginaActual === 1}
                  >
                    <Ionicons name="chevron-back" size={14} color={paginaActual === 1 ? Colors.textMuted : Colors.textPrimary} />
                  </TouchableOpacity>

                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => {
                    const isActive = p === paginaActual;
                    const show = p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 1;
                    const showDotsBefore = p === paginaActual - 2 && paginaActual - 2 > 1;
                    const showDotsAfter  = p === paginaActual + 2 && paginaActual + 2 < totalPaginas;
                    if (!show) return null;
                    return (
                      <React.Fragment key={p}>
                        {showDotsBefore && <Text style={s.pgEllipsis}>…</Text>}
                        <TouchableOpacity
                          style={[s.pgBtn, isActive && s.pgBtnActive]}
                          onPress={() => irPagina(p)}
                        >
                          <Text style={[s.pgBtnText, isActive && s.pgBtnTextActive]}>{p}</Text>
                        </TouchableOpacity>
                        {showDotsAfter && <Text style={s.pgEllipsis}>…</Text>}
                      </React.Fragment>
                    );
                  })}

                  <TouchableOpacity
                    style={[s.pgBtn, paginaActual === totalPaginas && s.pgBtnDisabled]}
                    onPress={() => irPagina(paginaActual + 1)}
                    disabled={paginaActual === totalPaginas}
                  >
                    <Ionicons name="chevron-forward" size={14} color={paginaActual === totalPaginas ? Colors.textMuted : Colors.textPrimary} />
                  </TouchableOpacity>

                  <Text style={s.pgInfo}>Página {paginaActual} de {totalPaginas}</Text>
                </View>
              )}
            </>
          );
        })()}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 14, paddingBottom: 40 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpi: { flex: 1, minWidth: 0, backgroundColor: '#173053', borderWidth: 1, borderColor: '#2A4A78', borderRadius: 10, padding: 10, alignItems: 'center' },
  kpiV: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },
  kpiL: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginTop: 2 },
  filtersRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#2A4A78', backgroundColor: '#173053' },
  filterBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterText: { fontSize: 12, color: Colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  filterTextActive: { color: '#fff' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#173053', borderWidth: 1, borderColor: '#2A4A78', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 13, paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },
  card: { backgroundColor: '#173053', borderWidth: 1, borderColor: '#2A4A78', borderLeftWidth: 4, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  timeRest: { color: Colors.textPrimary, fontSize: 11 },
  alunoNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, marginBottom: 2 },
  alunoMat: { fontSize: 11, color: Colors.textPrimary, marginBottom: 2 },
  taxaDesc: { fontSize: 12, color: Colors.textPrimary, marginBottom: 8 },
  refBox: { backgroundColor: '#0F223D', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2A4A78' },
  refLabel: { fontSize: 10, color: Colors.textPrimary, fontFamily: 'Inter_500Medium' },
  refValue: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, letterSpacing: 1.5, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' },
  metaLabel: { fontSize: 10, color: Colors.textPrimary },
  metaValue: { fontSize: 11, color: Colors.textPrimary },
  metaValueBold: { fontSize: 13, color: Colors.textPrimary, fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A4A78', backgroundColor: '#0F223D' },
  actText: { fontSize: 11, color: Colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  actBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.info },
  actTextPrimary: { fontSize: 11, color: '#fff', fontFamily: 'Inter_700Bold' },
  consultaCard: { backgroundColor: '#173053', borderWidth: 1, borderColor: '#2A4A78', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
  consultaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  consultaTitle: { fontSize: 13, color: Colors.textPrimary, fontFamily: 'Inter_700Bold' },
  consultaBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  consultaHint: { fontSize: 11, color: Colors.textPrimary, lineHeight: 15 },
  consultaInputRow: { flexDirection: 'row', gap: 8 },
  consultaInput: { flex: 1, backgroundColor: '#0F223D', borderWidth: 1, borderColor: '#2A4A78', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: Colors.textPrimary, fontSize: 13, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}) },
  consultaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.info },
  consultaBtnText: { fontSize: 12, color: '#fff', fontFamily: 'Inter_700Bold' },
  consultaResult: { backgroundColor: '#0F223D', borderRadius: 8, padding: 10, borderLeftWidth: 4, gap: 4 },
  consultaResultRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  consultaResultTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  consultaResultRef: { fontSize: 12, color: Colors.textPrimary, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  consultaResultMeta: { fontSize: 11, color: Colors.textPrimary },
  consultaResultFonte: { fontSize: 10, color: Colors.textPrimary, fontStyle: 'italic', marginTop: 2 },

  // Paginação
  paginacao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 16, flexWrap: 'wrap',
  },
  pgBtn: {
    minWidth: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    backgroundColor: '#173053', borderWidth: 1, borderColor: '#2A4A78',
  },
  pgBtnActive: { backgroundColor: Colors.info, borderColor: Colors.info },
  pgBtnDisabled: { opacity: 0.35 },
  pgBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textPrimary },
  pgBtnTextActive: { color: '#fff', fontFamily: 'Inter_700Bold' },
  pgEllipsis: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2, alignSelf: 'center' },
  pgInfo: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginLeft: 6 },
});
