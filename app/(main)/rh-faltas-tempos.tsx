import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppLoader from '@/components/AppLoader';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import { showToast } from '@/utils/toast';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import { DEPARTAMENTOS, getDepartamentoByKey, DepartamentoKey } from '@/shared/departamentos';
import { BarChart, DonutChart, LineChart } from '@/components/Charts';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'faltas' | 'professores' | 'admin' | 'configuracao' | 'sumarios' | 'relatorios';

interface Funcionario {
  id: string;
  nome: string;
  apelido: string;
  departamento: string;
  cargo: string;
  especialidade: string;
  tipoContrato: string;
  ativo: boolean;
}

interface FaltaFuncionario {
  id: string;
  funcionarioId: string;
  nome?: string;
  apelido?: string;
  departamento?: string;
  cargo?: string;
  data: string;
  tipo: 'justificada' | 'injustificada' | 'meio_dia';
  motivo: string;
  descontavel: boolean;
  mes: number;
  ano: number;
  registadoPor: string;
  criadoEm: string;
}

interface TempoLectivo {
  id: string;
  funcionarioId: string;
  nome?: string;
  apelido?: string;
  departamento?: string;
  cargo?: string;
  especialidade?: string;
  mes: number;
  ano: number;
  totalUnidades: number;
  valorUnitario: number;
  totalCalculado: number;
  tipo: 'professor' | 'admin';
  departamento2?: string;
  observacoes: string;
  aprovado: boolean;
  criadoEm: string;
}

interface ConfigRH {
  valorPorFalta: number;
  valorFaltaEfectivo: number;
  valorFaltaColaborador: number;
  valorFaltaAdministrativo: number;
  valorMeioDia: number;
  taxaTempoLectivo: number;
  taxaAdminPorDia: number;
  descontoPorTempoNaoDado: number;
  semanasPorMes: number;
  observacoes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 2 })
    .format(n).replace('AOA', 'Kz');

const now = new Date();

const TIPO_FALTA_LABELS: Record<string, { label: string; color: string }> = {
  injustificada: { label: 'Injustificada', color: Colors.danger },
  justificada:   { label: 'Justificada',   color: Colors.warning },
  meio_dia:      { label: 'Meio Dia',      color: '#AB47BC' },
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function RHFaltasTemposScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const RH_FALTAS_TABS: Tab[] = ['faltas', 'professores', 'admin', 'configuracao', 'sumarios', 'relatorios'];
  const routeParamsRhFaltas = useLocalSearchParams<{ tab?: string }>();
  const initialRhFaltasTab = (RH_FALTAS_TABS.find(t => t === String(routeParamsRhFaltas?.tab || '')) || 'faltas') as Tab;
  const [tab, setTab] = useState<Tab>(initialRhFaltasTab);
  useEffect(() => {
    const t = String(routeParamsRhFaltas?.tab || '');
    if (t && (RH_FALTAS_TABS as string[]).includes(t)) setTab(t as Tab);
  }, [routeParamsRhFaltas?.tab]);
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());

  const isRH = ['rh', 'admin', 'director', 'ceo', 'pca'].includes(user?.role ?? '');

  if (!isRH) {
    return (
      <View style={styles.container}>
        <TopBar title="Faltas & Remunerações" subtitle="Acesso restrito" />
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Acesso Restrito</Text>
          <Text style={styles.emptySub}>Esta área é exclusiva para o departamento de RH.</Text>
        </View>
      </View>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'faltas',       label: 'Faltas',        icon: 'calendar-remove'   },
    { key: 'sumarios',     label: 'Sumários',      icon: 'alert-circle'      },
    { key: 'professores',  label: 'Prof. Tempos',  icon: 'school'            },
    { key: 'admin',        label: 'Pessoal Admin', icon: 'office-building'   },
    { key: 'relatorios',   label: 'Relatórios',    icon: 'file-chart'        },
    { key: 'configuracao', label: 'Configuração',  icon: 'cog'               },
  ];

  return (
    <View style={styles.container}>
      <TopBar
        title="Faltas & Remunerações"
        subtitle={`${MESES[mes - 1]} ${ano}`}
        leftAction={{ icon: 'arrow-back', onPress: () => router.back() }}
      />

      {/* Tab Bar */}
      <HScrollTabBar style={styles.tabBar} contentContainerStyle={styles.tabScroll} bgColor={Colors.surface}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <MaterialCommunityIcons name={t.icon as any} size={16} color={tab === t.key ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* Month/Year Selector */}
      {tab !== 'configuracao' && (
        <MonthSelector mes={mes} ano={ano} onChangeMes={setMes} onChangeAno={setAno} />
      )}

      {/* Content */}
      {tab === 'faltas'       && <FaltasTab mes={mes} ano={ano} user={user} />}
      {tab === 'sumarios'     && <SumariosTab mes={mes} ano={ano} user={user} />}
      {tab === 'professores'  && <TemposTab tipo="professor" mes={mes} ano={ano} user={user} />}
      {tab === 'admin'        && <TemposTab tipo="admin" mes={mes} ano={ano} user={user} />}
      {tab === 'relatorios'   && <RelatoriosTab mes={mes} ano={ano} />}
      {tab === 'configuracao' && <ConfiguracaoTab />}
    </View>
  );
}

// ── Month Selector ────────────────────────────────────────────────────────────
function MonthSelector({ mes, ano, onChangeMes, onChangeAno }: {
  mes: number; ano: number;
  onChangeMes: (m: number) => void;
  onChangeAno: (a: number) => void;
}) {
  const prev = () => {
    if (mes === 1) { onChangeMes(12); onChangeAno(ano - 1); }
    else onChangeMes(mes - 1);
  };
  const next = () => {
    if (mes === 12) { onChangeMes(1); onChangeAno(ano + 1); }
    else onChangeMes(mes + 1);
  };
  return (
    <View style={styles.monthBar}>
      <TouchableOpacity onPress={prev} style={styles.monthBtn}>
        <Ionicons name="chevron-back" size={20} color={Colors.accent} />
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{MESES[mes - 1]} {ano}</Text>
      <TouchableOpacity onPress={next} style={styles.monthBtn}>
        <Ionicons name="chevron-forward" size={20} color={Colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

// ── Faltas Tab ────────────────────────────────────────────────────────────────
function FaltasTab({ mes, ano, user }: { mes: number; ano: number; user: any }) {
  const [faltas, setFaltas] = useState<FaltaFuncionario[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [configRH, setConfigRH] = useState<ConfigRH>({ valorPorFalta: 0, valorFaltaEfectivo: 0, valorFaltaColaborador: 0, valorFaltaAdministrativo: 0, valorMeioDia: 0, taxaTempoLectivo: 0, taxaAdminPorDia: 0, observacoes: '' });
  const [showForm, setShowForm] = useState(false);
  const [deptFiltro, setDeptFiltro] = useState<string>('todos');
  const [search, setSearch] = useState('');

  // Form state
  const [formFuncionarioId, setFormFuncionarioId] = useState('');
  const [formData, setFormData] = useState('');
  const [formTipo, setFormTipo] = useState<'justificada' | 'injustificada' | 'meio_dia'>('injustificada');
  const [formMotivo, setFormMotivo] = useState('');
  const [formDescontavel, setFormDescontavel] = useState(true);
  const [saving, setSaving] = useState(false);
  const [funcSearch, setFuncSearch] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [f, funcs, cfg] = await Promise.all([
        api.get(`/api/faltas-funcionarios?mes=${mes}&ano=${ano}`),
        api.get('/api/funcionarios?ativo=true'),
        api.get('/api/configuracao-rh'),
      ]);
      setFaltas(Array.isArray(f) ? f : []);
      setFuncionarios(Array.isArray(funcs) ? funcs : []);
      setConfigRH(cfg ?? { valorPorFalta: 0, valorFaltaEfectivo: 0, valorFaltaColaborador: 0, valorFaltaAdministrativo: 0, valorMeioDia: 0, taxaTempoLectivo: 0, taxaAdminPorDia: 0, descontoPorTempoNaoDado: 0, semanasPorMes: 4, observacoes: '' });
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  async function registarFalta() {
    if (!formFuncionarioId || !formData) {
      webAlert('Campos obrigatórios', 'Seleccione o funcionário e a data.'); return;
    }
    // Parse date to get mes/ano
    const parts = formData.split('-');
    const fMes = parts.length === 3 ? parseInt(parts[1]) : mes;
    const fAno = parts.length === 3 ? parseInt(parts[0]) : ano;
    setSaving(true);
    try {
      await api.post('/api/faltas-funcionarios', {
        funcionarioId: formFuncionarioId,
        data: formData,
        tipo: formTipo,
        motivo: formMotivo,
        descontavel: formDescontavel,
        mes: fMes,
        ano: fAno,
        registadoPor: user?.nome ?? user?.username ?? '',
      });
      setShowForm(false);
      resetForm();
      showToast('Falta registada com sucesso', 'success');
      await load(true);
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Erro ao registar falta.');
    } finally { setSaving(false); }
  }

  async function eliminarFalta(id: string) {
    webAlert('Confirmar', 'Eliminar este registo de falta?', async () => {
      try {
        await api.delete(`/api/faltas-funcionarios/${id}`);
        await load(true);
      } catch { webAlert('Erro', 'Não foi possível eliminar.'); }
    }, undefined, true);
  }

  function resetForm() {
    setFormFuncionarioId(''); setFormData(''); setFormTipo('injustificada');
    setFormMotivo(''); setFormDescontavel(true); setFuncSearch('');
  }

  const faltasFiltradas = useMemo(() => faltas.filter(f => {
    if (deptFiltro !== 'todos' && f.departamento !== deptFiltro) return false;
    if (search) {
      const q = search.toLowerCase();
      const nome = `${f.nome ?? ''} ${f.apelido ?? ''}`.toLowerCase();
      if (!nome.includes(q)) return false;
    }
    return true;
  }), [faltas, deptFiltro, search]);

  // Summary
  const resumo = useMemo(() => {
    const inj = faltasFiltradas.filter(f => f.tipo === 'injustificada' && f.descontavel).length;
    const just = faltasFiltradas.filter(f => f.tipo === 'justificada').length;
    const meio = faltasFiltradas.filter(f => f.tipo === 'meio_dia' && f.descontavel).length;
    const totalDesc = inj * configRH.valorPorFalta + meio * configRH.valorMeioDia;
    return { inj, just, meio, totalDesc };
  }, [faltasFiltradas, configRH]);

  useEnterToSave(registarFalta, showForm);

  return (
    <View style={{ flex: 1 }}>
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <SummaryCard label="Injustificadas" value={resumo.inj} color={Colors.danger} icon="close-circle" />
        <SummaryCard label="Justificadas" value={resumo.just} color={Colors.warning} icon="checkmark-circle" />
        <SummaryCard label="Meio Dia" value={resumo.meio} color="#AB47BC" icon="time" />
        <SummaryCard label="Total Desconto" value={fmt(resumo.totalDesc)} color={Colors.accent} icon="cash" isText />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={styles.searchInput}
          placeholder="Pesquisar funcionário..."
          iconColor={Colors.textMuted}
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Registar</Text>
        </TouchableOpacity>
      </View>

      {/* Dept filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={styles.pillContent}>
        <DeptPill label={`Todos (${faltas.length})`} active={deptFiltro === 'todos'} onPress={() => setDeptFiltro('todos')} />
        {DEPARTAMENTOS.filter(d => d?.key && d?.nome).map(d => {
          const count = faltas.filter(f => f.departamento === d.key).length;
          if (!count) return null;
          return (
            <DeptPill
              key={d.key}
              label={`${d.nome} (${count})`}
              active={deptFiltro === d.key}
              onPress={() => setDeptFiltro(d.key)}
            />
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.centered}><AppLoader color={Colors.accent} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.accent} />}
        >
          {faltasFiltradas.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="calendar-check" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyCardText}>Sem faltas registadas para {MESES[mes - 1]} {ano}</Text>
            </View>
          ) : (
            faltasFiltradas.map(falta => (
              <FaltaCard key={falta.id} falta={falta} configRH={configRH} onDelete={() => eliminarFalta(falta.id)} />
            ))
          )}
        </ScrollView>
      )}

      {/* Register Modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Registar Falta</Text>

            <Text style={styles.fieldLabel}>Funcionário<RequiredMark /></Text>
            <TextInput
              style={[styles.input, { marginBottom: 6 }]}
              placeholder="Pesquisar funcionário..."
              placeholderTextColor={Colors.textMuted}
              value={funcSearch}
              onChangeText={setFuncSearch}
            />
            <ScrollView style={{ maxHeight: 120, borderWidth: 1, borderColor: Colors.surface, borderRadius: 8, marginBottom: 10 }}>
              {funcionarios
                .filter(f => {
                  const q = funcSearch.toLowerCase();
                  return !q || `${f.nome} ${f.apelido} ${f.cargo ?? ''}`.toLowerCase().includes(q);
                })
                .map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.funcOption, formFuncionarioId === f.id && styles.funcOptionActive]}
                  onPress={() => setFormFuncionarioId(f.id)}
                >
                  <Text style={[styles.funcOptionText, formFuncionarioId === f.id && { color: Colors.accent }]}>
                    {f.nome} {f.apelido} — {f.cargo}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Data<RequiredMark /></Text>
            <DateInput
              style={styles.input}
              value={formData}
              onChangeText={setFormData}
            />

            <Text style={styles.fieldLabel}>Tipo de Falta</Text>
            <View style={styles.tipoRow}>
              {(['injustificada','justificada','meio_dia'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipoPill, formTipo === t && { backgroundColor: TIPO_FALTA_LABELS[t].color }]}
                  onPress={() => setFormTipo(t)}
                >
                  <Text style={[styles.tipoPillText, formTipo === t && { color: '#fff', fontWeight: '700' }]}>
                    {TIPO_FALTA_LABELS[t].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Motivo / Observação</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
              placeholder="Descreva o motivo..."
              placeholderTextColor={Colors.textMuted}
              value={formMotivo}
              onChangeText={setFormMotivo}
              multiline
            />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Descontar no salário</Text>
              <Switch
                value={formDescontavel}
                onValueChange={setFormDescontavel}
                trackColor={{ false: Colors.surface, true: Colors.accent + '88' }}
                thumbColor={formDescontavel ? Colors.accent : Colors.textMuted}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowForm(false); resetForm(); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={registarFalta} disabled={saving}>
                {saving ? <AppLoader color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Registar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ── Falta Card ─────────────────────────────────────────────────────────────────
function FaltaCard({ falta, configRH, onDelete }: { falta: FaltaFuncionario; configRH: ConfigRH; onDelete: () => void }) {
  const ti = TIPO_FALTA_LABELS[falta.tipo] ?? { label: falta.tipo, color: Colors.textMuted };
  const desconto = falta.descontavel
    ? falta.tipo === 'injustificada' ? configRH.valorPorFalta
    : falta.tipo === 'meio_dia' ? configRH.valorMeioDia
    : 0
    : 0;
  return (
    <View style={styles.faltaCard}>
      <View style={styles.faltaCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.faltaNome}>{falta.nome} {falta.apelido}</Text>
          <Text style={styles.faltaCargo}>{falta.cargo} • {getDeptLabel(falta.departamento ?? '')}</Text>
        </View>
        <View style={[styles.tipoBadge, { backgroundColor: ti.color + '22', borderColor: ti.color }]}>
          <Text style={[styles.tipoBadgeText, { color: ti.color }]}>{ti.label}</Text>
        </View>
      </View>
      <View style={styles.faltaCardBody}>
        <View style={styles.faltaInfo}>
          <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.faltaInfoText}>{formatDate(falta.data)}</Text>
        </View>
        {falta.motivo ? (
          <View style={styles.faltaInfo}>
            <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.faltaInfoText}>{falta.motivo}</Text>
          </View>
        ) : null}
        <View style={styles.faltaFooter}>
          <View style={styles.faltaInfo}>
            <Ionicons name={falta.descontavel ? 'cash-outline' : 'close-circle-outline'} size={14}
              color={falta.descontavel ? Colors.danger : Colors.success} />
            <Text style={[styles.faltaInfoText, { color: falta.descontavel ? Colors.danger : Colors.success }]}>
              {falta.descontavel ? `Desconto: ${fmt(desconto)}` : 'Sem desconto'}
            </Text>
          </View>
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Tempos Lectivos / Dias Admin Tab ──────────────────────────────────────────
function TemposTab({ tipo, mes, ano, user }: { tipo: 'professor' | 'admin'; mes: number; ano: number; user: any }) {
  const [tempos, setTempos] = useState<TempoLectivo[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [configRH, setConfigRH] = useState<ConfigRH>({ valorPorFalta: 0, valorFaltaEfectivo: 0, valorFaltaColaborador: 0, valorFaltaAdministrativo: 0, valorMeioDia: 0, taxaTempoLectivo: 0, taxaAdminPorDia: 0, observacoes: '' });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Form
  const [formFuncId, setFormFuncId] = useState('');
  const [formUnidades, setFormUnidades] = useState('');
  const [formValorUnit, setFormValorUnit] = useState('');
  const [formObs, setFormObs] = useState('');
  const [formAprovado, setFormAprovado] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultRate = tipo === 'professor' ? configRH.taxaTempoLectivo : configRH.taxaAdminPorDia;

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [t, funcs, cfg] = await Promise.all([
        api.get(`/api/tempos-lectivos?mes=${mes}&ano=${ano}&tipo=${tipo}`),
        tipo === 'professor'
          ? api.get('/api/professores?ativo=true')
          : api.get('/api/funcionarios?ativo=true'),
        api.get('/api/configuracao-rh'),
      ]);
      setTempos(Array.isArray(t) ? t : []);
      const rawFuncs = Array.isArray(funcs) ? funcs : [];
      const filtrados: Funcionario[] = tipo === 'professor'
        ? rawFuncs
            .filter((p: any) => p.ativo !== false)
            .map((p: any) => ({
              id: p.id,
              nome: p.nome ?? '',
              apelido: p.apelido ?? '',
              departamento: 'pedagogico',
              cargo: p.cargo ?? 'Professor',
              especialidade: p.especialidade ?? '',
              tipoContrato: p.tipoContrato ?? 'contratado',
              ativo: true,
            }))
        : rawFuncs.filter((f: Funcionario) => f.departamento !== 'pedagogico');
      setFuncionarios(filtrados);
      if (cfg) setConfigRH(cfg);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [mes, ano, tipo]);

  useEffect(() => { load(); }, [load]);

  const funcComTempos = useMemo(() => {
    const temposMap = new Map(tempos.map(t => [t.funcionarioId, t]));
    return funcionarios.filter(f => {
      if (!search) return true;
      return `${f.nome} ${f.apelido}`.toLowerCase().includes(search.toLowerCase());
    }).map(f => ({ func: f, tempo: temposMap.get(f.id) ?? null }));
  }, [funcionarios, tempos, search]);

  const totalPagar = useMemo(() => tempos.reduce((s, t) => s + (t.totalCalculado ?? 0), 0), [tempos]);
  const totalUnidades = useMemo(() => tempos.reduce((s, t) => s + (t.totalUnidades ?? 0), 0), [tempos]);

  function openForm(func: Funcionario, tempo: TempoLectivo | null) {
    setFormFuncId(func.id);
    if (tempo) {
      setEditingId(tempo.id);
      setFormUnidades(String(tempo.totalUnidades));
      setFormValorUnit(String(tempo.valorUnitario));
      setFormObs(tempo.observacoes);
      setFormAprovado(tempo.aprovado);
    } else {
      setEditingId(null);
      setFormUnidades('');
      const rate = tipo === 'professor' ? configRH.taxaTempoLectivo : configRH.taxaAdminPorDia;
      setFormValorUnit(String(rate));
      setFormObs('');
      setFormAprovado(false);
    }
    setShowForm(true);
  }

  async function salvarTempo() {
    if (!formFuncId || !formUnidades) { webAlert('Campos obrigatórios', 'Seleccione o funcionário e introduza as unidades.'); return; }
    const unidades = parseInt(formUnidades) || 0;
    const valorUnit = parseFloat(formValorUnit) || 0;
    setSaving(true);
    try {
      const payload = {
        funcionarioId: formFuncId,
        mes, ano, totalUnidades: unidades, valorUnitario: valorUnit,
        tipo, departamento: '', observacoes: formObs, aprovado: formAprovado,
      };
      if (editingId) {
        await api.put(`/api/tempos-lectivos/${editingId}`, payload);
      } else {
        await api.post('/api/tempos-lectivos', payload);
      }
      setShowForm(false);
      await load(true);
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Erro ao guardar.');
    } finally { setSaving(false); }
  }

  async function eliminar(id: string) {
    webAlert('Confirmar', 'Eliminar este registo?', async () => {
      try { await api.delete(`/api/tempos-lectivos/${id}`); await load(true); }
      catch { webAlert('Erro', 'Não foi possível eliminar.'); }
    }, undefined, true);
  }

  const unidadeLabel = tipo === 'professor' ? 'Tempos Lectivos' : 'Dias Trabalhados';
  const taxaLabel    = tipo === 'professor' ? 'por Tempo Lectivo' : 'por Dia Trabalhado';

  useEnterToSave(salvarTempo, showForm);

  return (
    <View style={{ flex: 1 }}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        <SummaryCard label={tipo === 'professor' ? 'Professores' : 'Funcionários'} value={funcionarios.length} color={Colors.accent} icon="people" />
        <SummaryCard label={`Total ${unidadeLabel}`} value={totalUnidades} color="#66BB6A" icon="time" />
        <SummaryCard label="Total a Pagar" value={fmt(totalPagar)} color={Colors.warning} icon="cash" isText />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={[styles.searchInput, { flex: 1 }]}
          placeholder={`Pesquisar ${tipo === 'professor' ? 'professor' : 'funcionário'}...`}
          iconColor={Colors.textMuted}
        />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <View style={styles.infoBannerIcon}>
          <Ionicons name="flash" size={14} color={Colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoBannerLabel}>Taxa em vigor</Text>
          <Text style={styles.infoBannerText}>
            {fmt(tipo === 'professor' ? configRH.taxaTempoLectivo : configRH.taxaAdminPorDia)} {taxaLabel}
          </Text>
        </View>
        <View style={styles.infoBannerChip}>
          <Text style={styles.infoBannerChipText}>Configuração</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}><AppLoader color={Colors.accent} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.accent} />}
        >
          {funcComTempos.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="account-off" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyCardText}>
                {tipo === 'professor'
                  ? 'Sem professores contratados registados'
                  : 'Sem pessoal administrativo registado'}
              </Text>
              <Text style={styles.emptyCardSub}>
                Registe primeiro os funcionários na Gestão de Pessoal
              </Text>
            </View>
          ) : (
            funcComTempos.map(({ func, tempo }) => (
              <TempoCard
                key={func.id}
                func={func}
                tempo={tempo}
                tipo={tipo}
                configRH={configRH}
                onEdit={() => openForm(func, tempo)}
                onDelete={tempo ? () => eliminar(tempo.id) : undefined}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Form Modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editingId ? 'Editar' : 'Registar'} {tipo === 'professor' ? 'Tempos Lectivos' : 'Dias Trabalhados'}
            </Text>

            <Text style={styles.fieldLabel}>{tipo === 'professor' ? 'Número de Tempos Lectivos' : 'Dias Trabalhados'} *</Text>
            <TextInput
              style={styles.input}
              placeholder={tipo === 'professor' ? 'Ex: 40' : 'Ex: 22'}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={formUnidades}
              onChangeText={setFormUnidades}
              returnKeyType="next"
              onSubmitEditing={() => { }}
            />

            <Text style={styles.fieldLabel}>Valor Unitário (Kz)<RequiredMark /></Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 2500"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              value={formValorUnit}
              onChangeText={setFormValorUnit}
              returnKeyType="done"
              onSubmitEditing={salvarTempo}
            />

            {/* Preview */}
            {formUnidades && formValorUnit ? (
              <View style={styles.calcPreview}>
                <Text style={styles.calcPreviewLabel}>Total calculado:</Text>
                <Text style={styles.calcPreviewValue}>
                  {fmt((parseInt(formUnidades) || 0) * (parseFloat(formValorUnit) || 0))}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Observações</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
              placeholder="Observações opcionais..."
              placeholderTextColor={Colors.textMuted}
              value={formObs}
              onChangeText={setFormObs}
              multiline
            />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Aprovado</Text>
              <Switch
                value={formAprovado}
                onValueChange={setFormAprovado}
                trackColor={{ false: Colors.surface, true: Colors.success + '88' }}
                thumbColor={formAprovado ? Colors.success : Colors.textMuted}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={salvarTempo} disabled={saving}>
                {saving ? <AppLoader color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ── Tempo Card ─────────────────────────────────────────────────────────────────
function TempoCard({ func, tempo, tipo, configRH, onEdit, onDelete }: {
  func: Funcionario;
  tempo: TempoLectivo | null;
  tipo: 'professor' | 'admin';
  configRH: ConfigRH;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const unidadeLabel = tipo === 'professor' ? 'Tempos' : 'Dias';
  const unidadeIcon  = tipo === 'professor' ? 'school-outline' : 'briefcase-outline';
  const accentColor  = tipo === 'professor' ? Colors.accent : '#a78bfa';
  const initials     = `${func.nome[0] ?? ''}${func.apelido[0] ?? ''}`.toUpperCase();

  return (
    <View style={[styles.tempoCard, { borderLeftColor: accentColor, borderLeftWidth: 3 }]}>
      {/* Top row: avatar + name + status badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: tempo ? 12 : 0 }}>
        <View style={[styles.avatarCircle, { backgroundColor: accentColor + '22', borderWidth: 1.5, borderColor: accentColor + '55' }]}>
          <Text style={[styles.avatarText, { color: accentColor }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tempoNome}>{func.nome} {func.apelido}</Text>
          <Text style={styles.tempoCargo}>{func.cargo}{func.especialidade ? ` · ${func.especialidade}` : ''}</Text>
        </View>
        {tempo?.aprovado && (
          <View style={[styles.aprovadoBadge, { backgroundColor: Colors.success + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }]}>
            <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
            <Text style={[styles.aprovadoText, { fontSize: 11 }]}>Aprovado</Text>
          </View>
        )}
      </View>

      {tempo ? (
        <>
          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={[styles.tempoStatPill, { backgroundColor: accentColor + '15', borderColor: accentColor + '33' }]}>
              <Ionicons name={unidadeIcon as any} size={13} color={accentColor} />
              <Text style={[styles.tempoStatPillNum, { color: accentColor }]}>{tempo.totalUnidades}</Text>
              <Text style={styles.tempoStatPillLabel}>{unidadeLabel}</Text>
            </View>
            <View style={[styles.tempoStatPill, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '33', flex: 1 }]}>
              <Ionicons name="cash-outline" size={13} color={Colors.warning} />
              <Text style={[styles.tempoStatPillNum, { color: Colors.warning }]}>{fmt(tempo.totalCalculado)}</Text>
              <Text style={styles.tempoStatPillLabel}>Total a pagar</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={onEdit}
              style={[styles.tempoActionBtn, { backgroundColor: accentColor + '18', borderColor: accentColor + '44' }]}
            >
              <Ionicons name="create-outline" size={15} color={accentColor} />
              <Text style={[styles.tempoActionBtnText, { color: accentColor }]}>Editar</Text>
            </TouchableOpacity>
            {onDelete && (
              <TouchableOpacity
                onPress={onDelete}
                style={[styles.tempoActionBtn, { backgroundColor: Colors.danger + '12', borderColor: Colors.danger + '33' }]}
              >
                <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                <Text style={[styles.tempoActionBtnText, { color: Colors.danger }]}>Remover</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={[styles.addTempoBtn, { backgroundColor: accentColor + '12', borderColor: accentColor + '44', borderRadius: 10, paddingVertical: 10, justifyContent: 'center' }]}
          onPress={onEdit}
        >
          <Ionicons name="add-circle-outline" size={18} color={accentColor} />
          <Text style={[styles.addTempoBtnText, { color: accentColor }]}>Registar {tipo === 'professor' ? 'tempos' : 'dias'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Configuração Tab ───────────────────────────────────────────────────────────
function ConfiguracaoTab() {
  const [config, setConfig] = useState<ConfigRH>({ valorPorFalta: 0, valorFaltaEfectivo: 0, valorFaltaColaborador: 0, valorFaltaAdministrativo: 0, valorMeioDia: 0, taxaTempoLectivo: 0, taxaAdminPorDia: 0, descontoPorTempoNaoDado: 0, semanasPorMes: 4, observacoes: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get('/api/configuracao-rh').then(d => {
      if (d) setConfig(d);
    }).finally(() => setLoading(false));
  }, []);

  async function guardar() {
    setSaving(true);
    try {
      const saved = await api.put('/api/configuracao-rh', config);
      if (saved) setConfig(saved);
      showToast('Configuração de RH guardada com sucesso', 'success');
    } catch { showToast('Não foi possível guardar a configuração — verifique a ligação', 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return <View style={styles.centered}><AppLoader color={Colors.accent} /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <MaterialCommunityIcons name="calendar-remove" size={20} color={Colors.danger} />
          <Text style={styles.configSectionTitle}>Descontos por Falta</Text>
        </View>
        <Text style={styles.configSectionDesc}>
          Valores a descontar no salário quando o funcionário regista faltas descontáveis.
        </Text>

        <ConfigField
          label="Desconto por Falta — Professor Efectivo (Kz)"
          value={String(config.valorFaltaEfectivo)}
          onChangeText={v => setConfig(p => ({ ...p, valorFaltaEfectivo: parseFloat(v) || 0 }))}
          placeholder="Ex: 3500"
          icon="close-circle"
          iconColor={Colors.danger}
        />
        <ConfigField
          label="Desconto por Falta — Colaborador / Contratado (Kz)"
          value={String(config.valorFaltaColaborador)}
          onChangeText={v => setConfig(p => ({ ...p, valorFaltaColaborador: parseFloat(v) || 0 }))}
          placeholder="Ex: 2500"
          icon="close-circle"
          iconColor="#FF9F0A"
        />
        <ConfigField
          label="Desconto por Falta — Pessoal Administrativo (Kz)"
          value={String(config.valorFaltaAdministrativo)}
          onChangeText={v => setConfig(p => ({ ...p, valorFaltaAdministrativo: parseFloat(v) || 0 }))}
          placeholder="Ex: 3000"
          icon="close-circle"
          iconColor="#AB47BC"
        />
        <ConfigField
          label="Desconto por Meio Dia (Kz)"
          value={String(config.valorMeioDia)}
          onChangeText={v => setConfig(p => ({ ...p, valorMeioDia: parseFloat(v) || 0 }))}
          placeholder="Ex: 1750"
          icon="time"
          iconColor="#AB47BC"
        />
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <MaterialCommunityIcons name="school" size={20} color={Colors.accent} />
          <Text style={styles.configSectionTitle}>Professores Efectivos — Desconto por Tempo Não Dado</Text>
        </View>
        <Text style={styles.configSectionDesc}>
          Para professores em regime efectivo: o salário base é fixo, mas é descontado um valor por cada tempo lectivo que não foi dado no mês. Defina o número de semanas por mês para o cálculo (normalmente 4).
        </Text>
        <ConfigField
          label="Desconto por Tempo Lectivo Não Dado (Kz)"
          value={String(config.descontoPorTempoNaoDado)}
          onChangeText={v => setConfig(p => ({ ...p, descontoPorTempoNaoDado: parseFloat(v) || 0 }))}
          placeholder="Ex: 1500"
          icon="remove-circle"
          iconColor={Colors.danger}
        />
        <ConfigField
          label="Semanas por Mês (para cálculo de tempos esperados)"
          value={String(config.semanasPorMes)}
          onChangeText={v => setConfig(p => ({ ...p, semanasPorMes: parseInt(v) || 4 }))}
          placeholder="Ex: 4"
          icon="calendar"
          iconColor={Colors.accent}
        />
        <View style={styles.previewBox}>
          <Text style={styles.previewBoxLabel}>Exemplo (professor com 5 tempos/semana, 2 não dados):</Text>
          <Text style={styles.previewBoxCalc}>
            5 × {config.semanasPorMes} = {5 * (config.semanasPorMes || 4)} esperados — 2 não dados → desconto: {fmt(2 * config.descontoPorTempoNaoDado)}
          </Text>
        </View>
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <MaterialCommunityIcons name="account-clock" size={20} color={Colors.success} />
          <Text style={styles.configSectionTitle}>Colaboradores — Salário por Tempos Lectivos</Text>
        </View>
        <Text style={styles.configSectionDesc}>
          Para colaboradores/contratados sem salário base fixo: o salário mensal é calculado automaticamente com base no valor por tempo lectivo e no número de tempos semanais definidos no perfil de cada funcionário. Fórmula: Valor × Tempos/Semana × Semanas/Mês.
        </Text>
        <ConfigField
          label="Valor Global por Tempo Lectivo (Kz) — usado como referência"
          value={String(config.taxaTempoLectivo)}
          onChangeText={v => setConfig(p => ({ ...p, taxaTempoLectivo: parseFloat(v) || 0 }))}
          placeholder="Ex: 2500"
          icon="cash"
          iconColor={Colors.success}
        />
        <View style={styles.previewBox}>
          <Text style={styles.previewBoxLabel}>Exemplo (colaborador com 8 tempos/semana a 2500 Kz):</Text>
          <Text style={styles.previewBoxCalc}>
            8 tempos × {config.semanasPorMes || 4} sem. × {fmt(config.taxaTempoLectivo)} = {fmt(8 * (config.semanasPorMes || 4) * config.taxaTempoLectivo)}
          </Text>
        </View>
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <MaterialCommunityIcons name="office-building" size={20} color={Colors.warning} />
          <Text style={styles.configSectionTitle}>Pessoal Administrativo</Text>
        </View>
        <Text style={styles.configSectionDesc}>
          Taxa diária para pessoal administrativo que trabalha a nível de departamento e secção.
          O pagamento mensal calcula-se por: Dias Trabalhados × Taxa Diária.
        </Text>
        <ConfigField
          label="Valor por Dia Trabalhado (Kz)"
          value={String(config.taxaAdminPorDia)}
          onChangeText={v => setConfig(p => ({ ...p, taxaAdminPorDia: parseFloat(v) || 0 }))}
          placeholder="Ex: 4000"
          icon="calendar"
          iconColor={Colors.warning}
        />
        <View style={styles.previewBox}>
          <Text style={styles.previewBoxLabel}>Exemplo de cálculo (22 dias úteis):</Text>
          <Text style={styles.previewBoxCalc}>
            22 dias × {fmt(config.taxaAdminPorDia)} = {fmt(22 * config.taxaAdminPorDia)}
          </Text>
        </View>
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <Ionicons name="document-text" size={20} color={Colors.textMuted} />
          <Text style={styles.configSectionTitle}>Observações</Text>
        </View>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          placeholder="Notas internas sobre a configuração de pagamentos..."
          placeholderTextColor={Colors.textMuted}
          value={config.observacoes}
          onChangeText={v => setConfig(p => ({ ...p, observacoes: v }))}
          multiline
        />
      </View>

      <TouchableOpacity style={styles.guardarBtn} onPress={guardar} disabled={saving}>
        {saving
          ? <AppLoader color="#fff" size="small" />
          : <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.guardarBtnText}>Guardar Configuração</Text>
            </>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Shared Sub-components ─────────────────────────────────────────────────────
function SummaryCard({ label, value, color, icon, isText }: {
  label: string; value: string | number; color: string; icon: string; isText?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, { borderTopColor: color }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[styles.summaryValue, { color, fontSize: isText ? 11 : 22 }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function DeptPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.deptPill, active && styles.deptPillActive]}
      onPress={onPress}
    >
      <Text style={[styles.deptPillText, active && styles.deptPillTextActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConfigField({ label, value, onChangeText, placeholder, icon, iconColor }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; icon: string; iconColor: string;
}) {
  return (
    <View style={styles.configField}>
      <Text style={styles.configFieldLabel}>{label}</Text>
      <View style={styles.configInputRow}>
        <View style={[styles.configIconBox, { backgroundColor: iconColor + '22' }]}>
          <Ionicons name={icon as any} size={18} color={iconColor} />
        </View>
        <TextInput
          style={styles.configInput}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChangeText}
        />
      </View>
    </View>
  );
}

// ── SumariosTab ───────────────────────────────────────────────────────────────
function SumariosTab({ mes, ano, user }: { mes: number; ano: number; user: any }) {
  const [data, setData] = React.useState<{ rejeitados: any[]; semSumario: any[] } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [registering, setRegistering] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setData(null);
    api.get(`/api/sumarios/pendentes-rh?mes=${mes}&ano=${ano}`)
      .then(r => setData(r))
      .catch(() => setData({ rejeitados: [], semSumario: [] }))
      .finally(() => setLoading(false));
  }, [mes, ano]);

  async function registrarFalta(funcionarioId: string | undefined | null, professorId: string, nome: string) {
    if (!funcionarioId) {
      console.warn('[SumariosTab] professor sem funcionário associado:', professorId);
      return;
    }
    const key = professorId;
    setRegistering(key);
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.post('/api/faltas-funcionarios', {
        funcionarioId,
        data: today,
        tipo: 'injustificada',
        descontavel: true,
        mes,
        ano,
        motivo: `Falta automática – sumário não confirmado (${MESES_LABELS[mes - 1]}/${ano})`,
        registadoPor: user?.nome || user?.name || 'RH',
      });
      webAlert(`Falta registada para ${nome}`);
      setData(d => d ? { ...d, semSumario: d.semSumario.filter(s => s.professorId !== professorId) } : d);
    } catch {
      webAlert('Erro ao registar falta');
    } finally {
      setRegistering(null);
    }
  }

  const total = (data?.rejeitados.length ?? 0) + (data?.semSumario.length ?? 0);

  if (loading) return (
    <View style={[styles.centered]}>
      <AppLoader color={Colors.accent} size="large" />
      <Text style={[styles.emptySub, { marginTop: 12 }]}>A carregar sumários...</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* KPI */}
      <View style={{ backgroundColor: total > 0 ? '#7f1d1d22' : Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: total > 0 ? '#ef4444' : Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: total > 0 ? '#ef444422' : Colors.surfaceLight + '44', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="alert-circle" size={24} color={total > 0 ? '#ef4444' : Colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text ?? '#fff', fontSize: 22, fontWeight: '800' }}>{total}</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {total === 0 ? 'Nenhuma ocorrência' : `ocorrência${total > 1 ? 's' : ''} encontrada${total > 1 ? 's' : ''}`} em {MESES_LABELS[mes - 1]}/{ano}
          </Text>
        </View>
      </View>

      {/* Rejeitados */}
      {(data?.rejeitados.length ?? 0) > 0 && (
        <View style={{ backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ backgroundColor: '#7f1d1d', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={16} color="#fca5a5" />
            <Text style={{ color: '#fca5a5', fontSize: 13, fontWeight: '700' }}>Sumários Rejeitados ({data!.rejeitados.length})</Text>
          </View>
          {data!.rejeitados.map((s, i) => (
            <View key={s.id} style={{ padding: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text ?? '#fff', fontSize: 13, fontWeight: '700' }}>{s.professorNome}</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>{s.disciplina} · {s.turmaNome} · {formatDate(s.data)}</Text>
                  {s.observacaoRH ? <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>Motivo: {s.observacaoRH}</Text> : null}
                </View>
                <View style={{ backgroundColor: '#7f1d1d', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: '#fca5a5', fontSize: 9, fontWeight: '700' }}>REJEITADO</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                onPress={() => registrarFalta(s.funcionarioId, s.professorId, s.professorNome)}
                disabled={registering === s.professorId}
              >
                <MaterialCommunityIcons name="calendar-remove" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                  {registering === s.professorId ? 'A registar...' : 'Registar Falta'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Sem sumário */}
      {(data?.semSumario.length ?? 0) > 0 && (
        <View style={{ backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ backgroundColor: '#78350f', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="file-remove" size={16} color="#fcd34d" />
            <Text style={{ color: '#fcd34d', fontSize: 13, fontWeight: '700' }}>Sem Sumário Aceite ({data!.semSumario.length})</Text>
          </View>
          {data!.semSumario.map((s, i) => (
            <View key={s.professorId} style={{ padding: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#78350f44', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fcd34d', fontSize: 14, fontWeight: '800' }}>{(s.professorNome ?? '?').charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text ?? '#fff', fontSize: 13, fontWeight: '700' }}>{s.professorNome}</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {s.departamento ? getDeptLabel(s.departamento) : 'Professor'}{s.cargo ? ` · ${s.cargo}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => registrarFalta(s.funcionarioId, s.professorId, s.professorNome)}
                disabled={registering === s.professorId}
              >
                <MaterialCommunityIcons name="calendar-remove" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  {registering === s.professorId ? '...' : 'Falta'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {total === 0 && !loading && (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="check-circle" size={48} color={Colors.success} />
          <Text style={styles.emptyText}>Tudo em ordem!</Text>
          <Text style={styles.emptySub}>Todos os professores têm sumários aceites em {MESES_LABELS[mes - 1]}/{ano}.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const MESES_LABELS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── RelatoriosTab ──────────────────────────────────────────────────────────────
function RelatoriosTab({ mes, ano }: { mes: number; ano: number }) {
  const [loadingFaltas, setLoadingFaltas] = React.useState(false);
  const [loadingPayroll, setLoadingPayroll] = React.useState(false);
  const [chartFaltas, setChartFaltas] = React.useState<any[]>([]);
  const [chartLoading, setChartLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setChartLoading(true);
    api.get(`/api/faltas-funcionarios?ano=${ano}`)
      .then((data: any) => {
        if (active) setChartFaltas(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => { if (active) setChartLoading(false); });
    return () => { active = false; };
  }, [ano]);

  const faltasPorTipo = React.useMemo(() => {
    const inj = chartFaltas.filter(f => f.tipo === 'injustificada').length;
    const just = chartFaltas.filter(f => f.tipo === 'justificada').length;
    const meio = chartFaltas.filter(f => f.tipo === 'meio_dia').length;
    return [
      { label: 'Injustificada', value: inj, color: '#EF5350' },
      { label: 'Justificada', value: just, color: '#FFA726' },
      { label: 'Meio-Dia', value: meio, color: '#AB47BC' },
    ].filter(d => d.value > 0);
  }, [chartFaltas]);

  const faltasPorMes = React.useMemo(() => {
    const mesesAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const counts: Record<string, number> = {};
    chartFaltas.forEach(f => {
      const m = f.data ? parseInt(f.data.split('-')[1], 10) : null;
      if (m) counts[m] = (counts[m] || 0) + 1;
    });
    const result = [];
    for (let i = Math.max(1, mes - 5); i <= mes; i++) {
      result.push({ label: mesesAbrev[i - 1], value: counts[i] || 0 });
    }
    return result;
  }, [chartFaltas, mes]);

  const faltasPorDept = React.useMemo(() => {
    const counts: Record<string, number> = {};
    chartFaltas.forEach(f => {
      const dept = f.departamento || 'outro';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    const colors = ['#4FC3F7','#66BB6A','#FFA726','#EF5350','#AB47BC','#26C6DA'];
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, val], i) => ({
        label: getDeptLabel(key).slice(0, 6),
        value: val,
        color: colors[i % colors.length],
      }));
  }, [chartFaltas]);

  const totalAno = chartFaltas.filter(f => f.data && f.data.startsWith(String(ano))).length;

  const fmtKz = (v: number) => v.toLocaleString('pt-PT', { minimumFractionDigits: 2 }) + ' Kz';

  const CSS_COMUM = `
    body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:11px}
    h1{font-size:17px;margin-bottom:4px;color:#1a1a2e}
    .subtitle{font-size:12px;color:#555;margin-bottom:4px;font-weight:normal}
    .totalbox{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 14px;margin-bottom:14px;display:inline-block}
    .totalbox span{font-size:13px;color:#065f46;font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{background:#1a1a2e;color:#fff;padding:7px 9px;text-align:left;font-size:10px}
    th.r{text-align:right}
    td{padding:6px 9px;border-bottom:1px solid #e5e7eb;font-size:10.5px}
    td.r{text-align:right}
    tr:nth-child(even){background:#f9fafb}
    .red{color:#dc2626;font-weight:600}
    .green{color:#065f46;font-weight:700}
    .badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700}
    .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px dashed #e5e7eb;padding-top:8px}
    @media print{body{padding:16px}}
  `;

  async function gerarRelatorioFaltas(tipo: 'mensal' | 'anual') {
    setLoadingFaltas(true);
    try {
      const params = tipo === 'mensal' ? `mes=${mes}&ano=${ano}` : `ano=${ano}`;
      const data = await api.get(`/api/faltas-funcionarios?${params}`);
      const faltas: any[] = Array.isArray(data) ? data : [];

      const titulo = tipo === 'mensal'
        ? `Relatório de Faltas — ${MESES_LABELS[mes - 1]}/${ano}`
        : `Relatório de Faltas — Ano ${ano}`;

      const inj = faltas.filter(f => f.tipo === 'injustificada').length;
      const just = faltas.filter(f => f.tipo === 'justificada').length;
      const meio = faltas.filter(f => f.tipo === 'meio_dia').length;

      const tipoLabel = (t: string) =>
        t === 'injustificada' ? '<span class="badge" style="background:#fee2e2;color:#dc2626">Injustificada</span>'
        : t === 'justificada' ? '<span class="badge" style="background:#fef9c3;color:#854d0e">Justificada</span>'
        : '<span class="badge" style="background:#f3e8ff;color:#7e22ce">Meio-Dia</span>';

      const rows = faltas.map(f => `
        <tr>
          <td>${`${f.nome ?? ''} ${f.apelido ?? ''}`.trim() || (f.funcionarioNome ?? '—')}</td>
          <td>${f.cargo ?? '—'}</td>
          <td>${getDeptLabel(f.departamento ?? '')}</td>
          <td>${formatDate(f.data)}</td>
          <td>${tipoLabel(f.tipo)}</td>
          <td style="text-align:center">${f.descontavel ? '✓' : '—'}</td>
          <td>${f.motivo ?? '—'}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>${titulo}</title>
      <style>${CSS_COMUM}</style></head><body>
      <div style="text-align:center;margin-bottom:10px;"><img src="/angola-brasao.png" style="width:55px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia" onerror="this.style.display='none'" /><p style="font-size:8pt;margin:0;line-height:1.5;">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO · ENSINO GERAL</p></div>
      <h1>${titulo}</h1>
      <p class="subtitle">Total: ${faltas.length} falta${faltas.length !== 1 ? 's' : ''} · Injustificadas: ${inj} · Justificadas: ${just} · Meio-dia: ${meio}</p>
      <table>
        <thead><tr>
          <th>Funcionário</th><th>Cargo</th><th>Departamento</th><th>Data</th><th>Tipo</th><th>Descontável</th><th>Motivo</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px">Sem registos</td></tr>'}</tbody>
      </table>
      <p class="footer">Gerado em ${new Date().toLocaleString('pt-PT')} · QUETA v3 · Recursos Humanos</p>
      </body></html>`;

      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    } catch { webAlert('Erro ao gerar relatório de faltas'); }
    finally { setLoadingFaltas(false); }
  }

  async function gerarRelatorioPayroll(tipo: 'mensal' | 'anual') {
    setLoadingPayroll(true);
    try {
      const folhasData = await api.get('/api/folhas-salarios');
      let folhas: any[] = Array.isArray(folhasData) ? folhasData : [];
      if (tipo === 'mensal') {
        folhas = folhas.filter((f: any) => f.mes == mes && f.ano == ano);
      } else {
        folhas = folhas.filter((f: any) => f.ano == ano);
      }

      const titulo = tipo === 'mensal'
        ? `Relatório de Pagamentos — ${MESES_LABELS[mes - 1]}/${ano}`
        : `Relatório de Pagamentos — Ano ${ano}`;

      // Fetch per-employee items for all matching folhas
      const allItems: any[] = [];
      await Promise.all(folhas.map(async (f: any) => {
        try {
          const items = await api.get(`/api/folhas-salarios/${f.id}/itens`);
          if (Array.isArray(items)) {
            items.forEach((item: any) => {
              allItems.push({ ...item, mesFolha: f.mes, anoFolha: f.ano, statusFolha: f.status });
            });
          }
        } catch { /* skip failed */ }
      }));

      const totalBruto = allItems.reduce((s: number, i: any) => s + Number(i.salarioBruto ?? 0), 0);
      const totalDescontos = allItems.reduce((s: number, i: any) => s + Number(i.totalDescontos ?? 0), 0);
      const totalLiquido = allItems.reduce((s: number, i: any) => s + Number(i.salarioLiquido ?? 0), 0);
      const totalInss = allItems.reduce((s: number, i: any) => s + Number(i.inssEmpregado ?? 0), 0);
      const totalIrt = allItems.reduce((s: number, i: any) => s + Number(i.irt ?? 0), 0);

      const statusLabel = (s: string) =>
        s === 'paga' ? '<span class="badge" style="background:#d1fae5;color:#065f46">Paga</span>'
        : s === 'aprovada' ? '<span class="badge" style="background:#dbeafe;color:#1d4ed8">Aprovada</span>'
        : s === 'processada' ? '<span class="badge" style="background:#e0e7ff;color:#3730a3">Processada</span>'
        : '<span class="badge" style="background:#f3f4f6;color:#374151">Rascunho</span>';

      const rows = allItems.map((i: any) => `
        <tr>
          <td>${i.professorNome ?? '—'}</td>
          <td>${i.cargo ?? '—'}</td>
          <td>${MESES_LABELS[(i.mesFolha ?? 1) - 1]}/${i.anoFolha}</td>
          <td class="r">${fmtKz(Number(i.salarioBase ?? 0))}</td>
          <td class="r">${fmtKz(Number(i.salarioBruto ?? 0))}</td>
          <td class="r red">${fmtKz(Number(i.inssEmpregado ?? 0))}</td>
          <td class="r red">${fmtKz(Number(i.irt ?? 0))}</td>
          <td class="r red">${Number(i.descontoFaltas ?? 0) > 0 ? fmtKz(Number(i.descontoFaltas)) : '—'}</td>
          <td class="r red">${fmtKz(Number(i.totalDescontos ?? 0))}</td>
          <td class="r green">${fmtKz(Number(i.salarioLiquido ?? 0))}</td>
          <td>${statusLabel(i.statusFolha)}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>${titulo}</title>
      <style>${CSS_COMUM}</style></head><body>
      <div style="text-align:center;margin-bottom:10px;"><img src="/angola-brasao.png" style="width:55px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia" onerror="this.style.display='none'" /><p style="font-size:8pt;margin:0;line-height:1.5;">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO · ENSINO GERAL</p></div>
      <h1>${titulo}</h1>
      <p class="subtitle">${folhas.length} folha${folhas.length !== 1 ? 's' : ''} · ${allItems.length} funcionário${allItems.length !== 1 ? 's' : ''} processado${allItems.length !== 1 ? 's' : ''}</p>
      <div class="totalbox">
        <span>Bruto: ${fmtKz(totalBruto)}</span>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <span style="color:#dc2626">Descontos: ${fmtKz(totalDescontos)}</span>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <span>Líquido Total: ${fmtKz(totalLiquido)}</span>
      </div>
      <table>
        <thead><tr>
          <th>Funcionário</th><th>Cargo</th><th>Mês</th>
          <th class="r">Base</th><th class="r">Bruto</th>
          <th class="r">INSS</th><th class="r">IRT</th><th class="r">Faltas</th>
          <th class="r">Total Desc.</th><th class="r">Líquido</th><th>Estado</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="11" style="text-align:center;color:#aaa;padding:20px">Sem registos processados para o período</td></tr>'}</tbody>
        ${allItems.length > 0 ? `<tfoot><tr style="background:#eef2ff;font-weight:700">
          <td colspan="4">TOTAIS</td>
          <td class="r">${fmtKz(totalBruto)}</td>
          <td class="r red">${fmtKz(totalInss)}</td>
          <td class="r red">${fmtKz(totalIrt)}</td>
          <td class="r red">—</td>
          <td class="r red">${fmtKz(totalDescontos)}</td>
          <td class="r green">${fmtKz(totalLiquido)}</td>
          <td></td>
        </tr></tfoot>` : ''}
      </table>
      <p class="footer">Gerado em ${new Date().toLocaleString('pt-PT')} · QUETA v3 · Recursos Humanos</p>
      </body></html>`;

      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    } catch { webAlert('Erro ao gerar relatório de pagamentos'); }
    finally { setLoadingPayroll(false); }
  }

  const cardStyle = (color: string) => ({
    backgroundColor: Colors.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
    borderLeftWidth: 4, borderLeftColor: color,
  });

  const btnStyle = (color: string) => ({
    backgroundColor: color, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flex: 1,
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 4 }}>
        Gere relatórios em PDF directamente do seu navegador. Seleccione o período pretendido.
      </Text>

      {/* ── Gráficos de Faltas ─────────────────────────────────────────────── */}
      <Text style={{ color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '700' }}>
        Análise Visual de Faltas — {ano}
      </Text>

      {chartLoading ? (
        <AppLoader color={Colors.accent} style={{ marginVertical: 16 }} />
      ) : chartFaltas.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <MaterialCommunityIcons name="chart-bar-stacked" size={40} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, marginTop: 8, fontSize: 13 }}>
            Sem dados de faltas para {ano}.
          </Text>
        </View>
      ) : (
        <>
          {/* Faltas por Tipo */}
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="chart-donut" size={18} color="#EF5350" />
              <Text style={{ color: Colors.text ?? '#fff', fontWeight: '700', fontSize: 13 }}>
                Tipos de Faltas · Total {totalAno}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              {faltasPorTipo.length > 0 ? (
                <DonutChart
                  data={faltasPorTipo}
                  size={150}
                  thickness={26}
                  centerLabel={String(totalAno)}
                  centerSub="faltas"
                />
              ) : (
                <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Sem faltas registadas</Text>
              )}
            </View>
          </View>

          {/* Evolução Mensal */}
          {faltasPorMes.length >= 2 && (
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="chart-line" size={18} color="#4FC3F7" />
                <Text style={{ color: Colors.text ?? '#fff', fontWeight: '700', fontSize: 13 }}>
                  Evolução Mensal
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <LineChart data={faltasPorMes} color="#4FC3F7" height={140} width={320} />
              </View>
            </View>
          )}

          {/* Faltas por Departamento */}
          {faltasPorDept.length > 0 && (
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="chart-bar" size={18} color="#66BB6A" />
                <Text style={{ color: Colors.text ?? '#fff', fontWeight: '700', fontSize: 13 }}>
                  Por Departamento
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <BarChart data={faltasPorDept} height={160} width={320} />
              </View>
            </View>
          )}
        </>
      )}

      {/* Separador */}
      <View style={{ height: 1, backgroundColor: Colors.border }} />
      <Text style={{ color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '700' }}>
        Exportar Relatórios
      </Text>

      {/* Faltas */}
      <View style={cardStyle('#ef4444')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="calendar-remove" size={20} color="#ef4444" />
          <Text style={{ color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '700' }}>Relatório de Faltas</Text>
        </View>
        <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
          Lista detalhada de todas as faltas registadas — tipo, desconto e motivo. Disponível por mês ou ano completo.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={btnStyle('#ef4444')} onPress={() => gerarRelatorioFaltas('mensal')} disabled={loadingFaltas}>
            <MaterialCommunityIcons name="calendar-month" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{loadingFaltas ? 'A gerar...' : `Mensal — ${MESES_LABELS[mes - 1]} ${ano}`}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={btnStyle('#b91c1c')} onPress={() => gerarRelatorioFaltas('anual')} disabled={loadingFaltas}>
            <MaterialCommunityIcons name="calendar-year" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{loadingFaltas ? 'A gerar...' : `Anual — ${ano}`}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Payroll */}
      <View style={cardStyle('#10b981')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="cash-multiple" size={20} color="#10b981" />
          <Text style={{ color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '700' }}>Relatório de Pagamentos</Text>
        </View>
        <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
          Detalhe por funcionário: salário base, bruto, INSS, IRT, desconto de faltas, total de descontos e líquido a receber.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={btnStyle('#10b981')} onPress={() => gerarRelatorioPayroll('mensal')} disabled={loadingPayroll}>
            <MaterialCommunityIcons name="calendar-month" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{loadingPayroll ? 'A gerar...' : `Mensal — ${MESES_LABELS[mes - 1]} ${ano}`}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={btnStyle('#059669')} onPress={() => gerarRelatorioPayroll('anual')} disabled={loadingPayroll}>
            <MaterialCommunityIcons name="calendar-year" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{loadingPayroll ? 'A gerar...' : `Anual — ${ano}`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────
function getDeptLabel(key: string): string {
  const d = getDepartamentoByKey(key as DepartamentoKey);
  return d?.nome ?? key;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { color: Colors.text ?? '#fff', fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6 },

  tabBar: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceLight ?? '#243A78', position: 'relative', overflow: 'hidden' },
  tabScrollFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, pointerEvents: 'none' } as any,
  tabScroll: { paddingHorizontal: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '500' },
  tabLabelActive: { color: Colors.accent, fontWeight: '700' },

  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceLight ?? '#243A78',
  },
  monthBtn: { padding: 8 },
  monthLabel: { color: Colors.accent, fontSize: 15, fontWeight: '700', minWidth: 160, textAlign: 'center' },

  summaryRow: { flexDirection: 'row', padding: 8, gap: 6 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10,
    alignItems: 'center', borderTopWidth: 3, gap: 4,
  },
  summaryValue: { fontWeight: '800', marginTop: 2 },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, textAlign: 'center' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 8, color: Colors.text ?? '#fff', fontSize: 13,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  pillRow: { maxHeight: 44, flexShrink: 0 },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  deptPill: {
    borderRadius: 20, borderWidth: 1, borderColor: Colors.surface,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 6,
    backgroundColor: Colors.surface,
  },
  deptPillActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  deptPillText: { color: Colors.textMuted, fontSize: 11, fontWeight: '500' },
  deptPillTextActive: { color: Colors.accent, fontWeight: '700' },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, marginHorizontal: 12, marginBottom: 4,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.accent + '30',
  },
  infoBannerIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent + '20', justifyContent: 'center', alignItems: 'center',
  },
  infoBannerLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoBannerText: { color: Colors.text ?? '#fff', fontSize: 13, fontWeight: '700', marginTop: 1 },
  infoBannerChip: {
    backgroundColor: Colors.accent + '18', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.accent + '33',
  },
  infoBannerChipText: { color: Colors.accent, fontSize: 10, fontWeight: '700' },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 32,
    alignItems: 'center', marginVertical: 20, gap: 8,
  },
  emptyCardText: { color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyCardSub: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },

  // Falta Card
  faltaCard: {
    backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 10,
    overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  faltaCardHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceLight ?? '#243A78',
  },
  faltaNome: { color: Colors.text ?? '#fff', fontSize: 14, fontWeight: '700' },
  faltaCargo: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  tipoBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tipoBadgeText: { fontSize: 11, fontWeight: '700' },
  faltaCardBody: { padding: 12, gap: 6 },
  faltaInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  faltaInfoText: { color: Colors.textMuted, fontSize: 12 },
  faltaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  deleteBtn: { padding: 4 },

  // Tempo Card
  tempoCard: {
    backgroundColor: Colors.surface, borderRadius: 14, marginBottom: 10,
    padding: 16, flexDirection: 'column',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  tempoCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tempoCardRight: { alignItems: 'flex-end', gap: 4 },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.accent + '22', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: Colors.accent, fontSize: 15, fontWeight: '800' },
  tempoNome: { color: Colors.text ?? '#fff', fontSize: 14, fontWeight: '700' },
  tempoCargo: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  tempoStat: { alignItems: 'flex-end' },
  tempoStatNum: { color: Colors.text ?? '#fff', fontSize: 14, fontWeight: '800' },
  tempoStatLabel: { color: Colors.textMuted, fontSize: 10 },
  tempoStatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  tempoStatPillNum: { fontSize: 15, fontWeight: '800' },
  tempoStatPillLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '500' },
  tempoActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
  },
  tempoActionBtnText: { fontSize: 12, fontWeight: '700' },
  aprovadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aprovadoText: { color: Colors.success, fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 4, marginTop: 4 },
  editIconBtn: { padding: 4 },
  addTempoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
  },
  addTempoBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },

  // Config
  configSection: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, gap: 12,
  },
  configSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  configSectionTitle: { color: Colors.text ?? '#fff', fontSize: 15, fontWeight: '700' },
  configSectionDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  configField: { gap: 6 },
  configFieldLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  configInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  configIconBox: { width: 40, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  configInput: {
    flex: 1, backgroundColor: Colors.surfaceLight ?? '#1E3A5F', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: Colors.text ?? '#fff', fontSize: 15,
  },
  previewBox: {
    backgroundColor: Colors.background, borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  previewBoxLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 4 },
  previewBoxCalc: { color: Colors.accent, fontSize: 14, fontWeight: '700' },

  guardarBtn: {
    backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8,
  },
  guardarBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modalBox: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 20, width: '100%', maxWidth: 480,
  },
  modalTitle: { color: Colors.text ?? '#fff', fontSize: 17, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surfaceLight ?? '#1E3A5F', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: Colors.text ?? '#fff',
    fontSize: 14, marginBottom: 12,
  },
  funcOption: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.surface },
  funcOptionActive: { backgroundColor: Colors.accent + '22' },
  funcOptionText: { color: Colors.textMuted, fontSize: 12 },
  tipoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tipoPill: {
    flex: 1, padding: 8, borderRadius: 8, borderWidth: 1.5,
    borderColor: Colors.surface, alignItems: 'center',
  },
  tipoPillText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  calcPreview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: 8, padding: 12, marginBottom: 12,
  },
  calcPreviewLabel: { color: Colors.textMuted, fontSize: 12 },
  calcPreviewValue: { color: Colors.accent, fontSize: 16, fontWeight: '800' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: Colors.textMuted, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: Colors.textMuted, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});
