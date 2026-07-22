import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Animated,
  Modal,
  Switch,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import {
  useLicense, NIVEL_LABEL, NIVEL_COLOR, NIVEL_EMOJI, NIVEL_DESC, NIVEL_FEATURES,
  NIVEL_PRECO_POR_ALUNO,
  PLANO_LABEL, PLANO_DIAS, PRECO_POR_ALUNO_DEFAULT,
  type TipoPlano, type TipoNivel,
} from '@/context/LicenseContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import ActivacaoCodigoModal, { type EstadoActivacao } from '@/components/ActivacaoCodigoModal';

const RING_SIZE = 140;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

const PLANO_MESES: Record<TipoPlano, number> = {
  avaliacao: 1, mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

type ComparacaoItem = { key: string; label: string };
type ComparacaoCategoria = { label: string; icon: string; items: ComparacaoItem[] };

const CATEGORIAS_COMPARACAO: ComparacaoCategoria[] = [
  {
    label: 'Académico', icon: 'school',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'alunos', label: 'Gestão de Alunos' },
      { key: 'professores', label: 'Gestão de Professores' },
      { key: 'turmas', label: 'Turmas' },
      { key: 'salas', label: 'Salas de Aula' },
      { key: 'notas', label: 'Lançamento de Notas' },
      { key: 'presencas', label: 'Controlo de Presenças' },
      { key: 'horario', label: 'Horários' },
      { key: 'gestao_academica', label: 'Gestão Académica' },
      { key: 'grelha', label: 'Grelha de Avaliação' },
      { key: 'disciplinas', label: 'Disciplinas' },
      { key: 'gerir_avaliacoes', label: 'Avaliações' },
      { key: 'diario_classe', label: 'Diário de Classe' },
      { key: 'relatorios', label: 'Relatórios Académicos' },
      { key: 'calendario_academico', label: 'Calendário Académico' },
      { key: 'desempenho', label: 'Análise de Desempenho' },
      { key: 'visao_geral', label: 'Visão Geral' },
      { key: 'organizar_turmas', label: 'Organizar Turmas' },
      { key: 'finalistas', label: 'Finalistas' },
      { key: 'acompanhamento_pautas', label: 'Acompanhamento de Pautas' },
      { key: 'trabalhos_finais', label: 'Trabalhos Finais' },
      { key: 'quadro_honra', label: 'Quadro de Honra' },
      { key: 'consulta_aluno', label: 'Consulta de Dossier de Aluno' },
    ],
  },
  {
    label: 'Professores', icon: 'chalkboard-teacher',
    items: [
      { key: 'professor_hub', label: 'Portal do Professor' },
      { key: 'professor_turmas', label: 'Turmas do Professor' },
      { key: 'professor_pauta', label: 'Lançar Pauta' },
      { key: 'professor_sumario', label: 'Sumários' },
      { key: 'professor_mensagens', label: 'Mensagens' },
      { key: 'professor_materiais', label: 'Materiais Didácticos' },
      { key: 'plano_aula', label: 'Plano de Aula' },
      { key: 'avaliacao_professores', label: 'Avaliação de Professores' },
      { key: 'pedagogico', label: 'Gestão Pedagógica' },
      { key: 'director_turma', label: 'Director de Turma' },
    ],
  },
  {
    label: 'Secretaria & Documentos', icon: 'file-document-multiple',
    items: [
      { key: 'secretaria_hub', label: 'Secretaria' },
      { key: 'admissao', label: 'Admissão' },
      { key: 'editor_documentos', label: 'Editor de Documentos' },
      { key: 'gerar_documento', label: 'Gerar Documentos' },
      { key: 'documentos_hub', label: 'Hub de Documentos' },
      { key: 'boletim_matricula', label: 'Boletim de Matrícula' },
      { key: 'boletim_propina', label: 'Boletim de Propina' },
      { key: 'arquivo_documentos', label: 'Arquivo de Documentos' },
      { key: 'processos_secretaria', label: 'Processos da Secretaria' },
      { key: 'solicitacoes_documentos', label: 'Solicitações de Documentos' },
      { key: 'transferencias', label: 'Transferências' },
      { key: 'estudio_emissao', label: 'Estúdio de Emissão PDF' },
      { key: 'centro_emissao', label: 'Centro de Emissão' },
    ],
  },
  {
    label: 'Financeiro', icon: 'cash-multiple',
    items: [
      { key: 'financeiro', label: 'Módulo Financeiro' },
      { key: 'pagamentos_hub', label: 'Hub de Pagamentos' },
      { key: 'extrato_propinas', label: 'Extrato de Propinas' },
      { key: 'financeiro_relatorios', label: 'Relatórios Financeiros' },
      { key: 'bolsas', label: 'Bolsas de Estudo' },
      { key: 'rupes_historico', label: 'Histórico de RUPEs' },
      { key: 'tesouraria', label: 'Tesouraria' },
    ],
  },
  {
    label: 'Recursos Humanos', icon: 'account-group',
    items: [
      { key: 'rh_hub', label: 'Hub de RH' },
      { key: 'funcionarios', label: 'Funcionários' },
      { key: 'rh_controle', label: 'Controlo de Faltas RH' },
      { key: 'rh_faltas_tempos', label: 'Faltas e Tempos (RH)' },
      { key: 'rh_payroll', label: 'Processamento Salarial' },
      { key: 'alterar_tipo_contrato', label: 'Gestão de Contratos' },
    ],
  },
  {
    label: 'Alunos & Famílias', icon: 'account-child',
    items: [
      { key: 'portal_estudante', label: 'Portal do Estudante' },
      { key: 'portal_encarregado', label: 'Portal do Encarregado' },
      { key: 'exclusoes_faltas', label: 'Exclusões por Faltas' },
      { key: 'relatorio_faltas', label: 'Relatório de Faltas' },
      { key: 'historico', label: 'Histórico de Actividade' },
    ],
  },
  {
    label: 'Comunicação & Biblioteca', icon: 'message-text',
    items: [
      { key: 'notificacoes', label: 'Notificações' },
      { key: 'chat_interno', label: 'Chat Interno' },
      { key: 'eventos', label: 'Eventos' },
      { key: 'biblioteca', label: 'Biblioteca' },
      { key: 'biblioteca_gestao', label: 'Gestão de Biblioteca' },
    ],
  },
  {
    label: 'CEO & Administração', icon: 'shield-crown',
    items: [
      { key: 'ceo_dashboard', label: 'Painel CEO' },
      { key: 'gestao_planos', label: 'Gestão de Planos' },
      { key: 'auditoria', label: 'Auditoria do Sistema' },

      { key: 'gestao_acessos', label: 'Gestão de Acessos' },
      { key: 'admin', label: 'Administração' },
      { key: 'med_integracao', label: 'Integração MED' },
    ],
  },
];

interface Solicitacao {
  id: string;
  solicitanteNome: string;
  solicitanteRole: string;
  plano: TipoPlano;
  nivel: TipoNivel;
  totalAlunos: number;
  precoPorAluno: number;
  valorTotal: number;
  mensagem?: string | null;
  status: 'pendente' | 'aprovada' | 'rejeitada';
  respostaMensagem?: string | null;
  comprovativoUrl?: string | null;
  comprovativoNome?: string | null;
  cupaoCodigo?: string | null;
  descontoAplicado?: number;
  criadoEm: string;
}

interface HistoricoItem {
  id: string;
  plano: string;
  nivel: string;
  totalAlunos: number;
  precoPorAluno: number;
  valorTotal: number;
  descontoAplicado: number;
  valorPago: number;
  dataAtivacao: string;
  dataExpiracao: string;
  ativadoPor: string;
  metodo: string;
  observacao?: string | null;
  criadoEm: string;
  totalEmissoes?: number;
  ultimaEmissao?: string | null;
}

interface InfoPagamento {
  iban?: string | null;
  bic?: string | null;
  beneficiario?: string | null;
  banco?: string | null;
  multicaixaRef?: string | null;
  telefoneMulticaixa?: string | null;
}

function getStatusInfo(dias: number, maxDias: number) {
  const metade = Math.floor(maxDias * 0.5);
  if (dias <= 0) return { cor: '#FF453A', label: 'EXPIRADA', icon: 'shield-off' as const, blink: true, msg: 'Renove para retomar o acesso completo.' };
  if (dias <= 7) return { cor: '#FF453A', label: 'EXPIRA EM BREVE', icon: 'shield-alert' as const, blink: true, msg: `Apenas ${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}.` };
  if (dias <= metade) return { cor: '#FF9F0A', label: 'RENOVAR EM BREVE', icon: 'shield-alert-outline' as const, blink: false, msg: `Expira em ${dias} dias.` };
  return { cor: '#30D158', label: 'LICENÇA ACTIVA', icon: 'shield-check' as const, blink: false, msg: `Válida por mais ${dias} dias.` };
}

function CompactRing({ dias, maxDias, cor, blink }: { dias: number; maxDias: number; cor: string; blink: boolean }) {
  const pct = maxDias > 0 ? Math.max(0, Math.min(dias / maxDias, 1)) : 0;
  const dashOffset = RING_CIRCUM * (1 - pct);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!blink) return;
    const nd = Platform.OS !== 'web';
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, useNativeDriver: nd }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: nd }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [blink]);

  return (
    <Animated.View style={[styles.ringWrap, { transform: [{ scale: pulse }] }]}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          stroke="rgba(255,255,255,0.07)" strokeWidth={RING_STROKE} fill="none" />
        {dias > 0 && (
          <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
            stroke={cor} strokeWidth={RING_STROKE} fill="none"
            strokeDasharray={`${RING_CIRCUM}`} strokeDashoffset={dashOffset}
            strokeLinecap="round" rotation="-90" origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`} />
        )}
      </Svg>
      <View style={styles.ringCenter}>
        {dias <= 0 ? (
          <MaterialCommunityIcons name="shield-off" size={32} color={cor} />
        ) : (
          <>
            <Text style={[styles.ringDays, { color: cor }]}>{dias}</Text>
            <Text style={styles.ringDaysLabel}>DIAS</Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

function fmtAOA(n: number): string {
  return new Intl.NumberFormat('pt-PT').format(n) + ' Kz';
}

function PayCopyRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    } else { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }
  return (
    <View style={styles.payRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.payLabel}>{label}</Text>
        <Text selectable style={[styles.payVal, highlight && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>{value}</Text>
      </View>
      <TouchableOpacity onPress={handleCopy} style={[styles.payCopyBtn, copied && styles.payCopyBtnDone]}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function LicencaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { licenca, diasRestantes, isLicencaValida, ativarLicenca } = useLicense();
  const { user, logout } = useAuth();

  const [codigo, setCodigo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [planoSel, setPlanoSel] = useState<TipoPlano>('mensal');
  const [nivelSel, setNivelSel] = useState<TipoNivel>('rubi');
  const [totalAlunos, setTotalAlunos] = useState<number>(0);
  const [precoBase, setPrecoBase] = useState<number>(PRECO_POR_ALUNO_DEFAULT);
  const [precoUnit, setPrecoUnit] = useState<number>(PRECO_POR_ALUNO_DEFAULT);
  const [tierLabel, setTierLabel] = useState<string>('1-100');
  const [descontoPerc, setDescontoPerc] = useState<number>(0);
  const [escaloesList, setEscaloesList] = useState<Array<{ min: number; max: number | null; perc: number; label: string }>>([]);
  const [showEscaloes, setShowEscaloes] = useState<boolean>(false);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [showSolicitar, setShowSolicitar] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [mensagemSolic, setMensagemSolic] = useState('');
  const [aprovandoId, setAprovandoId] = useState<string | null>(null);
  // Novos estados
  const [comprovativoData, setComprovativoData] = useState<{ url: string; nome: string } | null>(null);
  const [uploadingComp, setUploadingComp] = useState(false);
  const [cupaoCodigo, setCupaoCodigo] = useState('');
  const [cupaoInfo, setCupaoInfo] = useState<{ codigo: string; descontoAplicado: number; descricao?: string } | null>(null);
  const [validandoCupao, setValidandoCupao] = useState(false);
  const [infoPag, setInfoPag] = useState<InfoPagamento>({});
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);
  const [showComparacao, setShowComparacao] = useState(false);
  // High-water mark — base de facturação anti-fraude
  const [highWaterMark, setHighWaterMark] = useState<number>(0);
  const [highWaterMarkAt, setHighWaterMarkAt] = useState<string>('');
  const [highWaterMarkResetAt, setHighWaterMarkResetAt] = useState<string>('');
  const [resetandoWatermark, setResetandoWatermark] = useState(false);
  const [showHistoricoDesativ, setShowHistoricoDesativ] = useState(false);
  const [historicoDesativ, setHistoricoDesativ] = useState<any[]>([]);
  // Quando a licença está activa há mais de 15 dias, escondemos a loja por defeito
  // e mostramos um painel de gestão. Este estado revela a loja a pedido.
  const [mostrarLoja, setMostrarLoja] = useState(false);
  const fileInputRef = useRef<any>(null);

  // Estado de segurança da activação
  const [nomeEscolaCfg, setNomeEscolaCfg] = useState<string>('');
  const [estadoSec, setEstadoSec] = useState<{ tentativas: number; restantes: number; bloqueada: boolean } | null>(null);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const [modalActiv, setModalActiv] = useState<EstadoActivacao>({ tipo: 'fechado' });

  const isCeo = user?.role === 'ceo';
  const podeVerHistorico = ['ceo', 'admin', 'director', 'chefe_secretaria', 'financeiro'].includes(user?.role || '');

  // Validação visual do código de activação: SIGA-XXXX-XXXX (alfanumérico)
  const codigoValido = /^SIG[AE]-[A-Z0-9]{3,8}-[A-Z0-9]{3,8}$/.test(codigo.trim());

  // Insere automaticamente os hífens à medida que o utilizador escreve/cola.
  // Aceita qualquer entrada (com ou sem traços, em qualquer caixa) e devolve
  // sempre o formato canónico: PREFIXO-BLOCO1-BLOCO2 (ex: SIGA-XXXX-XXXX ou SIGE-PRE-XXXXXXXX).
  const formatarCodigoLicenca = (input: string): string => {
    const limpo = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!limpo) return '';
    let prefixo = 'SIGA';
    let resto = limpo;
    if (limpo.startsWith('SIGA') || limpo.startsWith('SIGE')) {
      prefixo = limpo.slice(0, 4);
      resto = limpo.slice(4);
    }
    if (!resto) return prefixo + '-';
    // Bloco intermédio: PRE/GLD/RBY (3 chars) ou genérico (4 chars)
    const tam1 = (resto.startsWith('PRE') || resto.startsWith('GLD') || resto.startsWith('RBY')) ? 3 : 4;
    const bloco1 = resto.slice(0, tam1);
    const bloco2 = resto.slice(tam1, tam1 + 8);
    if (resto.length <= tam1) return `${prefixo}-${bloco1}`;
    return `${prefixo}-${bloco1}-${bloco2}`;
  };
  const topPad = Platform.OS === 'web' ? 24 : insets.top + 8;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const maxDias = licenca ? PLANO_DIAS[licenca.plano] ?? 30 : 30;
  const info = getStatusInfo(diasRestantes, maxDias);
  // Modo activo = subscrição em ordem (mais de 15 dias). Mostra painel de gestão.
  // Modo loja = subscrição a expirar/expirada/inexistente. Mostra fluxo de venda.
  const modoActivo = !!licenca && diasRestantes > 15;
  const mostrarBlocoVendas = !modoActivo || mostrarLoja;

  // Busca contagem de alunos, config, info pagamento, histórico
  useEffect(() => {
    (async () => {
      let alunos = 0;
      try {
        const r = await fetch('/api/licenca/alunos-matriculados');
        if (r.ok) {
          const d = await r.json();
          alunos = Number(d.total) || 0;
          setTotalAlunos(alunos);
          if (d.highWaterMark !== undefined) setHighWaterMark(Number(d.highWaterMark) || 0);
          if (d.highWaterMarkAt) setHighWaterMarkAt(String(d.highWaterMarkAt));
          if (d.highWaterMarkResetAt) setHighWaterMarkResetAt(String(d.highWaterMarkResetAt));
        }
      } catch {}
      try {
        const r2 = await fetch('/api/config');
        if (r2.ok) {
          const c = await r2.json();
          if (typeof c.licencaAutoRenew === 'boolean') setAutoRenew(c.licencaAutoRenew);
        }
      } catch {}
      // Carrega apenas escalões/tier (preço base agora vem do nível seleccionado)
      try {
        const r3 = await fetch(`/api/licenca/calcular?totalAlunos=${alunos}`);
        if (r3.ok) {
          const d = await r3.json();
          setTierLabel(d.tier || '1-100');
          setDescontoPerc(Number(d.descontoPerc) || 0);
          if (Array.isArray(d.escaloes)) setEscaloesList(d.escaloes);
        }
      } catch {}
      // Info de pagamento (público)
      try {
        const r4 = await api.get<InfoPagamento & { nomeEscola?: string }>('/api/licenca/info-pagamento');
        setInfoPag(r4 || {});
        if (r4?.nomeEscola) setNomeEscolaCfg(r4.nomeEscola);
      } catch {}
      // Histórico (qualquer utilizador autenticado com permissão de gestão)
      if (['ceo', 'admin', 'director', 'chefe_secretaria', 'financeiro'].includes(user?.role || '')) {
        try {
          const h = await api.get<HistoricoItem[]>('/api/licenca/historico');
          setHistorico(Array.isArray(h) ? h : []);
        } catch (err) {
          console.warn('[licenca] falha a carregar histórico:', (err as Error)?.message);
        }
      }
    })();
  }, [user?.role]);

  // Busca solicitações (só quando o utilizador está autenticado para evitar 401)
  useEffect(() => {
    if (!user) return;
    refreshSolicitacoes();
    const t = setInterval(refreshSolicitacoes, 20000);
    return () => clearInterval(t);
  }, [user]);

  // Sincroniza o nível selectado com o nível actual da licença (quando disponível)
  useEffect(() => {
    if (licenca?.nivel) setNivelSel(licenca.nivel);
  }, [licenca?.nivel]);

  async function refreshSolicitacoes() {
    try {
      const data = await api.get<Solicitacao[]>('/api/licenca/solicitacoes');
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch {}
  }

  // Preço base AGORA depende do nível seleccionado (Premium 30 · Golden 50 · Ruby 75 KZ/aluno)
  // O desconto de volume (descontoPerc) aplica-se em cima do preço base do nível.
  const precoBaseNivel = useMemo(
    () => NIVEL_PRECO_POR_ALUNO[nivelSel] ?? PRECO_POR_ALUNO_DEFAULT,
    [nivelSel]
  );
  const precoUnitNivel = useMemo(
    () => Math.round(precoBaseNivel * (1 - (descontoPerc || 0) / 100) * 100) / 100,
    [precoBaseNivel, descontoPerc]
  );

  // Sincroniza estados antigos para que blocos da UI que ainda os usam continuem correctos.
  useEffect(() => {
    setPrecoBase(precoBaseNivel);
    setPrecoUnit(precoUnitNivel);
  }, [precoBaseNivel, precoUnitNivel]);

  // Anti-fraude: usar sempre o máximo entre alunos actuais e o pico histórico (highWaterMark)
  const alunosParaFaturacao = useMemo(() => Math.max(totalAlunos, highWaterMark), [totalAlunos, highWaterMark]);
  const valorMensal = useMemo(() => alunosParaFaturacao * precoUnitNivel, [alunosParaFaturacao, precoUnitNivel]);
  const valorMensalBase = useMemo(() => alunosParaFaturacao * precoBaseNivel, [alunosParaFaturacao, precoBaseNivel]);
  const valorPlanoSel = useMemo(
    () => valorMensal * (PLANO_MESES[planoSel] ?? 1),
    [valorMensal, planoSel]
  );
  const descontoVolume = useMemo(() => (valorMensalBase - valorMensal) * (PLANO_MESES[planoSel] ?? 1), [valorMensalBase, valorMensal, planoSel]);
  const descontoCupao = cupaoInfo?.descontoAplicado || 0;
  const valorFinal = useMemo(() => Math.max(0, valorPlanoSel - descontoCupao), [valorPlanoSel, descontoCupao]);
  // Comparativo "Anual poupa X%"
  const poupancaAnual = useMemo(() => {
    const anual = valorMensal * 12;
    const mensal12 = valorMensal * 12;
    return mensal12 > 0 ? Math.round(((mensal12 - anual) / mensal12) * 100) : 0;
  }, [valorMensal]);

  const pendentes = useMemo(
    () => solicitacoes.filter(s => s.status === 'pendente'),
    [solicitacoes]
  );
  const minhaPendente = useMemo(
    () => !isCeo && pendentes.length > 0 ? pendentes[0] : null,
    [pendentes, isCeo]
  );

  // Carrega o estado de segurança da activação (apenas para utilizadores autenticados)
  async function refreshEstadoSeguranca() {
    if (!user) return;
    try {
      const r = await api.get<{ tentativas: number; restantes: number; bloqueada: boolean; maxTentativas: number }>(
        '/api/licenca/estado-activacao'
      );
      setEstadoSec({ tentativas: r.tentativas || 0, restantes: r.restantes ?? 3, bloqueada: !!r.bloqueada });
    } catch {}
  }
  useEffect(() => { refreshEstadoSeguranca(); }, [user?.id]);

  async function handleDesbloquearActivacao() {
    if (!isCeo) return;
    setDesbloqueando(true);
    try {
      await api.post('/api/licenca/desbloquear-activacao', {});
      await refreshEstadoSeguranca();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      webAlert('Desbloqueado', 'A área de activação foi desbloqueada. Pode tentar novamente.');
    } catch (err: any) {
      webAlert('Erro', err?.message || 'Não foi possível desbloquear.');
    } finally {
      setDesbloqueando(false);
    }
  }

  async function handleActivar() {
    const cod = codigo.trim().toUpperCase();
    if (!codigoValido) {
      setModalActiv({ tipo: 'erro', mensagem: 'O formato do código é inválido. Use SIGA-XXXX-XXXX.', tentativas: estadoSec?.tentativas || 0, restantes: estadoSec?.restantes ?? 3 });
      return;
    }
    if (estadoSec?.bloqueada) {
      setModalActiv({ tipo: 'bloqueado', mensagem: 'A área de activação foi bloqueada após 3 tentativas falhadas. Contacte o CEO para desbloquear.' });
      return;
    }
    setIsLoading(true);
    setModalActiv({ tipo: 'a-validar', codigo: cod });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const result = await ativarLicenca(cod, nomeEscolaCfg || user?.escola || 'Escola');
    setIsLoading(false);
    // Refresca contador
    await refreshEstadoSeguranca();
    if (result.sucesso) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setModalActiv({
        tipo: 'sucesso',
        mensagem: result.mensagem,
        reciboUrl: result.reciboUrl || null,
        historicoId: result.historicoId || null,
      });
      setCodigo('');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // Se a resposta indicou bloqueio, mostra modal de bloqueio
      const r = await (async () => {
        try { return await api.get<{ tentativas: number; restantes: number; bloqueada: boolean }>('/api/licenca/estado-activacao'); } catch { return null; }
      })();
      if (r?.bloqueada) {
        setModalActiv({ tipo: 'bloqueado', mensagem: 'Esta foi a 3ª tentativa falhada. Por motivos de segurança, a activação foi bloqueada. Apenas o CEO pode desbloquear.' });
      } else {
        setModalActiv({
          tipo: 'erro',
          mensagem: result.mensagem,
          tentativas: r?.tentativas ?? 0,
          restantes: r?.restantes ?? 3,
        });
      }
    }
  }

  async function handleSolicitar() {
    setSolicitando(true);
    try {
      await api.post('/api/licenca/solicitacoes', {
        plano: planoSel,
        nivel: nivelSel,
        totalAlunos: alunosParaFaturacao,
        precoPorAluno: precoUnit,
        valorTotal: valorFinal,
        mensagem: mensagemSolic.trim(),
        comprovativoUrl: comprovativoData?.url,
        comprovativoNome: comprovativoData?.nome,
        cupaoCodigo: cupaoInfo?.codigo,
        descontoAplicado: descontoCupao,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowSolicitar(false);
      setMensagemSolic('');
      setComprovativoData(null);
      setCupaoInfo(null);
      setCupaoCodigo('');
      await refreshSolicitacoes();
      webAlert('Solicitação enviada', 'O CEO foi notificado por sino e email. Receberá uma resposta em breve.');
    } catch (e) {
      webAlert('Erro', (e as Error).message || 'Não foi possível enviar a solicitação.');
    } finally {
      setSolicitando(false);
    }
  }

  async function handleUploadComprovativo() {
    if (Platform.OS !== 'web') {
      webAlert('Indisponível', 'O upload de comprovativo está disponível apenas na versão web.');
      return;
    }
    fileInputRef.current?.click?.();
  }

  async function processFile(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      webAlert('Ficheiro grande', 'O comprovativo deve ter menos de 5 MB.');
      return;
    }
    setUploadingComp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const tok = (await getAuthToken()) || '';
      const r = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!r.ok) throw new Error('Falha no upload.');
      const d = await r.json();
      setComprovativoData({ url: d.url, nome: file.name });
    } catch (e) {
      webAlert('Erro', (e as Error).message);
    } finally {
      setUploadingComp(false);
    }
  }

  async function handleValidarCupao() {
    if (!cupaoCodigo.trim()) return;
    setValidandoCupao(true);
    try {
      const r = await api.post<{ codigo: string; descontoAplicado: number; descricao?: string; valorFinal: number }>(
        '/api/licenca/cupao/validar',
        { codigo: cupaoCodigo.trim().toUpperCase(), valorBase: valorPlanoSel }
      );
      setCupaoInfo({ codigo: r.codigo, descontoAplicado: r.descontoAplicado, descricao: r.descricao });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setCupaoInfo(null);
      webAlert('Cupão inválido', (e as Error).message || 'Código não reconhecido.');
    } finally {
      setValidandoCupao(false);
    }
  }

  async function handleToggleAutoRenew() {
    const novo = !autoRenew;
    setAutoRenew(novo);
    try {
      await api.put('/api/config', { licencaAutoRenew: novo });
    } catch (e) {
      setAutoRenew(!novo);
      webAlert('Erro', (e as Error).message);
    }
  }

  async function handleAprovar(s: Solicitacao) {
    setAprovandoId(s.id);
    try {
      const r = await api.post<{ success: boolean; dataExpiracao: string }>(
        `/api/licenca/solicitacoes/${s.id}/aprovar`, {}
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refreshSolicitacoes();
      webAlert('Subscrição Activada', `Plano ${PLANO_LABEL[s.plano]} ${NIVEL_LABEL[s.nivel]} activado. Válido até ${r.dataExpiracao}.`);
    } catch (e) {
      webAlert('Erro', (e as Error).message || 'Falha ao aprovar.');
    } finally {
      setAprovandoId(null);
    }
  }

  async function handleRejeitar(s: Solicitacao) {
    setAprovandoId(s.id);
    try {
      await api.post(`/api/licenca/solicitacoes/${s.id}/rejeitar`, { motivo: 'Rejeitada pelo CEO' });
      await refreshSolicitacoes();
    } catch (e) {
      webAlert('Erro', (e as Error).message || 'Falha ao rejeitar.');
    } finally {
      setAprovandoId(null);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  function irParaLogin() {
    router.replace('/login' as any);
  }

  function irParaLoginComCodigo() {
    const cod = codigo.trim().toUpperCase();
    if (typeof window !== 'undefined' && cod) {
      try { window.sessionStorage.setItem('pendingActivationCode', cod); } catch {}
    }
    router.replace('/login' as any);
  }

  // Após login, se houver código guardado em sessionStorage, pré-preenche
  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;
    try {
      const pending = window.sessionStorage.getItem('pendingActivationCode');
      if (pending) {
        setCodigo(pending);
        window.sessionStorage.removeItem('pendingActivationCode');
      }
    } catch {}
  }, [user]);

  return (
    <LinearGradient colors={['#060A14', '#0D1525', '#060A14']} style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.maxWidth}>
            {/* Header compacto */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => {
                  if (!user) { irParaLogin(); return; }
                  // Se a licença está expirada/bloqueada, voltar para a app causaria um loop
                  // (o _layout.tsx redirecionaria de volta para /licenca). Vai para /login.
                  if (!isLicencaValida || diasRestantes < 0) { irParaLogin(); return; }
                  if (router.canGoBack()) router.back();
                  else router.replace('/(main)/dashboard');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={user ? 'arrow-back' : 'log-in-outline'} size={20} color={Colors.text} />
              </TouchableOpacity>
              <View style={[styles.logoMini, { borderColor: info.cor + '55' }]}>
                <MaterialCommunityIcons name={info.icon} size={18} color={info.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.appName}>{(nomeEscolaCfg || licenca?.escolaNome || 'Super Escola').toUpperCase()} — SUBSCRIÇÃO</Text>
                <Text style={styles.appSub}>Sistema Integrado de Gestão Académica</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: info.cor + '18', borderColor: info.cor + '55' }]}>
                <View style={[styles.statusDot, { backgroundColor: info.cor }]} />
                <Text style={[styles.statusPillText, { color: info.cor }]}>{info.label}</Text>
              </View>
            </View>

            {/* Hero compacto: Anel + KPIs */}
            <View style={styles.heroCard}>
              <CompactRing dias={diasRestantes} maxDias={maxDias} cor={info.cor} blink={info.blink} />
              <View style={styles.heroInfo}>
                <Text style={styles.heroMsg}>{info.msg}</Text>
                <View style={styles.kpiRow}>
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Plano actual</Text>
                    <Text style={styles.kpiVal}>{licenca ? PLANO_LABEL[licenca.plano] : '—'}</Text>
                  </View>
                  <View style={styles.kpiSep} />
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Nível</Text>
                    <Text style={[styles.kpiVal, { color: NIVEL_COLOR[licenca?.nivel || 'rubi'] }]}>
                      {NIVEL_EMOJI[licenca?.nivel || 'rubi']} {NIVEL_LABEL[licenca?.nivel || 'rubi']}
                    </Text>
                  </View>
                  <View style={styles.kpiSep} />
                  <View style={styles.kpi}>
                    <Text style={styles.kpiLabel}>Expira</Text>
                    <Text style={[styles.kpiVal, diasRestantes <= 7 && { color: '#FF453A' }]}>
                      {licenca?.dataExpiracao || '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* === Painel de Gestão da Subscrição Activa ===
                Visível quando a licença está em ordem (mais de 15 dias).
                Substitui a "loja" por opções de gestão. */}
            {modoActivo && (
              <View style={styles.gestaoCard}>
                <View style={styles.gestaoOk}>
                  <View style={styles.gestaoOkIcon}>
                    <MaterialCommunityIcons name="check-decagram" size={22} color="#34D399" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gestaoOkTitle}>Tudo em ordem</Text>
                    <Text style={styles.gestaoOkSub}>
                      A sua subscrição {NIVEL_LABEL[licenca?.nivel || 'rubi']} está activa e os pagamentos estão regularizados.
                      Nada a fazer no imediato.
                    </Text>
                  </View>
                </View>

                <View style={styles.gestaoKpiRow}>
                  <View style={styles.gestaoKpi}>
                    <Text style={styles.gestaoKpiLbl}>Próxima cobrança</Text>
                    <Text style={styles.gestaoKpiVal}>{licenca?.dataExpiracao || '—'}</Text>
                    <Text style={styles.gestaoKpiHint}>{diasRestantes} dias</Text>
                  </View>
                  <View style={styles.gestaoKpi}>
                    <Text style={styles.gestaoKpiLbl}>Valor previsto</Text>
                    <Text style={styles.gestaoKpiVal}>{fmtAOA(valorMensal)}</Text>
                    <Text style={styles.gestaoKpiHint}>{totalAlunos} alunos · {fmtAOA(precoUnitNivel)}/aluno</Text>
                  </View>
                  <View style={styles.gestaoKpi}>
                    <Text style={styles.gestaoKpiLbl}>Auto-renovação</Text>
                    <Text style={[styles.gestaoKpiVal, { color: autoRenew ? '#34D399' : '#FF9F0A' }]}>
                      {autoRenew ? 'Activa' : 'Inactiva'}
                    </Text>
                    <Text style={styles.gestaoKpiHint}>
                      {autoRenew ? 'Aviso 15 dias antes' : 'Renovação manual'}
                    </Text>
                  </View>
                </View>

                <View style={styles.gestaoActions}>
                  <TouchableOpacity
                    style={styles.gestaoBtnPrimary}
                    onPress={() => setMostrarLoja(v => !v)}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name={mostrarLoja ? 'eye-off-outline' : 'cash-fast'} size={15} color={Colors.gold} />
                    <Text style={styles.gestaoBtnPrimaryText}>
                      {mostrarLoja ? 'Esconder opções de pagamento' : 'Renovar antecipadamente / Mudar de plano'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.gestaoBtnSec}
                    onPress={() => router.push('/(main)/alunos' as any)}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="account-multiple-plus" size={15} color={Colors.textSecondary} />
                    <Text style={styles.gestaoBtnSecText}>Adicionar alunos</Text>
                  </TouchableOpacity>
                  {podeVerHistorico && historico.length > 0 && (
                    <TouchableOpacity
                      style={styles.gestaoBtnSec}
                      onPress={() => setShowHistorico(v => !v)}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="receipt-text" size={15} color={Colors.textSecondary} />
                      <Text style={styles.gestaoBtnSecText}>Recibos ({historico.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {mostrarLoja && (
                  <View style={styles.gestaoLojaHint}>
                    <MaterialCommunityIcons name="information" size={13} color={Colors.gold} />
                    <Text style={styles.gestaoLojaHintText}>
                      Ao renovar antecipadamente, os dias restantes ({diasRestantes}) serão somados ao novo período.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Selector de Pacote / Nível — visível na página principal */}
            {mostrarBlocoVendas && (<>
            <View style={styles.pacoteCard}>
              <View style={styles.calcHeader}>
                <MaterialCommunityIcons name="package-variant" size={16} color={Colors.gold} />
                <Text style={styles.calcTitle}>Escolha o Pacote</Text>
                <Text style={styles.pacoteHint}>· o nível actual está marcado</Text>
              </View>
              <View style={styles.pacoteGrid}>
                {(['prata', 'ouro', 'rubi'] as TipoNivel[]).map(n => {
                  const active = nivelSel === n;
                  const isCurrent = licenca?.nivel === n;
                  const featCount = NIVEL_FEATURES[n]?.length || 0;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.pacoteBtn,
                        active && { borderColor: NIVEL_COLOR[n], backgroundColor: NIVEL_COLOR[n] + '14' },
                      ]}
                      onPress={() => setNivelSel(n)}
                      activeOpacity={0.85}
                    >
                      {isCurrent && (
                        <View style={[styles.pacoteCurrentBadge, { backgroundColor: NIVEL_COLOR[n] }]}>
                          <Text style={styles.pacoteCurrentText}>ACTUAL</Text>
                        </View>
                      )}
                      <Text style={styles.pacoteEmoji}>{NIVEL_EMOJI[n]}</Text>
                      <Text style={[styles.pacoteLabel, active && { color: NIVEL_COLOR[n] }]}>
                        {NIVEL_LABEL[n]}
                      </Text>
                      <View style={[styles.pacoteFeatPill, active && { backgroundColor: NIVEL_COLOR[n] + '22', borderColor: NIVEL_COLOR[n] + '55' }]}>
                        <MaterialCommunityIcons name="check-circle" size={11} color={active ? NIVEL_COLOR[n] : Colors.textSecondary} />
                        <Text style={[styles.pacoteFeatText, active && { color: NIVEL_COLOR[n] }]}>
                          {featCount} funcionalidades
                        </Text>
                      </View>
                      <Text style={styles.pacoteDesc} numberOfLines={3}>
                        {NIVEL_DESC[n].replace(/^Pacote [^—]+—\s*/, '')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {nivelSel !== licenca?.nivel && (
                <View style={styles.pacoteChangeNote}>
                  <MaterialCommunityIcons name="information-outline" size={13} color={Colors.gold} />
                  <Text style={styles.pacoteChangeText}>
                    Vai mudar de <Text style={{ color: NIVEL_COLOR[licenca?.nivel || 'rubi'], fontFamily: 'Inter_700Bold' }}>{NIVEL_LABEL[licenca?.nivel || 'rubi']}</Text>
                    {' → '}
                    <Text style={{ color: NIVEL_COLOR[nivelSel], fontFamily: 'Inter_700Bold' }}>{NIVEL_LABEL[nivelSel]}</Text>
                    {'. A escolha será aplicada na próxima activação ou pedido de renovação.'}
                  </Text>
                </View>
              )}
              {/* Botão de comparação de funcionalidades */}
              <TouchableOpacity
                style={styles.comparacaoBtn}
                onPress={() => setShowComparacao(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="table-check" size={14} color={Colors.gold} />
                <Text style={styles.comparacaoBtnText}>Ver comparação detalhada de funcionalidades</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.gold} />
              </TouchableOpacity>
            </View>

            {/* Calculadora real */}
            <View style={styles.calcCard}>
              <View style={styles.calcHeader}>
                <MaterialCommunityIcons name="calculator-variant" size={16} color={Colors.gold} />
                <Text style={styles.calcTitle}>Cálculo do Valor a Pagar</Text>
              </View>
              <View style={styles.calcGrid}>
                <View style={styles.calcItem}>
                  <Text style={styles.calcItemLabel}>Alunos activos</Text>
                  <Text style={styles.calcItemVal}>{totalAlunos}</Text>
                  {highWaterMark > totalAlunos && (
                    <Text style={[styles.calcItemHint, { color: '#F59E0B' }]}>
                      ⚠️ Pico: {highWaterMark} (base de facturação)
                    </Text>
                  )}
                </View>
                <View style={styles.calcItem}>
                  <Text style={styles.calcItemLabel}>Preço por aluno/mês</Text>
                  <Text style={styles.calcItemVal}>{fmtAOA(precoUnit)}</Text>
                  {precoUnit < precoBase && (
                    <Text style={styles.calcItemStrike}>{fmtAOA(precoBase)}</Text>
                  )}
                </View>
                <View style={[styles.calcItem, styles.calcItemHi]}>
                  <Text style={styles.calcItemLabel}>Valor mensal real</Text>
                  <Text style={[styles.calcItemVal, { color: Colors.gold }]}>{fmtAOA(valorMensal)}</Text>
                </View>
              </View>

              {/* Escalão de volume */}
              <View style={styles.tierBar}>
                <MaterialCommunityIcons name="tag-multiple" size={13} color={Colors.gold} />
                <Text style={styles.tierLabel}>
                  Escalão <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{tierLabel}</Text> alunos
                  {descontoPerc > 0 && (
                    <Text>
                      {' · '}
                      <Text style={{ color: '#34D399', fontFamily: 'Inter_700Bold' }}>{descontoPerc}%</Text>
                      {' de desconto · poupa '}
                      <Text style={{ color: '#34D399', fontFamily: 'Inter_700Bold' }}>{fmtAOA(precoBase - precoUnit)}</Text>
                      {' por aluno/mês'}
                    </Text>
                  )}
                </Text>
                {escaloesList.length > 0 && (
                  <TouchableOpacity onPress={() => setShowEscaloes(s => !s)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.tierToggle}>{showEscaloes ? 'Ocultar tabela' : 'Ver tabela completa'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Tabela completa de escalões — todos os intervalos com desconto aplicável */}
              {showEscaloes && escaloesList.length > 0 && (
                <View style={styles.escaloesTable}>
                  <View style={styles.escaloesHeader}>
                    <Text style={[styles.escaloesCell, styles.escaloesHCell, { flex: 1.6 }]}>Intervalo</Text>
                    <Text style={[styles.escaloesCell, styles.escaloesHCell, { flex: 1 }]}>Desconto</Text>
                    <Text style={[styles.escaloesCell, styles.escaloesHCell, { flex: 1.2, textAlign: 'right' }]}>Preço/aluno</Text>
                  </View>
                  {escaloesList.map(e => {
                    const isCurrent = e.label === tierLabel;
                    const precoEsc = Math.round(precoBase * (1 - (e.perc || 0) / 100) * 100) / 100;
                    const range = e.max == null ? `${e.min}+ alunos` : `${e.min}–${e.max} alunos`;
                    return (
                      <View key={e.label} style={[styles.escaloesRow, isCurrent && styles.escaloesRowActive]}>
                        <Text style={[styles.escaloesCell, { flex: 1.6 }, isCurrent && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>
                          {isCurrent ? '▸ ' : ''}{range}
                        </Text>
                        <Text style={[styles.escaloesCell, { flex: 1 }, e.perc > 0 ? { color: '#34D399', fontFamily: 'Inter_600SemiBold' } : null]}>
                          {e.perc > 0 ? `${e.perc}%` : '—'}
                        </Text>
                        <Text style={[styles.escaloesCell, { flex: 1.2, textAlign: 'right' }, isCurrent && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>
                          {fmtAOA(precoEsc)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Bloco de segurança anti-fraude — visível apenas para CEO */}
              {isCeo && (
                <View style={styles.watermarkBox}>
                  <View style={styles.watermarkHeader}>
                    <Ionicons name="shield-checkmark" size={15} color="#34D399" />
                    <Text style={styles.watermarkTitle}>Segurança de Facturação</Text>
                  </View>
                  <Text style={styles.watermarkDesc}>
                    O cálculo usa sempre o pico histórico de alunos activos ({highWaterMark > 0 ? highWaterMark : totalAlunos}), não o valor actual ({totalAlunos}).
                    Isto impede que a escola reduza o valor a pagar desactivando alunos antes da renovação.
                  </Text>
                  {highWaterMarkResetAt && (
                    <Text style={styles.watermarkSince}>
                      Período iniciado: {new Date(highWaterMarkResetAt).toLocaleDateString('pt-PT')}
                    </Text>
                  )}
                  <View style={styles.watermarkBtns}>
                    <TouchableOpacity
                      style={[styles.watermarkBtn, resetandoWatermark && { opacity: 0.6 }]}
                      disabled={resetandoWatermark}
                      onPress={async () => {
                        setResetandoWatermark(true);
                        try {
                          const tok = await getAuthToken();
                          const r = await fetch('/api/licenca/watermark/reset', {
                            method: 'POST',
                            headers: tok ? { Authorization: `Bearer ${tok}` } : {},
                          });
                          if (r.ok) {
                            const d = await r.json();
                            setHighWaterMark(d.highWaterMark);
                            setHighWaterMarkResetAt(d.resetAt);
                            setHighWaterMarkAt(d.resetAt);
                          }
                        } catch {}
                        setResetandoWatermark(false);
                      }}
                    >
                      <Ionicons name="refresh" size={12} color="#34D399" />
                      <Text style={styles.watermarkBtnText}>Reiniciar para novo período</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.watermarkBtnOutline}
                      onPress={async () => {
                        if (!showHistoricoDesativ) {
                          try {
                            const tok = await getAuthToken();
                            const r = await fetch('/api/licenca/alunos-historico', {
                              headers: tok ? { Authorization: `Bearer ${tok}` } : {},
                            });
                            if (r.ok) setHistoricoDesativ(await r.json());
                          } catch {}
                        }
                        setShowHistoricoDesativ(v => !v);
                      }}
                    >
                      <Ionicons name="list" size={12} color={Colors.textMuted} />
                      <Text style={styles.watermarkBtnOutlineText}>
                        {showHistoricoDesativ ? 'Ocultar' : 'Ver desactivações'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showHistoricoDesativ && (
                    <View style={styles.desativList}>
                      {historicoDesativ.length === 0 ? (
                        <Text style={styles.watermarkDesc}>Nenhum registo de desactivação.</Text>
                      ) : historicoDesativ.slice(0, 20).map((d: any, i: number) => (
                        <View key={i} style={styles.desativRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.desativNome}>{d.alunoNome}{d.turmaNome ? ` · ${d.turmaNome}` : ''}</Text>
                            <Text style={styles.desativMeta}>{d.situacaoNova} · {d.registadoPor} · {new Date(d.createdAt).toLocaleDateString('pt-PT')}</Text>
                            {!!d.motivo && <Text style={styles.desativMotivo}>"{d.motivo}"</Text>}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Selector de plano */}
              <Text style={styles.calcSubtitle}>Escolha o ciclo de subscrição</Text>
              <View style={styles.planoGrid}>
                {(['mensal', 'trimestral', 'semestral', 'anual'] as TipoPlano[]).map(p => {
                  const active = planoSel === p;
                  const valor = valorMensal * (PLANO_MESES[p] ?? 1);
                  const isRecommended = p === 'anual';
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.planoBtn, active && styles.planoBtnActive]}
                      onPress={() => setPlanoSel(p)}
                    >
                      {isRecommended && (
                        <View style={styles.recBadge}>
                          <Text style={styles.recBadgeText}>RECOMENDADO</Text>
                        </View>
                      )}
                      <Text style={[styles.planoBtnLabel, active && styles.planoBtnLabelActive]}>
                        {PLANO_LABEL[p]}
                      </Text>
                      <Text style={[styles.planoBtnDias, active && { color: Colors.gold }]}>
                        {PLANO_DIAS[p]} dias
                      </Text>
                      <Text style={[styles.planoBtnPreco, active && { color: '#fff' }]}>
                        {fmtAOA(valor)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.totalBar}>
                <Text style={styles.totalLabel}>Total para {PLANO_LABEL[planoSel]}</Text>
                <Text style={styles.totalVal}>{fmtAOA(valorPlanoSel)}</Text>
              </View>
            </View>

            {/* Painel CEO: solicitações pendentes + activação */}
            {!user ? (
              <View style={styles.solicitarCard}>
                <View style={styles.solicHeader}>
                  <MaterialCommunityIcons name="key-chain-variant" size={18} color={Colors.gold} />
                  <Text style={styles.solicTitle}>Já tem um código de activação?</Text>
                </View>
                <Text style={styles.solicSub}>
                  Cole o código aqui e clique em <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>Activar</Text>.
                  Por segurança, será redireccionado para iniciar sessão — depois disso, o código é aplicado automaticamente.
                </Text>
                <View style={styles.guestCodeRow}>
                  <View style={[
                    styles.guestCodeInputWrap,
                    codigoValido && styles.guestCodeInputWrapValido,
                    codigo.trim().length > 0 && !codigoValido && styles.guestCodeInputWrapInvalido,
                  ]}>
                    <TextInput
                      style={styles.guestCodeInput}
                      value={codigo}
                      onChangeText={v => setCodigo(formatarCodigoLicenca(v))}
                      placeholder="SIGA-XXXX-XXXX"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onSubmitEditing={() => { if (codigoValido) irParaLoginComCodigo(); }}
                    />
                    {codigo.trim().length > 0 && (
                      <Ionicons
                        name={codigoValido ? 'checkmark-circle' : 'close-circle'}
                        size={18}
                        color={codigoValido ? '#22C55E' : '#EF4444'}
                        style={styles.guestCodeInputIcon}
                      />
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.guestCodeBtn, !codigoValido && styles.guestCodeBtnDisabled]}
                    onPress={irParaLoginComCodigo}
                    disabled={!codigoValido}
                  >
                    <LinearGradient
                      colors={codigoValido ? ['#22C55E', '#15803D'] : ['#3a3a3a', '#2a2a2a']}
                      style={styles.guestCodeBtnGrad}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                      <Ionicons name="checkmark-circle" size={15} color="#fff" />
                      <Text style={styles.guestCodeBtnText}>Activar</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                {codigo.trim().length > 0 && !codigoValido && (
                  <Text style={styles.guestCodeHint}>
                    Formato esperado: <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>SIGA-XXXX-XXXX</Text> (letras e números)
                  </Text>
                )}
                {codigoValido && (
                  <Text style={styles.guestCodeHintOk}>
                    <Ionicons name="shield-checkmark" size={11} color="#22C55E" /> Código com formato válido. Clique em Activar.
                  </Text>
                )}

                <View style={styles.guestDivider}>
                  <View style={styles.guestDividerLine} />
                  <Text style={styles.guestDividerText}>ou</Text>
                  <View style={styles.guestDividerLine} />
                </View>

                <TouchableOpacity style={styles.guestLoginBtn} onPress={irParaLogin}>
                  <Ionicons name="log-in-outline" size={15} color={Colors.text} />
                  <Text style={styles.guestLoginBtnText}>Iniciar sessão para gerir a subscrição</Text>
                </TouchableOpacity>
              </View>
            ) : isCeo ? (
              <>
                {pendentes.length > 0 && (
                  <View style={styles.pendentesCard}>
                    <View style={styles.pendentesHeader}>
                      <View style={styles.pendentesPulse}>
                        <MaterialCommunityIcons name="bell-ring" size={14} color="#FF9F0A" />
                      </View>
                      <Text style={styles.pendentesTitle}>
                        {pendentes.length} solicitaç{pendentes.length === 1 ? 'ão' : 'ões'} pendente{pendentes.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {pendentes.map(s => (
                      <View key={s.id} style={styles.pendItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pendNome}>{s.solicitanteNome} <Text style={styles.pendRole}>· {s.solicitanteRole}</Text></Text>
                          <Text style={styles.pendDetalhe}>
                            {PLANO_LABEL[s.plano]} {NIVEL_LABEL[s.nivel]} · {s.totalAlunos} alunos · <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{fmtAOA(s.valorTotal)}</Text>
                          </Text>
                          {s.mensagem ? <Text style={styles.pendMsg}>"{s.mensagem}"</Text> : null}
                        </View>
                        <View style={styles.pendActions}>
                          <TouchableOpacity
                            style={[styles.btnReject, aprovandoId === s.id && { opacity: 0.5 }]}
                            onPress={() => handleRejeitar(s)}
                            disabled={aprovandoId === s.id}
                          >
                            <Ionicons name="close" size={16} color="#FF453A" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btnApprove, aprovandoId === s.id && { opacity: 0.5 }]}
                            onPress={() => handleAprovar(s)}
                            disabled={aprovandoId === s.id}
                          >
                            <Ionicons name="checkmark" size={14} color="#fff" />
                            <Text style={styles.btnApproveText}>Activar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.activateCard}>
                  <View style={styles.activateHeader}>
                    <MaterialCommunityIcons name="key-variant" size={16} color={Colors.gold} />
                    <Text style={styles.activateTitle}>Activar com Código</Text>
                  </View>
                  {(licenca?.saldoCreditoAcumulado ?? 0) > 0 && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: 'rgba(34,197,94,0.10)',
                      borderRadius: 8, padding: 10, marginBottom: 10,
                    }}>
                      <MaterialCommunityIcons name="wallet-plus" size={18} color="#22C55E" />
                      <Text style={{ color: '#22C55E', fontWeight: '700', flex: 1 }}>
                        Crédito disponível: {(licenca?.saldoCreditoAcumulado || 0).toLocaleString('pt-AO')} Kz
                      </Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                        Será aplicado automaticamente
                      </Text>
                    </View>
                  )}

                  {/* Banner de segurança/tentativas */}
                  {estadoSec && (estadoSec.tentativas > 0 || estadoSec.bloqueada) && (
                    <View style={[
                      styles.lockBanner,
                      estadoSec.bloqueada
                        ? { borderColor: '#EF444466', backgroundColor: 'rgba(239,68,68,0.10)' }
                        : { borderColor: '#F59E0B66', backgroundColor: 'rgba(245,158,11,0.10)' },
                    ]}>
                      <MaterialCommunityIcons
                        name={estadoSec.bloqueada ? 'lock' : 'shield-alert'}
                        size={18}
                        color={estadoSec.bloqueada ? '#EF4444' : '#F59E0B'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lockBannerTitle, { color: estadoSec.bloqueada ? '#EF4444' : '#F59E0B' }]}>
                          {estadoSec.bloqueada ? 'Activação bloqueada' : `${estadoSec.tentativas}/3 tentativa${estadoSec.tentativas === 1 ? '' : 's'} usada${estadoSec.tentativas === 1 ? '' : 's'}`}
                        </Text>
                        <Text style={styles.lockBannerSub}>
                          {estadoSec.bloqueada
                            ? 'Após 3 tentativas falhadas. Apenas o CEO pode desbloquear.'
                            : `Restantes: ${estadoSec.restantes}. Após 3 falhas a área é bloqueada.`}
                        </Text>
                      </View>
                      {estadoSec.bloqueada && (
                        <TouchableOpacity
                          style={[styles.unlockBtn, desbloqueando && { opacity: 0.6 }]}
                          onPress={handleDesbloquearActivacao}
                          disabled={desbloqueando}
                        >
                          <Ionicons name="lock-open" size={13} color="#fff" />
                          <Text style={styles.unlockBtnText}>{desbloqueando ? '...' : 'Desbloquear'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[styles.input, estadoSec?.bloqueada && { opacity: 0.5 }]}
                      value={codigo}
                      onChangeText={v => setCodigo(formatarCodigoLicenca(v))}
                      placeholder="SIGA-XXXX-XXXX"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!estadoSec?.bloqueada}
                    />
                    <TouchableOpacity
                      style={[styles.activateBtn, (isLoading || estadoSec?.bloqueada) && { opacity: 0.5 }]}
                      onPress={handleActivar}
                      disabled={isLoading || estadoSec?.bloqueada}
                    >
                      <LinearGradient
                        colors={estadoSec?.bloqueada ? ['#3a3a3a', '#2a2a2a'] : [Colors.gold, '#D49600']}
                        style={styles.activateBtnGrad}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.activateBtnText}>{isLoading ? '...' : estadoSec?.bloqueada ? 'Bloqueado' : 'Activar'}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.activateHint}>
                    Cole o código de activação ou aprove uma solicitação acima para renovar automaticamente.
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.solicitarCard}>
                {minhaPendente ? (
                  <>
                    <View style={styles.solicHeader}>
                      <MaterialCommunityIcons name="clock-outline" size={18} color="#FF9F0A" />
                      <Text style={styles.solicTitleWait}>Solicitação enviada ao CEO</Text>
                    </View>
                    <Text style={styles.solicSubWait}>
                      Aguarda aprovação do CEO. {PLANO_LABEL[minhaPendente.plano]} · {fmtAOA(minhaPendente.valorTotal)}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.solicHeader}>
                      <MaterialCommunityIcons name="crown" size={18} color={Colors.gold} />
                      <Text style={styles.solicTitle}>Renovação restrita ao CEO</Text>
                    </View>
                    <Text style={styles.solicSub}>
                      Envie a sua solicitação. O CEO recebe uma notificação e activa a subscrição directamente do lado da escola.
                    </Text>
                    <TouchableOpacity
                      style={styles.solicBtn}
                      onPress={() => setShowSolicitar(true)}
                    >
                      <Ionicons name="paper-plane" size={14} color="#fff" />
                      <Text style={styles.solicBtnText}>Solicitar Renovação ao CEO</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Activação por código — para utilizadores autenticados que não são CEO ──
                permite ao próprio utilizador inserir o código que o CEO partilhar
                após o pagamento estar confirmado. */}
            {user && !isCeo && (
              <View style={styles.activateCard}>
                <View style={styles.activateHeader}>
                  <MaterialCommunityIcons name="key-variant" size={16} color={Colors.gold} />
                  <Text style={styles.activateTitle}>Já tem um código do CEO?</Text>
                </View>
                <Text style={[styles.activateHint, { marginTop: 0, marginBottom: 10 }]}>
                  Após confirmar o pagamento, o CEO partilhará consigo um código
                  de activação. Cole-o abaixo para reactivar o acesso de imediato.
                </Text>
                {estadoSec && (estadoSec.tentativas > 0 || estadoSec.bloqueada) && (
                  <View style={[
                    styles.lockBanner,
                    estadoSec.bloqueada
                      ? { borderColor: '#EF444466', backgroundColor: 'rgba(239,68,68,0.10)' }
                      : { borderColor: '#F59E0B66', backgroundColor: 'rgba(245,158,11,0.10)' },
                  ]}>
                    <MaterialCommunityIcons
                      name={estadoSec.bloqueada ? 'lock' : 'shield-alert'}
                      size={18}
                      color={estadoSec.bloqueada ? '#EF4444' : '#F59E0B'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lockBannerTitle, { color: estadoSec.bloqueada ? '#EF4444' : '#F59E0B' }]}>
                        {estadoSec.bloqueada ? 'Activação bloqueada' : `${estadoSec.tentativas}/3 tentativa${estadoSec.tentativas === 1 ? '' : 's'} usada${estadoSec.tentativas === 1 ? '' : 's'}`}
                      </Text>
                      <Text style={styles.lockBannerSub}>
                        {estadoSec.bloqueada
                          ? 'Apenas o CEO pode desbloquear.'
                          : `Restantes: ${estadoSec.restantes}.`}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, estadoSec?.bloqueada && { opacity: 0.5 }]}
                    value={codigo}
                    onChangeText={v => setCodigo(formatarCodigoLicenca(v))}
                    placeholder="SIGA-XXXX-XXXX"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!estadoSec?.bloqueada}
                  />
                  <TouchableOpacity
                    style={[styles.activateBtn, (isLoading || estadoSec?.bloqueada) && { opacity: 0.5 }]}
                    onPress={handleActivar}
                    disabled={isLoading || estadoSec?.bloqueada}
                  >
                    <LinearGradient
                      colors={estadoSec?.bloqueada ? ['#3a3a3a', '#2a2a2a'] : [Colors.gold, '#D49600']}
                      style={styles.activateBtnGrad}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    >
                      <Text style={styles.activateBtnText}>{isLoading ? '...' : estadoSec?.bloqueada ? 'Bloqueado' : 'Activar'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Painel de Pagamento — IBAN/BIC/Multicaixa */}
            {(infoPag.iban || infoPag.multicaixaRef) && (
              <View style={styles.payCard}>
                <View style={styles.payHeader}>
                  <MaterialCommunityIcons name="bank" size={16} color={Colors.gold} />
                  <Text style={styles.payTitle}>Dados de Pagamento</Text>
                </View>
                {infoPag.beneficiario && (
                  <View style={styles.payRow}>
                    <Text style={styles.payLabel}>Beneficiário</Text>
                    <Text selectable style={styles.payVal}>{infoPag.beneficiario}</Text>
                  </View>
                )}
                {infoPag.iban && (
                  <>
                    <View style={styles.payDivider} />
                    <PayCopyRow label="IBAN (BAI)" value={infoPag.iban} />
                  </>
                )}
                {infoPag.bic && (
                  <>
                    <View style={styles.payDivider} />
                    <PayCopyRow label="BIC / SWIFT" value={infoPag.bic} />
                  </>
                )}
                {infoPag.banco && (
                  <>
                    <View style={styles.payDivider} />
                    <View style={styles.payRow}>
                      <Text style={styles.payLabel}>Banco</Text>
                      <Text selectable style={styles.payVal}>{infoPag.banco}</Text>
                    </View>
                  </>
                )}
                {infoPag.multicaixaRef && (
                  <>
                    <View style={styles.payDivider} />
                    <PayCopyRow label="Multicaixa Express" value={infoPag.multicaixaRef} highlight />
                    <View style={styles.qrWrap}>
                      <Text style={styles.qrLabel}>Aponte a app Multicaixa para pagar</Text>
                      <View style={styles.qrBox}>
                        <QRCode
                          value={infoPag.multicaixaRef}
                          size={110}
                          color="#FFFFFF"
                          backgroundColor="#0A1628"
                        />
                      </View>
                    </View>
                  </>
                )}
                <Text style={styles.payHint}>
                  Após o pagamento, anexe o comprovativo na sua solicitação para acelerar a aprovação.
                </Text>
              </View>
            )}
            </>)}

            {/* Painel CEO — Auto-Renovação */}
            {isCeo && (
              <View style={styles.autoRenewCard}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="autorenew" size={16} color={autoRenew ? '#34D399' : Colors.textMuted} />
                    <Text style={styles.autoRenewTitle}>Auto-renovação</Text>
                  </View>
                  <Text style={styles.autoRenewSub}>
                    {autoRenew
                      ? 'Activa: o sistema notificará automaticamente 15 dias antes da expiração.'
                      : 'Inactiva: terá de renovar manualmente antes da expiração.'}
                  </Text>
                </View>
                <Switch
                  value={autoRenew}
                  onValueChange={handleToggleAutoRenew}
                  trackColor={{ false: '#3a3a3a', true: '#34D39955' }}
                  thumbColor={autoRenew ? '#34D399' : '#888'}
                />
              </View>
            )}

            {/* Painel CEO — Canais de notificação */}
            {isCeo && <CanaisNotificacaoCard />}

            {/* Histórico de Subscrições — visível para CEO/admin/director/financeiro */}
            {podeVerHistorico && (
              <>
                <View style={styles.historyCard}>
                  <TouchableOpacity
                    style={styles.historyHeader}
                    onPress={() => setShowHistorico(v => !v)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="history" size={16} color={Colors.gold} />
                    <Text style={styles.historyTitle}>Histórico de Subscrições ({historico.length})</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.exportBtn}
                      onPress={async () => {
                        const tok = (await getAuthToken()) || '';
                        if (typeof window !== 'undefined') {
                          window.open(`/api/licenca/historico.xlsx?token=${encodeURIComponent(tok)}`, '_blank');
                        }
                      }}
                    >
                      <MaterialCommunityIcons name="microsoft-excel" size={13} color="#34D399" />
                      <Text style={styles.exportBtnText}>Excel</Text>
                    </TouchableOpacity>
                    <Ionicons name={showHistorico ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {showHistorico && (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      {historico.length === 0 ? (
                        <Text style={styles.historyEmpty}>Sem registos ainda.</Text>
                      ) : (
                        historico.slice(0, 20).map(h => {
                          const emiss = h.totalEmissoes || 0;
                          const jaImpresso = emiss > 0;
                          return (
                            <View key={h.id} style={styles.historyItem}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.historyItemTitle}>
                                  {h.plano.toUpperCase()} · {h.nivel.toUpperCase()}
                                </Text>
                                <Text style={styles.historyItemSub}>
                                  {new Date(h.dataAtivacao).toLocaleDateString('pt-PT')} → {new Date(h.dataExpiracao).toLocaleDateString('pt-PT')} · {h.totalAlunos} alunos
                                </Text>
                                <Text style={styles.historyItemValor}>
                                  {fmtAOA(h.valorPago)}
                                  {h.descontoAplicado > 0 && (
                                    <Text style={{ color: '#34D399' }}> (-{fmtAOA(h.descontoAplicado)})</Text>
                                  )}
                                </Text>
                                {jaImpresso ? (
                                  <View style={styles.emissoesBadge}>
                                    <MaterialCommunityIcons name="printer-check" size={11} color="#F59E0B" />
                                    <Text style={styles.emissoesBadgeText}>
                                      {emiss === 1 ? '1 emissão' : `${emiss} emissões`}
                                      {h.ultimaEmissao ? ` · última ${new Date(h.ultimaEmissao).toLocaleDateString('pt-PT')}` : ''}
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.emissoesBadgeNova}>
                                    <Ionicons name="sparkles" size={11} color="#34D399" />
                                    <Text style={styles.emissoesBadgeNovaText}>Ainda não impresso</Text>
                                  </View>
                                )}
                              </View>
                              <TouchableOpacity
                                style={[styles.reciboBtn, jaImpresso && styles.reciboBtnReimp]}
                                onPress={async () => {
                                  const tok = (await getAuthToken()) || '';
                                  if (typeof window !== 'undefined') {
                                    window.open(`/api/licenca/recibo/${h.id}?token=${encodeURIComponent(tok)}`, '_blank');
                                    setTimeout(() => {
                                      api.get<HistoricoItem[]>('/api/licenca/historico')
                                        .then(setHistorico)
                                        .catch(() => {});
                                    }, 1500);
                                  }
                                }}
                              >
                                <MaterialCommunityIcons
                                  name={jaImpresso ? 'printer-refresh' : 'receipt'}
                                  size={13}
                                  color={jaImpresso ? '#F59E0B' : Colors.gold}
                                />
                                <Text style={[styles.reciboBtnText, jaImpresso && { color: '#F59E0B' }]}>
                                  {jaImpresso ? 'Reimprimir' : 'Imprimir Recibo'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Suporte */}
            <Text style={styles.suporte}>
              Suporte: <Text style={{ color: Colors.gold }}>osvaldofernandomuondoqueta@gmail.com</Text>
            </Text>

            {user ? (
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.logoutText}>Terminar Sessão</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal — Comparação de Funcionalidades por Nível */}
      <Modal visible={showComparacao} transparent animationType="slide" onRequestClose={() => setShowComparacao(false)}>
        <View style={styles.cmpOverlay}>
          <View style={styles.cmpSheet}>
            {/* Header fixo */}
            <View style={styles.cmpHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cmpHeaderTitle}>Comparação de Funcionalidades</Text>
                <Text style={styles.cmpHeaderSub}>O que está incluído em cada nível</Text>
              </View>
              <TouchableOpacity onPress={() => setShowComparacao(false)} style={styles.cmpCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Cabeçalho das colunas fixo */}
            <View style={styles.cmpColsHeader}>
              <View style={styles.cmpFeatureCol} />
              {(['prata', 'ouro', 'rubi'] as TipoNivel[]).map(n => (
                <View key={n} style={[styles.cmpNivelCol, { borderBottomColor: NIVEL_COLOR[n] }]}>
                  <Text style={styles.cmpNivelEmoji}>{NIVEL_EMOJI[n]}</Text>
                  <Text style={[styles.cmpNivelLabel, { color: NIVEL_COLOR[n] }]}>{NIVEL_LABEL[n]}</Text>
                  <Text style={styles.cmpNivelCount}>{NIVEL_FEATURES[n].length} func.</Text>
                </View>
              ))}
            </View>

            {/* Lista scrollável */}
            <ScrollView
              style={styles.cmpScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {CATEGORIAS_COMPARACAO.map(cat => (
                <View key={cat.label}>
                  {/* Separador de categoria */}
                  <View style={styles.cmpCatRow}>
                    <MaterialCommunityIcons name={cat.icon as any} size={13} color={Colors.gold} />
                    <Text style={styles.cmpCatLabel}>{cat.label}</Text>
                  </View>
                  {cat.items.map((item, idx) => {
                    const prataTem = NIVEL_FEATURES.prata.includes(item.key);
                    const ouroTem = NIVEL_FEATURES.ouro.includes(item.key);
                    const rubiTem = NIVEL_FEATURES.rubi.includes(item.key);
                    return (
                      <View key={item.key} style={[styles.cmpRow, idx % 2 === 0 ? styles.cmpRowEven : styles.cmpRowOdd]}>
                        <Text style={styles.cmpFeatureLabel} numberOfLines={2}>{item.label}</Text>
                        {[prataTem, ouroTem, rubiTem].map((tem, ci) => {
                          const nivelKey = (['prata', 'ouro', 'rubi'] as TipoNivel[])[ci];
                          return (
                            <View key={ci} style={styles.cmpNivelCol}>
                              {tem
                                ? <MaterialCommunityIcons name="check-circle" size={18} color={NIVEL_COLOR[nivelKey]} />
                                : <MaterialCommunityIcons name="close-circle-outline" size={18} color="rgba(255,255,255,0.12)" />
                              }
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {/* Rodapé */}
            <TouchableOpacity style={styles.cmpCloseFooter} onPress={() => setShowComparacao(false)}>
              <Text style={styles.cmpCloseFooterText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal — activação de código (com estado seguro) */}
      <ActivacaoCodigoModal
        estado={modalActiv}
        onClose={() => setModalActiv({ tipo: 'fechado' })}
        onContinuar={() => {
          setModalActiv({ tipo: 'fechado' });
          // Recarrega a aplicação para que todos os contextos releiam a licença activa
          // e os serviços fechados sejam libertados imediatamente.
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.href = user ? '/(main)/dashboard' : '/auth/login';
          } else {
            router.replace(user ? '/(main)/dashboard' : '/auth/login');
          }
        }}
        onTentarOutra={() => setModalActiv({ tipo: 'fechado' })}
        onAbrirRecibo={(url) => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
          } else {
            // Em nativo, navegar para webview/browser
            try { Linking.openURL(url); } catch {}
          }
        }}
      />

      {/* Modal — solicitar renovação */}
      <Modal visible={showSolicitar} transparent animationType="fade" onRequestClose={() => setShowSolicitar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar Solicitação</Text>
            <Text style={styles.modalSub}>O CEO receberá os seguintes dados:</Text>

            {/* Selector de nível/pacote (Premium · Golden · Ruby) */}
            <Text style={styles.modalSectionLabel}>Pacote / Nível</Text>
            <View style={styles.nivelGrid}>
              {(['prata', 'ouro', 'rubi'] as TipoNivel[]).map(n => {
                const active = nivelSel === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.nivelBtn, active && { borderColor: NIVEL_COLOR[n], backgroundColor: NIVEL_COLOR[n] + '14' }]}
                    onPress={() => setNivelSel(n)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.nivelEmoji}>{NIVEL_EMOJI[n]}</Text>
                    <Text style={[styles.nivelLabel, active && { color: NIVEL_COLOR[n], fontFamily: 'Inter_700Bold' }]}>
                      {NIVEL_LABEL[n]}
                    </Text>
                    <Text style={styles.nivelDesc} numberOfLines={2}>
                      {NIVEL_DESC[n].replace(/^Pacote [^—]+—\s*/, '')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalSummary}>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Pacote escolhido</Text>
                <Text style={[styles.modalRowVal, { color: NIVEL_COLOR[nivelSel], fontFamily: 'Inter_700Bold' }]}>
                  {NIVEL_EMOJI[nivelSel]} {NIVEL_LABEL[nivelSel]}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Plano</Text>
                <Text style={styles.modalRowVal}>{PLANO_LABEL[planoSel]} · {PLANO_DIAS[planoSel]} dias</Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Alunos matriculados</Text>
                <Text style={styles.modalRowVal}>{totalAlunos}</Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Subtotal</Text>
                <Text style={styles.modalRowVal}>{fmtAOA(valorPlanoSel)}</Text>
              </View>
              {descontoCupao > 0 && (
                <View style={styles.modalRow}>
                  <Text style={[styles.modalRowLabel, { color: '#34D399' }]}>Cupão {cupaoInfo?.codigo}</Text>
                  <Text style={[styles.modalRowVal, { color: '#34D399' }]}>−{fmtAOA(descontoCupao)}</Text>
                </View>
              )}
              <View style={[styles.modalRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 2 }]}>
                <Text style={[styles.modalRowLabel, { fontFamily: 'Inter_700Bold' }]}>Total a pagar</Text>
                <Text style={[styles.modalRowVal, { color: Colors.gold, fontSize: 16 }]}>{fmtAOA(valorFinal)}</Text>
              </View>
            </View>

            {/* Cupão promocional */}
            <Text style={styles.modalSectionLabel}>Código promocional (opcional)</Text>
            <View style={styles.cupaoRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={cupaoCodigo}
                onChangeText={t => setCupaoCodigo(t.toUpperCase())}
                placeholder="EX: PROMO20"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
                editable={!cupaoInfo}
              />
              {cupaoInfo ? (
                <TouchableOpacity
                  style={styles.cupaoRemove}
                  onPress={() => { setCupaoInfo(null); setCupaoCodigo(''); }}
                >
                  <Ionicons name="close-circle" size={18} color="#FF453A" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.cupaoApply, (!cupaoCodigo.trim() || validandoCupao) && { opacity: 0.5 }]}
                  onPress={handleValidarCupao}
                  disabled={!cupaoCodigo.trim() || validandoCupao}
                >
                  <Text style={styles.cupaoApplyText}>{validandoCupao ? '…' : 'Aplicar'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {cupaoInfo?.descricao && (
              <Text style={styles.cupaoDesc}>✓ {cupaoInfo.descricao}</Text>
            )}

            {/* Upload comprovativo */}
            <Text style={styles.modalSectionLabel}>Comprovativo de pagamento (opcional)</Text>
            {Platform.OS === 'web' && (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              React.createElement('input' as any, {
                ref: fileInputRef,
                type: 'file',
                accept: 'image/*,application/pdf',
                style: { display: 'none' },
                onChange: (e: any) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                  e.target.value = '';
                },
              })
            )}
            {comprovativoData ? (
              <View style={styles.compFile}>
                <MaterialCommunityIcons name="file-check" size={16} color="#34D399" />
                <Text style={styles.compFileName} numberOfLines={1}>{comprovativoData.nome}</Text>
                <TouchableOpacity onPress={() => setComprovativoData(null)}>
                  <Ionicons name="close" size={16} color="#FF453A" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.compUploadBtn, uploadingComp && { opacity: 0.6 }]}
                onPress={handleUploadComprovativo}
                disabled={uploadingComp}
              >
                <MaterialCommunityIcons name="paperclip" size={14} color={Colors.gold} />
                <Text style={styles.compUploadText}>
                  {uploadingComp ? 'A enviar…' : 'Anexar comprovativo (PDF/Imagem, máx. 5MB)'}
                </Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={[styles.modalInput, { marginTop: 8 }]}
              value={mensagemSolic}
              onChangeText={setMensagemSolic}
              placeholder="Mensagem para o CEO (opcional)"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSolicitar(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, solicitando && { opacity: 0.6 }]}
                onPress={handleSolicitar}
                disabled={solicitando}
              >
                <Text style={styles.modalConfirmText}>{solicitando ? 'A enviar…' : 'Enviar Solicitação'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

type CanaisInfo = {
  inApp: { ativo: boolean };
  email: { ativo: boolean; fornecedor: string };
  whatsapp: { ativo: boolean; fornecedor: string; numero: string | null; apikeyConfigurada: boolean };
};

function CanaisNotificacaoCard() {
  const [canais, setCanais] = useState<CanaisInfo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showInstrucoes, setShowInstrucoes] = useState(false);

  useEffect(() => {
    api.get<CanaisInfo>('/api/notificacoes/canais').then(setCanais).catch(() => {});
  }, []);

  async function testarWhatsApp() {
    setEnviando(true);
    setResultado(null);
    try {
      await api.post('/api/notificacoes/whatsapp/teste', {});
      setResultado({ ok: true, msg: 'Mensagem de teste enviada. Verifique o seu WhatsApp.' });
    } catch (e: any) {
      setResultado({ ok: false, msg: e?.message || 'Falha ao enviar.' });
    } finally {
      setEnviando(false);
    }
  }

  if (!canais) return null;

  const Row = ({ icon, label, ok, hint }: { icon: any; label: string; ok: boolean; hint?: string }) => (
    <View style={canalStyles.row}>
      <MaterialCommunityIcons name={icon} size={18} color={ok ? '#34D399' : Colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={canalStyles.label}>{label}</Text>
        {hint && <Text style={canalStyles.hint}>{hint}</Text>}
      </View>
      <View style={[canalStyles.badge, { backgroundColor: ok ? '#10B98122' : '#3a3a3a55', borderColor: ok ? '#10B981' : Colors.textMuted }]}>
        <Text style={[canalStyles.badgeText, { color: ok ? '#34D399' : Colors.textMuted }]}>
          {ok ? 'Activo' : 'Inactivo'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={canalStyles.card}>
      <View style={canalStyles.header}>
        <MaterialCommunityIcons name="bell-ring-outline" size={16} color={Colors.gold} />
        <Text style={canalStyles.title}>Canais de Notificação (CEO)</Text>
      </View>

      <Row icon="bell-outline" label="Sino dentro da app" ok={canais.inApp.ativo} hint="Sempre activo" />
      <Row icon="email-outline" label={`Email (${canais.email.fornecedor})`} ok={canais.email.ativo} hint={canais.email.ativo ? 'Configurado' : 'Falta RESEND_API_KEY'} />
      <Row
        icon="whatsapp"
        label={`WhatsApp (${canais.whatsapp.fornecedor})`}
        ok={canais.whatsapp.ativo}
        hint={canais.whatsapp.ativo
          ? `Para +${canais.whatsapp.numero}`
          : canais.whatsapp.numero
            ? `Falta APIKEY · Número: +${canais.whatsapp.numero}`
            : 'Falta número e APIKEY'}
      />

      {canais.whatsapp.ativo ? (
        <TouchableOpacity style={canalStyles.btnTeste} onPress={testarWhatsApp} disabled={enviando} activeOpacity={0.85}>
          <MaterialCommunityIcons name="send" size={14} color="#34D399" />
          <Text style={canalStyles.btnTesteText}>{enviando ? 'A enviar…' : 'Enviar mensagem de teste'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={canalStyles.btnInstr} onPress={() => setShowInstrucoes(v => !v)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.gold} />
          <Text style={canalStyles.btnInstrText}>
            {showInstrucoes ? 'Esconder instruções' : 'Como activar WhatsApp'}
          </Text>
        </TouchableOpacity>
      )}

      {showInstrucoes && !canais.whatsapp.ativo && (
        <View style={canalStyles.instr}>
          <Text style={canalStyles.instrTitle}>Activar WhatsApp em 3 passos:</Text>
          <Text style={canalStyles.instrLine}>1. Adicione o contacto <Text style={canalStyles.instrCode}>+34 644 64 38 92</Text> ao seu telemóvel.</Text>
          <Text style={canalStyles.instrLine}>2. Envie-lhe a mensagem (em inglês): <Text style={canalStyles.instrCode}>I allow callmebot to send me messages</Text></Text>
          <Text style={canalStyles.instrLine}>3. Receberá no WhatsApp uma resposta com o "API key for ...". Peça ao administrador do sistema para guardar essa chave em <Text style={canalStyles.instrCode}>WHATSAPP_CALLMEBOT_APIKEY</Text>.</Text>
        </View>
      )}

      {resultado && (
        <View style={[canalStyles.feedback, { backgroundColor: resultado.ok ? '#10B98122' : '#EF444422', borderColor: resultado.ok ? '#10B981' : '#EF4444' }]}>
          <MaterialCommunityIcons
            name={resultado.ok ? 'check-circle' : 'alert-circle'}
            size={14}
            color={resultado.ok ? '#34D399' : '#F87171'}
          />
          <Text style={[canalStyles.feedbackText, { color: resultado.ok ? '#34D399' : '#F87171' }]}>{resultado.msg}</Text>
        </View>
      )}
    </View>
  );
}

const canalStyles = StyleSheet.create({
  card: {
    backgroundColor: '#0F1A2E',
    borderWidth: 1,
    borderColor: '#1F2D45',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  label: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  hint: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  btnTeste: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1,
    borderColor: '#10B981', backgroundColor: '#10B98114', marginTop: 4,
  },
  btnTesteText: { color: '#34D399', fontSize: 12, fontWeight: '700' },
  btnInstr: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1,
    borderColor: '#D4A017', backgroundColor: '#D4A01714', marginTop: 4,
  },
  btnInstrText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  instr: {
    backgroundColor: '#0A1628', borderRadius: 8, padding: 12, gap: 6,
    borderLeftWidth: 3, borderLeftColor: Colors.gold,
  },
  instrTitle: { color: Colors.gold, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  instrLine: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  instrCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#E2E8F0', backgroundColor: '#1F2937', paddingHorizontal: 4, borderRadius: 3,
  },
  feedback: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, marginTop: 4,
  },
  feedbackText: { fontSize: 12, fontWeight: '600', flex: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, flexGrow: 1, alignItems: 'center' },
  watermarkBox: { backgroundColor: '#34D39915', borderRadius: 14, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#34D39944' },
  watermarkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  watermarkTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  watermarkDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', lineHeight: 18, marginBottom: 6 },
  watermarkSince: { fontSize: 11, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.5)', marginBottom: 10 },
  watermarkBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  watermarkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#34D39922', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#34D39944' },
  watermarkBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#34D399' },
  watermarkBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  watermarkBtnOutlineText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.7)' },
  desativList: { marginTop: 12, gap: 8 },
  desativRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10 },
  desativNome: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  desativMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  desativMotivo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', marginTop: 2 },
  maxWidth: { width: '100%', maxWidth: 720 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoMini: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  appName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  appSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },

  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },

  // ── Painel de Gestão da Subscrição Activa ──
  gestaoCard: {
    backgroundColor: 'rgba(52,211,153,0.04)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.20)',
    marginBottom: 12,
  },
  gestaoOk: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  gestaoOkIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: 'rgba(52,211,153,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.30)',
  },
  gestaoOkTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#34D399', marginBottom: 2 },
  gestaoOkSub: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
  gestaoKpiRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
    flexWrap: 'wrap',
  },
  gestaoKpi: {
    flex: 1, minWidth: 110,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  gestaoKpiLbl: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  gestaoKpiVal: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  gestaoKpiHint: { fontSize: 10, color: Colors.textMuted },
  gestaoActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  gestaoBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(200,154,42,0.10)',
    borderWidth: 1, borderColor: 'rgba(200,154,42,0.40)',
    paddingVertical: 9, paddingHorizontal: 12,
    borderRadius: 8, flex: 1, minWidth: 200, justifyContent: 'center',
  },
  gestaoBtnPrimaryText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold },
  gestaoBtnSec: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 9, paddingHorizontal: 12,
    borderRadius: 8, justifyContent: 'center',
  },
  gestaoBtnSecText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  gestaoLojaHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(200,154,42,0.06)',
    borderWidth: 1, borderColor: 'rgba(200,154,42,0.20)',
  },
  gestaoLojaHintText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringDays: { fontSize: 42, fontFamily: 'Inter_700Bold', lineHeight: 46 },
  ringDaysLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginTop: 2 },

  heroInfo: { flex: 1, gap: 10 },
  heroMsg: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16 },
  kpiRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kpi: { flex: 1 },
  kpiSep: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.08)' },
  kpiLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  kpiVal: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },

  calcCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12,
  },
  calcHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  calcTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  calcGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  calcItem: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  calcItemHi: { backgroundColor: Colors.gold + '12', borderColor: Colors.gold + '40' },
  calcItemLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  calcItemVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },

  calcSubtitle: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  planoGrid: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  planoBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', gap: 2,
  },
  planoBtnActive: { backgroundColor: Colors.gold + '18', borderColor: Colors.gold + '66' },
  planoBtnLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  planoBtnLabelActive: { color: Colors.gold },
  planoBtnDias: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  planoBtnPreco: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, marginTop: 2 },

  totalBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  totalLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  totalVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold },

  pendentesCard: {
    backgroundColor: 'rgba(255,159,10,0.08)', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#FF9F0A55', marginBottom: 12,
  },
  pendentesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pendentesPulse: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF9F0A22',
    borderWidth: 1, borderColor: '#FF9F0A66', alignItems: 'center', justifyContent: 'center',
  },
  pendentesTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#FF9F0A' },
  pendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  pendNome: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  pendRole: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase' },
  pendDetalhe: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  pendMsg: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  pendActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btnReject: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,69,58,0.12)', borderWidth: 1, borderColor: '#FF453A55',
    alignItems: 'center', justifyContent: 'center',
  },
  btnApprove: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#30D158',
  },
  btnApproveText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },

  activateCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gold + '33', marginBottom: 12,
  },
  activateHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  activateTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  inputContainer: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  input: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 1.5,
  },
  activateBtn: { borderRadius: 10, overflow: 'hidden' },
  activateBtnGrad: { paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  activateBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  activateHint: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8, lineHeight: 14 },
  lockBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10,
  },
  lockBannerTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  lockBannerSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EF4444', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8,
  },
  unlockBtnText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' },

  solicitarCard: {
    backgroundColor: 'rgba(255,196,0,0.06)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gold + '44', marginBottom: 12,
  },
  solicHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  solicTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  solicTitleWait: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FF9F0A' },
  solicSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16, marginBottom: 12 },
  solicSubWait: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16 },
  solicBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.gold, paddingVertical: 11, borderRadius: 10,
  },
  solicBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },

  guestCodeRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 10,
  },
  guestCodeInputWrap: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1, borderColor: Colors.gold + '55',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  guestCodeInputWrapValido: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34,197,94,0.10)',
    shadowColor: '#22C55E',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  guestCodeInputWrapInvalido: {
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  guestCodeInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'web' ? 10 : 11,
    color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}),
  },
  guestCodeInputIcon: { marginLeft: 6 },
  guestCodeHint: {
    fontSize: 11, fontFamily: 'Inter_500Medium',
    color: Colors.textMuted, marginTop: -4, marginBottom: 6,
  },
  guestCodeHintOk: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold',
    color: '#22C55E', marginTop: -4, marginBottom: 6,
  },
  guestCodeBtn: { borderRadius: 10, overflow: 'hidden' },
  guestCodeBtnDisabled: { opacity: 0.6 },
  guestCodeBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 16, paddingVertical: 11,
  },
  guestCodeBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  guestDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10,
  },
  guestDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  guestDividerText: {
    fontSize: 10, fontFamily: 'Inter_500Medium',
    color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  guestLoginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10, borderRadius: 10,
  },
  guestLoginBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },

  suporte: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 14 },
  logoutText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%', maxWidth: 420, backgroundColor: '#0F172A',
    borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff', marginBottom: 4 },
  modalSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 12 },
  modalSummary: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 12, gap: 8,
  },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalRowLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  modalRowVal: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 12, fontFamily: 'Inter_400Regular', color: '#fff',
    minHeight: 60, textAlignVertical: 'top', marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 8 },
  modalCancel: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCancelText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  modalConfirm: { flex: 1.4, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.gold },
  modalConfirmText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
});

const _extraStylesPatch = StyleSheet.create({
  calcItemHint: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 },
  calcItemStrike: { fontSize: 9, color: Colors.textMuted, textDecorationLine: 'line-through', marginTop: 2 },
  tierBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(212,150,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.25)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    marginBottom: 10,
  },
  tierLabel: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium', flex: 1 },
  tierToggle: { fontSize: 10, color: Colors.gold, fontFamily: 'Inter_700Bold', textDecorationLine: 'underline' },
  escaloesTable: {
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.18)',
    borderRadius: 8, marginBottom: 10, overflow: 'hidden',
  },
  escaloesHeader: {
    flexDirection: 'row', backgroundColor: 'rgba(212,150,0,0.12)',
    paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(212,150,0,0.22)',
  },
  escaloesRow: {
    flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  escaloesRowActive: { backgroundColor: 'rgba(212,150,0,0.10)' },
  escaloesCell: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  escaloesHCell: { color: Colors.gold, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.4, textTransform: 'uppercase' },
  pacoteCard: {
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.25)',
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  pacoteHint: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  pacoteGrid: { flexDirection: 'row', gap: 8 },
  pacoteBtn: {
    flex: 1, position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, padding: 10, alignItems: 'center',
    minHeight: 130,
  },
  pacoteCurrentBadge: {
    position: 'absolute', top: -7, right: 6,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, zIndex: 2,
  },
  pacoteCurrentText: { fontSize: 7, color: '#fff', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  pacoteEmoji: { fontSize: 22, marginBottom: 4 },
  pacoteLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 6 },
  pacoteFeatPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6,
  },
  pacoteFeatText: { fontSize: 9, color: Colors.textSecondary, fontFamily: 'Inter_700Bold' },
  pacoteDesc: { fontSize: 9.5, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 13 },
  pacoteChangeNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: 'rgba(212,150,0,0.10)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.25)',
    borderRadius: 8, padding: 8, marginTop: 10,
  },
  pacoteChangeText: { flex: 1, fontSize: 10.5, color: Colors.text, fontFamily: 'Inter_500Medium', lineHeight: 14 },
  recBadge: {
    position: 'absolute', top: -7, right: 4,
    backgroundColor: '#34D399', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    zIndex: 2,
  },
  recBadgeText: { fontSize: 7, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.5 },
  payCard: {
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.25)',
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  payHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  payTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  payRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  payLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  payVal: { fontSize: 11, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  payHint: { fontSize: 10, color: Colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  payDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },
  payCopyBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginLeft: 8,
  },
  payCopyBtnDone: { borderColor: Colors.success + '55', backgroundColor: Colors.success + '11' },
  qrWrap: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  qrLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  qrBox: {
    padding: 10, borderRadius: 12,
    backgroundColor: '#0A1628',
    borderWidth: 1, borderColor: Colors.gold + '33',
  },
  autoRenewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  autoRenewTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  autoRenewSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  historyCard: {
    backgroundColor: 'rgba(20,20,22,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  historyEmpty: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8, padding: 8,
  },
  historyItemTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.text },
  historyItemSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  historyItemValor: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold, marginTop: 2 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.30)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  exportBtnText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#34D399' },
  reciboBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(212,150,0,0.10)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.30)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
  },
  reciboBtnText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  reciboBtnReimp: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.40)',
  },
  emissoesBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 4,
  },
  emissoesBadgeText: { fontSize: 9, color: '#F59E0B', fontFamily: 'Inter_600SemiBold' },
  emissoesBadgeNova: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    marginTop: 4,
  },
  emissoesBadgeNovaText: { fontSize: 9, color: '#34D399', fontFamily: 'Inter_600SemiBold' },
  modalSectionLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  nivelGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  nivelBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, alignItems: 'center', minHeight: 84,
  },
  nivelEmoji: { fontSize: 18, marginBottom: 2 },
  nivelLabel: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  nivelDesc: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 13 },
  cupaoRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cupaoApply: {
    backgroundColor: Colors.gold,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  cupaoApplyText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  cupaoRemove: { padding: 8 },
  cupaoDesc: { fontSize: 10, color: '#34D399', marginTop: 4 },
  compFile: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.30)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  compFileName: { flex: 1, fontSize: 11, color: Colors.text, fontFamily: 'Inter_500Medium' },
  compUploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.40)', borderStyle: 'dashed',
    borderRadius: 8, paddingVertical: 10,
  },
  compUploadText: { fontSize: 11, color: Colors.gold, fontFamily: 'Inter_500Medium' },

  comparacaoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: 'rgba(212,150,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(212,150,0,0.25)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
  },
  comparacaoBtnText: { flex: 1, fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  cmpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  cmpSheet: {
    backgroundColor: '#0A1628',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
    maxHeight: '92%',
  },
  cmpHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  cmpHeaderTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  cmpHeaderSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  cmpCloseBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', marginTop: 2,
  },
  cmpColsHeader: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 10,
  },
  cmpNivelCol: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    paddingBottom: 4,
  },
  cmpNivelEmoji: { fontSize: 18, marginBottom: 2 },
  cmpNivelLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 1 },
  cmpNivelCount: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  cmpScroll: { flex: 1 },
  cmpCatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(212,150,0,0.10)',
    paddingHorizontal: 14, paddingVertical: 7,
    borderTopWidth: 1, borderTopColor: 'rgba(255,215,0,0.1)',
  },
  cmpCatLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.8 },
  cmpRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  cmpRowEven: { backgroundColor: 'rgba(255,255,255,0.015)' },
  cmpRowOdd: { backgroundColor: 'transparent' },
  cmpFeatureCol: { flex: 2.2 },
  cmpFeatureLabel: { flex: 2.2, fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, paddingLeft: 14, lineHeight: 15 },
  cmpCloseFooter: {
    alignItems: 'center', paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cmpCloseFooterText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
});

Object.assign((styles as any), _extraStylesPatch);
