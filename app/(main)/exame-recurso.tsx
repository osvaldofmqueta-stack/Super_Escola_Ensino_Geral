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

const ROLES_PERMITIDOS = ["ceo","pca","admin","director","pedagogico","chefe_secretaria","secretaria"];
const ROLES_CONFIG = ["ceo","pca","admin","director","pedagogico","chefe_secretaria"];


export default function ExameRecursoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const [turmas, setTurmas] = useState<any[]>([]);
  const [anosLetivos, setAnosLetivos] = useState<string[]>([]);
  const [anoLetivo, setAnoLetivo] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [turmaModalOpen, setTurmaModalOpen] = useState(false);
  const [turmaSearch, setTurmaSearch] = useState('');
  const [anoModalOpen, setAnoModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [filtroElegivel, setFiltroElegivel] = useState<'todos'|'elegiveis'|'bloqueados'>('todos');
  const [busca, setBusca] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const apiFetch = useCallback(async (path: string, opts: any = {}) => {
    const r = await fetch(`${getApiBase()}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? r.statusText); }
    return r.json();
  }, [token]);

  const [turmasLoaded, setTurmasLoaded] = useState(false);

  useEffect(() => {
    if (turmasLoaded) return; // só carregar uma vez após ter dados
    apiFetch('/api/turmas').then((ts: any[]) => {
      if (!Array.isArray(ts) || ts.length === 0) return;
      setTurmas(ts);
      const anos = [...new Set(ts.map((t: any) => t.anoLetivo).filter(Boolean))].sort().reverse();
      setAnosLetivos(anos);
      if (anos.length) setAnoLetivo(anos[0]);
      setTurmasLoaded(true);
    }).catch(() => {});
  }, [apiFetch, turmasLoaded]);

  const turmasFiltradas = turmas.filter(t => !anoLetivo || t.anoLetivo === anoLetivo);

  const pesquisar = useCallback(async () => {
    if (!anoLetivo) { setErrMsg('Seleccione o ano lectivo antes de continuar.'); return; }
    setErrMsg('');
    setLoading(true);
    setResultado(null);
    try {
      const params = new URLSearchParams({ anoLetivo });
      if (turmaId) params.set('turmaId', turmaId);
      const data = await apiFetch(`/api/exame-recurso/elegibilidade?${params}`);
      setResultado(data);
    } catch (e: any) {
      setErrMsg(e.message ?? 'Erro ao identificar alunos.');
    } finally {
      setLoading(false);
    }
  }, [anoLetivo, turmaId, apiFetch]);

  const alunosFiltrados = (resultado?.alunos ?? []).filter((a: any) => {
    if (filtroElegivel === 'elegiveis' && !a.elegivel) return false;
    if (filtroElegivel === 'bloqueados' && a.elegivel) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return (a.nomeCompleto ?? '').toLowerCase().includes(b) ||
        (a.numeroMatricula ?? '').toLowerCase().includes(b) ||
        (a.turma?.nome ?? '').toLowerCase().includes(b);
    }
    return true;
  });

  const totais = {
    total: resultado?.alunos?.length ?? 0,
    elegiveis: (resultado?.alunos ?? []).filter((a: any) => a.elegivel).length,
    bloqueados: (resultado?.alunos ?? []).filter((a: any) => !a.elegivel).length,
  };

  if (!ROLES_PERMITIDOS.includes(user?.role ?? '')) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <TopBar title="Exame de Recurso" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, marginTop: 12, fontFamily: 'Inter_500Medium' }}>Sem permissão de acesso</Text>
        </View>
      </View>
    );
  }

  const emitirLista = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams({ anoLetivo });
    if (turmaId) params.set('turmaId', turmaId);
    const tok = token ?? '';
    window.open(`${getApiBase()}/api/exame-recurso/lista-html?${params}&token=${encodeURIComponent(tok)}`, '_blank');
  }, [anoLetivo, turmaId, token]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <TopBar
        title="Exame de Recurso"
        subtitle="Art. 33º — Identificação de alunos elegíveis"
        onBack={() => router.back()}
        rightAction={ROLES_CONFIG.includes(user?.role ?? '') ? {
          icon: 'settings-outline',
          onPress: () => router.push('/(main)/config-avaliacoes-especiais' as any),
        } : undefined}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

        {/* Info do decreto */}
        <View style={s.infoBox}>
          <Ionicons name="document-text-outline" size={16} color="#f97316" />
          <Text style={s.infoText}>
            <Text style={{ fontWeight: 'bold' }}>Art. 33º (Decreto 04/2026):</Text> Alunos com até{' '}
            <Text style={{ fontWeight: 'bold' }}>{resultado?.config?.maxNeg ?? 3} negativa(s)</Text> no intervalo{' '}
            <Text style={{ fontWeight: 'bold' }}>{resultado?.config?.notaMin ?? 6}–{resultado?.config?.notaMax ?? 9}</Text> valores são elegíveis para exame de recurso.
            {resultado?.config?.restricaoLPMat && ' Para a 9ª Classe: LP e Matemática não podem ser negativas simultaneamente.'}
          </Text>
        </View>

        {/* Filtros */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Filtros</Text>

          {/* Ano lectivo */}
          <Text style={s.label}>Ano Lectivo</Text>
          <View style={{ marginBottom: 12 }}>
            {Platform.OS === 'web' ? (
              <View style={s.dropWrap}>
                <Ionicons name="calendar-outline" size={14} color={anoLetivo ? '#f97316' : Colors.textMuted} style={s.dropIcon} />
                {/* @ts-ignore */}
                <select
                  value={anoLetivo}
                  onChange={(e: any) => { setAnoLetivo(e.target.value); setTurmaId(''); setResultado(null); }}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: anoLetivo ? '#f97316' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}
                >
                  <option value="">Seleccionar ano…</option>
                  {anosLetivos.map(a => <option key={a} value={a} style={{ background: '#1A2035', color: '#E2E8F0' }}>{a}</option>)}
                </select>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
              </View>
            ) : (
              <>
                <TouchableOpacity style={s.dropWrap} onPress={() => setAnoModalOpen(true)}>
                  <Ionicons name="calendar-outline" size={14} color={anoLetivo ? '#f97316' : Colors.textMuted} style={s.dropIcon} />
                  <Text style={[s.dropTxt, anoLetivo && { color: '#f97316' }]} numberOfLines={1}>{anoLetivo || 'Seleccionar ano…'}</Text>
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
                        <TouchableOpacity key={a} style={s.modalOption} onPress={() => { setAnoLetivo(a); setTurmaId(''); setResultado(null); setAnoModalOpen(false); }}>
                          <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
                          <Text style={[s.modalOptTxt, anoLetivo === a && { color: '#f97316', fontFamily: 'Inter_700Bold' }]}>{a}</Text>
                          {anoLetivo === a && <Ionicons name="checkmark" size={16} color="#f97316" style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </Modal>
              </>
            )}
          </View>

          {/* Turma */}
          <Text style={s.label}>Turma (opcional — deixar em branco para todas)</Text>
          <View style={{ marginBottom: 12 }}>
            {Platform.OS === 'web' ? (
              <View style={s.dropWrap}>
                <Ionicons name="layers-outline" size={14} color={turmaId ? '#f97316' : Colors.textMuted} style={s.dropIcon} />
                {/* @ts-ignore */}
                <select
                  value={turmaId}
                  onChange={(e: any) => setTurmaId(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: turmaId ? '#f97316' : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}
                >
                  <option value="">Todas as turmas</option>
                  {turmasFiltradas.map(t => <option key={t.id} value={t.id} style={{ background: '#1A2035', color: '#E2E8F0' }}>{t.nome}</option>)}
                </select>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={s.dropChevron} />
              </View>
            ) : (
              <>
                <TouchableOpacity style={s.dropWrap} onPress={() => { setTurmaSearch(''); setTurmaModalOpen(true); }}>
                  <Ionicons name="layers-outline" size={14} color={turmaId ? '#f97316' : Colors.textMuted} style={s.dropIcon} />
                  <Text style={[s.dropTxt, turmaId && { color: '#f97316' }]} numberOfLines={1}>
                    {turmaId ? (turmasFiltradas.find(t => t.id === turmaId)?.nome ?? 'Turma') : 'Todas as turmas'}
                  </Text>
                  {turmaId ? (
                    <TouchableOpacity onPress={() => setTurmaId('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                      <TouchableOpacity style={s.modalOption} onPress={() => { setTurmaId(''); setTurmaModalOpen(false); }}>
                        <Ionicons name="layers-outline" size={15} color={Colors.textMuted} />
                        <Text style={[s.modalOptTxt, !turmaId && { color: '#f97316', fontFamily: 'Inter_700Bold' }]}>Todas as turmas</Text>
                        {!turmaId && <Ionicons name="checkmark" size={16} color="#f97316" style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                      {turmasFiltradas.filter(t => t.nome.toLowerCase().includes(turmaSearch.toLowerCase())).map(t => (
                        <TouchableOpacity key={t.id} style={s.modalOption} onPress={() => { setTurmaId(t.id); setTurmaModalOpen(false); }}>
                          <Ionicons name="school-outline" size={15} color={Colors.textMuted} />
                          <Text style={[s.modalOptTxt, turmaId === t.id && { color: '#f97316', fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{t.nome}</Text>
                          {turmaId === t.id && <Ionicons name="checkmark" size={16} color="#f97316" style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </Modal>
              </>
            )}
          </View>

          <TouchableOpacity
            onPress={pesquisar}
            style={[s.btnPrimary, !anoLetivo && s.btnDisabled]}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                <Ionicons name="search" size={16} color="#fff" />
                <Text style={s.btnPrimaryText}>Identificar Alunos</Text>
              </>
            }
          </TouchableOpacity>

          {!!errMsg && (
            <View style={s.errRow}>
              <Ionicons name="alert-circle" size={15} color={Colors.danger} />
              <Text style={s.errTxt}>{errMsg}</Text>
              <TouchableOpacity onPress={() => setErrMsg('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={14} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Resultados */}
        {resultado && (
          <>
            {/* Botões de acção sobre resultados */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={emitirLista}
                style={[s.btnAction, { backgroundColor: '#f97316', flex: 1 }]}
              >
                <MaterialCommunityIcons name="printer-outline" size={15} color="#fff" />
                <Text style={s.btnActionText}>Emitir Lista por Turma</Text>
              </TouchableOpacity>
            </View>

            {/* Estatísticas */}
            <View style={s.statsRow}>
              <TouchableOpacity onPress={() => setFiltroElegivel('todos')} style={[s.statCard, filtroElegivel === 'todos' && s.statCardActive]}>
                <Text style={[s.statNum, { color: Colors.accent }]}>{totais.total}</Text>
                <Text style={s.statLabel}>Total</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFiltroElegivel('elegiveis')} style={[s.statCard, filtroElegivel === 'elegiveis' && s.statCardActive]}>
                <Text style={[s.statNum, { color: Colors.success }]}>{totais.elegiveis}</Text>
                <Text style={s.statLabel}>Elegíveis</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFiltroElegivel('bloqueados')} style={[s.statCard, filtroElegivel === 'bloqueados' && s.statCardActive]}>
                <Text style={[s.statNum, { color: Colors.danger }]}>{totais.bloqueados}</Text>
                <Text style={s.statLabel}>Bloqueados</Text>
              </TouchableOpacity>
            </View>

            {/* Busca */}
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Pesquisar aluno ou turma..."
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

            {alunosFiltrados.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, marginTop: 8, fontFamily: 'Inter_500Medium' }}>
                  {totais.total === 0 ? 'Nenhum aluno com negativas encontrado' : 'Nenhum resultado para o filtro seleccionado'}
                </Text>
              </View>
            )}

            {alunosFiltrados.map((aluno: any, idx: number) => (
              <View key={aluno.id ?? idx} style={[s.alunoCard, { borderLeftColor: aluno.elegivel ? Colors.success : Colors.danger }]}>
                <View style={s.alunoHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alunoNome}>{aluno.nomeCompleto}</Text>
                    <Text style={s.alunoSub}>Nº {aluno.numeroMatricula} · {aluno.turma?.nome} · {aluno.turma?.classe}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: aluno.elegivel ? Colors.success + '20' : Colors.danger + '20' }]}>
                    <Ionicons
                      name={aluno.elegivel ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={aluno.elegivel ? Colors.success : Colors.danger}
                    />
                    <Text style={[s.badgeText, { color: aluno.elegivel ? Colors.success : Colors.danger }]}>
                      {aluno.elegivel ? 'Elegível' : 'Bloqueado'}
                    </Text>
                  </View>
                </View>

                {/* Disciplinas negativas */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {(aluno.disciplinasNegativas ?? []).map((d: any, i: number) => (
                    <View key={i} style={s.discTag}>
                      <Text style={s.discTagText}>{d.disciplina}</Text>
                      <Text style={s.discTagNota}>{d.nf} val.</Text>
                    </View>
                  ))}
                </View>

                {/* Motivo de bloqueio */}
                {!aluno.elegivel && aluno.motivoBloqueio && (
                  <View style={s.motivoBox}>
                    <Ionicons name="warning-outline" size={13} color={Colors.danger} />
                    <Text style={s.motivoText}>{aluno.motivoBloqueio}</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#f9741612', borderRadius: 12, padding: 12, marginBottom: 14, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 12, color: '#f97316', fontFamily: 'Inter_400Regular', lineHeight: 17 },
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
  chipActive: { borderColor: '#f97316', backgroundColor: '#f9741618' },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  chipTextActive: { color: '#f97316', fontFamily: 'Inter_700Bold' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 13, marginTop: 4 },
  btnPrimaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  statCardActive: { borderColor: '#f97316', backgroundColor: '#f9741610' },
  statNum: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13, outlineStyle: 'none' } as any,
  alunoCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4 },
  alunoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  alunoNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  discTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.danger + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  discTagText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger },
  discTagNota: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.danger },
  motivoBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: Colors.danger + '12', borderRadius: 8, padding: 8 },
  motivoText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger, flex: 1 },
  btnAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  btnActionText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  btnDisabled: { opacity: 0.55 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: Colors.danger + '15', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.danger + '40' },
  errTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.danger },
});
