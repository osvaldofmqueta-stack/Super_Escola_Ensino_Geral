import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import EmissaoRapidaModal from '@/components/EmissaoRapidaModal';
import DateInput from '@/components/DateInput';
import MapaAproveitamentoModal from '@/components/MapaAproveitamentoModal';
import PendingSolicitacoesModal, { Solicitacao } from '@/components/PendingSolicitacoesModal';
import {Dimensions, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { SkeletonList } from '@/components/Skeleton';
import * as XLSX from 'xlsx';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import TopBar from '@/components/TopBar';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import { apiRequest } from '@/lib/query-client';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';
import { buildPautaFinalHtml } from '@/lib/pautaFinalGen';
import PautaFinalPreviewModal from '@/components/PautaFinalPreviewModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ExameNacionalTab from '@/components/ExameNacionalTab';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { SECRETARIA_TOUR_STEPS, SECRETARIA_TOUR_KEY, CHEFE_SECRETARIA_TOUR_STEPS, CHEFE_SECRETARIA_TOUR_KEY } from '@/constants/tourSteps';
const PAUTA_FINAL_IMPRESSA_KEY = '@siga_pauta_final_impressa_v1';

const { width } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────────
type DocType = 'declaracao' | 'certificado' | 'boletim' | 'atestado' | 'historico';
type ProcessoStatus = 'pendente' | 'em_curso' | 'concluido' | 'cancelado';

interface Documento {
  id: string;
  tipo: DocType;
  alunoNome: string;
  alunoNum: string;
  emitidoEm: string;
  emitidoPor: string;
  finalidade?: string;
}

interface Processo {
  id: string;
  tipo: string;
  descricao: string;
  solicitante: string;
  dataAbertura: string;
  prazo?: string;
  status: ProcessoStatus;
  prioridade: 'baixa' | 'media' | 'alta';
}

interface Correspondencia {
  id: string;
  assunto: string;
  destinatario: string;
  tipo: 'entrada' | 'saida';
  data: string;
  urgente: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function docLabel(tipo: DocType) {
  const map: Record<DocType, string> = {
    declaracao: 'Declaração de Matrícula',
    certificado: 'Certificado de Habilitações',
    boletim: 'Boletim de Notas',
    atestado: 'Atestado de Frequência',
    historico: 'Histórico Escolar',
  };
  return map[tipo];
}

function docColor(tipo: DocType) {
  const map: Record<DocType, string> = {
    declaracao: Colors.info,
    certificado: Colors.gold,
    boletim: Colors.success,
    atestado: Colors.warning,
    historico: Colors.accent,
  };
  return map[tipo];
}

function statusColor(s: ProcessoStatus) {
  const map: Record<ProcessoStatus, string> = {
    pendente: Colors.warning,
    em_curso: Colors.info,
    concluido: Colors.success,
    cancelado: Colors.danger,
  };
  return map[s];
}

function statusLabel(s: ProcessoStatus) {
  const map: Record<ProcessoStatus, string> = {
    pendente: 'Pendente',
    em_curso: 'Em Curso',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  return map[s];
}

function prioColor(p: 'baixa' | 'media' | 'alta') {
  return p === 'alta' ? Colors.danger : p === 'media' ? Colors.warning : Colors.success;
}

function today() { return new Date().toLocaleDateString('pt-PT'); }

function mapDocumentoFromApi(r: any): Documento {
  return {
    id: r.id,
    tipo: r.tipo as DocType,
    alunoNome: r.alunoNome ?? '',
    alunoNum: r.alunoNum ?? '',
    emitidoEm: r.emitidoEm
      ? new Date(r.emitidoEm).toLocaleDateString('pt-PT')
      : today(),
    emitidoPor: r.emitidoPor ?? 'Secretaria',
    finalidade: r.finalidade ?? '',
  };
}

function mapProcessoFromApi(r: any): Processo {
  return {
    id: r.id,
    tipo: r.tipo,
    descricao: r.descricao,
    solicitante: r.solicitante,
    dataAbertura: r.createdAt
      ? new Date(r.createdAt).toLocaleDateString('pt-PT')
      : today(),
    prazo: r.prazo ?? undefined,
    status: r.status as ProcessoStatus,
    prioridade: r.prioridade as 'baixa' | 'media' | 'alta',
  };
}

function mapCorrespondenciaFromApi(r: any): Correspondencia {
  return {
    id: r.id,
    assunto: r.assunto ?? '',
    destinatario: r.destinatario ?? '',
    tipo: r.tipo as 'entrada' | 'saida',
    data: r.data ?? new Date().toLocaleDateString('pt-PT'),
    urgente: Boolean(r.urgente),
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function SectionHeader({ title, icon, count, onAction, actionLabel }: {
  title: string; icon: string; count?: number; onAction?: () => void; actionLabel?: string;
}) {
  return (
    <View style={styles.secHeader}>
      <View style={styles.secHeaderLeft}>
        <Ionicons name={icon as any} size={16} color={Colors.goldLight} />
        <Text style={styles.secHeaderTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
        {count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      {onAction && (
        <TouchableOpacity onPress={onAction} style={styles.secAction}>
          <Text style={styles.secActionText} numberOfLines={1}>{actionLabel ?? 'Ver todos'}</Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.goldLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function StatCard({ value, label, color, icon }: { value: string | number; label: string; color: string; icon: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Ionicons name={icon as any} size={28} color={color} style={{ marginBottom: 4 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── EMIT DOCUMENT MODAL ────────────────────────────────────────────────────
function EmitirDocumentoModal({ visible, onClose, onEmit, alunos }: {
  visible: boolean; onClose: () => void;
  onEmit: (doc: Omit<Documento, 'id' | 'emitidoEm' | 'emitidoPor'>) => void;
  alunos: any[];
}) {
  const [tipo, setTipo] = useState<DocType>('declaracao');
  const [alunoNome, setAlunoNome] = useState('');
  const [alunoNum, setAlunoNum] = useState('');
  const [finalidade, setFinalidade] = useState('');

  const tipos: { key: DocType; label: string; icon: string }[] = [
    { key: 'declaracao', label: 'Declaração', icon: 'document-text' },
    { key: 'certificado', label: 'Certificado', icon: 'ribbon' },
    { key: 'boletim', label: 'Boletim', icon: 'bar-chart' },
    { key: 'atestado', label: 'Atestado', icon: 'checkmark-circle' },
    { key: 'historico', label: 'Histórico', icon: 'time' },
  ];

  function handleSubmit() {
    if (!alunoNome.trim()) {
      webAlert('Campo obrigatório', 'Indique o nome do aluno.');
      return;
    }
    onEmit({ tipo, alunoNome: alunoNome.trim(), alunoNum: alunoNum.trim() || `ALN-2025-${Math.floor(Math.random() * 900 + 100)}`, finalidade });
    setAlunoNome(''); setAlunoNum(''); setFinalidade(''); setTipo('declaracao');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Emitir Documento</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Tipo de Documento</Text>
          <View style={styles.tipoGrid}>
            {tipos.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tipoCard, tipo === t.key && { backgroundColor: docColor(t.key) + '33', borderColor: docColor(t.key) }]}
                onPress={() => setTipo(t.key)}
              >
                <Ionicons name={t.icon as any} size={18} color={tipo === t.key ? docColor(t.key) : Colors.textMuted} />
                <Text style={[styles.tipoLabel, tipo === t.key && { color: docColor(t.key) }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Nome do Aluno<RequiredMark /></Text>
          <TextInput
            style={styles.input}
            value={alunoNome}
            onChangeText={setAlunoNome}
            placeholder="Nome completo do aluno"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Text style={styles.fieldLabel}>N.º de Matrícula</Text>
          <TextInput
            style={styles.input}
            value={alunoNum}
            onChangeText={setAlunoNum}
            placeholder="ALN-AAAA-XXXX"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Text style={styles.fieldLabel}>Finalidade</Text>
          <TextInput
            style={styles.input}
            value={finalidade}
            onChangeText={setFinalidade}
            placeholder="Ex: Bolsa de estudo, emprego..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Ionicons name="print" size={16} color="#fff" />
              <Text style={styles.submitBtnText}>Emitir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── NOVO PROCESSO MODAL ─────────────────────────────────────────────────────
function NovoProcessoModal({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (p: Omit<Processo, 'id' | 'dataAbertura' | 'status'>) => void;
}) {
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media');

  const tipos = ['Matrícula', 'Re-matrícula', 'Transferência', 'Equivalência', 'Reclamação', 'Registo Civil', 'Dispensa', 'Outro'];

  function handleSubmit() {
    if (!tipo || !descricao.trim() || !solicitante.trim()) {
      webAlert('Campos obrigatórios', 'Preencha tipo, descrição e solicitante.');
      return;
    }
    onSave({ tipo, descricao: descricao.trim(), solicitante: solicitante.trim(), prazo, prioridade });
    setTipo(''); setDescricao(''); setSolicitante(''); setPrazo(''); setPrioridade('media');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Abrir Processo</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Tipo de Processo<RequiredMark /></Text>
            <View style={styles.tipoGrid}>
              {tipos.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipoCard, tipo === t && { backgroundColor: Colors.info + '33', borderColor: Colors.info }]}
                  onPress={() => setTipo(t)}
                >
                  <Text style={[styles.tipoLabel, tipo === t && { color: Colors.info }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Descrição<RequiredMark /></Text>
            <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} value={descricao} onChangeText={setDescricao}
              placeholder="Descreva o processo..." placeholderTextColor={Colors.textMuted} multiline />

            <Text style={styles.fieldLabel}>Solicitante<RequiredMark /></Text>
            <TextInput style={styles.input} value={solicitante} onChangeText={setSolicitante}
              placeholder="Nome do aluno ou encarregado" placeholderTextColor={Colors.textMuted} returnKeyType="done" onSubmitEditing={handleSubmit} />

            <Text style={styles.fieldLabel}>Prazo</Text>
            <TextInput style={styles.input} value={prazo} onChangeText={setPrazo}
              placeholder="DD/MM/AAAA" placeholderTextColor={Colors.textMuted} returnKeyType="done" onSubmitEditing={handleSubmit} />

            <Text style={styles.fieldLabel}>Prioridade</Text>
            <View style={styles.prioRow}>
              {(['baixa', 'media', 'alta'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.prioBtn, prioridade === p && { backgroundColor: prioColor(p) + '33', borderColor: prioColor(p) }]}
                  onPress={() => setPrioridade(p)}
                >
                  <Text style={[styles.prioBtnText, prioridade === p && { color: prioColor(p) }]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                <Ionicons name="folder-open" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Abrir Processo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── CREDENTIALS MODAL ──────────────────────────────────────────────────────
function CredenciaisModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { config } = useConfig();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { maxWidth: 380 }]}>
          <LinearGradient colors={['#1A5276', '#0D1F35']} style={styles.credHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.credAvatar}>
              <Text style={styles.credAvatarText}>SA</Text>
            </View>
            <View style={styles.credBadge}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.gold} />
              <Text style={styles.credBadgeText}>Credencial Oficial</Text>
            </View>
          </LinearGradient>

          <View style={styles.credBody}>
            <Text style={styles.credName}>Secretária Académica</Text>
            <Text style={styles.credSchool}>{config.nomeEscola}</Text>

            <View style={styles.credDivider} />

            {[
              { label: 'Email de Acesso', value: 'secretaria@sige.ao', icon: 'mail' },
              { label: 'Senha', value: 'Secretaria@2025', icon: 'lock-closed' },
              { label: 'Perfil', value: 'Secretária Académica', icon: 'person' },
              { label: 'Nível de Acesso', value: 'Módulo Académico Completo', icon: 'layers' },
              { label: 'Departamento', value: 'Secretaria Escolar', icon: 'business' },
            ].map(row => (
              <View key={row.label} style={styles.credRow}>
                <View style={styles.credRowIcon}>
                  <Ionicons name={row.icon as any} size={14} color={Colors.gold} />
                </View>
                <View style={styles.credRowContent}>
                  <Text style={styles.credRowLabel}>{row.label}</Text>
                  <Text style={styles.credRowValue}>{row.value}</Text>
                </View>
              </View>
            ))}

            <View style={styles.credDivider} />
            <Text style={styles.credNote}>
              Esta credencial é de uso exclusivo do funcionário designado. Não partilhe a sua senha.
            </Text>
          </View>

          <TouchableOpacity style={[styles.submitBtn, { margin: 16, marginTop: 0 }]} onPress={onClose}>
            <Text style={styles.submitBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function SecretariaHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const isChefe = user?.role === 'chefe_secretaria';
  const TOUR_STEPS = isChefe ? CHEFE_SECRETARIA_TOUR_STEPS : SECRETARIA_TOUR_STEPS;
  const TOUR_KEY = isChefe ? CHEFE_SECRETARIA_TOUR_KEY : SECRETARIA_TOUR_KEY;
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(TOUR_KEY);

  const { alunos, turmas, eventos, notas, professores } = useData();
  const { pautas } = useProfessor();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [pautaFiltroStatus, setPautaFiltroStatus] = useState<'todas' | 'fechada' | 'aberta'>('todas');
  const [pautaFiltroTrimestre, setPautaFiltroTrimestre] = useState<0 | 1 | 2 | 3>(0);
  const [pautaFiltroTurma, setPautaFiltroTurma] = useState<string>('');
  const [pautaFiltroAno, setPautaFiltroAno] = useState<string>('');
  const [pautaPesquisa, setPautaPesquisa] = useState<string>('');
  const [turmaDropdownOpen, setTurmaDropdownOpen] = useState(false);
  const [turmaDropdownSearch, setTurmaDropdownSearch] = useState('');
  const [pautasPagina, setPautasPagina] = useState(1);
  const PAUTAS_POR_PAGINA = 20;

  const normAno = (a: string) => (a || '').replace(/-/g, '/');

  // Reset para página 1 sempre que os filtros mudam
  useEffect(() => { setPautasPagina(1); }, [pautaFiltroStatus, pautaFiltroTrimestre, pautaFiltroTurma, pautaFiltroAno, pautaPesquisa]);

  const pautasAnosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    pautas.forEach(p => { if (p.anoLetivo) set.add(normAno(p.anoLetivo)); });
    return [...set].sort().reverse();
  }, [pautas]);

  const pautasFiltradas = useMemo(() => {
    const q = pautaPesquisa.trim().toLowerCase();
    return pautas.filter(p => {
      if (pautaFiltroStatus !== 'todas' && p.status !== pautaFiltroStatus) return false;
      if (pautaFiltroTrimestre !== 0 && p.trimestre !== pautaFiltroTrimestre) return false;
      if (pautaFiltroTurma && p.turmaId !== pautaFiltroTurma) return false;
      if (pautaFiltroAno && normAno(p.anoLetivo) !== pautaFiltroAno) return false;
      if (q) {
        const turmaObj = turmas.find(t => t.id === p.turmaId);
        const turmaNome = (turmaObj?.nome || '').toLowerCase();
        const classe = String(turmaObj?.classe || '').toLowerCase();
        const disciplina = (p.disciplina || '').toLowerCase();
        const prof = professores.find(pr => pr.id === p.professorId);
        const profNome = prof ? `${prof.nome} ${prof.apelido}`.toLowerCase() : '';
        if (!turmaNome.includes(q) && !classe.includes(q) && !disciplina.includes(q) && !profNome.includes(q)) return false;
      }
      return true;
    });
  }, [pautas, pautaFiltroStatus, pautaFiltroTrimestre, pautaFiltroTurma, pautaFiltroAno, pautaPesquisa, turmas, professores]);

  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [docsPage, setDocsPage] = useState(0);
  const DOCS_PAGE_SIZE = 10;
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [correspondencias, setCorrespondencias] = useState<Correspondencia[]>([]);
  const [loadingCorrespondencias, setLoadingCorrespondencias] = useState(false);
  const [showNovaCorresp, setShowNovaCorresp] = useState(false);
  const [novaCorrespAssunto, setNovaCorrespAssunto] = useState('');
  const [novaCorrespDestinatario, setNovaCorrespDestinatario] = useState('');
  const [novaCorrespTipo, setNovaCorrespTipo] = useState<'entrada' | 'saida'>('saida');
  const [novaCorrespUrgente, setNovaCorrespUrgente] = useState(false);
  const [showEmitirModal, setShowEmitirModal] = useState(false);
  const [showEmissaoRapida, setShowEmissaoRapida] = useState(false);
  const [showMapaAproveitamento, setShowMapaAproveitamento] = useState(false);
  const [showProcessoModal, setShowProcessoModal] = useState(false);
  const [showCredenciais, setShowCredenciais] = useState(false);
  type SecHubTab = 'visao' | 'documentos' | 'cursos' | 'pautas' | 'justificacoes' | 'exame';
  const SEC_HUB_TABS: SecHubTab[] = ['visao', 'documentos', 'cursos', 'pautas', 'justificacoes', 'exame'];
  const routeParams = useLocalSearchParams<{ tab?: string }>();
  const initialSecTab = (SEC_HUB_TABS.find(t => t === String(routeParams?.tab || '')) || 'visao') as SecHubTab;
  const [activeTab, setActiveTab] = useState<SecHubTab>(initialSecTab);
  useEffect(() => {
    const t = String(routeParams?.tab || '');
    if (t && (SEC_HUB_TABS as string[]).includes(t)) setActiveTab(t as SecHubTab);
  }, [routeParams?.tab]);

  // Auto-mostrar tour na primeira visita
  useEffect(() => { const t = setTimeout(() => checkAndShow(), 800); return () => clearTimeout(t); }, []);

  const [justificacoesFaltaList, setJustificacoesFaltaList] = useState<any[]>([]);
  const [justFiltro, setJustFiltro] = useState<'pendente' | 'todas'>('pendente');
  const [justRejeitarId, setJustRejeitarId] = useState<string | null>(null);
  const [justRejeitarMotivo, setJustRejeitarMotivo] = useState('');
  const [justComprovativoUrl, setJustComprovativoUrl] = useState<string | null>(null);
  const [justActioning, setJustActioning] = useState<string | null>(null);
  const [cursoExpandido, setCursoExpandido] = useState<string | null>(null);
  const [showRematricula, setShowRematricula] = useState(false);
  const [rematriculaAnoDestino, setRematriculaAnoDestino] = useState('');

  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<Solicitacao[]>([]);
  const [showSolicitacoesModal, setShowSolicitacoesModal] = useState(false);
  const manuallyClosedRef = useRef(false);
  const [rematriculaBloquearPendencia, setRematriculaBloquearPendencia] = useState(true);
  const [rematriculaBloquearReprovados, setRematriculaBloquearReprovados] = useState(true);
  const [rematriculaLoading, setRematriculaLoading] = useState(false);
  const [rematriculaResultado, setRematriculaResultado] = useState<{ processados: number; bloqueados: number; erros: number; total: number } | null>(null);

  // ── Prazos Mini-Pauta ────────────────────────────────────────────────────
  interface PrazoMiniPauta { id: string; trimestre: number; anoLetivo: string; dataLimite: string; descricao?: string; ativo: boolean; gracePeriodHoras?: number; bloqueioAposPrazo?: boolean }
  interface SubmissaoStatus { total: number; submetidas: number; pendentes: any[]; todasSubmetidas: boolean; pautas: any[]; turmasOrfas?: { id: string; nome: string }[] }
  interface HistoricoPrazo { id: string; trimestre: number; anoLetivo: string; dataLimiteAntiga?: string; dataLimiteNova?: string; acao: string; motivo?: string; alteradoPor?: string; alteradoEm: string }
  interface Prorrogacao { id: string; professorId: string; professorNome?: string; trimestre: number; anoLetivo: string; novaDataLimite: string; motivo?: string; concedidoPor?: string; concedidoEm: string; ativo: boolean }
  const [prazos, setPrazos] = useState<PrazoMiniPauta[]>([]);
  const [loadingPrazos, setLoadingPrazos] = useState(false);
  const [submissaoStatus, setSubmissaoStatus] = useState<Record<number, SubmissaoStatus>>({});
  const [loadingSubmissao, setLoadingSubmissao] = useState(false);
  const [selectedTrimestrePauta, setSelectedTrimestrePauta] = useState<1|2|3>(1);
  const [showPautaFinalPreview, setShowPautaFinalPreview] = useState(false);
  // Histórico
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [historicoPrazos, setHistoricoPrazos] = useState<HistoricoPrazo[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  // Prorrogação individual
  const [showProrrogacaoModal, setShowProrrogacaoModal] = useState(false);
  const [prorrogacaoTrimestre, setProrrogacaoTrimestre] = useState<1|2|3>(1);
  const [prorrogacaoProfessorId, setProrrogacaoProfessorId] = useState('');
  const [prorrogacaoNovaData, setProrrogacaoNovaData] = useState('');
  const [prorrogacaoMotivo, setProrrogacaoMotivo] = useState('');
  const [prorrogacaoSearch, setProrrogacaoSearch] = useState('');
  const [savingProrrogacao, setSavingProrrogacao] = useState(false);
  const [prorrogacoes, setProrrogacoes] = useState<Prorrogacao[]>([]);

  const stats = useMemo(() => ({
    totalAlunos: alunos.filter(a => a.ativo).length,
    totalTurmas: turmas.filter(t => t.ativo).length,
    processosPendentes: processos.filter(p => p.status === 'pendente').length,
    docsEmitidos: documentos.length,
    processosEmCurso: processos.filter(p => p.status === 'em_curso').length,
  }), [alunos, turmas, processos, documentos]);

  const proximosEventos = useMemo(() =>
    eventos.filter(e => e.data >= new Date().toISOString().split('T')[0]).slice(0, 3),
    [eventos]
  );

  const fetchDocumentos = useCallback(async () => {
    setLoadingDocumentos(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/documentos-emitidos', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDocumentos((data as any[]).map(mapDocumentoFromApi));
      }
    } catch (_) {
    } finally {
      setLoadingDocumentos(false);
    }
  }, []);

  const fetchProcessos = useCallback(async () => {
    setLoadingProcessos(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/processos-secretaria', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProcessos((data as any[]).map(mapProcessoFromApi));
      }
    } catch (_) {
    } finally {
      setLoadingProcessos(false);
    }
  }, []);

  const fetchCorrespondencias = useCallback(async () => {
    setLoadingCorrespondencias(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/correspondencias', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCorrespondencias((data as any[]).map(mapCorrespondenciaFromApi));
      }
    } catch (_) {
    } finally {
      setLoadingCorrespondencias(false);
    }
  }, []);

  // ── Prazos Mini-Pauta helpers ─────────────────────────────────────────────
  const fetchPrazos = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano;
    if (!anoLetivo) return;
    setLoadingPrazos(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/prazos-mini-pauta?anoLetivo=${encodeURIComponent(anoLetivo)}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) setPrazos(await res.json());
    } catch (_) {} finally { setLoadingPrazos(false); }
  }, [anoSelecionado]);

  const fetchSubmissaoStatus = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano;
    if (!anoLetivo) return;
    setLoadingSubmissao(true);
    try {
      const token = await getAuthToken();
      const results: Record<number, any> = {};
      await Promise.all([1, 2, 3].map(async t => {
        const r = await fetch(
          `/api/pautas/submissoes-status?trimestre=${t}&anoLetivo=${encodeURIComponent(anoLetivo)}`,
          { headers: { Authorization: `Bearer ${token ?? ''}` } }
        );
        if (r.ok) results[t] = await r.json();
      }));
      setSubmissaoStatus(results);
    } catch (_) {} finally { setLoadingSubmissao(false); }
  }, [anoSelecionado]);

  // ── Helpers de validação e formatação ───────────────────────────────────
  const parseISO = useCallback((iso: string): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }, []);
  const formatLong = useCallback((iso: string): string => {
    const d = parseISO(iso); if (!d) return iso;
    return d.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });
  }, [parseISO]);
  const validarDataPrazo = useCallback((iso: string): { erro?: string; aviso?: string } => {
    const d = parseISO(iso); if (!d) return { erro: 'Data inválida (use AAAA-MM-DD).' };
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.round((d.getTime() - hoje.getTime()) / 86400000);
    if (diff < 0) return { erro: 'A data não pode estar no passado.' };
    if (d.getDay() === 0 || d.getDay() === 6) {
      return { aviso: 'Atenção: o prazo cai num fim-de-semana. Considere usar a 6ª-feira anterior.' };
    }
    if (diff < 3) return { aviso: `Prazo muito curto (${diff} dia${diff===1?'':'s'}). Os professores podem ter dificuldade em submeter a tempo.` };
    if (diff > 60) return { aviso: `Prazo muito longo (${diff} dias). Pondere reduzir para manter pressão de calendarização.` };
    return {};
  }, [parseISO]);

  const fetchHistorico = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano; if (!anoLetivo) return;
    setLoadingHistorico(true);
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/historico?anoLetivo=${encodeURIComponent(anoLetivo)}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (r.ok) setHistoricoPrazos(await r.json());
    } catch {} finally { setLoadingHistorico(false); }
  }, [anoSelecionado]);

  const fetchProrrogacoes = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano; if (!anoLetivo) return;
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/prorrogacoes?anoLetivo=${encodeURIComponent(anoLetivo)}&ativo=1`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (r.ok) setProrrogacoes(await r.json());
    } catch {}
  }, [anoSelecionado]);

  const salvarProrrogacao = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano; if (!anoLetivo) return;
    if (!prorrogacaoProfessorId) { webAlert('Campo obrigatório', 'Seleccione o professor.'); return; }
    if (!prorrogacaoNovaData) { webAlert('Campo obrigatório', 'Defina a nova data.'); return; }
    const v = validarDataPrazo(prorrogacaoNovaData);
    if (v.erro) { webAlert('Data inválida', v.erro); return; }
    setSavingProrrogacao(true);
    try {
      const token = await getAuthToken();
      const prof = professores.find(p => p.id === prorrogacaoProfessorId);
      const r = await fetch('/api/prazos-mini-pauta/prorrogar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          professorId: prorrogacaoProfessorId,
          professorNome: prof ? `${prof.nome} ${prof.apelido || ''}`.trim() : null,
          trimestre: prorrogacaoTrimestre,
          anoLetivo,
          novaDataLimite: prorrogacaoNovaData,
          motivo: prorrogacaoMotivo.trim() || null,
          concedidoPor: user?.nome || 'Secretaria',
        }),
      });
      if (r.ok) {
        await fetchProrrogacoes();
        setShowProrrogacaoModal(false);
        setProrrogacaoProfessorId('');
        setProrrogacaoNovaData('');
        setProrrogacaoMotivo('');
        setProrrogacaoSearch('');
        alertSucesso('Prorrogação concedida', `Nova data: ${formatLong(prorrogacaoNovaData)}.`);
      } else {
        const j = await r.json().catch(() => ({}));
        alertErro('Erro', j?.error || 'Não foi possível conceder a prorrogação.');
      }
    } catch { alertErro('Erro', 'Falha de ligação.'); } finally { setSavingProrrogacao(false); }
  }, [anoSelecionado, prorrogacaoProfessorId, prorrogacaoTrimestre, prorrogacaoNovaData, prorrogacaoMotivo, professores, user, validarDataPrazo, formatLong, fetchProrrogacoes]);

  const removerProrrogacao = useCallback(async (id: string) => {
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/prorrogar/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (r.ok) { await fetchProrrogacoes(); alertSucesso('Removida', 'Prorrogação cancelada.'); }
    } catch {}
  }, [fetchProrrogacoes]);

  const baixarRelatorioCumprimento = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano; if (!anoLetivo) return;
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/relatorio-cumprimento?anoLetivo=${encodeURIComponent(anoLetivo)}&formato=csv`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!r.ok) { alertErro('Erro', 'Não foi possível gerar o relatório.'); return; }
      const blob = await r.blob();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `cumprimento-prazos-${anoLetivo}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        alertSucesso('Relatório', 'Download iniciado.');
      } else {
        webAlert('Indisponível', 'Disponível apenas na versão web.');
      }
    } catch { alertErro('Erro', 'Falha de ligação.'); }
  }, [anoSelecionado]);

  const baixarCalendario = useCallback(async () => {
    const anoLetivo = anoSelecionado?.ano; if (!anoLetivo) return;
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/calendario.ics?anoLetivo=${encodeURIComponent(anoLetivo)}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!r.ok) { alertErro('Erro', 'Não foi possível gerar o calendário.'); return; }
      const blob = await r.blob();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `prazos-mini-pauta-${anoLetivo}.ics`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        alertSucesso('Calendário', 'Importe o ficheiro .ics no Google Calendar / Outlook.');
      } else {
        webAlert('Indisponível', 'Disponível apenas na versão web.');
      }
    } catch { alertErro('Erro', 'Falha de ligação.'); }
  }, [anoSelecionado]);

  const [pautaPreview, setPautaPreview] = useState<{ html: string; trimestre: number; anoLetivo: string; turmaId?: string } | null>(null);

  // ── Estado: Pautas Finais já impressas (persistido em AsyncStorage) ──────
  // chave = `${anoLetivo}|${trimestre}|${turmaId}` (ou `__GERAL__` para o trimestre todo)
  const [pautasFinalImpressas, setPautasFinalImpressas] = useState<Record<string, string>>({});
  const [trimestrePautaFinalTurma, setTrimestrePautaFinalTurma] = useState<1|2|3>(1);
  const [filtroTurmaPronta, setFiltroTurmaPronta] = useState<'todas'|'prontas'|'pendentes'|'impressas'>('prontas');

  useEffect(() => {
    AsyncStorage.getItem(PAUTA_FINAL_IMPRESSA_KEY).then(raw => {
      if (!raw) return;
      try { setPautasFinalImpressas(JSON.parse(raw) || {}); } catch {}
    }).catch(() => {});
  }, []);

  const persistImpressas = useCallback(async (next: Record<string, string>) => {
    setPautasFinalImpressas(next);
    try { await AsyncStorage.setItem(PAUTA_FINAL_IMPRESSA_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const impressaKey = useCallback((trimestre: number, turmaId: string) => {
    const ano = anoSelecionado?.ano || '—';
    return `${ano}|${trimestre}|${turmaId}`;
  }, [anoSelecionado]);

  const marcarImpressa = useCallback(async (trimestre: number, turmaId: string) => {
    const k = impressaKey(trimestre, turmaId);
    await persistImpressas({ ...pautasFinalImpressas, [k]: new Date().toISOString() });
  }, [impressaKey, pautasFinalImpressas, persistImpressas]);

  const desmarcarImpressa = useCallback(async (trimestre: number, turmaId: string) => {
    const k = impressaKey(trimestre, turmaId);
    const next = { ...pautasFinalImpressas };
    delete next[k];
    await persistImpressas(next);
  }, [impressaKey, pautasFinalImpressas, persistImpressas]);

  function gerarPautaFinalGeral(trimestre: number, turmaIdFiltro?: string) {
    if (Platform.OS !== 'web') {
      webAlert('Indisponível', 'A geração da Pauta Final está disponível na versão web do sistema.');
      return;
    }
    const status = submissaoStatus[trimestre];
    if (!status) {
      webAlert('Sem dados', 'Actualize a página e tente novamente.');
      return;
    }

    // Turmas activas sem disciplinas configuradas bloqueiam a emissão
    const orfas = (status.turmasOrfas || []).filter((t: any) =>
      !turmaIdFiltro || t.id === turmaIdFiltro
    );
    if (orfas.length > 0) {
      const nomes = orfas.slice(0, 5).map((t: any) => `• ${t.nome}`).join('\n');
      const extra = orfas.length > 5 ? `\n... e mais ${orfas.length - 5}` : '';
      webAlert(
        'Configuração incompleta',
        `As seguintes turmas activas ainda não têm disciplinas atribuídas:\n\n${nomes}${extra}\n\nConfigure as disciplinas de cada turma antes de emitir a Pauta Final.`
      );
      return;
    }

    // Filtrar pautas — por turma, ou usar todas (modo geral)
    const pautasDoEscopo = turmaIdFiltro
      ? status.pautas.filter((p: any) => p.turmaId === turmaIdFiltro)
      : status.pautas;

    const totalEscopo = pautasDoEscopo.length;
    // Uma pauta só conta como submetida se o professor a fechou (status === 'fechada').
    // Combinações turma×disciplina sem pauta criada (status null) não contam.
    const submetidasEscopo = pautasDoEscopo.filter((p: any) => p.status === 'fechada').length;
    const todasOk = totalEscopo > 0 && submetidasEscopo === totalEscopo;

    if (!todasOk) {
      const faltam = totalEscopo - submetidasEscopo;
      const ondeTxt = turmaIdFiltro
        ? `nesta turma (${faltam} disciplina${faltam !== 1 ? 's' : ''} por submeter)`
        : `no ${trimestre}º Trimestre (${faltam} mini-pauta${faltam !== 1 ? 's' : ''} por submeter)`;

      // Listar os professores/disciplinas pendentes (máx. 10 linhas)
      const pendingItems = pautasDoEscopo
        .filter((p: any) => p.status !== 'fechada')
        .slice(0, 10)
        .map((p: any) => {
          const turmaNome = p.turmaNome || turmas.find((t: any) => t.id === p.turmaId)?.nome || '—';
          const profNome = p.professorNome
            || (p.professorId ? (professores.find((pr: any) => pr.id === p.professorId)?.nome || '—') : 'Sem professor atribuído');
          const estadoLabel = !p.status ? 'não iniciada' : p.status === 'aberta' ? 'em lançamento' : p.status;
          return `• ${turmaNome} · ${p.disciplina} (${profNome}) — ${estadoLabel}`;
        })
        .join('\n');
      const faltamMais = faltam > 10 ? `\n... e mais ${faltam - 10} mini-pauta(s)` : '';

      webAlert(
        'Aguarda submissão dos professores',
        `Ainda faltam mini-pautas por submeter ${ondeTxt}:\n\n${pendingItems}${faltamMais}\n\nA Pauta Final só pode ser emitida após todos os professores submeterem as suas mini-pautas.`
      );
      return;
    }

    const anoLetivo = anoSelecionado?.ano || '—';
    // Passar apenas as pautas verdadeiramente submetidas para o gerador HTML
    const pautasParaHtml = pautasDoEscopo.filter((p: any) => p.status === 'fechada');
    const html = buildPautaFinalHtml({
      trimestre,
      anoLetivo,
      pautasSubmetidas: pautasParaHtml,
      turmas: turmas as any,
      alunos: alunos as any,
      notas: notas as any,
      config: config as any,
      utilizadorNome: user?.nome,
    }, { showToolbar: false });
    setPautaPreview({ html, trimestre, anoLetivo, turmaId: turmaIdFiltro });
  }

  // ── Load prazos + submissao when pautas tab becomes active ─────────────────
  useEffect(() => {
    if (activeTab === 'pautas') {
      fetchPrazos();
      fetchSubmissaoStatus();
      fetchProrrogacoes();
    }
  }, [activeTab, fetchPrazos, fetchSubmissaoStatus, fetchProrrogacoes]);

  // ── Justificações Paga de Faltas ──
  const fetchJustificacoesFalta = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/justificacoes-falta', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) setJustificacoesFaltaList(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (activeTab === 'justificacoes') fetchJustificacoesFalta();
  }, [activeTab, fetchJustificacoesFalta]);

  async function handleAprovarJustificacao(id: string) {
    setJustActioning(id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/justificacoes-falta/${id}/aprovar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        alertSucesso('Aprovado', 'O encarregado pode agora gerar o RUPE para pagar.');
        fetchJustificacoesFalta();
      } else {
        alertErro('Erro', 'Não foi possível aprovar.');
      }
    } catch (_) { alertErro('Erro', 'Falha de ligação.'); }
    finally { setJustActioning(null); }
  }

  async function handleRejeitarJustificacao() {
    if (!justRejeitarId || !justRejeitarMotivo.trim()) return;
    setJustActioning(justRejeitarId);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/justificacoes-falta/${justRejeitarId}/rejeitar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ motivo: justRejeitarMotivo.trim() }),
      });
      if (res.ok) {
        alertSucesso('Rejeitado', 'Pedido marcado como rejeitado.');
        setJustRejeitarId(null);
        setJustRejeitarMotivo('');
        fetchJustificacoesFalta();
      } else {
        alertErro('Erro', 'Não foi possível rejeitar.');
      }
    } catch (_) { alertErro('Erro', 'Falha de ligação.'); }
    finally { setJustActioning(null); }
  }

  async function handleConfirmarPagamentoJustificacao(id: string) {
    setJustActioning(id);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/justificacoes-falta/${id}/confirmar-pagamento`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        alertSucesso('Concluído', 'Faltas marcadas como justificadas.');
        fetchJustificacoesFalta();
      } else {
        alertErro('Erro', 'Não foi possível confirmar pagamento.');
      }
    } catch (_) { alertErro('Erro', 'Falha de ligação.'); }
    finally { setJustActioning(null); }
  }

  async function handleNovaCorrespondencia() {
    if (!novaCorrespAssunto.trim()) return;
    try {
      const token = await getAuthToken();
      const hoje = new Date().toLocaleDateString('pt-PT');
      const res = await fetch('/api/correspondencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          assunto: novaCorrespAssunto.trim(),
          destinatario: novaCorrespDestinatario.trim(),
          tipo: novaCorrespTipo,
          data: hoje,
          urgente: novaCorrespUrgente,
        }),
      });
      if (res.ok) {
        const nova = mapCorrespondenciaFromApi(await res.json());
        setCorrespondencias(prev => [nova, ...prev]);
        setShowNovaCorresp(false);
        setNovaCorrespAssunto('');
        setNovaCorrespDestinatario('');
        setNovaCorrespTipo('saida');
        setNovaCorrespUrgente(false);
        alertSucesso('Registo criado', 'Correspondência registada com sucesso.');
      } else {
        alertErro('Erro', 'Não foi possível registar a correspondência.');
      }
    } catch (_) {
      alertErro('Erro', 'Falha de ligação ao servidor.');
    }
  }

  async function handleDeleteCorrespondencia(id: string) {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/correspondencias/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (res.ok) {
        setCorrespondencias(prev => prev.filter(c => c.id !== id));
      }
    } catch (_) {}
  }

  useEffect(() => {
    fetchDocumentos();
    fetchProcessos();
    fetchCorrespondencias();
  }, [fetchDocumentos, fetchProcessos, fetchCorrespondencias]);

  useFocusEffect(
    useCallback(() => {
      manuallyClosedRef.current = false;
      apiRequest('GET', '/api/solicitacoes-documentos?status=pendente,em_processamento')
        .then(r => r.json())
        .then((data: Solicitacao[]) => {
          const list = Array.isArray(data) ? data : [];
          setSolicitacoesPendentes(list);
          if (list.length > 0 && !manuallyClosedRef.current) {
            setTimeout(() => setShowSolicitacoesModal(true), 600);
          }
        })
        .catch(() => {});
    }, [])
  );

  async function handleEmitir(doc: Omit<Documento, 'id' | 'emitidoEm' | 'emitidoPor'>) {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/documentos-emitidos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          alunoNome: doc.alunoNome,
          alunoNum: doc.alunoNum,
          tipo: doc.tipo,
          finalidade: doc.finalidade ?? '',
          emitidoPor: user?.nome ?? 'Secretaria',
        }),
      });
      if (res.ok) {
        const novo = mapDocumentoFromApi(await res.json());
        setDocumentos(prev => [novo, ...prev]);
        alertSucesso('Documento emitido', `"${doc.tipo}" foi emitido com sucesso para ${doc.alunoNome}.`);
      } else {
        alertErro('Erro', 'Não foi possível registar o documento.');
      }
    } catch (_) {
      alertErro('Erro', 'Falha de ligação ao servidor.');
    }
  }

  async function handleNovoProcesso(p: Omit<Processo, 'id' | 'dataAbertura' | 'status'>) {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/processos-secretaria', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify(p),
      });
      if (res.ok) {
        const novo = mapProcessoFromApi(await res.json());
        setProcessos(prev => [novo, ...prev]);
        alertSucesso('Processo aberto', `O processo de "${p.solicitante}" foi registado com sucesso.`);
      } else {
        alertErro('Erro', 'Não foi possível abrir o processo.');
      }
    } catch (_) {
      alertErro('Erro', 'Falha de ligação ao servidor.');
    }
  }

  async function handleUpdateProcesso(id: string, status: ProcessoStatus) {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/processos-secretaria/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setProcessos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
        const labels: Record<ProcessoStatus, string> = { pendente: 'pendente', em_curso: 'em curso', concluido: 'concluído', cancelado: 'cancelado' };
        alertSucesso('Processo actualizado', `O estado foi alterado para "${labels[status]}".`);
      } else {
        alertErro('Erro', 'Não foi possível actualizar o processo.');
      }
    } catch (_) {
      alertErro('Erro', 'Falha de ligação ao servidor.');
    }
  }

  const QUICK_ACTIONS = [
    { label: 'Consulta\nde Aluno', icon: 'account-search', color: '#0EA5E9', action: () => router.push('/(main)/consulta-aluno' as any), isMCI: true },
    { label: 'Processo de\nAdmissão', icon: 'account-school', color: '#8B5CF6', action: () => router.push('/(main)/admissao' as any), isMCI: true },
    { label: 'Mapas de\nAproveitamento', icon: 'podium', color: '#1a6b3c', action: () => setShowMapaAproveitamento(true) },
    { label: 'Gestão\nde Alunos', icon: 'people', color: Colors.success, action: () => router.push('/(main)/alunos' as any) },
    { label: 'Registo\nde Presenças', icon: 'calendar-outline', color: Colors.gold, action: () => router.push('/(main)/presencas' as any) },
    { label: 'Notas &\nPautas', icon: 'ribbon', color: Colors.accent, action: () => router.push('/(main)/notas' as any) },
    { label: 'Acompanhar\nPautas', icon: 'clipboard', color: '#E11D48', action: () => router.push('/(main)/acompanhamento-pautas' as any) },
    { label: 'Disciplinas', icon: 'book-outline', color: '#EC4899', action: () => router.push('/(main)/disciplinas' as any) },
    { label: 'Desempenho\nAlunos', icon: 'stats-chart', color: '#8B5CF6', action: () => router.push('/(main)/desempenho' as any) },
    { label: 'Gestão\nde Cursos', icon: 'school', color: Colors.info, action: () => setActiveTab('cursos') },
    { label: 'Calendário\nEscolar', icon: 'calendar', color: '#06B6D4', action: () => router.push('/(main)/eventos' as any) },
    { label: 'Relatórios', icon: 'bar-chart', color: Colors.gold, action: () => router.push('/(main)/relatorios' as any) },
    { label: 'Transição\nCondicional', icon: 'alert-circle', color: '#d97706', action: () => router.push('/(main)/relatorio-transicao-condicional' as any) },
    { label: 'Credencial', icon: 'card', color: Colors.textSecondary, action: () => setShowCredenciais(true) },
  ];

  const TABS = [
    { key: 'visao', label: 'Visão Geral', icon: 'grid' },
    { key: 'pautas', label: 'Pautas', icon: 'ribbon' },
    { key: 'cursos', label: 'Cursos', icon: 'school' },
    { key: 'documentos', label: 'Documentos', icon: 'document-text' },
    { key: 'justificacoes', label: 'Justif. Faltas', icon: 'clipboard' },
    { key: 'exame', label: 'Exame Nacional', icon: 'ribbon' },
  ] as const;

  return (
    <View style={styles.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={TOUR_STEPS} storageKey={TOUR_KEY} />
      <TopBar title="Secretaria Académica" subtitle="Painel de Gestão Documental" rightAction={{ icon: 'compass-outline', onPress: openTour }} />

      {/* Tabs */}
      <HScrollTabBar style={styles.tabsRow} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled" stickyCount={1}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key as any)}
          >
            <Ionicons name={t.icon as any} size={14} color={activeTab === t.key ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── VISÃO GERAL ──────────────────────────────────── */}
        {activeTab === 'visao' && (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              <StatCard value={stats.totalAlunos} label="Alunos\nMatriculados" color={Colors.info} icon="people" />
              <StatCard value={stats.totalTurmas} label="Turmas\nActivas" color={Colors.success} icon="school" />
              <StatCard value={stats.docsEmitidos} label="Docs.\nEmitidos" color={Colors.gold} icon="document-text" />
            </View>


            {/* Banner — solicitações de documentos pendentes */}
            {solicitacoesPendentes.length > 0 && (
              <TouchableOpacity
                style={[styles.alertBanner, { backgroundColor: Colors.gold + '18', borderColor: Colors.gold + '40' }]}
                onPress={() => setShowSolicitacoesModal(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="file-document-multiple" size={18} color={Colors.gold} />
                <Text style={[styles.alertText, { color: Colors.gold }]}>
                  {solicitacoesPendentes.length} solicitaç{solicitacoesPendentes.length !== 1 ? 'ões' : 'ão'} de documentos pendente{solicitacoesPendentes.length !== 1 ? 's' : ''} — toque para tratar
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
              </TouchableOpacity>
            )}

            {/* Quick Actions */}
            <View style={styles.card}>
              <SectionHeader title="Ações Rápidas" icon="flash" />
              <View style={styles.actionsGrid}>
                {QUICK_ACTIONS.map((a, i) => (
                  <TouchableOpacity key={i} style={styles.actionCard} onPress={a.action} activeOpacity={0.75}>
                    <View style={[styles.actionIconWrap, { backgroundColor: a.color + '22' }]}>
                      {(a as any).isMCI
                        ? <MaterialCommunityIcons name={a.icon as any} size={22} color={a.color} />
                        : <Ionicons name={a.icon as any} size={22} color={a.color} />
                      }
                    </View>
                    <Text style={styles.actionLabel}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Rematrícula em Lote */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 }}
              onPress={() => { setRematriculaResultado(null); setRematriculaAnoDestino(''); setShowRematricula(true); }}
              activeOpacity={0.8}
            >
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="refresh-circle-outline" size={24} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Rematrícula em Lote</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Renovar matrículas de todos os alunos para o novo ano lectivo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>


            {/* Últimos documentos */}
            <View style={styles.card}>
              <SectionHeader title="Documentos Recentes" icon="document-text" count={documentos.length} onAction={() => setActiveTab('documentos')} />
              {loadingDocumentos ? (
                <Text style={styles.emptyText}>A carregar documentos...</Text>
              ) : documentos.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum documento emitido ainda.</Text>
              ) : (
                documentos.slice(0, 4).map(d => (
                  <View key={d.id} style={styles.docRow}>
                    <View style={[styles.docIconWrap, { backgroundColor: docColor(d.tipo) + '22' }]}>
                      <Ionicons name="document-text" size={16} color={docColor(d.tipo)} />
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={styles.docNome}>{d.alunoNome}</Text>
                      <Text style={styles.docTipo}>{docLabel(d.tipo)}{d.finalidade ? ` — ${d.finalidade}` : ''}</Text>
                    </View>
                    <Text style={styles.docData}>{d.emitidoEm}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Próximos eventos */}
            {proximosEventos.length > 0 && (
              <View style={styles.card}>
                <SectionHeader title="Próximos Eventos" icon="calendar" onAction={() => router.push('/(main)/eventos' as any)} />
                {proximosEventos.map(e => (
                  <View key={e.id} style={styles.eventoRow}>
                    <View style={styles.eventoDateBox}>
                      <Text style={styles.eventoDay}>{e.data.split('-')[2]}</Text>
                      <Text style={styles.eventoMonth}>
                        {new Date(e.data).toLocaleDateString('pt-PT', { month: 'short' }).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.eventoInfo}>
                      <Text style={styles.eventoNome}>{e.nome}</Text>
                      <Text style={styles.eventoTipo}>{e.tipo}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}


        {/* ── DOCUMENTOS ───────────────────────────────────── */}
        {activeTab === 'documentos' && (() => {
          const docsTotalPages = Math.ceil(documentos.length / DOCS_PAGE_SIZE) || 1;
          const pagedDocumentos = documentos.slice(docsPage * DOCS_PAGE_SIZE, (docsPage + 1) * DOCS_PAGE_SIZE);
          return (
          <View style={styles.card}>
            <SectionHeader title="Documentos Emitidos" icon="document-text" count={documentos.length} onAction={() => setShowEmitirModal(true)} actionLabel="+ Emitir" />
            {loadingDocumentos ? (
              <View style={{ paddingTop: 8 }}>
                <SkeletonList rows={4} />
              </View>
            ) : documentos.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum documento emitido ainda.</Text>
            ) : (
              <>
                {pagedDocumentos.map(d => (
                  <View key={d.id} style={styles.docCard}>
                    <View style={[styles.docCardLeft, { borderLeftColor: docColor(d.tipo) }]}>
                      <View style={styles.docCardTopRow}>
                        <View style={[styles.docTypeBadge, { backgroundColor: docColor(d.tipo) + '22' }]}>
                          <Text style={[styles.docTypeText, { color: docColor(d.tipo) }]}>{docLabel(d.tipo)}</Text>
                        </View>
                        <Text style={styles.docData}>{d.emitidoEm}</Text>
                      </View>
                      <Text style={styles.docNome}>{d.alunoNome}</Text>
                      <Text style={styles.docTipo}>
                        N.º {d.alunoNum}
                        {d.finalidade ? ` · ${d.finalidade}` : ''}
                      </Text>
                      <Text style={styles.processoMeta}>Emitido por: {d.emitidoPor}</Text>
                    </View>
                  </View>
                ))}
                {docsTotalPages > 1 && (
                  <View style={styles.docsPagination}>
                    <TouchableOpacity
                      style={[styles.docsPageBtn, docsPage === 0 && styles.docsPageBtnDisabled]}
                      onPress={() => setDocsPage(p => Math.max(0, p - 1))}
                      disabled={docsPage === 0}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-back" size={13} color={docsPage === 0 ? Colors.textMuted : Colors.text} />
                    </TouchableOpacity>
                    {Array.from({ length: docsTotalPages }, (_, i) => {
                      const show = i === 0 || i === docsTotalPages - 1 || Math.abs(i - docsPage) <= 1;
                      if (!show) return null;
                      const ellipsisBefore = i === docsTotalPages - 1 && docsPage < docsTotalPages - 3;
                      const ellipsisAfter  = i === 0 && docsPage > 2;
                      return (
                        <React.Fragment key={i}>
                          {ellipsisAfter  && <Text style={styles.docsPageEllipsis}>…</Text>}
                          <TouchableOpacity
                            style={[styles.docsPageBtn, docsPage === i && styles.docsPageBtnActive]}
                            onPress={() => setDocsPage(i)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.docsPageBtnText, docsPage === i && styles.docsPageBtnTextActive]}>{i + 1}</Text>
                          </TouchableOpacity>
                          {ellipsisBefore && <Text style={styles.docsPageEllipsis}>…</Text>}
                        </React.Fragment>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.docsPageBtn, docsPage === docsTotalPages - 1 && styles.docsPageBtnDisabled]}
                      onPress={() => setDocsPage(p => Math.min(docsTotalPages - 1, p + 1))}
                      disabled={docsPage === docsTotalPages - 1}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-forward" size={13} color={docsPage === docsTotalPages - 1 ? Colors.textMuted : Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.docsPageLabel}>Página {docsPage + 1} de {docsTotalPages}</Text>
                  </View>
                )}
              </>
            )}
          </View>
          );
        })()}

        {/* ── GESTÃO DE CURSOS ─────────────────────────────── */}
        {activeTab === 'cursos' && (() => {
          const NIVEIS_CONFIG = [
            { nivel: 'Ensino Primário', ciclo: 'Ensino Primário', classes: ['1','2','3','4','5','6'], cor: Colors.success, icon: 'school' },
            { nivel: 'I Ciclo', ciclo: 'I Ciclo do Ensino Secundário', classes: ['7','8','9'], cor: Colors.info, icon: 'library' },
            { nivel: 'II Ciclo', ciclo: 'II Ciclo do Ensino Secundário', classes: ['10','11','12','13'], cor: '#8B5CF6', icon: 'ribbon' },
          ];
          const turmasAtivas = turmas.filter(t => t.ativo);
          const alunosAtivos = alunos.filter(a => a.ativo);

          // Mapeamento rigoroso: cada nível inclui APENAS as classes que lhe pertencem
          // Primário: 1-6 | I Ciclo: 7-9 | II Ciclo: 10-13
          const cursosReais = NIVEIS_CONFIG.map(cfg => {
            const classeSet = new Set(cfg.classes.map(String));
            const turmasNivel = turmasAtivas.filter(t => classeSet.has(String(t.classe)));
            const alunosNivel = alunosAtivos.filter(a => turmasNivel.some(t => t.id === a.turmaId));
            const disciplinas = [...new Set(
              turmasNivel.map(t => (t as any).disciplinas || []).flat()
            )];

            let classesPorTurma: Record<string, typeof turmasNivel>;

            if (cfg.nivel === 'II Ciclo') {
              // II Ciclo: agrupa por Curso → Classe
              // ex: "Ciências & Tecnologia → 10ª Classe", "Humanidades → 11ª Classe"
              classesPorTurma = turmasNivel.reduce<Record<string, typeof turmasNivel>>((acc, t) => {
                const cursoNome = (t as any).cursoNome || 'Sem Curso';
                const key = t.classe ? `${cursoNome} — ${t.classe}ª Classe` : cursoNome;
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              }, {});
            } else {
              // Primário e I Ciclo: agrupa apenas por Classe
              classesPorTurma = turmasNivel.reduce<Record<string, typeof turmasNivel>>((acc, t) => {
                const key = t.classe ? `${t.classe}ª Classe` : t.nome;
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              }, {});
            }

            return { ...cfg, turmasNivel, alunosNivel, disciplinas, classesPorTurma };
          });

          const totalAlunos = alunosAtivos.length;
          const totalTurmasCursos = turmasAtivas.length;
          const niveisComTurmas = cursosReais.filter(c => c.turmasNivel.length > 0).length;

          return (
            <>
              {/* Resumo de cursos */}
              <View style={styles.statsRow}>
                <StatCard value={niveisComTurmas} label="Níveis\nActivos" color={Colors.gold} icon="school" />
                <StatCard value={totalTurmasCursos} label="Turmas\nTotal" color={Colors.info} icon="people-circle" />
                <StatCard value={totalAlunos} label="Alunos\nInscritos" color={Colors.success} icon="person" />
                <StatCard value={cursosReais.reduce((s, c) => s + c.disciplinas.length, 0)} label="Disciplinas" color='#8B5CF6' icon="book" />
              </View>

              {cursosReais.map(curso => {
                const isOpen = cursoExpandido === curso.nivel;
                const temTurmas = curso.turmasNivel.length > 0;
                return (
                  <View key={curso.nivel} style={[styles.card, { marginBottom: 10 }]}>
                    {/* Cabeçalho do nível */}
                    <TouchableOpacity
                      style={styles.cursoHeader}
                      onPress={() => setCursoExpandido(isOpen ? null : curso.nivel)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.cursoIconWrap, { backgroundColor: curso.cor + '22' }]}>
                        <Ionicons name={curso.icon as any} size={20} color={curso.cor} />
                      </View>
                      <View style={styles.cursoHeaderInfo}>
                        <Text style={styles.cursoNivel}>{curso.ciclo}</Text>
                        <Text style={styles.cursoSub}>
                          {temTurmas
                            ? `${curso.turmasNivel.length} turma${curso.turmasNivel.length > 1 ? 's' : ''} · ${curso.alunosNivel.length} aluno${curso.alunosNivel.length !== 1 ? 's' : ''}`
                            : 'Sem turmas registadas'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {temTurmas && (
                          <View style={[styles.cursoBadge, { backgroundColor: curso.cor + '22' }]}>
                            <Text style={[styles.cursoBadgeText, { color: curso.cor }]}>{curso.alunosNivel.length}</Text>
                          </View>
                        )}
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>

                    {/* Classes esperadas (quickview) */}
                    {!isOpen && (
                      <View style={styles.classesRow}>
                        {curso.classes.map(cl => {
                          const turmasCl = curso.turmasNivel.filter(t => t.classe === cl);
                          const total = turmasCl.reduce((s, t) => s + alunosAtivos.filter(a => a.turmaId === t.id).length, 0);
                          return (
                            <View key={cl} style={[styles.classeChip, turmasCl.length === 0 && styles.classeChipInactive]}>
                              <Text style={[styles.classeChipText, turmasCl.length === 0 && { color: Colors.textMuted }]}>
                                {cl}ª
                              </Text>
                              {turmasCl.length > 0 && (
                                <Text style={styles.classeChipCount}>{total}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Detalhe expandido */}
                    {isOpen && (
                      <View style={styles.cursoDetalhe}>
                        {!temTurmas ? (
                          <View style={{ padding: 16, alignItems: 'center', gap: 6 }}>
                            <Ionicons name="school-outline" size={36} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>Sem turmas para este nível</Text>
                            <TouchableOpacity
                              style={[styles.procBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '44', paddingHorizontal: 14 }]}
                              onPress={() => router.push('/(main)/turmas' as any)}
                            >
                              <Text style={[styles.procBtnText, { color: Colors.info }]}>Criar Turma</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <>
                            {/* Turmas por classe */}
                            {Object.entries(curso.classesPorTurma).map(([classe, tsList]) => (
                              <View key={classe} style={styles.classeGrupo}>
                                <Text style={styles.classeGrupoTitle}>{classe}</Text>
                                {(tsList as typeof turmasAtivas).map(t => {
                                  const numAlunos = alunosAtivos.filter(a => a.turmaId === t.id).length;
                                  return (
                                    <TouchableOpacity
                                      key={t.id}
                                      style={styles.turmaDetalheRow}
                                      onPress={() => router.push('/(main)/turmas' as any)}
                                      activeOpacity={0.75}
                                    >
                                      <View style={styles.turmaDetalheLeft}>
                                        <View style={[styles.turmaDetalheDot, { backgroundColor: curso.cor }]} />
                                        <View>
                                          <Text style={styles.turmaDetalheNome}>{t.nome}</Text>
                                          <Text style={styles.turmaDetalheSub}>{t.turno} · {numAlunos} aluno{numAlunos !== 1 ? 's' : ''}</Text>
                                        </View>
                                      </View>
                                      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            ))}

                            {/* Disciplinas */}
                            {curso.disciplinas.length > 0 && (
                              <View style={styles.discSection}>
                                <Text style={styles.discSectionTitle}>Disciplinas</Text>
                                <View style={styles.discChipsRow}>
                                  {curso.disciplinas.map(d => (
                                    <View key={d} style={[styles.discChip, { borderColor: curso.cor + '55' }]}>
                                      <Text style={[styles.discChipText, { color: curso.cor }]}>{d}</Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            )}

                            {/* Acções */}
                            <View style={styles.cursoActions}>
                              <TouchableOpacity
                                style={[styles.cursoActionBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '44' }]}
                                onPress={() => router.push('/(main)/alunos' as any)}
                              >
                                <Ionicons name="people" size={14} color={Colors.info} />
                                <Text style={[styles.cursoActionText, { color: Colors.info }]}>Ver Alunos</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.cursoActionBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '44' }]}
                                onPress={() => router.push('/(main)/turmas' as any)}
                              >
                                <Ionicons name="school" size={14} color={Colors.success} />
                                <Text style={[styles.cursoActionText, { color: Colors.success }]}>Gerir Turmas</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.cursoActionBtn, { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '44' }]}
                                onPress={() => router.push('/(main)/notas' as any)}
                              >
                                <Ionicons name="ribbon" size={14} color={Colors.gold} />
                                <Text style={[styles.cursoActionText, { color: Colors.gold }]}>Pautas</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          );
        })()}

        {/* ── PAUTAS ────────────────────────────────────────── */}
        {activeTab === 'pautas' && (() => {
          const pautasFechadas = pautas.filter(p => p.status === 'fechada').length;
          const pautasAbertas = pautas.filter(p => p.status === 'aberta').length;
          const pautasPendentes = pautas.filter(p => p.status === 'pendente_abertura').length;

          function nomeProfessor(professorId: string) {
            const prof = professores.find(p => p.id === professorId);
            return prof ? `${prof.nome} ${prof.apelido}` : '—';
          }

          function nomeTurma(turmaId: string) {
            return turmas.find(t => t.id === turmaId)?.nome || '—';
          }

          function pautaStatusColor(status: string) {
            if (status === 'fechada') return Colors.success;
            if (status === 'aberta') return Colors.info;
            if (status === 'pendente_abertura') return Colors.warning;
            return Colors.textMuted;
          }

          function pautaStatusLabel(status: string) {
            if (status === 'fechada') return 'Submetida';
            if (status === 'aberta') return 'Em Lançamento';
            if (status === 'pendente_abertura') return 'Aguarda Reabertura';
            return status;
          }

          function imprimirPauta(pautaItem: typeof pautas[0]) {
            if (Platform.OS !== 'web') {
              webAlert('Indisponível', 'A impressão está disponível na versão web do sistema.');
              return;
            }
            const turmaObj = turmas.find(t => t.id === pautaItem.turmaId);
            const profNome = nomeProfessor(pautaItem.professorId);
            const turmaNome = turmaObj?.nome || '—';
            const nivelClasse = turmaObj?.classe || '—';
            const nomeEscola = config?.nomeEscola || 'Super Escola';
            const logoUrl = config?.logoUrl || '';
            const anoLetivo = anoSelecionado?.ano || pautaItem.anoLetivo || '20__/20__';
            const { disciplina, trimestre } = pautaItem;
            const alunosBaseImp = alunos.filter(a => a.turmaId === pautaItem.turmaId && a.ativo);
            // Apenas alunos com pelo menos uma nota lançada nesta disciplina (qualquer trimestre)
            const alunosDaTurma = alunosBaseImp.filter(a =>
              notas.some(n => n.alunoId === a.id && n.turmaId === pautaItem.turmaId && n.disciplina === disciplina && ((n.mt1 ?? 0) > 0 || (n.mac ?? n.mac1 ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0))
            );

            const rows = alunosDaTurma.map((aluno, idx) => {
              const get = (tr: number) => {
                const n = notas.find(n => n.alunoId === aluno.id && n.turmaId === pautaItem.turmaId && n.disciplina === disciplina && n.trimestre === tr);
                return n ? { mac: n.mac ?? n.mac1 ?? 0, npp: n.pp1 ?? 0, npt: n.ppt ?? 0, mt: n.mt1 ?? 0 } : null;
              };
              const t1 = get(1); const t2 = get(2); const t3 = get(3);
              const mts = [t1?.mt, t2?.mt, t3?.mt].filter((v): v is number => !!v && v > 0);
              const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : null;
              const aprovado = mfd !== null ? (mfd >= (config?.notaMinimaAprovacao ?? 10) ? 'Aprovado' : 'Reprovado') : '';
              const fmt = (v: number | null | undefined) => v && v > 0 ? v.toFixed(1) : '';
              const bgEven = idx % 2 === 0 ? '#f9f9f0' : '#ffffff';
              return `<tr style="background:${bgEven}">
                <td style="text-align:center;font-size:11px;">${String(idx + 1).padStart(2, '0')}</td>
                <td style="text-align:center;font-size:11px;font-weight:bold;">${(aluno as any).numeroMatricula || '—'}</td>
                <td style="font-size:11px;padding-left:4px;">${aluno.nome} ${aluno.apelido}</td>
                <td class="nc">${fmt(t1?.mac)}</td><td class="nc">${fmt(t1?.npp)}</td><td class="nc">${fmt(t1?.npt)}</td><td class="nc bold">${fmt(t1?.mt)}</td>
                <td class="nc">${fmt(t2?.mac)}</td><td class="nc">${fmt(t2?.npp)}</td><td class="nc">${fmt(t2?.npt)}</td><td class="nc bold">${fmt(t2?.mt)}</td>
                <td class="nc">${fmt(t3?.mac)}</td><td class="nc">${fmt(t3?.npp)}</td><td class="nc">${fmt(t3?.npt)}</td><td class="nc bold">${fmt(t3?.mt)}</td>
                <td class="nc bold" style="color:${mfd !== null && mfd >= (config?.notaMinimaAprovacao ?? 10) ? '#155724' : mfd !== null ? '#721c24' : '#000'};">${mfd !== null ? mfd.toFixed(1) : ''}</td>
                <td style="font-size:10px;text-align:center;">${aprovado}</td>
              </tr>`;
            });

            const dataHoje = new Date().toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' });
            const dataFecho = pautaItem.dataFecho ? new Date(pautaItem.dataFecho).toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

            const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/>
<title>Pauta · ${disciplina} · ${turmaNome}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Times New Roman',serif;background:#fff;color:#000;padding:16px 20px;font-size:12px;}
  .header{text-align:center;margin-bottom:10px;}
  .header img{width:70px;height:70px;object-fit:contain;margin-bottom:4px;}
  .header p{font-size:12px;line-height:1.5;}
  .header .title{font-size:16px;font-weight:bold;margin:4px 0;}
  .header .escola{font-size:13px;font-weight:bold;text-transform:uppercase;margin:2px 0;}
  .meta{display:flex;gap:16px;font-size:11px;font-weight:bold;border-top:2px solid #000;border-bottom:2px solid #000;padding:4px 0;margin-bottom:0;}
  .secretaria-stamp{background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;padding:6px 12px;font-size:10px;color:#1b5e20;margin-bottom:8px;display:flex;align-items:center;gap:8px;}
  table{width:100%;border-collapse:collapse;font-size:10px;}
  th,td{border:1px solid #333;padding:2px 3px;}
  th{background:#c6efce;font-size:9px;font-weight:bold;text-align:center;white-space:nowrap;}
  th.hdr-tri{background:#1a6b3c;color:#fff;font-size:10px;}
  td.nc{text-align:center;font-size:10px;}
  td.bold{font-weight:bold;}
  .footer{margin-top:20px;display:flex;justify-content:space-between;align-items:flex-end;}
  .sig{text-align:center;}
  .sig-line{border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:11px;min-width:200px;}
  @media print{
    body{padding:8px 12px;}
    @page{size:A4 landscape;margin: 0;}
    .no-print{display:none;}
  }
</style>
</head><body>
<div class="header">
  ${logoUrl ? `<img src="${logoUrl}" alt="Logo"/>` : ''}
  <p>REPÚBLICA DE ANGOLA</p>
  <p>MINISTÉRIO DA EDUCAÇÃO</p>
  <p class="title">PAUTA DE AVALIAÇÃO</p>
  <p class="escola">${nomeEscola}</p>
</div>
<div class="secretaria-stamp">
  ✅ Pauta validada e emitida pela Secretaria Académica em ${dataHoje} | Data de fecho pelo professor: ${dataFecho}
</div>
<div class="meta">
  <span>DISCIPLINA: <u>${disciplina}</u></span>
  <span>${nivelClasse}ª CLASSE</span>
  <span>TURMA: <u>${turmaNome}</u></span>
  <span>TRIMESTRE: <u>${trimestre}º</u></span>
  <span>ANO LECTIVO: <u style="color:#c00;">${anoLetivo}</u></span>
  <span>PROFESSOR(A): <u>${profNome}</u></span>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2" style="width:28px;">Nº</th>
      <th rowspan="2" style="width:60px;">Nº ALUNO</th>
      <th rowspan="2" style="min-width:120px;text-align:left;">NOME COMPLETO</th>
      <th colspan="4" class="hdr-tri">1º TRIMESTRE</th>
      <th colspan="4" class="hdr-tri">2º TRIMESTRE</th>
      <th colspan="4" class="hdr-tri">3º TRIMESTRE</th>
      <th rowspan="2" style="width:32px;">MFD</th>
      <th rowspan="2" style="width:60px;">OBSERVAÇÃO</th>
    </tr>
    <tr>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT1</th>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT2</th>
      <th>MAC</th><th>NPP</th><th>NPT</th><th>MT3</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('\n')}
  </tbody>
</table>
<div class="footer">
  <div class="sig">
    <div class="sig-line">O PROFESSOR(A)<br/><strong>${profNome}</strong></div>
  </div>
  <div class="sig">
    <div class="sig-line">O(A) DIRECTOR(A) PEDAGÓGICO(A)<br/><strong>${config?.directorPedagogico || '____________________'}</strong></div>
  </div>
  <div class="sig">
    <div class="sig-line">SECRETARIA ACADÉMICA<br/><strong>${user?.nome || '____________________'}</strong></div>
  </div>
</div>
<div class="no-print" style="text-align:center;margin-top:16px;">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`;

            const win = window.open('', '_blank');
            if (win) { win.document.write(html); win.document.close(); }
          }

          function exportarExcelPauta(pautaItem: typeof pautas[0]) {
            if (Platform.OS !== 'web') {
              webAlert('Indisponível', 'A exportação Excel está disponível na versão web.');
              return;
            }
            const turmaObj = turmas.find(t => t.id === pautaItem.turmaId);
            const turmaNome = turmaObj?.nome || '—';
            const nivelClasse = turmaObj?.classe || '—';
            const profNome = nomeProfessor(pautaItem.professorId);
            const anoLetivo = anoSelecionado?.ano || pautaItem.anoLetivo || '';
            const escola = config?.nomeEscola || 'Super Escola';
            const { disciplina, trimestre } = pautaItem;
            const alunosBaseXls = alunos.filter(a => a.turmaId === pautaItem.turmaId && a.ativo);
            const alunosDaTurma = alunosBaseXls.filter(a =>
              notas.some(n => n.alunoId === a.id && n.turmaId === pautaItem.turmaId && n.disciplina === disciplina && ((n.mt1 ?? 0) > 0 || (n.mac ?? n.mac1 ?? 0) > 0 || (n.pp1 ?? 0) > 0 || (n.ppt ?? 0) > 0))
            );

            const header1 = ['REPÚBLICA DE ANGOLA — MINISTÉRIO DA EDUCAÇÃO'];
            const header2 = [`PAUTA DE AVALIAÇÃO — ${disciplina} — ${nivelClasse}ª Classe — Turma ${turmaNome} — ${trimestre}º Trimestre`];
            const header3 = [`Escola: ${escola}   Ano Lectivo: ${anoLetivo}   Professor(a): ${profNome}   Data: ${new Date().toLocaleDateString('pt-AO')}`];
            const colHeader = ['Nº', 'Nº Aluno', 'Nome Completo', 'MAC T1', 'NPP T1', 'NPT T1', 'MT1', 'MAC T2', 'NPP T2', 'NPT T2', 'MT2', 'MAC T3', 'NPP T3', 'NPT T3', 'MT3', 'MFD', 'Observação'];

            const dataRows = alunosDaTurma.map((aluno, idx) => {
              const get = (tr: number) => {
                const n = notas.find(n => n.alunoId === aluno.id && n.turmaId === pautaItem.turmaId && n.disciplina === disciplina && n.trimestre === tr);
                return n ? { mac: n.mac ?? n.mac1 ?? 0, npp: n.pp1 ?? 0, npt: n.ppt ?? 0, mt: n.mt1 ?? 0 } : null;
              };
              const t1 = get(1); const t2 = get(2); const t3 = get(3);
              const mts = [t1?.mt, t2?.mt, t3?.mt].filter((v): v is number => !!v && v > 0);
              const mfd = mts.length ? Math.round((mts.reduce((a, b) => a + b, 0) / mts.length) * 10) / 10 : '';
              const fmt = (v: number | null | undefined) => v && v > 0 ? v : '';
              const aprovado = typeof mfd === 'number' ? (mfd >= (config?.notaMinimaAprovacao ?? 10) ? 'Aprovado' : 'Reprovado') : '';
              return [
                idx + 1, (aluno as any).numeroMatricula || '—', `${aluno.nome} ${aluno.apelido}`,
                fmt(t1?.mac), fmt(t1?.npp), fmt(t1?.npt), fmt(t1?.mt),
                fmt(t2?.mac), fmt(t2?.npp), fmt(t2?.npt), fmt(t2?.mt),
                fmt(t3?.mac), fmt(t3?.npp), fmt(t3?.npt), fmt(t3?.mt),
                mfd, aprovado,
              ];
            });

            const wb = XLSX.utils.book_new();
            const wsData = [header1, header2, header3, [], colHeader, ...dataRows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!merges'] = [
              { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
              { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
              { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } },
            ];
            ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 30 }, ...Array(14).fill({ wch: 8 })];
            XLSX.utils.book_append_sheet(wb, ws, 'Pauta');
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Pauta_${disciplina}_${turmaNome}_T${trimestre}_${anoLetivo}.xlsx`.replace(/\//g, '-');
            a.click();
            URL.revokeObjectURL(url);
          }

          return (
            <>
              {/* ── ACOMPANHAMENTO DE MINI-PAUTAS (resumo + atalho) ───── */}
              <TouchableOpacity
                style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                activeOpacity={0.85}
                onPress={() => router.push('/(main)/acompanhamento-pautas' as any)}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="clipboard" size={22} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Acompanhamento de Pautas</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                    Cronograma, prazos, prorrogações, relatório Excel e geração da Pauta Final por trimestre.
                  </Text>
                  {(() => {
                    const linhas = ([1,2,3] as const).map(t => {
                      const st = submissaoStatus[t];
                      if (!st || st.total === 0) return null;
                      return `${t}º: ${st.submetidas}/${st.total}`;
                    }).filter(Boolean).join(' · ');
                    const ativasN = prorrogacoes.filter(pp => pp.ativo).length;
                    if (!linhas && !ativasN) return null;
                    return (
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.info, marginTop: 4 }}>
                        {linhas}{ativasN ? `  ·  ${ativasN} prorrogação${ativasN > 1 ? 'ões' : ''} activa${ativasN > 1 ? 's' : ''}` : ''}
                      </Text>
                    );
                  })()}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* ── PAUTAS FINAIS POR TURMA — emissão antecipada turma-a-turma ── */}

              {/* Bloco antigo desactivado — funcionalidade migrada para a página standalone */}
              {false && (
              <View style={styles.card}>
                <SectionHeader title="Acompanhamento de Mini-Pautas" icon="clipboard" />
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 10 }}>
                  Acompanhe o estado de submissão das mini-pautas por trimestre. Só é possível gerar a Pauta Final após todas as mini-pautas estarem submetidas.
                </Text>

                {/* Aviso: onde configurar os prazos */}
                <TouchableOpacity
                  onPress={() => router.push('/(main)/admin?section=prazos-pauta' as any)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '14', borderColor: Colors.info + '44', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}
                >
                  <Ionicons name="information-circle" size={16} color={Colors.info} />
                  <Text style={{ flex: 1, fontSize: 11, color: Colors.text, fontFamily: 'Inter_400Regular' }}>
                    Os prazos de lançamento configuram-se em <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.info }}>Administração → Prazos de Lançamento de Notas</Text>.
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.info} />
                </TouchableOpacity>

                {/* Acções avançadas (não-redundantes) */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.procBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '44' }]}
                    onPress={() => { setShowProrrogacaoModal(true); }}
                  >
                    <Ionicons name="hourglass-outline" size={13} color={Colors.info} />
                    <Text style={[styles.procBtnText, { color: Colors.info }]}>Prorrogar (professor)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.procBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '44' }]}
                    onPress={baixarRelatorioCumprimento}
                  >
                    <Ionicons name="document-text-outline" size={13} color={Colors.success} />
                    <Text style={[styles.procBtnText, { color: Colors.success }]}>Relatório CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.procBtn, { backgroundColor: Colors.accent + '22', borderColor: Colors.accent + '44' }]}
                    onPress={baixarCalendario}
                  >
                    <Ionicons name="calendar-outline" size={13} color={Colors.accent} />
                    <Text style={[styles.procBtnText, { color: Colors.accent }]}>Calendário .ics</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.procBtn, { backgroundColor: Colors.textMuted + '22', borderColor: Colors.border }]}
                    onPress={() => { fetchHistorico(); setShowHistoricoModal(true); }}
                  >
                    <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                    <Text style={[styles.procBtnText, { color: Colors.textSecondary }]}>Histórico</Text>
                  </TouchableOpacity>
                </View>

                {/* Cronograma (timeline) */}
                {(() => {
                  const itens = ([1,2,3] as const)
                    .map(t => ({ t, p: prazos.find(pr => pr.trimestre === t) }))
                    .filter(x => x.p);
                  if (itens.length === 0) return null;
                  return (
                    <View style={{ backgroundColor: Colors.backgroundInput, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, marginBottom: 8 }}>CRONOGRAMA DE PRAZOS</Text>
                      <View style={{ position: 'relative', paddingVertical: 8 }}>
                        <View style={{ position: 'absolute', left: 12, right: 12, top: 17, height: 2, backgroundColor: Colors.border }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          {itens.map(({ t, p }) => {
                            const dl = p ? new Date(p.dataLimite + 'T00:00:00') : null;
                            const expirado = dl ? new Date() > dl : false;
                            const status = submissaoStatus[t];
                            const todas = status?.todasSubmetidas ?? false;
                            const cor = todas ? Colors.success : expirado ? Colors.danger : Colors.gold;
                            return (
                              <View key={t} style={{ alignItems: 'center', flex: 1 }}>
                                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: cor, borderWidth: 2, borderColor: Colors.backgroundCard }} />
                                <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: cor, marginTop: 4 }}>{t}º TRIM.</Text>
                                <Text style={{ fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginTop: 2 }}>
                                  {p ? formatLong(p.dataLimite) : 'Sem prazo'}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* Prorrogações activas */}
                {prorrogacoes.filter(pp => pp.ativo).length > 0 && (
                  <View style={{ backgroundColor: Colors.info + '11', borderRadius: 12, borderWidth: 1, borderColor: Colors.info + '33', padding: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.info, marginBottom: 6 }}>
                      PRORROGAÇÕES ACTIVAS ({prorrogacoes.filter(pp => pp.ativo).length})
                    </Text>
                    {prorrogacoes.filter(pp => pp.ativo).slice(0, 6).map(pp => (
                      <View key={pp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                        <Ionicons name="hourglass" size={12} color={Colors.info} />
                        <Text style={{ flex: 1, fontSize: 10, color: Colors.text, fontFamily: 'Inter_400Regular' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold' }}>{pp.professorNome || 'Prof.'}</Text> — {pp.trimestre}º Trim. → {formatLong(pp.novaDataLimite)}
                          {pp.motivo ? ` · ${pp.motivo}` : ''}
                        </Text>
                        <TouchableOpacity onPress={() => removerProrrogacao(pp.id)}>
                          <Ionicons name="close-circle" size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                {([1, 2, 3] as const).map(t => {
                  const prazo = prazos.find(p => p.trimestre === t);
                  const status = submissaoStatus[t];
                  const submetidas = status?.submetidas ?? 0;
                  const total = status?.total ?? 0;
                  const todasSubmetidas = status?.todasSubmetidas ?? false;
                  const perc = total > 0 ? (submetidas / total) * 100 : 0;
                  const dataLimite = prazo ? new Date(prazo.dataLimite + 'T23:59:59') : null;
                  const expirado = dataLimite ? new Date() > dataLimite : false;
                  const diasRestantes = dataLimite
                    ? Math.ceil((dataLimite.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  const cor = todasSubmetidas ? Colors.success : expirado ? Colors.danger : (diasRestantes !== null && diasRestantes <= 3) ? Colors.warning : Colors.info;

                  return (
                    <View key={t} style={{ backgroundColor: Colors.backgroundInput, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: cor }}>{t}</Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{t}º Trimestre</Text>
                            {prazo ? (
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: expirado ? Colors.danger : Colors.textMuted }}>
                                {expirado
                                  ? `Prazo expirado em ${dataLimite?.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long' })}`
                                  : `Prazo: até ${dataLimite?.toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}${diasRestantes !== null && diasRestantes >= 0 ? ` (${diasRestantes}d)` : ''}`}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Sem prazo definido</Text>
                            )}
                          </View>
                        </View>
                        {prazo ? (
                          <View style={[styles.procBtn, { backgroundColor: cor + '14', borderColor: cor + '44', paddingHorizontal: 10 }]}>
                            <Ionicons name={expirado ? 'time-outline' : 'checkmark-circle-outline'} size={13} color={cor} />
                            <Text style={[styles.procBtnText, { color: cor }]}>
                              {expirado ? 'Expirado' : (diasRestantes !== null && diasRestantes >= 0 ? `${diasRestantes}d restantes` : 'Activo')}
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.procBtn, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '44', paddingHorizontal: 10 }]}
                            onPress={() => router.push('/(main)/admin?section=prazos-pauta' as any)}
                          >
                            <Ionicons name="settings-outline" size={13} color={Colors.warning} />
                            <Text style={[styles.procBtnText, { color: Colors.warning }]}>Configurar</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Barra de progresso */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ width: `${perc}%`, height: '100%', backgroundColor: cor, borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: cor, minWidth: 50, textAlign: 'right' }}>
                          {loadingSubmissao ? '...' : `${submetidas}/${total}`}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                        {todasSubmetidas
                          ? '✅ Todas as mini-pautas submetidas — Pauta Final disponível'
                          : total > 0
                          ? `${total - submetidas} mini-pauta(s) ainda por submeter`
                          : 'Sem pautas registadas para este trimestre'}
                      </Text>

                      {/* Botão Pauta Final */}
                      <TouchableOpacity
                        style={[
                          { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', borderWidth: 1 },
                          todasSubmetidas
                            ? { backgroundColor: Colors.success + '22', borderColor: Colors.success }
                            : { backgroundColor: Colors.textMuted + '11', borderColor: Colors.border }
                        ]}
                        onPress={() => gerarPautaFinalGeral(t)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="document-text" size={15} color={todasSubmetidas ? Colors.success : Colors.textMuted} />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: todasSubmetidas ? Colors.success : Colors.textMuted }}>
                          Gerar Pauta Geral — {t}º Trimestre
                        </Text>
                        {!todasSubmetidas && total > 0 && (
                          <View style={{ backgroundColor: Colors.warning + '33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, color: Colors.warning, fontFamily: 'Inter_600SemiBold' }}>Aguarda {total - submetidas}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Pendentes */}
                      {!todasSubmetidas && (status?.pendentes?.length ?? 0) > 0 && (
                        <View style={{ marginTop: 8, gap: 4 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.warning, marginBottom: 2 }}>Pendentes de submissão:</Text>
                          {status.pendentes.slice(0, 4).map((p: any, i: number) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="time-outline" size={11} color={Colors.warning} />
                              <Text style={{ fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', flex: 1 }}>
                                {p.disciplina} — {p.turmaNome || nomeTurma(p.turmaId)} — Prof. {p.professorNome || nomeProfessor(p.professorId)}
                              </Text>
                            </View>
                          ))}
                          {status.pendentes.length > 4 && (
                            <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>...e mais {status.pendentes.length - 4}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={[styles.procBtn, { alignSelf: 'flex-end', backgroundColor: Colors.info + '11', borderColor: Colors.info + '33' }]}
                  onPress={() => { fetchSubmissaoStatus(); fetchPrazos(); }}
                >
                  <Ionicons name="refresh" size={13} color={Colors.info} />
                  <Text style={[styles.procBtnText, { color: Colors.info }]}>Atualizar</Text>
                </TouchableOpacity>
              </View>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <StatCard value={pautas.length} label="Total\nde Pautas" color={Colors.info} icon="ribbon" />
                <StatCard value={pautasFechadas} label="Pautas\nFechadas" color={Colors.success} icon="checkmark-circle" />
                <StatCard value={pautasAbertas} label="Pautas\nAbertas" color={Colors.gold} icon="create" />
                <StatCard value={pautasPendentes} label="Aguardam\nRea." color={Colors.warning} icon="time" />
              </View>

              {/* Filtros */}
              <View style={styles.card}>
                <SectionHeader title="Filtros" icon="filter" />

                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Ano Letivo</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.procBtn, pautaFiltroAno === '' && { backgroundColor: Colors.accent + '22', borderColor: Colors.accent }]}
                    onPress={() => setPautaFiltroAno('')}
                  >
                    <Text style={[styles.procBtnText, pautaFiltroAno === '' && { color: Colors.accent }]}>Todos</Text>
                  </TouchableOpacity>
                  {pautasAnosDisponiveis.map(ano => (
                    <TouchableOpacity
                      key={ano}
                      style={[styles.procBtn, pautaFiltroAno === ano && { backgroundColor: Colors.accent + '22', borderColor: Colors.accent }]}
                      onPress={() => setPautaFiltroAno(ano)}
                    >
                      <Ionicons name="calendar-outline" size={12} color={pautaFiltroAno === ano ? Colors.accent : Colors.textMuted} />
                      <Text style={[styles.procBtnText, pautaFiltroAno === ano && { color: Colors.accent }]}>{ano}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Estado da Pauta</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {([['todas', 'Todas'], ['fechada', 'Fechadas'], ['aberta', 'Abertas']] as const).map(([v, l]) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.procBtn, pautaFiltroStatus === v && { backgroundColor: Colors.gold + '22', borderColor: Colors.gold }]}
                      onPress={() => setPautaFiltroStatus(v)}
                    >
                      <Text style={[styles.procBtnText, pautaFiltroStatus === v && { color: Colors.gold }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Trimestre</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {([[0, 'Todos'], [1, '1º Trim.'], [2, '2º Trim.'], [3, '3º Trim.']] as [0|1|2|3, string][]).map(([v, l]) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.procBtn, pautaFiltroTrimestre === v && { backgroundColor: Colors.info + '22', borderColor: Colors.info }]}
                      onPress={() => setPautaFiltroTrimestre(v)}
                    >
                      <Text style={[styles.procBtnText, pautaFiltroTrimestre === v && { color: Colors.info }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Pesquisar</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.backgroundInput, borderRadius: 10, borderWidth: 1, borderColor: pautaPesquisa ? Colors.accent : Colors.border, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 }}>
                  <Ionicons name="search" size={16} color={pautaPesquisa ? Colors.accent : Colors.textMuted} />
                  <TextInput
                    value={pautaPesquisa}
                    onChangeText={setPautaPesquisa}
                    placeholder="Professor, turma, disciplina ou classe…"
                    placeholderTextColor={Colors.textMuted}
                    style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, outline: 'none' } as any}
                  />
                  {pautaPesquisa.length > 0 && (
                    <TouchableOpacity onPress={() => setPautaPesquisa('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 8 }}>
                  Escreve parte do nome para filtrar entre as {pautas.length} pautas
                </Text>

                {/* ── Selector de Turma — dropdown moderno ─────────────── */}
                {(() => {
                  const turmaSelNome = pautaFiltroTurma
                    ? turmas.find(t => t.id === pautaFiltroTurma)?.nome ?? 'Turma'
                    : null;

                  const turmasAtivas = turmas
                    .filter(t => t.ativo)
                    .sort((a, b) => {
                      const nA = parseInt(a.nome) || 0;
                      const nB = parseInt(b.nome) || 0;
                      return nA !== nB ? nA - nB : a.nome.localeCompare(b.nome, 'pt');
                    });

                  const q = turmaDropdownSearch.trim().toLowerCase();
                  const turmasFiltradas = q
                    ? turmasAtivas.filter(t => t.nome.toLowerCase().includes(q))
                    : turmasAtivas;

                  // Agrupar por número de classe
                  const grupos: Record<string, typeof turmasAtivas> = {};
                  for (const t of turmasFiltradas) {
                    const chave = t.nome.match(/^(\d+)/)?.[1] ?? '—';
                    if (!grupos[chave]) grupos[chave] = [];
                    grupos[chave].push(t);
                  }

                  return (
                    <View style={{ marginBottom: 8 }}>
                      {/* Trigger button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => { setTurmaDropdownOpen(v => !v); setTurmaDropdownSearch(''); }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          backgroundColor: turmaDropdownOpen ? Colors.card : Colors.cardAlt,
                          borderWidth: 1,
                          borderColor: turmaDropdownOpen ? Colors.accent : (pautaFiltroTurma ? Colors.accent : Colors.border),
                          borderRadius: turmaDropdownOpen ? 12 : 12,
                          borderBottomLeftRadius: turmaDropdownOpen ? 0 : 12,
                          borderBottomRightRadius: turmaDropdownOpen ? 0 : 12,
                          paddingHorizontal: 14, paddingVertical: 11,
                        }}
                      >
                        <Ionicons name="school-outline" size={16} color={pautaFiltroTurma ? Colors.accent : Colors.textMuted} />
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: pautaFiltroTurma ? Colors.accent : Colors.textSecondary }}>
                          {turmaSelNome ?? 'Todas as turmas'}
                        </Text>
                        <View style={{ backgroundColor: pautaFiltroTurma ? Colors.accent + '22' : Colors.textMuted + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: pautaFiltroTurma ? Colors.accent : Colors.textMuted }}>
                            {pautaFiltroTurma
                              ? pautas.filter((p: any) => p.turmaId === pautaFiltroTurma).length
                              : pautas.length}
                          </Text>
                        </View>
                        <Ionicons
                          name={turmaDropdownOpen ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={Colors.textMuted}
                        />
                      </TouchableOpacity>

                      {/* Painel inline — sem position:absolute para evitar clipping do ScrollView */}
                      {turmaDropdownOpen && (
                        <View style={{
                          backgroundColor: Colors.card,
                          borderWidth: 1, borderTopWidth: 0, borderColor: Colors.accent,
                          borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                        }}>
                          {/* Search */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                            <Ionicons name="search-outline" size={15} color={Colors.textMuted} />
                            <TextInput
                              value={turmaDropdownSearch}
                              onChangeText={setTurmaDropdownSearch}
                              placeholder="Pesquisar turma…"
                              placeholderTextColor={Colors.textMuted}
                              style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, outlineStyle: 'none' } as any}
                              autoFocus
                            />
                            {turmaDropdownSearch !== '' && (
                              <TouchableOpacity onPress={() => setTurmaDropdownSearch('')}>
                                <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* Opção "Todas" */}
                          <TouchableOpacity
                            onPress={() => { setPautaFiltroTurma(''); setTurmaDropdownOpen(false); }}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 10,
                              paddingHorizontal: 14, paddingVertical: 11,
                              backgroundColor: pautaFiltroTurma === '' ? Colors.accent + '18' : 'transparent',
                              borderBottomWidth: 1, borderBottomColor: Colors.border,
                            }}
                          >
                            {pautaFiltroTurma === ''
                              ? <Ionicons name="checkmark-circle" size={15} color={Colors.accent} />
                              : <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border }} />
                            }
                            <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: pautaFiltroTurma === '' ? Colors.accent : Colors.text }}>
                              Todas as turmas
                            </Text>
                            <View style={{ backgroundColor: Colors.textMuted + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted }}>{pautas.length}</Text>
                            </View>
                          </TouchableOpacity>

                          {/* Grupos por classe */}
                          {Object.entries(grupos).map(([classe, lista], gi) => (
                            <View key={classe} style={{ paddingHorizontal: 12, paddingTop: gi === 0 ? 10 : 4, paddingBottom: 10, borderBottomWidth: gi < Object.keys(grupos).length - 1 ? 1 : 0, borderBottomColor: Colors.border + '55' }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>
                                {classe === '—' ? 'Outras' : `${classe}ª Classe`}
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {lista.map(t => {
                                  const pautasDaTurma = pautas.filter((p: any) => p.turmaId === t.id);
                                  const pendentes = pautasDaTurma.filter((p: any) => p.status !== 'fechada').length;
                                  const total = pautasDaTurma.length;
                                  const ativo = pautaFiltroTurma === t.id;
                                  const badgeCor = pendentes > 0 ? Colors.warning : Colors.success;
                                  return (
                                    <TouchableOpacity
                                      key={t.id}
                                      onPress={() => { setPautaFiltroTurma(t.id); setTurmaDropdownOpen(false); setTurmaDropdownSearch(''); }}
                                      style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 5,
                                        paddingHorizontal: 10, paddingVertical: 6,
                                        borderRadius: 8, borderWidth: 1.5,
                                        borderColor: ativo ? Colors.accent : Colors.border,
                                        backgroundColor: ativo ? Colors.accent + '18' : Colors.cardAlt,
                                      }}
                                    >
                                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: ativo ? Colors.accent : Colors.text }}>
                                        {t.nome}
                                      </Text>
                                      {total > 0 && (
                                        <View style={{ backgroundColor: ativo ? Colors.accent + '33' : badgeCor + '2A', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: ativo ? Colors.accent : badgeCor }}>
                                            {pendentes > 0 ? pendentes : '✓'}
                                          </Text>
                                        </View>
                                      )}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          ))}
                          {Object.keys(grupos).length === 0 && (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                              <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>Nenhuma turma encontrada</Text>
                            </View>
                          )}

                          {/* Footer: fechar / limpar */}
                          <TouchableOpacity
                            onPress={() => { setPautaFiltroTurma(''); setTurmaDropdownOpen(false); }}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.cardAlt, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
                          >
                            <Ionicons name={pautaFiltroTurma ? 'close-circle-outline' : 'chevron-up-outline'} size={14} color={pautaFiltroTurma ? Colors.warning : Colors.textMuted} />
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: pautaFiltroTurma ? Colors.warning : Colors.textMuted }}>
                              {pautaFiltroTurma ? 'Limpar filtro de turma' : 'Fechar'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>

              {/* Lista de mini-pautas */}
              <View style={styles.card}>
                <SectionHeader title={`Mini-Pautas por Disciplina (${pautasFiltradas.length})`} icon="document-text" />

                {pautasFiltradas.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                    <Ionicons name="ribbon-outline" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>Nenhuma pauta encontrada com os filtros seleccionados.</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center' }}>
                      As pautas aparecem aqui quando os professores submetem as notas na área deles.
                    </Text>
                  </View>
                ) : (
                  pautasFiltradas.slice((pautasPagina - 1) * PAUTAS_POR_PAGINA, pautasPagina * PAUTAS_POR_PAGINA).map(p => {
                    const turmaObj = turmas.find(t => t.id === p.turmaId);
                    const profNome = nomeProfessor(p.professorId);
                    const statusColor = pautaStatusColor(p.status);
                    const statusLbl = pautaStatusLabel(p.status);
                    const numAlunos = alunos.filter(a => a.turmaId === p.turmaId && a.ativo).length;
                    const dataFecho = p.dataFecho ? new Date(p.dataFecho).toLocaleDateString('pt-PT') : null;

                    return (
                      <View key={p.id} style={[styles.processoCard, { borderLeftWidth: 3, borderLeftColor: statusColor }]}>
                        <View style={styles.processoCardTop}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.processoTopRow}>
                              <Text style={[styles.processoTipo, { fontSize: 13 }]}>{p.disciplina}</Text>
                              <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                                <Text style={[styles.statusText, { color: statusColor }]}>{statusLbl}</Text>
                              </View>
                            </View>
                            <Text style={styles.processoMeta}>
                              {turmaObj?.nome || '—'} · {p.trimestre}º Trimestre · {p.anoLetivo}
                            </Text>
                            <Text style={styles.processoMeta}>
                              Prof. {profNome} · {numAlunos} aluno{numAlunos !== 1 ? 's' : ''}
                              {dataFecho ? ` · Fechada em ${dataFecho}` : ''}
                            </Text>
                          </View>
                        </View>

                        {p.status === 'fechada' && (
                          <View style={styles.processoActions}>
                            <TouchableOpacity
                              style={[styles.procBtn, { backgroundColor: Colors.success + '22', borderColor: Colors.success + '44', flex: 1 }]}
                              onPress={() => imprimirPauta(p)}
                            >
                              <Ionicons name="print" size={13} color={Colors.success} />
                              <Text style={[styles.procBtnText, { color: Colors.success }]}>Imprimir Mini-Pauta</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.procBtn, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '44', flex: 1 }]}
                              onPress={() => exportarExcelPauta(p)}
                            >
                              <Ionicons name="download" size={13} color={Colors.info} />
                              <Text style={[styles.procBtnText, { color: Colors.info }]}>Exportar Excel</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {p.status === 'aberta' && (
                          <View style={{ flexDirection: 'row', gap: 6, backgroundColor: Colors.info + '11', padding: 8, borderRadius: 8, marginTop: 6, alignItems: 'center' }}>
                            <Ionicons name="time-outline" size={13} color={Colors.info} />
                            <Text style={{ fontSize: 10, color: Colors.info, fontFamily: 'Inter_400Regular', flex: 1 }}>
                              Pauta em lançamento — aguarda o fecho pelo professor para poder imprimir.
                            </Text>
                          </View>
                        )}

                        {p.status === 'pendente_abertura' && (
                          <View style={[{ flexDirection: 'row', gap: 6, backgroundColor: Colors.warning + '11', padding: 8, borderRadius: 8, marginTop: 6, alignItems: 'center' }]}>
                            <Ionicons name="alert-circle-outline" size={13} color={Colors.warning} />
                            <Text style={{ fontSize: 10, color: Colors.warning, fontFamily: 'Inter_400Regular', flex: 1 }}>
                              Professor solicitou reabertura da pauta — aguarda aprovação da direcção.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}

                {/* ── Barra de paginação ─────────────────────────────────── */}
                {pautasFiltradas.length > PAUTAS_POR_PAGINA && (() => {
                  const totalPaginas = Math.ceil(pautasFiltradas.length / PAUTAS_POR_PAGINA);
                  const inicio = (pautasPagina - 1) * PAUTAS_POR_PAGINA + 1;
                  const fim = Math.min(pautasPagina * PAUTAS_POR_PAGINA, pautasFiltradas.length);

                  // Calcular janela de páginas a mostrar (máx 5 botões)
                  let pageStart = Math.max(1, pautasPagina - 2);
                  let pageEnd = Math.min(totalPaginas, pageStart + 4);
                  if (pageEnd - pageStart < 4) pageStart = Math.max(1, pageEnd - 4);
                  const paginas = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);

                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border, flexWrap: 'wrap', gap: 8 }}>
                      {/* Info */}
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                        {inicio}–{fim} de {pautasFiltradas.length} pautas
                      </Text>

                      {/* Navegação */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {/* Primeira */}
                        <TouchableOpacity
                          disabled={pautasPagina === 1}
                          onPress={() => setPautasPagina(1)}
                          style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, opacity: pautasPagina === 1 ? 0.35 : 1 }}
                        >
                          <Ionicons name="play-skip-back" size={12} color={Colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Anterior */}
                        <TouchableOpacity
                          disabled={pautasPagina === 1}
                          onPress={() => setPautasPagina(p => Math.max(1, p - 1))}
                          style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, opacity: pautasPagina === 1 ? 0.35 : 1 }}
                        >
                          <Ionicons name="chevron-back" size={14} color={Colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Elipse inicial */}
                        {pageStart > 1 && (
                          <Text style={{ fontSize: 12, color: Colors.textMuted, paddingHorizontal: 2 }}>…</Text>
                        )}

                        {/* Botões de página */}
                        {paginas.map(pg => (
                          <TouchableOpacity
                            key={pg}
                            onPress={() => setPautasPagina(pg)}
                            style={{
                              width: 30, height: 30, borderRadius: 8, borderWidth: 1,
                              borderColor: pg === pautasPagina ? Colors.accent : Colors.border,
                              backgroundColor: pg === pautasPagina ? Colors.accent : Colors.cardAlt,
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: pg === pautasPagina ? '#fff' : Colors.textSecondary }}>
                              {pg}
                            </Text>
                          </TouchableOpacity>
                        ))}

                        {/* Elipse final */}
                        {pageEnd < totalPaginas && (
                          <Text style={{ fontSize: 12, color: Colors.textMuted, paddingHorizontal: 2 }}>…</Text>
                        )}

                        {/* Próxima */}
                        <TouchableOpacity
                          disabled={pautasPagina === totalPaginas}
                          onPress={() => setPautasPagina(p => Math.min(totalPaginas, p + 1))}
                          style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, opacity: pautasPagina === totalPaginas ? 0.35 : 1 }}
                        >
                          <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                        </TouchableOpacity>

                        {/* Última */}
                        <TouchableOpacity
                          disabled={pautasPagina === totalPaginas}
                          onPress={() => setPautasPagina(totalPaginas)}
                          style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardAlt, opacity: pautasPagina === totalPaginas ? 0.35 : 1 }}
                        >
                          <Ionicons name="play-skip-forward" size={12} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}
              </View>
            </>
          );
        })()}

        {activeTab === 'justificacoes' && (() => {
          const lista = justFiltro === 'pendente'
            ? justificacoesFaltaList.filter(j => j.status === 'pendente')
            : justificacoesFaltaList;
          const totalPendente = justificacoesFaltaList.filter(j => j.status === 'pendente').length;
          const totalAguardaPag = justificacoesFaltaList.filter(j => j.status === 'aguarda_pagamento').length;
          const statusLabel: Record<string, string> = {
            pendente: 'Pendente',
            aprovada: 'Aprovada',
            aguarda_pagamento: 'Aguarda Pagamento',
            paga: 'Paga',
            concluida: 'Concluída',
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
          return (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: Colors.warning + '15', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.warning }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Pendentes</Text>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{totalPendente}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: Colors.gold + '15', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.gold }}>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>Aguardam Pagamento</Text>
                  <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold }}>{totalAguardaPag}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                {(['pendente', 'todas'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setJustFiltro(f)}
                    style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: justFiltro === f ? Colors.primary : Colors.backgroundCard, borderWidth: 1, borderColor: justFiltro === f ? Colors.primary : Colors.border }}
                  >
                    <Text style={{ fontSize: 12, color: justFiltro === f ? '#fff' : Colors.text, fontFamily: 'Inter_600SemiBold' }}>{f === 'pendente' ? 'Pendentes' : 'Todas'}</Text>
                  </TouchableOpacity>
                ))}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={fetchJustificacoesFalta} style={{ padding: 6 }}>
                  <Ionicons name="refresh" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              {lista.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={Colors.textMuted} />
                  <Text style={{ marginTop: 8, color: Colors.textMuted, fontSize: 13 }}>Sem pedidos {justFiltro === 'pendente' ? 'pendentes' : ''}.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {lista.map(j => {
                    const cor = statusCor[String(j.status)] || Colors.textMuted;
                    return (
                      <View key={j.id} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: cor, padding: 12, gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{j.alunoNome || j.solicitadoPor || 'Aluno'}</Text>
                            <Text style={{ fontSize: 11, color: Colors.textMuted }}>{j.qtdFaltas} falta(s) · {Number(j.valorTotal || 0).toLocaleString('pt-AO')} Kz · {new Date(j.createdAt).toLocaleString('pt-PT')}</Text>
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: cor + '18', borderWidth: 1, borderColor: cor + '55' }}>
                            <Text style={{ fontSize: 10, color: cor, fontFamily: 'Inter_600SemiBold' }}>{statusLabel[String(j.status)] || j.status}</Text>
                          </View>
                        </View>

                        {j.justificativa ? (
                          <View style={{ backgroundColor: Colors.background, padding: 8, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 2 }}>Justificação</Text>
                            <Text style={{ fontSize: 12, color: Colors.text }}>{j.justificativa}</Text>
                          </View>
                        ) : null}

                        {j.motivoRejeicao ? (
                          <Text style={{ fontSize: 11, color: Colors.danger }}>Rejeitado: {j.motivoRejeicao}</Text>
                        ) : null}

                        {j.comprovativoUrl ? (
                          <TouchableOpacity onPress={() => setJustComprovativoUrl(j.comprovativoUrl)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="image-outline" size={14} color={Colors.primary} />
                            <Text style={{ fontSize: 12, color: Colors.primary, fontFamily: 'Inter_600SemiBold' }}>Ver comprovativo ({j.comprovativoNome || 'ficheiro'})</Text>
                          </TouchableOpacity>
                        ) : null}

                        {j.status === 'pendente' && (
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                            <TouchableOpacity
                              onPress={() => handleAprovarJustificacao(j.id)}
                              disabled={justActioning === j.id}
                              style={{ flex: 1, backgroundColor: Colors.success, padding: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, opacity: justActioning === j.id ? 0.5 : 1 }}
                            >
                              <Ionicons name="checkmark" size={14} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Aprovar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => { setJustRejeitarId(j.id); setJustRejeitarMotivo(''); }}
                              disabled={justActioning === j.id}
                              style={{ flex: 1, backgroundColor: Colors.danger, padding: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, opacity: justActioning === j.id ? 0.5 : 1 }}
                            >
                              <Ionicons name="close" size={14} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Rejeitar</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {j.status === 'aguarda_pagamento' && (
                          <TouchableOpacity
                            onPress={() => handleConfirmarPagamentoJustificacao(j.id)}
                            disabled={justActioning === j.id}
                            style={{ backgroundColor: Colors.gold, padding: 8, borderRadius: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, opacity: justActioning === j.id ? 0.5 : 1 }}
                          >
                            <Ionicons name="cash" size={14} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Confirmar Pagamento e Justificar Faltas</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })()}

        {/* ── EXAME NACIONAL ─────────────────────────────────── */}
        {activeTab === 'exame' && <ExameNacionalTab />}

        {/* Modal: Rejeitar justificação */}
        <Modal visible={!!justRejeitarId} transparent animationType="fade" onRequestClose={() => setJustRejeitarId(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Rejeitar Pedido</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>Indique o motivo (será visível ao aluno):</Text>
              <TextInput
                value={justRejeitarMotivo}
                onChangeText={setJustRejeitarMotivo}
                placeholder="Motivo da rejeição..."
                placeholderTextColor={Colors.textMuted}
                multiline
                style={{ minHeight: 80, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, color: Colors.text, textAlignVertical: 'top' }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setJustRejeitarId(null)} style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
                  <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRejeitarJustificacao} disabled={!justRejeitarMotivo.trim()} style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: Colors.danger, alignItems: 'center', opacity: !justRejeitarMotivo.trim() ? 0.5 : 1 }}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Rejeitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* Modal: Ver comprovativo */}
        <Modal visible={!!justComprovativoUrl} transparent animationType="fade" onRequestClose={() => setJustComprovativoUrl(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <TouchableOpacity onPress={() => setJustComprovativoUrl(null)} style={{ position: 'absolute', top: 30, right: 20, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            {justComprovativoUrl && justComprovativoUrl.startsWith('data:image') ? (
              <Image source={{ uri: justComprovativoUrl }} style={{ width: '100%', height: '85%', resizeMode: 'contain' }} />
            ) : justComprovativoUrl ? (
              <View style={{ backgroundColor: Colors.backgroundCard, padding: 24, borderRadius: 12 }}>
                <Text style={{ color: Colors.text, marginBottom: 12 }}>Ficheiro PDF anexado</Text>
                <TouchableOpacity
                  onPress={() => { if (typeof window !== 'undefined') window.open(justComprovativoUrl, '_blank'); }}
                  style={{ backgroundColor: Colors.primary, padding: 10, borderRadius: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Abrir em nova janela</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* ── MODAL HISTÓRICO ───────────────────────────────────────────── */}
        <Modal visible={showHistoricoModal} animationType="slide" transparent onRequestClose={() => setShowHistoricoModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, paddingBottom: 24, maxHeight: '85%' }}>
              {/* Cabeçalho com badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time-outline" size={20} color={Colors.info} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Histórico de Alterações</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Auditoria completa de prazos de mini-pauta</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setShowHistoricoModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.backgroundInput, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
                {loadingHistorico ? (
                  <AppLoader color={Colors.info} style={{ paddingVertical: 30 }} />
                ) : historicoPrazos.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                    <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
                    <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 }}>Sem registos no histórico.</Text>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
                    {historicoPrazos.map(h => {
                      const cor = h.acao === 'eliminado' ? Colors.danger : h.acao === 'prorrogado' ? Colors.info : h.acao === 'criado' ? Colors.success : Colors.gold;
                      const icone = h.acao === 'eliminado' ? 'trash-outline' : h.acao === 'prorrogado' ? 'hourglass-outline' : h.acao === 'criado' ? 'add-circle-outline' : 'create-outline';
                      return (
                        <View key={h.id} style={{ flexDirection: 'row', gap: 10, padding: 12, marginBottom: 8, backgroundColor: Colors.backgroundInput, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: cor }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={icone as any} size={16} color={cor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                                {h.trimestre}º Trimestre · <Text style={{ color: cor, textTransform: 'capitalize' }}>{h.acao}</Text>
                              </Text>
                              <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                                {new Date(h.alteradoEm).toLocaleString('pt-AO')}
                              </Text>
                            </View>
                            {(h.dataLimiteAntiga || h.dataLimiteNova) && (
                              <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                                {h.dataLimiteAntiga ? formatLong(h.dataLimiteAntiga) : '—'}  →  <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{h.dataLimiteNova ? formatLong(h.dataLimiteNova) : '—'}</Text>
                              </Text>
                            )}
                            {!!h.motivo && <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 3, fontStyle: 'italic' }}>"{h.motivo}"</Text>}
                            {!!h.alteradoPor && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <Ionicons name="person-circle-outline" size={11} color={Colors.textMuted} />
                                <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>{h.alteradoPor}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* ── MODAL PRORROGAÇÃO ─────────────────────────────────────────── */}
        <Modal visible={showProrrogacaoModal} animationType="slide" transparent onRequestClose={() => setShowProrrogacaoModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, paddingBottom: 24, maxHeight: '90%' }}>
              {/* Cabeçalho com badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="hourglass-outline" size={20} color={Colors.info} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Prorrogação Individual</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Conceder prazo extra a um professor</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setShowProrrogacaoModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.backgroundInput, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ paddingHorizontal: 18 }} showsVerticalScrollIndicator={false}>
                {/* Aviso */}
                <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: Colors.info + '11', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: Colors.info, marginTop: 14, marginBottom: 16 }}>
                  <Ionicons name="information-circle" size={16} color={Colors.info} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 }}>
                    A prorrogação substitui o prazo geral apenas para o professor seleccionado. Toda a operação fica registada no histórico.
                  </Text>
                </View>

                {/* Trimestre */}
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Trimestre<RequiredMark /></Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                  {([1,2,3] as const).map(t => {
                    const sel = prorrogacaoTrimestre === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: sel ? Colors.info + '22' : Colors.backgroundInput, borderWidth: 1.5, borderColor: sel ? Colors.info : Colors.border }}
                        onPress={() => setProrrogacaoTrimestre(t)}
                      >
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: sel ? Colors.info : Colors.text }}>{t}º Trim.</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Professor (pesquisável) */}
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Professor<RequiredMark /></Text>
                <View style={{ position: 'relative', marginBottom: 8 }}>
                  <StableSearchInput
                    value={prorrogacaoSearch}
                    onChangeText={setProrrogacaoSearch}
                    inputStyle={{ backgroundColor: Colors.backgroundInput, borderRadius: 10, paddingVertical: 11, paddingLeft: 32, paddingRight: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border, fontFamily: 'Inter_400Regular', fontSize: 13 }}
                    placeholder="Pesquisar professor..."
                    iconColor={Colors.textMuted}
                  />
                </View>
                <View style={{ maxHeight: 160, marginBottom: 18, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, overflow: 'hidden' }}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {professores
                      .filter((p: any) => p.ativo !== false)
                      .filter((p: any) => {
                        const q = (prorrogacaoSearch || '').trim().toLowerCase();
                        if (!q) return true;
                        return `${p.nome || ''} ${p.apelido || ''}`.toLowerCase().includes(q);
                      })
                      .map((p: any) => {
                        const sel = prorrogacaoProfessorId === p.id;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => setProrrogacaoProfessorId(p.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: sel ? Colors.info + '18' : 'transparent', borderBottomWidth: 1, borderBottomColor: Colors.border }}
                          >
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="person" size={12} color={Colors.info} />
                            </View>
                            <Text style={{ flex: 1, color: Colors.text, fontFamily: sel ? 'Inter_700Bold' : 'Inter_400Regular', fontSize: 13 }}>
                              {p.nome} {p.apelido || ''}
                            </Text>
                            {sel && <Ionicons name="checkmark-circle" size={16} color={Colors.info} />}
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                </View>

                {/* Data */}
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Nova Data Limite<RequiredMark /></Text>
                <DateInput
                  style={{ backgroundColor: Colors.backgroundInput, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 18, fontFamily: 'Inter_400Regular', fontSize: 14 }}
                  placeholder="DD-MM-AAAA"
                  placeholderTextColor={Colors.textMuted}
                  value={prorrogacaoNovaData}
                  onChangeText={setProrrogacaoNovaData}
                />

                {/* Motivo */}
                <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>Motivo</Text>
                <TextInput
                  style={{ backgroundColor: Colors.backgroundInput, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 18, fontFamily: 'Inter_400Regular', minHeight: 70, textAlignVertical: 'top' }}
                  placeholder="Ex: doença comprovada, deslocação em serviço…"
                  placeholderTextColor={Colors.textMuted}
                  value={prorrogacaoMotivo}
                  onChangeText={setProrrogacaoMotivo}
                  multiline
                />
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.backgroundInput, borderWidth: 1, borderColor: Colors.border }}
                  onPress={() => setShowProrrogacaoModal(false)}
                >
                  <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.info, opacity: savingProrrogacao ? 0.6 : 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  onPress={salvarProrrogacao}
                  disabled={savingProrrogacao}
                >
                  {savingProrrogacao
                    ? <AppLoader size="small" color="#fff" />
                    : <Ionicons name="checkmark-circle" size={16} color="#fff" />}
                  <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>
                    {savingProrrogacao ? 'A guardar...' : 'Conceder Prorrogação'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* ── MODAL NOVA CORRESPONDÊNCIA ────────────────────── */}
        <Modal visible={showNovaCorresp} animationType="slide" transparent onRequestClose={() => setShowNovaCorresp(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 20, paddingBottom: 34 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Nova Correspondência</Text>
                <TouchableOpacity onPress={() => setShowNovaCorresp(false)}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Assunto<RequiredMark /></Text>
              <TextInput
                style={{ backgroundColor: Colors.backgroundInput, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, fontFamily: 'Inter_400Regular' }}
                placeholder="Ex: Convocatória — Reunião Pedagógica"
                placeholderTextColor={Colors.textSecondary}
                value={novaCorrespAssunto}
                onChangeText={setNovaCorrespAssunto}
              />
              <Text style={{ color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Destinatário / Remetente</Text>
              <TextInput
                style={{ backgroundColor: Colors.backgroundInput, borderRadius: 10, padding: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, fontFamily: 'Inter_400Regular' }}
                placeholder="Ex: Corpo Docente"
                placeholderTextColor={Colors.textSecondary}
                value={novaCorrespDestinatario}
                onChangeText={setNovaCorrespDestinatario}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {(['saida', 'entrada'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setNovaCorrespTipo(t)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: novaCorrespTipo === t ? Colors.gold : Colors.backgroundInput, borderWidth: 1, borderColor: novaCorrespTipo === t ? Colors.gold : Colors.border }}
                  >
                    <Text style={{ color: novaCorrespTipo === t ? '#000' : Colors.textSecondary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                      {t === 'saida' ? '↑ Saída' : '↓ Entrada'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setNovaCorrespUrgente(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: novaCorrespUrgente ? Colors.danger : Colors.border, backgroundColor: novaCorrespUrgente ? Colors.danger : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {novaCorrespUrgente && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={{ color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 }}>Marcar como urgente</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNovaCorrespondencia}
                style={{ backgroundColor: Colors.gold, borderRadius: 12, padding: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#000', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Registar</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

      </ScrollView>


      <EmitirDocumentoModal
        visible={showEmitirModal}
        onClose={() => setShowEmitirModal(false)}
        onEmit={handleEmitir}
        alunos={alunos}
      />
      <EmissaoRapidaModal
        visible={showEmissaoRapida}
        onClose={() => setShowEmissaoRapida(false)}
        alunos={alunos}
        turmas={turmas}
        notas={notas}
        config={config}
        anoAtual={anoSelecionado?.ano || String(new Date().getFullYear())}
        user={user}
      />
      <MapaAproveitamentoModal
        visible={showMapaAproveitamento}
        onClose={() => setShowMapaAproveitamento(false)}
        alunos={alunos}
        turmas={turmas}
        notas={notas}
        config={config}
        anoAtual={anoSelecionado?.ano || String(new Date().getFullYear())}
        user={user}
      />
      <NovoProcessoModal
        visible={showProcessoModal}
        onClose={() => setShowProcessoModal(false)}
        onSave={handleNovoProcesso}
      />
      <CredenciaisModal visible={showCredenciais} onClose={() => setShowCredenciais(false)} />

      {/* Modal de Rematrícula em Lote */}
      <Modal visible={showRematricula} animationType="slide" transparent onRequestClose={() => setShowRematricula(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 20, paddingBottom: 34, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="refresh-circle-outline" size={22} color={Colors.success} />
                </View>
                <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Rematrícula em Lote</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRematricula(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {rematriculaResultado ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark-circle" size={36} color={Colors.success} />
                  </View>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text }}>Processo Concluído</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Ano Lectivo Destino: {rematriculaAnoDestino}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <View style={{ flex: 1, backgroundColor: Colors.success + '15', borderRadius: 12, borderWidth: 1, borderColor: Colors.success + '40', padding: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.success }}>{rematriculaResultado.processados}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.success, textAlign: 'center' }}>Rematriculados</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: Colors.warning + '15', borderRadius: 12, borderWidth: 1, borderColor: Colors.warning + '40', padding: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{rematriculaResultado.bloqueados}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.warning, textAlign: 'center' }}>Bloqueados</Text>
                  </View>
                  {rematriculaResultado.erros > 0 && (
                    <View style={{ flex: 1, backgroundColor: Colors.danger + '15', borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + '40', padding: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{rematriculaResultado.erros}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.danger, textAlign: 'center' }}>Erros</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setShowRematricula(false)}
                  style={{ backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' }}>Concluir</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ backgroundColor: Colors.info + '12', borderRadius: 12, borderWidth: 1, borderColor: Colors.info + '30', padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 }}>
                    Este processo renova as matrículas de todos os alunos activos para o novo ano lectivo, criando automaticamente registos de reconfirmação.
                  </Text>
                </View>

                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>Ano Lectivo de Destino<RequiredMark /></Text>
                <TextInput
                  style={{ backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 16 }}
                  value={rematriculaAnoDestino}
                  onChangeText={setRematriculaAnoDestino}
                  placeholder="Ex: 2025/2026"
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>Regras de Bloqueio Automático</Text>
                <TouchableOpacity
                  onPress={() => setRematriculaBloquearPendencia(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: rematriculaBloquearPendencia ? Colors.warning + '60' : Colors.border, padding: 14, marginBottom: 8 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: rematriculaBloquearPendencia ? Colors.warning : Colors.surface, borderWidth: 1.5, borderColor: rematriculaBloquearPendencia ? Colors.warning : Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    {rematriculaBloquearPendencia && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Bloquear alunos com pendência financeira</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Propinas ou taxas em atraso</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRematriculaBloquearReprovados(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: rematriculaBloquearReprovados ? Colors.danger + '60' : Colors.border, padding: 14, marginBottom: 20 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: rematriculaBloquearReprovados ? Colors.danger : Colors.surface, borderWidth: 1.5, borderColor: rematriculaBloquearReprovados ? Colors.danger : Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    {rematriculaBloquearReprovados && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Bloquear alunos reprovados</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Média final inferior a 10 no 3º trimestre</Text>
                  </View>
                </TouchableOpacity>

                <View style={{ backgroundColor: Colors.warning + '12', borderRadius: 12, borderWidth: 1, borderColor: Colors.warning + '40', padding: 12, marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.warning, marginBottom: 4 }}>Importante</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, lineHeight: 18 }}>
                    Os alunos bloqueados não serão rematriculados automaticamente. A secretaria poderá levantá-los manualmente após regularização.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    if (!rematriculaAnoDestino.trim()) {
                      alertErro('Campo obrigatório', 'Indique o ano lectivo de destino.');
                      return;
                    }
                    setRematriculaLoading(true);
                    try {
                      const resultado = await api.post<any>('/api/rematricula-lote', {
                        anoLetivoDestino: rematriculaAnoDestino.trim(),
                        bloquearComPendencia: rematriculaBloquearPendencia,
                        bloquearReprovados: rematriculaBloquearReprovados,
                      });
                      setRematriculaResultado(resultado);
                    } catch (e: any) {
                      alertErro('Erro', e?.message || 'Não foi possível processar a rematrícula.');
                    } finally {
                      setRematriculaLoading(false);
                    }
                  }}
                  disabled={rematriculaLoading || !rematriculaAnoDestino.trim()}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: !rematriculaAnoDestino.trim() ? Colors.surface : Colors.success, borderRadius: 14, paddingVertical: 15, opacity: !rematriculaAnoDestino.trim() ? 0.5 : 1 }}
                >
                  {rematriculaLoading
                    ? <AppLoader color="#fff" />
                    : <>
                        <Ionicons name="refresh-circle-outline" size={20} color="#fff" />
                        <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' }}>Iniciar Rematrícula em Lote</Text>
                      </>
                  }
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal passo-a-passo — solicitações de documentos pendentes */}
      <PendingSolicitacoesModal
        visible={showSolicitacoesModal}
        solicitacoes={solicitacoesPendentes}
        onClose={() => setShowSolicitacoesModal(false)}
        onAdiar={() => {
          manuallyClosedRef.current = true;
          setShowSolicitacoesModal(false);
        }}
        onUpdate={(updated) => {
          setSolicitacoesPendentes(prev => {
            const next = prev.map(s => s.id === updated.id ? updated : s)
              .filter(s => s.status === 'pendente' || s.status === 'em_processamento');
            if (next.length === 0) setShowSolicitacoesModal(false);
            return next;
          });
        }}
      />

      <PautaFinalPreviewModal
        visible={!!pautaPreview}
        html={pautaPreview?.html || ''}
        trimestre={pautaPreview?.trimestre || 1}
        anoLetivo={pautaPreview?.anoLetivo || ''}
        turmaNome={pautaPreview?.turmaId ? (turmas.find(t => t.id === pautaPreview.turmaId)?.nome || undefined) : undefined}
        onClose={() => setPautaPreview(null)}
        onPrinted={() => {
          if (pautaPreview?.turmaId) {
            marcarImpressa(pautaPreview.trimestre, pautaPreview.turmaId);
          }
        }}
      />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  tabsRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabsContent: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, gap: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  tabActive: { backgroundColor: Colors.gold + '18', borderColor: Colors.gold + '40' },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4, gap: 8 },
  statCard: { width: '47.5%', backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, alignItems: 'center', borderTopWidth: 3 },
  statValue: { fontSize: 28, fontFamily: 'Inter_700Bold', marginTop: 4 },
  statLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginTop: 4, textAlign: 'center', lineHeight: 16 },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '18', marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.warning + '40' },
  alertText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.warning },

  card: { margin: 12, marginBottom: 0, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14 },

  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0, marginRight: 8 },
  secHeaderTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 1 },
  countBadge: { backgroundColor: Colors.goldLight, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 0 },
  countBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#000' },
  secAction: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  secActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.goldLight },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  actionCard: { width: '31%', alignItems: 'center', gap: 7 },
  actionIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 9.5, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textAlign: 'center', lineHeight: 12 },

  processoRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  processoCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 },
  processoCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  processoCardLeft: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', flex: 1 },
  prioIndicator: { width: 4, height: '100%', borderRadius: 2, minHeight: 36 },
  processoInfo: { flex: 1 },
  processoTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' },
  processoTipo: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  processoDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4, marginTop: 4 },
  processoMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  processoSolicitante: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  processoActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  procBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, backgroundColor: Colors.cardAlt, borderColor: Colors.borderLight },
  procBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  docCard: { marginBottom: 10 },
  docCardLeft: { borderLeftWidth: 3, paddingLeft: 10 },
  docCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  docIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docInfo: { flex: 1 },
  docNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  docTipo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  docData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  docTypeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  docTypeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // ── Documentos pagination ──
  docsPagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  docsPageBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  docsPageBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  docsPageBtnDisabled: { opacity: 0.35 },
  docsPageBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  docsPageBtnTextActive: { color: Colors.dark },
  docsPageEllipsis: { fontSize: 11, color: Colors.textMuted, paddingHorizontal: 2 },
  docsPageLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginLeft: 8 },

  eventoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  eventoDateBox: { width: 42, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, paddingVertical: 4 },
  eventoDay: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  eventoMonth: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  eventoInfo: { flex: 1 },
  eventoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  eventoTipo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  corrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  corrBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, minWidth: 64, justifyContent: 'center' },
  corrBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  corrInfo: { flex: 1 },
  corrTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  corrAssunto: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  corrMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  urgenteTag: { backgroundColor: Colors.danger + '22', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  urgenteText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.danger },

  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },

  cursoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cursoIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cursoHeaderInfo: { flex: 1 },
  cursoNivel: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  cursoSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  cursoBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  cursoBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  classesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  classeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 },
  classeChipInactive: { opacity: 0.4 },
  classeChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  classeChipCount: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  cursoDetalhe: { paddingTop: 4 },
  classeGrupo: { marginBottom: 12 },
  classeGrupoTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  turmaDetalheRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginBottom: 6 },
  turmaDetalheLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  turmaDetalheDot: { width: 8, height: 8, borderRadius: 4 },
  turmaDetalheNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  turmaDetalheSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  discSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 4 },
  discSectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  discChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  discChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: Colors.surface },
  discChipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  cursoActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  cursoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  cursoActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },


  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginHorizontal: 16, marginTop: 14, marginBottom: 8 },
  tipoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16 },
  tipoCard: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface },
  tipoLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  input: { marginHorizontal: 16, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  prioRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  prioBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
  prioBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  modalActions: { flexDirection: 'row', gap: 10, margin: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.info, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  submitBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },

  // CREDENTIALS MODAL
  credHeader: { padding: 28, alignItems: 'center', gap: 10 },
  credAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.info + '55', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.gold },
  credAvatarText: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#fff' },
  credBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold + '22', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  credBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  credBody: { padding: 16 },
  credName: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  credSchool: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  credDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  credRowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' },
  credRowContent: { flex: 1 },
  credRowLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 1 },
  credRowValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  credNote: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
});
