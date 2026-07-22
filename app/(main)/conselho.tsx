import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, StyleSheet, Alert, FlatList,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useAuth, getAuthToken } from '@/context/AuthContext';

const API = (path: string) => `/api/conselho${path}`;

type Tab = 'visao_geral' | 'reunioes' | 'deliberacoes' | 'validacoes' | 'membros';

const CARGO_LABELS: Record<string, string> = {
  presidente: 'Presidente',
  secretario: 'Secretário(a)',
  vogal: 'Vogal',
  tecnico_educacao: 'Técnico de Educação',
  representante_professores: 'Rep. dos Professores',
  representante_pais: 'Rep. dos Pais/Encarregados',
  representante_alunos: 'Rep. dos Alunos',
};

const STATUS_COLORS: Record<string, string> = {
  agendada: '#3B82F6',
  em_curso: '#F59E0B',
  concluida: '#10B981',
  cancelada: '#EF4444',
  pendente: '#F59E0B',
  em_revisao: '#8B5CF6',
  aprovada: '#10B981',
  rejeitada: '#EF4444',
  devolvida: '#F97316',
  adiada: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada', em_curso: 'Em Curso', concluida: 'Concluída', cancelada: 'Cancelada',
  pendente: 'Pendente', em_revisao: 'Em Revisão', aprovada: 'Aprovada',
  rejeitada: 'Rejeitada', devolvida: 'Devolvida', adiada: 'Adiada',
};

function Badge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[status] ?? '#6B7280') + '22' }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] ?? '#6B7280' }]}>
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <MaterialCommunityIcons name={icon as any} size={28} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ConselhoScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tipo?: string; tab?: Tab }>();
  const tipo = params.tipo ?? (user?.role === 'membro_conselho_escola' ? 'escola' : 'pedagogico');
  const [activeTab, setActiveTab] = useState<Tab>((params.tab as Tab) ?? 'visao_geral');

  const [stats, setStats] = useState<any>(null);
  const [reunioes, setReunioes] = useState<any[]>([]);
  const [deliberacoes, setDeliberacoes] = useState<any[]>([]);
  const [validacoes, setValidacoes] = useState<any[]>([]);
  const [membros, setMembros] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState<'reuniao' | 'deliberacao' | 'validacao' | 'membro' | 'detalhe' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Selector de utilizadores para adicionar membro
  const [utilizadoresDisponiveis, setUtilizadoresDisponiveis] = useState<any[]>([]);
  const [searchUtilizador, setSearchUtilizador] = useState('');
  const [utilizadorSelecionado, setUtilizadorSelecionado] = useState<any>(null);

  const isAdmin = ['ceo', 'pca', 'admin', 'director', 'pedagogico'].includes(user?.role ?? '');
  const canValidate = isAdmin || user?.role === 'membro_conselho_pedagogico';

  const anoLetivo = user?.anoLetivo ?? new Date().getFullYear().toString();

  async function apiFetch(path: string, opts?: RequestInit) {
    const token = await getAuthToken();
    const res = await fetch(API(path), {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Erro' }))).error ?? 'Erro');
    return res.json();
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, d, v, m] = await Promise.all([
        apiFetch('/stats').catch(() => null),
        apiFetch(`/reunioes?tipo=${tipo}&anoLetivo=${anoLetivo}`).catch(() => []),
        apiFetch(`/deliberacoes?tipo=${tipo}&anoLetivo=${anoLetivo}`).catch(() => []),
        tipo === 'pedagogico' ? apiFetch(`/validacoes?anoLetivo=${anoLetivo}`).catch(() => []) : Promise.resolve([]),
        apiFetch(`/membros?tipo=${tipo}`).catch(() => []),
      ]);
      setStats(s);
      setReunioes(Array.isArray(r) ? r : []);
      setDeliberacoes(Array.isArray(d) ? d : []);
      setValidacoes(Array.isArray(v) ? v : []);
      setMembros(Array.isArray(m) ? m : []);
    } finally {
      setLoading(false);
    }
  }, [tipo, anoLetivo]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const [loadingUtilizadores, setLoadingUtilizadores] = useState(false);

  // Carregar utilizadores disponíveis ao abrir o modal de membro
  useEffect(() => {
    if (showModal === 'membro') {
      setLoadingUtilizadores(true);
      apiFetch('/utilizadores-disponiveis')
        .then(data => setUtilizadoresDisponiveis(Array.isArray(data) ? data : []))
        .catch(() => setUtilizadoresDisponiveis([]))
        .finally(() => setLoadingUtilizadores(false));
    } else {
      setUtilizadoresDisponiveis([]);
      setSearchUtilizador('');
      setUtilizadorSelecionado(null);
    }
  }, [showModal]);

  const ROLE_LABEL: Record<string, string> = {
    director: 'Director', admin: 'Administrador', pedagogico: 'Coord. Pedagógico',
    professor: 'Professor', secretaria: 'Secretaria', rh: 'RH',
    financeiro: 'Financeiro', chefe_secretaria: 'Chefe Secretaria',
    subdirector_pedagogico: 'Sub-Director', coordenador_curso: 'Coord. Curso',
    membro_conselho_pedagogico: 'Mbr. Conselho Ped.', membro_conselho_escola: 'Mbr. Conselho Esc.',
    ceo: 'CEO', pca: 'PCA',
  };

  const utilizadoresFiltrados = utilizadoresDisponiveis.filter(u =>
    !searchUtilizador || u.nome?.toLowerCase().includes(searchUtilizador.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUtilizador.toLowerCase())
  );

  async function saveReuniao() {
    if (!form.titulo || !form.dataReuniao) return Alert.alert('Erro', 'Título e data são obrigatórios.');
    setSaving(true);
    try {
      if (selected?.id) {
        await apiFetch(`/reunioes/${selected.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/reunioes', { method: 'POST', body: JSON.stringify({ ...form, tipoConselho: tipo, anoLetivo }) });
      }
      setShowModal(null); setForm({}); setSelected(null); loadAll();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally { setSaving(false); }
  }

  async function saveDeliberacao() {
    if (!form.titulo || !form.descricao || !form.dataDeliberacao) return Alert.alert('Erro', 'Preencha todos os campos obrigatórios.');
    setSaving(true);
    try {
      if (selected?.id) {
        await apiFetch(`/deliberacoes/${selected.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch('/deliberacoes', { method: 'POST', body: JSON.stringify({ ...form, tipoConselho: tipo, anoLetivo }) });
      }
      setShowModal(null); setForm({}); setSelected(null); loadAll();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally { setSaving(false); }
  }

  async function votar(deliberacaoId: string, voto: string) {
    try {
      await apiFetch(`/deliberacoes/${deliberacaoId}/votar`, { method: 'POST', body: JSON.stringify({ voto }) });
      loadAll();
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function validarPauta(validacaoId: string, status: string) {
    const parecer = await new Promise<string>(resolve => {
      Alert.prompt?.('Parecer', 'Escreva o parecer do conselho (opcional):', (text) => resolve(text ?? ''), 'plain-text', '') ?? resolve('');
    });
    try {
      await apiFetch(`/validacoes/${validacaoId}`, { method: 'PATCH', body: JSON.stringify({ status, parecerConselho: parecer }) });
      loadAll();
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function updateReuniaoStatus(id: string, status: string) {
    try {
      await apiFetch(`/reunioes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadAll();
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function saveMembro() {
    if (!form.utilizadorId || !form.cargo || !form.mandatoInicio) return Alert.alert('Erro', 'Preencha todos os campos obrigatórios.');
    setSaving(true);
    try {
      await apiFetch('/membros', { method: 'POST', body: JSON.stringify({ ...form, tipoConselho: tipo }) });
      setShowModal(null); setForm({}); loadAll();
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setSaving(false); }
  }

  const tipoLabel = tipo === 'escola' ? 'Conselho de Escola' : 'Conselho Pedagógico';
  const tipoColor = tipo === 'escola' ? '#D4AF37' : '#8B5CF6';

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'visao_geral', label: 'Visão Geral', icon: 'view-dashboard' },
    { id: 'reunioes', label: 'Reuniões', icon: 'calendar-clock' },
    { id: 'deliberacoes', label: 'Deliberações', icon: 'vote' },
    ...(tipo === 'pedagogico' ? [{ id: 'validacoes' as Tab, label: 'Validações', icon: 'file-check' }] : []),
    { id: 'membros', label: 'Membros', icon: 'account-multiple-check' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: tipoColor }]}>
        <MaterialCommunityIcons name={tipo === 'escola' ? 'office-building' : 'account-group'} size={28} color={tipoColor} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>{tipoLabel}</Text>
          <Text style={styles.headerSub}>Órgão formal — Dec. Exec. n.º 04/2026, Art. 6.º</Text>
        </View>
        {loading && <ActivityIndicator color={tipoColor} />}
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && { borderBottomColor: tipoColor, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab.id)}>
            <MaterialCommunityIcons name={tab.icon as any} size={16} color={activeTab === tab.id ? tipoColor : '#8899AA'} />
            <Text style={[styles.tabLabel, activeTab === tab.id && { color: tipoColor }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'visao_geral' && (
          <View>
            <Text style={styles.sectionTitle}>Resumo do Conselho</Text>
            <View style={styles.statsRow}>
              <StatCard icon="account-multiple" label="Membros Activos" value={stats?.membros ?? 0} color="#3B82F6" />
              <StatCard icon="calendar-clock" label="Reuniões" value={stats?.reunioes ?? 0} color="#8B5CF6" />
              <StatCard icon="calendar-alert" label="Reuniões Pendentes" value={stats?.reunioesPendentes ?? 0} color="#F59E0B" />
            </View>
            <View style={styles.statsRow}>
              <StatCard icon="vote" label="Deliberações Pendentes" value={stats?.deliberacoesPendentes ?? 0} color="#EF4444" />
              {tipo === 'pedagogico' && <StatCard icon="file-check" label="Validações Pendentes" value={stats?.validacoesPendentes ?? 0} color="#10B981" />}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Próximas Reuniões</Text>
            {reunioes.filter(r => r.status === 'agendada').slice(0, 3).map(r => (
              <TouchableOpacity key={r.id} style={styles.card} onPress={() => { setSelected(r); setShowModal('detalhe'); }}>
                <View style={styles.cardRow}>
                  <MaterialCommunityIcons name="calendar-clock" size={20} color="#3B82F6" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.cardTitle}>{r.titulo}</Text>
                    <Text style={styles.cardMeta}>{r.dataReuniao} {r.horaInicio ? `· ${r.horaInicio}` : ''} {r.local ? `· ${r.local}` : ''}</Text>
                  </View>
                  <Badge status={r.status} />
                </View>
              </TouchableOpacity>
            ))}
            {reunioes.filter(r => r.status === 'agendada').length === 0 && (
              <Text style={styles.empty}>Nenhuma reunião agendada.</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Deliberações Recentes</Text>
            {deliberacoes.slice(0, 3).map(d => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <MaterialCommunityIcons name="vote" size={20} color="#8B5CF6" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.cardTitle}>{d.titulo}</Text>
                    <Text style={styles.cardMeta}>{d.dataDeliberacao} · {d.votosFavor}✓ {d.votosContra}✗ {d.votosAbstencao}~</Text>
                  </View>
                  <Badge status={d.status} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── REUNIÕES ── */}
        {activeTab === 'reunioes' && (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Reuniões</Text>
              {isAdmin && (
                <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={() => { setSelected(null); setForm({ tipoConselho: tipo }); setShowModal('reuniao'); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Nova Reunião</Text>
                </TouchableOpacity>
              )}
            </View>
            {reunioes.length === 0 && <Text style={styles.empty}>Nenhuma reunião registada.</Text>}
            {reunioes.map(r => (
              <TouchableOpacity key={r.id} style={styles.card} onPress={() => { setSelected(r); setShowModal('detalhe'); }}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardTitle}>{r.titulo}</Text>
                      <Badge status={r.status} />
                    </View>
                    <Text style={styles.cardMeta}>{r.dataReuniao}{r.horaInicio ? ` · ${r.horaInicio}` : ''}{r.local ? ` · ${r.local}` : ''}</Text>
                    {r.descricao ? <Text style={styles.cardDesc}>{r.descricao}</Text> : null}
                    {r.agenda && r.agenda.length > 0 && (
                      <Text style={styles.cardMeta}>{r.agenda.length} {r.agenda.length === 1 ? 'ponto' : 'pontos'} na agenda</Text>
                    )}
                  </View>
                </View>
                {isAdmin && r.status === 'agendada' && (
                  <View style={[styles.cardRow, { marginTop: 10, gap: 8 }]}>
                    <TouchableOpacity style={styles.btnSmall} onPress={() => { setSelected(r); setForm({ titulo: r.titulo, descricao: r.descricao, dataReuniao: r.dataReuniao, horaInicio: r.horaInicio, local: r.local }); setShowModal('reuniao'); }}>
                      <Text style={styles.btnSmallText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#10B981' }]} onPress={() => updateReuniaoStatus(r.id, 'em_curso')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Iniciar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#EF4444' }]} onPress={() => updateReuniaoStatus(r.id, 'cancelada')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isAdmin && r.status === 'em_curso' && (
                  <View style={[styles.cardRow, { marginTop: 10, gap: 8 }]}>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#10B981' }]} onPress={() => updateReuniaoStatus(r.id, 'concluida')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Concluir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── DELIBERAÇÕES ── */}
        {activeTab === 'deliberacoes' && (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Deliberações</Text>
              {isAdmin && (
                <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={() => { setSelected(null); setForm({ tipo: 'deliberacao', dataDeliberacao: new Date().toISOString().slice(0, 10) }); setShowModal('deliberacao'); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Nova Deliberação</Text>
                </TouchableOpacity>
              )}
            </View>
            {deliberacoes.length === 0 && <Text style={styles.empty}>Nenhuma deliberação registada.</Text>}
            {deliberacoes.map(d => (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardTitle}>{d.titulo}</Text>
                      <Badge status={d.status} />
                    </View>
                    <Text style={styles.cardMeta}>{d.dataDeliberacao} · {d.tipo}</Text>
                    <Text style={styles.cardDesc}>{d.descricao}</Text>
                    {d.status === 'pendente' && (
                      <View style={styles.votosBar}>
                        <Text style={styles.votoLabel}>✓ Favor: {d.votosFavor}</Text>
                        <Text style={[styles.votoLabel, { color: '#EF4444' }]}>✗ Contra: {d.votosContra}</Text>
                        <Text style={[styles.votoLabel, { color: '#6B7280' }]}>~ Abstenção: {d.votosAbstencao}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {d.status === 'pendente' && canValidate && (
                  <View style={[styles.cardRow, { marginTop: 10, gap: 8, flexWrap: 'wrap' }]}>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#10B981' }]} onPress={() => votar(d.id, 'favor')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>✓ A Favor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#EF4444' }]} onPress={() => votar(d.id, 'contra')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>✗ Contra</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSmall} onPress={() => votar(d.id, 'abstencao')}>
                      <Text style={styles.btnSmallText}>~ Abstenção</Text>
                    </TouchableOpacity>
                    {isAdmin && (
                      <>
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#10B981' }]} onPress={() => { const b = { status: 'aprovada' }; apiFetch(`/deliberacoes/${d.id}`, { method: 'PATCH', body: JSON.stringify(b) }).then(loadAll).catch(e => Alert.alert('Erro', e.message)); }}>
                          <Text style={[styles.btnSmallText, { color: '#fff' }]}>Aprovar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#EF4444' }]} onPress={() => { apiFetch(`/deliberacoes/${d.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejeitada' }) }).then(loadAll).catch(e => Alert.alert('Erro', e.message)); }}>
                          <Text style={[styles.btnSmallText, { color: '#fff' }]}>Rejeitar</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
                {d.resultado && <Text style={[styles.cardMeta, { marginTop: 6 }]}>Resultado: {d.resultado}</Text>}
                {d.prazoImplementacao && <Text style={styles.cardMeta}>Prazo: {d.prazoImplementacao}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* ── VALIDAÇÕES DE PAUTA (só Conselho Pedagógico) ── */}
        {activeTab === 'validacoes' && tipo === 'pedagogico' && (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Validação de Pautas</Text>
            </View>
            <Text style={styles.cardDesc}>Pedidos de validação formal de pautas pelo Conselho Pedagógico (Art. 6.º).</Text>
            {validacoes.length === 0 && <Text style={styles.empty}>Nenhuma validação pendente.</Text>}
            {validacoes.map(v => (
              <View key={v.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color="#3B82F6" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardTitle}>{v.turmaNome ?? 'Turma'} {v.turmaClasse ? `(${v.turmaClasse}ª)` : ''}</Text>
                      <Badge status={v.status} />
                    </View>
                    {v.disciplina && <Text style={styles.cardMeta}>Disciplina: {v.disciplina}</Text>}
                    {v.trimestre && <Text style={styles.cardMeta}>Trimestre: {v.trimestre}º</Text>}
                    <Text style={styles.cardMeta}>Solicitado por: {v.solicitadoPorNome} · {new Date(v.solicitadoEm).toLocaleDateString('pt-AO')}</Text>
                    <Text style={styles.cardMeta}>Tipo: {v.tipoValidacao}</Text>
                    {v.justificativa && <Text style={styles.cardDesc}>{v.justificativa}</Text>}
                    {v.parecerConselho && <Text style={[styles.cardDesc, { color: '#10B981' }]}>Parecer: {v.parecerConselho}</Text>}
                  </View>
                </View>
                {v.status === 'pendente' && canValidate && (
                  <View style={[styles.cardRow, { marginTop: 10, gap: 8 }]}>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#8B5CF6' }]} onPress={() => apiFetch(`/validacoes/${v.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'em_revisao' }) }).then(loadAll).catch(e => Alert.alert('Erro', e.message))}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Em Revisão</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#10B981' }]} onPress={() => validarPauta(v.id, 'aprovada')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Aprovar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#EF4444' }]} onPress={() => validarPauta(v.id, 'rejeitada')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: '#F97316' }]} onPress={() => validarPauta(v.id, 'devolvida')}>
                      <Text style={[styles.btnSmallText, { color: '#fff' }]}>Devolver</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── MEMBROS ── */}
        {activeTab === 'membros' && (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Membros do Conselho</Text>
              {isAdmin && (
                <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={() => { setForm({}); setShowModal('membro'); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Adicionar</Text>
                </TouchableOpacity>
              )}
            </View>
            {membros.length === 0 && <Text style={styles.empty}>Nenhum membro registado.</Text>}
            {membros.map(m => (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: tipoColor + '33' }]}>
                    <Text style={[styles.avatarText, { color: tipoColor }]}>{(m.nome ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cardTitle}>{m.nome}</Text>
                    <Text style={styles.cardMeta}>{CARGO_LABELS[m.cargo] ?? m.cargo}</Text>
                    <Text style={styles.cardMeta}>{m.email}</Text>
                    <Text style={styles.cardMeta}>Mandato: {m.mandatoInicio}{m.mandatoFim ? ` → ${m.mandatoFim}` : ''}</Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => apiFetch(`/membros/${m.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: false }) }).then(loadAll).catch(e => Alert.alert('Erro', e.message))}>
                      <MaterialCommunityIcons name="account-remove" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Modal: Reunião ── */}
      <Modal visible={showModal === 'reuniao'} animationType="slide" transparent onRequestClose={() => setShowModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{selected?.id ? 'Editar Reunião' : 'Nova Reunião'}</Text>
            <ScrollView>
              <Text style={styles.label}>Título *</Text>
              <TextInput style={styles.input} value={form.titulo ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, titulo: t }))} placeholder="Ex: Reunião Ordinária n.º 1/2026" />
              <Text style={styles.label}>Data (AAAA-MM-DD) *</Text>
              <TextInput style={styles.input} value={form.dataReuniao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, dataReuniao: t }))} placeholder="2026-09-15" />
              <Text style={styles.label}>Hora de Início</Text>
              <TextInput style={styles.input} value={form.horaInicio ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, horaInicio: t }))} placeholder="09:00" />
              <Text style={styles.label}>Local</Text>
              <TextInput style={styles.input} value={form.local ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, local: t }))} placeholder="Sala de Reuniões" />
              <Text style={styles.label}>Descrição / Convocatória</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={form.descricao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, descricao: t }))} />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setShowModal(null); setForm({}); setSelected(null); }}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={saveReuniao} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Deliberação ── */}
      <Modal visible={showModal === 'deliberacao'} animationType="slide" transparent onRequestClose={() => setShowModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nova Deliberação</Text>
            <ScrollView>
              <Text style={styles.label}>Título *</Text>
              <TextInput style={styles.input} value={form.titulo ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, titulo: t }))} placeholder="Ex: Aprovação do Plano Curricular" />
              <Text style={styles.label}>Descrição *</Text>
              <TextInput style={[styles.input, { height: 80 }]} multiline value={form.descricao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, descricao: t }))} />
              <Text style={styles.label}>Tipo</Text>
              <View style={styles.chipRow}>
                {['deliberacao', 'recomendacao', 'resolucao', 'parecer'].map(t => (
                  <TouchableOpacity key={t} style={[styles.chip, form.tipo === t && { backgroundColor: tipoColor }]} onPress={() => setForm((f: any) => ({ ...f, tipo: t }))}>
                    <Text style={[styles.chipText, form.tipo === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Data *</Text>
              <TextInput style={styles.input} value={form.dataDeliberacao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, dataDeliberacao: t }))} placeholder="AAAA-MM-DD" />
              <Text style={styles.label}>Prazo de Implementação</Text>
              <TextInput style={styles.input} value={form.prazoImplementacao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, prazoImplementacao: t }))} placeholder="AAAA-MM-DD" />
              <Text style={styles.label}>Responsável pela Implementação</Text>
              <TextInput style={styles.input} value={form.responsavelImplementacao ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, responsavelImplementacao: t }))} />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setShowModal(null); setForm({}); setSelected(null); }}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={saveDeliberacao} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Membro ── */}
      <Modal visible={showModal === 'membro'} animationType="slide" transparent onRequestClose={() => setShowModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Adicionar Membro ao Conselho</Text>
            <ScrollView keyboardShouldPersistTaps="handled">

              {/* ── Selector de Utilizador ── */}
              <Text style={styles.label}>Utilizador *</Text>
              {utilizadorSelecionado ? (
                <View style={styles.userPickerSelected}>
                  <View style={[styles.avatar, { backgroundColor: tipoColor + '33', width: 36, height: 36, borderRadius: 18 }]}>
                    <Text style={[styles.avatarText, { color: tipoColor, fontSize: 14 }]}>{(utilizadorSelecionado.nome ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.userPickerName}>{utilizadorSelecionado.nome}</Text>
                    <Text style={styles.userPickerRole}>{ROLE_LABEL[utilizadorSelecionado.role] ?? utilizadorSelecionado.role}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setUtilizadorSelecionado(null); setForm((f: any) => ({ ...f, utilizadorId: undefined })); }}>
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    value={searchUtilizador}
                    onChangeText={setSearchUtilizador}
                    placeholder="Pesquisar por nome ou email..."
                    placeholderTextColor="#8899AA"
                  />
                  {loadingUtilizadores && (
                    <ActivityIndicator color={tipoColor} style={{ marginVertical: 8 }} />
                  )}
                  {!loadingUtilizadores && utilizadoresFiltrados.length === 0 && searchUtilizador.length > 0 && (
                    <Text style={styles.empty}>Nenhum utilizador encontrado.</Text>
                  )}
                  {!loadingUtilizadores && utilizadoresFiltrados.length === 0 && searchUtilizador.length === 0 && utilizadoresDisponiveis.length === 0 && (
                    <Text style={[styles.empty, { color: '#EF4444' }]}>Não foi possível carregar utilizadores.</Text>
                  )}
                  <View style={styles.userPickerList}>
                    {utilizadoresFiltrados.map(u => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.userPickerItem}
                        onPress={() => {
                          setUtilizadorSelecionado(u);
                          setForm((f: any) => ({ ...f, utilizadorId: u.id }));
                          setSearchUtilizador('');
                        }}
                      >
                        <View style={[styles.avatar, { backgroundColor: tipoColor + '22', width: 34, height: 34, borderRadius: 17 }]}>
                          <Text style={[styles.avatarText, { color: tipoColor, fontSize: 13 }]}>{(u.nome ?? '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.userPickerName}>{u.nome}</Text>
                          <Text style={styles.userPickerRole}>{ROLE_LABEL[u.role] ?? u.role} · {u.email}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#8899AA" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── Cargo ── */}
              <Text style={styles.label}>Cargo no Conselho *</Text>
              <View style={styles.chipRow}>
                {Object.entries(CARGO_LABELS).map(([k, v]) => (
                  <TouchableOpacity key={k} style={[styles.chip, form.cargo === k && { backgroundColor: tipoColor }]} onPress={() => setForm((f: any) => ({ ...f, cargo: k }))}>
                    <Text style={[styles.chipText, form.cargo === k && { color: '#fff' }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Início do Mandato *</Text>
              <TextInput style={styles.input} value={form.mandatoInicio ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, mandatoInicio: t }))} placeholder="AAAA-MM-DD" placeholderTextColor="#8899AA" />
              <Text style={styles.label}>Fim do Mandato</Text>
              <TextInput style={styles.input} value={form.mandatoFim ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, mandatoFim: t }))} placeholder="AAAA-MM-DD (opcional)" placeholderTextColor="#8899AA" />
              <Text style={styles.label}>Observações</Text>
              <TextInput style={[styles.input, { height: 60 }]} multiline value={form.observacoes ?? ''} onChangeText={t => setForm((f: any) => ({ ...f, observacoes: t }))} />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setShowModal(null); setForm({}); setUtilizadorSelecionado(null); setSearchUtilizador(''); }}>
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor }]} onPress={saveMembro} disabled={saving || !utilizadorSelecionado || !form.cargo || !form.mandatoInicio}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Adicionar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Detalhe Reunião ── */}
      <Modal visible={showModal === 'detalhe' && !!selected} animationType="slide" transparent onRequestClose={() => setShowModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.modalTitle, { flex: 1 }]}>{selected?.titulo}</Text>
              <Badge status={selected?.status ?? ''} />
            </View>
            <ScrollView style={{ marginTop: 8 }}>
              <Text style={styles.cardMeta}>Data: {selected?.dataReuniao}{selected?.horaInicio ? ` · ${selected.horaInicio}` : ''}</Text>
              {selected?.local && <Text style={styles.cardMeta}>Local: {selected.local}</Text>}
              {selected?.descricao && <Text style={[styles.cardDesc, { marginTop: 8 }]}>{selected.descricao}</Text>}
              {selected?.agenda && selected.agenda.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Agenda</Text>
                  {selected.agenda.map((a: any, i: number) => (
                    <View key={i} style={styles.agendaItem}>
                      <Text style={styles.agendaNum}>{i + 1}.</Text>
                      <Text style={styles.agendaText}>{a.ponto ?? a}</Text>
                    </View>
                  ))}
                </>
              )}
              {selected?.ata && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Acta</Text>
                  <Text style={styles.cardDesc}>{selected.ata}</Text>
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: tipoColor, marginTop: 12 }]} onPress={() => setShowModal(null)}>
              <Text style={styles.btnPrimaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1F35' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#8B5CF6' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F4E9C8' },
  headerSub: { fontSize: 11, color: '#8899AA', marginTop: 2 },
  tabBar: { backgroundColor: '#0A1828', borderBottomWidth: 1, borderBottomColor: '#1A2F45', maxHeight: 48, flexGrow: 0 },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: 13, color: '#8899AA', fontWeight: '500' },
  body: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F4E9C8', marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 120, backgroundColor: '#0A1828', borderRadius: 10, padding: 14, alignItems: 'center', borderLeftWidth: 3 },
  statValue: { fontSize: 28, fontWeight: '700', color: '#F4E9C8', marginTop: 6 },
  statLabel: { fontSize: 11, color: '#8899AA', textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: '#0A1828', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1A2F45' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#F4E9C8', flex: 1 },
  cardMeta: { fontSize: 12, color: '#8899AA', marginTop: 3 },
  cardDesc: { fontSize: 13, color: '#B0BEC5', marginTop: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  empty: { color: '#8899AA', textAlign: 'center', marginTop: 24, fontSize: 13 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#1A2F45' },
  btnSmallText: { fontSize: 12, color: '#B0BEC5', fontWeight: '600' },
  btnCancel: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1A2F45' },
  btnCancelText: { color: '#8899AA', fontWeight: '600' },
  votosBar: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  votoLabel: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1A2F45' },
  chipText: { fontSize: 12, color: '#B0BEC5', fontWeight: '500' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBox: { backgroundColor: '#0D1F35', borderRadius: 16, padding: 20, maxHeight: '80%', width: '100%', maxWidth: 520 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#F4E9C8', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  label: { fontSize: 13, color: '#8899AA', marginBottom: 4, marginTop: 10, fontWeight: '600' },
  input: { backgroundColor: '#0A1828', borderWidth: 1, borderColor: '#1A2F45', borderRadius: 8, padding: 10, color: '#F4E9C8', fontSize: 14 },
  agendaItem: { flexDirection: 'row', gap: 6, marginBottom: 4, paddingLeft: 4 },
  agendaNum: { fontSize: 13, color: '#8B5CF6', fontWeight: '700', width: 18 },
  agendaText: { fontSize: 13, color: '#B0BEC5', flex: 1 },
  userPickerList: { marginTop: 4, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#1A2F45' },
  userPickerItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#1A2F45', backgroundColor: '#0A1828' },
  userPickerSelected: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A1828', borderWidth: 1, borderColor: '#1A2F45', borderRadius: 8, padding: 10, marginBottom: 4 },
  userPickerName: { fontSize: 14, fontWeight: '600', color: '#F4E9C8' },
  userPickerRole: { fontSize: 12, color: '#8899AA', marginTop: 2 },
});
