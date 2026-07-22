import React, { useState, useMemo, useCallback, useEffect, useDeferredValue } from 'react';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { FINANCEIRO_TOUR_STEPS, FINANCEIRO_TOUR_KEY } from '@/constants/tourSteps';
import { matchAno, normalizeAnoPagamento } from '@/utils/anoUtils';
import {FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { DonutChart, BarChart } from '@/components/Charts';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import TopBar from '@/components/TopBar';
import CollapsibleStats from '@/components/CollapsibleStats';
import DateInput from '@/components/DateInput';
import {
  useFinanceiro, formatAOA,
  Taxa, Pagamento, TipoTaxa, FrequenciaTaxa, MetodoPagamento, StatusPagamento,
  MensagemFinanceira, SaldoAluno, MovimentoSaldo,
} from '@/context/FinanceiroContext';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { alertSucesso, alertErro } from '@/utils/toast';
import ExportMenu from '@/components/ExportMenu';
import { useLookup } from '@/hooks/useLookup';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import { openPdfInTab } from '@/utils/pdfAuth';
import type { IrtEscalao } from '@/context/ConfigContext';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';

const RupeSearchInput = React.memo(function RupeSearchInput({
  value,
  onChangeText,
  onClear,
}: {
  value: string;
  onChangeText: (s: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <StableSearchInput
        value={value}
        onChangeText={onChangeText}
        inputStyle={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text, minHeight: 36 }}
        placeholder="Pesquisar por referência (ex: RUPE-2025-...)"
        iconColor={Colors.textMuted}
        autoCapitalize="characters"
      />
    </>
  );
});

const TIPO_LABEL: Record<string, string> = {
  propina: 'Propina', matricula: 'Matrícula', material: 'Material Didáctico', exame: 'Exame', multa: 'Multa', outro: 'Outro',
};
const TIPO_ICON: Record<string, string> = {
  propina: 'cash', matricula: 'document-text', material: 'book', exame: 'newspaper', multa: 'warning', outro: 'ellipsis-horizontal',
};
const TIPO_COLOR: Record<string, string> = {
  propina: Colors.info, matricula: Colors.gold, material: Colors.success, exame: Colors.warning, multa: Colors.danger, outro: Colors.textMuted,
};
const METODO_LABEL_DEFAULT: Record<string, string> = {
  dinheiro: 'Dinheiro', transferencia: 'RUPE/Transfer.', referencia_bancaria: 'Por Referência', rupe: 'Por Referência', multicaixa: 'Multicaixa', multicaixa_express: 'Multicaixa', cartao: 'Cartão',
};
const METODO_ICON_MAP: Record<string, string> = {
  dinheiro: 'cash-outline', transferencia: 'swap-horizontal-outline', referencia_bancaria: 'swap-horizontal-outline',
  rupe: 'swap-horizontal-outline', multicaixa: 'phone-portrait-outline', multicaixa_express: 'phone-portrait-outline', cartao: 'card-outline',
};
const METODO_COLOR_MAP: Record<string, string> = {
  dinheiro: '#b45309', transferencia: '#1d4ed8', referencia_bancaria: '#1d4ed8',
  rupe: '#1d4ed8', multicaixa: '#15803d', multicaixa_express: '#15803d', cartao: '#7c3aed',
};
const TIPOS_FALLBACK: TipoTaxa[] = ['propina','matricula','material','exame','multa','outro'];
const METODOS_FALLBACK: MetodoPagamento[] = ['dinheiro','transferencia','multicaixa'];
const STATUS_CFG = {
  pago:     { color: Colors.success, bg: Colors.success + '22', label: 'Liquidado',  icon: 'checkmark-circle' },
  pendente: { color: Colors.warning, bg: Colors.warning + '22', label: 'Em Cobrança',icon: 'time' },
  cancelado:{ color: Colors.textMuted, bg: Colors.border,       label: 'Cancelado', icon: 'close-circle' },
};
const MESES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const FREQS: { k: FrequenciaTaxa; l: string }[] = [
  { k: 'mensal', l: 'Mensal' }, { k: 'trimestral', l: 'Trimestral' },
  { k: 'anual', l: 'Anual' }, { k: 'unica', l: 'Única' },
];
const TABS_MAIN = ['painel','propinas','resumo','relatorios','em_atraso','mensagens','pagamentos','rubricas','orcamento','pag_rubrica','por_aluno','config_fiscal','plano_contas','contas_pagar','relatorios_fin','feriados','solicitacoes_docs','vendas','fecho_caixa'] as const;
type TabKey = typeof TABS_MAIN[number];

const MESES_PAINEL = [
  { num: 9, nome: 'Set' }, { num: 10, nome: 'Out' }, { num: 11, nome: 'Nov' },
  { num: 12, nome: 'Dez' }, { num: 1, nome: 'Jan' }, { num: 2, nome: 'Fev' },
  { num: 3, nome: 'Mar' }, { num: 4, nome: 'Abr' }, { num: 5, nome: 'Mai' },
  { num: 6, nome: 'Jun' }, { num: 7, nome: 'Jul' },
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: color + '55' }}>
      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color }}>{label}</Text>
    </View>
  );
}

/**
 * Calcula qual o ano civil que deve estar seleccionado por defeito para
 * pagamentos/orçamento, mantendo-se sempre actualizado com o ano lectivo activo.
 *
 * Um ano lectivo (ex.: "2025/2026") cobre dois anos civis. O ano de pagamento
 * corrente avança automaticamente de "início" para "início+1" à medida que o
 * ano civil avança — nunca fica parado no ano de abertura do ano lectivo.
 * Fora deste intervalo (ex.: dados de teste), assume-se o ano de início.
 */
function calcularAnoPagamentoAtual(anoAcademico?: { ano?: string } | null): string {
  const civilHoje = new Date().getFullYear();
  const match = String(anoAcademico?.ano || '').match(/(\d{4})/);
  const inicio = match ? parseInt(match[1], 10) : null;
  if (inicio == null) return String(civilHoje);
  if (civilHoje === inicio || civilHoje === inicio + 1) return String(civilHoje);
  return String(inicio);
}


const MESES_LETIVOS_CADER = [1,2,3,4,5,6,7,8,9,10]; // Jan–Out (10 meses letivos Angola)
const MESES_ABREV_FULL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/**
 * Banner exibido na caderneta quando um aluno tem pagamentos sem mês associado.
 * Permite associar directamente o mês de referência sem sair da caderneta.
 */
function SemMesBanner({
  pagamentos: pags,
  mesesStatus,
  onAssociar,
}: {
  pagamentos: any[];
  /** Estado real de cada mês letivo (1=Jan…10=Out). Ausente = 'falta'. */
  mesesStatus: Record<number, 'pago' | 'pendente' | 'falta'>;
  onAssociar: (pagId: string, mes: number, comoSaldo?: boolean) => Promise<void>;
}) {
  const [expandedId,   setExpandedId]   = React.useState<string | null>(null);
  const [savingId,     setSavingId]     = React.useState<string | null>(null);
  /** Mês que aguarda confirmação de "adicionar como saldo" para um determinado pagamento */
  const [confirmSaldo, setConfirmSaldo] = React.useState<{ pagId: string; mes: number; tipo: 'pago'|'pendente' } | null>(null);

  const handleTap = (pagId: string, mes: number) => {
    const st = mesesStatus[mes] ?? 'falta';
    if (st === 'falta') {
      // Mês livre → associa directamente
      doAssociar(pagId, mes, false);
    } else {
      // Mês ocupado → pede confirmação de saldo
      setConfirmSaldo({ pagId, mes, tipo: st as 'pago'|'pendente' });
    }
  };

  const doAssociar = async (pagId: string, mes: number, comoSaldo: boolean) => {
    setConfirmSaldo(null);
    setSavingId(pagId);
    try {
      await onAssociar(pagId, mes, comoSaldo);
      setExpandedId(null);
    } finally {
      setSavingId(null);
    }
  };

  // Cores por estado de mês
  const mesCor = (st: 'pago'|'pendente'|'falta') => {
    if (st === 'pago')     return { bg: Colors.success + '22', border: Colors.success + '66', text: Colors.success };
    if (st === 'pendente') return { bg: Colors.warning + '22', border: Colors.warning + '66', text: Colors.warning };
    return { bg: 'transparent', border: Colors.border, text: Colors.textMuted };
  };
  const mesIcone = (st: 'pago'|'pendente'|'falta') => {
    if (st === 'pago')     return '✓';
    if (st === 'pendente') return '⏳';
    return '';
  };

  return (
    <View style={{ marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.warning + '55', overflow: 'hidden' }}>
      {/* Cabeçalho */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warning + '18', padding: 10 }}>
        <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
        <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.warning }}>
          {pags.length === 1 ? '1 pagamento sem mês associado' : `${pags.length} pagamentos sem mês associado`}
        </Text>
      </View>

      {/* Diálogo de confirmação de saldo (sobrepõe o banner) */}
      {confirmSaldo && (
        <View style={{ margin: 10, padding: 12, backgroundColor: Colors.surface, borderRadius: 8,
                       borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 6 }}>
            {MESES_ABREV_FULL[confirmSaldo.mes - 1]} já tem registo{' '}
            <Text style={{ color: confirmSaldo.tipo === 'pago' ? Colors.success : Colors.warning }}>
              {confirmSaldo.tipo === 'pago' ? 'liquidado' : 'em cobrança'}
            </Text>
          </Text>
          <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 10 }}>
            Pretende adicionar este pagamento como saldo a favor do aluno nesse mês? O registo existente não será alterado.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setConfirmSaldo(null)}
              style={{ flex: 1, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => doAssociar(confirmSaldo.pagId, confirmSaldo.mes, true)}
              style={{ flex: 1, paddingVertical: 7, borderRadius: 6, backgroundColor: Colors.gold + '22',
                       borderWidth: 1, borderColor: Colors.gold, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold }}>Adicionar como saldo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cada pagamento sem mês */}
      {!confirmSaldo && pags.map(p => (
        <View key={p.id} style={{ padding: 10, borderTopWidth: 1, borderTopColor: Colors.warning + '22' }}>
          {/* Linha de informação */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>
                {formatAOA(p.valor)} · {p.status === 'pago' ? '✓ Liquidado' : '⏳ Em Cobrança'}
              </Text>
              {p.referencia ? (
                <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 1 }}>
                  Ref: {p.referencia}
                </Text>
              ) : null}
            </View>
            {savingId === p.id ? (
              <View style={{ padding: 6 }}>
                <Text style={{ fontSize: 10, color: Colors.warning, fontFamily: 'Inter_400Regular' }}>A guardar…</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '22',
                         paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                <Ionicons name={expandedId === p.id ? 'chevron-up' : 'calendar-outline'} size={12} color={Colors.warning} />
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.warning }}>
                  {expandedId === p.id ? 'Fechar' : 'Associar mês'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Picker de mês expandido */}
          {expandedId === p.id && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 6 }}>
                Toque no mês para associar. Meses com registo existente pedem confirmação:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {MESES_LETIVOS_CADER.map(m => {
                  const st  = mesesStatus[m] ?? 'falta';
                  const cor = mesCor(st);
                  const icone = mesIcone(st);
                  return (
                    <TouchableOpacity
                      key={m}
                      disabled={savingId === p.id}
                      onPress={() => handleTap(p.id, m)}
                      style={{
                        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6,
                        backgroundColor: cor.bg, borderWidth: 1, borderColor: cor.border,
                        alignItems: 'center',
                      }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: cor.text }}>
                        {icone ? `${icone} ` : ''}{MESES_ABREV_FULL[m - 1]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Legenda */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                {([
                  { cor: Colors.success, label: 'Liquidado' },
                  { cor: Colors.warning, label: 'Em Cobrança' },
                  { cor: Colors.textMuted, label: 'Livre' },
                ] as const).map(l => (
                  <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.cor }} />
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{l.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' }}>
                Meses verdes/laranja já têm registo — ao tocar pode adicionar como saldo.
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export default function FinanceiroScreen() {
  const {
    taxas, pagamentos, multaConfig, faltasJustifConfig, mensagens, rupes, bloqueados, acessoLiberado, saldos, isencoes, isLoading,
    addTaxa, updateTaxa, deleteTaxa,
    addPagamento, updatePagamento, transferirPagamento,
    getTotalRecebido, getTotalPendente,
    updateMultaConfig, updateFaltasJustifConfig,
    bloquearAluno, desbloquearAluno, isAlunoBloqueado, togglePermitirAcessoPortal,
    enviarMensagem, getMensagensAluno, marcarMensagemLida,
    gerarRUPE, getRUPEsAluno,
    getMesesEmAtraso, calcularMulta, getMultaAluno, getIsencaoAluno,
    getSaldoAluno, getMovimentosAluno, creditarSaldo,
    solicitarIsencaoMulta, responderIsencaoMulta,
  } = useFinanceiro();
  const { alunos, turmas } = useData();
  const { anoSelecionado } = useAnoAcademico();
  const { user } = useAuth();
  const { config } = useConfig();
  const propinaHabilitada = config.propinaHabilitada;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 24 : insets.bottom;

  const { values: tiposLookup, valueToLabel: tipoLabelFn, valueToItem: tipoItemFn } = useLookup('tipos_taxa', TIPOS_FALLBACK);
  const { valueToLabel: metodoLabelFn } = useLookup('metodos_pagamento', METODOS_FALLBACK);
  const { values: niveisLookup } = useLookup('niveis', ['Primário', 'I Ciclo', 'II Ciclo']);
  const TIPOS = tiposLookup as TipoTaxa[];
  const tipoLabel = (t: string) => TIPO_LABEL[t] ?? tipoLabelFn(t) ?? t;
  const tipoIcon  = (t: string) => TIPO_ICON[t]  ?? tipoItemFn(t)?.icon ?? 'pricetag';
  const tipoCor   = (t: string) => TIPO_COLOR[t] ?? tipoItemFn(t)?.cor  ?? Colors.textMuted;
  const NIVEIS = ['Todos', ...niveisLookup];
  const metodoLabel = (m: string) => metodoLabelFn(m) || METODO_LABEL_DEFAULT[m] || m;

  const anoAtual = anoSelecionado?.ano || new Date().getFullYear().toString();
  const nomeRemetente = user?.nome || 'Departamento Financeiro';

  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(FINANCEIRO_TOUR_KEY);

  // Auto-mostrar tour na primeira visita
  useEffect(() => { const t = setTimeout(() => checkAndShow(), 800); return () => clearTimeout(t); }, []);

  const routeParamsFin = useLocalSearchParams<{ tab?: string; alunoId?: string }>();
  const initialFinTab = ((TABS_MAIN.find(t => t === String(routeParamsFin?.tab || ''))) || (routeParamsFin?.alunoId ? 'por_aluno' : 'painel')) as TabKey;
  const [tab, setTab]         = useState<TabKey>(initialFinTab);
  useEffect(() => {
    const t = String(routeParamsFin?.tab || '');
    if (t && (TABS_MAIN as readonly string[]).includes(t)) setTab(t as TabKey);
  }, [routeParamsFin?.tab]);

  // --- Config Fiscal state ---
  interface ConfigFiscal { inssEmpPerc: number; inssPatrPerc: number; irtTabela: IrtEscalao[] }
  const [cfgFiscal, setCfgFiscal]         = useState<ConfigFiscal | null>(null);
  const [cfgFiscalLoading, setCfgLoading] = useState(false);
  const [cfgFiscalSaving, setCfgSaving]   = useState(false);
  const [cfgFiscalEdit, setCfgEdit]       = useState<ConfigFiscal | null>(null);

  useEffect(() => {
    if (tab !== 'config_fiscal' || cfgFiscal) return;
    setCfgLoading(true);
    api.get('/api/config-fiscal')
      .then((d: any) => {
        const data = d.data ?? d;
        setCfgFiscal(data);
        setCfgEdit(JSON.parse(JSON.stringify(data)));
      })
      .catch(() => alertErro('Erro', 'Não foi possível carregar a configuração fiscal.'))
      .finally(() => setCfgLoading(false));
  }, [tab]);

  const [statusFilter, setStatusFilter] = useState<'todos' | StatusPagamento>('todos');
  const [tipoFilter, setTipoFilter]     = useState<'todos' | TipoTaxa>('todos');
  const [searchAluno, setSearchAluno]   = useState('');
  const [searchPagAluno, setSearchPagAluno] = useState('');
  const [metodoPagFilter, setMetodoPagFilter] = useState<'todos' | MetodoPagamento>('todos');
  const [mesFilter, setMesFilter]           = useState<string>('todos');
  const [relTipo, setRelTipo]               = useState<'todos' | TipoTaxa>('todos');
  const [relNivel, setRelNivel]             = useState('Todos');
  const [relMetodo, setRelMetodo]           = useState<'todos' | MetodoPagamento>('todos');
  const [relMesInicio, setRelMesInicio]     = useState<string>('todos');
  const [relMesFim, setRelMesFim]           = useState<string>('todos');
  const [relTurmaId, setRelTurmaId]         = useState<string>('todas');
  const [relPeriodo, setRelPeriodo]         = useState<'mensal' | 'trimestral' | 'anual'>('mensal');
  const [alunoPerfilId, setAlunoPerfilId]   = useState<string | null>(routeParamsFin?.alunoId ?? null);
  // Auto-open student profile tab when navigating from student profile
  useEffect(() => {
    if (routeParamsFin?.alunoId) {
      setTab('por_aluno');
      setAlunoPerfilId(routeParamsFin.alunoId);
    }
  }, [routeParamsFin?.alunoId]);
  const [msgAlunoId, setMsgAlunoId]         = useState<string | null>(null);
  const [showMsgModal, setShowMsgModal]     = useState(false);
  const [msgTexto, setMsgTexto]             = useState('');
  const [msgTipo, setMsgTipo]               = useState<MensagemFinanceira['tipo']>('aviso');
  const [showRUPEModal, setShowRUPEModal]   = useState(false);
  const [rupeAlunoId, setRupeAlunoId]       = useState<string | null>(null);
  const [rupeTaxaId, setRupeTaxaId]         = useState('');
  const [rupeValor, setRupeValor]           = useState('');
  const [rupeGerado, setRupeGerado]         = useState<any>(null);
  const [showMultaModal, setShowMultaModal] = useState(false);
  const [multaPct, setMultaPct]             = useState(multaConfig.percentagem.toString());
  const [multaDias, setMultaDias]           = useState(multaConfig.diasCarencia.toString());
  const [multaDiaInicio, setMultaDiaInicio] = useState((multaConfig.diaInicioMulta || 10).toString());
  const [multaValorDia, setMultaValorDia]   = useState((multaConfig.valorPorDia || 0).toString());
  const [multaPctDia, setMultaPctDia]       = useState((multaConfig.percentagemPorDia || 0).toString());
  // Justificação de faltas (pago)
  const [showFaltasJustifModal, setShowFaltasJustifModal] = useState(false);
  const [faltasJustifMin, setFaltasJustifMin]             = useState('3');
  const [faltasJustifValor, setFaltasJustifValor]         = useState('0');
  const [showIsencaoModal, setShowIsencaoModal] = useState(false);
  const [isencaoAlunoId, setIsencaoAlunoId]     = useState<string | null>(null);
  const [isencaoJustif, setIsencaoJustif]       = useState('');
  const [isencaoLoading, setIsencaoLoading]     = useState(false);

  const [showObituarioModal, setShowObituarioModal] = useState(false);
  const [obituarioAlunoId, setObituarioAlunoId]     = useState<string | null>(null);
  const [obituarioData, setObituarioData]           = useState('');
  const [obituarioObs, setObituarioObs]             = useState('');
  const [obituarioLoading, setObituarioLoading]     = useState(false);

  const [showSaldoModal, setShowSaldoModal]         = useState(false);
  const [saldoAlunoId, setSaldoAlunoId]             = useState<string | null>(null);
  const [saldoValor, setSaldoValor]                 = useState('');
  const [saldoDataCobranca, setSaldoDataCobranca]   = useState('');
  const [saldoDescricao, setSaldoDescricao]         = useState('');

  const [rupeSearchRef, setRupeSearchRef]           = useState('');
  const deferredRupeSearchRef                       = useDeferredValue(rupeSearchRef);
  const handleClearRupeSearch                       = useCallback(() => setRupeSearchRef(''), []);
  const [saldoObs, setSaldoObs]                     = useState('');
  const [saldoLoading, setSaldoLoading]             = useState(false);
  const [showSaldoMovimentos, setShowSaldoMovimentos] = useState(false);

  // --- Perfil financeiro por aluno: bolsas + filtro de ano ---
  interface PerfilBolsa { id: string; alunoId?: string; tipo: string; percentagem: number; descricao: string | null; dataInicio: string | null; dataFim: string | null; ativo: boolean; aprovadoPor: string | null; }
  const [perfilBolsas, setPerfilBolsas]           = useState<PerfilBolsa[]>([]);
  const [perfilBolsasLoading, setPerfilBolsasLoading] = useState(false);
  const [perfilAnoFilter, setPerfilAnoFilter]     = useState<string>('todos');
  const prevAlunoPerfilId = React.useRef<string | null>(null);
  // Mapa de todas as bolsas activas por alunoId — carregado quando o tab por_aluno está activo
  const [todasBolsasMap, setTodasBolsasMap]       = useState<Record<string, PerfilBolsa[]>>({});
  // Mapa de repetências por alunoId: alunoId → número de vezes que repetiu
  const [reconfirmacoesMap, setReconfirmacoesMap] = useState<Record<string, number>>({});
  // Mapa de cadeiras em atraso por alunoId: alunoId → {count, disciplinas[]}
  const [cadeirasAtrasosMap, setCadeirasAtrasosMap] = useState<Record<string, { count: number; disciplinas: string[] }>>({});
  const todasBolsasLoaded                         = React.useRef(false);

  useEffect(() => {
    if (tab !== 'por_aluno') return;
    if (todasBolsasLoaded.current) return;
    todasBolsasLoaded.current = true;
    // Carregar bolsas, reconfirmações e cadeiras em atraso em paralelo
    Promise.all([
      api.get('/api/bolsas').catch(() => []),
      api.get('/api/reconfirmacoes-matricula').catch(() => []),
      api.get(`/api/financeiro/cadeiras-atraso?anoLetivo=${encodeURIComponent(anoAtual)}`).catch(() => []),
    ]).then(([bolsasRaw, reconfRaw, cadeirasRaw]: [any, any, any]) => {
      // Mapa de bolsas
      const listaBolsas: PerfilBolsa[] = Array.isArray(bolsasRaw) ? bolsasRaw : [];
      const mapaBolsas: Record<string, PerfilBolsa[]> = {};
      listaBolsas.forEach(b => {
        if (!b.alunoId) return;
        if (!mapaBolsas[b.alunoId]) mapaBolsas[b.alunoId] = [];
        mapaBolsas[b.alunoId].push(b);
      });
      setTodasBolsasMap(mapaBolsas);
      // Mapa de repetências (conta quantas reconfirmações por aluno)
      const listaReconf: any[] = Array.isArray(reconfRaw) ? reconfRaw : [];
      const mapaReconf: Record<string, number> = {};
      listaReconf.forEach(r => {
        if (!r.alunoId) return;
        mapaReconf[r.alunoId] = (mapaReconf[r.alunoId] || 0) + 1;
      });
      setReconfirmacoesMap(mapaReconf);
      // Mapa de cadeiras em atraso
      const listaCadeiras: any[] = Array.isArray(cadeirasRaw) ? cadeirasRaw : [];
      const mapaCadeiras: Record<string, { count: number; disciplinas: string[] }> = {};
      listaCadeiras.forEach(c => {
        if (!c.alunoId) return;
        mapaCadeiras[c.alunoId] = {
          count: Number(c.cadeirasAtraso) || 0,
          disciplinas: Array.isArray(c.disciplinas) ? c.disciplinas.filter(Boolean) : [],
        };
      });
      setCadeirasAtrasosMap(mapaCadeiras);
    });
  }, [tab]);

  useEffect(() => {
    if (!alunoPerfilId) { setPerfilBolsas([]); setPerfilAnoFilter('todos'); prevAlunoPerfilId.current = null; return; }
    if (alunoPerfilId === prevAlunoPerfilId.current) return;
    prevAlunoPerfilId.current = alunoPerfilId;
    setPerfilAnoFilter('todos');
    setPerfilBolsasLoading(true);
    api.get(`/api/bolsas/aluno/${alunoPerfilId}`)
      .then((d: any) => setPerfilBolsas(Array.isArray(d) ? d : []))
      .catch(() => setPerfilBolsas([]))
      .finally(() => setPerfilBolsasLoading(false));
  }, [alunoPerfilId]);

  // --- Solicitações de Documentos (validação financeira) ---
  interface SolDoc { id: string; alunoId: string; tipo: string; motivo: string; status: string; referenciaPagamento?: string; createdAt: string; updatedAt?: string; nomeAluno?: string; apelidoAluno?: string; alunoNumMatricula?: string; nomeTurma?: string; classeAluno?: string; validadoPorFinanceiro?: boolean; validadoPorFinanceiroNome?: string; validadoPorFinanceiroEm?: string; motivoRejeicaoFinanceiro?: string; }
  const [solDocs, setSolDocs]               = useState<SolDoc[]>([]);
  const [solDocsLoading, setSolDocsLoading] = useState(false);
  const [solDocSelected, setSolDocSelected] = useState<SolDoc | null>(null);
  const [solDocModalVis, setSolDocModalVis] = useState(false);
  const [solDocSaving, setSolDocSaving]     = useState(false);
  const [solDocRejeicao, setSolDocRejeicao] = useState('');
  const [solDocRefPag, setSolDocRefPag]     = useState('');

  const fetchSolDocs = useCallback(async () => {
    setSolDocsLoading(true);
    try {
      const res = await api.get<SolDoc[]>('/api/solicitacoes-documentos');
      const data: SolDoc[] = Array.isArray(res) ? res : [];
      setSolDocs(data.filter((s: SolDoc) => s.status === 'pendente' || s.status === 'em_processamento'));
    } catch { setSolDocs([]); } finally { setSolDocsLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'solicitacoes_docs') fetchSolDocs(); }, [tab]);

  const [showTransferModal, setShowTransferModal]   = useState(false);
  const [transferPagId, setTransferPagId]           = useState<string | null>(null);
  const [transferDestino, setTransferDestino]       = useState<string>('saldo');
  const [transferLoading, setTransferLoading]       = useState(false);

  const [showModalPag,   setShowModalPag]   = useState(false);
  const [showConfirmPag, setShowConfirmPag] = useState(false);
  const [rupeConfirmado, setRupeConfirmado] = useState<{
    id: string; referencia: string; dataValidade: string; dataGeracao: string;
    valor: number; nomeAluno: string; descricao: string; nomeMes: string | null;
  } | null>(null);
  const [isSalvandoRupe, setIsSalvandoRupe] = useState(false);
  const [showModalTaxa,  setShowModalTaxa]  = useState(false);
  const [editTaxa,       setEditTaxa]       = useState<Taxa | null>(null);
  const [showAlunoList,  setShowAlunoList]  = useState(false);
  const [showTaxaList,   setShowTaxaList]   = useState(false);
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [showRecibo,     setShowRecibo]     = useState(false);
  const [reciboId,       setReciboId]       = useState<string | null>(null);
  const [notifLoading,   setNotifLoading]   = useState(false);
  const [propTurmaFilter, setPropTurmaFilter] = useState<string>('todas');
  const [propSearchAluno, setPropSearchAluno] = useState('');

  const defaultFormPag = { alunoId: '', taxaId: '', valor: '', mes: '', mesBloqueado: false, rubricaBloqueada: false, alunoBloqueado: false, metodoPagamento: 'multicaixa' as MetodoPagamento, referencia: '', observacao: '' };
  const defaultFormTaxa = { tipo: (propinaHabilitada ? 'propina' : 'matricula') as TipoTaxa, descricao: '', valor: '', frequencia: 'mensal' as FrequenciaTaxa, nivel: 'Todos' };
  const [formPag,  setFormPag]  = useState(defaultFormPag);
  const [multaEstimadaCaderneta, setMultaEstimadaCaderneta] = useState(0);
  /** Aviso de pagamento fora de ordem — aguarda confirmação do utilizador */
  const [confirmOrdemMes, setConfirmOrdemMes] = useState<{
    alunoId: string; mes: number; mesesEmFalta: number[]; multa: number;
    formData: Record<string, any>;
  } | null>(null);
  const [formTaxa, setFormTaxa] = useState(defaultFormTaxa);
  const [taxaErrors, setTaxaErrors] = useState<{ descricao?: string; valor?: string; submit?: string }>({});
  const [savingTaxa, setSavingTaxa] = useState(false);

  // ── Criar novo tipo de rubrica ─────────────────────────────
  const ICONES_TIPO: string[] = [
    'pricetag', 'car', 'bus', 'restaurant', 'fast-food', 'shirt', 'medkit',
    'school', 'library', 'people', 'home', 'gift', 'trophy', 'star', 'sparkles',
  ];
  const CORES_TIPO: string[] = [
    Colors.info, Colors.gold, Colors.success, Colors.warning, Colors.danger,
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', Colors.textMuted,
  ];
  const [showAddTipo, setShowAddTipo] = useState(false);
  const [newTipoLabel, setNewTipoLabel] = useState('');
  const [newTipoIcon, setNewTipoIcon] = useState<string>(ICONES_TIPO[0]);
  const [newTipoCor, setNewTipoCor]   = useState<string>(CORES_TIPO[0]);
  const [savingTipo, setSavingTipo] = useState(false);

  async function criarNovoTipo() {
    const label = newTipoLabel.trim();
    if (!label) return;
    setSavingTipo(true);
    try {
      const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const { addLookupItemLocal, invalidateLookupCache } = await import('@/hooks/useLookup');
      // Mostra de imediato no UI (funciona online e offline)
      addLookupItemLocal('tipos_taxa', {
        id: Date.now(), valor: slug, label, ordem: 999, ativo: true, icon: newTipoIcon, cor: newTipoCor,
      });
      setNewTipoLabel('');
      setNewTipoIcon(ICONES_TIPO[0]);
      setNewTipoCor(CORES_TIPO[0]);
      setShowAddTipo(false);
      setFormTaxa(f => ({ ...f, tipo: slug as TipoTaxa }));
      try {
        const res: any = await api.post('/api/lookup', { categoria: 'tipos_taxa', valor: slug, label, ordem: 999, icon: newTipoIcon, cor: newTipoCor });
        if (res?.offlineQueued) {
          alertSucesso('Guardado offline', `"${label}" será sincronizado quando voltar a ter ligação.`);
        } else {
          // Servidor devolveu o registo real — recarrega para obter o id correcto
          invalidateLookupCache('tipos_taxa');
          alertSucesso('Tipo criado', `"${label}" foi adicionado com sucesso.`);
        }
      } catch (apiErr: any) {
        // Distingue erros HTTP (permissão/validação) de falhas de rede.
        const msg = String(apiErr?.message ?? '');
        const isHttpError = /^\d{3}:/.test(msg);
        if (isHttpError) {
          // Reverte a adição local — o servidor recusou.
          const { removeLookupItemLocal } = await import('@/hooks/useLookup');
          try { removeLookupItemLocal('tipos_taxa', slug); } catch {}
          setFormTaxa(f => (f.tipo === slug ? { ...f, tipo: 'propina' as TipoTaxa } : f));
          if (msg.startsWith('401:') || msg.startsWith('403:')) {
            alertErro('Sem permissão', 'Não tem permissão para criar tipos de rubrica neste servidor. Contacte o administrador.');
          } else {
            alertErro('Erro do servidor', msg.replace(/^\d{3}:\s*/, '') || 'Não foi possível criar o tipo no servidor.');
          }
        } else {
          // Erro de rede genuíno — fica no cache local até voltar online (queue trata o resto)
          alertSucesso('Guardado localmente', `"${label}" será enviado ao servidor quando houver ligação.`);
        }
      }
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível criar o tipo.');
    } finally {
      setSavingTipo(false);
    }
  }

  // ── Editar tipo de rubrica personalizado ───────────────────
  const [showEditTipo, setShowEditTipo] = useState(false);
  const [editTipoSlug, setEditTipoSlug] = useState<string | null>(null);
  const [editTipoLabel, setEditTipoLabel] = useState('');
  const [editTipoIcon, setEditTipoIcon]   = useState<string>('pricetag');
  const [editTipoCor, setEditTipoCor]     = useState<string>(Colors.info);
  const [savingEditTipo, setSavingEditTipo] = useState(false);

  function abrirEdicaoTipo(slug: string) {
    if ((TIPOS_FALLBACK as string[]).includes(slug)) {
      alertErro('Tipo predefinido', 'Os tipos predefinidos do sistema não podem ser editados.');
      return;
    }
    const item = tipoItemFn(slug);
    if (!item) {
      alertErro('Tipo não encontrado', 'Aguarde a sincronização e tente de novo.');
      return;
    }
    setEditTipoSlug(slug);
    setEditTipoLabel(item.label ?? slug);
    setEditTipoIcon(item.icon ?? 'pricetag');
    setEditTipoCor(item.cor ?? Colors.info);
    setShowEditTipo(true);
  }

  async function guardarEdicaoTipo() {
    if (!editTipoSlug) return;
    const novoLabel = editTipoLabel.trim();
    if (!novoLabel) { alertErro('Nome obrigatório', 'Indique um nome para o tipo.'); return; }
    const item = tipoItemFn(editTipoSlug);
    if (!item || !item.id) {
      alertErro('Tipo não encontrado', 'Este tipo ainda não foi sincronizado com o servidor. Aguarde uns segundos e tente de novo.');
      return;
    }
    setSavingEditTipo(true);
    try {
      await api.put(`/api/lookup/${item.id}`, { label: novoLabel, icon: editTipoIcon, cor: editTipoCor });
      const { invalidateLookupCache } = await import('@/hooks/useLookup');
      invalidateLookupCache('tipos_taxa');
      setShowEditTipo(false);
      setEditTipoSlug(null);
      alertSucesso('Tipo actualizado', `O tipo foi renomeado para "${novoLabel}".`);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      let pretty = msg.replace(/^\d{3}:\s*/, '');
      try { const parsed = JSON.parse(pretty); if (parsed?.error) pretty = parsed.error; } catch { /* não é JSON */ }
      alertErro('Não foi possível guardar', pretty || 'Erro desconhecido.');
    } finally {
      setSavingEditTipo(false);
    }
  }

  // ── Apagar tipo de rubrica personalizado ───────────────────
  const TIPOS_PROTEGIDOS = TIPOS_FALLBACK as string[];
  async function apagarTipo(slug: string) {
    if (TIPOS_PROTEGIDOS.includes(slug)) {
      alertErro('Tipo predefinido', 'Os tipos predefinidos do sistema não podem ser apagados.');
      return;
    }
    const item = tipoItemFn(slug);
    if (!item || !item.id) {
      alertErro('Tipo não encontrado', 'Este tipo ainda não foi sincronizado com o servidor. Aguarde uns segundos e tente de novo.');
      return;
    }
    const label = item.label ?? slug;
    webAlert('Apagar tipo de rubrica', `Tem a certeza que quer apagar o tipo "${label}"? Esta acção é permanente. Tipos em uso por rubricas existentes não podem ser removidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/lookup/${item.id}`);
          const { removeLookupItemLocal, invalidateLookupCache } = await import('@/hooks/useLookup');
          removeLookupItemLocal('tipos_taxa', slug);
          invalidateLookupCache('tipos_taxa');
          if (formTaxa.tipo === slug) {
            setFormTaxa(f => ({ ...f, tipo: (propinaHabilitada ? 'propina' : 'matricula') as TipoTaxa }));
          }
          if (tipoFilter === slug) setTipoFilter('todos');
          if (relTipo === slug) setRelTipo('todos');
          alertSucesso('Tipo apagado', `"${label}" foi removido com sucesso.`);
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          // Mensagens HTTP do backend vêm no formato "409: { error: '...' }" ou similar.
          let pretty = msg.replace(/^\d{3}:\s*/, '');
          try {
            const parsed = JSON.parse(pretty);
            if (parsed?.error) pretty = parsed.error;
          } catch { /* não é JSON */ }
          alertErro('Não foi possível apagar', pretty || 'Erro desconhecido.');
        }
      }},
    ]);
  }

  // ── Plano de Contas state ───────────────────────────────────
  const [planoContas, setPlanoContas]           = useState<any[]>([]);
  const [planoContasLoading, setPlanoContasLoading] = useState(false);
  const [showPlanoModal, setShowPlanoModal]     = useState(false);
  const [editPlano, setEditPlano]               = useState<any | null>(null);
  const defaultFormPlano = { codigo: '', nome: '', tipo: 'receita', parentId: '', descricao: '' };
  const [formPlano, setFormPlano]               = useState(defaultFormPlano);
  const [savingPlano, setSavingPlano]           = useState(false);

  const loadPlanoContas = useCallback(async () => {
    setPlanoContasLoading(true);
    try {
      const d = await api.get('/api/plano-contas');
      setPlanoContas((d as any).data ?? d);
    } catch { } finally { setPlanoContasLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'plano_contas') loadPlanoContas(); }, [tab]);

  async function savePlano() {
    if (!formPlano.codigo.trim() || !formPlano.nome.trim() || !formPlano.tipo) {
      alertErro('Campos obrigatórios', 'Código, nome e tipo são obrigatórios.'); return;
    }
    setSavingPlano(true);
    try {
      const payload = { ...formPlano, parentId: formPlano.parentId || null };
      if (editPlano) {
        await api.put(`/api/plano-contas/${editPlano.id}`, { ...payload, ativo: true });
      } else {
        await api.post('/api/plano-contas', payload);
      }
      setShowPlanoModal(false); setEditPlano(null); setFormPlano(defaultFormPlano);
      await loadPlanoContas();
      alertSucesso('Guardado', 'Conta guardada com sucesso.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível guardar.');
    } finally { setSavingPlano(false); }
  }

  async function deletePlano(id: string) {
    webAlert('Eliminar conta', 'Tem a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/plano-contas/${id}`);
          await loadPlanoContas();
          alertSucesso('Eliminado', 'Conta eliminada.');
        } catch (e: any) { alertErro('Erro', e.message ?? 'Não foi possível eliminar.'); }
      }},
    ]);
  }

  // ── Contas a Pagar state ────────────────────────────────────
  const [contasPagar, setContasPagar]           = useState<any[]>([]);
  const [contasPagarLoading, setContasPagarLoading] = useState(false);
  const [showContaModal, setShowContaModal]     = useState(false);
  const [editConta, setEditConta]               = useState<any | null>(null);
  const defaultFormConta = { descricao: '', fornecedor: '', valor: '', dataVencimento: '', dataPagamento: '', status: 'pendente', metodoPagamento: 'dinheiro', planoContaId: '', referencia: '', observacao: '' };
  const [formConta, setFormConta]               = useState(defaultFormConta);
  const [savingConta, setSavingConta]           = useState(false);

  const loadContasPagar = useCallback(async () => {
    setContasPagarLoading(true);
    try {
      const d = await api.get('/api/contas-pagar');
      setContasPagar((d as any).data ?? d);
    } catch { } finally { setContasPagarLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'contas_pagar' || tab === 'resumo') loadContasPagar(); }, [tab]);

  async function saveConta() {
    if (!formConta.descricao.trim() || !formConta.valor || !formConta.dataVencimento) {
      alertErro('Campos obrigatórios', 'Descrição, valor e data de vencimento são obrigatórios.'); return;
    }
    setSavingConta(true);
    try {
      const payload = { ...formConta, valor: parseFloat(formConta.valor), planoContaId: formConta.planoContaId || null, dataPagamento: formConta.dataPagamento || null };
      if (editConta) {
        await api.put(`/api/contas-pagar/${editConta.id}`, payload);
      } else {
        await api.post('/api/contas-pagar', payload);
      }
      setShowContaModal(false); setEditConta(null); setFormConta(defaultFormConta);
      await loadContasPagar();
      alertSucesso('Guardado', 'Conta a pagar guardada com sucesso.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível guardar.');
    } finally { setSavingConta(false); }
  }

  async function marcarContaPaga(conta: any) {
    const hoje = new Date().toISOString().split('T')[0];
    try {
      await api.put(`/api/contas-pagar/${conta.id}`, { ...conta, status: 'pago', dataPagamento: hoje, valor: conta.valor });
      await loadContasPagar();
      alertSucesso('Liquidado', 'Conta marcada como paga.');
    } catch (e: any) { alertErro('Erro', e.message ?? 'Não foi possível actualizar.'); }
  }

  async function deleteConta(id: string) {
    webAlert('Eliminar conta', 'Tem a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/contas-pagar/${id}`);
          await loadContasPagar();
          alertSucesso('Eliminado', 'Conta eliminada.');
        } catch (e: any) { alertErro('Erro', e.message ?? 'Não foi possível eliminar.'); }
      }},
    ]);
  }

  // ── Relatórios Financeiros state ────────────────────────────
  // ── Vendas state ──────────────────────────────────────────────
  const [vendasData, setVendasData]           = useState<any>(null);
  const [vendasLoading, setVendasLoading]     = useState(false);
  const [vendasAno, setVendasAno]             = useState(new Date().getFullYear().toString());
  const [vendasCategoria, setVendasCategoria] = useState<'todos' | 'Serviços' | 'Produtos'>('todos');

  async function carregarVendas() {
    setVendasLoading(true);
    try {
      const d = await api.get(`/api/financeiro/relatorio-vendas?ano=${vendasAno}`);
      setVendasData((d as any).data ?? d);
    } catch { } finally { setVendasLoading(false); }
  }
  useEffect(() => { if (tab === 'vendas' && !vendasData) carregarVendas(); }, [tab]);

  // ── Relatório de Vendas Consolidado state ───────────────────
  function primeiroDiaDoMes() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const [consolidadoData, setConsolidadoData]         = useState<any>(null);
  const [consolidadoLoading, setConsolidadoLoading]   = useState(false);
  const [consolidadoInicio, setConsolidadoInicio]     = useState(primeiroDiaDoMes());
  const [consolidadoFim, setConsolidadoFim]           = useState(new Date().toISOString().slice(0, 10));
  const [consolidadoTurmaId, setConsolidadoTurmaId]   = useState('');

  async function carregarConsolidado() {
    setConsolidadoLoading(true);
    try {
      const qs = new URLSearchParams({ dataInicio: consolidadoInicio, dataFim: consolidadoFim });
      if (consolidadoTurmaId) qs.set('turmaId', consolidadoTurmaId);
      const d = await api.get(`/api/financeiro/relatorio-vendas-consolidado?${qs.toString()}`);
      setConsolidadoData((d as any).data ?? d);
    } catch { } finally { setConsolidadoLoading(false); }
  }
  useEffect(() => { if (tab === 'vendas' && !consolidadoData) carregarConsolidado(); }, [tab]);

  // ── Fecho de Caixa state ───────────────────────────────────
  const [fechos, setFechos]               = useState<any[]>([]);
  const [fechosLoading, setFechosLoading] = useState(false);
  const [fechoData, setFechoData]         = useState('');
  const [fechoObs, setFechoObs]           = useState('');
  const [fechoValorContado, setFechoValorContado] = useState('');
  const [fechoSaving, setFechoSaving]     = useState(false);
  const [fechoSelected, setFechoSelected] = useState<any>(null);
  const [fechoPreview, setFechoPreview]   = useState<any>(null);
  const [fechoPreviewLoading, setFechoPreviewLoading] = useState(false);
  const [reaberturaFecho, setReaberturaFecho] = useState<any>(null);
  const [reaberturaMotivo, setReaberturaMotivo] = useState('');
  const [reaberturaSaving, setReaberturaSaving] = useState(false);
  const [reaberturas, setReaberturas]     = useState<any[]>([]);
  const [reaberturasLoading, setReaberturasLoading] = useState(false);
  const ADMIN_ROLES_FC = new Set(['ceo', 'pca', 'admin']);
  const isAdminFC = ADMIN_ROLES_FC.has(String(user?.role || ''));

  async function carregarFechos() {
    setFechosLoading(true);
    try {
      const d = await api.get('/api/financeiro/fechos-caixa');
      setFechos(Array.isArray((d as any).data) ? (d as any).data : Array.isArray(d) ? d as any[] : []);
    } catch { } finally { setFechosLoading(false); }
  }
  async function carregarReaberturas() {
    setReaberturasLoading(true);
    try {
      const d = await api.get('/api/financeiro/reaberturas-caixa');
      setReaberturas(Array.isArray((d as any).data) ? (d as any).data : Array.isArray(d) ? d as any[] : []);
    } catch { } finally { setReaberturasLoading(false); }
  }
  useEffect(() => { if (tab === 'fecho_caixa') { carregarFechos(); carregarReaberturas(); } }, [tab]);

  useEffect(() => {
    if (!fechoData || tab !== 'fecho_caixa') { setFechoPreview(null); return; }
    let cancel = false;
    setFechoPreviewLoading(true);
    api.get(`/api/financeiro/fecho-caixa/preview?data=${encodeURIComponent(fechoData)}`)
      .then((d: any) => { if (!cancel) setFechoPreview(d); })
      .catch(() => { if (!cancel) setFechoPreview(null); })
      .finally(() => { if (!cancel) setFechoPreviewLoading(false); });
    return () => { cancel = true; };
  }, [fechoData, tab]);

  const fechoDiferenca = useMemo(() => {
    if (!fechoPreview || fechoValorContado === '') return null;
    const contado = parseFloat(fechoValorContado);
    if (isNaN(contado)) return null;
    return Number((contado - Number(fechoPreview.totalCaixa || 0)).toFixed(2));
  }, [fechoPreview, fechoValorContado]);

  async function realizarFechoCaixa() {
    if (!fechoData) { alertErro('Seleccione a data do fecho.'); return; }
    setFechoSaving(true);
    try {
      await api.post('/api/financeiro/fecho-caixa', {
        data: fechoData,
        anoLetivo: anoSelecionado?.ano || '',
        observacoes: fechoObs,
        valorContado: fechoValorContado !== '' ? parseFloat(fechoValorContado) : undefined,
      });
      alertSucesso('Fecho de caixa realizado com sucesso!');
      setFechoData(''); setFechoObs(''); setFechoValorContado(''); setFechoPreview(null);
      carregarFechos();
    } catch (e: any) {
      alertErro((e as any)?.response?.data?.error || e.message || 'Erro ao realizar fecho.');
    } finally { setFechoSaving(false); }
  }

  async function solicitarReaberturaCaixa() {
    if (!reaberturaFecho) return;
    if (!reaberturaMotivo.trim()) { alertErro('Indique o motivo do pedido de reabertura.'); return; }
    setReaberturaSaving(true);
    try {
      await api.post(`/api/financeiro/fecho-caixa/${reaberturaFecho.id}/pedido-reabertura`, { motivo: reaberturaMotivo.trim() });
      alertSucesso('Pedido de reabertura enviado. Aguarde aprovação de um administrador.');
      setReaberturaFecho(null); setReaberturaMotivo('');
      carregarReaberturas();
    } catch (e: any) {
      alertErro((e as any)?.response?.data?.error || e.message || 'Erro ao solicitar reabertura.');
    } finally { setReaberturaSaving(false); }
  }

  async function decidirReaberturaCaixa(id: string, decisao: 'aprovado' | 'rejeitado') {
    try {
      await api.post(`/api/financeiro/reaberturas-caixa/${id}/decidir`, { decisao });
      alertSucesso(decisao === 'aprovado' ? 'Reabertura aprovada. O dia foi reaberto.' : 'Pedido de reabertura rejeitado.');
      carregarReaberturas();
      carregarFechos();
    } catch (e: any) {
      alertErro((e as any)?.response?.data?.error || e.message || 'Erro ao processar decisão.');
    }
  }

  const [relFinTab, setRelFinTab]               = useState<'comparativo' | 'inadimplencia' | 'entradas_saidas'>('comparativo');
  const [relFinLoading, setRelFinLoading]       = useState(false);
  const [relFinComparativo, setRelFinComparativo] = useState<any>(null);
  const [relFinInadimplencia, setRelFinInadimplencia] = useState<any>(null);
  const [relFinEntradasSaidas, setRelFinEntradasSaidas] = useState<any>(null);
  const [relFinAno, setRelFinAno]               = useState(new Date().getFullYear().toString());
  const [relFinDataInicio, setRelFinDataInicio] = useState('');
  const [relFinDataFim, setRelFinDataFim]       = useState('');

  async function loadRelFinComparativo() {
    setRelFinLoading(true);
    try {
      const d = await api.get(`/api/financeiro/relatorio-comparativo?ano=${relFinAno}`);
      setRelFinComparativo((d as any).data ?? d);
    } catch { } finally { setRelFinLoading(false); }
  }

  async function loadRelFinInadimplencia() {
    setRelFinLoading(true);
    try {
      const d = await api.get(`/api/financeiro/relatorio-inadimplencia?ano=${relFinAno}`);
      setRelFinInadimplencia((d as any).data ?? d);
    } catch { } finally { setRelFinLoading(false); }
  }

  async function loadRelFinEntradasSaidas() {
    if (!relFinDataInicio || !relFinDataFim) { alertErro('Filtro', 'Seleccione data de início e fim.'); return; }
    setRelFinLoading(true);
    try {
      const d = await api.get(`/api/financeiro/relatorio-entradas-saidas?dataInicio=${relFinDataInicio}&dataFim=${relFinDataFim}`);
      setRelFinEntradasSaidas((d as any).data ?? d);
    } catch { } finally { setRelFinLoading(false); }
  }

  useEffect(() => {
    if (tab === 'relatorios_fin') {
      if (relFinTab === 'comparativo') loadRelFinComparativo();
      else if (relFinTab === 'inadimplencia') loadRelFinInadimplencia();
    }
  }, [tab, relFinTab]);

  // ── Comprovativo state ──────────────────────────────────────
  const [showComprovativo, setShowComprovativo] = useState(false);
  const [comprovativoPag, setComprovativoPag]   = useState<any | null>(null);
  const [comprovativoLoading, setComprovativoLoading] = useState(false);

  async function abrirComprovativo(pagId: string) {
    setComprovativoLoading(true);
    try {
      const d = await api.get(`/api/pagamentos/${pagId}/comprovativo`);
      setComprovativoPag((d as any).data ?? d);
      setShowComprovativo(true);
    } catch (e: any) { alertErro('Erro', e.message ?? 'Não foi possível carregar.'); }
    finally { setComprovativoLoading(false); }
  }

  // ── Cobrança Avulsa state ───────────────────────────────────
  const [showAvulsoModal, setShowAvulsoModal]   = useState(false);
  const [savingAvulso, setSavingAvulso]         = useState(false);
  const defaultFormAvulso = { alunoId: '', taxaId: '', valor: '', data: new Date().toISOString().split('T')[0], mes: '', ano: new Date().getFullYear().toString(), metodoPagamento: 'transferencia', referencia: '', observacao: '', status: 'pago' };
  const [formAvulso, setFormAvulso]             = useState(defaultFormAvulso);
  const [showAvulsoAlunoList, setShowAvulsoAlunoList] = useState(false);
  const [showAvulsoTaxaList, setShowAvulsoTaxaList]   = useState(false);

  async function saveAvulso() {
    if (!formAvulso.alunoId || !formAvulso.taxaId || !formAvulso.valor || !formAvulso.data) {
      alertErro('Campos obrigatórios', 'Aluno, taxa, valor e data são obrigatórios.'); return;
    }
    setSavingAvulso(true);
    try {
      await api.post('/api/pagamentos/avulso', { ...formAvulso, valor: parseFloat(formAvulso.valor), mes: formAvulso.mes ? parseInt(formAvulso.mes) : null });
      setShowAvulsoModal(false); setFormAvulso(defaultFormAvulso);
      alertSucesso('Cobrança criada', 'Cobrança avulsa registada com sucesso.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível criar.');
    } finally { setSavingAvulso(false); }
  }

  // ── Cancelar/Recriar state ──────────────────────────────────
  const [showCancelarRecriarModal, setShowCancelarRecriarModal] = useState(false);
  const [cancelarRecriarPagId, setCancelarRecriarPagId]         = useState<string | null>(null);
  const [cancelarRecriarLoading, setCancelarRecriarLoading]     = useState(false);
  const defaultFormRecriar = { valor: '', data: new Date().toISOString().split('T')[0], metodoPagamento: 'transferencia', referencia: '', observacao: '', status: 'pendente', motivo: '' };
  const [formRecriar, setFormRecriar]           = useState(defaultFormRecriar);

  async function cancelarERecriar() {
    if (!cancelarRecriarPagId) return;
    if (!formRecriar.motivo.trim()) {
      alertErro('Motivo obrigatório', 'Indique o motivo do cancelamento — ficará registado na auditoria.');
      return;
    }
    setCancelarRecriarLoading(true);
    try {
      await api.post(`/api/pagamentos/${cancelarRecriarPagId}/cancelar-recriar`, {
        ...formRecriar, valor: formRecriar.valor ? parseFloat(formRecriar.valor) : undefined,
      });
      setShowCancelarRecriarModal(false); setCancelarRecriarPagId(null); setFormRecriar(defaultFormRecriar);
      alertSucesso('Recriado', 'Cobrança cancelada e recriada com sucesso.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível recriar.');
    } finally { setCancelarRecriarLoading(false); }
  }

  // ── Histórico de Auditoria do Pagamento ─────────────────────────────────────
  const [showAuditModal, setShowAuditModal]     = useState(false);
  const [auditPagId, setAuditPagId]             = useState<string | null>(null);
  const [auditLogs, setAuditLogs]               = useState<any[]>([]);
  const [auditLoading, setAuditLoading]         = useState(false);

  async function abrirAuditoriaPagamento(pagId: string) {
    setAuditPagId(pagId);
    setShowAuditModal(true);
    setAuditLoading(true);
    setAuditLogs([]);
    try {
      const r: any = await api.get(`/api/audit-logs?recursoId=${encodeURIComponent(pagId)}&limit=200`);
      setAuditLogs(Array.isArray(r?.logs) ? r.logs : []);
    } catch (e: any) {
      alertErro('Sem permissão', e?.message || 'Não foi possível carregar o histórico (apenas administradores podem ver a auditoria).');
    } finally { setAuditLoading(false); }
  }

  // ── Orçamento Anual por Rubrica ─────────────────────────────────────────────
  type OrcamentoItem = {
    taxaId: string; rubricaTipo: string; rubricaDescricao: string; valorTaxa: number;
    frequencia: string; nivel: string; anoAcademico: string;
    orcamentoId: string | null; ano: string;
    valorPrevisto: number; valorCobrado: number; valorEmFalta: number;
    valorPendentePagamentos: number; numPagos: number;
    percentagemCobrada: number; observacoes: string | null; temOrcamento: boolean;
    atualizadoEm: string | null; criadoPor: string | null;
  };
  const [orcamentos, setOrcamentos]             = useState<OrcamentoItem[]>([]);
  const [orcamentoTotais, setOrcamentoTotais]   = useState<{ previsto: number; cobrado: number; emFalta: number; percentagem: number; numRubricas: number; numComOrcamento: number } | null>(null);
  const [orcamentoAno, setOrcamentoAno]         = useState<string>(String(new Date().getFullYear()));
  const [orcamentoLoading, setOrcamentoLoading] = useState(false);
  const [orcamentoFiltro, setOrcamentoFiltro]   = useState<'todas' | 'definidas' | 'por_definir'>('todas');
  const [showOrcModal, setShowOrcModal]         = useState(false);
  const [orcEditItem, setOrcEditItem]           = useState<OrcamentoItem | null>(null);
  const [orcValor, setOrcValor]                 = useState('');
  const [orcObs, setOrcObs]                     = useState('');
  const [orcSaving, setOrcSaving]               = useState(false);

  // ── Pagamentos por Rubrica ──────────────────────────────────
  const [pagRubricaSelected,     setPagRubricaSelected]     = useState<OrcamentoItem | null>(null);
  const [pagRubricaSearch,       setPagRubricaSearch]       = useState('');
  const [pagRubricaStatusFiltro, setPagRubricaStatusFiltro] = useState<'todos' | 'pago' | 'pendente' | 'cancelado'>('todos');
  const [pagRubricaSaving,       setPagRubricaSaving]       = useState<string | null>(null);
  const [pagRubricaVista,        setPagRubricaVista]        = useState<'lista' | 'caderneta'>('lista');

  const fetchOrcamentos = useCallback(async (anoAlvo?: string) => {
    setOrcamentoLoading(true);
    try {
      const ano = anoAlvo || orcamentoAno;
      const r: any = await api.get(`/api/orcamentos?ano=${encodeURIComponent(ano)}`);
      setOrcamentos(Array.isArray(r?.itens) ? r.itens : []);
      setOrcamentoTotais(r?.totais || null);
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível carregar os orçamentos.');
    } finally { setOrcamentoLoading(false); }
  }, [orcamentoAno]);

  useEffect(() => { if (tab === 'orcamento' || tab === 'pag_rubrica') fetchOrcamentos(); }, [tab, orcamentoAno]);

  // Manter o ano de pagamento/orçamento sempre actualizado com o ano civil
  // corrente dentro do ano lectivo activo (ex.: passa de 2025 para 2026
  // automaticamente). Só recalcula quando o ano lectivo activo muda (ex.:
  // transição para um novo ano lectivo) — nunca sobrepõe uma navegação manual
  // do utilizador para consultar/pagar dívidas de anos anteriores.
  useEffect(() => {
    if (anoSelecionado?.ano) {
      setOrcamentoAno(calcularAnoPagamentoAtual(anoSelecionado));
    }
  }, [anoSelecionado?.ano]);

  function abrirOrcamentoEdit(item: OrcamentoItem) {
    setOrcEditItem(item);
    setOrcValor(item.valorPrevisto > 0 ? String(item.valorPrevisto) : '');
    setOrcObs(item.observacoes || '');
    setShowOrcModal(true);
  }

  async function salvarOrcamento() {
    if (!orcEditItem) return;
    const v = parseFloat(orcValor);
    if (!Number.isFinite(v) || v < 0) {
      alertErro('Valor inválido', 'Indique um valor previsto ≥ 0.');
      return;
    }
    setOrcSaving(true);
    try {
      await api.post('/api/orcamentos', {
        taxaId: orcEditItem.taxaId,
        ano: orcamentoAno,
        valorPrevisto: v,
        observacoes: orcObs.trim() || null,
      });
      setShowOrcModal(false); setOrcEditItem(null);
      await fetchOrcamentos();
      alertSucesso('Gravado', 'Orçamento da rubrica actualizado.');
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível gravar.');
    } finally { setOrcSaving(false); }
  }

  async function removerOrcamento(item: OrcamentoItem) {
    if (!item.orcamentoId) return;
    if (!confirm(`Remover orçamento de "${item.rubricaDescricao}" para ${orcamentoAno}?`)) return;
    try {
      await api.delete(`/api/orcamentos/${item.orcamentoId}`);
      await fetchOrcamentos();
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível remover.');
    }
  }

  // ── Feriados state ──────────────────────────────────────────
  const [feriados, setFeriados]                 = useState<any[]>([]);
  const [feriadosLoading, setFeriadosLoading]   = useState(false);
  const [showFeriadoModal, setShowFeriadoModal] = useState(false);
  const [editFeriado, setEditFeriado]           = useState<any | null>(null);
  const defaultFormFeriado = { nome: '', data: '', tipo: 'nacional', recorrente: true, ativo: true };
  const [formFeriado, setFormFeriado]           = useState(defaultFormFeriado);
  const [savingFeriado, setSavingFeriado]       = useState(false);

  const loadFeriados = useCallback(async () => {
    setFeriadosLoading(true);
    try {
      const d = await api.get('/api/feriados');
      setFeriados((d as any).data ?? d);
    } catch { } finally { setFeriadosLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'feriados') loadFeriados(); }, [tab]);

  async function saveFeriado() {
    if (!formFeriado.nome.trim() || !formFeriado.data) {
      alertErro('Campos obrigatórios', 'Nome e data são obrigatórios.'); return;
    }
    setSavingFeriado(true);
    try {
      if (editFeriado) {
        await api.put(`/api/feriados/${editFeriado.id}`, formFeriado);
      } else {
        await api.post('/api/feriados', formFeriado);
      }
      setShowFeriadoModal(false); setEditFeriado(null); setFormFeriado(defaultFormFeriado);
      await loadFeriados();
      alertSucesso('Guardado', 'Feriado guardado com sucesso.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível guardar.');
    } finally { setSavingFeriado(false); }
  }

  async function deleteFeriado(id: string) {
    webAlert('Eliminar feriado', 'Tem a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/feriados/${id}`);
          await loadFeriados();
          alertSucesso('Eliminado', 'Feriado eliminado.');
        } catch (e: any) { alertErro('Erro', e.message ?? 'Não foi possível eliminar.'); }
      }},
    ]);
  }

  React.useEffect(() => {
    if (!propinaHabilitada && tab === 'em_atraso') {
      setTab('painel');
    }
  }, [propinaHabilitada]);

  const pagamentosAno = useMemo(() => pagamentos.filter(p => matchAno(p.ano, anoAtual)), [pagamentos, anoAtual]);
  const taxasAno      = useMemo(() => taxas.filter(t => t.anoAcademico === anoAtual), [taxas, anoAtual]);
  const taxasAtivas   = useMemo(() => taxasAno.filter(t => t.ativo), [taxasAno]);

  const totalRecebido = getTotalRecebido(anoAtual);
  const totalPendente = getTotalPendente(anoAtual);
  const totalCobrado  = totalRecebido + totalPendente;
  const percentPago   = totalCobrado > 0 ? Math.round((totalRecebido / totalCobrado) * 100) : 0;
  const nTransacoes   = pagamentosAno.length;
  const nAlunos       = new Set(pagamentosAno.map(p => p.alunoId)).size;

  const alunosAtivos = useMemo(() => alunos.filter(a => a.ativo), [alunos]);

  const alunosEmAtraso = useMemo(() => {
    if (!propinaHabilitada) return [];
    return alunosAtivos
      .map(a => {
        const meses = getMesesEmAtraso(a.id, anoAtual);
        const taxaPropina = taxasAtivas.find(t => t.tipo === 'propina');
        const valorPropina = taxaPropina?.valor || 0;
        const multa = calcularMulta(valorPropina, meses);
        const pagsAluno = pagamentosAno.filter(p => p.alunoId === a.id);
        const pendente = pagsAluno.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
        return { aluno: a, mesesAtraso: meses, multa, valorPropina, pendente };
      })
      .filter(x => x.mesesAtraso > 0 || x.pendente > 0)
      .sort((a, b) => b.mesesAtraso - a.mesesAtraso);
  }, [propinaHabilitada, alunosAtivos, pagamentosAno, taxasAtivas, anoAtual, multaConfig]);

  const anoPagamentoActivo = useMemo(() => calcularAnoPagamentoAtual(anoSelecionado), [anoSelecionado]);

  const dividasPorAno = useMemo(() => {
    const mapa = new Map<string, { valor: number; alunos: Set<string> }>();
    pagamentos
      .filter(p => p.status === 'pendente' && !matchAno(p.ano, anoPagamentoActivo))
      .forEach(p => {
        const entrada = mapa.get(p.ano) || { valor: 0, alunos: new Set<string>() };
        entrada.valor += Number(p.valor) || 0;
        entrada.alunos.add(p.alunoId);
        mapa.set(p.ano, entrada);
      });
    return Array.from(mapa.entries())
      .map(([ano, v]) => ({ ano, valor: v.valor, nAlunos: v.alunos.size }))
      .sort((a, b) => b.ano.localeCompare(a.ano));
  }, [pagamentos, anoPagamentoActivo]);

  const todasMensagens = useMemo(() => [...mensagens].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()), [mensagens]);

  const pagamentosFiltrados = useMemo(() => {
    let list = pagamentosAno;
    if (statusFilter !== 'todos') list = list.filter(p => p.status === statusFilter);
    if (tipoFilter  !== 'todos') list = list.filter(p => {
      const t = taxas.find(x => x.id === p.taxaId);
      return t?.tipo === tipoFilter;
    });
    if (metodoPagFilter !== 'todos') list = list.filter(p => p.metodoPagamento === metodoPagFilter);
    if (mesFilter !== 'todos') list = list.filter(p => String(p.mes) === mesFilter);
    if (searchPagAluno.trim()) {
      const q = searchPagAluno.toLowerCase();
      list = list.filter(p => {
        const a = alunos.find(x => x.id === p.alunoId);
        return a ? `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(q) : false;
      });
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pagamentosAno, statusFilter, tipoFilter, metodoPagFilter, mesFilter, searchPagAluno, taxas, alunos]);

  const relatorioFiltrado = useMemo(() => {
    let list = pagamentosAno.filter(p => p.status === 'pago');
    if (relTipo !== 'todos') list = list.filter(p => {
      const t = taxas.find(x => x.id === p.taxaId);
      return t?.tipo === relTipo;
    });
    if (relNivel !== 'Todos') list = list.filter(p => {
      const a = alunos.find(x => x.id === p.alunoId);
      if (!a) return false;
      const t = turmas.find(x => x.id === a.turmaId);
      return t?.nivel === relNivel;
    });
    if (relMetodo !== 'todos') list = list.filter(p => p.metodoPagamento === relMetodo);
    if (relTurmaId !== 'todas') list = list.filter(p => {
      const a = alunos.find(x => x.id === p.alunoId);
      return a?.turmaId === relTurmaId;
    });
    if (relMesInicio !== 'todos') {
      const inicio = parseInt(relMesInicio);
      list = list.filter(p => p.mes !== undefined && p.mes >= inicio);
    }
    if (relMesFim !== 'todos') {
      const fim = parseInt(relMesFim);
      list = list.filter(p => p.mes !== undefined && p.mes <= fim);
    }
    return list;
  }, [pagamentosAno, relTipo, relNivel, relMetodo, relTurmaId, relMesInicio, relMesFim, taxas, alunos, turmas]);

  const alunosFiltrados = useMemo(() => {
    const q = searchAluno.toLowerCase();
    return alunos.filter(a => a.ativo && `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(q));
  }, [alunos, searchAluno]);

  const resumoPorTipo = useMemo(() => {
    return TIPOS.map(tipo => {
      const taxasTipo = taxasAtivas.filter(t => t.tipo === tipo);
      const taxaIds   = new Set(taxasTipo.map(t => t.id));
      const pags      = pagamentosAno.filter(p => taxaIds.has(p.taxaId));
      const recebido  = pags.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
      const pendente  = pags.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
      return { tipo, recebido, pendente, count: pags.filter(p => p.status === 'pago').length };
    }).filter(r => r.recebido > 0 || r.pendente > 0);
  }, [taxasAtivas, pagamentosAno]);

  const resumoPorMes = useMemo(() => {
    const mapa: Record<number, number> = {};
    pagamentosAno.filter(p => p.status === 'pago').forEach(p => {
      const m = new Date(p.data).getMonth();
      mapa[m] = (mapa[m] || 0) + p.valor;
    });
    return mapa;
  }, [pagamentosAno]);

  function getNomeAluno(id: string) {
    const a = alunos.find(x => x.id === id);
    return a ? `${a.nome} ${a.apelido}` : '—';
  }
  function getTurmaAluno(id: string) {
    const a = alunos.find(x => x.id === id);
    if (!a) return '—';
    return turmas.find(x => x.id === a.turmaId)?.nome || '—';
  }
  function getNomeTaxa(id: string) {
    if (id === 'cartao_estudante_anual') return 'Cartão de Estudante Virtual';
    return taxas.find(x => x.id === id)?.descricao || 'Rubrica';
  }
  function getTipoTaxa(id: string): TipoTaxa {
    return taxas.find(x => x.id === id)?.tipo || 'outro';
  }

  function confirmarPagamento() {
    if (!formPag.alunoId || !formPag.taxaId) {
      webAlert('Erro', 'Selecione o aluno e a taxa.'); return;
    }
    // Rubricas mensais (propina ou outro mensal) exigem mês de referência
    const taxaSel = taxas.find(x => x.id === formPag.taxaId);
    if (taxaSel?.frequencia === 'mensal' && !formPag.mes) {
      webAlert('Mês obrigatório', 'Esta rubrica é mensal. Selecione o mês de referência antes de confirmar o pagamento.'); return;
    }
    setShowConfirmPag(true);
  }

  async function registarPagamento() {
    if (!formPag.alunoId || !formPag.taxaId) {
      webAlert('Erro', 'Selecione o aluno e a taxa.'); return;
    }
    const taxa = taxas.find(x => x.id === formPag.taxaId);
    const valorPropina = parseFloat(formPag.valor) || (taxa?.valor ?? 0);
    const valorTotal = valorPropina + multaEstimadaCaderneta;
    const observacaoFinal = multaEstimadaCaderneta > 0
      ? `${formPag.observacao ? formPag.observacao + ' — ' : ''}Propina: ${formatAOA(valorPropina)} + Multa: ${formatAOA(multaEstimadaCaderneta)} = Total: ${formatAOA(valorTotal)}`
      : (formPag.observacao || undefined);

    // Por Referência: gera a referência oficial (EMIS/RUPE) e deixa o pagamento
    // pendente — a confirmação é automática, feita pelo sistema de polling de
    // RUPEs quando o encarregado efectuar o pagamento no banco/Multicaixa.
    if (formPag.metodoPagamento === 'referencia_bancaria') {
      setIsSalvandoRupe(true);
      try {
        const rupe = await gerarRUPE(
          formPag.alunoId,
          formPag.taxaId,
          valorTotal,
          formPag.mes ? parseInt(formPag.mes) : undefined,
          anoAtual,
        );
        // Criar pagamento pendente para que o mês apareça imediatamente na caderneta
        // como "Em Cobrança". Quando o RUPE for confirmado (polling automático ou
        // webhook EMIS), confirmarRupeComoPago encontra este registo pela referência
        // e atualiza-o para status='pago' — sem criar um registo duplicado.
        // Deduplicação: só criar se não existir já um registo activo para este aluno/mês.
        const mesNum = formPag.mes ? parseInt(formPag.mes) : undefined;
        const anoNorm = normalizeAnoPagamento(anoAtual);
        const jaExistePagamento = pagamentos.some(
          p => p.alunoId === formPag.alunoId
            && p.mes === mesNum
            && p.ano === anoNorm
            && p.status !== 'cancelado'
        );
        if (!jaExistePagamento) {
          try {
            await addPagamento({
              alunoId: formPag.alunoId,
              taxaId:  formPag.taxaId,
              valor:   valorTotal,
              data:    new Date().toISOString().split('T')[0],
              mes:     mesNum,
              ano:     anoNorm,
              status:  'pendente',
              metodoPagamento: 'referencia_bancaria',
              referencia: rupe.referencia,
              observacao: observacaoFinal || `RUPE ${rupe.referencia} — aguarda confirmação automática`,
              criadoPorId:   user?.id   ?? undefined,
              criadoPorNome: user?.nome ?? user?.email ?? undefined,
            });
          } catch (err) {
            console.warn('[financeiro] Falha ao criar pagamento pendente após RUPE:', err);
          }
        }
        // Fechar modal e guardar estado do RUPE gerado para mostrar banner de comprovativo
        const nomeAluno = alunos.find(a => a.id === formPag.alunoId)?.nome || '';
        const descRubrica = taxas.find(t => t.id === formPag.taxaId)?.descricao || 'Propina';
        const nomeMesFinal = formPag.mes ? (MESES[parseInt(formPag.mes) - 1] ?? null) : null;
        setShowModalPag(false);
        setShowConfirmPag(false);
        setFormPag(defaultFormPag);
        setMultaEstimadaCaderneta(0);
        // Guardar para mostrar banner com botão "Ver Comprovativo" (evita popup blocker)
        setRupeConfirmado({
          id: rupe.id,
          referencia: rupe.referencia,
          dataValidade: rupe.dataValidade,
          dataGeracao: rupe.dataGeracao,
          valor: valorTotal,
          nomeAluno,
          descricao: descRubrica,
          nomeMes: nomeMesFinal,
        });
      } catch (e: any) {
        console.error('[RUPE] Erro ao gerar referência:', e);
        alertErro('Erro ao gerar referência', e?.message || 'Não foi possível gerar a referência de pagamento. Verifique a ligação ao servidor.');
      } finally {
        setIsSalvandoRupe(false);
      }
      return;
    }

    const ref = `REF-${anoAtual}-${Date.now().toString(36).toUpperCase()}`;
    await addPagamento({
      alunoId: formPag.alunoId,
      taxaId:  formPag.taxaId,
      valor:   valorTotal,
      data:    new Date().toISOString().split('T')[0],
      mes:     formPag.mes ? parseInt(formPag.mes) : undefined,
      ano:     normalizeAnoPagamento(anoAtual),
      status:  'pago',
      metodoPagamento: formPag.metodoPagamento,
      referencia: formPag.referencia || ref,
      observacao: observacaoFinal,
      criadoPorId:   user?.id   ?? undefined,
      criadoPorNome: user?.nome ?? user?.email ?? undefined,
    });
    setShowModalPag(false);
    setFormPag(defaultFormPag);
    setMultaEstimadaCaderneta(0);
    alertSucesso('Pagamento registado', 'O pagamento foi registado com sucesso.');
  }

  function validarFormTaxa(form: typeof formTaxa) {
    const errs: { descricao?: string; valor?: string } = {};
    const desc = form.descricao.trim();
    if (!desc) {
      errs.descricao = 'A descrição é obrigatória.';
    } else if (desc.length < 3) {
      errs.descricao = 'A descrição deve ter pelo menos 3 caracteres.';
    } else if (desc.length > 120) {
      errs.descricao = 'A descrição não pode exceder 120 caracteres.';
    }
    const valorTxt = form.valor.trim().replace(',', '.');
    if (!valorTxt) {
      errs.valor = 'O valor é obrigatório.';
    } else if (!/^\d+(\.\d{1,2})?$/.test(valorTxt)) {
      errs.valor = 'Use apenas números (ex.: 5000 ou 5000.50).';
    } else {
      const n = parseFloat(valorTxt);
      if (!isFinite(n) || n <= 0) errs.valor = 'O valor tem de ser maior que zero.';
      else if (n > 10_000_000) errs.valor = 'O valor parece exagerado. Confirme.';
    }
    return errs;
  }

  async function gravarTaxa() {
    if (savingTaxa) return;
    const errs = validarFormTaxa(formTaxa);
    if (errs.descricao || errs.valor) {
      setTaxaErrors(errs);
      return;
    }
    setTaxaErrors({});
    const payload = {
      tipo: formTaxa.tipo,
      descricao: formTaxa.descricao.trim(),
      valor: parseFloat(formTaxa.valor.trim().replace(',', '.')),
      frequencia: formTaxa.frequencia,
      nivel: formTaxa.nivel,
      anoAcademico: anoAtual,
      ativo: true,
    };
    setSavingTaxa(true);
    try {
      if (editTaxa) {
        await updateTaxa(editTaxa.id, payload);
        alertSucesso('Rubrica actualizada', 'A rubrica foi actualizada com sucesso.');
      } else {
        await addTaxa(payload);
        alertSucesso('Rubrica criada', 'Nova rubrica criada e disponível no perfil financeiro dos alunos.');
      }
      setShowModalTaxa(false);
      setEditTaxa(null);
      setFormTaxa(defaultFormTaxa);
      setTaxaErrors({});
    } catch (e: any) {
      const msg = (e && (e.message || e.error)) ? String(e.message || e.error) : 'Não foi possível guardar a rubrica. Tente novamente.';
      setTaxaErrors({ submit: msg });
    } finally {
      setSavingTaxa(false);
    }
  }

  function openEditTaxa(taxa: Taxa) {
    setFormTaxa({ tipo: taxa.tipo, descricao: taxa.descricao, valor: taxa.valor.toString(), frequencia: taxa.frequencia, nivel: taxa.nivel });
    setEditTaxa(taxa);
    setTaxaErrors({});
    setShowModalTaxa(true);
  }

  async function toggleTaxa(taxa: Taxa) {
    await updateTaxa(taxa.id, { ativo: !taxa.ativo });
  }

  async function removerTaxa(taxa: Taxa) {
    webAlert('Remover Rubrica', `Tem a certeza que quer remover "${taxa.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => { await deleteTaxa(taxa.id); alertSucesso('Rubrica removida', `"${taxa.descricao}" foi removida.`); } },
    ]);
  }

  async function handleEnviarMensagem() {
    if (!msgAlunoId || !msgTexto.trim()) {
      webAlert('Erro', 'Escreva a mensagem.'); return;
    }
    await enviarMensagem(msgAlunoId, msgTexto.trim(), nomeRemetente, msgTipo);
    setShowMsgModal(false);
    setMsgTexto('');
    setMsgTipo('aviso');
    alertSucesso('Mensagem enviada', 'A mensagem foi enviada ao estudante com sucesso.');
  }

  async function handleGerarRUPE() {
    if (!rupeAlunoId || !rupeTaxaId) {
      webAlert('Erro', 'Selecione o aluno e a rubrica.'); return;
    }
    const taxa = taxas.find(t => t.id === rupeTaxaId);
    const valor = parseFloat(rupeValor) || taxa?.valor || 0;
    const rupe = await gerarRUPE(rupeAlunoId, rupeTaxaId, valor);
    setRupeGerado(rupe);
    await enviarMensagem(
      rupeAlunoId,
      `Foi gerado o RUPE para pagamento de "${taxa?.descricao || 'Rubrica'}" no valor de ${formatAOA(valor)}.\nReferência: ${rupe.referencia}\nValidade: ${new Date(rupe.dataValidade).toLocaleDateString('pt-PT')}`,
      nomeRemetente,
      'rupe'
    );
  }

  async function handleBloquear(alunoId: string, bloqueado: boolean) {
    if (bloqueado) {
      webAlert('Desbloquear', `Pretende desbloquear o acesso deste estudante?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desbloquear', onPress: async () => {
          await desbloquearAluno(alunoId);
          await enviarMensagem(alunoId, 'O seu acesso ao sistema foi desbloqueado. Por favor, regularize os pagamentos em atraso.', nomeRemetente, 'bloqueio');
        }},
      ]);
    } else {
      webAlert('Bloquear Acesso', `O estudante ficará sem acesso ao sistema até regularizar os pagamentos. Deseja continuar?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Bloquear', style: 'destructive', onPress: async () => {
          await bloquearAluno(alunoId);
          await enviarMensagem(alunoId, 'O seu acesso ao sistema foi bloqueado por falta de pagamento. Contacte o departamento financeiro para regularizar a situação.', nomeRemetente, 'bloqueio');
        }},
      ]);
    }
  }

  async function handleAdicionarSaldo() {
    if (!saldoAlunoId) return;
    const valor = parseFloat(saldoValor);
    if (!valor || valor <= 0) { webAlert('Erro', 'Introduza um valor válido.'); return; }
    setSaldoLoading(true);
    try {
      await creditarSaldo(
        saldoAlunoId, valor,
        saldoDescricao || 'Crédito adicionado manualmente',
        saldoDataCobranca || undefined,
        saldoObs || undefined,
        user?.email || user?.nome,
      );
      alertSucesso('Saldo adicionado', `${formatAOA(valor)} adicionados ao saldo do estudante.`);
      setShowSaldoModal(false);
      setSaldoValor(''); setSaldoDataCobranca(''); setSaldoDescricao(''); setSaldoObs('');
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível adicionar saldo.');
    } finally {
      setSaldoLoading(false);
    }
  }

  async function handleTransferirPagamento() {
    if (!transferPagId || !transferDestino) return;
    setTransferLoading(true);
    try {
      await transferirPagamento(transferPagId, transferDestino, user?.email || user?.nome);
      alertSucesso('Transferência efectuada', transferDestino === 'saldo' ? 'Valor transferido para o saldo do estudante.' : 'Pagamento transferido para a nova rubrica.');
      setShowTransferModal(false);
      setTransferPagId(null);
      setTransferDestino('saldo');
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível efectuar a transferência.');
    } finally {
      setTransferLoading(false);
    }
  }

  const podeRegistarObito = ['chefe_secretaria', 'admin', 'director', 'ceo', 'pca'].includes(user?.role || '');

  async function handleRegistarObito() {
    if (!obituarioAlunoId) return;
    setObituarioLoading(true);
    try {
      const res = await fetch(`/api/alunos/${obituarioAlunoId}/registar-falecimento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataFalecimento: obituarioData || null,
          observacoes: obituarioObs || null,
          registadoPor: user?.email || user?.nome || 'Chefe de Secretaria',
        }),
      });
      const data = await res.json();
      if (!res.ok) { alertErro('Erro', data.error || 'Não foi possível registar o óbito.'); return; }
      alertSucesso('Registo efectuado', 'O estudante foi arquivado como falecido e o acesso bloqueado.');
      setShowObituarioModal(false);
      setObituarioAlunoId(null);
      setObituarioData('');
      setObituarioObs('');
    } catch {
      alertErro('Erro', 'Falha de ligação ao servidor.');
    } finally {
      setObituarioLoading(false);
    }
  }

  const reciboData = useMemo(() => {
    if (!reciboId) return null;
    const p = pagamentos.find(x => x.id === reciboId);
    if (!p) return null;
    const a = alunos.find(x => x.id === p.alunoId);
    const t = taxas.find(x => x.id === p.taxaId);
    const turmaA = a ? turmas.find(x => x.id === a.turmaId) : null;
    return { pagamento: p, aluno: a, taxa: t, turma: turmaA };
  }, [reciboId, pagamentos, alunos, taxas, turmas]);

  async function handleNotificarTodos() {
    if (alunosEmAtraso.length === 0) return;
    webAlert(
      'Notificar Todos',
      `Vai enviar uma mensagem de aviso a ${alunosEmAtraso.length} estudante(s) com pagamentos em atraso. Deseja continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: async () => {
          setNotifLoading(true);
          try {
            for (const { aluno, mesesAtraso, multa } of alunosEmAtraso) {
              const multaTxt = multaConfig.ativo && multa > 0 ? ` Multa estimada: ${formatAOA(multa)}.` : '';
              await enviarMensagem(
                aluno.id,
                `Prezado(a) ${aluno.nome}, tem ${mesesAtraso} mês(es) de propina(s) em atraso no ano lectivo ${anoAtual}.${multaTxt} Regularize a sua situação junto do Departamento Financeiro.`,
                nomeRemetente,
                'aviso'
              );
            }
            webAlert('Concluído', `Mensagem de aviso enviada a ${alunosEmAtraso.length} estudante(s).`);
          } finally {
            setNotifLoading(false);
          }
        }},
      ]
    );
  }

  async function handleSalvarMulta() {
    const pct      = parseFloat(multaPct) || 0;
    const dias     = parseInt(multaDias) || 0;
    const diaInicio = parseInt(multaDiaInicio) || 10;
    const valorDia  = parseFloat(multaValorDia) || 0;
    const pctDia    = parseFloat(multaPctDia) || 0;
    if (pct < 0 || pct > 100) { webAlert('Erro', 'Percentagem por mês inválida (0-100).'); return; }
    if (pctDia < 0 || pctDia > 100) { webAlert('Erro', 'Percentagem por dia inválida (0-100).'); return; }
    if (diaInicio < 1 || diaInicio > 31) { webAlert('Erro', 'Dia de início inválido (1-31).'); return; }
    await updateMultaConfig({ percentagem: pct, diasCarencia: dias, diaInicioMulta: diaInicio, valorPorDia: valorDia, percentagemPorDia: pctDia });
    setShowMultaModal(false);
    alertSucesso('Guardado', 'Configuração de multa actualizada.');
  }

  async function handleSalvarFaltasJustif() {
    const minimas = parseInt(faltasJustifMin) || 0;
    const valor   = parseFloat(faltasJustifValor) || 0;
    if (minimas < 1) { webAlert('Erro', 'O número mínimo de faltas deve ser pelo menos 1.'); return; }
    if (valor < 0)   { webAlert('Erro', 'O valor por falta não pode ser negativo.'); return; }
    await updateFaltasJustifConfig({ faltasMinimas: minimas, valorPorFalta: valor });
    setShowFaltasJustifModal(false);
    alertSucesso('Guardado', 'Configuração de justificação de faltas actualizada.');
  }

  async function handleSolicitarIsencao() {
    if (!isencaoAlunoId || !isencaoJustif.trim()) { webAlert('Erro', 'Justificativa obrigatória.'); return; }
    setIsencaoLoading(true);
    try {
      await solicitarIsencaoMulta(isencaoAlunoId, isencaoJustif.trim(), user?.nome || 'Financeiro');
      alertSucesso('Pedido enviado', 'O pedido de isenção foi enviado para aprovação do Director.');
      setShowIsencaoModal(false);
      setIsencaoJustif('');
      setIsencaoAlunoId(null);
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível enviar o pedido.');
    } finally {
      setIsencaoLoading(false);
    }
  }

  async function handleResponderIsencao(id: string, status: 'aprovado' | 'rejeitado') {
    try {
      await responderIsencaoMulta(id, status, user?.nome || 'Director');
      alertSucesso(status === 'aprovado' ? 'Isenção aprovada' : 'Isenção rejeitada', status === 'aprovado' ? 'A multa foi dispensada para este aluno.' : 'O pedido de isenção foi rejeitado.');
    } catch (e: any) {
      alertErro('Erro', e.message ?? 'Não foi possível processar a resposta.');
    }
  }

  const maxMes = Math.max(...Object.values(resumoPorMes), 1);

  function renderPainel() {
    const totalAlunos = alunosAtivos.length;
    const alunosEmDia = totalAlunos - alunosEmAtraso.length;
    const taxaPropina = taxasAtivas.find(t => t.tipo === 'propina');
    const taxaTotal = taxaPropina ? taxaPropina.valor * totalAlunos * 11 : 0;
    const taxaCobranca = taxaTotal > 0 ? Math.min(100, Math.round((totalRecebido / taxaTotal) * 100)) : 0;
    const anoBase = parseInt(anoAtual.split('/')[0]) || new Date().getFullYear();
    const mesAtual = new Date().getMonth() + 1;

    // ── Dívidas por ano anterior ─────────────────────────────────────────────
    // Agrupa pagamentos pendentes de anos civis anteriores ao início do ano lectivo activo.
    // p.ano é o ano civil (ex: "2024"); excluímos anoBase e anoBase+1 (ano lectivo actual).
    const dividasAnosAnteriores = (() => {
      const map: Record<string, { total: number; qtd: number; alunos: Set<string> }> = {};
      for (const p of pagamentos) {
        if (p.status !== 'pendente') continue;
        // Normalizar: extrair o primeiro grupo de 4 dígitos do campo ano (suporta "2024" e "2024/2025")
        const match = String(p.ano ?? '').match(/(\d{4})/);
        if (!match) continue;
        const pAno = parseInt(match[1], 10);
        if (pAno >= anoBase) continue; // exclui ano lectivo actual e futuros
        const key = String(pAno); // sempre ano civil normalizado
        if (!map[key]) map[key] = { total: 0, qtd: 0, alunos: new Set() };
        map[key].total += Number(p.valor);
        map[key].qtd   += 1;
        if (p.alunoId) map[key].alunos.add(String(p.alunoId));
      }
      return Object.entries(map)
        .map(([ano, v]) => ({ ano, total: v.total, qtd: v.qtd, qtdAlunos: v.alunos.size }))
        .sort((a, b) => parseInt(b.ano, 10) - parseInt(a.ano, 10)); // ordenação numérica segura
    })();
    const totalDividasAnteriores = dividasAnosAnteriores.reduce((s, r) => s + r.total, 0);

    // ── Period revenue stats ─────────────────────────────────────────────────
    const nowDate = new Date();
    const todayStr = nowDate.toISOString().split('T')[0];
    const weekDay = nowDate.getDay(); // 0=Sun
    const weekStart = new Date(nowDate); weekStart.setDate(nowDate.getDate() - weekDay);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const monthStartStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-01`;
    const semInicio = nowDate.getMonth() < 6 ? `${nowDate.getFullYear()}-01-01` : `${nowDate.getFullYear()}-07-01`;
    const pagsPagos = pagamentos.filter(p => p.status === 'pago');
    const recHoje      = pagsPagos.filter(p => (p.data || '').slice(0, 10) >= todayStr).reduce((s, p) => s + Number(p.valor), 0);
    const recSemana    = pagsPagos.filter(p => (p.data || '').slice(0, 10) >= weekStartStr).reduce((s, p) => s + Number(p.valor), 0);
    const recMes       = pagsPagos.filter(p => (p.data || '').slice(0, 10) >= monthStartStr).reduce((s, p) => s + Number(p.valor), 0);
    const recSemestre  = pagsPagos.filter(p => (p.data || '').slice(0, 10) >= semInicio).reduce((s, p) => s + Number(p.valor), 0);

    // ── RUPE reference lookup ────────────────────────────────────────────────
    // Use the deferred value so the heavy `find` only runs after the user pauses,
    // keeping each keystroke responsive and preventing the input from losing focus.
    const rupeRefTrim = deferredRupeSearchRef.trim().toUpperCase();
    const rupeEncontrado = rupeRefTrim.length >= 4 ? rupes.find(r => r.referencia.toUpperCase().includes(rupeRefTrim)) ?? null : null;
    const rupeAluno = rupeEncontrado ? alunos.find(a => a.id === rupeEncontrado.alunoId) : null;
    const RUPE_STATUS: Record<string, { label: string; color: string }> = {
      ativo:    { label: 'Activo / Em Cobrança', color: Colors.warning },
      pago:     { label: 'Liquidado',         color: Colors.success },
      expirado: { label: 'Expirado',          color: Colors.danger  },
    };

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 60 }}>
        {!propinaHabilitada && (
          <View style={{ backgroundColor: Colors.warning + '18', borderWidth: 1, borderColor: Colors.warning + '55', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="information-circle" size={22} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning, fontSize: 13 }}>Propinas Desactivadas</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>Esta escola não cobra propinas. Os alertas de dívida, cálculos de atraso e cobranças mensais estão desactivados.</Text>
            </View>
          </View>
        )}
        <CollapsibleStats storageKey="fin-prop-kpi" title="Resumo de Propinas" color={Colors.success}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <View style={[st.kpiCard, { flex: 1, minWidth: '44%', borderTopWidth: 2, borderTopColor: Colors.success }]}>
              <Ionicons name="trending-up" size={22} color={Colors.success} />
              <Text style={[st.kpiVal, { color: Colors.success }]}>{formatAOA(totalRecebido)}</Text>
              <Text style={st.kpiLbl}>Recebido</Text>
            </View>
            <View style={[st.kpiCard, { flex: 1, minWidth: '44%', borderTopWidth: 2, borderTopColor: Colors.warning }]}>
              <Ionicons name="time" size={22} color={Colors.warning} />
              <Text style={[st.kpiVal, { color: Colors.warning }]}>{formatAOA(totalPendente)}</Text>
              <Text style={st.kpiLbl}>Em Cobrança</Text>
            </View>
            <View style={[st.kpiCard, { flex: 1, minWidth: '44%', borderTopWidth: 2, borderTopColor: Colors.info }]}>
              <Ionicons name="receipt" size={22} color={Colors.info} />
              <Text style={[st.kpiVal, { color: Colors.info }]}>{nTransacoes}</Text>
              <Text style={st.kpiLbl}>Transacções</Text>
            </View>
            <View style={[st.kpiCard, { flex: 1, minWidth: '44%', borderTopWidth: 2, borderTopColor: totalDividasAnteriores > 0 ? Colors.danger : Colors.border }]}>
              <Ionicons name="time-outline" size={22} color={totalDividasAnteriores > 0 ? Colors.danger : Colors.textMuted} />
              <Text style={[st.kpiVal, { color: totalDividasAnteriores > 0 ? Colors.danger : Colors.textMuted }]}>
                {formatAOA(totalDividasAnteriores)}
              </Text>
              <Text style={st.kpiLbl}>Anos Anteriores</Text>
            </View>
          </View>
        </CollapsibleStats>

        <CollapsibleStats storageKey="fin-prop-entradas" title="Entradas por Período" color={Colors.success}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {([
              { label: 'Hoje',        val: recHoje,     icon: 'sunny-outline' as const },
              { label: 'Esta Semana', val: recSemana,   icon: 'calendar-outline' as const },
              { label: 'Este Mês',    val: recMes,      icon: 'calendar-clear-outline' as const },
              { label: 'Semestre',    val: recSemestre, icon: 'stats-chart-outline' as const },
            ] as const).map(item => (
              <View key={item.label} style={{ flex: 1, minWidth: 140, backgroundColor: Colors.backgroundElevated, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name={item.icon} size={14} color={Colors.success} />
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary }}>{item.label}</Text>
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: item.val > 0 ? Colors.success : Colors.textMuted }}>
                  {formatAOA(item.val)}
                </Text>
              </View>
            ))}
          </View>
        </CollapsibleStats>

        <CollapsibleStats storageKey="fin-prop-rupe" title="Consultar RUPE" color={Colors.info}>
          <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: rupeEncontrado || (rupeRefTrim.length >= 4 && !rupeEncontrado) ? 12 : 0 }}>
            <RupeSearchInput
              value={rupeSearchRef}
              onChangeText={setRupeSearchRef}
              onClear={handleClearRupeSearch}
            />
          </View>
          {rupeRefTrim.length >= 4 && !rupeEncontrado && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted }}>Nenhum RUPE encontrado para essa referência.</Text>
            </View>
          )}
          {rupeEncontrado && (() => {
            const sc = RUPE_STATUS[rupeEncontrado.status] ?? RUPE_STATUS.ativo;
            const expirado = new Date(rupeEncontrado.dataValidade) < new Date();
            const statusFinal = expirado && rupeEncontrado.status === 'ativo' ? RUPE_STATUS.expirado : sc;
            return (
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text }}>
                    {rupeAluno ? `${rupeAluno.nome} ${rupeAluno.apelido}` : 'Aluno desconhecido'}
                  </Text>
                  <View style={{ backgroundColor: statusFinal.color + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: statusFinal.color + '55' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: statusFinal.color }}>{statusFinal.label}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted }}>Ref: {rupeEncontrado.referencia}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text }}>{getNomeTaxa(rupeEncontrado.taxaId)}</Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.gold }}>{formatAOA(rupeEncontrado.valor)}</Text>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: expirado ? Colors.danger : Colors.textMuted }}>
                  Válido até: {new Date(rupeEncontrado.dataValidade).toLocaleDateString('pt-PT')}
                  {expirado && rupeEncontrado.status === 'ativo' ? '  ⚠ Expirado' : ''}
                </Text>
              </View>
            );
          })()}
          </View>
        </CollapsibleStats>

        <CollapsibleStats storageKey="fin-prop-estado" title="Estado dos Pagamentos" color={Colors.warning}>
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={st.kpiLbl}>Taxa de Cobrança {anoAtual}</Text>
            <Text style={[st.kpiLbl, {
              color: taxaCobranca >= 80 ? Colors.success : taxaCobranca >= 50 ? Colors.warning : Colors.danger,
              fontFamily: 'Inter_700Bold',
            }]}>{taxaCobranca}%</Text>
          </View>
          <View style={{ height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{
              height: 8, borderRadius: 4,
              width: `${Math.min(taxaCobranca, 100)}%` as any,
              backgroundColor: taxaCobranca >= 80 ? Colors.success : taxaCobranca >= 50 ? Colors.warning : Colors.danger,
            }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.danger + '44' }}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={[st.kpiVal, { color: Colors.danger, fontSize: 22 }]}>{alunosEmAtraso.length}</Text>
            <Text style={st.kpiLbl}>Alunos em Atraso</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.warning + '44' }}>
            <Ionicons name="lock-closed" size={16} color={Colors.warning} />
            <Text style={[st.kpiVal, { color: Colors.warning, fontSize: 22 }]}>{bloqueados.length}</Text>
            <Text style={st.kpiLbl}>Bloqueados</Text>
          </View>
          <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.success + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.success + '44' }}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={[st.kpiVal, { color: Colors.success, fontSize: 22 }]}>{alunosEmDia}</Text>
            <Text style={st.kpiLbl}>Em Dia</Text>
          </View>
        </View>

        {/* Donut: status pagamentos */}
        {(pagamentosAno.filter(p => p.status === 'pago').length > 0 || pagamentosAno.filter(p => p.status === 'pendente').length > 0) && (
          <View style={{ marginBottom: 14 }}>
            <Text style={[st.secLabel, { marginBottom: 8 }]}>ESTADO DOS PAGAMENTOS</Text>
            <View style={{ alignItems: 'center' }}>
              <DonutChart
                data={[
                  { label: 'Pagos', value: pagamentosAno.filter(p => p.status === 'pago').length, color: Colors.success },
                  { label: 'Pendentes', value: pagamentosAno.filter(p => p.status === 'pendente').length, color: Colors.warning },
                  { label: 'Cancelados', value: pagamentosAno.filter(p => p.status === 'cancelado').length, color: Colors.textMuted },
                ].filter(d => d.value > 0)}
                size={160}
                thickness={26}
                centerLabel={String(pagamentosAno.length)}
                centerSub="total"
              />
            </View>
          </View>
        )}

        <Text style={[st.secLabel, { marginBottom: 8 }]}>PAGAMENTOS POR MÊS — {anoAtual}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {MESES_PAINEL.map(m => {
            const anoMes = m.num >= 8 ? anoBase : anoBase + 1;
            const countPago = pagamentos.filter(p =>
              p.mes === m.num && matchAno(p.ano, String(anoMes)) && p.status === 'pago'
            ).length;
            const totalMes = pagamentos.filter(p =>
              p.mes === m.num && matchAno(p.ano, String(anoMes))
            ).reduce((s, p) => s + (p.status === 'pago' ? p.valor : 0), 0);
            const isAtual = m.num === mesAtual;
            return (
              <View key={m.num} style={{
                flex: 1, minWidth: 64, borderRadius: 8, padding: 7,
                backgroundColor: countPago > 0 ? Colors.success + '18' : Colors.border,
                borderWidth: isAtual ? 2 : 1,
                borderColor: isAtual ? Colors.gold : countPago > 0 ? Colors.success + '55' : Colors.border,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: countPago > 0 ? Colors.success : Colors.textMuted }}>
                  {m.nome}
                </Text>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: countPago > 0 ? Colors.success : Colors.textMuted }}>
                  {countPago}
                </Text>
                {totalMes > 0 && (
                  <Text style={{ fontSize: 7, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                    {formatAOA(totalMes)}
                  </Text>
                )}
              </View>
            );
          })}
          </View>
        </CollapsibleStats>

        <CollapsibleStats
          storageKey="fin-dividas-anos-ant"
          title="Dívidas de Anos Anteriores"
          color={totalDividasAnteriores > 0 ? Colors.danger : Colors.textMuted}
        >
          {dividasAnosAnteriores.length === 0 ? (
            /* ── Estado vazio ─────────────────────────────────────────────── */
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '12', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.success + '33', marginBottom: 6 }}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.success }}>Sem dívidas de anos anteriores</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                  Todos os pagamentos pendentes pertencem ao ano lectivo actual ({anoAtual}).
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Cabeçalho: total consolidado */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="warning" size={16} color={Colors.danger} />
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary }}>
                    Total vencido · {dividasAnosAnteriores.length} {dividasAnosAnteriores.length === 1 ? 'ano' : 'anos'}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.danger }}>
                  {formatAOA(totalDividasAnteriores)}
                </Text>
              </View>

              {/* Linhas por ano */}
              {dividasAnosAnteriores.map((row, idx) => {
                const proporcao = totalDividasAnteriores > 0 ? row.total / totalDividasAnteriores : 0;
                const barColor  = idx === 0 ? Colors.danger : idx === 1 ? Colors.warning : Colors.textMuted;
                return (
                  <View key={row.ano} style={{ marginBottom: idx < dividasAnosAnteriores.length - 1 ? 12 : 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: barColor }} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text }}>Ano {row.ano}</Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>
                          · {row.qtd} pag. · {row.qtdAlunos} aluno{row.qtdAlunos !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: barColor }}>
                        {formatAOA(row.total)}
                      </Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: 5, borderRadius: 3, width: `${Math.round(proporcao * 100)}%` as any, backgroundColor: barColor }} />
                    </View>
                  </View>
                );
              })}

              {/* Nota de priorização */}
              <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.danger + '10', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.danger + '33' }}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.danger} style={{ marginTop: 1 }} />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 }}>
                  Priorize a cobrança do ano mais recente. Dívidas com mais de 2 anos têm menor probabilidade de recuperação.
                </Text>
              </View>
            </>
          )}
        </CollapsibleStats>
      </ScrollView>
    );
  }

  function renderResumo() {
    const recentes = [...pagamentosAno]
      .filter(p => p.status === 'pago')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    const hoje = new Date();
    const totalSaidas = contasPagar.filter(c => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0);
    const totalSaidasPendentes = contasPagar.filter(c => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0);
    const totalSaidasVencidas = contasPagar.filter(c => c.status === 'pendente' && new Date(c.dataVencimento) < hoje).reduce((s, c) => s + Number(c.valor), 0);
    const saldoLiquido = totalRecebido - totalSaidas;
    const proximasSaidas = [...contasPagar]
      .filter(c => c.status === 'pendente')
      .sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime())
      .slice(0, 4);

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 60 }}>
        <CollapsibleStats storageKey="fin-res-visao" title={`Visão Geral — ${anoAtual}`} color={Colors.success}>
        <View style={[st.kpiRow, { gap: 8 }]}>
          <View style={[st.kpiCard, { flex: 1, borderLeftWidth: 3, borderLeftColor: Colors.success }]}>
            <Ionicons name="trending-up" size={22} color={Colors.success} />
            <Text style={[st.kpiVal, { color: Colors.success }]}>{formatAOA(totalRecebido)}</Text>
            <Text style={st.kpiLbl}>Entradas</Text>
          </View>
          <View style={[st.kpiCard, { flex: 1, borderLeftWidth: 3, borderLeftColor: Colors.danger }]}>
            <Ionicons name="trending-down" size={22} color={Colors.danger} />
            <Text style={[st.kpiVal, { color: Colors.danger }]}>{formatAOA(totalSaidas)}</Text>
            <Text style={st.kpiLbl}>Saídas pagas</Text>
          </View>
        </View>

        <View style={[st.kpiCard, { marginBottom: 10, borderLeftWidth: 3, borderLeftColor: saldoLiquido >= 0 ? Colors.success : Colors.danger }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="wallet" size={18} color={saldoLiquido >= 0 ? Colors.success : Colors.danger} />
              <Text style={st.kpiLbl}>Saldo Líquido</Text>
            </View>
            <Text style={[st.kpiVal, { color: saldoLiquido >= 0 ? Colors.success : Colors.danger, fontSize: 16 }]}>{formatAOA(saldoLiquido)}</Text>
          </View>
          {(totalSaidasPendentes > 0) && (
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 4 }}>
              + {formatAOA(totalSaidasPendentes)} em despesas em cobrança · {totalSaidasVencidas > 0 ? `${formatAOA(totalSaidasVencidas)} VENCIDAS` : 'Nenhuma vencida'}
            </Text>
          )}
        </View>

        <View style={st.kpiRow}>
          <View style={[st.kpiCard, { flex: 1.2 }]}>
            <Ionicons name="time" size={18} color={Colors.warning} />
            <Text style={[st.kpiVal, { color: Colors.warning }]}>{formatAOA(totalPendente)}</Text>
            <Text style={st.kpiLbl}>Receitas pendentes</Text>
          </View>
        </View>
        <View style={st.kpiRow}>
          <View style={st.kpiCard}>
            <Ionicons name="receipt" size={22} color={Colors.info} />
            <Text style={[st.kpiVal, { color: Colors.info }]}>{nTransacoes}</Text>
            <Text style={st.kpiLbl}>Transacções</Text>
          </View>
          <View style={st.kpiCard}>
            <Ionicons name="people" size={22} color={Colors.gold} />
            <Text style={[st.kpiVal, { color: Colors.gold }]}>{nAlunos}</Text>
            <Text style={st.kpiLbl}>Alunos</Text>
          </View>
          <View style={st.kpiCard}>
            <Ionicons name="alert-circle" size={22} color={Colors.danger} />
            <Text style={[st.kpiVal, { color: Colors.danger }]}>{alunosEmAtraso.length}</Text>
            <Text style={st.kpiLbl}>Vencido</Text>
          </View>
          <View style={st.kpiCard}>
            <Ionicons name="lock-closed" size={22} color={Colors.textMuted} />
            <Text style={st.kpiVal}>{bloqueados.length}</Text>
            <Text style={st.kpiLbl}>Bloqueados</Text>
          </View>
        </View>

        <View style={st.progressCard}>
          <View style={st.progressTop}>
            <Text style={st.progressLabel}>Taxa de Pagamento</Text>
            <Text style={[st.progressPct, { color: percentPago >= 70 ? Colors.success : Colors.warning }]}>{percentPago}%</Text>
          </View>
          <View style={st.progressBar}>
            <View style={[st.progressFill, {
              width: `${percentPago}%` as any,
              backgroundColor: percentPago >= 70 ? Colors.success : Colors.warning,
            }]} />
          </View>
          <Text style={st.progressSub}>
            {pagamentosAno.filter(p => p.status === 'pago').length} de {pagamentosAno.length} pagamentos efectuados no ano lectivo
          </Text>
        </View>
        </CollapsibleStats>

        <TouchableOpacity style={st.multaBanner} activeOpacity={0.75} onPress={() => { setMultaPct(multaConfig.percentagem.toString()); setMultaDias(multaConfig.diasCarencia.toString()); setMultaDiaInicio((multaConfig.diaInicioMulta || 10).toString()); setMultaValorDia((multaConfig.valorPorDia || 0).toString()); setMultaPctDia((multaConfig.percentagemPorDia || 0).toString()); setShowMultaModal(true); }}>
          <Ionicons name="warning" size={16} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={st.multaBannerTitle}>Configuração de Multa por Atraso</Text>
            <Text style={st.multaBannerSub}>{(multaConfig.valorPorDia || 0) > 0 ? `${formatAOA(multaConfig.valorPorDia!)} /dia` : (multaConfig.percentagemPorDia || 0) > 0 ? `${multaConfig.percentagemPorDia}% /dia` : `${multaConfig.percentagem}% /mês`} · A partir do dia {multaConfig.diaInicioMulta || 10} · {multaConfig.ativo ? 'Activa' : 'Inactiva'}</Text>
          </View>
          <View style={st.multaEditBtn}>
            <Ionicons name="settings" size={16} color={Colors.gold} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[st.multaBanner, { borderColor: Colors.info + '44', backgroundColor: Colors.info + '10' }]} activeOpacity={0.75} onPress={() => { setFaltasJustifMin(String(faltasJustifConfig.faltasMinimas)); setFaltasJustifValor(String(faltasJustifConfig.valorPorFalta)); setShowFaltasJustifModal(true); }}>
          <Ionicons name="document-text" size={16} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={st.multaBannerTitle}>Justificação de Faltas (Liquidado)</Text>
            <Text style={st.multaBannerSub}>
              {faltasJustifConfig.ativo
                ? `A partir de ${faltasJustifConfig.faltasMinimas} faltas · ${formatAOA(faltasJustifConfig.valorPorFalta)} por falta · Activa`
                : 'Inactiva — alunos não podem solicitar justificação paga.'}
            </Text>
          </View>
          <View style={st.multaEditBtn}>
            <Ionicons name="settings" size={16} color={Colors.gold} />
          </View>
        </TouchableOpacity>

        {resumoPorTipo.length > 0 && (
          <CollapsibleStats storageKey="fin-res-tipo" title="Arrecadado por Rubrica" color={Colors.gold}>
            {resumoPorTipo.map(({ tipo, recebido, pendente, count }) => (
              <View key={tipo} style={st.tipoCard}>
                <View style={[st.tipoIcon, { backgroundColor: tipoCor(tipo) + '22' }]}>
                  <Ionicons name={tipoIcon(tipo) as any} size={18} color={tipoCor(tipo)} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={st.tipoTop}>
                    <Text style={st.tipoNome}>{tipoLabel(tipo)}</Text>
                    <Text style={[st.tipoVal, { color: Colors.success }]}>{formatAOA(recebido)}</Text>
                  </View>
                  {pendente > 0 && <Text style={st.tipoPendente}>+{formatAOA(pendente)} em cobrança</Text>}
                  <Text style={st.tipoCount}>{count} pagamento(s) confirmado(s)</Text>
                </View>
              </View>
            ))}
          </CollapsibleStats>
        )}

        {Object.keys(resumoPorMes).length > 0 && (
          <CollapsibleStats storageKey="fin-res-mensal" title="Actividade Mensal (Liquidados)" color={Colors.info}>
            <View style={st.barChart}>
              {MESES.map((m, i) => {
                const v = resumoPorMes[i] || 0;
                const pct = maxMes > 0 ? v / maxMes : 0;
                return (
                  <View key={m} style={st.barCol}>
                    <View style={[st.barFill, { height: Math.max(4, pct * 80), backgroundColor: v > 0 ? Colors.success : Colors.border }]} />
                    <Text style={st.barLabel}>{m}</Text>
                    {v > 0 && <Text style={st.barVal}>{(v / 1000).toFixed(0)}k</Text>}
                  </View>
                );
              })}
            </View>
          </CollapsibleStats>
        )}

        {proximasSaidas.length > 0 && (
          <CollapsibleStats storageKey="fin-res-despesas" title="Próximas Despesas a Pagar" color={Colors.warning}>
            {proximasSaidas.map(c => {
              const vencida = new Date(c.dataVencimento) < hoje;
              return (
                <View key={c.id} style={[st.recentRow, { borderLeftWidth: 3, borderLeftColor: vencida ? Colors.danger : Colors.warning }]}>
                  <View style={[st.recentIcon, { backgroundColor: (vencida ? Colors.danger : Colors.warning) + '22' }]}>
                    <Ionicons name={vencida ? 'alert-circle' : 'calendar'} size={15} color={vencida ? Colors.danger : Colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.recentNome} numberOfLines={1}>{c.descricao}</Text>
                    <Text style={[st.recentTaxa, { color: vencida ? Colors.danger : Colors.textMuted }]}>{vencida ? 'VENCIDA' : 'Em Cobrança'} · {c.fornecedor || 'Sem fornecedor'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.recentVal, { color: vencida ? Colors.danger : Colors.warning }]}>{formatAOA(c.valor)}</Text>
                    <Text style={st.recentData}>{new Date(c.dataVencimento).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</Text>
                  </View>
                </View>
              );
            })}
          </CollapsibleStats>
        )}

        {recentes.length > 0 && (
          <CollapsibleStats storageKey="fin-res-entradas" title="Últimas Entradas" color={Colors.success}>
            {recentes.map(p => {
              const tipo = getTipoTaxa(p.taxaId);
              return (
                <View key={p.id} style={[st.recentRow, { borderLeftWidth: 3, borderLeftColor: Colors.success }]}>
                  <View style={[st.recentIcon, { backgroundColor: tipoCor(tipo) + '22' }]}>
                    <Ionicons name={tipoIcon(tipo) as any} size={15} color={tipoCor(tipo)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.recentNome} numberOfLines={1}>{getNomeAluno(p.alunoId)}</Text>
                    <Text style={st.recentTaxa} numberOfLines={1}>{getNomeTaxa(p.taxaId)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.recentVal, { color: Colors.success }]}>{formatAOA(p.valor)}</Text>
                    <Text style={st.recentData}>{new Date(p.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</Text>
                  </View>
                </View>
              );
            })}
          </CollapsibleStats>
        )}

        {pagamentosAno.length === 0 && taxasAno.length === 0 && (
          <View style={st.empty}>
            <FontAwesome5 name="money-bill-wave" size={48} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem dados financeiros</Text>
            <Text style={st.emptySub}>{`Crie rubricas na aba "Rubricas" — elas aparecerão automaticamente no perfil financeiro dos alunos.`}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderEmAtraso() {
    if (alunosEmAtraso.length === 0) {
      return (
        <View style={st.empty}>
          <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
          <Text style={st.emptyTitle}>Sem propinas em atraso</Text>
          <Text style={st.emptySub}>Todos os estudantes estão em dia com os seus pagamentos.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={alunosEmAtraso}
        keyExtractor={x => x.aluno.id}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={() => (
          <View>
            <View style={st.atrasoHeader}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={[st.atrasoHeaderTxt, { flex: 1 }]}>{alunosEmAtraso.length} estudante(s) com pagamentos em atraso</Text>
              <ExportMenu
                title="Alunos com Propinas em Atraso"
                columns={[
                  { header: 'Nº Matrícula', key: 'matricula', width: 14 },
                  { header: 'Nome Completo', key: 'nome', width: 26 },
                  { header: 'Turma', key: 'turma', width: 12 },
                  { header: 'Meses em Atraso', key: 'meses', width: 16 },
                  { header: 'Valor em Cobrança (Kz)', key: 'pendente', width: 20 },
                  { header: 'Multa Estimada (Kz)', key: 'multa', width: 20 },
                  { header: 'Estado', key: 'estado', width: 12 },
                ]}
                rows={alunosEmAtraso.map(({ aluno, mesesAtraso, multa, pendente }) => ({
                  matricula: aluno.numeroMatricula,
                  nome: `${aluno.nome} ${aluno.apelido}`,
                  turma: turmas.find(t => t.id === aluno.turmaId)?.nome ?? '—',
                  meses: mesesAtraso,
                  pendente: pendente,
                  multa: multa,
                  estado: isAlunoBloqueado(aluno.id) ? 'Bloqueado' : 'Vencido',
                }))}
                school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola', anoLetivo: anoSelecionado?.nome, directorGeral: config?.directorGeral }}
                filename="alunos_em_atraso"
              />
            </View>
            {/* Acções em massa */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 }}>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[st.atrasoActionBtn, { backgroundColor: '#1e3a5f22', borderColor: '#1e3a5f55', paddingHorizontal: 12, paddingVertical: 8 }]}
                  onPress={() => {
                    const now = new Date();
                    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                    const dataStr = `${now.getDate()} de ${MESES_PT[now.getMonth()]} de ${now.getFullYear()}`;
                    const escola = config?.nomeEscola ?? 'Super Escola';
                    const director = (config as any)?.directorGeral ?? '___________________________';
                    const anoL = anoSelecionado?.nome ?? '';
                    const rows = alunosEmAtraso.map(({ aluno, mesesAtraso, multa, pendente }, i) => {
                      const turmaA = turmas.find(t => t.id === aluno.turmaId);
                      const bloqueado = isAlunoBloqueado(aluno.id);
                      return `<tr style="background:${i%2===1?'#FFF9C4':'#fff'}">
                        <td style="text-align:center;font-weight:bold;">${i+1}</td>
                        <td style="padding-left:5px;">${aluno.nome.toUpperCase()} ${aluno.apelido.toUpperCase()}</td>
                        <td style="text-align:center;">${aluno.numeroMatricula || '—'}</td>
                        <td style="text-align:center;">${turmaA?.nome || '—'}</td>
                        <td style="text-align:center;color:#b91c1c;font-weight:700;">${mesesAtraso}</td>
                        <td style="text-align:right;">${formatAOA(pendente)}</td>
                        <td style="text-align:right;color:#b45309;">${multa > 0 && (multaConfig as any)?.ativo ? formatAOA(multa) : '—'}</td>
                        <td style="text-align:center;"><span style="background:${bloqueado?'#fee2e2':'#fef3c7'};color:${bloqueado?'#b91c1c':'#92400e'};border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700;">${bloqueado?'BLOQUEADO':'VENCIDO'}</span></td>
                      </tr>`;
                    }).join('');
                    const totalDivida = alunosEmAtraso.reduce((acc, { pendente }) => acc + pendente, 0);
                    const totalMulta  = alunosEmAtraso.reduce((acc, { multa }) => acc + multa, 0);
                    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Relatório de Inadimplência</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:11px;color:#000;}
.page{padding:14mm 15mm;}.header{text-align:center;margin-bottom:10px;}
.header p{margin:1px 0;font-size:11px;font-weight:bold;text-transform:uppercase;}
.doc-title{text-align:center;font-size:13px;font-weight:bold;text-decoration:underline;margin:8px 0;text-transform:uppercase;letter-spacing:1px;}
.kpi-row{display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap;}
.kpi{border:1px solid #ddd;border-radius:6px;padding:6px 14px;text-align:center;min-width:120px;}
.kpi-val{font-size:16px;font-weight:800;color:#b91c1c;}.kpi-lbl{font-size:9px;color:#555;text-transform:uppercase;}
table{border-collapse:collapse;width:100%;font-size:10px;margin-bottom:14px;}
th{background:#1a2540;color:#fff;font-weight:bold;border:1px solid #000;padding:4px 5px;text-align:center;}
td{border:1px solid #000;padding:3px 4px;}
.sig-row{display:flex;justify-content:space-between;margin-top:20px;}
.sig-block{text-align:center;min-width:150px;}.sig-line{width:140px;border-top:1px solid #000;margin:22px auto 4px;}
@media print{.page{padding:10mm 12mm;}@page{size:A4 portrait;margin:0;}}</style></head>
<body><div class="page">
<div class="header">
<img src="${window.location.origin}/angola-brasao.png" style="width:54px;height:auto;display:block;margin:0 auto 4px;" onerror="this.style.display='none'"/>
<p>REPÚBLICA DE ANGOLA</p><p>MINISTÉRIO DA EDUCAÇÃO</p><p>ENSINO GERAL</p>
<p style="margin-top:3px;">${escola}</p></div>
<div class="doc-title">Relatório de Inadimplência — Propinas em Atraso</div>
<div style="font-size:10px;margin-bottom:8px;display:flex;gap:20px;flex-wrap:wrap;">
<span><strong>Ano Lectivo:</strong> ${anoL}</span>
<span><strong>Data de emissão:</strong> ${dataStr}</span>
<span><strong>Total de devedores:</strong> ${alunosEmAtraso.length}</span>
</div>
<div class="kpi-row">
<div class="kpi"><div class="kpi-val">${alunosEmAtraso.length}</div><div class="kpi-lbl">Devedores</div></div>
<div class="kpi"><div class="kpi-val">${formatAOA(totalDivida)}</div><div class="kpi-lbl">Total em Dívida</div></div>
${(multaConfig as any)?.ativo ? `<div class="kpi"><div class="kpi-val" style="color:#b45309;">${formatAOA(totalMulta)}</div><div class="kpi-lbl">Multas Estimadas</div></div>` : ''}
<div class="kpi"><div class="kpi-val" style="color:#1e3a5f;">${formatAOA(totalDivida + ((multaConfig as any)?.ativo ? totalMulta : 0))}</div><div class="kpi-lbl">Total Geral</div></div>
</div>
<table><thead><tr>
<th style="width:26px;">Nº</th>
<th style="text-align:left;padding-left:5px;width:36%;">NOME DO ALUNO</th>
<th>MATRÍCULA</th><th>TURMA</th>
<th>MESES EM<br>ATRASO</th>
<th>VALOR EM<br>COBRANÇA</th>
<th>MULTA<br>ESTIMADA</th>
<th>ESTADO</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="sig-row">
<div class="sig-block"><div class="sig-line"></div><div>Responsável Financeiro</div></div>
<div class="sig-block"><div>${dataStr}</div><div class="sig-line"></div><div>Director(a) da Escola<br><small>${director}</small></div></div>
</div></div></body></html>`;
                    const win = window.open('', '_blank');
                    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 600); }
                  }}
                >
                  <Ionicons name="print-outline" size={13} color="#1e3a5f" />
                  <Text style={[st.atrasoActionTxt, { color: '#1e3a5f', fontWeight: '700' }]}>Imprimir Relatório PDF</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[st.atrasoActionBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '55', paddingHorizontal: 12, paddingVertical: 8 }]}
                onPress={() => {
                  webAlert(
                    'Notificar Todos os Devedores',
                    `Pretende enviar uma notificação de cobrança a todos os ${alunosEmAtraso.length} encarregados com propinas em atraso?`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Notificar Todos',
                        onPress: async () => {
                          let enviados = 0;
                          for (const { aluno, mesesAtraso, pendente } of alunosEmAtraso) {
                            try {
                              const token = (await import('@/context/AuthContext')).getAuthToken ? await (await import('@/context/AuthContext')).getAuthToken() : '';
                              await fetch('/api/financeiro/mensagem', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
                                body: JSON.stringify({
                                  alunoId: aluno.id,
                                  texto: `Prezado(a) Encarregado(a),\n\nInformamos que o(a) aluno(a) ${aluno.nome} ${aluno.apelido} tem ${mesesAtraso} mês(es) de propinas em atraso, totalizando ${formatAOA(pendente)}.\n\nPedimos a regularização urgente da situação junto da Secretaria ou Serviços Financeiros da escola.\n\nObrigado.`,
                                }),
                              });
                              enviados++;
                            } catch {}
                          }
                          alertSucesso(`Notificação enviada a ${enviados} encarregado(s).`);
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="notifications-outline" size={13} color={Colors.info} />
                <Text style={[st.atrasoActionTxt, { color: Colors.info, fontWeight: '700' }]}>Notificar Todos ({alunosEmAtraso.length})</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        renderItem={({ item }) => {
          const { aluno, mesesAtraso, multa, valorPropina, pendente } = item;
          const bloqueado = isAlunoBloqueado(aluno.id);
          const turmaA = turmas.find(t => t.id === aluno.turmaId);
          const unread = mensagens.filter(m => m.alunoId === aluno.id && !m.lida).length;
          return (
            <View style={[st.atrasoCard, bloqueado && { borderLeftColor: Colors.danger, borderLeftWidth: 3 }]}>
              <View style={st.atrasoAvatarRow}>
                <View style={st.atrasoAvatar}>
                  <Text style={st.atrasoAvatarTxt}>{aluno.nome[0]}{aluno.apelido[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.atrasoNome}>{aluno.nome} {aluno.apelido}</Text>
                  <Text style={st.atrasoMat}>{aluno.numeroMatricula} · {turmaA?.nome || '—'}</Text>
                </View>
                {bloqueado && <Badge label="Bloqueado" color={Colors.danger} />}
                {acessoLiberado.includes(aluno.id) && <Badge label="Acesso Livre" color={Colors.gold} />}
              </View>

              <View style={st.atrasoStats}>
                {mesesAtraso > 0 && (
                  <View style={st.atrasoStatItem}>
                    <Ionicons name="time" size={13} color={Colors.warning} />
                    <Text style={[st.atrasoStatTxt, { color: Colors.warning }]}>{mesesAtraso} {mesesAtraso === 1 ? 'mês' : 'meses'} em atraso</Text>
                  </View>
                )}
                {pendente > 0 && (
                  <View style={st.atrasoStatItem}>
                    <Ionicons name="cash" size={13} color={Colors.danger} />
                    <Text style={[st.atrasoStatTxt, { color: Colors.danger }]}>Em Cobrança: {formatAOA(pendente)}</Text>
                  </View>
                )}
                {multa > 0 && multaConfig.ativo && (
                  <View style={st.atrasoStatItem}>
                    <Ionicons name="warning" size={13} color={Colors.danger} />
                    <Text style={[st.atrasoStatTxt, { color: Colors.danger }]}>Multa estimada: {formatAOA(multa)}</Text>
                  </View>
                )}
              </View>

              <View style={st.atrasoActions}>
                <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '55' }]}
                  onPress={() => { setMsgAlunoId(aluno.id); setMsgTexto(''); setShowMsgModal(true); }}>
                  <Ionicons name="chatbubble" size={13} color={Colors.info} />
                  <Text style={[st.atrasoActionTxt, { color: Colors.info }]}>Mensagem{unread > 0 ? ` (${unread})` : ''}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '55' }]}
                  onPress={() => { setRupeAlunoId(aluno.id); setRupeTaxaId(''); setRupeValor(''); setRupeGerado(null); setShowRUPEModal(true); }}>
                  <Ionicons name="receipt" size={13} color={Colors.gold} />
                  <Text style={[st.atrasoActionTxt, { color: Colors.gold }]}>RUPE</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: (bloqueado ? Colors.success : Colors.danger) + '22', borderColor: (bloqueado ? Colors.success : Colors.danger) + '55' }]}
                  onPress={() => handleBloquear(aluno.id, bloqueado)}>
                  <Ionicons name={bloqueado ? 'lock-open' : 'lock-closed'} size={13} color={bloqueado ? Colors.success : Colors.danger} />
                  <Text style={[st.atrasoActionTxt, { color: bloqueado ? Colors.success : Colors.danger }]}>{bloqueado ? 'Desbloquear' : 'Bloquear'}</Text>
                </TouchableOpacity>

                {(() => {
                  const acessoLib = acessoLiberado.includes(aluno.id);
                  return (
                    <TouchableOpacity
                      style={[st.atrasoActionBtn, { backgroundColor: (acessoLib ? Colors.gold : Colors.textMuted) + '22', borderColor: (acessoLib ? Colors.gold : Colors.textMuted) + '55' }]}
                      onPress={() => {
                        const msg = acessoLib
                          ? 'Revogar acesso especial ao portal? O aluno ficará sujeito ao bloqueio financeiro normal.'
                          : 'Permitir acesso ao portal mesmo com propinas em atraso? O bloqueio financeiro não impedirá o acesso deste aluno.';
                        webAlert(acessoLib ? 'Revogar Acesso Especial' : 'Libertar Acesso ao Portal', msg, [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: acessoLib ? 'Revogar' : 'Libertar', onPress: () => togglePermitirAcessoPortal(aluno.id, !acessoLib) },
                        ]);
                      }}
                    >
                      <Ionicons name={acessoLib ? 'shield-checkmark' : 'shield-outline'} size={13} color={acessoLib ? Colors.gold : Colors.textMuted} />
                      <Text style={[st.atrasoActionTxt, { color: acessoLib ? Colors.gold : Colors.textMuted }]}>{acessoLib ? 'Acesso Livre' : 'Libertar'}</Text>
                    </TouchableOpacity>
                  );
                })()}

                {podeRegistarObito && (
                  <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: '#6B21A822', borderColor: '#6B21A855' }]}
                    onPress={() => { setObituarioAlunoId(aluno.id); setObituarioData(''); setObituarioObs(''); setShowObituarioModal(true); }}>
                    <Ionicons name="ribbon" size={13} color="#6B21A8" />
                    <Text style={[st.atrasoActionTxt, { color: '#6B21A8' }]}>Óbito</Text>
                  </TouchableOpacity>
                )}
                {multa > 0 && multaConfig.ativo && (() => {
                  const isencao = isencoes?.find(i => i.alunoId === aluno.id);
                  if (isencao?.status === 'aprovado') {
                    return (
                      <View style={[st.atrasoActionBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '55' }]}>
                        <Ionicons name="shield-checkmark" size={13} color={Colors.success} />
                        <Text style={[st.atrasoActionTxt, { color: Colors.success }]}>Isento</Text>
                      </View>
                    );
                  }
                  if (isencao?.status === 'pendente') {
                    const podeAprovacao = user?.role === 'director';
                    if (podeAprovacao) {
                      return (
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '55' }]}
                            onPress={() => handleResponderIsencao(isencao.id, 'aprovado')}>
                            <Ionicons name="checkmark" size={13} color={Colors.success} />
                            <Text style={[st.atrasoActionTxt, { color: Colors.success }]}>Aprovar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '55' }]}
                            onPress={() => handleResponderIsencao(isencao.id, 'rejeitado')}>
                            <Ionicons name="close" size={13} color={Colors.danger} />
                            <Text style={[st.atrasoActionTxt, { color: Colors.danger }]}>Rejeitar</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    return (
                      <View style={[st.atrasoActionBtn, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '55' }]}>
                        <Ionicons name="hourglass" size={13} color={Colors.warning} />
                        <Text style={[st.atrasoActionTxt, { color: Colors.warning }]}>Isenção pendente</Text>
                      </View>
                    );
                  }
                  if (user?.role === 'financeiro' || user?.role === 'director') {
                    return (
                      <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.primary + '22', borderColor: Colors.primary + '55' }]}
                        onPress={() => { setIsencaoAlunoId(aluno.id); setIsencaoJustif(''); setShowIsencaoModal(true); }}>
                        <Ionicons name="shield-checkmark-outline" size={13} color={Colors.primary} />
                        <Text style={[st.atrasoActionTxt, { color: Colors.primary }]}>Isentar Multa</Text>
                      </TouchableOpacity>
                    );
                  }
                  return null;
                })()}
              </View>
            </View>
          );
        }}
      />
    );
  }

  function renderMensagens() {
    const TIPO_MSG_CFG = {
      aviso:    { color: Colors.warning, icon: 'warning', label: 'Aviso' },
      bloqueio: { color: Colors.danger,  icon: 'lock-closed', label: 'Bloqueio' },
      rupe:     { color: Colors.gold,    icon: 'receipt', label: 'RUPE' },
      geral:    { color: Colors.info,    icon: 'chatbubble', label: 'Geral' },
    };

    return (
      <View style={{ flex: 1 }}>
        {todasMensagens.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem mensagens enviadas</Text>
            <Text style={st.emptySub}>As mensagens enviadas aos estudantes aparecerão aqui.</Text>
          </View>
        ) : (
          <FlatList
            data={todasMensagens}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item: msg }) => {
              const cfg = TIPO_MSG_CFG[msg.tipo] || TIPO_MSG_CFG.geral;
              return (
                <View style={[st.msgCard, !msg.lida && { borderLeftColor: cfg.color, borderLeftWidth: 3 }]}>
                  <View style={[st.msgIconBox, { backgroundColor: cfg.color + '22' }]}>
                    <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <Text style={st.msgAluno}>{getNomeAluno(msg.alunoId)}</Text>
                      <Badge label={cfg.label} color={cfg.color} />
                    </View>
                    <Text style={st.msgTexto}>{msg.texto}</Text>
                    <Text style={st.msgData}>{new Date(msg.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    );
  }

  function renderPagamentos() {
    return (
      <View style={{ flex: 1 }}>
        <View style={st.filterBlock}>
          <View style={st.searchRow}>
            <StableSearchInput
              value={searchPagAluno}
              onChangeText={setSearchPagAluno}
              inputStyle={st.searchInput}
              placeholder="Pesquisar aluno..."
              iconColor={Colors.textMuted}
            />
            <ExportMenu
              title="Registo de Pagamentos"
              columns={[
                { header: 'Aluno', key: 'nomeAluno', width: 26 },
                { header: 'Turma', key: 'turma', width: 12 },
                { header: 'Rubrica', key: 'nomeTaxa', width: 22 },
                { header: 'Tipo', key: 'tipo', width: 14 },
                { header: 'Valor (Kz)', key: 'valor', width: 14 },
                { header: 'Data', key: 'data', width: 14 },
                { header: 'Mês', key: 'mes', width: 8 },
                { header: 'Método', key: 'metodo', width: 16 },
                { header: 'Estado', key: 'estado', width: 12 },
                { header: 'Referência', key: 'referencia', width: 16 },
              ]}
              rows={pagamentosFiltrados.map(p => ({
                nomeAluno: getNomeAluno(p.alunoId),
                turma: getTurmaAluno(p.alunoId),
                nomeTaxa: getNomeTaxa(p.taxaId),
                tipo: tipoLabel(getTipoTaxa(p.taxaId)),
                valor: p.valor,
                data: new Date(p.data).toLocaleDateString('pt-PT'),
                mes: p.mes ? MESES[p.mes - 1] : '',
                metodo: metodoLabel(p.metodoPagamento),
                estado: STATUS_CFG[p.status].label,
                referencia: p.referencia ?? '',
              }))}
              school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola', anoLetivo: anoSelecionado?.nome, directorGeral: config?.directorGeral }}
              filename="registos_pagamentos"
              landscape
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.chipRow}>
              {(['todos','pago','pendente','cancelado'] as const).map(s => (
                <TouchableOpacity key={s} style={[st.chip, statusFilter === s && st.chipActive]} onPress={() => setStatusFilter(s)}>
                  <Text style={[st.chipText, statusFilter === s && st.chipTextActive]}>
                    {s === 'todos' ? 'Todos' : STATUS_CFG[s as StatusPagamento].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.chipRow}>
              {(['todos', ...TIPOS] as const).map(t => (
                <TouchableOpacity key={t} style={[st.chip, tipoFilter === t && st.chipActive]} onPress={() => setTipoFilter(t as any)}>
                  <Text style={[st.chipText, tipoFilter === t && st.chipTextActive]}>
                    {t === 'todos' ? 'Todos tipos' : tipoLabel(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.chipRow}>
              {(['todos','dinheiro','transferencia','multicaixa'] as const).map(m => (
                <TouchableOpacity key={m} style={[st.chip, metodoPagFilter === m && st.chipActive]} onPress={() => setMetodoPagFilter(m as any)}>
                  <Text style={[st.chipText, metodoPagFilter === m && st.chipTextActive]}>
                    {m === 'todos' ? 'Todos métodos' : metodoLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={st.chipRow}>
              <TouchableOpacity style={[st.chip, mesFilter === 'todos' && st.chipActive]} onPress={() => setMesFilter('todos')}>
                <Text style={[st.chipText, mesFilter === 'todos' && st.chipTextActive]}>Todos meses</Text>
              </TouchableOpacity>
              {MESES.map((m, i) => (
                <TouchableOpacity key={m} style={[st.chip, mesFilter === String(i + 1) && st.chipActive]} onPress={() => setMesFilter(mesFilter === String(i + 1) ? 'todos' : String(i + 1))}>
                  <Text style={[st.chipText, mesFilter === String(i + 1) && st.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {pagamentosFiltrados.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem pagamentos</Text>
            <Text style={st.emptySub}>Não existem pagamentos que correspondam aos filtros seleccionados.</Text>
          </View>
        ) : (
          <FlatList
            data={pagamentosFiltrados}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 80 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item: pag }) => {
              const sc   = STATUS_CFG[pag.status];
              const tipo = getTipoTaxa(pag.taxaId);
              return (
                <View style={st.pagCard}>
                  <View style={[st.pagIcon, { backgroundColor: tipoCor(tipo) + '22' }]}>
                    <Ionicons name={tipoIcon(tipo) as any} size={18} color={tipoCor(tipo)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pagNome}>{getNomeAluno(pag.alunoId)}</Text>
                    <Text style={st.pagTaxa}>{getNomeTaxa(pag.taxaId)}</Text>
                    <View style={st.pagMeta}>
                      <Ionicons name="calendar-outline" size={10} color={Colors.textMuted} />
                      <Text style={st.pagMetaTxt}>{new Date(pag.data).toLocaleDateString('pt-PT')}</Text>
                      <Text style={st.pagMetaTxt}>·</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: (METODO_COLOR_MAP[pag.metodoPagamento] || Colors.textMuted) + '18', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: (METODO_COLOR_MAP[pag.metodoPagamento] || Colors.textMuted) + '40' }}>
                        <Ionicons name={(METODO_ICON_MAP[pag.metodoPagamento] || 'cash-outline') as any} size={9} color={METODO_COLOR_MAP[pag.metodoPagamento] || Colors.textMuted} />
                        <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: METODO_COLOR_MAP[pag.metodoPagamento] || Colors.textMuted }}>{metodoLabel(pag.metodoPagamento)}</Text>
                      </View>
                      <Text style={st.pagMetaTxt}>·</Text>
                      <Text style={st.pagMetaTxt}>{getTurmaAluno(pag.alunoId)}</Text>
                    </View>
                    {pag.referencia && <Text style={st.pagRef}>Ref: {pag.referencia}</Text>}
                    {pag.criadoPorNome && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Ionicons name="person-outline" size={9} color={Colors.textMuted} />
                        <Text style={[st.pagRef, { color: Colors.textMuted }]}>Op.: {pag.criadoPorNome}</Text>
                      </View>
                    )}
                    {(() => {
                      const comprProof = pag.observacao?.match(/Comprovativo:\s*(.+)/)?.[1];
                      return comprProof ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, backgroundColor: Colors.success + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                          <Ionicons name="document-attach" size={11} color={Colors.success} />
                          <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_600SemiBold', flex: 1 }} numberOfLines={1}>Comprv: {comprProof}</Text>
                        </View>
                      ) : null;
                    })()}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={st.pagValor}>{formatAOA(pag.valor)}</Text>
                    <Badge label={sc.label} color={sc.color} />
                    {pag.status === 'pendente' && pag.observacao?.includes('Comprovativo:') && (
                      <View style={{ backgroundColor: Colors.success + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' }}>✓ COM PROVA</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {Platform.OS === 'web' && (
                        <TouchableOpacity
                          style={[st.confirmarBtn, { backgroundColor: Colors.info + 'cc' }]}
                          onPress={() => openPdfInTab(`/api/pdf/recibo/${pag.id}`)}
                        >
                          <Ionicons name="document-text" size={11} color="#fff" />
                          <Text style={st.confirmarTxt}>PDF</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[st.confirmarBtn, { backgroundColor: Colors.gold + 'cc' }]}
                        onPress={() => abrirComprovativo(pag.id)}
                      >
                        <Ionicons name="receipt-outline" size={11} color="#fff" />
                        <Text style={st.confirmarTxt}>Compr.</Text>
                      </TouchableOpacity>
                      {pag.status !== 'cancelado' && (
                        <TouchableOpacity
                          style={[st.confirmarBtn, { backgroundColor: Colors.danger + 'cc' }]}
                          onPress={() => { setCancelarRecriarPagId(pag.id); setFormRecriar(defaultFormRecriar); setShowCancelarRecriarModal(true); }}
                        >
                          <Ionicons name="refresh-circle-outline" size={11} color="#fff" />
                          <Text style={st.confirmarTxt}>Recriar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[st.confirmarBtn, { backgroundColor: Colors.textMuted + 'cc' }]}
                        onPress={() => abrirAuditoriaPagamento(pag.id)}
                      >
                        <Ionicons name="time-outline" size={11} color="#fff" />
                        <Text style={st.confirmarTxt}>Histórico</Text>
                      </TouchableOpacity>
                      {pag.status === 'pendente' && (
                        <TouchableOpacity style={st.confirmarBtn} onPress={() => updatePagamento(pag.id, { status: 'pago' })}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                          <Text style={st.confirmarTxt}>Validar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
        <View style={{ position: 'absolute', bottom: bottomInset + 88, right: 16, gap: 10, alignItems: 'flex-end' }}>
          <TouchableOpacity
            style={[st.fab, { backgroundColor: Colors.info, paddingHorizontal: 16 }]}
            onPress={() => { setFormAvulso(defaultFormAvulso); setShowAvulsoModal(true); }}
          >
            <Ionicons name="flash-outline" size={18} color="#fff" />
            <Text style={st.fabTxt}>Cobrança Avulsa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.fab} onPress={() => { setFormPag(defaultFormPag); setShowModalPag(true); }}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={st.fabTxt}>Registar Pagamento</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderRubricas() {
    const grupos = TIPOS.filter(t => taxasAno.some(x => x.tipo === t));
    return (
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 80 }}>
          <View style={st.rubricaInfoBanner}>
            <Ionicons name="information-circle" size={18} color={Colors.info} />
            <Text style={st.rubricaInfoTxt}>
              Todas as rubricas activas aparecem automaticamente no perfil financeiro de cada aluno de acordo com o nível e ano lectivo definidos.
            </Text>
          </View>

          <TouchableOpacity style={st.multaBanner} onPress={() => { setMultaPct(multaConfig.percentagem.toString()); setMultaDias(multaConfig.diasCarencia.toString()); setMultaDiaInicio((multaConfig.diaInicioMulta || 10).toString()); setMultaValorDia((multaConfig.valorPorDia || 0).toString()); setShowMultaModal(true); }}>
            <Ionicons name="warning" size={16} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={st.multaBannerTitle}>Multa por Atraso — {(multaConfig.valorPorDia || 0) > 0 ? `${formatAOA(multaConfig.valorPorDia!)} /dia` : `${multaConfig.percentagem}% /mês`}</Text>
              <Text style={st.multaBannerSub}>Início: dia {multaConfig.diaInicioMulta || 10} · {multaConfig.ativo ? 'Activa' : 'Inactiva'} · Toque para configurar</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
          </TouchableOpacity>

          {taxasAno.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="pricetag-outline" size={48} color={Colors.textMuted} />
              <Text style={st.emptyTitle}>Sem rubricas para {anoAtual}</Text>
              <Text style={st.emptySub}>Crie a primeira rubrica para que apareça no perfil dos alunos.</Text>
            </View>
          ) : (
            grupos.map(tipo => (
              <View key={tipo}>
                <View style={st.grupoHeader}>
                  <View style={[st.grupoIconBox, { backgroundColor: tipoCor(tipo) + '22' }]}>
                    <Ionicons name={tipoIcon(tipo) as any} size={14} color={tipoCor(tipo)} />
                  </View>
                  <Text style={[st.grupoTitle, { color: tipoCor(tipo) }]}>{tipoLabel(tipo).toUpperCase()}</Text>
                  <Text style={st.grupoCount}>{taxasAno.filter(t => t.tipo === tipo).length}</Text>
                </View>
                {taxasAno.filter(t => t.tipo === tipo).map(t => (
                  <View key={t.id} style={[st.rubricaCard, !t.ativo && { opacity: 0.55 }]}>
                    <View style={{ flex: 1 }}>
                      <View style={st.rubricaTop}>
                        <Text style={st.rubricaNome}>{t.descricao}</Text>
                        <Badge label={t.ativo ? 'Activa' : 'Inactiva'} color={t.ativo ? Colors.success : Colors.textMuted} />
                      </View>
                      <View style={st.rubricaMeta}>
                        <Text style={st.rubricaMetaTxt}>{FREQS.find(f => f.k === t.frequencia)?.l || t.frequencia}</Text>
                        <Text style={st.rubricaMetaTxt}>·</Text>
                        <Text style={st.rubricaMetaTxt}>{t.nivel || 'Todos'}</Text>
                        <Text style={st.rubricaMetaTxt}>·</Text>
                        <Text style={[st.rubricaMetaTxt, { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>{formatAOA(t.valor)}</Text>
                      </View>
                    </View>
                    <View style={st.rubricaActions}>
                      <TouchableOpacity style={st.rubricaActionBtn} onPress={() => openEditTaxa(t)}>
                        <Ionicons name="pencil" size={14} color={Colors.info} />
                      </TouchableOpacity>
                      <TouchableOpacity style={st.rubricaActionBtn} onPress={() => toggleTaxa(t)}>
                        <Ionicons name={t.ativo ? 'eye-off' : 'eye'} size={14} color={t.ativo ? Colors.warning : Colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity style={st.rubricaActionBtn} onPress={() => removerTaxa(t)}>
                        <Ionicons name="trash" size={14} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
        <TouchableOpacity style={st.fab} onPress={() => { setEditTaxa(null); setFormTaxa(defaultFormTaxa); setTaxaErrors({}); setShowModalTaxa(true); }}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={st.fabTxt}>Nova Rubrica</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderRelatorios() {
    const pagamentosAnoCompleto = pagamentosAno.filter(p => p.status === 'pago');
    const totalRel = relatorioFiltrado.reduce((s, p) => s + p.valor, 0);
    const countRel = relatorioFiltrado.length;
    const turmasAtivas = turmas.filter(t => t.ativo);

    const receitaPorTipo = TIPOS.map(tipo => {
      const ids = new Set(taxas.filter(t => t.tipo === tipo).map(t => t.id));
      const val = relatorioFiltrado.filter(p => ids.has(p.taxaId)).reduce((s, p) => s + p.valor, 0);
      return { label: tipoLabel(tipo), value: val, color: tipoCor(tipo) };
    }).filter(d => d.value > 0);

    const receitaPorMetodo = (['dinheiro','transferencia','multicaixa'] as MetodoPagamento[]).map(m => {
      const val = relatorioFiltrado.filter(p => p.metodoPagamento === m).reduce((s, p) => s + p.valor, 0);
      return { label: metodoLabel(m), value: val, color: m === 'dinheiro' ? Colors.gold : m === 'multicaixa' ? Colors.info : Colors.success };
    }).filter(d => d.value > 0);

    const receitaPorMes = MESES.map((nome, i) => {
      const val = pagamentosAnoCompleto.filter(p => p.mes === i + 1).reduce((s, p) => s + p.valor, 0);
      return { label: nome.slice(0, 3), value: val, color: Colors.info };
    });
    const TRIMS = [
      { label: '1.º Trim.', meses: [1,2,3,4], color: Colors.info },
      { label: '2.º Trim.', meses: [5,6,7,8], color: Colors.success },
      { label: '3.º Trim.', meses: [9,10,11,12], color: Colors.gold },
    ];
    const receitaPorTrimestre = TRIMS.map(tr => {
      const val = pagamentosAnoCompleto.filter(p => tr.meses.includes(p.mes || 0)).reduce((s, p) => s + p.valor, 0);
      const pend = pagamentosAno.filter(p => p.status === 'pendente' && tr.meses.includes(p.mes || 0)).reduce((s, p) => s + p.valor, 0);
      const count = pagamentosAnoCompleto.filter(p => tr.meses.includes(p.mes || 0)).length;
      return { label: tr.label, value: val, pendente: pend, count, color: tr.color };
    });

    const receitaPorNivel = ['Primário','I Ciclo','II Ciclo'].map((nivel, idx) => {
      const COLORS = [Colors.success, Colors.info, '#8B5CF6'];
      const val = relatorioFiltrado.filter(p => {
        const a = alunos.find(x => x.id === p.alunoId);
        if (!a) return false;
        const t = turmas.find(x => x.id === a.turmaId);
        return t?.nivel === nivel;
      }).reduce((s, p) => s + p.valor, 0);
      return { label: nivel, value: val, color: COLORS[idx] };
    }).filter(d => d.value > 0);

    const receitaPorTurma = turmasAtivas.map(t => {
      const alunosDaTurma = new Set(alunos.filter(a => a.turmaId === t.id).map(a => a.id));
      const val = relatorioFiltrado.filter(p => alunosDaTurma.has(p.alunoId)).reduce((s, p) => s + p.valor, 0);
      const pendente = pagamentosAno.filter(p => alunosDaTurma.has(p.alunoId) && p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
      return { turma: t.nome, val, pendente, count: relatorioFiltrado.filter(p => alunosDaTurma.has(p.alunoId)).length };
    }).filter(r => r.val > 0 || r.pendente > 0).sort((a, b) => b.val - a.val);

    const topDevedores = alunosEmAtraso.slice(0, 5);
    const totalAnual = pagamentosAnoCompleto.reduce((s, p) => s + p.valor, 0);
    const totalPendenteAnual = pagamentosAno.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);

    const activeFilters = [relTipo !== 'todos', relNivel !== 'Todos', relMetodo !== 'todos', relTurmaId !== 'todas', relMesInicio !== 'todos', relMesFim !== 'todos'].filter(Boolean).length;
    const mesActual = new Date().getMonth() + 1;

    const periodoTabs: { key: 'mensal' | 'trimestral' | 'anual'; label: string; icon: string }[] = [
      { key: 'mensal', label: 'Mensal', icon: 'calendar' },
      { key: 'trimestral', label: 'Trimestral', icon: 'podium' },
      { key: 'anual', label: 'Anual', icon: 'stats-chart' },
    ];

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 60 }}>

        {/* Seletor de Período Principal */}
        <View style={{ marginBottom: 16 }}>
          <Text style={[st.secLabel, { marginBottom: 10 }]}>TIPO DE RELATÓRIO</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {periodoTabs.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
                  borderColor: relPeriodo === tab.key ? Colors.gold : Colors.border,
                  backgroundColor: relPeriodo === tab.key ? Colors.gold + '18' : Colors.surface,
                }]}
                onPress={() => {
                  setRelPeriodo(tab.key);
                  if (tab.key === 'anual') { setRelMesInicio('todos'); setRelMesFim('todos'); }
                  if (tab.key === 'mensal') { setRelMesInicio(String(mesActual)); setRelMesFim(String(mesActual)); }
                }}
              >
                <Ionicons name={tab.icon as any} size={14} color={relPeriodo === tab.key ? Colors.gold : Colors.textMuted} />
                <Text style={{ fontSize: 12, fontFamily: relPeriodo === tab.key ? 'Inter_700Bold' : 'Inter_600SemiBold', color: relPeriodo === tab.key ? Colors.gold : Colors.textMuted }}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ═══════════════ VISTA MENSAL ═══════════════ */}
        {relPeriodo === 'mensal' && (
          <>
            <Text style={[st.secLabel, { marginBottom: 8 }]}>SELECCIONAR MÊS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                {MESES.map((nome, i) => {
                  const m = String(i + 1);
                  const isActive = relMesInicio === m && relMesFim === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: isActive ? Colors.gold : Colors.border, backgroundColor: isActive ? Colors.gold + '18' : Colors.surface }}
                      onPress={() => { setRelMesInicio(m); setRelMesFim(m); }}
                    >
                      <Text style={{ color: isActive ? Colors.gold : Colors.text, fontSize: 11, fontFamily: isActive ? 'Inter_700Bold' : 'Inter_400Regular' }}>{nome.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[st.kpiRow, { marginBottom: 12 }]}>
              <View style={[st.kpiCard, { flex: 1.5, borderTopWidth: 2, borderTopColor: Colors.success }]}>
                <Ionicons name="trending-up" size={14} color={Colors.success} />
                <Text style={[st.kpiVal, { color: Colors.success, fontSize: 16 }]}>{formatAOA(totalRel)}</Text>
                <Text style={st.kpiLbl}>Arrecadado</Text>
                <Text style={[st.kpiLbl, { fontSize: 9 }]}>{relMesInicio !== 'todos' ? MESES[parseInt(relMesInicio) - 1] : 'Todos os meses'}</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1 }]}>
                <Ionicons name="receipt" size={13} color={Colors.info} />
                <Text style={[st.kpiVal, { color: Colors.info, fontSize: 20 }]}>{countRel}</Text>
                <Text style={st.kpiLbl}>Pagamentos</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1 }]}>
                <Ionicons name="people" size={13} color={Colors.gold} />
                <Text style={[st.kpiVal, { color: Colors.gold, fontSize: 20 }]}>{new Set(relatorioFiltrado.map(p => p.alunoId)).size}</Text>
                <Text style={st.kpiLbl}>Alunos</Text>
              </View>
            </View>

            {/* Gráfico de barras — todos os meses do ano */}
            <View style={st.relSection}>
              <Text style={st.secLabel}>EVOLUÇÃO MENSAL DO ANO {anoAtual}</Text>
              <Text style={[st.relFiltrosLabel, { marginBottom: 8, color: Colors.textMuted }]}>Receita arrecadada mês a mês (barra seleccionada em destaque)</Text>
              <View style={[st.relCard, { alignItems: 'center', paddingVertical: 16 }]}>
                <BarChart
                  data={receitaPorMes.map((d, i) => ({
                    ...d,
                    color: relMesInicio === String(i + 1) ? Colors.gold : Colors.info + '99',
                  }))}
                  maxValue={Math.max(...receitaPorMes.map(d => d.value), 1)}
                  height={160}
                  width={Math.min(340, receitaPorMes.length * 26 + 40)}
                />
              </View>
            </View>

            {receitaPorTipo.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>DISTRIBUIÇÃO POR TIPO DE RUBRICA</Text>
                <View style={[st.relCard, { alignItems: 'center' }]}>
                  <DonutChart data={receitaPorTipo} size={170} thickness={28} centerLabel={formatAOA(totalRel).replace(' Kz','')} centerSub="Total" />
                  <View style={{ width: '100%', marginTop: 8 }}>
                    {receitaPorTipo.map(d => (
                      <View key={d.label} style={st.relTableRow}>
                        <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                        <Text style={st.relTableLabel}>{d.label}</Text>
                        <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                        <Text style={st.relTablePct}>{totalRel > 0 ? Math.round((d.value / totalRel) * 100) : 0}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {receitaPorMetodo.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>MÉTODO DE PAGAMENTO</Text>
                <View style={[st.relCard, { alignItems: 'center' }]}>
                  <DonutChart data={receitaPorMetodo} size={150} thickness={26} centerLabel={String(countRel)} centerSub="transacções" />
                  <View style={{ width: '100%', marginTop: 8 }}>
                    {receitaPorMetodo.map(d => (
                      <View key={d.label} style={st.relTableRow}>
                        <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                        <Text style={st.relTableLabel}>{d.label}</Text>
                        <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                        <Text style={st.relTablePct}>{totalRel > 0 ? Math.round((d.value / totalRel) * 100) : 0}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Filtros avançados colapsáveis */}
            <View style={[st.relFiltrosCard, { marginTop: 4 }]}>
              <View style={st.relFiltrosHeader}>
                <Ionicons name="options" size={15} color={Colors.gold} />
                <Text style={st.relFiltrosTitle}>Filtros Adicionais</Text>
                {activeFilters > 0 && (
                  <TouchableOpacity onPress={() => { setRelTipo('todos'); setRelNivel('Todos'); setRelMetodo('todos'); setRelTurmaId('todas'); }}>
                    <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>Limpar ({activeFilters})</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={st.relFiltrosLabel}>Tipo de Rubrica</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={st.chipRow}>
                  {(['todos', ...TIPOS] as const).map(t => (
                    <TouchableOpacity key={t} style={[st.chip, relTipo === t && st.chipActive]} onPress={() => setRelTipo(t as any)}>
                      <Text style={[st.chipText, relTipo === t && st.chipTextActive]}>{t === 'todos' ? 'Todos' : tipoLabel(t)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={st.relFiltrosLabel}>Nível</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={st.chipRow}>
                  {NIVEIS.map(n => (
                    <TouchableOpacity key={n} style={[st.chip, relNivel === n && st.chipActive]} onPress={() => setRelNivel(n)}>
                      <Text style={[st.chipText, relNivel === n && st.chipTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {turmasAtivas.length > 0 && (
                <>
                  <Text style={st.relFiltrosLabel}>Turma</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={st.chipRow}>
                      <TouchableOpacity style={[st.chip, relTurmaId === 'todas' && st.chipActive]} onPress={() => setRelTurmaId('todas')}>
                        <Text style={[st.chipText, relTurmaId === 'todas' && st.chipTextActive]}>Todas</Text>
                      </TouchableOpacity>
                      {turmasAtivas.map(t => (
                        <TouchableOpacity key={t.id} style={[st.chip, relTurmaId === t.id && st.chipActive]} onPress={() => setRelTurmaId(t.id)}>
                          <Text style={[st.chipText, relTurmaId === t.id && st.chipTextActive]}>{t.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          </>
        )}

        {/* ═══════════════ VISTA TRIMESTRAL ═══════════════ */}
        {relPeriodo === 'trimestral' && (
          <>
            <View style={[st.kpiRow, { marginBottom: 12 }]}>
              <View style={[st.kpiCard, { flex: 1.5, borderTopWidth: 2, borderTopColor: Colors.success }]}>
                <Ionicons name="trending-up" size={14} color={Colors.success} />
                <Text style={[st.kpiVal, { color: Colors.success, fontSize: 16 }]}>{formatAOA(totalAnual)}</Text>
                <Text style={st.kpiLbl}>Total Anual</Text>
                <Text style={[st.kpiLbl, { fontSize: 9 }]}>ano lectivo {anoAtual}</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1, borderTopWidth: 2, borderTopColor: Colors.warning }]}>
                <Ionicons name="time" size={13} color={Colors.warning} />
                <Text style={[st.kpiVal, { color: Colors.warning, fontSize: 16 }]}>{formatAOA(totalPendenteAnual)}</Text>
                <Text style={st.kpiLbl}>Em Cobrança</Text>
              </View>
            </View>

            {/* Gráfico de barras por trimestre */}
            <View style={st.relSection}>
              <Text style={st.secLabel}>RECEITA POR TRIMESTRE — {anoAtual}</Text>
              <View style={[st.relCard, { alignItems: 'center', paddingVertical: 16 }]}>
                <BarChart
                  data={receitaPorTrimestre.map(t => ({ label: t.label.replace('.º Trim.','T'), value: t.value, color: t.color }))}
                  maxValue={Math.max(...receitaPorTrimestre.map(d => d.value), 1)}
                  height={170}
                  width={280}
                />
              </View>
            </View>

            {/* Tabela detalhada por trimestre */}
            <View style={st.relSection}>
              <Text style={st.secLabel}>DETALHE POR TRIMESTRE</Text>
              <View style={st.relCard}>
                <View style={[st.relTableHeader, { paddingVertical: 8 }]}>
                  <Text style={[st.relTableHeaderTxt, { flex: 1.2 }]}>Período</Text>
                  <Text style={[st.relTableHeaderTxt, { flex: 1.5, textAlign: 'right' }]}>Arrecadado</Text>
                  <Text style={[st.relTableHeaderTxt, { flex: 1.2, textAlign: 'right' }]}>Em Cobrança</Text>
                  <Text style={[st.relTableHeaderTxt, { flex: 0.6, textAlign: 'right' }]}>Pag.</Text>
                </View>
                {receitaPorTrimestre.map((tr, idx) => (
                  <View key={tr.label} style={[st.relTableRow, { paddingVertical: 10, alignItems: 'center', backgroundColor: idx % 2 === 0 ? Colors.surface : 'transparent' }]}>
                    <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tr.color }} />
                      <Text style={[st.relTableLabel, { fontFamily: 'Inter_600SemiBold' }]}>{tr.label}</Text>
                    </View>
                    <Text style={[st.relTableVal, { flex: 1.5, textAlign: 'right', color: Colors.success, fontSize: 11 }]}>{formatAOA(tr.value)}</Text>
                    <Text style={[st.relTableVal, { flex: 1.2, textAlign: 'right', color: tr.pendente > 0 ? Colors.warning : Colors.textMuted, fontSize: 11 }]}>{tr.pendente > 0 ? formatAOA(tr.pendente) : '—'}</Text>
                    <Text style={[st.relTablePct, { flex: 0.6, textAlign: 'right' }]}>{tr.count}</Text>
                  </View>
                ))}
                <View style={[st.relTableRow, { paddingVertical: 10, backgroundColor: Colors.gold + '11', borderTopWidth: 1.5, borderTopColor: Colors.gold + '44' }]}>
                  <Text style={[st.relTableLabel, { flex: 1.2, fontFamily: 'Inter_700Bold', color: Colors.gold }]}>TOTAL</Text>
                  <Text style={[st.relTableVal, { flex: 1.5, textAlign: 'right', color: Colors.gold, fontSize: 12, fontFamily: 'Inter_700Bold' }]}>{formatAOA(totalAnual)}</Text>
                  <Text style={[st.relTableVal, { flex: 1.2, textAlign: 'right', color: Colors.warning, fontSize: 11 }]}>{totalPendenteAnual > 0 ? formatAOA(totalPendenteAnual) : '—'}</Text>
                  <Text style={[st.relTablePct, { flex: 0.6, textAlign: 'right', fontFamily: 'Inter_700Bold' }]}>{pagamentosAnoCompleto.length}</Text>
                </View>
              </View>
            </View>

            {/* Meses detalhados por trimestre */}
            {TRIMS.map(tr => {
              const mesesTr = receitaPorMes.filter((_, i) => tr.meses.includes(i + 1));
              const totalTr = mesesTr.reduce((s, m) => s + m.value, 0);
              if (totalTr === 0) return null;
              return (
                <View key={tr.label} style={st.relSection}>
                  <Text style={[st.secLabel, { color: tr.color }]}>{tr.label.toUpperCase()} — DETALHES</Text>
                  <View style={[st.relCard, { alignItems: 'center' }]}>
                    <BarChart
                      data={mesesTr.map(m => ({ ...m, color: tr.color }))}
                      maxValue={Math.max(...mesesTr.map(d => d.value), 1)}
                      height={120}
                      width={Math.min(300, mesesTr.length * 60 + 40)}
                    />
                    <View style={{ width: '100%', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border }}>
                      {mesesTr.map((m, i) => m.value > 0 && (
                        <View key={i} style={st.relTableRow}>
                          <Text style={st.relTableLabel}>{MESES[tr.meses[i] - 1]}</Text>
                          <Text style={[st.relTableVal, { color: tr.color }]}>{formatAOA(m.value)}</Text>
                          <Text style={st.relTablePct}>{totalTr > 0 ? Math.round((m.value / totalTr) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}

            {receitaPorNivel.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>DISTRIBUIÇÃO POR NÍVEL</Text>
                <View style={[st.relCard, { alignItems: 'center' }]}>
                  <DonutChart data={receitaPorNivel} size={150} thickness={26} centerLabel={formatAOA(totalAnual).replace(' Kz','')} centerSub="Total" />
                  <View style={{ width: '100%', marginTop: 8 }}>
                    {receitaPorNivel.map(d => (
                      <View key={d.label} style={st.relTableRow}>
                        <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                        <Text style={st.relTableLabel}>{d.label}</Text>
                        <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                        <Text style={st.relTablePct}>{totalAnual > 0 ? Math.round((d.value / totalAnual) * 100) : 0}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        {/* ═══════════════ VISTA ANUAL ═══════════════ */}
        {relPeriodo === 'anual' && (
          <>
            {/* KPIs anuais */}
            <View style={[st.kpiRow, { marginBottom: 12 }]}>
              <View style={[st.kpiCard, { flex: 1.5, borderTopWidth: 2, borderTopColor: Colors.success }]}>
                <Ionicons name="trending-up" size={14} color={Colors.success} />
                <Text style={[st.kpiVal, { color: Colors.success }]}>{formatAOA(totalAnual)}</Text>
                <Text style={st.kpiLbl}>Total Arrecadado</Text>
                <Text style={[st.kpiLbl, { fontSize: 9 }]}>ano lectivo {anoAtual}</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1, borderTopWidth: 2, borderTopColor: Colors.warning }]}>
                <Ionicons name="time" size={13} color={Colors.warning} />
                <Text style={[st.kpiVal, { color: Colors.warning, fontSize: 18 }]}>{formatAOA(totalPendenteAnual)}</Text>
                <Text style={st.kpiLbl}>Em Cobrança</Text>
              </View>
            </View>
            <View style={[st.kpiRow, { marginBottom: 16 }]}>
              <View style={[st.kpiCard, { flex: 1 }]}>
                <Ionicons name="receipt" size={13} color={Colors.info} />
                <Text style={[st.kpiVal, { color: Colors.info, fontSize: 20 }]}>{pagamentosAnoCompleto.length}</Text>
                <Text style={st.kpiLbl}>Transacções</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1 }]}>
                <Ionicons name="people" size={13} color={Colors.gold} />
                <Text style={[st.kpiVal, { color: Colors.gold, fontSize: 20 }]}>{new Set(pagamentosAnoCompleto.map(p => p.alunoId)).size}</Text>
                <Text style={st.kpiLbl}>Alunos Activos</Text>
              </View>
              <View style={[st.kpiCard, { flex: 1 }]}>
                <Ionicons name="alert-circle" size={13} color={Colors.danger} />
                <Text style={[st.kpiVal, { color: Colors.danger, fontSize: 20 }]}>{alunosEmAtraso.length}</Text>
                <Text style={st.kpiLbl}>Vencido</Text>
              </View>
            </View>

            {/* Gráfico anual — todos os 12 meses */}
            <View style={st.relSection}>
              <Text style={st.secLabel}>EVOLUÇÃO MENSAL COMPLETA — {anoAtual}</Text>
              <View style={[st.relCard, { alignItems: 'center', paddingVertical: 16 }]}>
                <BarChart
                  data={receitaPorMes.map(d => ({ ...d, color: Colors.gold + 'CC' }))}
                  maxValue={Math.max(...receitaPorMes.map(d => d.value), 1)}
                  height={180}
                  width={Math.min(360, receitaPorMes.length * 26 + 40)}
                />
              </View>
            </View>

            {/* Donut: por tipo */}
            {(() => {
              const allTipo = TIPOS.map(tipo => {
                const ids = new Set(taxas.filter(t => t.tipo === tipo).map(t => t.id));
                const val = pagamentosAnoCompleto.filter(p => ids.has(p.taxaId)).reduce((s, p) => s + p.valor, 0);
                return { label: tipoLabel(tipo), value: val, color: tipoCor(tipo) };
              }).filter(d => d.value > 0);
              return allTipo.length > 0 ? (
                <View style={st.relSection}>
                  <Text style={st.secLabel}>RECEITA POR TIPO DE RUBRICA</Text>
                  <View style={[st.relCard, { alignItems: 'center' }]}>
                    <DonutChart data={allTipo} size={180} thickness={30} centerLabel={formatAOA(totalAnual).replace(' Kz','')} centerSub="Total" />
                    <View style={{ width: '100%', marginTop: 8 }}>
                      {allTipo.map(d => (
                        <View key={d.label} style={st.relTableRow}>
                          <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                          <Text style={st.relTableLabel}>{d.label}</Text>
                          <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                          <Text style={st.relTablePct}>{totalAnual > 0 ? Math.round((d.value / totalAnual) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null;
            })()}

            {/* Donut: por método */}
            {(() => {
              const allMetodo = (['dinheiro','transferencia','multicaixa'] as MetodoPagamento[]).map(m => {
                const val = pagamentosAnoCompleto.filter(p => p.metodoPagamento === m).reduce((s, p) => s + p.valor, 0);
                return { label: metodoLabel(m), value: val, color: m === 'dinheiro' ? Colors.gold : m === 'multicaixa' ? Colors.info : Colors.success };
              }).filter(d => d.value > 0);
              return allMetodo.length > 0 ? (
                <View style={st.relSection}>
                  <Text style={st.secLabel}>MÉTODO DE PAGAMENTO</Text>
                  <View style={[st.relCard, { alignItems: 'center' }]}>
                    <DonutChart data={allMetodo} size={160} thickness={28} centerLabel={String(pagamentosAnoCompleto.length)} centerSub="transacções" />
                    <View style={{ width: '100%', marginTop: 8 }}>
                      {allMetodo.map(d => (
                        <View key={d.label} style={st.relTableRow}>
                          <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                          <Text style={st.relTableLabel}>{d.label}</Text>
                          <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                          <Text style={st.relTablePct}>{totalAnual > 0 ? Math.round((d.value / totalAnual) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null;
            })()}

            {/* Donut: por nível */}
            {receitaPorNivel.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>RECEITA POR NÍVEL DE ENSINO</Text>
                <View style={[st.relCard, { alignItems: 'center' }]}>
                  <DonutChart data={receitaPorNivel} size={160} thickness={28} centerLabel={formatAOA(totalAnual).replace(' Kz','')} centerSub="Total" />
                  <View style={{ width: '100%', marginTop: 8 }}>
                    {receitaPorNivel.map(d => (
                      <View key={d.label} style={st.relTableRow}>
                        <View style={[st.relTableDot, { backgroundColor: d.color }]} />
                        <Text style={st.relTableLabel}>{d.label}</Text>
                        <Text style={[st.relTableVal, { color: d.color }]}>{formatAOA(d.value)}</Text>
                        <Text style={st.relTablePct}>{totalAnual > 0 ? Math.round((d.value / totalAnual) * 100) : 0}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Tabela por turma */}
            {receitaPorTurma.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>RECEITA POR TURMA</Text>
                <View style={st.relCard}>
                  <View style={st.relTableHeader}>
                    <Text style={[st.relTableHeaderTxt, { flex: 2 }]}>Turma</Text>
                    <Text style={[st.relTableHeaderTxt, { flex: 1.5, textAlign: 'right' }]}>Arrecadado</Text>
                    <Text style={[st.relTableHeaderTxt, { flex: 1.5, textAlign: 'right' }]}>Em Cobrança</Text>
                    <Text style={[st.relTableHeaderTxt, { flex: 0.7, textAlign: 'right' }]}>Pag.</Text>
                  </View>
                  {receitaPorTurma.map((r, idx) => (
                    <View key={r.turma} style={[st.relTableRow, idx % 2 === 0 && { backgroundColor: Colors.surface }]}>
                      <Text style={[st.relTableLabel, { flex: 2 }]} numberOfLines={1}>{r.turma}</Text>
                      <Text style={[st.relTableVal, { flex: 1.5, textAlign: 'right', color: Colors.success, fontSize: 11 }]}>{formatAOA(r.val)}</Text>
                      <Text style={[st.relTableVal, { flex: 1.5, textAlign: 'right', color: r.pendente > 0 ? Colors.warning : Colors.textMuted, fontSize: 11 }]}>{r.pendente > 0 ? formatAOA(r.pendente) : '—'}</Text>
                      <Text style={[st.relTablePct, { flex: 0.7, textAlign: 'right' }]}>{r.count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Top devedores */}
            {topDevedores.length > 0 && (
              <View style={st.relSection}>
                <Text style={st.secLabel}>TOP DEVEDORES</Text>
                <View style={st.relCard}>
                  {topDevedores.map((item, idx) => {
                    const { aluno, mesesAtraso, pendente } = item;
                    const turmaA = turmas.find(t => t.id === aluno.turmaId);
                    const bloq = isAlunoBloqueado(aluno.id);
                    return (
                      <View key={aluno.id} style={[st.relTableRow, { paddingVertical: 10, alignItems: 'center' }]}>
                        <Text style={[st.relTablePct, { width: 22, color: Colors.textMuted }]}>{idx + 1}</Text>
                        <View style={[st.atrasoAvatar, { width: 30, height: 30, borderRadius: 15 }]}>
                          <Text style={[st.atrasoAvatarTxt, { fontSize: 11 }]}>{aluno.nome[0]}{aluno.apelido[0]}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={[st.relTableLabel, { fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{aluno.nome} {aluno.apelido}</Text>
                          <Text style={[st.relTablePct, { textAlign: 'left' }]}>{turmaA?.nome || '—'} · {mesesAtraso}m atraso</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={[st.relTableVal, { color: Colors.danger, fontSize: 12 }]}>{formatAOA(pendente)}</Text>
                          {bloq && <Badge label="Bloq." color={Colors.danger} />}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {totalRel === 0 && relPeriodo !== 'anual' && totalAnual === 0 && (
          <View style={st.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem dados para o período</Text>
            <Text style={st.emptySub}>Seleccione um período diferente ou verifique os pagamentos registados.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderOrcamento() {
    const itensFiltrados = orcamentos.filter(it => {
      if (orcamentoFiltro === 'definidas') return it.temOrcamento;
      if (orcamentoFiltro === 'por_definir') return !it.temOrcamento;
      return true;
    });
    const anosOpcoes = (() => {
      const atual = new Date().getFullYear();
      return [String(atual - 1), String(atual), String(atual + 1)];
    })();
    const anoPagamentoActivo = calcularAnoPagamentoAtual(anoSelecionado);
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: bottomInset + 80 }}>
        <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.info, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="information-circle" size={18} color={Colors.info} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: Colors.text, fontFamily: 'Inter_700Bold' }}>
              Orçamento Anual por Rubrica
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 19 }}>
            Defina o valor previsto a cobrar em cada rubrica para o ano. O sistema compara automaticamente com o que já foi pago e mostra a percentagem cobrada vs em falta.
          </Text>
        </View>

        {/* Selector de ano */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Ano:</Text>
          {anosOpcoes.map(a => (
            <TouchableOpacity key={a} onPress={() => setOrcamentoAno(a)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: orcamentoAno === a ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: orcamentoAno === a ? Colors.gold : Colors.border }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: orcamentoAno === a ? '#fff' : Colors.textSecondary }}>{a}</Text>
              {a === anoPagamentoActivo && (
                <View style={{ backgroundColor: orcamentoAno === a ? 'rgba(255,255,255,0.28)' : Colors.success + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: orcamentoAno === a ? '#fff' : Colors.success }}>ACTUAL</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => fetchOrcamentos()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Ionicons name="refresh" size={14} color={Colors.gold} />
            <Text style={{ fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>Actualizar</Text>
          </TouchableOpacity>
        </View>
        {orcamentoAno !== anoPagamentoActivo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warning + '14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 14 }}>
            <Ionicons name="time-outline" size={14} color={Colors.warning} />
            <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_500Medium', flex: 1 }}>
              A ver o ano {orcamentoAno} — diferente do ano de pagamento activo ({anoPagamentoActivo}). Útil para liquidar dívidas de anos anteriores.
            </Text>
          </View>
        )}

        {/* Resumo */}
        {orcamentoTotais && (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Resumo {orcamentoAno}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Previsto</Text>
                <Text style={{ fontSize: 16, color: Colors.text, fontFamily: 'Inter_700Bold' }}>{formatAOA(orcamentoTotais.previsto)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Cobrado</Text>
                <Text style={{ fontSize: 16, color: Colors.success, fontFamily: 'Inter_700Bold' }}>{formatAOA(orcamentoTotais.cobrado)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Em Falta</Text>
                <Text style={{ fontSize: 16, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{formatAOA(orcamentoTotais.emFalta)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 110 }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Execução</Text>
                <Text style={{ fontSize: 16, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{orcamentoTotais.percentagem.toFixed(1)}%</Text>
              </View>
            </View>
            <View style={{ height: 8, backgroundColor: Colors.background, borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.min(100, orcamentoTotais.percentagem)}%`, backgroundColor: orcamentoTotais.percentagem >= 80 ? Colors.success : orcamentoTotais.percentagem >= 50 ? Colors.gold : Colors.warning }} />
            </View>
            <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 6, fontFamily: 'Inter_400Regular' }}>
              {orcamentoTotais.numComOrcamento} de {orcamentoTotais.numRubricas} rubricas com orçamento definido
            </Text>
          </View>
        )}

        {/* Filtro */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[{ k: 'todas', l: 'Todas' }, { k: 'definidas', l: 'Com orçamento' }, { k: 'por_definir', l: 'Por definir' }].map(f => (
            <TouchableOpacity key={f.k} onPress={() => setOrcamentoFiltro(f.k as any)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: orcamentoFiltro === f.k ? Colors.gold + '22' : 'transparent', borderWidth: 1, borderColor: orcamentoFiltro === f.k ? Colors.gold : Colors.border }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: orcamentoFiltro === f.k ? Colors.gold : Colors.textMuted }}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {orcamentoLoading ? (
          <AppLoader size="large" color={Colors.gold} style={{ marginTop: 20 }} />
        ) : itensFiltrados.length === 0 ? (
          <View style={st.emptyState}>
            <Ionicons name="speedometer-outline" size={42} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem rubricas activas</Text>
            <Text style={st.emptySub}>Crie rubricas no separador "Rubricas" para definir orçamentos.</Text>
          </View>
        ) : (
          itensFiltrados.map(item => {
            const cor = item.percentagemCobrada >= 80 ? Colors.success : item.percentagemCobrada >= 50 ? Colors.gold : item.percentagemCobrada > 0 ? Colors.warning : Colors.textMuted;
            return (
              <View key={item.taxaId} style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: Colors.text, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{item.rubricaDescricao}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: Colors.gold + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, color: Colors.gold, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>{item.rubricaTipo}</Text>
                      </View>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{item.frequencia} · {item.nivel}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, color: cor, fontFamily: 'Inter_700Bold' }}>{item.percentagemCobrada.toFixed(1)}%</Text>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>{item.numPagos} pagamentos</Text>
                  </View>
                </View>

                {item.temOrcamento ? (
                  <>
                    <View style={{ height: 10, backgroundColor: Colors.background, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                      <View style={{ height: '100%', width: `${Math.min(100, item.percentagemCobrada)}%`, backgroundColor: cor }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <View>
                        <Text style={{ fontSize: 9, color: Colors.textMuted }}>Previsto</Text>
                        <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>{formatAOA(item.valorPrevisto)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, color: Colors.textMuted }}>Cobrado</Text>
                        <Text style={{ fontSize: 13, color: Colors.success, fontFamily: 'Inter_600SemiBold' }}>{formatAOA(item.valorCobrado)}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, color: Colors.textMuted }}>Em Falta</Text>
                        <Text style={{ fontSize: 13, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>{formatAOA(item.valorEmFalta)}</Text>
                      </View>
                    </View>
                    {item.observacoes ? (
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 6 }} numberOfLines={2}>"{item.observacoes}"</Text>
                    ) : null}
                  </>
                ) : (
                  <View style={{ backgroundColor: Colors.warning + '12', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.warning + '33' }}>
                    <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_500Medium' }}>
                      Sem orçamento definido para {orcamentoAno}. Já cobrado: {formatAOA(item.valorCobrado)}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                  {item.temOrcamento && (
                    <TouchableOpacity onPress={() => removerOrcamento(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.danger + '55' }}>
                      <Ionicons name="trash-outline" size={12} color={Colors.danger} />
                      <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>Remover</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => abrirOrcamentoEdit(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.gold }}>
                    <Ionicons name={item.temOrcamento ? 'create-outline' : 'add'} size={12} color="#fff" />
                    <Text style={{ fontSize: 11, color: '#fff', fontFamily: 'Inter_600SemiBold' }}>{item.temOrcamento ? 'Editar' : 'Definir orçamento'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  async function confirmarPagamentoRubrica(pagId: string, novoStatus: 'pago' | 'cancelado') {
    setPagRubricaSaving(pagId);
    try {
      await api.put(`/api/pagamentos/${pagId}`, { status: novoStatus });
      await fetchOrcamentos();
      alertSucesso(novoStatus === 'pago' ? 'Confirmado' : 'Cancelado',
        novoStatus === 'pago' ? 'Pagamento confirmado como pago.' : 'Pagamento cancelado.');
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível actualizar o pagamento.');
    } finally { setPagRubricaSaving(null); }
  }

  function renderPagRubrica() {
    const nomeAluno = (alunoId: string) => {
      const al = alunos.find(a => a.id === alunoId);
      return al ? `${al.nome} ${al.apelido}` : alunoId;
    };

    const rubricasFiltradas = orcamentos.filter(it => {
      const q = pagRubricaSearch.toLowerCase();
      return !q || (it.rubricaDescricao ?? '').toLowerCase().includes(q) || (it.rubricaTipo ?? '').toLowerCase().includes(q);
    });

    if (pagRubricaSelected) {
      const pagsRubrica = pagamentos
        .filter(p => p.taxaId === pagRubricaSelected.taxaId && matchAno(p.ano, orcamentoAno))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const pagsStatusFiltro = pagRubricaStatusFiltro === 'todos'
        ? pagsRubrica
        : pagsRubrica.filter(p => p.status === pagRubricaStatusFiltro);

      const pagsVisiveis = pagRubricaSearch
        ? pagsStatusFiltro.filter(p => nomeAluno(p.alunoId).toLowerCase().includes(pagRubricaSearch.toLowerCase()))
        : pagsStatusFiltro;

      const totalPago     = pagsRubrica.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
      const totalPend     = pagsRubrica.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
      const totalCancel   = pagsRubrica.filter(p => p.status === 'cancelado').reduce((s, p) => s + p.valor, 0);
      const numPagos      = pagsRubrica.filter(p => p.status === 'pago').length;
      const numPendentes  = pagsRubrica.filter(p => p.status === 'pendente').length;
      const numCancelados = pagsRubrica.filter(p => p.status === 'cancelado').length;
      const cor = pagRubricaSelected.percentagemCobrada >= 80 ? Colors.success : pagRubricaSelected.percentagemCobrada >= 50 ? Colors.gold : Colors.warning;

      return (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: bottomInset + 80 }}>
          {/* Cabeçalho com voltar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <TouchableOpacity onPress={() => { setPagRubricaSelected(null); setPagRubricaSearch(''); setPagRubricaStatusFiltro('todos'); setPagRubricaVista('lista'); }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={18} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: Colors.text, fontFamily: 'Inter_700Bold' }} numberOfLines={1}>{pagRubricaSelected.rubricaDescricao}</Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{pagRubricaSelected.rubricaTipo} · {pagRubricaSelected.frequencia} · {pagRubricaSelected.nivel}</Text>
            </View>
            <TouchableOpacity onPress={() => {
              const taxaInfo = taxas.find(t => t.id === pagRubricaSelected.taxaId);
              setFormPag({ ...defaultFormPag, taxaId: pagRubricaSelected.taxaId, rubricaBloqueada: true, alunoBloqueado: false, valor: taxaInfo?.valor != null ? String(taxaInfo.valor) : '' });
              setShowModalPag(true);
            }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ fontSize: 12, color: '#fff', fontFamily: 'Inter_700Bold' }}>Registar</Text>
            </TouchableOpacity>
          </View>

          {/* Painel de totais por status */}
          <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Resumo</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 90, backgroundColor: Colors.success + '12', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>Liquidados</Text>
                <Text style={{ fontSize: 15, color: Colors.success, fontFamily: 'Inter_700Bold', marginTop: 2 }}>{numPagos}</Text>
                <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_500Medium' }}>{formatAOA(totalPago)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 90, backgroundColor: Colors.warning + '12', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>Em Cobrança</Text>
                <Text style={{ fontSize: 15, color: Colors.warning, fontFamily: 'Inter_700Bold', marginTop: 2 }}>{numPendentes}</Text>
                <Text style={{ fontSize: 10, color: Colors.warning, fontFamily: 'Inter_500Medium' }}>{formatAOA(totalPend)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 90, backgroundColor: Colors.textMuted + '18', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>Cancelados</Text>
                <Text style={{ fontSize: 15, color: Colors.textMuted, fontFamily: 'Inter_700Bold', marginTop: 2 }}>{numCancelados}</Text>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>{formatAOA(totalCancel)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 90, backgroundColor: Colors.gold + '12', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 9, color: Colors.gold, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' }}>Execução</Text>
                <Text style={{ fontSize: 15, color: cor, fontFamily: 'Inter_700Bold', marginTop: 2 }}>{pagRubricaSelected.percentagemCobrada.toFixed(1)}%</Text>
                {pagRubricaSelected.temOrcamento && <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>de {formatAOA(pagRubricaSelected.valorPrevisto)}</Text>}
              </View>
            </View>
            {pagRubricaSelected.temOrcamento && (
              <View style={{ marginTop: 10 }}>
                <View style={{ height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.min(100, pagRubricaSelected.percentagemCobrada)}%`, backgroundColor: cor }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Previsto: {formatAOA(pagRubricaSelected.valorPrevisto)}</Text>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Cobrado: {formatAOA(pagRubricaSelected.valorCobrado)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Toggle Lista / Caderneta */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 3, marginBottom: 12 }}>
            {([
              { k: 'lista',     l: 'Lista',     icon: 'list-outline'     },
              { k: 'caderneta', l: 'Caderneta', icon: 'calendar-outline' },
            ] as const).map(v => (
              <TouchableOpacity key={v.k} onPress={() => setPagRubricaVista(v.k)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                  paddingVertical: 8, borderRadius: 8,
                  backgroundColor: pagRubricaVista === v.k ? Colors.gold : 'transparent' }}>
                <Ionicons name={v.icon} size={14} color={pagRubricaVista === v.k ? '#fff' : Colors.textMuted} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: pagRubricaVista === v.k ? '#fff' : Colors.textMuted }}>{v.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pesquisa — partilhada entre as duas vistas */}
          <View style={{ backgroundColor: Colors.surface, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}>
            <Ionicons name="search" size={14} color={Colors.textMuted} />
            <TextInput
              value={pagRubricaSearch} onChangeText={setPagRubricaSearch}
              placeholder="Pesquisar aluno…" placeholderTextColor={Colors.textMuted}
              style={{ flex: 1, marginLeft: 8, fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular' }}
            />
            {pagRubricaSearch ? <TouchableOpacity onPress={() => setPagRubricaSearch('')}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity> : null}
          </View>

          {pagRubricaVista === 'caderneta' ? (() => {
            // ─── VISTA CADERNETA ───────────────────────────────────────
            const MESES_CADER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Jan–Out (10 meses letivos Angola)
            const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            const anoRef = orcamentoAno;

            // Alunos com pagamentos desta rubrica
            const idsComPags = [...new Set(pagsRubrica.map(p => p.alunoId))];
            // Alunos do mesmo nível ainda sem pagamentos
            const turmasNivel = turmas.filter(t =>
              pagRubricaSelected.nivel && pagRubricaSelected.nivel !== 'Todos'
                ? (t as any).nivel === pagRubricaSelected.nivel
                : true
            );
            const turmaIdsNivel = new Set(turmasNivel.map(t => t.id));
            const idsNivel = alunos
              .filter(a => (a as any).ativo !== false && a.turmaId && turmaIdsNivel.has(a.turmaId))
              .map(a => a.id);
            const todosIds = [...new Set([...idsComPags, ...idsNivel])];

            const getMesStatus = (alunoId: string, mes: number): 'pago' | 'pendente' | 'cancelado' | 'falta' => {
              const pp = pagsRubrica.filter(p => p.alunoId === alunoId && Number(p.mes) === mes);
              if (pp.some(x => x.status === 'pago'))      return 'pago';
              if (pp.some(x => x.status === 'pendente'))  return 'pendente';
              if (pp.some(x => x.status === 'cancelado')) return 'cancelado';
              return 'falta';
            };

            const alunosCad = todosIds
              .map(id => {
                const nome = nomeAluno(id);
                const pagos    = MESES_CADER.filter(m => getMesStatus(id, m) === 'pago').length;
                const pendentes= MESES_CADER.filter(m => getMesStatus(id, m) === 'pendente').length;
                const falta    = MESES_CADER.filter(m => getMesStatus(id, m) === 'falta').length;
                // Pagamentos sem mês definido (mes null/0) — ficam invisíveis na grelha
                const semMes   = pagsRubrica.filter(p => p.alunoId === id && !p.mes && p.status !== 'cancelado');
                return { id, nome, pagos, pendentes, falta, semMes };
              })
              .filter(a => !pagRubricaSearch || a.nome.toLowerCase().includes(pagRubricaSearch.toLowerCase()))
              .sort((a, b) => a.nome.localeCompare(b.nome));

            if (alunosCad.length === 0) return (
              <View style={st.emptyState}>
                <Ionicons name="people-outline" size={42} color={Colors.textMuted} />
                <Text style={st.emptyTitle}>Sem alunos encontrados</Text>
                <Text style={st.emptySub}>Não há alunos com movimentos nesta rubrica para o ano {anoRef}.</Text>
              </View>
            );

            return (
              <>
                {/* Legenda */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  {([
                    { cor: Colors.success, l: 'Liquidado' },
                    { cor: Colors.warning, l: 'Em Cobrança' },
                    { cor: Colors.danger,  l: 'Vencido' },
                    { cor: Colors.textMuted + '66', l: 'Cancelado' },
                  ]).map(leg => (
                    <View key={leg.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: leg.cor }} />
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{leg.l}</Text>
                    </View>
                  ))}
                </View>

                {alunosCad.map(al => (
                  <View key={al.id} style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
                    {/* Nome + contadores */}
                    {(() => {
                      const saldoAluno = getSaldoAluno(al.id);
                      const temSaldo = saldoAluno && saldoAluno.saldo > 0;
                      return (
                        <View style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ flex: 1, fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{al.nome}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                              {al.pagos > 0    && <View style={{ backgroundColor: Colors.success + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' }}>{al.pagos}✓</Text></View>}
                              {al.pendentes > 0 && <View style={{ backgroundColor: Colors.warning + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_700Bold' }}>{al.pendentes}⏳</Text></View>}
                              {al.falta > 0    && <View style={{ backgroundColor: Colors.danger  + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: Colors.danger,  fontFamily: 'Inter_700Bold' }}>{al.falta}✗</Text></View>}
                            </View>
                          </View>
                          {temSaldo && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
                                           backgroundColor: Colors.success + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                                           alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.success + '44' }}>
                              <Ionicons name="wallet-outline" size={10} color={Colors.success} />
                              <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' }}>
                                Saldo: {formatAOA(saldoAluno!.saldo)}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    {/* Grelha de meses */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {MESES_CADER.map(mes => {
                        const st2 = getMesStatus(al.id, mes);
                        const bgCor = st2 === 'pago'      ? Colors.success
                                    : st2 === 'pendente'  ? Colors.warning
                                    : st2 === 'cancelado' ? Colors.textMuted + '55'
                                    : Colors.danger + '22';
                        const txtCor = st2 === 'pago'      ? '#fff'
                                     : st2 === 'pendente'  ? '#fff'
                                     : st2 === 'cancelado' ? Colors.textMuted
                                     : Colors.danger;
                        // pago, pendente e cancelado bloqueiam novo registo — só 'falta' é clicável
                        const isMesFeito = st2 === 'pago' || st2 === 'pendente' || st2 === 'cancelado';
                        return (
                          <TouchableOpacity
                            key={mes}
                            disabled={isMesFeito}
                            activeOpacity={isMesFeito ? 1 : 0.7}
                            onPress={() => {
                              const taxaInfo = taxas.find(t => t.id === pagRubricaSelected.taxaId);
                              const valorBase = Number(taxaInfo?.valor || 0);
                              const hoje = new Date();
                              const anoNum = Number(anoRef);
                              const mesesAtraso = Math.max(0, (hoje.getFullYear() - anoNum) * 12 + (hoje.getMonth() + 1 - mes));
                              const isento = getIsencaoAluno(al.id);
                              const multa = (multaConfig.ativo && !isento && mesesAtraso > 0 && pagRubricaSelected.rubricaTipo === 'propina')
                                ? calcularMulta(valorBase, mesesAtraso)
                                : 0;
                              const fd = {
                                ...defaultFormPag,
                                taxaId: pagRubricaSelected.taxaId,
                                alunoId: al.id,
                                mes: String(mes),
                                mesBloqueado: true,
                                rubricaBloqueada: true,
                                alunoBloqueado: true,
                                ano: anoRef,
                                valor: taxaInfo?.valor != null ? String(taxaInfo.valor) : '',
                              };
                              // Validação de ordem contabilística: há meses anteriores em falta?
                              const idxMes = MESES_CADER.indexOf(mes);
                              const mesesAntEmFalta = MESES_CADER.filter(
                                m => MESES_CADER.indexOf(m) < idxMes && getMesStatus(al.id, m) === 'falta'
                              );
                              if (mesesAntEmFalta.length > 0) {
                                setConfirmOrdemMes({ alunoId: al.id, mes, mesesEmFalta: mesesAntEmFalta, multa, formData: fd });
                              } else {
                                setMultaEstimadaCaderneta(multa);
                                setFormPag(fd as any);
                                setShowModalPag(true);
                              }
                            }}
                            style={{ alignItems: 'center', width: 46, paddingVertical: 6, borderRadius: 8,
                              backgroundColor: bgCor,
                              borderWidth: st2 === 'falta' ? 1 : 0,
                              borderColor: Colors.danger + '55',
                              opacity: (st2 === 'cancelado' || st2 === 'pendente') ? 0.65 : 1 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: txtCor }}>{MESES_ABREV[mes - 1]}</Text>
                            {st2 === 'pago'     && <Ionicons name="checkmark" size={10} color="#fff" />}
                            {st2 === 'pendente' && <Ionicons name="time-outline" size={10} color="#fff" />}
                            {st2 === 'falta'    && <Ionicons name="add" size={10} color={Colors.danger} />}
                            {st2 === 'cancelado'&& <Ionicons name="close" size={10} color={Colors.textMuted} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Progresso bar */}
                    <View style={{ marginTop: 10 }}>
                      <View style={{ height: 4, backgroundColor: Colors.background, borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.round((al.pagos / MESES_CADER.length) * 100)}%`, backgroundColor: Colors.success }} />
                      </View>
                      <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 3 }}>
                        {al.pagos}/{MESES_CADER.length} meses pagos · {Math.round((al.pagos / MESES_CADER.length) * 100)}% · Apenas meses vencidos (vermelho) são clicáveis
                      </Text>
                    </View>

                    {/* Indicador de carência da multa */}
                    {(() => {
                      if (!multaConfig.ativo || al.falta === 0 || pagRubricaSelected.rubricaTipo !== 'propina') return null;
                      const hoje = new Date();
                      const diaInicio = multaConfig.diaInicioMulta || 10;
                      if (hoje.getDate() >= diaInicio) return null;
                      const diasRestantes = diaInicio - hoje.getDate();
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
                          backgroundColor: Colors.warning + '14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
                          borderWidth: 1, borderColor: Colors.warning + '33' }}>
                          <Ionicons name="timer-outline" size={13} color={Colors.warning} />
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.warning }}>
                            Multa inicia em {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'} · dia {diaInicio} do mês
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Banner de pagamentos sem mês definido */}
                    {al.semMes.length > 0 && (
                      <SemMesBanner
                        pagamentos={al.semMes}
                        mesesStatus={MESES_CADER.reduce((acc, m) => {
                          const st = getMesStatus(al.id, m);
                          acc[m] = st === 'cancelado' ? 'falta' : st;
                          return acc;
                        }, {} as Record<number, 'pago' | 'pendente' | 'falta'>)}
                        onAssociar={async (pagId, mes, comoSaldo) => {
                          try {
                            if (comoSaldo) {
                              // Mês já ocupado → transfere o valor para saldo a favor do aluno
                              await transferirPagamento(pagId, 'saldo', user?.email || user?.nome);
                            } else {
                              await updatePagamento(pagId, { mes } as any);
                            }
                          } catch { webAlert('Erro', 'Não foi possível processar. Tente novamente.'); }
                        }}
                      />
                    )}
                  </View>
                ))}
              </>
            );
          })() : (
            // ─── VISTA LISTA ───────────────────────────────────────────
            <>
              {/* Filtro por status */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {([
                  { k: 'todos',    l: 'Todos',      n: pagsRubrica.length },
                  { k: 'pendente', l: 'Em Cobrança',  n: numPendentes, cor: Colors.warning },
                  { k: 'pago',     l: 'Liquidados',      n: numPagos,     cor: Colors.success },
                  { k: 'cancelado',l: 'Cancelados', n: numCancelados,cor: Colors.textMuted },
                ] as const).map(f => (
                  <TouchableOpacity key={f.k} onPress={() => setPagRubricaStatusFiltro(f.k)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: pagRubricaStatusFiltro === f.k ? (f.cor ?? Colors.gold) + '22' : 'transparent',
                      borderWidth: 1, borderColor: pagRubricaStatusFiltro === f.k ? (f.cor ?? Colors.gold) : Colors.border }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: pagRubricaStatusFiltro === f.k ? (f.cor ?? Colors.gold) : Colors.textMuted }}>{f.l}</Text>
                    <View style={{ backgroundColor: pagRubricaStatusFiltro === f.k ? (f.cor ?? Colors.gold) : Colors.border, borderRadius: 99, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: 9, color: '#fff', fontFamily: 'Inter_700Bold' }}>{f.n}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Lista de pagamentos */}
              {pagsVisiveis.length === 0 ? (
                <View style={st.emptyState}>
                  <Ionicons name="receipt-outline" size={42} color={Colors.textMuted} />
                  <Text style={st.emptyTitle}>Sem pagamentos{pagRubricaStatusFiltro !== 'todos' ? ` ${pagRubricaStatusFiltro}s` : ''}</Text>
                  <Text style={st.emptySub}>Carregue em "Registar" para adicionar o primeiro pagamento desta rubrica.</Text>
                </View>
              ) : (
                pagsVisiveis.map(p => {
                  const nomeAl    = nomeAluno(p.alunoId);
                  const corStatus = p.status === 'pago' ? Colors.success : p.status === 'pendente' ? Colors.warning : Colors.textMuted;
                  const labelStatus = p.status === 'pago' ? 'Liquidado' : p.status === 'pendente' ? 'Em Cobrança' : 'Cancelado';
                  const mesLabel    = p.mes ? ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][p.mes - 1] : null;
                  const isSaving    = pagRubricaSaving === p.id;
                  return (
                    <View key={p.id} style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: p.status === 'pago' ? Colors.success + '33' : p.status === 'cancelado' ? Colors.border : Colors.warning + '33' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{nomeAl}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            <View style={{ backgroundColor: corStatus + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, color: corStatus, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>{labelStatus}</Text>
                            </View>
                            {mesLabel && <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{mesLabel} · {p.ano}</Text>}
                            <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{p.metodoPagamento}</Text>
                            {p.referencia ? <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Ref: {p.referencia}</Text> : null}
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 15, color: corStatus, fontFamily: 'Inter_700Bold' }}>{formatAOA(p.valor)}</Text>
                          <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                            {new Date(p.createdAt).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </Text>
                        </View>
                      </View>

                      {p.observacao ? <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 6, fontStyle: 'italic' }} numberOfLines={2}>{p.observacao}</Text> : null}

                      {p.criadoPor ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Ionicons name="person-circle-outline" size={12} color={Colors.textMuted} />
                          <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Registado por: {p.criadoPor}</Text>
                        </View>
                      ) : null}

                  {/* Acções de controlo de estado */}
                  {p.status === 'pendente' && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                      <TouchableOpacity
                        disabled={isSaving}
                        onPress={() => confirmarPagamentoRubrica(p.id, 'pago')}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          backgroundColor: Colors.success, borderRadius: 8, paddingVertical: 7 }}>
                        {isSaving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />}
                        <Text style={{ fontSize: 11, color: '#fff', fontFamily: 'Inter_700Bold' }}>Confirmar Liquidação</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={isSaving}
                        onPress={() => confirmarPagamentoRubrica(p.id, 'cancelado')}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Colors.danger + '66',
                          flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                        <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {p.status === 'pago' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                      <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_500Medium' }}>Pagamento confirmado</Text>
                    </View>
                  )}
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      );
    }

    // ── Vista de lista de rubricas ──────────────────────────────
    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: bottomInset + 80 }}>
        {/* Instrução */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.gold, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5, elevation: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="layers-outline" size={18} color={Colors.gold} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: Colors.text, fontFamily: 'Inter_700Bold' }}>Pagamentos por Rubrica</Text>
          </View>
          <Text style={{ fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 19 }}>
            Seleccione uma rubrica para ver todos os seus pagamentos e registar novos directamente. Use a pesquisa para filtrar por nome.
          </Text>
        </View>

        {/* Selector de ano */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Ano:</Text>
          {[String(new Date().getFullYear() - 1), String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].map(a => (
            <TouchableOpacity key={a} onPress={() => setOrcamentoAno(a)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: orcamentoAno === a ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: orcamentoAno === a ? Colors.gold : Colors.border }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: orcamentoAno === a ? '#fff' : Colors.textSecondary }}>{a}</Text>
              {a === calcularAnoPagamentoAtual(anoSelecionado) && (
                <View style={{ backgroundColor: orcamentoAno === a ? 'rgba(255,255,255,0.28)' : Colors.success + '22', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: orcamentoAno === a ? '#fff' : Colors.success }}>ACTUAL</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => fetchOrcamentos()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Ionicons name="refresh" size={14} color={Colors.gold} />
            <Text style={{ fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>Actualizar</Text>
          </TouchableOpacity>
        </View>
        {orcamentoAno !== calcularAnoPagamentoAtual(anoSelecionado) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warning + '14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 14 }}>
            <Ionicons name="time-outline" size={14} color={Colors.warning} />
            <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_500Medium', flex: 1 }}>
              A ver o ano {orcamentoAno} — diferente do ano de pagamento activo ({calcularAnoPagamentoAtual(anoSelecionado)}). Útil para liquidar dívidas de anos anteriores.
            </Text>
          </View>
        )}

        {/* Pesquisa */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
          <Ionicons name="search" size={14} color={Colors.textMuted} />
          <TextInput
            value={pagRubricaSearch} onChangeText={setPagRubricaSearch}
            placeholder="Pesquisar rubrica…" placeholderTextColor={Colors.textMuted}
            style={{ flex: 1, marginLeft: 8, fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular' }}
          />
          {pagRubricaSearch ? <TouchableOpacity onPress={() => setPagRubricaSearch('')}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity> : null}
        </View>

        {orcamentoLoading ? (
          <AppLoader size="large" color={Colors.gold} style={{ marginTop: 20 }} />
        ) : rubricasFiltradas.length === 0 ? (
          <View style={st.emptyState}>
            <Ionicons name="layers-outline" size={42} color={Colors.textMuted} />
            <Text style={st.emptyTitle}>Sem rubricas activas</Text>
            <Text style={st.emptySub}>Crie rubricas no separador "Rubricas" para começar.</Text>
          </View>
        ) : (
          rubricasFiltradas.map(item => {
            // Transacções desta rubrica no ano seleccionado
            const pagsRubrica   = pagamentos.filter(p => p.taxaId === item.taxaId);
            const pagosRecs     = pagsRubrica.filter(p => p.status === 'pago');
            const pendentesRecs = pagsRubrica.filter(p => p.status === 'pendente');

            // Alunos distintos (não nº de recibos)
            const alunosPagosIds   = new Set(pagosRecs.map(p => p.alunoId).filter(Boolean));
            const alunosPendIds    = new Set(pendentesRecs.map(p => p.alunoId).filter(Boolean));
            const numAlunosPagos   = alunosPagosIds.size;
            const numAlunosPend    = alunosPendIds.size;
            const numRecibos       = pagosRecs.length;

            // Total efectivamente cobrado (soma dos valores)
            const totalCobradoReal = pagosRecs.reduce((s, p) => s + (Number(p.valor) || 0), 0);

            // Alunos activos no nível desta rubrica
            const nivelRubrica = item.nivel;
            const alunosNivel  = (nivelRubrica && nivelRubrica !== 'Todos' && nivelRubrica !== 'Geral')
              ? alunos.filter(a => { const t = turmas.find(tt => tt.id === a.turmaId); return t?.nivel === nivelRubrica; })
              : alunos;
            const totalAlunos = alunosNivel.length;

            // Percentagem: usa orçamento se definido, caso contrário usa % de alunos distintos que pagaram
            const percOrcamento = item.temOrcamento ? item.percentagemCobrada : null;
            const percAlunos    = totalAlunos > 0 ? Math.round((numAlunosPagos / totalAlunos) * 100) : 0;
            const percExibir    = percOrcamento ?? percAlunos;
            const cor = percExibir >= 80 ? Colors.success : percExibir >= 50 ? Colors.gold : percExibir > 0 ? Colors.warning : Colors.textMuted;

            return (
              <TouchableOpacity key={item.taxaId} onPress={() => { setPagRubricaSelected(item); setPagRubricaSearch(''); setPagRubricaStatusFiltro('todos'); }}
                style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="pricetag-outline" size={22} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: Colors.text, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{item.rubricaDescricao}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <View style={{ backgroundColor: Colors.gold + '22', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, color: Colors.gold, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>{item.rubricaTipo}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{item.frequencia} · {item.nivel}</Text>
                    {numAlunosPagos > 0 && (
                      <View style={{ backgroundColor: Colors.success + '22', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_700Bold' }}>
                          {numAlunosPagos}{totalAlunos > 0 ? `/${totalAlunos}` : ''} {numAlunosPagos === 1 ? 'aluno' : 'alunos'}
                          {numRecibos > numAlunosPagos ? ` · ${numRecibos} recibos` : ''}
                        </Text>
                      </View>
                    )}
                    {numAlunosPend > 0 && (
                      <View style={{ backgroundColor: Colors.warning + '22', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_700Bold' }}>{numAlunosPend} pend.</Text>
                      </View>
                    )}
                    {pagsRubrica.length === 0 && <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Sem movimentos</Text>}
                  </View>
                  {/* Barra de progresso — sempre visível */}
                  <View style={{ height: 5, backgroundColor: Colors.background, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${Math.min(100, percExibir)}%`, backgroundColor: percExibir > 0 ? cor : 'transparent' }} />
                  </View>
                  {/* Legenda da barra */}
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 3 }}>
                    {item.temOrcamento
                      ? `${percExibir.toFixed(1)}% do orçamento cobrado`
                      : totalAlunos > 0
                        ? `% de adesão de alunos${numAlunosPagos === 0 ? ' (sem movimentos)' : ''}`
                        : 'Sem movimentos'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', minWidth: 72 }}>
                  <Text style={{ fontSize: 16, color: percExibir > 0 ? cor : Colors.textMuted, fontFamily: 'Inter_700Bold' }}>{percExibir.toFixed(0)}%</Text>
                  <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_500Medium', marginTop: 2 }}>
                    {totalCobradoReal > 0 ? formatAOA(totalCobradoReal) : item.temOrcamento ? formatAOA(item.valorCobrado) : '—'}
                  </Text>
                  <Text style={{ fontSize: 8, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 1 }}>cobrado</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    );
  }

  function renderPorAluno() {
    if (alunoPerfilId) {
      const alunoSel  = alunos.find(a => a.id === alunoPerfilId);
      const turmaSel  = alunoSel ? turmas.find(t => t.id === alunoSel.turmaId) : null;
      const allPagsAluno = pagamentos.filter(p => p.alunoId === alunoPerfilId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const pagsAluno = perfilAnoFilter === 'todos'
        ? allPagsAluno
        : allPagsAluno.filter(p => matchAno(p.ano, perfilAnoFilter));
      const pagsAlunoCurr = allPagsAluno.filter(p => matchAno(p.ano, anoAtual));
      const totPago   = pagsAlunoCurr.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
      const totPend   = pagsAlunoCurr.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
      const anosDisponiveis = Array.from(new Set(allPagsAluno.map(p => p.ano))).sort((a, b) => b.localeCompare(a));
      const mesesAtras = getMesesEmAtraso(alunoPerfilId, anoAtual);
      const taxaPropina = taxasAtivas.find(t => t.tipo === 'propina');
      const isencaoPerfil = getIsencaoAluno(alunoPerfilId);
      const multaInfo = getMultaAluno(alunoPerfilId, taxaPropina?.valor || 0, mesesAtras);
      const multaTotal = multaInfo.valor;
      const isento = multaInfo.isento;
      const bloqueado = isAlunoBloqueado(alunoPerfilId);
      const rupesAluno = getRUPEsAluno(alunoPerfilId);
      const msgsAluno  = getMensagensAluno(alunoPerfilId);

      return (
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={st.backBtn} onPress={() => setAlunoPerfilId(null)}>
            <Ionicons name="arrow-back" size={18} color={Colors.gold} />
            <Text style={st.backTxt}>Voltar à lista</Text>
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}>
            <View style={st.alunoPerfilCard}>
              <View style={st.alunoAvatar}>
                <Text style={st.alunoAvatarTxt}>{alunoSel?.nome[0]}{alunoSel?.apelido[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.alunoNome}>{alunoSel?.nome} {alunoSel?.apelido}</Text>
                <Text style={st.alunoMat}>{alunoSel?.numeroMatricula}</Text>
                <Text style={st.alunoTurma}>{turmaSel?.classe}ª Classe · {turmaSel?.nome}</Text>
              </View>
              {bloqueado && <Badge label="Bloqueado" color={Colors.danger} />}
            </View>

            {bloqueado && (
              <View style={[st.alertaBanner, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '44' }]}>
                <Ionicons name="lock-closed" size={16} color={Colors.danger} />
                <Text style={[st.alertaBannerTxt, { color: Colors.danger }]}>Acesso ao sistema bloqueado por falta de pagamento</Text>
              </View>
            )}

            {mesesAtras > 0 && (
              <View style={[st.alertaBanner, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '44' }]}>
                <Ionicons name="time" size={16} color={Colors.warning} />
                <Text style={[st.alertaBannerTxt, { color: Colors.warning }]}>{mesesAtras} mês(es) de propina em atraso{multaConfig.ativo && multaTotal > 0 && !isento ? ` · Multa: ${formatAOA(multaTotal)}` : isento ? ' · Multa: ISENTA' : ''}</Text>
              </View>
            )}

            {/* Indicador de carência — multa ainda não iniciou */}
            {(() => {
              if (!multaConfig.ativo || isento || mesesAtras === 0) return null;
              const hoje = new Date();
              const diaInicio = multaConfig.diaInicioMulta || 10;
              if (hoje.getDate() >= diaInicio) return null;
              const diasRestantes = diaInicio - hoje.getDate();
              return (
                <View style={[st.alertaBanner, { backgroundColor: Colors.warning + '12', borderColor: Colors.warning + '33', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <Ionicons name="timer-outline" size={16} color={Colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.alertaBannerTxt, { color: Colors.warning, fontFamily: 'Inter_700Bold' }]}>
                      Multa ainda não iniciou — período de carência
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      A multa começa no dia {diaInicio} · faltam {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {multaConfig.ativo && mesesAtras > 0 && (() => {
              if (isento) {
                return (
                  <View style={[st.alertaBanner, { backgroundColor: Colors.success + '18', borderLeftColor: Colors.success, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
                    <Text style={[st.alertaBannerTxt, { color: Colors.success }]}>Multa dispensada por decisão da Direcção</Text>
                  </View>
                );
              }
              if (isencaoPerfil?.status === 'pendente') {
                if (user?.role === 'director') {
                  return (
                    <View style={[st.alertaBanner, { backgroundColor: Colors.warning + '18', borderLeftColor: Colors.warning, borderLeftWidth: 4 }]}>
                      <Text style={[st.alertaBannerTxt, { color: Colors.warning, marginBottom: 6 }]}>Isenção de multa pendente — {isencaoPerfil.justificativa}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '55' }]}
                          onPress={() => handleResponderIsencao(isencaoPerfil.id, 'aprovado')}>
                          <Ionicons name="checkmark" size={13} color={Colors.success} />
                          <Text style={[st.atrasoActionTxt, { color: Colors.success }]}>Aprovar Isenção</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.atrasoActionBtn, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger + '55' }]}
                          onPress={() => handleResponderIsencao(isencaoPerfil.id, 'rejeitado')}>
                          <Ionicons name="close" size={13} color={Colors.danger} />
                          <Text style={[st.atrasoActionTxt, { color: Colors.danger }]}>Rejeitar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }
                return (
                  <View style={[st.alertaBanner, { backgroundColor: Colors.warning + '18', borderLeftColor: Colors.warning, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="hourglass" size={16} color={Colors.warning} />
                    <Text style={[st.alertaBannerTxt, { color: Colors.warning }]}>Pedido de isenção de multa aguarda aprovação do Director</Text>
                  </View>
                );
              }
              if (user?.role === 'financeiro' || user?.role === 'director') {
                return (
                  <TouchableOpacity style={[st.alertaBanner, { backgroundColor: Colors.primary + '12', borderLeftColor: Colors.primary, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                    onPress={() => { setIsencaoAlunoId(alunoPerfilId); setIsencaoJustif(''); setShowIsencaoModal(true); }}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                    <Text style={[st.alertaBannerTxt, { color: Colors.primary }]}>Solicitar isenção de multa para este aluno</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                );
              }
              return null;
            })()}

            <View style={st.kpiRow}>
              <View style={st.kpiCard}>
                <Text style={[st.kpiVal, { color: Colors.success, fontSize: 16 }]}>{formatAOA(totPago)}</Text>
                <Text style={st.kpiLbl}>Liquidado</Text>
              </View>
              <View style={st.kpiCard}>
                <Text style={[st.kpiVal, { color: Colors.warning, fontSize: 16 }]}>{formatAOA(totPend)}</Text>
                <Text style={st.kpiLbl}>Em Cobrança</Text>
              </View>
              <View style={st.kpiCard}>
                <Text style={[st.kpiVal, { color: Colors.info, fontSize: 16 }]}>{pagsAluno.length}</Text>
                <Text style={st.kpiLbl}>Transacções</Text>
              </View>
            </View>

            <View style={st.perfilActionsRow}>
              <TouchableOpacity style={st.perfilActionBtn} onPress={() => { setMsgAlunoId(alunoPerfilId); setMsgTexto(''); setShowMsgModal(true); }}>
                <Ionicons name="chatbubble" size={15} color={Colors.info} />
                <Text style={[st.perfilActionTxt, { color: Colors.info }]}>Mensagem</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.perfilActionBtn} onPress={() => { setRupeAlunoId(alunoPerfilId); setRupeTaxaId(''); setRupeValor(''); setRupeGerado(null); setShowRUPEModal(true); }}>
                <Ionicons name="receipt" size={15} color={Colors.gold} />
                <Text style={[st.perfilActionTxt, { color: Colors.gold }]}>Gerar RUPE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.perfilActionBtn} onPress={() => handleBloquear(alunoPerfilId, bloqueado)}>
                <Ionicons name={bloqueado ? 'lock-open' : 'lock-closed'} size={15} color={bloqueado ? Colors.success : Colors.danger} />
                <Text style={[st.perfilActionTxt, { color: bloqueado ? Colors.success : Colors.danger }]}>{bloqueado ? 'Desbloquear' : 'Bloquear'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.perfilActionBtn} onPress={() => router.push({ pathname: '/boletim-propina', params: { alunoId: alunoPerfilId } } as any)}>
                <Ionicons name="document-text" size={15} color={Colors.success} />
                <Text style={[st.perfilActionTxt, { color: Colors.success }]}>Caderneta</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.perfilActionBtn, { borderColor: Colors.success + '55', backgroundColor: Colors.success + '11' }]}
                onPress={() => { setSaldoAlunoId(alunoPerfilId); setSaldoValor(''); setSaldoDataCobranca(''); setSaldoDescricao(''); setSaldoObs(''); setShowSaldoMovimentos(false); setShowSaldoModal(true); }}>
                <Ionicons name="wallet" size={15} color={Colors.success} />
                <Text style={[st.perfilActionTxt, { color: Colors.success }]}>Saldo</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={[st.perfilActionBtn, { borderColor: Colors.info + '55', backgroundColor: Colors.info + '11' }]}
                  onPress={() => openPdfInTab(`/api/pdf/recibos-aluno/${alunoPerfilId}`)}>
                  <Ionicons name="receipt-outline" size={15} color={Colors.info} />
                  <Text style={[st.perfilActionTxt, { color: Colors.info }]}>Recibos PDF</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[st.perfilActionBtn, { borderColor: Colors.textMuted + '55', backgroundColor: Colors.textMuted + '11' }]}
                onPress={() => router.push(`/extrato-propinas?alunoId=${alunoPerfilId}` as any)}>
                <Ionicons name="document-text-outline" size={15} color={Colors.textMuted} />
                <Text style={[st.perfilActionTxt, { color: Colors.textMuted }]}>Extrato</Text>
              </TouchableOpacity>
              {podeRegistarObito && (
                <TouchableOpacity style={[st.perfilActionBtn, { borderColor: '#6B21A844', backgroundColor: '#6B21A811' }]}
                  onPress={() => { setObituarioAlunoId(alunoPerfilId); setObituarioData(''); setObituarioObs(''); setShowObituarioModal(true); }}>
                  <Ionicons name="ribbon" size={15} color="#6B21A8" />
                  <Text style={[st.perfilActionTxt, { color: '#6B21A8' }]}>Registar Óbito</Text>
                </TouchableOpacity>
              )}
            </View>

            {(() => {
              const saldoInfo = getSaldoAluno(alunoPerfilId);
              if (!saldoInfo || saldoInfo.saldo <= 0) return null;
              const movs = getMovimentosAluno(alunoPerfilId).slice(0, 3);
              return (
                <View style={st.saldoCard}>
                  <View style={st.saldoCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="wallet" size={18} color={Colors.success} />
                      <Text style={st.saldoCardTitle}>Saldo em Conta</Text>
                    </View>
                    <Text style={st.saldoValor}>{formatAOA(saldoInfo.saldo)}</Text>
                  </View>
                  {saldoInfo.dataProximaCobranca ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Ionicons name="calendar" size={13} color={Colors.info} />
                      <Text style={st.saldoDataTxt}>Próxima cobrança: <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.info }}>{saldoInfo.dataProximaCobranca}</Text></Text>
                    </View>
                  ) : null}
                  {saldoInfo.observacoes ? (
                    <Text style={[st.saldoDataTxt, { marginTop: 4, color: Colors.textMuted }]}>{saldoInfo.observacoes}</Text>
                  ) : null}
                  {movs.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[st.secLabel, { marginBottom: 6, marginTop: 0 }]}>ÚLTIMOS MOVIMENTOS</Text>
                      {movs.map(m => (
                        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }}>
                          <Ionicons name={m.tipo === 'credito' ? 'arrow-up-circle' : 'arrow-down-circle'} size={15} color={m.tipo === 'credito' ? Colors.success : Colors.danger} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.text }}>{m.descricao}</Text>
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{new Date(m.createdAt).toLocaleDateString('pt-PT')}</Text>
                          </View>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: m.tipo === 'credito' ? Colors.success : Colors.danger }}>
                            {m.tipo === 'credito' ? '+' : '-'}{formatAOA(m.valor)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* ── Cartão de Pagamento de Propinas ────────────────────────────── */}
            {propinaHabilitada && taxaPropina && (() => {
              const MESES_LETIVOS = [
                { num: 9, nome: 'Set' }, { num: 10, nome: 'Out' }, { num: 11, nome: 'Nov' },
                { num: 12, nome: 'Dez' }, { num: 1, nome: 'Jan' }, { num: 2, nome: 'Fev' },
                { num: 3, nome: 'Mar' }, { num: 4, nome: 'Abr' }, { num: 5, nome: 'Mai' },
                { num: 6, nome: 'Jun' }, { num: 7, nome: 'Jul' },
              ];
              const anoBase = parseInt(anoAtual.split('/')[0]) || new Date().getFullYear();
              const mesAtualNum = new Date().getMonth() + 1;
              const anoAtualNum = new Date().getFullYear();
              const pagsAlunoCorrentes = allPagsAluno;
              return (
                <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="card-outline" size={15} color={Colors.gold} />
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>Cartão de Propinas {anoAtual}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>{formatAOA(taxaPropina.valor)}/mês</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {MESES_LETIVOS.map(({ num, nome }) => {
                      const anoMes = num >= 8 ? anoBase : anoBase + 1;
                      const anoStr = String(anoMes);
                      const pag = pagsAlunoCorrentes.find(p =>
                        p.mes === num && matchAno(p.ano, anoStr) && p.status !== 'cancelado' &&
                        (taxas.find(t => t.id === p.taxaId)?.tipo === 'propina')
                      );
                      const isFuturo = new Date(anoMes, num - 1, 1) > new Date(anoAtualNum, mesAtualNum - 1, 1);
                      const isAtual  = num === mesAtualNum && anoMes === anoAtualNum;
                      let cor = Colors.border, txtCor = Colors.textMuted, label = '—';
                      if (pag?.status === 'pago')     { cor = Colors.success + '55'; txtCor = Colors.success; label = '✓'; }
                      else if (pag?.status === 'pendente') { cor = Colors.warning + '55'; txtCor = Colors.warning; label = '⏳'; }
                      else if (isFuturo)               { cor = Colors.border; txtCor = Colors.textMuted; label = '·'; }
                      else                             { cor = Colors.danger + '44'; txtCor = Colors.danger; label = '!'; }
                      return (
                        <View key={num} style={{ alignItems: 'center', width: 46, borderRadius: 8, padding: 6, borderWidth: isAtual ? 2 : 1, borderColor: isAtual ? Colors.gold : cor, backgroundColor: cor + '55' }}>
                          <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: txtCor }}>{nome}</Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: txtCor, marginTop: 2 }}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Liquidado', cor: Colors.success, icon: '✓' },
                      { label: 'Em Cobrança', cor: Colors.warning, icon: '⏳' },
                      { label: 'Em atraso', cor: Colors.danger, icon: '!' },
                      { label: 'Futuro', cor: Colors.textMuted, icon: '·' },
                    ].map(l => (
                      <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11, color: l.cor, fontFamily: 'Inter_700Bold' }}>{l.icon}</Text>
                        <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* ── Bolsas e Descontos ─────────────────────────────────────────── */}
            {(() => {
              const bolsasActivas = perfilBolsas.filter(b => b.ativo);
              const bolsasTodas = perfilBolsas;
              if (perfilBolsasLoading) return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}>
                  <AppLoader color={Colors.gold} size="small" />
                  <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>A carregar bolsas...</Text>
                </View>
              );
              if (bolsasTodas.length === 0) return null;
              const BOLSA_TIPOS: Record<string, { label: string; color: string }> = {
                social:      { label: 'Bolsa Social',        color: '#EF5350' },
                merito:      { label: 'Bolsa de Mérito',     color: '#FFC107' },
                desportivo:  { label: 'Bolsa Desportiva',    color: '#4CAF50' },
                funcionario: { label: 'Filho de Funcionário',color: '#2196F3' },
                parcial:     { label: 'Desconto Parcial',    color: '#9C27B0' },
                outro:       { label: 'Outro',               color: '#78909C' },
              };
              return (
                <View style={{ marginBottom: 12 }}>
                  <Text style={st.secLabel}>BOLSAS E DESCONTOS</Text>
                  {bolsasTodas.map(b => {
                    const cfg = BOLSA_TIPOS[b.tipo] ?? BOLSA_TIPOS.outro;
                    return (
                      <View key={b.id} style={[st.pagCard, { borderLeftWidth: 2, borderLeftColor: b.ativo ? cfg.color : Colors.textMuted, opacity: b.ativo ? 1 : 0.6 }]}>
                        <View style={[st.pagIcon, { backgroundColor: cfg.color + '22' }]}>
                          <Ionicons name="pricetag" size={15} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.pagTaxa}>{cfg.label}</Text>
                          {b.descricao ? <Text style={st.pagMetaTxt}>{b.descricao}</Text> : null}
                          {b.dataInicio ? <Text style={st.pagMetaTxt}>De: {new Date(b.dataInicio).toLocaleDateString('pt-PT')}{b.dataFim ? ` até ${new Date(b.dataFim).toLocaleDateString('pt-PT')}` : ''}</Text> : null}
                          {b.aprovadoPor ? <Text style={st.pagRef}>Aprovado por: {b.aprovadoPor}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: cfg.color }}>
                            {b.percentagem === 100 ? 'Isento' : `${b.percentagem}%`}
                          </Text>
                          <View style={{ backgroundColor: (b.ativo ? cfg.color : Colors.textMuted) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: (b.ativo ? cfg.color : Colors.textMuted) + '55' }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: b.ativo ? cfg.color : Colors.textMuted }}>{b.ativo ? 'Activa' : 'Inactiva'}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {bolsasActivas.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.success + '11', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.success + '44', marginTop: 4 }}>
                      <Ionicons name="shield-checkmark" size={15} color={Colors.success} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.success }}>
                        Desconto activo: {bolsasActivas.map(b => `${b.percentagem}%`).join(' + ')} sobre as propinas
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {rupesAluno.length > 0 && (
              <>
                <Text style={st.secLabel}>RUPES GERADOS</Text>
                {rupesAluno.map(r => {
                  const isExpired = new Date(r.dataValidade) < new Date();
                  const rupeStatusEfetivo = r.status === 'pago' ? 'pago' : isExpired ? 'expirado' : 'ativo';
                  const RUPE_SC: Record<string, { label: string; color: string }> = {
                    ativo:    { label: 'Em Cobrança', color: Colors.warning },
                    pago:     { label: 'Liquidado', color: Colors.success },
                    expirado: { label: 'Expirado', color: Colors.danger  },
                  };
                  const sc = RUPE_SC[rupeStatusEfetivo];
                  return (
                  <View key={r.id} style={[st.pagCard, { borderLeftWidth: 2, borderLeftColor: sc.color }]}>
                    <View style={[st.pagIcon, { backgroundColor: sc.color + '22' }]}>
                      <Ionicons name="receipt" size={16} color={sc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.pagTaxa}>{getNomeTaxa(r.taxaId)}</Text>
                      <Text style={[st.pagRef, { fontSize: 11 }]}>Ref: {r.referencia}</Text>
                      <Text style={st.pagMetaTxt}>Válido até: {new Date(r.dataValidade).toLocaleDateString('pt-PT')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[st.pagValor, { color: sc.color }]}>{formatAOA(r.valor)}</Text>
                      <View style={{ backgroundColor: sc.color + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: sc.color + '55' }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: sc.color }}>{sc.label}</Text>
                      </View>
                    </View>
                  </View>
                  );
                })}
              </>
            )}

            {/* ── Filtro de ano para histórico ─────────────────────────────── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={st.secLabel}>HISTÓRICO FINANCEIRO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}>
                {(['todos', ...anosDisponiveis.length > 0 ? anosDisponiveis : [anoAtual]] as string[]).map(ano => (
                  <TouchableOpacity key={ano} onPress={() => setPerfilAnoFilter(ano)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: perfilAnoFilter === ano ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: perfilAnoFilter === ano ? Colors.gold : Colors.border }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: perfilAnoFilter === ano ? '#000' : Colors.textMuted }}>{ano === 'todos' ? 'Todos' : ano}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {pagsAluno.length === 0 ? (
              <View style={st.empty}>
                <Ionicons name="receipt-outline" size={40} color={Colors.textMuted} />
                <Text style={st.emptyTitle}>Sem movimentos</Text>
              </View>
            ) : (
              pagsAluno.map(p => {
                const sc   = STATUS_CFG[p.status];
                const tipo = getTipoTaxa(p.taxaId);
                return (
                  <View key={p.id} style={[st.pagCard, { borderLeftWidth: 3, borderLeftColor: sc.color }]}>
                    <View style={[st.pagIcon, { backgroundColor: tipoCor(tipo) + '22' }]}>
                      <Ionicons name={tipoIcon(tipo) as any} size={16} color={tipoCor(tipo)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.pagTaxa}>{getNomeTaxa(p.taxaId)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <Text style={st.pagMetaTxt}>{new Date(p.data).toLocaleDateString('pt-PT')}</Text>
                        <Text style={st.pagMetaTxt}>·</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: (METODO_COLOR_MAP[p.metodoPagamento] || Colors.textMuted) + '18', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: (METODO_COLOR_MAP[p.metodoPagamento] || Colors.textMuted) + '40' }}>
                          <Ionicons name={(METODO_ICON_MAP[p.metodoPagamento] || 'cash-outline') as any} size={9} color={METODO_COLOR_MAP[p.metodoPagamento] || Colors.textMuted} />
                          <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: METODO_COLOR_MAP[p.metodoPagamento] || Colors.textMuted }}>{metodoLabel(p.metodoPagamento)}</Text>
                        </View>
                      </View>
                      {p.referencia && <Text style={st.pagRef}>Ref: {p.referencia}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={st.pagValor}>{formatAOA(p.valor)}</Text>
                      <Badge label={sc.label} color={sc.color} />
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {Platform.OS === 'web' && (
                          <TouchableOpacity
                            style={[st.confirmarBtn, { backgroundColor: Colors.info + 'cc' }]}
                            onPress={() => openPdfInTab(`/api/pdf/recibo/${p.id}`)}
                          >
                            <Ionicons name="document-text" size={11} color="#fff" />
                            <Text style={st.confirmarTxt}>PDF</Text>
                          </TouchableOpacity>
                        )}
                        {p.status === 'pendente' && (
                          <TouchableOpacity style={st.confirmarBtn} onPress={() => updatePagamento(p.id, { status: 'pago' })}>
                            <Ionicons name="checkmark" size={11} color="#fff" />
                            <Text style={st.confirmarTxt}>Confirmar</Text>
                          </TouchableOpacity>
                        )}
                        {(p.status === 'pago' || p.status === 'pendente') && (
                          <TouchableOpacity
                            style={[st.confirmarBtn, { backgroundColor: Colors.info + '99' }]}
                            onPress={() => { setTransferPagId(p.id); setTransferDestino('saldo'); setShowTransferModal(true); }}
                          >
                            <Ionicons name="swap-horizontal" size={11} color="#fff" />
                            <Text style={st.confirmarTxt}>Transferir</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {msgsAluno.length > 0 && (
              <>
                <Text style={st.secLabel}>MENSAGENS ENVIADAS</Text>
                {msgsAluno.slice(0, 5).map(m => (
                  <View key={m.id} style={[st.msgCard, { marginBottom: 8 }]}>
                    <View style={[st.msgIconBox, { backgroundColor: Colors.info + '22' }]}>
                      <Ionicons name="chatbubble" size={14} color={Colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.msgTexto}>{m.texto}</Text>
                      <Text style={st.msgData}>{new Date(m.data).toLocaleDateString('pt-PT')}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      );
    }

    // ── Estatísticas para o painel de resumo ──────────────────────────────────
    const totalAlunos    = alunosFiltrados.length;
    const totalBolsa     = alunosFiltrados.filter(a => (todasBolsasMap[a.id] || []).some(b => b.ativo)).length;
    const totalAtraso       = alunosFiltrados.filter(a => getMesesEmAtraso(a.id, anoAtual) > 0).length;
    const totalBloq         = alunosFiltrados.filter(a => isAlunoBloqueado(a.id)).length;
    // Repetente = aluno que reprovou MAIS DE UMA VEZ (> 1 reconfirmação)
    const totalRepetente    = alunosFiltrados.filter(a => (reconfirmacoesMap[a.id] || 0) > 1).length;
    const totalCadeiras     = alunosFiltrados.filter(a => (cadeirasAtrasosMap[a.id]?.count || 0) > 0).length;

    return (
      <View style={{ flex: 1 }}>
        <View style={st.filterBlock}>
          <View style={st.searchRow}>
            <StableSearchInput
              value={searchAluno}
              onChangeText={setSearchAluno}
              inputStyle={st.searchInput}
              placeholder="Pesquisar aluno..."
              iconColor={Colors.textMuted}
            />
          </View>
        </View>

        {/* ── Painel de diagnóstico rápido ── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 6, flexWrap: 'wrap' }}>
          {[
            { icon: 'people',        label: 'Total',        val: totalAlunos,    color: Colors.textSecondary },
            { icon: 'pricetag',      label: 'Bolsas',       val: totalBolsa,     color: Colors.gold },
            { icon: 'refresh-circle',label: 'Repetentes',   val: totalRepetente, color: Colors.info },
            { icon: 'book-outline',  label: 'C. Atraso',    val: totalCadeiras,  color: '#a855f7' },
            { icon: 'warning',       label: 'Prop. Atraso', val: totalAtraso,    color: Colors.warning },
            { icon: 'lock-closed',   label: 'Bloqueados',   val: totalBloq,      color: Colors.danger },
          ].map(item => (
            <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: item.color + '44' }}>
              <Ionicons name={item.icon as any} size={13} color={item.color} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: item.color }}>{item.val}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>{item.label}</Text>
            </View>
          ))}
        </View>

        <FlatList
          data={alunosFiltrados}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={st.empty}>
              <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
              <Text style={st.emptyTitle}>Nenhum aluno encontrado</Text>
            </View>
          }
          renderItem={({ item: a, index }) => {
            const pagsA   = pagamentos.filter(p => p.alunoId === a.id && matchAno(p.ano, anoAtual));
            const pago    = pagsA.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
            const pend    = pagsA.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
            const turmaA  = turmas.find(t => t.id === a.turmaId);
            const mAtras  = getMesesEmAtraso(a.id, anoAtual);
            const bloq    = isAlunoBloqueado(a.id);
            const bolsasA    = (todasBolsasMap[a.id] || []).filter(b => b.ativo);
            const temBolsa   = bolsasA.length > 0;
            const isentoTotal = bolsasA.some(b => b.percentagem === 100);
            const descTotal  = bolsasA.reduce((s, b) => s + b.percentagem, 0);
            const nRepet     = reconfirmacoesMap[a.id] || 0;
            // Repetente = reprovou MAIS DE UMA VEZ
            const isRepetente = nRepet > 1;
            const cadeiras   = cadeirasAtrasosMap[a.id];
            const temCadeiras = (cadeiras?.count || 0) > 0;
            const borderColor = bloq ? Colors.danger : temBolsa ? Colors.gold : isRepetente ? Colors.info + 'BB' : temCadeiras ? '#a855f7BB' : Colors.border;
            return (
              <TouchableOpacity
                style={[st.alunoCard, { borderLeftWidth: 3, borderLeftColor: borderColor }]}
                onPress={() => setAlunoPerfilId(a.id)}
              >
                <View style={st.alunoNumBox}>
                  <Text style={st.alunoNum}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={[
                  st.alunoAvatarSmall,
                  temBolsa && { borderWidth: 1.5, borderColor: Colors.gold },
                  isRepetente && !temBolsa && { borderWidth: 1.5, borderColor: Colors.info },
                  temCadeiras && !temBolsa && !isRepetente && { borderWidth: 1.5, borderColor: '#a855f7' },
                ]}>
                  <Text style={st.alunoAvatarSmallTxt}>{a.nome[0]}{a.apelido[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <Text style={st.alunoNome} numberOfLines={1}>{a.nome} {a.apelido}</Text>
                    {temBolsa && (
                      <View style={{ backgroundColor: Colors.gold + '25', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: Colors.gold + '55', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="pricetag" size={9} color={Colors.gold} />
                        <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.gold }}>
                          {isentoTotal ? 'ISENTO' : `${Math.min(descTotal, 100)}% desc.`}
                        </Text>
                      </View>
                    )}
                    {isRepetente && (
                      <View style={{ backgroundColor: Colors.info + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: Colors.info + '55', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="refresh-circle" size={9} color={Colors.info} />
                        <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.info }}>
                          {`REPETENTE ×${nRepet}`}
                        </Text>
                      </View>
                    )}
                    {temCadeiras && (
                      <View style={{ backgroundColor: '#a855f720', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#a855f755', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="book" size={9} color="#a855f7" />
                        <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: '#a855f7' }}>
                          {cadeiras!.count === 1 ? '1 CAD. ATRASO' : `${cadeiras!.count} CAD. ATRASO`}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={st.alunoMat} numberOfLines={1}>
                    {a.numeroMatricula} · {turmaA?.nome || '—'}
                    {temCadeiras ? ` · ${cadeiras!.disciplinas.slice(0, 2).join(', ')}${cadeiras!.disciplinas.length > 2 ? '…' : ''}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {pago > 0 && <Text style={[st.alunoVal, { color: Colors.success }]}>{formatAOA(pago)}</Text>}
                  {pend > 0 && <Text style={[st.alunoVal, { color: Colors.warning }]}>+{formatAOA(pend)} pend.</Text>}
                  {mAtras > 0 && <Text style={[st.alunoVal, { color: Colors.danger, fontSize: 9 }]}>{mAtras} mês(es) atraso</Text>}
                  {bloq && <Badge label="Bloq." color={Colors.danger} />}
                  {pago === 0 && pend === 0 && !mAtras && !bloq && <Text style={st.alunoVal}>—</Text>}
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  function renderConfigFiscal() {
    if (cfgFiscalLoading || !cfgFiscalEdit) {
      return (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
          <Text style={{ color: Colors.textMuted, marginTop: 12, fontFamily: 'Inter_500Medium', textAlign: 'center' }}>A carregar configuração...</Text>
        </View>
      );
    }

    const updateIrt = (idx: number, field: keyof IrtEscalao, raw: string) => {
      if (!cfgFiscalEdit) return;
      const tbl = cfgFiscalEdit.irtTabela.map((e, i) => {
        if (i !== idx) return e;
        if (field === 'max') return { ...e, max: raw === '' ? null : Number(raw) };
        return { ...e, [field]: Number(raw) };
      });
      setCfgEdit({ ...cfgFiscalEdit, irtTabela: tbl });
    };

    const removeIrt = (idx: number) => {
      if (!cfgFiscalEdit) return;
      setCfgEdit({ ...cfgFiscalEdit, irtTabela: cfgFiscalEdit.irtTabela.filter((_, i) => i !== idx) });
    };

    const addIrt = () => {
      if (!cfgFiscalEdit) return;
      const tbl = cfgFiscalEdit.irtTabela;
      const last = tbl[tbl.length - 1];
      const newEscalao: IrtEscalao = {
        limiteAnterior: last ? (last.max ?? 0) : 0,
        max: null,
        taxa: 0,
        baseFixa: 0,
      };
      setCfgEdit({ ...cfgFiscalEdit, irtTabela: [...tbl, newEscalao] });
    };

    const saveConfigFiscal = async () => {
      if (!cfgFiscalEdit) return;
      setCfgSaving(true);
      try {
        await api.put('/api/config-fiscal', cfgFiscalEdit);
        setCfgFiscal(JSON.parse(JSON.stringify(cfgFiscalEdit)));
        alertSucesso('Guardado', 'Configuração fiscal actualizada com sucesso.');
      } catch {
        alertErro('Erro', 'Não foi possível guardar a configuração fiscal.');
      } finally {
        setCfgSaving(false);
      }
    };

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={[st.sectionTitle, { marginBottom: 4 }]}>Configuração Fiscal</Text>
        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 20 }}>
          Actualiza as taxas de INSS e a tabela de IRT de acordo com a legislação angolana em vigor.
        </Text>

        {/* INSS */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 }}>INSS</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.fieldLabel}>Taxa Empregado (%)</Text>
              <TextInput
                style={st.input}
                keyboardType="decimal-pad"
                value={String(cfgFiscalEdit.inssEmpPerc)}
                onChangeText={v => setCfgEdit({ ...cfgFiscalEdit, inssEmpPerc: Number(v) || 0 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.fieldLabel}>Taxa Patronal (%)</Text>
              <TextInput
                style={st.input}
                keyboardType="decimal-pad"
                value={String(cfgFiscalEdit.inssPatrPerc)}
                onChangeText={v => setCfgEdit({ ...cfgFiscalEdit, inssPatrPerc: Number(v) || 0 })}
              />
            </View>
          </View>
        </View>

        {/* IRT */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Tabela IRT (Escalões)</Text>
            <TouchableOpacity onPress={addIrt} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="add-circle" size={18} color={Colors.gold} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>Adicionar</Text>
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
            <Text style={[st.relTableHeaderTxt, { flex: 1.2 }]}>Lim. Inf. (Kz)</Text>
            <Text style={[st.relTableHeaderTxt, { flex: 1.2 }]}>Lim. Sup. (Kz)</Text>
            <Text style={[st.relTableHeaderTxt, { flex: 0.9 }]}>Taxa (%)</Text>
            <Text style={[st.relTableHeaderTxt, { flex: 1.2 }]}>Base Fixa (Kz)</Text>
            <View style={{ width: 28 }} />
          </View>

          {cfgFiscalEdit.irtTabela.map((e, idx) => (
            <View key={idx} style={{ flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <TextInput
                style={[st.input, { flex: 1.2, marginBottom: 0, fontSize: 12 }]}
                keyboardType="decimal-pad"
                value={String(e.limiteAnterior)}
                onChangeText={v => updateIrt(idx, 'limiteAnterior', v)}
              />
              <TextInput
                style={[st.input, { flex: 1.2, marginBottom: 0, fontSize: 12 }]}
                keyboardType="decimal-pad"
                placeholder="∞"
                value={e.max !== null ? String(e.max) : ''}
                onChangeText={v => updateIrt(idx, 'max', v)}
              />
              <TextInput
                style={[st.input, { flex: 0.9, marginBottom: 0, fontSize: 12 }]}
                keyboardType="decimal-pad"
                value={String(e.taxa)}
                onChangeText={v => updateIrt(idx, 'taxa', v)}
              />
              <TextInput
                style={[st.input, { flex: 1.2, marginBottom: 0, fontSize: 12 }]}
                keyboardType="decimal-pad"
                value={String(e.baseFixa)}
                onChangeText={v => updateIrt(idx, 'baseFixa', v)}
              />
              <TouchableOpacity onPress={() => removeIrt(idx)} style={{ width: 28, alignItems: 'center' }}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={saveConfigFiscal}
          disabled={cfgFiscalSaving}
          style={{ backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
        >
          {cfgFiscalSaving
            ? <AppLoader size="small" color="#fff" />
            : <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Guardar Alterações</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Render: Plano de Contas ───────────────────────────────
  function renderPlanoContas() {
    const TIPO_COLORS: Record<string, string> = { receita: Colors.success, despesa: Colors.danger, ativo: Colors.info, passivo: Colors.warning };
    const maes = planoContas.filter(c => !c.parentId);
    const filhos = (parentId: string) => planoContas.filter(c => c.parentId === parentId);
    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner} refreshControl={<RefreshControl refreshing={planoContasLoading} onRefresh={loadPlanoContas} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Plano de Contas</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Estrutura hierárquica mãe/filho para relatórios</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditPlano(null); setFormPlano(defaultFormPlano); setShowPlanoModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Nova Conta</Text>
          </TouchableOpacity>
        </View>

        {planoContasLoading && !planoContas.length ? <AppLoader color={Colors.gold} style={{ marginTop: 40 }} /> : null}

        {maes.length === 0 && !planoContasLoading && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="git-branch-outline" size={40} color={Colors.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 12 }}>Nenhuma conta criada</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 4 }}>Crie contas mãe e sub-contas para organizar receitas e despesas.</Text>
          </View>
        )}

        {maes.map(mae => (
          <View key={mae.id} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
            {/* Conta Mãe */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: (TIPO_COLORS[mae.tipo] ?? Colors.info) + '18' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TIPO_COLORS[mae.tipo] ?? Colors.info }} />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>[{mae.codigo}] {mae.nome}</Text>
              <View style={{ backgroundColor: (TIPO_COLORS[mae.tipo] ?? Colors.info) + '33', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: TIPO_COLORS[mae.tipo] ?? Colors.info, textTransform: 'capitalize' }}>{mae.tipo}</Text>
              </View>
              <TouchableOpacity onPress={() => { setEditPlano(mae); setFormPlano({ codigo: mae.codigo, nome: mae.nome, tipo: mae.tipo, parentId: mae.parentId ?? '', descricao: mae.descricao ?? '' }); setShowPlanoModal(true); }} style={{ padding: 4 }}>
                <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deletePlano(mae.id)} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              </TouchableOpacity>
            </View>
            {/* Sub-contas */}
            {filhos(mae.id).map((filho, idx) => (
              <View key={filho.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: Colors.border + '55' }}>
                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', width: 16 }}>└</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TIPO_COLORS[filho.tipo] ?? Colors.info }} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>[{filho.codigo}] {filho.nome}</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' }}>{filho.tipo}</Text>
                <TouchableOpacity onPress={() => { setEditPlano(filho); setFormPlano({ codigo: filho.codigo, nome: filho.nome, tipo: filho.tipo, parentId: filho.parentId ?? '', descricao: filho.descricao ?? '' }); setShowPlanoModal(true); }} style={{ padding: 4 }}>
                  <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePlano(filho.id)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            {/* Adicionar sub-conta */}
            <TouchableOpacity onPress={() => { setEditPlano(null); setFormPlano({ ...defaultFormPlano, parentId: mae.id }); setShowPlanoModal(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: Colors.border + '55' }}>
              <Ionicons name="add-circle-outline" size={15} color={Colors.gold} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold }}>Adicionar sub-conta</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Modal Plano */}
        <Modal visible={showPlanoModal} transparent animationType="slide" onRequestClose={() => setShowPlanoModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={st.modalOverlay}>
            <View style={[st.modalBox, { maxHeight: '80%' }]}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>{editPlano ? 'Editar Conta' : 'Nova Conta'}</Text>
                <TouchableOpacity onPress={() => setShowPlanoModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                <Text style={st.inputLabel}>Código<RequiredMark /></Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Ex: 1.1.1" value={formPlano.codigo} onChangeText={v => setFormPlano(f => ({ ...f, codigo: v }))} returnKeyType="next" blurOnSubmit={false} />
                <Text style={st.inputLabel}>Nome<RequiredMark /></Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Nome da conta" value={formPlano.nome} onChangeText={v => setFormPlano(f => ({ ...f, nome: v }))} returnKeyType="done" onSubmitEditing={savePlano} />
                <Text style={st.inputLabel}>Tipo<RequiredMark /></Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {['receita','despesa','ativo','passivo'].map(t => (
                    <TouchableOpacity key={t} onPress={() => setFormPlano(f => ({ ...f, tipo: t }))}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: formPlano.tipo === t ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formPlano.tipo === t ? Colors.gold : Colors.border }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: formPlano.tipo === t ? '#fff' : Colors.textSecondary, textTransform: 'capitalize' }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.inputLabel}>Conta Mãe (opcional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  <TouchableOpacity onPress={() => setFormPlano(f => ({ ...f, parentId: '' }))}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: !formPlano.parentId ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: !formPlano.parentId ? Colors.gold : Colors.border }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: !formPlano.parentId ? '#fff' : Colors.textMuted }}>Nenhuma (conta raiz)</Text>
                  </TouchableOpacity>
                  {planoContas.filter(c => !c.parentId).map(c => (
                    <TouchableOpacity key={c.id} onPress={() => setFormPlano(f => ({ ...f, parentId: c.id }))}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: formPlano.parentId === c.id ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formPlano.parentId === c.id ? Colors.gold : Colors.border }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: formPlano.parentId === c.id ? '#fff' : Colors.textMuted }}>[{c.codigo}] {c.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.inputLabel}>Descrição</Text>
                <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted} multiline placeholder="Descrição opcional" value={formPlano.descricao} onChangeText={v => setFormPlano(f => ({ ...f, descricao: v }))} />
                <TouchableOpacity onPress={savePlano} disabled={savingPlano} style={st.saveBtn}>
                  {savingPlano ? <AppLoader size="small" color="#fff" /> : <Text style={st.saveBtnTxt}>Guardar</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  // ─── Render: Contas a Pagar ────────────────────────────────
  function renderContasPagar() {
    const STATUS_CP = {
      pendente:  { color: Colors.warning,    label: 'Em Cobrança',   icon: 'time-outline' },
      pago:      { color: Colors.success,    label: 'Liquidado',       icon: 'checkmark-circle' },
      cancelado: { color: Colors.textMuted,  label: 'Cancelado',  icon: 'close-circle-outline' },
      em_atraso: { color: Colors.danger,     label: 'Vencido',    icon: 'alert-circle' },
    } as const;
    const hoje = new Date().toISOString().split('T')[0];
    const contasExibidas = contasPagar.map(c => ({
      ...c,
      status: c.status === 'pendente' && c.dataVencimento < hoje ? 'em_atraso' : c.status,
    }));
    const totalPendente = contasExibidas.filter(c => c.status !== 'pago' && c.status !== 'cancelado').reduce((a, c) => a + (c.valor ?? 0), 0);
    const totalPago = contasExibidas.filter(c => c.status === 'pago').reduce((a, c) => a + (c.valor ?? 0), 0);

    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner} refreshControl={<RefreshControl refreshing={contasPagarLoading} onRefresh={loadContasPagar} />}>
        {/* Sumário */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1, backgroundColor: Colors.danger + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.danger + '44' }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger }}>A Pagar</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.danger, marginTop: 4 }}>{formatAOA(totalPendente)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: Colors.success + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.success + '44' }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success }}>Liquidado este período</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success, marginTop: 4 }}>{formatAOA(totalPago)}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Despesas da Escola</Text>
          <TouchableOpacity onPress={() => { setEditConta(null); setFormConta(defaultFormConta); setShowContaModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Nova Despesa</Text>
          </TouchableOpacity>
        </View>

        {contasPagarLoading && !contasExibidas.length ? <AppLoader color={Colors.gold} style={{ marginTop: 40 }} /> : null}
        {!contasPagarLoading && contasExibidas.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="receipt-outline" size={40} color={Colors.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 12 }}>Nenhuma despesa registada</Text>
          </View>
        )}

        {contasExibidas.map(conta => {
          const cfg = STATUS_CP[conta.status as keyof typeof STATUS_CP] ?? STATUS_CP.pendente;
          return (
            <View key={conta.id} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{conta.descricao}</Text>
                  {conta.fornecedor ? <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 }}>{conta.fornecedor}</Text> : null}
                  {conta.planoContaNome ? <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>{conta.planoContaCodigo} — {conta.planoContaNome}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                    <View>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Valor</Text>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{formatAOA(conta.valor)}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Vencimento</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: conta.status === 'em_atraso' ? Colors.danger : Colors.text }}>{conta.dataVencimento}</Text>
                    </View>
                    {conta.dataPagamento && <View>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Liquidado em</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>{conta.dataPagamento}</Text>
                    </View>}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ backgroundColor: cfg.color + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: cfg.color }}>{cfg.label}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {conta.status !== 'pago' && conta.status !== 'cancelado' && (
                      <TouchableOpacity onPress={() => marcarContaPaga(conta)} style={{ backgroundColor: Colors.success + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="checkmark" size={13} color={Colors.success} />
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>Marcar Liquidado</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { setEditConta(conta); setFormConta({ descricao: conta.descricao, fornecedor: conta.fornecedor ?? '', valor: String(conta.valor), dataVencimento: conta.dataVencimento, dataPagamento: conta.dataPagamento ?? '', status: conta.status, metodoPagamento: conta.metodoPagamento ?? 'dinheiro', planoContaId: conta.planoContaId ?? '', referencia: conta.referencia ?? '', observacao: conta.observacao ?? '' }); setShowContaModal(true); }} style={{ padding: 4 }}>
                      <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteConta(conta.id)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {/* Modal Conta a Pagar */}
        <Modal visible={showContaModal} transparent animationType="slide" onRequestClose={() => setShowContaModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={st.modalOverlay}>
            <View style={[st.modalBox, { maxHeight: '90%' }]}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>{editConta ? 'Editar Despesa' : 'Nova Despesa'}</Text>
                <TouchableOpacity onPress={() => setShowContaModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                <Text style={st.inputLabel}>Descrição<RequiredMark /></Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Ex: Pagamento de electricidade" value={formConta.descricao} onChangeText={v => setFormConta(f => ({ ...f, descricao: v }))} returnKeyType="next" blurOnSubmit={false} />
                <Text style={st.inputLabel}>Fornecedor</Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Nome do fornecedor" value={formConta.fornecedor} onChangeText={v => setFormConta(f => ({ ...f, fornecedor: v }))} returnKeyType="next" blurOnSubmit={false} />
                <Text style={st.inputLabel}>Valor (Kz)<RequiredMark /></Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="0.00" keyboardType="decimal-pad" value={formConta.valor} onChangeText={v => setFormConta(f => ({ ...f, valor: v }))} returnKeyType="next" blurOnSubmit={false} />
                <Text style={st.inputLabel}>Data de Vencimento<RequiredMark /></Text>
                <DateInput style={st.input} value={formConta.dataVencimento} onChangeText={v => setFormConta(f => ({ ...f, dataVencimento: v }))} />
                <Text style={st.inputLabel}>Data de Pagamento</Text>
                <DateInput style={st.input} value={formConta.dataPagamento} onChangeText={v => setFormConta(f => ({ ...f, dataPagamento: v }))} placeholder="DD-MM-AAAA (vazio = não pago)" />
                <Text style={st.inputLabel}>Estado</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {[{ k: 'pendente', l: 'Em Cobrança' }, { k: 'pago', l: 'Liquidado' }, { k: 'cancelado', l: 'Cancelado' }].map(s => (
                    <TouchableOpacity key={s.k} onPress={() => setFormConta(f => ({ ...f, status: s.k }))}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: formConta.status === s.k ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formConta.status === s.k ? Colors.gold : Colors.border }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: formConta.status === s.k ? '#fff' : Colors.textSecondary }}>{s.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.inputLabel}>Método de Pagamento</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {[{ k: 'dinheiro', l: 'Dinheiro' }, { k: 'transferencia', l: 'Transferência' }, { k: 'multicaixa', l: 'Multicaixa' }].map(m => (
                    <TouchableOpacity key={m.k} onPress={() => setFormConta(f => ({ ...f, metodoPagamento: m.k }))}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: formConta.metodoPagamento === m.k ? Colors.info : Colors.surface, borderWidth: 1, borderColor: formConta.metodoPagamento === m.k ? Colors.info : Colors.border }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: formConta.metodoPagamento === m.k ? '#fff' : Colors.textSecondary }}>{m.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {planoContas.length > 0 && (
                  <>
                    <Text style={st.inputLabel}>Conta do Plano (opcional)</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      <TouchableOpacity onPress={() => setFormConta(f => ({ ...f, planoContaId: '' }))}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: !formConta.planoContaId ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: !formConta.planoContaId ? Colors.gold : Colors.border }}>
                        <Text style={{ fontSize: 11, color: !formConta.planoContaId ? '#fff' : Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Nenhuma</Text>
                      </TouchableOpacity>
                      {planoContas.map(c => (
                        <TouchableOpacity key={c.id} onPress={() => setFormConta(f => ({ ...f, planoContaId: c.id }))}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: formConta.planoContaId === c.id ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formConta.planoContaId === c.id ? Colors.gold : Colors.border }}>
                          <Text style={{ fontSize: 11, color: formConta.planoContaId === c.id ? '#fff' : Colors.textMuted, fontFamily: 'Inter_500Medium' }}>[{c.codigo}] {c.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <Text style={st.inputLabel}>Referência</Text>
                <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Número de referência" value={formConta.referencia} onChangeText={v => setFormConta(f => ({ ...f, referencia: v }))} returnKeyType="done" onSubmitEditing={saveConta} />
                <Text style={st.inputLabel}>Observação</Text>
                <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted} multiline value={formConta.observacao} onChangeText={v => setFormConta(f => ({ ...f, observacao: v }))} />
                <TouchableOpacity onPress={saveConta} disabled={savingConta} style={st.saveBtn}>
                  {savingConta ? <AppLoader size="small" color="#fff" /> : <Text style={st.saveBtnTxt}>Guardar</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  // ─── Render: Relatórios Financeiros ───────────────────────
  function renderRelatoriosFinanceiros() {
    const TIPO_LABEL_FIN: Record<string, string> = { propina: 'Propina', matricula: 'Matrícula', material: 'Material', exame: 'Exame', multa: 'Multa', outro: 'Outro' };
    const TIPO_COLOR_FIN: Record<string, string> = { propina: Colors.info, matricula: Colors.gold, material: Colors.success, exame: Colors.warning, multa: Colors.danger, outro: Colors.textMuted };

    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner}>
        {/* Sub-tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              ['comparativo', 'analytics-outline', 'Comparativo'],
              ['inadimplencia', 'warning-outline', 'Inadimplência'],
              ['entradas_saidas', 'swap-vertical-outline', 'Entradas/Saídas'],
            ] as const).map(([k, icon, label]) => (
              <TouchableOpacity key={k} onPress={() => setRelFinTab(k as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: relFinTab === k ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: relFinTab === k ? Colors.gold : Colors.border }}>
                <Ionicons name={icon as any} size={14} color={relFinTab === k ? '#fff' : Colors.textMuted} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: relFinTab === k ? '#fff' : Colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Filtro de Ano */}
        {relFinTab !== 'entradas_saidas' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Ano:</Text>
            <TextInput style={[st.input, { flex: 1, marginBottom: 0, height: 36 }]} placeholderTextColor={Colors.textMuted} value={relFinAno} onChangeText={setRelFinAno} keyboardType="number-pad" placeholder="2026" />
            <TouchableOpacity onPress={() => relFinTab === 'comparativo' ? loadRelFinComparativo() : loadRelFinInadimplencia()}
              style={{ backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Gerar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Comparativo ── */}
        {relFinTab === 'comparativo' && (
          <View>
            {relFinLoading && <AppLoader color={Colors.gold} style={{ marginTop: 40 }} />}
            {!relFinLoading && !relFinComparativo && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="analytics-outline" size={40} color={Colors.textMuted} />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 12 }}>Seleccione o ano e clique em Gerar</Text>
              </View>
            )}
            {relFinComparativo && (
              <>
                <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 }}>Previsto vs. Recebido — {relFinComparativo.ano}</Text>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <Text style={{ flex: 1.5, fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase' }}>Categoria</Text>
                    <Text style={{ flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>Previsto</Text>
                    <Text style={{ flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>Recebido</Text>
                    <Text style={{ flex: 0.7, fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>%</Text>
                  </View>
                  {(relFinComparativo.resultado as any[]).filter(r => r.previsto > 0 || r.recebido > 0).map((row: any) => (
                    <View key={row.tipo} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' }}>
                      <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TIPO_COLOR_FIN[row.tipo] ?? Colors.textMuted }} />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>{TIPO_LABEL_FIN[row.tipo] ?? row.tipo}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'right' }}>{formatAOA(row.previsto)}</Text>
                      <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold', color: row.recebido >= row.previsto ? Colors.success : Colors.warning, textAlign: 'right' }}>{formatAOA(row.recebido)}</Text>
                      <Text style={{ flex: 0.7, fontSize: 11, fontFamily: 'Inter_700Bold', color: row.percentual >= 100 ? Colors.success : row.percentual >= 50 ? Colors.warning : Colors.danger, textAlign: 'right' }}>{row.percentual}%</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 8, paddingTop: 10 }}>
                    <Text style={{ flex: 1.5, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text }}>TOTAL</Text>
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, textAlign: 'right' }}>{formatAOA((relFinComparativo.resultado as any[]).reduce((a: number, r: any) => a + r.previsto, 0))}</Text>
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, textAlign: 'right' }}>{formatAOA((relFinComparativo.resultado as any[]).reduce((a: number, r: any) => a + r.recebido, 0))}</Text>
                    <View style={{ flex: 0.7 }} />
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Inadimplência ── */}
        {relFinTab === 'inadimplencia' && (
          <View>
            {relFinLoading && <AppLoader color={Colors.gold} style={{ marginTop: 40 }} />}
            {!relFinLoading && !relFinInadimplencia && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="warning-outline" size={40} color={Colors.textMuted} />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 12 }}>Seleccione o ano e clique em Gerar</Text>
              </View>
            )}
            {relFinInadimplencia && (
              <>
                {/* Resumo */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: Colors.danger + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.danger + '44', alignItems: 'center' }}>
                    <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{relFinInadimplencia.percentual}%</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger, textAlign: 'center', marginTop: 2 }}>Taxa de Inadimplência</Text>
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border }}>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Inadimplentes</Text>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>{relFinInadimplencia.totalInadimplentes} / {relFinInadimplencia.totalAlunos}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border }}>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Total em Dívida</Text>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{formatAOA(relFinInadimplencia.totalDivida)}</Text>
                    </View>
                  </View>
                </View>

                {/* Lista */}
                {(relFinInadimplencia.alunos as any[]).map((a: any) => (
                  <View key={a.alunoId} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{(a.nomeCompleto ?? '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{a.nomeCompleto}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>{a.turmaNome ?? 'Sem turma'} · {a.qtdPendentes} pagamento(s) em cobrança</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{formatAOA(parseFloat(a.totalDivida ?? '0'))}</Text>
                  </View>
                ))}
                {(relFinInadimplencia.alunos as any[]).length === 0 && (
                  <View style={{ alignItems: 'center', paddingTop: 30 }}>
                    <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.success, marginTop: 10 }}>Sem inadimplentes neste período!</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── Entradas e Saídas ── */}
        {relFinTab === 'entradas_saidas' && (
          <View>
            <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 10 }}>Período</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.inputLabel}>De</Text>
                  <DateInput style={[st.input, { marginBottom: 0 }]} value={relFinDataInicio} onChangeText={setRelFinDataInicio} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.inputLabel}>Até</Text>
                  <DateInput style={[st.input, { marginBottom: 0 }]} value={relFinDataFim} onChangeText={setRelFinDataFim} />
                </View>
              </View>
              <TouchableOpacity onPress={loadRelFinEntradasSaidas} style={{ backgroundColor: Colors.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Gerar Relatório</Text>
              </TouchableOpacity>
            </View>

            {relFinLoading && <AppLoader color={Colors.gold} style={{ marginTop: 40 }} />}

            {relFinEntradasSaidas && !relFinLoading && (
              <>
                {/* Sumário */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: Colors.success + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.success + '44' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success }}>Entradas</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.success, marginTop: 4 }}>{formatAOA(relFinEntradasSaidas.totalEntradas)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: Colors.danger + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.danger + '44' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger }}>Saídas</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.danger, marginTop: 4 }}>{formatAOA(relFinEntradasSaidas.totalSaidas)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: (relFinEntradasSaidas.saldoLiquido >= 0 ? Colors.info : Colors.danger) + '18', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: (relFinEntradasSaidas.saldoLiquido >= 0 ? Colors.info : Colors.danger) + '44' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: relFinEntradasSaidas.saldoLiquido >= 0 ? Colors.info : Colors.danger }}>Saldo Líquido</Text>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: relFinEntradasSaidas.saldoLiquido >= 0 ? Colors.info : Colors.danger, marginTop: 4 }}>{formatAOA(relFinEntradasSaidas.saldoLiquido)}</Text>
                  </View>
                </View>

                {/* Por Mês */}
                {Object.keys(relFinEntradasSaidas.porMes).length > 0 && (
                  <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 10 }}>Por Mês</Text>
                    {Object.entries(relFinEntradasSaidas.porMes as Record<string, { entradas: number; saidas: number }>).sort().map(([mes, vals]) => (
                      <View key={mes} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44', alignItems: 'center' }}>
                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{mes}</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success, width: 110, textAlign: 'right' }}>+{formatAOA(vals.entradas)}</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, width: 110, textAlign: 'right' }}>-{formatAOA(vals.saidas)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Lista Entradas */}
                {(relFinEntradasSaidas.entradas as any[]).length > 0 && (
                  <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.success, marginBottom: 10 }}>Entradas ({(relFinEntradasSaidas.entradas as any[]).length})</Text>
                    {(relFinEntradasSaidas.entradas as any[]).slice(0, 20).map((e: any) => (
                      <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{e.nomeCompleto}</Text>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{e.taxaDescricao} · {e.data}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success }}>{formatAOA(e.valor)}</Text>
                      </View>
                    ))}
                    {(relFinEntradasSaidas.entradas as any[]).length > 20 && <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 8 }}>... e mais {(relFinEntradasSaidas.entradas as any[]).length - 20} entradas</Text>}
                  </View>
                )}

                {/* Lista Saídas */}
                {(relFinEntradasSaidas.saidas as any[]).length > 0 && (
                  <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger, marginBottom: 10 }}>Saídas ({(relFinEntradasSaidas.saidas as any[]).length})</Text>
                    {(relFinEntradasSaidas.saidas as any[]).slice(0, 20).map((s: any) => (
                      <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{s.descricao}</Text>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{s.fornecedor} · {s.dataPagamento}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{formatAOA(s.valor)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── Render: Feriados ──────────────────────────────────────
  function renderFeriados() {
    const TIPO_FER_COLOR: Record<string, string> = { nacional: Colors.gold, municipal: Colors.info, escolar: Colors.success };
    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner} refreshControl={<RefreshControl refreshing={feriadosLoading} onRefresh={loadFeriados} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Feriados</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Datas em que não se aplicam multas por atraso</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditFeriado(null); setFormFeriado(defaultFormFeriado); setShowFeriadoModal(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Novo Feriado</Text>
          </TouchableOpacity>
        </View>
        <View style={{ backgroundColor: Colors.info + '18', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.info + '44', flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
          <Ionicons name="information-circle" size={18} color={Colors.info} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 }}>Feriados recorrentes repetem-se anualmente na mesma data. Nenhuma multa é calculada em dias de feriado.</Text>
        </View>

        {feriadosLoading && !feriados.length ? <AppLoader color={Colors.gold} style={{ marginTop: 40 }} /> : null}
        {!feriadosLoading && feriados.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 12 }}>Nenhum feriado registado</Text>
          </View>
        )}

        {feriados.map(f => (
          <View key={f.id} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: (TIPO_FER_COLOR[f.tipo] ?? Colors.gold) + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>🗓️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{f.nome}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>{f.data}</Text>
                <View style={{ backgroundColor: (TIPO_FER_COLOR[f.tipo] ?? Colors.gold) + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: TIPO_FER_COLOR[f.tipo] ?? Colors.gold, textTransform: 'capitalize' }}>{f.tipo}</Text>
                </View>
                {f.recorrente && <View style={{ backgroundColor: Colors.textMuted + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>Anual</Text>
                </View>}
                {!f.ativo && <View style={{ backgroundColor: Colors.danger + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.danger }}>Inactivo</Text>
                </View>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => { setEditFeriado(f); setFormFeriado({ nome: f.nome, data: f.data, tipo: f.tipo, recorrente: f.recorrente, ativo: f.ativo }); setShowFeriadoModal(true); }} style={{ padding: 6 }}>
                <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteFeriado(f.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Modal Feriado */}
        <Modal visible={showFeriadoModal} transparent animationType="slide" onRequestClose={() => setShowFeriadoModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={st.modalOverlay}>
            <View style={st.modalBox}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>{editFeriado ? 'Editar Feriado' : 'Novo Feriado'}</Text>
                <TouchableOpacity onPress={() => setShowFeriadoModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={st.inputLabel}>Nome<RequiredMark /></Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Ex: Independência Nacional" value={formFeriado.nome} onChangeText={v => setFormFeriado(f => ({ ...f, nome: v }))} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.inputLabel}>Data * (AAAA-MM-DD)</Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="2026-11-11" value={formFeriado.data} onChangeText={v => setFormFeriado(f => ({ ...f, data: v }))} returnKeyType="done" onSubmitEditing={saveFeriado} />
              <Text style={st.inputLabel}>Tipo</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[{ k: 'nacional', l: 'Nacional' }, { k: 'municipal', l: 'Municipal' }, { k: 'escolar', l: 'Escolar' }].map(t => (
                  <TouchableOpacity key={t.k} onPress={() => setFormFeriado(f => ({ ...f, tipo: t.k }))}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: formFeriado.tipo === t.k ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formFeriado.tipo === t.k ? Colors.gold : Colors.border }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: formFeriado.tipo === t.k ? '#fff' : Colors.textSecondary }}>{t.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border }}>
                <View>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Recorrente</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Repete-se todos os anos</Text>
                </View>
                <TouchableOpacity onPress={() => setFormFeriado(f => ({ ...f, recorrente: !f.recorrente }))}
                  style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: formFeriado.recorrente ? Colors.success : Colors.border, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Activo</Text>
                <TouchableOpacity onPress={() => setFormFeriado(f => ({ ...f, ativo: !f.ativo }))}
                  style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: formFeriado.ativo ? Colors.success : Colors.border, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={saveFeriado} disabled={savingFeriado} style={st.saveBtn}>
                {savingFeriado ? <AppLoader size="small" color="#fff" /> : <Text style={st.saveBtnTxt}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  async function validarSolDoc(sol: SolDoc, aceitar: boolean) {
    setSolDocSaving(true);
    try {
      const agora = new Date().toISOString();
      const body: Record<string, any> = {
        status: aceitar ? 'validado_financeiro' : 'cancelado',
        validadoPorFinanceiro: aceitar,
        validadoPorFinanceiroId: user?.id || '',
        validadoPorFinanceiroNome: user?.nome || 'Financeiro',
        validadoPorFinanceiroEm: agora,
        referenciaPagamento: solDocRefPag || sol.referenciaPagamento || undefined,
      };
      if (!aceitar && solDocRejeicao) body.motivoRejeicaoFinanceiro = solDocRejeicao;
      await api.put(`/api/solicitacoes-documentos/${sol.id}`, body);
      alertSucesso(aceitar ? 'Pagamento validado! Secretaria notificada.' : 'Solicitação rejeitada.');
      setSolDocModalVis(false);
      setSolDocSelected(null);
      setSolDocRejeicao('');
      setSolDocRefPag('');
      fetchSolDocs();
    } catch (e: any) {
      alertErro(e?.message || 'Erro ao actualizar solicitação.');
    } finally { setSolDocSaving(false); }
  }

  function renderSolicitacoesDocumentos() {
    const formatDt = (iso: string) => { try { const d = new Date(iso); return d.toLocaleDateString('pt-AO'); } catch { return iso; } };
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={solDocsLoading} onRefresh={fetchSolDocs} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          <Ionicons name="document-lock-outline" size={20} color={Colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>
              Validação de Pagamento ({solDocs.length})
            </Text>
            {solDocs.some(s => s.status === 'em_processamento') && (
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.info, marginTop: 1 }}>
                {solDocs.filter(s => s.status === 'em_processamento').length} com pagamento submetido · {solDocs.filter(s => s.status === 'pendente').length} aguardam pagamento
              </Text>
            )}
          </View>
        </View>
        {solDocs.length === 0 && !solDocsLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, marginTop: 12, fontFamily: 'Inter_400Regular' }}>
              Nenhuma solicitação aguarda validação financeira.
            </Text>
          </View>
        )}
        {solDocs.map(sol => {
          const isPago = sol.status === 'em_processamento';
          const badgeColor = isPago ? Colors.info : Colors.warning;
          const badgeLabel = isPago ? 'Pago — Validar' : 'Ag. Pagamento';
          return (
          <TouchableOpacity key={sol.id} activeOpacity={0.85}
            style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: isPago ? 1.5 : 1, borderColor: isPago ? Colors.info + '60' : Colors.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 }}
            onPress={() => { setSolDocSelected(sol); setSolDocRefPag(sol.referenciaPagamento || ''); setSolDocRejeicao(''); setSolDocModalVis(true); }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{sol.tipo}</Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                  {sol.nomeAluno} {sol.apelidoAluno} {sol.alunoNumMatricula ? `· Nº ${sol.alunoNumMatricula}` : ''}
                </Text>
                {sol.nomeTurma && <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{sol.nomeTurma}</Text>}
              </View>
              <View style={{ backgroundColor: badgeColor + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: badgeColor + '40' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: badgeColor }}>{badgeLabel}</Text>
              </View>
            </View>
            {sol.motivo ? <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 8, fontStyle: 'italic' }} numberOfLines={2}>"{sol.motivo}"</Text> : null}
            {sol.referenciaPagamento ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Ionicons name="card-outline" size={12} color={Colors.info} />
                <Text style={{ fontSize: 11, color: Colors.info, fontFamily: 'Inter_600SemiBold' }}>Ref: {sol.referenciaPagamento}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 6, fontFamily: 'Inter_400Regular' }}>Solicitado em {formatDt(sol.createdAt)}</Text>
          </TouchableOpacity>
          );
        })}

        {/* Modal de validação */}
        <Modal visible={solDocModalVis && !!solDocSelected} transparent animationType="slide" onRequestClose={() => setSolDocModalVis(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Validar Pagamento</Text>
                <TouchableOpacity onPress={() => setSolDocModalVis(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              {solDocSelected && (
                <ScrollView style={{ padding: 20 }}>
                  {/* Info do pedido */}
                  <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 }}>{solDocSelected.tipo}</Text>
                    <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                      {solDocSelected.nomeAluno} {solDocSelected.apelidoAluno}
                      {solDocSelected.alunoNumMatricula ? `  ·  Matrícula: ${solDocSelected.alunoNumMatricula}` : ''}
                    </Text>
                    {solDocSelected.nomeTurma && <Text style={{ fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{solDocSelected.nomeTurma}</Text>}
                    {solDocSelected.motivo ? <Text style={{ fontSize: 12, color: Colors.text, fontFamily: 'Inter_400Regular', marginTop: 8, fontStyle: 'italic' }}>Motivo: "{solDocSelected.motivo}"</Text> : null}
                    {solDocSelected.referenciaPagamento && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <Ionicons name="card-outline" size={14} color={Colors.info} />
                        <Text style={{ fontSize: 12, color: Colors.info, fontFamily: 'Inter_600SemiBold' }}>Ref. Pag: {solDocSelected.referenciaPagamento}</Text>
                      </View>
                    )}
                  </View>

                  {/* Referência de pagamento */}
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6 }}>Referência de Pagamento</Text>
                  <TextInput
                    style={{ backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 13, color: Colors.text, marginBottom: 14 }}
                    placeholder="Ex: RUPE-123456 ou comprovativo"
                    placeholderTextColor={Colors.textMuted}
                    value={solDocRefPag}
                    onChangeText={setSolDocRefPag}
                  />

                  {/* Motivo de rejeição */}
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6 }}>Motivo de Rejeição (se rejeitar)</Text>
                  <TextInput
                    style={{ backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 13, color: Colors.text, marginBottom: 20, minHeight: 70 }}
                    placeholder="Explique o motivo da rejeição..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={solDocRejeicao}
                    onChangeText={setSolDocRejeicao}
                  />

                  {/* Botões de ação */}
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 }}
                    onPress={() => validarSolDoc(solDocSelected, true)}
                    disabled={solDocSaving}
                    activeOpacity={0.8}
                  >
                    {solDocSaving ? <AppLoader color="#fff" size="small" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                    <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>Validar Pagamento</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.danger + '15', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Colors.danger + '40', marginBottom: 20 }}
                    onPress={() => validarSolDoc(solDocSelected, false)}
                    disabled={solDocSaving || !solDocRejeicao.trim()}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.danger} />
                    <Text style={{ color: Colors.danger, fontSize: 14, fontFamily: 'Inter_700Bold' }}>Rejeitar</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  // ─── Render: Vendas (Produtos & Serviços) ──────────────────────
  function renderVendas() {
    const rubricas = (vendasData?.porRubrica || []) as any[];
    const filtradas = vendasCategoria === 'todos' ? rubricas : rubricas.filter((r: any) => r.categoria === vendasCategoria);
    const porMes = (vendasData?.porMes || []) as any[];
    const global = vendasData?.global || {};
    const MESES_CURTOS = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const maxMes = Math.max(...porMes.map((m: any) => parseFloat(m.total || '0')), 1);
    const metodos = (vendasData?.porMetodo || []) as any[];
    const METODO_COR: Record<string, string> = { dinheiro: Colors.success, transferencia: Colors.info, multicaixa: Colors.gold };
    const cData = consolidadoData;
    const cMetodo = (cData?.porMetodo || []) as any[];
    const cRubrica = (cData?.porRubrica || []) as any[];
    const cTurma = (cData?.porTurma || []) as any[];
    const cVariacao = cData?.variacaoPercentual;
    const cSaldo = Number(cData?.saldoLiquido ?? 0);

    const exportColunasRubrica: ExportColumn[] = [
      { header: 'Rubrica/Origem', key: 'rubrica', width: 32 },
      { header: 'Categoria', key: 'categoria', width: 14 },
      { header: 'Qtd', key: 'qtd', width: 10 },
      { header: 'Total (Kz)', key: 'totalFmt', width: 18 },
    ];
    const exportLinhasRubrica = cRubrica.map((r: any) => ({ ...r, totalFmt: formatAOA(parseFloat(r.total || '0')) }));

    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner}>
        {/* Relatório de Vendas Consolidado */}
        <View style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>
              <Ionicons name="stats-chart-outline" size={16} color={Colors.gold} /> {'  '}Relatório de Vendas Consolidado
            </Text>
            {cData && cRubrica.length > 0 && (
              <ExportMenu
                title="Relatório de Vendas Consolidado"
                subtitle={`Período: ${consolidadoInicio} a ${consolidadoFim}`}
                columns={exportColunasRubrica}
                rows={exportLinhasRubrica}
              />
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 130 }}>
              <Text style={{ fontSize: 10.5, color: Colors.textMuted, marginBottom: 4 }}>De</Text>
              <DateInput value={consolidadoInicio} onChangeText={setConsolidadoInicio} />
            </View>
            <View style={{ flex: 1, minWidth: 130 }}>
              <Text style={{ fontSize: 10.5, color: Colors.textMuted, marginBottom: 4 }}>Até</Text>
              <DateInput value={consolidadoFim} onChangeText={setConsolidadoFim} />
            </View>
            <View style={{ flex: 1.4, minWidth: 160 }}>
              <Text style={{ fontSize: 10.5, color: Colors.textMuted, marginBottom: 4 }}>Turma (opcional)</Text>
              <View style={[st.input, { paddingVertical: 0, justifyContent: 'center' }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity onPress={() => setConsolidadoTurmaId('')} style={{ paddingVertical: 8, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: consolidadoTurmaId === '' ? '700' : '400', color: consolidadoTurmaId === '' ? Colors.gold : Colors.text }}>Todas</Text>
                  </TouchableOpacity>
                  {turmas.filter(t => t.ativo).map(t => (
                    <TouchableOpacity key={t.id} onPress={() => setConsolidadoTurmaId(t.id)} style={{ paddingVertical: 8, paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: consolidadoTurmaId === t.id ? '700' : '400', color: consolidadoTurmaId === t.id ? Colors.gold : Colors.text }}>{t.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity onPress={carregarConsolidado} disabled={consolidadoLoading}
              style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, opacity: consolidadoLoading ? 0.6 : 1, alignSelf: 'flex-end' }}>
              {consolidadoLoading ? <AppLoader size="small" color="#fff" /> : <Ionicons name="refresh" size={15} color="#fff" />}
            </TouchableOpacity>
          </View>

          {consolidadoLoading && !cData ? <SkeletonList rows={4} /> : !cData ? null : (
            <>
              {/* KPIs principais + comparativo + saldo líquido */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: Colors.primary + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: Colors.primary }}>{formatAOA(Number(cData.totalReceita || 0))}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', marginTop: 2 }}>Receita do Período</Text>
                  {cVariacao !== null && cVariacao !== undefined && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                      <Ionicons name={cVariacao >= 0 ? 'trending-up' : 'trending-down'} size={12} color={cVariacao >= 0 ? Colors.success : Colors.danger} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: cVariacao >= 0 ? Colors.success : Colors.danger }}>
                        {cVariacao >= 0 ? '+' : ''}{cVariacao}% vs. período anterior
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: Colors.danger + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: Colors.danger }}>{formatAOA(Number(cData.totalDespesas || 0))}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', marginTop: 2 }}>Despesas do Período</Text>
                </View>
                <View style={{ flex: 1, minWidth: 140, backgroundColor: (cSaldo >= 0 ? Colors.success : Colors.danger) + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: cSaldo >= 0 ? Colors.success : Colors.danger }}>{formatAOA(cSaldo)}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', marginTop: 2 }}>Saldo Líquido</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: Colors.info + '12', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.info }}>{formatAOA(Number(cData.totalServicos || 0))}</Text>
                  <Text style={{ fontSize: 9.5, color: Colors.info, opacity: 0.85 }}>Serviços</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: Colors.success + '12', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.success }}>{formatAOA(Number(cData.totalProdutos || 0))}</Text>
                  <Text style={{ fontSize: 9.5, color: Colors.success, opacity: 0.85 }}>Produtos</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: Colors.gold + '12', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.gold }}>{cData.qtdTransacoes ?? 0}</Text>
                  <Text style={{ fontSize: 9.5, color: Colors.gold, opacity: 0.85 }}>Transacções</Text>
                </View>
              </View>

              {/* Por método */}
              {cMetodo.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: Colors.text, marginBottom: 8 }}>Por Método de Pagamento</Text>
                  {cMetodo.map((m: any) => (
                    <View key={m.metodo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      <Text style={{ flex: 1, fontSize: 12.5, color: Colors.text, textTransform: 'capitalize' }}>{metodoLabel(m.metodo)}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginRight: 10 }}>{m.qtd} pag.</Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: Colors.text }}>{formatAOA(m.total)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Por turma/classe */}
              {cTurma.length > 0 && (
                <View style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: Colors.text, marginBottom: 8 }}>Por Turma/Classe</Text>
                  {cTurma.map((t: any) => (
                    <View key={t.turmaId} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12.5, color: Colors.text, fontWeight: '600' }}>{t.turmaNome}</Text>
                        <Text style={{ fontSize: 10.5, color: Colors.textMuted }}>{t.classe} · {t.qtd} pagamentos</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: Colors.text }}>{formatAOA(parseFloat(t.total || '0'))}</Text>
                    </View>
                  ))}
                </View>
              )}

              {consolidadoTurmaId ? (
                <View style={{ backgroundColor: Colors.info + '12', borderRadius: 8, padding: 10, marginTop: 10, flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.info} />
                  <Text style={{ fontSize: 10.5, color: Colors.info, flex: 1 }}>
                    Ao filtrar por turma, as receitas avulsas sem aluno matriculado (inscrições, donativos) não são incluídas por não terem turma associada.
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Relatório anual por rubrica (existente) */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>Relatório Anual por Rubrica</Text>
        {/* Filtro */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <TextInput
            style={[st.input, { flex: 1, marginBottom: 0, height: 38, minWidth: 80 }]}
            value={vendasAno} onChangeText={setVendasAno} keyboardType="number-pad" placeholder="Ano"
            placeholderTextColor={Colors.textMuted}
          />
          {(['todos', 'Serviços', 'Produtos'] as const).map(c => (
            <TouchableOpacity key={c} onPress={() => setVendasCategoria(c)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                backgroundColor: vendasCategoria === c ? Colors.gold : Colors.surface,
                borderColor: vendasCategoria === c ? Colors.gold : Colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: vendasCategoria === c ? '#fff' : Colors.textSecondary }}>{c === 'todos' ? 'Todos' : c}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={carregarVendas} disabled={vendasLoading}
            style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, opacity: vendasLoading ? 0.6 : 1 }}>
            {vendasLoading ? <AppLoader size="small" color="#fff" /> : <Ionicons name="refresh" size={15} color="#fff" />}
          </TouchableOpacity>
        </View>

        {vendasLoading && !vendasData ? <SkeletonList rows={5} /> : !vendasData ? (
          <TouchableOpacity onPress={carregarVendas} style={{ alignItems: 'center', padding: 32 }}>
            <Ionicons name="storefront-outline" size={48} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, marginTop: 12 }}>Toque para carregar relatório de vendas</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* KPIs */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Geral', val: formatAOA(parseFloat(global.totalGeral || '0')), color: Colors.primary },
                { label: 'Serviços', val: formatAOA(parseFloat(global.totalServicos || '0')), color: Colors.info },
                { label: 'Produtos', val: formatAOA(parseFloat(global.totalProdutos || '0')), color: Colors.success },
                { label: 'Transacções', val: parseInt(global.qtdTotal || '0').toString(), color: Colors.gold },
              ].map(({ label, val, color }) => (
                <View key={label} style={[st.kpiCard ?? {}, { flex: 1, minWidth: 120, backgroundColor: Colors.card, borderRadius: 10, padding: 12, alignItems: 'center', borderTopWidth: 3, borderTopColor: color, borderWidth: 1, borderColor: Colors.border }]}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color }}>{val}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Evolução mensal */}
            {porMes.length > 0 && (
              <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>Evolução Mensal</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 80, paddingBottom: 4 }}>
                    {porMes.map((m: any) => {
                      const h = Math.max(8, Math.round((parseFloat(m.total || '0') / maxMes) * 70));
                      return (
                        <View key={m.mes} style={{ alignItems: 'center', width: 36 }}>
                          <Text style={{ fontSize: 9, color: Colors.textMuted, marginBottom: 2 }}>{formatAOA(parseFloat(m.total || '0')).replace('AOA','').trim()}</Text>
                          <View style={{ width: 28, height: h, backgroundColor: Colors.primary, borderRadius: 4, opacity: 0.85 }} />
                          <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 3 }}>{MESES_CURTOS[parseInt(m.mes)] || m.mes}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Por método */}
            <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>Por Método de Pagamento</Text>
              {metodos.map((m: any) => (
                <View key={m.metodo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: METODO_COR[m.metodo] || Colors.textMuted, marginRight: 8 }} />
                  <Text style={{ flex: 1, fontSize: 13, color: Colors.text, textTransform: 'capitalize' }}>{metodoLabel(m.metodo)}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted, marginRight: 12 }}>{m.qtd} pag.</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{formatAOA(parseFloat(m.total || '0'))}</Text>
                </View>
              ))}
            </View>

            {/* Por rubrica / categoria */}
            <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>Por Rubrica {vendasCategoria !== 'todos' ? `(${vendasCategoria})` : ''}</Text>
              {filtradas.length === 0 ? (
                <Text style={{ color: Colors.textMuted, textAlign: 'center', padding: 16 }}>Sem registos para o filtro seleccionado.</Text>
              ) : filtradas.map((r: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{r.rubrica}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      <View style={{ backgroundColor: r.categoria === 'Serviços' ? Colors.info + '22' : Colors.success + '22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: r.categoria === 'Serviços' ? Colors.info : Colors.success }}>{r.categoria}</Text>
                      </View>
                      <Text style={{ fontSize: 10, color: Colors.textMuted }}>{r.qtd} transacções</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{formatAOA(parseFloat(r.total || '0'))}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  // ─── Render: Fecho de Caixa ────────────────────────────────
  function renderFechoCaixa() {
    function fmtData(d: string) {
      if (!d) return '—';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('pt-PT');
    }
    const pendentes = reaberturas.filter(r => r.status === 'pendente');
    return (
      <ScrollView style={st.scrollContent} contentContainerStyle={st.scrollInner}>
        {/* Card de novo fecho */}
        <View style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 14 }}>
            <Ionicons name="lock-closed-outline" size={16} color={Colors.gold} /> {'  '}Realizar Novo Fecho de Caixa
          </Text>

          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 }}>Data do Fecho *</Text>
          <TextInput
            style={[st.input, { marginBottom: 12 }]}
            value={fechoData} onChangeText={setFechoData}
            placeholder="AAAA-MM-DD" placeholderTextColor={Colors.textMuted}
          />

          {fechoData && (
            fechoPreviewLoading ? (
              <View style={{ padding: 14, alignItems: 'center' }}><AppLoader size="small" /></View>
            ) : fechoPreview?.jaFechado ? (
              <View style={{ backgroundColor: Colors.danger + '15', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', gap: 8 }}>
                <Ionicons name="lock-closed" size={15} color={Colors.danger} />
                <Text style={{ fontSize: 11, color: Colors.danger, flex: 1 }}>
                  Já existe um Fecho de Caixa nº {fechoPreview.fecho?.numero} activo para esta data. Solicite reabertura no histórico abaixo caso precise de o corrigir.
                </Text>
              </View>
            ) : fechoPreview ? (
              <View style={{ backgroundColor: Colors.gold + '12', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.gold, marginBottom: 8, textTransform: 'uppercase' }}>Valor Esperado no Sistema</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'Dinheiro', val: fechoPreview.totalCaixa, color: Colors.success },
                    { label: 'Transferência', val: fechoPreview.totalTransferencia, color: Colors.info },
                    { label: 'Multicaixa', val: fechoPreview.totalMulticaixa, color: Colors.gold },
                  ].map(({ label, val, color }) => (
                    <View key={label} style={{ flex: 1, backgroundColor: color + '15', borderRadius: 8, padding: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color }}>{formatAOA(Number(val || 0))}</Text>
                      <Text style={{ fontSize: 9.5, color, opacity: 0.8 }}>{label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 }}>Valor Contado em Caixa (Dinheiro Físico)</Text>
                <TextInput
                  style={st.input}
                  value={fechoValorContado} onChangeText={setFechoValorContado}
                  placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="numeric"
                />
                {fechoDiferenca !== null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Ionicons
                      name={fechoDiferenca === 0 ? 'checkmark-circle' : fechoDiferenca > 0 ? 'arrow-up-circle' : 'arrow-down-circle'}
                      size={15}
                      color={fechoDiferenca === 0 ? Colors.success : fechoDiferenca > 0 ? Colors.info : Colors.danger}
                    />
                    <Text style={{
                      fontSize: 12, fontWeight: '700',
                      color: fechoDiferenca === 0 ? Colors.success : fechoDiferenca > 0 ? Colors.info : Colors.danger,
                    }}>
                      {fechoDiferenca === 0 ? 'Caixa confere exactamente.' : fechoDiferenca > 0
                        ? `Sobra de ${formatAOA(fechoDiferenca)}`
                        : `Falta de ${formatAOA(Math.abs(fechoDiferenca))}`}
                    </Text>
                  </View>
                )}
              </View>
            ) : null
          )}

          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 }}>Observações (opcional)</Text>
          <TextInput
            style={[st.input, { marginBottom: 16, minHeight: 70 }]}
            value={fechoObs} onChangeText={setFechoObs}
            multiline placeholder="Notas sobre o fecho..." placeholderTextColor={Colors.textMuted}
            textAlignVertical="top"
          />

          <View style={{ backgroundColor: Colors.warning + '15', borderRadius: 8, padding: 10, marginBottom: 14, flexDirection: 'row', gap: 8 }}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.warning} />
            <Text style={{ fontSize: 11, color: Colors.warning, flex: 1 }}>
              O fecho recebe um número sequencial oficial e gera um snapshot imutável de todas as cobranças do dia. Uma vez fechado, os pagamentos dessa data ficam bloqueados — só é possível alterá-los após uma reabertura aprovada.
            </Text>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: (fechoSaving || fechoPreview?.jaFechado) ? 0.6 : 1 }}
            onPress={realizarFechoCaixa} disabled={fechoSaving || fechoPreview?.jaFechado}
          >
            {fechoSaving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="lock-closed" size={16} color="#fff" />}
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Realizar Fecho de Caixa</Text>
          </TouchableOpacity>
        </View>

        {/* Pedidos de reabertura pendentes (apenas admin) */}
        {isAdminFC && pendentes.length > 0 && (
          <View style={{ backgroundColor: Colors.danger + '10', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.danger + '40' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.danger, marginBottom: 10 }}>
              <Ionicons name="alert-circle" size={15} color={Colors.danger} /> {'  '}Pedidos de Reabertura Pendentes
            </Text>
            {pendentes.map((p: any) => (
              <View key={p.id} style={{ backgroundColor: Colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Fecho nº {p.fechoNumero} — {fmtData(p.data)}</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Solicitado por {p.solicitadoPorEmail}</Text>
                <Text style={{ fontSize: 12, color: Colors.text, marginTop: 6, fontStyle: 'italic' }}>"{p.motivo}"</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: Colors.success, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}
                    onPress={() => decidirReaberturaCaixa(p.id, 'aprovado')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Aprovar Reabertura</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: Colors.danger, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}
                    onPress={() => decidirReaberturaCaixa(p.id, 'rejeitado')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Histórico de fechos */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 }}>Histórico de Fechos</Text>
        {fechosLoading ? <SkeletonList rows={4} /> : fechos.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 32, backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border }}>
            <Ionicons name="lock-open-outline" size={44} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, marginTop: 10, fontSize: 13 }}>Nenhum fecho realizado ainda.</Text>
          </View>
        ) : (
          fechos.map((f: any) => {
            const reaberto = f.status === 'reaberto';
            const pedidoPendente = reaberturas.some(r => r.fechoId === f.id && r.status === 'pendente');
            const diferenca = f.diferenca !== undefined && f.diferenca !== null ? Number(f.diferenca) : null;
            return (
            <TouchableOpacity
              key={f.id}
              style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: reaberto ? Colors.warning + '60' : Colors.border }}
              onPress={() => setFechoSelected(fechoSelected?.id === f.id ? null : f)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>Fecho nº {f.numero ?? '—'} · {fmtData(f.data)}</Text>
                    {reaberto && (
                      <View style={{ backgroundColor: Colors.warning + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.warning }}>REABERTO</Text>
                      </View>
                    )}
                    {pedidoPendente && (
                      <View style={{ backgroundColor: Colors.info + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.info }}>REABERTURA PENDENTE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{f.anoLetivo} · {f.numTransacoes} transacções · por {f.fechadoPorEmail}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.success }}>{formatAOA(parseFloat(f.totalGeral || '0'))}</Text>
                  <Ionicons name={fechoSelected?.id === f.id ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                </View>
              </View>

              {fechoSelected?.id === f.id && (
                <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                    {[
                      { label: 'Dinheiro', val: f.totalCaixa, color: Colors.success },
                      { label: 'Transferência', val: f.totalTransferencia, color: Colors.info },
                      { label: 'Multicaixa', val: f.totalMulticaixa, color: Colors.gold },
                    ].map(({ label, val, color }) => (
                      <View key={label} style={{ flex: 1, backgroundColor: color + '15', borderRadius: 8, padding: 8, alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color }}>{formatAOA(parseFloat(val || '0'))}</Text>
                        <Text style={{ fontSize: 10, color, opacity: 0.8 }}>{label}</Text>
                      </View>
                    ))}
                  </View>

                  {f.valorContado !== undefined && f.valorContado !== null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, backgroundColor: (diferenca === 0 ? Colors.success : (diferenca ?? 0) > 0 ? Colors.info : Colors.danger) + '12', borderRadius: 8, padding: 8 }}>
                      <Ionicons name="cash-outline" size={14} color={Colors.textMuted} />
                      <Text style={{ fontSize: 11.5, color: Colors.text }}>
                        Contado: <Text style={{ fontWeight: '700' }}>{formatAOA(Number(f.valorContado))}</Text>
                        {'  ·  '}
                        Diferença: <Text style={{ fontWeight: '700', color: diferenca === 0 ? Colors.success : (diferenca ?? 0) > 0 ? Colors.info : Colors.danger }}>
                          {diferenca === 0 ? 'Nenhuma' : `${(diferenca ?? 0) > 0 ? '+' : ''}${formatAOA(diferenca ?? 0)}`}
                        </Text>
                      </Text>
                    </View>
                  )}

                  {f.observacoes ? <Text style={{ fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' }}>"{f.observacoes}"</Text> : null}

                  {reaberto && f.reabertoPorEmail && (
                    <Text style={{ fontSize: 10.5, color: Colors.warning, marginTop: 6 }}>Reaberto por {f.reabertoPorEmail}</Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {Platform.OS === 'web' && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e3a5f22', padding: 8, borderRadius: 8, borderColor: '#1e3a5f44', borderWidth: 1 }}
                        onPress={() => {
                          const rubricas: any[] = typeof f.snapshotRubricas === 'string' ? JSON.parse(f.snapshotRubricas) : f.snapshotRubricas || [];
                          const rowsR = rubricas.map((r: any, idx: number) => `<tr style="background:${idx%2===1?'#FFF9C4':'#fff'}"><td>${r.rubrica||'—'}</td><td style="text-align:center">${r.qtd}</td><td style="text-align:right">${formatAOA(parseFloat(r.total||'0'))}</td></tr>`).join('');
                          const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/><title>Fecho de Caixa ${f.data}</title>
<style>body{font-family:Arial;font-size:11px;}table{border-collapse:collapse;width:100%;font-size:10px;}th{background:#1a2540;color:#fff;padding:5px;text-align:center;}td{border:1px solid #000;padding:3px 5px;}.kpi{display:inline-block;min-width:120px;border:1px solid #ddd;border-radius:6px;padding:8px 14px;text-align:center;margin:4px;}.kv{font-size:16px;font-weight:800;color:#1a2540;}</style></head>
<body style="padding:20px">
<h2 style="text-align:center">FECHO DE CAIXA Nº ${f.numero ?? '—'} — ${f.data}</h2>
<p style="text-align:center;color:#555">Ano Lectivo: ${f.anoLetivo} · ${f.numTransacoes} transacções · Fechado por: ${f.fechadoPorEmail}</p>
<div style="text-align:center;margin:14px 0">
<div class="kpi"><div class="kv">${formatAOA(parseFloat(f.totalGeral||'0'))}</div><div style="font-size:9px;text-transform:uppercase;color:#555">Total Geral</div></div>
<div class="kpi"><div class="kv" style="color:#16a34a">${formatAOA(parseFloat(f.totalCaixa||'0'))}</div><div style="font-size:9px;text-transform:uppercase;color:#555">Dinheiro</div></div>
<div class="kpi"><div class="kv" style="color:#2563eb">${formatAOA(parseFloat(f.totalTransferencia||'0'))}</div><div style="font-size:9px;text-transform:uppercase;color:#555">Transferência</div></div>
<div class="kpi"><div class="kv" style="color:#d97706">${formatAOA(parseFloat(f.totalMulticaixa||'0'))}</div><div style="font-size:9px;text-transform:uppercase;color:#555">Multicaixa</div></div>
</div>
${f.valorContado !== null && f.valorContado !== undefined ? `<p style="text-align:center;color:#555">Valor Contado: ${formatAOA(Number(f.valorContado))} · Diferença: ${formatAOA(Number(f.diferenca||0))}</p>` : ''}
${rubricas.length ? `<h3>Detalhe por Rubrica</h3><table><thead><tr><th style="text-align:left">RUBRICA</th><th>QTD</th><th>TOTAL (Kz)</th></tr></thead><tbody>${rowsR}</tbody></table>` : ''}
${f.observacoes ? `<p style="margin-top:14px;color:#555;font-style:italic">Obs: ${f.observacoes}</p>` : ''}
</body></html>`;
                          const win = window.open('', '_blank');
                          if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
                        }}
                      >
                        <Ionicons name="print-outline" size={13} color="#1e3a5f" />
                        <Text style={{ fontSize: 12, color: '#1e3a5f', fontWeight: '600' }}>Imprimir Relatório</Text>
                      </TouchableOpacity>
                    )}
                    {!reaberto && !pedidoPendente && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.warning + '18', padding: 8, borderRadius: 8, borderColor: Colors.warning + '44', borderWidth: 1 }}
                        onPress={() => { setReaberturaFecho(f); setReaberturaMotivo(''); }}
                      >
                        <Ionicons name="lock-open-outline" size={13} color={Colors.warning} />
                        <Text style={{ fontSize: 12, color: Colors.warning, fontWeight: '600' }}>Solicitar Reabertura</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );})
        )}

        {/* Modal: solicitar reabertura */}
        <Modal visible={!!reaberturaFecho} transparent animationType="fade" onRequestClose={() => setReaberturaFecho(null)}>
          <View style={st.modalOverlay}>
            <View style={[st.modalBox, { maxHeight: '70%' }]}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>Solicitar Reabertura do Fecho</Text>
                <TouchableOpacity onPress={() => setReaberturaFecho(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Fecho nº {reaberturaFecho?.numero} de {fmtData(reaberturaFecho?.data)}. O pedido será enviado para aprovação de um administrador antes de reabrir o dia.
              </Text>
              <Text style={st.inputLabel}>Motivo<RequiredMark /></Text>
              <TextInput
                style={[st.input, { minHeight: 90, marginBottom: 16 }]}
                value={reaberturaMotivo} onChangeText={setReaberturaMotivo}
                multiline placeholder="Explique por que precisa de reabrir este fecho..." placeholderTextColor={Colors.textMuted}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={{ backgroundColor: Colors.warning, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: reaberturaSaving ? 0.6 : 1 }}
                onPress={solicitarReaberturaCaixa} disabled={reaberturaSaving}
              >
                {reaberturaSaving ? <AppLoader size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Enviar Pedido</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  const tabsConfigAll = [
    ['painel', 'pie-chart', 'Painel'],
    ['resumo', 'stats-chart', 'Resumo'],
    ['relatorios', 'bar-chart', 'Relatórios'],
    ['em_atraso', 'alert-circle', 'Vencido'],
    ['mensagens', 'chatbubbles', 'Mensagens'],
    ['pagamentos', 'receipt', 'Pagamentos'],
    ['rubricas', 'pricetag', 'Rubricas'],
    ['orcamento', 'speedometer-outline', 'Orçamento'],
    ['pag_rubrica', 'layers-outline', 'Pag. Rubrica'],
    ['por_aluno', 'person', 'Por Aluno'],
    ['config_fiscal', 'settings', 'Config. Fiscal'],
    ['plano_contas', 'git-branch-outline', 'Plano Contas'],
    ['contas_pagar', 'trending-down-outline', 'Contas a Pagar'],
    ['relatorios_fin', 'analytics-outline', 'Rel. Financeiros'],
    ['feriados', 'calendar-outline', 'Feriados'],
    ['solicitacoes_docs', 'document-lock-outline', 'Val. Documentos'],
    ['vendas', 'storefront-outline', 'Vendas'],
    ['fecho_caixa', 'lock-closed-outline', 'Fecho Caixa'],
  ] as const;

  const isFinanceiroRole = user?.role === 'financeiro';
  const FINANCEIRO_TABS: TabKey[] = ['painel', 'resumo', 'relatorios', 'em_atraso', 'mensagens', 'pagamentos', 'rubricas', 'orcamento', 'pag_rubrica', 'por_aluno', 'config_fiscal', 'plano_contas', 'contas_pagar', 'relatorios_fin', 'feriados', 'solicitacoes_docs', 'vendas', 'fecho_caixa'];

  const tabsConfig = (() => {
    const base = propinaHabilitada
      ? tabsConfigAll
      : tabsConfigAll.filter(([k]) => k !== 'em_atraso');
    if (isFinanceiroRole) {
      return base.filter(([k]) => FINANCEIRO_TABS.includes(k as TabKey));
    }
    return base;
  })();

  useEnterToSave(savePlano, showPlanoModal);
  useEnterToSave(saveConta, showContaModal);
  useEnterToSave(saveFeriado, showFeriadoModal);
  useEnterToSave(saveAvulso, showAvulsoModal);
  useEnterToSave(handleSalvarMulta, showMultaModal);
  useEnterToSave(handleSolicitarIsencao, showIsencaoModal);
  useEnterToSave(handleAdicionarSaldo, showSaldoModal);
  useEnterToSave(handleTransferirPagamento, showTransferModal);
  useEnterToSave(confirmarPagamento, showModalPag);
  useEnterToSave(gravarTaxa, showModalTaxa);
  useEnterToSave(cancelarERecriar, showCancelarRecriarModal);

  return (
    <View style={st.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={FINANCEIRO_TOUR_STEPS} storageKey={FINANCEIRO_TOUR_KEY} />
      <TopBar
        title="Gestão Financeira"
        subtitle={`Ano Lectivo ${anoAtual.replace('/', '-')}`}
        onBack={
          tab === 'pag_rubrica' && pagRubricaSelected
            ? () => { setPagRubricaSelected(null); setPagRubricaSearch(''); setPagRubricaStatusFiltro('todos'); setPagRubricaVista('lista'); }
            : undefined
        }
        rightAction={{ icon: 'compass-outline', onPress: openTour }}
      />

      <HScrollTabBar style={[st.tabScrollWrap, st.tabBarScroll]} contentContainerStyle={st.tabBar} bgColor={Colors.primaryDark} stickyCount={1}>
        {tabsConfig.map(([k, icon, label]) => (
          <TouchableOpacity key={k} style={[st.tabBtn, tab === k && st.tabBtnActive]} onPress={() => { setTab(k as TabKey); setAlunoPerfilId(null); }}>
            <Ionicons name={icon as any} size={15} color={tab === k ? Colors.gold : Colors.textMuted} />
            <Text style={[st.tabBtnTxt, tab === k && st.tabBtnTxtActive]}>{label}</Text>
            {k === 'em_atraso' && alunosEmAtraso.length > 0 && (
              <View style={st.tabBadge}>
                <Text style={st.tabBadgeTxt}>{alunosEmAtraso.length}</Text>
              </View>
            )}
            {k === 'mensagens' && mensagens.filter(m => !m.lida).length > 0 && (
              <View style={st.tabBadge}>
                <Text style={st.tabBadgeTxt}>{mensagens.filter(m => !m.lida).length}</Text>
              </View>
            )}
            {k === 'solicitacoes_docs' && solDocs.length > 0 && (
              <View style={st.tabBadge}>
                <Text style={st.tabBadgeTxt}>{solDocs.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {tab === 'painel'      && renderPainel()}
      {tab === 'resumo'      && renderResumo()}
      {tab === 'relatorios'  && renderRelatorios()}
      {tab === 'em_atraso'   && renderEmAtraso()}
      {tab === 'mensagens'   && renderMensagens()}
      {tab === 'pagamentos'  && renderPagamentos()}
      {tab === 'rubricas'       && renderRubricas()}
      {tab === 'orcamento'      && renderOrcamento()}
      {tab === 'pag_rubrica'    && renderPagRubrica()}
      {tab === 'por_aluno'      && renderPorAluno()}
      {tab === 'config_fiscal'  && renderConfigFiscal()}
      {tab === 'plano_contas'   && renderPlanoContas()}
      {tab === 'contas_pagar'   && renderContasPagar()}
      {tab === 'relatorios_fin' && renderRelatoriosFinanceiros()}
      {tab === 'feriados'       && renderFeriados()}
      {tab === 'solicitacoes_docs' && renderSolicitacoesDocumentos()}
      {tab === 'vendas'         && renderVendas()}
      {tab === 'fecho_caixa'    && renderFechoCaixa()}

      {/* Modal Cobrança Avulsa */}
      <Modal visible={showAvulsoModal} transparent animationType="slide" onRequestClose={() => setShowAvulsoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={[st.modalBox, { maxHeight: '90%' }]}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Nova Cobrança Avulsa</Text>
              <TouchableOpacity onPress={() => setShowAvulsoModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Crie uma cobrança pontual directamente vinculada à matrícula de um aluno, independente das taxas programadas.
              </Text>
              <Text style={st.inputLabel}>Aluno<RequiredMark /></Text>
              <TouchableOpacity style={[st.input, { justifyContent: 'center', height: 44 }]} onPress={() => { setShowAvulsoAlunoList(v => !v); setShowAvulsoTaxaList(false); }}>
                <Text style={{ fontSize: 13, color: formAvulso.alunoId ? Colors.text : Colors.textMuted }}>
                  {formAvulso.alunoId ? (alunosAtivos.find(a => a.id === formAvulso.alunoId)?.nomeCompleto ?? 'Aluno seleccionado') : 'Seleccionar aluno…'}
                </Text>
              </TouchableOpacity>
              {showAvulsoAlunoList && (
                <ScrollView style={[st.dropList, { maxHeight: 180 }]} nestedScrollEnabled>
                  {alunosAtivos.map(a => (
                    <TouchableOpacity key={a.id} style={[st.dropItem, formAvulso.alunoId === a.id && st.dropItemActive]}
                      onPress={() => { setFormAvulso(f => ({ ...f, alunoId: a.id })); setShowAvulsoAlunoList(false); }}>
                      <Text style={[st.dropItemTxt, formAvulso.alunoId === a.id && { color: Colors.gold }]}>{a.nomeCompleto}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <Text style={st.inputLabel}>Taxa<RequiredMark /></Text>
              <TouchableOpacity style={[st.input, { justifyContent: 'center', height: 44 }]} onPress={() => { setShowAvulsoTaxaList(v => !v); setShowAvulsoAlunoList(false); }}>
                <Text style={{ fontSize: 13, color: formAvulso.taxaId ? Colors.text : Colors.textMuted }}>
                  {formAvulso.taxaId ? (taxas.find(t => t.id === formAvulso.taxaId)?.descricao ?? 'Taxa seleccionada') : 'Seleccionar taxa…'}
                </Text>
              </TouchableOpacity>
              {showAvulsoTaxaList && (
                <ScrollView style={[st.dropList, { maxHeight: 150 }]} nestedScrollEnabled>
                  {taxasAtivas.map(t => (
                    <TouchableOpacity key={t.id} style={[st.dropItem, formAvulso.taxaId === t.id && st.dropItemActive]}
                      onPress={() => { setFormAvulso(f => ({ ...f, taxaId: t.id, valor: t.valor.toString() })); setShowAvulsoTaxaList(false); }}>
                      <Text style={[st.dropItemTxt, formAvulso.taxaId === t.id && { color: Colors.gold }]}>{t.descricao}</Text>
                      <Text style={st.dropItemSub}>{formatAOA(t.valor)} · {t.nivel}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <Text style={st.inputLabel}>Valor (Kz)<RequiredMark /></Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="0.00" keyboardType="decimal-pad" value={formAvulso.valor} onChangeText={v => setFormAvulso(f => ({ ...f, valor: v }))} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.inputLabel}>Data<RequiredMark /></Text>
              <DateInput style={st.input} value={formAvulso.data} onChangeText={v => setFormAvulso(f => ({ ...f, data: v }))} />
              <Text style={st.inputLabel}>Ano Lectivo<RequiredMark /></Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="2025/26" value={formAvulso.ano} onChangeText={v => setFormAvulso(f => ({ ...f, ano: v }))} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.inputLabel}>Mês (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => setFormAvulso(f => ({ ...f, mes: '' }))} style={[st.mesBtn, !formAvulso.mes && st.mesBtnActive]}>
                    <Text style={[st.mesTxt, !formAvulso.mes && st.mesTxtActive]}>N/A</Text>
                  </TouchableOpacity>
                  {MESES.map((m, i) => (
                    <TouchableOpacity key={m} onPress={() => setFormAvulso(f => ({ ...f, mes: String(i + 1) }))} style={[st.mesBtn, formAvulso.mes === String(i + 1) && st.mesBtnActive]}>
                      <Text style={[st.mesTxt, formAvulso.mes === String(i + 1) && st.mesTxtActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={st.inputLabel}>Estado</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[{ k: 'pago', l: 'Liquidado' }, { k: 'pendente', l: 'Em Cobrança' }].map(s => (
                  <TouchableOpacity key={s.k} onPress={() => setFormAvulso(f => ({ ...f, status: s.k }))}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: formAvulso.status === s.k ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formAvulso.status === s.k ? Colors.gold : Colors.border }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: formAvulso.status === s.k ? '#fff' : Colors.textSecondary }}>{s.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={st.inputLabel}>Método de Pagamento</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {[{ k: 'dinheiro', l: 'Dinheiro' }, { k: 'transferencia', l: 'Transferência' }, { k: 'multicaixa', l: 'Multicaixa' }].map(m => (
                  <TouchableOpacity key={m.k} onPress={() => setFormAvulso(f => ({ ...f, metodoPagamento: m.k }))}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: formAvulso.metodoPagamento === m.k ? Colors.info : Colors.surface, borderWidth: 1, borderColor: formAvulso.metodoPagamento === m.k ? Colors.info : Colors.border }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: formAvulso.metodoPagamento === m.k ? '#fff' : Colors.textSecondary }}>{m.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={st.inputLabel}>Referência</Text>
              <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Referência opcional" value={formAvulso.referencia} onChangeText={v => setFormAvulso(f => ({ ...f, referencia: v }))} returnKeyType="done" onSubmitEditing={saveAvulso} />
              <Text style={st.inputLabel}>Observação</Text>
              <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted} multiline value={formAvulso.observacao} onChangeText={v => setFormAvulso(f => ({ ...f, observacao: v }))} />
              <TouchableOpacity onPress={saveAvulso} disabled={savingAvulso} style={st.saveBtn}>
                {savingAvulso ? <AppLoader size="small" color="#fff" /> : <Text style={st.saveBtnTxt}>Registar Cobrança Avulsa</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Cancelar e Recriar Cobrança */}
      <Modal visible={showCancelarRecriarModal} transparent animationType="slide" onRequestClose={() => setShowCancelarRecriarModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Cancelar e Recriar Cobrança</Text>
              <TouchableOpacity onPress={() => setShowCancelarRecriarModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.warning + '44', marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, lineHeight: 18 }}>
                O pagamento original será cancelado e uma nova cobrança será criada com os dados abaixo. Deixe os campos em branco para manter os valores originais.
              </Text>
            </View>
            <Text style={st.inputLabel}>Novo Valor (Kz) — opcional</Text>
            <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Deixar em branco = manter original" keyboardType="decimal-pad" value={formRecriar.valor} onChangeText={v => setFormRecriar(f => ({ ...f, valor: v }))} returnKeyType="next" blurOnSubmit={false} />
            <Text style={st.inputLabel}>Nova Data — opcional</Text>
            <DateInput style={st.input} value={formRecriar.data} onChangeText={v => setFormRecriar(f => ({ ...f, data: v }))} placeholder="DD-MM-AAAA (vazio = manter original)" />
            <Text style={st.inputLabel}>Estado da Nova Cobrança</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[{ k: 'pendente', l: 'Em Cobrança' }, { k: 'pago', l: 'Liquidado' }].map(s => (
                <TouchableOpacity key={s.k} onPress={() => setFormRecriar(f => ({ ...f, status: s.k }))}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: formRecriar.status === s.k ? Colors.gold : Colors.surface, borderWidth: 1, borderColor: formRecriar.status === s.k ? Colors.gold : Colors.border }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: formRecriar.status === s.k ? '#fff' : Colors.textSecondary }}>{s.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.inputLabel}>Observação</Text>
            <TextInput style={[st.input, { height: 50, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted} multiline placeholder="Observação interna" value={formRecriar.observacao} onChangeText={v => setFormRecriar(f => ({ ...f, observacao: v }))} />
            <Text style={[st.inputLabel, { color: Colors.danger }]}>Motivo do Cancelamento<RequiredMark /></Text>
            <TextInput style={[st.input, { height: 70, textAlignVertical: 'top', borderColor: Colors.danger + '88' }]} placeholderTextColor={Colors.textMuted} multiline placeholder="Ex.: Valor incorrecto, aluno trocado, erro de método..." value={formRecriar.motivo} onChangeText={v => setFormRecriar(f => ({ ...f, motivo: v }))} />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 8, fontStyle: 'italic' }}>O motivo fica registado na auditoria, junto com o seu utilizador, IP e data.</Text>
            <TouchableOpacity onPress={cancelarERecriar} disabled={cancelarRecriarLoading} style={[st.saveBtn, { backgroundColor: Colors.danger }]}>
              {cancelarRecriarLoading ? <AppLoader size="small" color="#fff" /> : <><Ionicons name="refresh-circle" size={18} color="#fff" /><Text style={st.saveBtnTxt}>Cancelar e Recriar</Text></>}
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Histórico de Auditoria */}
      <Modal visible={showAuditModal} transparent animationType="slide" onRequestClose={() => setShowAuditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={[st.modalBox, { maxHeight: '85%' }]}>
            <View style={st.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>Histórico do Pagamento</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>Registo imutável de auditoria</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAuditModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {auditLoading ? (
              <AppLoader size="large" color={Colors.gold} style={{ marginVertical: 30 }} />
            ) : auditLogs.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
                <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_500Medium', marginTop: 8, textAlign: 'center' }}>
                  Sem registos de auditoria para este pagamento.
                </Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 4, textAlign: 'center' }}>
                  (Apenas administradores conseguem ver a auditoria.)
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 500 }}>
                {auditLogs.map((log: any, idx: number) => {
                  const cor = log.acao === 'criar' ? Colors.success
                    : log.acao === 'eliminar' ? Colors.danger
                    : log.acao === 'atualizar' ? Colors.info
                    : Colors.textMuted;
                  const icone = log.acao === 'criar' ? 'add-circle'
                    : log.acao === 'eliminar' ? 'trash'
                    : log.acao === 'atualizar' ? 'create'
                    : 'ellipse';
                  const dadosObj = (() => {
                    try {
                      return typeof log.dados === 'string' ? JSON.parse(log.dados) : log.dados;
                    } catch { return null; }
                  })();
                  const motivo = dadosObj && (dadosObj.motivo || dadosObj.observacao);
                  return (
                    <View key={log.id || idx} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: idx < auditLogs.length - 1 ? 1 : 0, borderBottomColor: Colors.border }}>
                      <View style={{ alignItems: 'center', width: 24 }}>
                        <Ionicons name={icone as any} size={20} color={cor} />
                        {idx < auditLogs.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 4 }} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={{ backgroundColor: cor + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 10, color: cor, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}>{log.acao}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                            {new Date(log.criadoEm).toLocaleString('pt-PT')}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>{log.descricao}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                          <Ionicons name="person-circle-outline" size={14} color={Colors.textMuted} />
                          <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' }}>
                            {log.userName || log.userEmail}
                          </Text>
                          {log.userRole && (
                            <View style={{ backgroundColor: Colors.background, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>{log.userRole}</Text>
                            </View>
                          )}
                          {log.ipAddress && (
                            <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>· IP {log.ipAddress}</Text>
                          )}
                        </View>
                        {motivo ? (
                          <View style={{ backgroundColor: Colors.warning + '14', borderLeftWidth: 3, borderLeftColor: Colors.warning, padding: 8, borderRadius: 6, marginTop: 6 }}>
                            <Text style={{ fontSize: 10, color: Colors.warning, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', marginBottom: 2 }}>Motivo</Text>
                            <Text style={{ fontSize: 12, color: Colors.text, fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>"{String(motivo)}"</Text>
                          </View>
                        ) : null}
                        {dadosObj && Object.keys(dadosObj).filter(k => k !== 'motivo' && k !== 'observacao').length > 0 ? (
                          <View style={{ backgroundColor: Colors.background, padding: 6, borderRadius: 6, marginTop: 6 }}>
                            <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium', marginBottom: 2 }}>Dados</Text>
                            <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' }} numberOfLines={4}>
                              {Object.entries(dadosObj)
                                .filter(([k]) => k !== 'motivo' && k !== 'observacao')
                                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Definir/Editar Orçamento */}
      <Modal visible={showOrcModal} transparent animationType="slide" onRequestClose={() => setShowOrcModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.modalTitle}>{orcEditItem?.temOrcamento ? 'Editar' : 'Definir'} Orçamento</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }} numberOfLines={1}>{orcEditItem?.rubricaDescricao} · {orcamentoAno}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOrcModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {orcEditItem && (
              <View style={{ backgroundColor: Colors.surface, padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: Colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Já cobrado em {orcamentoAno}:</Text>
                  <Text style={{ fontSize: 12, color: Colors.success, fontFamily: 'Inter_700Bold' }}>{formatAOA(orcEditItem.valorCobrado)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Valor unitário da taxa:</Text>
                  <Text style={{ fontSize: 12, color: Colors.text, fontFamily: 'Inter_500Medium' }}>{formatAOA(orcEditItem.valorTaxa)}</Text>
                </View>
              </View>
            )}
            <Text style={st.inputLabel}>Valor previsto cobrar (Kz)<RequiredMark /></Text>
            <TextInput style={st.input} placeholderTextColor={Colors.textMuted} placeholder="Ex.: 5000000" keyboardType="decimal-pad" value={orcValor} onChangeText={setOrcValor} returnKeyType="next" blurOnSubmit={false} />
            <Text style={st.inputLabel}>Observações</Text>
            <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]} placeholderTextColor={Colors.textMuted} multiline placeholder="Notas internas (opcional)" value={orcObs} onChangeText={setOrcObs} />
            <TouchableOpacity onPress={salvarOrcamento} disabled={orcSaving} style={st.saveBtn}>
              {orcSaving ? <AppLoader size="small" color="#fff" /> : <><Ionicons name="save" size={18} color="#fff" /><Text style={st.saveBtnTxt}>Gravar Orçamento</Text></>}
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Comprovativo de Pagamento */}
      <Modal visible={showComprovativo} transparent animationType="slide" onRequestClose={() => setShowComprovativo(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={[st.modalBox, { maxHeight: '85%' }]}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Comprovativo de Pagamento</Text>
              <TouchableOpacity onPress={() => setShowComprovativo(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {comprovativoPag && (
              <ScrollView>
                {/* Cabeçalho estilo recibo */}
                <View style={{ alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <Ionicons name="school" size={28} color={Colors.gold} />
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>{config.nomeEscola || 'Super Escola'}</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>COMPROVATIVO DE PAGAMENTO</Text>
                  <View style={{ backgroundColor: Colors.success + '22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.success }}>✓ LIQUIDADO</Text>
                  </View>
                </View>

                {/* Dados do aluno */}
                <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Dados do Aluno</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Nome</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1, textAlign: 'right' }}>{comprovativoPag.nomeCompleto}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Nº Matrícula</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text }}>{comprovativoPag.numeroMatricula}</Text>
                  </View>
                </View>

                {/* Dados do pagamento */}
                <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>Dados do Pagamento</Text>
                  {[
                    ['Taxa', comprovativoPag.taxaDescricao],
                    ['Tipo', TIPO_LABEL[comprovativoPag.taxaTipo] ?? comprovativoPag.taxaTipo],
                    ['Valor', formatAOA(comprovativoPag.valor)],
                    ['Data', comprovativoPag.data],
                    ['Método', metodoLabel(comprovativoPag.metodoPagamento)],
                    ['Referência', comprovativoPag.referencia ?? '—'],
                    ['Ano', comprovativoPag.ano],
                  ].map(([label, value]) => (
                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>{label}</Text>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: label === 'Valor' ? Colors.success : Colors.text, flex: 1, textAlign: 'right' }}>{value}</Text>
                    </View>
                  ))}
                </View>

                {/* Assinatura */}
                <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 120, borderBottomWidth: 1, borderBottomColor: Colors.textMuted, marginBottom: 4 }} />
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Assinatura do Responsável</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 80, borderBottomWidth: 1, borderBottomColor: Colors.textMuted, marginBottom: 4 }} />
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Carimbo</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 14 }}>
                  Emitido em {new Date().toLocaleDateString('pt-AO')} · {config.nomeEscola || 'Super Escola'}
                </Text>

                <TouchableOpacity onPress={() => { if (Platform.OS === 'web') { window.print(); } }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, marginTop: 16 }}>
                  <Ionicons name="print-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Imprimir Comprovativo</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Mensagem */}
      <Modal visible={showMsgModal} transparent animationType="slide" onRequestClose={() => setShowMsgModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Enviar Mensagem Privada</Text>
              <TouchableOpacity onPress={() => setShowMsgModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={st.fieldLabel}>Destinatário</Text>
            <View style={[st.selector, { marginBottom: 12 }]}>
              <Ionicons name="person" size={14} color={Colors.gold} />
              <Text style={[st.selectorVal, { flex: 1, marginLeft: 8 }]}>{msgAlunoId ? getNomeAluno(msgAlunoId) : '—'}</Text>
            </View>
            <Text style={st.fieldLabel}>Tipo de Mensagem</Text>
            <View style={[st.metodosRow, { marginBottom: 12 }]}>
              {(['aviso', 'bloqueio', 'rupe', 'geral'] as MensagemFinanceira['tipo'][]).map(t => (
                <TouchableOpacity key={t} style={[st.metodoBtn, msgTipo === t && st.metodoBtnActive]} onPress={() => setMsgTipo(t)}>
                  <Text style={[st.metodoTxt, msgTipo === t && st.metodoTxtActive]}>
                    {t === 'aviso' ? 'Aviso' : t === 'bloqueio' ? 'Bloqueio' : t === 'rupe' ? 'RUPE' : 'Geral'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.fieldLabel}>Mensagem<RequiredMark /></Text>
            <TextInput
              style={[st.input, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Escreva a mensagem para o estudante..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={msgTexto}
              onChangeText={setMsgTexto}
            />
            <TouchableOpacity style={st.saveBtn} onPress={handleEnviarMensagem}>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={st.saveBtnTxt}>Enviar Mensagem</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal RUPE */}
      <Modal visible={showRUPEModal} transparent animationType="slide" onRequestClose={() => { setShowRUPEModal(false); setRupeGerado(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Gerar RUPE</Text>
              <TouchableOpacity onPress={() => { setShowRUPEModal(false); setRupeGerado(null); }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {rupeGerado ? (
              <View style={{ alignItems: 'center', gap: 12, padding: 8 }}>
                <View style={{ backgroundColor: Colors.success + '22', borderRadius: 40, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text, textAlign: 'center' }}>RUPE Gerado com Sucesso</Text>
                <View style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, width: '100%', borderWidth: 1, borderColor: Colors.border }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginBottom: 4 }}>Referência</Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.gold }}>{rupeGerado.referencia}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 8, marginBottom: 4 }}>Valor</Text>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text }}>{formatAOA(rupeGerado.valor)}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 8, marginBottom: 4 }}>Válido até</Text>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text }}>{new Date(rupeGerado.dataValidade).toLocaleDateString('pt-PT')}</Text>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>O estudante foi notificado com a referência.</Text>
                <TouchableOpacity style={st.saveBtn} onPress={() => { setShowRUPEModal(false); setRupeGerado(null); }}>
                  <Text style={st.saveBtnTxt}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={st.fieldLabel}>Estudante</Text>
                <View style={[st.selector, { marginBottom: 12 }]}>
                  <Ionicons name="person" size={14} color={Colors.gold} />
                  <Text style={[st.selectorVal, { flex: 1, marginLeft: 8 }]}>{rupeAlunoId ? getNomeAluno(rupeAlunoId) : '—'}</Text>
                </View>
                <Text style={st.fieldLabel}>Rubrica<RequiredMark /></Text>
                <TouchableOpacity style={st.selector} onPress={() => setShowTaxaList(v => !v)}>
                  <Text style={rupeTaxaId ? st.selectorVal : st.selectorPh}>
                    {rupeTaxaId ? getNomeTaxa(rupeTaxaId) : 'Selecionar rubrica...'}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
                </TouchableOpacity>
                {showTaxaList && (
                  <ScrollView style={st.dropList} nestedScrollEnabled>
                    {taxasAtivas.map(t => (
                      <TouchableOpacity key={t.id} style={[st.dropItem, rupeTaxaId === t.id && st.dropItemActive]}
                        onPress={() => { setRupeTaxaId(t.id); setRupeValor(t.valor.toString()); setShowTaxaList(false); }}>
                        <Text style={[st.dropItemTxt, rupeTaxaId === t.id && { color: Colors.gold }]}>{t.descricao}</Text>
                        <Text style={st.dropItemSub}>{formatAOA(t.valor)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <Text style={st.fieldLabel}>Valor (AOA)</Text>
                <TextInput style={st.input} placeholder="Preenchido automaticamente" placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric" value={rupeValor} onChangeText={setRupeValor} />
                <TouchableOpacity style={st.saveBtn} onPress={handleGerarRUPE}>
                  <Ionicons name="receipt" size={16} color="#fff" />
                  <Text style={st.saveBtnTxt}>Gerar RUPE</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Multa */}
      <Modal visible={showMultaModal} transparent animationType="slide" onRequestClose={() => setShowMultaModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Configurar Multa de Atraso</Text>
              <TouchableOpacity onPress={() => setShowMultaModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={st.rubricaInfoBanner}>
                <Ionicons name="information-circle" size={14} color={Colors.info} />
                <Text style={[st.rubricaInfoTxt, { fontSize: 11 }]}>
                  A multa conta a partir do dia configurado após o fim do mês. Escolha UM modo: valor fixo por dia, percentagem por dia (acumula diariamente) OU percentagem por mês. A prioridade é: valor/dia {'>'} %/dia {'>'} %/mês — preencha apenas o que pretende usar e deixe os outros a 0.
                </Text>
              </View>
              <Text style={st.fieldLabel}>Dia do mês em que começa a contar a multa</Text>
              <TextInput style={st.input} placeholder="Ex: 10 (começa no dia 10 do mês seguinte)" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={multaDiaInicio} onChangeText={setMultaDiaInicio} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.fieldLabel}>Valor fixo por dia de atraso (Kz)</Text>
              <TextInput style={st.input} placeholder="Ex: 500 (0 = não usa)" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={multaValorDia} onChangeText={setMultaValorDia} returnKeyType="next" blurOnSubmit={false} />
              <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />
              <Text style={st.fieldLabel}>Percentagem por dia de atraso (%) — acumula diariamente</Text>
              <TextInput style={st.input} placeholder="Ex: 0,5 (cobra 0,5% da propina por cada dia em atraso)" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={multaPctDia} onChangeText={setMultaPctDia} returnKeyType="next" blurOnSubmit={false} />
              <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />
              <Text style={[st.fieldLabel, { color: Colors.textMuted }]}>Alternativa: Percentagem por mês de atraso (%)</Text>
              <TextInput style={st.input} placeholder="Ex: 10 (ignorado se valor/dia ou %/dia > 0)" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={multaPct} onChangeText={setMultaPct} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.fieldLabel}>Dias de carência após o dia de início</Text>
              <TextInput style={st.input} placeholder="Ex: 5" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={multaDias} onChangeText={setMultaDias} returnKeyType="done" onSubmitEditing={handleSalvarMulta} />
              <Text style={st.fieldLabel}>Estado da multa</Text>
              <View style={st.metodosRow}>
                <TouchableOpacity style={[st.metodoBtn, multaConfig.ativo && st.metodoBtnActive]} onPress={() => updateMultaConfig({ ativo: true })}>
                  <Text style={[st.metodoTxt, multaConfig.ativo && st.metodoTxtActive]}>Activa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.metodoBtn, !multaConfig.ativo && st.metodoBtnActive]} onPress={() => updateMultaConfig({ ativo: false })}>
                  <Text style={[st.metodoTxt, !multaConfig.ativo && st.metodoTxtActive]}>Inactiva</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[st.saveBtn, { marginTop: 16 }]} onPress={handleSalvarMulta}>
                <Ionicons name="save" size={16} color="#fff" />
                <Text style={st.saveBtnTxt}>Guardar Configuração</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Justificação de Faltas (Liquidado) */}
      <Modal visible={showFaltasJustifModal} transparent animationType="slide" onRequestClose={() => setShowFaltasJustifModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Justificação Paga de Faltas</Text>
              <TouchableOpacity onPress={() => setShowFaltasJustifModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={st.rubricaInfoBanner}>
                <Ionicons name="information-circle" size={14} color={Colors.info} />
                <Text style={[st.rubricaInfoTxt, { fontSize: 11 }]}>
                  Defina a partir de quantas faltas o aluno pode pedir justificação paga e o valor a cobrar por cada falta. O pedido segue para a Secretaria; após aprovação, o aluno gera o RUPE; após pagamento confirmado, as faltas passam automaticamente a justificadas (J).
                </Text>
              </View>
              <Text style={st.fieldLabel}>Mínimo de faltas para permitir justificação</Text>
              <TextInput style={st.input} placeholder="Ex: 3" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={faltasJustifMin} onChangeText={setFaltasJustifMin} returnKeyType="next" blurOnSubmit={false} />
              <Text style={st.fieldLabel}>Valor a cobrar por cada falta justificada (Kz)</Text>
              <TextInput style={st.input} placeholder="Ex: 500" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" value={faltasJustifValor} onChangeText={setFaltasJustifValor} returnKeyType="done" onSubmitEditing={handleSalvarFaltasJustif} />
              <Text style={st.fieldLabel}>Estado do serviço</Text>
              <View style={st.metodosRow}>
                <TouchableOpacity style={[st.metodoBtn, faltasJustifConfig.ativo && st.metodoBtnActive]} onPress={() => updateFaltasJustifConfig({ ativo: true })}>
                  <Text style={[st.metodoTxt, faltasJustifConfig.ativo && st.metodoTxtActive]}>Activo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.metodoBtn, !faltasJustifConfig.ativo && st.metodoBtnActive]} onPress={() => updateFaltasJustifConfig({ ativo: false })}>
                  <Text style={[st.metodoTxt, !faltasJustifConfig.ativo && st.metodoTxtActive]}>Inactivo</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[st.saveBtn, { marginTop: 16 }]} onPress={handleSalvarFaltasJustif}>
                <Ionicons name="save" size={16} color="#fff" />
                <Text style={st.saveBtnTxt}>Guardar Configuração</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Isenção de Multa */}
      <Modal visible={showIsencaoModal} transparent animationType="slide" onRequestClose={() => setShowIsencaoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Solicitar Isenção de Multa</Text>
              <TouchableOpacity onPress={() => setShowIsencaoModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={st.rubricaInfoBanner}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.warning} />
              <Text style={[st.rubricaInfoTxt, { fontSize: 11 }]}>
                Este pedido será enviado ao Director para aprovação. Após aprovação, a multa será dispensada para este aluno.
              </Text>
            </View>
            {isencaoAlunoId && (() => {
              const a = alunos.find(x => x.id === isencaoAlunoId);
              return a ? <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.text, fontSize: 14, marginBottom: 10 }}>{a.nome} {a.apelido}</Text> : null;
            })()}
            <Text style={st.fieldLabel}>Justificativa<RequiredMark /></Text>
            <TextInput
              style={[st.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="Ex: Situação de vulnerabilidade económica comprovada"
              placeholderTextColor={Colors.textMuted}
              multiline
              value={isencaoJustif}
              onChangeText={setIsencaoJustif}
            />
            <TouchableOpacity
              style={[st.saveBtn, { marginTop: 12, opacity: isencaoLoading ? 0.6 : 1 }]}
              onPress={handleSolicitarIsencao}
              disabled={isencaoLoading}
            >
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={st.saveBtnTxt}>{isencaoLoading ? 'A enviar...' : 'Enviar Pedido ao Director'}</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Bloqueio de Ordem Contabilística */}
      <Modal visible={!!confirmOrdemMes} transparent animationType="fade" onRequestClose={() => setConfirmOrdemMes(null)}>
        <View style={st.modalOverlay}>
          <View style={[st.modalBox, { maxWidth: 360 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.danger} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.danger }}>
                Pagamento Bloqueado
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 10 }}>
              Não é possível registar{' '}
              <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>
                {confirmOrdemMes ? MESES_ABREV_FULL[(confirmOrdemMes.mes - 1)] : ''}
              </Text>
              {' '}enquanto os seguintes meses anteriores não estiverem pagos:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {confirmOrdemMes?.mesesEmFalta.map(m => (
                <View key={m} style={{ backgroundColor: Colors.danger + '22', borderWidth: 1, borderColor: Colors.danger + '88', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{MESES_ABREV_FULL[m - 1]}</Text>
                </View>
              ))}
            </View>
            <View style={{ backgroundColor: Colors.danger + '11', borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: Colors.danger + '33' }}>
              <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
                💡 Comece por pagar {confirmOrdemMes ? MESES_ABREV_FULL[(confirmOrdemMes.mesesEmFalta[0] - 1)] : ''} (mês mais antigo em falta)
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setConfirmOrdemMes(null)}
              style={{ paddingVertical: 11, borderRadius: 8, backgroundColor: Colors.danger + '18', borderWidth: 1, borderColor: Colors.danger + '55', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Pagamento */}
      <Modal visible={showModalPag} transparent animationType="slide" onRequestClose={() => { setShowModalPag(false); setMultaEstimadaCaderneta(0); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Registar Pagamento</Text>
              <TouchableOpacity onPress={() => { setShowModalPag(false); setMultaEstimadaCaderneta(0); }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.fieldLabel}>Aluno<RequiredMark /></Text>
              {formPag.alunoBloqueado ? (
                <View style={[st.selector, { backgroundColor: Colors.surface, opacity: 0.75 }]}>
                  <Text style={st.selectorVal}>{getNomeAluno(formPag.alunoId)}</Text>
                  <Ionicons name="lock-closed" size={13} color={Colors.textMuted} />
                </View>
              ) : (
                <>
                  <TouchableOpacity style={st.selector} onPress={() => setShowAlunoList(v => !v)}>
                    <Text style={formPag.alunoId ? st.selectorVal : st.selectorPh}>
                      {formPag.alunoId ? getNomeAluno(formPag.alunoId) : 'Selecionar aluno...'}
                    </Text>
                    <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showAlunoList && (
                    <ScrollView style={st.dropList} nestedScrollEnabled>
                      {alunos.filter(a => a.ativo).map(a => (
                        <TouchableOpacity key={a.id} style={[st.dropItem, formPag.alunoId === a.id && st.dropItemActive]}
                          onPress={() => { setFormPag(f => ({ ...f, alunoId: a.id })); setShowAlunoList(false); }}>
                          <Text style={[st.dropItemTxt, formPag.alunoId === a.id && { color: Colors.gold }]}>{a.nome} {a.apelido}</Text>
                          <Text style={st.dropItemSub}>{turmas.find(t => t.id === a.turmaId)?.nome || ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              )}
              <Text style={st.fieldLabel}>Rubrica<RequiredMark /></Text>
              {formPag.rubricaBloqueada ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={[st.selector, { flex: 1, backgroundColor: Colors.surface, opacity: 0.75 }]}>
                    <Text style={st.selectorVal}>{getNomeTaxa(formPag.taxaId)}</Text>
                    <Ionicons name="lock-closed" size={13} color={Colors.textMuted} />
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={st.selector} onPress={() => setShowTaxaList(v => !v)}>
                    <Text style={formPag.taxaId ? st.selectorVal : st.selectorPh}>
                      {formPag.taxaId ? getNomeTaxa(formPag.taxaId) : 'Selecionar rubrica...'}
                    </Text>
                    <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showTaxaList && (
                    <ScrollView style={st.dropList} nestedScrollEnabled>
                      {taxasAtivas.map(t => (
                        <TouchableOpacity key={t.id} style={[st.dropItem, formPag.taxaId === t.id && st.dropItemActive]}
                          onPress={() => { setFormPag(f => ({ ...f, taxaId: t.id, valor: t.valor != null ? String(t.valor) : '' })); setShowTaxaList(false); }}>
                          <Text style={[st.dropItemTxt, formPag.taxaId === t.id && { color: Colors.gold }]}>{t.descricao}</Text>
                          <Text style={st.dropItemSub}>{formatAOA(t.valor)} · {t.nivel}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              )}
              <Text style={st.fieldLabel}>Valor (AOA)</Text>
              {formPag.rubricaBloqueada ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[st.input, { flex: 1, justifyContent: 'center', backgroundColor: Colors.surface, opacity: 0.75 }]}>
                    <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{formPag.valor || '—'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="lock-closed" size={12} color={Colors.textMuted} />
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Definido pela rubrica</Text>
                  </View>
                </View>
              ) : (
                <TextInput style={st.input} placeholder="Preenche automaticamente" placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric" value={formPag.valor} onChangeText={v => setFormPag(f => ({ ...f, valor: v }))} />
              )}

              {/* Banner de multa — aparece quando o mês está em atraso */}
              {multaEstimadaCaderneta > 0 && (
                <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: Colors.danger + '14', borderWidth: 1, borderColor: Colors.danger + '55', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="warning-outline" size={18} color={Colors.danger} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger }}>Propina vencida — Multa estimada</Text>
                    <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      Multa: <Text style={{ fontFamily: 'Inter_700Bold' }}>{formatAOA(multaEstimadaCaderneta)} Kz</Text>
                    </Text>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                      Total a cobrar: <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{formatAOA(Number(formPag.valor || 0) + multaEstimadaCaderneta)} Kz</Text>
                    </Text>
                    <Text style={{ fontSize: 9, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 3 }}>
                      A multa é somada automaticamente ao valor da propina no total a pagar.
                    </Text>
                  </View>
                </View>
              )}

              <Text style={st.fieldLabel}>Método de Pagamento</Text>
              <View style={st.metodosRow}>
                {(['multicaixa','referencia_bancaria'] as MetodoPagamento[]).map(m => (
                  <TouchableOpacity key={m} style={[st.metodoBtn, formPag.metodoPagamento === m && st.metodoBtnActive]}
                    onPress={() => setFormPag(f => ({ ...f, metodoPagamento: m }))}>
                    <Text style={[st.metodoTxt, formPag.metodoPagamento === m && st.metodoTxtActive]}>{metodoLabel(m)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={st.fieldLabel}>Mês de Referência</Text>
              {formPag.mesBloqueado ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                  <View style={[st.mesBtnActive, { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }]}>
                    <Text style={[st.mesTxtActive, { fontSize: 13 }]}>{MESES[parseInt(formPag.mes) - 1]}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="lock-closed" size={12} color={Colors.textMuted} />
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Mês definido pela caderneta</Text>
                  </View>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
                    {MESES.map((m, i) => (
                      <TouchableOpacity key={m} style={[st.mesBtn, formPag.mes === String(i + 1) && st.mesBtnActive]}
                        onPress={() => setFormPag(f => ({ ...f, mes: f.mes === String(i + 1) ? '' : String(i + 1) }))}>
                        <Text style={[st.mesTxt, formPag.mes === String(i + 1) && st.mesTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
              {formPag.metodoPagamento === 'multicaixa' ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={st.fieldLabel}>Nº Comprovativo POS</Text>
                    <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>POS / Multicaixa</Text>
                    </View>
                  </View>
                  <TextInput
                    style={st.input}
                    placeholder="Ex: 123456789012"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    value={formPag.referencia}
                    onChangeText={v => setFormPag(f => ({ ...f, referencia: v }))}
                  />
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: -6, marginBottom: 4 }}>
                    Nº impresso no talão do terminal POS Multicaixa
                  </Text>
                </>
              ) : (
                <>
                  <Text style={st.fieldLabel}>Referência</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 }}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />
                    <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular', flex: 1 }}>
                      Gerada automaticamente (EMIS/Multicaixa). O sistema confirma o pagamento sozinho quando for efectuado.
                    </Text>
                  </View>
                </>
              )}
              <Text style={st.fieldLabel}>Observação (opcional)</Text>
              <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]} placeholder="Observações..." placeholderTextColor={Colors.textMuted}
                multiline value={formPag.observacao} onChangeText={v => setFormPag(f => ({ ...f, observacao: v }))} />
              <TouchableOpacity style={st.saveBtn} onPress={confirmarPagamento}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={st.saveBtnTxt}>Registar Pagamento</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Overlay de confirmação */}
            {showConfirmPag && (() => {
              const nomeAluno = getNomeAluno(formPag.alunoId);
              const nomeRubrica = getNomeTaxa(formPag.taxaId);
              const valorPropinaNum = parseFloat(formPag.valor) || 0;
              const valorMultaNum = multaEstimadaCaderneta || 0;
              const valorTotalNum = valorPropinaNum + valorMultaNum;
              const nomeMes = formPag.mes ? MESES[parseInt(formPag.mes) - 1] : null;
              const metodo = metodoLabel(formPag.metodoPagamento);
              const isReferencia = formPag.metodoPagamento === 'referencia_bancaria';
              return (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <View style={{ backgroundColor: Colors.card, borderRadius: 16, padding: 22, width: '100%', gap: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <Ionicons name="alert-circle" size={20} color={Colors.gold} />
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>Confirmar Pagamento</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Aluno</Text>
                        <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right', maxWidth: '65%' }}>{nomeAluno}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Rubrica</Text>
                        <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold', flexShrink: 1, textAlign: 'right', maxWidth: '65%' }}>{nomeRubrica}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Propina</Text>
                        <Text style={{ fontSize: 14, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>{formatAOA(valorPropinaNum)}</Text>
                      </View>
                      {valorMultaNum > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: Colors.danger, fontFamily: 'Inter_400Regular' }}>Multa</Text>
                          <Text style={{ fontSize: 14, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>{formatAOA(valorMultaNum)}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 6, marginTop: 2 }}>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' }}>Total a pagar</Text>
                        <Text style={{ fontSize: 16, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{formatAOA(valorTotalNum)}</Text>
                      </View>
                      {nomeMes && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Mês</Text>
                          <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>{nomeMes}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Método</Text>
                        <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>{metodo}</Text>
                      </View>
                      {isReferencia && (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.info + '14', borderRadius: 8, padding: 8, marginTop: 2 }}>
                          <Ionicons name="time-outline" size={14} color={Colors.info} style={{ marginTop: 1 }} />
                          <Text style={{ fontSize: 11, color: Colors.info, fontFamily: 'Inter_400Regular', flex: 1 }}>
                            Será gerada uma referência de pagamento. O sistema aguarda e confirma automaticamente quando o pagamento for efectuado.
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                      <TouchableOpacity onPress={() => setShowConfirmPag(false)} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textMuted }}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => { setShowConfirmPag(false); await registarPagamento(); }}
                        disabled={isSalvandoRupe}
                        style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: isSalvandoRupe ? Colors.gold + 'aa' : Colors.gold, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        {isSalvandoRupe
                          ? <AppLoader size="small" color="#fff" />
                          : <Ionicons name="checkmark-circle" size={16} color="#fff" />}
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                          {isSalvandoRupe ? 'A gerar…' : isReferencia ? 'Gerar Referência' : 'Confirmar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal RUPE Gerado — comprovativo */}
      <Modal visible={!!rupeConfirmado} transparent animationType="fade" onRequestClose={() => setRupeConfirmado(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 24 }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: 18, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center', gap: 4 }}>
            {/* Ícone sucesso */}
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <Ionicons name="checkmark-circle" size={34} color={Colors.success} />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text, textAlign: 'center' }}>Referência Gerada!</Text>
            {rupeConfirmado && (
              <>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 2 }}>
                  {rupeConfirmado.nomeAluno}{rupeConfirmado.nomeMes ? ` — ${rupeConfirmado.nomeMes}` : ''}
                </Text>
                <View style={{ marginTop: 14, backgroundColor: Colors.background, borderRadius: 12, padding: 14, width: '100%', gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted }}>Referência</Text>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.gold, letterSpacing: 1 }}>{rupeConfirmado.referencia}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted }}>Valor</Text>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text }}>{formatAOA(rupeConfirmado.valor)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted }}>Validade</Text>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text }}>{rupeConfirmado.dataValidade ? new Date(rupeConfirmado.dataValidade).toLocaleDateString('pt-AO') : '—'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted }}>Rubrica</Text>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text }}>{rupeConfirmado.descricao}</Text>
                  </View>
                </View>
                {/* Botões */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' }}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      onPress={() => openPdfInTab(`/api/pdf/multicaixa/${encodeURIComponent(rupeConfirmado!.id)}`)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.gold }}>
                      <Ionicons name="print-outline" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>Imprimir</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setRupeConfirmado(null)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textMuted }}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Rubrica */}
      <Modal visible={showModalTaxa} transparent animationType="slide" onRequestClose={() => setShowModalTaxa(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>{editTaxa ? 'Editar Rubrica' : 'Nova Rubrica'}</Text>
              <TouchableOpacity onPress={() => { setShowModalTaxa(false); setEditTaxa(null); }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={st.rubricaInfoBanner}>
                <Ionicons name="flash" size={14} color={Colors.info} />
                <Text style={[st.rubricaInfoTxt, { fontSize: 11 }]}>
                  Esta rubrica aparecerá automaticamente no perfil financeiro dos alunos do nível e ano lectivo seleccionados.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 4 }}>
                <Text style={st.fieldLabel}>Tipo</Text>
                <TouchableOpacity onPress={() => { setShowAddTipo(v => !v); setNewTipoLabel(''); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '11' }}>
                  <Ionicons name={showAddTipo ? 'close' : 'add'} size={13} color={Colors.gold} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>{showAddTipo ? 'Cancelar' : 'Criar Tipo'}</Text>
                </TouchableOpacity>
              </View>

              {showAddTipo && (
                <View style={{ marginBottom: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface }}>
                  <TextInput
                    style={[st.input, { marginBottom: 8 }]}
                    placeholder="Nome do novo tipo (ex: Transporte)"
                    placeholderTextColor={Colors.textMuted}
                    value={newTipoLabel}
                    onChangeText={setNewTipoLabel}
                    autoFocus
                  />
                  <Text style={[st.fieldLabel, { marginTop: 2 }]}>Ícone</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {ICONES_TIPO.map(ic => {
                      const active = newTipoIcon === ic;
                      return (
                        <TouchableOpacity key={ic} onPress={() => setNewTipoIcon(ic)}
                          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                            borderWidth: 1.5, borderColor: active ? newTipoCor : Colors.border,
                            backgroundColor: active ? newTipoCor + '22' : Colors.background }}>
                          <Ionicons name={ic as any} size={16} color={active ? newTipoCor : Colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[st.fieldLabel, { marginTop: 2 }]}>Cor</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {CORES_TIPO.map(c => {
                      const active = newTipoCor === c;
                      return (
                        <TouchableOpacity key={c} onPress={() => setNewTipoCor(c)}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c,
                            borderWidth: active ? 3 : 1, borderColor: active ? Colors.text : Colors.border,
                            alignItems: 'center', justifyContent: 'center' }}>
                          {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: newTipoCor + '15' }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: newTipoCor }}>
                        <Ionicons name={newTipoIcon as any} size={14} color="#fff" />
                      </View>
                      <Text style={{ fontSize: 12, color: newTipoCor, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                        {newTipoLabel.trim() || 'Pré-visualização'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={criarNovoTipo}
                      disabled={savingTipo || !newTipoLabel.trim()}
                      style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: newTipoLabel.trim() ? Colors.gold : Colors.border, opacity: savingTipo ? 0.6 : 1 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff' }}>{savingTipo ? '...' : 'Criar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {TIPOS.filter(t => propinaHabilitada || t !== 'propina').map(t => {
                  const cor = tipoCor(t);
                  const icone = tipoIcon(t);
                  const label = tipoLabel(t);
                  const selected = formTaxa.tipo === t;
                  const isCustom = !TIPOS_PROTEGIDOS.includes(t);
                  return (
                    <View key={t} style={{ minWidth: '45%', flex: 1, position: 'relative' }}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, paddingRight: isCustom ? 56 : 14, borderRadius: 10, borderWidth: 1.5,
                          borderColor: selected ? cor : Colors.border,
                          backgroundColor: selected ? cor + '22' : Colors.surface,
                        }}
                        onPress={() => setFormTaxa(f => ({ ...f, tipo: t }))}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? cor : cor + '22' }}>
                          <Ionicons name={icone as any} size={14} color={selected ? '#fff' : cor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontFamily: selected ? 'Inter_700Bold' : 'Inter_500Medium', color: selected ? cor : Colors.text }} numberOfLines={1}>{label}</Text>
                        </View>
                        {selected && !isCustom && <Ionicons name="checkmark-circle" size={16} color={cor} />}
                      </TouchableOpacity>
                      {isCustom && (
                        <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => abrirEdicaoTipo(t)}
                            accessibilityLabel={`Renomear tipo ${label}`}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: Colors.info + '22', borderWidth: 1, borderColor: Colors.info + '55' }}>
                            <Ionicons name="create-outline" size={12} color={Colors.info} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => apagarTipo(t)}
                            accessibilityLabel={`Apagar tipo ${label}`}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: Colors.danger + '22', borderWidth: 1, borderColor: Colors.danger + '55' }}>
                            <Ionicons name="trash-outline" size={12} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={st.fieldLabel}>Descrição<RequiredMark /></Text>
              <TextInput
                style={[st.input, taxaErrors.descricao ? { borderColor: Colors.danger, borderWidth: 1.5 } : null]}
                placeholder="Ex: Propina Mensal — I Ciclo" placeholderTextColor={Colors.textMuted}
                value={formTaxa.descricao}
                onChangeText={v => { setFormTaxa(f => ({ ...f, descricao: v })); if (taxaErrors.descricao || taxaErrors.submit) setTaxaErrors(e => ({ ...e, descricao: undefined, submit: undefined })); }}
                returnKeyType="next" blurOnSubmit={false} maxLength={120} />
              {taxaErrors.descricao ? (
                <Text style={{ color: Colors.danger, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: -8, marginBottom: 10 }}>
                  {taxaErrors.descricao}
                </Text>
              ) : null}
              <Text style={st.fieldLabel}>Valor (AOA)<RequiredMark /></Text>
              <TextInput
                style={[st.input, taxaErrors.valor ? { borderColor: Colors.danger, borderWidth: 1.5 } : null]}
                placeholder="Ex: 5000" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                value={formTaxa.valor}
                onChangeText={v => { setFormTaxa(f => ({ ...f, valor: v })); if (taxaErrors.valor || taxaErrors.submit) setTaxaErrors(e => ({ ...e, valor: undefined, submit: undefined })); }}
                returnKeyType="done" onSubmitEditing={gravarTaxa} />
              {taxaErrors.valor ? (
                <Text style={{ color: Colors.danger, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: -8, marginBottom: 10 }}>
                  {taxaErrors.valor}
                </Text>
              ) : null}
              <Text style={st.fieldLabel}>Frequência</Text>
              <View style={st.metodosRow}>
                {FREQS.map(({ k, l }) => (
                  <TouchableOpacity key={k} style={[st.metodoBtn, formTaxa.frequencia === k && st.metodoBtnActive]}
                    onPress={() => setFormTaxa(f => ({ ...f, frequencia: k }))}>
                    <Text style={[st.metodoTxt, formTaxa.frequencia === k && st.metodoTxtActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={st.fieldLabel}>Nível Escolar</Text>
              <View style={st.metodosRow}>
                {NIVEIS.map(n => (
                  <TouchableOpacity key={n} style={[st.metodoBtn, formTaxa.nivel === n && st.metodoBtnActive]}
                    onPress={() => setFormTaxa(f => ({ ...f, nivel: n }))}>
                    <Text style={[st.metodoTxt, formTaxa.nivel === n && st.metodoTxtActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {taxaErrors.submit ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.danger + '15', borderWidth: 1, borderColor: Colors.danger + '55', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Ionicons name="alert-circle" size={16} color={Colors.danger} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, color: Colors.danger, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 }}>
                    {taxaErrors.submit}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[st.saveBtn, savingTaxa ? { opacity: 0.6 } : null]}
                onPress={gravarTaxa}
                disabled={savingTaxa}>
                <Ionicons name={savingTaxa ? 'hourglass' : 'checkmark-circle'} size={18} color="#fff" />
                <Text style={st.saveBtnTxt}>{savingTaxa ? 'A guardar...' : (editTaxa ? 'Guardar Alterações' : 'Criar Rubrica')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Editar Tipo de Rubrica Personalizado */}
      <Modal visible={showEditTipo} transparent animationType="fade" onRequestClose={() => setShowEditTipo(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={[st.modalBox, { maxWidth: 460 }]}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Editar Tipo de Rubrica</Text>
              <TouchableOpacity onPress={() => setShowEditTipo(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={st.rubricaInfoBanner}>
                <Ionicons name="information-circle" size={14} color={Colors.info} />
                <Text style={[st.rubricaInfoTxt, { fontSize: 11 }]}>
                  Pode alterar o nome, ícone e cor do tipo. As rubricas e pagamentos existentes mantêm-se ligados automaticamente.
                </Text>
              </View>
              <Text style={st.fieldLabel}>Nome do Tipo</Text>
              <TextInput
                style={[st.input, { marginBottom: 10 }]}
                placeholder="Ex: Transporte"
                placeholderTextColor={Colors.textMuted}
                value={editTipoLabel}
                onChangeText={setEditTipoLabel}
                autoFocus
              />
              <Text style={[st.fieldLabel, { marginTop: 2 }]}>Ícone</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {ICONES_TIPO.map(ic => {
                  const active = editTipoIcon === ic;
                  return (
                    <TouchableOpacity key={ic} onPress={() => setEditTipoIcon(ic)}
                      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                        borderWidth: 1.5, borderColor: active ? editTipoCor : Colors.border,
                        backgroundColor: active ? editTipoCor + '22' : Colors.background }}>
                      <Ionicons name={ic as any} size={16} color={active ? editTipoCor : Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[st.fieldLabel, { marginTop: 2 }]}>Cor</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {CORES_TIPO.map(c => {
                  const active = editTipoCor === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => setEditTipoCor(c)}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c,
                        borderWidth: active ? 3 : 1, borderColor: active ? Colors.text : Colors.border,
                        alignItems: 'center', justifyContent: 'center' }}>
                      {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, backgroundColor: editTipoCor + '15', marginBottom: 14 }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: editTipoCor }}>
                  <Ionicons name={editTipoIcon as any} size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Pré-visualização</Text>
                  <Text style={{ fontSize: 14, color: editTipoCor, fontFamily: 'Inter_700Bold' }} numberOfLines={1}>
                    {editTipoLabel.trim() || 'Nome do tipo'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowEditTipo(false)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={guardarEdicaoTipo}
                  disabled={savingEditTipo || !editTipoLabel.trim()}
                  style={{ flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: editTipoLabel.trim() ? Colors.info : Colors.border, opacity: savingEditTipo ? 0.6 : 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name={savingEditTipo ? 'hourglass' : 'checkmark-circle'} size={16} color="#fff" />
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff' }}>{savingEditTipo ? 'A guardar...' : 'Guardar alterações'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Registo de Óbito */}
      <Modal visible={showObituarioModal} transparent animationType="slide" onRequestClose={() => setShowObituarioModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="ribbon" size={18} color="#6B21A8" />
                <Text style={[st.modalTitle, { color: '#6B21A8' }]}>Registar Óbito</Text>
              </View>
              <TouchableOpacity onPress={() => setShowObituarioModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {obituarioAlunoId && (() => {
              const alunoObit = alunos.find(a => a.id === obituarioAlunoId);
              return alunoObit ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#6B21A811', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#6B21A844' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#6B21A822', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#6B21A8' }}>{alunoObit.nome[0]}{alunoObit.apelido[0]}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{alunoObit.nome} {alunoObit.apelido}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{alunoObit.numeroMatricula}</Text>
                  </View>
                </View>
              ) : null;
            })()}

            <View style={[st.rubricaInfoBanner, { borderColor: '#6B21A844', backgroundColor: '#6B21A811' }]}>
              <Ionicons name="information-circle" size={14} color="#6B21A8" />
              <Text style={[st.rubricaInfoTxt, { color: '#6B21A8' }]}>
                Esta acção é irreversível. O estudante será arquivado, o acesso bloqueado e a conta inactivada. Apenas o Chefe de Secretaria ou superiores podem executar este registo.
              </Text>
            </View>

            <Text style={st.fieldLabel}>Data de Falecimento</Text>
            <TextInput
              style={st.input}
              placeholder="DD/MM/AAAA (opcional)"
              placeholderTextColor={Colors.textMuted}
              value={obituarioData}
              onChangeText={setObituarioData}
            />

            <Text style={st.fieldLabel}>Observações / Notas</Text>
            <TextInput
              style={[st.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Informações adicionais (opcional)"
              placeholderTextColor={Colors.textMuted}
              multiline
              value={obituarioObs}
              onChangeText={setObituarioObs}
            />

            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: '#6B21A8', marginTop: 8 }, obituarioLoading && { opacity: 0.6 }]}
              onPress={() => {
                webAlert(
                  'Confirmar Registo de Óbito',
                  'Esta acção é permanente e irá bloquear e arquivar a conta do estudante. Confirmar?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Confirmar', style: 'destructive', onPress: handleRegistarObito },
                  ]
                );
              }}
              disabled={obituarioLoading}
            >
              <Ionicons name="ribbon" size={16} color="#fff" />
              <Text style={st.saveBtnTxt}>{obituarioLoading ? 'A processar...' : 'Confirmar Registo de Óbito'}</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Adicionar Saldo ───────────────────────────────────────── */}
      <Modal visible={showSaldoModal} transparent animationType="slide" onRequestClose={() => setShowSaldoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="wallet" size={18} color={Colors.success} />
                <Text style={[st.modalTitle, { color: Colors.success }]}>Gestão de Saldo</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSaldoModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {saldoAlunoId && (() => {
              const alunoSaldo = alunos.find(a => a.id === saldoAlunoId);
              const saldoInfo = getSaldoAluno(saldoAlunoId);
              return (
                <>
                  {alunoSaldo && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '11', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.success + '33' }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.success }}>{alunoSaldo.nome[0]}{alunoSaldo.apelido[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{alunoSaldo.nome} {alunoSaldo.apelido}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{alunoSaldo.numeroMatricula}</Text>
                      </View>
                      {saldoInfo && saldoInfo.saldo > 0 && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Saldo actual</Text>
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.success }}>{formatAOA(saldoInfo.saldo)}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <Text style={st.fieldLabel}>Valor a Creditiar (AOA)<RequiredMark /></Text>
                  <TextInput
                    style={st.input}
                    placeholder="Ex: 50000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    value={saldoValor}
                    onChangeText={setSaldoValor}
                  />
                  <Text style={st.fieldLabel}>Descrição</Text>
                  <TextInput
                    style={st.input}
                    placeholder="Ex: Excesso de pagamento propina Fevereiro"
                    placeholderTextColor={Colors.textMuted}
                    value={saldoDescricao}
                    onChangeText={setSaldoDescricao}
                  />
                  <Text style={st.fieldLabel}>Data da Próxima Cobrança</Text>
                  <TextInput
                    style={st.input}
                    placeholder="DD/MM/AAAA (opcional)"
                    placeholderTextColor={Colors.textMuted}
                    value={saldoDataCobranca}
                    onChangeText={setSaldoDataCobranca}
                  />
                  <Text style={st.fieldLabel}>Observações</Text>
                  <TextInput
                    style={[st.input, { height: 70, textAlignVertical: 'top' }]}
                    placeholder="Notas adicionais (opcional)"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={saldoObs}
                    onChangeText={setSaldoObs}
                  />
                </>
              );
            })()}

            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: Colors.success, marginTop: 8 }, saldoLoading && { opacity: 0.6 }]}
              onPress={handleAdicionarSaldo}
              disabled={saldoLoading}
            >
              <Ionicons name="wallet" size={16} color="#fff" />
              <Text style={st.saveBtnTxt}>{saldoLoading ? 'A processar...' : 'Adicionar Saldo'}</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Transferir Pagamento ──────────────────────────────────── */}
      <Modal visible={showTransferModal} transparent animationType="slide" onRequestClose={() => setShowTransferModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <View style={st.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="swap-horizontal" size={18} color={Colors.info} />
                <Text style={[st.modalTitle, { color: Colors.info }]}>Transferir Pagamento</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {transferPagId && (() => {
              const pag = pagamentos.find(p => p.id === transferPagId);
              if (!pag) return null;
              return (
                <>
                  <View style={[st.rubricaInfoBanner, { borderColor: Colors.info + '44', backgroundColor: Colors.info + '11', marginBottom: 16 }]}>
                    <Ionicons name="information-circle" size={14} color={Colors.info} />
                    <Text style={[st.rubricaInfoTxt, { color: Colors.info }]}>
                      Pagamento de <Text style={{ fontFamily: 'Inter_700Bold' }}>{formatAOA(pag.valor)}</Text> referente a «{getNomeTaxa(pag.taxaId)}» será transferido para o destino seleccionado.
                    </Text>
                  </View>

                  <Text style={st.fieldLabel}>Destino da Transferência</Text>
                  <View style={{ gap: 8, marginBottom: 16 }}>
                    <TouchableOpacity
                      style={[st.rubrSelectBtn, transferDestino === 'saldo' && st.rubrSelectBtnActive]}
                      onPress={() => setTransferDestino('saldo')}
                    >
                      <Ionicons name="wallet" size={16} color={transferDestino === 'saldo' ? Colors.gold : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.rubrSelectTxt, transferDestino === 'saldo' && { color: Colors.text }]}>Saldo do Estudante</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>O valor será creditado no saldo da conta do estudante</Text>
                      </View>
                      {transferDestino === 'saldo' && <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />}
                    </TouchableOpacity>
                    {taxas.filter(t => t.id !== pag.taxaId && t.ativo).slice(0, 6).map(taxa => (
                      <TouchableOpacity
                        key={taxa.id}
                        style={[st.rubrSelectBtn, transferDestino === taxa.id && st.rubrSelectBtnActive]}
                        onPress={() => setTransferDestino(taxa.id)}
                      >
                        <Ionicons name="receipt" size={16} color={transferDestino === taxa.id ? Colors.gold : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[st.rubrSelectTxt, transferDestino === taxa.id && { color: Colors.text }]}>{taxa.nome}</Text>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{formatAOA(taxa.valor)} · {taxa.tipo}</Text>
                        </View>
                        {transferDestino === taxa.id && <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              );
            })()}

            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: Colors.info, marginTop: 4 }, transferLoading && { opacity: 0.6 }]}
              onPress={handleTransferirPagamento}
              disabled={transferLoading}
            >
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text style={st.saveBtnTxt}>{transferLoading ? 'A transferir...' : 'Confirmar Transferência'}</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabScrollWrap: { position: 'relative', overflow: 'hidden', flexGrow: 0, flexShrink: 0 },
  tabScrollFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, pointerEvents: 'none' } as any,
  tabBarScroll: { backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border, height: 56 },
  tabBar: { flexDirection: 'row', alignItems: 'center' },
  tabBtn: { alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: 'transparent', position: 'relative' },
  tabBtnActive: { borderBottomColor: Colors.gold },
  tabBtnTxt: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabBtnTxtActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  tabBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff' },
  secLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  kpiCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border },
  kpiVal: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', color: Colors.text },
  kpiLbl: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  progressCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  progressPct: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  progressBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, marginBottom: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  progressSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  multaBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.warning + '15', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.warning + '44' },
  multaBannerTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  multaBannerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  multaEditBtn: { backgroundColor: Colors.gold + '22', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.gold + '44' },
  tipoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  tipoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tipoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  tipoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  tipoVal: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  tipoPendente: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, marginBottom: 2 },
  tipoCount: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  barCol: { flex: 1, alignItems: 'center', gap: 2 },
  barFill: { width: '80%', borderRadius: 3, minHeight: 4 },
  barLabel: { fontSize: 7, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  barVal: { fontSize: 6, fontFamily: 'Inter_600SemiBold', color: Colors.success, position: 'absolute', top: -12 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  recentIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recentNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  recentTaxa: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  recentVal: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recentData: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  filterBlock: { backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingTop: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  pagCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  pagIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pagNome: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  pagTaxa: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4 },
  pagMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  pagMetaTxt: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  pagRef: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.gold, marginTop: 2 },
  pagValor: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.gold },
  confirmarBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  confirmarTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  fab: { position: 'absolute', bottom: 90, right: 16, backgroundColor: Colors.accent, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  rubricaInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.info + '15', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.info + '33' },
  rubricaInfoTxt: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 },
  grupoIconBox: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  grupoTitle: { flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  grupoCount: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  rubricaCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rubricaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rubricaNome: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginRight: 8 },
  rubricaMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  rubricaMetaTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  rubricaActions: { flexDirection: 'row', gap: 4 },
  rubricaActionBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  alunoPerfilCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  alunoAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alunoAvatarTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#fff' },
  alunoNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoMat: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  alunoTurma: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginTop: 2 },
  alertaBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  alertaBannerTxt: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  perfilActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  perfilActionBtn: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.border },
  perfilActionTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  alunoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  alunoNumBox: { width: 28, alignItems: 'center' },
  alunoNum: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  alunoAvatarSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alunoAvatarSmallTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  alunoVal: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  scrollContent: { flex: 1 },
  scrollInner: { padding: 16, paddingBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 24, padding: 20, maxHeight: '92%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  selectorVal: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  selectorPh: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropList: { maxHeight: 160, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  dropItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropItemActive: { backgroundColor: Colors.accent + '22' },
  dropItemTxt: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  dropItemSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  metodosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  metodoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  metodoBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  metodoTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  metodoTxtActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  mesBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  mesBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  mesTxt: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  mesTxtActive: { color: '#fff' },
  tipoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tipoChipTxt: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  saveBtnTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  atrasoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: Colors.danger + '44' },
  atrasoHeaderTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger },
  atrasoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  atrasoAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  atrasoAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.warning + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  atrasoAvatarTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.warning },
  atrasoNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  atrasoMat: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  atrasoStats: { gap: 4, marginBottom: 10 },
  atrasoStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  atrasoStatTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  atrasoActions: { flexDirection: 'row', gap: 8 },
  atrasoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 8, borderWidth: 1 },
  atrasoActionTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  msgCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  msgIconBox: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgAluno: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  msgTexto: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 4, lineHeight: 17 },
  msgData: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 4 },
  relFiltrosCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  relFiltrosHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  relFiltrosTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  relFiltrosLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  relSection: { marginBottom: 14 },
  relCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  relTableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  relTableDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  relTableLabel: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  relTableVal: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  relTablePct: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, width: 36, textAlign: 'right' },
  relTableHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  relTableHeaderTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  saldoCard: { backgroundColor: Colors.success + '0d', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.success + '44', marginBottom: 14 },
  saldoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saldoCardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.success },
  saldoValor: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.success },
  saldoDataTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  rubrSelectBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  rubrSelectBtnActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '11' },
  rubrSelectTxt: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
});
