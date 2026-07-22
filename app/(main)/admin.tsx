import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  useLocalSearchParams, useRouter } from 'expo-router';
import {Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import DatePickerField from '@/components/DatePickerField';
import DateInput from '@/components/DateInput';
import { useAnoAcademico, type AnoAcademico } from '@/context/AnoAcademicoContext';
import { useAuth, UserRole, AUTHORIZED_APPROVER_ROLES } from '@/context/AuthContext';
import { useUsers, StoredUser } from '@/context/UsersContext';
import { useData } from '@/context/DataContext';
import { useRegistro, SolicitacaoRegistro } from '@/context/RegistroContext';
import { useConfig } from '@/context/ConfigContext';
import GestaoAcessosPanel from '@/components/GestaoAcessosPanel';
import { alertSucesso, alertErro } from '@/utils/toast';
import { useLookup, invalidateLookupCache } from '@/hooks/useLookup';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import { pickAndUploadPhoto } from '@/lib/uploadPhoto';
import { getAuthToken } from '@/context/AuthContext';
import { getRoleLabel } from '@/utils/genero';
import { defaultTrimestres, rangeAnoPadrao, sugerirProximoAno, anoLetivoDe, MES_INICIO_PADRAO } from '@/lib/anoLetivo';
import { MODELOS_AVALIACAO, detectarModeloActivo, type ModeloAvaliacao } from '@/lib/modelosAvaliacao';
import { NIVEIS_COMPLEXO, type PercAvaliacaoNivel } from '@/lib/percPorNivel';
import RequiredMark from '@/components/RequiredMark';
import NeonStatusBanner from '@/components/NeonStatusBanner';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { ADMIN_TOUR_STEPS, ADMIN_TOUR_KEY } from '@/constants/tourSteps';

const BACKUP_CATS = [
  {
    key: 'academico', label: 'Académico', icon: 'school' as const, color: Colors.warning,
    desc: 'Alunos, turmas, notas, pautas, presenças e horários',
    tables: ['alunos','turmas','disciplinas','cursos','notas','pautas','presencas','registros','sumarios','anos_academicos','horarios','quadro_honra','avaliacoes_parciais','justificacoes_falta'],
  },
  {
    key: 'financeiro', label: 'Financeiro', icon: 'cash' as const, color: Colors.success,
    desc: 'Pagamentos, propinas, RUPEs e folhas salariais',
    tables: ['pagamentos','taxas','rupes','plano_contas','contas_pagar','folhas_salarios','recibo_emissoes','orcamentos_rubrica'],
  },
  {
    key: 'rh', label: 'Recursos Humanos', icon: 'people' as const, color: Colors.info,
    desc: 'Funcionários, professores e contas de utilizadores',
    tables: ['funcionarios','utilizadores'],
  },
  {
    key: 'documentos', label: 'Documentos', icon: 'document-text' as const, color: '#8B5CF6',
    desc: 'Modelos, documentos emitidos e correspondências',
    tables: ['doc_templates','documentos_emitidos','correspondencias','solicitacoes_documentos','reconfirmacoes_matricula','anotacoes_matricula'],
  },
  {
    key: 'sistema', label: 'Sistema & Config', icon: 'construct' as const, color: Colors.accent,
    desc: 'Configurações, eventos, feriados e registos do sistema',
    tables: ['config_geral','lookup_items','role_permissions','eventos','feriados','ocorrencias','mensagens','notificacoes','presencas_biblioteca','licenca_codigos','licenca_historico'],
  },
] as const;
import { StableSearchInput } from '@/components/StableSearchInput';


interface EscolaConfig {
  nome: string;
  codigoMED: string;
  morada: string;
  municipio: string;
  provincia: string;
  telefone: string;
  email: string;
  directorGeral: string;
  subdirectorPedagogico: string;
  maxAlunosTurma: string;
  horarioFuncionamento: string;
  cabecalhoLinha1: string;
  cabecalhoLinha2: string;
  cabecalhoLinha3: string;
  cabecalhoLinha4: string;
}

const DEFAULT_ESCOLA: EscolaConfig = {
  nome: '',
  codigoMED: '',
  morada: '',
  municipio: '',
  provincia: '',
  telefone: '',
  email: '',
  directorGeral: '',
  subdirectorPedagogico: '',
  maxAlunosTurma: '35',
  horarioFuncionamento: 'Seg-Sex: 07:00-19:00 | Sáb: 07:00-13:00',
  cabecalhoLinha1: '',
  cabecalhoLinha2: '',
  cabecalhoLinha3: '',
  cabecalhoLinha4: '',
};

const AREAS_FORMACAO_DEFAULT = [
  'Ciências e Tecnologia',
  'Ciências Económicas, Jurídicas e Sociais',
  'Humanidades',
  'Artes',
  'Ciências de Informação e Comunicação',
  'Formação de Professores',
];

interface Curso {
  id: string; nome: string; codigo: string; areaFormacao: string; descricao: string; ativo: boolean;
  cargaHoraria?: number; duracao?: string; ementa?: string; portaria?: string;
}

const SECTION_COLORS: Record<string, string> = {
  matriculas: Colors.warning,
  cursos: '#A78BFA',
  disciplinas: '#22D3EE',
  escola: Colors.info,
  anos: '#9B59B6',
  usuarios: Colors.gold,
  acessos: '#8B5CF6',
  config: Colors.success,
  comunicacoes: Colors.accent,
  seguranca: Colors.danger,
  reabertura: Colors.warning,
  enquadramento: '#F97316',
};

const CONFIG_SECTIONS = [
  { id: 'cfg-propinas', label: 'Propinas e Pagamentos', icon: 'cash', color: Colors.success, keywords: ['propinas', 'pagamento', 'cobrança', 'mensalidade', 'financeiro'] },
  { id: 'cfg-periodos', label: 'Períodos e Inscrições', icon: 'calendar', color: Colors.info, keywords: ['periodos', 'inscricoes', 'matricula', 'abertura', 'online', 'datas'] },
  { id: 'cfg-inscricoes', label: 'Período de Inscrições', icon: 'person-add', color: Colors.info, keywords: ['inscricoes', 'matricula', 'solicitacao', 'abertura', 'login'] },
  { id: 'cfg-avalprof', label: 'Avaliação de Professores', icon: 'star', color: Colors.warning, keywords: ['avaliacao', 'professores', 'periodo', 'classificacao', 'notificacao'] },
  { id: 'cfg-academico', label: 'Académico e Notas', icon: 'school', color: Colors.warning, keywords: ['academico', 'notas', 'aprovacao', 'reprovacao', 'provas', 'trimestre'] },
  { id: 'cfg-decreto', label: 'Fórmulas do Decreto 04/2026', icon: 'document-text', color: '#1d4ed8', keywords: ['decreto', 'formula', 'mac', 'npt', 'mt', 'mfd', 'media', 'trimestral', 'exame', 'peso', 'calculo', 'avaliacao', 'anexo', 'nen', 'classe', 'transicao', 'nuclear'] },
  { id: 'cfg-negativos', label: 'Negativos para Transição Condicional', icon: 'alert-circle', color: '#f59e0b', keywords: ['negativos', 'transicao', 'condicional', 'ciclo', 'classe', 'limite', 'negativa', 'art23', 'restricao', 'lp', 'portugues', 'area', 'disciplina', '7', '8', '10', '11', 'decreto', 'maximo'] },
  { id: 'cfg-formativa', label: 'Avaliação Formativa', icon: 'leaf', color: '#22c55e', keywords: ['formativa', 'formativo', 'mac', 'peso', 'percentagem', 'continua', 'observacao'] },
  { id: 'cfg-sistema', label: 'Sistema', icon: 'settings', color: Colors.textMuted, keywords: ['sistema', 'funcionamento', 'horario', 'mes', 'inicio', 'ano', 'lectivo', 'prazos'] },
  { id: 'cfg-pap', label: 'PAP — Ensino Técnico-Profissional', icon: 'ribbon', color: Colors.gold, keywords: ['pap', '12', '13', 'tecnico', 'profissional', 'prova', 'aptidao', 'ensino', 'estagio', 'defesa'] },
  { id: 'cfg-exame', label: 'Exame Antecipado', icon: 'time', color: Colors.warning, keywords: ['exame', 'antecipado', 'prova', 'epoca', 'especial', 'recuperacao'] },
  { id: 'cfg-recurso', label: 'Exame de Recurso (Art. 33º)', icon: 'refresh-circle', color: '#f97316', keywords: ['recurso', 'negativa', 'negativo', 'art33', 'lp', 'matematica', 'intervalo', 'nota', 'limite', '9', '12', 'decreto'] },
  { id: 'cfg-melhoria', label: 'Exame de Melhoria de Nota (Art. 36º)', icon: 'trending-up', color: '#8b5cf6', keywords: ['melhoria', 'nota', 'art36', 'aluno', 'solicitar', 'prazo', 'disciplina', 'maximo', 'meses', 'horas'] },
  { id: 'cfg-pagamentos', label: 'Pagamentos Online (EMIS/Multicaixa)', icon: 'card', color: '#10B981', keywords: ['emis', 'multicaixa', 'pagamento', 'online', 'banco', 'api', 'webhook', 'provedor'] },
  { id: 'cfg-ia', label: 'Assistente IA', icon: 'bulb', color: '#A78BFA', keywords: ['ia', 'inteligencia', 'artificial', 'groq', 'openai', 'chave', 'api', 'assistente', 'chat'] },
];

const GROUPS = [
  {
    key: 'academico',
    label: 'Académico',
    icon: 'school' as const,
    color: Colors.warning,
    sections: ['matriculas', 'cursos', 'disciplinas', 'anos', 'reabertura', 'enquadramento'],
  },
  {
    key: 'pessoal',
    label: 'Pessoal',
    icon: 'people' as const,
    color: '#8B5CF6',
    sections: ['usuarios', 'acessos'],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: 'construct' as const,
    color: Colors.info,
    sections: ['escola', 'config', 'comunicacoes', 'seguranca'],
  },
];

const ROLE_COLOR: Record<string, string> = {
  ceo: '#FFD700', pca: '#9B59B6', admin: '#E67E22', director: Colors.accent,
  chefe_secretaria: '#E11D48',
  secretaria: Colors.gold, professor: Colors.info, aluno: Colors.success,
  financeiro: '#10B981', encarregado: '#F97316', rh: '#06B6D4',
  pedagogico: '#14B8A6', subdirector_pedagogico: '#0D9488', coordenador_curso: '#7C3AED',
  membro_conselho_pedagogico: '#8B5CF6',
  membro_conselho_escola: '#D4AF37',
};

const USER_MANAGEMENT_ROLES: UserRole[] = ['ceo', 'pca', 'admin', 'director'];
const EDITABLE_USER_ROLES: UserRole[] = [
  'pca', 'admin', 'director', 'subdirector_pedagogico', 'chefe_secretaria',
  'secretaria', 'professor', 'financeiro', 'rh', 'pedagogico', 'coordenador_curso',
  'aluno', 'encarregado',
  'membro_conselho_pedagogico', 'membro_conselho_escola',
];

function SectionHeader({ title, icon, color, collapsed, onToggle }: {
  title: string; icon: string; color?: string;
  collapsed?: boolean; onToggle?: () => void;
}) {
  const c = color || Colors.gold;
  const inner = (
    <View style={[styles.sectionHeader, onToggle && { paddingBottom: collapsed ? 0 : 12, marginBottom: 0 }]}>
      <View style={[styles.sectionHeaderIcon, { backgroundColor: c + '20' }]}>
        <Ionicons name={icon as any} size={14} color={c} />
      </View>
      <Text style={[styles.sectionHeaderText, { color: Colors.text }]}>{title}</Text>
      <View style={[styles.sectionHeaderLine, { backgroundColor: c + '30' }]} />
      {onToggle !== undefined && (
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
      )}
    </View>
  );
  if (onToggle) return <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  return inner;
}

function StatusBadge({ status }: { status: SolicitacaoRegistro['status'] }) {
  const map = {
    pendente: { label: 'Pendente', color: Colors.warning, bg: Colors.warning + '22' },
    aprovado: { label: 'Aprovado', color: Colors.success, bg: Colors.success + '22' },
    rejeitado: { label: 'Rejeitado', color: Colors.danger, bg: Colors.danger + '22' },
  };
  const s = map[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: s.color }]} />
      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const { section: paramSection, group: paramGroup } = useLocalSearchParams<{ section?: string; group?: string }>();
  const { anos, addAno, updateAno, ativarAno, deleteAno } = useAnoAcademico();
  const { user } = useAuth();
  const { users, addUser, updateUser, deleteUser } = useUsers();
  const { addProfessor } = useData();
  const { pendentes, aprovadas, rejeitadas, aprovarSolicitacao, rejeitarSolicitacao, deletarSolicitacao } = useRegistro();
  const { config, updateConfig, updateFlashScreen } = useConfig();
  const { values: areasFormacao } = useLookup('areas_curso', AREAS_FORMACAO_DEFAULT);
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(ADMIN_TOUR_KEY);

  // Auto-mostrar tour na primeira visita do admin
  useEffect(() => {
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  // ── Backup & Export ───────────────────────────────────────
  const [backupLoading, setBackupLoading] = useState(false);
  const [diagData, setDiagData] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixLogs, setFixLogs] = useState<string[]>([]);
  const [fixDone, setFixDone] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportTabela, setExportTabela] = useState('alunos');
  const [backupStats, setBackupStats] = useState<{ counts: Record<string, number>; byCat: Record<string, { total: number; tables: Record<string, number> }>; totalGeral: number } | null>(null);
  const [backupStatsLoading, setBackupStatsLoading] = useState(false);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(BACKUP_CATS.map(c => c.key)));
  const [catDownloading, setCatDownloading] = useState<string | null>(null);

  // ── Backup SQL automático ─────────────────────────────────────
  type SqlBackupFicheiro = { nome: string; tamanho: number; data: string };
  const [sqlBackups, setSqlBackups] = useState<SqlBackupFicheiro[]>([]);
  const [sqlBackupsLoading, setSqlBackupsLoading] = useState(false);
  const [sqlBackupRunning, setSqlBackupRunning] = useState(false);
  const [sqlBackupLog, setSqlBackupLog] = useState<string[]>([]);
  const [sqlLogVisible, setSqlLogVisible] = useState(false);
  const [sqlLogLoading, setSqlLogLoading] = useState(false);

  async function loadSqlBackups() {
    if (sqlBackupsLoading) return;
    setSqlBackupsLoading(true);
    try {
      const data = await api.get<{ ficheiros: SqlBackupFicheiro[] }>('/api/admin/sql-backups/list');
      setSqlBackups(data.ficheiros ?? []);
    } catch { /* silencioso */ } finally { setSqlBackupsLoading(false); }
  }

  async function loadSqlLog() {
    setSqlLogLoading(true);
    try {
      const data = await api.get<{ linhas: string[] }>('/api/admin/sql-backups/log');
      setSqlBackupLog(data.linhas ?? []);
    } catch { /* silencioso */ } finally { setSqlLogLoading(false); }
  }

  async function handleSqlBackupManual() {
    if (sqlBackupRunning) return;
    setSqlBackupRunning(true);
    try {
      await api.post('/api/admin/sql-backups/run', {});
      alertSucesso('Backup SQL concluído', 'O ficheiro .sql foi guardado na pasta backups/.');
      await loadSqlBackups();
      if (sqlLogVisible) await loadSqlLog();
    } catch (e: any) {
      alertErro('Erro no Backup SQL', e.message ?? 'Erro desconhecido.');
    } finally { setSqlBackupRunning(false); }
  }

  // ── Rascunhos de configuração por categoria (save explícito) ──
  const [draftNotas, setDraftNotas] = useState<Record<string, any>>({});
  // Estado local de edição para campos numéricos da escala (evita revert ao apagar)
  const [macMinText, setMacMinText] = useState<string | null>(null);
  const [macMaxText, setMacMaxText] = useState<string | null>(null);
  const [draftPercAval, setDraftPercAval] = useState<Record<string, any>>({});
  // Modelos de avaliação carregados da BD (fallback: lista estática)
  const [dbModelos, setDbModelos] = useState<ModeloAvaliacao[]>(MODELOS_AVALIACAO);
  const loadDbModelos = useCallback(async () => {
    try {
      const { getAuthToken } = await import('@/context/AuthContext');
      const { getApiUrl } = await import('@/lib/query-client');
      const token = await getAuthToken();
      const res = await fetch(new URL('/api/modelos-avaliacao', getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setDbModelos(data);
      }
    } catch { }
  }, []);
  useEffect(() => { void loadDbModelos(); }, [loadDbModelos]);
  const [draftAvalProf, setDraftAvalProf] = useState<Record<string, any>>({});
  const [draftInscricoes, setDraftInscricoes] = useState<Record<string, any>>({});
  const [draftSistemaConf, setDraftSistemaConf] = useState<Record<string, any>>({});
  const [draftEmis, setDraftEmis] = useState<Record<string, any>>({});
  const [draftSiga, setDraftSiga] = useState<Record<string, any>>({});
  const [categorySaving, setCategorySaving] = useState<string | null>(null);
  const [configSearch, setConfigSearch] = useState('');

  // Valor efectivo: rascunho tem prioridade sobre config guardado
  const cn = (draft: Record<string, any>, k: string) => k in draft ? draft[k] : (config as any)[k];

  // ── Gestão da versão APK (CEO) ────────────────────────────
  const [apkVersion, setApkVersion] = useState('');
  const [apkExternalUrl, setApkExternalUrl] = useState('');
  const [apkSaving, setApkSaving] = useState(false);
  const [apkLoaded, setApkLoaded] = useState(false);

  useEffect(() => {
    if (user?.role !== 'ceo' || apkLoaded) return;
    (async () => {
      try {
        const r = await fetch('/api/version');
        if (r.ok) {
          const d = await r.json();
          setApkVersion(d.version ?? '');
          setApkExternalUrl(d.apkUrl && !d.apkUrl.startsWith('/') ? d.apkUrl : '');
          setApkLoaded(true);
        }
      } catch {}
    })();
  }, [user?.role, apkLoaded]);

  async function salvarApkVersion() {
    const ver = apkVersion.trim();
    if (!ver) { webAlert('Campo obrigatório', 'Introduza a versão do APK (ex.: 2.1.1).'); return; }
    if (!/^\d+\.\d+(\.\d+)?$/.test(ver)) { webAlert('Formato inválido', 'Use o formato X.Y ou X.Y.Z (ex.: 2.1.1).'); return; }
    setApkSaving(true);
    try {
      await api.put('/api/config', { apkVersion: ver, apkExternalUrl: apkExternalUrl.trim() || null });
      alertSucesso('Versão actualizada', `APK v${ver} definido com sucesso.`);
      setApkLoaded(false);
    } catch (e: any) {
      alertErro('Erro', e?.message ?? 'Não foi possível guardar a versão.');
    } finally { setApkSaving(false); }
  }

  // ── Escalões dinâmicos de desconto por volume (CEO) ──
  type EscalaoVol = { min: number; max: number | null; perc: number; label: string };
  const [escaloesVol, setEscaloesVol] = useState<EscalaoVol[]>([]);
  const [escaloesLoading, setEscaloesLoading] = useState(false);
  const [escaloesSaving, setEscaloesSaving] = useState(false);
  const [escaloesMsg, setEscaloesMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (user?.role !== 'ceo') return;
    (async () => {
      setEscaloesLoading(true);
      try {
        const r = await fetch('/api/licenca/escaloes');
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.escaloes)) setEscaloesVol(d.escaloes);
        }
      } catch {} finally { setEscaloesLoading(false); }
    })();
  }, [user?.role]);

  // Estado de edição por célula (permite limpar e redigitar sem revert)
  const [escaloesEditCache, setEscaloesEditCache] = useState<Record<string, string>>({});
  const ESCALAO_PERC_MAX_UI = 10;

  function escEditKey(idx: number, field: string) { return `${idx}_${field}`; }

  function atualizarEscalao(idx: number, patch: Partial<EscalaoVol>) {
    setEscaloesVol(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
    setEscaloesMsg(null);
  }

  function commitEscEdit(idx: number, field: 'min' | 'max', raw: string) {
    const key = escEditKey(idx, field);
    if (field === 'max') {
      if (raw === '' || raw === '∞') {
        atualizarEscalao(idx, { max: null });
      } else {
        const n = parseInt(raw.replace(/\D/g, ''));
        if (!isNaN(n)) atualizarEscalao(idx, { max: n });
      }
    } else {
      const n = parseInt(raw.replace(/\D/g, ''));
      if (!isNaN(n)) atualizarEscalao(idx, { min: n });
    }
    setEscaloesEditCache(c => { const nc = { ...c }; delete nc[key]; return nc; });
  }

  function adicionarEscalao() {
    setEscaloesVol(prev => {
      const ult = prev[prev.length - 1];
      // Calcula o início do novo escalão
      const novoMin = ult ? (ult.max != null ? ult.max + 1 : ult.min + 1001) : 0;
      // Fecha o anterior se estava ilimitado (max: null) — senão o servidor rejeita
      const prevFechado = ult && ult.max == null
        ? [...prev.slice(0, -1), { ...ult, max: novoMin - 1 }]
        : [...prev];
      // O novo escalão fica ilimitado (último da lista)
      return [...prevFechado, { min: novoMin, max: null, perc: 0, label: `${novoMin}+` }];
    });
    setEscaloesMsg(null);
  }

  function removerEscalao(idx: number) {
    setEscaloesVol(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) return next;
      // Garante que o novo último tem sempre max: null (catch-all ilimitado)
      const last = next[next.length - 1];
      if (last.max != null) {
        return [...next.slice(0, -1), { ...last, max: null, label: last.label.replace(/–\d+$/, '+') }];
      }
      return next;
    });
    // Limpa cache de edição do item removido
    setEscaloesEditCache(c => {
      const nc = { ...c };
      Object.keys(nc).forEach(k => { if (k.startsWith(`${idx}_`)) delete nc[k]; });
      return nc;
    });
    setEscaloesMsg(null);
  }

  // Validação em tempo real dos escalões
  const escaloesErros: string[] = (() => {
    const erros: string[] = [];
    const sorted = [...escaloesVol].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const isLast = i === sorted.length - 1;
      if (e.min < 0) erros.push(`Escalão "${e.label}": mínimo não pode ser negativo.`);
      if (e.max != null && e.max <= e.min) erros.push(`Escalão "${e.label}": máximo deve ser maior que o mínimo.`);
      if (e.perc < 0 || e.perc > ESCALAO_PERC_MAX_UI) erros.push(`Escalão "${e.label}": desconto deve estar entre 0% e ${ESCALAO_PERC_MAX_UI}%.`);
      if (!isLast && e.max == null) erros.push(`Escalão "${e.label}": apenas o último pode ser ilimitado.`);
      if (isLast && e.max != null) erros.push(`O último escalão deve ser ilimitado (máx = ∞) para cobrir todas as escolas.`);
      if (i < sorted.length - 1) {
        const nxt = sorted[i + 1];
        if (e.max != null && e.max >= nxt.min) erros.push(`Sobreposição entre "${e.label}" e "${nxt.label}".`);
        if (e.max != null && e.max + 1 < nxt.min) erros.push(`Gap entre "${e.label}" (max ${e.max}) e "${nxt.label}" (min ${nxt.min}).`);
      }
    }
    return erros;
  })();

  async function guardarEscaloes() {
    setEscaloesSaving(true); setEscaloesMsg(null);
    try {
      const { getAuthToken } = await import('@/context/AuthContext');
      const token = await getAuthToken();
      const r = await fetch('/api/licenca/escaloes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ escaloes: escaloesVol }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setEscaloesVol(d.escaloes);
        setEscaloesMsg({ tipo: 'ok', texto: 'Escalões guardados! Já estão a ser aplicados em todas as escolas.' });
      } else {
        setEscaloesMsg({ tipo: 'erro', texto: d.error || 'Não foi possível guardar.' });
      }
    } catch (e) {
      setEscaloesMsg({ tipo: 'erro', texto: (e as Error).message });
    } finally { setEscaloesSaving(false); }
  }

  // ultimoBackup is stored in DB config (not localStorage)
  const ultimoBackup = config?.ultimoBackup ?? null;

  async function loadBackupStats() {
    if (backupStatsLoading) return;
    setBackupStatsLoading(true);
    try {
      const data = await api.get<{ counts: Record<string, number>; byCat: Record<string, { total: number; tables: Record<string, number> }>; totalGeral: number }>('/api/admin/backup/stats');
      setBackupStats(data);
    } catch (e: any) {
      alertErro('Erro', e?.message ?? 'Não foi possível obter estatísticas.');
    } finally { setBackupStatsLoading(false); }
  }

  async function handleBackupCategorias(cats: string[], labelOverride?: string) {
    if (backupLoading) return;
    setBackupLoading(true);
    const catKey = cats.length === 1 ? cats[0] : null;
    if (catKey) setCatDownloading(catKey);
    try {
      const { getAuthToken } = await import('@/context/AuthContext');
      const { getApiUrl } = await import('@/lib/query-client');
      const token = await getAuthToken();
      const allKeys = BACKUP_CATS.map(c => c.key);
      const isAll = cats.length === allKeys.length && allKeys.every(k => cats.includes(k));
      const qs = isAll ? '' : `?categorias=${cats.join(',')}`;
      const url = new URL(`/api/admin/backup${qs}`, getApiUrl()).toString();
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const label = labelOverride ?? (isAll ? 'completo' : cats.join('-'));
      const date = new Date().toISOString().slice(0, 10);
      const filename = `superescola-backup-${label}-${date}.json`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      const agora = new Date().toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      await updateConfig({ ultimoBackup: agora } as never);
      alertSucesso('Backup concluído', `${filename} descarregado com sucesso.`);
    } catch (e: any) {
      alertErro('Erro no Backup', e.message ?? 'Ocorreu um erro ao gerar o backup.');
    } finally {
      setBackupLoading(false);
      setCatDownloading(null);
    }
  }

  async function handleBackup() {
    return handleBackupCategorias(BACKUP_CATS.map(c => c.key));
  }

  async function guardarCategoria(catKey: string, draft: Record<string, any>, clearFn: () => void) {
    if (!Object.keys(draft).length) return;
    setCategorySaving(catKey);
    try {
      updateConfig(draft as never, { silent: true });
      // Quando se guarda o sistema de avaliação, marca o modelo activo na BD
      if (catKey === 'percAval') {
        const modelId = draft.modeloAvaliacao ?? config.modeloAvaliacao;
        if (modelId) {
          try {
            const { getAuthToken } = await import('@/context/AuthContext');
            const { getApiUrl } = await import('@/lib/query-client');
            const token = await getAuthToken();
            await fetch(new URL(`/api/modelos-avaliacao/${modelId}/ativar`, getApiUrl()).toString(), {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            void loadDbModelos();
          } catch { }
        }
      }
      clearFn();
      alertSucesso('Configurações guardadas', 'As definições foram guardadas com sucesso.');
    } catch (e: any) {
      alertErro('Erro ao guardar', e?.message ?? 'Verifique a ligação e tente novamente.');
    } finally { setCategorySaving(null); }
  }

  async function handleExportCSV() {
    if (exportLoading) return;
    setExportLoading(true);
    try {
      const { getAuthToken } = await import('@/context/AuthContext');
      const { getApiUrl } = await import('@/lib/query-client');
      const token = await getAuthToken();
      const url = new URL(`/api/admin/export-csv?tabela=${exportTabela}`, getApiUrl()).toString();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const link = document.createElement('a');
      const filename = `sige-${exportTabela}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      alertSucesso('Exportação concluída', `Ficheiro ${filename} descarregado com sucesso.`);
    } catch (e: any) {
      alertErro('Erro na Exportação', e.message ?? 'Ocorreu um erro ao exportar os dados.');
    } finally {
      setExportLoading(false);
    }
  }

  // ── Reabertura de Campos de Notas ─────────────────────────
  interface ReaNotaRow {
    id: string; alunoId: string; turmaId: string; disciplina: string; trimestre: number;
    pedidosReabertura: any[]; alunoNome?: string; alunoApelido?: string; turmaNome?: string;
  }
  const [activeSection, setActiveSection] = useState<string>(paramSection || 'matriculas');

  const [reaNotas, setReaNotas] = useState<ReaNotaRow[]>([]);
  const [reaLoading, setReaLoading] = useState(false);
  const [reaResponding, setReaResponding] = useState<string | null>(null);
  const [reaObsModal, setReaObsModal] = useState<{ notaId: string; pedidoId: string; decisao: 'aprovada' | 'rejeitada'; label: string } | null>(null);
  const [reaObs, setReaObs] = useState('');

  const reaPendentes = useMemo(() =>
    reaNotas.flatMap(n => (n.pedidosReabertura || []).filter((p: any) => p.status === 'pendente').map((p: any) => ({ ...p, _notaId: n.id, _nota: n }))),
    [reaNotas]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeSection === 'reabertura') fetchReabertura();
  }, [activeSection]);

  async function fetchReabertura() {
    setReaLoading(true);
    try {
      const list = await api.get<ReaNotaRow[]>('/api/notas/reabertura-pendentes');
      setReaNotas(list);
    } catch { setReaNotas([]); }
    finally { setReaLoading(false); }
  }

  async function responderReabertura(notaId: string, pedidoId: string, decisao: 'aprovada' | 'rejeitada', observacao: string) {
    setReaResponding(pedidoId);
    try {
      await api.put(`/api/notas/${notaId}/responder-reabertura`, { pedidoId, decisao, observacao });
      alertSucesso(decisao === 'aprovada' ? 'Aprovado' : 'Rejeitado', `O pedido foi ${decisao === 'aprovada' ? 'aprovado' : 'rejeitado'} com sucesso.`);
      setReaObsModal(null);
      setReaObs('');
      await fetchReabertura();
    } catch { webAlert('Erro', 'Não foi possível responder ao pedido.'); }
    finally { setReaResponding(null); }
  }

  // ── Pedidos de Abertura de Avaliação (novo sistema) ────────────────
  interface SolicAvalRow {
    id: string; professorId: string; professorNome?: string;
    turmaId?: string; turmaNome?: string; disciplina: string;
    trimestre: number; avaliacao: string; motivo: string;
    status: 'pendente' | 'aprovada' | 'rejeitada';
    respondidoPor?: string; respondidoNome?: string; respondidoEm?: string;
    observacao?: string; criadoEm: string;
  }
  const [solicAvalList, setSolicAvalList] = useState<SolicAvalRow[]>([]);
  const [solicAvalLoading, setSolicAvalLoading] = useState(false);
  const [solicAvalResponding, setSolicAvalResponding] = useState<string | null>(null);
  const [solicAvalObs, setSolicAvalObs] = useState('');
  const [solicAvalModal, setSolicAvalModal] = useState<{ id: string; decisao: 'aprovada' | 'rejeitada'; label: string } | null>(null);

  const solicAvalPendentes = useMemo(() => solicAvalList.filter(s => s.status === 'pendente'), [solicAvalList]);

  useEffect(() => {
    if (activeSection === 'solicit_avaliacao') fetchSolicAvaliacao();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // ── Enquadramento de Alunos (aguardando colocação académica) ──────────────
  const [enqList, setEnqList] = useState<any[]>([]);
  const [enqLoading, setEnqLoading] = useState(false);
  const [enqModal, setEnqModal] = useState<any>(null);
  const [enqTurmas, setEnqTurmas] = useState<any[]>([]);
  const [enqCursos, setEnqCursos] = useState<any[]>([]);
  const [enqTurmaId, setEnqTurmaId] = useState('');
  const [enqCursoId, setEnqCursoId] = useState('');
  const [enqSaving, setEnqSaving] = useState(false);

  useEffect(() => {
    if (activeSection === 'enquadramento') fetchEnquadramento();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  async function fetchEnquadramento() {
    setEnqLoading(true);
    try {
      const [lista, turmasList, cursosList] = await Promise.all([
        api.get<any[]>('/api/alunos/aguardando-enquadramento'),
        api.get<any[]>('/api/turmas'),
        api.get<any[]>('/api/cursos'),
      ]);
      setEnqList(lista);
      setEnqTurmas(turmasList);
      setEnqCursos(cursosList);
    } catch { setEnqList([]); }
    finally { setEnqLoading(false); }
  }

  async function handleEnquadrar() {
    if (!enqModal || !enqTurmaId) { webAlert('Atenção', 'Seleccione uma turma.'); return; }
    setEnqSaving(true);
    try {
      await api.put(`/api/alunos/${enqModal.id}/enquadrar`, { turmaId: enqTurmaId, cursoId: enqCursoId || null });
      alertSucesso('Enquadrado', `${enqModal.nome} ${enqModal.apelido} foi colocado com sucesso.`);
      setEnqModal(null);
      setEnqTurmaId('');
      setEnqCursoId('');
      await fetchEnquadramento();
    } catch (e: any) {
      alertErro('Erro', e?.message ?? 'Não foi possível enquadrar o aluno.');
    } finally { setEnqSaving(false); }
  }

  async function fetchSolicAvaliacao() {
    setSolicAvalLoading(true);
    try {
      const list = await api.get<SolicAvalRow[]>('/api/pedidos-abertura-avaliacao');
      setSolicAvalList(Array.isArray(list) ? list : []);
    } catch { setSolicAvalList([]); }
    finally { setSolicAvalLoading(false); }
  }

  async function responderSolicAvaliacao(id: string, decisao: 'aprovada' | 'rejeitada', observacao: string) {
    setSolicAvalResponding(id);
    try {
      await api.put(`/api/pedidos-abertura-avaliacao/${id}/responder`, { decisao, observacao });
      alertSucesso(decisao === 'aprovada' ? 'Aprovado' : 'Rejeitado', `O pedido foi ${decisao === 'aprovada' ? 'aprovado' : 'rejeitado'} com sucesso.`);
      setSolicAvalModal(null);
      setSolicAvalObs('');
      await fetchSolicAvaliacao();
    } catch { webAlert('Erro', 'Não foi possível responder ao pedido.'); }
    finally { setSolicAvalResponding(null); }
  }

  const SISTEMA_SECS = ['escola', 'config', 'comunicacoes', 'seguranca', 'diagnosticos'];
  const FULL_PAGE_SECS = ['matriculas', 'cursos', 'disciplinas', 'anos', 'reabertura', 'solicit_avaliacao', 'usuarios', 'acessos', ...SISTEMA_SECS];
  const [sistemaFullPage, setSistemaFullPage] = useState(!!paramSection);

  const [escola, setEscola] = useState<EscolaConfig>(DEFAULT_ESCOLA);
  const [editEscola, setEditEscola] = useState(false);
  const [tempEscola, setTempEscola] = useState<EscolaConfig>(DEFAULT_ESCOLA);
  const [aCarregarLogoAdmin, setACarregarLogoAdmin] = useState(false);
  const [aCarregarFaviconAdmin, setACarregarFaviconAdmin] = useState(false);
  const [faviconActivoAdmin, setFaviconActivoAdmin] = useState(false);
  const [logoUrlAdmin, setLogoUrlAdmin] = useState<string | undefined>(undefined);

  const [cursosList, setCursosList] = useState<Curso[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [showCursoForm, setShowCursoForm] = useState(false);
  const [editingCurso, setEditingCurso] = useState<Curso | null>(null);
  const [savingCurso, setSavingCurso] = useState(false);
  const [cursoForm, setCursoForm] = useState({ nome: '', codigo: '', areaFormacao: AREAS_FORMACAO_DEFAULT[0], descricao: '', cargaHoraria: '', duracao: '', ementa: '', portaria: '' });
  const [showRelatorio, setShowRelatorio] = useState(false);
  // ── Gerir Áreas de Formação ──
  const [showAreasModal, setShowAreasModal] = useState(false);
  const [novaAreaNome, setNovaAreaNome] = useState('');
  const [savingArea, setSavingArea] = useState(false);
  const [deletingAreaId, setDeletingAreaId] = useState<number | null>(null);
  const { items: areasItems } = useLookup('areas_curso', AREAS_FORMACAO_DEFAULT);

  async function adicionarArea() {
    const nome = novaAreaNome.trim();
    if (!nome) { webAlert('Campo obrigatório', 'Introduza o nome da área de formação.'); return; }
    const jaExiste = areasItems.some(a => a.valor.toLowerCase() === nome.toLowerCase());
    if (jaExiste) { webAlert('Área duplicada', `A área "${nome}" já existe na lista.`); return; }
    setSavingArea(true);
    try {
      await api.post('/api/lookup', { categoria: 'areas_curso', valor: nome, label: nome, ordem: areasItems.length });
      invalidateLookupCache('areas_curso');
      setNovaAreaNome('');
      alertSucesso('Área adicionada com sucesso.');
    } catch (e: any) {
      const raw: string = e?.message ?? '';
      let msg = raw;
      const jsonStart = raw.indexOf('{');
      if (jsonStart !== -1) {
        try { msg = JSON.parse(raw.slice(jsonStart))?.error ?? raw; } catch { /* usa raw */ }
      }
      alertErro(msg || 'Erro ao adicionar área.');
    } finally { setSavingArea(false); }
  }

  async function removerArea(id: number, valor: string) {
    const usada = cursosList.some(c => c.areaFormacao === valor);
    if (usada) { webAlert('Área em uso', `A área "${valor}" está associada a pelo menos um curso e não pode ser removida.`); return; }
    webAlert('Remover Área', `Tem a certeza que quer remover "${valor}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        setDeletingAreaId(id);
        try {
          await api.delete(`/api/lookup/${id}`);
          invalidateLookupCache('areas_curso');
          alertSucesso('Área removida.');
        } catch (e: any) {
          alertErro(e?.message || 'Erro ao remover área.');
        } finally { setDeletingAreaId(null); }
      }},
    ]);
  }
  const [relatorioData, setRelatorioData] = useState<any[]>([]);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);

  interface DisciplinaCat { id: string; nome: string; codigo: string; area: string; ativo: boolean; }
  interface DiscMeta { cargaHoraria: number; obrigatoria: boolean; nuclear: boolean; }
  const [gDiscCurso, setGDiscCurso] = useState<Curso | null>(null);
  const [gDiscCatalogo, setGDiscCatalogo] = useState<DisciplinaCat[]>([]);
  const [gDiscSelected, setGDiscSelected] = useState<string[]>([]);
  const [gDiscMeta, setGDiscMeta] = useState<Record<string, DiscMeta>>({});
  const [gDiscSaving, setGDiscSaving] = useState(false);

  async function abrirGestaoDisciplinas(c: Curso) {
    setGDiscCurso(c);
    setGDiscSelected([]);
    setGDiscCatalogo([]);
    setGDiscMeta({});
    try {
      const [catRes, selRes] = await Promise.all([
        fetch('/api/disciplinas'),
        fetch(`/api/cursos/${c.id}/disciplinas`),
      ]);
      const cat: DisciplinaCat[] = catRes.ok ? await catRes.json() : [];
      const sel: { disciplinaId: string; cargaHoraria: number; obrigatoria: boolean; nuclear: boolean }[] = selRes.ok ? await selRes.json() : [];
      setGDiscCatalogo(cat.filter(d => d.ativo));
      setGDiscSelected(sel.map(s => s.disciplinaId));
      const meta: Record<string, DiscMeta> = {};
      sel.forEach(s => { meta[s.disciplinaId] = { cargaHoraria: s.cargaHoraria || 0, obrigatoria: s.obrigatoria !== false, nuclear: s.nuclear === true }; });
      setGDiscMeta(meta);
    } catch {}
  }

  function toggleGDisc(id: string) {
    setGDiscSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function setDiscCarga(id: string, val: string) {
    const n = parseInt(val) || 0;
    setGDiscMeta(prev => ({ ...prev, [id]: { ...(prev[id] || { obrigatoria: true, nuclear: false }), cargaHoraria: n } }));
  }

  function toggleDiscObrig(id: string) {
    setGDiscMeta(prev => ({ ...prev, [id]: { ...(prev[id] || { cargaHoraria: 0, nuclear: false }), obrigatoria: !(prev[id]?.obrigatoria !== false) } }));
  }

  function toggleDiscNuclear(id: string) {
    setGDiscMeta(prev => ({ ...prev, [id]: { ...(prev[id] || { cargaHoraria: 0, obrigatoria: true }), nuclear: !(prev[id]?.nuclear === true) } }));
  }

  async function guardarDiscCurso() {
    if (!gDiscCurso) return;
    setGDiscSaving(true);
    try {
      const disciplinas = gDiscSelected.map(did => ({
        disciplinaId: did,
        cargaHoraria: gDiscMeta[did]?.cargaHoraria || 0,
        obrigatoria: gDiscMeta[did]?.obrigatoria !== false,
        nuclear: gDiscMeta[did]?.nuclear === true,
      }));
      const res = await fetch(`/api/cursos/${gDiscCurso.id}/disciplinas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplinas }),
      });
      if (!res.ok) throw new Error('Erro ao guardar');
      alertSucesso('Matriz actualizada', `A matriz curricular do curso "${gDiscCurso.nome}" foi actualizada. As disciplinas removidas foram preservadas no histórico.`);
      setGDiscCurso(null);
    } catch (e: any) { alertErro('Erro', e.message); }
    setGDiscSaving(false);
  }

  async function abrirRelatorio() {
    setShowRelatorio(true);
    setLoadingRelatorio(true);
    try {
      const res = await fetch('/api/cursos/relatorio');
      if (res.ok) setRelatorioData(await res.json());
    } catch {}
    setLoadingRelatorio(false);
  }

  async function fetchCursos() {
    setLoadingCursos(true);
    try {
      const res = await fetch('/api/cursos');
      if (res.ok) setCursosList(await res.json());
    } catch {}
    setLoadingCursos(false);
  }

  function abrirNovoCurso() {
    setEditingCurso(null);
    setCursoForm({ nome: '', codigo: '', areaFormacao: areasFormacao[0] || AREAS_FORMACAO_DEFAULT[0], descricao: '', cargaHoraria: '', duracao: '', ementa: '', portaria: '' });
    setShowNovoAno(false); // Garantir que outros modais estão fechados
    setShowCursoForm(true);
  }

  function abrirEditarCurso(c: Curso) {
    setEditingCurso(c);
    setCursoForm({ nome: c.nome, codigo: c.codigo, areaFormacao: c.areaFormacao, descricao: c.descricao, cargaHoraria: String(c.cargaHoraria || ''), duracao: c.duracao || '', ementa: c.ementa || '', portaria: c.portaria || '' });
    setShowCursoForm(true);
  }

  async function salvarCurso() {
    if (!cursoForm.nome.trim()) { webAlert('Campo obrigatório', 'Introduza o nome do curso.'); return; }
    if (!cursoForm.areaFormacao.trim()) { webAlert('Campo obrigatório', 'Introduza a área de formação do curso.'); return; }
    setSavingCurso(true);
    try {
      const method = editingCurso ? 'PUT' : 'POST';
      const url = editingCurso ? `/api/cursos/${editingCurso.id}` : '/api/cursos';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cursoForm, cargaHoraria: parseInt(cursoForm.cargaHoraria) || 0, ativo: true }),
      });
      if (!res.ok) throw new Error('Erro ao guardar');
      await fetchCursos();
      setShowCursoForm(false);
      alertSucesso(editingCurso ? 'Curso actualizado' : 'Curso criado', editingCurso ? 'O curso foi actualizado com sucesso.' : 'O novo curso foi criado com sucesso.');
    } catch (e: any) { alertErro('Erro', e.message); }
    setSavingCurso(false);
  }

  async function deleteCurso(id: string) {
    try {
      const res = await fetch(`/api/cursos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao eliminar curso');
      }
      await fetchCursos();
      alertSucesso('Curso eliminado', 'O curso foi removido com sucesso.');
    } catch (e) {
      console.error('Erro ao eliminar curso:', e);
      webAlert('Erro', (e as Error).message);
    }
  }

  async function toggleCursoAtivo(c: Curso) {
    try {
      const res = await fetch(`/api/cursos/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c, ativo: !c.ativo }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar status do curso');
      await fetchCursos();
    } catch (e) {
      console.error('Erro ao alternar status do curso:', e);
      webAlert('Erro', 'Não foi possível atualizar o estado do curso.');
    }
  }

  const [showNovoAno, setShowNovoAno] = useState(false);
  const [showNovoUser, setShowNovoUser] = useState(false);
  const [formAno, setFormAno] = useState({ ano: '', dataInicio: '', dataFim: '' });
  const [modalAnoDuplicado, setModalAnoDuplicado] = useState<{ visible: boolean; anoExistente: string }>({ visible: false, anoExistente: '' });
  const [confirmDeleteAno, setConfirmDeleteAno] = useState<{ visible: boolean; ano: AnoAcademico | null; loading: boolean; erro: string | null }>({ visible: false, ano: null, loading: false, erro: null });
  const [expandedAnoId, setExpandedAnoId] = useState<string | null>(null);
  const [formUser, setFormUser] = useState({ nome: '', email: '', role: 'professor' as UserRole, senha: '', numeroProfessor: '', telefone: '', habilitacoes: '', dataNascimento: '' });
  const [searchUser, setSearchUser] = useState('');
  const [editingUser, setEditingUser] = useState<StoredUser | null>(null);
  const [formEditUser, setFormEditUser] = useState({
    nome: '',
    email: '',
    telefone: '',
    escola: '',
    role: 'professor' as UserRole,
    genero: '' as '' | 'M' | 'F',
    dataNascimento: '',
    departamento: '',
    cargo: '',
    alunoId: '',
    cursoId: '',
    ativo: true,
    novaSenha: '',
  });
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>(paramGroup || 'academico');

  const initialised = useRef(false);
  useEffect(() => {
    if (!initialised.current && paramSection) {
      setActiveSection(paramSection);
      if (paramGroup) setActiveGroup(paramGroup);
      setSistemaFullPage(true);
      initialised.current = true;
    }
  }, [paramSection, paramGroup]);

  const cursosFetched = useRef(false);
  useEffect(() => {
    if (activeSection === 'cursos' && !cursosFetched.current) {
      cursosFetched.current = true;
      fetchCursos();
    }
    if (activeSection !== 'cursos') {
      cursosFetched.current = false;
    }
    if (activeSection === 'comunicacoes' && !comunicadosFetched.current) {
      comunicadosFetched.current = true;
      setHistoryLoading(true);
      api.get<any>('/api/comunicados').then(d => setComunicadosHistory(Array.isArray(d) ? d : d?.comunicados || [])).catch(() => {}).finally(() => setHistoryLoading(false));
    }
    if (activeSection !== 'comunicacoes') {
      comunicadosFetched.current = false;
    }
  }, [activeSection]);

  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoRegistro | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [matriculasTab, setMatriculasTab] = useState<'pendente' | 'aprovado' | 'rejeitado'>('pendente');
  const [papDiscInput, setPapDiscInput] = useState('');
  const [flashForm, setFlashForm] = useState({
    titulo: config.flashScreen?.titulo || '',
    mensagem: config.flashScreen?.mensagem || '',
    imagemUrl: config.flashScreen?.imagemUrl || '',
    duracao: String(config.flashScreen?.duracao || 5),
    bgColor: config.flashScreen?.bgColor || '#0A1628',
    dataInicio: config.flashScreen?.dataInicio || '',
    dataFim: config.flashScreen?.dataFim || '',
    destinatarios: (config.flashScreen as any)?.destinatarios || 'todos',
  });
  const [flashSaved, setFlashSaved] = useState(false);
  const [comunicadosHistory, setComunicadosHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const comunicadosFetched = useRef(false);
  const [editComunicado, setEditComunicado] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [viewersComunicado, setViewersComunicado] = useState<any | null>(null);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [flashCC, setFlashCC] = useState<Record<string, boolean>>({ c1: false, c2: false, c3: false, c4: false, c5: false });
  const toggleFlashCC = (k: string) => setFlashCC(p => ({ ...p, [k]: !p[k] }));
  const [emailConfigStatus, setEmailConfigStatus] = useState<{ configured: boolean; from: string | null } | null>(null);

  useEffect(() => {
    api.get<any>('/api/config/email-status').then(d => setEmailConfigStatus(d)).catch(() => {});
  }, []);
  const [emisTesting, setEmisTesting] = useState(false);
  const [emisTestResult, setEmisTestResult] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [simRef, setSimRef] = useState('');
  const [simValor, setSimValor] = useState('');
  const [simulando, setSimulando] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const isApprover = user && AUTHORIZED_APPROVER_ROLES.includes(user.role);
  const canManageUsers = !!user && USER_MANAGEMENT_ROLES.includes(user.role);

  useEffect(() => {
    setEscola({
      nome: config.nomeEscola || '',
      codigoMED: config.codigoMED || '',
      morada: config.morada || '',
      municipio: config.municipio || '',
      provincia: config.provincia || '',
      telefone: config.telefoneEscola || '',
      email: config.emailEscola || '',
      directorGeral: config.directorGeral || '',
      subdirectorPedagogico: config.directorPedagogico || '',
      maxAlunosTurma: String(config.maxAlunosTurma || 35),
      horarioFuncionamento: config.horarioFuncionamento || '',
      cabecalhoLinha1: (config as any).cabecalhoLinha1 || '',
      cabecalhoLinha2: (config as any).cabecalhoLinha2 || '',
      cabecalhoLinha3: (config as any).cabecalhoLinha3 || '',
      cabecalhoLinha4: (config as any).cabecalhoLinha4 || '',
    });
    setLogoUrlAdmin((config as any).empresaLogo || config.logoUrl || undefined);
  }, [config]);

  useEffect(() => {
    api.get<any>('/api/config').then(d => {
      setFaviconActivoAdmin(!!d?.faviconUrl);
      setLogoUrlAdmin(d?.empresaLogo || d?.logoUrl || undefined);
    }).catch(() => {});
  }, []);

  async function escolherLogoAdmin() {
    setACarregarLogoAdmin(true);
    try {
      const url = await pickAndUploadPhoto();
      if (url) {
        setLogoUrlAdmin(url);
        updateConfig({ logoUrl: url } as any, { silent: true });
        alertSucesso('Logotipo actualizado', 'O logotipo da escola foi guardado e já aparece na barra lateral.');
      }
    } catch { alertErro('Erro', 'Não foi possível enviar o logotipo.'); }
    finally { setACarregarLogoAdmin(false); }
  }

  async function escolherFaviconAdmin() {
    if (Platform.OS !== 'web') {
      webAlert('Não suportado', 'O upload de favicon só está disponível na versão web.');
      return;
    }
    setACarregarFaviconAdmin(true);
    try {
      const token = await getAuthToken();
      await new Promise<void>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/x-icon';
        input.onchange = async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) { resolve(); return; }
          try {
            const fd = new FormData();
            fd.append('file', file);
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch('/api/upload-favicon', { method: 'POST', body: fd, headers });
            if (res.ok) {
              setFaviconActivoAdmin(true);
              webAlert('Favicon actualizado', 'O ícone do browser foi actualizado. Recarregue a página para ver a mudança.');
            } else {
              const d = await res.json().catch(() => ({}));
              alertErro('Erro', (d as any)?.error || 'Não foi possível enviar o favicon.');
            }
          } catch { alertErro('Erro', 'Não foi possível enviar o favicon.'); }
          resolve();
        };
        input.click();
      });
    } finally { setACarregarFaviconAdmin(false); }
  }

  async function testarLigacaoEmis() {
    if (!config.numeroEntidade?.trim()) {
      alertErro('Campo obrigatório', 'Preencha o Número de Entidade primeiro.');
      return;
    }
    setEmisTesting(true);
    setEmisTestResult(null);
    try {
      const result = await api.post<{ sucesso: boolean; mensagem: string }>('/api/emis/testar-ligacao', {
        entidadeId: config.numeroEntidade,
        apiKey: config.emisApiKey,
        apiUrl: config.emisApiUrl,
        ambiente: config.emisAmbiente || 'sandbox',
      });
      setEmisTestResult(result);
    } catch { setEmisTestResult({ sucesso: false, mensagem: 'Erro de rede ao testar a ligação.' }); }
    finally { setEmisTesting(false); }
  }

  async function simularWebhook() {
    const ref = simRef.trim();
    if (!ref) {
      setSimResult({ ok: false, mensagem: 'Indique a referência do RUPE a simular.' });
      return;
    }
    setSimulando(true);
    setSimResult(null);
    try {
      const valorNum = parseFloat(simValor.replace(',', '.')) || 0;
      const body: Record<string, unknown> = {
        referencia: ref,
        dataPagamento: new Date().toISOString(),
      };
      if (valorNum > 0) body.valor = valorNum;
      const resp = await api.post<{ recebido?: boolean; mensagem?: string; aviso?: string; erro?: string }>(
        '/api/emis/webhook',
        body,
      );
      if (resp.erro) {
        setSimResult({ ok: false, mensagem: resp.erro });
      } else if (resp.aviso) {
        setSimResult({ ok: true, mensagem: resp.aviso });
      } else {
        setSimResult({ ok: true, mensagem: resp.mensagem || 'Webhook processado com sucesso.' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSimResult({ ok: false, mensagem: `Falha ao chamar o webhook: ${msg}` });
    } finally {
      setSimulando(false);
    }
  }

  async function salvarEscola() {
    updateConfig({
      nomeEscola: tempEscola.nome,
      codigoMED: tempEscola.codigoMED || undefined,
      morada: tempEscola.morada || undefined,
      municipio: tempEscola.municipio || undefined,
      provincia: tempEscola.provincia || undefined,
      telefoneEscola: tempEscola.telefone || undefined,
      emailEscola: tempEscola.email || undefined,
      directorGeral: tempEscola.directorGeral || undefined,
      directorPedagogico: tempEscola.subdirectorPedagogico || undefined,
      maxAlunosTurma: parseInt(tempEscola.maxAlunosTurma) || 35,
      horarioFuncionamento: tempEscola.horarioFuncionamento,
      cabecalhoLinha1: tempEscola.cabecalhoLinha1 || undefined,
      cabecalhoLinha2: tempEscola.cabecalhoLinha2 || undefined,
      cabecalhoLinha3: tempEscola.cabecalhoLinha3 || undefined,
      cabecalhoLinha4: tempEscola.cabecalhoLinha4 || undefined,
    }, { silent: true });
    setEscola(tempEscola);
    setEditEscola(false);
    alertSucesso('Escola actualizada', 'Os dados da escola foram guardados na base de dados.');
  }

  async function criarUser() {
    if (!formUser.nome.trim() || !formUser.email.trim() || !formUser.senha.trim()) {
      webAlert('Erro', 'Nome, email e senha são obrigatórios.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formUser.email.trim())) {
      webAlert('Email inválido', 'Introduza um endereço de email válido (ex: nome@escola.ao).');
      return;
    }
    if (!formUser.telefone.trim()) {
      webAlert('Erro', 'O número de telemóvel é obrigatório para envio do OTP via Telegram.');
      return;
    }
    if (users.some(u => u.email.toLowerCase() === formUser.email.toLowerCase().trim())) {
      webAlert('Erro', 'Já existe um utilizador com este email.');
      return;
    }

    try {
      const novoUser = await addUser({
        nome: formUser.nome.trim(),
        email: formUser.email.toLowerCase().trim(),
        senha: formUser.senha,
        role: formUser.role,
        escola: escola.nome,
        ativo: true,
        telefone: formUser.telefone.trim(),
        dataNascimento: formUser.dataNascimento.trim() || undefined,
      } as any);

      if (formUser.role === 'professor') {
        const nomes = formUser.nome.trim().split(' ');
        await addProfessor({
          id: novoUser.id,
          numeroProfessor: formUser.numeroProfessor.trim() || `PROF-${Date.now().toString().slice(-4)}`,
          nome: nomes[0],
          apelido: nomes.slice(1).join(' ') || '',
          disciplinas: [],
          turmasIds: [],
          telefone: formUser.telefone.trim(),
          email: formUser.email.toLowerCase().trim(),
          habilitacoes: formUser.habilitacoes.trim(),
          nivelEnsino: '',
          ativo: true,
        });
      }
      setShowNovoUser(false);
      setFormUser({ nome: '', email: '', role: 'professor', senha: '', numeroProfessor: '', telefone: '', habilitacoes: '', dataNascimento: '' });
      alertSucesso('Utilizador criado', `${formUser.nome} foi criado com sucesso no sistema.`);
    } catch (e) {
      console.error('Erro ao criar utilizador:', e);
      webAlert('Erro', 'Não foi possível criar o utilizador. Verifique os dados e tente novamente.');
    }
  }

  function confirmarEliminarUser(id: string, nome: string) {
    const target = users.find(u => u.id === id);
    if (target?.role === 'ceo') {
      webAlert('Acção bloqueada', 'A conta CEO não pode ser eliminada por nenhum utilizador.');
      return;
    }
    webAlert(
      'Eliminar Utilizador',
      `Deseja eliminar o utilizador "${nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => deleteUser(id) },
      ]
    );
  }

  function abrirEdicaoUser(u: StoredUser) {
    if (u.role === 'ceo') {
      webAlert('Acção bloqueada', 'A conta CEO não pode ser editada por nenhum utilizador.');
      return;
    }
    if (!canManageUsers) {
      webAlert('Sem permissão', 'Apenas CEO, PCA, Administrador e Director podem editar dados completos de utilizadores.');
      return;
    }
    setFormEditUser({
      nome: u.nome || '',
      email: u.email || '',
      telefone: u.telefone || '',
      escola: u.escola || escola.nome || '',
      role: u.role,
      genero: (u.genero === 'M' || u.genero === 'F') ? u.genero : '',
      dataNascimento: (u as any).dataNascimento || '',
      departamento: u.departamento || '',
      cargo: u.cargo || '',
      alunoId: u.alunoId || '',
      cursoId: (u as any).cursoId || '',
      ativo: u.ativo !== false,
      novaSenha: '',
    });
    setEditingUser(u);
    // Garantir que a lista de cursos está carregada para o picker
    if (cursosList.length === 0) fetchCursos();
  }

  async function salvarEdicaoUser() {
    if (!editingUser) return;
    if (editingUser.role === 'ceo') {
      webAlert('Acção bloqueada', 'A conta CEO não pode ser editada por nenhum utilizador.');
      return;
    }
    if (!formEditUser.nome.trim() || !formEditUser.email.trim()) {
      webAlert('Campos obrigatórios', 'Nome e e-mail são obrigatórios.');
      return;
    }
    const emailRegexEdit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegexEdit.test(formEditUser.email.trim())) {
      webAlert('Email inválido', 'Introduza um endereço de email válido (ex: nome@escola.ao).');
      return;
    }
    setSavingEditUser(true);
    try {
      const payload: Partial<StoredUser> & { dataNascimento?: string } = {
        nome: formEditUser.nome.trim(),
        email: formEditUser.email.toLowerCase().trim(),
        telefone: formEditUser.telefone.trim(),
        escola: formEditUser.escola.trim(),
        role: formEditUser.role,
        genero: formEditUser.genero,
        dataNascimento: formEditUser.dataNascimento.trim(),
        departamento: formEditUser.departamento.trim(),
        cargo: formEditUser.cargo.trim(),
        alunoId: formEditUser.alunoId.trim() || undefined,
        cursoId: formEditUser.cursoId.trim() || undefined,
        ativo: formEditUser.ativo,
      };
      if (formEditUser.novaSenha.trim()) payload.senha = formEditUser.novaSenha.trim();
      await updateUser(editingUser.id, payload);
      setEditingUser(null);
      alertSucesso('Utilizador actualizado', `${formEditUser.nome} foi actualizado com sucesso.`);
    } catch (e) {
      console.error('Erro ao actualizar utilizador:', e);
      webAlert('Erro', 'Não foi possível actualizar o utilizador. Verifique os dados e tente novamente.');
    } finally {
      setSavingEditUser(false);
    }
  }

  async function criarAno() {
    console.log("Tentando criar ano:", formAno);
    if (!formAno.ano || !formAno.dataInicio || !formAno.dataFim) {
      webAlert('Erro', 'Preencha todos os campos.');
      return;
    }

    try {
      console.log("Chamando addAno...");
      const mesIni = Number(config.mesInicioAnoLetivo) || MES_INICIO_PADRAO;
      const tris = defaultTrimestres(formAno.ano, mesIni);
      // Ajusta T1.dataInicio e T3.dataFim para coincidir com o que o admin escolheu
      tris[0].dataInicio = formAno.dataInicio;
      tris[2].dataFim = formAno.dataFim;
      await addAno({
        ano: formAno.ano,
        dataInicio: formAno.dataInicio,
        dataFim: formAno.dataFim,
        ativo: false,
        trimestres: tris,
      });
      console.log("addAno concluído com sucesso.");
      setShowNovoAno(false);
      setFormAno({ ano: '', dataInicio: '', dataFim: '' });
      alertSucesso('Ano académico criado', `O ano lectivo ${formAno.ano} foi criado com sucesso.`);
    } catch (e) {
      console.error('Erro ao criar ano académico:', e);
      const msg = (e as Error).message || '';
      if (msg.includes('409') || msg.includes('ANO_DUPLICADO') || msg.includes('Já existe')) {
        setShowNovoAno(false);
        setModalAnoDuplicado({ visible: true, anoExistente: formAno.ano });
      } else {
        webAlert('Erro', 'Não foi possível criar o ano académico: ' + msg);
      }
    }
  }

  async function handleDeleteAnoConfirm() {
    if (!confirmDeleteAno.ano) return;
    setConfirmDeleteAno(p => ({ ...p, loading: true, erro: null }));
    try {
      await deleteAno(confirmDeleteAno.ano.id);
      setConfirmDeleteAno({ visible: false, ano: null, loading: false, erro: null });
      alertSucesso('Ano eliminado', `O ano académico ${confirmDeleteAno.ano.ano} foi eliminado com sucesso.`);
    } catch (e) {
      const msg = (e as Error).message || '';
      let erroLegivel = 'Não foi possível eliminar o ano académico.';
      if (msg.includes('turmas') || msg.includes('vinculadas')) {
        erroLegivel = `O ano "${confirmDeleteAno.ano.ano}" possui turmas vinculadas e não pode ser eliminado. Elimine primeiro todas as turmas deste ano.`;
      } else if (msg.includes('400') || msg.includes('409')) {
        try { erroLegivel = JSON.parse(msg.slice(msg.indexOf('{'))).error; } catch { /* usa msg padrão */ }
      }
      setConfirmDeleteAno(p => ({ ...p, loading: false, erro: erroLegivel }));
    }
  }

  function handleAprovar(s: SolicitacaoRegistro) {
    webAlert(
      'Aprovar Matrícula',
      `Aprovar a solicitação de "${s.nomeCompleto}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprovar',
          onPress: async () => {
            await aprovarSolicitacao(s.id, user?.nome || 'Administrador');
            setSelectedSolicitacao(null);
            alertSucesso('Matrícula aprovada', `A matrícula de ${s.nomeCompleto} foi aprovada com sucesso.`);
          },
        },
      ]
    );
  }

  function handleRejeitar(s: SolicitacaoRegistro) {
    setSelectedSolicitacao(s);
    setMotivoRejeicao('');
    setShowRejeitar(true);
  }

  async function confirmarRejeicao() {
    if (!selectedSolicitacao) return;
    if (!motivoRejeicao.trim()) {
      webAlert('Motivo obrigatório', 'Indique o motivo da rejeição.'); return;
    }
    await rejeitarSolicitacao(selectedSolicitacao.id, user?.nome || 'Administrador', motivoRejeicao.trim());
    setShowRejeitar(false);
    setSelectedSolicitacao(null);
    webAlert('Rejeitado', 'A solicitação foi rejeitada.');
  }

  const allSections = [
    { key: 'matriculas', label: 'Matrículas', icon: 'person-add', desc: 'Solicitações e aprovações de matrícula', badge: pendentes.length },
    { key: 'cursos', label: 'Cursos', icon: 'library', desc: 'Gestão de cursos e matrizes curriculares' },
    { key: 'disciplinas', label: 'Disciplinas', icon: 'book', desc: 'Disciplinas por curso e classe' },
    ...(user?.role === 'ceo' ? [{ key: 'escola', label: 'Escola', icon: 'school', desc: 'Dados e identidade da instituição' }] : []),
    { key: 'anos', label: 'Ano Académico', icon: 'calendar', desc: 'Anos lectivos, trimestres e épocas' },
    { key: 'reabertura', label: 'Reabertura Notas', icon: 'lock-open', desc: 'Pedidos de reabertura de lançamento', badge: reaPendentes.length > 0 ? reaPendentes.length : undefined },
    { key: 'solicit_avaliacao', label: 'Lançamento Notas', icon: 'create', desc: 'Solicitações de abertura de avaliação', badge: solicAvalPendentes.length > 0 ? solicAvalPendentes.length : undefined },
    { key: 'enquadramento', label: 'Enquadramento de Alunos', icon: 'people-circle', desc: 'Alunos aguardando colocação académica (turma/curso)', badge: enqList.length > 0 ? enqList.length : undefined },
    { key: 'usuarios', label: 'Utilizadores', icon: 'people', desc: 'Contas de utilizadores do sistema' },
    { key: 'acessos', label: 'Acessos & Permissões', icon: 'key', desc: 'Controlo de acesso por função' },
    { key: 'config', label: 'Configurações', icon: 'settings', desc: 'Parâmetros académicos e financeiros' },
    { key: 'comunicacoes', label: 'Comunicações', icon: 'megaphone', desc: 'Email, notificações push e SMTP' },
    { key: 'seguranca', label: 'Segurança', icon: 'shield-checkmark', desc: 'Backups, diagnóstico e auditoria' },
    { key: 'diagnosticos', label: 'Diagnóstico', icon: 'pulse', desc: 'Estado da base de dados e migrações' },
  ];

  const currentSolicitacoes = matriculasTab === 'pendente' ? pendentes : matriculasTab === 'aprovado' ? aprovadas : rejeitadas;

  useEnterToSave(salvarEscola, editEscola);
  useEnterToSave(salvarCurso, showCursoForm);
  useEnterToSave(guardarDiscCurso, !!gDiscCurso);
  useEnterToSave(criarAno, showNovoAno);
  useEnterToSave(criarUser, showNovoUser);
  useEnterToSave(confirmarRejeicao, showRejeitar);
  useEnterToSave(() => reaObsModal ? responderReabertura(reaObsModal.notaId, reaObsModal.pedidoId, reaObsModal.decisao, reaObs) : undefined, !!reaObsModal);

  return (
    <View style={styles.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={ADMIN_TOUR_STEPS} storageKey={ADMIN_TOUR_KEY} />
      <TopBar title="Super Admin" subtitle="Gestão do Sistema QUETA" />

      {/* ── Estado da Base de Dados ───────────────────────── */}
      <NeonStatusBanner />

      {/* ── Hero Banner ───────────────────────────────────── */}
      {!sistemaFullPage && (
      <View style={styles.heroBanner}>
        {/* Faixa accent lateral */}
        <View style={styles.heroBannerAccent} />
        {/* Ícone */}
        <LinearGradient colors={['#3A6BC4', '#7B2FBE']} style={styles.heroIconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <MaterialCommunityIcons name="shield-crown" size={20} color="#fff" />
        </LinearGradient>
        {/* Identidade */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>Painel de Administração</Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {user?.nome} · {user?.role === 'ceo' ? 'CEO' : user?.role === 'pca' ? 'PCA' : user?.role === 'director' ? 'Director' : 'Admin'}
          </Text>
        </View>
        {/* Stats como chips */}
        <View style={styles.heroStats}>
          <View style={styles.heroStatChip}>
            <Text style={styles.heroStatNum}>{users.length}</Text>
            <Text style={styles.heroStatLabel}>Utiliz.</Text>
          </View>
          {pendentes.length > 0 && (
            <View style={[styles.heroStatChip, styles.heroStatChipWarn]}>
              <Text style={[styles.heroStatNum, { color: Colors.warning }]}>{pendentes.length}</Text>
              <Text style={[styles.heroStatLabel, { color: Colors.warning + 'CC' }]}>Pend.</Text>
            </View>
          )}
          <View style={styles.heroStatChip}>
            <Text style={styles.heroStatNum}>{anos.length}</Text>
            <Text style={styles.heroStatLabel}>Anos</Text>
          </View>
        </View>
        {/* Botão Tour */}
        <TouchableOpacity onPress={openTour} style={styles.heroStatChip} activeOpacity={0.75}>
          <Ionicons name="compass-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>
      )}

      {/* ── Drill-down: Compact breadcrumb header ─────────── */}
      {sistemaFullPage && (() => {
        const sec = allSections.find(s => s.key === activeSection);
        const secColor = SECTION_COLORS[activeSection] || Colors.gold;
        const parentGroup = GROUPS.find(g => g.sections.includes(activeSection));
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <TouchableOpacity
              onPress={() => { setSistemaFullPage(false); }}
              style={{ padding: 6, borderRadius: 8, backgroundColor: Colors.surface }}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.gold} />
            </TouchableOpacity>
            {parentGroup && (
              <>
                <Ionicons name={parentGroup.icon} size={13} color={parentGroup.color} />
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: parentGroup.color }}>{parentGroup.label}</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
              </>
            )}
            {sec && <Ionicons name={sec.icon as any} size={14} color={secColor} />}
            <Text style={{ flex: 1, fontFamily: 'Inter_700Bold', color: Colors.text, fontSize: 14 }} numberOfLines={1}>
              {sec?.label ?? 'Configurações'}
            </Text>
            {sec?.badge !== undefined && sec.badge > 0 && (
              <View style={{ backgroundColor: Colors.danger, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' }}>{sec.badge}</Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* ── Menu state: Group Nav + Section Cards ─────────── */}
      {!sistemaFullPage && (
        <>
          {/* Level 1 — Group tabs (segmented control) */}
          <View style={styles.groupNav}>
            {GROUPS.map(g => {
              const isActive = activeGroup === g.key;
              const groupBadge = g.sections.reduce((sum, sk) => {
                const s = allSections.find(sec => sec.key === sk);
                return sum + (s?.badge || 0);
              }, 0);
              return (
                <TouchableOpacity
                  key={g.key}
                  style={[styles.groupTab, isActive && [styles.groupTabActive, { borderBottomColor: g.color }]]}
                  onPress={() => { setActiveGroup(g.key); }}
                  activeOpacity={0.72}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons name={g.icon} size={16} color={isActive ? g.color : Colors.textMuted} />
                    {groupBadge > 0 && (
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>{groupBadge > 9 ? '9+' : groupBadge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.groupTabLabel, isActive && { color: g.color, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Level 2 — Section cards */}
          {(() => {
            const activeG = GROUPS.find(g => g.key === activeGroup);
            const accentColor = activeG?.color ?? Colors.gold;
            return (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.sectionList}>
                {activeG?.sections.map((sk, idx) => {
                  const s = allSections.find(sec => sec.key === sk);
                  if (!s) return null;
                  const color = SECTION_COLORS[sk] || Colors.gold;
                  const hasBadge = (s as any).badge !== undefined && (s as any).badge > 0;
                  return (
                    <TouchableOpacity
                      key={sk}
                      activeOpacity={0.74}
                      onPress={() => { setActiveSection(sk); setSistemaFullPage(true); }}
                      style={styles.sectionCard}
                    >
                      {/* Accent bar esquerda */}
                      <View style={[styles.sectionCardBar, { backgroundColor: color }]} />

                      {/* Ícone */}
                      <View style={[styles.sectionCardIcon, { backgroundColor: color + '1A' }]}>
                        <Ionicons name={(s as any).icon as any} size={22} color={color} />
                      </View>

                      {/* Texto */}
                      <View style={styles.sectionCardBody}>
                        <Text style={styles.sectionCardTitle} numberOfLines={1}>{s.label}</Text>
                        {'desc' in s && (
                          <Text style={styles.sectionCardDesc} numberOfLines={1}>{(s as any).desc}</Text>
                        )}
                      </View>

                      {/* Badge */}
                      {hasBadge && (
                        <View style={styles.sectionCardBadge}>
                          <Text style={styles.sectionCardBadgeText}>{(s as any).badge}</Text>
                        </View>
                      )}

                      {/* Seta */}
                      <View style={[styles.sectionCardArrow, hasBadge && { marginLeft: 4 }]}>
                        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            );
          })()}
        </>
      )}

      {/* ── Drill-down content ─────────────────────────────── */}
      {sistemaFullPage && <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>

        {/* MATRÍCULAS */}
        {activeSection === 'matriculas' && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Solicitações de Matrícula" icon="person-add" color={Colors.warning} />
            </View>

            {!isApprover ? (
              <View style={styles.accessDenied}>
                <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.accessDeniedTitle}>Acesso Restrito</Text>
                <Text style={styles.accessDeniedText}>Apenas CEO, PCA, Administradores e Directores podem gerir solicitações de matrícula.</Text>
              </View>
            ) : (
              <>
                {/* Stats row */}
                <View style={styles.matriculasStats}>
                  {([
                    { label: 'Pendentes', count: pendentes.length, color: Colors.warning, icon: 'time-outline' },
                    { label: 'Aprovadas', count: aprovadas.length, color: Colors.success, icon: 'checkmark-circle-outline' },
                    { label: 'Rejeitadas', count: rejeitadas.length, color: Colors.danger, icon: 'close-circle-outline' },
                  ] as const).map(s => (
                    <View key={s.label} style={[styles.matriculaStat, { borderColor: s.color + '30', borderTopColor: s.color, borderTopWidth: 2 }]}>
                      <Ionicons name={s.icon as any} size={14} color={s.color} style={{ marginBottom: 4 }} />
                      <Text style={[styles.matriculaStatNum, { color: s.color }]}>{s.count}</Text>
                      <Text style={styles.matriculaStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Filtros coloridos por tipo */}
                <View style={styles.tabsRow}>
                  {([
                    { key: 'pendente', label: 'Pendentes', color: Colors.warning },
                    { key: 'aprovado', label: 'Aprovadas', color: Colors.success },
                    { key: 'rejeitado', label: 'Rejeitadas', color: Colors.danger },
                  ] as const).map(tab => {
                    const isActive = matriculasTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, isActive && [styles.tabActive, { borderBottomWidth: 2, borderBottomColor: tab.color, backgroundColor: tab.color + '12' }]]}
                        onPress={() => setMatriculasTab(tab.key)}
                      >
                        <Text style={[styles.tabText, isActive && [styles.tabTextActive, { color: tab.color }]]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {currentSolicitacoes.length === 0 ? (
                  <View style={styles.adminEmptyState}>
                    <View style={styles.adminEmptyIcon}>
                      <Ionicons name={matriculasTab === 'aprovado' ? 'checkmark-circle-outline' : matriculasTab === 'rejeitado' ? 'close-circle-outline' : 'document-outline'} size={36} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.adminEmptyTitle}>Nenhuma solicitação {matriculasTab === 'pendente' ? 'pendente' : matriculasTab === 'aprovado' ? 'aprovada' : 'rejeitada'}</Text>
                    <Text style={styles.adminEmptyMsg}>{matriculasTab === 'pendente' ? 'Aguarde que alunos submetam a inscrição.' : 'Não existem registos nesta categoria.'}</Text>
                  </View>
                ) : (
                  currentSolicitacoes.map(s => (
                    <View key={s.id} style={styles.solicitacaoCard}>
                      <View style={styles.solicitacaoTop}>
                        <View style={styles.solicitacaoAvatar}>
                          <Text style={styles.solicitacaoAvatarText}>{s.nomeCompleto.charAt(0)}</Text>
                        </View>
                        <View style={styles.solicitacaoInfo}>
                          <Text style={styles.solicitacaoNome}>{s.nomeCompleto}</Text>
                          <Text style={styles.solicitacaoMeta}>{s.nivel} · {s.classe} · {s.provincia}</Text>
                          <Text style={styles.solicitacaoDate}>
                            Submetido em {new Date(s.criadoEm).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                        <StatusBadge status={s.status} />
                      </View>

                      <View style={styles.solicitacaoDetails}>
                        {[
                          { label: 'Encarregado', value: s.nomeEncarregado },
                          { label: 'Contacto', value: s.telefoneEncarregado },
                          { label: 'Nascimento', value: s.dataNascimento },
                          s.municipio ? { label: 'Município', value: s.municipio } : null,
                          s.observacoes ? { label: 'Obs.', value: s.observacoes } : null,
                          s.avaliadoPor ? { label: s.status === 'aprovado' ? 'Aprovado por' : 'Rejeitado por', value: s.avaliadoPor } : null,
                          s.motivoRejeicao ? { label: 'Motivo', value: s.motivoRejeicao } : null,
                        ].filter(Boolean).map((row: any) => (
                          <View key={row.label} style={styles.detailRow}>
                            <Text style={styles.detailLabel}>{row.label}</Text>
                            <Text style={styles.detailValue}>{row.value}</Text>
                          </View>
                        ))}
                      </View>

                      {s.status === 'pendente' && (
                        <View style={styles.solicitacaoActions}>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleRejeitar(s)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                            <Text style={styles.rejectBtnText}>Rejeitar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleAprovar(s)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={styles.approveBtnText}>Aprovar</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {s.status !== 'pendente' && (
                        <TouchableOpacity
                          style={styles.deleteCardBtn}
                          onPress={() => webAlert('Eliminar', 'Eliminar este registo?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: () => deletarSolicitacao(s.id) },
                          ])}
                        >
                          <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
                          <Text style={styles.deleteCardBtnText}>Eliminar registo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}

        {/* CURSOS */}
        {activeSection === 'cursos' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Parametrizar Cursos" icon="library" color="#A78BFA" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: 'rgba(34,211,238,0.1)', borderColor: 'rgba(34,211,238,0.3)', borderWidth: 1 }]}
                onPress={abrirRelatorio}
              >
                <Ionicons name="document-text-outline" size={15} color="#22D3EE" />
                <Text style={[styles.editBtnText, { color: '#22D3EE' }]}>Relatório</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.35)', borderWidth: 1 }]}
                onPress={() => setShowAreasModal(true)}
              >
                <Ionicons name="layers-outline" size={15} color="#A78BFA" />
                <Text style={[styles.editBtnText, { color: '#A78BFA' }]}>Áreas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: '#A78BFA22', borderColor: '#A78BFA55', borderWidth: 1 }]}
                onPress={() => abrirNovoCurso()}
              >
                <Ionicons name="add" size={15} color="#A78BFA" />
                <Text style={[styles.editBtnText, { color: '#A78BFA' }]}>Novo Curso</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(167,139,250,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', padding: 12, marginBottom: 4 }}>
              <Ionicons name="information-circle-outline" size={16} color="#A78BFA" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 18 }}>
                Os cursos parametrizados aqui são disponibilizados apenas para inscrições da <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#A78BFA' }}>10ª Classe (II Ciclo)</Text>. Organize-os por Área de Formação.
              </Text>
            </View>

            <View style={{ gap: 4 }}>
                {loadingCursos && (
                  <Text style={{ color: Colors.textMuted, textAlign: 'center', paddingVertical: 20, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
                    A carregar cursos...
                  </Text>
                )}
                {!loadingCursos && cursosList.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 10 }}>
                    <Ionicons name="school-outline" size={44} color={Colors.textMuted} />
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Nenhum curso parametrizado</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
                      {`Toque em "Novo Curso" para adicionar o primeiro curso para a 10ª Classe.`}
                    </Text>
                  </View>
                )}
                {Object.entries(
                  cursosList.filter(c => c.ativo).reduce<Record<string, Curso[]>>((acc, c) => {
                    if (!acc[c.areaFormacao]) acc[c.areaFormacao] = [];
                    acc[c.areaFormacao].push(c);
                    return acc;
                  }, {})
                ).map(([area, lista]) => (
                  <View key={area} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <Ionicons name="layers-outline" size={13} color="#A78BFA" />
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#A78BFA', flex: 1 }}>{area}</Text>
                      <View style={{ backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#A78BFA' }}>{lista.length}</Text>
                      </View>
                    </View>
                    {lista.map(c => (
                      <View key={c.id} style={styles.cursoCard}>
                        {/* Accent bar */}
                        <View style={[styles.cursoCardBar, { backgroundColor: '#A78BFA' }]} />
                        <View style={{ flex: 1, paddingLeft: 12, paddingVertical: 12, paddingRight: 4, minWidth: 0 }}>
                          {/* Chips de meta */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            {!!c.codigo && (
                              <View style={styles.cursoChip}><Text style={[styles.cursoChipText, { color: '#A78BFA' }]}>{c.codigo}</Text></View>
                            )}
                            {!!c.duracao && (
                              <View style={[styles.cursoChip, { backgroundColor: 'rgba(34,211,238,0.12)' }]}><Text style={[styles.cursoChipText, { color: '#22D3EE' }]}>{c.duracao}</Text></View>
                            )}
                            {!!c.cargaHoraria && (
                              <View style={[styles.cursoChip, { backgroundColor: 'rgba(251,191,36,0.12)' }]}><Text style={[styles.cursoChipText, { color: Colors.gold }]}>{c.cargaHoraria}h</Text></View>
                            )}
                          </View>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{c.nome}</Text>
                          {!!c.portaria && <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Portaria: {c.portaria}</Text>}
                          {!!c.descricao && <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }} numberOfLines={1}>{c.descricao}</Text>}
                        </View>
                        {/* Botões de acção */}
                        <View style={{ flexDirection: 'row', gap: 6, paddingRight: 12, alignSelf: 'center' }}>
                          <TouchableOpacity onPress={() => abrirGestaoDisciplinas(c)} style={styles.cursoActionBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="book-outline" size={16} color={Colors.info} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => abrirEditarCurso(c)} style={[styles.cursoActionBtn, { borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '0F' }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="pencil-outline" size={16} color={Colors.gold} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => {
                            webAlert('Opções do Curso', `O que deseja fazer com "${c.nome}"?`, [
                              { text: 'Cancelar', style: 'cancel' },
                              { text: c.ativo ? 'Desactivar' : 'Activar', onPress: () => toggleCursoAtivo(c) },
                              { text: 'Eliminar permanentemente', style: 'destructive', onPress: () => deleteCurso(c.id) },
                            ]);
                          }} style={[styles.cursoActionBtn, { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '0A' }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
                {cursosList.filter(c => !c.ativo).length > 0 && (
                  <View style={{ marginTop: 6, opacity: 0.5 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 8 }}>
                      INACTIVOS ({cursosList.filter(c => !c.ativo).length})
                    </Text>
                    {cursosList.filter(c => !c.ativo).map(c => (
                      <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 12, marginBottom: 6 }}>
                        <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{c.nome}</Text>
                        <TouchableOpacity onPress={() => toggleCursoAtivo(c)} style={[styles.exportBtn, { padding: 8, marginBottom: 0, minWidth: 0 }]}>
                          <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
          </View>
        )}

        {/* DISCIPLINAS */}
        {activeSection === 'disciplinas' && (
          <View style={styles.card}>
            <SectionHeader title="Catálogo de Disciplinas" icon="book" color="#22D3EE" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,211,238,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(34,211,238,0.2)', padding: 12, marginBottom: 16 }}>
              <Ionicons name="information-circle-outline" size={16} color="#22D3EE" />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 18 }}>
                Aqui gere o catálogo central de disciplinas do sistema. Depois de criar as disciplinas, associe-as aos cursos na secção <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#A78BFA' }}>Cursos</Text>.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(main)/disciplinas' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(34,211,238,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', padding: 18 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(34,211,238,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="book" size={22} color="#22D3EE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Gerir Disciplinas</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 }}>Criar, editar e organizar o catálogo de disciplinas</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#22D3EE" />
            </TouchableOpacity>
            <View style={{ marginTop: 12, gap: 8 }}>
              {[
                { icon: 'add-circle-outline', color: '#22D3EE', text: 'Adicionar novas disciplinas ao catálogo' },
                { icon: 'layers-outline', color: '#A78BFA', text: 'Organizar por área de conhecimento' },
                { icon: 'link-outline', color: Colors.success, text: 'Depois associe as disciplinas a cada Curso (secção Cursos)' },
                { icon: 'grid-outline', color: Colors.warning, text: 'As disciplinas aparecem automaticamente nas turmas e na grelha curricular' },
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}>
                  <Ionicons name={item.icon as any} size={15} color={item.color} style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 18 }}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ESCOLA */}
        {activeSection === 'escola' && user?.role === 'ceo' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Configuração Escolar" icon="school" color={Colors.info} />
              <TouchableOpacity onPress={() => { setTempEscola(escola); setEditEscola(true); }} style={styles.editBtn}>
                <Ionicons name="pencil" size={15} color={Colors.gold} />
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.escolaLogo}>
              <View style={styles.logoPlaceholder}>
                {logoUrlAdmin
                  ? <Image source={{ uri: logoUrlAdmin }} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="contain" />
                  : <Ionicons name="school" size={32} color={Colors.gold} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.escolaNome}>{escola.nome}</Text>
                <Text style={styles.escolaCodigo}>Código MED: {escola.codigoMED}</Text>
              </View>
            </View>

            {/* Upload de Logotipo e Favicon (também acessível nesta vista) */}
            <View style={{ marginTop: 14, gap: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Imagens da Escola</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={18} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Logotipo</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{logoUrlAdmin ? 'Logotipo personalizado activo' : 'A usar ícone predefinido'}</Text>
                </View>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.gold + '60' }}
                  onPress={escolherLogoAdmin}
                  disabled={aCarregarLogoAdmin}
                >
                  <Ionicons name="cloud-upload-outline" size={14} color={Colors.gold} />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold }}>{aCarregarLogoAdmin ? 'A enviar...' : (logoUrlAdmin ? 'Trocar' : 'Carregar')}</Text>
                </TouchableOpacity>
                {logoUrlAdmin ? (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.danger + '60' }}
                    onPress={async () => { await api.put('/api/config', { empresaLogo: '' }); setLogoUrlAdmin(undefined); alertSucesso('Logotipo removido', 'O logotipo foi removido com sucesso.'); }}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: (faviconActivoAdmin ? Colors.gold : Colors.textMuted) + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="globe-outline" size={18} color={faviconActivoAdmin ? Colors.gold : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Favicon (ícone do browser)</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{faviconActivoAdmin ? 'Favicon personalizado activo' : 'A usar ícone predefinido'} · PNG/ICO recomendado 32×32</Text>
                </View>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.gold + '60' }}
                  onPress={escolherFaviconAdmin}
                  disabled={aCarregarFaviconAdmin}
                >
                  <Ionicons name="cloud-upload-outline" size={14} color={Colors.gold} />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold }}>{aCarregarFaviconAdmin ? 'A enviar...' : (faviconActivoAdmin ? 'Trocar' : 'Carregar')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {[
              { label: 'Morada', value: escola.morada },
              { label: 'Município', value: escola.municipio },
              { label: 'Província', value: escola.provincia },
              { label: 'Telefone', value: escola.telefone },
              { label: 'Email Institucional', value: escola.email },
              { label: 'Director Geral', value: escola.directorGeral, hint: 'usado em {{NOME_DIRECTOR}}' },
              { label: 'Director Pedagógico', value: escola.subdirectorPedagogico, hint: 'usado em {{NOME_SUBDIRECTOR_PEDAGOGICO}} / {{NOME_DIRECTOR_PEDAGOGICO}}' },
            ].map(row => {
              const isEmpty = !row.value || !String(row.value).trim();
              return (
                <View key={row.label} style={styles.infoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    {row.hint ? (
                      <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 2 }}>{row.hint}</Text>
                    ) : null}
                  </View>
                  {isEmpty ? (
                    <View style={{ backgroundColor: '#F59E0B22', borderColor: '#F59E0B', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>Por preencher</Text>
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>{row.value}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ANOS ACADÉMICOS */}
        {activeSection === 'anos' && (
          <View style={styles.card}>
            <SectionHeader title="Calendário do Ano Lectivo" icon="time" color={"#9B59B6"} />
            <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Define o mês civil em que o vosso ano lectivo começa. Em Angola (MED) o ano lectivo começa em <Text style={{ color: Colors.gold, fontWeight: '700' }}>Setembro</Text> e termina em Julho/Agosto. Ao criar um novo ano, os 3 trimestres são pré-preenchidos com as datas-padrão do MED.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[
                { v: 9, label: 'Setembro (Angola/PALOP/Europa)' },
                { v: 1, label: 'Janeiro (ano civil)' },
                { v: 2, label: 'Fevereiro (Brasil)' },
                { v: 8, label: 'Agosto (EUA)' },
              ].map(opt => {
                const sel = (config.mesInicioAnoLetivo || 9) === opt.v;
                return (
                  <TouchableOpacity
                    key={opt.v}
                    onPress={() => updateConfig({ mesInicioAnoLetivo: opt.v })}
                    style={{
                      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6,
                      borderWidth: 1, borderColor: sel ? Colors.primary : Colors.border,
                      backgroundColor: sel ? Colors.primary + '22' : Colors.backgroundCard,
                    }}
                  >
                    <Text style={{ color: sel ? Colors.primary : Colors.text, fontSize: 12, fontWeight: sel ? '700' : '500' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Anos Académicos" icon="calendar" color={"#9B59B6"} />
              <TouchableOpacity style={styles.addBtn} onPress={() => {
                // Pré-sugere o próximo ano lectivo
                const sug = sugerirProximoAno(anos.map(a => a.ano), Number(config.mesInicioAnoLetivo) || MES_INICIO_PADRAO);
                const r = rangeAnoPadrao(sug, Number(config.mesInicioAnoLetivo) || MES_INICIO_PADRAO);
                setFormAno({ ano: sug, dataInicio: r.dataInicio, dataFim: r.dataFim });
                setShowNovoAno(true);
              }}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Novo</Text>
              </TouchableOpacity>
            </View>
            {anos.map(ano => {
              const isExpanded = expandedAnoId === ano.id;
              const epocas = ano.epocasExame ?? {};
              const temEpocas = ['normal','recurso','especial'].some(k => {
                const ep = (epocas as any)[k];
                return ep && (ep.dataInicio || ep.dataFim);
              });
              return (
              <View key={ano.id} style={[styles.anoItem, ano.ativo && styles.anoItemActive]}>

                {/* ── Linha principal: info + acções ── */}
                <View style={styles.anoItemHeader}>
                  <View style={styles.anoInfo}>
                    <View style={styles.anoTitleRow}>
                      <Text style={[styles.anoNum, ano.ativo && { color: Colors.gold }]}>{ano.ano}</Text>
                      {ano.ativo && <View style={styles.atualBadge}><Text style={styles.atualText}>Activo</Text></View>}
                    </View>
                    <Text style={styles.anoDates}>{ano.dataInicio} — {ano.dataFim}</Text>
                    <View style={styles.trimRow}>
                      {ano.trimestres.map(t => (
                        <View key={t.numero} style={[styles.trimBadge, t.ativo && styles.trimBadgeActive]}>
                          <Text style={[styles.trimText, t.ativo && styles.trimTextActive]}>{t.numero}º Trim.</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.anoActions}>
                    <TouchableOpacity
                      onPress={() => setExpandedAnoId(isExpanded ? null : ano.id)}
                      style={[styles.expandAnoBtn, isExpanded && { backgroundColor: Colors.primary + '30', borderColor: Colors.primary + '60' }]}
                    >
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={isExpanded ? Colors.primary : Colors.textMuted} />
                    </TouchableOpacity>
                    {ano.ativo ? (
                      <TouchableOpacity
                        style={[styles.ativarBtn, { backgroundColor: Colors.warning + '22' }]}
                        onPress={() => webAlert('Desactivar Ano', `Deseja desactivar o ano ${ano.ano}? Isso pode limitar algumas funcionalidades até que outro ano seja activado.`, [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Desactivar', onPress: () => updateAno(ano.id, { ativo: false }) },
                        ])}
                      >
                        <Text style={[styles.ativarText, { color: Colors.warning }]}>Desactivar</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.ativarBtn}
                        onPress={() => webAlert('Activar Ano', `Activar ${ano.ano}?`, [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Activar', onPress: () => ativarAno(ano.id) },
                        ])}
                      >
                        <Text style={styles.ativarText}>Activar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => setConfirmDeleteAno({ visible: true, ano, loading: false, erro: null })}
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Conteúdo expandido ── */}
                {isExpanded && (
                  <View style={styles.anoExpandedWrap}>

                    {/* Trimestres */}
                    <Text style={styles.anoExpandLabel}>📅 Períodos Lectivos</Text>
                    {ano.trimestres.length === 0 && (
                      <Text style={styles.anoExpandEmpty}>Nenhum trimestre configurado.</Text>
                    )}
                    {ano.trimestres.map(t => (
                      <View key={t.numero} style={[styles.trimDetalheRow, t.ativo && styles.trimDetalheRowAtivo]}>
                        <View style={[styles.trimDetalheNumBadge, t.ativo && { backgroundColor: Colors.info + '33' }]}>
                          <Text style={[styles.trimDetalheNumText, t.ativo && { color: Colors.info }]}>{t.numero}º</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.trimDetalheDates}>
                              {t.dataInicio || '—'} → {t.dataFim || '—'}
                            </Text>
                            {t.ativo && (
                              <View style={styles.trimDetalheActivoBadge}>
                                <Text style={styles.trimDetalheActivoText}>Em curso</Text>
                              </View>
                            )}
                          </View>
                          {(t.dataInicioExames || t.dataFimExames) && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="school-outline" size={11} color={Colors.warning} />
                              <Text style={styles.trimDetalheExameDates}>
                                Exames: {t.dataInicioExames || '—'} → {t.dataFimExames || '—'}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}

                    {/* Épocas de Exame */}
                    {temEpocas && (
                      <>
                        <View style={styles.anoExpandDivider} />
                        <Text style={styles.anoExpandLabel}>🎓 Épocas de Exame</Text>
                        {(['normal','recurso','especial'] as const).map(key => {
                          const ep = epocas[key];
                          if (!ep || (!ep.dataInicio && !ep.dataFim)) return null;
                          const labelMap = { normal: 'Época Normal', recurso: 'Época de Recurso', especial: 'Época Especial' };
                          const colorMap = { normal: Colors.success, recurso: Colors.warning, especial: Colors.info };
                          const cor = colorMap[key];
                          return (
                            <View key={key} style={styles.epocaRow}>
                              <View style={[styles.epocaBadge, { backgroundColor: cor + '22', borderColor: cor + '55' }]}>
                                <Text style={[styles.epocaBadgeText, { color: cor }]}>{labelMap[key]}</Text>
                              </View>
                              <View style={{ flex: 1, gap: 2 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                                  <Text style={styles.epocaDates}>{ep.dataInicio || '—'} → {ep.dataFim || '—'}</Text>
                                </View>
                                {!!ep.observacoes && (
                                  <Text style={styles.epocaObs}>ℹ️ {ep.observacoes}</Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}

                    {!temEpocas && (
                      <Text style={styles.anoExpandEmpty}>Sem épocas de exame configuradas — edite no Calendário Académico.</Text>
                    )}
                  </View>
                )}
              </View>
              );
            })}
          </View>
        )}

        {/* UTILIZADORES */}
        {activeSection === 'usuarios' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Gestão de Utilizadores" icon="people" color={Colors.gold} />
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowNovoUser(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Novo</Text>
              </TouchableOpacity>
            </View>

            {/* Barra de Pesquisa */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
              paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
            }}>
              <StableSearchInput
                value={searchUser}
                onChangeText={setSearchUser}
                inputStyle={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text }}
                placeholder="Pesquisar por nome, e-mail ou perfil..."
                iconColor={Colors.textMuted}
              />
            </View>

            {/* ── Banner: perfis únicos activos ─────────────────────── */}
            {(() => {
              const directorActivo = users.find(u => u.role === 'director' && (u as any).ativo !== false);
              const pedagogicoActivo = users.find(u => u.role === 'pedagogico' && (u as any).ativo !== false);
              if (!directorActivo && !pedagogicoActivo) return null;
              return (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {directorActivo && (
                    <View style={{
                      flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: (ROLE_COLOR['director'] || Colors.accent) + '18',
                      borderWidth: 1, borderColor: (ROLE_COLOR['director'] || Colors.accent) + '44',
                      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                    }}>
                      <View style={{
                        width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: (ROLE_COLOR['director'] || Colors.accent) + '33',
                      }}>
                        <Ionicons name="shield-checkmark" size={17} color={ROLE_COLOR['director'] || Colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: ROLE_COLOR['director'] || Colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Director</Text>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>{directorActivo.nome}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }} numberOfLines={1}>{directorActivo.email}</Text>
                      </View>
                    </View>
                  )}
                  {pedagogicoActivo && (
                    <View style={{
                      flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 10,
                      backgroundColor: (ROLE_COLOR['pedagogico'] || '#14B8A6') + '18',
                      borderWidth: 1, borderColor: (ROLE_COLOR['pedagogico'] || '#14B8A6') + '44',
                      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                    }}>
                      <View style={{
                        width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: (ROLE_COLOR['pedagogico'] || '#14B8A6') + '33',
                      }}>
                        <Ionicons name="school" size={17} color={ROLE_COLOR['pedagogico'] || '#14B8A6'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: ROLE_COLOR['pedagogico'] || '#14B8A6', textTransform: 'uppercase', letterSpacing: 0.5 }}>Subdirector Pedagógico</Text>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>{pedagogicoActivo.nome}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }} numberOfLines={1}>{pedagogicoActivo.email}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}

            {(() => {
              const q = searchUser.toLowerCase().trim();
              const filtered = q
                ? users.filter(u =>
                    u.nome.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q) ||
                    getRoleLabel(u.role, (u as any).genero).toLowerCase().includes(q)
                  )
                : users;
              if (filtered.length === 0) return (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={30} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>
                    {q ? 'Nenhum utilizador encontrado' : 'Nenhum utilizador registado'}
                  </Text>
                </View>
              );
              return filtered.map(u => (
                <View key={u.id} style={styles.userItem}>
                  <View style={[styles.userAvatar, { backgroundColor: (ROLE_COLOR[u.role] || Colors.textMuted) + '33' }]}>
                    <Text style={[styles.userAvatarText, { color: ROLE_COLOR[u.role] || Colors.textMuted }]}>
                      {u.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.userName} numberOfLines={1}>{u.nome}</Text>
                      {u.role === 'director' && (
                        <Ionicons name="shield-checkmark" size={13} color={ROLE_COLOR['director'] || Colors.accent} />
                      )}
                      {u.role === 'pedagogico' && (
                        <Ionicons name="school" size={13} color={ROLE_COLOR['pedagogico'] || '#14B8A6'} />
                      )}
                    </View>
                    <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                    <View style={[styles.roleBadge, { alignSelf: 'flex-start', marginTop: 4, backgroundColor: (ROLE_COLOR[u.role] || Colors.textMuted) + '22' }]}>
                      <Text style={[styles.roleText, { color: ROLE_COLOR[u.role] || Colors.textMuted }]}>{getRoleLabel(u.role, (u as any).genero)}</Text>
                    </View>
                  </View>
                  {u.role === 'ceo' ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, marginLeft: 4, borderRadius: 8, backgroundColor: Colors.gold + '18', flexShrink: 0 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>Protegido</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', flexShrink: 0 }}>
                      <TouchableOpacity style={{ padding: 6, marginLeft: 4, opacity: canManageUsers ? 1 : 0.45 }} onPress={() => abrirEdicaoUser(u)}>
                        <Ionicons name="pencil-outline" size={15} color={Colors.info} />
                      </TouchableOpacity>
                      <TouchableOpacity style={{ padding: 6, marginLeft: 2, opacity: canManageUsers ? 1 : 0.45 }} onPress={() => confirmarEliminarUser(u.id, u.nome)}>
                        <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ));
            })()}
          </View>
        )}

        {/* CONFIGURAÇÕES GERAIS */}
        {activeSection === 'config' && (
          <View style={{ gap: 14, paddingBottom: 0 }}>

            {/* ── PESQUISA RÁPIDA ── */}
            <View style={{ marginBottom: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8 }}>
                <Ionicons name="search" size={16} color={Colors.textMuted} />
                <TextInput
                  style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text, outlineStyle: 'none' } as any}
                  placeholder="Pesquisar configurações..."
                  placeholderTextColor={Colors.textMuted}
                  value={configSearch}
                  onChangeText={setConfigSearch}
                  returnKeyType="search"
                />
                {configSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setConfigSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              {configSearch.length > 0 && (() => {
                const q = configSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const CEO_ONLY_SECTIONS = new Set(['cfg-propinas', 'cfg-pagamentos', 'cfg-subscricao', 'cfg-ia']);
                const matches = CONFIG_SECTIONS.filter(s => {
                  if (CEO_ONLY_SECTIONS.has(s.id) && user?.role !== 'ceo') return false;
                  return [s.label, ...s.keywords].some(k =>
                    k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
                  );
                });
                return (
                  <View style={{ marginTop: 8 }}>
                    {matches.length === 0 ? (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 10 }}>
                        Nenhuma configuração encontrada
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {matches.map(s => (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => {
                              setConfigSearch('');
                              if (typeof document !== 'undefined') {
                                setTimeout(() => {
                                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 80);
                              }
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: s.color + '18', borderWidth: 1, borderColor: s.color + '44' }}
                          >
                            <Ionicons name={s.icon as any} size={13} color={s.color} />
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: s.color }}>{s.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>

            {/* ── MASTER SWITCH: PROPINAS (apenas CEO) ── */}
            {user?.role === 'ceo' && <View nativeID="cfg-propinas" style={[styles.card, { borderWidth: 2, borderColor: config.propinaHabilitada ? Colors.success + '60' : Colors.danger + '60' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: config.propinaHabilitada ? Colors.success + '20' : Colors.danger + '20' }}>
                  <Ionicons name="cash" size={24} color={config.propinaHabilitada ? Colors.success : Colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Propinas e Pagamentos</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                    Controla se esta escola cobra propinas. Quando desactivado, todos os alertas de dívida, cálculos de atraso e opções de pagamento são removidos do sistema.
                  </Text>
                </View>
              </View>

              <View style={styles.configToggleRow}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.propinaHabilitada ? Colors.success + '22' : Colors.danger + '22' }]}>
                    <Ionicons name={config.propinaHabilitada ? 'checkmark-circle' : 'close-circle'} size={18} color={config.propinaHabilitada ? Colors.success : Colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Cobrança de Propinas</Text>
                    <Text style={[styles.configToggleDesc, { color: config.propinaHabilitada ? Colors.success : Colors.danger }]}>
                      {config.propinaHabilitada
                        ? 'ACTIVO — A escola cobra propinas mensais'
                        : 'INACTIVO — Esta escola não cobra propinas'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={config.propinaHabilitada}
                  onValueChange={v => updateConfig({ propinaHabilitada: v })}
                  trackColor={{ false: Colors.danger + '88', true: Colors.success + '88' }}
                  thumbColor={config.propinaHabilitada ? Colors.success : Colors.danger}
                />
              </View>

              {config.propinaHabilitada && (() => {
                const temJulho = (config.mesesAnoAcademico ?? []).includes(7);
                const toggleJulho = (v: boolean) => {
                  const base = (config.mesesAnoAcademico ?? [9,10,11,12,1,2,3,4,5,6]).filter((m: number) => m !== 7);
                  updateConfig({ mesesAnoAcademico: v ? [...base, 7] : base });
                };
                return (
                  <View style={[styles.configToggleRow, { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border + '55', paddingTop: 12 }]}>
                    <View style={styles.configToggleLeft}>
                      <View style={[styles.configToggleIcon, { backgroundColor: temJulho ? Colors.info + '22' : Colors.border }]}>
                        <Ionicons name="calendar-outline" size={18} color={temJulho ? Colors.info : Colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.configToggleLabel}>Propina em Julho</Text>
                        <Text style={[styles.configToggleDesc, { color: temJulho ? Colors.info : Colors.textMuted }]}>
                          {temJulho
                            ? 'ACTIVO — Julho incluído (11 meses)'
                            : 'INACTIVO — Ano lectivo de 10 meses (Set–Jun)'}
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={temJulho}
                      onValueChange={toggleJulho}
                      trackColor={{ false: Colors.border, true: Colors.info + '88' }}
                      thumbColor={temJulho ? Colors.info : Colors.textMuted}
                    />
                  </View>
                );
              })()}

              {!config.propinaHabilitada && (
                <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle" size={16} color={Colors.warning} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 16 }}>
                    Com as propinas desactivadas: os encarregados não verão alertas de dívida, o portal financeiro não mostrará cálculos de atraso, e o boletim de propinas indicará que a escola não cobra mensalidades.
                  </Text>
                </View>
              )}
            </View>}

            {/* ── PERÍODOS E INSCRIÇÕES ── */}
            <View nativeID="cfg-periodos" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar" size={14} color={Colors.info} />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.info, letterSpacing: 1 }}>PERÍODOS E INSCRIÇÕES</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.info + '30', borderRadius: 1 }} />
            </View>

            {/* Período de Inscrições */}
            <View nativeID="cfg-inscricoes" style={styles.card}>
              <SectionHeader title="Período de Inscrições" icon="person-add" />
              <Text style={styles.configSectionDesc}>
                Controla se o botão de solicitação de matrícula está visível no ecrã de Login.
                Apenas o PCA, Administrador ou Director devem activar este período.
              </Text>
              <View style={styles.configToggleRow}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.inscricoesAbertas ? '#22C55E22' : Colors.border }]}>
                    <Ionicons name="person-add-outline" size={18} color={config.inscricoesAbertas ? '#22C55E' : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Inscrições Online</Text>
                    <Text style={styles.configToggleDesc}>
                      {config.inscricoesAbertas
                        ? 'Abertas — o botão "Solicitar Matrícula" está visível no Login'
                        : 'Fechadas — o botão não aparece no ecrã de Login'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!!config.inscricoesAbertas}
                  onValueChange={v => {
                    updateConfig({ inscricoesAbertas: v });
                    webAlert(
                      v ? 'Inscrições Abertas' : 'Inscrições Fechadas',
                      v
                        ? 'Os encarregados já podem solicitar matrícula pelo ecrã de Login.'
                        : 'O botão de matrícula foi removido do ecrã de Login.',
                    );
                  }}
                  thumbColor={config.inscricoesAbertas ? '#22C55E' : Colors.textMuted}
                  trackColor={{ false: Colors.border, true: '#22C55E55' }}
                />
              </View>

              {/* Datas do período */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Data de Início</Text>
                  <DateInput
                    style={styles.input}
                    value={cn(draftInscricoes, 'inscricaoDataInicio') ?? ''}
                    onChangeText={v => setDraftInscricoes(d => ({ ...d, inscricaoDataInicio: v || undefined }))}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Data de Fim</Text>
                  <DateInput
                    style={styles.input}
                    value={cn(draftInscricoes, 'inscricaoDataFim') ?? ''}
                    onChangeText={v => setDraftInscricoes(d => ({ ...d, inscricaoDataFim: v || undefined }))}
                  />
                </View>
              </View>
              <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 6 }}>
                As datas são exibidas no ecrã de Login quando as inscrições estão abertas.
              </Text>
              {Object.keys(draftInscricoes).length > 0 && (
                <TouchableOpacity
                  style={[styles.saveBtn, { marginTop: 12, opacity: categorySaving === 'inscricoes' ? 0.6 : 1 }]}
                  disabled={categorySaving === 'inscricoes'}
                  onPress={() => guardarCategoria('inscricoes', draftInscricoes, () => setDraftInscricoes({}))}
                >
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>{categorySaving === 'inscricoes' ? 'A guardar...' : 'Guardar Período de Inscrições'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Avaliação de Professores — Período ───────────────────────── */}
            <View nativeID="cfg-avalprof" style={styles.card}>
              <SectionHeader title="Avaliação de Professores" icon="star" />
              <Text style={styles.configSectionDesc}>
                Abre ou fecha o período de avaliação distribuída. Quando activo, secretaria, RH e alunos podem submeter as suas avaliações. Ao abrir, são enviadas notificações automáticas.
              </Text>

              {/* Toggle abrir/fechar período */}
              <View style={styles.configToggleRow}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.avaliacaoPeriodoAtivo ? Colors.success + '22' : Colors.border }]}>
                    <MaterialCommunityIcons name="star-check-outline" size={18} color={config.avaliacaoPeriodoAtivo ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Período de Avaliação</Text>
                    <Text style={styles.configToggleDesc}>
                      {config.avaliacaoPeriodoAtivo
                        ? `Aberto — ${config.avaliacaoPeriodoLabel || 'Avaliação em curso'}`
                        : 'Fechado — avaliações não aceites'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!!config.avaliacaoPeriodoAtivo}
                  onValueChange={async (v) => {
                    await updateConfig({ avaliacaoPeriodoAtivo: v });
                    if (v) {
                      webAlert('Período Aberto', 'O período de avaliação de professores foi aberto. As notificações serão enviadas.');
                      try {
                        await api.post('/api/avaliacoes-parciais/notificar', { periodoLabel: config.avaliacaoPeriodoLabel || 'Avaliação de Professores' });
                      } catch (_) {}
                    } else {
                      webAlert('Período Fechado', 'O período de avaliação de professores foi encerrado.');
                    }
                  }}
                  thumbColor={config.avaliacaoPeriodoAtivo ? Colors.success : Colors.textMuted}
                  trackColor={{ false: Colors.border, true: Colors.success + '55' }}
                />
              </View>

              {/* Label do período */}
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Designação do Período</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  value={cn(draftAvalProf, 'avaliacaoPeriodoLabel') ?? ''}
                  onChangeText={t => setDraftAvalProf(d => ({ ...d, avaliacaoPeriodoLabel: t }))}
                  placeholder="Ex: Avaliação 1º Trimestre 2025"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Data início e fim */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Data de Início</Text>
                  <DateInput
                    style={styles.input}
                    value={cn(draftAvalProf, 'avaliacaoPeriodoInicio') ?? ''}
                    onChangeText={t => setDraftAvalProf(d => ({ ...d, avaliacaoPeriodoInicio: t }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Data de Fim</Text>
                  <DateInput
                    style={styles.input}
                    value={cn(draftAvalProf, 'avaliacaoPeriodoFim') ?? ''}
                    onChangeText={t => setDraftAvalProf(d => ({ ...d, avaliacaoPeriodoFim: t }))}
                  />
                </View>
              </View>
              {Object.keys(draftAvalProf).length > 0 && (
                <TouchableOpacity
                  style={[styles.saveBtn, { marginTop: 12, opacity: categorySaving === 'avalProf' ? 0.6 : 1 }]}
                  disabled={categorySaving === 'avalProf'}
                  onPress={() => guardarCategoria('avalProf', draftAvalProf, () => setDraftAvalProf({}))}
                >
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>{categorySaving === 'avalProf' ? 'A guardar...' : 'Guardar Período de Avaliação'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── ACADÉMICO E NOTAS ── */}
            <View nativeID="cfg-academico" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.warning + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="school" size={14} color={Colors.warning} />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.warning, letterSpacing: 1 }}>ACADÉMICO E NOTAS</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.warning + '30', borderRadius: 1 }} />
            </View>

            {/* 13ª Classe — Controlo Global */}
            <View nativeID="cfg-decima-terceira" style={styles.card}>
              <SectionHeader title="13ª Classe" icon="school-outline" />
              <Text style={styles.configSectionDesc}>
                Activa ou desactiva a 13ª Classe em toda a aplicação. Quando desactivado, a 13ª Classe deixa de aparecer em turmas, dropdowns de classe, notas, admissão, certificados e qualquer outro ecrã — apenas classes até à 12ª ficam visíveis.
              </Text>
              <View style={styles.configToggleRow}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.temDecimaTermeira !== false ? Colors.primary + '22' : Colors.border }]}>
                    <Ionicons name="school-outline" size={18} color={config.temDecimaTermeira !== false ? Colors.primary : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Escola com 13ª Classe</Text>
                    <Text style={styles.configToggleDesc}>
                      {config.temDecimaTermeira !== false
                        ? 'Activo — 13ª Classe visível em toda a aplicação'
                        : 'Desactivado — apenas classes até à 12ª são apresentadas'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={config.temDecimaTermeira !== false}
                  onValueChange={v => {
                    updateConfig({ temDecimaTermeira: v });
                    webAlert(
                      v ? '13ª Classe Activada' : '13ª Classe Desactivada',
                      v
                        ? 'A 13ª Classe voltará a aparecer em todos os ecrãs da aplicação.'
                        : 'A 13ª Classe ficará oculta em toda a aplicação. Apenas classes até à 12ª serão apresentadas.',
                    );
                  }}
                  thumbColor={config.temDecimaTermeira !== false ? Colors.primary : Colors.textMuted}
                  trackColor={{ false: Colors.border, true: Colors.primary + '55' }}
                />
              </View>
            </View>

            {/* Número de Avaliações por Período */}
            <View style={styles.card}>
              <SectionHeader title="Número de Avaliações por Período" icon="stats-chart" color={Colors.warning} />
              <Text style={styles.configSectionDesc}>
                Define quantas avaliações (AVAL) existem por período. Este valor afecta directamente as colunas da pauta, o cálculo da MAC e a folha de notas dos professores.
              </Text>
              <Text style={styles.configFieldLabel}>Número de Avaliações</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
                  const active = (config.numAvaliacoes ?? 4) === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => updateConfig({ numAvaliacoes: n })}
                      style={{
                        width: 52, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: active ? Colors.warning : Colors.inputBg,
                        borderWidth: 1.5,
                        borderColor: active ? Colors.warning : Colors.border,
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: active ? '#fff' : Colors.text }}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 10 }}>
                Valor actual: <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.warning }}>{config.numAvaliacoes ?? 4} avaliações por período</Text>
              </Text>
            </View>

            {/* ── Escala de Avaliação (1-5 ou 0-20) ── */}
            <View style={styles.card}>
              <SectionHeader title="Escala de Avaliação" icon="bar-chart-outline" color="#7c3aed" />
              <Text style={styles.configSectionDesc}>
                Define a escala numérica usada pelos professores para lançar notas. Afecta a validação de todas as pautas e avaliações da escola.
              </Text>

              {/* Pré-sets rápidos */}
              <Text style={[styles.configFieldLabel, { marginBottom: 8 }]}>Escala pré-definida</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {[
                  { label: '1 — 5 valores', sub: 'Padrão Angola (MED)', min: 1, max: 5 },
                  { label: '0 — 20 valores', sub: 'Sistema europeu', min: 0, max: 20 },
                ].map(preset => {
                  const isActive = (config.macMin ?? 1) === preset.min && (config.macMax ?? 5) === preset.max;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      onPress={() => {
                        setMacMinText(null);
                        setMacMaxText(null);
                        updateConfig({ macMin: preset.min, macMax: preset.max });
                      }}
                      style={{
                        flex: 1, borderRadius: 12, padding: 12,
                        backgroundColor: isActive ? '#7c3aed15' : Colors.inputBg,
                        borderWidth: 2, borderColor: isActive ? '#7c3aed' : Colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: isActive ? '#7c3aed' : Colors.text }}>{preset.label}</Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: isActive ? '#7c3aed99' : Colors.textMuted, marginTop: 2 }}>{preset.sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Valores personalizados */}
              <Text style={[styles.configFieldLabel, { marginBottom: 8 }]}>Ou definir valores personalizados</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 4 }}>Nota mínima</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 18 }]}
                    keyboardType="numeric"
                    value={macMinText !== null ? macMinText : String(config.macMin ?? 1)}
                    onChangeText={v => setMacMinText(v)}
                    onBlur={() => {
                      const n = parseInt(macMinText ?? '', 10);
                      if (!isNaN(n) && n >= 0 && n < (config.macMax ?? 5)) {
                        updateConfig({ macMin: n });
                      }
                      setMacMinText(null);
                    }}
                  />
                </View>
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 18 }}>
                  <Text style={{ fontSize: 20, color: Colors.textMuted, fontFamily: 'Inter_700Bold' }}>—</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 4 }}>Nota máxima</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 18 }]}
                    keyboardType="numeric"
                    value={macMaxText !== null ? macMaxText : String(config.macMax ?? 5)}
                    onChangeText={v => setMacMaxText(v)}
                    onBlur={() => {
                      const n = parseInt(macMaxText ?? '', 10);
                      if (!isNaN(n) && n > (config.macMin ?? 1)) {
                        updateConfig({ macMax: n });
                      }
                      setMacMaxText(null);
                    }}
                  />
                </View>
              </View>

              <View style={{ marginTop: 12, padding: 10, backgroundColor: '#7c3aed10', borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed22' }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#7c3aed' }}>
                  Escala actual: <Text style={{ fontFamily: 'Inter_700Bold' }}>{config.macMin ?? 1} a {config.macMax ?? 5} valores</Text>
                  {'  ·  '}Os professores só poderão lançar notas dentro deste intervalo.
                </Text>
              </View>
            </View>

            {/* ── Fórmulas do Decreto Executivo nº 04/2026 ── */}
            {(() => {
              const decretoActivo = !!(config as any).usarFormulasDecreto;
              const percMacD: number = (config as any).percMacDecreto ?? 50;
              const percMT3_9a: number = (config as any).percMT3Exame9aDecreto ?? 60;
              const percMT3_12a: number = (config as any).percMT3Exame12aDecreto ?? 50;
              const btnStyle = (active: boolean, disabled?: boolean) => ({
                minWidth: 56, height: 38, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const,
                paddingHorizontal: 10,
                backgroundColor: active ? '#1d4ed8' : disabled ? Colors.surface : Colors.inputBg,
                borderWidth: 1.5, borderColor: active ? '#1d4ed8' : disabled ? Colors.border : Colors.border,
                opacity: disabled ? 0.45 : 1,
              });
              const btnTxt = (active: boolean) => ({
                fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular', fontSize: 13,
                color: active ? '#fff' : Colors.text,
              });
              return (
                <View nativeID="cfg-decreto" style={[styles.card, { borderWidth: 2, borderColor: decretoActivo ? '#1d4ed844' : Colors.border }]}>
                  {/* Cabeçalho com badge de estado */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: decretoActivo ? '#1d4ed820' : Colors.surface }}>
                      <Ionicons name="document-text" size={20} color={decretoActivo ? '#1d4ed8' : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text }}>Fórmulas de Cálculo de Notas</Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 1 }}>
                        Decreto Executivo nº 04/2026 · Anexo III
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: decretoActivo ? '#1d4ed815' : '#fef3c715', borderWidth: 1, borderColor: decretoActivo ? '#1d4ed844' : '#fbbf2444' }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: decretoActivo ? '#1d4ed8' : '#92400e' }}>
                        {decretoActivo ? 'DECRETO ACTIVO' : 'MODO CLÁSSICO'}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.configSectionDesc, { marginBottom: 14 }]}>
                    Seleccione o modo de cálculo. Os pesos são configuráveis caso as normas sejam alteradas no futuro. As fórmulas abaixo são sempre visíveis para referência.
                  </Text>

                  {/* Toggle principal */}
                  <View style={styles.configToggleRow}>
                    <View style={[styles.configToggleIcon, { backgroundColor: decretoActivo ? '#1d4ed822' : Colors.border }]}>
                      <Ionicons name="document-text-outline" size={18} color={decretoActivo ? '#1d4ed8' : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.configToggleLabel}>Aplicar Fórmulas do Decreto 04/2026</Text>
                      <Text style={styles.configToggleSub}>
                        {decretoActivo
                          ? 'Activo — pesos do Anexo III aplicados a todas as pautas'
                          : 'Desactivado — a usar pesos personalizados (modo clássico)'}
                      </Text>
                    </View>
                    <Switch
                      value={decretoActivo}
                      onValueChange={v => updateConfig({ usarFormulasDecreto: v } as any)}
                      trackColor={{ false: Colors.border, true: '#1d4ed855' }}
                      thumbColor={decretoActivo ? '#1d4ed8' : Colors.textMuted}
                    />
                  </View>

                  {/* ── Fórmula 1 — Média Trimestral ── */}
                  <View style={{ marginTop: 16, padding: 14, backgroundColor: decretoActivo ? '#1d4ed818' : Colors.surface, borderRadius: 10, borderWidth: 1.5, borderColor: decretoActivo ? '#1d4ed855' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: decretoActivo ? '#1d4ed830' : Colors.border }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>§2 · T1 e T2</Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: decretoActivo ? '#93c5fd' : Colors.textSecondary, flex: 1 }}>
                        Média Trimestral (MT)
                      </Text>
                    </View>
                    <View style={{ backgroundColor: decretoActivo ? '#1d4ed828' : Colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: decretoActivo ? '#bfdbfe' : Colors.textMuted, textAlign: 'center', letterSpacing: 0.3 }}>
                        MT = MAC × {percMacD}% + NPT × {100 - percMacD}%
                      </Text>
                    </View>
                    <Text style={[styles.configFieldLabel, { opacity: decretoActivo ? 1 : 0.5 }]}>Peso da MAC  <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>(padrão Decreto: 50%)</Text></Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {[40, 45, 50, 55, 60].map(n => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => decretoActivo && updateConfig({ percMacDecreto: n } as any)}
                          style={btnStyle(percMacD === n, !decretoActivo)}
                          disabled={!decretoActivo}
                        >
                          <Text style={btnTxt(percMacD === n)}>{n}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                      Peso NPT (automático): <Text style={{ fontFamily: 'Inter_600SemiBold', color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>{100 - percMacD}%</Text>
                    </Text>
                  </View>

                  {/* ── Fórmula 2 — MFD Transição ── */}
                  <View style={{ marginTop: 10, padding: 14, backgroundColor: decretoActivo ? '#16a34a18' : Colors.surface, borderRadius: 10, borderWidth: 1.5, borderColor: decretoActivo ? '#16a34a55' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: decretoActivo ? '#16a34a30' : Colors.border }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: decretoActivo ? '#4ade80' : Colors.textMuted }}>§3 · Transição</Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: decretoActivo ? '#86efac' : Colors.textSecondary, flex: 1 }}>
                        MFD — 7ª, 8ª, 10ª e 11ª Classe
                      </Text>
                    </View>
                    <View style={{ backgroundColor: decretoActivo ? '#16a34a28' : Colors.inputBg, borderRadius: 8, padding: 10 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: decretoActivo ? '#bbf7d0' : Colors.textMuted, textAlign: 'center', letterSpacing: 0.3 }}>
                        MFD = (MT₁ + MT₂ + MT₃) ÷ 3
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                      Média aritmética simples dos 3 trimestres — não há pesos diferentes. Fixo pelo decreto.
                    </Text>
                  </View>

                  {/* ── Fórmula 3 — MFD 6ª/9ª ── */}
                  <View style={{ marginTop: 10, padding: 14, backgroundColor: decretoActivo ? '#1d4ed818' : Colors.surface, borderRadius: 10, borderWidth: 1.5, borderColor: decretoActivo ? '#1d4ed855' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: decretoActivo ? '#1d4ed830' : Colors.border }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>§4a · Exame</Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: decretoActivo ? '#93c5fd' : Colors.textSecondary, flex: 1 }}>
                        MFD — 6ª e 9ª Classe (nuclear)
                      </Text>
                    </View>
                    <View style={{ backgroundColor: decretoActivo ? '#1d4ed828' : Colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: decretoActivo ? '#bfdbfe' : Colors.textMuted, textAlign: 'center', letterSpacing: 0.3 }}>
                        MFD = MT₃ × {percMT3_9a}% + NEN × {100 - percMT3_9a}%
                      </Text>
                    </View>
                    <Text style={[styles.configFieldLabel, { opacity: decretoActivo ? 1 : 0.5 }]}>Peso do MT₃  <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>(padrão Decreto: 60%)</Text></Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {[50, 55, 60, 65, 70].map(n => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => decretoActivo && updateConfig({ percMT3Exame9aDecreto: n } as any)}
                          style={btnStyle(percMT3_9a === n, !decretoActivo)}
                          disabled={!decretoActivo}
                        >
                          <Text style={btnTxt(percMT3_9a === n)}>{n}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                      Peso NEN (automático): <Text style={{ fontFamily: 'Inter_600SemiBold', color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>{100 - percMT3_9a}%</Text>
                    </Text>
                  </View>

                  {/* ── Fórmula 4 — MFD 12ª ── */}
                  <View style={{ marginTop: 10, padding: 14, backgroundColor: decretoActivo ? '#1d4ed818' : Colors.surface, borderRadius: 10, borderWidth: 1.5, borderColor: decretoActivo ? '#1d4ed855' : Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: decretoActivo ? '#1d4ed830' : Colors.border }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>§4c · Exame</Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: decretoActivo ? '#93c5fd' : Colors.textSecondary, flex: 1 }}>
                        MFD — 12ª Classe (nuclear)
                      </Text>
                    </View>
                    <View style={{ backgroundColor: decretoActivo ? '#1d4ed828' : Colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: decretoActivo ? '#bfdbfe' : Colors.textMuted, textAlign: 'center', letterSpacing: 0.3 }}>
                        MFD = MT₃ × {percMT3_12a}% + NEN × {100 - percMT3_12a}%
                      </Text>
                    </View>
                    <Text style={[styles.configFieldLabel, { opacity: decretoActivo ? 1 : 0.5 }]}>Peso do MT₃  <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>(padrão Decreto: 50%)</Text></Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {[40, 45, 50, 55, 60].map(n => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => decretoActivo && updateConfig({ percMT3Exame12aDecreto: n } as any)}
                          style={btnStyle(percMT3_12a === n, !decretoActivo)}
                          disabled={!decretoActivo}
                        >
                          <Text style={btnTxt(percMT3_12a === n)}>{n}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                      Peso NEN (automático): <Text style={{ fontFamily: 'Inter_600SemiBold', color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>{100 - percMT3_12a}%</Text>
                    </Text>
                  </View>

                  {/* Botão repor + estado */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => decretoActivo && updateConfig({ percMacDecreto: 50, percMT3Exame9aDecreto: 60, percMT3Exame12aDecreto: 50 } as any)}
                      disabled={!decretoActivo}
                      style={{ flex: 1, padding: 10, alignItems: 'center', backgroundColor: decretoActivo ? '#1d4ed818' : Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: decretoActivo ? '#1d4ed855' : Colors.border, opacity: decretoActivo ? 1 : 0.5 }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: decretoActivo ? '#60a5fa' : Colors.textMuted }}>
                        ↺  Repor valores oficiais (50% · 60% · 50%)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Banner de estado */}
                  <View style={{ marginTop: 10, padding: 10, backgroundColor: decretoActivo ? '#1d4ed818' : '#78350f18', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: decretoActivo ? '#1d4ed8' : '#eab308' }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: decretoActivo ? '#93c5fd' : '#fcd34d' }}>
                      {decretoActivo
                        ? '✅ Decreto 04/2026 activo — pesos acima aplicados a todas as pautas.'
                        : '⚠️  Modo clássico activo — active o toggle acima para usar as fórmulas do Decreto 04/2026.'}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* ── Avaliação Formativa ── */}
            <View nativeID="cfg-formativa" style={styles.card}>
              <SectionHeader title="Avaliação Formativa (Art. 8º §1)" icon="leaf" color="#22c55e" />
              <Text style={styles.configSectionDesc}>
                Habilita a componente de Avaliação Formativa no cálculo da MAC. Quando activa, a MAC final é calculada como:{'\n'}
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#166534' }}>MAC = MAC_sumativa × (100%−X%) + Nota_Formativa × X%</Text>
                {'\n'}onde X% é a percentagem formativa configurada abaixo.
              </Text>

              {/* Toggle principal */}
              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.avaliacaoFormativaHabilitada ? '#22c55e22' : Colors.border }]}>
                  <Ionicons name="leaf-outline" size={18} color={config.avaliacaoFormativaHabilitada ? '#22c55e' : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Avaliação Formativa Habilitada</Text>
                  <Text style={styles.configToggleSub}>
                    {config.avaliacaoFormativaHabilitada
                      ? `Activa — a MAC inclui ${config.percFormativa ?? 20}% de nota formativa`
                      : 'Desactivada — a MAC é calculada apenas pelas avaliações sumativas'}
                  </Text>
                </View>
                <Switch
                  value={!!(config as any).avaliacaoFormativaHabilitada}
                  onValueChange={v => updateConfig({ avaliacaoFormativaHabilitada: v } as any)}
                  trackColor={{ false: Colors.border, true: '#22c55e55' }}
                  thumbColor={(config as any).avaliacaoFormativaHabilitada ? '#22c55e' : Colors.textMuted}
                />
              </View>

              {/* Percentagem formativa */}
              {!!(config as any).avaliacaoFormativaHabilitada && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.configFieldLabel}>Peso da Avaliação Formativa na MAC</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 10 }}>
                    Percentagem que os registos formativos têm no cálculo da MAC (recomendado: 20–30%). Podes escrever qualquer valor entre 1 e 50%.
                  </Text>

                  {/* Atalhos rápidos */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {[10, 15, 20, 25, 30, 40].map(p => {
                      const active = ((config as any).percFormativa ?? 20) === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          onPress={() => updateConfig({ percFormativa: p } as any)}
                          style={{
                            paddingHorizontal: 16, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: active ? '#22c55e' : Colors.inputBg,
                            borderWidth: 1.5, borderColor: active ? '#22c55e' : Colors.border,
                          }}
                        >
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: active ? '#fff' : Colors.text }}>{p}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Input numérico livre */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      borderWidth: 1.5, borderColor: '#22c55e', borderRadius: 10,
                      backgroundColor: Colors.inputBg, paddingHorizontal: 14, height: 44, flex: 1, maxWidth: 180,
                    }}>
                      <Ionicons name="create-outline" size={16} color="#22c55e" />
                      <TextInput
                        style={{ flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text }}
                        keyboardType="numeric"
                        placeholder="Ex: 20"
                        placeholderTextColor={Colors.textMuted}
                        value={String((config as any).percFormativa ?? 20)}
                        onChangeText={v => {
                          const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
                          if (!isNaN(n) && n >= 1 && n <= 50) updateConfig({ percFormativa: n } as any);
                        }}
                      />
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#22c55e' }}>%</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 }}>
                      Valor entre{'\n'}1% e 50%
                    </Text>
                  </View>

                  <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#22c55e' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#166534' }}>
                      MAC = {100 - ((config as any).percFormativa ?? 20)}% sumativa + {(config as any).percFormativa ?? 20}% formativa
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#15803d', marginTop: 2 }}>
                      Art. 8º §1 — Decreto Executivo nº 04/2026
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── SISTEMA ── */}
            <View nativeID="cfg-sistema" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.textMuted + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="settings" size={14} color={Colors.textMuted} />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.textMuted, letterSpacing: 1 }}>SISTEMA</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.textMuted + '30', borderRadius: 1 }} />
            </View>

            {/* PAP — 13ª Classe */}
            <View nativeID="cfg-pap" style={styles.card}>
              <SectionHeader title="PAP — Ensino Técnico-Profissional" icon="ribbon" color={Colors.gold} />
              <Text style={styles.configSectionDesc}>
                Configure a Prova de Aptidão Profissional (PAP) para turmas técnico-profissionais. Seleccione as classes alvo (12ª, 13ª ou ambas). A Nota PAP é calculada automaticamente: (Estágio + Defesa) ÷ 2 ou (Estágio + Defesa + Média das Disciplinas) ÷ 3.
              </Text>

              {/* Toggle PAP habilitado */}
              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.papHabilitado ? Colors.gold + '22' : Colors.border }]}>
                  <Ionicons name="ribbon-outline" size={18} color={config.papHabilitado ? Colors.gold : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>PAP Habilitado</Text>
                  <Text style={styles.configToggleSub}>
                    {config.papHabilitado
                      ? `Activo — lançamento PAP disponível para ${(config.papClasses || ['13ª Classe']).join(' e ')}`
                      : 'Desactivado — as classes técnico-profissionais seguem o regime normal'}
                  </Text>
                </View>
                <Switch
                  value={config.papHabilitado}
                  onValueChange={v => updateConfig({ papHabilitado: v })}
                  trackColor={{ false: Colors.border, true: Colors.gold + '55' }}
                  thumbColor={config.papHabilitado ? Colors.gold : Colors.textMuted}
                />
              </View>

              {/* Selecção de classes alvo */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.configFieldLabel}>Classes Alvo do PAP</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 10, lineHeight: 16 }}>
                  Seleccione as classes em que o PAP está activo. Algumas escolas técnico-profissionais terminam na 12ª Classe, outras na 13ª.
                </Text>
                {(['12ª Classe', ...(config.temDecimaTermeira !== false ? ['13ª Classe'] : [])] as string[]).map(classe => {
                  const isSelected = (config.papClasses || ['13ª Classe']).includes(classe);
                  return (
                    <TouchableOpacity
                      key={classe}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: isSelected ? Colors.gold + '18' : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: isSelected ? Colors.gold + '55' : Colors.border, marginBottom: 8 }}
                      onPress={() => {
                        const current = config.papClasses || ['13ª Classe'];
                        const nova = isSelected
                          ? current.filter(c => c !== classe)
                          : [...current, classe];
                        if (nova.length === 0) { webAlert('Aviso', 'Deve seleccionar pelo menos uma classe.'); return; }
                        updateConfig({ papClasses: nova });
                      }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: isSelected ? Colors.gold : Colors.textMuted, backgroundColor: isSelected ? Colors.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_400Regular', color: isSelected ? Colors.gold : Colors.text }}>{classe}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Toggle estágio como disciplina — sempre visível */}
              <View style={[styles.configToggleRow, { marginTop: 8 }]}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.estagioComoDisciplina ? Colors.info + '22' : Colors.border }]}>
                  <Ionicons name="school-outline" size={18} color={config.estagioComoDisciplina ? Colors.info : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Estágio como Disciplina no Plano Curricular</Text>
                  <Text style={styles.configToggleSub}>
                    {config.estagioComoDisciplina
                      ? 'Activo — o estágio aparece como disciplina normal na pauta e no plano curricular'
                      : 'Desactivado — o estágio tem campo próprio no lançamento PAP (campo "Nota do Estágio")'}
                  </Text>
                </View>
                <Switch
                  value={config.estagioComoDisciplina}
                  onValueChange={v => updateConfig({ estagioComoDisciplina: v })}
                  trackColor={{ false: Colors.border, true: Colors.info + '55' }}
                  thumbColor={config.estagioComoDisciplina ? Colors.info : Colors.textMuted}
                />
              </View>

              {config.papHabilitado && (
                <>
                  {/* Disciplinas contribuintes */}
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.configFieldLabel}>Disciplinas Contribuintes para a Nota PAP</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 10, lineHeight: 16 }}>
                      Defina as disciplinas cuja nota final entra no cálculo da PAP (além do Estágio e Defesa). A média dessas notas é usada como terceiro componente da fórmula.{'\n'}
                      Deixe vazio se apenas o Estágio e a Defesa contribuem para a PAP.
                    </Text>

                    {/* Lista de disciplinas actuais */}
                    <View style={{ gap: 6, marginBottom: 10 }}>
                      {(config.papDisciplinasContribuintes || []).map((disc, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gold + '12', borderRadius: 10, borderWidth: 1, borderColor: Colors.gold + '33', paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Ionicons name="book-outline" size={14} color={Colors.gold} style={{ marginRight: 8 }} />
                          <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text }}>{disc}</Text>
                          <TouchableOpacity onPress={() => {
                            const nova = (config.papDisciplinasContribuintes || []).filter((_, j) => j !== i);
                            updateConfig({ papDisciplinasContribuintes: nova });
                          }}>
                            <Ionicons name="close-circle" size={18} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {(config.papDisciplinasContribuintes || []).length === 0 && (
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' }}>
                          Nenhuma disciplina configurada — apenas Estágio e Defesa entram na fórmula.
                        </Text>
                      )}
                    </View>

                    {/* Input para adicionar disciplina */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        value={papDiscInput}
                        onChangeText={setPapDiscInput}
                        placeholder="Nome da disciplina (ex: Informática)"
                        placeholderTextColor={Colors.textMuted}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          const nome = papDiscInput.trim();
                          if (!nome) return;
                          if ((config.papDisciplinasContribuintes || []).includes(nome)) {
                            webAlert('Aviso', 'Esta disciplina já foi adicionada.');
                            return;
                          }
                          updateConfig({ papDisciplinasContribuintes: [...(config.papDisciplinasContribuintes || []), nome] });
                          setPapDiscInput('');
                        }}
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => {
                          const nome = papDiscInput.trim();
                          if (!nome) return;
                          if ((config.papDisciplinasContribuintes || []).includes(nome)) {
                            webAlert('Aviso', 'Esta disciplina já foi adicionada.');
                            return;
                          }
                          updateConfig({ papDisciplinasContribuintes: [...(config.papDisciplinasContribuintes || []), nome] });
                          setPapDiscInput('');
                        }}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Info box */}
                  <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.info + '12', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                    <Ionicons name="information-circle" size={16} color={Colors.info} />
                    <Text style={{ fontSize: 11, color: Colors.info, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                      Fórmula da Nota PAP:{'\n'}
                      • Sem disciplinas: (Estágio + Defesa) ÷ 2{'\n'}
                      • Com disciplinas: (Estágio + Defesa + Média_Disciplinas) ÷ 3{'\n'}
                      A nota PAP é calculada automaticamente ao lançar as notas.
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Exame Antecipado */}
            <View nativeID="cfg-exame" style={styles.card}>
              <SectionHeader title="Exame Antecipado" icon="time" color={Colors.warning} />
              <Text style={styles.configSectionDesc}>
                Permite que alunos com negativa numa disciplina terminal façam exame antecipado no mesmo ano lectivo, evitando arrastar a reprovação para o ano subsequente. Funcionalidade prevista na política educacional — pode ser activada ou desactivada conforme as directrizes do MED.
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.exameAntecipadoHabilitado ? Colors.warning + '22' : Colors.border }]}>
                  <Ionicons name="time-outline" size={18} color={config.exameAntecipadoHabilitado ? Colors.warning : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Exame Antecipado Habilitado</Text>
                  <Text style={styles.configToggleSub}>
                    {config.exameAntecipadoHabilitado
                      ? 'Activo — alunos com negativa em disciplinas terminais podem solicitar exame antecipado no mesmo ano'
                      : 'Desactivado — alunos transitam com negativa para o ano subsequente (regime normal)'}
                  </Text>
                </View>
                <Switch
                  value={config.exameAntecipadoHabilitado}
                  onValueChange={v => {
                    updateConfig({ exameAntecipadoHabilitado: v });
                    webAlert(
                      v ? 'Exame Antecipado Activado' : 'Exame Antecipado Desactivado',
                      v
                        ? 'Os alunos com negativa em disciplinas terminais poderão solicitar exame antecipado para não arrastar a negativa.'
                        : 'O regime de exame antecipado foi desactivado. Os alunos seguem o regime normal.',
                    );
                  }}
                  trackColor={{ false: Colors.border, true: Colors.warning + '55' }}
                  thumbColor={config.exameAntecipadoHabilitado ? Colors.warning : Colors.textMuted}
                />
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.warning + '12', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color={Colors.warning} />
                <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  Aplica-se a disciplinas terminais (ex: 10ª ou 11ª Classe). Quando activo, o aluno com nota final negativa nessas disciplinas não vai para o próximo ano com negativa — solicita exame antecipado para resolver a situação no corrente ano lectivo.
                </Text>
              </View>
            </View>

            {/* Exame de Recurso — Art. 33º */}
            <View nativeID="cfg-recurso" style={styles.card}>
              <SectionHeader title="Exame de Recurso (Art. 33º)" icon="refresh-circle" color="#f97316" />
              <Text style={styles.configSectionDesc}>
                Configura as regras do Exame de Recurso conforme o Decreto Executivo nº 04/2026 (Art. 33º). Define o número máximo de negativas elegíveis, o intervalo de notas considerado negativa para recurso (6–9 por defeito) e as restrições por classe (ex: LP+Matemática simultâneas na 9ª Classe). Estes parâmetros podem ser ajustados em caso de revisão legislativa futura.
              </Text>

              {/* Máximo de negativos para recurso */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Máximo de negativas para recurso</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>
                  Número máximo de disciplinas com nota no intervalo [notaMin, notaMax] que habilitam ao exame de recurso. (Decreto: até 3)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity onPress={() => { const v = Math.max(1, (config.maxNegativosRecurso ?? 3) - 1); updateConfig({ maxNegativosRecurso: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 60 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#f97316' }}>{config.maxNegativosRecurso ?? 3}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>negativo{(config.maxNegativosRecurso ?? 3) !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { const v = Math.min(8, (config.maxNegativosRecurso ?? 3) + 1); updateConfig({ maxNegativosRecurso: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {(config.maxNegativosRecurso ?? 3) !== 3 && (
                    <TouchableOpacity onPress={() => updateConfig({ maxNegativosRecurso: 3 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f9741620' }}>
                      <Text style={{ fontSize: 11, color: '#f97316', fontFamily: 'Inter_500Medium' }}>Repor (3)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Intervalo de nota para recurso */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Intervalo de nota (negativa para recurso)</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>
                  Notas neste intervalo são consideradas "negativas para recurso". Decreto: 6–9 valores.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Mínima</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => { const v = Math.max(0, (config.notaMinRecurso ?? 6) - 1); updateConfig({ notaMinRecurso: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="remove" size={14} color={Colors.text} />
                      </TouchableOpacity>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#f97316', minWidth: 28, textAlign: 'center' }}>{config.notaMinRecurso ?? 6}</Text>
                      <TouchableOpacity onPress={() => { const v = Math.min((config.notaMaxRecurso ?? 9), (config.notaMinRecurso ?? 6) + 1); updateConfig({ notaMinRecurso: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="add" size={14} color={Colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>—</Text>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Máxima</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => { const v = Math.max((config.notaMinRecurso ?? 6), (config.notaMaxRecurso ?? 9) - 1); updateConfig({ notaMaxRecurso: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="remove" size={14} color={Colors.text} />
                      </TouchableOpacity>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#f97316', minWidth: 28, textAlign: 'center' }}>{config.notaMaxRecurso ?? 9}</Text>
                      <TouchableOpacity onPress={() => { const v = Math.min(20, (config.notaMaxRecurso ?? 9) + 1); updateConfig({ notaMaxRecurso: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="add" size={14} color={Colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {((config.notaMinRecurso ?? 6) !== 6 || (config.notaMaxRecurso ?? 9) !== 9) && (
                    <TouchableOpacity onPress={() => updateConfig({ notaMinRecurso: 6, notaMaxRecurso: 9 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f9741620', marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, color: '#f97316', fontFamily: 'Inter_500Medium' }}>Repor (6–9)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Restrição LP + Matemática */}
              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.restricaoLPMatRecurso !== false ? '#f9741622' : Colors.border }]}>
                  <Ionicons name="ban-outline" size={18} color={config.restricaoLPMatRecurso !== false ? '#f97316' : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Restrição LP + Matemática (9ª Classe)</Text>
                  <Text style={styles.configToggleSub}>
                    {config.restricaoLPMatRecurso !== false
                      ? 'Activa — aluno com LP e Matemática negativas simultaneamente na 9ª Classe não vai a recurso'
                      : 'Desactivada — restrição LP+Mat não aplicada'}
                  </Text>
                </View>
                <Switch
                  value={config.restricaoLPMatRecurso !== false}
                  onValueChange={v => updateConfig({ restricaoLPMatRecurso: v })}
                  trackColor={{ false: Colors.border, true: '#f97316' + '55' }}
                  thumbColor={config.restricaoLPMatRecurso !== false ? '#f97316' : Colors.textMuted}
                />
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: '#f9741612', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color="#f97316" />
                <Text style={{ fontSize: 11, color: '#f97316', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  Art. 33º: Alunos com até {config.maxNegativosRecurso ?? 3} negativa(s) no intervalo {config.notaMinRecurso ?? 6}–{config.notaMaxRecurso ?? 9} podem fazer exame de recurso. Para a 9ª Classe, se a restrição LP+Mat estiver activa, LP e Matemática não podem ser negativas simultaneamente.
                </Text>
              </View>
            </View>

            {/* Exame de Melhoria de Nota — Art. 36º */}
            <View nativeID="cfg-melhoria" style={styles.card}>
              <SectionHeader title="Exame de Melhoria de Nota (Art. 36º)" icon="trending-up" color="#8b5cf6" />
              <Text style={styles.configSectionDesc}>
                Permite que alunos com nota aprovada mas baixa (intervalo configurável, por defeito 10–16) solicitem exame de melhoria em até 5 disciplinas (configurável). A nota final será sempre a mais alta obtida entre a nota actual e a do exame de melhoria. Prazo de solicitação: 48 horas após publicação dos resultados (configurável).
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.melhoriaNotaHabilitada ? '#8b5cf622' : Colors.border }]}>
                  <Ionicons name="trending-up-outline" size={18} color={config.melhoriaNotaHabilitada ? '#8b5cf6' : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Exame de Melhoria de Nota Habilitado</Text>
                  <Text style={styles.configToggleSub}>
                    {config.melhoriaNotaHabilitada
                      ? 'Activo — alunos elegíveis podem solicitar exame de melhoria pelo portal'
                      : 'Desactivado — funcionalidade de melhoria de nota desligada'}
                  </Text>
                </View>
                <Switch
                  value={!!config.melhoriaNotaHabilitada}
                  onValueChange={v => updateConfig({ melhoriaNotaHabilitada: v })}
                  trackColor={{ false: Colors.border, true: '#8b5cf6' + '55' }}
                  thumbColor={config.melhoriaNotaHabilitada ? '#8b5cf6' : Colors.textMuted}
                />
              </View>

              {/* Máximo de disciplinas */}
              <View style={{ marginBottom: 16, marginTop: 12 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Máximo de disciplinas para melhoria</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>Decreto (Art. 36º): até 5 disciplinas no secundário.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity onPress={() => { const v = Math.max(1, (config.maxDisciplinasMelhoria ?? 5) - 1); updateConfig({ maxDisciplinasMelhoria: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 60 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#8b5cf6' }}>{config.maxDisciplinasMelhoria ?? 5}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>disciplina{(config.maxDisciplinasMelhoria ?? 5) !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { const v = Math.min(15, (config.maxDisciplinasMelhoria ?? 5) + 1); updateConfig({ maxDisciplinasMelhoria: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {(config.maxDisciplinasMelhoria ?? 5) !== 5 && (
                    <TouchableOpacity onPress={() => updateConfig({ maxDisciplinasMelhoria: 5 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#8b5cf620' }}>
                      <Text style={{ fontSize: 11, color: '#8b5cf6', fontFamily: 'Inter_500Medium' }}>Repor (5)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Prazo em horas */}
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Prazo para solicitar melhoria (horas)</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>Decreto: 48 horas após publicação dos resultados.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity onPress={() => { const v = Math.max(12, (config.prazoHorasMelhoria ?? 48) - 12); updateConfig({ prazoHorasMelhoria: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 60 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#8b5cf6' }}>{config.prazoHorasMelhoria ?? 48}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>horas</Text>
                  </View>
                  <TouchableOpacity onPress={() => { const v = Math.min(168, (config.prazoHorasMelhoria ?? 48) + 12); updateConfig({ prazoHorasMelhoria: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {(config.prazoHorasMelhoria ?? 48) !== 48 && (
                    <TouchableOpacity onPress={() => updateConfig({ prazoHorasMelhoria: 48 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#8b5cf620' }}>
                      <Text style={{ fontSize: 11, color: '#8b5cf6', fontFamily: 'Inter_500Medium' }}>Repor (48h)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Intervalo de nota elegível */}
              <View style={{ marginBottom: 8 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Intervalo de nota elegível para melhoria</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>Decreto: notas de 10 a 16 no ensino secundário.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Mínima</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => { const v = Math.max(0, (config.notaMinMelhoria ?? 10) - 1); updateConfig({ notaMinMelhoria: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="remove" size={14} color={Colors.text} />
                      </TouchableOpacity>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#8b5cf6', minWidth: 28, textAlign: 'center' }}>{config.notaMinMelhoria ?? 10}</Text>
                      <TouchableOpacity onPress={() => { const v = Math.min((config.notaMaxMelhoria ?? 16), (config.notaMinMelhoria ?? 10) + 1); updateConfig({ notaMinMelhoria: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="add" size={14} color={Colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>—</Text>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>Máxima</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => { const v = Math.max((config.notaMinMelhoria ?? 10), (config.notaMaxMelhoria ?? 16) - 1); updateConfig({ notaMaxMelhoria: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="remove" size={14} color={Colors.text} />
                      </TouchableOpacity>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#8b5cf6', minWidth: 28, textAlign: 'center' }}>{config.notaMaxMelhoria ?? 16}</Text>
                      <TouchableOpacity onPress={() => { const v = Math.min(20, (config.notaMaxMelhoria ?? 16) + 1); updateConfig({ notaMaxMelhoria: v }); }}
                        style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="add" size={14} color={Colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {((config.notaMinMelhoria ?? 10) !== 10 || (config.notaMaxMelhoria ?? 16) !== 16) && (
                    <TouchableOpacity onPress={() => updateConfig({ notaMinMelhoria: 10, notaMaxMelhoria: 16 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#8b5cf620', marginLeft: 8 }}>
                      <Text style={{ fontSize: 11, color: '#8b5cf6', fontFamily: 'Inter_500Medium' }}>Repor (10–16)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: '#8b5cf612', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color="#8b5cf6" />
                <Text style={{ fontSize: 11, color: '#8b5cf6', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  Art. 36º: Alunos com nota {config.notaMinMelhoria ?? 10}–{config.notaMaxMelhoria ?? 16} podem solicitar melhoria em até {config.maxDisciplinasMelhoria ?? 5} disciplinas no prazo de {config.prazoHorasMelhoria ?? 48}h após publicação dos resultados. A nota final é sempre a mais alta obtida.
                </Text>
              </View>
            </View>

            {/* Art. 38º — Pedido de Reapreciação */}
            <View nativeID="cfg-reapreciacao" style={styles.card}>
              <SectionHeader title="Pedido de Reapreciação de Notas (Art. 38º)" icon="document-text" color="#0284c7" />
              <Text style={styles.configSectionDesc}>
                Permite que alunos (ou seus encarregados) solicitem a reapreciação de uma nota pelo Director Pedagógico e uma comissão designada. O prazo legal para análise e decisão é de 48 horas (configurável). Disponível para CEO, Administradores, Directores e Secretaria Pedagógica.
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: (config as any).reapreciacaoHabilitada ? '#0284c722' : Colors.border }]}>
                  <Ionicons name="document-text-outline" size={18} color={(config as any).reapreciacaoHabilitada ? '#0284c7' : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Pedido de Reapreciação Habilitado</Text>
                  <Text style={styles.configToggleSub}>
                    {(config as any).reapreciacaoHabilitada
                      ? 'Activo — alunos e encarregados podem submeter pedidos de reapreciação'
                      : 'Desactivado — módulo de reapreciação de notas desligado'}
                  </Text>
                </View>
                <Switch
                  value={!!(config as any).reapreciacaoHabilitada}
                  onValueChange={v => updateConfig({ reapreciacaoHabilitada: v } as any)}
                  trackColor={{ false: Colors.border, true: '#0284c7' + '55' }}
                  thumbColor={(config as any).reapreciacaoHabilitada ? '#0284c7' : Colors.textMuted}
                />
              </View>

              {/* Prazo em horas */}
              <View style={{ marginBottom: 16, marginTop: 12 }}>
                <Text style={[styles.configToggleLabel, { marginBottom: 4 }]}>Prazo para análise e decisão (horas)</Text>
                <Text style={[styles.configToggleSub, { marginBottom: 10 }]}>Decreto (Art. 38º): 48 horas após recepção do pedido.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <TouchableOpacity onPress={() => { const v = Math.max(12, ((config as any).reapreciacaoPrazosHoras ?? 48) - 12); updateConfig({ reapreciacaoPrazosHoras: v } as any); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 60 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: '#0284c7' }}>{(config as any).reapreciacaoPrazosHoras ?? 48}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>horas</Text>
                  </View>
                  <TouchableOpacity onPress={() => { const v = Math.min(168, ((config as any).reapreciacaoPrazosHoras ?? 48) + 12); updateConfig({ reapreciacaoPrazosHoras: v } as any); }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {((config as any).reapreciacaoPrazosHoras ?? 48) !== 48 && (
                    <TouchableOpacity onPress={() => updateConfig({ reapreciacaoPrazosHoras: 48 } as any)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#0284c720' }}>
                      <Text style={{ fontSize: 11, color: '#0284c7', fontFamily: 'Inter_500Medium' }}>Repor (48h)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 4, flexDirection: 'row', gap: 8, backgroundColor: '#0284c712', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color="#0284c7" />
                <Text style={{ fontSize: 11, color: '#0284c7', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  Art. 38º: O aluno ou encarregado pode pedir reapreciação da nota ao Director Pedagógico. A comissão designada tem {(config as any).reapreciacaoPrazosHoras ?? 48}h para analisar e decidir. Acessível em Área Pedagógica → Pedido de Reapreciação.
                </Text>
              </View>
            </View>

            {/* Art. 23º §10 — Número de Negativos para Transição Condicional */}
            <View nativeID="cfg-negativos" style={styles.card}>
              <SectionHeader title="Negativos para Transição Condicional (Art. 23 §10)" icon="alert-circle" color="#f59e0b" />
              <Text style={styles.configSectionDesc}>
                Define o número máximo de disciplinas negativas (7–9 valores) que permitem ao aluno transitar condicionalmente para a classe seguinte. De acordo com o Decreto Executivo nº 04/2026 (Art. 23 §10): <Text style={{ fontWeight: 'bold' }}>I Ciclo até 2 negativas</Text>, <Text style={{ fontWeight: 'bold' }}>II Ciclo até 3 negativas</Text>. Estes limites são configuráveis e podem ser ajustados em caso de revisão legislativa futura.
              </Text>

              {/* Aviso decreto vs SIGA */}
              <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#f59e0b18', borderRadius: 10, padding: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                <Ionicons name="warning-outline" size={15} color="#d97706" />
                <Text style={{ fontSize: 11, color: '#92400e', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  O Decreto (Art. 23 §10) permite <Text style={{ fontWeight: 'bold' }}>3 negativos no II Ciclo</Text> (10ª/11ª). Verifique se os valores abaixo estão alinhados com a legislação vigente. Altere com cautela — afecta directamente a promoção dos alunos.
                </Text>
              </View>

              {/* I Ciclo (7ª/8ª) */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="school" size={14} color={Colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text }}>I Ciclo — 7ª e 8ª Classe</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>Decreto: até 2 negativos</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 36 }}>
                  <TouchableOpacity
                    onPress={() => { const v = Math.max(1, (config.maxNegativosICiclo ?? 2) - 1); updateConfig({ maxNegativosICiclo: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ minWidth: 56, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: (config.maxNegativosICiclo ?? 2) === 2 ? Colors.success : Colors.warning }}>
                      {config.maxNegativosICiclo ?? 2}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>negativo{(config.maxNegativosICiclo ?? 2) !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { const v = Math.min(5, (config.maxNegativosICiclo ?? 2) + 1); updateConfig({ maxNegativosICiclo: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {(config.maxNegativosICiclo ?? 2) !== 2 && (
                    <TouchableOpacity onPress={() => updateConfig({ maxNegativosICiclo: 2 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + '55', backgroundColor: Colors.accent + '12' }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.accent }}>Repor (2)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* II Ciclo (10ª/11ª) */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#7c3aed22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="school" size={14} color="#7c3aed" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text }}>II Ciclo — 10ª e 11ª Classe</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>Decreto: até 3 negativos</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 36 }}>
                  <TouchableOpacity
                    onPress={() => { const v = Math.max(1, (config.maxNegativosIICiclo ?? 3) - 1); updateConfig({ maxNegativosIICiclo: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <View style={{ minWidth: 56, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: (config.maxNegativosIICiclo ?? 3) === 3 ? Colors.success : Colors.warning }}>
                      {config.maxNegativosIICiclo ?? 3}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>negativo{(config.maxNegativosIICiclo ?? 3) !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { const v = Math.min(5, (config.maxNegativosIICiclo ?? 3) + 1); updateConfig({ maxNegativosIICiclo: v }); }}
                    style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  {(config.maxNegativosIICiclo ?? 3) !== 3 && (
                    <TouchableOpacity onPress={() => updateConfig({ maxNegativosIICiclo: 3 })}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + '55', backgroundColor: Colors.accent + '12' }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.accent }}>Repor (3)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Restrição LP + área (II Ciclo) */}
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14, marginTop: 2 }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Restrição Qualitativa — II Ciclo
                </Text>
                <View style={styles.configToggleRow}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.restricaoLPAreaIICiclo ? '#f59e0b22' : Colors.border }]}>
                    <Ionicons name="ban-outline" size={18} color={config.restricaoLPAreaIICiclo ? '#d97706' : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>LP + 2 Disciplinas da Área — Restrição Activa</Text>
                    <Text style={styles.configToggleSub}>
                      {config.restricaoLPAreaIICiclo
                        ? 'Activa — LP negativa + 2 disciplinas nucleares da área → NÃO TRANSITA'
                        : 'Desactivada — negativas qualificativas permitem transição condicional normalmente'}
                    </Text>
                  </View>
                  <Switch
                    value={!!config.restricaoLPAreaIICiclo}
                    onValueChange={v => {
                      updateConfig({ restricaoLPAreaIICiclo: v });
                      webAlert(
                        v ? 'Restrição LP+Área Activada' : 'Restrição LP+Área Desactivada',
                        v
                          ? 'Alunos do II Ciclo com Língua Portuguesa negativa E 2+ disciplinas nucleares da área também negativas passarão a NÃO TRANSITAR mesmo dentro do limite.'
                          : 'A restrição qualitativa LP+área foi desactivada. Aplica-se apenas o limite numérico de negativos.'
                      );
                    }}
                    trackColor={{ false: Colors.border, true: '#f59e0b55' }}
                    thumbColor={config.restricaoLPAreaIICiclo ? '#d97706' : Colors.textMuted}
                  />
                </View>
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 8, backgroundColor: '#f59e0b10', borderRadius: 10, padding: 10, alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle" size={15} color="#d97706" />
                  <Text style={{ fontSize: 11, color: '#92400e', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 15 }}>
                    As disciplinas "nucleares" são configuradas individualmente em <Text style={{ fontWeight: 'bold' }}>Gestão → Disciplinas</Text> (campo "Nuclear Art. 23"). Por padrão incluem Língua Portuguesa e Matemática.
                  </Text>
                </View>
              </View>
            </View>

            {/* Art. 23º §2 — Restrição I Ciclo */}
            <View nativeID="cfg-art23" style={styles.card}>
              <SectionHeader title="Restrição Art. 23º §2 — I Ciclo" icon="school" color={Colors.danger} />
              <Text style={styles.configSectionDesc}>
                Aplica-se a turmas da 7ª e 8ª classe (I Ciclo). Quando activo, um aluno com exactamente 2 disciplinas negativas (7–9 valores) NÃO transita se essas duas disciplinas forem simultaneamente <Text style={{ fontWeight: 'bold' }}>Língua Portuguesa</Text> e <Text style={{ fontWeight: 'bold' }}>Matemática</Text>. Previsto no Art. 23º §2 do Regulamento de Avaliação das Aprendizagens (Decreto Executivo nº 3/20).
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.restricaoArt23ICiclo ? Colors.danger + '22' : Colors.border }]}>
                  <Ionicons name="ban-outline" size={18} color={config.restricaoArt23ICiclo ? Colors.danger : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Restrição Art. 23º §2 Activa</Text>
                  <Text style={styles.configToggleSub}>
                    {config.restricaoArt23ICiclo
                      ? 'Activa — 2 negativas em LP+MAT na 7ª/8ª classe resultam em NÃO TRANSITA'
                      : 'Desactivada — 2 negativas em LP+MAT permitem TRANSITA C/ CONDIÇÃO (regime normal)'}
                  </Text>
                </View>
                <Switch
                  value={config.restricaoArt23ICiclo}
                  onValueChange={v => {
                    updateConfig({ restricaoArt23ICiclo: v });
                    webAlert(
                      v ? 'Restrição Art. 23º §2 Activada' : 'Restrição Art. 23º §2 Desactivada',
                      v
                        ? 'Alunos da 7ª e 8ª classe com negativas simultâneas em Língua Portuguesa e Matemática passarão a NÃO TRANSITAR.'
                        : 'A restrição foi desactivada. O regime normal de transição condicional aplica-se a todas as classes.',
                    );
                  }}
                  trackColor={{ false: Colors.border, true: Colors.danger + '55' }}
                  thumbColor={config.restricaoArt23ICiclo ? Colors.danger : Colors.textMuted}
                />
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.danger + '10', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color={Colors.danger} />
                <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  Esta regra aplica-se exclusivamente a turmas da 7ª e 8ª classe. Para todas as outras classes, o limite de 2 negativas continua a permitir transição condicional independentemente das disciplinas.
                </Text>
              </View>
            </View>

            {/* Art. 23º §2 — Restrição II Ciclo */}
            <View nativeID="cfg-art23-iiciclo" style={styles.card}>
              <SectionHeader title="Restrição Art. 23º §2 — II Ciclo" icon="school" color="#7c3aed" />
              <Text style={styles.configSectionDesc}>
                Aplica-se a turmas da 10ª, 11ª e 12ª classe (II Ciclo). Quando activo, as disciplinas marcadas como <Text style={{ fontWeight: 'bold' }}>Nuclear Art. 23</Text> (configurado em cada disciplina) determinam o bloqueio: se todas as negativas do aluno coincidirem com essas disciplinas, resulta em NÃO TRANSITA. Previsto no Art. 23º §2 do Decreto Executivo nº 3/20.
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.restricaoArt23IICiclo ? '#7c3aed' + '22' : Colors.border }]}>
                  <Ionicons name="ban-outline" size={18} color={config.restricaoArt23IICiclo ? '#7c3aed' : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Restrição Art. 23º §2 II Ciclo Activa</Text>
                  <Text style={styles.configToggleSub}>
                    {config.restricaoArt23IICiclo
                      ? 'Activa — disciplinas nucleares na 10ª/11ª/12ª classe bloqueiam transição condicional'
                      : 'Desactivada — regime normal de transição condicional para o II Ciclo'}
                  </Text>
                </View>
                <Switch
                  value={config.restricaoArt23IICiclo}
                  onValueChange={v => {
                    updateConfig({ restricaoArt23IICiclo: v });
                    webAlert(
                      v ? 'Restrição Art. 23º §2 II Ciclo Activada' : 'Restrição Art. 23º §2 II Ciclo Desactivada',
                      v
                        ? 'Alunos da 10ª, 11ª e 12ª classe com negativas nas disciplinas nucleares Art. 23 passarão a NÃO TRANSITAR.'
                        : 'A restrição foi desactivada para o II Ciclo. O regime normal aplica-se a todas as turmas do ciclo.',
                    );
                  }}
                  trackColor={{ false: Colors.border, true: '#7c3aed' + '55' }}
                  thumbColor={config.restricaoArt23IICiclo ? '#7c3aed' : Colors.textMuted}
                />
              </View>

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: '#7c3aed' + '12', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color="#7c3aed" />
                <Text style={{ fontSize: 11, color: '#7c3aed', fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  As disciplinas nucleares são configuradas individualmente em <Text style={{ fontWeight: 'bold' }}>Gestão → Disciplinas</Text> (campo "Nuclear Art. 23"). Por padrão, Língua Portuguesa e Matemática estão marcadas. Active o toggle em cada disciplina desejada.
                </Text>
              </View>
            </View>

            {/* Art. 23º §5 — Bloqueio de Matrícula por Disciplinas Não Aprovadas */}
            <View nativeID="cfg-art23v5" style={styles.card}>
              <SectionHeader title="Bloqueio Art. 23º §5 — Disciplinas Não Aprovadas" icon="lock-closed" color={Colors.danger} />
              <Text style={styles.configSectionDesc}>
                Aplica-se às classes configuradas (por omissão 9ª–12ª). Quando activo, um aluno que tente matricular-se nessas classes e tenha disciplinas com nota final inferior à nota mínima de aprovação no ano anterior ficará impedido de concluir a matrícula. Previsto no Art. 23º §5 do Regulamento de Avaliação das Aprendizagens.
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.bloqueioMatriculaHabilitado ? Colors.danger + '22' : Colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={config.bloqueioMatriculaHabilitado ? Colors.danger : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Bloqueio Art. 23º §5 Activo</Text>
                  <Text style={styles.configToggleSub}>
                    {config.bloqueioMatriculaHabilitado
                      ? 'Activo — matrícula bloqueada se aluno tem disciplinas negativas do ano anterior'
                      : 'Desactivado — matrícula permitida independentemente do histórico de notas'}
                  </Text>
                </View>
                <Switch
                  value={!!config.bloqueioMatriculaHabilitado}
                  onValueChange={v => {
                    updateConfig({ bloqueioMatriculaHabilitado: v } as never);
                    webAlert(
                      v ? 'Bloqueio Art. 23º §5 Activado' : 'Bloqueio Art. 23º §5 Desactivado',
                      v
                        ? 'Alunos com disciplinas não aprovadas no ano anterior ficam impedidos de concluir a matrícula nas classes configuradas.'
                        : 'O bloqueio foi desactivado. Todos os alunos admitidos podem concluir a matrícula normalmente.',
                    );
                  }}
                  trackColor={{ false: Colors.border, true: Colors.danger + '55' }}
                  thumbColor={config.bloqueioMatriculaHabilitado ? Colors.danger : Colors.textMuted}
                />
              </View>

              {config.bloqueioMatriculaHabilitado && (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.configToggleLabel, { marginBottom: 8 }]}>Classes com bloqueio activo</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(["8ª Classe","9ª Classe","10ª Classe","11ª Classe","12ª Classe"] as const).map(cls => {
                      const lista: string[] = Array.isArray(config.bloqueioMatriculaClasses) ? (config.bloqueioMatriculaClasses as string[]) : [];
                      const activo = lista.includes(cls);
                      return (
                        <TouchableOpacity
                          key={cls}
                          onPress={() => {
                            const nova = activo ? lista.filter((c: string) => c !== cls) : [...lista, cls];
                            updateConfig({ bloqueioMatriculaClasses: nova } as never);
                          }}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                            backgroundColor: activo ? Colors.danger + '22' : Colors.border + '55',
                            borderWidth: 1.5, borderColor: activo ? Colors.danger + '80' : Colors.border,
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                          }}
                        >
                          <Ionicons name={activo ? 'lock-closed' : 'lock-open-outline'} size={12} color={activo ? Colors.danger : Colors.textMuted} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: activo ? Colors.danger : Colors.textMuted }}>{cls}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.danger + '10', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color={Colors.danger} />
                <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  O bloqueio verifica o histórico de notas do aluno (por BI ou e-mail) na classe imediatamente anterior. Aplica-se apenas no momento de conclusão da matrícula, após admissão e confirmação de pagamento.
                </Text>
              </View>
            </View>

            {/* Bloqueio Automático de Login por Propina em Atraso */}
            <View nativeID="cfg-bloqueio-financeiro" style={styles.card}>
              <SectionHeader title="Bloqueio de Login por Propina em Atraso" icon="cash" color={Colors.danger} />
              <Text style={styles.configSectionDesc}>
                Quando activo, um aluno com uma propina pendente há mais dias do que o limite definido abaixo fica automaticamente impedido de iniciar sessão na plataforma (notas e documentos continuam acessíveis à secretaria). Alunos com a excepção "Permitir Acesso com Pendência" (ficha do aluno) não são afectados.
              </Text>

              <View style={styles.configToggleRow}>
                <View style={[styles.configToggleIcon, { backgroundColor: config.bloqueioFinanceiroHabilitado ? Colors.danger + '22' : Colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={config.bloqueioFinanceiroHabilitado ? Colors.danger : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.configToggleLabel}>Bloqueio Financeiro Activo</Text>
                  <Text style={styles.configToggleSub}>
                    {config.bloqueioFinanceiroHabilitado
                      ? `Activo — login bloqueado após ${config.diasAtrasoBloqueio ?? 10} dia(s) de atraso`
                      : 'Desactivado — o acesso não é bloqueado por dívida'}
                  </Text>
                </View>
                <Switch
                  value={!!config.bloqueioFinanceiroHabilitado}
                  onValueChange={v => {
                    updateConfig({ bloqueioFinanceiroHabilitado: v } as never);
                    webAlert(
                      v ? 'Bloqueio Financeiro Activado' : 'Bloqueio Financeiro Desactivado',
                      v
                        ? 'Alunos com propinas em atraso além do limite definido ficam impedidos de iniciar sessão.'
                        : 'O bloqueio foi desactivado. Nenhum aluno será impedido de iniciar sessão por dívida.',
                    );
                  }}
                  trackColor={{ false: Colors.border, true: Colors.danger + '55' }}
                  thumbColor={config.bloqueioFinanceiroHabilitado ? Colors.danger : Colors.textMuted}
                />
              </View>

              {config.bloqueioFinanceiroHabilitado && (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.configToggleLabel, { marginBottom: 6 }]}>Dias de atraso até bloquear</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => { const v = Math.max(1, (config.diasAtrasoBloqueio ?? 10) - 1); updateConfig({ diasAtrasoBloqueio: v } as never); }}
                      style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                      <Ionicons name="remove" size={18} color={Colors.text} />
                    </TouchableOpacity>
                    <View style={{ minWidth: 64, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.danger }}>
                        {config.diasAtrasoBloqueio ?? 10}
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>dia{(config.diasAtrasoBloqueio ?? 10) !== 1 ? 's' : ''}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { const v = Math.min(90, (config.diasAtrasoBloqueio ?? 10) + 1); updateConfig({ diasAtrasoBloqueio: v } as never); }}
                      style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface }}>
                      <Ionicons name="add" size={18} color={Colors.text} />
                    </TouchableOpacity>
                    {(config.diasAtrasoBloqueio ?? 10) !== 10 && (
                      <TouchableOpacity onPress={() => updateConfig({ diasAtrasoBloqueio: 10 } as never)}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent + '55', backgroundColor: Colors.accent + '12' }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.accent }}>Repor (10)</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, backgroundColor: Colors.danger + '10', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={16} color={Colors.danger} />
                <Text style={{ fontSize: 11, color: Colors.danger, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 }}>
                  A contagem de dias usa a mesma data-limite de vencimento configurada em "Multas por Atraso". O bloqueio afecta apenas o login — notas, documentos e atendimento presencial continuam normais.
                </Text>
              </View>
            </View>

            {/* ── PAGAMENTOS ONLINE (apenas CEO) ── */}
            {user?.role === 'ceo' && (<>
            <View nativeID="cfg-pagamentos" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#10B981' + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="card" size={14} color="#10B981" />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#10B981', letterSpacing: 1 }}>PAGAMENTOS ONLINE</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: '#10B981' + '30', borderRadius: 1 }} />
            </View>

            <View style={[styles.card, { borderWidth: 2, borderColor: config.emisHabilitado ? '#10B981' + '60' : Colors.textMuted + '30' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <LinearGradient colors={['#10B981', '#059669']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="card" size={24} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Pagamentos Online (EMIS / Multicaixa)</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                    O estudante recebe uma referência bancária (RUPE), paga em qualquer ATM ou Multicaixa Express e o sistema marca automaticamente como Pago.
                  </Text>
                </View>
              </View>

              {/* Toggle Activar */}
              <View style={styles.configToggleRow}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: config.emisHabilitado ? '#10B981' + '22' : Colors.danger + '22' }]}>
                    <Ionicons name={config.emisHabilitado ? 'checkmark-circle' : 'close-circle'} size={18} color={config.emisHabilitado ? '#10B981' : Colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Pagamentos Online</Text>
                    <Text style={[styles.configToggleDesc, { color: config.emisHabilitado ? '#10B981' : Colors.danger }]}>
                      {config.emisHabilitado ? 'ACTIVO — Referências geradas automaticamente via API' : 'INACTIVO — Modo manual (referências locais)'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!!config.emisHabilitado}
                  onValueChange={v => updateConfig({ emisHabilitado: v } as never)}
                  trackColor={{ false: Colors.danger + '88', true: '#10B981' + '88' }}
                  thumbColor={config.emisHabilitado ? '#10B981' : Colors.danger}
                />
              </View>
            </View>

            {/* Info: Como obter credenciais */}
            <View style={[styles.card, { backgroundColor: Colors.info + '0D', borderColor: Colors.info + '30', borderWidth: 1 }]}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={20} color={Colors.info} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.info, marginBottom: 6 }}>Como obter as credenciais?</Text>
                  {[
                    '1. Dirija-se ao seu banco parceiro (BFA, BAI, BPC, BIC, etc.) ou à AGT.',
                    '2. Solicite a adesão ao serviço de cobrança por referência bancária / EMIS.',
                    '3. Receberá um Número de Entidade e credenciais de API (API Key + URL).',
                    '4. Preencha os campos abaixo, teste a ligação e active em Produção.',
                  ].map((t, i) => (
                    <Text key={i} style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 }}>{t}</Text>
                  ))}
                </View>
              </View>
            </View>

            {/* Ambiente */}
            <View style={styles.card}>
              <SectionHeader title="Ambiente" icon="globe-outline" color="#10B981" />
              <Text style={[styles.configSectionDesc, { marginBottom: 10 }]}>
                Use Sandbox para testes. Mude para Produção apenas quando tiver as credenciais reais.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['sandbox', 'producao'] as const).map(amb => (
                  <TouchableOpacity
                    key={amb}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: (config.emisAmbiente || 'sandbox') === amb ? (amb === 'sandbox' ? Colors.warning : '#10B981') : Colors.surface, backgroundColor: (config.emisAmbiente || 'sandbox') === amb ? (amb === 'sandbox' ? Colors.warning + '15' : '#10B981' + '15') : Colors.surface }}
                    onPress={() => updateConfig({ emisAmbiente: amb } as never)}
                  >
                    <Ionicons name={amb === 'sandbox' ? 'construct-outline' : 'shield-checkmark'} size={16} color={(config.emisAmbiente || 'sandbox') === amb ? (amb === 'sandbox' ? Colors.warning : '#10B981') : Colors.textMuted} />
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: (config.emisAmbiente || 'sandbox') === amb ? (amb === 'sandbox' ? Colors.warning : '#10B981') : Colors.textMuted }}>
                      {amb === 'sandbox' ? 'Sandbox (Teste)' : 'Produção'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {config.emisAmbiente === 'producao' && (
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 8, backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 12, alignItems: 'flex-start' }}>
                  <Ionicons name="warning" size={14} color={Colors.warning} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1, lineHeight: 16 }}>
                    Modo Produção activo. As referências geradas serão cobradas em ATM e Multicaixa Express reais.
                  </Text>
                </View>
              )}
            </View>

            {/* Banco / Provedor */}
            <View style={styles.card}>
              <SectionHeader title="Banco / Provedor" icon="business" color="#10B981" />
              <Text style={[styles.configSectionDesc, { marginBottom: 10 }]}>Banco com que a escola tem contrato para cobrança por referência. Caso o seu banco não esteja na lista, seleccione "Outro" e introduza o nome.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {[
                  { code: 'BFA', label: 'BFA' },
                  { code: 'BAI', label: 'BAI' },
                  { code: 'BPC', label: 'BPC' },
                  { code: 'BIC', label: 'BIC' },
                  { code: 'ATL', label: 'ATL' },
                  { code: 'EMIS', label: 'EMIS' },
                  { code: 'BCI', label: 'BCI' },
                  { code: 'BDA', label: 'BDA' },
                  { code: 'SOL', label: 'Sol Crédito' },
                  { code: 'UBA', label: 'UBA' },
                  { code: 'STD', label: 'Standard Bank' },
                  { code: 'FNB', label: 'Finibanco' },
                  { code: 'Outro', label: 'Outro...' },
                ].map(({ code, label }) => {
                  const isKnownBank = !['Outro'].includes(config.emisProvedor || '');
                  const isActive = config.emisProvedor === code || (code === 'Outro' && !isKnownBank && !!config.emisProvedor);
                  return (
                    <TouchableOpacity
                      key={code}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: isActive ? '#10B981' : Colors.surface, backgroundColor: isActive ? '#10B981' + '20' : Colors.surface }}
                      onPress={() => {
                        if (code === 'Outro') {
                          updateConfig({ emisProvedor: 'Outro', bancoTransferencia: '' } as never);
                        } else {
                          updateConfig({ emisProvedor: code, bancoTransferencia: code } as never);
                        }
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: isActive ? '#10B981' : Colors.textMuted }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Campo para banco personalizado quando "Outro" está seleccionado */}
              {config.emisProvedor === 'Outro' && (
                <View style={{ backgroundColor: '#10B981' + '0D', borderRadius: 12, borderWidth: 1, borderColor: '#10B981' + '30', padding: 12, marginBottom: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Ionicons name="add-circle-outline" size={15} color="#10B981" />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#10B981' }}>Registar banco personalizado</Text>
                  </View>
                  <Text style={styles.configFieldLabel}>Sigla / Código do banco<RequiredMark /></Text>
                  <TextInput
                    style={[styles.input, { marginTop: 4 }]}
                    placeholder="Ex: BNI, BCGA, BVB..."
                    placeholderTextColor={Colors.textMuted}
                    value={config.emisProvedorCustomCode || ''}
                    onChangeText={v => updateConfig({ emisProvedorCustomCode: v.toUpperCase() } as never)}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                  <Text style={[styles.configFieldLabel, { marginTop: 8 }]}>Nome completo do banco<RequiredMark /></Text>
                  <TextInput
                    style={[styles.input, { marginTop: 4 }]}
                    placeholder="Ex: Banco Nacional de Investimento"
                    placeholderTextColor={Colors.textMuted}
                    value={config.bancoTransferencia || ''}
                    onChangeText={v => updateConfig({ bancoTransferencia: v })}
                  />
                  {!!(config.emisProvedorCustomCode && config.bancoTransferencia) && (
                    <TouchableOpacity
                      style={{ marginTop: 4, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                      onPress={() => {
                        const code = config.emisProvedorCustomCode || 'Outro';
                        updateConfig({ emisProvedor: code, bancoTransferencia: config.bancoTransferencia } as never);
                        alertSucesso('Banco registado', `${config.bancoTransferencia} (${code}) foi registado com sucesso.`);
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff' }}>Confirmar Banco</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <Text style={styles.configFieldLabel}>Nome completo do banco (para recibos)</Text>
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={config.bancoTransferencia || ''}
                onChangeText={v => updateConfig({ bancoTransferencia: v })}
                placeholder="Ex: Banco de Fomento Angola (BFA)"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Credenciais de API */}
            <View style={styles.card}>
              <SectionHeader title="Credenciais de API" icon="key" color={Colors.gold} />
              <Text style={[styles.configSectionDesc, { marginBottom: 10 }]}>Dados fornecidos pelo banco após adesão ao serviço de cobrança.</Text>

              <Text style={styles.configFieldLabel}>Nome do Beneficiário<RequiredMark /></Text>
              <TextInput
                style={[styles.input, { marginTop: 6, marginBottom: 12 }]}
                value={config.nomeBeneficiario || ''}
                onChangeText={v => updateConfig({ nomeBeneficiario: v })}
                placeholder="Ex: Escola Secundária N.º 1 de Luanda"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.configFieldLabel}>Número de Entidade<RequiredMark /></Text>
              <TextInput
                style={[styles.input, { marginTop: 6, marginBottom: 12 }]}
                value={config.numeroEntidade || ''}
                onChangeText={v => updateConfig({ numeroEntidade: v })}
                placeholder="Ex: 12345"
                keyboardType="number-pad"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.configFieldLabel}>API Key / Token</Text>
              <TextInput
                style={[styles.input, { marginTop: 6, marginBottom: 12 }]}
                value={config.emisApiKey || ''}
                onChangeText={v => updateConfig({ emisApiKey: v } as never)}
                placeholder="Token de autenticação fornecido pelo banco"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
              />

              <Text style={styles.configFieldLabel}>URL da API</Text>
              <TextInput
                style={[styles.input, { marginTop: 6, marginBottom: 4 }]}
                value={config.emisApiUrl || ''}
                onChangeText={v => updateConfig({ emisApiUrl: v } as never)}
                placeholder="https://api.banco.ao/cobranca/v1/"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 12 }}>
                Em Sandbox pode deixar vazio — o sistema usa o endpoint de teste.
              </Text>

              <Text style={styles.configFieldLabel}>IBAN</Text>
              <TextInput
                style={[styles.input, { marginTop: 6, marginBottom: 12 }]}
                value={config.iban || ''}
                onChangeText={v => updateConfig({ iban: v })}
                placeholder="Ex: AO06.0040.0000.0000.1234.1019.2"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.configFieldLabel}>NIB (alternativo)</Text>
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={config.nib || ''}
                onChangeText={v => updateConfig({ nib: v })}
                placeholder="Ex: 000400001234101920"
                keyboardType="number-pad"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            </>)}

            {/* ── ASSISTENTE IA (apenas CEO) ── */}
            {user?.role === 'ceo' && (<>
            <View nativeID="cfg-ia" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#A78BFA' + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bulb" size={14} color="#A78BFA" />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#A78BFA', letterSpacing: 1 }}>ASSISTENTE IA</Text>
              <View style={{ flex: 1, height: 1.5, backgroundColor: '#A78BFA' + '30', borderRadius: 1 }} />
            </View>

            {/* ── Assistente IA — Google Gemini ── */}
            <View style={styles.card}>
                <SectionHeader title="Assistente IA — Google Gemini" icon="sparkles" color="#A78BFA" />
                <Text style={styles.configSectionDesc}>
                  O Assistente IA utiliza a API do Google Gemini, configurada via variável de ambiente no servidor. Não é necessário inserir chaves aqui.
                </Text>

                {/* Estado activo */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10B98110', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, borderWidth: 1, borderColor: '#10B98130' }}>
                  <Ionicons name="flash" size={16} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#10B981' }}>Google Gemini activo — assistente IA operacional</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#10B981', opacity: 0.8, marginTop: 2 }}>Modelo: gemini-2.0-flash · Configurado via GEMINI_API_KEY no servidor</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#A78BFA15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#A78BFA30' }}>
                  <Ionicons name="information-circle" size={18} color="#A78BFA" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: '#A78BFA', lineHeight: 17 }}>
                    A chave de API é gerida exclusivamente através das variáveis de ambiente do servidor (<Text style={{ fontFamily: 'Inter_600SemiBold' }}>GEMINI_API_KEY</Text>). Para actualizá-la, usa o script <Text style={{ fontFamily: 'Inter_600SemiBold' }}>bash scripts/sync-secrets-hetzner.sh</Text> ou o pipeline de deploy automático via GitHub Actions.
                  </Text>
                </View>
              </View>
            </>)}

          </View>
        )}

        {/* COMUNICAÇÕES — FLASH SCREEN */}
        {activeSection === 'comunicacoes' && (() => {
          const DEST_OPTIONS = [
            { value: 'todos',              label: 'Todos',             icon: 'people' as const },
            { value: 'alunos',             label: 'Alunos',            icon: 'school' as const },
            { value: 'alunos_encarregados',label: 'Alunos e Enc.',     icon: 'people-circle' as const },
            { value: 'encarregados',       label: 'Encarregados',      icon: 'person' as const },
            { value: 'professores',        label: 'Professores',       icon: 'book' as const },
            { value: 'funcionarios',       label: 'Funcionários',      icon: 'briefcase' as const },
            { value: 'administradores',    label: 'Administradores',   icon: 'shield-checkmark' as const },
          ];
          const PRESET_COLORS = [
            '#0A1628', '#0D1F5C', '#0F2D27', '#1A0A2E',
            '#1C1C1C', '#1F0A0A', '#0A1E1F', '#2C1810',
          ];
          const DEST_LABELS: Record<string, string> = {
            todos: 'Todos', alunos: 'Alunos', alunos_encarregados: 'Alunos e Enc.',
            encarregados: 'Encarregados', professores: 'Professores',
            funcionarios: 'Funcionários', administradores: 'Administradores',
          };
          return (
            <View style={{ gap: 12 }}>

              {/* CARD 1 — ACTIVAR */}
              <View style={styles.card}>
                <SectionHeader title="Flash Screen do Sistema" icon="megaphone" collapsed={flashCC.c1} onToggle={() => toggleFlashCC('c1')} />
                {!flashCC.c1 && (<>
                <Text style={styles.configSectionDesc}>
                  Cria um aviso em ecrã completo que aparece quando os utilizadores abrem a aplicação. Aparece novamente após 3 minutos de inactividade até o utilizador o dispensar permanentemente.
                </Text>
                <View style={styles.configToggleRow}>
                  <View style={styles.configToggleLeft}>
                    <View style={[styles.configToggleIcon, { backgroundColor: Colors.warning + '22' }]}>
                      <Ionicons name="megaphone" size={18} color={Colors.warning} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.configToggleLabel}>Flash Screen Activo</Text>
                      <Text style={styles.configToggleDesc}>
                        {config.flashScreen?.ativa ? 'Aviso activo — utilizadores elegíveis verão o comunicado' : 'Nenhum aviso será exibido'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={!!config.flashScreen?.ativa}
                    onValueChange={v => updateFlashScreen({ ativa: v })}
                    trackColor={{ false: Colors.border, true: Colors.warning + '88' }}
                    thumbColor={config.flashScreen?.ativa ? Colors.warning : Colors.textMuted}
                  />
                </View>
                </>)}
              </View>

              {/* CARD 2 — AUDIÊNCIA */}
              <View style={styles.card}>
                <SectionHeader title="Audiência" icon="people" collapsed={flashCC.c2} onToggle={() => toggleFlashCC('c2')} />
                {!flashCC.c2 && (<>
                <Text style={[styles.configSectionDesc, { marginBottom: 12 }]}>
                  Escolhe quem verá este comunicado.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DEST_OPTIONS.map(opt => {
                    const active = flashForm.destinatarios === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setFlashForm(f => ({ ...f, destinatarios: opt.value }))}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? Colors.warning : Colors.surface,
                          borderWidth: 1,
                          borderColor: active ? Colors.warning : Colors.border,
                        }}
                      >
                        <Ionicons name={opt.icon} size={13} color={active ? '#0A1628' : Colors.textSecondary} />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? '#0A1628' : Colors.textSecondary }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                </>)}
              </View>

              {/* CARD 3 — CONTEÚDO */}
              <View style={styles.card}>
                <SectionHeader title="Conteúdo do Comunicado" icon="create" collapsed={flashCC.c3} onToggle={() => toggleFlashCC('c3')} />
                {!flashCC.c3 && (<>
                <Text style={styles.fieldLabel}>Título<RequiredMark /></Text>
                <TextInput
                  style={styles.input}
                  value={flashForm.titulo}
                  onChangeText={v => setFlashForm(f => ({ ...f, titulo: v }))}
                  placeholder="Ex: Reunião de Pais — Amanhã às 14h"
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Mensagem</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={flashForm.mensagem}
                  onChangeText={v => setFlashForm(f => ({ ...f, mensagem: v }))}
                  placeholder="Descrição detalhada do comunicado..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.fieldLabel}>URL da Imagem (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={flashForm.imagemUrl}
                  onChangeText={v => setFlashForm(f => ({ ...f, imagemUrl: v }))}
                  placeholder="https://exemplo.com/imagem.jpg"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                />

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Cor de Fundo</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  {PRESET_COLORS.map(hex => {
                    const selected = flashForm.bgColor === hex;
                    return (
                      <TouchableOpacity
                        key={hex}
                        onPress={() => setFlashForm(f => ({ ...f, bgColor: hex }))}
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: hex,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? Colors.warning : 'rgba(255,255,255,0.15)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {selected && <Ionicons name="checkmark" size={16} color="#FFD700" />}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
                    paddingHorizontal: 10, height: 36, flex: 1, minWidth: 100,
                    backgroundColor: Colors.surface,
                  }}>
                    <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: flashForm.bgColor || '#0A1628', borderWidth: 1, borderColor: Colors.border }} />
                    <TextInput
                      style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text }}
                      value={flashForm.bgColor}
                      onChangeText={v => setFlashForm(f => ({ ...f, bgColor: v }))}
                      placeholder="#0A1628"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      maxLength={7}
                    />
                  </View>
                </View>
                </>)}
              </View>

              {/* CARD 4 — TEMPO E DATAS */}
              <View style={styles.card}>
                <SectionHeader title="Tempo e Visibilidade" icon="timer" collapsed={flashCC.c4} onToggle={() => toggleFlashCC('c4')} />
                {!flashCC.c4 && (<>
                <View style={styles.configFieldRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.configFieldLabel}>Duração (segundos)</Text>
                    <Text style={styles.configFieldDesc}>O aviso fecha automaticamente após este tempo</Text>
                  </View>
                  <TextInput
                    style={styles.configNumInput}
                    value={flashForm.duracao}
                    onChangeText={v => setFlashForm(f => ({ ...f, duracao: v }))}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <DatePickerField
                  label="Data de Início"
                  value={flashForm.dataInicio}
                  onChange={v => setFlashForm(f => ({ ...f, dataInicio: v }))}
                />

                <DatePickerField
                  label="Data de Fim"
                  value={flashForm.dataFim}
                  onChange={v => setFlashForm(f => ({ ...f, dataFim: v }))}
                />

                <View style={[styles.configWarnBox, { marginTop: 14 }]}>
                  <Ionicons name="information-circle" size={16} color={Colors.info} />
                  <Text style={[styles.configWarnText, { color: Colors.info }]}>
                    O comunicado reaparece automaticamente a cada 3 minutos. O utilizador pode dispensá-lo permanentemente. Para repor, altere o título ou a data de início.
                  </Text>
                </View>

                {flashSaved && (
                  <View style={[styles.configWarnBox, { backgroundColor: Colors.success + '18', marginTop: 8 }]}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={[styles.configWarnText, { color: Colors.success }]}>Comunicado guardado com sucesso!</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, { marginTop: 16 }]}
                  onPress={async () => {
                    const dur = parseInt(flashForm.duracao);
                    if (!flashForm.titulo.trim()) {
                      webAlert('Erro', 'O título é obrigatório.'); return;
                    }
                    const payload = {
                      titulo: flashForm.titulo.trim(),
                      mensagem: flashForm.mensagem.trim(),
                      imagemUrl: flashForm.imagemUrl.trim(),
                      duracao: isNaN(dur) || dur < 2 ? 5 : Math.min(dur, 60),
                      bgColor: flashForm.bgColor.trim() || '#0A1628',
                      dataInicio: flashForm.dataInicio.trim(),
                      dataFim: flashForm.dataFim.trim(),
                      destinatarios: flashForm.destinatarios as any,
                    };
                    const existingId = (config.flashScreen as any)?.id;
                    await updateFlashScreen(payload);
                    if (existingId) {
                      api.put(`/api/comunicados/${existingId}`, { ...payload, ativa: !!config.flashScreen?.ativa }).then(updated => {
                        setComunicadosHistory(prev => prev.map((c: any) => c.id === existingId ? updated : c));
                      }).catch(() => {
                        api.post('/api/comunicados', { ...payload, ativa: !!config.flashScreen?.ativa }).then(novo => {
                          updateFlashScreen({ id: (novo as any).id } as any);
                          setComunicadosHistory(prev => [novo, ...prev]);
                        }).catch(() => {});
                      });
                    } else {
                      api.post('/api/comunicados', { ...payload, ativa: !!config.flashScreen?.ativa }).then(novo => {
                        updateFlashScreen({ id: (novo as any).id } as any);
                        setComunicadosHistory(prev => [novo, ...prev]);
                      }).catch(() => {});
                    }
                    setFlashSaved(true);
                    setTimeout(() => setFlashSaved(false), 3000);
                  }}
                >
                  <Text style={styles.saveBtnText}>Guardar e Publicar Comunicado</Text>
                </TouchableOpacity>
                </>)}
              </View>

              {/* CARD 5 — HISTÓRICO */}
              <View style={styles.card}>
                <SectionHeader title="Histórico de Comunicados" icon="time" collapsed={flashCC.c5} onToggle={() => toggleFlashCC('c5')} />
                {!flashCC.c5 && (historyLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>A carregar histórico...</Text>
                  </View>
                ) : comunicadosHistory.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                    <Ionicons name="chatbubbles-outline" size={32} color={Colors.textMuted} />
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Nenhum comunicado guardado ainda.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {comunicadosHistory.map((c: any) => (
                      <View key={c.id} style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                        padding: 12, borderRadius: 12,
                        backgroundColor: Colors.surface,
                        borderWidth: 1, borderColor: Colors.border,
                      }}>
                        <View style={{
                          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                          backgroundColor: c.bgColor || '#0A1628',
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                        }}>
                          <Ionicons name="megaphone" size={16} color="#FFD700" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>{c.titulo}</Text>
                          {!!c.mensagem && (
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }} numberOfLines={2}>{c.mensagem}</Text>
                          )}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <View style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              backgroundColor: Colors.warning + '18', borderRadius: 6,
                              paddingHorizontal: 7, paddingVertical: 3,
                            }}>
                              <Ionicons name="people" size={10} color={Colors.warning} />
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.warning }}>
                                {DEST_LABELS[c.destinatarios] || 'Todos'}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                              {c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            </Text>
                            {c.ativa && (
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success }} />
                            )}
                            {/* Badge de visualizações */}
                            <TouchableOpacity
                              onPress={async () => {
                                setViewersComunicado(c);
                                setViewersLoading(true);
                                setViewersList([]);
                                try {
                                  const data = await api.get<any[]>(`/api/comunicados/${c.id}/visualizacoes`);
                                  setViewersList(Array.isArray(data) ? data : []);
                                } catch { setViewersList([]); }
                                finally { setViewersLoading(false); }
                              }}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                backgroundColor: Colors.info + '18', borderRadius: 6,
                                paddingHorizontal: 7, paddingVertical: 3,
                              }}
                            >
                              <Ionicons name="eye" size={10} color={Colors.info} />
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>
                                {c.totalVisualizacoes || 0}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {/* Botões editar / apagar */}
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TouchableOpacity
                            onPress={() => {
                              setEditComunicado(c);
                              setEditForm({
                                titulo: c.titulo || '',
                                mensagem: c.mensagem || '',
                                destinatarios: c.destinatarios || 'todos',
                                imagemUrl: c.imagemUrl || '',
                                duracao: String(c.duracao || 5),
                                bgColor: c.bgColor || '#0A1628',
                                dataInicio: c.dataInicio || '',
                                dataFim: c.dataFim || '',
                                ativa: !!c.ativa,
                              });
                            }}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              backgroundColor: Colors.accent + '30',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="pencil" size={14} color={Colors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              webAlert(
                                'Apagar Comunicado',
                                `Tens a certeza que queres apagar "${c.titulo}"? Esta acção não pode ser desfeita.`,
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: 'Apagar', style: 'destructive',
                                    onPress: async () => {
                                      try {
                                        await api.delete(`/api/comunicados/${c.id}`);
                                        setComunicadosHistory(prev => prev.filter(x => x.id !== c.id));
                                      } catch {
                                        webAlert('Erro', 'Não foi possível apagar o comunicado.');
                                      }
                                    }
                                  }
                                ]
                              );
                            }}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              backgroundColor: Colors.danger + '20',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="trash" size={14} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>

              {/* MODAL — EDITAR COMUNICADO */}
              <Modal visible={!!editComunicado} transparent animationType="fade" onRequestClose={() => setEditComunicado(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                  <View style={{ backgroundColor: Colors.card, borderRadius: 16, padding: 20, width: '100%', maxWidth: 500, gap: 14, borderWidth: 1, borderColor: Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Editar Comunicado</Text>
                      <TouchableOpacity onPress={() => setEditComunicado(null)}>
                        <Ionicons name="close" size={22} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ gap: 10 }}>
                      <Text style={styles.configFieldLabel}>Título *</Text>
                      <TextInput
                        style={[styles.inputField, { color: Colors.text }]}
                        value={editForm.titulo}
                        onChangeText={v => setEditForm((f: any) => ({ ...f, titulo: v }))}
                        placeholder="Título do comunicado"
                        placeholderTextColor={Colors.textMuted}
                      />

                      <Text style={styles.configFieldLabel}>Mensagem</Text>
                      <TextInput
                        style={[styles.inputField, { color: Colors.text, minHeight: 72, textAlignVertical: 'top' }]}
                        value={editForm.mensagem}
                        onChangeText={v => setEditForm((f: any) => ({ ...f, mensagem: v }))}
                        placeholder="Texto do aviso"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={3}
                      />

                      <Text style={styles.configFieldLabel}>Destinatários</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[
                          { value: 'todos', label: 'Todos' },
                          { value: 'alunos', label: 'Alunos' },
                          { value: 'professores', label: 'Professores' },
                          { value: 'encarregados', label: 'Encarregados' },
                          { value: 'funcionarios', label: 'Funcionários' },
                        ].map(op => (
                          <TouchableOpacity
                            key={op.value}
                            onPress={() => setEditForm((f: any) => ({ ...f, destinatarios: op.value }))}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                              backgroundColor: editForm.destinatarios === op.value ? Colors.primary : Colors.surface,
                              borderWidth: 1, borderColor: editForm.destinatarios === op.value ? Colors.primary : Colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: editForm.destinatarios === op.value ? '#fff' : Colors.textSecondary }}>{op.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <DatePickerField
                            label="Data de Início"
                            value={editForm.dataInicio}
                            onChange={v => setEditForm((f: any) => ({ ...f, dataInicio: v }))}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <DatePickerField
                            label="Data de Fim"
                            value={editForm.dataFim}
                            onChange={v => setEditForm((f: any) => ({ ...f, dataFim: v }))}
                          />
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => setEditForm((f: any) => ({ ...f, ativa: !f.ativa }))}
                          style={{
                            width: 44, height: 24, borderRadius: 12,
                            backgroundColor: editForm.ativa ? Colors.success : Colors.surface,
                            borderWidth: 1, borderColor: editForm.ativa ? Colors.success : Colors.border,
                            justifyContent: 'center', paddingHorizontal: 2,
                          }}
                        >
                          <View style={{
                            width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                            alignSelf: editForm.ativa ? 'flex-end' : 'flex-start',
                          }} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Comunicado activo</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={() => setEditComunicado(null)}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={editSaving}
                        onPress={async () => {
                          if (!editForm.titulo.trim()) { webAlert('Erro', 'O título é obrigatório.'); return; }
                          setEditSaving(true);
                          try {
                            const updated = await api.put(`/api/comunicados/${editComunicado.id}`, {
                              titulo: editForm.titulo.trim(),
                              mensagem: editForm.mensagem.trim(),
                              destinatarios: editForm.destinatarios,
                              imagemUrl: editForm.imagemUrl.trim(),
                              duracao: Number(editForm.duracao) || 5,
                              bgColor: editForm.bgColor.trim() || '#0A1628',
                              dataInicio: editForm.dataInicio,
                              dataFim: editForm.dataFim,
                              ativa: editForm.ativa,
                            });
                            setComunicadosHistory(prev => prev.map(x => x.id === editComunicado.id ? updated : x));
                            setEditComunicado(null);
                          } catch {
                            webAlert('Erro', 'Não foi possível guardar as alterações.');
                          } finally {
                            setEditSaving(false);
                          }
                        }}
                        style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', opacity: editSaving ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>{editSaving ? 'A guardar...' : 'Guardar'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* MODAL — QUEM VIU O COMUNICADO */}
              <Modal visible={!!viewersComunicado} transparent animationType="fade" onRequestClose={() => setViewersComunicado(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                  <View style={{ backgroundColor: Colors.card, borderRadius: 16, padding: 20, width: '100%', maxWidth: 480, gap: 14, borderWidth: 1, borderColor: Colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Visualizações</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }} numberOfLines={1}>{viewersComunicado?.titulo}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setViewersComunicado(null)}>
                        <Ionicons name="close" size={22} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {viewersLoading ? (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>A carregar...</Text>
                      </View>
                    ) : viewersList.length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                        <Ionicons name="eye-off-outline" size={32} color={Colors.textMuted} />
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Nenhuma visualização registada ainda.</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8, maxHeight: 360 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                          <Ionicons name="eye" size={14} color={Colors.info} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>{viewersList.length} visualização{viewersList.length !== 1 ? 'ões' : ''}</Text>
                        </View>
                        {viewersList.map((v: any, i: number) => {
                          const ROLE_LABELS: Record<string, string> = {
                            encarregado: 'Encarregado', aluno: 'Aluno', professor: 'Professor',
                            admin: 'Admin', director: 'Director', ceo: 'CEO',
                            financeiro: 'Financeiro', rh: 'RH', secretaria: 'Secretaria',
                          };
                          return (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, backgroundColor: Colors.surface }}>
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="person" size={16} color={Colors.accent} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>{v.nome || 'Utilizador'}</Text>
                                {v.alunoNome ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name="school" size={11} color={Colors.gold} />
                                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold }} numberOfLines={1}>
                                      Encarregado de {v.alunoNome}
                                    </Text>
                                  </View>
                                ) : null}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                  <View style={{ backgroundColor: Colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>
                                      {ROLE_LABELS[v.role] || v.role || 'Utilizador'}
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                                    {v.vistoEm ? new Date(v.vistoEm).toLocaleString('pt-AO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => setViewersComunicado(null)}
                      style={{ paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Fechar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

            </View>
          );
        })()}

        {/* ACESSOS E PERMISSÕES */}
        {activeSection === 'acessos' && (
          <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
            <GestaoAcessosPanel />
          </View>
        )}

        {/* SEGURANÇA & BACKUP */}
        {activeSection === 'seguranca' && (
          <View style={{ gap: 14 }}>

            {/* ── Backup completo ── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.success + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cloud-download" size={24} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>Backup Geral e Completo</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                    Todas as categorias · Formato JSON · Download directo
                  </Text>
                </View>
                {ultimoBackup && (
                  <View style={{ backgroundColor: Colors.success + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Último backup</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.success }}>{ultimoBackup}</Text>
                  </View>
                )}
              </View>

              {/* Totais rápidos se stats carregadas */}
              {backupStats && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Total de registos', value: backupStats.totalGeral.toLocaleString('pt-AO'), color: Colors.success },
                    { label: 'Categorias', value: '5', color: Colors.info },
                    { label: 'Tabelas', value: Object.keys(backupStats.counts).length.toString(), color: Colors.gold },
                  ].map(s => (
                    <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '12', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: s.color }}>{s.value}</Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 2 }}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={{ backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: backupLoading ? 0.65 : 1 }}
                onPress={() => handleBackupCategorias(BACKUP_CATS.map(c => c.key))}
                disabled={backupLoading}
                activeOpacity={0.8}
              >
                {backupLoading && !catDownloading
                  ? <AppLoader color="#fff" size="small" />
                  : <Ionicons name="cloud-download" size={22} color="#fff" />
                }
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#fff' }}>
                  {backupLoading && !catDownloading ? 'A gerar backup completo...' : 'Descarregar Backup Completo'}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 10, lineHeight: 17, textAlign: 'center' }}>
                Inclui alunos, pautas, notas, pagamentos, RH, documentos, histórico académico e configurações.{'\n'}
                <Text style={{ color: Colors.success }}>Disponível para: CEO, PCA e Administrador.</Text>
              </Text>
            </View>

            {/* ── Backup por categoria ── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text }}>Backup por Categoria</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.info + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                  onPress={loadBackupStats}
                  disabled={backupStatsLoading}
                >
                  {backupStatsLoading ? <AppLoader color={Colors.info} size="small" /> : <Ionicons name="bar-chart-outline" size={13} color={Colors.info} />}
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>
                    {backupStatsLoading ? 'A contar...' : backupStats ? 'Actualizar' : 'Ver estatísticas'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 10 }}>
                {BACKUP_CATS.map(cat => {
                  const catStat = backupStats?.byCat?.[cat.key];
                  const total = catStat?.total ?? 0;
                  const isSelected = selectedCats.has(cat.key);
                  const isThisCatDownloading = catDownloading === cat.key && backupLoading;
                  return (
                    <View key={cat.key} style={{ borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? cat.color + '55' : Colors.border, backgroundColor: isSelected ? cat.color + '08' : Colors.surface, overflow: 'hidden' }}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
                        onPress={() => setSelectedCats(prev => {
                          const next = new Set(prev);
                          if (next.has(cat.key)) next.delete(cat.key); else next.add(cat.key);
                          return next;
                        })}
                        activeOpacity={0.75}
                      >
                        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: cat.color + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name={cat.icon} size={20} color={cat.color} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text }}>{cat.label}</Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 2 }} numberOfLines={1}>{cat.desc}</Text>
                          {backupStats && (
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: cat.color, marginTop: 3 }}>
                              {total.toLocaleString('pt-AO')} registos · {cat.tables.length} tabelas
                            </Text>
                          )}
                        </View>
                        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: isSelected ? cat.color : Colors.border, backgroundColor: isSelected ? cat.color : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: cat.color + '10', opacity: backupLoading ? 0.5 : 1 }}
                        onPress={() => handleBackupCategorias([cat.key])}
                        disabled={backupLoading}
                      >
                        {isThisCatDownloading
                          ? <AppLoader color={cat.color} size="small" />
                          : <Ionicons name="download-outline" size={14} color={cat.color} />
                        }
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: cat.color }}>
                          {isThisCatDownloading ? 'A gerar...' : `Exportar apenas ${cat.label}`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {selectedCats.size > 0 && selectedCats.size < BACKUP_CATS.length && (
                <TouchableOpacity
                  style={{ marginTop: 14, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: backupLoading ? 0.65 : 1 }}
                  onPress={() => handleBackupCategorias([...selectedCats])}
                  disabled={backupLoading}
                >
                  {backupLoading ? <AppLoader color="#fff" size="small" /> : <Ionicons name="download" size={18} color="#fff" />}
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                    {backupLoading ? 'A gerar...' : `Exportar ${selectedCats.size} ${selectedCats.size === 1 ? 'categoria' : 'categorias'} seleccionadas`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Exportar tabela CSV ── */}
            <View style={styles.card}>
              <SectionHeader title="Exportar Tabela (CSV)" icon="grid-outline" color={Colors.gold} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {['alunos', 'funcionarios', 'utilizadores', 'notas', 'presencas', 'pagamentos', 'turmas', 'pautas', 'folhas_salarios', 'rupes'].map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setExportTabela(t)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: exportTabela === t ? Colors.gold : Colors.border, backgroundColor: exportTabela === t ? Colors.gold + '22' : 'transparent' }}
                  >
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: exportTabela === t ? Colors.gold : Colors.textMuted, textTransform: 'capitalize' }}>{t.replace(/_/g, ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.exportBtn, exportLoading && { opacity: 0.6 }]}
                onPress={handleExportCSV}
                disabled={exportLoading}
              >
                <Ionicons name="download-outline" size={17} color={Colors.gold} />
                <Text style={styles.exportText}>{exportLoading ? 'A exportar...' : `Exportar "${exportTabela.replace(/_/g, ' ')}" (CSV)`}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Backup SQL Automático ── */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#6366F120', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="server" size={24} color="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text }}>Backup SQL Automático</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                    Diário às 00:05 (Angola) · Formato .sql · Últimos 7 guardados
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { loadSqlBackups(); }}
                  style={{ padding: 8, borderRadius: 10, backgroundColor: '#6366F115' }}
                >
                  {sqlBackupsLoading ? <AppLoader color="#6366F1" size="small" /> : <Ionicons name="refresh" size={18} color="#6366F1" />}
                </TouchableOpacity>
              </View>

              {/* Lista de ficheiros */}
              {sqlBackups.length === 0 && !sqlBackupsLoading && (
                <TouchableOpacity
                  onPress={loadSqlBackups}
                  style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}
                >
                  <Ionicons name="folder-open-outline" size={32} color={Colors.textMuted} />
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted }}>Toque para carregar a lista de backups</Text>
                </TouchableOpacity>
              )}

              {sqlBackups.length > 0 && (
                <View style={{ gap: 8, marginBottom: 14 }}>
                  {sqlBackups.map((f, idx) => {
                    const dataPt = new Date(f.data).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const tamanhoMb = (f.tamanho / 1_048_576).toFixed(2);
                    const isMaisRecente = idx === 0;
                    return (
                      <View key={f.nome} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: isMaisRecente ? '#6366F110' : Colors.surface, borderWidth: 1, borderColor: isMaisRecente ? '#6366F133' : Colors.border }}>
                        <Ionicons name="document" size={20} color={isMaisRecente ? '#6366F1' : Colors.textMuted} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text }} numberOfLines={1}>{f.nome}</Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>{dataPt} · {tamanhoMb} MB</Text>
                        </View>
                        {isMaisRecente && (
                          <View style={{ backgroundColor: '#6366F122', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#6366F1' }}>ACTUAL</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Botão backup manual */}
              <TouchableOpacity
                style={{ backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: sqlBackupRunning ? 0.65 : 1, marginBottom: 10 }}
                onPress={handleSqlBackupManual}
                disabled={sqlBackupRunning}
                activeOpacity={0.8}
              >
                {sqlBackupRunning ? <AppLoader color="#fff" size="small" /> : <Ionicons name="cloud-upload" size={20} color="#fff" />}
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                  {sqlBackupRunning ? 'A criar backup SQL...' : 'Criar Backup SQL Agora'}
                </Text>
              </TouchableOpacity>

              {/* Log toggle */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}
                onPress={() => {
                  const next = !sqlLogVisible;
                  setSqlLogVisible(next);
                  if (next && sqlBackupLog.length === 0) loadSqlLog();
                }}
              >
                <Ionicons name={sqlLogVisible ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted }}>
                  {sqlLogVisible ? 'Ocultar histórico de logs' : 'Ver histórico de logs'}
                </Text>
              </TouchableOpacity>

              {sqlLogVisible && (
                <View style={{ marginTop: 10, backgroundColor: '#0d1117', borderRadius: 10, padding: 12, maxHeight: 220 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#7ee787' }}>backup.log (últimas 50 linhas)</Text>
                    <TouchableOpacity onPress={loadSqlLog} disabled={sqlLogLoading}>
                      {sqlLogLoading ? <AppLoader color="#7ee787" size="small" /> : <Ionicons name="refresh" size={14} color="#7ee787" />}
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 170 }} showsVerticalScrollIndicator>
                    {sqlBackupLog.length === 0
                      ? <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8b949e' }}>Sem entradas no log.</Text>
                      : sqlBackupLog.map((linha, i) => {
                        const cor = linha.includes('✅') ? '#7ee787' : linha.includes('❌') ? '#f85149' : linha.includes('⏳') ? '#e3b341' : linha.includes('📅') ? '#79c0ff' : '#8b949e';
                        return (
                          <Text key={i} style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: cor, lineHeight: 18 }}>{linha}</Text>
                        );
                      })
                    }
                  </ScrollView>
                </View>
              )}
            </View>

            {/* ── Informações de segurança ── */}
            <View style={styles.card}>
              <SectionHeader title="Informações de Segurança" icon="shield-checkmark" color={Colors.danger} />
              {[
                { label: 'Último Backup', value: ultimoBackup ?? 'Nenhum backup realizado', valueColor: ultimoBackup ? Colors.success : undefined },
                { label: 'Tipo', value: 'Manual (download directo para dispositivo)' },
                { label: 'Versão do Sistema', value: 'Super Escola v1.03' },
                { label: 'Base de Dados', value: 'Operacional', valueColor: Colors.success },
                { label: 'Formato', value: 'JSON estruturado com metadados e resumo' },
              ].map(row => (
                <View key={row.label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={[styles.infoValue, row.valueColor ? { color: row.valueColor } : {}]}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* ── Sobre o Sistema ── */}
            <View style={[styles.card, { borderColor: `${Colors.gold}33` }]}>
              <SectionHeader title="Sobre o Sistema" icon="information-circle" color={Colors.gold} />
              <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.5 }}>Super Escola / SIGA</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Sistema Integrado de Gestão Académica</Text>
              </View>
              <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 8 }} />
              {[
                { label: 'Desenvolvido por', value: 'Eng. Osvaldo Fernando Muondo Queta' },
                { label: 'Cargo', value: 'CEO — Queta Tech, Lda.' },
                { label: 'Formação', value: 'Eng. Informática · UJES' },
                { label: 'Versão', value: 'Super Escola v1.03' },
                { label: 'História do projecto', value: '3 anos · planificação → maquete → desenvolvimento' },
              ].map(row => (
                <View key={row.label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              ))}
              <View style={{ marginTop: 14, backgroundColor: `${Colors.gold}12`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.gold}25` }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold, textAlign: 'center', fontStyle: 'italic', lineHeight: 20 }}>
                  "Tecnologia que conecta ideias ao futuro."
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 6 }}>
                  Queta Tech, Lda. · ERP · Apps Móveis · Web Apps · E-Commerce · APIs · Cloud
                </Text>
              </View>
            </View>

            {/* ── Versão do APK (CEO apenas) ── */}
            {user?.role === 'ceo' && (
              <View style={[styles.card, { borderColor: 'rgba(52,199,89,0.25)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(52,199,89,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="phone-portrait" size={20} color="#34C759" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text }}>Versão do APK</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                      Define a versão actual do APK para Android
                    </Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,69,58,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FF453A', letterSpacing: 0.5 }}>CEO</Text>
                  </View>
                </View>

                {/* Versão */}
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 6 }}>
                  NÚMERO DE VERSÃO
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
                  <Ionicons name="git-branch" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text, outlineStyle: 'none' } as any}
                    placeholder="ex.: 2.1.1"
                    placeholderTextColor={Colors.textMuted}
                    value={apkVersion}
                    onChangeText={setApkVersion}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                  {apkVersion.length > 0 && /^\d+\.\d+(\.\d+)?$/.test(apkVersion) && (
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  )}
                </View>

                {/* URL externo (opcional) */}
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 6 }}>
                  URL DE DOWNLOAD EXTERNO <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, letterSpacing: 0 }}>(opcional)</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                  <Ionicons name="link" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text, outlineStyle: 'none' } as any}
                    placeholder="https://github.com/.../SuperEscola.apk"
                    placeholderTextColor={Colors.textMuted}
                    value={apkExternalUrl}
                    onChangeText={setApkExternalUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    returnKeyType="done"
                    onSubmitEditing={salvarApkVersion}
                  />
                  {apkExternalUrl.length > 0 && (
                    <TouchableOpacity onPress={() => setApkExternalUrl('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginBottom: 14, lineHeight: 16 }}>
                  Se vazio, o sistema usa o ficheiro local em{' '}
                  <Text style={{ fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>public/downloads/superescola.apk</Text>
                </Text>

                <TouchableOpacity
                  style={{ backgroundColor: '#34C759', borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: apkSaving ? 0.65 : 1 }}
                  onPress={salvarApkVersion}
                  disabled={apkSaving}
                  activeOpacity={0.8}
                >
                  {apkSaving
                    ? <AppLoader color="#fff" size="small" />
                    : <Ionicons name="save" size={17} color="#fff" />
                  }
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                    {apkSaving ? 'A guardar...' : 'Guardar Versão'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        )}

        {/* DIAGNÓSTICO DA BASE DE DADOS */}
        {activeSection === 'diagnosticos' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Diagnóstico do Sistema" icon="pulse" color="#A78BFA" />
              <TouchableOpacity
                onPress={async () => {
                  setDiagLoading(true);
                  try { setDiagData(await api.get('/api/admin/db-diagnostics')); }
                  catch (e: any) { alertErro('Erro', e?.message ?? 'Não foi possível obter diagnóstico.'); }
                  finally { setDiagLoading(false); }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#A78BFA22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Ionicons name="refresh" size={15} color="#A78BFA" />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#A78BFA' }}>
                  {diagLoading ? 'A verificar...' : diagData ? 'Actualizar' : 'Verificar Agora'}
                </Text>
              </TouchableOpacity>
            </View>

            {!diagData && !diagLoading && (
              <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                Clica em "Verificar Agora" para analisar o estado da base de dados de produção.
              </Text>
            )}

            {diagLoading && (
              <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                A analisar a base de dados...
              </Text>
            )}

            {diagData && !diagLoading && (() => {
              const d = diagData;
              const ok = Colors.success;
              const err = Colors.danger;
              const warn = Colors.warning;
              const modeLabel: Record<string, string> = { neon: 'Neon (primário)', local: 'Local (failover)', neon_only: 'Neon (único)', local_only: 'Local (único)' };
              return (
                <View style={{ gap: 14 }}>
                  {/* Estado geral */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: d.healthy ? ok + '15' : err + '15', borderWidth: 1, borderColor: d.healthy ? ok + '40' : err + '40' }}>
                    <Ionicons name={d.healthy ? 'checkmark-circle' : 'warning'} size={22} color={d.healthy ? ok : err} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: d.healthy ? ok : err }}>
                        {d.healthy ? 'Sistema saudável' : 'Problemas detectados'}
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted }}>
                        Verificado em {new Date(d.checkedAt).toLocaleString('pt-AO')}
                      </Text>
                    </View>
                  </View>

                  {/* Ligação à BD */}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8 }}>LIGAÇÃO À BASE DE DADOS</Text>
                  {[
                    { label: 'Modo activo', value: modeLabel[d.dbMode] ?? d.dbMode, color: d.dbMode.startsWith('neon') ? ok : warn },
                    { label: 'Neon disponível', value: d.neonAvailable ? 'Sim' : 'Não', color: d.neonAvailable ? ok : err },
                    { label: 'Base local disponível', value: d.localAvailable ? 'Sim' : 'Não', color: d.localAvailable ? ok : warn },
                    { label: 'Versão PostgreSQL', value: d.pgVersion },
                    { label: 'Último backup', value: d.lastBackup ? new Date(d.lastBackup).toLocaleString('pt-AO') : 'Nunca' },
                  ].map(row => (
                    <View key={row.label} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={[styles.infoValue, row.color ? { color: row.color } : {}]}>{row.value}</Text>
                    </View>
                  ))}

                  {/* Tabelas */}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8, marginTop: 4 }}>TABELAS ({d.tables.total} encontradas)</Text>
                  {d.tables.missing.length === 0 ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Todas as tabelas esperadas</Text>
                      <Text style={[styles.infoValue, { color: ok }]}>✓ {d.tables.expected} OK</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: err + '10', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: err + '30' }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: err, marginBottom: 4 }}>
                        {d.tables.missing.length} tabela(s) em falta:
                      </Text>
                      {d.tables.missing.map((t: any) => (
                        <Text key={t.name} style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted }}>• {t.name}</Text>
                      ))}
                    </View>
                  )}

                  {/* Colunas config_geral */}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8 }}>COLUNAS config_geral</Text>
                  {d.columns.missing.length === 0 ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Todas as colunas esperadas</Text>
                      <Text style={[styles.infoValue, { color: ok }]}>✓ {d.columns.expected} OK</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: warn + '10', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: warn + '30' }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: warn, marginBottom: 4 }}>
                        {d.columns.missing.length} coluna(s) em falta (serão criadas no próximo PUT /api/config):
                      </Text>
                      {d.columns.missing.map((c: any) => (
                        <Text key={c.name} style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted }}>• {c.name}</Text>
                      ))}
                    </View>
                  )}

                  {/* Registos */}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8, marginTop: 4 }}>REGISTOS POR TABELA</Text>
                  {Object.entries(d.counts).map(([t, n]) => (
                    <View key={t} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t}</Text>
                      <Text style={[styles.infoValue, { color: (n as number) > 0 ? ok : Colors.textMuted }]}>{String(n)}</Text>
                    </View>
                  ))}

                  {/* IA */}
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, letterSpacing: 0.8, marginTop: 4 }}>ASSISTENTE IA</Text>
                  {[
                    { label: 'Groq (env var)', value: d.ai.envGroq ? 'Configurado' : 'Não definido', color: d.ai.envGroq ? ok : Colors.textMuted },
                    { label: 'Groq (base de dados)', value: d.ai.dbGroq ? 'Configurado' : 'Não definido', color: d.ai.dbGroq ? ok : Colors.textMuted },
                    { label: 'OpenAI (env var)', value: d.ai.envOpenai ? 'Configurado' : 'Não definido', color: d.ai.envOpenai ? ok : Colors.textMuted },
                    { label: 'OpenAI (base de dados)', value: d.ai.dbOpenai ? 'Configurado' : 'Não definido', color: d.ai.dbOpenai ? ok : Colors.textMuted },
                  ].map(row => (
                    <View key={row.label} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={[styles.infoValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                  ))}

                  {/* ── Corrigir agora ── */}
                  {(!d.healthy || d.tables.missing.length > 0 || d.columns.missing.length > 0) && !fixDone && (
                    <View style={{ marginTop: 8, padding: 14, backgroundColor: err + '0D', borderRadius: 10, borderWidth: 1, borderColor: err + '30', gap: 10 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: err }}>
                        Foram detectados problemas na base de dados.
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted }}>
                        O botão abaixo executa todas as migrações em falta directamente nesta base de dados (incluindo produção), sem necessidade de acesso ao servidor.
                      </Text>
                      <TouchableOpacity
                        disabled={fixLoading}
                        onPress={async () => {
                          setFixLoading(true);
                          setFixLogs([]);
                          try {
                            const res = await api.post('/api/admin/run-migrations', {}) as any;
                            setFixLogs(res.logs ?? []);
                            setFixDone(true);
                            alertSucesso('Migrações aplicadas', 'A base de dados foi corrigida com sucesso. Clica em "Actualizar" para confirmar.');
                            setDiagData(await api.get('/api/admin/db-diagnostics'));
                          } catch (e: any) {
                            alertErro('Erro', e?.message ?? 'Não foi possível executar as migrações.');
                          } finally {
                            setFixLoading(false);
                          }
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: fixLoading ? Colors.surface : err, opacity: fixLoading ? 0.7 : 1 }}
                      >
                        <Ionicons name={fixLoading ? 'sync' : 'build'} size={16} color="#fff" />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                          {fixLoading ? 'A corrigir...' : 'Corrigir agora'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {fixDone && !fixLoading && (
                    <View style={{ marginTop: 8, padding: 14, backgroundColor: ok + '12', borderRadius: 10, borderWidth: 1, borderColor: ok + '40', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="checkmark-circle" size={18} color={ok} />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: ok }}>Migrações aplicadas com sucesso</Text>
                      </View>
                      {fixLogs.slice(-8).map((l, i) => (
                        <Text key={i} style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>
                          {l.replace(/\[migrate\]\s*/,'').replace(/\[migration\]\s*/,'')}
                        </Text>
                      ))}
                      <TouchableOpacity onPress={() => { setFixDone(false); setFixLogs([]); }} style={{ marginTop: 4 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted }}>Fechar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {/* REABERTURA DE CAMPOS DE NOTAS */}
        {activeSection === 'reabertura' && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Pedidos de Reabertura de Notas" icon="lock-open" color={Colors.warning} />
              <TouchableOpacity onPress={fetchReabertura} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {reaLoading ? (
              <View style={styles.adminEmptyState}>
                <AppLoader color={Colors.warning} />
                <Text style={styles.adminEmptyMsg}>A carregar pedidos…</Text>
              </View>
            ) : reaPendentes.length === 0 ? (
              <View style={styles.adminEmptyState}>
                <View style={[styles.adminEmptyIcon, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '30' }]}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={Colors.success} />
                </View>
                <Text style={styles.adminEmptyTitle}>Sem pedidos pendentes</Text>
                <Text style={styles.adminEmptyMsg}>Todos os pedidos foram tratados.</Text>
              </View>
            ) : (
              reaPendentes.map((p: any) => {
                const nota: any = p._nota;
                const alunoNome = `${nota.alunoNome || ''} ${nota.alunoApelido || ''}`.trim() || nota.alunoId;
                const isRes = reaResponding === p.id;
                const campoLabel = p.campo.startsWith('aval') ? `AVAL ${p.campo.replace('aval', '')}` : p.campo === 'pp1' ? 'PP' : p.campo === 'ppt' ? 'PT' : p.campo;
                const dt = p.criadoEm ? new Date(p.criadoEm).toLocaleDateString('pt-PT') : '';
                return (
                  <View key={p.id} style={styles.pedidoCard}>
                    {/* Faixa laranja de urgência */}
                    <View style={[styles.pedidoCardBar, { backgroundColor: Colors.warning }]} />
                    <View style={{ flex: 1, gap: 8, padding: 14 }}>
                      {/* Cabeçalho */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <View style={[styles.pedidoIconWrap, { backgroundColor: Colors.warning + '20' }]}>
                          <Ionicons name="lock-closed" size={14} color={Colors.warning} />
                        </View>
                        <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text, fontSize: 14, flex: 1 }}>{alunoNome}</Text>
                        <View style={{ backgroundColor: Colors.warning + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: Colors.warning + '40' }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning, fontSize: 11 }}>{campoLabel}</Text>
                        </View>
                      </View>
                      {/* Meta */}
                      <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12, lineHeight: 17 }}>
                        {nota.disciplina} · T{nota.trimestre} · {nota.turmaNome || nota.turmaId}
                        {p.professorNome ? ` · Prof. ${p.professorNome}` : ''}
                        {dt ? ` · ${dt}` : ''}
                      </Text>
                      {/* Motivo */}
                      <View style={styles.pedidoMotivoBox}>
                        <Text style={styles.pedidoMotivoLabel}>MOTIVO</Text>
                        <Text style={styles.pedidoMotivoText}>{p.motivo}</Text>
                      </View>
                      {/* Acções */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.pedidoApproveBtn, isRes && { opacity: 0.5 }]}
                          onPress={() => setReaObsModal({ notaId: p._notaId, pedidoId: p.id, decisao: 'aprovada', label: `${alunoNome} — ${campoLabel}` })}
                          disabled={isRes}
                        >
                          <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                          <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.success, fontSize: 13 }}>Aprovar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pedidoRejectBtn, isRes && { opacity: 0.5 }]}
                          onPress={() => setReaObsModal({ notaId: p._notaId, pedidoId: p.id, decisao: 'rejeitada', label: `${alunoNome} — ${campoLabel}` })}
                          disabled={isRes}
                        >
                          <Ionicons name="close-circle" size={15} color={Colors.danger} />
                          <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.danger, fontSize: 13 }}>Rejeitar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* SOLICITAÇÕES DE LANÇAMENTO DE AVALIAÇÃO */}
        {activeSection === 'solicit_avaliacao' && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Pedidos de Lançamento de Avaliação" icon="key" color={Colors.info} />
              <TouchableOpacity onPress={fetchSolicAvaliacao} style={{ padding: 6 }}>
                <Ionicons name="refresh" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              Professores solicitam abertura de campos de avaliação específicos (A1, A2, PP, etc.).
              Aprove ou rejeite cada pedido para controlar quando as notas podem ser lançadas.
            </Text>

            {solicAvalLoading ? (
              <Text style={{ textAlign: 'center', color: Colors.textMuted, paddingVertical: 24, fontFamily: 'Inter_400Regular' }}>A carregar pedidos...</Text>
            ) : solicAvalList.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Ionicons name="checkmark-circle-outline" size={40} color={Colors.success} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.text, fontSize: 15, marginTop: 10 }}>Sem pedidos</Text>
                <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 13, marginTop: 4 }}>Nenhuma solicitação de avaliação registada.</Text>
              </View>
            ) : (
              <>
                {/* Pending first */}
                {solicAvalPendentes.length > 0 && (
                  <>
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Pendentes ({solicAvalPendentes.length})
                    </Text>
                    {solicAvalPendentes.map(s => {
                      const isRes = solicAvalResponding === s.id;
                      const tipo = s.avaliacao?.startsWith('aval') ? `Avaliação ${s.avaliacao.replace('aval', '')}` : s.avaliacao === 'pp1' ? 'Prova do Professor' : s.avaliacao === 'ppt' ? 'Prova Trimestral' : s.avaliacao;
                      const dt = s.criadoEm ? new Date(s.criadoEm).toLocaleDateString('pt-PT') : '';
                      return (
                        <View key={s.id} style={{ backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.warning + '44', gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Ionicons name="key-outline" size={14} color={Colors.info} />
                            <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text, fontSize: 14, flex: 1 }}>{s.professorNome ?? s.professorId}</Text>
                            <View style={{ backgroundColor: Colors.info + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                              <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.info, fontSize: 11 }}>{tipo}</Text>
                            </View>
                          </View>
                          <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12 }}>
                            {s.disciplina} · T{s.trimestre}{s.turmaNome ? ` · ${s.turmaNome}` : ''} · {dt}
                          </Text>
                          {!!s.motivo && (
                            <View style={{ backgroundColor: Colors.background, borderRadius: 8, padding: 10 }}>
                              <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, fontSize: 10, marginBottom: 4 }}>MOTIVO</Text>
                              <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.text, fontSize: 13 }}>{s.motivo}</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                            <TouchableOpacity
                              style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.success + '20', borderWidth: 1, borderColor: Colors.success + '60' }, isRes && { opacity: 0.5 }]}
                              onPress={() => setSolicAvalModal({ id: s.id, decisao: 'aprovada', label: `${s.professorNome ?? s.professorId} — ${tipo}` })}
                              disabled={isRes}
                            >
                              <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                              <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.success, fontSize: 13 }}>Aprovar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.danger + '15', borderWidth: 1, borderColor: Colors.danger + '55' }, isRes && { opacity: 0.5 }]}
                              onPress={() => setSolicAvalModal({ id: s.id, decisao: 'rejeitada', label: `${s.professorNome ?? s.professorId} — ${tipo}` })}
                              disabled={isRes}
                            >
                              <Ionicons name="close-circle" size={15} color={Colors.danger} />
                              <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.danger, fontSize: 13 }}>Rejeitar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
                {/* Resolved */}
                {solicAvalList.filter(s => s.status !== 'pendente').length > 0 && (
                  <>
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 }}>
                      Tratados ({solicAvalList.filter(s => s.status !== 'pendente').length})
                    </Text>
                    {solicAvalList.filter(s => s.status !== 'pendente').map(s => {
                      const tipo = s.avaliacao?.startsWith('aval') ? `Avaliação ${s.avaliacao.replace('aval', '')}` : s.avaliacao === 'pp1' ? 'PP' : s.avaliacao === 'ppt' ? 'PT' : s.avaliacao;
                      const statusColor = s.status === 'aprovada' ? Colors.success : Colors.danger;
                      return (
                        <View key={s.id} style={{ backgroundColor: Colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: statusColor + '33', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Ionicons name={s.status === 'aprovada' ? 'checkmark-circle' : 'close-circle'} size={18} color={statusColor} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.text, fontSize: 13 }}>
                              {s.professorNome ?? s.professorId} · {tipo}
                            </Text>
                            <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                              {s.disciplina} · T{s.trimestre}{s.turmaNome ? ` · ${s.turmaNome}` : ''}
                            </Text>
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: statusColor + '22', borderRadius: 8 }}>
                            <Text style={{ fontFamily: 'Inter_700Bold', color: statusColor, fontSize: 11 }}>
                              {s.status === 'aprovada' ? 'Aprovado' : 'Rejeitado'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ENQUADRAMENTO DE ALUNOS */}
        {activeSection === 'enquadramento' && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.cardHeaderRow}>
              <SectionHeader title="Alunos Aguardando Enquadramento" icon="people-circle" color="#F97316" />
              <TouchableOpacity onPress={fetchEnquadramento} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Callout informativo */}
            <View style={styles.enqCallout}>
              <View style={styles.enqCalloutIcon}>
                <Ionicons name="information-circle" size={18} color="#F97316" />
              </View>
              <Text style={styles.enqCalloutText}>
                Estes alunos preencheram os dados pessoais e aguardam enquadramento académico (turma e curso).
              </Text>
            </View>

            {enqLoading ? (
              <View style={styles.adminEmptyState}>
                <AppLoader color="#F97316" />
                <Text style={styles.adminEmptyMsg}>A carregar lista…</Text>
              </View>
            ) : enqList.length === 0 ? (
              <View style={styles.adminEmptyState}>
                <View style={[styles.adminEmptyIcon, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '30' }]}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={Colors.success} />
                </View>
                <Text style={styles.adminEmptyTitle}>Sem pendentes</Text>
                <Text style={styles.adminEmptyMsg}>Todos os alunos estão enquadrados.</Text>
              </View>
            ) : (
              enqList.map((a: any) => {
                const nome = `${a.nome ?? ''} ${a.apelido ?? ''}`.trim();
                const dt = a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-PT') : '';
                const iniciais = nome ? nome.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase() : '?';
                return (
                  <View key={a.id} style={styles.enqCard}>
                    {/* Topo: avatar + info + badge */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={styles.enqAvatar}>
                        <Text style={styles.enqAvatarText}>{iniciais}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.enqNome}>{nome || 'Aluno sem nome'}</Text>
                        <Text style={styles.enqMeta} numberOfLines={1}>{a.emailLogin ?? '—'}{dt ? ` · ${dt}` : ''}</Text>
                      </View>
                      <View style={styles.enqPendenteBadge}>
                        <Text style={styles.enqPendenteText}>PENDENTE</Text>
                      </View>
                    </View>

                    {/* Chips de dados pessoais */}
                    {(!!a.genero || !!a.dataNascimento || !!a.provincia || !!a.nomeEncarregado) && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                        {!!a.genero && (
                          <View style={styles.enqChip}>
                            <Ionicons name={a.genero === 'M' ? 'male' : 'female'} size={11} color={Colors.textMuted} />
                            <Text style={styles.enqChipText}>{a.genero === 'M' ? 'Masculino' : 'Feminino'}</Text>
                          </View>
                        )}
                        {!!a.dataNascimento && (
                          <View style={styles.enqChip}>
                            <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.enqChipText}>{a.dataNascimento}</Text>
                          </View>
                        )}
                        {!!a.provincia && (
                          <View style={styles.enqChip}>
                            <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.enqChipText}>{a.provincia}{a.municipio ? `, ${a.municipio}` : ''}</Text>
                          </View>
                        )}
                        {!!a.nomeEncarregado && (
                          <View style={styles.enqChip}>
                            <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                            <Text style={styles.enqChipText}>{a.nomeEncarregado}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Botão de acção */}
                    <TouchableOpacity
                      style={styles.enqBtn}
                      onPress={() => { setEnqModal(a); setEnqTurmaId(''); setEnqCursoId(''); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="school" size={16} color="#fff" />
                      <Text style={styles.enqBtnText}>Enquadrar Academicamente</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* PRAZOS DE LANÇAMENTO DE MINI-PAUTAS (TRIMESTRAIS) */}
        {activeSection === 'prazos-pauta' && (
          <PrazosPautaSection />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>}

      {/* Modal Enquadramento Académico */}
      <Modal visible={!!enqModal} transparent animationType="fade" onRequestClose={() => setEnqModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="school" size={20} color="#F97316" style={{ marginRight: 8 }} />
              <Text style={[styles.modalTitle, { flex: 1 }]}>Enquadramento Académico</Text>
              <TouchableOpacity onPress={() => setEnqModal(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {enqModal && (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text, fontSize: 15, marginBottom: 2 }}>
                  {`${enqModal.nome ?? ''} ${enqModal.apelido ?? ''}`.trim()}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12, marginBottom: 14 }}>
                  Nº {enqModal.numeroMatricula} · {enqModal.emailLogin ?? '—'}
                </Text>

                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted, marginBottom: 5 }}>
                  Turma <Text style={{ color: Colors.danger }}>*</Text>
                </Text>
                <ScrollView style={{ maxHeight: 160, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginBottom: 12 }} nestedScrollEnabled>
                  {enqTurmas.length === 0 ? (
                    <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, padding: 12, fontSize: 13 }}>Nenhuma turma disponível</Text>
                  ) : enqTurmas.map((t: any) => (
                    <TouchableOpacity
                      key={t.id}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '60', backgroundColor: enqTurmaId === t.id ? '#F97316' + '15' : 'transparent' }}
                      onPress={() => {
                        setEnqTurmaId(t.id);
                        if (t.cursoId && !enqCursoId) setEnqCursoId(t.cursoId);
                      }}
                    >
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: enqTurmaId === t.id ? '#F97316' : Colors.text }}>
                        {t.nome} {t.classe ? `· ${t.classe}ª` : ''} {t.turno ? `· ${t.turno}` : ''}
                      </Text>
                      {enqTurmaId === t.id && <Ionicons name="checkmark-circle" size={16} color="#F97316" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {enqCursos.length > 0 && (
                  <>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted, marginBottom: 5 }}>Curso (opcional)</Text>
                    <ScrollView style={{ maxHeight: 130, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginBottom: 12 }} nestedScrollEnabled>
                      {enqCursos.map((c: any) => (
                        <TouchableOpacity
                          key={c.id}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border + '60', backgroundColor: enqCursoId === c.id ? Colors.info + '15' : 'transparent' }}
                          onPress={() => setEnqCursoId(enqCursoId === c.id ? '' : c.id)}
                        >
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: enqCursoId === c.id ? Colors.info : Colors.text }}>{c.nome}</Text>
                          {enqCursoId === c.id && <Ionicons name="checkmark-circle" size={16} color={Colors.info} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <View style={{ backgroundColor: Colors.warning + '15', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.warning }}>
                    Após o enquadramento, o aluno ficará com situação <Text style={{ fontFamily: 'Inter_700Bold' }}>Activo</Text> e terá acesso à turma seleccionada.
                  </Text>
                </View>
              </ScrollView>
            )}
            <View style={[styles.modalFooter, { marginTop: 12 }]}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setEnqModal(null)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnOk, { backgroundColor: '#F97316', flex: 2, opacity: enqSaving ? 0.7 : 1 }]}
                onPress={handleEnquadrar}
                disabled={enqSaving}
              >
                {enqSaving
                  ? <Text style={styles.modalBtnOkText}>A guardar...</Text>
                  : <><Ionicons name="checkmark-circle" size={15} color="#fff" /><Text style={styles.modalBtnOkText}>Confirmar Enquadramento</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Responder Solicitação de Avaliação */}
      <Modal visible={!!solicAvalModal} transparent animationType="fade" onRequestClose={() => setSolicAvalModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <Ionicons name={solicAvalModal?.decisao === 'aprovada' ? 'checkmark-circle' : 'close-circle'} size={20} color={solicAvalModal?.decisao === 'aprovada' ? Colors.success : Colors.danger} style={{ marginRight: 8 }} />
              <Text style={[styles.modalTitle, { flex: 1 }]}>
                {solicAvalModal?.decisao === 'aprovada' ? 'Aprovar Lançamento' : 'Rejeitar Lançamento'}
              </Text>
              <TouchableOpacity onPress={() => setSolicAvalModal(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>{solicAvalModal?.label}</Text>
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Observação (opcional)</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="Adicione um comentário ao professor..."
              placeholderTextColor={Colors.textMuted}
              value={solicAvalObs}
              onChangeText={setSolicAvalObs}
              multiline
            />
            {solicAvalResponding ? (
              <AppLoader color={Colors.gold} style={{ marginTop: 16 }} />
            ) : (
              <TouchableOpacity
                style={[styles.solicitBtn, { backgroundColor: solicAvalModal?.decisao === 'aprovada' ? Colors.success : Colors.danger }]}
                onPress={() => solicAvalModal && responderSolicAvaliacao(solicAvalModal.id, solicAvalModal.decisao, solicAvalObs)}
              >
                <Ionicons name={solicAvalModal?.decisao === 'aprovada' ? 'checkmark' : 'close'} size={18} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {solicAvalModal?.decisao === 'aprovada' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Observação Reabertura */}
      <Modal visible={!!reaObsModal} transparent animationType="fade" onRequestClose={() => setReaObsModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxWidth: 400, width: '90%' }]}>
            <View style={styles.modalHeader}>
              <Ionicons name={reaObsModal?.decisao === 'aprovada' ? 'checkmark-circle' : 'close-circle'} size={20} color={reaObsModal?.decisao === 'aprovada' ? Colors.success : Colors.danger} />
              <Text style={[styles.modalTitle, { flex: 1 }]}>{reaObsModal?.decisao === 'aprovada' ? 'Aprovar Reabertura' : 'Rejeitar Reabertura'}</Text>
              <TouchableOpacity onPress={() => setReaObsModal(null)}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.text, fontSize: 13, marginBottom: 6 }}>{reaObsModal?.label}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontSize: 12, marginBottom: 12 }}>Observação opcional (para comunicar ao professor):</Text>
            <TextInput
              style={styles.input}
              placeholder="Observação..."
              placeholderTextColor={Colors.textMuted}
              value={reaObs}
              onChangeText={setReaObs}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setReaObsModal(null)}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 2, backgroundColor: reaObsModal?.decisao === 'aprovada' ? Colors.success : Colors.danger }]}
                onPress={() => reaObsModal && responderReabertura(reaObsModal.notaId, reaObsModal.pedidoId, reaObsModal.decisao, reaObs)}
                disabled={reaResponding !== null}
              >
                <Text style={styles.saveBtnText}>{reaResponding ? 'A processar...' : reaObsModal?.decisao === 'aprovada' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Editar Escola */}
      <Modal visible={editEscola} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Escola</Text>
              <TouchableOpacity onPress={() => setEditEscola(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Identificação */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 2 }]}>Identificação</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Nome da Escola<RequiredMark /></Text>
                <TextInput style={styles.input} value={tempEscola.nome} onChangeText={v => setTempEscola(e => ({ ...e, nome: v }))} placeholder="Ex: Escola Secundária..." placeholderTextColor={Colors.textMuted} returnKeyType="next" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Código MED</Text>
                <TextInput style={styles.input} value={tempEscola.codigoMED} onChangeText={v => setTempEscola(e => ({ ...e, codigoMED: v }))} placeholder="Ex: 12345678" placeholderTextColor={Colors.textMuted} returnKeyType="next" keyboardType="numeric" />
              </View>

              {/* Localização */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 14 }]}>Localização</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Morada</Text>
                <TextInput style={styles.input} value={tempEscola.morada} onChangeText={v => setTempEscola(e => ({ ...e, morada: v }))} placeholder="Rua, bairro ou endereço completo" placeholderTextColor={Colors.textMuted} returnKeyType="next" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Município</Text>
                <TextInput style={styles.input} value={tempEscola.municipio} onChangeText={v => setTempEscola(e => ({ ...e, municipio: v }))} placeholder="Ex: Luanda, Viana, Cacuaco..." placeholderTextColor={Colors.textMuted} returnKeyType="next" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Província</Text>
                <TextInput style={styles.input} value={tempEscola.provincia} onChangeText={v => setTempEscola(e => ({ ...e, provincia: v }))} placeholder="Ex: Luanda, Huambo, Bié..." placeholderTextColor={Colors.textMuted} returnKeyType="next" />
              </View>

              {/* Contactos */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 14 }]}>Contactos</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Telefone da Escola</Text>
                <TextInput style={styles.input} value={tempEscola.telefone} onChangeText={v => setTempEscola(e => ({ ...e, telefone: v }))} placeholder="Ex: +244 9XX XXX XXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" returnKeyType="next" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Email Institucional</Text>
                <TextInput style={styles.input} value={tempEscola.email} onChangeText={v => setTempEscola(e => ({ ...e, email: v }))} placeholder="Ex: geral@escola.ao" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
              </View>

              {/* Direcção — usada nos documentos oficiais */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 14 }]}>Direcção (para documentos oficiais)</Text>
              <View style={[styles.inputGroup, { borderWidth: 1, borderColor: Colors.gold + '30', borderRadius: 10, padding: 10, backgroundColor: Colors.gold + '08' }]}>
                <Text style={[styles.fieldLabel, { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 }]}>
                  Estes nomes aparecem automaticamente nas assinaturas de documentos como mini-pautas, certificados e declarações.
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Director(a) Geral</Text>
                  <TextInput style={styles.input} value={tempEscola.directorGeral} onChangeText={v => setTempEscola(e => ({ ...e, directorGeral: v }))} placeholder="Nome completo do(a) Director(a) Geral" placeholderTextColor={Colors.textMuted} returnKeyType="next" />
                </View>
                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={styles.fieldLabel}>Director(a) Pedagógico(a)</Text>
                  <TextInput style={styles.input} value={tempEscola.subdirectorPedagogico} onChangeText={v => setTempEscola(e => ({ ...e, subdirectorPedagogico: v }))} placeholder="Nome completo do(a) Director(a) Pedagógico(a)" placeholderTextColor={Colors.textMuted} returnKeyType="next" />
                </View>
              </View>

              {/* Cabeçalho Oficial nos Documentos */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 14 }]}>Cabeçalho nos Documentos Oficiais</Text>
              <View style={[styles.inputGroup, { borderWidth: 1, borderColor: Colors.info + '40', borderRadius: 10, padding: 10, backgroundColor: Colors.info + '08' }]}>
                <Text style={[styles.fieldLabel, { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 }]}>
                  Estas 4 linhas aparecem no topo de Mini-Pautas e documentos oficiais. Se deixar em branco, o sistema usa os valores padrão (REPÚBLICA DE ANGOLA / ADMINISTRAÇÃO DO MUNICÍPIO... / DIRECÇÃO MUNICIPAL DA EDUCAÇÃO / nome da escola).
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Linha 1 (ex.: REPÚBLICA DE ANGOLA)</Text>
                  <TextInput style={styles.input} value={tempEscola.cabecalhoLinha1} onChangeText={v => setTempEscola(e => ({ ...e, cabecalhoLinha1: v }))} placeholder="REPÚBLICA DE ANGOLA" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" returnKeyType="next" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Linha 2 (ex.: ADMINISTRAÇÃO DO MUNICÍPIO DE CACUSO)</Text>
                  <TextInput style={styles.input} value={tempEscola.cabecalhoLinha2} onChangeText={v => setTempEscola(e => ({ ...e, cabecalhoLinha2: v }))} placeholder="ADMINISTRAÇÃO DO MUNICÍPIO DE ..." placeholderTextColor={Colors.textMuted} autoCapitalize="characters" returnKeyType="next" />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Linha 3 (ex.: DIRECÇÃO MUNICIPAL DA EDUCAÇÃO)</Text>
                  <TextInput style={styles.input} value={tempEscola.cabecalhoLinha3} onChangeText={v => setTempEscola(e => ({ ...e, cabecalhoLinha3: v }))} placeholder="DIRECÇÃO MUNICIPAL DA EDUCAÇÃO" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" returnKeyType="next" />
                </View>
                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={styles.fieldLabel}>Linha 4 (deixar em branco = usa nome da escola)</Text>
                  <TextInput style={styles.input} value={tempEscola.cabecalhoLinha4} onChangeText={v => setTempEscola(e => ({ ...e, cabecalhoLinha4: v }))} placeholder="Nome oficial da escola (opcional)" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" returnKeyType="next" />
                </View>
              </View>

              {/* Outros */}
              <Text style={[styles.fieldLabel, { color: Colors.gold, marginBottom: 6, marginTop: 14 }]}>Outros</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Máx. Alunos por Turma</Text>
                <TextInput style={styles.input} value={tempEscola.maxAlunosTurma} onChangeText={v => setTempEscola(e => ({ ...e, maxAlunosTurma: v }))} placeholder="Ex: 35" placeholderTextColor={Colors.textMuted} keyboardType="numeric" returnKeyType="next" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Horário de Funcionamento</Text>
                <TextInput style={styles.input} value={tempEscola.horarioFuncionamento} onChangeText={v => setTempEscola(e => ({ ...e, horarioFuncionamento: v }))} placeholder="Ex: 07h00 – 18h30" placeholderTextColor={Colors.textMuted} returnKeyType="done" onSubmitEditing={salvarEscola} />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={salvarEscola}>
                <Text style={styles.saveBtnText}>Guardar Alterações</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Criar / Editar Curso */}
      <Modal visible={showCursoForm} transparent animationType="slide" onRequestClose={() => setShowCursoForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCurso ? 'Editar Curso' : 'Novo Curso'}</Text>
              <TouchableOpacity onPress={() => setShowCursoForm(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <View style={{ gap: 14 }}>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Nome do Curso<RequiredMark /></Text>
                  <TextInput
                    style={styles.input}
                    value={cursoForm.nome}
                    onChangeText={v => setCursoForm(f => ({ ...f, nome: v }))}
                    placeholder="Ex: Ciências e Tecnologia"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={salvarCurso}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Código</Text>
                  <TextInput
                    style={styles.input}
                    value={cursoForm.codigo}
                    onChangeText={v => setCursoForm(f => ({ ...f, codigo: v }))}
                    placeholder="Ex: CT, CEJS, HUM, ART..."
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={salvarCurso}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={styles.fieldLabel}>Área de Formação<RequiredMark /></Text>
                    <TouchableOpacity
                      onPress={() => setShowAreasModal(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(167,139,250,0.12)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' }}
                    >
                      <Ionicons name="layers-outline" size={12} color="#A78BFA" />
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#A78BFA' }}>Gerir áreas</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ gap: 8 }}>
                    {areasFormacao.map(a => (
                      <TouchableOpacity
                        key={a}
                        onPress={() => setCursoForm(f => ({ ...f, areaFormacao: a }))}
                        style={[
                          { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 10 },
                          cursoForm.areaFormacao === a && { backgroundColor: 'rgba(167,139,250,0.15)', borderColor: '#A78BFA' },
                        ]}
                      >
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: cursoForm.areaFormacao === a ? '#A78BFA' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                          {cursoForm.areaFormacao === a && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#A78BFA' }} />}
                        </View>
                        <Text style={[
                          { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
                          cursoForm.areaFormacao === a && { color: '#A78BFA', fontFamily: 'Inter_600SemiBold' },
                        ]}>{a}</Text>
                      </TouchableOpacity>
                    ))}
                    {(() => {
                      const isCustom = !!cursoForm.areaFormacao && !areasFormacao.includes(cursoForm.areaFormacao);
                      return (
                        <>
                          <TouchableOpacity
                            onPress={() => { if (!isCustom) setCursoForm(f => ({ ...f, areaFormacao: '' })); }}
                            style={[
                              { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 10 },
                              (isCustom || cursoForm.areaFormacao === '') && { backgroundColor: 'rgba(167,139,250,0.15)', borderColor: '#A78BFA' },
                            ]}
                          >
                            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: (isCustom || cursoForm.areaFormacao === '') ? '#A78BFA' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                              {(isCustom || cursoForm.areaFormacao === '') && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#A78BFA' }} />}
                            </View>
                            <Text style={[
                              { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
                              (isCustom || cursoForm.areaFormacao === '') && { color: '#A78BFA', fontFamily: 'Inter_600SemiBold' },
                            ]}>Outra área de formação...</Text>
                          </TouchableOpacity>
                          {(isCustom || cursoForm.areaFormacao === '') && (
                            <TextInput
                              style={[styles.input, { marginTop: 2 }]}
                              value={cursoForm.areaFormacao}
                              onChangeText={v => setCursoForm(f => ({ ...f, areaFormacao: v }))}
                              placeholder="Ex: Ciências da Saúde, Turismo, Agropecuária..."
                              placeholderTextColor={Colors.textMuted}
                              autoFocus
                            />
                          )}
                        </>
                      );
                    })()}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Carga Horária (horas)</Text>
                    <TextInput
                      style={styles.input}
                      value={cursoForm.cargaHoraria}
                      onChangeText={v => setCursoForm(f => ({ ...f, cargaHoraria: v.replace(/[^0-9]/g, '') }))}
                      placeholder="Ex: 2400"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={salvarCurso}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Duração</Text>
                    <TextInput
                      style={styles.input}
                      value={cursoForm.duracao}
                      onChangeText={v => setCursoForm(f => ({ ...f, duracao: v }))}
                      placeholder="Ex: 3 anos"
                      placeholderTextColor={Colors.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={salvarCurso}
                    />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Portaria / Decreto</Text>
                  <TextInput
                    style={styles.input}
                    value={cursoForm.portaria}
                    onChangeText={v => setCursoForm(f => ({ ...f, portaria: v }))}
                    placeholder="Ex: Portaria nº 123/2024"
                    placeholderTextColor={Colors.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={salvarCurso}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Descrição</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 60, textAlignVertical: 'top', paddingTop: 12 }]}
                    value={cursoForm.descricao}
                    onChangeText={v => setCursoForm(f => ({ ...f, descricao: v }))}
                    placeholder="Breve descrição do curso..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.fieldLabel}>Ementa</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                    value={cursoForm.ementa}
                    onChangeText={v => setCursoForm(f => ({ ...f, ementa: v }))}
                    placeholder="Conteúdo programático / ementa do curso..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                </View>
              </View>
            </ScrollView>
            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCursoForm(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, savingCurso && { opacity: 0.6 }]}
                onPress={salvarCurso}
                disabled={savingCurso}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>{savingCurso ? 'A guardar...' : 'Guardar Curso'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Gerir Áreas de Formação — declarado DEPOIS do modal Novo Curso para ficar por cima */}
      <Modal visible={showAreasModal} transparent animationType="slide" onRequestClose={() => setShowAreasModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="layers-outline" size={18} color="#A78BFA" />
                <Text style={styles.modalTitle}>Áreas de Formação</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAreasModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                Defina as áreas de formação disponíveis ao criar cursos. Áreas em uso por cursos existentes não podem ser removidas.
              </Text>
            </View>

            {/* Lista de áreas existentes */}
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
                {areasItems.length === 0 && (
                  <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                    Nenhuma área registada.
                  </Text>
                )}
                {areasItems.map(a => {
                  const emUso = cursosList.some(c => c.areaFormacao === a.valor);
                  return (
                    <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}>
                      <Ionicons name="layers-outline" size={15} color="#A78BFA" style={{ opacity: 0.7 }} />
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text }}>{a.label}</Text>
                      {emUso && (
                        <View style={{ backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#A78BFA' }}>em uso</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => removerArea(a.id, a.valor)}
                        disabled={deletingAreaId === a.id}
                        style={{ padding: 6, opacity: deletingAreaId === a.id ? 0.4 : 1 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={emUso ? Colors.textMuted : Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Adicionar nova área */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', gap: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Nova Área</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={novaAreaNome}
                  onChangeText={setNovaAreaNome}
                  placeholder="Ex: Ciências da Saúde, Turismo..."
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={adicionarArea}
                />
                <TouchableOpacity
                  onPress={adicionarArea}
                  disabled={savingArea || !novaAreaNome.trim()}
                  style={{ backgroundColor: '#A78BFA', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, opacity: (savingArea || !novaAreaNome.trim()) ? 0.5 : 1 }}
                >
                  {savingArea
                    ? <Ionicons name="sync-outline" size={16} color="#fff" />
                    : <Ionicons name="add" size={16} color="#fff" />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Gerir Matriz Curricular de Curso */}
      <Modal visible={!!gDiscCurso} transparent animationType="slide" onRequestClose={() => setGDiscCurso(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Matriz Curricular — {gDiscCurso?.nome}</Text>
              <TouchableOpacity onPress={() => setGDiscCurso(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 8, lineHeight: 18 }}>
              Configure a matriz curricular deste curso. Disciplinas removidas são preservadas no histórico.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', padding: 9, marginBottom: 12 }}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.gold} />
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 16 }}>
                Seleccione as disciplinas, defina a carga horária e se são obrigatórias. Marque <Text style={{ color: '#ef4444', fontFamily: 'Inter_600SemiBold' }}>Nuclear EN</Text> nas disciplinas sujeitas a Exame Nacional neste curso.
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              {gDiscCatalogo.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <Ionicons name="book-outline" size={40} color={Colors.textMuted} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
                    Nenhuma disciplina no catálogo. Adicione disciplinas primeiro.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {gDiscCatalogo.map(d => {
                    const sel = gDiscSelected.includes(d.id);
                    const meta = gDiscMeta[d.id] || { cargaHoraria: 0, obrigatoria: true, nuclear: false };
                    return (
                      <View key={d.id} style={{ borderRadius: 10, borderWidth: 1, borderColor: sel ? (meta.nuclear ? 'rgba(239,68,68,0.4)' : Colors.success + '55') : Colors.border, backgroundColor: sel ? (meta.nuclear ? 'rgba(239,68,68,0.06)' : Colors.success + '08') : Colors.surface, overflow: 'hidden' }}>
                        <TouchableOpacity
                          onPress={() => toggleGDisc(d.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: sel ? Colors.success : Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? Colors.success + '22' : 'transparent' }}>
                            {sel && <Ionicons name="checkmark" size={14} color={Colors.success} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: sel ? Colors.text : Colors.textSecondary }}>{d.nome}</Text>
                              {sel && meta.nuclear && (
                                <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: '#ef4444', letterSpacing: 0.5 }}>EN</Text>
                                </View>
                              )}
                            </View>
                            {!!d.codigo && <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{d.codigo} · {d.area}</Text>}
                          </View>
                        </TouchableOpacity>
                        {sel && (
                          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <View style={{ width: 90 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 4 }}>Carga (h)</Text>
                              <TextInput
                                style={[styles.input, { height: 34, fontSize: 12, paddingHorizontal: 10 }]}
                                value={meta.cargaHoraria > 0 ? String(meta.cargaHoraria) : ''}
                                onChangeText={v => setDiscCarga(d.id, v.replace(/[^0-9]/g, ''))}
                                placeholder="0"
                                placeholderTextColor={Colors.textMuted}
                                keyboardType="numeric"
                              />
                            </View>
                            <TouchableOpacity
                              onPress={() => toggleDiscObrig(d.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: meta.obrigatoria ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: meta.obrigatoria ? '#A78BFA55' : Colors.border }}
                            >
                              <Ionicons name={meta.obrigatoria ? 'lock-closed-outline' : 'lock-open-outline'} size={13} color={meta.obrigatoria ? '#A78BFA' : Colors.textMuted} />
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: meta.obrigatoria ? '#A78BFA' : Colors.textMuted }}>{meta.obrigatoria ? 'Obrigatória' : 'Opcional'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => toggleDiscNuclear(d.id)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: meta.nuclear ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: meta.nuclear ? 'rgba(239,68,68,0.4)' : Colors.border }}
                            >
                              <Ionicons name={meta.nuclear ? 'nuclear-outline' : 'ellipse-outline'} size={13} color={meta.nuclear ? '#ef4444' : Colors.textMuted} />
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: meta.nuclear ? '#ef4444' : Colors.textMuted }}>{meta.nuclear ? 'Nuclear EN' : 'Não Nuclear'}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGDiscCurso(null)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, gDiscSaving && { opacity: 0.6 }]}
                onPress={guardarDiscCurso}
                disabled={gDiscSaving}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>{gDiscSaving ? 'A guardar...' : `Guardar (${gDiscSelected.length} disc.)`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Relatório de Cursos */}
      <Modal visible={showRelatorio} transparent animationType="slide" onRequestClose={() => setShowRelatorio(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Relatório de Cursos</Text>
              <TouchableOpacity onPress={() => setShowRelatorio(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              {loadingRelatorio ? (
                <Text style={{ textAlign: 'center', color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 24 }}>A carregar...</Text>
              ) : relatorioData.length === 0 ? (
                <Text style={{ textAlign: 'center', color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 24 }}>Nenhum curso activo.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {/* Totais */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(167,139,250,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', padding: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#A78BFA' }}>{relatorioData.length}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Cursos activos</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', padding: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.gold }}>{relatorioData.reduce((s, c) => s + (c.cargaHoraria || 0), 0)}h</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Carga total</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: 'rgba(34,211,238,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)', padding: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: '#22D3EE' }}>{relatorioData.reduce((s, c) => s + parseInt(c.numDisciplinas || '0'), 0)}</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Disciplinas</Text>
                    </View>
                  </View>
                  {relatorioData.map((c: any) => (
                    <View key={c.id} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                            {!!c.codigo && <View style={{ backgroundColor: 'rgba(167,139,250,0.18)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#A78BFA' }}>{c.codigo}</Text></View>}
                            {!!c.areaFormacao && <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{c.areaFormacao}</Text></View>}
                          </View>
                          <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{c.nome}</Text>
                          {!!c.portaria && <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Portaria: {c.portaria}</Text>}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={13} color={Colors.gold} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>{c.cargaHoraria || 0}h carga horária</Text>
                        </View>
                        {!!c.duracao && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="calendar-outline" size={13} color='#22D3EE' />
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#22D3EE' }}>{c.duracao}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="book-outline" size={13} color={Colors.success} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>{c.numDisciplinas || 0} disciplinas na matriz</Text>
                        </View>
                        {parseInt(c.cargaHorariaMatriz || '0') > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="layers-outline" size={13} color={Colors.textMuted} />
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{c.cargaHorariaMatriz}h na matriz</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRelatorio(false)}>
                <Text style={styles.cancelBtnText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Confirmar Eliminação de Ano */}
      <Modal visible={confirmDeleteAno.visible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: 'center', paddingVertical: 28 }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="trash-outline" size={32} color={Colors.danger} />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>Eliminar Ano Académico</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 4 }}>
              Tem a certeza que pretende eliminar o ano{' '}
              <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{'"'}{confirmDeleteAno.ano?.ano}{'"'}</Text>?
            </Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              Esta acção é irreversível. O ano só pode ser eliminado se não tiver turmas vinculadas.
            </Text>

            {!!confirmDeleteAno.erro && (
              <View style={{ backgroundColor: Colors.danger + '15', borderRadius: 10, padding: 12, marginBottom: 16, width: '100%', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger, lineHeight: 18 }}>{confirmDeleteAno.erro}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => setConfirmDeleteAno({ visible: false, ano: null, loading: false, erro: null })}
                disabled={confirmDeleteAno.loading}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, backgroundColor: confirmDeleteAno.loading ? Colors.danger + '88' : Colors.danger }]}
                onPress={handleDeleteAnoConfirm}
                disabled={confirmDeleteAno.loading}
              >
                {confirmDeleteAno.loading
                  ? <Text style={styles.saveBtnText}>A eliminar...</Text>
                  : <><Ionicons name="trash-outline" size={14} color="#fff" /><Text style={styles.saveBtnText}>Eliminar</Text></>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Ano Duplicado */}
      <Modal visible={modalAnoDuplicado.visible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: 'center', paddingVertical: 28 }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.warning + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="warning-outline" size={34} color={Colors.warning} />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', marginBottom: 8 }]}>Ano Académico Duplicado</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
              Já existe um ano académico{' '}
              <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning }}>{'"'}{modalAnoDuplicado.anoExistente}{'"'}</Text>
              {' '}registado no sistema.
            </Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              Não é permitido criar dois anos académicos iguais em simultâneo. O histórico académico dos estudantes depende de um único ano activo de cada vez. Por favor elimine o duplicado antes de continuar.
            </Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: Colors.warning, width: '100%' }]}
              onPress={() => setModalAnoDuplicado({ visible: false, anoExistente: '' })}
            >
              <Text style={styles.saveBtnText}>Percebido</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Novo Ano */}
      <Modal visible={showNovoAno} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Ano Académico</Text>
              <TouchableOpacity onPress={() => setShowNovoAno(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Ano lectivo</Text>
            <TextInput
              style={styles.input}
              value={formAno.ano}
              onChangeText={v => {
                const ano = v.trim();
                setFormAno(f => {
                  const next = { ...f, ano };
                  // Auto-preencher datas com base no mês de início configurado
                  if (/^\d{4}\/\d{4}$/.test(ano) || /^\d{4}$/.test(ano)) {
                    const mesIni = Number(config.mesInicioAnoLetivo) || MES_INICIO_PADRAO;
                    const r = rangeAnoPadrao(ano.includes('/') ? ano : `${ano}/${parseInt(ano,10)+1}`, mesIni);
                    if (!f.dataInicio) next.dataInicio = r.dataInicio;
                    if (!f.dataFim) next.dataFim = r.dataFim;
                    if (!ano.includes('/')) next.ano = `${ano}/${parseInt(ano,10)+1}`;
                  }
                  return next;
                });
              }}
              placeholder="2026/2027"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={criarAno}
            />
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 8 }}>
              Os 3 trimestres são pré-preenchidos automaticamente conforme o mês de início configurado ({config.mesInicioAnoLetivo === 1 ? 'Janeiro' : config.mesInicioAnoLetivo === 9 ? 'Setembro' : `mês ${config.mesInicioAnoLetivo}`}). Pode editá-los depois na lista.
            </Text>
            <DatePickerField
              label="Data de Início do Ano"
              value={formAno.dataInicio}
              onChange={v => setFormAno(f => ({ ...f, dataInicio: v }))}
            />
            <DatePickerField
              label="Data de Fim do Ano"
              value={formAno.dataFim}
              onChange={v => setFormAno(f => ({ ...f, dataFim: v }))}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={criarAno}>
              <Text style={styles.saveBtnText}>Criar Ano Académico</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Novo Utilizador */}
      <Modal visible={showNovoUser} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Utilizador</Text>
              <TouchableOpacity onPress={() => setShowNovoUser(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Nome Completo</Text>
              <TextInput style={styles.input} value={formUser.nome} onChangeText={v => setFormUser(f => ({ ...f, nome: v }))} placeholder="Nome do utilizador" placeholderTextColor={Colors.textMuted} returnKeyType="next" blurOnSubmit={false} />
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput style={styles.input} value={formUser.email} onChangeText={v => setFormUser(f => ({ ...f, email: v }))} placeholder="utilizador@escola.ao" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" blurOnSubmit={false} />
              <Text style={styles.fieldLabel}>Função</Text>
              <View style={styles.rolesRow}>
                {(['pca', 'admin', 'director', 'subdirector_pedagogico', 'chefe_secretaria', 'secretaria', 'professor', 'financeiro', 'rh', 'pedagogico', 'coordenador_curso', 'aluno', 'encarregado', 'membro_conselho_pedagogico', 'membro_conselho_escola'] as UserRole[]).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, formUser.role === r && { backgroundColor: (ROLE_COLOR[r] || Colors.textMuted) + '33', borderColor: ROLE_COLOR[r] || Colors.textMuted }]}
                    onPress={() => setFormUser(f => ({ ...f, role: r }))}
                  >
                    <Text style={[styles.roleBtnText, formUser.role === r && { color: ROLE_COLOR[r] || Colors.textMuted }]}>{getRoleLabel(r, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Data de Nascimento <Text style={{ color: Colors.textMuted, fontSize: 11 }}>(opcional)</Text></Text>
              <DateInput
                value={formUser.dataNascimento}
                onChangeText={v => setFormUser(f => ({ ...f, dataNascimento: v }))}
                placeholder="AAAA-MM-DD"
              />
              <Text style={styles.fieldLabel}>Telemóvel <Text style={{ color: Colors.danger, fontSize: 12 }}>*</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, marginBottom: 10, paddingHorizontal: 12, height: 44 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginRight: 4 }}>+244</Text>
                <View style={{ width: 1, height: 20, backgroundColor: Colors.border, marginRight: 8 }} />
                <TextInput style={{ flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text }} value={formUser.telefone} onChangeText={v => setFormUser(f => ({ ...f, telefone: v }))} placeholder="9XX XXX XXX" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" returnKeyType="next" blurOnSubmit={false} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.gold + '12', borderWidth: 1, borderColor: Colors.gold + '30', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                <Ionicons name="logo-telegram" size={13} color={Colors.gold} />
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 }}>O OTP de login será enviado para este número via Telegram</Text>
              </View>
              <Text style={styles.fieldLabel}>Senha</Text>
              <TextInput style={styles.input} value={formUser.senha} onChangeText={v => setFormUser(f => ({ ...f, senha: v }))} placeholder="Senha de acesso" placeholderTextColor={Colors.textMuted} secureTextEntry returnKeyType="done" onSubmitEditing={criarUser} />
              {formUser.role === 'professor' && (
                <>
                  <View style={{ backgroundColor: Colors.info + '12', borderWidth: 1, borderColor: Colors.info + '30', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 17 }}>
                      O perfil de professor (disciplinas, turmas, etc.) é criado automaticamente e pode ser completado na secção <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.info }}>Professores</Text> após o registo.
                    </Text>
                  </View>
                  <Text style={styles.fieldLabel}>Nº Professor (opcional)</Text>
                  <TextInput style={styles.input} value={formUser.numeroProfessor} onChangeText={v => setFormUser(f => ({ ...f, numeroProfessor: v }))} placeholder="ex: PROF-001 (gerado automaticamente se vazio)" placeholderTextColor={Colors.textMuted} returnKeyType="next" blurOnSubmit={false} />
                  <Text style={styles.fieldLabel}>Habilitações Académicas</Text>
                  <TextInput style={styles.input} value={formUser.habilitacoes} onChangeText={v => setFormUser(f => ({ ...f, habilitacoes: v }))} placeholder="ex: Licenciatura em Matemática" placeholderTextColor={Colors.textMuted} returnKeyType="done" onSubmitEditing={criarUser} />
                </>
              )}
              <TouchableOpacity style={[styles.saveBtn, { marginTop: 8, marginBottom: 4 }]} onPress={criarUser}>
                <Text style={styles.saveBtnText}>Criar Utilizador</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Editar Utilizador */}
      <Modal visible={!!editingUser} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Utilizador</Text>
              <TouchableOpacity onPress={() => setEditingUser(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Nome Completo</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.nome}
                onChangeText={v => setFormEditUser(f => ({ ...f, nome: v }))}
                placeholder="Nome do utilizador"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.email}
                onChangeText={v => setFormEditUser(f => ({ ...f, email: v }))}
                placeholder="utilizador@escola.ao"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Telefone</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.telefone}
                onChangeText={v => setFormEditUser(f => ({ ...f, telefone: v }))}
                placeholder="9XX XXX XXX"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Instituição / Escola</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.escola}
                onChangeText={v => setFormEditUser(f => ({ ...f, escola: v }))}
                placeholder="Nome da escola"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Função</Text>
              <View style={styles.rolesRow}>
                {EDITABLE_USER_ROLES.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, formEditUser.role === r && { backgroundColor: (ROLE_COLOR[r] || Colors.textMuted) + '33', borderColor: ROLE_COLOR[r] || Colors.textMuted }]}
                    onPress={() => setFormEditUser(f => ({ ...f, role: r }))}
                  >
                    <Text style={[styles.roleBtnText, formEditUser.role === r && { color: ROLE_COLOR[r] || Colors.textMuted }]}>{getRoleLabel(r, '')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Género</Text>
              <View style={styles.rolesRow}>
                {[
                  { value: '', label: 'Não definido' },
                  { value: 'M', label: 'Masculino' },
                  { value: 'F', label: 'Feminino' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.roleBtn, formEditUser.genero === opt.value && { backgroundColor: Colors.info + '22', borderColor: Colors.info }]}
                    onPress={() => setFormEditUser(f => ({ ...f, genero: opt.value as '' | 'M' | 'F' }))}
                  >
                    <Text style={[styles.roleBtnText, formEditUser.genero === opt.value && { color: Colors.info }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Data de Nascimento <Text style={{ color: Colors.textMuted, fontSize: 11 }}>(opcional)</Text></Text>
              <DateInput
                value={formEditUser.dataNascimento}
                onChangeText={v => setFormEditUser(f => ({ ...f, dataNascimento: v }))}
                placeholder="AAAA-MM-DD"
              />
              <Text style={styles.fieldLabel}>Departamento</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.departamento}
                onChangeText={v => setFormEditUser(f => ({ ...f, departamento: v }))}
                placeholder="Departamento do utilizador"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Cargo</Text>
              <TextInput
                style={styles.input}
                value={formEditUser.cargo}
                onChangeText={v => setFormEditUser(f => ({ ...f, cargo: v }))}
                placeholder="Cargo/função interna"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <Text style={styles.fieldLabel}>Aluno associado <Text style={{ color: Colors.textMuted, fontSize: 11 }}>(opcional)</Text></Text>
              <TextInput
                style={styles.input}
                value={formEditUser.alunoId}
                onChangeText={v => setFormEditUser(f => ({ ...f, alunoId: v }))}
                placeholder="ID do aluno, quando aplicável"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              {formEditUser.role === 'coordenador_curso' && (
                <>
                  <Text style={styles.fieldLabel}>Curso coordenado <Text style={{ color: Colors.danger, fontSize: 11 }}>*obrigatório</Text></Text>
                  {cursosList.length === 0 ? (
                    <View style={[styles.input, { justifyContent: 'center' }]}><Text style={{ color: Colors.textMuted, fontSize: 13 }}>A carregar cursos...</Text></View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                        {cursosList.map(c => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.roleBtn, formEditUser.cursoId === c.id && { backgroundColor: '#05966920', borderColor: '#059669' }]}
                            onPress={() => setFormEditUser(f => ({ ...f, cursoId: c.id }))}
                          >
                            <Text style={[styles.roleBtnText, formEditUser.cursoId === c.id && { color: '#059669', fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{c.nome}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  {formEditUser.cursoId ? (
                    <Text style={{ fontSize: 12, color: '#059669', marginBottom: 8, fontFamily: 'Inter_500Medium' }}>
                      ✓ {cursosList.find(c => c.id === formEditUser.cursoId)?.nome || formEditUser.cursoId}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: Colors.warning, marginBottom: 8 }}>Nenhum curso seleccionado</Text>
                  )}
                </>
              )}
              <View style={[styles.configToggleRow, { marginBottom: 12 }]}>
                <View style={styles.configToggleLeft}>
                  <View style={[styles.configToggleIcon, { backgroundColor: formEditUser.ativo ? Colors.success + '22' : Colors.danger + '22' }]}>
                    <Ionicons name={formEditUser.ativo ? 'checkmark-circle' : 'close-circle'} size={18} color={formEditUser.ativo ? Colors.success : Colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.configToggleLabel}>Conta activa</Text>
                    <Text style={styles.configToggleDesc}>{formEditUser.ativo ? 'O utilizador pode entrar no sistema' : 'O acesso está bloqueado'}</Text>
                  </View>
                </View>
                <Switch
                  value={formEditUser.ativo}
                  onValueChange={v => setFormEditUser(f => ({ ...f, ativo: v }))}
                  thumbColor={formEditUser.ativo ? Colors.success : Colors.danger}
                  trackColor={{ false: Colors.danger + '55', true: Colors.success + '55' }}
                />
              </View>
              <Text style={styles.fieldLabel}>Nova Senha <Text style={{ color: Colors.textMuted, fontSize: 11 }}>(deixe em branco para não alterar)</Text></Text>
              <TextInput
                style={styles.input}
                value={formEditUser.novaSenha}
                onChangeText={v => setFormEditUser(f => ({ ...f, novaSenha: v }))}
                placeholder="Nova senha (opcional)"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={salvarEdicaoUser}
              />
              <TouchableOpacity
                style={[styles.saveBtn, { marginTop: 8, marginBottom: 4, opacity: savingEditUser ? 0.7 : 1 }]}
                onPress={salvarEdicaoUser}
                disabled={savingEditUser}
              >
                <Text style={styles.saveBtnText}>{savingEditUser ? 'A guardar...' : 'Guardar Alterações'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Rejeitar */}
      <Modal visible={showRejeitar} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { borderRadius: 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rejeitar Solicitação</Text>
              <TouchableOpacity onPress={() => setShowRejeitar(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedSolicitacao && (
              <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 12 }}>
                Rejeitar matrícula de <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{selectedSolicitacao.nomeCompleto}</Text>
              </Text>
            )}
            <Text style={styles.fieldLabel}>Motivo da Rejeição<RequiredMark /></Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
              value={motivoRejeicao}
              onChangeText={setMotivoRejeicao}
              placeholder="Indique o motivo (ex: documentação incompleta, falta de vagas...)"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.danger, marginTop: 16 }]} onPress={confirmarRejeicao}>
              <Text style={styles.saveBtnText}>Confirmar Rejeição</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─── Componente: Prazos de Lançamento de Mini-Pautas ───
function maskDateDMY(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0,2)}-${digits.slice(2)}`;
  return digits;
}
function dmyToISO(dmy: string): string {
  const m = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function isoToDMY(iso: string): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function PrazosPautaSection() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [trimestre, setTrimestre] = useState<number>(1);
  const [anoLetivo, setAnoLetivo] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataLimite, setDataLimite] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [bloqueioAposPrazo, setBloqueioAposPrazo] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const [prazos, anos] = await Promise.all([
        api.get<any[]>(`/api/prazos-mini-pauta`),
        api.get<any[]>(`/api/anos-academicos`).catch(() => [] as any[]),
      ]);
      setList(prazos);
      const activo = (anos || []).find((a: any) => a?.ativo) || (anos || [])[0];
      if (activo?.ano) setAnoLetivo(String(activo.ano));
    }
    catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carregar(); }, []);

  const guardar = async () => {
    const isoLimite = dmyToISO(dataLimite);
    if (!isoLimite) { webAlert('Falta', 'Indique a data de fim no formato DD-MM-AAAA.'); return; }
    if (!anoLetivo) { webAlert('Falta', 'Não foi possível identificar o ano lectivo activo.'); return; }
    const isoInicio = dataInicio ? dmyToISO(dataInicio) : null;
    if (dataInicio && !isoInicio) { webAlert('Data inválida', 'O formato da data de início é inválido (use DD-MM-AAAA).'); return; }
    if (isoInicio && isoLimite && isoInicio > isoLimite) { webAlert('Datas inválidas', 'A data de início não pode ser posterior à data de fim.'); return; }
    setSaving(true);
    try {
      await api.post(`/api/prazos-mini-pauta`, { trimestre, anoLetivo, dataInicio: isoInicio, dataLimite: isoLimite, descricao, bloqueioAposPrazo });
      setDataInicio(''); setDataLimite(''); setDescricao(''); await carregar();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSaving(false); }
  };

  const eliminar = async (id: string) => {
    try { await api.delete(`/api/prazos-mini-pauta/${id}`); await carregar(); }
    catch (e) { webAlert('Erro', (e as Error).message); }
  };

  // Reactivar (ou bloquear) pautas para todos os professores deste prazo
  const toggleBloqueio = async (p: any) => {
    const novoEstado = !p.bloqueioAposPrazo;
    const label = novoEstado ? 'Bloquear pautas' : 'Reactivar pautas';
    const msg = novoEstado
      ? `As pautas do ${p.trimestre}º Trimestre vão desaparecer da lista dos professores. Confirma?`
      : `As pautas do ${p.trimestre}º Trimestre vão voltar a aparecer para todos os professores. Confirma?`;
    if (!window.confirm(`${label}\n\n${msg}`)) return;
    setTogglingId(p.id);
    try {
      const token = await getAuthToken();
      const r = await fetch(`/api/prazos-mini-pauta/${p.id}/toggle-bloqueio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ bloqueioAposPrazo: novoEstado }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); webAlert('Erro', j?.error || 'Não foi possível alterar.'); return; }
      await carregar();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setTogglingId(null); }
  };

  return (
    <View style={[styles.card, { gap: 12 }]}>
      <SectionHeader title="Prazos de Lançamento de Pauta" icon="calendar" color={Colors.warning} />
      <Text style={{ color: Colors.textMuted, fontSize: 12, lineHeight: 18 }}>
        Defina a data limite de cada trimestre. O sistema envia avisos automáticos T-3, T0 e T+1 aos professores e à Subdirecção Pedagógica, e regista incidentes para a Avaliação de Desempenho.
      </Text>

      <View>
        <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 4 }}>
          Trimestre {anoLetivo ? <Text style={{ color: Colors.textMuted }}>· Ano lectivo: <Text style={{ color: Colors.gold, fontWeight: '700' }}>{anoLetivo}</Text></Text> : null}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[1,2,3].map(t => (
            <TouchableOpacity key={t}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: trimestre === t ? Colors.primary : Colors.border, backgroundColor: trimestre === t ? Colors.primary + '22' : Colors.backgroundCard }}
              onPress={() => setTrimestre(t)}
            ><Text style={{ color: trimestre === t ? Colors.primary : Colors.text, fontSize: 12 }}>{t}º</Text></TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 4 }}>Data de Início (DD-MM-AAAA)</Text>
          <TextInput
            style={{ backgroundColor: Colors.backgroundCard, color: Colors.text, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.border }}
            value={dataInicio}
            onChangeText={(v) => setDataInicio(maskDateDMY(v))}
            placeholder="01-04-2026"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 4 }}>Data de Fim/Prazo (DD-MM-AAAA)</Text>
          <TextInput
            style={{ backgroundColor: Colors.backgroundCard, color: Colors.text, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.border }}
            value={dataLimite}
            onChangeText={(v) => setDataLimite(maskDateDMY(v))}
            placeholder="30-04-2026"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>
      </View>

      {/* Ocultar pautas após prazo */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '600' }}>Ocultar pautas após o prazo</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 }}>
            Quando o prazo expira, as pautas desaparecem automaticamente da lista dos professores. A direcção continua a ver tudo.
          </Text>
        </View>
        <Switch
          value={bloqueioAposPrazo}
          onValueChange={setBloqueioAposPrazo}
          trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
          thumbColor={bloqueioAposPrazo ? Colors.primary : Colors.textMuted}
        />
      </View>

      <View style={{ backgroundColor: Colors.info + '11', borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.info} style={{ marginTop: 1 }} />
        <Text style={{ color: Colors.info, fontSize: 11, flex: 1, lineHeight: 16 }}>
          O professor vê o período activo (início → fim) com contagem regressiva em dias e horas. Notificações automáticas são enviadas no início, D-3, D-1 e no dia do prazo.
        </Text>
      </View>
      <View>
        <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 4 }}>Descrição (opcional)</Text>
        <TextInput style={{ backgroundColor: Colors.backgroundCard, color: Colors.text, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.border }} value={descricao} onChangeText={setDescricao} placeholder="Ex.: Lançamento de notas do 1º Trimestre" placeholderTextColor={Colors.textMuted} />
      </View>

      <TouchableOpacity style={{ backgroundColor: Colors.primary, paddingVertical: 11, borderRadius: 8, alignItems: 'center' }} onPress={guardar} disabled={saving}>
        {saving ? <AppLoader color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar Prazo</Text>}
      </TouchableOpacity>

      <Text style={{ color: Colors.gold, fontSize: 12, fontWeight: '700', marginTop: 8 }}>Prazos Configurados</Text>
      {loading ? <AppLoader color={Colors.primary} /> : list.length === 0 ? (
        <Text style={{ color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>Sem prazos configurados.</Text>
      ) : list.map((p: any) => {
        const prazoExpirou = p.dataLimite && new Date() > new Date(p.dataLimite + 'T23:59:59Z');
        const pautasOcultas = prazoExpirou && p.bloqueioAposPrazo;
        const isToggling = togglingId === p.id;
        return (
          <View key={p.id} style={{ padding: 10, backgroundColor: Colors.backgroundCard, borderRadius: 8, borderWidth: 1, borderColor: pautasOcultas ? Colors.danger + '55' : Colors.border, gap: 8 }}>
            {/* Cabeçalho */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar" size={14} color={pautasOcultas ? Colors.danger : Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '600' }}>{p.trimestre}º Trimestre · {p.anoLetivo}</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                  {p.dataInicio ? `Início: ${isoToDMY(p.dataInicio)} · ` : ''}Fim: {isoToDMY(p.dataLimite)}{p.descricao ? ` · ${p.descricao}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => eliminar(p.id)}>
                <Ionicons name="trash" size={16} color={Colors.danger} />
              </TouchableOpacity>
            </View>
            {/* Estado + Acção de reactivação/bloqueio */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pautasOcultas ? Colors.danger : Colors.success }} />
                <Text style={{ fontSize: 11, color: pautasOcultas ? Colors.danger : Colors.success }}>
                  {pautasOcultas
                    ? 'Pautas ocultas para professores'
                    : p.bloqueioAposPrazo
                      ? (prazoExpirou ? 'Prazo expirado' : 'Visíveis · ocultar após o prazo')
                      : 'Visíveis (sem bloqueio automático)'}
                </Text>
              </View>
              {/* Botão Reactivar / Bloquear */}
              <TouchableOpacity
                onPress={() => toggleBloqueio(p)}
                disabled={isToggling}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                  backgroundColor: p.bloqueioAposPrazo ? Colors.success + '22' : Colors.danger + '22',
                  borderWidth: 1,
                  borderColor: p.bloqueioAposPrazo ? Colors.success + '55' : Colors.danger + '55',
                }}
              >
                {isToggling
                  ? <AppLoader color={p.bloqueioAposPrazo ? Colors.success : Colors.danger} />
                  : <>
                      <Ionicons
                        name={p.bloqueioAposPrazo ? 'eye-outline' : 'eye-off-outline'}
                        size={13}
                        color={p.bloqueioAposPrazo ? Colors.success : Colors.danger}
                      />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: p.bloqueioAposPrazo ? Colors.success : Colors.danger }}>
                        {p.bloqueioAposPrazo ? 'Reactivar' : 'Bloquear'}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  heroBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    overflow: 'hidden',
  },
  heroBannerAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: Colors.accent,
  },
  heroIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heroTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  heroSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroStatChip: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    minWidth: 44,
  },
  heroStatChipWarn: {
    borderColor: Colors.warning + '40', backgroundColor: Colors.warning + '0F',
  },
  heroStatNum: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.gold },
  heroStatLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginTop: 1 },
  heroStatDivider: { width: 1, height: 24, backgroundColor: Colors.border },

  groupNav: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  groupTab: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 11, paddingHorizontal: 8,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  groupTabActive: {},
  groupTabLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  groupCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: 'transparent',
  },
  groupCardIcon: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  groupCardLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, flexShrink: 1 },
  groupCardCount: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  groupBadge: {
    position: 'absolute', top: -5, right: -7,
    backgroundColor: Colors.danger, borderRadius: 9, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.backgroundCard,
  },
  groupBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: '#fff' },

  sectionList: { padding: 14, gap: 10, paddingBottom: 48 },
  sectionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 8px rgba(0,0,0,0.2)' as any },
      default: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    }),
  },
  sectionCardBar: { width: 3, alignSelf: 'stretch', flexShrink: 0 },
  sectionCardIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    margin: 12, flexShrink: 0,
  },
  sectionCardBody: { flex: 1, minWidth: 0, paddingVertical: 14, paddingRight: 4 },
  sectionCardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  sectionCardDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  sectionCardBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, flexShrink: 0,
  },
  sectionCardBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  sectionCardArrow: {
    paddingRight: 14, paddingLeft: 8, alignSelf: 'center', flexShrink: 0,
  },
  subNavWrap: {
    backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  subNavBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: 'transparent',
  },
  subNavText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  badge: { backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  scroll: { flex: 1 },
  card: { margin: 16, marginBottom: 0, backgroundColor: Colors.backgroundCard, borderRadius: 18, padding: 16, gap: 14 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12, marginBottom: 4, flexShrink: 1, flexGrow: 1, minWidth: 0 },
  sectionHeaderIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  sectionHeaderLine: { height: 1, width: 30, borderRadius: 1 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.gold + '22' },
  editBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.accent },
  addBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  accessDenied: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  accessDeniedTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  accessDeniedText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', maxWidth: 280 },
  matriculasStats: { flexDirection: 'row', gap: 8 },
  matriculaStat: { flex: 1, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)', paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  matriculaStatNum: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  matriculaStatLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  tabsRow: { flexDirection: 'row', gap: 6, borderRadius: 12, backgroundColor: Colors.surface, padding: 4 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.backgroundElevated },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyStateText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  solicitacaoCard: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  solicitacaoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  solicitacaoAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  solicitacaoAvatarText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  solicitacaoInfo: { flex: 1, gap: 2 },
  solicitacaoNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  solicitacaoMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  solicitacaoDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  solicitacaoDetails: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  detailRow: { flexDirection: 'row', gap: 6 },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, width: 90, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text },
  solicitacaoActions: { flexDirection: 'row', gap: 8 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '11' },
  rejectBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.success },
  approveBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  deleteCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  deleteCardBtnText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  escolaLogo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.surface, borderRadius: 12 },
  logoPlaceholder: { width: 54, height: 54, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  escolaNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1, lineHeight: 20 },
  escolaCodigo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  infoRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  anoItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'column' },
  anoItemActive: { borderWidth: 1, borderColor: Colors.gold + '44', backgroundColor: 'rgba(240,165,0,0.06)' },
  anoItemHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  anoInfo: { flex: 1 },
  anoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  anoNum: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  atualBadge: { backgroundColor: Colors.gold + '33', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  atualText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  anoDates: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 8 },
  trimRow: { flexDirection: 'row', gap: 6 },
  trimBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.border },
  trimBadgeActive: { backgroundColor: Colors.info + '33' },
  trimText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  trimTextActive: { color: Colors.info },
  anoActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  expandAnoBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  ativarBtn: { backgroundColor: Colors.success + '22', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  ativarText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.success },
  deleteBtn: { padding: 6, backgroundColor: Colors.danger + '22', borderRadius: 8 },
  anoExpandedWrap: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border + '66', gap: 6 },
  anoExpandLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  anoExpandEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },
  anoExpandDivider: { height: 1, backgroundColor: Colors.border + '55', marginVertical: 10 },
  trimDetalheRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)' },
  trimDetalheRowAtivo: { backgroundColor: Colors.info + '12', borderWidth: 1, borderColor: Colors.info + '30' },
  trimDetalheNumBadge: { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trimDetalheNumText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  trimDetalheDates: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  trimDetalheActivoBadge: { backgroundColor: Colors.info + '33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  trimDetalheActivoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  trimDetalheExameDates: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning },
  epocaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 4 },
  epocaBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0, alignSelf: 'flex-start' },
  epocaBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  epocaDates: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  epocaObs: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, flexShrink: 1 },
  userEmail: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1, flexShrink: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  roleText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '11', marginTop: 12 },
  exportText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.gold },
  configEscolaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: Colors.surface, borderRadius: 12 },
  configEscolaNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1, lineHeight: 20 },
  configEscolaCodigo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  configSectionDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  configToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  configToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  configToggleIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  configToggleLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  configToggleDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  configToggleSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  submitBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  configWarnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 12, marginTop: 10 },
  configWarnText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, lineHeight: 17 },
  configFieldRow: { flexDirection: 'column', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  configFieldCol: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  configFieldLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  configFieldDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 8 },
  configNumInput: { alignSelf: 'flex-end', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', minWidth: 72 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  roleBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  roleBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: Colors.backgroundCard, borderRadius: 24, padding: 20, maxHeight: '92%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  modalSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 8 },
  solicitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  inputGroup: { marginBottom: 0 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  inputField: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtnCancel: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  modalBtnCancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  modalBtnOk: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 13 },
  modalBtnOkText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  avalStepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  avalStepBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  avalStepBtnDisabled: { opacity: 0.35 },
  avalStepValue: { width: 44, height: 36, borderRadius: 10, backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.gold + '55', alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  avalStepValueText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold },

  /* ── Admin shared empty-state ── */
  adminEmptyState: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  adminEmptyIcon: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  adminEmptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  adminEmptyMsg: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 16 },

  /* ── Refresh button (reabertura/enquadramento) ── */
  refreshBtn: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },

  /* ── Cursos — card com barra lateral ── */
  cursoCard: {
    flexDirection: 'row', overflow: 'hidden',
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.18)',
    marginBottom: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' } : { elevation: 2 }),
  },
  cursoCardBar: { width: 4, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, flexShrink: 0 },
  cursoChip: {
    backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  cursoChipText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  cursoActionBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.info + '12', borderWidth: 1, borderColor: Colors.info + '44',
  },

  /* ── Pedidos (reabertura / solicit_avaliacao) ── */
  pedidoCard: {
    flexDirection: 'row', overflow: 'hidden',
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 10px rgba(0,0,0,0.20)' } : { elevation: 2 }),
  },
  pedidoCardBar: { width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, flexShrink: 0 },
  pedidoIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pedidoMotivoBox: {
    backgroundColor: Colors.background, borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  pedidoMotivoLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  pedidoMotivoText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 19 },
  pedidoApproveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.success + '18',
    borderWidth: 1, borderColor: Colors.success + '55',
  },
  pedidoRejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.danger + '12',
    borderWidth: 1, borderColor: Colors.danger + '50',
  },

  /* ── Enquadramento de Alunos ── */
  enqCallout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(249,115,22,0.10)', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#F97316', padding: 12,
  },
  enqCalloutIcon: { flexShrink: 0, marginTop: 1 },
  enqCalloutText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#F97316', lineHeight: 18 },
  enqCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.22)',
    padding: 14, gap: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 10px rgba(0,0,0,0.20)' } : { elevation: 2 }),
  },
  enqAvatar: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0,
    backgroundColor: 'rgba(249,115,22,0.18)', borderWidth: 2, borderColor: 'rgba(249,115,22,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  enqAvatarText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#F97316' },
  enqNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  enqMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  enqPendenteBadge: {
    backgroundColor: 'rgba(249,115,22,0.18)', borderRadius: 7,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.40)',
    paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0,
  },
  enqPendenteText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#F97316' },
  enqChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  enqChipText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  enqBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F97316', borderRadius: 11, paddingVertical: 11,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(249,115,22,0.40)' } : {}),
  },
  enqBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
});
