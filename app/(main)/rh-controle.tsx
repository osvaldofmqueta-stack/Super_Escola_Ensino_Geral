import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import TopBar from '@/components/TopBar';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes, timeAgo } from '@/context/NotificacoesContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import {
  DEPARTAMENTOS,
  CARGOS,
  CARGOS_POR_DEPARTAMENTO,
  DepartamentoKey,
  CargoInfo,
  getCargoById,
  getDepartamentoByKey,
  SECCOES_POR_DEPARTAMENTO,
  ESPECIALIDADES_POR_DEPARTAMENTO,
  HABILITACOES_ACADEMICAS,
  HabilitacaoAcademica,
  getHabilitacaoById,
} from '@/shared/departamentos';
import { api } from '@/lib/api';
import { useLocalSearchParams } from 'expo-router';

import DatePickerField from '@/components/DatePickerField';
import DateInput from '@/components/DateInput';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
type Tab = 'pessoal' | 'sumarios' | 'solicitacoes' | 'assiduidade';
type SumFiltro = 'todos' | 'pendente' | 'aceite' | 'rejeitado';

interface AssiduidadeItem {
  funcionarioId: string;
  nome: string;
  apelido: string;
  departamento: string;
  cargo: string;
  tipoContrato: string;
  salarioBase: number;
  faltasInjustificadas: number;
  faltasJustificadas: number;
  meiosDias: number;
  totalFaltas: number;
  descontoEstimado: number;
  faltas: { data: string; tipo: string; motivo: string; descontavel: boolean }[];
}
interface AssiduidadeTotais {
  totalFuncionarios: number;
  comFaltas: number;
  semFaltas: number;
  totalInjustificadas: number;
  totalJustificadas: number;
  totalMeiosDias: number;
  totalDescontos: number;
}

interface SubsidioItem {
  id: string;
  nome: string;
  percentagem: number;
}

interface Funcionario {
  id: string;
  nome: string;
  apelido: string;
  dataNascimento: string;
  genero: string;
  bi: string;
  telefone: string;
  email: string;
  foto?: string;
  provincia: string;
  municipio: string;
  morada: string;
  departamento: DepartamentoKey;
  seccao: string;
  cargo: string;
  especialidade: string;
  tipoContrato: string;
  dataContratacao: string;
  dataFimContrato?: string;
  habilitacoes: string;
  salarioBase: number;
  subsidioAlimentacao: number;
  subsidioTransporte: number;
  subsidioHabitacao: number;
  outrosSubsidios: number;
  subsidios?: SubsidioItem[];
  valorPorTempoLectivo: number;
  temposSemanais: number;
  utilizadorId?: string;
  professorId?: string;
  ativo: boolean;
  observacoes: string;
  createdAt: string;
}

const TIPO_CONTRATO = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'contratado', label: 'Contratado' },
  { id: 'prestacao_servicos', label: 'Prestação de Serviços' },
  { id: 'temporario', label: 'Temporário' },
  { id: 'bolseiro', label: 'Bolseiro' },
];

const GENERO = [
  { id: 'M', label: 'Masculino' },
  { id: 'F', label: 'Feminino' },
];

const DEPT_COLORS: Record<DepartamentoKey, string> = {
  direcao: '#6C5CE7',
  pedagogico: '#0984E3',
  administrativo: '#00B894',
  financeiro: '#FDCB6E',
  rh: '#E17055',
  biblioteca: '#A29BFE',
  servicos_gerais: '#74B9FF',
};

const DEPT_ICONS: Record<DepartamentoKey, string> = {
  direcao: 'shield-star',
  pedagogico: 'school',
  administrativo: 'briefcase',
  financeiro: 'cash-multiple',
  rh: 'account-group',
  biblioteca: 'bookshelf',
  servicos_gerais: 'tools',
};

function emptyFuncionario(): Partial<Funcionario> {
  return {
    nome: '', apelido: '', dataNascimento: '', genero: 'M',
    bi: '', telefone: '', email: '',
    provincia: 'Luanda', municipio: '', morada: '',
    seccao: '', cargo: '',
    especialidade: '', tipoContrato: 'efectivo',
    dataContratacao: '', dataFimContrato: '',
    habilitacoes: '', salarioBase: 0,
    subsidioAlimentacao: 0, subsidioTransporte: 0,
    subsidioHabitacao: 0, outrosSubsidios: 0,
    valorPorTempoLectivo: 0, temposSemanais: 0,
    ativo: true, observacoes: '',
  };
}

// ─── Selector de opções com chips + campo livre ──────────────────────────────
function OptionChips({
  options,
  value,
  onSelect,
  accentColor,
  placeholder,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  accentColor: string;
  placeholder?: string;
}) {
  const isCustom = !!(value && !options.includes(value));
  const [showCustom, setShowCustom] = React.useState(isCustom);
  React.useEffect(() => { if (isCustom) setShowCustom(true); }, []);
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {options.map(opt => {
          const active = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => { setShowCustom(false); onSelect(opt); }}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? accentColor : '#FFFFFF22',
                backgroundColor: active ? accentColor + '22' : '#FFFFFF08',
              }}
            >
              <Text style={{ fontSize: 12, color: active ? accentColor : '#8A9BB0', fontFamily: 'Inter_600SemiBold' }}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => { setShowCustom(true); if (!isCustom) onSelect(''); }}
          style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
            borderWidth: 1,
            borderColor: (showCustom || isCustom) ? accentColor : '#FFFFFF22',
            backgroundColor: (showCustom || isCustom) ? accentColor + '22' : '#FFFFFF08',
          }}
        >
          <Text style={{ fontSize: 12, color: (showCustom || isCustom) ? accentColor : '#8A9BB0', fontFamily: 'Inter_500Medium' }}>
            Outro...
          </Text>
        </TouchableOpacity>
      </View>
      {(showCustom || isCustom) && (
        <TextInput
          style={{
            backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: accentColor + '55',
            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
            color: '#E8EEF6', fontSize: 14, fontFamily: 'Inter_400Regular',
          }}
          placeholder={placeholder || 'Escreva aqui...'}
          placeholderTextColor="#8A9BB0"
          value={isCustom ? value : ''}
          onChangeText={onSelect}
          autoFocus={showCustom && !isCustom}
        />
      )}
    </View>
  );
}

export default function RHControleScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const { professores, turmas } = useData();
  const {
    sumarios, updateSumario,
    solicitacoes, updateSolicitacao, updatePauta,
    pautas,
  } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const RH_TABS: Tab[] = ['pessoal', 'sumarios', 'solicitacoes', 'assiduidade'];
  const routeParamsRh = useLocalSearchParams<{ tab?: string }>();
  const initialRhTab = (RH_TABS.find(t => t === String(routeParamsRh?.tab || '')) || 'pessoal') as Tab;
  const [tab, setTab] = useState<Tab>(initialRhTab);
  useEffect(() => {
    const t = String(routeParamsRh?.tab || '');
    if (t && (RH_TABS as string[]).includes(t)) setTab(t as Tab);
  }, [routeParamsRh?.tab]);
  const [filtro, setFiltro] = useState<SumFiltro>('pendente');
  const [selectedSumario, setSelectedSumario] = useState<string | null>(null);
  const [selectedSolicitude, setSelectedSolicitude] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');

  // ── Assiduidade ────────────────────────────────────────────────────────────
  const hoje = new Date();
  const [assiduidadeMes, setAssiduidadeMes] = useState(hoje.getMonth() + 1);
  const [assiduidadeAno, setAssiduidadeAno] = useState(hoje.getFullYear());
  const [assiduidadeDept, setAssiduidadeDept] = useState<DepartamentoKey | 'todos'>('todos');
  const [assiduidadeData, setAssiduidadeData] = useState<{ relatorio: AssiduidadeItem[]; totais: AssiduidadeTotais } | null>(null);
  const [assiduidadeLoading, setAssiduidadeLoading] = useState(false);
  const [assiduidadeExpanded, setAssiduidadeExpanded] = useState<string | null>(null);

  const loadAssiduidade = useCallback(async (mes = assiduidadeMes, ano = assiduidadeAno, dept = assiduidadeDept) => {
    setAssiduidadeLoading(true);
    try {
      const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
      if (dept !== 'todos') params.set('departamento', dept);
      const data = await api.get<{ relatorio: AssiduidadeItem[]; totais: AssiduidadeTotais }>(`/api/rh/relatorio-assiduidade?${params}`);
      setAssiduidadeData(data);
    } catch (e: any) {
      console.warn('[Assiduidade] erro ao carregar:', e?.message);
      setAssiduidadeData({ relatorio: [], totais: { totalFuncionarios: 0, comFaltas: 0, semFaltas: 0, totalInjustificadas: 0, totalJustificadas: 0, totalMeiosDias: 0, totalDescontos: 0 } });
    } finally {
      setAssiduidadeLoading(false);
    }
  }, [assiduidadeMes, assiduidadeAno, assiduidadeDept]);

  useEffect(() => {
    if (tab === 'assiduidade') loadAssiduidade();
  }, [tab]);

  // ── Pessoal ──────────────────────────────────────────────────────────────
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [funcLoading, setFuncLoading] = useState(false);
  const [funcRefreshing, setFuncRefreshing] = useState(false);
  const [deptFiltro, setDeptFiltro] = useState<DepartamentoKey | 'todos'>('todos');
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [funcSearch, setFuncSearch] = useState('');
  const [showFuncForm, setShowFuncForm] = useState(false);
  const [editingFunc, setEditingFunc] = useState<Funcionario | null>(null);
  const [funcForm, setFuncForm] = useState<Partial<Funcionario>>(emptyFuncionario());
  const [funcSaving, setFuncSaving] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedFunc, setSelectedFunc] = useState<Funcionario | null>(null);
  const [showAcessoModal, setShowAcessoModal] = useState(false);
  const [acessoEmail, setAcessoEmail] = useState('');
  const [acessoSenha, setAcessoSenha] = useState('');
  const [acessoSaving, setAcessoSaving] = useState(false);
  const [showAcessoPassword, setShowAcessoPassword] = useState(false);
  const [showProfModal, setShowProfModal] = useState(false);
  const [profHabilitacoes, setProfHabilitacoes] = useState('');
  const [profSaving, setProfSaving] = useState(false);
  const [formStep, setFormStep] = useState<'pessoal' | 'organizacao' | 'contrato' | 'salarial'>('pessoal');
  const [funcFormErrors, setFuncFormErrors] = useState<Record<string, string>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [subsidiosCustom, setSubsidiosCustom] = useState<SubsidioItem[]>([]);
  const [fotoUploading, setFotoUploading] = useState(false);

  const pickFoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      setFotoUploading(true);
      const asset = result.assets[0];
      const fd = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        fd.append('file', blob, 'foto.jpg');
      } else {
        fd.append('file', { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: 'foto.jpg' } as any);
      }
      const tok = await getAuthToken();
      const uploadResp = await fetch('/api/upload', {
        method: 'POST',
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        body: fd,
      });
      const data = await uploadResp.json();
      if (!uploadResp.ok) throw new Error(data.error || 'Erro no upload');
      updateField('foto', data.url);
    } catch (e: any) {
      webAlert('Erro', e.message || 'Não foi possível fazer upload da foto.');
    } finally {
      setFotoUploading(false);
    }
  }, []);

  const isRH = ['rh', 'admin', 'director', 'ceo', 'pca', 'chefe_secretaria'].includes(user?.role ?? '');

  // Load funcionarios
  const loadFuncionarios = useCallback(async (refresh = false) => {
    if (refresh) setFuncRefreshing(true);
    else setFuncLoading(true);
    try {
      const data = await api.get('/api/funcionarios');
      setFuncionarios(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally {
      setFuncLoading(false);
      setFuncRefreshing(false);
    }
  }, []);

  useEffect(() => { if (tab === 'pessoal') loadFuncionarios(); }, [tab]);

  // Filtered funcionarios
  const funcFiltrados = useMemo(() => {
    return funcionarios.filter(f => {
      if (deptFiltro !== 'todos' && f.departamento !== deptFiltro) return false;
      if (funcSearch) {
        const q = funcSearch.toLowerCase();
        const nome = `${f.nome} ${f.apelido}`.toLowerCase();
        if (!nome.includes(q) && !f.bi.toLowerCase().includes(q) && !f.cargo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [funcionarios, deptFiltro, funcSearch]);

  // Grouped by department
  const funcPorDepto = useMemo(() => {
    const groups: Record<string, Funcionario[]> = {};
    for (const f of funcFiltrados) {
      if (!groups[f.departamento]) groups[f.departamento] = [];
      groups[f.departamento].push(f);
    }
    return groups;
  }, [funcFiltrados]);

  function updateField(key: keyof Funcionario, value: any) {
    setFuncForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'departamento' && value !== prev.departamento) {
        // Limpa cargo, secção e especialidade ao mudar de departamento
        next.cargo = '';
        next.seccao = '';
        next.especialidade = '';
      }
      // Auto-sugerir valor por tempo lectivo com base nas habilitações
      if (key === 'habilitacoes') {
        const hab = getHabilitacaoById(value);
        const isByTempo = prev.tipoContrato === 'prestacao_servicos'
          || prev.tipoContrato === 'temporario'
          || prev.tipoContrato === 'contratado';
        if (hab && isByTempo && (!prev.valorPorTempoLectivo || prev.valorPorTempoLectivo === 0)) {
          next.valorPorTempoLectivo = hab.valorTempoLectivoSugerido;
        }
      }
      return next;
    });
  }

  function validarNIForBI(v: string): boolean {
    return /^\d{9}[A-Z]{2}\d{3}$/.test(v.trim().toUpperCase());
  }

  const FUNC_STEPS = ['pessoal', 'organizacao', 'contrato', 'salarial'] as const;

  function validateFuncStep(step: typeof formStep): boolean {
    const erros: Record<string, string> = {};

    if (step === 'pessoal') {
      if (!funcForm.nome?.trim()) erros.nome = 'O nome é obrigatório.';
      if (!funcForm.dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(funcForm.dataNascimento)) {
        erros.dataNascimento = 'A data de nascimento é obrigatória (DD-MM-AAAA).';
      }
      if (funcForm.bi?.trim() && !validarNIForBI(funcForm.bi)) erros.bi = 'BI inválido. Formato: 9 dígitos + 2 letras + 3 dígitos (ex: 000000000LA000).';
    } else if (step === 'organizacao') {
      if (!funcForm.departamento) erros.departamento = 'Seleccione o departamento.';
      if (!funcForm.cargo) erros.cargo = 'Seleccione o cargo.';
      if (!funcForm.habilitacoes) erros.habilitacoes = 'Seleccione as habilitações académicas.';
    } else if (step === 'contrato') {
      if (!funcForm.tipoContrato) erros.tipoContrato = 'Seleccione o tipo de vínculo.';
      if (!funcForm.dataContratacao || !/^\d{4}-\d{2}-\d{2}$/.test(funcForm.dataContratacao)) {
        erros.dataContratacao = 'A data de contratação é obrigatória (DD-MM-AAAA).';
      }
    }

    setFuncFormErrors(erros);
    const valid = Object.keys(erros).length === 0;
    if (valid) setCompletedSteps(prev => new Set([...prev, step]));
    return valid;
  }

  function handleFuncNext() {
    if (validateFuncStep(formStep)) {
      const idx = FUNC_STEPS.indexOf(formStep);
      setFormStep(FUNC_STEPS[Math.min(FUNC_STEPS.length - 1, idx + 1)]);
      setFuncFormErrors({});
    }
  }

  function handleStepTabClick(stepId: typeof formStep) {
    const targetIdx = FUNC_STEPS.indexOf(stepId);
    const currentIdx = FUNC_STEPS.indexOf(formStep);
    if (targetIdx === currentIdx) return;
    if (targetIdx < currentIdx) {
      setFormStep(stepId);
      setFuncFormErrors({});
    }
    // Forward navigation is blocked — use the "Próximo" button to advance
  }

  async function saveFuncionario() {
    if (!funcForm.nome?.trim() || !funcForm.departamento || !funcForm.cargo) {
      webAlert('Campos obrigatórios', 'Preencha o nome, departamento e cargo.');
      return;
    }
    if (!funcForm.dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(funcForm.dataNascimento)) {
      setFuncFormErrors(e => ({ ...e, dataNascimento: 'A data de nascimento é obrigatória (DD-MM-AAAA).' }));
      setFormStep('pessoal');
      webAlert('Data de nascimento obrigatória', 'Preencha a data de nascimento do funcionário no separador "Dados Pessoais".');
      return;
    }
    if (funcForm.bi?.trim() && !validarNIForBI(funcForm.bi)) {
      webAlert('BI inválido', 'O Bilhete de Identidade deve ter o formato: 9 dígitos + 2 letras + 3 dígitos (ex: 000000000LA000).');
      return;
    }
    const isByTempo = funcForm.tipoContrato === 'contratado'
      || funcForm.tipoContrato === 'prestacao_servicos'
      || funcForm.tipoContrato === 'temporario';
    if (isByTempo && (!funcForm.valorPorTempoLectivo || funcForm.valorPorTempoLectivo <= 0)) {
      setFuncFormErrors(e => ({ ...e, valorPorTempoLectivo: 'O valor por tempo lectivo é obrigatório para este tipo de contrato.' }));
      setFormStep('salarial');
      webAlert('Valor por Tempo Lectivo em falta', 'Para contratos por tempo lectivo, o valor unitário por tempo lectivo tem de ser superior a zero.\n\nDefine o valor nas Habilitações Académicas (Passo 2) ou introduz directamente no campo abaixo.');
      return;
    }
    if (isByTempo && (!funcForm.temposSemanais || funcForm.temposSemanais <= 0)) {
      setFuncFormErrors(e => ({ ...e, temposSemanais: 'O nº de tempos semanais é obrigatório — sem este valor o salário mensal fica a 0 Kz.' }));
      setFormStep('salarial');
      webAlert('Nº de Tempos Semanais em falta', 'Para contratos por tempo lectivo, o número de tempos semanais tem de ser superior a zero.\n\nO salário mensal é calculado como: Valor × Tempos Semanais × 4 semanas.');
      return;
    }
    setFuncSaving(true);
    try {
      const salBase = funcForm.salarioBase ?? 0;
      const totalSubsidios = subsidiosCustom.reduce((sum, s) => sum + (salBase * s.percentagem / 100), 0);
      const payload = {
        ...funcForm,
        subsidioAlimentacao: 0,
        subsidioTransporte: 0,
        subsidioHabitacao: 0,
        outrosSubsidios: Math.round(totalSubsidios),
        subsidios: subsidiosCustom,
      };
      if (editingFunc) {
        await api.put(`/api/funcionarios/${editingFunc.id}`, payload);
      } else {
        await api.post('/api/funcionarios', payload);
      }
      setShowFuncForm(false);
      setEditingFunc(null);
      setFuncForm(emptyFuncionario());
      setSubsidiosCustom([]);
      setFormStep('pessoal');
      await loadFuncionarios();
    } catch (e: any) {
      webAlert('Erro', e.message || 'Erro ao guardar funcionário.');
    } finally {
      setFuncSaving(false);
    }
  }

  async function deleteFuncionario(id: string) {
    webAlert('Confirmar', 'Eliminar este funcionário do registo? Esta acção é irreversível.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/funcionarios/${id}`);
            setShowDetailModal(false);
            setSelectedFunc(null);
            await loadFuncionarios();
          } catch (e: any) {
            const msg: string = e?.message || '';
            // Tentar extrair JSON da mensagem de erro (formato: "409: {...}")
            const jsonStart = msg.indexOf('{');
            let parsed: any = null;
            if (jsonStart !== -1) {
              try { parsed = JSON.parse(msg.slice(jsonStart)); } catch { /* ignorar */ }
            }
            if (parsed?.sugestao === 'inativar' && parsed?.historico) {
              const listaHistorico = (parsed.historico as string[]).join('\n• ');
              webAlert(
                'Não é possível eliminar',
                `Este funcionário tem histórico associado:\n• ${listaHistorico}\n\nDeseja inativá-lo em vez de o eliminar? O registo fica preservado mas o acesso é bloqueado.`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Inativar', style: 'destructive', onPress: async () => {
                      try {
                        const func = funcionarios.find(f => f.id === id);
                        if (!func) return;
                        await api.put(`/api/funcionarios/${id}`, { ...func, ativo: false });
                        setShowDetailModal(false);
                        setSelectedFunc(null);
                        await loadFuncionarios();
                      } catch (e2: any) {
                        webAlert('Erro', e2?.message || 'Erro ao inativar o funcionário.');
                      }
                    }
                  }
                ]
              );
            } else {
              webAlert('Erro', parsed?.error || msg || 'Erro ao eliminar o funcionário.');
            }
          }
        }
      }
    ]);
  }

  async function criarAcesso() {
    if (!selectedFunc) return;
    if (!acessoEmail.trim() || !acessoSenha.trim()) {
      webAlert('Campos obrigatórios', 'Preencha o email e a senha de acesso.');
      return;
    }
    setAcessoSaving(true);
    try {
      const cargo = getCargoById(selectedFunc.cargo);
      await api.post(`/api/funcionarios/${selectedFunc.id}/criar-acesso`, {
        email: acessoEmail,
        senha: acessoSenha,
        role: cargo?.role || 'secretaria',
      });
      webAlert('Sucesso', 'Acesso ao sistema criado com sucesso.');
      setShowAcessoModal(false);
      setAcessoEmail('');
      setAcessoSenha('');
      await loadFuncionarios();
    } catch (e: any) {
      webAlert('Erro', e.message || 'Erro ao criar acesso.');
    } finally {
      setAcessoSaving(false);
    }
  }

  async function atribuirComoProfessor() {
    if (!selectedFunc) return;
    setProfSaving(true);
    try {
      const result = await api.post(`/api/funcionarios/${selectedFunc.id}/atribuir-professor`, {
        habilitacoes: profHabilitacoes || selectedFunc.habilitacoes || '',
      });
      if (result.already) {
        webAlert('Já registado', `Este funcionário já está registado como professor com o número ${result.professor.numeroProfessor}.`);
      } else {
        webAlert('Sucesso', `Professor registado com sucesso!\nNúmero: ${result.professor.numeroProfessor}\n\nO funcionário já pode ser atribuído a turmas e disciplinas no módulo pedagógico.`);
      }
      setShowProfModal(false);
      setProfHabilitacoes('');
      await loadFuncionarios();
      // Refresh selectedFunc with updated professorId
      setSelectedFunc(prev => prev ? { ...prev, professorId: result.professor.id } : prev);
    } catch (e: any) {
      webAlert('Erro', e.message || 'Erro ao atribuir como professor.');
    } finally {
      setProfSaving(false);
    }
  }

  // ── Sumários ──────────────────────────────────────────────────────────────
  const sumariosOrdenados = useMemo(() =>
    [...sumarios]
      .filter(s => filtro === 'todos' || s.status === filtro)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sumarios, filtro]);

  const solicitacoesPendentes = useMemo(() =>
    solicitacoes.filter(s => s.status === 'pendente')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [solicitacoes]);

  const sumarioSelecionado = sumarios.find(s => s.id === selectedSumario);
  const solicitSelecionada = solicitacoes.find(s => s.id === selectedSolicitude);

  async function aceitarSumario() {
    if (!sumarioSelecionado) return;
    await updateSumario(sumarioSelecionado.id, { status: 'aceite', observacaoRH: observacao || undefined });
    setSelectedSumario(null);
    setObservacao('');
  }

  async function rejeitarSumario() {
    if (!sumarioSelecionado) return;
    if (!observacao.trim()) { webAlert('Obrigatório', 'Indique o motivo da rejeição.'); return; }
    await updateSumario(sumarioSelecionado.id, { status: 'rejeitado', observacaoRH: observacao });
    setSelectedSumario(null);
    setObservacao('');
  }

  async function aprovarSolicitacao() {
    if (!solicitSelecionada) return;
    await updateSolicitacao(solicitSelecionada.id, { status: 'aprovada', respondidoEm: new Date().toISOString(), observacao });
    await updatePauta(solicitSelecionada.pautaId, { status: 'aberta' });
    setSelectedSolicitude(null);
    setObservacao('');
  }

  async function rejeitarSolicitacao() {
    if (!solicitSelecionada) return;
    await updateSolicitacao(solicitSelecionada.id, { status: 'rejeitada', respondidoEm: new Date().toISOString(), observacao });
    setSelectedSolicitude(null);
    setObservacao('');
  }

  useEnterToSave(saveFuncionario, showFuncForm);
  useEnterToSave(criarAcesso, showAcessoModal);

  if (!isRH) {
    return (
      <View style={styles.container}>
        <TopBar title="Controlo RH" subtitle="Acesso restrito" />
        <View style={styles.empty}>
          <Ionicons name="lock-closed" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Acesso Restrito</Text>
          <Text style={styles.emptySub}>Esta área é exclusiva para o departamento de RH e Direcção.</Text>
        </View>
      </View>
    );
  }

  const cargosForForm = funcForm.departamento
    ? (CARGOS_POR_DEPARTAMENTO[funcForm.departamento as DepartamentoKey] || [])
    : [];

  return (
    <View style={styles.container}>
      <TopBar title="Controlo RH" subtitle="Pessoal, sumários e solicitações" />

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.gold }]}>{funcionarios.filter(f => f.ativo).length}</Text>
          <Text style={styles.statLabel}>Funcionários</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.warning }]}>{sumarios.filter(s => s.status === 'pendente').length}</Text>
          <Text style={styles.statLabel}>Sumários</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.accent }]}>{solicitacoesPendentes.length}</Text>
          <Text style={styles.statLabel}>Solicitações</Text>
        </View>
      </View>

      {/* Tabs */}
      <HScrollTabBar style={styles.tabScroll} contentContainerStyle={styles.tabRow} keyboardShouldPersistTaps="handled">
        {([
          { id: 'pessoal',      label: 'Pessoal',                                                                          icon: 'people' },
          { id: 'sumarios',     label: `Sumários (${sumarios.filter(s => s.status === 'pendente').length})`,               icon: 'document-text' },
          { id: 'solicitacoes', label: `Solicitações (${solicitacoesPendentes.length})`,                                   icon: 'mail' },
          { id: 'assiduidade',  label: 'Assiduidade',                                                                     icon: 'calendar' },
        ] as const).map(t => (
          <TouchableOpacity key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id as Tab)}>
            <Ionicons name={t.icon as any} size={14} color={tab === t.id ? '#fff' : Colors.textSecondary} />
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* ── PESSOAL TAB ────────────────────────────────────────────────── */}
      {tab === 'pessoal' && (
        <View style={{ flex: 1 }}>
          {/* Search + Dept Filter */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <StableSearchInput
                value={funcSearch}
                onChangeText={setFuncSearch}
                inputStyle={styles.searchInput}
                placeholder="Pesquisar funcionário..."
                iconColor={Colors.textMuted}
              />
            </View>
          </View>

          {/* Department filter — dropdown */}
          <View style={styles.deptScroll}>
            {Platform.OS === 'web' ? (
              <View style={styles.deptDropWrap}>
                {deptFiltro !== 'todos' && (
                  <MaterialCommunityIcons name={DEPT_ICONS[deptFiltro] as any} size={14} color={DEPT_COLORS[deptFiltro]} />
                )}
                {deptFiltro === 'todos' && <Ionicons name="layers-outline" size={14} color={Colors.textMuted} />}
                {/* @ts-ignore */}
                <select
                  value={deptFiltro}
                  onChange={(e: any) => setDeptFiltro(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: deptFiltro !== 'todos' ? DEPT_COLORS[deptFiltro as DepartamentoKey] : '#A0A8B8', fontSize: 13, fontFamily: 'Inter_500Medium', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 24 }}
                >
                  <option value="todos" style={{ background: '#1A2035', color: '#E2E8F0' }}>
                    Todos ({funcionarios.filter(f => f.ativo).length})
                  </option>
                  {DEPARTAMENTOS.map(d => (
                    <option key={d.key} value={d.key} style={{ background: '#1A2035', color: '#E2E8F0' }}>
                      {d.label} ({funcionarios.filter(f => f.departamento === d.key && f.ativo).length})
                    </option>
                  ))}
                </select>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.deptDropWrap} onPress={() => { setDeptSearch(''); setDeptModalOpen(true); }}>
                  {deptFiltro !== 'todos'
                    ? <MaterialCommunityIcons name={DEPT_ICONS[deptFiltro] as any} size={14} color={DEPT_COLORS[deptFiltro]} />
                    : <Ionicons name="layers-outline" size={14} color={Colors.textMuted} />
                  }
                  <Text style={[styles.deptDropTxt, deptFiltro !== 'todos' && { color: DEPT_COLORS[deptFiltro as DepartamentoKey] }]} numberOfLines={1}>
                    {deptFiltro === 'todos'
                      ? `Todos (${funcionarios.filter(f => f.ativo).length})`
                      : `${DEPARTAMENTOS.find(d => d.key === deptFiltro)?.label ?? deptFiltro} (${funcionarios.filter(f => f.departamento === deptFiltro && f.ativo).length})`
                    }
                  </Text>
                  {deptFiltro !== 'todos' ? (
                    <TouchableOpacity onPress={() => setDeptFiltro('todos')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
                <Modal visible={deptModalOpen} transparent animationType="slide" onRequestClose={() => setDeptModalOpen(false)}>
                  <Pressable style={styles.deptModalOverlay} onPress={() => setDeptModalOpen(false)} />
                  <View style={styles.deptModalSheet}>
                    <View style={styles.deptModalHandle} />
                    <View style={styles.deptModalHeader}>
                      <Text style={styles.deptModalTitle}>Departamento</Text>
                      <TouchableOpacity onPress={() => setDeptModalOpen(false)}>
                        <Ionicons name="close" size={20} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <TextInput style={styles.deptModalSearch} placeholder="Pesquisar departamento…" placeholderTextColor={Colors.textMuted} value={deptSearch} onChangeText={setDeptSearch} autoFocus />
                    <ScrollView>
                      <TouchableOpacity style={styles.deptModalOption} onPress={() => { setDeptFiltro('todos'); setDeptModalOpen(false); }}>
                        <Ionicons name="layers-outline" size={15} color={Colors.textMuted} />
                        <Text style={[styles.deptModalOptTxt, deptFiltro === 'todos' && { color: Colors.goldLight, fontFamily: 'Inter_700Bold' }]}>
                          Todos ({funcionarios.filter(f => f.ativo).length})
                        </Text>
                        {deptFiltro === 'todos' && <Ionicons name="checkmark" size={16} color={Colors.gold} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                      {DEPARTAMENTOS
                        .filter(d => d.label.toLowerCase().includes(deptSearch.toLowerCase()))
                        .map(d => {
                          const count = funcionarios.filter(f => f.departamento === d.key && f.ativo).length;
                          const color = DEPT_COLORS[d.key];
                          const isActive = deptFiltro === d.key;
                          return (
                            <TouchableOpacity key={d.key} style={styles.deptModalOption} onPress={() => { setDeptFiltro(d.key); setDeptModalOpen(false); }}>
                              <MaterialCommunityIcons name={DEPT_ICONS[d.key] as any} size={15} color={color} />
                              <Text style={[styles.deptModalOptTxt, isActive && { color, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                                {d.label} ({count})
                              </Text>
                              {isActive && <Ionicons name="checkmark" size={16} color={color} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>
                </Modal>
              </>
            )}
          </View>

          {funcLoading ? (
            <View style={{ padding: 12 }}>
              <SkeletonList rows={5} withAvatar />
            </View>
          ) : funcFiltrados.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-group" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum funcionário registado</Text>
              <Text style={styles.emptySub}>Clique no botão + para registar o primeiro funcionário</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 90 }}
              refreshControl={<RefreshControl refreshing={funcRefreshing} onRefresh={() => loadFuncionarios(true)} tintColor={Colors.gold} />}
            >
              {deptFiltro === 'todos' ? (
                // Grouped by department
                Object.entries(funcPorDepto).map(([deptKey, funcs]) => {
                  const dept = getDepartamentoByKey(deptKey as DepartamentoKey);
                  const color = DEPT_COLORS[deptKey as DepartamentoKey] || Colors.gold;
                  return (
                    <View key={deptKey} style={{ marginBottom: 20 }}>
                      <View style={styles.deptHeader}>
                        <View style={[styles.deptIconWrap, { backgroundColor: color + '22' }]}>
                          <MaterialCommunityIcons name={DEPT_ICONS[deptKey as DepartamentoKey] as any} size={16} color={color} />
                        </View>
                        <Text style={[styles.deptHeaderText, { color }]}>{dept?.label || deptKey}</Text>
                        <View style={[styles.deptCountBadge, { backgroundColor: color + '33' }]}>
                          <Text style={[styles.deptCountText, { color }]}>{funcs.length}</Text>
                        </View>
                      </View>
                      {funcs.map(f => <FuncCard key={f.id} f={f} onPress={() => { setSelectedFunc(f); setShowDetailModal(true); }} />)}
                    </View>
                  );
                })
              ) : (
                funcFiltrados.map(f => <FuncCard key={f.id} f={f} onPress={() => { setSelectedFunc(f); setShowDetailModal(true); }} />)
              )}
            </ScrollView>
          )}

          {/* FAB */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => { setEditingFunc(null); setFuncForm(emptyFuncionario()); setSubsidiosCustom([]); setFormStep('pessoal'); setFuncFormErrors({}); setCompletedSteps(new Set()); setShowFuncForm(true); }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.fabTxt}>Novo Funcionário</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── SUMÁRIOS TAB ────────────────────────────────────────────────── */}
      {tab === 'sumarios' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <View style={styles.filterInner}>
              {(['pendente', 'aceite', 'rejeitado', 'todos'] as const).map(f => (
                <TouchableOpacity key={f} style={[styles.filterBtn, filtro === f && styles.filterBtnActive]} onPress={() => setFiltro(f)}>
                  <Text style={[styles.filterText, filtro === f && styles.filterTextActive]}>
                    {f === 'pendente' ? 'Pendentes' : f === 'aceite' ? 'Aceites' : f === 'rejeitado' ? 'Rejeitados' : 'Todos'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <FlatList
            data={sumariosOrdenados}
            keyExtractor={s => s.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nenhum sumário</Text></View>}
            renderItem={({ item: s }) => {
              const sc = s.status === 'aceite' ? Colors.success : s.status === 'rejeitado' ? Colors.danger : Colors.warning;
              return (
                <TouchableOpacity style={[styles.card, { borderLeftColor: sc, borderLeftWidth: 3 }]} onPress={() => setSelectedSumario(s.id)} activeOpacity={0.8}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{s.professorNome}</Text>
                      <Text style={styles.cardSub}>{s.disciplina} · {s.turmaNome} · Aula {s.numeroAula}</Text>
                      <Text style={styles.cardDate}>{s.data} · {s.horaInicio}–{s.horaFim}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                      <Text style={[styles.statusText, { color: sc }]}>{s.status === 'aceite' ? 'Aceite' : s.status === 'rejeitado' ? 'Rejeitado' : 'Pendente'}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardConteudo} numberOfLines={2}>{s.conteudo}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}

      {/* ── SOLICITAÇÕES TAB ─────────────────────────────────────────────── */}
      {tab === 'solicitacoes' && (
        <FlatList
          data={solicitacoes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Nenhuma solicitação</Text></View>}
          renderItem={({ item: sol }) => {
            const sc = sol.status === 'aprovada' ? Colors.success : sol.status === 'rejeitada' ? Colors.danger : Colors.warning;
            return (
              <TouchableOpacity style={[styles.card, sol.status === 'pendente' && { borderLeftColor: Colors.warning, borderLeftWidth: 3 }]} onPress={() => sol.status === 'pendente' && setSelectedSolicitude(sol.id)} activeOpacity={0.8}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{sol.professorNome}</Text>
                    <Text style={styles.cardSub}>{sol.disciplina} · {sol.turmaNome} · T{sol.trimestre}</Text>
                    <Text style={styles.cardDate}>{timeAgo(sol.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc + '22' }]}>
                    <Text style={[styles.statusText, { color: sc }]}>{sol.status === 'aprovada' ? 'Aprovada' : sol.status === 'rejeitada' ? 'Rejeitada' : 'Pendente'}</Text>
                  </View>
                </View>
                <Text style={styles.cardConteudo} numberOfLines={2}>Motivo: {sol.motivo}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── ASSIDUIDADE TAB ──────────────────────────────────────────────── */}
      {tab === 'assiduidade' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
          refreshControl={<RefreshControl refreshing={assiduidadeLoading} onRefresh={() => loadAssiduidade()} />}
        >
          {/* Filtros de mês/ano */}
          <View style={assStyles.filterBar}>
            <View style={assStyles.mesAnoRow}>
              <View style={{ flex: 1 }}>
                <Text style={assStyles.filterLabel}>Mês</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => {
                      const isAct = assiduidadeMes === i + 1;
                      return (
                        <TouchableOpacity key={i} style={[assStyles.mesPill, isAct && assStyles.mesPillActive]}
                          onPress={() => { setAssiduidadeMes(i + 1); loadAssiduidade(i + 1, assiduidadeAno, assiduidadeDept); }}>
                          <Text style={[assStyles.mesPillText, isAct && assStyles.mesPillTextActive]}>{m}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
              <View style={assStyles.anoWrap}>
                <TouchableOpacity onPress={() => { const y = assiduidadeAno - 1; setAssiduidadeAno(y); loadAssiduidade(assiduidadeMes, y, assiduidadeDept); }}>
                  <Ionicons name="chevron-back" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={assStyles.anoText}>{assiduidadeAno}</Text>
                <TouchableOpacity onPress={() => { const y = assiduidadeAno + 1; setAssiduidadeAno(y); loadAssiduidade(assiduidadeMes, y, assiduidadeDept); }}>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Filtro departamento */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['todos', ...DEPARTAMENTOS.map(d => d.key)] as const).map(dk => {
                  const isAct = assiduidadeDept === dk;
                  const label = dk === 'todos' ? 'Todos' : DEPARTAMENTOS.find(d => d.key === dk)?.label?.split(' ')[0] ?? dk;
                  return (
                    <TouchableOpacity key={dk} style={[assStyles.deptChip, isAct && assStyles.deptChipActive]}
                      onPress={() => { setAssiduidadeDept(dk as any); loadAssiduidade(assiduidadeMes, assiduidadeAno, dk as any); }}>
                      <Text style={[assStyles.deptChipText, isAct && assStyles.deptChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Resumo totais */}
          {assiduidadeData && (
            <View style={assStyles.totaisCard}>
              <View style={assStyles.totaisRow}>
                <View style={assStyles.totaisItem}>
                  <Text style={[assStyles.totaisNum, { color: Colors.danger }]}>{assiduidadeData.totais.totalInjustificadas}</Text>
                  <Text style={assStyles.totaisLabel}>Inj.</Text>
                </View>
                <View style={assStyles.totaisDivider} />
                <View style={assStyles.totaisItem}>
                  <Text style={[assStyles.totaisNum, { color: Colors.warning }]}>{assiduidadeData.totais.totalJustificadas}</Text>
                  <Text style={assStyles.totaisLabel}>Just.</Text>
                </View>
                <View style={assStyles.totaisDivider} />
                <View style={assStyles.totaisItem}>
                  <Text style={[assStyles.totaisNum, { color: Colors.info }]}>{assiduidadeData.totais.totalMeiosDias}</Text>
                  <Text style={assStyles.totaisLabel}>½ Dia</Text>
                </View>
                <View style={assStyles.totaisDivider} />
                <View style={assStyles.totaisItem}>
                  <Text style={[assStyles.totaisNum, { color: Colors.gold }]}>{assiduidadeData.totais.comFaltas}</Text>
                  <Text style={assStyles.totaisLabel}>C/ Faltas</Text>
                </View>
                <View style={assStyles.totaisDivider} />
                <View style={assStyles.totaisItem}>
                  <Text style={[assStyles.totaisNum, { color: Colors.success }]}>{assiduidadeData.totais.semFaltas}</Text>
                  <Text style={assStyles.totaisLabel}>Sem Faltas</Text>
                </View>
              </View>
              {assiduidadeData.totais.totalDescontos > 0 && (
                <View style={assStyles.descontoTotalRow}>
                  <MaterialCommunityIcons name="cash-minus" size={16} color={Colors.danger} />
                  <Text style={assStyles.descontoTotalText}>
                    Desconto total estimado: <Text style={{ color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{assiduidadeData.totais.totalDescontos.toLocaleString('pt-AO')} Kz</Text>
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Loading */}
          {assiduidadeLoading && !assiduidadeData && (
            <View style={styles.empty}><Text style={styles.emptyText}>A carregar...</Text></View>
          )}

          {/* Lista de funcionários */}
          {assiduidadeData && assiduidadeData.relatorio.map(item => {
            const isExp = assiduidadeExpanded === item.funcionarioId;
            const hasFaltas = item.totalFaltas > 0;
            const initials = `${String(item.nome || '').charAt(0)}${String(item.apelido || '').charAt(0)}`.toUpperCase();
            return (
              <TouchableOpacity key={item.funcionarioId}
                style={[assStyles.funcCard, hasFaltas && { borderLeftColor: Colors.danger, borderLeftWidth: 3 }]}
                onPress={() => setAssiduidadeExpanded(isExp ? null : item.funcionarioId)}
                activeOpacity={0.8}
              >
                <View style={assStyles.funcCardTop}>
                  <View style={[assStyles.avatar, { backgroundColor: hasFaltas ? Colors.danger + '22' : Colors.success + '22' }]}>
                    <Text style={[assStyles.avatarText, { color: hasFaltas ? Colors.danger : Colors.success }]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={assStyles.funcName}>{item.nome} {item.apelido}</Text>
                    <Text style={assStyles.funcCargo}>{item.cargo} · {item.departamento}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {hasFaltas ? (
                      <View style={assStyles.faltasBadge}>
                        <Text style={assStyles.faltasBadgeText}>{item.totalFaltas} falta{item.totalFaltas !== 1 ? 's' : ''}</Text>
                      </View>
                    ) : (
                      <View style={assStyles.semFaltasBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={assStyles.semFaltasText}>Presente</Text>
                      </View>
                    )}
                    {item.descontoEstimado > 0 && (
                      <Text style={assStyles.descontoText}>-{item.descontoEstimado.toLocaleString('pt-AO')} Kz</Text>
                    )}
                  </View>
                </View>

                {/* Mini-barras de faltas */}
                {hasFaltas && (
                  <View style={assStyles.barsRow}>
                    {item.faltasInjustificadas > 0 && (
                      <View style={[assStyles.bar, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '44' }]}>
                        <MaterialCommunityIcons name="close-circle-outline" size={11} color={Colors.danger} />
                        <Text style={[assStyles.barText, { color: Colors.danger }]}>{item.faltasInjustificadas} inj.</Text>
                      </View>
                    )}
                    {item.faltasJustificadas > 0 && (
                      <View style={[assStyles.bar, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '44' }]}>
                        <MaterialCommunityIcons name="file-document-outline" size={11} color={Colors.warning} />
                        <Text style={[assStyles.barText, { color: Colors.warning }]}>{item.faltasJustificadas} just.</Text>
                      </View>
                    )}
                    {item.meiosDias > 0 && (
                      <View style={[assStyles.bar, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '44' }]}>
                        <MaterialCommunityIcons name="clock-half" size={11} color={Colors.info} />
                        <Text style={[assStyles.barText, { color: Colors.info }]}>{item.meiosDias} ½ dia</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Detalhe expandido */}
                {isExp && hasFaltas && (
                  <View style={assStyles.detalheBox}>
                    <Text style={assStyles.detalheTitulo}>Registos de faltas</Text>
                    {item.faltas.map((f, idx) => (
                      <View key={idx} style={assStyles.detalheRow}>
                        <View style={[assStyles.detalheDot, {
                          backgroundColor: f.tipo === 'injustificada' ? Colors.danger : f.tipo === 'justificada' ? Colors.warning : Colors.info
                        }]} />
                        <Text style={assStyles.detalheData}>{f.data}</Text>
                        <Text style={assStyles.detalheTipo}>
                          {f.tipo === 'injustificada' ? 'Injustificada' : f.tipo === 'justificada' ? 'Justificada' : '½ Dia'}
                        </Text>
                        {f.motivo ? <Text style={assStyles.detalheMotivo} numberOfLines={1}>{f.motivo}</Text> : null}
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {assiduidadeData && assiduidadeData.relatorio.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Sem dados para este período</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL — Registar / Editar Funcionário */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showFuncForm} transparent animationType="slide" onRequestClose={() => { setShowFuncForm(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { maxHeight: '95%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingFunc ? 'Editar Funcionário' : 'Registar Funcionário'}</Text>
              <TouchableOpacity onPress={() => setShowFuncForm(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Step tabs */}
            <View style={styles.stepRow}>
              {([
                { id: 'pessoal', label: 'Pessoal' },
                { id: 'organizacao', label: 'Cargo' },
                { id: 'contrato', label: 'Contrato' },
                { id: 'salarial', label: 'Salarial' },
              ] as const).map((s, idx) => {
                const isActive = formStep === s.id;
                const isDone = completedSteps.has(s.id) && !isActive;
                const currentIdx = FUNC_STEPS.indexOf(formStep);
                const isLocked = idx > currentIdx && !completedSteps.has(FUNC_STEPS[idx - 1] as typeof formStep);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.stepBtn,
                      isActive && styles.stepBtnActive,
                      isDone && styles.stepBtnDone,
                      isLocked && styles.stepBtnLocked,
                    ]}
                    onPress={() => handleStepTabClick(s.id)}
                  >
                    {isDone
                      ? <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                      : isLocked
                        ? <Ionicons name="lock-closed" size={12} color={Colors.textMuted} />
                        : <Text style={[styles.stepNum, isActive && { color: '#fff' }]}>{idx + 1}</Text>
                    }
                    <Text style={[styles.stepText, isActive && styles.stepTextActive, isDone && { color: Colors.success }, isLocked && { color: Colors.textMuted }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* ── Step: Dados Pessoais ── */}
              {formStep === 'pessoal' && (
                <>
                  {/* ── Foto de Perfil ── */}
                  <View style={styles.fotoPickerRow}>
                    <View style={{ position: 'relative', width: 80, height: 80 }}>
                      <TouchableOpacity style={styles.fotoPicker} onPress={pickFoto} disabled={fotoUploading}>
                        {fotoUploading ? (
                          <AppLoader size="small" color={Colors.accent} />
                        ) : funcForm.foto ? (
                          <Image source={{ uri: funcForm.foto }} style={styles.fotoImg} />
                        ) : (
                          <View style={styles.fotoPlaceholder}>
                            <MaterialCommunityIcons name="account" size={44} color={Colors.textMuted} />
                          </View>
                        )}
                      </TouchableOpacity>
                      <View style={styles.fotoCamera}>
                        <Ionicons name="camera" size={14} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { marginBottom: 4 }]}>FOTO DE PERFIL</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                        Toque no círculo para seleccionar uma foto da galeria.{'\n'}Formatos: JPG, PNG (máx. 5 MB)
                      </Text>
                      {funcForm.foto ? (
                        <TouchableOpacity onPress={() => updateField('foto', '')} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="trash-outline" size={13} color={Colors.danger} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger }}>Remover foto</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <FormRow label="Nome *" error={funcFormErrors.nome}>
                    <TextInput style={[styles.input, !!funcFormErrors.nome && styles.inputError]} placeholder="Nome" placeholderTextColor={Colors.textMuted} value={funcForm.nome} onChangeText={v => { updateField('nome', v); if (funcFormErrors.nome) setFuncFormErrors(e => ({ ...e, nome: '' })); }} returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Apelido">
                    <TextInput style={styles.input} placeholder="Apelido" placeholderTextColor={Colors.textMuted} value={funcForm.apelido} onChangeText={v => updateField('apelido', v)} returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Género">
                    <View style={styles.pillRow}>
                      {GENERO.map(g => (
                        <TouchableOpacity key={g.id} style={[styles.pill, funcForm.genero === g.id && styles.pillActive]} onPress={() => updateField('genero', g.id)}>
                          <Text style={[styles.pillText, funcForm.genero === g.id && styles.pillTextActive]}>{g.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </FormRow>
                  <DatePickerField
                    label="Data de Nascimento"
                    value={funcForm.dataNascimento}
                    onChange={v => { updateField('dataNascimento', v); if (funcFormErrors.dataNascimento) setFuncFormErrors(e => ({ ...e, dataNascimento: '' })); }}
                    required
                    hasError={!!funcFormErrors.dataNascimento}
                    labelStyle={styles.fieldLabel}
                  />
                  {!!funcFormErrors.dataNascimento && <Text style={styles.inlineErrorText}>{funcFormErrors.dataNascimento}</Text>}
                  <FormRow label="Bilhete de Identidade (BI)" error={funcFormErrors.bi}>
                    <TextInput style={[styles.input, !!funcFormErrors.bi && styles.inputError]} placeholder="000000000LA000" placeholderTextColor={Colors.textMuted} value={funcForm.bi} onChangeText={v => { updateField('bi', v); if (funcFormErrors.bi) setFuncFormErrors(e => ({ ...e, bi: '' })); }} autoCapitalize="characters" returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Telefone">
                    <TextInput style={styles.input} placeholder="+244 9XX XXX XXX" placeholderTextColor={Colors.textMuted} value={funcForm.telefone} onChangeText={v => updateField('telefone', v)} keyboardType="phone-pad" returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Email">
                    <TextInput style={styles.input} placeholder="email@escola.ao" placeholderTextColor={Colors.textMuted} value={funcForm.email} onChangeText={v => updateField('email', v)} keyboardType="email-address" autoCapitalize="none" returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Província">
                    <TextInput style={styles.input} placeholder="Ex: Luanda" placeholderTextColor={Colors.textMuted} value={funcForm.provincia} onChangeText={v => updateField('provincia', v)} returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Município">
                    <TextInput style={styles.input} placeholder="Ex: Belas" placeholderTextColor={Colors.textMuted} value={funcForm.municipio} onChangeText={v => updateField('municipio', v)} returnKeyType="done" onSubmitEditing={saveFuncionario} />
                  </FormRow>
                  <FormRow label="Morada">
                    <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top' }]} placeholder="Endereço completo" placeholderTextColor={Colors.textMuted} value={funcForm.morada} onChangeText={v => updateField('morada', v)} multiline />
                  </FormRow>
                </>
              )}

              {/* ── Step: Organização ── */}
              {formStep === 'organizacao' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Text style={styles.sectionLabel}>Departamento<RequiredMark /></Text>
                    {!!funcFormErrors.departamento && <Text style={styles.inlineErrorText}>{funcFormErrors.departamento}</Text>}
                  </View>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {DEPARTAMENTOS.map(d => {
                      const color = DEPT_COLORS[d.key];
                      const isActive = funcForm.departamento === d.key;
                      return (
                        <TouchableOpacity
                          key={d.key}
                          style={[styles.deptOption, isActive && { borderColor: color, backgroundColor: color + '15' }]}
                          onPress={() => { updateField('departamento', d.key); if (funcFormErrors.departamento) setFuncFormErrors(e => ({ ...e, departamento: '' })); }}
                        >
                          <View style={[styles.deptOptionIcon, { backgroundColor: color + '22' }]}>
                            <MaterialCommunityIcons name={DEPT_ICONS[d.key] as any} size={20} color={color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.deptOptionLabel, isActive && { color }]}>{d.label}</Text>
                            <Text style={styles.deptOptionDesc} numberOfLines={1}>{d.descricao}</Text>
                          </View>
                          {isActive && <Ionicons name="checkmark-circle" size={20} color={color} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Text style={styles.sectionLabel}>Cargo / Categoria<RequiredMark /></Text>
                    {!!funcFormErrors.cargo && <Text style={styles.inlineErrorText}>{funcFormErrors.cargo}</Text>}
                  </View>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    {cargosForForm.map(c => {
                      const isActive = funcForm.cargo === c.id;
                      const deptColor = DEPT_COLORS[funcForm.departamento as DepartamentoKey] || Colors.gold;
                      const nivelColor = c.nivelAcesso === 'total' ? Colors.danger : c.nivelAcesso === 'operacional' ? Colors.success : c.nivelAcesso === 'limitado' ? Colors.warning : Colors.textMuted;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.cargoOption, isActive && { borderColor: deptColor, backgroundColor: deptColor + '12' }]}
                          onPress={() => { updateField('cargo', c.id); if (funcFormErrors.cargo) setFuncFormErrors(e => ({ ...e, cargo: '' })); }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cargoLabel, isActive && { color: deptColor }]}>{c.label}</Text>
                            <Text style={styles.cargoDesc} numberOfLines={1}>{c.descricao}</Text>
                          </View>
                          <View style={[styles.nivelBadge, { backgroundColor: nivelColor + '22' }]}>
                            <Text style={[styles.nivelText, { color: nivelColor }]}>
                              {c.nivelAcesso === 'total' ? 'Total' : c.nivelAcesso === 'operacional' ? 'Operacional' : c.nivelAcesso === 'limitado' ? 'Limitado' : 'Sem acesso'}
                            </Text>
                          </View>
                          {isActive && <Ionicons name="checkmark-circle" size={18} color={deptColor} style={{ marginLeft: 4 }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* ── Secção / Unidade Orgânica ── */}
                  {funcForm.departamento && (
                    <>
                      <View style={{ marginBottom: 6 }}>
                        <Text style={styles.sectionLabel}>Secção / Unidade Orgânica</Text>
                        <Text style={styles.sectionNote}>Unidade onde o funcionário será alocado neste departamento.</Text>
                      </View>
                      <OptionChips
                        options={SECCOES_POR_DEPARTAMENTO[funcForm.departamento as DepartamentoKey] ?? []}
                        value={funcForm.seccao ?? ''}
                        onSelect={v => updateField('seccao', v)}
                        accentColor={DEPT_COLORS[funcForm.departamento as DepartamentoKey] || Colors.accent}
                        placeholder="Nome da secção..."
                      />
                      <View style={{ height: 14 }} />
                    </>
                  )}

                  {/* ── Especialidade / Área ── */}
                  {funcForm.departamento && (
                    <>
                      <View style={{ marginBottom: 6 }}>
                        <Text style={styles.sectionLabel}>Especialidade / Área</Text>
                        <Text style={styles.sectionNote}>Disciplina ou área de actuação principal.</Text>
                      </View>
                      <OptionChips
                        options={ESPECIALIDADES_POR_DEPARTAMENTO[funcForm.departamento as DepartamentoKey] ?? []}
                        value={funcForm.especialidade ?? ''}
                        onSelect={v => updateField('especialidade', v)}
                        accentColor={DEPT_COLORS[funcForm.departamento as DepartamentoKey] || Colors.accent}
                        placeholder="Área de especialidade..."
                      />
                      <View style={{ height: 14 }} />
                    </>
                  )}

                  {/* ── Habilitações Académicas ── */}
                  {(() => {
                    const isByTempo = funcForm.tipoContrato === 'prestacao_servicos'
                      || funcForm.tipoContrato === 'temporario'
                      || funcForm.tipoContrato === 'contratado';
                    const habColor = Colors.gold;
                    const valorTempo = funcForm.valorPorTempoLectivo ?? 0;
                    const tempos = funcForm.temposSemanais ?? 0;
                    const habSelecionada = getHabilitacaoById(funcForm.habilitacoes ?? '');
                    return (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text style={styles.sectionLabel}>Habilitações Académicas<RequiredMark /></Text>
                          {!!funcFormErrors.habilitacoes && <Text style={styles.inlineErrorText}>{funcFormErrors.habilitacoes}</Text>}
                        </View>
                        {isByTempo && (
                          <View style={{ backgroundColor: '#C89A2A18', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#C89A2A33' }}>
                            <Text style={{ fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>
                              Contratos por tempo lectivo — como funciona:
                            </Text>
                            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                              Selecciona a habilitação → define o valor por tempo → o salário mensal é calculado automaticamente (Valor × Tempos semanais × 4).
                            </Text>
                          </View>
                        )}
                        <View style={{ gap: 6, marginBottom: 16 }}>
                          {HABILITACOES_ACADEMICAS.map(h => {
                            const isActive = funcForm.habilitacoes === h.id;
                            return (
                              <View key={h.id}>
                                <TouchableOpacity
                                  style={[styles.cargoOption, isActive && { borderColor: habColor, backgroundColor: habColor + '12', borderBottomLeftRadius: isByTempo && isActive ? 0 : undefined, borderBottomRightRadius: isByTempo && isActive ? 0 : undefined }]}
                                  onPress={() => {
                                    updateField('habilitacoes', h.id);
                                    if (funcFormErrors.habilitacoes) setFuncFormErrors(e => ({ ...e, habilitacoes: '' }));
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.cargoLabel, isActive && { color: habColor }]}>{h.label}</Text>
                                    <Text style={styles.cargoDesc}>{h.descricao}</Text>
                                    {!isActive && isByTempo && (
                                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                                        Referência: {h.valorTempoLectivoSugerido.toLocaleString('pt-AO')} Kz / tempo lectivo
                                      </Text>
                                    )}
                                  </View>
                                  {isActive
                                    ? <Ionicons name="checkmark-circle" size={18} color={habColor} style={{ marginLeft: 8 }} />
                                    : <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} style={{ marginLeft: 8 }} />
                                  }
                                </TouchableOpacity>

                                {/* ── Painel expandido: define o valor por tempo ── */}
                                {isActive && isByTempo && (
                                  <View style={{
                                    backgroundColor: habColor + '0E',
                                    borderWidth: 1,
                                    borderTopWidth: 0,
                                    borderColor: habColor + '55',
                                    borderBottomLeftRadius: 10,
                                    borderBottomRightRadius: 10,
                                    padding: 12,
                                    marginBottom: 4,
                                  }}>
                                    <Text style={{ fontSize: 12, color: habColor, fontFamily: 'Inter_700Bold', marginBottom: 8 }}>
                                      💰 Define o valor por tempo lectivo para {h.label}
                                    </Text>

                                    {/* Input do valor */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', marginBottom: 4 }}>
                                          Valor por Tempo Lectivo (AOA)<Text style={{ color: Colors.danger }}> *</Text>
                                        </Text>
                                        <TextInput
                                          style={[styles.input, { borderColor: habColor + '66' }]}
                                          placeholder={h.valorTempoLectivoSugerido.toString()}
                                          placeholderTextColor={Colors.textMuted}
                                          value={valorTempo === 0 ? '' : valorTempo.toString()}
                                          onChangeText={v => updateField('valorPorTempoLectivo', parseFloat(v.replace(/[^0-9.]/g, '')) || 0)}
                                          keyboardType="numeric"
                                          returnKeyType="done"
                                        />
                                      </View>
                                      {/* Botão de atalho para o valor sugerido */}
                                      <TouchableOpacity
                                        onPress={() => updateField('valorPorTempoLectivo', h.valorTempoLectivoSugerido)}
                                        style={{
                                          marginTop: 20,
                                          paddingHorizontal: 10,
                                          paddingVertical: 10,
                                          borderRadius: 8,
                                          borderWidth: 1,
                                          borderColor: habColor + '55',
                                          backgroundColor: habColor + '18',
                                        }}
                                      >
                                        <Text style={{ fontSize: 11, color: habColor, fontFamily: 'Inter_600SemiBold' }}>
                                          Usar {h.valorTempoLectivoSugerido.toLocaleString('pt-AO')}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>

                                    {/* Preview do cálculo */}
                                    {valorTempo > 0 && (
                                      <View style={{ backgroundColor: habColor + '12', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: habColor + '30' }}>
                                        <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>
                                          Cálculo mensal estimado:
                                        </Text>
                                        <Text style={{ fontSize: 12, color: habColor, fontFamily: 'Inter_600SemiBold', marginTop: 3 }}>
                                          {valorTempo.toLocaleString('pt-AO')} Kz × {tempos > 0 ? tempos : '?'} tempos × 4 semanas
                                          {tempos > 0
                                            ? ` = ${(valorTempo * tempos * 4).toLocaleString('pt-AO')} Kz / mês`
                                            : ' — define o nº de tempos no passo Salarial'}
                                        </Text>
                                      </View>
                                    )}
                                    {valorTempo === 0 && (
                                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>
                                        Introduz o valor acima ou usa o valor de referência ({h.valorTempoLectivoSugerido.toLocaleString('pt-AO')} Kz).
                                      </Text>
                                    )}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>

                        {/* Resumo do valor definido (se habilitação já seleccionada e isByTempo) */}
                        {isByTempo && habSelecionada && valorTempo > 0 && (
                          <View style={{ backgroundColor: '#22C47A18', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#22C47A33', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, color: Colors.success, fontFamily: 'Inter_700Bold' }}>
                                Valor definido: {valorTempo.toLocaleString('pt-AO')} Kz / tempo lectivo
                              </Text>
                              <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>
                                {habSelecionada.label} — define o nº de tempos semanais no passo Salarial para ver o total mensal.
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {/* ── Step: Contrato ── */}
              {formStep === 'contrato' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Text style={styles.sectionLabel}>Tipo de Vínculo<RequiredMark /></Text>
                    {!!funcFormErrors.tipoContrato && <Text style={styles.inlineErrorText}>{funcFormErrors.tipoContrato}</Text>}
                  </View>
                  <View style={styles.pillRow}>
                    {TIPO_CONTRATO.map(t => (
                      <TouchableOpacity key={t.id} style={[styles.pill, funcForm.tipoContrato === t.id && styles.pillActive]} onPress={() => { updateField('tipoContrato', t.id); if (funcFormErrors.tipoContrato) setFuncFormErrors(e => ({ ...e, tipoContrato: '' })); }}>
                        <Text style={[styles.pillText, funcForm.tipoContrato === t.id && styles.pillTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={styles.sectionLabel}>Data de Contratação<RequiredMark /></Text>
                    {!!funcFormErrors.dataContratacao && <Text style={styles.inlineErrorText}>{funcFormErrors.dataContratacao}</Text>}
                  </View>
                  <DateInput style={[styles.input, !!funcFormErrors.dataContratacao && { borderColor: Colors.danger }]} value={funcForm.dataContratacao} onChangeText={v => { updateField('dataContratacao', v); if (funcFormErrors.dataContratacao) setFuncFormErrors(e => ({ ...e, dataContratacao: '' })); }} />
                  <FormRow label="Data de Fim de Contrato (se aplicável)">
                    <DateInput style={styles.input} value={funcForm.dataFimContrato} onChangeText={v => updateField('dataFimContrato', v)} placeholder="DD-MM-AAAA (vazio se sem prazo)" />
                  </FormRow>
                  <FormRow label="Observações">
                    <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Notas sobre o contrato..." placeholderTextColor={Colors.textMuted} value={funcForm.observacoes} onChangeText={v => updateField('observacoes', v)} multiline />
                  </FormRow>
                </>
              )}

              {/* ── Step: Salarial ── */}
              {formStep === 'salarial' && (() => {
                const isByTempo = funcForm.tipoContrato === 'contratado'
                  || funcForm.tipoContrato === 'prestacao_servicos'
                  || funcForm.tipoContrato === 'temporario';
                const salBase = funcForm.salarioBase ?? 0;
                const valorTempo = funcForm.valorPorTempoLectivo ?? 0;
                const tempos = funcForm.temposSemanais ?? 0;
                const remTempos = valorTempo * tempos * 4;
                const totalSubsidios = subsidiosCustom.reduce((sum, s) => sum + (salBase * s.percentagem / 100), 0);
                const salarioBruto = salBase + totalSubsidios;
                return (
                  <>
                    <Text style={styles.sectionNote}>Os valores são em Kwanzas (AOA). Os subsídios são calculados como percentagem do salário base e alimentam automaticamente o processamento salarial (IRT + INSS).</Text>

                    {/* ── Remuneração por Tempo Lectivo (contratados/prestação/temporários) ── */}
                    {isByTempo && (() => {
                      const hab = getHabilitacaoById(funcForm.habilitacoes ?? '');
                      return (
                        <View style={{ backgroundColor: '#0984E322', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#0984E344' }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#0984E3', marginBottom: 10 }}>
                            Remuneração por Tempo Lectivo
                          </Text>

                          {/* Valor vindo das habilitações */}
                          {valorTempo > 0 && hab ? (
                            <View style={{ marginBottom: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' }}>
                                  Valor por Tempo Lectivo (AOA)
                                </Text>
                                <TouchableOpacity
                                  onPress={() => { setFormStep('organizacao'); setFuncFormErrors({}); }}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  <Ionicons name="create-outline" size={13} color={Colors.accent} />
                                  <Text style={{ fontSize: 11, color: Colors.accent, fontFamily: 'Inter_500Medium' }}>Alterar</Text>
                                </TouchableOpacity>
                              </View>
                              <View style={{ backgroundColor: Colors.gold + '18', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.gold + '44', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialCommunityIcons name="school" size={16} color={Colors.gold} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 15, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>
                                    {valorTempo.toLocaleString('pt-AO')} Kz / tempo lectivo
                                  </Text>
                                  <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }}>
                                    Definido via {hab.label} — Passo 2 (Organização)
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ) : (
                            <View style={{ marginBottom: 12 }}>
                              <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: Colors.warning + '33' }}>
                                <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_600SemiBold' }}>
                                  ⚠️ Valor por tempo lectivo não definido.
                                </Text>
                                <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                                  Volta ao passo "Cargo" e selecciona as habilitações académicas para definir o valor.
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => { setFormStep('organizacao'); setFuncFormErrors({}); }}
                                style={{ backgroundColor: Colors.accent + '22', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.accent + '44' }}
                              >
                                <Text style={{ fontSize: 12, color: Colors.accent, fontFamily: 'Inter_600SemiBold' }}>
                                  ← Ir para Habilitações Académicas
                                </Text>
                              </TouchableOpacity>
                              {/* Edição directa como fallback */}
                              <View style={{ marginTop: 10 }}>
                                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>
                                  Ou introduz directamente aqui:
                                </Text>
                                <TextInput
                                  style={[styles.input, !!funcFormErrors.valorPorTempoLectivo && styles.inputError]}
                                  placeholder="Ex: 1500"
                                  placeholderTextColor={Colors.textMuted}
                                  value={valorTempo === 0 ? '' : valorTempo.toString()}
                                  onChangeText={v => {
                                    const n = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                                    updateField('valorPorTempoLectivo', n);
                                    if (n > 0 && funcFormErrors.valorPorTempoLectivo) {
                                      setFuncFormErrors(e => ({ ...e, valorPorTempoLectivo: '' }));
                                    }
                                  }}
                                  keyboardType="numeric"
                                  returnKeyType="next"
                                />
                                {!!funcFormErrors.valorPorTempoLectivo && (
                                  <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_500Medium', marginTop: 4 }}>
                                    {funcFormErrors.valorPorTempoLectivo}
                                  </Text>
                                )}
                              </View>
                            </View>
                          )}

                          {/* Nº de Tempos Semanais — sempre visível */}
                          <View style={{ marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={styles.label}>
                                Nº de Tempos Semanais<Text style={{ color: Colors.danger }}> *</Text>
                              </Text>
                              {!!funcFormErrors.temposSemanais && (
                                <Text style={styles.inlineErrorText}>{funcFormErrors.temposSemanais}</Text>
                              )}
                            </View>
                            <TextInput
                              style={[styles.input, !!funcFormErrors.temposSemanais && styles.inputError]}
                              placeholder="Ex: 20"
                              placeholderTextColor={Colors.textMuted}
                              value={tempos === 0 ? '' : tempos.toString()}
                              onChangeText={v => {
                                const n = parseInt(v.replace(/[^0-9]/g, '')) || 0;
                                updateField('temposSemanais', n);
                                if (n > 0 && funcFormErrors.temposSemanais) {
                                  setFuncFormErrors(e => ({ ...e, temposSemanais: '' }));
                                }
                              }}
                              keyboardType="numeric"
                              returnKeyType="done"
                            />
                            {!!funcFormErrors.temposSemanais && (
                              <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_500Medium', marginTop: 4 }}>
                                {funcFormErrors.temposSemanais}
                              </Text>
                            )}
                          </View>

                          {/* Cálculo final */}
                          {valorTempo > 0 && tempos > 0 && (
                            <View style={{ backgroundColor: '#0984E318', borderRadius: 8, padding: 12, marginTop: 4, borderWidth: 1, borderColor: '#0984E344' }}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>
                                {valorTempo.toLocaleString('pt-AO')} Kz × {tempos} tempos × 4 semanas =
                              </Text>
                              <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0984E3', marginTop: 4 }}>
                                {remTempos.toLocaleString('pt-AO')} Kz / mês
                              </Text>
                            </View>
                          )}
                          {valorTempo > 0 && tempos === 0 && (
                            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontStyle: 'italic', marginTop: 4 }}>
                              Introduz o nº de tempos semanais para calcular o salário mensal.
                            </Text>
                          )}
                        </View>
                      );
                    })()}

                    <FormRow label={isByTempo ? "Salário Base Fixo (AOA) — opcional" : "Salário Base (AOA)"}>
                      <TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.textMuted} value={funcForm.salarioBase?.toString()} onChangeText={v => updateField('salarioBase', parseFloat(v) || 0)} keyboardType="numeric" returnKeyType="done" onSubmitEditing={saveFuncionario} />
                    </FormRow>

                    {/* ── Dynamic Subsidies ── */}
                    <View style={styles.subsidioSection}>
                      <View style={styles.subsidioHeader}>
                        <Text style={styles.subsidioTitle}>Subsídios</Text>
                        <TouchableOpacity
                          style={styles.subsidioAddBtn}
                          onPress={() => setSubsidiosCustom(prev => [...prev, { id: Date.now().toString(), nome: '', percentagem: 0 }])}
                        >
                          <Ionicons name="add-circle" size={20} color={Colors.gold} />
                          <Text style={styles.subsidioAddText}>Adicionar</Text>
                        </TouchableOpacity>
                      </View>

                      {subsidiosCustom.length === 0 && (
                        <Text style={styles.subsidioEmpty}>Nenhum subsídio adicionado. Clique em "Adicionar" para criar subsídios personalizados.</Text>
                      )}

                      {subsidiosCustom.map((sub, idx) => {
                        const valor = salBase * sub.percentagem / 100;
                        return (
                          <View key={sub.id} style={styles.subsidioRow}>
                            <View style={styles.subsidioRowTop}>
                              <TextInput
                                style={[styles.input, styles.subsidioNomeInput]}
                                placeholder="Nome do subsídio"
                                placeholderTextColor={Colors.textMuted}
                                value={sub.nome}
                                onChangeText={v => setSubsidiosCustom(prev => prev.map((s, i) => i === idx ? { ...s, nome: v } : s))}
                              />
                              <View style={styles.subsidioPercContainer}>
                                <TextInput
                                  style={[styles.input, styles.subsidioPercInput]}
                                  placeholder="0"
                                  placeholderTextColor={Colors.textMuted}
                                  value={sub.percentagem === 0 ? '' : sub.percentagem.toString()}
                                  onChangeText={v => setSubsidiosCustom(prev => prev.map((s, i) => i === idx ? { ...s, percentagem: parseFloat(v) || 0 } : s))}
                                  keyboardType="numeric"
                                />
                                <Text style={styles.subsidioPercSymbol}>%</Text>
                              </View>
                              <TouchableOpacity
                                style={styles.subsidioRemoveBtn}
                                onPress={() => setSubsidiosCustom(prev => prev.filter((_, i) => i !== idx))}
                              >
                                <Ionicons name="trash-outline" size={18} color="#e55" />
                              </TouchableOpacity>
                            </View>
                            {salBase > 0 && (
                              <Text style={styles.subsidioCalc}>
                                {sub.percentagem}% × {salBase.toLocaleString('pt-AO')} Kz = <Text style={styles.subsidioCalcVal}>{Math.round(valor).toLocaleString('pt-AO')} Kz</Text>
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    {/* ── Salary Summary ── */}
                    <View style={styles.totalBox}>
                      {isByTempo && valorTempo > 0 && tempos > 0 && (
                        <View style={styles.totalRow}>
                          <Text style={styles.totalLabel}>Remuneração Tempos ({tempos}×{valorTempo.toLocaleString('pt-AO')} Kz×4)</Text>
                          <Text style={[styles.totalValue, { color: '#0984E3' }]}>{remTempos.toLocaleString('pt-AO')} Kz</Text>
                        </View>
                      )}
                      {salBase > 0 && (
                        <View style={styles.totalRow}>
                          <Text style={styles.totalLabel}>Salário Base</Text>
                          <Text style={styles.totalValue}>{salBase.toLocaleString('pt-AO')} Kz</Text>
                        </View>
                      )}
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total Subsídios</Text>
                        <Text style={styles.totalValue}>{Math.round(totalSubsidios).toLocaleString('pt-AO')} Kz</Text>
                      </View>
                      <View style={[styles.totalRow, styles.totalRowFinal]}>
                        <Text style={styles.totalLabelBig}>
                          {isByTempo && valorTempo > 0 && tempos > 0 ? 'Remuneração Total Estimada' : 'Salário Bruto'}
                        </Text>
                        <Text style={styles.totalValueBig}>
                          {isByTempo && valorTempo > 0 && tempos > 0
                            ? (remTempos + salBase + Math.round(totalSubsidios)).toLocaleString('pt-AO')
                            : Math.round(salarioBruto).toLocaleString('pt-AO')
                          } Kz
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {/* Nav Buttons */}
              <View style={styles.stepNavRow}>
                {formStep !== 'pessoal' && (
                  <TouchableOpacity style={styles.stepNavBtn} onPress={() => {
                    const steps: typeof formStep[] = ['pessoal', 'organizacao', 'contrato', 'salarial'];
                    const idx = steps.indexOf(formStep);
                    setFormStep(steps[Math.max(0, idx - 1)]);
                  }}>
                    <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
                    <Text style={styles.stepNavText}>Anterior</Text>
                  </TouchableOpacity>
                )}
                {formStep !== 'salarial' ? (
                  <TouchableOpacity style={[styles.stepNavBtn, styles.stepNavBtnPrimary]} onPress={handleFuncNext}>
                    <Text style={[styles.stepNavText, { color: '#fff' }]}>Próximo</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.stepNavBtn, styles.stepNavBtnPrimary, funcSaving && { opacity: 0.6 }]} onPress={saveFuncionario} disabled={funcSaving}>
                    {funcSaving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
                    <Text style={[styles.stepNavText, { color: '#fff' }]}>Guardar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL — Detalhe do Funcionário */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showDetailModal && !!selectedFunc} transparent animationType="slide" onRequestClose={() => setShowDetailModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { maxHeight: '93%', padding: 0, overflow: 'hidden' }]}>
            {selectedFunc && (() => {
              const dept = getDepartamentoByKey(selectedFunc.departamento);
              const cargo = getCargoById(selectedFunc.cargo);
              const color = DEPT_COLORS[selectedFunc.departamento] || Colors.gold;
              const initials = `${selectedFunc.nome?.[0] || ''}${selectedFunc.apelido?.[0] || ''}`.toUpperCase();
              const vinculo = TIPO_CONTRATO.find(t => t.id === selectedFunc.tipoContrato)?.label || selectedFunc.tipoContrato;
              return (
                <>
                  {/* ── Cabeçalho com banda colorida ── */}
                  <View style={[styles.detailHeader, { backgroundColor: color + '1A' }]}>
                    <TouchableOpacity onPress={() => setShowDetailModal(false)} style={styles.detailCloseBtn}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.detailAvatar, { backgroundColor: color + '33', borderColor: color + '66' }]}>
                      {selectedFunc.foto
                        ? <Image source={{ uri: selectedFunc.foto }} style={styles.detailAvatarImg} />
                        : <Text style={[styles.detailAvatarText, { color }]}>{initials || '?'}</Text>
                      }
                    </View>
                    <Text style={styles.detailName}>{selectedFunc.nome} {selectedFunc.apelido}</Text>
                    <View style={[styles.detailCargoBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
                      <MaterialCommunityIcons name={DEPT_ICONS[selectedFunc.departamento] as any} size={13} color={color} />
                      <Text style={[styles.detailCargoBadgeText, { color }]}>{dept?.label} · {cargo?.label}</Text>
                    </View>
                    {selectedFunc.email ? (
                      <Text style={styles.detailEmail}>{selectedFunc.email}</Text>
                    ) : null}
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>

                    {/* ── Secção: Identificação ── */}
                    <DetailSection icon="card-account-details" label="Identificação" color={Colors.info}>
                      <DetailRow2 icon="id-card" label="BI" value={selectedFunc.bi || '—'} />
                      <DetailRow2 icon={selectedFunc.genero === 'F' ? 'gender-female' : 'gender-male'} label="Género" value={selectedFunc.genero === 'F' ? 'Feminino' : 'Masculino'} />
                      {selectedFunc.dataNascimento ? <DetailRow2 icon="cake-variant" label="Data de Nascimento" value={selectedFunc.dataNascimento} /> : null}
                    </DetailSection>

                    {/* ── Secção: Contacto ── */}
                    <DetailSection icon="phone" label="Contacto" color={Colors.success}>
                      <DetailRow2 icon="phone" label="Telefone" value={selectedFunc.telefone || '—'} />
                      <DetailRow2 icon="email" label="Email" value={selectedFunc.email || '—'} />
                    </DetailSection>

                    {/* ── Secção: Localização ── */}
                    {(selectedFunc.provincia || selectedFunc.morada) ? (
                      <DetailSection icon="map-marker" label="Localização" color={Colors.warning}>
                        {selectedFunc.provincia ? <DetailRow2 icon="city" label="Município" value={`${selectedFunc.provincia} / ${selectedFunc.municipio || '—'}`} /> : null}
                        {selectedFunc.morada ? <DetailRow2 icon="home" label="Morada" value={selectedFunc.morada} /> : null}
                      </DetailSection>
                    ) : null}

                    {/* ── Secção: Cargo & Contrato ── */}
                    <DetailSection icon="briefcase" label="Cargo & Contrato" color={color}>
                      <DetailRow2 icon="account-tie" label="Vínculo" value={vinculo} />
                      {selectedFunc.dataContratacao ? <DetailRow2 icon="calendar-start" label="Data de Contratação" value={selectedFunc.dataContratacao} /> : null}
                      {selectedFunc.dataFimContrato ? <DetailRow2 icon="calendar-end" label="Fim de Contrato" value={selectedFunc.dataFimContrato} /> : null}
                      {selectedFunc.seccao ? <DetailRow2 icon="sitemap" label="Secção / Unidade" value={selectedFunc.seccao} /> : null}
                      {selectedFunc.especialidade ? <DetailRow2 icon="book-education" label="Especialidade" value={selectedFunc.especialidade} /> : null}
                      {selectedFunc.habilitacoes ? <DetailRow2 icon="school" label="Habilitações" value={selectedFunc.habilitacoes} /> : null}
                    </DetailSection>

                    {/* ── Secção: Remuneração ── */}
                    {(selectedFunc.salarioBase > 0 || selectedFunc.valorPorTempoLectivo > 0) && (
                      <DetailSection icon="cash" label="Remuneração" color={Colors.gold}>
                        {selectedFunc.valorPorTempoLectivo > 0 && (
                          <>
                            <DetailRow2 icon="timer-outline" label="Valor por Tempo Lectivo" value={`${selectedFunc.valorPorTempoLectivo.toLocaleString('pt-AO')} Kz`} highlight />
                            {selectedFunc.temposSemanais > 0 && (
                              <DetailRow2 icon="calendar-week" label="Tempos Semanais" value={`${selectedFunc.temposSemanais} tempos`} />
                            )}
                            {selectedFunc.valorPorTempoLectivo > 0 && selectedFunc.temposSemanais > 0 && (
                              <DetailRow2 icon="cash-check" label="Remuneração Mensal Estimada" value={`${(selectedFunc.valorPorTempoLectivo * selectedFunc.temposSemanais * 4).toLocaleString('pt-AO')} Kz`} highlight />
                            )}
                          </>
                        )}
                        {selectedFunc.salarioBase > 0 && (
                          <DetailRow2 icon="cash-multiple" label="Salário Base" value={`${selectedFunc.salarioBase.toLocaleString('pt-AO')} Kz`} highlight />
                        )}
                      </DetailSection>
                    )}

                    {/* ── Card: Acesso ao Sistema ── */}
                    {cargo && cargo.nivelAcesso !== 'sem_acesso' && (
                      <View style={[styles.infoCard, { borderColor: (selectedFunc.utilizadorId ? Colors.success : Colors.warning) + '44' }]}>
                        <View style={styles.infoCardHeader}>
                          <View style={[styles.infoCardIcon, { backgroundColor: (selectedFunc.utilizadorId ? Colors.success : Colors.warning) + '22' }]}>
                            <MaterialCommunityIcons name="shield-account" size={18} color={selectedFunc.utilizadorId ? Colors.success : Colors.warning} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.infoCardTitle, { color: selectedFunc.utilizadorId ? Colors.success : Colors.warning }]}>
                              {selectedFunc.utilizadorId ? 'Acesso Activo' : 'Sem Acesso ao Sistema'}
                            </Text>
                            {selectedFunc.utilizadorId ? (
                              <Text style={styles.infoCardSub}>Perfil: <Text style={{ color: Colors.gold }}>{cargo.role}</Text></Text>
                            ) : (
                              <Text style={styles.infoCardSub}>Este funcionário ainda não pode iniciar sessão</Text>
                            )}
                          </View>
                          {selectedFunc.utilizadorId && (
                            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
                          )}
                        </View>
                        {!selectedFunc.utilizadorId && (
                          <TouchableOpacity
                            style={styles.infoCardBtn}
                            onPress={() => {
                              setAcessoEmail(selectedFunc.email || '');
                              setAcessoSenha('');
                              setShowAcessoPassword(false);
                              setShowAcessoModal(true);
                            }}
                          >
                            <Ionicons name="person-add" size={14} color="#fff" />
                            <Text style={styles.infoCardBtnText}>Criar Credenciais de Acesso</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* ── Card: Módulo Pedagógico ── */}
                    {getCargoById(selectedFunc.cargo)?.role === 'professor' && (
                      <View style={[styles.infoCard, { borderColor: (selectedFunc.professorId ? Colors.success : Colors.info) + '44' }]}>
                        <View style={styles.infoCardHeader}>
                          <View style={[styles.infoCardIcon, { backgroundColor: (selectedFunc.professorId ? Colors.success : Colors.info) + '22' }]}>
                            <MaterialCommunityIcons name="school" size={18} color={selectedFunc.professorId ? Colors.success : Colors.info} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.infoCardTitle, { color: selectedFunc.professorId ? Colors.success : Colors.info }]}>
                              {selectedFunc.professorId ? 'Módulo Pedagógico Activo' : 'Não registado como Professor'}
                            </Text>
                            <Text style={styles.infoCardSub}>
                              {selectedFunc.professorId
                                ? 'Pode ser atribuído a turmas e disciplinas'
                                : 'Registe-o para associar a turmas e lançar notas'}
                            </Text>
                          </View>
                          {selectedFunc.professorId && (
                            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
                          )}
                        </View>
                        {!selectedFunc.professorId && (
                          <TouchableOpacity
                            style={[styles.infoCardBtn, { backgroundColor: Colors.info }]}
                            onPress={() => {
                              setProfHabilitacoes(selectedFunc.habilitacoes || '');
                              setShowProfModal(true);
                            }}
                          >
                            <Ionicons name="school" size={14} color="#fff" />
                            <Text style={styles.infoCardBtnText}>Atribuir como Professor</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* ── Observações ── */}
                    {selectedFunc.observacoes ? (
                      <View style={{ marginTop: 4, marginBottom: 4 }}>
                        <Text style={styles.fieldLabel}>Observações</Text>
                        <View style={styles.conteudoBox}>
                          <Text style={styles.conteudoText}>{selectedFunc.observacoes}</Text>
                        </View>
                      </View>
                    ) : null}

                    {/* ── Botões de Acção ── */}
                    <View style={styles.detailActions}>
                      <TouchableOpacity style={styles.detailDeleteBtn} onPress={() => deleteFuncionario(selectedFunc.id)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        <Text style={[styles.detailActionText, { color: Colors.danger }]}>Eliminar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.detailEditBtn} onPress={() => {
                        setEditingFunc(selectedFunc);
                        setFuncForm(selectedFunc);
                        setFormStep('pessoal');
                        setFuncFormErrors({});
                        setCompletedSteps(new Set(['pessoal', 'organizacao', 'contrato']));
                        const existingSubs = Array.isArray(selectedFunc.subsidios) ? selectedFunc.subsidios : [];
                        if (existingSubs.length > 0) {
                          setSubsidiosCustom(existingSubs);
                        } else {
                          const base = selectedFunc.salarioBase || 0;
                          const migrated: SubsidioItem[] = [];
                          const toPerc = (v: number) => base > 0 ? Math.round((v / base) * 10000) / 100 : 0;
                          if (selectedFunc.subsidioAlimentacao > 0) migrated.push({ id: '1', nome: 'Alimentação', percentagem: toPerc(selectedFunc.subsidioAlimentacao) });
                          if (selectedFunc.subsidioTransporte > 0) migrated.push({ id: '2', nome: 'Transporte', percentagem: toPerc(selectedFunc.subsidioTransporte) });
                          if (selectedFunc.subsidioHabitacao > 0) migrated.push({ id: '3', nome: 'Habitação', percentagem: toPerc(selectedFunc.subsidioHabitacao) });
                          if (selectedFunc.outrosSubsidios > 0) migrated.push({ id: '4', nome: 'Outros', percentagem: toPerc(selectedFunc.outrosSubsidios) });
                          setSubsidiosCustom(migrated);
                        }
                        setShowDetailModal(false);
                        setShowFuncForm(true);
                      }}>
                        <Ionicons name="pencil" size={16} color="#fff" />
                        <Text style={[styles.detailActionText, { color: '#fff' }]}>Editar Funcionário</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ height: 8 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL — Criar Acesso ao Sistema */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showAcessoModal} transparent animationType="slide" onRequestClose={() => setShowAcessoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.infoCardIcon, { backgroundColor: Colors.accent + '22' }]}>
                  <MaterialCommunityIcons name="shield-key" size={20} color={Colors.accent} />
                </View>
                <Text style={styles.modalTitle}>Criar Acesso ao Sistema</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAcessoModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Cargo badge */}
              {selectedFunc && (() => {
                const cargo = getCargoById(selectedFunc.cargo);
                const color = DEPT_COLORS[selectedFunc.departamento] || Colors.gold;
                return (
                  <View style={styles.acessoFuncPreview}>
                    <View style={[styles.acessoFuncAvatar, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.acessoFuncAvatarText, { color }]}>
                        {(selectedFunc.nome?.[0] || '').toUpperCase()}{(selectedFunc.apelido?.[0] || '').toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acessoFuncNome}>{selectedFunc.nome} {selectedFunc.apelido}</Text>
                      <Text style={styles.acessoFuncCargo}>{cargo?.label}</Text>
                    </View>
                    <View style={[styles.acessoRoleBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                      <Text style={[styles.acessoRoleText, { color }]}>{cargo?.role || '—'}</Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={[styles.sectionNote, { marginBottom: 16 }]}>
                Após criar o acesso, o funcionário pode iniciar sessão no {config.nomeEscola} com as permissões associadas ao cargo.
              </Text>

              <Text style={styles.fieldLabel}>Email Institucional<RequiredMark /></Text>
              <View style={styles.inputIconRow}>
                <MaterialCommunityIcons name="email-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="funcionario@escola.ao"
                  placeholderTextColor={Colors.textMuted}
                  value={acessoEmail}
                  onChangeText={setAcessoEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Senha de Acesso<RequiredMark /></Text>
              <View style={styles.inputIconRow}>
                <MaterialCommunityIcons name="lock-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon, { flex: 1, paddingRight: 44 }]}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={Colors.textMuted}
                  value={acessoSenha}
                  onChangeText={setAcessoSenha}
                  secureTextEntry={!showAcessoPassword}
                  returnKeyType="done"
                  onSubmitEditing={criarAcesso}
                />
                <TouchableOpacity
                  style={styles.inputPasswordToggle}
                  onPress={() => setShowAcessoPassword(v => !v)}
                >
                  <Ionicons name={showAcessoPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              {acessoSenha.length > 0 && acessoSenha.length < 8 && (
                <View style={[styles.inlineError, { marginTop: 6 }]}>
                  <Ionicons name="alert-circle-outline" size={13} color={Colors.warning} />
                  <Text style={[styles.inlineErrorText, { color: Colors.warning }]}>A senha deve ter pelo menos 8 caracteres</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, { marginTop: 20 }, (acessoSaving || acessoSenha.length < 8 || !acessoEmail) && { opacity: 0.5 }]}
                onPress={criarAcesso}
                disabled={acessoSaving || acessoSenha.length < 8 || !acessoEmail}
              >
                {acessoSaving ? <AppLoader size="small" color="#fff" /> : <MaterialCommunityIcons name="shield-check" size={18} color="#fff" />}
                <Text style={styles.saveBtnText}>Criar Acesso ao Sistema</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODAL — Atribuir como Professor */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showProfModal} transparent animationType="slide" onRequestClose={() => setShowProfModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.infoCardIcon, { backgroundColor: Colors.info + '22' }]}>
                  <MaterialCommunityIcons name="school" size={20} color={Colors.info} />
                </View>
                <Text style={styles.modalTitle}>Atribuir como Professor</Text>
              </View>
              <TouchableOpacity onPress={() => setShowProfModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Prévia do funcionário */}
              {selectedFunc && (() => {
                const color = DEPT_COLORS[selectedFunc.departamento] || Colors.gold;
                return (
                  <View style={styles.acessoFuncPreview}>
                    <View style={[styles.acessoFuncAvatar, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.acessoFuncAvatarText, { color }]}>
                        {(selectedFunc.nome?.[0] || '').toUpperCase()}{(selectedFunc.apelido?.[0] || '').toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acessoFuncNome}>{selectedFunc.nome} {selectedFunc.apelido}</Text>
                      {selectedFunc.especialidade ? (
                        <Text style={styles.acessoFuncCargo}>{selectedFunc.especialidade}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })()}

              {/* O que vai acontecer */}
              <View style={styles.profStepsList}>
                <ProfStep icon="identifier" text="Será atribuído um número de professor único (ex: PROF-2025-0001)" />
                <ProfStep icon="google-classroom" text="Ficará disponível para ser atribuído a turmas e disciplinas" />
                <ProfStep icon="notebook-edit" text="Poderá lançar sumários, presenças e notas" />
              </View>

              <Text style={styles.fieldLabel}>Habilitações Académicas</Text>
              <View style={styles.inputIconRow}>
                <MaterialCommunityIcons name="certificate-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="Ex: Licenciatura em Matemática"
                  placeholderTextColor={Colors.textMuted}
                  value={profHabilitacoes}
                  onChangeText={setProfHabilitacoes}
                />
              </View>
              <Text style={[styles.sectionNote, { marginTop: 10 }]}>
                As habilitações podem ser editadas posteriormente no módulo de professores.
              </Text>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: Colors.info, marginTop: 8 }, profSaving && { opacity: 0.6 }]}
                onPress={atribuirComoProfessor}
                disabled={profSaving}
              >
                {profSaving
                  ? <AppLoader size="small" color="#fff" />
                  : <MaterialCommunityIcons name="check-decagram" size={18} color="#fff" />}
                <Text style={styles.saveBtnText}>Confirmar Atribuição</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* MODAL — Sumário Review */}
      <Modal visible={!!selectedSumario} transparent animationType="slide" onRequestClose={() => setSelectedSumario(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { padding: 0, overflow: 'hidden' }]}>
            {sumarioSelecionado && (() => {
              const sc = sumarioSelecionado.status === 'aceite' ? Colors.success : sumarioSelecionado.status === 'rejeitado' ? Colors.danger : Colors.warning;
              const sIcon = sumarioSelecionado.status === 'aceite' ? 'checkmark-circle' : sumarioSelecionado.status === 'rejeitado' ? 'close-circle' : 'time';
              const sLabel = sumarioSelecionado.status === 'aceite' ? 'Aceite' : sumarioSelecionado.status === 'rejeitado' ? 'Rejeitado' : 'Pendente';
              const initials = sumarioSelecionado.professorNome?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
              return (
                <>
                  <View style={[styles.reviewModalHead, { backgroundColor: sc + '18' }]}>
                    <TouchableOpacity onPress={() => setSelectedSumario(null)} style={styles.reviewModalClose}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.reviewAvatar, { backgroundColor: Colors.accent + '33', borderColor: Colors.accent + '55' }]}>
                      <Text style={styles.reviewAvatarText}>{initials}</Text>
                    </View>
                    <Text style={styles.reviewModalName}>{sumarioSelecionado.professorNome}</Text>
                    <View style={[styles.reviewStatusBadge, { backgroundColor: sc + '22', borderColor: sc + '44' }]}>
                      <Ionicons name={sIcon as any} size={12} color={sc} />
                      <Text style={[styles.reviewStatusText, { color: sc }]}>{sLabel}</Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
                    <View style={styles.reviewInfoCard}>
                      <View style={styles.reviewInfoRow}>
                        <MaterialCommunityIcons name="google-classroom" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{sumarioSelecionado.turmaNome} · {sumarioSelecionado.disciplina}</Text>
                      </View>
                      <View style={[styles.reviewInfoRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                        <MaterialCommunityIcons name="clock-outline" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{sumarioSelecionado.data} · {sumarioSelecionado.horaInicio}–{sumarioSelecionado.horaFim}</Text>
                        <View style={styles.aulaChip}>
                          <Text style={styles.aulaChipText}>Aula {sumarioSelecionado.numeroAula}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Conteúdo Lecionado</Text>
                    <View style={styles.conteudoBoxEnhanced}>
                      <MaterialCommunityIcons name="text-box-outline" size={16} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={styles.conteudoText}>{sumarioSelecionado.conteudo}</Text>
                    </View>

                    <Text style={styles.reviewSectionLabel}>
                      Observação{sumarioSelecionado.status === 'pendente' ? ' (obrigatória na rejeição)' : ''}
                    </Text>
                    <TextInput
                      style={[styles.input, styles.reviewTextarea]}
                      placeholder="Escreva uma observação..."
                      placeholderTextColor={Colors.textMuted}
                      value={observacao}
                      onChangeText={setObservacao}
                      multiline
                    />

                    {sumarioSelecionado.status === 'pendente' && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={rejeitarSumario}>
                          <Ionicons name="close-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Rejeitar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={aceitarSumario}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Aceitar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={{ height: 16 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* MODAL — Solicitação Review */}
      <Modal visible={!!selectedSolicitude} transparent animationType="slide" onRequestClose={() => setSelectedSolicitude(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { padding: 0, overflow: 'hidden' }]}>
            {solicitSelecionada && (() => {
              const sc = solicitSelecionada.status === 'aprovada' ? Colors.success : solicitSelecionada.status === 'rejeitada' ? Colors.danger : Colors.warning;
              const initials = solicitSelecionada.professorNome?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
              return (
                <>
                  <View style={[styles.reviewModalHead, { backgroundColor: Colors.warning + '14' }]}>
                    <TouchableOpacity onPress={() => setSelectedSolicitude(null)} style={styles.reviewModalClose}>
                      <Ionicons name="close" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={[styles.reviewAvatar, { backgroundColor: Colors.gold + '33', borderColor: Colors.gold + '55' }]}>
                      <Text style={[styles.reviewAvatarText, { color: Colors.gold }]}>{initials}</Text>
                    </View>
                    <Text style={styles.reviewModalName}>{solicitSelecionada.professorNome}</Text>
                    <View style={[styles.reviewStatusBadge, { backgroundColor: sc + '22', borderColor: sc + '44' }]}>
                      <MaterialCommunityIcons name="folder-open-outline" size={12} color={sc} />
                      <Text style={[styles.reviewStatusText, { color: sc }]}>Reabertura de Pauta</Text>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 16 }}>
                    <View style={styles.reviewInfoCard}>
                      <View style={styles.reviewInfoRow}>
                        <MaterialCommunityIcons name="book-open-outline" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{solicitSelecionada.disciplina}</Text>
                      </View>
                      <View style={[styles.reviewInfoRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                        <MaterialCommunityIcons name="google-classroom" size={15} color={Colors.textMuted} />
                        <Text style={styles.reviewInfoText}>{solicitSelecionada.turmaNome}</Text>
                        <View style={styles.aulaChip}>
                          <Text style={styles.aulaChipText}>Trim. {solicitSelecionada.trimestre}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Motivo do Pedido</Text>
                    <View style={styles.conteudoBoxEnhanced}>
                      <MaterialCommunityIcons name="comment-text-outline" size={16} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={styles.conteudoText}>{solicitSelecionada.motivo}</Text>
                    </View>

                    <Text style={styles.reviewSectionLabel}>Resposta / Observação</Text>
                    <TextInput
                      style={[styles.input, styles.reviewTextarea]}
                      placeholder="Escreva uma resposta..."
                      placeholderTextColor={Colors.textMuted}
                      value={observacao}
                      onChangeText={setObservacao}
                      multiline
                    />

                    {solicitSelecionada.status === 'pendente' && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.rejectBtn} onPress={rejeitarSolicitacao}>
                          <Ionicons name="close-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Rejeitar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={aprovarSolicitacao}>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text style={styles.actionBtnText}>Aprovar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={{ height: 16 }} />
                  </ScrollView>
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function FuncCard({ f, onPress }: { f: Funcionario; onPress: () => void }) {
  const cargo = getCargoById(f.cargo);
  const dept = getDepartamentoByKey(f.departamento);
  const color = DEPT_COLORS[f.departamento] || Colors.gold;
  return (
    <TouchableOpacity style={styles.funcCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.funcAvatar, { backgroundColor: color + '22', borderColor: color + '44', borderWidth: 1.5, overflow: 'hidden' }]}>
        {f.foto
          ? <Image source={{ uri: f.foto }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          : <Text style={[styles.funcAvatarText, { color }]}>
              {(f.nome?.[0] || '?').toUpperCase()}{(f.apelido?.[0] || '').toUpperCase()}
            </Text>
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.funcNome}>{f.nome} {f.apelido}</Text>
        <Text style={styles.funcCargo}>{cargo?.label || f.cargo}</Text>
        {f.email ? <Text style={styles.funcEmail} numberOfLines={1}>{f.email}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {f.utilizadorId ? (
          <View style={styles.acessoBadge}>
            <MaterialCommunityIcons name="shield-check" size={11} color={Colors.success} />
            <Text style={[styles.acessoBadgeText, { color: Colors.success }]}>Activo</Text>
          </View>
        ) : cargo && cargo.nivelAcesso !== 'sem_acesso' ? (
          <View style={[styles.acessoBadge, { backgroundColor: Colors.warning + '22' }]}>
            <MaterialCommunityIcons name="shield-off" size={11} color={Colors.warning} />
            <Text style={[styles.acessoBadgeText, { color: Colors.warning }]}>Sem acesso</Text>
          </View>
        ) : (
          <View style={[styles.acessoBadge, { backgroundColor: Colors.textMuted + '22' }]}>
            <Text style={[styles.acessoBadgeText, { color: Colors.textMuted }]}>N/A</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function DetailSection({ icon, label, color, children }: { icon: string; label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={detailSectionStyles.wrap}>
      <View style={detailSectionStyles.header}>
        <View style={[detailSectionStyles.iconWrap, { backgroundColor: color + '22' }]}>
          <MaterialCommunityIcons name={icon as any} size={14} color={color} />
        </View>
        <Text style={[detailSectionStyles.label, { color }]}>{label}</Text>
      </View>
      <View style={detailSectionStyles.body}>{children}</View>
    </View>
  );
}
const detailSectionStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  iconWrap: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
});

function DetailRow2({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={dr2Styles.row}>
      <MaterialCommunityIcons name={icon as any} size={15} color={Colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={dr2Styles.label}>{label}</Text>
        <Text style={[dr2Styles.value, highlight && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      </View>
    </View>
  );
}
const dr2Styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 1 },
  value: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
});

function ProfStep({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={profStepStyles.row}>
      <View style={profStepStyles.iconWrap}>
        <MaterialCommunityIcons name={icon as any} size={16} color={Colors.info} />
      </View>
      <Text style={profStepStyles.text}>{text}</Text>
    </View>
  );
}
const profStepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.info + '18', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 19, marginTop: 6 },
});

function FormRow({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {!!error && (
        <View style={styles.inlineError}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.danger} />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  statsBar: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border },

  tabScroll: { backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  tabTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },

  filterRow: { maxHeight: 46, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterBtnActive: { backgroundColor: Colors.gold + '33', borderWidth: 1, borderColor: Colors.gold + '66' },
  filterText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  // Search
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },

  // Department filter dropdown
  deptScroll: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primaryDark },
  deptDropWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  deptDropTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  deptModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  deptModalSheet: { backgroundColor: Colors.primaryDark, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '75%' },
  deptModalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  deptModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  deptModalTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  deptModalSearch: { margin: 12, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, color: Colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: Colors.border },
  deptModalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  deptModalOptTxt: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  deptRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  deptPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  deptPillActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '66' },
  deptPillText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  deptPillTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  // Department group header
  deptHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  deptIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  deptHeaderText: { fontSize: 13, fontFamily: 'Inter_700Bold', flex: 1 },
  deptCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  deptCountText: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  // Func card
  funcCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  funcAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  funcAvatarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  funcNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  funcCargo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 1 },
  funcEmail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  acessoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  acessoBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // Card generic
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  cardSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 2 },
  cardDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  cardConteudo: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  publishBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  publishText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  fab: { position: 'absolute', bottom: 80, right: 20, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 20, padding: 22, maxHeight: '90%', width: '100%', maxWidth: 560, borderWidth: 1, borderColor: Colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  // Form
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stepBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  stepBtnActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
  stepBtnDone: { backgroundColor: Colors.success + '18', borderColor: Colors.success + '88' },
  stepBtnLocked: { backgroundColor: Colors.surface, borderColor: Colors.border, opacity: 0.45 },
  stepNum: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  stepText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  stepTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  inputError: { borderColor: Colors.danger, borderWidth: 1, backgroundColor: 'rgba(231,76,60,0.04)' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  inlineErrorText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger, flex: 1 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 10 },
  sectionNote: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, backgroundColor: Colors.surface, padding: 10, borderRadius: 8, marginBottom: 14, lineHeight: 18 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1.5, borderColor: Colors.border },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
  pillText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  pillTextActive: { color: Colors.accent, fontFamily: 'Inter_600SemiBold' },

  // Dept option (form)
  deptOption: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  deptOptionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deptOptionLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  deptOptionDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  // Cargo option (form)
  cargoOption: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.border },
  cargoLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  cargoDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  nivelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  nivelText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // Step nav
  stepNavRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, marginBottom: 8 },
  stepNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stepNavBtnPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepNavText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },

  // Salary preview
  totalBox: { backgroundColor: Colors.primary + '22', borderRadius: 10, padding: 14, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  totalRowFinal: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 6, paddingTop: 10 },
  totalLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  totalValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  totalLabelBig: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  totalValueBig: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold },

  // Dynamic subsidies
  subsidioSection: { marginTop: 16, marginBottom: 4 },
  subsidioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subsidioTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  subsidioAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subsidioAddText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  subsidioEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  subsidioRow: { backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  subsidioRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subsidioNomeInput: { flex: 1, marginBottom: 0 },
  subsidioPercContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subsidioPercInput: { width: 64, textAlign: 'center', marginBottom: 0 },
  subsidioPercSymbol: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  subsidioRemoveBtn: { padding: 4 },
  subsidioCalc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 6 },
  subsidioCalcVal: { fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  // Detail modal — redesigned
  detailHeader: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 20, alignItems: 'center', borderTopLeftRadius: 20, borderTopRightRadius: 20, position: 'relative' },
  detailCloseBtn: { position: 'absolute', top: 14, right: 14, padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  detailAvatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10, overflow: 'hidden' },
  detailAvatarText: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  detailAvatarImg: { width: 68, height: 68, borderRadius: 34 },

  // Foto picker no formulário
  fotoPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fotoPicker: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', position: 'relative', backgroundColor: Colors.surface },
  fotoImg: { width: 80, height: 80, borderRadius: 40 },
  fotoPlaceholder: { alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  fotoCamera: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.backgroundCard },
  detailName: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  detailCargoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 6 },
  detailCargoBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  detailEmail: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  // Info card (system access / professor module)
  infoCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1 },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoCardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoCardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  infoCardSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  infoCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  infoCardBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Detail action buttons
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  detailDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.danger + '18', borderWidth: 1, borderColor: Colors.danger + '44' },
  detailEditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.accent },
  detailActionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Acesso modal — redesigned
  acessoFuncPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  acessoFuncAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  acessoFuncAvatarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  acessoFuncNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  acessoFuncCargo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  acessoRoleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  acessoRoleText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  inputIconRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', width: '100%' },
  inputIcon: { position: 'absolute', left: 12, zIndex: 1 },
  inputWithIcon: { paddingLeft: 38, flex: 1 },
  inputPasswordToggle: { position: 'absolute', right: 12, padding: 4, zIndex: 1 },

  // Prof steps list
  profStepsList: { backgroundColor: Colors.info + '0D', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.info + '22' },

  // Keep legacy for review modals
  acessoCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: Colors.border },
  acessoTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  acessoTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  acessoNote: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  criarAcessoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  criarAcessoText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  detailValue: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, flex: 1, textAlign: 'right' },

  // Review modal
  reviewLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  conteudoBox: { backgroundColor: Colors.surface, borderRadius: 8, padding: 12, marginTop: 4 },
  conteudoText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.danger, borderRadius: 10, paddingVertical: 12 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, borderRadius: 10, paddingVertical: 12 },
  actionBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 16 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  tipoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginBottom: 4 },
  tipoBtnActive: { borderColor: Colors.gold + '66' },
  tipoBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  // Review modal — enhanced
  reviewModalHead: { paddingTop: 22, paddingBottom: 18, paddingHorizontal: 20, alignItems: 'center', borderTopLeftRadius: 20, borderTopRightRadius: 20, position: 'relative' },
  reviewModalClose: { position: 'absolute', top: 14, right: 14, padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  reviewAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 8 },
  reviewAvatarText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.accent },
  reviewModalName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  reviewStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  reviewStatusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  reviewInfoCard: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 14 },
  reviewInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  reviewInfoText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  reviewSectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  aulaChip: { backgroundColor: Colors.accent + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  aulaChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
  conteudoBoxEnhanced: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 14 },
  reviewTextarea: { height: 80, textAlignVertical: 'top', marginBottom: 4 },

  // Tipo card grid (prova modal)
  tipoCardGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tipoCard: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 6 },
  tipoCardText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  // Turma pills (prova modal)
  turmaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  turmaPillText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});

// ── Assiduidade styles ──────────────────────────────────────────────────────
const assStyles = StyleSheet.create({
  filterBar: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  filterLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  mesAnoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mesPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  mesPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  mesPillText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  mesPillTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  anoWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  anoText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, minWidth: 38, textAlign: 'center' },
  deptChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  deptChipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '66' },
  deptChipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  deptChipTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  totaisCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  totaisRow: { flexDirection: 'row', alignItems: 'center' },
  totaisItem: { flex: 1, alignItems: 'center' },
  totaisNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  totaisLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  totaisDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  descontoTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  descontoTotalText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  funcCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  funcCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  funcName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  funcCargo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  faltasBadge: { backgroundColor: Colors.danger + '22', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + '44' },
  faltasBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.danger },
  semFaltasBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  semFaltasText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success },
  descontoText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.danger },

  barsRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  barText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  detalheBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  detalheTitulo: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  detalheRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '88' },
  detalheDot: { width: 8, height: 8, borderRadius: 4 },
  detalheData: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, minWidth: 80 },
  detalheTipo: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, minWidth: 80 },
  detalheMotivo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },
});
