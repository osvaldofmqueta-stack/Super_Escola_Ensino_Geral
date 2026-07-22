import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {Dimensions, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useFinanceiro, formatAOA, RUPEGerado } from '@/context/FinanceiroContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useConfig } from '@/context/ConfigContext';
import TopBar from '@/components/TopBar';
import ContinuidadeStatusModal from '@/components/ContinuidadeStatusModal';
import BoletinsAlunoSection from '@/components/BoletinsAlunoSection';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import { openPdfInTab } from '@/utils/pdfAuth';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useLocalSearchParams } from 'expo-router';
import RequiredMark from '@/components/RequiredMark';
import CartaoEstudanteVisual from '@/components/CartaoEstudanteVisual';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { ALUNO_TOUR_STEPS, ALUNO_TOUR_KEY } from '@/constants/tourSteps';

const { width } = Dimensions.get('window');

const TABS = [
  { key: 'painel', label: 'Painel', icon: 'grid' },
  { key: 'cartao', label: 'Cartão', icon: 'card' },
  { key: 'provas', label: 'Provas', icon: 'calendar-check' },
  { key: 'faltas', label: 'Faltas', icon: 'calendar' },
  { key: 'diario', label: 'Diário', icon: 'journal' },
  { key: 'mensagens', label: 'Mensagens', icon: 'chatbubbles' },
  { key: 'materiais', label: 'Materiais', icon: 'folder-open' },
  { key: 'horario', label: 'Horário', icon: 'time' },
  { key: 'financeiro', label: 'Financeiro', icon: 'cash' },
  { key: 'rupes', label: 'Ref. Bancárias', icon: 'receipt' },
  { key: 'documentos', label: 'Documentos', icon: 'library' },
] as const;

const TIPO_PROVA_EST: Record<string, { label: string; color: string; icon: string }> = {
  teste:      { label: 'Teste',       color: '#3E9BD4', icon: 'pencil-box-outline' },
  exame:      { label: 'Exame',       color: '#D94F4F', icon: 'file-document-edit-outline' },
  trabalho:   { label: 'Trabalho',    color: '#D4920E', icon: 'briefcase-outline' },
  prova_oral: { label: 'Prova Oral',  color: '#22C47A', icon: 'microphone-outline' },
};

const CARTAO_TAXA_ID = 'cartao_estudante_anual';
const CARTAO_VALOR = 2500;

type TabKey = typeof TABS[number]['key'];


const TIPOS_DOC_OFICIAIS = [
  'Declaração de Matrícula',
  'Certificado de Notas',
  'Certificado de Frequência',
  'Declaração de Conclusão de Curso',
  'Histórico Escolar',
  'Diploma',
  'Outros',
];

const TIPOS_REQUER_NOTAS = [
  'Certificado de Notas',
  'Certificado de Frequência',
  'Declaração de Conclusão de Curso',
  'Histórico Escolar',
  'Diploma',
];

const RUBRICAS = [
  { id: 'decl_matricula', nome: 'Declaração de Matrícula', valor: 500 },
  { id: 'cert_notas', nome: 'Certificado de Notas', valor: 1000 },
  { id: 'cert_freq', nome: 'Certificado de Frequência', valor: 750 },
  { id: 'historico', nome: 'Histórico Escolar', valor: 2000 },
  { id: 'diploma', nome: 'Diploma', valor: 3000 },
  { id: 'outros', nome: 'Outros Documentos', valor: 500 },
];

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const DIAS_FULL = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
const PERIODOS = [
  { numero: 1, inicio: '07:00', fim: '07:45' },
  { numero: 2, inicio: '07:45', fim: '08:30' },
  { numero: 3, inicio: '08:30', fim: '09:15' },
  { numero: 4, inicio: '09:45', fim: '10:30' },
  { numero: 5, inicio: '10:30', fim: '11:15' },
  { numero: 6, inicio: '11:15', fim: '12:00' },
];

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function getStatusDisciplina(nf: number, trimestre: number) {
  if (nf === 0) return { label: 'Sem nota', color: Colors.textMuted, icon: 'help-circle' };
  if (nf >= 10) return { label: 'Aprovado', color: Colors.success, icon: 'checkmark-circle' };
  if (trimestre < 3) return { label: 'Em atraso', color: Colors.warning, icon: 'warning' };
  return { label: 'Reprovado', color: Colors.danger, icon: 'close-circle' };
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as any} size={16} color={Colors.gold} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NotaCell({ value, max = 20 }: { value: number; max?: number }) {
  const ok = value >= 10;
  const color = value === 0 ? Colors.textMuted : ok ? Colors.success : Colors.danger;
  return (
    <View style={[styles.notaCell, { borderColor: color + '44' }]}>
      <Text style={[styles.notaValue, { color }]}>{value === 0 ? '—' : value.toFixed(0)}</Text>
    </View>
  );
}

export default function PortalEstudanteScreen() {
  const { user, updateUser } = useAuth();
  const { alunos, turmas, notas, presencas, eventos, updateAluno } = useData();
  const {
    taxas, pagamentos, addPagamento, addPagamentoSelf, updatePagamento, getPagamentosAluno, getTaxasByNivel,
    isAlunoBloqueado, acessoLiberado, getMensagensAluno, marcarMensagemLida: marcarMsgFinLida,
    getRUPEsAluno, getMesesEmAtraso, calcularMulta, multaConfig, faltasJustifConfig, gerarRUPE, getSaldoAluno,
  } = useFinanceiro();
  const { mensagens, materiais, sumarios, pautas, marcarMensagemLida, calendarioProvas } = useProfessor();
  const { anoSelecionado } = useAnoAcademico();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(ALUNO_TOUR_KEY);

  const routeParams = useLocalSearchParams<{ tab?: string }>();
  const initialTab = ((TABS.find(t => t.key === String(routeParams?.tab || ''))?.key) || 'painel') as TabKey;
  const [activeTab, setActiveTab] = useTabMemory<TabKey>('portal-estudante', initialTab, routeParams?.tab as TabKey | undefined);
  useEffect(() => {
    const t = String(routeParams?.tab || '');
    if (t && TABS.some(x => x.key === t)) setActiveTab(t as TabKey);
  }, [routeParams?.tab]);
  const [trimestreNotas, setTrimestreNotas] = useState<1 | 2 | 3>(1);
  const [disciplinaMiniPauta, setDisciplinaMiniPauta] = useState<string>('todas');
  const [showContinuidade, setShowContinuidade] = useState(false);
  const [showRecargaSelf, setShowRecargaSelf] = useState(false);
  const [recargaValorSelf, setRecargaValorSelf] = useState('');
  const [recargaRupeSelfRef, setRecargaRupeSelfRef] = useState<string | null>(null);
  const [gerandoRecargaSelf, setGerandoRecargaSelf] = useState(false);
  const [diaHorario, setDiaHorario] = useState(0);
  const [horarios, setHorarios] = useState<any[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [reconfirmacoes, setReconfirmacoes] = useState<any[]>([]);
  const [msgFilter, setMsgFilter] = useState<'todas' | 'turma' | 'privada'>('todas');
  const [msgAberta, setMsgAberta] = useState<any>(null);
  const [materialAberto, setMaterialAberto] = useState<any>(null);
  const [showSolicitacaoModal, setShowSolicitacaoModal] = useState(false);
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [showPagarPropina, setShowPagarPropina] = useState(false);
  const [showReconfirmacaoModal, setShowReconfirmacaoModal] = useState(false);
  const [customDocTemplates, setCustomDocTemplates] = useState<{ id: string; nome: string; tipo?: string; disponivelAluno?: boolean }[]>([]);
  const [loadingSolicitacoes, setLoadingSolicitacoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [solForm, setSolForm] = useState({ tipo: TIPOS_DOC_OFICIAIS[0], motivo: '', observacao: '' });
  const [pagForm, setPagForm] = useState({ rubricaId: RUBRICAS[0].id, metodo: 'rupe' as 'rupe' | 'multicaixa', referencia: '' });
  const [propinaMes, setPropinaMs] = useState(new Date().getMonth() + 1);
  const [propinaTrimestre, setPropinaTriestre] = useState<1 | 2 | 3>(1);
  const [propMetodo, setPropMetodo] = useState<'rupe' | 'multicaixa'>('rupe');
  const [isLoading, setIsLoading] = useState(false);
  const [taxaParaPagar, setTaxaParaPagar] = useState<any>(null);
  const [metodoPagarTaxa, setMetodoPagarTaxa] = useState<'rupe' | 'multicaixa'>('rupe');
  const [comprovanteInput, setComprovanteInput] = useState('');
  const [showComprModal, setShowComprModal] = useState(false);
  const [comprPagId, setComprPagId] = useState<string | null>(null);
  const [comprPagText, setComprPagText] = useState('');
  const [mcxRupe, setMcxRupe] = useState<RUPEGerado | null>(null);
  const [rupeAlertasVistos, setRupeAlertasVistos] = useState<{ pagos: string[]; expiracoes: string[] }>({ pagos: [], expiracoes: [] });
  const [showPagarCartao, setShowPagarCartao] = useState(false);
  const [cartaoPayStep, setCartaoPayStep] = useState<'metodos' | 'form' | 'done'>('metodos');
  const [cartaoMetodoExt, setCartaoMetodoExt] = useState<'referencia_atm' | 'multicaixa_express' | 'rupe'>('multicaixa_express');
  const [cartaoPhone, setCartaoPhone] = useState('');
  const [cartaoRefGerada, setCartaoRefGerada] = useState<string | null>(null);
  const [documentosEmitidos, setDocumentosEmitidos] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [faltaFiltroDisc, setFaltaFiltroDisc] = useState<string>('todas');
  const [showPhotoChangedModal, setShowPhotoChangedModal] = useState(false);
  const [filtroDiscDiario, setFiltroDiscDiario] = useState<string>('todas');
  const [sumariosDirectos, setSumariosDirectos] = useState<any[] | null>(null);
  const [registosFalta, setRegistosFalta] = useState<any[]>([]);
  const [exclusoesFalta, setExclusoesFalta] = useState<any[]>([]);
  const [showJustModal, setShowJustModal] = useState<{ disciplina: string; registoId?: string } | null>(null);
  const [justMotivo, setJustMotivo] = useState('');
  const [justSaving, setJustSaving] = useState(false);
  // Justificação paga de faltas
  const [justificacoesFalta, setJustificacoesFalta] = useState<any[]>([]);
  const [showJustFaltasModal, setShowJustFaltasModal] = useState(false);
  const [jfSelectedIds, setJfSelectedIds] = useState<string[]>([]);
  const [jfMotivo, setJfMotivo] = useState('');
  const [jfComprovativo, setJfComprovativo] = useState<{ url: string; nome: string } | null>(null);
  const [jfSaving, setJfSaving] = useState(false);
  const docsScrollRef = useRef<any>(null);
  const [solicitacaoParaPagar, setSolicitacaoParaPagar] = useState<any>(null);

  const aluno = alunos.find(a =>
    (user?.alunoId && a.id === user.alunoId) ||
    (a.utilizadorId && user?.id && a.utilizadorId === user.id)
  ) ?? alunos.find(a =>
    a.nome.toLowerCase().includes(user?.nome?.split(' ')[0]?.toLowerCase() || '')
  );
  const turmaAluno = aluno ? turmas.find(t => t.id === aluno.turmaId) : null;
  const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();

  const notasAluno = aluno ? notas.filter(n => n.alunoId === aluno.id && n.anoLetivo === anoLetivo) : [];
  const presAluno = aluno ? presencas.filter(p => p.alunoId === aluno.id) : [];
  const pagamentosAluno = aluno ? getPagamentosAluno(aluno.id) : [];
  const isBloqueado   = aluno ? isAlunoBloqueado(aluno.id) : false;
  const msgsFinanceiro = aluno ? getMensagensAluno(aluno.id) : [];
  const rupesAluno    = aluno ? getRUPEsAluno(aluno.id) : [];
  const mesesAtraso   = aluno ? getMesesEmAtraso(aluno.id, anoLetivo) : 0;
  const taxaPropina   = taxas.find(t => t.tipo === 'propina' && t.ativo);
  const multaEstimada = aluno ? calcularMulta(taxaPropina?.valor || 0, mesesAtraso) : 0;
  const mensagensAluno = turmaAluno
    ? mensagens.filter(m =>
        (m.tipo === 'turma' && m.turmaId === turmaAluno.id) ||
        (m.tipo === 'privada' && (m.destinatarioId === aluno?.id || m.remetenteId === aluno?.id))
      )
    : [];
  const materiaisAluno = turmaAluno ? materiais.filter(m => m.turmaId === turmaAluno.id) : [];
  const sumariosAluno = turmaAluno ? sumarios.filter(s => s.turmaId === turmaAluno.id) : [];
  const horariosAluno = turmaAluno ? horarios.filter(h => h.turmaId === turmaAluno.id) : [];
  const taxasNivel = turmaAluno ? getTaxasByNivel(turmaAluno.nivel, anoLetivo) : [];
  const taxasPropina = taxasNivel.filter(t => t.tipo === 'propina');
  // Apenas modelos explicitamente marcados como "disponivelAluno" pelos gestores aparecem para solicitação directa.
  // Por segurança, se ainda não houver nenhum modelo publicado para alunos, mantemos a lista padrão de PDFs nativos.
  const templatesParaAluno = customDocTemplates.filter(t => t.disponivelAluno);
  const docTiposDisponiveis = templatesParaAluno.length > 0
    ? templatesParaAluno.map(t => t.nome).filter(Boolean)
    : TIPOS_DOC_OFICIAIS;
  const todasTaxasAluno = taxas.filter(t =>
    t.ativo &&
    (t.nivel === turmaAluno?.nivel || t.nivel === '' || t.nivel === 'todos' || t.nivel === 'Todos' || !t.nivel) &&
    (t.anoAcademico === anoLetivo || t.anoAcademico === '' || !t.anoAcademico)
  );
  const eventosAluno = turmaAluno
    ? eventos.filter(e => e.turmasIds.includes(turmaAluno.id) || e.turmasIds.length === 0)
        .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    : [];

  const notasTrimestre = notasAluno.filter(n => n.trimestre === trimestreNotas);
  const mediaGeral = notasAluno.length > 0
    ? (notasAluno.reduce((s, n) => s + (n.nf || n.mac || 0), 0) / notasAluno.length).toFixed(1)
    : '—';
  const pctPresenca = presAluno.length > 0
    ? Math.round((presAluno.filter(p => p.status === 'P').length / presAluno.length) * 100)
    : 100;
  const aprovadas = notasAluno.filter(n => n.nf >= 10).length;
  const reprovadas = notasAluno.filter(n => n.nf > 0 && n.nf < 10).length;
  const emAtraso = notasAluno.filter(n => n.nf === 0 && n.trimestre < 3).length;
  const unreadMsgs = mensagensAluno.filter(m => !m.lidaPor.includes(user?.id || '')).length;

  useEffect(() => {
    loadServerData(aluno?.id);
  }, [aluno?.id]);

  // Auto-mostrar tour na primeira visita do aluno
  useEffect(() => {
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  // ─── Carrega lista de alertas RUPE já vistos ───
  useEffect(() => {
    if (!aluno?.id) return;
    AsyncStorage.getItem(`@siga_rupe_alertas_${aluno.id}`).then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setRupeAlertasVistos({
          pagos: Array.isArray(parsed?.pagos) ? parsed.pagos : [],
          expiracoes: Array.isArray(parsed?.expiracoes) ? parsed.expiracoes : [],
        });
      } catch {}
    }).catch(() => {});
  }, [aluno?.id]);

  useEffect(() => {
    if (aluno?.id && activeTab === 'documentos') {
      loadServerData(aluno.id);
      loadDocumentosEmitidos(aluno.id);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!aluno?.id) return;
    const interval = setInterval(() => {
      loadServerData(aluno.id);
    }, 30000);
    return () => clearInterval(interval);
  }, [aluno?.id]);

  useEffect(() => {
    if (aluno?.id) {
      loadDocumentosEmitidos(aluno.id);
    }
  }, [aluno?.id]);

  useEffect(() => {
    if (turmaAluno?.id) {
      fetch(`/api/sumarios/turma/${encodeURIComponent(turmaAluno.id)}`)
        .then(r => r.ok ? r.json() : [])
        .then(d => setSumariosDirectos(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [turmaAluno?.id, activeTab]);

  useEffect(() => {
    setLoadingTemplates(true);
    fetch('/api/doc-templates', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const ativos = Array.isArray(data)
          ? data.filter(t => !t.bloqueado && t.nome)
          : [];
        setCustomDocTemplates(ativos);
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    if (docTiposDisponiveis.length > 0 && !docTiposDisponiveis.includes(solForm.tipo)) {
      setSolForm(f => ({ ...f, tipo: docTiposDisponiveis[0] }));
    }
  }, [customDocTemplates.length]);

  async function loadDocumentosEmitidos(alunoId: string) {
    setLoadingDocs(true);
    try {
      const data = await api.get<any[]>(`/api/documentos-emitidos/aluno/${alunoId}`).catch(() => null);
      setDocumentosEmitidos(Array.isArray(data) ? data : []);
    } catch (e) {
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadServerData(alunoId?: string) {
    if (alunoId) setLoadingSolicitacoes(true);
    try {
      const [horData, solData, recData, regFaltaData, exclData, justFaltasData] = await Promise.all([
        api.get<any[]>('/api/horarios').catch(() => null),
        alunoId ? api.get<any[]>(`/api/solicitacoes-documentos?alunoId=${encodeURIComponent(alunoId)}`).catch(() => null) : Promise.resolve(null),
        alunoId ? api.get<any[]>(`/api/reconfirmacoes-matricula?alunoId=${encodeURIComponent(alunoId)}`).catch(() => null) : Promise.resolve(null),
        alunoId ? api.get<any[]>(`/api/registos-falta-mensal?alunoId=${encodeURIComponent(alunoId)}`).catch(() => null) : Promise.resolve(null),
        alunoId ? api.get<any[]>(`/api/exclusoes-falta?alunoId=${encodeURIComponent(alunoId)}`).catch(() => null) : Promise.resolve(null),
        alunoId ? api.get<any[]>(`/api/justificacoes-falta?alunoId=${encodeURIComponent(alunoId)}`).catch(() => null) : Promise.resolve(null),
      ]);
      if (Array.isArray(horData)) setHorarios(horData);
      if (Array.isArray(solData)) setSolicitacoes(solData);
      if (Array.isArray(recData)) setReconfirmacoes(recData);
      if (Array.isArray(regFaltaData)) setRegistosFalta(regFaltaData);
      if (Array.isArray(exclData)) setExclusoesFalta(exclData);
      if (Array.isArray(justFaltasData)) setJustificacoesFalta(justFaltasData);
    } catch (e) {
    } finally {
      if (alunoId) setLoadingSolicitacoes(false);
    }
  }

  // Pick comprovativo (web only, base64 inline)
  async function handlePickComprovativoFalta() {
    if (Platform.OS !== 'web') {
      webAlert('Indisponível', 'Anexar ficheiro só está disponível na versão web por enquanto.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { webAlert('Erro', 'Ficheiro muito grande (máx 5 MB).'); return; }
      const reader = new FileReader();
      reader.onload = (ev: any) => setJfComprovativo({ url: String(ev.target.result || ''), nome: file.name });
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // Submeter pedido de justificação paga
  async function handleSubmitJustificacaoFalta() {
    if (!aluno) return;
    if (jfSelectedIds.length === 0) return webAlert('Erro', 'Seleccione pelo menos uma falta.');
    if (!jfMotivo.trim()) return webAlert('Erro', 'Indique a justificação.');
    setJfSaving(true);
    try {
      await api.post('/api/justificacoes-falta', {
        alunoId: aluno.id,
        presencaIds: jfSelectedIds,
        justificativa: jfMotivo.trim(),
        comprovativoUrl: jfComprovativo?.url || null,
        comprovativoNome: jfComprovativo?.nome || null,
        solicitadoPor: `${aluno.nome} ${aluno.apelido}`,
      });
      webAlert('Sucesso', 'Pedido enviado para a Secretaria. Será avisado quando for aprovado.');
      setShowJustFaltasModal(false);
      setJfSelectedIds([]);
      setJfMotivo('');
      setJfComprovativo(null);
      loadServerData(aluno.id);
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível enviar o pedido.');
    } finally {
      setJfSaving(false);
    }
  }

  async function handleGerarRupeJustificacao(justifId: string) {
    try {
      await api.post(`/api/justificacoes-falta/${justifId}/gerar-rupe`, {});
      webAlert('Referência gerada', 'A referência bancária foi gerada. Pode pagar agora — após confirmação, as faltas serão removidas.');
      if (aluno?.id) loadServerData(aluno.id);
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível gerar a referência bancária.');
    }
  }

  async function handleSubmitJustificacao() {
    if (!showJustModal || !aluno || !turmaAluno) return;
    if (!justMotivo.trim()) return webAlert('Erro', 'Indique o motivo da justificação.');
    setJustSaving(true);
    try {
      const trimestre = new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3;
      await fetch('/api/solicitacoes-prova-justificada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alunoId: aluno.id,
          turmaId: turmaAluno.id,
          disciplina: showJustModal.disciplina,
          anoLetivo,
          trimestre,
          tipoProva: 'outro',
          dataProvaOriginal: new Date().toISOString().slice(0, 10),
          motivo: justMotivo.trim(),
          solicitadoPor: `${aluno.nome} ${aluno.apelido}`,
          solicitadoPorId: user?.id || '',
        }),
      });
      webAlert('Sucesso', `Justificação submetida para ${showJustModal.disciplina}. A secretaria irá analisar o seu pedido.`);
      setShowJustModal(null);
      setJustMotivo('');
      if (aluno?.id) loadServerData(aluno.id);
    } catch (e) {
      webAlert('Erro', 'Não foi possível submeter a justificação. Tente novamente.');
    } finally {
      setJustSaving(false);
    }
  }

  async function handlePickPhoto() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const uri = ev.target?.result as string;
          if (aluno) await updateAluno(aluno.id, { foto: uri });
          await updateUser({ avatar: uri });
          setShowPhotoChangedModal(true);
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      webAlert('Permissão necessária', 'Precisamos de acesso à galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      if (aluno) await updateAluno(aluno.id, { foto: uri });
      await updateUser({ avatar: uri });
      setShowPhotoChangedModal(true);
    }
  }

  async function handleSolicitarDocumento() {
    if (!solForm.motivo.trim()) {
      webAlert('Atenção', 'Indique o motivo da solicitação.');
      return;
    }
    if (TIPOS_REQUER_NOTAS.includes(solForm.tipo) && notasAluno.length === 0) {
      webAlert(
        'Sem Notas Registadas',
        `O documento "${solForm.tipo}" só pode ser solicitado quando existem notas registadas em pelo menos um trimestre.\n\nAguarde o lançamento das notas pela secretaria ou contacte a escola se tiver dúvidas.`
      );
      return;
    }
    // Bloquear solicitação duplicada do mesmo tipo enquanto estiver activa
    const TERMINAIS = ['concluido', 'cancelado'];
    const duplicada = solicitacoesAluno.find(
      s => s.tipo === solForm.tipo && !TERMINAIS.includes(s.status)
    );
    if (duplicada) {
      webAlert(
        'Solicitação já em curso',
        `Já existe uma solicitação de "${solForm.tipo}" a aguardar processamento.\n\nAguarde a emissão ou o cancelamento antes de fazer uma nova solicitação do mesmo documento.`
      );
      return;
    }
    try {
      const body = {
        id: genId(),
        alunoId: aluno?.id || '',
        tipo: solForm.tipo,
        motivo: solForm.motivo,
        observacao: solForm.observacao,
        status: 'pendente',
      };
      const nova = await api.post<any>('/api/solicitacoes-documentos', body);
      setSolicitacoes(prev => [nova, ...prev]);
      setShowSolicitacaoModal(false);
      setSolForm({ tipo: docTiposDisponiveis[0] || '', motivo: '', observacao: '' });
      setTimeout(() => docsScrollRef.current?.scrollToEnd({ animated: true }), 300);
      webAlert('Solicitação enviada', 'A sua solicitação de documento foi enviada com sucesso. Acompanhe o estado na secção "Minhas Solicitações" abaixo.');
    } catch (e) {
      webAlert('Erro', 'Não foi possível enviar a solicitação. Tente novamente.');
    }
  }

  async function registarPagamento(p: Omit<Parameters<typeof addPagamentoSelf>[0], never>) {
    if (user?.role === 'aluno' || user?.alunoId) {
      await addPagamentoSelf(p);
    } else {
      await addPagamento({ ...p, status: 'pendente' as const });
    }
  }

  function getRubricaParaTipo(tipo: string) {
    const mapa: Record<string, string> = {
      'Declaração de Matrícula': 'decl_matricula',
      'Certificado de Notas': 'cert_notas',
      'Certificado de Frequência': 'cert_freq',
      'Histórico Escolar': 'historico',
      'Diploma': 'diploma',
    };
    return mapa[tipo] || 'outros';
  }

  async function handlePagarDocumento() {
    const rubrica = RUBRICAS.find(r => r.id === pagForm.rubricaId);
    if (!rubrica || !aluno) return;
    let ref: string;
    let fonteRef: string | undefined;
    if (pagForm.metodo === 'rupe') {
      try {
        const rupe = await gerarRUPE(aluno.id, rubrica.id, rubrica.valor);
        ref = rupe.referencia;
        fonteRef = rupe.fonte;
      } catch (e) {
        webAlert('Erro', 'Não foi possível gerar a referência bancária. Tente novamente.');
        return;
      }
    } else {
      ref = `MCX-${Math.floor(Math.random() * 900000 + 100000)}`;
    }
    await registarPagamento({
      alunoId: aluno.id,
      taxaId: rubrica.id,
      valor: rubrica.valor,
      data: new Date().toISOString().split('T')[0],
      ano: anoLetivo,
      status: 'pendente',
      metodoPagamento: pagForm.metodo === 'multicaixa' ? 'multicaixa' : 'transferencia',
      referencia: ref,
      observacao: `Pagamento de documento: ${rubrica.nome}`,
    });
    if (solicitacaoParaPagar) {
      try {
        await api.put(`/api/solicitacoes-documentos/${solicitacaoParaPagar.id}`, { status: 'em_processamento', referenciaPagamento: ref });
        setSolicitacoes(prev => prev.map(s => s.id === solicitacaoParaPagar.id ? { ...s, status: 'em_processamento', referenciaPagamento: ref } : s));
      } catch (_) {}
    }
    setShowPagamentoModal(false);
    setSolicitacaoParaPagar(null);
    const sufixo = pagForm.metodo === 'rupe'
      ? (fonteRef === 'emis_api'
          ? '\n\nApresente esta referência em qualquer ATM, Multicaixa Express ou balcão bancário. A confirmação é automática (até 5 minutos).'
          : '\n\nReferência simulada (modo sandbox). Para pagamentos reais, configure as credenciais EMIS no painel de administração.')
      : '\n\nEfetue o pagamento com esta referência e aguarde a confirmação da secretaria.';
    webAlert('Referência Gerada', `Método: ${pagForm.metodo === 'rupe' ? 'Ref. Bancária Multicaixa' : 'Multicaixa Express'}\nReferência: ${ref}\nValor: ${formatAOA(rubrica.valor)}${sufixo}`);
  }

  async function handlePagarPropina() {
    if (!aluno || taxasPropina.length === 0) return;
    const taxa = taxasPropina[0];
    let ref: string;
    let fonteRef: string | undefined;
    if (propMetodo === 'rupe') {
      try {
        const rupe = await gerarRUPE(aluno.id, taxa.id, taxa.valor);
        ref = rupe.referencia;
        fonteRef = rupe.fonte;
      } catch (e) {
        webAlert('Erro', 'Não foi possível gerar a referência bancária. Tente novamente.');
        return;
      }
    } else {
      ref = `MCX-PROP-${Math.floor(Math.random() * 900000 + 100000)}`;
    }
    await registarPagamento({
      alunoId: aluno.id,
      taxaId: taxa.id,
      valor: taxa.valor,
      data: new Date().toISOString().split('T')[0],
      mes: propinaMes,
      trimestre: propinaTrimestre,
      ano: anoLetivo,
      status: 'pendente',
      metodoPagamento: propMetodo === 'multicaixa' ? 'multicaixa' : 'transferencia',
      referencia: ref,
      observacao: `Propina - Trimestre ${propinaTrimestre}, Mês ${propinaMes}`,
    });
    setShowPagarPropina(false);
    const sufixo = propMetodo === 'rupe'
      ? (fonteRef === 'emis_api'
          ? '\n\nApresente esta referência em qualquer ATM, Multicaixa Express ou balcão bancário. Confirmação automática.'
          : '\n\nReferência simulada (modo sandbox).')
      : '\n\nEfetue o pagamento com esta referência.';
    webAlert('Referência de Propina Gerada', `Método: ${propMetodo === 'rupe' ? 'Ref. Bancária Multicaixa' : 'Multicaixa Express'}\nReferência: ${ref}\nValor: ${formatAOA(taxa.valor)}${sufixo}`);
  }

  async function handlePagarTaxa() {
    if (!aluno || !taxaParaPagar) return;
    let ref: string;
    let fonteRef: string | undefined;
    if (metodoPagarTaxa === 'rupe') {
      try {
        const rupe = await gerarRUPE(aluno.id, taxaParaPagar.id, taxaParaPagar.valor);
        ref = rupe.referencia;
        fonteRef = rupe.fonte;
      } catch (e) {
        webAlert('Erro', 'Não foi possível gerar a referência bancária. Tente novamente.');
        return;
      }
    } else {
      ref = `MCX-${Math.floor(Math.random() * 900000 + 100000)}`;
    }
    const obs = comprovanteInput.trim()
      ? `${taxaParaPagar.descricao} | Comprovativo: ${comprovanteInput.trim()}`
      : taxaParaPagar.descricao;
    await registarPagamento({
      alunoId: aluno.id,
      taxaId: taxaParaPagar.id,
      valor: taxaParaPagar.valor,
      data: new Date().toISOString().split('T')[0],
      ano: anoLetivo,
      status: 'pendente',
      metodoPagamento: metodoPagarTaxa === 'multicaixa' ? 'multicaixa' : 'transferencia',
      referencia: ref,
      observacao: obs,
    });
    setTaxaParaPagar(null);
    setComprovanteInput('');
    const sufixo = metodoPagarTaxa === 'rupe'
      ? (fonteRef === 'emis_api'
          ? '\n\nApresente esta referência em qualquer ATM, Multicaixa Express ou balcão bancário. Confirmação automática.'
          : '\n\nReferência simulada (modo sandbox).')
      : '\n\nEfetue o pagamento com esta referência.';
    webAlert(
      'Referência Gerada',
      `Rubrica: ${taxaParaPagar.descricao}\nMétodo: ${metodoPagarTaxa === 'rupe' ? 'Ref. Bancária Multicaixa' : 'Multicaixa Express'}\nReferência: ${ref}\nValor: ${formatAOA(taxaParaPagar.valor)}${sufixo}`
    );
  }

  async function handleSubmitComprovativo() {
    if (!comprPagId || !comprPagText.trim()) return;
    const pag = pagamentosAluno.find(p => p.id === comprPagId);
    if (!pag) return;
    const novaObs = pag.observacao
      ? pag.observacao.replace(/\s*\|\s*Comprovativo:.*$/, '') + ` | Comprovativo: ${comprPagText.trim()}`
      : `Comprovativo: ${comprPagText.trim()}`;
    await updatePagamento(comprPagId, { observacao: novaObs });
    setShowComprModal(false);
    setComprPagId(null);
    setComprPagText('');
    webAlert('Comprovativo Enviado', 'O seu comprovativo foi registado. O departamento financeiro irá validar o pagamento.');
  }

  function imprimirComprovativo(pag: any) {
    const taxa = taxas.find((t: any) => t.id === pag.taxaId);
    const nomeEscola = config?.nomeEscola || 'Super Escola';
    const logoUrl = config?.logoUrl || '';
    const morada = (config as any)?.morada || '';
    const telefone = (config as any)?.telefoneEscola || '';
    const emailEscola = (config as any)?.emailEscola || '';
    const nif = (config as any)?.nifEscola || '';
    const nomeAluno = aluno ? `${aluno.nome} ${aluno.apelido}` : (user?.nome || '—');
    const matricula = aluno?.numeroMatricula || '—';
    const turma = turmaAluno ? `${turmaAluno.nome} — ${turmaAluno.classe}ª Classe` : '—';
    const descricao = taxa?.descricao || pag.observacao?.replace(/\s*\|\s*Comprovativo:.*$/, '') || 'Pagamento';
    const valor = formatAOA(pag.valor);
    const dataFormatada = pag.data ? new Date(pag.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    const metodo = pag.metodoPagamento === 'multicaixa' ? 'Multicaixa Express' : pag.metodoPagamento === 'rupe' ? 'RUPE / Referência Bancária' : pag.metodoPagamento || '—';
    const referencia = pag.referencia || '—';
    const comprProof = pag.observacao?.match(/Comprovativo:\s*(.+)/)?.[1] || null;
    const recibo = `REC-${pag.id?.toString().slice(-8).toUpperCase() || Date.now().toString().slice(-8)}`;
    const dataEmissao = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>Comprovativo de Pagamento — ${recibo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;color:#1a1a2e;padding:30px;}
    .page{max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);}
    .header{background:linear-gradient(135deg,#0D1F35 0%,#1a3060 100%);padding:32px 36px;display:flex;align-items:center;gap:20px;}
    .logo{width:64px;height:64px;border-radius:12px;object-fit:contain;background:#fff;padding:4px;}
    .logo-placeholder{width:64px;height:64px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;font-weight:700;flex-shrink:0;}
    .header-text{flex:1;}
    .header-escola{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px;}
    .header-sub{font-size:12px;color:rgba(255,255,255,0.7);}
    .stamp-bar{background:#C9A84C;padding:10px 36px;display:flex;align-items:center;justify-content:space-between;}
    .stamp-title{font-size:15px;font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;}
    .stamp-recibo{font-size:12px;color:rgba(255,255,255,0.85);font-weight:600;}
    .body{padding:32px 36px;}
    .section{margin-bottom:24px;}
    .section-title{font-size:10px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #eee;}
    .row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
    .label{font-size:12px;color:#888;min-width:140px;}
    .value{font-size:13px;font-weight:600;color:#1a1a2e;text-align:right;flex:1;}
    .value.big{font-size:22px;font-weight:700;color:#C9A84C;}
    .status-badge{display:inline-block;background:#d4edda;color:#155724;border:1.5px solid #c3e6cb;border-radius:20px;padding:5px 18px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
    .divider{border:none;border-top:1px dashed #ddd;margin:20px 0;}
    .footer{background:#f9f9f9;border-top:1px solid #eee;padding:20px 36px;font-size:11px;color:#999;text-align:center;line-height:1.8;}
    .footer strong{color:#666;}
    .print-actions{text-align:center;padding:24px 36px 32px;gap:12px;display:flex;justify-content:center;}
    .btn{padding:12px 32px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;}
    .btn-primary{background:#C9A84C;color:#fff;}
    .btn-secondary{background:#eee;color:#444;}
    .verification{background:#f0f7ff;border:1px solid #cce0ff;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:11px;color:#2563eb;text-align:center;}
    @media print{
      body{background:#fff;padding:0;}
      .page{box-shadow:none;border-radius:0;}
      .print-actions{display:none!important;}
      @page{size:A4;margin: 0;}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    ${logoUrl
      ? `<img src="${logoUrl}" class="logo" alt="Logo"/>`
      : `<div class="logo-placeholder">${nomeEscola.charAt(0)}</div>`
    }
    <div class="header-text">
      <div class="header-escola">${nomeEscola}</div>
      <div class="header-sub">${morada || ''}${morada && (telefone || emailEscola) ? ' &nbsp;·&nbsp; ' : ''}${telefone || ''}${nif ? ' &nbsp;·&nbsp; NIF: ' + nif : ''}</div>
    </div>
  </div>

  <div class="stamp-bar">
    <span class="stamp-title">Comprovativo de Pagamento</span>
    <span class="stamp-recibo">${recibo}</span>
  </div>

  <div class="body">
    <div class="section">
      <div class="section-title">Dados do Estudante</div>
      <div class="row"><span class="label">Nome Completo</span><span class="value">${nomeAluno}</span></div>
      <div class="row"><span class="label">N.º Matrícula</span><span class="value">${matricula}</span></div>
      <div class="row"><span class="label">Turma / Classe</span><span class="value">${turma}</span></div>
      <div class="row"><span class="label">Ano Lectivo</span><span class="value">${pag.ano || anoLetivo || '—'}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Detalhes do Pagamento</div>
      <div class="row"><span class="label">Rubrica</span><span class="value">${descricao}${pag.mes ? ' — Mês ' + pag.mes : ''}</span></div>
      <div class="row"><span class="label">Valor Pago</span><span class="value big">${valor}</span></div>
      <div class="row"><span class="label">Data de Pagamento</span><span class="value">${dataFormatada}</span></div>
      <div class="row"><span class="label">Método</span><span class="value">${metodo}</span></div>
      <div class="row"><span class="label">Referência</span><span class="value">${referencia}</span></div>
      ${comprProof ? `<div class="row"><span class="label">Comprovativo</span><span class="value">${comprProof}</span></div>` : ''}
    </div>

    <hr class="divider"/>

    <div class="row" style="align-items:center;">
      <span class="label" style="font-size:13px;font-weight:600;color:#1a1a2e;">Estado</span>
      <span class="status-badge">✓ Quitado</span>
    </div>

    <div class="verification">
      Documento emitido electronicamente em ${dataEmissao} · ${nomeEscola}${nif ? ' · NIF ' + nif : ''}
    </div>
  </div>

  <div class="footer">
    ${emailEscola ? `<strong>Email:</strong> ${emailEscola} &nbsp;&nbsp;` : ''}
    ${telefone ? `<strong>Tel:</strong> ${telefone} &nbsp;&nbsp;` : ''}
    ${morada ? `<strong>Morada:</strong> ${morada}` : ''}
    <br/>Este documento serve como comprovativo oficial de pagamento emitido por ${nomeEscola}.
  </div>

  <div class="print-actions">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">Fechar</button>
  </div>
</div>
</body>
</html>`;

    if (typeof window !== 'undefined') {
      const win = window.open('', '_blank', 'width=760,height=900');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    }
  }

  async function handleReconfirmacao() {
    if (!aluno) return;
    const already = reconfirmacoes.find(r => r.alunoId === aluno.id && r.anoLetivo === anoLetivo);
    if (already) {
      webAlert('Já reconfirmado', 'A sua matrícula para este ano já foi reconfirmada.');
      setShowReconfirmacaoModal(false);
      return;
    }
    try {
      const res = await fetch('/api/reconfirmacoes-matricula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: genId(), alunoId: aluno.id, anoLetivo, status: 'confirmado' }),
      });
      if (res.ok) {
        const nova = await res.json();
        setReconfirmacoes(prev => [nova, ...prev]);
      }
      setShowReconfirmacaoModal(false);
      webAlert('Matrícula Reconfirmada', `A sua matrícula para o ano lectivo ${anoLetivo} foi reconfirmada com sucesso.`);
    } catch (e) {
      webAlert('Erro', 'Não foi possível registar a reconfirmação. Tente novamente.');
    }
  }

  const reconfirmacaoAtual = reconfirmacoes.find(r => r.alunoId === aluno?.id && r.anoLetivo === anoLetivo);
  const solicitacoesAluno = solicitacoes.filter(s => s.alunoId === aluno?.id);
  const pagamentoCartaoAtual = aluno
    ? pagamentosAluno.find(p => p.taxaId === CARTAO_TAXA_ID && p.ano === anoLetivo && p.status === 'pago')
    : null;
  const cartaoValido = !!pagamentoCartaoAtual;

  function abrirModalPagarCartao() {
    setCartaoPayStep('metodos');
    setCartaoMetodoExt('multicaixa_express');
    setCartaoPhone('');
    setCartaoRefGerada(null);
    setShowPagarCartao(true);
  }

  async function handlePagarCartao() {
    if (!aluno) return;
    setIsLoading(true);
    try {
      const ref = `CE-${anoLetivo}-${aluno.numeroMatricula}-${Date.now().toString(36).toUpperCase()}`;
      const metodoMap: Record<typeof cartaoMetodoExt, string> = {
        referencia_atm: 'multicaixa',
        multicaixa_express: 'multicaixa',
        rupe: 'transferencia',
      };
      const observacaoMap: Record<typeof cartaoMetodoExt, string> = {
        referencia_atm: 'Cartão de Estudante Virtual — Pagamento por Referência ATM',
        multicaixa_express: `Cartão de Estudante Virtual — MULTICAIXA Express (${cartaoPhone})`,
        rupe: 'Cartão de Estudante Virtual — Ref. Bancária',
      };
      await registarPagamento({
        alunoId: aluno.id,
        taxaId: CARTAO_TAXA_ID,
        valor: CARTAO_VALOR,
        data: new Date().toISOString().split('T')[0],
        ano: anoLetivo,
        status: 'pendente',
        metodoPagamento: metodoMap[cartaoMetodoExt] as any,
        referencia: ref,
        observacao: observacaoMap[cartaoMetodoExt],
      });
      setCartaoRefGerada(ref);
      setCartaoPayStep('done');
    } finally {
      setIsLoading(false);
    }
  }

  // ───── RENDER TABS ─────────────────────────────────────────────

  function renderPainel() {
    const disciplinas = [...new Set(notasAluno.map(n => n.disciplina))];
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.sectionNavWrapper, { marginHorizontal: -16, marginTop: -16, marginBottom: 16 }]}>
          <View style={styles.sectionNavGrid}>
            {TABS.filter(t => t.key !== 'painel').map(tab => {
              const alertasRupe = tab.key === 'rupes' ? calcularAlertasRupe() : null;
              const badgeCount =
                tab.key === 'mensagens' ? unreadMsgs :
                tab.key === 'rupes' ? (alertasRupe?.total ?? 0) : 0;
              const hasBadge = badgeCount > 0;
              const badgeColor =
                tab.key === 'rupes'
                  ? ((alertasRupe?.expirando.length ?? 0) > 0 ? Colors.warning : Colors.success)
                  : undefined;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.sectionNavItem}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionNavIconWrap}>
                    <Ionicons name={tab.icon as any} size={20} color={Colors.textSecondary} />
                    {hasBadge && (
                      <View style={[styles.sectionNavBadge, badgeColor ? { backgroundColor: badgeColor } : null]}>
                        <Text style={styles.sectionNavBadgeText}>{badgeCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sectionNavLabel} numberOfLines={1}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <SectionTitle title="Resumo Académico" icon="stats-chart" />
        <View style={styles.statsRow}>
          <StatCard value={mediaGeral} label="Média Geral" color={Colors.gold} />
          <TouchableOpacity onPress={() => setActiveTab('faltas')} activeOpacity={0.75}>
            <StatCard value={`${pctPresenca}%`} label="Presenças ›" color={pctPresenca >= 75 ? Colors.info : Colors.danger} />
          </TouchableOpacity>
          <StatCard value={aprovadas} label="Aprovadas" color={Colors.success} />
          <StatCard value={reprovadas} label="Reprovadas" color={Colors.danger} />
        </View>

        {turmaAluno && (
          <View style={styles.infoCard}>
            <SectionTitle title="Dados de Matrícula" icon="school" />
            <View style={styles.infoRow}><Text style={styles.infoLabel}>N.º Matrícula</Text><Text style={styles.infoVal}>{aluno?.numeroMatricula || '—'}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Turma</Text><Text style={styles.infoVal}>{turmaAluno.nome}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Classe</Text><Text style={styles.infoVal}>{turmaAluno.classe}ª Classe</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Nível</Text><Text style={styles.infoVal}>{turmaAluno.nivel}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Turno</Text><Text style={styles.infoVal}>{turmaAluno.turno}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Ano Lectivo</Text><Text style={styles.infoVal}>{anoLetivo}</Text></View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Reconfirmação</Text>
              <Badge label={reconfirmacaoAtual ? 'Confirmado' : 'Pendente'} color={reconfirmacaoAtual ? Colors.success : Colors.warning} />
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <SectionTitle title="Notas por Disciplina" icon="library" />
          {disciplinas.length === 0 && <Text style={styles.emptyText}>Sem disciplinas registadas</Text>}
          {disciplinas.length > 0 && (() => {
            // Construir mapa disciplina → trimestre → {mac, npt, mt, nf} — tudo da BD
            const notasMap: Record<string, { [t: number]: { mac: number; npt: number; mt: number; nf: number } }> = {};
            notasAluno.forEach((n: any) => {
              if (!notasMap[n.disciplina]) notasMap[n.disciplina] = {};
              const mac = (n.mac ?? 0) > 0 ? (n.mac ?? 0) : (n.mac1 ?? 0);
              const npt = n.ppt ?? 0; // NPT = ppt na BD (Nota Prova Trimestral)
              const nf  = (n.nf ?? 0) > 0 ? (n.nf ?? 0) : (n.mt1 ?? 0);
              notasMap[n.disciplina][n.trimestre] = { mac, npt, mt: n.mt1 ?? 0, nf };
            });
            const nc = (v: number | null, bold = false, accent?: string) => {
              const color = v === null ? Colors.textMuted : v >= 10 ? Colors.success : v > 0 ? Colors.danger : Colors.textMuted;
              return (
                <Text style={{ width: 38, textAlign: 'center', fontSize: 11, fontFamily: bold ? 'Inter_700Bold' : 'Inter_500Medium', color: accent ?? color }}>
                  {v !== null && v > 0 ? v.toFixed(1) : '—'}
                </Text>
              );
            };
            const hdr = (label: string, accent?: string) => (
              <Text style={{ width: 38, textAlign: 'center', fontSize: 9, fontFamily: 'Inter_700Bold', color: accent ?? Colors.textMuted, letterSpacing: 0.3 }}>{label}</Text>
            );
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 560 }}>
                  {/* Cabeçalho */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <Text style={{ flex: 2, fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.3 }}>DISCIPLINA</Text>
                    {hdr('MAC1')}{hdr('NPT1')}{hdr('T1', Colors.info)}
                    {hdr('MAC2')}{hdr('NPT2')}{hdr('T2', Colors.info)}
                    {hdr('MAC3')}{hdr('NPT3')}{hdr('T3', Colors.info)}
                    {hdr('MFD', Colors.gold)}
                  </View>
                  {disciplinas.map(disc => {
                    const r1 = notasMap[disc]?.[1] ?? null;
                    const r2 = notasMap[disc]?.[2] ?? null;
                    const r3 = notasMap[disc]?.[3] ?? null;
                    const mfdVals = [r1, r2, r3].map(r => r ? (r.nf > 0 ? r.nf : r.mt > 0 ? r.mt : 0) : 0).filter(v => v > 0);
                    const mfd = mfdVals.length > 0 ? mfdVals.reduce((a, b) => a + b, 0) / mfdVals.length : null;
                    const mfdColor = mfd === null ? Colors.textMuted : mfd >= 10 ? Colors.gold : Colors.danger;
                    return (
                      <View key={disc} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' }}>
                        <Text style={{ flex: 2, fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.text }} numberOfLines={2}>{disc}</Text>
                        {nc(r1?.mac > 0 ? r1.mac : null)}
                        {nc(r1?.npt > 0 ? r1.npt : null)}
                        {nc(r1?.mt > 0 ? r1.mt : null)}
                        {nc(r2?.mac > 0 ? r2.mac : null)}
                        {nc(r2?.npt > 0 ? r2.npt : null)}
                        {nc(r2?.mt > 0 ? r2.mt : null)}
                        {nc(r3?.mac > 0 ? r3.mac : null)}
                        {nc(r3?.npt > 0 ? r3.npt : null)}
                        {nc(r3?.mt > 0 ? r3.mt : null)}
                        <Text style={{ width: 38, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_700Bold', color: mfdColor }}>
                          {mfd !== null ? mfd.toFixed(1) : '—'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            );
          })()}
        </View>

        {documentosEmitidos.length > 0 && (
          <TouchableOpacity style={styles.infoCard} onPress={() => setActiveTab('documentos')} activeOpacity={0.85}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionTitle title="Documentos Emitidos" icon="document-text" />
              <View style={styles.docCountBadge}>
                <Text style={styles.docCountText}>{documentosEmitidos.length}</Text>
              </View>
            </View>
            <View style={styles.docBadgesRow}>
              {[...new Set(documentosEmitidos.map(d => d.tipo))].map(tipo => (
                <View key={tipo} style={styles.docTypeBadge}>
                  <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
                  <Text style={styles.docTypeBadgeText} numberOfLines={1}>{tipo}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.infoHint, { marginTop: 8, color: Colors.gold }]}>Ver histórico completo →</Text>
          </TouchableOpacity>
        )}

        {unreadMsgs > 0 && (
          <TouchableOpacity style={styles.alertCard} onPress={() => setActiveTab('mensagens')}>
            <Ionicons name="chatbubbles" size={20} color={Colors.info} />
            <Text style={styles.alertText}>Tem {unreadMsgs} {unreadMsgs === 1 ? 'mensagem nova' : 'mensagens novas'} do professor</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.info} />
          </TouchableOpacity>
        )}

        {pagamentosAluno.filter(p => p.status === 'pendente').length > 0 && (
          <TouchableOpacity style={[styles.alertCard, { borderColor: Colors.warning + '55' }]} onPress={() => setActiveTab('financeiro')}>
            <Ionicons name="cash" size={20} color={Colors.warning} />
            <Text style={[styles.alertText, { color: Colors.warning }]}>{pagamentosAluno.filter(p => p.status === 'pendente').length} pagamento(s) pendente(s)</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.warning} />
          </TouchableOpacity>
        )}

        <SectionTitle title="Calendário de Marcos Escolares" icon="calendar" />
        <Text style={styles.infoHint}>Marcos e eventos definidos pela escola para a sua turma</Text>
        {eventosAluno.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Nenhum marco ou evento definido</Text>
          </View>
        ) : (
          <View style={styles.timelineContainer}>
            {eventosAluno.map((ev, idx) => {
              const isPast = new Date(ev.data) < new Date();
              const isToday = ev.data === new Date().toISOString().split('T')[0];
              const tipoColor = ev.tipo === 'Exame' ? Colors.danger : ev.tipo === 'Feriado' ? Colors.gold : ev.tipo === 'Reunião' ? Colors.info : ev.tipo === 'Cultural' ? Colors.success : ev.tipo === 'Desportivo' ? Colors.warning : Colors.accent;
              const tipoIcon = ev.tipo === 'Exame' ? 'document-text' : ev.tipo === 'Feriado' ? 'flag' : ev.tipo === 'Reunião' ? 'people' : ev.tipo === 'Cultural' ? 'musical-notes' : ev.tipo === 'Desportivo' ? 'fitness' : 'school';
              return (
                <View key={ev.id} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: tipoColor, opacity: isPast ? 0.4 : 1 }]}>
                      <Ionicons name={tipoIcon as any} size={12} color="#fff" />
                    </View>
                    {idx < eventosAluno.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={[styles.timelineCard, isPast && { opacity: 0.55 }]}>
                    <View style={styles.timelineCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.timelineTitulo}>{ev.titulo}</Text>
                        {ev.descricao ? <Text style={styles.timelineDesc} numberOfLines={2}>{ev.descricao}</Text> : null}
                      </View>
                      <View style={styles.timelineDateBox}>
                        <Text style={[styles.timelineDateNum, { color: tipoColor }]}>
                          {new Date(ev.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                        </Text>
                        <Text style={styles.timelineHora}>{ev.hora}</Text>
                      </View>
                    </View>
                    <View style={styles.timelineFooter}>
                      <Badge label={ev.tipo} color={tipoColor} />
                      {isToday && <Badge label="Hoje" color={Colors.success} />}
                      {isPast && !isToday && <Badge label="Concluído" color={Colors.textMuted} />}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  function renderCartao() {
    const nomeCompleto = `${aluno?.nome || user?.nome || ''} ${aluno?.apelido || ''}`.trim();
    const matricula = aluno?.numeroMatricula || '—';
    const classeTurma = turmaAluno ? `${turmaAluno.classe}ª Classe — ${turmaAluno.nome}` : '—';
    const periodo = turmaAluno?.turno || '—';
    const foto = (user as any)?.avatar || aluno?.foto;
    const initials = nomeCompleto.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.cartaoSectionLabel}>CARTÃO DE ESTUDANTE DIGITAL</Text>

        <CartaoEstudanteVisual
          nome={nomeCompleto}
          matricula={matricula}
          classeTurma={classeTurma}
          periodo={periodo}
          genero={aluno?.genero}
          foto={foto}
          initials={initials}
          nomeEscola={config.nomeEscola}
          anoLetivo={anoLetivo}
          alunoId={aluno?.id || null}
          pagamentoCartaoData={pagamentoCartaoAtual?.data}
          pagamentoCartaoRef={pagamentoCartaoAtual?.referencia}
          cartaoValor={CARTAO_VALOR}
          onPagar={abrirModalPagarCartao}
        />

        {/* ── Info box ── */}
        <View style={styles.cartaoInfoBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
          <Text style={styles.cartaoInfoBoxText}>
            O QR renova-se a cada 45 segundos. O cartão fica <Text style={{ fontWeight: '700', color: '#10B981' }}>ATIVO</Text> após o pagamento do cartão físico e fica <Text style={{ fontWeight: '700', color: '#EF4444' }}>INATIVO</Text> automaticamente quando houver propinas em atraso — bloqueando o acesso às instalações. O pagamento do cartão físico é anual (por ano lectivo).
          </Text>
        </View>

        {/* ── Payment modal ── */}
        <Modal visible={showPagarCartao} transparent animationType="slide" onRequestClose={() => setShowPagarCartao(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { paddingHorizontal: 0, paddingBottom: 0, overflow: 'hidden' }]}>

              {/* ─── STEP 1: Selecção do método ─── */}
              {cartaoPayStep === 'metodos' && (
                <>
                  {/* Header colorido com valor */}
                  <View style={styles.pagHeaderBg}>
                    <Text style={styles.pagHeaderLabel}>Valor a pagar</Text>
                    <Text style={styles.pagHeaderValor}>Kz {CARTAO_VALOR.toLocaleString('pt-AO')}</Text>
                    <Text style={styles.pagHeaderSub}>Cartão de Estudante Virtual · {anoLetivo}</Text>
                  </View>

                  <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                    {/* Prazo */}
                    <View style={styles.pagPrazoRow}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.pagPrazoText}>Devido em {new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text>
                    </View>

                    {/* Opções de pagamento */}
                    {([
                      { key: 'referencia_atm', label: 'Pagamento por Referência', sub: 'ATM / Caixas Multicaixa', icon: 'business-outline' },
                      { key: 'multicaixa_express', label: 'Pague com MULTICAIXA Express', sub: 'Pagamento imediato via app', icon: 'phone-portrait-outline' },
                      { key: 'rupe', label: 'Pagamento por Referência Bancária', sub: 'ATM / Multicaixa — confirmação automática', icon: 'receipt-outline' },
                    ] as const).map(opt => (
                      <TouchableOpacity
                        key={opt.key}
                        style={styles.pagMetodoRow}
                        onPress={() => setCartaoMetodoExt(opt.key)}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pagMetodoLabel}>{opt.label}</Text>
                          <Text style={styles.pagMetodoSub}>{opt.sub}</Text>
                        </View>
                        <View style={[styles.pagRadio, cartaoMetodoExt === opt.key && styles.pagRadioActive]}>
                          {cartaoMetodoExt === opt.key && <View style={styles.pagRadioDot} />}
                        </View>
                      </TouchableOpacity>
                    ))}

                    <TouchableOpacity
                      style={[styles.pagBtnTeal, { marginTop: 20, marginBottom: 16 }]}
                      onPress={() => setCartaoPayStep('form')}
                    >
                      <Text style={styles.pagBtnTealText}>Continuar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ alignItems: 'center', paddingBottom: 16 }} onPress={() => setShowPagarCartao(false)}>
                      <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* ─── STEP 2: Formulário do método escolhido ─── */}
              {cartaoPayStep === 'form' && (
                <>
                  <View style={{ paddingHorizontal: 20, paddingTop: 20, alignItems: 'center' }}>
                    {/* Ícone */}
                    <View style={styles.pagFormIconWrap}>
                      <Ionicons
                        name={cartaoMetodoExt === 'multicaixa_express' ? 'phone-portrait-outline' : cartaoMetodoExt === 'rupe' ? 'receipt-outline' : 'business-outline'}
                        size={36}
                        color={Colors.primary}
                      />
                    </View>

                    <Text style={styles.pagFormTitle}>
                      {cartaoMetodoExt === 'multicaixa_express' ? 'Pague com MULTICAIXA Express' :
                       cartaoMetodoExt === 'rupe' ? 'Pagamento por Referência Bancária' :
                       'Pagamento por Referência ATM'}
                    </Text>

                    <View style={styles.pagFormAmountRow}>
                      <Text style={styles.pagFormAmountLabel}>Valor a pagar:</Text>
                      <Text style={styles.pagFormAmount}>Kz {CARTAO_VALOR.toLocaleString('pt-AO')}</Text>
                    </View>

                    {/* MULTICAIXA Express: campo de telefone */}
                    {cartaoMetodoExt === 'multicaixa_express' && (
                      <View style={styles.pagPhoneWrap}>
                        <Text style={styles.pagPhoneLabel}>Número de telefone</Text>
                        <View style={styles.pagPhoneRow}>
                          <Text style={styles.pagPhonePrefix}>+244</Text>
                          <TextInput
                            style={styles.pagPhoneInput}
                            placeholder="9XX XXX XXX"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="phone-pad"
                            value={cartaoPhone}
                            onChangeText={setCartaoPhone}
                            maxLength={9}
                          />
                        </View>
                        <Text style={styles.pagPhoneHint}>Receberá uma notificação na app MULTICAIXA Express para aprovar o pagamento.</Text>
                      </View>
                    )}

                    {/* Referência ATM / Bancária: mostrar instruções */}
                    {cartaoMetodoExt !== 'multicaixa_express' && (
                      <View style={styles.pagRefInfoBox}>
                        <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                        <Text style={styles.pagRefInfoText}>
                          {cartaoMetodoExt === 'referencia_atm'
                            ? 'Será gerada uma referência de pagamento. Dirija-se a qualquer caixa ATM Multicaixa para efectuar o pagamento.'
                            : 'Será gerada uma referência bancária Multicaixa. Efectue o pagamento em qualquer balcão bancário ou ATM.'}
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.pagBtnTeal, { marginTop: 20, marginBottom: 10, width: '100%' }, isLoading && { opacity: 0.6 }]}
                      onPress={handlePagarCartao}
                      disabled={isLoading || (cartaoMetodoExt === 'multicaixa_express' && cartaoPhone.replace(/\s/g, '').length < 9)}
                    >
                      {isLoading
                        ? <AppLoader color="#fff" />
                        : <Text style={styles.pagBtnTealText}>
                            {cartaoMetodoExt === 'multicaixa_express' ? 'Iniciar Pagamento' : 'Gerar Referência'}
                          </Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={{ alignItems: 'center', paddingBottom: 20 }} onPress={() => setCartaoPayStep('metodos')}>
                      <Text style={{ color: Colors.textMuted, fontSize: 14 }}>← Voltar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* ─── STEP 3: Confirmação ─── */}
              {cartaoPayStep === 'done' && (
                <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, alignItems: 'center' }}>
                  <View style={[styles.pagFormIconWrap, { backgroundColor: '#e8f8f0' }]}>
                    <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                  </View>
                  <Text style={[styles.pagFormTitle, { marginTop: 12 }]}>Pedido Registado!</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                    {cartaoMetodoExt === 'multicaixa_express'
                      ? `Foi enviado um pedido de pagamento para +244 ${cartaoPhone}.\nAprove na app MULTICAIXA Express para concluir.`
                      : 'A sua referência de pagamento foi gerada. Efectue o pagamento e aguarde a confirmação da secretaria.'}
                  </Text>
                  {cartaoRefGerada && (
                    <View style={styles.pagRefBox}>
                      <Text style={styles.pagRefBoxLabel}>Referência</Text>
                      <Text style={styles.pagRefBoxVal}>{cartaoRefGerada}</Text>
                    </View>
                  )}
                  <View style={styles.pagRefInfoBox}>
                    <Ionicons name="time-outline" size={16} color={Colors.warning} />
                    <Text style={styles.pagRefInfoText}>O pagamento ficará pendente até ser confirmado pelo departamento financeiro.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.pagBtnTeal, { marginTop: 20, width: '100%' }]}
                    onPress={() => setShowPagarCartao(false)}
                  >
                    <Text style={styles.pagBtnTealText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  function gerarHtmlMiniPautaAluno(trimestre: 1 | 2 | 3, disciplinaFiltro: string = 'todas') {
    const nomeEscola = config?.nomeEscola || 'Super Escola';
    const logoUrl = config?.logoUrl || '';
    const anoLetivo = anoSelecionado?.ano || '—';
    const nomeAluno = aluno ? `${aluno.nome} ${aluno.apelido}` : '—';
    const numMatricula = aluno?.numeroMatricula || '—';
    const turmaNome = turmaAluno?.nome || '—';
    const classe = turmaAluno?.classe || '—';
    const nivel = turmaAluno?.nivel || '—';
    const notasTrAll = aluno ? notas.filter(n => n.alunoId === aluno.id && n.trimestre === trimestre && n.anoLetivo === anoLetivo) : [];
    const notasTr = disciplinaFiltro === 'todas' ? notasTrAll : notasTrAll.filter(n => n.disciplina === disciplinaFiltro);
    const dataHoje = new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });
    const tituloDoc = disciplinaFiltro === 'todas' ? 'MINI-PAUTA INDIVIDUAL' : `MINI-PAUTA · ${disciplinaFiltro.toUpperCase()}`;

    const linhas = notasTr.map((nota, i) => {
      const nfColor = nota.nf >= 10 ? '#155724' : nota.nf > 0 ? '#721c24' : '#555';
      const status = nota.nf >= 10 ? 'Aprovado' : nota.nf > 0 ? 'Reprovado' : '—';
      return `<tr style="background:${i%2===0?'#f9f9f0':'#fff'}">
        <td style="text-align:center">${String(i+1).padStart(2,'0')}</td>
        <td style="padding-left:6px">${nota.disciplina}</td>
        <td class="nc">${nota.mac1||nota.mac||0 ? (nota.mac1||nota.mac).toFixed(1) : '—'}</td>
        <td class="nc">${nota.pp1 > 0 ? nota.pp1.toFixed(1) : '—'}</td>
        <td class="nc">${nota.ppt > 0 ? nota.ppt.toFixed(1) : '—'}</td>
        <td class="nc" style="font-weight:bold">${nota.mt1 > 0 ? nota.mt1.toFixed(1) : '—'}</td>
        <td class="nc" style="font-weight:bold;color:${nfColor}">${nota.nf > 0 ? nota.nf.toFixed(1) : '—'}</td>
        <td style="text-align:center;font-size:10px;color:${nfColor}">${status}</td>
      </tr>`;
    });

    if (linhas.length === 0) {
      return null;
    }

    return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Mini-Pauta · ${nomeAluno} · ${trimestre}º Trimestre</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Times New Roman',serif;background:#fff;color:#000;padding:20px 24px;}
  .header{text-align:center;margin-bottom:12px;}
  .header img{width:70px;height:70px;object-fit:contain;margin-bottom:4px;}
  .header p{font-size:12px;line-height:1.6;}
  .header .title{font-size:17px;font-weight:bold;margin:6px 0 2px;}
  .header .escola{font-size:13px;font-weight:bold;text-transform:uppercase;}
  .aluno-box{border:1px solid #333;border-radius:4px;padding:10px 14px;margin:10px 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:12px;}
  .aluno-field{display:flex;flex-direction:column;}
  .aluno-label{font-size:10px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.5px;}
  .aluno-value{font-size:13px;font-weight:bold;color:#000;margin-top:1px;}
  .tri-badge{display:inline-block;background:#1a6b3c;color:#fff;font-size:13px;font-weight:bold;padding:3px 14px;border-radius:20px;margin-bottom:10px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th,td{border:1px solid #555;padding:3px 5px;}
  th{background:#1a6b3c;color:#fff;font-size:10px;font-weight:bold;text-align:center;}
  td.nc{text-align:center;}
  tfoot td{font-weight:bold;background:#f0f0e0;}
  .obs{margin-top:14px;font-size:11px;color:#444;font-style:italic;}
  .footer{margin-top:20px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;}
  .sig-line{border-top:1px solid #000;margin-top:36px;padding-top:4px;min-width:200px;text-align:center;}
  @media print{body{padding:8px 10px;}@page{size:A4 portrait;margin: 0;}.no-print{display:none;}}
</style>
</head><body>
<div class="header">
  <img src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'"/>
  <p>REPÚBLICA DE ANGOLA</p>
  <p>MINISTÉRIO DA EDUCAÇÃO</p>
  <p class="escola">${nomeEscola}</p>
  <p class="title">${tituloDoc}</p>
</div>

<div style="text-align:center;margin-bottom:10px;">
  <span class="tri-badge">${trimestre}º TRIMESTRE · ${anoLetivo}</span>
</div>

<div class="aluno-box">
  <div class="aluno-field">
    <span class="aluno-label">Nome Completo</span>
    <span class="aluno-value">${nomeAluno}</span>
  </div>
  <div class="aluno-field">
    <span class="aluno-label">N.º Matrícula</span>
    <span class="aluno-value">${numMatricula}</span>
  </div>
  <div class="aluno-field">
    <span class="aluno-label">Turma / Classe</span>
    <span class="aluno-value">${turmaNome} · ${classe}ª (${nivel})</span>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:28px">Nº</th>
      <th style="text-align:left">DISCIPLINA</th>
      <th>MAC</th>
      <th>NPP</th>
      <th>NPT</th>
      <th>MT</th>
      <th>NF</th>
      <th>OBSERVAÇÃO</th>
    </tr>
  </thead>
  <tbody>
    ${linhas.join('\n')}
  </tbody>
</table>

<p class="obs">MAC = Média das Avaliações Contínuas &nbsp;|&nbsp; NPP = Nota da Prova Parcial &nbsp;|&nbsp; NPT = Nota da Prova Trimestral &nbsp;|&nbsp; MT = Média Trimestral &nbsp;|&nbsp; NF = Nota Final</p>

<div class="footer">
  <span>${nomeEscola}, ${dataHoje}.</span>
  <div class="sig-line">O DIRECTOR(A) DA ESCOLA</div>
</div>

<div class="no-print" style="text-align:center;margin-top:20px;">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:serif">
    Imprimir / Guardar PDF
  </button>
</div>
</body></html>`;
  }

  function verMiniPauta() {
    const notasTrAll = aluno ? notas.filter(n => n.alunoId === aluno.id && n.trimestre === trimestreNotas && n.anoLetivo === anoLetivo) : [];
    const notasTr = disciplinaMiniPauta === 'todas' ? notasTrAll : notasTrAll.filter(n => n.disciplina === disciplinaMiniPauta);
    const pautasFechadas = notasTr.filter(nota => {
      const p = pautas.find(p => p.turmaId === nota.turmaId && p.disciplina === nota.disciplina && p.trimestre === nota.trimestre);
      return p?.status === 'fechada';
    });
    if (pautasFechadas.length === 0) {
      webAlert('Mini-Pauta Indisponível', disciplinaMiniPauta === 'todas'
        ? 'A mini-pauta ainda não foi publicada pelo professor. Aguarde o fecho oficial da pauta.'
        : `A mini-pauta de ${disciplinaMiniPauta} ainda não foi publicada pelo professor. Aguarde o fecho oficial da pauta.`);
      return;
    }
    if (Platform.OS !== 'web') {
      webAlert('Indisponível', 'A visualização da mini-pauta está disponível na versão web do sistema.');
      return;
    }
    const html = gerarHtmlMiniPautaAluno(trimestreNotas, disciplinaMiniPauta);
    if (!html) {
      webAlert('Sem Notas', disciplinaMiniPauta === 'todas'
        ? 'Não existem notas publicadas para este trimestre.'
        : `Não existem notas publicadas de ${disciplinaMiniPauta} para este trimestre.`);
      return;
    }
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  function renderNotas() {
    const notasTr = aluno ? notas.filter(n => n.alunoId === aluno.id && n.trimestre === trimestreNotas && n.anoLetivo === anoLetivo) : [];
    const temPautaFechada = notasTr.some(nota => {
      const p = pautas.find(p => p.turmaId === nota.turmaId && p.disciplina === nota.disciplina && p.trimestre === nota.trimestre);
      return p?.status === 'fechada';
    });

    const notasPublicadas = aluno?.publicarNotas ?? true;
    const notasVisiveisGlobal = config.notasVisiveis ?? false;
    const turmaAluno = aluno ? turmas.find(t => t.id === aluno.turmaId) : null;
    const isFinalista = turmaAluno?.classe === '13';

    if (!notasVisiveisGlobal && !isFinalista) {
      return (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.emptyState, { paddingTop: 60 }]}>
            <Ionicons name="eye-off-outline" size={52} color={Colors.textMuted} />
            <Text style={[styles.emptyStateText, { fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Notas não disponíveis</Text>
            <Text style={[styles.emptyStateText, { fontSize: 13, lineHeight: 19 }]}>
              A escola ainda não activou a visualização de notas no portal. Consulte a secretaria para mais informações.
            </Text>
          </View>
        </ScrollView>
      );
    }

    if (!notasPublicadas) {
      return (
        <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.emptyState, { paddingTop: 60 }]}>
            <Ionicons name="eye-off-outline" size={52} color={Colors.textMuted} />
            <Text style={[styles.emptyStateText, { fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Notas não disponíveis</Text>
            <Text style={[styles.emptyStateText, { fontSize: 13, lineHeight: 19 }]}>
              O Director de Turma ainda não publicou as suas notas neste portal. Contacte a secretaria ou o seu director de turma para mais informações.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.trimestreSelector}>
          {([1, 2, 3] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.trimBtn, trimestreNotas === t && styles.trimBtnActive]}
              onPress={() => setTrimestreNotas(t)}
            >
              <Text style={[styles.trimBtnText, trimestreNotas === t && styles.trimBtnTextActive]}>
                {t}º Trimestre
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {notasTr.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Mini-Pauta — Escolha a disciplina
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                <TouchableOpacity
                  onPress={() => setDisciplinaMiniPauta('todas')}
                  style={[styles.filterChip, disciplinaMiniPauta === 'todas' && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, disciplinaMiniPauta === 'todas' && styles.filterChipTextActive]}>
                    Todas
                  </Text>
                </TouchableOpacity>
                {Array.from(new Set(notasTr.map(n => n.disciplina))).sort().map(disc => (
                  <TouchableOpacity
                    key={disc}
                    onPress={() => setDisciplinaMiniPauta(disc)}
                    style={[styles.filterChip, disciplinaMiniPauta === disc && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, disciplinaMiniPauta === disc && styles.filterChipTextActive]}>
                      {disc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <TouchableOpacity
          style={[styles.miniPautaBtn, !temPautaFechada && styles.miniPautaBtnDisabled]}
          onPress={verMiniPauta}
        >
          <Ionicons name="print-outline" size={16} color={temPautaFechada ? '#fff' : Colors.textMuted} />
          <Text style={[styles.miniPautaBtnText, !temPautaFechada && { color: Colors.textMuted }]}>
            {temPautaFechada
              ? (disciplinaMiniPauta === 'todas' ? 'Ver / Imprimir Mini-Pauta (Todas)' : `Ver / Imprimir Mini-Pauta · ${disciplinaMiniPauta}`)
              : 'Mini-Pauta (aguarda publicação)'}
          </Text>
          {temPautaFechada && <Ionicons name="chevron-forward" size={14} color="#fff" />}
        </TouchableOpacity>

        {aluno && (
          <TouchableOpacity
            style={styles.continuidadeBtn}
            onPress={() => setShowContinuidade(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="git-branch-outline" size={16} color={Colors.info} />
            <Text style={styles.continuidadeBtnText}>Ver Situação das Disciplinas de Continuidade</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.info} />
          </TouchableOpacity>
        )}

        {notasTrimestre.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem notas lançadas para o {trimestreNotas}º trimestre</Text>
          </View>
        ) : (
          notasTrimestre.map(nota => {
            const pauta = pautas.find(p => p.turmaId === nota.turmaId && p.disciplina === nota.disciplina && p.trimestre === nota.trimestre);
            const status = getStatusDisciplina(nota.nf, nota.trimestre);
            return (
              <View key={nota.id} style={styles.notaCard}>
                <View style={styles.notaHeader}>
                  <Text style={styles.notaDisc}>{nota.disciplina}</Text>
                  <Badge label={status.label} color={status.color} />
                </View>

                <View style={styles.notaGrid}>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>AV1</Text>
                    <NotaCell value={nota.aval1} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>AV2</Text>
                    <NotaCell value={nota.aval2} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>AV3</Text>
                    <NotaCell value={nota.aval3} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>AV4</Text>
                    <NotaCell value={nota.aval4} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>MAC</Text>
                    <NotaCell value={nota.mac1 || nota.mac} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>PP</Text>
                    <NotaCell value={nota.pp1} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>PT</Text>
                    <NotaCell value={nota.ppt} />
                  </View>
                  <View style={styles.notaItem}>
                    <Text style={styles.notaItemLabel}>MT</Text>
                    <NotaCell value={nota.mt1} />
                  </View>
                </View>

                <View style={[styles.nfRow, { borderTopColor: Colors.border }]}>
                  <Text style={styles.nfLabel}>Nota Final (NF)</Text>
                  <Text style={[styles.nfValue, { color: nota.nf >= 10 ? Colors.success : nota.nf > 0 ? Colors.danger : Colors.textMuted }]}>
                    {nota.nf > 0 ? nota.nf.toFixed(1) : '—'}
                  </Text>
                </View>

                <View style={styles.pautaRow}>
                  <Text style={styles.pautaLabel}>Pauta:</Text>
                  <Badge
                    label={pauta ? (pauta.status === 'fechada' ? 'Fechada' : pauta.status === 'aberta' ? 'Aberta' : 'Pendente') : 'Não disponível'}
                    color={pauta?.status === 'fechada' ? Colors.success : pauta?.status === 'aberta' ? Colors.info : Colors.textMuted}
                  />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  function renderMensagens() {
    const filtered = mensagensAluno.filter(m => msgFilter === 'todas' ? true : m.tipo === msgFilter);
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.readonlyBanner}>
          <Ionicons name="eye-outline" size={15} color={Colors.info} />
          <Text style={styles.readonlyText}>Apenas visualização — as mensagens são enviadas pelos professores ou pela escola.</Text>
        </View>
        <View style={styles.filterRow}>
          {(['todas', 'turma', 'privada'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, msgFilter === f && styles.filterBtnActive]}
              onPress={() => setMsgFilter(f)}
            >
              <Text style={[styles.filterBtnText, msgFilter === f && styles.filterBtnTextActive]}>
                {f === 'todas' ? 'Todas' : f === 'turma' ? 'Geral da Turma' : 'Privadas'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem mensagens</Text>
          </View>
        ) : (
          filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(msg => {
            const lida = msg.lidaPor.includes(user?.id || '');
            return (
              <TouchableOpacity
                key={msg.id}
                style={[styles.msgCard, !lida && { borderLeftWidth: 3, borderLeftColor: Colors.info }]}
                onPress={() => {
                  setMsgAberta(msg);
                  if (!lida) marcarMensagemLida(msg.id, user?.id || '');
                }}
              >
                <View style={styles.msgTop}>
                  <View style={styles.msgLeft}>
                    <Ionicons
                      name={msg.tipo === 'turma' ? 'people' : 'person'}
                      size={16}
                      color={msg.tipo === 'turma' ? Colors.info : Colors.gold}
                    />
                    <Text style={styles.msgRemetente}>{msg.remetenteNome}</Text>
                    <Badge
                      label={msg.tipo === 'turma' ? 'Turma' : 'Privada'}
                      color={msg.tipo === 'turma' ? Colors.info : Colors.gold}
                    />
                  </View>
                  {!lida && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.msgAssunto}>{msg.assunto}</Text>
                <Text style={styles.msgCorpo} numberOfLines={2}>{msg.corpo}</Text>
                <Text style={styles.msgData}>{new Date(msg.createdAt).toLocaleDateString('pt-PT')}</Text>
              </TouchableOpacity>
            );
          })
        )}

        <Modal visible={!!msgAberta} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={2}>{msgAberta?.assunto}</Text>
                <TouchableOpacity onPress={() => setMsgAberta(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.msgMeta}>
                <Text style={styles.msgMetaText}>De: {msgAberta?.remetenteNome}</Text>
                <Text style={styles.msgMetaText}>{msgAberta?.createdAt ? new Date(msgAberta.createdAt).toLocaleDateString('pt-PT') : ''}</Text>
              </View>
              <ScrollView style={styles.msgScrollBody}>
                <Text style={styles.msgFullCorpo}>{msgAberta?.corpo}</Text>
              </ScrollView>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setMsgAberta(null)}>
                <Text style={styles.closeBtnText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  function renderMateriais() {
    const TIPO_ICON: Record<string, string> = {
      pdf: 'document', link: 'link', resumo: 'book', video: 'videocam', imagem: 'image',
    };
    const TIPO_COLOR: Record<string, string> = {
      pdf: Colors.danger, link: Colors.info, resumo: Colors.gold, video: Colors.success, imagem: Colors.warning,
    };
    const sorted = [...materiaisAluno].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Materiais Disponíveis" icon="folder-open" />
        <Text style={styles.infoHint}>Ordenados por data de envio — clique para visualizar o conteúdo</Text>

        {sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem materiais disponíveis</Text>
          </View>
        ) : (
          sorted.map(mat => {
            const iconName = TIPO_ICON[mat.tipo] || 'document-text';
            const iconColor = TIPO_COLOR[mat.tipo] || Colors.info;
            return (
              <TouchableOpacity key={mat.id} style={styles.matCard} onPress={() => setMaterialAberto(mat)} activeOpacity={0.8}>
                <View style={[styles.matIcon, { backgroundColor: iconColor + '22' }]}>
                  <Ionicons name={iconName as any} size={22} color={iconColor} />
                </View>
                <View style={styles.matInfo}>
                  <Text style={styles.matTitulo}>{mat.titulo}</Text>
                  <Text style={styles.matDisc}>{mat.disciplina}</Text>
                  <Text style={styles.matData}>{new Date(mat.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
                  {mat.descricao ? <Text style={styles.matDesc} numberOfLines={1}>{mat.descricao}</Text> : null}
                </View>
                <View style={styles.matActions}>
                  <Badge label={mat.tipo.charAt(0).toUpperCase() + mat.tipo.slice(1)} color={iconColor} />
                  <View style={styles.matActionBtn}>
                    <Ionicons name="eye-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.matActionText}>Ver</Text>
                  </View>
                  {(mat.tipo === 'pdf' || mat.tipo === 'link') && (
                    <View style={styles.matActionBtn}>
                      <Ionicons name="download-outline" size={14} color={Colors.info} />
                      <Text style={[styles.matActionText, { color: Colors.info }]}>Baixar</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <Modal visible={!!materialAberto} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{materialAberto?.titulo}</Text>
                  <Text style={styles.matModalDisc}>{materialAberto?.disciplina}</Text>
                </View>
                <TouchableOpacity onPress={() => setMaterialAberto(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.matModalMeta}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.matMetaText}>{materialAberto?.createdAt ? new Date(materialAberto.createdAt).toLocaleDateString('pt-PT') : ''}</Text>
                <Badge label={materialAberto?.tipo || ''} color={TIPO_COLOR[materialAberto?.tipo] || Colors.info} />
              </View>
              {materialAberto?.descricao ? <Text style={styles.matModalDesc}>{materialAberto.descricao}</Text> : null}
              {materialAberto?.tipo === 'link' ? (
                <TouchableOpacity style={styles.matLinkBox} onPress={() => {
                  if (materialAberto?.conteudo) {
                    import('react-native').then(({ Linking }) => Linking.openURL(materialAberto.conteudo));
                  }
                }}>
                  <Ionicons name="link" size={16} color={Colors.info} />
                  <Text style={[styles.matLinkText, { flex: 1 }]} numberOfLines={2}>{materialAberto?.conteudo}</Text>
                  <Ionicons name="open-outline" size={14} color={Colors.info} />
                </TouchableOpacity>
              ) : ['pdf', 'docx', 'ppt'].includes(materialAberto?.tipo || '') ? (
                <View style={styles.matLinkBox}>
                  <Ionicons name="document-outline" size={24} color={Colors.gold} />
                  <Text style={[styles.matModalConteudo, { flex: 1 }]} numberOfLines={1}>
                    {materialAberto?.nomeArquivo || materialAberto?.titulo}
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.matModalScroll}>
                  <Text style={styles.matModalConteudo}>{materialAberto?.conteudo}</Text>
                </ScrollView>
              )}
              <View style={styles.matModalFooter}>
                {(['pdf', 'docx', 'ppt'].includes(materialAberto?.tipo || '') || materialAberto?.tipo === 'link') && (
                  <TouchableOpacity style={[styles.payBtn, { flex: 1, marginRight: 8 }]} onPress={() => {
                    const mat = materialAberto;
                    if (!mat?.conteudo) return;
                    if (mat.tipo === 'link') {
                      import('react-native').then(({ Linking }) => Linking.openURL(mat.conteudo));
                    } else if (Platform.OS === 'web' && mat.conteudo.startsWith('data:')) {
                      const a = document.createElement('a');
                      a.href = mat.conteudo;
                      a.download = mat.nomeArquivo || mat.titulo || 'ficheiro';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    } else {
                      import('react-native').then(({ Linking }) => Linking.openURL(mat.conteudo));
                    }
                  }}>
                    <Ionicons name="download-outline" size={16} color="#fff" />
                    <Text style={styles.payBtnText}>Descarregar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setMaterialAberto(null)}>
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  function renderHorario() {
    const aulasDia = horariosAluno.filter(h => h.diaSemana === diaHorario + 1);
    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.diasScroll}>
          {DIAS.map((dia, idx) => (
            <TouchableOpacity
              key={dia}
              style={[styles.diaBtn, diaHorario === idx && styles.diaBtnActive]}
              onPress={() => setDiaHorario(idx)}
            >
              <Text style={[styles.diaBtnText, diaHorario === idx && styles.diaBtnTextActive]}>{dia}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.diaFull}>{DIAS_FULL[diaHorario]}</Text>

        {aulasDia.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem aulas programadas</Text>
          </View>
        ) : (
          PERIODOS.map(periodo => {
            const aula = aulasDia.find(h => h.periodo === periodo.numero);
            return (
              <View key={periodo.numero} style={styles.periodoRow}>
                <View style={styles.periodoHora}>
                  <Text style={styles.periodoNum}>P{periodo.numero}</Text>
                  <Text style={styles.periodoTime}>{periodo.inicio}</Text>
                </View>
                {aula ? (
                  <View style={styles.aulaCard}>
                    <Text style={styles.aulaDisciplina}>{aula.disciplina}</Text>
                    <Text style={styles.aulaProf}>{aula.professorNome}</Text>
                    <View style={styles.aulaMeta}>
                      <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.aulaMetaText}>Sala {aula.sala}</Text>
                      <Text style={styles.aulaMetaText}> · {aula.horaInicio}–{aula.horaFim}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.aulaCard, styles.aulaVazia]}>
                    <Text style={styles.aulaVaziaText}>— Sem aula —</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  function renderDiario() {
    const base = sumariosDirectos !== null ? sumariosDirectos : sumariosAluno.filter(s => s.status !== 'rejeitado');
    const sorted = [...base].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const disciplinas = [...new Set(sorted.map(s => s.disciplina))].sort();
    const filtrado = filtroDiscDiario === 'todas' ? sorted : sorted.filter(s => s.disciplina === filtroDiscDiario);

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Diário de Classe" icon="journal" />
        <Text style={styles.infoHint}>Conteúdos leccionados nas aulas da sua turma</Text>

        {disciplinas.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.diasScroll}>
            <TouchableOpacity
              style={[styles.diaBtn, filtroDiscDiario === 'todas' && styles.diaBtnActive]}
              onPress={() => setFiltroDiscDiario('todas')}
            >
              <Text style={[styles.diaBtnText, filtroDiscDiario === 'todas' && styles.diaBtnTextActive]}>Todas</Text>
            </TouchableOpacity>
            {disciplinas.map(disc => (
              <TouchableOpacity
                key={disc}
                style={[styles.diaBtn, filtroDiscDiario === disc && styles.diaBtnActive]}
                onPress={() => setFiltroDiscDiario(disc)}
              >
                <Text style={[styles.diaBtnText, filtroDiscDiario === disc && styles.diaBtnTextActive]} numberOfLines={1}>{disc}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {filtrado.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="journal-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem registos de aulas</Text>
            <Text style={styles.infoHint}>O diário de classe aparecerá aqui quando os professores registarem as aulas</Text>
          </View>
        ) : (
          filtrado.map((s, idx) => {
            const dataFormatada = new Date(s.data).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
            const showDateSep = idx === 0 || filtrado[idx - 1].data !== s.data;
            return (
              <React.Fragment key={s.id}>
                {showDateSep && (
                  <View style={styles.diarioDateSep}>
                    <View style={styles.diarioDateLine} />
                    <Text style={styles.diarioDateLabel}>{dataFormatada}</Text>
                    <View style={styles.diarioDateLine} />
                  </View>
                )}
                <View style={styles.diarioCard}>
                  <View style={styles.diarioCardTop}>
                    <View style={styles.diarioDiscBadge}>
                      <Ionicons name="book-outline" size={13} color={Colors.gold} />
                      <Text style={styles.diarioDiscText} numberOfLines={1}>{s.disciplina}</Text>
                    </View>
                    <View style={styles.diarioAulaNumBadge}>
                      <Text style={styles.diarioAulaNumText}>Aula {s.numeroAula}</Text>
                    </View>
                  </View>
                  <Text style={styles.diarioConteudo}>{s.conteudo}</Text>
                  {!!s.observacaoAluno && (
                    <View style={styles.diarioObsBox}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.gold} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.diarioObsLabel}>Observação do Professor</Text>
                        <Text style={styles.diarioObsText}>{s.observacaoAluno}</Text>
                      </View>
                    </View>
                  )}
                  <View style={styles.diarioMeta}>
                    <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.diarioMetaText}>{s.professorNome}</Text>
                    <Text style={styles.diarioMetaDot}>·</Text>
                    <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.diarioMetaText}>{s.horaInicio} — {s.horaFim}</Text>
                  </View>
                </View>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>
    );
  }

  function renderFinanceiro() {
    const totalPago = pagamentosAluno.filter(p => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
    const totalPendente = pagamentosAluno.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0);
    const historicoOrdenado = [...pagamentosAluno].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const unreadFinMsg = msgsFinanceiro.filter(m => !m.lida).length;

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Bloqueio Banner */}
        {isBloqueado && (
          <View style={[styles.readonlyBanner, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '44', borderWidth: 1 }]}>
            <Ionicons name="lock-closed" size={18} color={Colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.readonlyText, { color: Colors.danger, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>Acesso Bloqueado</Text>
              <Text style={[styles.readonlyText, { color: Colors.danger }]}>O seu acesso foi temporariamente suspenso por falta de pagamento. Contacte o departamento financeiro para regularizar a situação.</Text>
            </View>
          </View>
        )}

        {/* Acesso Liberto Banner */}
        {aluno && acessoLiberado.includes(aluno.id) && mesesAtraso > 0 && (
          <View style={[styles.readonlyBanner, { backgroundColor: Colors.gold + '18', borderColor: Colors.gold + '44', borderWidth: 1 }]}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.readonlyText, { color: Colors.gold, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>Acesso Especial Activo</Text>
              <Text style={[styles.readonlyText, { color: Colors.gold }]}>O departamento financeiro autorizou o seu acesso ao portal apesar das propinas em atraso. Por favor regularize a situação brevemente.</Text>
            </View>
          </View>
        )}

        {/* Atraso Banner */}
        {!isBloqueado && mesesAtraso > 0 && (
          <View style={[styles.readonlyBanner, { backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '44', borderWidth: 1 }]}>
            <Ionicons name="time" size={18} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.readonlyText, { color: Colors.warning, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>{mesesAtraso} mês(es) de propina em atraso</Text>
              {multaConfig.ativo && multaEstimada > 0 && (
                <Text style={[styles.readonlyText, { color: Colors.warning }]}>Multa por atraso estimada: {formatAOA(multaEstimada)} ({multaConfig.percentagem}% por mês)</Text>
              )}
            </View>
          </View>
        )}

        {/* Financial Messages */}
        {msgsFinanceiro.length > 0 && (
          <>
            <SectionTitle title={`Mensagens Financeiras${unreadFinMsg > 0 ? ` (${unreadFinMsg} nova${unreadFinMsg > 1 ? 's' : ''})` : ''}`} icon="chatbubble" />
            {msgsFinanceiro.slice(0, 3).map(msg => {
              const TIPO_COLOR_MAP: Record<string, string> = { aviso: Colors.warning, bloqueio: Colors.danger, rupe: Colors.gold, geral: Colors.info };
              const msgColor = TIPO_COLOR_MAP[msg.tipo] || Colors.info;
              return (
                <TouchableOpacity key={msg.id} style={[styles.msgCard, !msg.lida && { borderLeftWidth: 3, borderLeftColor: msgColor }]}
                  onPress={() => marcarMsgFinLida(msg.id)}>
                  <View style={styles.msgTop}>
                    <View style={styles.msgLeft}>
                      <Ionicons name="chatbubble" size={14} color={msgColor} />
                      <Text style={styles.msgRemetente}>{msg.remetente}</Text>
                      <View style={{ backgroundColor: msgColor + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: msgColor, fontFamily: 'Inter_600SemiBold' }}>
                          {msg.tipo === 'aviso' ? 'Aviso' : msg.tipo === 'bloqueio' ? 'Bloqueio' : msg.tipo === 'rupe' ? 'Ref. Bancária' : 'Geral'}
                        </Text>
                      </View>
                    </View>
                    {!msg.lida && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.msgCorpo}>{msg.texto}</Text>
                  <Text style={styles.msgData}>{new Date(msg.data).toLocaleDateString('pt-PT')}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={styles.statsRow}>
          <StatCard value={formatAOA(totalPago)} label="Total Pago" color={Colors.success} />
          <StatCard value={formatAOA(totalPendente)} label="Pendente" color={Colors.warning} />
          <StatCard value={String(pagamentosAluno.length)} label="Transacções" color={Colors.info} />
        </View>

        {(() => {
          const MESES_LBL: Record<number, string> = {
            1:'Janeiro',2:'Fevereiro',3:'Março',4:'Abril',5:'Maio',6:'Junho',
            7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro',
          };
          const mesAtual = new Date().getMonth() + 1;
          const mesesLetivos = [2,3,4,5,6,7,8,9,10,11];
          const mesesPagosSet = new Set(pagamentosAluno.filter(p => p.status === 'pago').map(p => p.mes));
          const mesesPendentesSet = new Set(pagamentosAluno.filter(p => p.status === 'pendente').map(p => p.mes));
          const mesesEmAtraso = mesesLetivos.filter(m => m <= mesAtual && !mesesPagosSet.has(m) && !mesesPendentesSet.has(m));
          const pagamentoMesAtual = pagamentosAluno.find(p => p.mes === mesAtual && Number(p.ano) === Number(anoLetivo));
          const statusMesAtual: 'pago'|'pendente'|'atraso'|'sem' = pagamentoMesAtual
            ? (pagamentoMesAtual.status === 'pago' ? 'pago' : (mesesEmAtraso.includes(mesAtual) ? 'atraso' : 'pendente'))
            : (mesesEmAtraso.includes(mesAtual) ? 'atraso' : 'sem');
          const badge = ({
            pago:     { cor: Colors.success, texto: 'Mês corrente regularizado',          icon: 'checkmark-circle' as const },
            pendente: { cor: Colors.gold,    texto: 'Propina do mês em cobrança',          icon: 'time' as const },
            atraso:   { cor: Colors.danger,  texto: 'Propina do mês em atraso',            icon: 'alert-circle' as const },
            sem:      { cor: Colors.info,    texto: 'Propina do mês ainda não emitida',    icon: 'information-circle' as const },
          })[statusMesAtual];
          const diaInicioMulta = Number((multaConfig as any)?.diaInicioMulta || (multaConfig as any)?.dataLimitePagamento || 10);
          function multaProj(diasExtra: number): number {
            if (!multaConfig.ativo || mesesAtraso === 0) return 0;
            const hoje = new Date();
            if (Number((multaConfig as any).valorPorDia || 0) > 0) {
              const dias = Math.max(0, hoje.getDate() - diaInicioMulta + diasExtra);
              return Math.round(Number((multaConfig as any).valorPorDia) * (dias + mesesAtraso * 30));
            }
            if (Number((multaConfig as any).percentagemPorDia || 0) > 0) {
              const dias = Math.max(0, hoje.getDate() - diaInicioMulta + diasExtra);
              const totalDias = dias + mesesAtraso * 30;
              return Math.round((taxaPropina?.valor || 0) * (Number((multaConfig as any).percentagemPorDia) / 100) * totalDias);
            }
            return Math.round((taxaPropina?.valor || 0) * (Number(multaConfig.percentagem || 0) / 100) * mesesAtraso);
          }
          const mHoje = multaProj(0);
          const mAmanha = multaProj(1);
          const acresc = Math.max(0, mAmanha - mHoje);
          const saldoRow = aluno ? getSaldoAluno(aluno.id) : null;
          const saldo = Number(saldoRow?.saldo || 0);

          async function handleGerarRecargaSelf() {
            const v = Number(String(recargaValorSelf).replace(',', '.'));
            if (!v || v <= 0) { webAlert('Valor inválido', 'Indique um valor positivo para carregar.'); return; }
            setGerandoRecargaSelf(true);
            try {
              const r = await api.post<{ rupe: { referencia: string } }>(`/api/saldo-alunos/self/recarga-rupe`, { valor: v });
              setRecargaRupeSelfRef(r?.rupe?.referencia || null);
              setRecargaValorSelf('');
            } catch (e) {
              webAlert('Erro', (e as Error).message || 'Não foi possível gerar a referência.');
            } finally { setGerandoRecargaSelf(false); }
          }

          return (
            <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${badge.cor}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={badge.icon} size={20} color={badge.cor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: badge.cor, fontFamily: 'Inter_700Bold' }}>{badge.texto}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                    {MESES_LBL[mesAtual]} {anoLetivo} · Limite sem multa: dia {diaInicioMulta}
                  </Text>
                </View>
              </View>

              {mesesAtraso > 0 && (mHoje > 0 || mAmanha > 0) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: `${Colors.danger}10`, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Multa hoje</Text>
                    <Text style={{ fontSize: 15, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{formatAOA(mHoje)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: `${Colors.gold}10`, borderRadius: 10, padding: 10 }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Amanhã</Text>
                    <Text style={{ fontSize: 15, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{formatAOA(mAmanha)}</Text>
                    {acresc > 0 && <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>+{formatAOA(acresc)}</Text>}
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                <View>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Saldo</Text>
                  <Text style={{ fontSize: 18, color: saldo > 0 ? Colors.success : Colors.text, fontFamily: 'Inter_700Bold' }}>{formatAOA(saldo)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setShowRecargaSelf(s => !s); setRecargaRupeSelfRef(null); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}
                >
                  <MaterialCommunityIcons name="wallet-plus-outline" size={16} color="#000" />
                  <Text style={{ color: '#000', fontFamily: 'Inter_700Bold', fontSize: 12 }}>{showRecargaSelf ? 'Fechar' : 'Carregar Saldo'}</Text>
                </TouchableOpacity>
              </View>

              {showRecargaSelf && (
                <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 8 }}>
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' }}>
                    Indique o valor a carregar. É gerada uma referência bancária; o saldo é creditado quando a tesouraria confirmar o pagamento.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={recargaValorSelf}
                      onChangeText={setRecargaValorSelf}
                      keyboardType="numeric"
                      placeholder="Valor (AOA)"
                      placeholderTextColor={Colors.textMuted}
                      style={{ flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text }}
                    />
                    <TouchableOpacity
                      onPress={handleGerarRecargaSelf}
                      disabled={gerandoRecargaSelf}
                      style={{ backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, opacity: gerandoRecargaSelf ? 0.6 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }}>{gerandoRecargaSelf ? 'A gerar…' : 'Gerar Referência'}</Text>
                    </TouchableOpacity>
                  </View>
                  {recargaRupeSelfRef && (
                    <View style={{ backgroundColor: `${Colors.success}10`, borderRadius: 10, padding: 10 }}>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' }}>Referência gerada</Text>
                      <Text selectable style={{ fontSize: 16, color: Colors.success, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>{recargaRupeSelfRef}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                        Pague no banco/Multicaixa com esta referência. O saldo é creditado quando o pagamento for confirmado.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        <SectionTitle title="Reconfirmação de Matrícula" icon="refresh" />
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Estado</Text>
            <Badge
              label={reconfirmacaoAtual ? 'Confirmado' : 'Pendente'}
              color={reconfirmacaoAtual ? Colors.success : Colors.warning}
            />
          </View>
          {reconfirmacaoAtual && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Data</Text>
              <Text style={styles.infoVal}>{new Date(reconfirmacaoAtual.data).toLocaleDateString('pt-PT')}</Text>
            </View>
          )}
          {!!(aluno as any)?.bloqueioRenovacao && !reconfirmacaoAtual && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.danger + '15', borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + '40', padding: 12, marginBottom: 10 }}>
              <Ionicons name="lock-closed" size={16} color={Colors.danger} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger }}>Renovação Bloqueada</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger, marginTop: 2, lineHeight: 18 }}>
                  {(aluno as any)?.motivoBloqueioRenovacao
                    ? (aluno as any).motivoBloqueioRenovacao
                    : 'A renovação da sua matrícula foi bloqueada pela secretaria. Contacte a secretaria para mais informações.'}
                </Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[styles.payBtn, reconfirmacaoAtual && { backgroundColor: Colors.success }, !!(aluno as any)?.bloqueioRenovacao && !reconfirmacaoAtual && { backgroundColor: Colors.textMuted }]}
            onPress={() => {
              if (!!(aluno as any)?.bloqueioRenovacao && !reconfirmacaoAtual) {
                webAlert('Renovação Bloqueada', 'A renovação da sua matrícula está temporariamente suspensa. Contacte a secretaria para regularizar a situação.');
                return;
              }
              reconfirmacaoAtual ? webAlert('Já confirmado', 'A matrícula já está reconfirmada.') : setShowReconfirmacaoModal(true);
            }}
          >
            <Ionicons name={reconfirmacaoAtual ? 'checkmark-circle' : !!(aluno as any)?.bloqueioRenovacao ? 'lock-closed' : 'refresh'} size={18} color="#fff" />
            <Text style={styles.payBtnText}>{reconfirmacaoAtual ? 'Matrícula Confirmada' : !!(aluno as any)?.bloqueioRenovacao ? 'Renovação Bloqueada' : 'Reconfirmar Matrícula'}</Text>
          </TouchableOpacity>
        </View>

        <SectionTitle title="Rubricas Disponíveis" icon="pricetag" />
        <Text style={styles.infoHint}>Todas as rubricas activas para o ano lectivo {anoLetivo}. Clique em "Pagar" para gerar uma referência.</Text>

        {todasTaxasAluno.length === 0 ? (
          <View style={[styles.emptyState, { marginBottom: 16 }]}>
            <Ionicons name="pricetag-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem rubricas configuradas para este ano</Text>
          </View>
        ) : (
          todasTaxasAluno.map(taxa => {
            const jaTemPendente = pagamentosAluno.some(p => p.taxaId === taxa.id && p.status === 'pendente');
            const TIPO_ICON_MAP: Record<string, string> = { propina: 'school', matricula: 'document', material: 'book', exame: 'document-text', outro: 'cash' };
            const TIPO_COLOR_MAP: Record<string, string> = { propina: Colors.info, matricula: Colors.gold, material: Colors.success, exame: Colors.warning, outro: Colors.textMuted };
            const taxaIcon = TIPO_ICON_MAP[taxa.tipo] || 'cash';
            const taxaColor = TIPO_COLOR_MAP[taxa.tipo] || Colors.info;
            return (
              <View key={taxa.id} style={styles.taxaCard}>
                <View style={styles.taxaLeft}>
                  <View style={[styles.taxaIconBox, { backgroundColor: taxaColor + '22' }]}>
                    <Ionicons name={taxaIcon as any} size={20} color={taxaColor} />
                  </View>
                  <View style={styles.taxaInfo}>
                    <Text style={styles.taxaTitulo}>{taxa.descricao}</Text>
                    <Text style={styles.taxaMeta}>{taxa.frequencia} · {taxa.nivel || 'Todos os níveis'}</Text>
                    {jaTemPendente && <Badge label="Referência Gerada" color={Colors.warning} />}
                  </View>
                </View>
                <View style={styles.taxaRight}>
                  <Text style={[styles.taxaValor, { color: Colors.gold }]}>{formatAOA(taxa.valor)}</Text>
                  <TouchableOpacity
                    style={[styles.payBtnSmall, jaTemPendente && { backgroundColor: Colors.warning + '44' }]}
                    onPress={() => { setTaxaParaPagar(taxa); setMetodoPagarTaxa('rupe'); }}
                  >
                    <Text style={styles.payBtnSmallText}>{jaTemPendente ? 'Pagar novamente' : 'Pagar'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* RUPEs Gerados */}
        {rupesAluno.length > 0 && (
          <>
            <SectionTitle title="Referências Bancárias" icon="receipt" />
            {rupesAluno.map(r => {
              const t = taxas.find(x => x.id === r.taxaId);
              const expirado = new Date(r.dataValidade) < new Date();
              return (
                <View key={r.id} style={[styles.pagCard, { borderLeftWidth: 2, borderLeftColor: Colors.gold }]}>
                  <View style={styles.pagTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pagDesc}>{t?.descricao || 'Rubrica'}</Text>
                      <Text style={[styles.pagRef, { color: Colors.gold }]}>{r.referencia}</Text>
                      <Text style={styles.pagMetaText}>Válido até: {new Date(r.dataValidade).toLocaleDateString('pt-PT')}</Text>
                    </View>
                    <View style={{ backgroundColor: (expirado ? Colors.danger : Colors.gold) + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, color: expirado ? Colors.danger : Colors.gold, fontFamily: 'Inter_600SemiBold' }}>{expirado ? 'Expirado' : 'Activo'}</Text>
                    </View>
                  </View>
                  <View style={styles.pagBottom}>
                    <Text style={[styles.pagValor, { color: Colors.gold }]}>{formatAOA(r.valor)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <SectionTitle title="Histórico Financeiro" icon="receipt" />
        {historicoOrdenado.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem transacções registadas</Text>
          </View>
        ) : (
          historicoOrdenado.map(pag => {
            const taxa = taxas.find(t => t.id === pag.taxaId);
            const statusColor = pag.status === 'pago' ? Colors.success : pag.status === 'pendente' ? Colors.warning : Colors.danger;
            const statusLabel = pag.status === 'pago' ? 'Pago' : pag.status === 'pendente' ? 'Pendente' : 'Cancelado';
            const comprProof = pag.observacao?.match(/Comprovativo:\s*(.+)/)?.[1];
            return (
              <View key={pag.id} style={styles.pagCard}>
                <View style={styles.pagTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pagDesc}>{taxa?.descricao || pag.observacao || 'Pagamento'}</Text>
                    <Text style={styles.pagMetaText}>{pag.data} {pag.mes ? `· Mês ${pag.mes}` : ''}</Text>
                    {comprProof && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <Ionicons name="document-attach" size={11} color={Colors.success} />
                        <Text style={{ fontSize: 10, color: Colors.success, fontFamily: 'Inter_600SemiBold' }}>Comprovativo: {comprProof}</Text>
                      </View>
                    )}
                  </View>
                  <Badge label={statusLabel} color={statusColor} />
                </View>
                <View style={styles.pagBottom}>
                  <Text style={[styles.pagValor, { color: Colors.gold }]}>{formatAOA(pag.valor)}</Text>
                  {pag.referencia ? (
                    <View style={styles.pagRefRow}>
                      <Ionicons name="barcode-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.pagRef}>{pag.referencia}</Text>
                    </View>
                  ) : null}
                  {pag.metodoPagamento && (
                    <Badge
                      label={pag.metodoPagamento === 'multicaixa' ? 'Multicaixa' : 'Ref. Bancária'}
                      color={pag.metodoPagamento === 'multicaixa' ? Colors.success : Colors.info}
                    />
                  )}
                </View>
                {pag.status === 'pendente' && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, backgroundColor: Colors.info + '18', borderRadius: 8, borderWidth: 1, borderColor: Colors.info + '44' }}
                    onPress={() => { setComprPagId(pag.id); setComprPagText(comprProof || ''); setShowComprModal(true); }}
                  >
                    <Ionicons name="document-attach-outline" size={14} color={Colors.info} />
                    <Text style={{ color: Colors.info, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                      {comprProof ? 'Actualizar Comprovativo' : 'Submeter Comprovativo'}
                    </Text>
                  </TouchableOpacity>
                )}
                {pag.status === 'pago' && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, backgroundColor: Colors.success + '14', borderRadius: 8, borderWidth: 1, borderColor: Colors.success + '44' }}
                    onPress={() => imprimirComprovativo(pag)}
                  >
                    <Ionicons name="print-outline" size={14} color={Colors.success} />
                    <Text style={{ color: Colors.success, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                      Imprimir Comprovativo
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* Modal Pagar Taxa */}
        <Modal visible={!!taxaParaPagar} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Gerar Referência de Pagamento</Text>
                <TouchableOpacity onPress={() => setTaxaParaPagar(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              {taxaParaPagar && (
                <>
                  <View style={styles.infoCard}>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Rubrica</Text><Text style={styles.infoVal}>{taxaParaPagar.descricao}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Valor</Text><Text style={[styles.infoVal, { color: Colors.gold }]}>{formatAOA(taxaParaPagar.valor)}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Frequência</Text><Text style={styles.infoVal}>{taxaParaPagar.frequencia}</Text></View>
                  </View>
                  <Text style={styles.formLabel}>Método de Pagamento</Text>
                  <View style={styles.metodoRow}>
                    <TouchableOpacity style={[styles.metodoBtn, metodoPagarTaxa === 'rupe' && styles.metodoBtnActive]} onPress={() => setMetodoPagarTaxa('rupe')}>
                      <Text style={[styles.metodoBtnText, metodoPagarTaxa === 'rupe' && styles.metodoBtnTextActive]}>Ref. Bancária</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.metodoBtn, metodoPagarTaxa === 'multicaixa' && styles.metodoBtnActive]} onPress={() => setMetodoPagarTaxa('multicaixa')}>
                      <Text style={[styles.metodoBtnText, metodoPagarTaxa === 'multicaixa' && styles.metodoBtnTextActive]}>Multicaixa Express</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.formLabel}>Comprovativo (opcional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="N.º transferência, referência bancária, etc."
                    placeholderTextColor={Colors.textMuted}
                    value={comprovanteInput}
                    onChangeText={setComprovanteInput}
                  />
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 8, marginTop: -4 }}>
                    Se já efectuou o pagamento, indique a referência para facilitar a validação.
                  </Text>
                  <TouchableOpacity style={styles.submitBtn} onPress={handlePagarTaxa}>
                    <Text style={styles.submitBtnText}>Gerar Referência</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* Modal Submeter Comprovativo */}
        <Modal visible={showComprModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Submeter Comprovativo</Text>
                <TouchableOpacity onPress={() => setShowComprModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                Indique a referência bancária, número de transferência ou outra informação que comprove o seu pagamento. O departamento financeiro irá validar e confirmar o pagamento.
              </Text>
              <Text style={styles.formLabel}>Referência / Comprovativo</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: TRF-2026-123456 ou REF ATM 998877"
                placeholderTextColor={Colors.textMuted}
                value={comprPagText}
                onChangeText={setComprPagText}
              />
              <TouchableOpacity
                style={[styles.submitBtn, !comprPagText.trim() && { opacity: 0.5 }]}
                onPress={handleSubmitComprovativo}
                disabled={!comprPagText.trim()}
              >
                <Text style={styles.submitBtnText}>Enviar Comprovativo</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* Modal Pagar via Multicaixa Express */}
        <Modal visible={!!mcxRupe} transparent animationType="slide" onRequestClose={() => setMcxRupe(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 420 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 8,
                    backgroundColor: Colors.success + '22',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="phone-portrait-outline" size={18} color={Colors.success} />
                  </View>
                  <Text style={styles.modalTitle}>Pagar com Multicaixa Express</Text>
                </View>
                <TouchableOpacity onPress={() => setMcxRupe(null)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {mcxRupe && (() => {
                const taxa = taxas.find(t => t.id === mcxRupe.taxaId);
                const tentarAbrirApp = async () => {
                  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
                  const ua = navigator.userAgent || '';
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
                  if (!isMobile) {
                    webAlert(
                      'Abra no telemóvel',
                      'A app Multicaixa Express só funciona em telemóvel. No computador, use o QR code com o telemóvel ou um Multicaixa físico/ATM.'
                    );
                    return;
                  }
                  try {
                    const store = /iPhone|iPad|iPod/i.test(ua)
                      ? 'https://apps.apple.com/ao/app/multicaixa-express/id1163831833'
                      : 'https://play.google.com/store/apps/details?id=ao.bancaria.mobile.app';
                    const link = document.createElement('a');
                    link.href = 'multicaixaexpress://';
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => {
                      if (!document.hidden) {
                        window.open(store, '_blank');
                      }
                    }, 1800);
                  } catch {
                    const store = /iPhone|iPad|iPod/i.test(ua)
                      ? 'https://apps.apple.com/ao/app/multicaixa-express/id1163831833'
                      : 'https://play.google.com/store/apps/details?id=ao.bancaria.mobile.app';
                    window.open(store, '_blank');
                  }
                };
                const copiarRef = () => {
                  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(mcxRupe.referencia).then(
                      () => webAlert('Copiado', 'Referência copiada para a área de transferência.'),
                      () => {}
                    );
                  }
                };
                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={{ color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
                      Escolha uma das opções abaixo para concluir o pagamento.
                    </Text>

                    {/* Opção 1: QR Code */}
                    <View style={{
                      backgroundColor: Colors.accent + '14',
                      borderRadius: 12, padding: 14, marginBottom: 12,
                      borderWidth: 1, borderColor: Colors.accent + '40',
                      alignItems: 'center',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 10 }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: Colors.accent,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>1</Text>
                        </View>
                        <Text style={{ color: Colors.accentLight, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 }}>
                          LEIA O QR CODE
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10,
                      }}>
                        <QRCode
                          value={mcxRupe.referencia}
                          size={170}
                          color="#0D1F35"
                          backgroundColor="#FFFFFF"
                        />
                      </View>
                      <Text style={{ color: Colors.textSecondary, fontSize: 11, textAlign: 'center', lineHeight: 15 }}>
                        Abra a app <Text style={{ color: Colors.success, fontFamily: 'Inter_700Bold' }}>Multicaixa Express</Text> no
                        seu telemóvel, escolha <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>"Ler QR Code"</Text> e
                        aponte para o código acima.
                      </Text>
                    </View>

                    {/* Opção 2: Manual */}
                    <View style={{
                      backgroundColor: Colors.gold + '14',
                      borderRadius: 12, padding: 14, marginBottom: 12,
                      borderWidth: 1, borderColor: Colors.gold + '40',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: Colors.gold,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>2</Text>
                        </View>
                        <Text style={{ color: Colors.gold, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 }}>
                          OU INTRODUZA MANUALMENTE
                        </Text>
                      </View>

                      <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>REFERÊNCIA</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Text selectable style={{
                          flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold',
                          color: '#fff', letterSpacing: 2,
                        }}>{mcxRupe.referencia}</Text>
                        <TouchableOpacity
                          onPress={copiarRef}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6,
                            backgroundColor: Colors.gold + '33',
                            borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 4,
                          }}>
                          <Ionicons name="copy-outline" size={13} color={Colors.gold} />
                          <Text style={{ color: Colors.gold, fontSize: 11, fontFamily: 'Inter_700Bold' }}>Copiar</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: Colors.textMuted, fontSize: 11 }}>Valor a pagar:</Text>
                        <Text style={{ color: Colors.gold, fontSize: 13, fontFamily: 'Inter_700Bold' }}>{formatAOA(mcxRupe.valor)}</Text>
                      </View>
                      {taxa && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: Colors.textMuted, fontSize: 11 }}>Descrição:</Text>
                          <Text style={{ color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'right' }} numberOfLines={1}>
                            {taxa.descricao}
                          </Text>
                        </View>
                      )}

                      <View style={{ height: 1, backgroundColor: Colors.gold + '33', marginVertical: 10 }} />

                      <Text style={{ color: Colors.textSecondary, fontSize: 11, lineHeight: 15 }}>
                        Na app, vá a <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>Pagamentos → Pagamento de Serviços</Text> e
                        introduza a referência acima.
                      </Text>
                    </View>

                    {/* Botão abrir app */}
                    <TouchableOpacity
                      onPress={tentarAbrirApp}
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: Colors.success,
                        borderRadius: 12, paddingVertical: 13,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        marginBottom: 8,
                      }}>
                      <Ionicons name="open-outline" size={17} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' }}>
                        Abrir app Multicaixa Express
                      </Text>
                    </TouchableOpacity>

                    <Text style={{ color: Colors.textMuted, fontSize: 10.5, textAlign: 'center', lineHeight: 14 }}>
                      Após pagar, toque em <Text style={{ color: Colors.info, fontFamily: 'Inter_700Bold' }}>"Verificar no banco"</Text> para
                      confirmar o estado da sua referência.
                    </Text>
                  </ScrollView>
                );
              })()}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* Modal Reconfirmação */}
        <Modal visible={showReconfirmacaoModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reconfirmação de Matrícula</Text>
                <TouchableOpacity onPress={() => setShowReconfirmacaoModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.reconfText}>
                Confirma a sua matrícula para o ano lectivo <Text style={{ color: Colors.gold }}>{anoLetivo}</Text> na turma <Text style={{ color: Colors.gold }}>{turmaAluno?.nome || '—'}</Text>?
              </Text>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>N.º Matrícula</Text><Text style={styles.infoVal}>{aluno?.numeroMatricula}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Classe</Text><Text style={styles.infoVal}>{turmaAluno?.classe}ª Classe</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Nível</Text><Text style={styles.infoVal}>{turmaAluno?.nivel}</Text></View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleReconfirmacao}>
                <Text style={styles.submitBtnText}>Confirmar Matrícula</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  function calcularAlertasRupe() {
    if (!aluno) return { expirando: [] as RUPEGerado[], pagosNovos: [] as RUPEGerado[], total: 0 };
    const lista = getRUPEsAluno(aluno.id);
    const agora = Date.now();
    const limite48h = 48 * 3600 * 1000;
    const expirando = lista.filter(r => {
      if (r.status !== 'ativo') return false;
      const venc = new Date(r.dataValidade).getTime();
      const ms = venc - agora;
      return ms > 0 && ms <= limite48h;
    });
    const pagosNovos = lista.filter(r => r.status === 'pago' && !rupeAlertasVistos.pagos.includes(r.id));
    return { expirando, pagosNovos, total: expirando.length + pagosNovos.length };
  }

  function dispensarAlertaPago(rupeId: string) {
    if (!aluno) return;
    const novos = { ...rupeAlertasVistos, pagos: [...rupeAlertasVistos.pagos, rupeId] };
    setRupeAlertasVistos(novos);
    AsyncStorage.setItem(`@siga_rupe_alertas_${aluno.id}`, JSON.stringify(novos)).catch(() => {});
  }

  function dispensarTodosAlertasPagos() {
    if (!aluno) return;
    const lista = getRUPEsAluno(aluno.id);
    const idsPagos = lista.filter(r => r.status === 'pago').map(r => r.id);
    const novos = { ...rupeAlertasVistos, pagos: Array.from(new Set([...rupeAlertasVistos.pagos, ...idsPagos])) };
    setRupeAlertasVistos(novos);
    AsyncStorage.setItem(`@siga_rupe_alertas_${aluno.id}`, JSON.stringify(novos)).catch(() => {});
  }

  function renderRupes() {
    if (!aluno) {
      return (
        <View style={styles.tabContent}>
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 24 }}>Aluno não identificado.</Text>
        </View>
      );
    }
    const lista = getRUPEsAluno(aluno.id);
    const agora = Date.now();
    const alertas = calcularAlertasRupe();

    function statusInfo(r: RUPEGerado) {
      const venc = new Date(r.dataValidade).getTime();
      const expirado = r.status !== 'pago' && venc < agora;
      const efetivo = expirado && r.status === 'ativo' ? 'expirado' : r.status;
      const map: Record<string, { label: string; color: string; icon: string }> = {
        pago:     { label: 'Pago',     color: Colors.success,   icon: 'checkmark-circle' },
        ativo:    { label: 'Activo',   color: Colors.info,      icon: 'time' },
        expirado: { label: 'Expirado', color: Colors.danger,    icon: 'close-circle' },
      };
      return { ...(map[efetivo] ?? map.ativo), efetivo };
    }

    function tempoRestante(r: RUPEGerado) {
      const venc = new Date(r.dataValidade).getTime();
      const ms = venc - agora;
      if (ms <= 0) return 'Expirado';
      const horas = Math.floor(ms / 3600000);
      if (horas >= 48) return `${Math.floor(horas / 24)} dias`;
      if (horas >= 1) return `${horas}h restantes`;
      const mins = Math.max(1, Math.floor(ms / 60000));
      return `${mins} min restantes`;
    }

    function fmtData(s: string) {
      try {
        const d = new Date(s);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
               d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      } catch { return s; }
    }

    function copiarReferencia(ref: string) {
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(ref).then(
            () => webAlert('Copiado', 'Referência copiada para a área de transferência.'),
            () => {}
          );
        }
      } catch {}
    }

    async function abrirComprovativo(r: RUPEGerado) {
      try {
        const path = `/api/pdf/multicaixa/${encodeURIComponent(r.id)}`;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          await openPdfInTab(path);
        } else {
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          const { getPdfUrl } = await import('@/utils/pdfAuth');
          const fullUrl = await getPdfUrl(`${baseUrl}${path}`);
          await Linking.openURL(fullUrl);
        }
      } catch (e: any) {
        webAlert('Erro', String(e?.message || 'Não foi possível abrir o comprovativo.'));
      }
    }

    async function verificarEstado(r: RUPEGerado) {
      try {
        const resp = await api.post<{ rupe: RUPEGerado; mudou: boolean; mensagem: string; consultadoBanco?: boolean }>(
          `/api/rupes/self/${encodeURIComponent(r.id)}/verificar`,
          {}
        );
        const titulo = resp.consultadoBanco ? 'Estado verificado no banco' : 'Estado verificado';
        webAlert(titulo, resp.mensagem || 'Verificação concluída.');
      } catch (e: any) {
        webAlert('Erro', String(e?.message || 'Não foi possível verificar o estado.'));
      }
    }

    const total = lista.length;
    const pagos = lista.filter(r => r.status === 'pago').length;
    const ativos = lista.filter(r => r.status === 'ativo' && new Date(r.dataValidade).getTime() >= agora).length;
    const expirados = total - pagos - ativos;

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionTitle title="As minhas Referências Bancárias" icon="receipt" />

        {/* ── Banners de notificação ── */}
        {alertas.pagosNovos.length > 0 && (
          <View style={{
            backgroundColor: Colors.success + '1A',
            borderWidth: 1, borderColor: Colors.success + '66',
            borderLeftWidth: 5, borderLeftColor: Colors.success,
            borderRadius: 12, padding: 12, marginBottom: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="checkmark-done-circle" size={18} color={Colors.success} />
              <Text style={{ marginLeft: 6, color: Colors.success, fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1 }}>
                {alertas.pagosNovos.length === 1
                  ? 'Pagamento confirmado pelo banco!'
                  : `${alertas.pagosNovos.length} pagamentos confirmados pelo banco!`}
              </Text>
              {alertas.pagosNovos.length > 1 && (
                <TouchableOpacity onPress={dispensarTodosAlertasPagos} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ color: Colors.success, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Dispensar todos</Text>
                </TouchableOpacity>
              )}
            </View>
            {alertas.pagosNovos.slice(0, 3).map(r => {
              const taxa = taxas.find(t => t.id === r.taxaId);
              return (
                <View key={r.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.success + '33',
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                      {taxa?.descricao || r.taxaId}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>
                      {formatAOA(r.valor)} · Ref. {r.referencia}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => dispensarAlertaPago(r.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{
                      paddingHorizontal: 8, paddingVertical: 4,
                      backgroundColor: Colors.success + '22', borderRadius: 6,
                    }}>
                    <Ionicons name="close" size={14} color={Colors.success} />
                  </TouchableOpacity>
                </View>
              );
            })}
            {alertas.pagosNovos.length > 3 && (
              <Text style={{ color: Colors.textMuted, fontSize: 10.5, marginTop: 6, textAlign: 'center' }}>
                e mais {alertas.pagosNovos.length - 3}…
              </Text>
            )}
          </View>
        )}

        {alertas.expirando.length > 0 && (
          <View style={{
            backgroundColor: Colors.warning + '1A',
            borderWidth: 1, borderColor: Colors.warning + '66',
            borderLeftWidth: 5, borderLeftColor: Colors.warning,
            borderRadius: 12, padding: 12, marginBottom: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
              <Text style={{ marginLeft: 6, color: Colors.warning, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                {alertas.expirando.length === 1
                  ? '1 referência prestes a expirar'
                  : `${alertas.expirando.length} referências prestes a expirar`}
              </Text>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 11.5, marginBottom: 6, lineHeight: 16 }}>
              Pague nas próximas 48 horas para evitar gerar nova referência.
            </Text>
            {alertas.expirando.slice(0, 3).map(r => {
              const taxa = taxas.find(t => t.id === r.taxaId);
              const venc = new Date(r.dataValidade).getTime();
              const horas = Math.max(0, Math.floor((venc - agora) / 3600000));
              const tempoStr = horas >= 24 ? `${Math.floor(horas / 24)}d ${horas % 24}h` : `${horas}h`;
              const urgente = horas <= 24;
              return (
                <View key={r.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.warning + '33',
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontSize: 12, fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
                      {taxa?.descricao || r.taxaId}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>
                      {formatAOA(r.valor)} · Expira em <Text style={{ color: urgente ? Colors.danger : Colors.warning, fontFamily: 'Inter_700Bold' }}>{tempoStr}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setMcxRupe(r)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 9, paddingVertical: 6,
                      backgroundColor: Colors.success, borderRadius: 7,
                    }}>
                    <Ionicons name="phone-portrait-outline" size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold' }}>Pagar</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {alertas.expirando.length > 3 && (
              <Text style={{ color: Colors.textMuted, fontSize: 10.5, marginTop: 6, textAlign: 'center' }}>
                e mais {alertas.expirando.length - 3}…
              </Text>
            )}
          </View>
        )}
        <Text style={{
          fontSize: 12, color: Colors.textSecondary, marginTop: -6, marginBottom: 14, lineHeight: 17,
        }}>
          Aqui ficam guardadas todas as suas referências para pagamento no banco, ATM ou Multicaixa Express.
          Toque em <Text style={{ color: Colors.accent, fontFamily: 'Inter_700Bold' }}>Copiar</Text> para usar a referência ou em <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>Comprovativo</Text> para abrir o talão em PDF.
        </Text>

        {/* Resumo — KPIs coloridos */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total',     v: total,     color: Colors.accent,  icon: 'receipt-outline' as const },
            { label: 'Activos',   v: ativos,    color: Colors.info,    icon: 'time-outline' as const },
            { label: 'Pagos',     v: pagos,     color: Colors.success, icon: 'checkmark-circle-outline' as const },
            { label: 'Expirados', v: expirados, color: Colors.danger,  icon: 'close-circle-outline' as const },
          ].map(s => (
            <View key={s.label} style={{
              flex: 1, minWidth: 90,
              backgroundColor: s.color + '14',
              borderWidth: 1, borderColor: s.color + '40',
              borderRadius: 12, padding: 12, alignItems: 'center',
            }}>
              <Ionicons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: s.color }}>{s.v}</Text>
              <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {total === 0 ? (
          <View style={{
            alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20,
            backgroundColor: Colors.accent + '0F',
            borderWidth: 1, borderColor: Colors.accent + '33',
            borderRadius: 14,
          }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: Colors.accent + '22',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <Ionicons name="receipt-outline" size={32} color={Colors.accent} />
            </View>
            <Text style={{ color: Colors.text, fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 4 }}>
              Ainda não gerou nenhuma referência bancária
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 17, marginBottom: 14 }}>
              Vá ao separador <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>Financeiro</Text> e escolha
              {' '}pagar por <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>Ref. Bancária</Text> para gerar a sua primeira referência.
            </Text>
            <TouchableOpacity
              onPress={() => setActiveTab('financeiro')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: Colors.accent,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
              }}>
              <Ionicons name="cash-outline" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>Ir para Financeiro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          lista.map(r => {
            const s = statusInfo(r);
            const taxa = taxas.find(t => t.id === r.taxaId);
            const isAtivo = s.efetivo === 'ativo';
            const isPago = s.efetivo === 'pago';
            return (
              <View key={r.id} style={{
                backgroundColor: Colors.cardAlt,
                borderWidth: 1, borderColor: s.color + '40',
                borderRadius: 14, padding: 14, marginBottom: 12,
                borderLeftWidth: 5, borderLeftColor: s.color,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    backgroundColor: s.color + '26',
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
                    borderWidth: 1, borderColor: s.color + '55',
                  }}>
                    <Ionicons name={s.icon as any} size={13} color={s.color} />
                    <Text style={{ color: s.color, fontSize: 11, fontFamily: 'Inter_700Bold' }}>{s.label}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  {isAtivo && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: Colors.gold + '22',
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                    }}>
                      <Ionicons name="hourglass-outline" size={11} color={Colors.gold} />
                      <Text style={{ color: Colors.gold, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
                        {tempoRestante(r)}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 2, fontFamily: 'Inter_500Medium' }} numberOfLines={1}>
                  {taxa?.descricao || r.taxaId}
                </Text>
                <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold, marginBottom: 10 }}>
                  {formatAOA(r.valor)}
                </Text>

                {/* Painel de referência — agora vibrante (azul cobalto + dourado) */}
                <View style={{
                  backgroundColor: Colors.accent + '1A',
                  borderRadius: 10, padding: 12, marginBottom: 10,
                  borderWidth: 1, borderColor: Colors.accent + '4D',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="barcode-outline" size={13} color={Colors.accentLight} />
                    <Text style={{ fontSize: 10, color: Colors.accentLight, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 }}>
                      REFERÊNCIA PARA PAGAMENTO
                    </Text>
                  </View>
                  <Text selectable style={{
                    fontSize: 22, fontFamily: 'Inter_700Bold',
                    color: '#FFFFFF', letterSpacing: 2.5,
                  }}>{r.referencia}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                    <View>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Gerado</Text>
                      <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' }}>{fmtData(r.dataGeracao)}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={s.efetivo === 'expirado' ? 'alert-circle-outline' : 'time-outline'}
                      size={13}
                      color={s.efetivo === 'expirado' ? Colors.danger : Colors.textMuted}
                    />
                    <View>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_500Medium' }}>Validade</Text>
                      <Text style={{ fontSize: 11, color: s.efetivo === 'expirado' ? Colors.danger : Colors.textSecondary, fontFamily: 'Inter_600SemiBold' }}>
                        {fmtData(r.dataValidade)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    onPress={() => copiarReferencia(r.referencia)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: Colors.accent + '1F',
                      borderWidth: 1, borderColor: Colors.accent + '66',
                    }}>
                    <Ionicons name="copy-outline" size={14} color={Colors.accentLight} />
                    <Text style={{ fontSize: 12, color: Colors.accentLight, fontFamily: 'Inter_700Bold' }}>Copiar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => abrirComprovativo(r)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 9,
                      borderRadius: 9,
                      backgroundColor: Colors.gold + '1F',
                      borderWidth: 1, borderColor: Colors.gold + '66',
                    }}>
                    <Ionicons name="document-text-outline" size={14} color={Colors.gold} />
                    <Text style={{ fontSize: 12, color: Colors.gold, fontFamily: 'Inter_700Bold' }}>
                      {isPago ? 'Recibo' : 'Comprovativo'}
                    </Text>
                  </TouchableOpacity>

                  {isAtivo && (
                    <TouchableOpacity
                      onPress={() => setMcxRupe(r)}
                      activeOpacity={0.85}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 9,
                        borderRadius: 9,
                        backgroundColor: Colors.success,
                      }}>
                      <Ionicons name="phone-portrait-outline" size={14} color="#fff" />
                      <Text style={{ fontSize: 12, color: '#fff', fontFamily: 'Inter_700Bold' }}>Pagar via MCX</Text>
                    </TouchableOpacity>
                  )}

                  {s.efetivo !== 'pago' && (
                    <TouchableOpacity
                      onPress={() => verificarEstado(r)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 10, paddingVertical: 7,
                        borderRadius: 8, backgroundColor: Colors.info,
                      }}>
                      <Ionicons name="cloud-download-outline" size={13} color="#fff" />
                      <Text style={{ fontSize: 11, color: '#fff', fontFamily: 'Inter_700Bold' }}>Verificar no banco</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  function renderHistorico() {
    type LogItem = {
      id: string;
      data: string;
      tipo: 'nota' | 'pagamento' | 'presenca' | 'documento' | 'matricula';
      titulo: string;
      subtitulo: string;
      cor: string;
      icone: string;
    };

    const logItems: LogItem[] = [];

    notasAluno.forEach(n => {
      if (n.nf > 0) {
        const status = getStatusDisciplina(n.nf, n.trimestre);
        logItems.push({
          id: `nota-${n.id}`,
          data: n.data || `${anoLetivo}-01-01`,
          tipo: 'nota',
          titulo: `Nota lançada — ${n.disciplina}`,
          subtitulo: `${n.trimestre}º Trimestre · NF: ${n.nf.toFixed(1)} · ${status.label}`,
          cor: status.color,
          icone: status.icon,
        });
      }
    });

    pagamentosAluno.forEach(p => {
      const taxa = taxas.find(t => t.id === p.taxaId);
      const statusColor = p.status === 'pago' ? Colors.success : p.status === 'pendente' ? Colors.warning : Colors.danger;
      logItems.push({
        id: `pag-${p.id}`,
        data: p.createdAt || p.data,
        tipo: 'pagamento',
        titulo: `Pagamento — ${taxa?.descricao || p.observacao || 'Rubrica'}`,
        subtitulo: `${formatAOA(p.valor)} · ${p.status === 'pago' ? 'Pago' : p.status === 'pendente' ? 'Pendente' : 'Cancelado'}${p.referencia ? ` · Ref: ${p.referencia}` : ''}`,
        cor: statusColor,
        icone: p.status === 'pago' ? 'checkmark-circle' : p.status === 'pendente' ? 'time' : 'close-circle',
      });
    });

    presAluno.forEach(p => {
      const statusColor = p.status === 'P' ? Colors.success : p.status === 'J' ? Colors.warning : Colors.danger;
      const statusLabel = p.status === 'P' ? 'Presente' : p.status === 'J' ? 'Falta Justificada' : 'Falta';
      const icon = p.status === 'P' ? 'checkmark-circle' : p.status === 'J' ? 'shield-checkmark' : 'close-circle';
      logItems.push({
        id: `pres-${p.id}`,
        data: p.data,
        tipo: 'presenca',
        titulo: `${statusLabel} — ${p.disciplina}`,
        subtitulo: `Data: ${new Date(p.data).toLocaleDateString('pt-PT')}`,
        cor: statusColor,
        icone: icon,
      });
    });

    solicitacoesAluno.forEach(s => {
      const statusColor = s.status === 'concluido' ? Colors.success : s.status === 'em_processamento' ? '#8B5CF6' : s.status === 'validado_financeiro' ? Colors.info : s.status === 'cancelado' ? Colors.danger : Colors.warning;
      const statusLabel = s.status === 'concluido' ? 'Concluído' : s.status === 'em_processamento' ? 'Em Processamento' : s.status === 'validado_financeiro' ? 'Validado — Em Emissão' : s.status === 'cancelado' ? 'Cancelado' : 'Ag. Validação Financ.';
      logItems.push({
        id: `sol-${s.id}`,
        data: s.createdAt,
        tipo: 'documento',
        titulo: `Documento solicitado — ${s.tipo}`,
        subtitulo: `Motivo: ${s.motivo} · ${statusLabel}`,
        cor: statusColor,
        icone: 'document-text',
      });
    });

    if (reconfirmacaoAtual) {
      logItems.push({
        id: `reconf-${reconfirmacaoAtual.id || 'rc'}`,
        data: reconfirmacaoAtual.data,
        tipo: 'matricula',
        titulo: 'Matrícula Reconfirmada',
        subtitulo: `Ano lectivo ${reconfirmacaoAtual.anoLetivo} — Confirmado em ${new Date(reconfirmacaoAtual.data).toLocaleDateString('pt-PT')}`,
        cor: Colors.success,
        icone: 'school',
      });
    }

    const sorted = logItems.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const TIPO_LABELS: Record<string, string> = {
      nota: 'Nota',
      pagamento: 'Financeiro',
      presenca: 'Presença',
      documento: 'Documento',
      matricula: 'Matrícula',
    };

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Resumo do Ano" icon="stats-chart" />
        <View style={styles.statsRow}>
          <StatCard value={aprovadas} label="Aprovadas" color={Colors.success} />
          <StatCard value={reprovadas} label="Reprovadas" color={Colors.danger} />
          <StatCard value={mediaGeral} label="Média" color={Colors.gold} />
          <StatCard value={`${pctPresenca}%`} label="Presenças" color={Colors.info} />
        </View>

        {aluno?.id && (
          <TouchableOpacity
            style={[styles.payBtn, { marginBottom: 12 }]}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.open(`/api/pdf/historico-academico/${aluno.id}?autoprint=false`, '_blank');
              }
            }}
          >
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={styles.payBtnText}>Imprimir Histórico Académico</Text>
          </TouchableOpacity>
        )}

        <SectionTitle title="Registo de Atividades" icon="time" />
        <Text style={styles.infoHint}>Histórico completo de tudo o que foi feito neste ano lectivo, ordenado por data.</Text>

        {sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>Sem atividades registadas</Text>
          </View>
        ) : (
          sorted.map(item => (
            <View key={item.id} style={[styles.logCard, { borderLeftColor: item.cor }]}>
              <View style={[styles.logIconBox, { backgroundColor: item.cor + '22' }]}>
                <Ionicons name={item.icone as any} size={18} color={item.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.logTop}>
                  <Text style={styles.logTitulo} numberOfLines={1}>{item.titulo}</Text>
                  <Badge label={TIPO_LABELS[item.tipo]} color={item.cor} />
                </View>
                <Text style={styles.logSub} numberOfLines={2}>{item.subtitulo}</Text>
                <Text style={styles.logData}>
                  {new Date(item.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  function DocSkeletonCard() {
    return (
      <View style={[styles.docHistCard, { opacity: 0.55 }]}>
        <View style={styles.docHistTop}>
          <View style={[styles.docHistIconWrap, { backgroundColor: Colors.surface }]} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 14, width: '55%', backgroundColor: Colors.border, borderRadius: 4 }} />
            <View style={{ height: 10, width: '40%', backgroundColor: Colors.border, borderRadius: 4 }} />
            <View style={{ height: 10, width: '70%', backgroundColor: Colors.border, borderRadius: 4 }} />
          </View>
        </View>
      </View>
    );
  }

  function SolicitacaoSkeletonCard() {
    return (
      <View style={[styles.solCard, { opacity: 0.55 }]}>
        <View style={styles.solTop}>
          <View style={{ height: 14, width: '60%', backgroundColor: Colors.border, borderRadius: 4 }} />
          <View style={{ height: 18, width: 90, backgroundColor: Colors.border, borderRadius: 6 }} />
        </View>
        <View style={{ height: 32, backgroundColor: Colors.border, borderRadius: 8, marginVertical: 6 }} />
        <View style={{ height: 10, width: '80%', backgroundColor: Colors.border, borderRadius: 4, marginTop: 4 }} />
      </View>
    );
  }

  function renderDocumentos() {
    const tiposJaEmitidos = [...new Set(documentosEmitidos.map(d => d.tipo))];
    const isSyncing = loadingDocs || loadingSolicitacoes || loadingTemplates;
    return (
      <ScrollView ref={docsScrollRef} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <BoletinsAlunoSection />
        <SectionTitle title="Pedir Declaração / Documento" icon="document-text" />
        {isSyncing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '12', borderRadius: 8, padding: 8, marginBottom: 8 }}>
            <AppLoader size="small" color={Colors.info} />
            <Text style={{ fontSize: 12, color: Colors.info, fontFamily: 'Inter_500Medium', flex: 1 }}>
              A sincronizar documentos com a secretaria...
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.payBtn, loadingTemplates && { opacity: 0.6 }]}
          onPress={() => setShowSolicitacaoModal(true)}
          disabled={loadingTemplates}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.payBtnText}>{loadingTemplates ? 'A carregar modelos...' : 'Nova Solicitação'}</Text>
        </TouchableOpacity>

        {tiposJaEmitidos.length > 0 && (
          <View style={styles.docBadgesSection}>
            <Text style={styles.docBadgesTitle}>Tipos de documentos já emitidos:</Text>
            <View style={styles.docBadgesRow}>
              {tiposJaEmitidos.map(tipo => (
                <View key={tipo} style={styles.docTypeBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                  <Text style={styles.docTypeBadgeText} numberOfLines={1}>{tipo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 20 }}>
          <SectionTitle title="Histórico de Documentos Emitidos" icon="time" />
          {loadingDocs ? (
            <View style={{ gap: 8 }}>
              <DocSkeletonCard />
              <DocSkeletonCard />
            </View>
          ) : documentosEmitidos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyStateText}>Nenhum documento emitido ainda</Text>
            </View>
          ) : (
            documentosEmitidos.map(doc => (
              <View key={doc.id} style={styles.docHistCard}>
                <View style={styles.docHistTop}>
                  <View style={styles.docHistIconWrap}>
                    <Ionicons name="document-text" size={20} color={Colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docHistTipo}>{doc.tipo}</Text>
                    {doc.anoAcademico ? (
                      <Text style={styles.docHistMeta}>Ano lectivo: {doc.anoAcademico}</Text>
                    ) : null}
                    {doc.alunoTurma ? (
                      <Text style={styles.docHistMeta}>Turma: {doc.alunoTurma}</Text>
                    ) : null}
                    <Text style={styles.docHistData}>
                      Emitido em {new Date(doc.emitidoEm).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.docReemitirBtn}
                  onPress={() => {
                    setSolForm({ tipo: doc.tipo, motivo: 'Renovação com dados actualizados', observacao: '' });
                    setShowSolicitacaoModal(true);
                  }}
                >
                  <Ionicons name="refresh" size={14} color={Colors.gold} />
                  <Text style={styles.docReemitirText}>Solicitar Novamente</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={{ marginTop: 20 }}>
          <SectionTitle title="Minhas Solicitações" icon="list" />
          {loadingSolicitacoes && solicitacoesAluno.length === 0 ? (
            <View style={{ gap: 8 }}>
              <SolicitacaoSkeletonCard />
              <SolicitacaoSkeletonCard />
            </View>
          ) : solicitacoesAluno.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyStateText}>Sem solicitações de documentos</Text>
            </View>
          ) : (
            solicitacoesAluno.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(sol => {
              const statusInfo: Record<string, { label: string; color: string; icon: string; msg: string }> = {
                pendente:            { label: 'Aguarda Pagamento', color: Colors.warning, icon: 'time-outline', msg: 'Efectue o pagamento para avançar com a solicitação.' },
                em_processamento:    { label: 'Pag. em Verificação', color: '#8B5CF6', icon: 'hourglass-outline', msg: 'O seu pagamento está a ser verificado pelo departamento Financeiro.' },
                validado_financeiro: { label: 'Aprovado pelo Financeiro', color: Colors.info, icon: 'checkmark-done-circle-outline', msg: 'Pagamento confirmado. A Secretaria Académica está a preparar o documento.' },
                concluido:           { label: 'Disponível para Levantamento', color: Colors.success, icon: 'bag-check-outline', msg: 'O seu documento está pronto. Dirija-se à Secretaria Académica para o levantar.' },
                cancelado:           { label: 'Cancelado', color: Colors.danger, icon: 'close-circle-outline', msg: 'A solicitação foi cancelada. Contacte a secretaria para mais informações.' },
              };
              const info = statusInfo[sol.status] || statusInfo['pendente'];
              return (
              <View key={sol.id} style={[styles.solCard, sol.status === 'concluido' && { borderColor: Colors.success + '55', borderWidth: 1.5 }, sol.status === 'validado_financeiro' && { borderColor: Colors.info + '55', borderWidth: 1.5 }]}>
                <View style={styles.solTop}>
                  <Text style={styles.solTipo}>{sol.tipo}</Text>
                  <Badge label={info.label} color={info.color} />
                </View>

                {/* Status informativo */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: info.color + '12', borderRadius: 8, padding: 8, marginBottom: 2 }}>
                  <Ionicons name={info.icon as any} size={14} color={info.color} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 11, color: info.color, fontFamily: 'Inter_500Medium', flex: 1, lineHeight: 16 }}>{info.msg}</Text>
                </View>

                <Text style={styles.solMotivo}>Motivo: {sol.motivo}</Text>
                {sol.observacao ? <Text style={styles.solObs}>{sol.observacao}</Text> : null}
                {sol.referenciaPagamento ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Ionicons name="card-outline" size={13} color={Colors.info} />
                    <Text style={{ fontSize: 11, color: Colors.info, fontFamily: 'Inter_500Medium' }}>Ref. pagamento: {sol.referenciaPagamento}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={styles.solData}>{new Date(sol.createdAt).toLocaleDateString('pt-PT')}</Text>
                  {sol.status === 'pendente' && (
                    <TouchableOpacity
                      style={styles.solPagarBtn}
                      onPress={() => {
                        const rubricaId = getRubricaParaTipo(sol.tipo);
                        setSolicitacaoParaPagar(sol);
                        setPagForm(f => ({ ...f, rubricaId }));
                        setShowPagamentoModal(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="card-outline" size={14} color="#fff" />
                      <Text style={styles.solPagarBtnText}>Pagar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              );
            })
          )}
        </View>

        <Modal visible={showPagamentoModal} transparent animationType="slide" onRequestClose={() => { setShowPagamentoModal(false); setSolicitacaoParaPagar(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Pagar Documento</Text>
                <TouchableOpacity onPress={() => { setShowPagamentoModal(false); setSolicitacaoParaPagar(null); }}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              {solicitacaoParaPagar && (() => {
                const rubrica = RUBRICAS.find(r => r.id === pagForm.rubricaId) || RUBRICAS.find(r => r.id === 'outros')!;
                return (
                  <>
                    <View style={{ backgroundColor: Colors.primary + '18', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.gold }}>
                      <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 2 }}>Documento</Text>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>{solicitacaoParaPagar.tipo}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Valor a pagar</Text>
                      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold }}>{formatAOA(rubrica.valor)}</Text>
                    </View>
                    <Text style={styles.formLabel}>Método de Pagamento</Text>
                    <View style={{ gap: 8, marginBottom: 20 }}>
                      {[
                        { id: 'rupe', label: 'Ref. Bancária', icon: 'business-outline', desc: 'Referência bancária Multicaixa para pagamento no banco ou ATM' },
                        { id: 'multicaixa', label: 'Multicaixa Express', icon: 'phone-portrait-outline', desc: 'Pagamento por Multicaixa Express' },
                      ].map(m => (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.rubricaItem, pagForm.metodo === m.id && styles.rubricaItemActive, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
                          onPress={() => setPagForm(f => ({ ...f, metodo: m.id as any }))}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={m.icon as any} size={20} color={pagForm.metodo === m.id ? Colors.gold : Colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.rubricaText, pagForm.metodo === m.id && { color: Colors.gold }]}>{m.label}</Text>
                            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{m.desc}</Text>
                          </View>
                          {pagForm.metodo === m.id && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.submitBtn} onPress={handlePagarDocumento} activeOpacity={0.85}>
                      <Ionicons name="card-outline" size={16} color="#fff" />
                      <Text style={styles.submitBtnText}>Gerar Referência de Pagamento</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        <Modal visible={showSolicitacaoModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nova Solicitação</Text>
                <TouchableOpacity onPress={() => setShowSolicitacaoModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.formLabel}>Tipo de Documento</Text>
              <ScrollView style={{ maxHeight: 240, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 2 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                  <Text style={{ fontSize: 9, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {customDocTemplates.length > 0 ? 'Modelos ativos do Editor de Documentos' : 'Documentos disponíveis'}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                </View>
                {docTiposDisponiveis.map(tipo => {
                  const precisaNotas = TIPOS_REQUER_NOTAS.includes(tipo);
                  const bloqueado = precisaNotas && notasAluno.length === 0;
                  const isModeloEditor = customDocTemplates.some(t => t.nome === tipo);
                  return (
                    <TouchableOpacity
                      key={tipo}
                      style={[
                        styles.rubricaItem,
                        solForm.tipo === tipo && styles.rubricaItemActive,
                        bloqueado && { opacity: 0.55 },
                      ]}
                      onPress={() => !bloqueado && setSolForm(f => ({ ...f, tipo }))}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text-outline" size={13} color={solForm.tipo === tipo ? Colors.gold : Colors.textSecondary} />
                        <Text style={[styles.rubricaText, solForm.tipo === tipo && { color: Colors.gold }]}>{tipo}</Text>
                        {isModeloEditor && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warning + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_600SemiBold' }}>Modelo</Text>
                          </View>
                        )}
                        {bloqueado && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.danger + '25', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Ionicons name="lock-closed" size={10} color={Colors.danger} />
                            <Text style={{ fontSize: 9, color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>Sem notas</Text>
                          </View>
                        )}
                        {precisaNotas && !bloqueado && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
                            <Text style={{ fontSize: 9, color: Colors.success, fontFamily: 'Inter_600SemiBold' }}>Disponível</Text>
                          </View>
                        )}
                      </View>
                      {solForm.tipo === tipo && <Ionicons name="checkmark" size={16} color={Colors.gold} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {notasAluno.length === 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warning + '20', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.warning + '50', marginBottom: 12 }}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.warning} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', lineHeight: 16 }}>
                    Ainda não tem notas registadas. Documentos que requerem notas (assinalados com cadeado) só podem ser solicitados após o lançamento das classificações.
                  </Text>
                </View>
              )}
              <Text style={styles.formLabel}>Motivo<RequiredMark /></Text>
              <TextInput
                style={styles.textInput}
                placeholder="Indique o motivo da solicitação..."
                placeholderTextColor={Colors.textMuted}
                value={solForm.motivo}
                onChangeText={v => setSolForm(f => ({ ...f, motivo: v }))}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.formLabel}>Observação (opcional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Informação adicional..."
                placeholderTextColor={Colors.textMuted}
                value={solForm.observacao}
                onChangeText={v => setSolForm(f => ({ ...f, observacao: v }))}
              />
              <TouchableOpacity style={styles.submitBtn} onPress={handleSolicitarDocumento}>
                <Text style={styles.submitBtnText}>Enviar Solicitação</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      </ScrollView>
    );
  }

  function renderFaltas() {
    const apenasAusencias = presAluno
      .filter(p => p.status === 'F' || p.status === 'J')
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const todasDisciplinasComDados = Array.from(new Set([
      ...apenasAusencias.map(p => p.disciplina),
      ...registosFalta.map(r => r.disciplina),
    ])).filter(Boolean).sort();

    const disciplinasFiltro = ['todas', ...todasDisciplinasComDados];

    const listaFiltrada = faltaFiltroDisc === 'todas'
      ? apenasAusencias
      : apenasAusencias.filter(p => p.disciplina === faltaFiltroDisc);

    const totalFaltas = apenasAusencias.filter(p => p.status === 'F').length;
    const totalJustificadas = apenasAusencias.filter(p => p.status === 'J').length;
    const totalAulas = presAluno.length;

    const STATUS_COLOR: Record<string, string> = {
      normal: Colors.success,
      em_risco: Colors.warning,
      excluido: Colors.danger,
    };
    const STATUS_LABEL: Record<string, string> = {
      normal: 'Normal',
      em_risco: 'Em Risco',
      excluido: 'Excluído',
    };
    const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    const registosPorDisc = registosFalta.reduce<Record<string, any[]>>((acc, r) => {
      if (!acc[r.disciplina]) acc[r.disciplina] = [];
      acc[r.disciplina].push(r);
      return acc;
    }, {});

    const exclusoesActivas = exclusoesFalta.filter(e => e.status === 'ativa');

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* ── Estatísticas Gerais ── */}
        <SectionTitle title="Resumo de Presenças" icon="stats-chart" />
        <View style={styles.statsRow}>
          <StatCard value={`${pctPresenca}%`} label="Presenças" color={pctPresenca >= 75 ? Colors.success : Colors.danger} />
          <StatCard value={totalFaltas} label="Faltas" color={Colors.danger} />
          <StatCard value={totalJustificadas} label="Justificadas" color={Colors.warning} />
          <StatCard value={totalAulas} label="Total Aulas" color={Colors.info} />
        </View>

        {pctPresenca < 75 && (
          <View style={[styles.alertCard, { borderColor: Colors.danger + '55' }]}>
            <Ionicons name="warning" size={18} color={Colors.danger} />
            <Text style={[styles.alertText, { color: Colors.danger }]}>
              Atenção: frequência abaixo de 75%. Risco de exclusão por faltas.
            </Text>
          </View>
        )}

        {/* ── Justificação Paga de Faltas ── */}
        {faltasJustifConfig.ativo && (() => {
          const faltasPendentes = apenasAusencias.filter(p => p.status === 'F');
          const podeJustificar = faltasPendentes.length >= faltasJustifConfig.faltasMinimas;
          const valorPotencial = faltasPendentes.length * faltasJustifConfig.valorPorFalta;
          return (
            <>
              <SectionTitle title="Justificação Paga de Faltas" icon="document-text" />
              <View style={[styles.alertCard, { borderColor: Colors.info + '55', flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle" size={18} color={Colors.info} />
                  <Text style={[styles.alertText, { color: Colors.info, flex: 1 }]}>
                    {podeJustificar
                      ? `Pode pedir justificação paga (${faltasJustifConfig.valorPorFalta.toLocaleString('pt-AO')} Kz por falta). Tem ${faltasPendentes.length} falta(s) pendente(s) — total potencial: ${valorPotencial.toLocaleString('pt-AO')} Kz.`
                      : `É possível pedir justificação paga a partir de ${faltasJustifConfig.faltasMinimas} faltas. Tem actualmente ${faltasPendentes.length}.`}
                  </Text>
                </View>
                {podeJustificar && (
                  <TouchableOpacity
                    onPress={() => { setJfSelectedIds(faltasPendentes.map(p => p.id)); setJfMotivo(''); setJfComprovativo(null); setShowJustFaltasModal(true); }}
                    style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                  >
                    <Ionicons name="add-circle" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Pedir Justificação Paga</Text>
                  </TouchableOpacity>
                )}
              </View>

              {justificacoesFalta.length > 0 && (
                <View style={{ gap: 8, marginBottom: 8 }}>
                  {justificacoesFalta.map((j: any) => {
                    const statusLabel: Record<string, string> = {
                      pendente: 'Aguarda Secretaria',
                      aprovada: 'Aprovada — Gerar Ref. Bancária',
                      aguarda_pagamento: 'Referência gerada — pagar',
                      paga: 'Pagamento confirmado',
                      concluida: 'Concluída — faltas removidas',
                      rejeitada: 'Rejeitada',
                    };
                    const statusCor: Record<string, string> = {
                      pendente: Colors.warning,
                      aprovada: Colors.info,
                      aguarda_pagamento: Colors.gold,
                      paga: Colors.success,
                      concluida: Colors.success,
                      rejeitada: Colors.danger,
                    };
                    const cor = statusCor[String(j.status)] || Colors.textMuted;
                    const rupe = j.rupeId ? rupesAluno.find(r => r.id === j.rupeId) : null;
                    return (
                      <View key={j.id} style={[styles.faltaRow, { borderLeftColor: cor, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.faltaIconBox, { backgroundColor: cor + '18' }]}>
                            <Ionicons name="document-text" size={18} color={cor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.faltaDisc}>{j.qtdFaltas} falta(s) · {Number(j.valorTotal || 0).toLocaleString('pt-AO')} Kz</Text>
                            <Text style={styles.faltaData}>{new Date(j.createdAt).toLocaleDateString('pt-PT')}</Text>
                            {j.justificativa ? <Text style={styles.faltaObs} numberOfLines={2}>{j.justificativa}</Text> : null}
                            {j.motivoRejeicao ? <Text style={[styles.faltaObs, { color: Colors.danger }]}>Motivo da rejeição: {j.motivoRejeicao}</Text> : null}
                          </View>
                          <View style={[styles.badge, { backgroundColor: cor + '18', borderColor: cor + '55' }]}>
                            <Text style={[styles.badgeText, { color: cor }]}>{statusLabel[String(j.status)] || j.status}</Text>
                          </View>
                        </View>
                        {j.status === 'aprovada' && (
                          <TouchableOpacity
                            onPress={() => handleGerarRupeJustificacao(j.id)}
                            style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                          >
                            <Ionicons name="receipt" size={14} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Gerar Ref. Bancária para pagamento</Text>
                          </TouchableOpacity>
                        )}
                        {j.status === 'aguarda_pagamento' && rupe && (
                          <View style={{ backgroundColor: Colors.gold + '12', borderRadius: 8, padding: 10, gap: 4 }}>
                            <Text style={{ fontSize: 11, color: Colors.textMuted }}>Ref. Bancária Multicaixa</Text>
                            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: 1 }}>{rupe.referencia}</Text>
                            <Text style={{ fontSize: 11, color: Colors.textMuted }}>Validade: {new Date(rupe.dataValidade).toLocaleDateString('pt-PT')}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          );
        })()}

        {/* ── Exclusões activas ── */}
        {exclusoesActivas.length > 0 && (
          <>
            <SectionTitle title="Exclusões Activas" icon="alert-circle" />
            <View style={{ gap: 8, marginBottom: 4 }}>
              {exclusoesActivas.map(e => (
                <View key={e.id} style={[styles.faltaRow, { borderLeftColor: Colors.danger, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.faltaIconBox, { backgroundColor: Colors.danger + '18' }]}>
                      <Ionicons name="ban" size={20} color={Colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.faltaDisc}>{e.disciplina}</Text>
                      <Text style={styles.faltaData}>
                        {e.totalFaltasAcumuladas} falta(s) acumuladas · limite: {e.limiteFaltas}
                      </Text>
                      {e.motivo ? <Text style={styles.faltaObs} numberOfLines={2}>{e.motivo}</Text> : null}
                    </View>
                    <View style={[styles.badge, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '55' }]}>
                      <Text style={[styles.badgeText, { color: Colors.danger }]}>Excluído</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setShowJustModal({ disciplina: e.disciplina }); setJustMotivo(''); }}
                    style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="document-text-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Solicitar Justificação</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Resumo mensal por disciplina ── */}
        {registosFalta.length > 0 && (
          <>
            <SectionTitle title="Faltas por Disciplina (Mensal)" icon="grid" />
            <View style={{ gap: 10, marginBottom: 4 }}>
              {Object.entries(registosPorDisc).map(([disc, registos]) => {
                const piorStatus = registos.reduce((worst, r) => {
                  const order = ['normal', 'em_risco', 'excluido'];
                  return order.indexOf(r.status) > order.indexOf(worst) ? r.status : worst;
                }, 'normal');
                const totalDisc = registos.reduce((s, r) => s + (r.totalFaltas || 0), 0);
                const justDisc = registos.reduce((s, r) => s + (r.faltasJustificadas || 0), 0);
                const cor = STATUS_COLOR[piorStatus] || Colors.textSecondary;
                return (
                  <View key={disc} style={[styles.faltaRow, { borderLeftColor: cor, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.faltaIconBox, { backgroundColor: cor + '18' }]}>
                        <MaterialCommunityIcons name="book-open-variant" size={18} color={cor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.faltaDisc}>{disc}</Text>
                        <Text style={styles.faltaData}>
                          {totalDisc} falta(s) total · {justDisc} justificada(s)
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: cor + '18', borderColor: cor + '55' }]}>
                        <Text style={[styles.badgeText, { color: cor }]}>{STATUS_LABEL[piorStatus] || piorStatus}</Text>
                      </View>
                    </View>
                    {/* Detalhe mês a mês */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {registos.map(r => {
                          const c = STATUS_COLOR[r.status] || Colors.textSecondary;
                          return (
                            <View key={r.id} style={{ alignItems: 'center', backgroundColor: c + '14', borderRadius: 8, padding: 8, minWidth: 56, borderWidth: 1, borderColor: c + '40' }}>
                              <Text style={{ fontSize: 10, color: Colors.textMuted, marginBottom: 2 }}>{MESES_PT[(r.mes || 1) - 1]}</Text>
                              <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: c }}>{r.totalFaltas}</Text>
                              <Text style={{ fontSize: 9, color: Colors.textMuted }}>faltas</Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                    {(piorStatus === 'em_risco' || piorStatus === 'excluido') && (
                      <TouchableOpacity
                        onPress={() => { setShowJustModal({ disciplina: disc }); setJustMotivo(''); }}
                        style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      >
                        <Ionicons name="document-text-outline" size={13} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Justificar Faltas</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Registo diário de faltas ── */}
        <SectionTitle title="Filtrar por Disciplina" icon="filter" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
            {disciplinasFiltro.map(disc => (
              <TouchableOpacity
                key={disc}
                onPress={() => setFaltaFiltroDisc(disc)}
                style={[styles.filterChip, faltaFiltroDisc === disc && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, faltaFiltroDisc === disc && styles.filterChipTextActive]}>
                  {disc === 'todas' ? 'Todas' : disc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <SectionTitle title={`Registo de Faltas${faltaFiltroDisc !== 'todas' ? ` — ${faltaFiltroDisc}` : ''}`} icon="calendar" />

        {listaFiltrada.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
            <Text style={styles.emptyStateTitle}>Sem faltas registadas</Text>
            <Text style={styles.emptyStateSubtitle}>
              {faltaFiltroDisc === 'todas'
                ? 'Não existem faltas ou ausências registadas.'
                : `Sem faltas registadas em ${faltaFiltroDisc}.`}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {listaFiltrada.map(p => {
              const isJustificada = p.status === 'J';
              const cor = isJustificada ? Colors.warning : Colors.danger;
              const label = isJustificada ? 'Justificada' : 'Falta';
              const icone = isJustificada ? 'shield-checkmark' : 'close-circle';
              const dataFormatada = (() => {
                try {
                  return new Date(p.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
                } catch { return p.data; }
              })();
              return (
                <View key={p.id} style={[styles.faltaRow, { borderLeftColor: cor }]}>
                  <View style={[styles.faltaIconBox, { backgroundColor: cor + '18' }]}>
                    <Ionicons name={icone as any} size={20} color={cor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faltaDisc} numberOfLines={1}>{p.disciplina}</Text>
                    <Text style={styles.faltaData}>{dataFormatada}</Text>
                    {p.observacao ? (
                      <Text style={styles.faltaObs} numberOfLines={2}>{p.observacao}</Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.badge, { backgroundColor: cor + '18', borderColor: cor + '55' }]}>
                      <Text style={[styles.badgeText, { color: cor }]}>{label}</Text>
                    </View>
                    {!isJustificada && (
                      <TouchableOpacity
                        onPress={() => { setShowJustModal({ disciplina: p.disciplina }); setJustMotivo(''); }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: Colors.primary + '80' }}
                      >
                        <Text style={{ color: Colors.primary, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>Justificar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Calendário de Provas (aluno) ──────────────────────────────────────────
  function renderProvas() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Only show published provas for student's turma
    const provasDaTurma = turmaAluno
      ? calendarioProvas.filter(p =>
          p.publicado &&
          (p.turmasIds.length === 0 || p.turmasIds.includes(turmaAluno.id))
        )
      : [];

    const upcoming = provasDaTurma
      .filter(p => new Date(p.data + 'T12:00:00') >= hoje)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    const past = provasDaTurma
      .filter(p => new Date(p.data + 'T12:00:00') < hoje)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

    const ProvaCard = ({ p }: { p: any }) => {
      const cfg = TIPO_PROVA_EST[p.tipo] || TIPO_PROVA_EST.teste;
      const dataObj = new Date(p.data + 'T12:00:00');
      const isPast = dataObj < hoje;
      const diffMs = dataObj.getTime() - hoje.getTime();
      const diffDays = Math.ceil(diffMs / 86400000);
      const diasLabel = isPast
        ? `Realizada`
        : diffDays === 0 ? '🔴 Hoje' : diffDays === 1 ? '⚠️ Amanhã' : `Em ${diffDays} dias`;
      const diasColor = isPast ? '#888' : diffDays <= 1 ? '#D94F4F' : diffDays <= 7 ? '#D4920E' : '#22C47A';

      return (
        <View style={{
          backgroundColor: '#122540',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isPast ? 'rgba(255,255,255,0.08)' : cfg.color + '35',
          borderLeftWidth: 4,
          borderLeftColor: cfg.color,
          padding: 14,
          marginBottom: 10,
          opacity: isPast ? 0.7 : 1,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            {/* Icon */}
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: cfg.color + '1A', borderWidth: 1, borderColor: cfg.color + '40', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: cfg.color + '18', borderWidth: 1, borderColor: cfg.color + '35' }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: cfg.color }}>{cfg.label}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#E8EEF6', marginBottom: 2 }} numberOfLines={2}>
                {p.titulo}
              </Text>
              {!!p.disciplina && (
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#9BAEC8', marginBottom: 2 }}>
                  {p.disciplina}
                </Text>
              )}
              {!!p.descricao && (
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#7A8FA6', marginTop: 4, lineHeight: 16 }} numberOfLines={3}>
                  {p.descricao}
                </Text>
              )}
            </View>
          </View>

          {/* Date / time / countdown */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={13} color="#9BAEC8" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#E8EEF6' }}>
                {dataObj.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            {!!p.hora && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={13} color="#9BAEC8" />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#E8EEF6' }}>{p.hora}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: diasColor + '18' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: diasColor }}>{diasLabel}</Text>
            </View>
          </View>
        </View>
      );
    };

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 24 }} showsVerticalScrollIndicator={false}>
        {/* Banner de resumo */}
        <View style={{ backgroundColor: '#0F1E32', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#D4920E22', borderWidth: 1, borderColor: '#D4920E40', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="calendar-check" size={18} color="#D4920E" />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#E8EEF6' }}>Calendário de Provas</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#9BAEC8' }}>
                {turmaAluno?.nome} · {provasDaTurma.length} evento{provasDaTurma.length !== 1 ? 's' : ''} agendado{provasDaTurma.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Object.entries(TIPO_PROVA_EST).map(([key, cfg]) => {
              const count = provasDaTurma.filter(p => p.tipo === key).length;
              if (count === 0) return null;
              return (
                <View key={key} style={{ flex: 1, backgroundColor: cfg.color + '12', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: cfg.color + '30' }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: cfg.color }}>{count}</Text>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter_400Regular', color: '#9BAEC8', textAlign: 'center' }}>{cfg.label}{count !== 1 ? 's' : ''}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Próximas */}
        {upcoming.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MaterialCommunityIcons name="calendar-clock" size={15} color="#D4920E" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#D4920E', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Próximas Provas · {upcoming.length}
              </Text>
            </View>
            {upcoming.map(p => <ProvaCard key={p.id} p={p} />)}
          </>
        )}

        {/* Realizadas */}
        {past.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: upcoming.length > 0 ? 16 : 0 }}>
              <MaterialCommunityIcons name="history" size={15} color="#888" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Provas Realizadas · {past.length}
              </Text>
            </View>
            {past.slice(0, 5).map(p => <ProvaCard key={p.id} p={p} />)}
          </>
        )}

        {provasDaTurma.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 50, gap: 12 }}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={52} color="#334155" />
            <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#9BAEC8', textAlign: 'center' }}>
              Nenhuma prova agendada
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#7A8FA6', textAlign: 'center', lineHeight: 20 }}>
              Quando a direcção agendar provas para a tua turma{'\n'}irão aparecer aqui.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderTabContent() {
    switch (activeTab) {
      case 'painel': return renderPainel();
      case 'cartao': return renderCartao();
      case 'provas': return renderProvas();
      case 'faltas': return renderFaltas();
      case 'diario': return renderDiario();
      case 'mensagens': return renderMensagens();
      case 'materiais': return renderMateriais();
      case 'horario': return renderHorario();
      case 'financeiro': return renderFinanceiro();
      case 'rupes': return renderRupes();
      case 'documentos': return renderDocumentos();
      default: return null;
    }
  }

  const foto = (user as any)?.avatar || aluno?.foto;
  const initials = user?.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'AL';

  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  useEnterToSave(handleSubmitJustificacao, !!showJustModal);

  return (
    <View style={styles.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={ALUNO_TOUR_STEPS} storageKey={ALUNO_TOUR_KEY} />
      <TopBar title="Portal do Estudante" subtitle={turmaAluno?.nome || 'Área do Aluno'} />

      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickPhoto} activeOpacity={0.8}>
          {foto ? (
            <Image source={{ uri: foto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.cameraBtn}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.nome}</Text>
          <Text style={styles.profileMat}>{aluno?.numeroMatricula || 'Aluno'}</Text>
          {turmaAluno && (
            <View style={styles.profileBadgeRow}>
              <Badge label={turmaAluno.nome} color={Colors.info} />
              <Badge label={turmaAluno.nivel} color={Colors.gold} />
              <Badge label={turmaAluno.turno} color={Colors.success} />
            </View>
          )}
        </View>
        <TouchableOpacity onPress={openTour} style={styles.cameraBtn} activeOpacity={0.75}>
          <Ionicons name="compass-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Section Navigator — barra compacta só nas secções (não no Painel) */}
      {activeTab !== 'painel' && (
        <View style={styles.sectionBarCompact}>
          <TouchableOpacity
            style={styles.sectionBarBack}
            onPress={() => setActiveTab('painel')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.gold} />
            <Text style={styles.sectionBarBackText}>Painel</Text>
          </TouchableOpacity>
          <View style={styles.sectionBarCurrent}>
            {(() => {
              const t = TABS.find(t => t.key === activeTab)!;
              return (
                <>
                  <Ionicons name={t.icon as any} size={15} color={Colors.gold} />
                  <Text style={styles.sectionBarCurrentText}>{t.label}</Text>
                </>
              );
            })()}
          </View>
          <View style={styles.sectionBarDots}>
            {TABS.filter(t => t.key !== 'painel').map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.sectionBarDot, activeTab === t.key && styles.sectionBarDotActive]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Content */}
      <View style={[styles.content, { paddingBottom: bottomInset }]}>
        {renderTabContent()}
      </View>

      {aluno && (
        <ContinuidadeStatusModal
          visible={showContinuidade}
          onClose={() => setShowContinuidade(false)}
          alunoId={aluno.id}
          alunoNome={`${aluno.nome} ${aluno.apelido}`}
        />
      )}

      <Modal visible={showPhotoChangedModal} transparent animationType="fade" onRequestClose={() => setShowPhotoChangedModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: 'center', paddingVertical: 32 }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>Foto Actualizada</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 8 }}>
              A tua foto de perfil foi alterada com sucesso. Já aparece no canto superior direito e no teu cartão de estudante.
            </Text>
            {foto ? (
              <Image source={{ uri: foto }} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: Colors.gold, marginBottom: 24 }} />
            ) : null}
            <TouchableOpacity
              style={{ backgroundColor: Colors.success, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12 }}
              onPress={() => setShowPhotoChangedModal(false)}
            >
              <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Justificação de Faltas ── */}
      <Modal visible={!!showJustModal} transparent animationType="slide" onRequestClose={() => setShowJustModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Justificar Faltas</Text>
              <TouchableOpacity onPress={() => setShowJustModal(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {showJustModal && (
              <View style={{ backgroundColor: Colors.primary + '18', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.gold }}>
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 2 }}>Disciplina</Text>
                <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>{showJustModal.disciplina}</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 6 }}>
              Motivo / Justificação *
            </Text>
            <TextInput
              style={[styles.readonlyField, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
              value={justMotivo}
              onChangeText={setJustMotivo}
              placeholder="Descreva o motivo das suas faltas (doença, motivo familiar, etc.)..."
              placeholderTextColor={Colors.textMuted}
              multiline
              editable={!justSaving}
            />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 16, marginTop: 4 }}>
              A sua justificação será analisada pela secretaria e poderá aprovar ou rejeitar o pedido.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowJustModal(null)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitJustificacao}
                disabled={justSaving}
                style={{ flex: 2, borderRadius: 10, backgroundColor: Colors.primary, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                {justSaving
                  ? <AppLoader color="#fff" size="small" />
                  : <>
                      <Ionicons name="paper-plane" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 14 }}>Submeter Pedido</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Justificação Paga de Faltas ── */}
      <Modal visible={showJustFaltasModal} transparent animationType="slide" onRequestClose={() => setShowJustFaltasModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Justificar Faltas (Pago)</Text>
              <TouchableOpacity onPress={() => setShowJustFaltasModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ backgroundColor: Colors.info + '14', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: Colors.info }}>
                <Text style={{ fontSize: 12, color: Colors.text }}>
                  Custo: <Text style={{ fontFamily: 'Inter_700Bold' }}>{faltasJustifConfig.valorPorFalta.toLocaleString('pt-AO')} Kz</Text> por falta · Selecionadas: <Text style={{ fontFamily: 'Inter_700Bold' }}>{jfSelectedIds.length}</Text> · Total: <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.gold }}>{(jfSelectedIds.length * faltasJustifConfig.valorPorFalta).toLocaleString('pt-AO')} Kz</Text>
                </Text>
              </View>

              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 6 }}>Faltas a justificar</Text>
              <View style={{ gap: 6, marginBottom: 12, maxHeight: 220 }}>
                <ScrollView nestedScrollEnabled>
                  {presAluno.filter(p => p.status === 'F').sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).map(p => {
                    const sel = jfSelectedIds.includes(p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setJfSelectedIds(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: sel ? Colors.primary + '14' : Colors.cardLight || '#f5f5f5', borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: sel ? Colors.primary + '55' : 'transparent' }}
                      >
                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={20} color={sel ? Colors.primary : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{p.disciplina}</Text>
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{new Date(p.data).toLocaleDateString('pt-PT')}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 6 }}>Justificação *</Text>
              <TextInput
                style={[styles.readonlyField, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
                value={jfMotivo}
                onChangeText={setJfMotivo}
                placeholder="Descreva o motivo das faltas (doença, motivo familiar, etc.)..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 12, marginBottom: 6 }}>Comprovativo (opcional)</Text>
              <TouchableOpacity
                onPress={handlePickComprovativoFalta}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' }}
              >
                <Ionicons name="attach" size={18} color={Colors.primary} />
                <Text style={{ fontSize: 12, color: Colors.text, flex: 1 }} numberOfLines={1}>
                  {jfComprovativo ? jfComprovativo.nome : 'Anexar foto/PDF do atestado ou justificativo'}
                </Text>
                {jfComprovativo && (
                  <TouchableOpacity onPress={() => setJfComprovativo(null)}>
                    <Ionicons name="close-circle" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmitJustificacaoFalta}
                disabled={jfSaving}
                style={{ marginTop: 16, backgroundColor: Colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: jfSaving ? 0.5 : 1 }}
              >
                {jfSaving
                  ? <Text style={{ fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 14 }}>A enviar...</Text>
                  : <>
                      <Ionicons name="paper-plane" size={16} color="#fff" />
                      <Text style={{ fontFamily: 'Inter_700Bold', color: '#fff', fontSize: 14 }}>Submeter à Secretaria</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarWrapper: { position: 'relative' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  avatarText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#fff' },
  cameraBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  profileMat: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 6 },
  profileBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  sectionNavWrapper: {
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sectionNavGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sectionNavItem: {
    width: '33.333%',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 4,
    position: 'relative',
  },
  sectionNavItemActive: {
    backgroundColor: Colors.gold + '14',
  },
  sectionNavIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border + '66',
    position: 'relative',
  },
  sectionNavIconWrapActive: {
    backgroundColor: Colors.gold + '22',
  },
  sectionNavBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  sectionNavBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff' },
  sectionNavLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' },
  sectionNavLabelActive: { color: Colors.gold, fontFamily: 'Inter_700Bold' },
  sectionNavActiveLine: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: Colors.gold,
    borderRadius: 1,
  },

  sectionBarCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  sectionBarBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1,
    borderColor: Colors.gold + '33',
  },
  sectionBarBackText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  sectionBarCurrent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  sectionBarCurrentText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  sectionBarDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionBarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  sectionBarDotActive: {
    width: 16,
    backgroundColor: Colors.gold,
    borderRadius: 3,
  },

  content: { flex: 1 },
  tabContent: { padding: 16, paddingBottom: 32 },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 },
  sectionTitleText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: '22%', backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3, textAlign: 'center' },

  infoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoVal: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1, textAlign: 'right' },
  infoHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 12 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.info + '18',
    borderWidth: 1,
    borderColor: Colors.info + '44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  alertText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.info },

  discRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  discLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  discNome: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1 },

  trimestreSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  trimBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.backgroundCard, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  trimBtnActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '88' },
  trimBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  trimBtnTextActive: { color: Colors.gold },
  miniPautaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a6b3c', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 16 },
  miniPautaBtnDisabled: { backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  miniPautaBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff', flex: 1, textAlign: 'center' },
  continuidadeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '14', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.info + '40' },
  continuidadeBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.info, flex: 1 },

  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyStateText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  emptyStateTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  emptyStateSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  filterChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.gold },

  faltaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3 },
  faltaIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  faltaDisc: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  faltaData: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  faltaObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3, fontStyle: 'italic' },

  notaCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  notaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  notaDisc: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  notaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  notaItem: { alignItems: 'center', gap: 4 },
  notaItemLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  notaCell: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  notaValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  nfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1 },
  nfLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  nfValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  pautaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  pautaLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.backgroundCard, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.info + '22', borderColor: Colors.info + '66' },
  filterBtnText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  filterBtnTextActive: { color: Colors.info },

  msgCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  msgTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  msgLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  msgRemetente: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.info },
  msgAssunto: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  msgCorpo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 6 },
  msgData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  msgMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  msgMetaText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  msgScrollBody: { maxHeight: 280, marginBottom: 12 },
  msgFullCorpo: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 22 },

  matCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  matIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' },
  matInfo: { flex: 1 },
  matTitulo: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  matDisc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  matData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  matDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  matActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  matActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  matActionText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  matModalDisc: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 8 },
  matModalMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  matMetaText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  matLinkBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
  matLinkText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.info },
  matModalFooter: { flexDirection: 'row', marginTop: 8 },
  matModalDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 12 },
  matModalScroll: { maxHeight: 200, marginBottom: 12 },
  matModalConteudo: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 20 },
  readonlyField: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },

  sumCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  sumHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sumDisc: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  sumData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  sumProf: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 6 },
  sumConteudo: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 6 },
  sumMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sumMetaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  diarioDateSep: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  diarioDateLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  diarioDateLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  diarioCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.gold + '88' },
  diarioCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  diarioDiscBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  diarioDiscText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold, flex: 1 },
  diarioAulaNumBadge: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  diarioAulaNumText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.8)' },
  diarioConteudo: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  diarioObsBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.gold + '12', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.gold + '33', marginBottom: 10,
  },
  diarioObsLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  diarioObsText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 18 },
  diarioMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  diarioMetaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  diarioMetaDot: { fontSize: 11, color: Colors.border },

  diasScroll: { marginBottom: 16 },
  diaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.backgroundCard, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  diaBtnActive: { backgroundColor: Colors.info + '22', borderColor: Colors.info + '66' },
  diaBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  diaBtnTextActive: { color: Colors.info },
  diaFull: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, marginBottom: 12, textAlign: 'center' },
  periodoRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'stretch' },
  periodoHora: { width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 6, borderWidth: 1, borderColor: Colors.border },
  periodoNum: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  periodoTime: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  aulaCard: { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  aulaVazia: { justifyContent: 'center', alignItems: 'center', opacity: 0.4 },
  aulaVaziaText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  aulaDisciplina: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  aulaProf: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4 },
  aulaMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  aulaMetaText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, padding: 13, marginTop: 14 },
  payBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  payBtnSmall: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  payBtnSmallText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  taxaCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taxaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  taxaIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  taxaInfo: { flex: 1 },
  taxaTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  taxaMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  taxaRight: { alignItems: 'flex-end', gap: 6 },
  taxaValor: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  pagCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  pagTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pagBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 6 },
  pagDesc: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  pagValor: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  pagMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  pagMetaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  pagRef: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  pagRefRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  metodoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metodoBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.backgroundCard, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  metodoBtnActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '88' },
  metodoBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  metodoBtnTextActive: { color: Colors.gold },
  valorText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', marginBottom: 14 },

  rubricaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: Colors.surface, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  rubricaItemActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '11' },
  rubricaText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  rubricaValor: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textMuted },

  reconfText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 16, lineHeight: 22 },

  historicoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  historicoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  historicoDisc: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1 },
  historicoRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historicoLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase' },
  historicoNF: { fontSize: 18, fontFamily: 'Inter_700Bold' },

  solCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  solTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  solTipo: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  solMotivo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4 },
  solObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 4 },
  solData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  solPagarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  solPagarBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 20, padding: 20, maxHeight: '90%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  closeBtn: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 12 },
  closeBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },

  formLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  textInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  readonlyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '18', borderWidth: 1, borderColor: Colors.info + '44', borderRadius: 12, padding: 12, marginBottom: 14 },
  readonlyText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 },

  timelineContainer: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelineLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 2, marginBottom: -2 },
  timelineCard: { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
  timelineCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  timelineTitulo: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  timelineDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  timelineDateBox: { alignItems: 'flex-end', minWidth: 60 },
  timelineDateNum: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  timelineHora: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  timelineFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  logCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, padding: 14, marginBottom: 10 },
  logIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  logTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  logSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  logData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  cartaoSectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' },
  cartaoCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  cartaoCardValido: { borderColor: Colors.success + '88' },
  cartaoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12 },
  cartaoSchoolName: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.5 },
  cartaoAnoLetivo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  cartaoStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  cartaoStatusValido: { backgroundColor: Colors.success },
  cartaoStatusPendente: { backgroundColor: Colors.warning },
  cartaoStatusText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.6 },
  cartaoBody: { flexDirection: 'row', gap: 14, padding: 16 },
  cartaoFotoWrap: { position: 'relative' },
  cartaoFoto: { width: 72, height: 88, borderRadius: 12, borderWidth: 2, borderColor: Colors.gold },
  cartaoFotoPlaceholder: { width: 72, height: 88, borderRadius: 12, borderWidth: 2, borderColor: Colors.gold, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  cartaoFotoInitials: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold },
  cartaoFotoCheck: { position: 'absolute', bottom: -6, right: -6, backgroundColor: Colors.backgroundCard, borderRadius: 10 },
  cartaoInfo: { flex: 1, justifyContent: 'center' },
  cartaoNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 8 },
  cartaoInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  cartaoInfoVal: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 },
  cartaoQrSection: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' },
  cartaoQrWrap: { backgroundColor: '#fff', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: Colors.border },
  cartaoQrInfo: { flex: 1 },
  cartaoQrLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  cartaoQrSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 16 },
  cartaoRefRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  cartaoRefText: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  cartaoFooter: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8 },
  cartaoFooterText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  cartaoInfoBox: { flexDirection: 'row', gap: 10, backgroundColor: Colors.info + '18', borderWidth: 1, borderColor: Colors.info + '44', borderRadius: 12, padding: 14, marginBottom: 16 },
  cartaoInfoBoxText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 },
  cartaoPagoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '44', borderRadius: 12, padding: 14 },
  cartaoPagoText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.success },
  cartaoPagarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, borderRadius: 14, padding: 16 },
  cartaoPagarBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  docBadgesSection: { marginTop: 14, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  docBadgesTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  docBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  docTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '44', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 200 },
  docTypeBadgeText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success },

  docHistCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: Colors.gold },
  docHistTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
  docHistIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' },
  docHistTipo: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  docHistMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  docHistData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  docReemitirBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.gold + '55', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', backgroundColor: Colors.gold + '10' },
  docReemitirText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  docCountBadge: { backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  docCountText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#000' },

  // ── Payment modal styles ──
  pagHeaderBg: { backgroundColor: Colors.primary, paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20, alignItems: 'center', borderRadius: 0 },
  pagHeaderLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.7)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  pagHeaderValor: { fontSize: 38, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: -1 },
  pagHeaderSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  pagPrazoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 10, marginBottom: 16 },
  pagPrazoText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  pagMetodoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pagMetodoLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  pagMetodoSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  pagRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pagRadioActive: { borderColor: '#0bbfaa' },
  pagRadioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#0bbfaa' },
  pagBtnTeal: { backgroundColor: '#0bbfaa', borderRadius: 30, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  pagBtnTealText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  pagFormIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  pagFormTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  pagFormAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  pagFormAmountLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  pagFormAmount: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.primary },
  pagPhoneWrap: { width: '100%', marginBottom: 8 },
  pagPhoneLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pagPhoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.backgroundCard, overflow: 'hidden' },
  pagPhonePrefix: { paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text, borderRightWidth: 1, borderRightColor: Colors.border },
  pagPhoneInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.text },
  pagPhoneHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
  pagRefInfoBox: { flexDirection: 'row', gap: 8, backgroundColor: Colors.info + '12', borderRadius: 10, padding: 12, marginTop: 12, width: '100%' },
  pagRefInfoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  pagRefBox: { backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, marginTop: 16, width: '100%', alignItems: 'center' },
  pagRefBoxLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  pagRefBoxVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.primary, letterSpacing: 1 },
});
