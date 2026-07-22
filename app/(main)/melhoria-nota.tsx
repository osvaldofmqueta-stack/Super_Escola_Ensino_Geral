import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Platform, Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { getApiBase } from '@/lib/server-config';

const ROLES_SECRETARIA = ["ceo","pca","admin","director","pedagogico","chefe_secretaria","secretaria"];
const ROLES_CONFIG = ["ceo","pca","admin","director","pedagogico","chefe_secretaria"];

function fmtDataHora(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function fmtPrazo(d: string | null | undefined): { label: string; expirou: boolean; urgente: boolean } {
  if (!d) return { label: '—', expirou: false, urgente: false };
  const diff = new Date(d).getTime() - Date.now();
  const expirou = diff < 0;
  const horas = Math.abs(Math.floor(diff / 3600000));
  const mins = Math.abs(Math.floor((diff % 3600000) / 60000));
  if (expirou) return { label: 'Prazo expirado', expirou: true, urgente: false };
  if (horas < 2) return { label: `⚡ ${horas}h ${mins}min restantes`, expirou: false, urgente: true };
  if (horas < 24) return { label: `${horas}h ${mins}min restantes`, expirou: false, urgente: false };
  const dias = Math.floor(horas / 24);
  return { label: `${dias} dia(s) restante(s)`, expirou: false, urgente: false };
}

const STATUS_INFO: Record<string, { color: string; label: string; icon: string; bg: string }> = {
  pendente:  { color: Colors.warning,   label: 'Pendente',   icon: 'time-outline',         bg: Colors.warning   + '18' },
  aprovado:  { color: Colors.success,   label: 'Aprovado',   icon: 'checkmark-circle',     bg: Colors.success   + '18' },
  realizado: { color: '#1d4ed8',        label: 'Realizado',  icon: 'school-outline',       bg: '#1d4ed818'              },
  cancelado: { color: Colors.textMuted, label: 'Cancelado',  icon: 'close-circle-outline', bg: Colors.textMuted + '18' },
  rejeitado: { color: Colors.danger,    label: 'Rejeitado',  icon: 'ban-outline',          bg: Colors.danger    + '18' },
};

export default function MelhoriaNotaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const isSecretaria = ROLES_SECRETARIA.includes(user?.role ?? '');
  const isConfig = ROLES_CONFIG.includes(user?.role ?? '');
  const isAluno = user?.role === 'aluno';

  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [anosLetivos, setAnosLetivos] = useState<string[]>([]);
  const [anoLetivo, setAnoLetivo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroTurmaId, setFiltroTurmaId] = useState('');
  const [turmaModalOpen, setTurmaModalOpen] = useState(false);
  const [turmaSearch, setTurmaSearch] = useState('');
  const [anoModalOpen, setAnoModalOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal: registar resultado (aprovado → realizado)
  const [modalResultado, setModalResultado] = useState<any>(null);
  const [notaMelhoria, setNotaMelhoria] = useState('');
  const [obsResultado, setObsResultado] = useState('');
  const [savingResultado, setSavingResultado] = useState(false);

  // Modal: rejeitar
  const [modalRejeitar, setModalRejeitar] = useState<any>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [savingRejeitar, setSavingRejeitar] = useState(false);

  // Para aluno: modal de nova solicitação
  const [modalSolicitar, setModalSolicitar] = useState(false);
  const [notasDisponiveis, setNotasDisponiveis] = useState<any[]>([]);
  const [discSelecionada, setDiscSelecionada] = useState<any>(null);
  const [obsSolicitar, setObsSolicitar] = useState('');
  const [solicitando, setSolicitando] = useState(false);
  const [alunoId, setAlunoId] = useState('');
  const [turmaIdAluno, setTurmaIdAluno] = useState('');

  // Toast inline — substitui alert() nativo
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; title: string; msg?: string } | null>(null);
  const showToast = useCallback((type: 'ok' | 'err', title: string, msg?: string) => {
    setToast({ type, title, msg });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // Erros inline nos modais
  const [modalResultadoErr, setModalResultadoErr] = useState('');
  const [modalSolicitarErr, setModalSolicitarErr] = useState('');

  // Guard para não recarregar turmas desnecessariamente
  const [turmasLoaded, setTurmasLoaded] = useState(false);

  const apiFetch = useCallback(async (path: string, opts: any = {}) => {
    const r = await fetch(`${getApiBase()}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? r.statusText); }
    return r.json();
  }, [token]);

  const carregar = useCallback(async (ano?: string) => {
    const a = ano ?? anoLetivo;
    if (!a) return;
    setLoading(true);
    try {
      if (isAluno) {
        const rows = await apiFetch(`/api/melhoria-nota/minhas?anoLetivo=${encodeURIComponent(a)}`);
        setSolicitacoes(rows);
      } else {
        const params = new URLSearchParams({ anoLetivo: a });
        if (filtroTurmaId) params.set('turmaId', filtroTurmaId);
        if (filtroStatus && filtroStatus !== 'todos') params.set('status', filtroStatus);
        const rows = await apiFetch(`/api/melhoria-nota?${params}`);
        setSolicitacoes(rows);
      }
    } catch (e: any) {
      showToast('err', 'Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, [anoLetivo, filtroStatus, filtroTurmaId, isAluno, apiFetch, showToast]);

  useEffect(() => {
    if (turmasLoaded) return;
    apiFetch('/api/turmas').then((ts: any[]) => {
      if (!Array.isArray(ts) || ts.length === 0) return;
      setTurmas(ts);
      const anos = [...new Set(ts.map((t: any) => t.anoLetivo).filter(Boolean))].sort().reverse();
      setAnosLetivos(anos);
      if (anos.length) { setAnoLetivo(anos[0]); carregar(anos[0]); }
      setTurmasLoaded(true);
    }).catch(() => {});
  }, [apiFetch, turmasLoaded]);

  useEffect(() => { if (anoLetivo) carregar(); }, [filtroStatus, filtroTurmaId]);

  // ── Acções da secretaria ─────────────────────────────────────────────────────

  const aprovarPedido = async (sol: any) => {
    try {
      const r = await apiFetch(`/api/melhoria-nota/${sol.id}/aprovar`, { method: 'PUT' });
      showToast('ok', 'Pedido aprovado', `Email ${r.emailEnviado ? 'enviado ao aluno.' : 'não enviado (sem email configurado).'}`);
      carregar();
    } catch (e: any) {
      showToast('err', 'Erro', e.message);
    }
  };

  const rejeitarPedido = async () => {
    if (!modalRejeitar) return;
    setSavingRejeitar(true);
    try {
      const r = await apiFetch(`/api/melhoria-nota/${modalRejeitar.id}/rejeitar`, {
        method: 'PUT',
        body: JSON.stringify({ motivo: motivoRejeicao || undefined }),
      });
      setModalRejeitar(null);
      showToast('ok', 'Pedido rejeitado', `Email ${r.emailEnviado ? 'enviado ao aluno.' : 'não enviado (sem email configurado).'}`);
      carregar();
    } catch (e: any) {
      showToast('err', 'Erro', e.message);
    } finally {
      setSavingRejeitar(false);
    }
  };

  const registarResultado = async () => {
    if (!modalResultado) return;
    if (!notaMelhoria) { setModalResultadoErr('Introduza a nota obtida no exame.'); return; }
    setModalResultadoErr('');
    setSavingResultado(true);
    try {
      await apiFetch(`/api/melhoria-nota/${modalResultado.id}/resultado`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'realizado',
          notaMelhoria: Number(notaMelhoria),
          observacoes: obsResultado || undefined,
        }),
      });
      setModalResultado(null);
      showToast('ok', 'Resultado registado', 'Nota de melhoria lançada e email enviado ao aluno.');
      carregar();
    } catch (e: any) {
      setModalResultadoErr(e.message ?? 'Erro ao registar resultado.');
    } finally {
      setSavingResultado(false);
    }
  };

  // ── Acções do aluno ──────────────────────────────────────────────────────────

  const abrirModalSolicitar = async () => {
    try {
      if (!anoLetivo) { showToast('err', 'Seleccione o ano lectivo primeiro.'); return; }
      const data = await apiFetch(`/api/melhoria-nota/notas-disponiveis?anoLetivo=${encodeURIComponent(anoLetivo)}`);
      setNotasDisponiveis(data.elegiveis ?? []);
      setAlunoId(data.alunoId ?? '');
      setTurmaIdAluno(data.turmaId ?? '');
      setDiscSelecionada(null);
      setObsSolicitar('');
      setModalSolicitarErr('');
      setModalSolicitar(true);
    } catch (e: any) {
      showToast('err', 'Erro', e.message);
    }
  };

  const enviarSolicitacao = async () => {
    if (!discSelecionada) { setModalSolicitarErr('Seleccione uma disciplina antes de enviar.'); return; }
    setModalSolicitarErr('');
    setSolicitando(true);
    try {
      await apiFetch('/api/melhoria-nota/solicitar', {
        method: 'POST',
        body: JSON.stringify({
          alunoId, turmaId: turmaIdAluno,
          disciplina: discSelecionada.disciplina,
          anoLetivo, notaAtual: discSelecionada.notaAtual,
          observacoes: obsSolicitar || undefined,
        }),
      });
      setModalSolicitar(false);
      showToast('ok', 'Pedido enviado', 'A sua solicitação foi registada. Aguarde a aprovação da secretaria.');
      carregar();
    } catch (e: any) {
      setModalSolicitarErr(e.message ?? 'Erro ao enviar pedido.');
    } finally {
      setSolicitando(false);
    }
  };

  const cancelarSolicitacao = async (id: string) => {
    try {
      await apiFetch(`/api/melhoria-nota/${id}`, { method: 'DELETE' });
      carregar();
    } catch (e: any) {
      showToast('err', 'Erro', e.message);
    }
  };

  // ── Derivados ────────────────────────────────────────────────────────────────
  const turmasFiltradas = turmas.filter(t => !anoLetivo || t.anoLetivo === anoLetivo);

  const solFiltradas = solicitacoes.filter(s => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (s.alunoNome ?? '').toLowerCase().includes(b) ||
      (s.disciplina ?? '').toLowerCase().includes(b) ||
      (s.alunoMatricula ?? '').toLowerCase().includes(b);
  });

  const totais = {
    total: solicitacoes.length,
    pendentes: solicitacoes.filter(s => s.status === 'pendente').length,
    aprovados: solicitacoes.filter(s => s.status === 'aprovado').length,
    realizados: solicitacoes.filter(s => s.status === 'realizado').length,
    rejeitados: solicitacoes.filter(s => s.status === 'rejeitado').length,
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <TopBar
        title="Melhoria de Nota"
        subtitle="Art. 36º — Fila de aprovação de pedidos"
        onBack={() => router.back()}
        rightAction={isConfig ? {
          icon: 'settings-outline',
          onPress: () => router.push('/(main)/config-avaliacoes-especiais' as any),
        } : undefined}
      />

      {/* ── Toast inline ──────────────────────────────────────────────────────── */}
      {toast && (
        <View style={[s.toast, toast.type === 'ok' ? s.toastOk : s.toastErr]}>
          <Ionicons name={toast.type === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={18} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.toastTitle}>{toast.title}</Text>
            {toast.msg ? <Text style={s.toastMsg}>{toast.msg}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => setToast(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

        {/* Info decreto */}
        <View style={s.infoBox}>
          <Ionicons name="trending-up-outline" size={16} color="#8b5cf6" />
          <Text style={s.infoText}>
            <Text style={{ fontWeight: 'bold' }}>Art. 36º:</Text> Alunos com nota elegível podem solicitar melhoria.
            A secretaria aprova/rejeita o pedido — o aluno é notificado por email em cada transição.
            A nota final é sempre a mais alta entre a original e a de melhoria.
          </Text>
        </View>

        {/* Filtros */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Filtros</Text>

          {/* Ano lectivo */}
          <Text style={s.label}>Ano Lectivo</Text>
          <View style={{ marginBottom: isSecretaria ? 0 : 4 }}>
            {Platform.OS === 'web' ? (
              <View style={s.dropWrap}>
                <Ionicons name="calendar-outline" size={14} color={anoLetivo ? '#8b5cf6' : Colors.textMuted} style={s.dropIcon} />
                {/* @ts-ignore */}
                <select
                  value={anoLetivo}
                  onChange={(e: any) => { setAnoLetivo(e.target.value); carregar(e.target.value); }}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: anoLetivo ? '#8b5cf6' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}
                >
                  <option value="">Seleccionar ano…</option>
                  {anosLetivos.map(a => <option key={a} value={a} style={{ background: '#1A2035', color: '#E2E8F0' }}>{a}</option>)}
                </select>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
              </View>
            ) : (
              <>
                <TouchableOpacity style={s.dropWrap} onPress={() => setAnoModalOpen(true)}>
                  <Ionicons name="calendar-outline" size={14} color={anoLetivo ? '#8b5cf6' : Colors.textMuted} style={s.dropIcon} />
                  <Text style={[s.dropTxt, anoLetivo && { color: '#8b5cf6' }]} numberOfLines={1}>{anoLetivo || 'Seleccionar ano…'}</Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
                </TouchableOpacity>
                <Modal visible={anoModalOpen} transparent animationType="slide" onRequestClose={() => setAnoModalOpen(false)}>
                  <Pressable style={s.modalOverlay} onPress={() => setAnoModalOpen(false)} />
                  <View style={s.modalSheet}>
                    <View style={s.modalHandle} />
                    <View style={s.modalHeader}>
                      <Text style={s.modalTitle}>Ano Lectivo</Text>
                      <TouchableOpacity onPress={() => setAnoModalOpen(false)}><Ionicons name="close" size={20} color={Colors.textSecondary} /></TouchableOpacity>
                    </View>
                    <ScrollView>
                      {anosLetivos.map(a => (
                        <TouchableOpacity key={a} style={s.modalOption} onPress={() => { setAnoLetivo(a); carregar(a); setAnoModalOpen(false); }}>
                          <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
                          <Text style={[s.modalOptTxt, anoLetivo === a && { color: '#8b5cf6', fontFamily: 'Inter_700Bold' }]}>{a}</Text>
                          {anoLetivo === a && <Ionicons name="checkmark" size={16} color="#8b5cf6" style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </Modal>
              </>
            )}
          </View>

          {isSecretaria && (
            <>
              <Text style={[s.label, { marginTop: 12 }]}>Turma</Text>
              {Platform.OS === 'web' ? (
                <View style={s.dropWrap}>
                  <Ionicons name="layers-outline" size={14} color={filtroTurmaId ? '#8b5cf6' : Colors.textMuted} style={s.dropIcon} />
                  {/* @ts-ignore */}
                  <select
                    value={filtroTurmaId}
                    onChange={(e: any) => setFiltroTurmaId(e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: filtroTurmaId ? '#8b5cf6' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}
                  >
                    <option value="">Todas as turmas</option>
                    {turmasFiltradas.map(t => <option key={t.id} value={t.id} style={{ background: '#1A2035', color: '#E2E8F0' }}>{t.nome}</option>)}
                  </select>
                  <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
                </View>
              ) : (
                <>
                  <TouchableOpacity style={s.dropWrap} onPress={() => { setTurmaSearch(''); setTurmaModalOpen(true); }}>
                    <Ionicons name="layers-outline" size={14} color={filtroTurmaId ? '#8b5cf6' : Colors.textMuted} style={s.dropIcon} />
                    <Text style={[s.dropTxt, filtroTurmaId && { color: '#8b5cf6' }]} numberOfLines={1}>
                      {filtroTurmaId ? (turmasFiltradas.find(t => t.id === filtroTurmaId)?.nome ?? 'Turma') : 'Todas as turmas'}
                    </Text>
                    {filtroTurmaId ? (
                      <TouchableOpacity onPress={() => setFiltroTurmaId('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
                    )}
                  </TouchableOpacity>
                  <Modal visible={turmaModalOpen} transparent animationType="slide" onRequestClose={() => setTurmaModalOpen(false)}>
                    <Pressable style={s.modalOverlay} onPress={() => setTurmaModalOpen(false)} />
                    <View style={s.modalSheet}>
                      <View style={s.modalHandle} />
                      <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>Seleccionar Turma</Text>
                        <TouchableOpacity onPress={() => setTurmaModalOpen(false)}><Ionicons name="close" size={20} color={Colors.textSecondary} /></TouchableOpacity>
                      </View>
                      <TextInput style={s.modalSearch} placeholder="Pesquisar turma…" placeholderTextColor={Colors.textMuted} value={turmaSearch} onChangeText={setTurmaSearch} autoFocus />
                      <ScrollView>
                        <TouchableOpacity style={s.modalOption} onPress={() => { setFiltroTurmaId(''); setTurmaModalOpen(false); }}>
                          <Ionicons name="layers-outline" size={15} color={Colors.textMuted} />
                          <Text style={[s.modalOptTxt, !filtroTurmaId && { color: '#8b5cf6', fontFamily: 'Inter_700Bold' }]}>Todas as turmas</Text>
                          {!filtroTurmaId && <Ionicons name="checkmark" size={16} color="#8b5cf6" style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                        {turmasFiltradas.filter(t => t.nome.toLowerCase().includes(turmaSearch.toLowerCase())).map(t => (
                          <TouchableOpacity key={t.id} style={s.modalOption} onPress={() => { setFiltroTurmaId(t.id); setTurmaModalOpen(false); }}>
                            <Ionicons name="school-outline" size={15} color={Colors.textMuted} />
                            <Text style={[s.modalOptTxt, filtroTurmaId === t.id && { color: '#8b5cf6', fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{t.nome}</Text>
                            {filtroTurmaId === t.id && <Ionicons name="checkmark" size={16} color="#8b5cf6" style={{ marginLeft: 'auto' }} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </Modal>
                </>
              )}
            </>
          )}
        </View>

        {/* Botão solicitar (aluno) */}
        {isAluno && (
          <TouchableOpacity onPress={abrirModalSolicitar} style={s.btnPrimary}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.btnPrimaryText}>Solicitar Exame de Melhoria</Text>
          </TouchableOpacity>
        )}

        {/* Stats com badges de pendentes em destaque */}
        {(solicitacoes.length > 0 || isSecretaria) && (
          <View style={s.statsRow}>
            {[
              { key: 'todos',     label: 'Total',      num: totais.total,      color: Colors.accent   },
              { key: 'pendente',  label: 'Pendentes',  num: totais.pendentes,  color: Colors.warning  },
              { key: 'aprovado',  label: 'Aprovados',  num: totais.aprovados,  color: Colors.success  },
              { key: 'realizado', label: 'Realizados', num: totais.realizados, color: '#1d4ed8'       },
            ].map(item => (
              <TouchableOpacity key={item.key}
                onPress={() => setFiltroStatus(item.key)}
                style={[s.statCard, filtroStatus === item.key && { borderColor: item.color, backgroundColor: item.color + '10' }]}>
                {item.key === 'pendente' && item.num > 0 && (
                  <View style={s.pendenteBadge}><Text style={s.pendenteBadgeText}>!</Text></View>
                )}
                <Text style={[s.statNum, { color: item.color }]}>{item.num}</Text>
                <Text style={s.statLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Busca */}
        {solicitacoes.length > 0 && (
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Pesquisar aluno, disciplina ou matrícula..."
              placeholderTextColor={Colors.textMuted}
              value={busca}
              onChangeText={setBusca}
            />
            {busca.length > 0 && (
              <TouchableOpacity onPress={() => setBusca('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator color="#8b5cf6" size="large" />
          </View>
        )}

        {!loading && solFiltradas.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, marginTop: 8, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>
              {totais.total === 0 ? 'Nenhuma solicitação registada' : 'Nenhum resultado para o filtro seleccionado'}
            </Text>
            {isAluno && totais.total === 0 && (
              <Text style={{ color: Colors.textMuted, marginTop: 4, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                Use o botão acima para pedir melhoria de nota
              </Text>
            )}
          </View>
        )}

        {/* ── Lista de solicitações ──────────────────────────────────────── */}
        {solFiltradas.map((sol: any) => {
          const st = STATUS_INFO[sol.status] ?? STATUS_INFO.pendente;
          const prazo = fmtPrazo(sol.prazoExpiracao);
          return (
            <View key={sol.id} style={[s.solCard, { borderLeftColor: st.color }]}>

              {/* Cabeçalho */}
              <View style={s.solHeader}>
                <View style={{ flex: 1 }}>
                  {isSecretaria && (
                    <Text style={s.alunoNome}>{sol.alunoNome}</Text>
                  )}
                  <Text style={s.discNome}>{sol.disciplina}</Text>
                  {isSecretaria && (
                    <Text style={s.solSub}>{sol.turmaNome} · {sol.turmaClasse} · Nº {sol.alunoMatricula}</Text>
                  )}
                  <Text style={s.solSub}>
                    Nota original: <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{sol.notaAtual} val.</Text>
                    {sol.notaMelhoria != null && <>
                      {' '}→ Final: <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.success }}>{sol.notaMelhoria} val.</Text>
                    </>}
                  </Text>
                </View>
                <View style={[s.badge, { backgroundColor: st.bg }]}>
                  <Ionicons name={st.icon as any} size={13} color={st.color} />
                  <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>

              {/* Datas e prazo */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 4 }}>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                  📅 {fmtDataHora(sol.dataSolicitacao)}
                </Text>
                {sol.prazoExpiracao && sol.status === 'pendente' && (
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: prazo.expirou ? Colors.danger : prazo.urgente ? Colors.warning : Colors.textMuted }}>
                    ⏱ {prazo.label}
                  </Text>
                )}
                {sol.analisadoPor && (
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                    por {sol.analisadoPor}
                  </Text>
                )}
              </View>

              {sol.observacoes && (
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' }}>
                  "{sol.observacoes}"
                </Text>
              )}

              {/* ── Acções da Secretaria ──────────────────────────────── */}
              {isSecretaria && sol.status === 'pendente' && (
                <View style={s.accoesRow}>
                  {/* Aprovar */}
                  <TouchableOpacity
                    onPress={() => aprovarPedido(sol)}
                    style={[s.btnAcao, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '50', flex: 1 }]}>
                    <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
                    <Text style={[s.btnAcaoText, { color: Colors.success }]}>Aprovar</Text>
                  </TouchableOpacity>
                  {/* Rejeitar */}
                  <TouchableOpacity
                    onPress={() => { setModalRejeitar(sol); setMotivoRejeicao(''); }}
                    style={[s.btnAcao, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40' }]}>
                    <Ionicons name="ban-outline" size={15} color={Colors.danger} />
                    <Text style={[s.btnAcaoText, { color: Colors.danger }]}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Registar resultado (após aprovação) */}
              {isSecretaria && sol.status === 'aprovado' && (
                <View style={s.accoesRow}>
                  <TouchableOpacity
                    onPress={() => { setModalResultado(sol); setNotaMelhoria(''); setObsResultado(''); }}
                    style={[s.btnAcao, { backgroundColor: '#1d4ed818', borderColor: '#1d4ed850', flex: 1 }]}>
                    <Ionicons name="pencil-outline" size={15} color="#1d4ed8" />
                    <Text style={[s.btnAcaoText, { color: '#1d4ed8' }]}>Lançar Nota de Melhoria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setModalRejeitar(sol); setMotivoRejeicao(''); }}
                    style={[s.btnAcao, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40' }]}>
                    <Ionicons name="ban-outline" size={14} color={Colors.danger} />
                    <Text style={[s.btnAcaoText, { color: Colors.danger }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Aluno cancela */}
              {isAluno && sol.status === 'pendente' && (
                <TouchableOpacity
                  onPress={() => cancelarSolicitacao(sol.id)}
                  style={[s.btnAcao, { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40', marginTop: 10, alignSelf: 'flex-start' }]}>
                  <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                  <Text style={[s.btnAcaoText, { color: Colors.danger }]}>Cancelar pedido</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Modal: Rejeitar (com motivo) ──────────────────────────────────────── */}
      <Modal visible={!!modalRejeitar} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.danger + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ban-outline" size={16} color={Colors.danger} />
                </View>
                <Text style={s.modalTitle}>Rejeitar Pedido</Text>
              </View>
              <TouchableOpacity onPress={() => setModalRejeitar(null)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {modalRejeitar && (
              <>
                <View style={{ backgroundColor: Colors.danger + '12', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{modalRejeitar.alunoNome}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                    {modalRejeitar.disciplina} · Nota: {modalRejeitar.notaAtual} val.
                  </Text>
                </View>

                <Text style={s.label}>Motivo da rejeição (enviado por email ao aluno)</Text>
                <TextInput
                  style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Ex: Prazo expirado, nota não elegível, documentação incompleta..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={motivoRejeicao}
                  onChangeText={setMotivoRejeicao}
                  autoFocus
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setModalRejeitar(null)}
                    style={[s.btnAcao, { flex: 1, justifyContent: 'center', backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                    <Text style={[s.btnAcaoText, { color: Colors.textSecondary }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={rejeitarPedido} disabled={savingRejeitar}
                    style={[s.btnAcao, { flex: 1.5, justifyContent: 'center', backgroundColor: Colors.danger, borderColor: Colors.danger }]}>
                    {savingRejeitar ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="ban-outline" size={14} color="#fff" />
                        <Text style={[s.btnAcaoText, { color: '#fff' }]}>Confirmar Rejeição</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Lançar Nota de Melhoria ────────────────────────────────────── */}
      <Modal visible={!!modalResultado} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1d4ed818', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="pencil-outline" size={16} color="#1d4ed8" />
                </View>
                <Text style={s.modalTitle}>Lançar Nota de Melhoria</Text>
              </View>
              <TouchableOpacity onPress={() => setModalResultado(null)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {modalResultado && (
              <>
                <View style={{ backgroundColor: '#1d4ed812', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{modalResultado.alunoNome}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                    {modalResultado.disciplina} · Nota original: {modalResultado.notaAtual} val.
                  </Text>
                </View>

                <Text style={s.label}>Nota obtida no exame de melhoria</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ex: 14"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={notaMelhoria}
                  onChangeText={setNotaMelhoria}
                  autoFocus
                />

                {notaMelhoria !== '' && !isNaN(Number(notaMelhoria)) && (
                  <View style={{ backgroundColor: Colors.success + '15', borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <View>
                      <Text style={{ fontSize: 12, color: Colors.success, fontFamily: 'Inter_600SemiBold' }}>
                        Nota final: {Math.max(Number(modalResultado.notaAtual), Number(notaMelhoria))} val.
                      </Text>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                        A mais alta entre {modalResultado.notaAtual} e {notaMelhoria} (Art. 36º)
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={s.label}>Observações (opcional)</Text>
                <TextInput
                  style={[s.input, { height: 64, textAlignVertical: 'top' }]}
                  placeholder="Observações sobre o exame..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={obsResultado}
                  onChangeText={setObsResultado}
                />

                <View style={[s.infoBox, { marginTop: 10, marginBottom: 12 }]}>
                  <Ionicons name="mail-outline" size={13} color="#8b5cf6" />
                  <Text style={[s.infoText, { fontSize: 11 }]}>
                    O aluno receberá um email com o resultado assim que confirmar.
                  </Text>
                </View>

                {modalResultadoErr ? (
                  <View style={s.inlineErr}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                    <Text style={s.inlineErrTxt}>{modalResultadoErr}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={() => { setModalResultado(null); setModalResultadoErr(''); }}
                    style={[s.btnAcao, { flex: 1, justifyContent: 'center', backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                    <Text style={[s.btnAcaoText, { color: Colors.textSecondary }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={registarResultado} disabled={savingResultado}
                    style={[s.btnAcao, { flex: 2, justifyContent: 'center', backgroundColor: Colors.success, borderColor: Colors.success }]}>
                    {savingResultado ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                        <Text style={[s.btnAcaoText, { color: '#fff' }]}>Confirmar e Enviar Email</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Solicitar Melhoria (aluno) ─────────────────────────────────── */}
      <Modal visible={modalSolicitar} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Solicitar Melhoria de Nota</Text>
              <TouchableOpacity onPress={() => setModalSolicitar(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {notasDisponiveis.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, marginTop: 8, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>
                  Não tem disciplinas elegíveis para melhoria.
                </Text>
                <Text style={{ color: Colors.textMuted, marginTop: 4, fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular' }}>
                  Apenas notas entre 10 e 16 valores são elegíveis.
                </Text>
              </View>
            ) : (
              <>
                <Text style={s.label}>Seleccione a disciplina</Text>
                {notasDisponiveis.map((n: any) => (
                  <TouchableOpacity key={n.disciplina}
                    onPress={() => !n.jaSolicitado && setDiscSelecionada(n)}
                    style={[s.discOpcao,
                      discSelecionada?.disciplina === n.disciplina && s.discOpcaoActive,
                      n.jaSolicitado && s.discOpcaoDesativada]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.discOpcaoText, n.jaSolicitado && { color: Colors.textMuted }]}>{n.disciplina}</Text>
                      {n.jaSolicitado && <Text style={{ fontSize: 10, color: Colors.textMuted }}>Já solicitado</Text>}
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#8b5cf6' }}>{n.notaAtual} val.</Text>
                    {discSelecionada?.disciplina === n.disciplina && (
                      <Ionicons name="checkmark-circle" size={18} color="#8b5cf6" style={{ marginLeft: 6 }} />
                    )}
                  </TouchableOpacity>
                ))}

                <Text style={[s.label, { marginTop: 12 }]}>Observações (opcional)</Text>
                <TextInput
                  style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Motivo ou observações..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={obsSolicitar}
                  onChangeText={setObsSolicitar}
                />

                {modalSolicitarErr ? (
                  <View style={[s.inlineErr, { marginTop: 8 }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                    <Text style={s.inlineErrTxt}>{modalSolicitarErr}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => { setModalSolicitar(false); setModalSolicitarErr(''); }}
                    style={[s.btnAcao, { flex: 1, justifyContent: 'center', backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                    <Text style={[s.btnAcaoText, { color: Colors.textSecondary }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={enviarSolicitacao} disabled={solicitando || !discSelecionada}
                    style={[s.btnAcao, { flex: 2, justifyContent: 'center', backgroundColor: discSelecionada ? '#8b5cf6' : Colors.border, borderColor: discSelecionada ? '#8b5cf6' : Colors.border }]}>
                    {solicitando ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="send-outline" size={14} color="#fff" />
                        <Text style={[s.btnAcaoText, { color: '#fff' }]}>Enviar Pedido</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#8b5cf612', borderRadius: 12, padding: 12, marginBottom: 14, alignItems: 'flex-start', borderWidth: 1, borderColor: '#8b5cf630' },
  infoText: { flex: 1, fontSize: 12, color: '#8b5cf6', fontFamily: 'Inter_400Regular', lineHeight: 17 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6 },
  dropWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dropIcon: { flexShrink: 0 },
  dropChevron: { flexShrink: 0, marginLeft: 'auto' as any },
  dropTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: { backgroundColor: Colors.primaryDark, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '75%' },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalSearch: { margin: 12, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, color: Colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: Colors.border },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  modalOptTxt: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: 'transparent' },
  chipActive: { borderColor: '#8b5cf6', backgroundColor: '#8b5cf618' },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  chipTextActive: { color: '#8b5cf6', fontFamily: 'Inter_700Bold' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8b5cf6', borderRadius: 12, paddingVertical: 13, marginBottom: 14 },
  btnPrimaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, position: 'relative' },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  pendenteBadge: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center' },
  pendenteBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13, outlineStyle: 'none' } as any,
  solCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4 },
  solHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  discNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  solSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  accoesRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnAcao: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1 },
  btnAcaoText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, maxHeight: '90%', borderTopWidth: 1, borderColor: Colors.border },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  input: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 12, outlineStyle: 'none' } as any,
  discOpcao: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, marginBottom: 8 },
  discOpcaoActive: { borderColor: '#8b5cf6', backgroundColor: '#8b5cf612' },
  discOpcaoDesativada: { opacity: 0.45 },
  discOpcaoText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, zIndex: 999 },
  toastOk: { backgroundColor: Colors.success },
  toastErr: { backgroundColor: Colors.danger },
  toastTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  toastMsg: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  inlineErr: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.danger + '15', borderRadius: 8, padding: 9, borderWidth: 1, borderColor: Colors.danger + '40', marginBottom: 10 },
  inlineErrTxt: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger },
});
