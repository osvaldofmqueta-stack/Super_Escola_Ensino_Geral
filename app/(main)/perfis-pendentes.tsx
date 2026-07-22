import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { useRouter } from 'expo-router';

const API = async (path: string, method = 'GET', body?: object) => {
  const tok = await getAuthToken();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erro na operação');
  return data;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingAluno {
  id: string; nome: string; dataNascimento?: string; bi?: string; nif?: string;
  encarregadoNome?: string; encarregadoTelefone?: string; encarregadoRelacao?: string;
  createdAt?: string; genero?: string; email?: string; numeroMatricula?: string;
}

interface PendingProfessor {
  id: string; nome: string; email?: string; foto?: string; utilizadorId?: string;
  funcionarioId?: string; tipoContrato?: string; salarioBase?: number;
  dataContratacao?: string; departamento?: string; cargo?: string;
  telefone?: string; dataNascimento?: string; genero?: string;
}

interface PendingFuncionario {
  id: string; nome: string; bi?: string; email?: string; telefone?: string;
  departamento?: string; cargo?: string; tipoContrato?: string;
  salarioBase?: number; dataContratacao?: string; genero?: string; dataNascimento?: string;
}

interface PendentesData {
  alunos: PendingAluno[];
  professores: PendingProfessor[];
  funcionarios: PendingFuncionario[];
}

interface Turma {
  id: string; nome: string; classe: string; turno: string;
  anoLetivo: string; nivel: string; sala?: string; capacidade?: number;
  cursoId?: string; cursoNome?: string; ativo?: boolean;
}

type Tab = 'Alunos' | 'Professores' | 'Funcionários';
const TABS: Tab[] = ['Alunos', 'Professores', 'Funcionários'];
const PERIODOS = ['1.º Trimestre', '2.º Trimestre', '3.º Trimestre'];
const TIPOS_CONTRATO = ['Efectivo', 'Colaborador', 'Administrativo', 'Prestação de Serviços', 'Estágio'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '—';
  try { const dt = new Date(d); if (isNaN(dt.getTime())) return d; return dt.toLocaleDateString('pt-PT'); }
  catch { return d; }
}

function missingContractItems(p: PendingProfessor | PendingFuncionario): string[] {
  const items: string[] = [];
  if (!p.tipoContrato) items.push('Tipo de contrato');
  if (!p.salarioBase || Number(p.salarioBase) === 0) items.push('Salário base');
  if (!p.dataContratacao) items.push('Data de contratação');
  return items;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PerfisPendentes() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Alunos');

  // ── Aluno enquadramento modal ────────────────────────────────────────────
  const [enqModal, setEnqModal] = useState<{ visible: boolean; aluno: PendingAluno | null }>({ visible: false, aluno: null });
  const [turmaSelId, setTurmaSelId] = useState('');
  const [periodoSel, setPeriodoSel] = useState('');
  const [numMatricula, setNumMatricula] = useState('');
  const [enqErro, setEnqErro] = useState('');
  const [turmaSearch, setTurmaSearch] = useState('');

  // ── Contrato modal (professor / funcionário) ─────────────────────────────
  const [contratoModal, setContratoModal] = useState<{
    visible: boolean;
    tipo: 'professor' | 'funcionario';
    item: PendingProfessor | PendingFuncionario | null;
  }>({ visible: false, tipo: 'professor', item: null });
  const [cTipoContrato, setCTipoContrato] = useState('');
  const [cSalario, setCSalario] = useState('');
  const [cSubAlim, setCSubAlim] = useState('');
  const [cSubTrans, setCSubTrans] = useState('');
  const [cDataContr, setCDataContr] = useState('');
  const [cDepartamento, setCDepartamento] = useState('');
  const [cCargo, setCCargo] = useState('');
  const [cErro, setCErro] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery<PendentesData>({
    queryKey: ['perfis-pendentes'],
    queryFn: () => API('/api/admin/perfis-pendentes'),
    staleTime: 30_000,
  });

  const { data: turmasData } = useQuery<Turma[]>({
    queryKey: ['turmas-all'],
    queryFn: () => API('/api/turmas'),
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Mutation: enquadrar aluno ────────────────────────────────────────────
  const enquadrarMut = useMutation({
    mutationFn: ({ alunoId, turmaId, cursoId, periodoInicio, numeroMatricula }:
      { alunoId: string; turmaId: string; cursoId?: string; periodoInicio?: string; numeroMatricula?: string }) =>
      API(`/api/alunos/${alunoId}/enquadrar`, 'PUT', { turmaId, cursoId, periodoInicio, numeroMatricula }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis-pendentes'] });
      setEnqModal({ visible: false, aluno: null });
      setTurmaSelId(''); setPeriodoSel(''); setNumMatricula(''); setEnqErro(''); setTurmaSearch('');
    },
    onError: (e: Error) => setEnqErro(e.message),
  });

  // ── Mutation: completar contrato professor ───────────────────────────────
  const contratoMut = useMutation({
    mutationFn: ({ tipo, id, body }: { tipo: 'professor' | 'funcionario'; id: string; body: object }) =>
      API(`/api/admin/perfis-pendentes/${tipo === 'professor' ? 'professor' : 'funcionario'}/${id}/completar-contrato`, 'PUT', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfis-pendentes'] });
      closeContratoModal();
    },
    onError: (e: Error) => setCErro(e.message),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function openEnqModal(aluno: PendingAluno) {
    setTurmaSelId(''); setPeriodoSel(''); setEnqErro(''); setTurmaSearch('');
    setNumMatricula(aluno.numeroMatricula ?? '');
    setEnqModal({ visible: true, aluno });
  }

  function submitEnquadramento() {
    if (!turmaSelId) { setEnqErro('Seleccione uma turma para o aluno.'); return; }
    if (!periodoSel) { setEnqErro('Seleccione o período lectivo de início.'); return; }
    const turma = (turmasData ?? []).find(t => t.id === turmaSelId);
    enquadrarMut.mutate({
      alunoId: enqModal.aluno!.id,
      turmaId: turmaSelId,
      cursoId: turma?.cursoId,
      periodoInicio: periodoSel,
      numeroMatricula: numMatricula.trim() || undefined,
    });
  }

  function openContratoModal(tipo: 'professor' | 'funcionario', item: PendingProfessor | PendingFuncionario) {
    setCTipoContrato(item.tipoContrato ?? '');
    setCSalario(item.salarioBase ? String(item.salarioBase) : '');
    setCSubAlim('');
    setCSubTrans('');
    setCDataContr(item.dataContratacao ? item.dataContratacao.split('T')[0] : '');
    setCDepartamento(item.departamento ?? '');
    setCCargo(item.cargo ?? '');
    setCErro('');
    setContratoModal({ visible: true, tipo, item });
  }

  function closeContratoModal() {
    setContratoModal({ visible: false, tipo: 'professor', item: null });
    setCTipoContrato(''); setCSalario(''); setCSubAlim(''); setCSubTrans('');
    setCDataContr(''); setCDepartamento(''); setCCargo(''); setCErro('');
  }

  function submitContrato() {
    if (!cTipoContrato) { setCErro('Seleccione o tipo de contrato.'); return; }
    if (!cSalario || isNaN(Number(cSalario)) || Number(cSalario) <= 0) { setCErro('Introduza um salário base válido.'); return; }
    if (!cDataContr) { setCErro('Introduza a data de contratação.'); return; }
    const body = {
      tipoContrato: cTipoContrato,
      salarioBase: Number(cSalario),
      subsidioAlimentacao: Number(cSubAlim) || 0,
      subsidioTransporte: Number(cSubTrans) || 0,
      dataContratacao: cDataContr || null,
      departamento: cDepartamento.trim() || null,
      cargo: cCargo.trim() || null,
    };
    contratoMut.mutate({ tipo: contratoModal.tipo, id: contratoModal.item!.id, body });
  }

  const turmasFiltradas = useMemo(() => {
    const src = (turmasData ?? []).filter(t => t.ativo !== false);
    if (!turmaSearch.trim()) return src;
    const q = turmaSearch.toLowerCase();
    return src.filter(t =>
      t.nome.toLowerCase().includes(q) ||
      t.classe?.toLowerCase().includes(q) ||
      t.turno?.toLowerCase().includes(q) ||
      t.sala?.toLowerCase().includes(q) ||
      t.nivel?.toLowerCase().includes(q) ||
      t.cursoNome?.toLowerCase().includes(q)
    );
  }, [turmasData, turmaSearch]);

  const alunos = data?.alunos ?? [];
  const professores = data?.professores ?? [];
  const funcionarios = data?.funcionarios ?? [];
  const turmaSelected = (turmasData ?? []).find(t => t.id === turmaSelId);

  const totalPendentes = alunos.length + professores.length + funcionarios.length;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Perfis Pendentes</Text>
          <Text style={st.headerSub}>
            {totalPendentes === 0 ? 'Todos os perfis estão completos' : `${totalPendentes} pendente(s) de atenção`}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={st.iconBtn}>
          <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={st.tabBar}>
        {TABS.map(tab => {
          const count = tab === 'Alunos' ? alunos.length : tab === 'Professores' ? professores.length : funcionarios.length;
          const active = activeTab === tab;
          return (
            <TouchableOpacity key={tab} style={[st.tab, active && st.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[st.tabText, active && st.tabTextActive]}>{tab}</Text>
              {count > 0 && (
                <View style={[st.tabBadge, active && st.tabBadgeActive]}>
                  <Text style={[st.tabBadgeText, active && st.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>A carregar…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        >

          {/* ── TAB: Alunos ──────────────────────────────────────────── */}
          {activeTab === 'Alunos' && (
            <>
              <InfoBanner
                icon="school-outline"
                color="#3B82F6"
                title={`${alunos.length} aluno(s) aguardando enquadramento`}
                desc="Atribua turma, sala, turno e período de início para activar o acesso académico."
              />
              {alunos.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" color="#3B82F6" msg="Nenhum aluno pendente de enquadramento." />
              ) : (
                alunos.map(a => (
                  <View key={a.id} style={st.card}>
                    <View style={[st.cardAvatar, { backgroundColor: '#3B82F622' }]}>
                      <MaterialCommunityIcons name="account-school" size={22} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={st.cardName}>{a.nome}</Text>
                      {a.email && <Text style={st.cardSub}>{a.email}</Text>}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {a.dataNascimento && <Chip label={`Nasc: ${fmtDate(a.dataNascimento)}`} />}
                        {a.genero && <Chip label={a.genero} />}
                        {a.bi && <Chip label={`BI: ${a.bi}`} />}
                        {a.encarregadoNome && <Chip label={`Enc: ${a.encarregadoNome}`} />}
                        {!a.bi && !a.nif && <Chip label="Sem BI/NIF" warn />}
                        {!a.encarregadoNome && <Chip label="Sem encarregado" warn />}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[st.actionBtn, { backgroundColor: '#3B82F622', borderColor: '#3B82F6' }]}
                      onPress={() => openEnqModal(a)}
                    >
                      <MaterialCommunityIcons name="account-arrow-right" size={14} color="#3B82F6" />
                      <Text style={[st.actionBtnText, { color: '#3B82F6' }]}>Enquadrar</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {/* ── TAB: Professores ─────────────────────────────────────── */}
          {activeTab === 'Professores' && (
            <>
              <InfoBanner
                icon="person-outline"
                color="#8B5CF6"
                title={`${professores.length} professor(es) com contrato/salário incompleto`}
                desc="Preencha o tipo de contrato, salário base e data de contratação para activar o processamento de vencimentos."
              />
              {professores.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" color="#8B5CF6" msg="Todos os professores têm contrato e salário preenchidos." />
              ) : (
                professores.map(p => {
                  const missing = missingContractItems(p);
                  return (
                    <View key={p.id} style={st.card}>
                      <View style={[st.cardAvatar, { backgroundColor: '#8B5CF622' }]}>
                        <Ionicons name="person" size={22} color="#8B5CF6" />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={st.cardName}>{p.nome}</Text>
                        {p.email && <Text style={st.cardSub}>{p.email}</Text>}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {p.departamento && <Chip label={p.departamento} />}
                          {p.cargo && <Chip label={p.cargo} />}
                          {!p.funcionarioId && <Chip label="Sem registo RH" warn />}
                          {missing.map(m => <Chip key={m} label={m} warn />)}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[st.actionBtn, { backgroundColor: '#8B5CF622', borderColor: '#8B5CF6' }]}
                        onPress={() => openContratoModal('professor', p)}
                      >
                        <Ionicons name="create-outline" size={14} color="#8B5CF6" />
                        <Text style={[st.actionBtnText, { color: '#8B5CF6' }]}>Completar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </>
          )}

          {/* ── TAB: Funcionários ────────────────────────────────────── */}
          {activeTab === 'Funcionários' && (
            <>
              <InfoBanner
                icon="briefcase-outline"
                color="#F59E0B"
                title={`${funcionarios.length} funcionário(s) com contrato/salário incompleto`}
                desc="Preencha o tipo de contrato, salário base e data de contratação para activar o processamento de vencimentos."
              />
              {funcionarios.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" color="#F59E0B" msg="Todos os funcionários têm contrato e salário preenchidos." />
              ) : (
                funcionarios.map(f => {
                  const missing = missingContractItems(f);
                  return (
                    <View key={f.id} style={st.card}>
                      <View style={[st.cardAvatar, { backgroundColor: '#F59E0B22' }]}>
                        <Ionicons name="briefcase" size={22} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={st.cardName}>{f.nome}</Text>
                        {f.email && <Text style={st.cardSub}>{f.email}</Text>}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {f.departamento && <Chip label={f.departamento} />}
                          {f.cargo && <Chip label={f.cargo} />}
                          {f.bi && <Chip label={`BI: ${f.bi}`} />}
                          {missing.map(m => <Chip key={m} label={m} warn />)}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[st.actionBtn, { backgroundColor: '#F59E0B22', borderColor: '#F59E0B' }]}
                        onPress={() => openContratoModal('funcionario', f)}
                      >
                        <Ionicons name="create-outline" size={14} color="#F59E0B" />
                        <Text style={[st.actionBtnText, { color: '#F59E0B' }]}>Completar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ═══════ Modal de Enquadramento Académico (Alunos) ═══════ */}
      <Modal visible={enqModal.visible} transparent animationType="slide"
        onRequestClose={() => { setEnqModal({ visible: false, aluno: null }); setTurmaSelId(''); setEnqErro(''); }}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '92%' }]}>
            <View style={{ height: 3, backgroundColor: '#3B82F6', borderRadius: 2, marginHorizontal: -24, marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#3B82F622', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="account-arrow-right" size={20} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>Enquadramento Académico</Text>
                <Text style={st.modalSub} numberOfLines={1}>{enqModal.aluno?.nome}</Text>
              </View>
              <TouchableOpacity onPress={() => { setEnqModal({ visible: false, aluno: null }); setTurmaSelId(''); setEnqErro(''); }}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {enqModal.aluno && (
                <View style={st.alunoInfoBox}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {enqModal.aluno.dataNascimento && <InfoPill icon="calendar-outline" label={`Nasc.: ${fmtDate(enqModal.aluno.dataNascimento)}`} />}
                    {enqModal.aluno.genero && <InfoPill icon="person-outline" label={enqModal.aluno.genero} />}
                    {enqModal.aluno.bi && <InfoPill icon="card-outline" label={`BI: ${enqModal.aluno.bi}`} />}
                    {enqModal.aluno.encarregadoNome && <InfoPill icon="people-outline" label={`Enc.: ${enqModal.aluno.encarregadoNome}`} />}
                  </View>
                </View>
              )}

              <Text style={st.fieldLabel}>Número de Matrícula</Text>
              <TextInput
                style={st.input}
                placeholder="ex: ALU-2024-00042 (deixe em branco para manter o actual)"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={numMatricula}
                onChangeText={v => { setNumMatricula(v); setEnqErro(''); }}
              />

              <Text style={st.fieldLabel}>Período Lectivo de Início *</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {PERIODOS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[st.periodoBtn, periodoSel === p && st.periodoBtnActive]}
                    onPress={() => { setPeriodoSel(p); setEnqErro(''); }}
                  >
                    <Text style={[st.periodoBtnText, periodoSel === p && st.periodoBtnTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {turmaSelected && (
                <View style={st.turmaSelectedBox}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#3B82F6" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#3B82F6', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{turmaSelected.nome}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                      {[turmaSelected.classe, turmaSelected.turno, turmaSelected.sala ? `Sala ${turmaSelected.sala}` : null, turmaSelected.anoLetivo].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={st.fieldLabel}>Seleccionar Turma *</Text>
              <View style={st.searchBox}>
                <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={st.searchInput}
                  placeholder="Filtrar por turma, classe, turno, sala…"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={turmaSearch}
                  onChangeText={v => { setTurmaSearch(v); setEnqErro(''); }}
                />
                {turmaSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setTurmaSearch('')}>
                    <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ maxHeight: 240, marginBottom: 8 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                  {turmasFiltradas.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                        {turmasData?.length === 0 ? 'Nenhuma turma criada.' : 'Nenhuma turma encontrada.'}
                      </Text>
                    </View>
                  ) : (
                    turmasFiltradas.map(t => {
                      const selected = turmaSelId === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[st.turmaCard, selected && st.turmaCardSelected]}
                          onPress={() => { setTurmaSelId(t.id); setEnqErro(''); }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={[st.turmaNome, selected && { color: '#3B82F6' }]}>{t.nome}</Text>
                              {t.anoLetivo && (
                                <View style={[st.anoLetivoBadge, selected && { backgroundColor: '#3B82F622', borderColor: '#3B82F644' }]}>
                                  <Text style={[st.anoLetivoText, selected && { color: '#3B82F6' }]}>{t.anoLetivo}</Text>
                                </View>
                              )}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {t.classe && <TurmaInfo icon="layers-outline" label={`Classe ${t.classe}`} active={selected} />}
                              {t.turno && <TurmaInfo icon="time-outline" label={t.turno} active={selected} />}
                              {t.sala && <TurmaInfo icon="business-outline" label={`Sala ${t.sala}`} active={selected} />}
                              {t.nivel && t.nivel !== t.classe && <TurmaInfo icon="school-outline" label={t.nivel} active={selected} />}
                              {t.cursoNome && <TurmaInfo icon="book-outline" label={t.cursoNome} active={selected} />}
                              {t.capacidade != null && <TurmaInfo icon="people-outline" label={`Cap. ${t.capacidade}`} active={selected} />}
                            </View>
                          </View>
                          <View style={[st.turmaRadio, selected && st.turmaRadioActive]}>
                            {selected && <View style={st.turmaRadioDot} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              {!!enqErro && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="alert-circle-outline" size={14} color="#FF453A" />
                  <Text style={{ color: '#FF453A', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 }}>{enqErro}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[st.submitBtn, { backgroundColor: '#3B82F6', opacity: enquadrarMut.isPending ? 0.7 : 1 }]}
                onPress={submitEnquadramento}
                disabled={enquadrarMut.isPending}
              >
                {enquadrarMut.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <MaterialCommunityIcons name="account-check" size={16} color="#fff" />
                    <Text style={st.submitBtnText}>Confirmar Enquadramento</Text>
                  </>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════ Modal de Contrato (Professor / Funcionário) ═══════ */}
      <Modal visible={contratoModal.visible} transparent animationType="slide" onRequestClose={closeContratoModal}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '92%' }]}>
            <View style={{
              height: 3,
              backgroundColor: contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B',
              borderRadius: 2, marginHorizontal: -24, marginBottom: 18,
            }} />

            {/* Cabeçalho */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{
                width: 38, height: 38, borderRadius: 10,
                backgroundColor: contratoModal.tipo === 'professor' ? '#8B5CF622' : '#F59E0B22',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons
                  name={contratoModal.tipo === 'professor' ? 'person' : 'briefcase'}
                  size={20}
                  color={contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>
                  {contratoModal.tipo === 'professor' ? 'Contrato do Professor' : 'Contrato do Funcionário'}
                </Text>
                <Text style={st.modalSub} numberOfLines={1}>{contratoModal.item?.nome}</Text>
              </View>
              <TouchableOpacity onPress={closeContratoModal}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* O que falta */}
              {contratoModal.item && missingContractItems(contratoModal.item).length > 0 && (
                <View style={st.missingBox}>
                  <Ionicons name="alert-circle" size={14} color="#FF453A" />
                  <View style={{ flex: 1 }}>
                    <Text style={st.missingBoxTitle}>Campos em falta:</Text>
                    <Text style={st.missingBoxText}>
                      {missingContractItems(contratoModal.item).join(' · ')}
                    </Text>
                  </View>
                </View>
              )}

              {/* Tipo de Contrato */}
              <Text style={st.fieldLabel}>Tipo de Contrato *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {TIPOS_CONTRATO.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[st.tipoBtn, cTipoContrato === t && {
                      backgroundColor: (contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B') + '22',
                      borderColor: contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B',
                    }]}
                    onPress={() => { setCTipoContrato(t); setCErro(''); }}
                  >
                    <Text style={[st.tipoBtnText, cTipoContrato === t && {
                      color: contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B',
                      fontFamily: 'Inter_700Bold',
                    }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Salário Base */}
              <Text style={st.fieldLabel}>Salário Base (AOA) *</Text>
              <TextInput
                style={st.input}
                placeholder="ex: 150000"
                placeholderTextColor="rgba(255,255,255,0.25)"
                keyboardType="numeric"
                value={cSalario}
                onChangeText={v => { setCSalario(v); setCErro(''); }}
              />

              {/* Subsídios (linha) */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.fieldLabel}>Sub. Alimentação (AOA)</Text>
                  <TextInput
                    style={st.input}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="numeric"
                    value={cSubAlim}
                    onChangeText={v => { setCSubAlim(v); setCErro(''); }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.fieldLabel}>Sub. Transporte (AOA)</Text>
                  <TextInput
                    style={st.input}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="numeric"
                    value={cSubTrans}
                    onChangeText={v => { setCSubTrans(v); setCErro(''); }}
                  />
                </View>
              </View>

              {/* Data de Contratação */}
              <Text style={st.fieldLabel}>Data de Contratação *</Text>
              <TextInput
                style={st.input}
                placeholder="AAAA-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={cDataContr}
                onChangeText={v => { setCDataContr(v); setCErro(''); }}
              />

              {/* Departamento */}
              <Text style={st.fieldLabel}>Departamento</Text>
              <TextInput
                style={st.input}
                placeholder="ex: Docente, Administrativo, Serviços Gerais…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={cDepartamento}
                onChangeText={v => { setCDepartamento(v); setCErro(''); }}
              />

              {/* Cargo */}
              <Text style={st.fieldLabel}>Cargo / Função</Text>
              <TextInput
                style={st.input}
                placeholder="ex: Professor, Secretário, Auxiliar…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={cCargo}
                onChangeText={v => { setCCargo(v); setCErro(''); }}
              />

              {!!cErro && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="alert-circle-outline" size={14} color="#FF453A" />
                  <Text style={{ color: '#FF453A', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 }}>{cErro}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[st.submitBtn, {
                  backgroundColor: contratoModal.tipo === 'professor' ? '#8B5CF6' : '#F59E0B',
                  opacity: contratoMut.isPending ? 0.7 : 1,
                }]}
                onPress={submitContrato}
                disabled={contratoMut.isPending}
              >
                {contratoMut.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={st.submitBtnText}>Guardar Contrato</Text>
                  </>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoBanner({ icon, color, title, desc }: { icon: string; color: string; title: string; desc: string }) {
  return (
    <View style={[st.banner, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={18} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[st.bannerTitle, { color }]}>{title}</Text>
        <Text style={st.bannerDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function EmptyState({ icon, color, msg }: { icon: string; color: string; msg: string }) {
  return (
    <View style={st.emptyState}>
      <Ionicons name={icon as any} size={44} color={color} style={{ opacity: 0.5 }} />
      <Text style={st.emptyText}>{msg}</Text>
    </View>
  );
}

function Chip({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <View style={[st.chip, warn && st.chipWarn]}>
      <Text style={[st.chipText, warn && st.chipTextWarn]}>{label}</Text>
    </View>
  );
}

function TurmaInfo({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <View style={[st.turmaInfoPill, active && st.turmaInfoPillActive]}>
      <Ionicons name={icon as any} size={10} color={active ? '#3B82F6' : 'rgba(255,255,255,0.4)'} />
      <Text style={[st.turmaInfoText, active && { color: '#3B82F6' }]}>{label}</Text>
    </View>
  );
}

function InfoPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={st.infoPill}>
      <Ionicons name={icon as any} size={10} color="rgba(255,255,255,0.4)" />
      <Text style={st.infoPillText}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1228' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 14,
    paddingHorizontal: 16, backgroundColor: '#0F1A38',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#0F1A38', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'Inter_500Medium' },
  tabTextActive: { color: '#fff', fontFamily: 'Inter_700Bold' },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tabBadgeActive: { backgroundColor: Colors.gold + '33' },
  tabBadgeText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'Inter_700Bold' },
  tabBadgeTextActive: { color: Colors.gold },

  // Cards
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  cardAvatar: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardName: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cardSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'Inter_400Regular' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  actionBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: 'Inter_500Medium' },
  chipWarn: { backgroundColor: '#FF453A18' },
  chipTextWarn: { color: '#FF453A' },

  // Banners
  banner: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderLeftWidth: 3,
  },
  bannerTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  bannerDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#0F1A38', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  modalSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  fieldLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 14,
  },
  periodoBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  periodoBtnActive: { backgroundColor: '#3B82F622', borderColor: '#3B82F6' },
  periodoBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  periodoBtnTextActive: { color: '#3B82F6', fontFamily: 'Inter_700Bold' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, marginTop: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },

  // Tipo de contrato chips
  tipoBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tipoBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Missing box
  missingBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FF453A12', borderRadius: 8, borderWidth: 1,
    borderColor: '#FF453A33', padding: 10, marginBottom: 14,
  },
  missingBoxTitle: { color: '#FF453A', fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  missingBoxText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Enquadramento
  alunoInfoBox: {
    backgroundColor: 'rgba(59,130,246,0.06)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
    padding: 10, marginBottom: 14,
  },
  turmaSelectedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
    padding: 10, marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Inter_400Regular', outlineStyle: 'none' as any },
  turmaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 10, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  turmaCardSelected: { backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.35)' },
  turmaNome: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  anoLetivoBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 2,
  },
  anoLetivoText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Inter_500Medium' },
  turmaRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  turmaRadioActive: { borderColor: '#3B82F6' },
  turmaRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' },
  turmaInfoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  turmaInfoPillActive: { backgroundColor: 'rgba(59,130,246,0.1)' },
  turmaInfoText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'Inter_400Regular' },
  infoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  infoPillText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'Inter_400Regular' },
});
