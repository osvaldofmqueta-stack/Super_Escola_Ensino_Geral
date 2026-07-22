import React, { useState, useEffect, useCallback } from 'react';
import {KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { api } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import { alertSucesso, alertErro } from '../../utils/toast';
import { formatAOA } from '../../context/FinanceiroContext';
import { useFinanceiro } from '../../context/FinanceiroContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import RequiredMark from '@/components/RequiredMark';
import DateInput from '@/components/DateInput';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Bolsa {
  id: string;
  alunoId: string;
  tipo: string;
  percentagem: number;
  descricao: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  ativo: boolean;
  aprovadoPor: string | null;
  observacao: string | null;
  criadoEm: string;
  nome?: string;
  apelido?: string;
  numeroMatricula?: string;
  turmaId?: string;
}

interface AlunoOption {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  turmaId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIPOS_BOLSA = [
  { key: 'social',       label: 'Bolsa Social',       icon: 'heart-outline',          color: '#EF5350' },
  { key: 'merito',       label: 'Bolsa de Mérito',    icon: 'star-outline',           color: '#FFC107' },
  { key: 'desportivo',   label: 'Bolsa Desportiva',   icon: 'football-outline',       color: '#4CAF50' },
  { key: 'funcionario',  label: 'Filho de Funcionário', icon: 'people-outline',       color: '#2196F3' },
  { key: 'parcial',      label: 'Desconto Parcial',   icon: 'pricetag-outline',       color: '#9C27B0' },
  { key: 'outro',        label: 'Outro',              icon: 'ellipsis-horizontal-outline', color: '#78909C' },
];

const GLASS = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.12)';

function getTipoCfg(tipo: string) {
  return TIPOS_BOLSA.find(t => t.key === tipo) ?? TIPOS_BOLSA[TIPOS_BOLSA.length - 1];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function PctBadge({ pct }: { pct: number }) {
  const color = pct === 100 ? '#66BB6A' : pct >= 50 ? '#FFC107' : '#4FC3F7';
  return (
    <View style={[styles.badge, { backgroundColor: color + '28', borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>
        {pct === 100 ? 'Isento' : `${pct}% desc.`}
      </Text>
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BolsasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { alunos, turmas } = useData();
  const { taxas } = useFinanceiro();

  const [bolsas, setBolsas] = useState<Bolsa[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAtivo, setFilterAtivo] = useState<'todos' | 'ativos' | 'inativos'>('ativos');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bolsa | null>(null);
  const [showAlunoSearch, setShowAlunoSearch] = useState(false);
  const [alunoSearch, setAlunoSearch] = useState('');

  // Form state
  const [form, setForm] = useState({
    alunoId: '',
    alunoNome: '',
    tipo: 'social',
    percentagem: '100',
    descricao: '',
    dataInicio: '',
    dataFim: '',
    aprovadoPor: '',
    observacao: '',
    ativo: true,
  });

  const loadBolsas = useCallback(async () => {
    try {
      const data = await api.get<Bolsa[]>('/api/bolsas');
      setBolsas(data);
    } catch {
      alertErro('Erro ao carregar bolsas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadBolsas(); }, [loadBolsas]);

  // ─── Computed ─────────────────────────────────────────────────────────────
  const ativos = bolsas.filter(b => b.ativo);
  const propinaTaxa = taxas.find(t => t.tipo === 'propina' && t.ativo);
  const valorPropina = propinaTaxa?.valor ?? 0;
  const impactoMensal = ativos.reduce((sum, b) => sum + (valorPropina * b.percentagem / 100), 0);
  const descontoMedio = ativos.length > 0
    ? Math.round(ativos.reduce((s, b) => s + b.percentagem, 0) / ativos.length)
    : 0;

  const filtered = bolsas.filter(b => {
    const matchSearch = `${b.nome ?? ''} ${b.apelido ?? ''} ${b.numeroMatricula ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterAtivo === 'todos' || (filterAtivo === 'ativos' ? b.ativo : !b.ativo);
    return matchSearch && matchStatus;
  });

  const alunosFiltrados = alunos
    .filter(a => a.ativo && `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(alunoSearch.toLowerCase()))
    .slice(0, 10);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm({
      alunoId: '', alunoNome: '', tipo: 'social', percentagem: '100',
      descricao: '', dataInicio: '', dataFim: '', aprovadoPor: user?.nome ?? '', observacao: '', ativo: true,
    });
    setShowModal(true);
  };

  const openEdit = (b: Bolsa) => {
    setEditing(b);
    setForm({
      alunoId: b.alunoId,
      alunoNome: `${b.nome ?? ''} ${b.apelido ?? ''}`.trim(),
      tipo: b.tipo,
      percentagem: String(b.percentagem),
      descricao: b.descricao ?? '',
      dataInicio: b.dataInicio ?? '',
      dataFim: b.dataFim ?? '',
      aprovadoPor: b.aprovadoPor ?? '',
      observacao: b.observacao ?? '',
      ativo: b.ativo,
    });
    setShowModal(true);
  };

  const guardar = async () => {
    if (!form.alunoId) return alertErro('Selecione um aluno.');
    const pct = Number(form.percentagem);
    if (isNaN(pct) || pct < 0 || pct > 100) return alertErro('Percentagem deve ser entre 0 e 100.');

    const payload = {
      alunoId: form.alunoId,
      tipo: form.tipo,
      percentagem: pct,
      descricao: form.descricao,
      dataInicio: form.dataInicio || null,
      dataFim: form.dataFim || null,
      aprovadoPor: form.aprovadoPor,
      observacao: form.observacao,
      ativo: form.ativo,
    };

    try {
      if (editing) {
        await api.put(`/api/bolsas/${editing.id}`, payload);
        alertSucesso('Bolsa actualizada');
      } else {
        await api.post('/api/bolsas', payload);
        alertSucesso('Bolsa criada com sucesso');
      }
      setShowModal(false);
      loadBolsas();
    } catch (e: unknown) {
      alertErro('Erro ao guardar', (e as Error).message);
    }
  };

  useEnterToSave(guardar, showModal);

  const toggleAtivo = async (b: Bolsa) => {
    try {
      await api.put(`/api/bolsas/${b.id}`, { ativo: !b.ativo });
      alertSucesso(!b.ativo ? 'Bolsa activada' : 'Bolsa suspensa');
      loadBolsas();
    } catch {
      alertErro('Erro ao actualizar estado');
    }
  };

  const eliminar = (b: Bolsa) => {
    webAlert('Eliminar Bolsa', `Tem a certeza que pretende eliminar a bolsa de ${b.nome} ${b.apelido}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/bolsas/${b.id}`);
          alertSucesso('Bolsa eliminada');
          loadBolsas();
        } catch { alertErro('Erro ao eliminar'); }
      }},
    ]);
  };

  const getNomeTurma = (turmaId?: string) => {
    if (!turmaId) return '';
    const t = turmas.find(t => t.id === turmaId);
    return t ? t.nome : '';
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Bolsas & Descontos</Text>
            <Text style={styles.headerSub}>Gestão de alunos bolseiros</Text>
          </View>
        </View>
        <View style={{ padding: 12, width: '100%' }}>
          <SkeletonList rows={6} withAvatar />
          <Text style={styles.loadingText}>A carregar...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bolsas & Descontos</Text>
          <Text style={styles.headerSub}>Gestão de alunos bolseiros</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnTxt}>Nova Bolsa</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBolsas(); }} tintColor={Colors.primary} />}
      >
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpi, { borderLeftColor: '#66BB6A' }]}>
            <MaterialCommunityIcons name="school-outline" size={20} color="#66BB6A" />
            <Text style={styles.kpiLabel}>Bolseiros Activos</Text>
            <Text style={[styles.kpiVal, { color: '#66BB6A' }]}>{ativos.length}</Text>
            <Text style={styles.kpiSub}>de {bolsas.length} total</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#FFC107' }]}>
            <MaterialCommunityIcons name="percent" size={20} color="#FFC107" />
            <Text style={styles.kpiLabel}>Desconto Médio</Text>
            <Text style={[styles.kpiVal, { color: '#FFC107' }]}>{descontoMedio}%</Text>
            <Text style={styles.kpiSub}>entre activos</Text>
          </View>
          <View style={[styles.kpi, { borderLeftColor: '#EF5350' }]}>
            <MaterialCommunityIcons name="cash-minus" size={20} color="#EF5350" />
            <Text style={styles.kpiLabel}>Impacto Mensal</Text>
            <Text style={[styles.kpiVal, { color: '#EF5350' }]}>{formatAOA(impactoMensal)}</Text>
            <Text style={styles.kpiSub}>desconto total</Text>
          </View>
        </View>

        {/* Tipos breakdown */}
        {ativos.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>Distribuição por Tipo</Text>
            {TIPOS_BOLSA.map(t => {
              const count = ativos.filter(b => b.tipo === t.key).length;
              if (count === 0) return null;
              const pct = Math.round((count / ativos.length) * 100);
              return (
                <View key={t.key} style={styles.tipoRow}>
                  <Ionicons name={t.icon as never} size={16} color={t.color} style={{ width: 20 }} />
                  <Text style={styles.tipoLabel}>{t.label}</Text>
                  <View style={styles.tipoBarWrap}>
                    <View style={[styles.tipoBar, { width: `${pct}%`, backgroundColor: t.color }]} />
                  </View>
                  <Text style={[styles.tipoCount, { color: t.color }]}>{count}</Text>
                </View>
              );
            })}
          </Card>
        )}

        {/* Search + Filter */}
        <View style={styles.searchRow}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar aluno..."
            iconColor="#aaa"
          />
        </View>
        <View style={styles.filterRow}>
          {(['ativos','todos','inativos'] as const).map(k => (
            <TouchableOpacity key={k} style={[styles.filterChip, filterAtivo === k && styles.filterChipActive]} onPress={() => setFilterAtivo(k)}>
              <Text style={[styles.filterChipText, filterAtivo === k && styles.filterChipTextActive]}>
                {k === 'ativos' ? 'Activos' : k === 'todos' ? 'Todos' : 'Suspensos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* List */}
        {filtered.length === 0 ? (
          <Card style={styles.empty}>
            <MaterialCommunityIcons name="school-outline" size={48} color="#aaa" />
            <Text style={styles.emptyText}>
              {search ? 'Nenhum bolseiro encontrado' : 'Nenhuma bolsa registada'}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
                <Text style={styles.emptyBtnText}>Atribuir primeira bolsa</Text>
              </TouchableOpacity>
            )}
          </Card>
        ) : (
          <Card>
            {filtered.map((b, idx) => {
              const tipoCfg = getTipoCfg(b.tipo);
              const turma = getNomeTurma(b.turmaId);
              return (
                <View key={b.id} style={[styles.row, idx === filtered.length - 1 && { borderBottomWidth: 0 }]}>
                  {/* Left: tipo icon */}
                  <View style={[styles.rowIcon, { backgroundColor: tipoCfg.color + '22' }]}>
                    <Ionicons name={tipoCfg.icon as never} size={18} color={tipoCfg.color} />
                  </View>

                  {/* Center: info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.rowName}>{b.nome} {b.apelido}</Text>
                      <PctBadge pct={b.percentagem} />
                      {!b.ativo && (
                        <View style={[styles.badge, { backgroundColor: '#aaa28', borderColor: '#aaa' }]}>
                          <Text style={[styles.badgeText, { color: '#aaa' }]}>Suspensa</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSub}>{b.numeroMatricula}{turma ? ` · ${turma}` : ''}</Text>
                    <Text style={[styles.rowSub, { color: tipoCfg.color }]}>{tipoCfg.label}</Text>
                    {b.dataFim && (
                      <Text style={styles.rowMeta}>Válida até: {b.dataFim}</Text>
                    )}
                    {valorPropina > 0 && (
                      <Text style={styles.rowMeta}>
                        Propina: <Text style={{ color: '#EF5350', textDecorationLine: 'line-through' }}>{formatAOA(valorPropina)}</Text>
                        {' → '}
                        <Text style={{ color: '#66BB6A', fontWeight: '700' }}>
                          {formatAOA(valorPropina * (1 - b.percentagem / 100))}
                        </Text>
                      </Text>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.rowActions}>
                    <TouchableOpacity style={styles.actionIcon} onPress={() => openEdit(b)}>
                      <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionIcon} onPress={() => toggleAtivo(b)}>
                      <Ionicons name={b.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={b.ativo ? '#FFC107' : '#66BB6A'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionIcon} onPress={() => eliminar(b)}>
                      <Ionicons name="trash-outline" size={18} color="#EF5350" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      {/* ── Modal: Bolsa ──────────────────────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>{editing ? 'Editar Bolsa' : 'Nova Bolsa'}</Text>
              <Text style={styles.modalSub}>Atribuição de bolsa ou desconto de propina</Text>

              {/* Aluno */}
              {!editing && (
                <>
                  <Text style={styles.fieldLabel}>Aluno<RequiredMark /></Text>
                  <TouchableOpacity style={styles.alunoSelector} onPress={() => setShowAlunoSearch(true)}>
                    <Ionicons name="person-outline" size={18} color="#aaa" />
                    <Text style={form.alunoId ? styles.alunoSelectorText : styles.alunoSelectorPlaceholder}>
                      {form.alunoId ? form.alunoNome : 'Selecionar aluno...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#aaa" />
                  </TouchableOpacity>
                </>
              )}
              {editing && (
                <>
                  <Text style={styles.fieldLabel}>Aluno</Text>
                  <View style={[styles.alunoSelector, { opacity: 0.6 }]}>
                    <Ionicons name="person-outline" size={18} color="#aaa" />
                    <Text style={styles.alunoSelectorText}>{form.alunoNome}</Text>
                  </View>
                </>
              )}

              {/* Tipo */}
              <Text style={styles.fieldLabel}>Tipo de Bolsa</Text>
              <View style={styles.tiposGrid}>
                {TIPOS_BOLSA.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tipoChip, form.tipo === t.key && { backgroundColor: t.color + '33', borderColor: t.color }]}
                    onPress={() => setForm(f => ({ ...f, tipo: t.key }))}
                  >
                    <Ionicons name={t.icon as never} size={14} color={form.tipo === t.key ? t.color : '#aaa'} />
                    <Text style={[styles.tipoChipText, form.tipo === t.key && { color: t.color }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Percentagem */}
              <Text style={styles.fieldLabel}>Desconto (%)</Text>
              <View style={styles.pctRow}>
                {[25, 50, 75, 100].map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.pctBtn, form.percentagem === String(p) && styles.pctBtnActive]}
                    onPress={() => setForm(f => ({ ...f, percentagem: String(p) }))}
                  >
                    <Text style={[styles.pctBtnText, form.percentagem === String(p) && styles.pctBtnTextActive]}>
                      {p === 100 ? 'Isento' : `${p}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.textInput}
                value={form.percentagem}
                onChangeText={v => setForm(f => ({ ...f, percentagem: v }))}
                keyboardType="numeric"
                placeholder="Ex: 75"
                placeholderTextColor="#aaa"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              {valorPropina > 0 && Number(form.percentagem) > 0 && (
                <View style={styles.calcPreview}>
                  <Text style={styles.calcLabel}>Propina original:</Text>
                  <Text style={[styles.calcVal, { textDecorationLine: 'line-through', color: '#EF5350' }]}>{formatAOA(valorPropina)}</Text>
                  <Text style={styles.calcLabel}>Após desconto ({form.percentagem}%):</Text>
                  <Text style={[styles.calcVal, { color: '#66BB6A', fontWeight: '700' }]}>
                    {formatAOA(valorPropina * (1 - Number(form.percentagem) / 100))}
                  </Text>
                </View>
              )}

              {/* Descrição */}
              <Text style={styles.fieldLabel}>Descrição</Text>
              <TextInput
                style={styles.textInput}
                value={form.descricao}
                onChangeText={v => setForm(f => ({ ...f, descricao: v }))}
                placeholder="Ex: Aluno carenciado, bom desempenho..."
                placeholderTextColor="#aaa"
                returnKeyType="next"
                blurOnSubmit={false}
              />

              {/* Datas */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Data de Início</Text>
                  <DateInput
                    style={styles.textInput}
                    value={form.dataInicio}
                    onChangeText={v => setForm(f => ({ ...f, dataInicio: v }))}
                    placeholder="Seleccionar data"
                    label="Data de Início"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Data de Fim</Text>
                  <DateInput
                    style={styles.textInput}
                    value={form.dataFim}
                    onChangeText={v => setForm(f => ({ ...f, dataFim: v }))}
                    placeholder="Sem prazo"
                    label="Data de Fim"
                  />
                </View>
              </View>

              {/* Aprovado por */}
              <Text style={styles.fieldLabel}>Aprovado por</Text>
              <TextInput
                style={styles.textInput}
                value={form.aprovadoPor}
                onChangeText={v => setForm(f => ({ ...f, aprovadoPor: v }))}
                placeholder="Nome do responsável"
                placeholderTextColor="#aaa"
                returnKeyType="done"
                onSubmitEditing={guardar}
              />

              {/* Observação */}
              <Text style={styles.fieldLabel}>Observação</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 70, textAlignVertical: 'top' }]}
                value={form.observacao}
                onChangeText={v => setForm(f => ({ ...f, observacao: v }))}
                placeholder="Observações adicionais..."
                placeholderTextColor="#aaa"
                multiline
              />

              {/* Estado */}
              {editing && (
                <TouchableOpacity
                  style={[styles.toggleBtn, form.ativo && styles.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                >
                  <Ionicons name={form.ativo ? 'checkmark-circle' : 'close-circle'} size={18} color={form.ativo ? '#66BB6A' : '#aaa'} />
                  <Text style={[styles.toggleBtnText, form.ativo && { color: '#66BB6A' }]}>
                    {form.ativo ? 'Bolsa Activa' : 'Bolsa Suspensa'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={guardar}>
                  <Text style={styles.saveBtnText}>{editing ? 'Actualizar' : 'Atribuir Bolsa'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Pesquisa de Aluno ───────────────────────────────────────── */}
      <Modal visible={showAlunoSearch} transparent animationType="fade" onRequestClose={() => setShowAlunoSearch(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: 500 }]}>
            <Text style={styles.modalTitle}>Selecionar Aluno</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#aaa" />
              <TextInput
                style={styles.searchInput}
                placeholder="Nome ou nº de matrícula..."
                placeholderTextColor="#aaa"
                value={alunoSearch}
                onChangeText={setAlunoSearch}
                autoFocus
              />
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {alunosFiltrados.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.alunoOption}
                  onPress={() => {
                    setForm(f => ({ ...f, alunoId: a.id, alunoNome: `${a.nome} ${a.apelido}` }));
                    setShowAlunoSearch(false);
                    setAlunoSearch('');
                  }}
                >
                  <View style={styles.alunoOptionIcon}>
                    <Ionicons name="person" size={16} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.alunoOptionName}>{a.nome} {a.apelido}</Text>
                    <Text style={styles.alunoOptionMeta}>{a.numeroMatricula}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {alunosFiltrados.length === 0 && (
                <Text style={styles.emptyText}>Nenhum aluno encontrado</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAlunoSearch(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.primary },
  addBtnTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },

  // KPIs
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpi: {
    flex: 1, backgroundColor: GLASS, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3,
    padding: 12, gap: 3,
  },
  kpiLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 4 },
  kpiVal: { color: '#fff', fontSize: 18, fontWeight: '700' },
  kpiSub: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },

  // Card
  card: {
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, marginBottom: 12,
    overflow: 'hidden',
  },

  sectionTitle: { color: '#fff', fontSize: 13, fontWeight: '700', padding: 14, paddingBottom: 8 },

  // Tipo distribution
  tipoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, gap: 8 },
  tipoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, width: 130 },
  tipoBarWrap: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  tipoBar: { height: '100%', borderRadius: 3 },
  tipoCount: { width: 20, textAlign: 'right', fontSize: 12, fontWeight: '700' },

  // Search & filter
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GLASS, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  filterChipActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary },
  filterChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  rowMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 4 },
  actionIcon: { padding: 6, borderRadius: 8 },

  // Badge
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  modalBox: {
    backgroundColor: '#141428', borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    padding: 24, width: '100%', maxWidth: 480, alignSelf: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  modalSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', marginBottom: 16 },

  fieldLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },

  // Aluno selector
  alunoSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  alunoSelectorText: { flex: 1, color: '#fff', fontSize: 14 },
  alunoSelectorPlaceholder: { flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // Tipos grid
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  tipoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  tipoChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },

  // Percentagem quick picks
  pctRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pctBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center',
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  pctBtnActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary },
  pctBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  pctBtnTextActive: { color: '#fff' },

  textInput: {
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: '#fff', fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },

  // Calc preview
  calcPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, padding: 12, marginTop: 8, gap: 4,
  },
  calcLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  calcVal: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },

  // Toggle ativo
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12,
  },
  toggleBtnActive: { borderColor: '#66BB6A' },
  toggleBtnText: { color: 'rgba(255,255,255,0.55)', fontWeight: '600' },

  // Modal buttons
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },

  // Aluno search options
  alunoOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  alunoOptionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  alunoOptionName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  alunoOptionMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
});
